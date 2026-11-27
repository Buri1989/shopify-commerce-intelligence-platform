import { createDataAnswer } from '../../test/shopify-answers.js';
import {
  createStoreQuerySender,
  STORE_GRAPHQL_URL,
  STORE_ID,
} from '../../test/store-query-sender.js';
import { ShopifyProductVariantsRetriever } from './shopify-product-variants-retriever.js';

const PRODUCT_VARIANTS_QUERY =
  'query ($after: String) { productVariants(first: 250, after: $after) { nodes { id title sku price position product { id } } pageInfo { hasNextPage endCursor } } }';
const VARIANT = {
  id: 'gid://shopify/ProductVariant/40422183',
  title: 'Large / Blue',
  sku: 'LS-L-BLU',
  price: '49.90',
  position: 2,
  product: { id: 'gid://shopify/Product/108828309' },
};
const LAST_PAGE = { hasNextPage: false, endCursor: 'cursor-2' };

describe('ShopifyProductVariantsRetriever', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const retriever = new ShopifyProductVariantsRetriever(
    createStoreQuerySender(),
  );

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  describe('retrieveProductVariants', () => {
    it('asks for the first 250 variants when there is no cursor', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            productVariants: { nodes: [], pageInfo: LAST_PAGE },
          }),
        ),
      );

      await retriever.retrieveProductVariants(STORE_ID, null);

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: PRODUCT_VARIANTS_QUERY,
            variables: { after: null },
          }),
        }),
      );
    });

    it('asks for the 250 variants after the cursor', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            productVariants: { nodes: [], pageInfo: LAST_PAGE },
          }),
        ),
      );

      await retriever.retrieveProductVariants(STORE_ID, 'cursor-1');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: PRODUCT_VARIANTS_QUERY,
            variables: { after: 'cursor-1' },
          }),
        }),
      );
    });

    it("returns each variant as a variant row pointing to its product's Shopify id, no next cursor on the last page, and the query's requested cost", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer(
            { productVariants: { nodes: [VARIANT], pageInfo: LAST_PAGE } },
            12,
          ),
        ),
      );

      expect(await retriever.retrieveProductVariants(STORE_ID, null)).toEqual({
        rows: [
          {
            shopifyId: 40422183,
            title: 'Large / Blue',
            sku: 'LS-L-BLU',
            price: '49.90',
            position: 2,
            productShopifyId: 108828309,
          },
        ],
        nextCursor: null,
        requestedQueryCost: 12,
      });
    });

    it('returns the end cursor as the next cursor when Shopify has another page', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            productVariants: {
              nodes: [VARIANT],
              pageInfo: { hasNextPage: true, endCursor: 'cursor-2' },
            },
          }),
        ),
      );

      const page = await retriever.retrieveProductVariants(STORE_ID, null);

      expect(page.nextCursor).toBe('cursor-2');
    });

    it('returns a variant without a SKU with a null SKU', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            productVariants: {
              nodes: [{ ...VARIANT, sku: null }],
              pageInfo: LAST_PAGE,
            },
          }),
        ),
      );

      const page = await retriever.retrieveProductVariants(STORE_ID, null);

      expect(page.rows).toEqual([expect.objectContaining({ sku: null })]);
    });

    it("throws an error when the variant's product id is not a Shopify product id", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            productVariants: {
              nodes: [
                {
                  ...VARIANT,
                  product: { id: 'gid://shopify/Collection/108828309' },
                },
              ],
              pageInfo: LAST_PAGE,
            },
          }),
        ),
      );

      await expect(
        retriever.retrieveProductVariants(STORE_ID, null),
      ).rejects.toThrow(/"product"/);
    });

    it('throws an error when the price is not a decimal amount', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            productVariants: {
              nodes: [{ ...VARIANT, price: '49,90' }],
              pageInfo: LAST_PAGE,
            },
          }),
        ),
      );

      await expect(
        retriever.retrieveProductVariants(STORE_ID, null),
      ).rejects.toThrow(/"price"/);
    });
  });
});
