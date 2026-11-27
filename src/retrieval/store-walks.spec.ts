import {
  COLLECTION_PRODUCT_ROWS,
  COLLECTION_ROW,
  PRODUCT_ROW,
  VARIANT_ROW,
} from '../../test/retrieved-rows.js';
import { ORDER_ITEM_ROW, PLACED_ORDER_ROW } from '../../test/shopify-orders.js';
import { STORE_ID } from '../../test/store-query-sender.js';
import {
  createEmptyStoreRetrievers,
  type FakeStoreRetrievers,
} from '../../test/store-retrievers.js';
import {
  walkCollections,
  walkOrders,
  walkProducts,
  walkProductVariants,
} from './store-walks.js';

const OTHER_COLLECTION_ROW = { ...COLLECTION_ROW, shopifyId: 482865239 };
const LARGE_ORDER_ROW = {
  ...PLACED_ORDER_ROW,
  itemsNextCursor: 'items-cursor-1',
};

describe('store walks', () => {
  let retrievers: FakeStoreRetrievers;

  beforeEach(() => {
    retrievers = createEmptyStoreRetrievers();
  });

  describe('walkProducts', () => {
    it('asks for every products page of the store, the first one with no cursor', async () => {
      retrievers.products.retrieveProducts.mockResolvedValueOnce({
        rows: [PRODUCT_ROW],
        nextCursor: 'cursor-2',
        requestedQueryCost: 12,
      });

      await walkProducts(STORE_ID, retrievers);

      expect(retrievers.products.retrieveProducts.mock.calls).toEqual([
        [STORE_ID, null],
        [STORE_ID, 'cursor-2'],
      ]);
    });

    it('returns the products count of every page', async () => {
      retrievers.products.retrieveProducts
        .mockResolvedValueOnce({
          rows: [PRODUCT_ROW, PRODUCT_ROW],
          nextCursor: 'cursor-2',
          requestedQueryCost: 12,
        })
        .mockResolvedValueOnce({
          rows: [PRODUCT_ROW],
          nextCursor: null,
          requestedQueryCost: 10,
        });

      expect(await walkProducts(STORE_ID, retrievers)).toEqual([
        { kind: 'products', rows: 3, pages: 2, highestRequestedQueryCost: 12 },
      ]);
    });
  });

  describe('walkProductVariants', () => {
    it('asks for every variants page of the store, the first one with no cursor', async () => {
      retrievers.productVariants.retrieveProductVariants.mockResolvedValueOnce({
        rows: [VARIANT_ROW],
        nextCursor: 'cursor-2',
        requestedQueryCost: 12,
      });

      await walkProductVariants(STORE_ID, retrievers);

      expect(
        retrievers.productVariants.retrieveProductVariants.mock.calls,
      ).toEqual([
        [STORE_ID, null],
        [STORE_ID, 'cursor-2'],
      ]);
    });

    it('returns the variants count of every page', async () => {
      retrievers.productVariants.retrieveProductVariants.mockResolvedValueOnce({
        rows: [VARIANT_ROW, VARIANT_ROW],
        nextCursor: null,
        requestedQueryCost: 12,
      });

      expect(await walkProductVariants(STORE_ID, retrievers)).toEqual([
        {
          kind: 'productVariants',
          rows: 2,
          pages: 1,
          highestRequestedQueryCost: 12,
        },
      ]);
    });
  });

  describe('walkCollections', () => {
    beforeEach(() => {
      retrievers.collections.retrieveCollections.mockResolvedValueOnce({
        rows: [COLLECTION_ROW, OTHER_COLLECTION_ROW],
        nextCursor: null,
        requestedQueryCost: 12,
      });
    });

    it("asks for each collection's products by its Shopify id, the first page with no cursor", async () => {
      await walkCollections(STORE_ID, retrievers);

      expect(
        retrievers.collections.retrieveCollectionProducts.mock.calls,
      ).toEqual([
        [STORE_ID, 482865238, null],
        [STORE_ID, 482865239, null],
      ]);
    });

    it("returns the collections count and one count of every collection's products", async () => {
      retrievers.collections.retrieveCollectionProducts.mockResolvedValue({
        rows: COLLECTION_PRODUCT_ROWS,
        nextCursor: null,
        requestedQueryCost: 7,
      });

      expect(await walkCollections(STORE_ID, retrievers)).toEqual([
        {
          kind: 'collections',
          rows: 2,
          pages: 1,
          highestRequestedQueryCost: 12,
        },
        {
          kind: 'collectionProducts',
          rows: 4,
          pages: 2,
          highestRequestedQueryCost: 7,
        },
      ]);
    });
  });

  describe('walkOrders', () => {
    beforeEach(() => {
      retrievers.orders.retrieveOrders.mockResolvedValueOnce({
        rows: [LARGE_ORDER_ROW, PLACED_ORDER_ROW],
        nextCursor: null,
        requestedQueryCost: 252,
      });
    });

    it('asks for the remaining items of only the order that has more, from its items cursor', async () => {
      await walkOrders(STORE_ID, retrievers);

      expect(
        retrievers.orders.retrieveOrderItems,
      ).toHaveBeenCalledExactlyOnceWith(STORE_ID, 450789469, 'items-cursor-1');
    });

    it('counts the items inside the orders and from the extra calls, and only the extra calls as pages', async () => {
      retrievers.orders.retrieveOrderItems.mockResolvedValueOnce({
        rows: [ORDER_ITEM_ROW, ORDER_ITEM_ROW],
        nextCursor: null,
        requestedQueryCost: 9,
      });

      expect(await walkOrders(STORE_ID, retrievers)).toEqual([
        { kind: 'orders', rows: 2, pages: 1, highestRequestedQueryCost: 252 },
        {
          kind: 'orderItems',
          rows: 4,
          pages: 1,
          highestRequestedQueryCost: 9,
        },
      ]);
    });

    it('counts no items pages when no order has more items', async () => {
      retrievers.orders.retrieveOrders.mockReset().mockResolvedValueOnce({
        rows: [PLACED_ORDER_ROW, PLACED_ORDER_ROW],
        nextCursor: null,
        requestedQueryCost: 252,
      });

      expect(await walkOrders(STORE_ID, retrievers)).toContainEqual({
        kind: 'orderItems',
        rows: 2,
        pages: 0,
        highestRequestedQueryCost: 0,
      });
    });
  });
});
