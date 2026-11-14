import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { ShopifyRefusedError } from '../src/access-tokens/shopify-refused.error.js';
import { ShopifyTokenClient } from '../src/access-tokens/shopify-token-client.js';
import { ShopifyUnavailableError } from '../src/common/errors/shopify-unavailable.error.js';
import {
  APPLICATION_LOGGER,
  createApplicationLogger,
} from '../src/common/logging/logger.js';
import { DATABASE } from '../src/database/database.tokens.js';
import { ShopifyShopClient } from '../src/installation/shopify-shop-client.js';
import { StoresRepository } from '../src/stores/stores.repository.js';
import { createCapturingDestination } from './capturing-destination.js';
import { createTestApp } from './create-test-app.js';
import {
  CALLBACK_CODE,
  createCallbackQuery,
  expectNotLogged,
  installShop,
  readAuthorizeUrl,
  readStateSetCookie,
  sendCallback,
  startInstallation,
  withoutParameter,
} from './installation-requests.js';
import { readInstallationRows } from './installation-rows.js';
import {
  createNewCredentials,
  createNewStore,
  createShopDetails,
} from './new-rows.js';
import {
  createRepositoryDatabase,
  type RepositoryDatabase,
} from './repository-database.js';
import type { CallbackParameters } from './shopify-hmac.js';

const DATABASE_NAME = 'installation_e2e';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const EARLIER = new Date('2025-12-01T00:00:00.000Z');

const SHOP_ADDRESS_MESSAGE =
  'The shop address must look like example.myshopify.com. Start the install again from your Shopify admin.';
const INCOMPLETE_MESSAGE =
  'This install link is incomplete. Start the install again from your Shopify admin.';
const NOT_SIGNED_MESSAGE =
  'This install link was not signed by Shopify. Start the install again from your Shopify admin.';
const EXPIRED_MESSAGE =
  'This install link has expired or was opened in another browser. Start the install again from your Shopify admin.';
const REFUSED_MESSAGE =
  'Shopify refused this install. Start the install again from your Shopify admin.';
const SCOPES_MESSAGE =
  'The app needs read access to products and orders. Start the install again and approve all requested access.';
const UNAVAILABLE_MESSAGE = 'Shopify did not answer. Try again later.';

