import { type Mock, vi } from 'vitest';
import { createEmptyLastPage } from '../src/retrieval/retrieved-page.js';
import type { StoreRetrievers } from '../src/retrieval/store-walks.js';

type ProductsRetriever = StoreRetrievers['products'];
type VariantsRetriever = StoreRetrievers['productVariants'];
type CollectionsRetriever = StoreRetrievers['collections'];
type OrdersRetriever = StoreRetrievers['orders'];

export type FakeStoreRetrievers = {
  products: { retrieveProducts: Mock<ProductsRetriever['retrieveProducts']> };
  productVariants: {
    retrieveProductVariants: Mock<VariantsRetriever['retrieveProductVariants']>;
  };
  collections: {
    retrieveCollections: Mock<CollectionsRetriever['retrieveCollections']>;
    retrieveCollectionProducts: Mock<
      CollectionsRetriever['retrieveCollectionProducts']
    >;
  };
  orders: {
    retrieveOrders: Mock<OrdersRetriever['retrieveOrders']>;
    retrieveOrderItems: Mock<OrdersRetriever['retrieveOrderItems']>;
  };
};

const EMPTY_PAGE_COST = 1;

export function createEmptyStoreRetrievers(): FakeStoreRetrievers {
  return {
    products: {
      retrieveProducts: vi
        .fn()
        .mockResolvedValue(createEmptyLastPage(EMPTY_PAGE_COST)),
    },
    productVariants: {
      retrieveProductVariants: vi
        .fn()
        .mockResolvedValue(createEmptyLastPage(EMPTY_PAGE_COST)),
    },
    collections: {
      retrieveCollections: vi
        .fn()
        .mockResolvedValue(createEmptyLastPage(EMPTY_PAGE_COST)),
      retrieveCollectionProducts: vi
        .fn()
        .mockResolvedValue(createEmptyLastPage(EMPTY_PAGE_COST)),
    },
    orders: {
      retrieveOrders: vi
        .fn()
        .mockResolvedValue(createEmptyLastPage(EMPTY_PAGE_COST)),
      retrieveOrderItems: vi
        .fn()
        .mockResolvedValue(createEmptyLastPage(EMPTY_PAGE_COST)),
    },
  };
}
