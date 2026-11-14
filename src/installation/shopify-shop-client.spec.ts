import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';
import { ShopifyShopClient } from './shopify-shop-client.js';

const SHOP_DOMAIN = 'example-store.myshopify.com';
const GRAPHQL_URL = `https://${SHOP_DOMAIN}/admin/api/2026-10/graphql.json`;
const TEN_SECONDS = 10_000;
const SHOP = {
  id: 'gid://shopify/Shop/548380009',
  name: 'Example Store',
  currencyCode: 'EUR',
  myshopifyDomain: SHOP_DOMAIN,
};
const SHOP_ANSWER = { data: { shop: SHOP } };

describe('ShopifyShopClient', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const client = new ShopifyShopClient();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  describe('fetchShopDetails', () => {
    it('sends the shop query to Admin API version 2026-10 with the access token', async () => {
      fetchMock.mockResolvedValue(Response.json(SHOP_ANSWER));

      await client.fetchShopDetails(SHOP_DOMAIN, 'access-token');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': 'access-token',
        },
        body: '{"query":"{ shop { id name currencyCode myshopifyDomain } }"}',
        signal: expect.any(AbortSignal),
      });
    });

    it("returns the shop's id, domain, name and currency as store columns", async () => {
      fetchMock.mockResolvedValue(Response.json(SHOP_ANSWER));

      expect(
        await client.fetchShopDetails(SHOP_DOMAIN, 'access-token'),
      ).toEqual({
        shopifyId: 548380009,
        shopDomain: SHOP_DOMAIN,
        name: 'Example Store',
        currency: 'EUR',
      });
    });

    it('gives Shopify 10 seconds to answer', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');
      fetchMock.mockResolvedValue(Response.json(SHOP_ANSWER));

      await client.fetchShopDetails(SHOP_DOMAIN, 'access-token');

      expect(timeout).toHaveBeenCalledExactlyOnceWith(TEN_SECONDS);
    });

    it.each([429, 500, 503])(
      'throws ShopifyUnavailableError when Shopify answers %i',
      async (status) => {
        fetchMock.mockResolvedValue(new Response(null, { status }));

        await expect(
          client.fetchShopDetails(SHOP_DOMAIN, 'access-token'),
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
        client.fetchShopDetails(SHOP_DOMAIN, 'access-token'),
      ).rejects.toStrictEqual(new ShopifyUnavailableError({ cause: timedOut }));
    });

    it.each([400, 401, 402, 403, 404, 423])(
      'throws a plain error that names the status when Shopify answers %i',
      async (status) => {
        fetchMock.mockResolvedValue(new Response(null, { status }));

        await expect(
          client.fetchShopDetails(SHOP_DOMAIN, 'access-token'),
        ).rejects.toThrow(
          `Shopify answered the shop query with status ${status}.`,
        );
      },
    );

    it('throws a plain error that holds the errors when a yes from Shopify lists errors', async () => {
      fetchMock.mockResolvedValue(
        Response.json({
          errors: [
            {
              message: 'Access denied for shop field.',
              extensions: { code: 'ACCESS_DENIED' },
            },
          ],
        }),
      );

      await expect(
        client.fetchShopDetails(SHOP_DOMAIN, 'access-token'),
      ).rejects.toThrow(/ACCESS_DENIED/);
    });

    it('throws a plain error when a yes from Shopify has no currency', async () => {
      fetchMock.mockResolvedValue(
        Response.json({
          data: {
            shop: {
              id: SHOP.id,
              name: SHOP.name,
              myshopifyDomain: SHOP.myshopifyDomain,
            },
          },
        }),
      );

      await expect(
        client.fetchShopDetails(SHOP_DOMAIN, 'access-token'),
      ).rejects.toThrow(/currencyCode/);
    });

    it('throws a plain error when the id is not a Shopify shop id', async () => {
      fetchMock.mockResolvedValue(
        Response.json({
          data: { shop: { ...SHOP, id: 'gid://shopify/Product/548380009' } },
        }),
      );

      await expect(
        client.fetchShopDetails(SHOP_DOMAIN, 'access-token'),
      ).rejects.toThrow(/id/);
    });
  });
});