describe('installation (e2e)', () => {
  let repositoryDatabase: RepositoryDatabase;
  let repository: StoresRepository;
  let app: INestApplication<App>;
  const exchangeAuthorizationCode =
    vi.fn<ShopifyTokenClient['exchangeAuthorizationCode']>();
  const fetchShopDetails = vi.fn<ShopifyShopClient['fetchShopDetails']>();
  const { entries, destination } = createCapturingDestination();

  beforeAll(async () => {
    repositoryDatabase = await createRepositoryDatabase(DATABASE_NAME);
    repository = new StoresRepository(repositoryDatabase.database);
    app = await createTestApp(
      [],
      [
        { provide: DATABASE, useValue: repositoryDatabase.database },
        {
          provide: ShopifyTokenClient,
          useValue: { exchangeAuthorizationCode },
        },
        { provide: ShopifyShopClient, useValue: { fetchShopDetails } },
        {
          provide: APPLICATION_LOGGER,
          useValue: createApplicationLogger(
            { level: 'info', env: 'test' },
            destination,
          ),
        },
      ],
    );
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    exchangeAuthorizationCode.mockReset();
    fetchShopDetails.mockReset();
    entries.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await repositoryDatabase.close();
  });

  describe('GET /installation/start', () => {
    it("redirects the browser to the shop's authorize page with a new state", async () => {
      const response = await request(app.getHttpServer())
        .get('/installation/start')
        .query({ shop: 'example-store.myshopify.com' })
        .expect(302);

      const authorizeUrl = readAuthorizeUrl(response);
      expect(`${authorizeUrl.origin}${authorizeUrl.pathname}`).toBe(
        'https://example-store.myshopify.com/admin/oauth/authorize',
      );
      expect(Object.fromEntries(authorizeUrl.searchParams)).toEqual({
        client_id: 'test-client-id',
        scope: 'read_products,read_orders',
        redirect_uri: 'https://api.example.test/installation/callback',
        state: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
    });

    it('writes the state into a signed cookie that lives 10 minutes and travels only to the install routes', async () => {
      const response = await request(app.getHttpServer())
        .get('/installation/start')
        .query({ shop: 'example-store.myshopify.com' })
        .expect(302);

      const state = readAuthorizeUrl(response).searchParams.get('state');
      const [nameAndValue, ...attributes] =
        readStateSetCookie(response).split('; ');
      expect(nameAndValue).toMatch(new RegExp(`^oauth_state=s%3A${state}\\.`));
      expect(attributes).toEqual(
        expect.arrayContaining([
          'Max-Age=600',
          'Path=/installation',
          'HttpOnly',
          'Secure',
          'SameSite=Lax',
        ]),
      );
    });

    it.each([
      { name: 'no shop', query: {} },
      {
        name: 'a shop that is not a myshopify.com address',
        query: { shop: 'example.com' },
      },
    ])('answers 400 and writes no cookie for $name', async ({ query }) => {
      const response = await request(app.getHttpServer())
        .get('/installation/start')
        .query(query)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        message: SHOP_ADDRESS_MESSAGE,
      });
      expect(response.get('Set-Cookie')).toBeUndefined();
    });
  });

  describe('GET /installation/callback', () => {
    it('saves the store and its keys and shows the success page', async () => {
      const shop = createShopDetails();
      const credentials = createNewCredentials();
      exchangeAuthorizationCode.mockResolvedValue(credentials);
      fetchShopDetails.mockResolvedValue(shop);

      const response = await installShop(app, shop.shopDomain);

      expect(response.status).toBe(200);
      expect(response.get('Content-Type')).toMatch(/^text\/plain/);
      expect(response.text).toBe(
        `Commerce Intelligence is installed on ${shop.shopDomain}. You can close this page.`,
      );
      expect(
        await readInstallationRows(repositoryDatabase.database, shop.shopifyId),
      ).toMatchObject({
        store: { ...shop, installedAt: NOW, uninstalledAt: null },
        credentials,
      });
    });

    it('trades the code with the shop, then asks the shop for its details with the new access token', async () => {
      const shop = createShopDetails();
      const credentials = createNewCredentials();
      exchangeAuthorizationCode.mockResolvedValue(credentials);
      fetchShopDetails.mockResolvedValue(shop);

      await installShop(app, shop.shopDomain);

      expect(exchangeAuthorizationCode).toHaveBeenCalledExactlyOnceWith(
        shop.shopDomain,
        CALLBACK_CODE,
      );
      expect(fetchShopDetails).toHaveBeenCalledExactlyOnceWith(
        shop.shopDomain,
        credentials.accessToken,
      );
    });

    it('updates the same store, clears uninstalled_at and replaces the keys on a reinstall', async () => {
      const shop = createShopDetails();
      const { storeId } = await repository.installStore({
        store: { ...createNewStore(), ...shop, installedAt: EARLIER },
        credentials: createNewCredentials(),
      });
      await repository.uninstallStore(storeId, EARLIER);
      const credentials = createNewCredentials();
      exchangeAuthorizationCode.mockResolvedValue(credentials);
      fetchShopDetails.mockResolvedValue({ ...shop, name: 'Renamed Shop' });

      await installShop(app, shop.shopDomain);

      expect(
        await readInstallationRows(repositoryDatabase.database, shop.shopifyId),
      ).toMatchObject({
        store: {
          id: storeId,
          name: 'Renamed Shop',
          installedAt: NOW,
          uninstalledAt: null,
        },
        credentials,
      });
      expect(entries).toContainEqual(
        expect.objectContaining({
          msg: 'store installed',
          storeId,
          reinstalled: true,
        }),
      );
    });

    it.each([
      {
        name: 'no shop',
        status: 400,
        message: SHOP_ADDRESS_MESSAGE,
        change: (query: CallbackParameters) => withoutParameter(query, 'shop'),
      },
      {
        name: 'a shop that is not a myshopify.com address',
        status: 400,
        message: SHOP_ADDRESS_MESSAGE,
        change: (query: CallbackParameters) => ({
          ...query,
          shop: 'example.com',
        }),
      },
      {
        name: 'no code',
        status: 400,
        message: INCOMPLETE_MESSAGE,
        change: (query: CallbackParameters) => withoutParameter(query, 'code'),
      },
      {
        name: 'no hmac',
        status: 400,
        message: INCOMPLETE_MESSAGE,
        change: (query: CallbackParameters) => withoutParameter(query, 'hmac'),
      },
      {
        name: 'no state',
        status: 400,
        message: INCOMPLETE_MESSAGE,
        change: (query: CallbackParameters) => withoutParameter(query, 'state'),
      },
      {
        name: 'no timestamp',
        status: 400,
        message: INCOMPLETE_MESSAGE,
        change: (query: CallbackParameters) =>
          withoutParameter(query, 'timestamp'),
      },
      {
        name: 'a code Shopify did not sign',
        status: 403,
        message: NOT_SIGNED_MESSAGE,
        change: (query: CallbackParameters) => ({
          ...query,
          code: 'another-code',
        }),
      },
      {
        name: "a signed state that is not the cookie's",
        status: 403,
        message: EXPIRED_MESSAGE,
        change: (query: CallbackParameters) =>
          createCallbackQuery(query.shop, 'another-state'),
      },
    ])(
      'answers $status and trades nothing for $name',
      async ({ status, message, change }) => {
        const { shopDomain } = createShopDetails();
        const { state, stateCookie } = await startInstallation(app, shopDomain);
        const query = change(createCallbackQuery(shopDomain, state));

        const response = await sendCallback(app, query, stateCookie);

        expect(response.status).toBe(status);
        expect(response.body).toMatchObject({ statusCode: status, message });
        expect(exchangeAuthorizationCode).not.toHaveBeenCalled();
      },
    );

    it('answers 403 and trades nothing when the browser sends no state cookie', async () => {
      const { shopDomain } = createShopDetails();
      const { state } = await startInstallation(app, shopDomain);

      const response = await sendCallback(
        app,
        createCallbackQuery(shopDomain, state),
      );

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        statusCode: 403,
        message: EXPIRED_MESSAGE,
      });
      expect(exchangeAuthorizationCode).not.toHaveBeenCalled();
    });

    it.each([
      {
        name: 'Shopify refuses the code',
        status: 403,
        message: REFUSED_MESSAGE,
        failure: new ShopifyRefusedError(),
      },
      {
        name: 'Shopify does not answer the code trade',
        status: 503,
        message: UNAVAILABLE_MESSAGE,
        failure: new ShopifyUnavailableError(),
      },
    ])(
      'answers $status and saves nothing when $name',
      async ({ status, message, failure }) => {
        const shop = createShopDetails();
        exchangeAuthorizationCode.mockRejectedValue(failure);

        const response = await installShop(app, shop.shopDomain);

        expect(response.status).toBe(status);
        expect(response.body).toMatchObject({ statusCode: status, message });
        expect(
          await readInstallationRows(
            repositoryDatabase.database,
            shop.shopifyId,
          ),
        ).toBeUndefined();
      },
    );

    it('answers 403 and saves nothing when Shopify grants fewer scopes than requested', async () => {
      const shop = createShopDetails();
      exchangeAuthorizationCode.mockResolvedValue({
        ...createNewCredentials(),
        scopes: 'read_products',
      });
      fetchShopDetails.mockResolvedValue(shop);

      const response = await installShop(app, shop.shopDomain);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        statusCode: 403,
        message: SCOPES_MESSAGE,
      });
      expect(fetchShopDetails).not.toHaveBeenCalled();
      expect(
        await readInstallationRows(repositoryDatabase.database, shop.shopifyId),
      ).toBeUndefined();
    });

    it('answers 503 and saves nothing when Shopify does not answer the shop query', async () => {
      const shop = createShopDetails();
      exchangeAuthorizationCode.mockResolvedValue(createNewCredentials());
      fetchShopDetails.mockRejectedValue(new ShopifyUnavailableError());

      const response = await installShop(app, shop.shopDomain);

      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        statusCode: 503,
        message: UNAVAILABLE_MESSAGE,
      });
      expect(
        await readInstallationRows(repositoryDatabase.database, shop.shopifyId),
      ).toBeUndefined();
    });

    it('deletes the state cookie after an install', async () => {
      const shop = createShopDetails();
      exchangeAuthorizationCode.mockResolvedValue(createNewCredentials());
      fetchShopDetails.mockResolvedValue(shop);

      const response = await installShop(app, shop.shopDomain);

      expect(readStateSetCookie(response)).toMatch(
        /^oauth_state=; Path=\/installation; Expires=Thu, 01 Jan 1970 00:00:00 GMT/,
      );
    });

    it('deletes the state cookie after a refused callback', async () => {
      const { shopDomain } = createShopDetails();
      const { state, stateCookie } = await startInstallation(app, shopDomain);
      const query = { ...createCallbackQuery(shopDomain, state), code: 'x' };

      const response = await sendCallback(app, query, stateCookie);

      expect(response.status).toBe(403);
      expect(readStateSetCookie(response)).toMatch(
        /^oauth_state=; Path=\/installation; Expires=Thu, 01 Jan 1970 00:00:00 GMT/,
      );
    });

    it('logs one info line with the store id, the shop and that the store is new', async () => {
      const shop = createShopDetails();
      exchangeAuthorizationCode.mockResolvedValue(createNewCredentials());
      fetchShopDetails.mockResolvedValue(shop);

      await installShop(app, shop.shopDomain);

      const rows = await readInstallationRows(
        repositoryDatabase.database,
        shop.shopifyId,
      );
      expect(
        entries.filter((entry) => entry.msg === 'store installed'),
      ).toEqual([
        expect.objectContaining({
          level: 'info',
          storeId: rows?.store.id,
          shopDomain: shop.shopDomain,
          reinstalled: false,
        }),
      ]);
    });

    it('keeps the code, the hmac and the state out of the logs of an install', async () => {
      const shop = createShopDetails();
      exchangeAuthorizationCode.mockResolvedValue(createNewCredentials());
      fetchShopDetails.mockResolvedValue(shop);
      const { state, stateCookie } = await startInstallation(
        app,
        shop.shopDomain,
      );
      const query = createCallbackQuery(shop.shopDomain, state);

      await sendCallback(app, query, stateCookie).expect(200);

      expectNotLogged(entries, [query.code, query.hmac, query.state]);
    });

    it('keeps the code, the hmac and the state out of the logs of a refused callback', async () => {
      const { shopDomain } = createShopDetails();
      const { state, stateCookie } = await startInstallation(app, shopDomain);
      const query: CallbackParameters = {
        ...createCallbackQuery(shopDomain, state),
        code: 'another-code',
      };

      await sendCallback(app, query, stateCookie).expect(403);

      expectNotLogged(entries, [query.code, query.hmac, query.state]);
    });
  });
});
