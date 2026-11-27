import { createDataAnswer } from '../../test/shopify-answers.js';
import {
  createStoreQuerySender,
  STORE_GRAPHQL_URL,
  STORE_ID,
} from '../../test/store-query-sender.js';
import { ShopifyCollectionsRetriever } from './shopify-collections-retriever.js';

const COLLECTIONS_QUERY =
  'query ($after: String) { collections(first: 250, after: $after) { nodes { id title handle } pageInfo { hasNextPage endCursor } } }';
const COLLECTION_PRODUCTS_QUERY =
  'query ($id: ID!, $after: String) { collection(id: $id) { products(first: 250, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } } }';
const COLLECTION = {
  id: 'gid://shopify/Collection/482865238',
  title: 'Summer',
  handle: 'summer',
};
const COLLECTION_SHOPIFY_ID = 482865238;
const PRODUCT_NODES = [
  { id: 'gid://shopify/Product/108828309' },
  { id: 'gid://shopify/Product/108828310' },
];
const LAST_PAGE = { hasNextPage: false, endCursor: 'cursor-2' };
const NEXT_PAGE = { hasNextPage: true, endCursor: 'cursor-2' };

describe('ShopifyCollectionsRetriever', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const retriever = new ShopifyCollectionsRetriever(createStoreQuerySender());

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  describe('retrieveCollections', () => {
    it('asks for the first 250 collections when there is no cursor', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({ collections: { nodes: [], pageInfo: LAST_PAGE } }),
        ),
      );

      await retriever.retrieveCollections(STORE_ID, null);

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: COLLECTIONS_QUERY,
            variables: { after: null },
          }),
        }),
      );
    });

    it('asks for the 250 collections after the cursor', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({ collections: { nodes: [], pageInfo: LAST_PAGE } }),
        ),
      );

      await retriever.retrieveCollections(STORE_ID, 'cursor-1');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: COLLECTIONS_QUERY,
            variables: { after: 'cursor-1' },
          }),
        }),
      );
    });

    it("returns each collection as a collection row, no next cursor on the last page, and the query's requested cost", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer(
            { collections: { nodes: [COLLECTION], pageInfo: LAST_PAGE } },
            12,
          ),
        ),
      );

      expect(await retriever.retrieveCollections(STORE_ID, null)).toEqual({
        rows: [{ shopifyId: 482865238, title: 'Summer', handle: 'summer' }],
        nextCursor: null,
        requestedQueryCost: 12,
      });
    });

    it('returns the end cursor as the next cursor when Shopify has another page', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            collections: { nodes: [COLLECTION], pageInfo: NEXT_PAGE },
          }),
        ),
      );

      const page = await retriever.retrieveCollections(STORE_ID, null);

      expect(page.nextCursor).toBe('cursor-2');
    });
  });

  describe('retrieveCollectionProducts', () => {
    it('asks for the first 250 products of the collection by its Shopify id when there is no cursor', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            collection: { products: { nodes: [], pageInfo: LAST_PAGE } },
          }),
        ),
      );

      await retriever.retrieveCollectionProducts(
        STORE_ID,
        COLLECTION_SHOPIFY_ID,
        null,
      );

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: COLLECTION_PRODUCTS_QUERY,
            variables: {
              id: 'gid://shopify/Collection/482865238',
              after: null,
            },
          }),
        }),
      );
    });

    it("asks for the 250 products after the cursor's Shopify cursor", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            collection: { products: { nodes: [], pageInfo: LAST_PAGE } },
          }),
        ),
      );

      await retriever.retrieveCollectionProducts(
        STORE_ID,
        COLLECTION_SHOPIFY_ID,
        { after: 'cursor-1', nextPosition: 251 },
      );

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: COLLECTION_PRODUCTS_QUERY,
            variables: {
              id: 'gid://shopify/Collection/482865238',
              after: 'cursor-1',
            },
          }),
        }),
      );
    });

    it("returns each product's Shopify id with its position from 1 in Shopify's order, no next cursor on the last page, and the query's requested cost", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer(
            {
              collection: {
                products: { nodes: PRODUCT_NODES, pageInfo: LAST_PAGE },
              },
            },
            7,
          ),
        ),
      );

      expect(
        await retriever.retrieveCollectionProducts(
          STORE_ID,
          COLLECTION_SHOPIFY_ID,
          null,
        ),
      ).toEqual({
        rows: [
          { productShopifyId: 108828309, position: 1 },
          { productShopifyId: 108828310, position: 2 },
        ],
        nextCursor: null,
        requestedQueryCost: 7,
      });
    });

    it("numbers the products from the cursor's next position", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            collection: {
              products: { nodes: PRODUCT_NODES, pageInfo: LAST_PAGE },
            },
          }),
        ),
      );

      const page = await retriever.retrieveCollectionProducts(
        STORE_ID,
        COLLECTION_SHOPIFY_ID,
        { after: 'cursor-1', nextPosition: 251 },
      );

      expect(page.rows).toEqual([
        { productShopifyId: 108828309, position: 251 },
        { productShopifyId: 108828310, position: 252 },
      ]);
    });

    it('returns the end cursor and the position after this page as the next cursor when Shopify has another page', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            collection: {
              products: { nodes: PRODUCT_NODES, pageInfo: NEXT_PAGE },
            },
          }),
        ),
      );

      const page = await retriever.retrieveCollectionProducts(
        STORE_ID,
        COLLECTION_SHOPIFY_ID,
        { after: 'cursor-1', nextPosition: 251 },
      );

      expect(page.nextCursor).toEqual({ after: 'cursor-2', nextPosition: 253 });
    });

    it('returns an empty last page when Shopify no longer has the collection', async () => {
      fetchMock.mockResolvedValue(
        Response.json(createDataAnswer({ collection: null }, 3)),
      );

      expect(
        await retriever.retrieveCollectionProducts(
          STORE_ID,
          COLLECTION_SHOPIFY_ID,
          null,
        ),
      ).toEqual({ rows: [], nextCursor: null, requestedQueryCost: 3 });
    });
  });
});
