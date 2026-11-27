import { PRODUCT_ROW } from '../../test/retrieved-rows.js';
import {
  createDataAnswer,
  LAST_PAGE_INFO,
  NEXT_PAGE_INFO,
} from '../../test/shopify-answers.js';
import {
  createStoreQuerySender,
  STORE_GRAPHQL_URL,
  STORE_ID,
} from '../../test/store-query-sender.js';
import { graphql } from './graphql.js';
import { ShopifyProductsRetriever } from './shopify-products-retriever.js';

const PRODUCTS_QUERY = graphql`
  query ($after: String) {
    products(first: 250, after: $after) {
      nodes {
        id
        title
        handle
        vendor
        productType
        status
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;
const PRODUCT = {
  id: 'gid://shopify/Product/108828309',
  title: 'Linen shirt',
  handle: 'linen-shirt',
  vendor: 'North Mill',
  productType: 'Shirts',
  status: 'ACTIVE',
};

describe('ShopifyProductsRetriever', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const retriever = new ShopifyProductsRetriever(createStoreQuerySender());

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  describe('retrieveProducts', () => {
    it('asks for the first 250 products when there is no cursor', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            products: { nodes: [], pageInfo: LAST_PAGE_INFO },
          }),
        ),
      );

      await retriever.retrieveProducts(STORE_ID, null);

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: PRODUCTS_QUERY,
            variables: { after: null },
          }),
        }),
      );
    });

    it('asks for the 250 products after the cursor', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            products: { nodes: [], pageInfo: LAST_PAGE_INFO },
          }),
        ),
      );

      await retriever.retrieveProducts(STORE_ID, 'cursor-1');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: PRODUCTS_QUERY,
            variables: { after: 'cursor-1' },
          }),
        }),
      );
    });

    it("returns each product as a product row, no next cursor on the last page, and the query's requested cost", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer(
            { products: { nodes: [PRODUCT], pageInfo: LAST_PAGE_INFO } },
            12,
          ),
        ),
      );

      expect(await retriever.retrieveProducts(STORE_ID, null)).toEqual({
        rows: [PRODUCT_ROW],
        nextCursor: null,
        requestedQueryCost: 12,
      });
    });

    it('returns the end cursor as the next cursor when Shopify has another page', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            products: {
              nodes: [PRODUCT],
              pageInfo: NEXT_PAGE_INFO,
            },
          }),
        ),
      );

      const page = await retriever.retrieveProducts(STORE_ID, null);

      expect(page.nextCursor).toBe('cursor-2');
    });

    it('returns an empty vendor and product type as null', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            products: {
              nodes: [{ ...PRODUCT, vendor: '', productType: '' }],
              pageInfo: LAST_PAGE_INFO,
            },
          }),
        ),
      );

      const page = await retriever.retrieveProducts(STORE_ID, null);

      expect(page.rows).toEqual([
        expect.objectContaining({ vendor: null, productType: null }),
      ]);
    });

    it('throws an error when an id is not a Shopify product id', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            products: {
              nodes: [{ ...PRODUCT, id: 'gid://shopify/Collection/108828309' }],
              pageInfo: LAST_PAGE_INFO,
            },
          }),
        ),
      );

      await expect(retriever.retrieveProducts(STORE_ID, null)).rejects.toThrow(
        /"id"/,
      );
    });
  });
});
