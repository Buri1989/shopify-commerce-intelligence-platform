import { AccessTokensService } from '../src/access-tokens/access-tokens.service.js';
import { ShopifyRefusedError } from '../src/access-tokens/shopify-refused.error.js';
import type { ShopifyTokenClient } from '../src/access-tokens/shopify-token-client.js';
import { ShopifyUnavailableError } from '../src/common/errors/shopify-unavailable.error.js';
import { StoreMustAuthorizeError } from '../src/common/errors/store-must-authorize.error.js';
import { StoresRepository } from '../src/stores/stores.repository.js';
import { createTestApp } from './create-test-app.js';
import { readCredentialsRow } from './credentials-rows.js';
import {
  createInstallationExpiringAt,
  createNewCredentials,
  createNewStore,
} from './new-rows.js';
import {
  createRepositoryDatabase,
  type RepositoryDatabase,
} from './repository-database.js';

const DATABASE_NAME = 'access_tokens_e2e';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const FIVE_MINUTES_FROM_NOW = new Date('2026-01-01T00:05:00.000Z');
const JUST_OVER_FIVE_MINUTES_FROM_NOW = new Date('2026-01-01T00:05:00.001Z');

describe('AccessTokensService (e2e)', () => {
  let repositoryDatabase: RepositoryDatabase;
  let repository: StoresRepository;
  let service: AccessTokensService;
  const exchangeRefreshToken =
    vi.fn<ShopifyTokenClient['exchangeRefreshToken']>();

  beforeAll(async () => {
    repositoryDatabase = await createRepositoryDatabase(DATABASE_NAME);
    repository = new StoresRepository(repositoryDatabase.database);
    service = new AccessTokensService(repository, { exchangeRefreshToken });
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    exchangeRefreshToken.mockReset();
  });

  afterAll(async () => {
    await repositoryDatabase.close();
  });

  it("returns the store's address and access token without asking Shopify when more than 5 minutes are left", async () => {
    const installation = createInstallationExpiringAt(
      JUST_OVER_FIVE_MINUTES_FROM_NOW,
    );
    const { storeId } = await repository.installStore(installation);

    expect(await service.getStoreAccess(storeId)).toEqual({
      shopDomain: installation.store.shopDomain,
      accessToken: installation.credentials.accessToken,
    });
    expect(exchangeRefreshToken).not.toHaveBeenCalled();
  });

  it("refreshes when 5 minutes are left, saves the new keys and returns the store's address with the new access token", async () => {
    const installation = createInstallationExpiringAt(FIVE_MINUTES_FROM_NOW);
    const { storeId } = await repository.installStore(installation);
    const fresh = createNewCredentials();
    exchangeRefreshToken.mockResolvedValue(fresh);

    expect(await service.getStoreAccess(storeId)).toEqual({
      shopDomain: installation.store.shopDomain,
      accessToken: fresh.accessToken,
    });
    expect(exchangeRefreshToken).toHaveBeenCalledExactlyOnceWith(
      installation.store.shopDomain,
      installation.credentials.refreshToken,
    );
    expect(
      await readCredentialsRow(repositoryDatabase.database, storeId),
    ).toMatchObject(fresh);
  });

  it('asks Shopify once when two requests need a refresh at the same time', async () => {
    const installation = createInstallationExpiringAt(FIVE_MINUTES_FROM_NOW);
    const { storeId } = await repository.installStore(installation);
    const fresh = createNewCredentials();
    exchangeRefreshToken.mockResolvedValue(fresh);
    const freshAccess = {
      shopDomain: installation.store.shopDomain,
      accessToken: fresh.accessToken,
    };

    const bothAccesses = await Promise.all([
      service.getStoreAccess(storeId),
      service.getStoreAccess(storeId),
    ]);

    expect(bothAccesses).toEqual([freshAccess, freshAccess]);
    expect(exchangeRefreshToken).toHaveBeenCalledTimes(1);
  });

  it('throws StoreMustAuthorizeError for a store that has no keys', async () => {
    const storeId = await repository.create(createNewStore());

    await expect(service.getStoreAccess(storeId)).rejects.toThrow(
      StoreMustAuthorizeError,
    );
    expect(exchangeRefreshToken).not.toHaveBeenCalled();
  });

  it('deletes the keys and throws StoreMustAuthorizeError when Shopify refuses the refresh token', async () => {
    const { storeId } = await repository.installStore(
      createInstallationExpiringAt(FIVE_MINUTES_FROM_NOW),
    );
    exchangeRefreshToken.mockRejectedValue(new ShopifyRefusedError());

    await expect(service.getStoreAccess(storeId)).rejects.toThrow(
      StoreMustAuthorizeError,
    );
    expect(
      await readCredentialsRow(repositoryDatabase.database, storeId),
    ).toBeUndefined();
  });

  it('leaves the keys as they were and throws ShopifyUnavailableError when Shopify does not answer', async () => {
    const installation = createInstallationExpiringAt(FIVE_MINUTES_FROM_NOW);
    const { storeId } = await repository.installStore(installation);
    exchangeRefreshToken.mockRejectedValue(new ShopifyUnavailableError());

    await expect(service.getStoreAccess(storeId)).rejects.toThrow(
      ShopifyUnavailableError,
    );
    expect(
      await readCredentialsRow(repositoryDatabase.database, storeId),
    ).toMatchObject(installation.credentials);
  });
});

describe('AccessTokensModule (e2e)', () => {
  it('hands out the service from the app', async () => {
    const app = await createTestApp();

    expect(app.get(AccessTokensService)).toBeInstanceOf(AccessTokensService);

    await app.close();
  });
});
