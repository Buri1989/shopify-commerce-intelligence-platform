import { createDataAnswer } from '../../test/shopify-answers.js';
import { graphql } from './graphql.js';
import { ShopifyShopRetriever } from './shopify-shop-retriever.js';

const SHOP_QUERY = graphql`
  {
    shop {
      id
      name
      currencyCode
      myshopifyDomain
    }
  }
`;
const SHOP_DOMAIN = 'example-store.myshopify.com';
const GRAPHQL_URL = `https://${SHOP_DOMAIN}/admin/api/2026-10/graphql.json`;
const SHOP = {
  id: 'gid://shopify/Shop/548380009',
  name: 'Example Store',
  currencyCode: 'EUR',
  myshopifyDomain: SHOP_DOMAIN,
};

describe('ShopifyShopRetriever', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const retriever = new ShopifyShopRetriever();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  describe('retrieveShop', () => {
    it('sends the shop query to Admin API version 2026-10 with the access token', async () => {
      fetchMock.mockResolvedValue(
        Response.json(createDataAnswer({ shop: SHOP })),
      );

      await retriever.retrieveShop(SHOP_DOMAIN, 'access-token');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': 'access-token',
        },
        body: JSON.stringify({ query: SHOP_QUERY, variables: {} }),
        signal: expect.any(AbortSignal),
      });
    });

    it("returns the shop's id, domain, name and currency as store columns", async () => {
      fetchMock.mockResolvedValue(
        Response.json(createDataAnswer({ shop: SHOP })),
      );

      expect(await retriever.retrieveShop(SHOP_DOMAIN, 'access-token')).toEqual(
        {
          shopifyId: 548380009,
          shopDomain: SHOP_DOMAIN,
          name: 'Example Store',
          currency: 'EUR',
        },
      );
    });

    it('throws an error when the shop has no currency', async () => {
      const { currencyCode: _, ...shopWithoutCurrency } = SHOP;
      fetchMock.mockResolvedValue(
        Response.json(createDataAnswer({ shop: shopWithoutCurrency })),
      );

      await expect(
        retriever.retrieveShop(SHOP_DOMAIN, 'access-token'),
      ).rejects.toThrow(/currencyCode/);
    });

    it('throws an error when the id is not a Shopify shop id', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            shop: { ...SHOP, id: 'gid://shopify/Product/548380009' },
          }),
        ),
      );

      await expect(
        retriever.retrieveShop(SHOP_DOMAIN, 'access-token'),
      ).rejects.toThrow(/id/);
    });
  });
});
