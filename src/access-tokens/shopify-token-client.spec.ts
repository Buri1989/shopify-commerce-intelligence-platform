import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';
import { ShopifyRefusedError } from './shopify-refused.error.js';
import { ShopifyTokenClient } from './shopify-token-client.js';

const SHOP_DOMAIN = 'example-store.myshopify.com';
const TOKEN_URL = `https://${SHOP_DOMAIN}/admin/oauth/access_token`;
const FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json',
};
const TEN_SECONDS = 10_000;
const NOW = new Date('2026-01-01T00:00:00.000Z');
const TOKEN_ANSWER = {
  access_token: 'new-access-token',
  scope: 'read_products,read_orders',
  expires_in: 3600,
  refresh_token: 'new-refresh-token',
  refresh_token_expires_in: 7_776_000,
};
const NEW_CREDENTIALS = {
  accessToken: 'new-access-token',
  scopes: 'read_products,read_orders',
  expiresAt: new Date('2026-01-01T01:00:00.000Z'),
  refreshToken: 'new-refresh-token',
  refreshTokenExpiresAt: new Date('2026-04-01T00:00:00.000Z'),
};

describe('ShopifyTokenClient', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const client = new ShopifyTokenClient({
    SHOPIFY_CLIENT_ID: 'client-id',
    SHOPIFY_CLIENT_SECRET: 'client-secret',
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  describe('exchangeAuthorizationCode', () => {
    it('sends the code with the client id and secret and asks for expiring tokens', async () => {
      fetchMock.mockResolvedValue(Response.json(TOKEN_ANSWER));

      await client.exchangeAuthorizationCode(SHOP_DOMAIN, 'install-code');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(TOKEN_URL, {
        method: 'POST',
        headers: FORM_HEADERS,
        body: 'client_id=client-id&client_secret=client-secret&code=install-code&expiring=1',
        signal: expect.any(AbortSignal),
      });
    });

    it('returns the new credentials with both expiry times counted from now', async () => {
      fetchMock.mockResolvedValue(Response.json(TOKEN_ANSWER));

      expect(
        await client.exchangeAuthorizationCode(SHOP_DOMAIN, 'install-code'),
      ).toEqual(NEW_CREDENTIALS);
    });

    it('gives Shopify 10 seconds to answer', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      fetchMock.mockResolvedValue(Response.json(TOKEN_ANSWER));

      await client.exchangeAuthorizationCode(SHOP_DOMAIN, 'install-code');

      expect(timeout).toHaveBeenCalledExactlyOnceWith(TEN_SECONDS);
    });

    it.each([400, 401, 403])(
      'throws ShopifyRefusedError when Shopify answers %i',
      async (status) => {
        fetchMock.mockResolvedValue(new Response(null, { status }));

        await expect(
          client.exchangeAuthorizationCode(SHOP_DOMAIN, 'install-code'),
        ).rejects.toThrow(ShopifyRefusedError);
      },
    );

    it.each([429, 500, 503])(
      'throws ShopifyUnavailableError when Shopify answers %i',
      async (status) => {
        fetchMock.mockResolvedValue(new Response(null, { status }));

        await expect(
          client.exchangeAuthorizationCode(SHOP_DOMAIN, 'install-code'),
        ).rejects.toThrow(ShopifyUnavailableError);
      },
    );

    it('throws ShopifyUnavailableError with the reason when Shopify does not answer in time', async () => {
      const timedOut = new DOMException(
        'The operation timed out.',
        'TimeoutError',
      );
      fetchMock.mockRejectedValue(timedOut);

      await expect(
        client.exchangeAuthorizationCode(SHOP_DOMAIN, 'install-code'),
      ).rejects.toStrictEqual(new ShopifyUnavailableError({ cause: timedOut }));
    });

    it('throws a plain error when a yes from Shopify has no refresh token', async () => {
      fetchMock.mockResolvedValue(
        Response.json({
          access_token: 'new-access-token',
          scope: 'read_products',
        }),
      );

      await expect(
        client.exchangeAuthorizationCode(SHOP_DOMAIN, 'install-code'),
      ).rejects.toThrow(/refresh_token/);
    });
  });

  describe('exchangeRefreshToken', () => {
    it('sends the refresh token with the client id and secret', async () => {
      fetchMock.mockResolvedValue(Response.json(TOKEN_ANSWER));

      await client.exchangeRefreshToken(SHOP_DOMAIN, 'old-refresh-token');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(TOKEN_URL, {
        method: 'POST',
        headers: FORM_HEADERS,
        body: 'client_id=client-id&client_secret=client-secret&grant_type=refresh_token&refresh_token=old-refresh-token',
        signal: expect.any(AbortSignal),
      });
    });

    it('returns the new credentials with both expiry times counted from now', async () => {
      fetchMock.mockResolvedValue(Response.json(TOKEN_ANSWER));

      expect(
        await client.exchangeRefreshToken(SHOP_DOMAIN, 'old-refresh-token'),
      ).toEqual(NEW_CREDENTIALS);
    });

    it('gives Shopify 10 seconds to answer', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      fetchMock.mockResolvedValue(Response.json(TOKEN_ANSWER));

      await client.exchangeRefreshToken(SHOP_DOMAIN, 'old-refresh-token');

      expect(timeout).toHaveBeenCalledExactlyOnceWith(TEN_SECONDS);
    });

    it('throws ShopifyRefusedError when Shopify answers 401', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 401 }));

      await expect(
        client.exchangeRefreshToken(SHOP_DOMAIN, 'old-refresh-token'),
      ).rejects.toThrow(ShopifyRefusedError);
    });

    it.each([400, 403])(
      'throws a plain error that names the status when Shopify answers %i',
      async (status) => {
        fetchMock.mockResolvedValue(new Response(null, { status }));

        await expect(
          client.exchangeRefreshToken(SHOP_DOMAIN, 'old-refresh-token'),
        ).rejects.toThrow(
          `Shopify answered the token refresh with status ${status}.`,
        );
      },
    );

    it.each([429, 500, 503])(
      'throws ShopifyUnavailableError when Shopify answers %i',
      async (status) => {
        fetchMock.mockResolvedValue(new Response(null, { status }));

        await expect(
          client.exchangeRefreshToken(SHOP_DOMAIN, 'old-refresh-token'),
        ).rejects.toThrow(ShopifyUnavailableError);
      },
    );

    it('throws ShopifyUnavailableError with the reason when Shopify does not answer in time', async () => {
      const timedOut = new DOMException(
        'The operation timed out.',
        'TimeoutError',
      );
      fetchMock.mockRejectedValue(timedOut);

      await expect(
        client.exchangeRefreshToken(SHOP_DOMAIN, 'old-refresh-token'),
      ).rejects.toStrictEqual(new ShopifyUnavailableError({ cause: timedOut }));
    });
  });
});
