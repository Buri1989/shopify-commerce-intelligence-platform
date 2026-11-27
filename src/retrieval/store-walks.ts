import type {
  CollectionProductsCursor,
  ShopifyCollectionsRetriever,
} from './shopify-collections-retriever.js';
import type { RetrievedOrder } from './shopify-order-schema.js';
import type { ShopifyOrdersRetriever } from './shopify-orders-retriever.js';
import type { ShopifyProductVariantsRetriever } from './shopify-product-variants-retriever.js';
import type { ShopifyProductsRetriever } from './shopify-products-retriever.js';
import {
  addWalkCounts,
  countNestedPages,
  countRetrievedPages,
  EMPTY_WALK_COUNT,
  type WalkCount,
} from './walk-count.js';

export type StoreRetrievers = {
  products: Pick<ShopifyProductsRetriever, 'retrieveProducts'>;
  productVariants: Pick<
    ShopifyProductVariantsRetriever,
    'retrieveProductVariants'
  >;
  collections: Pick<
    ShopifyCollectionsRetriever,
    'retrieveCollections' | 'retrieveCollectionProducts'
  >;
  orders: Pick<ShopifyOrdersRetriever, 'retrieveOrders' | 'retrieveOrderItems'>;
};

export type WalkedKind = WalkCount & {
  kind:
    | 'products'
    | 'productVariants'
    | 'collections'
    | 'collectionProducts'
    | 'orders'
    | 'orderItems';
};
type StoreWalk = (
  storeId: number,
  retrievers: StoreRetrievers,
) => Promise<WalkedKind[]>;

export const STORE_WALKS: StoreWalk[] = [
  walkProducts,
  walkProductVariants,
  walkCollections,
  walkOrders,
];

export async function walkProducts(
  storeId: number,
  { products }: StoreRetrievers,
): Promise<WalkedKind[]> {
  const count = await countRetrievedPages(
    (cursor: string | null) => products.retrieveProducts(storeId, cursor),
    null,
  );
  return [{ kind: 'products', ...count }];
}

export async function walkProductVariants(
  storeId: number,
  { productVariants }: StoreRetrievers,
): Promise<WalkedKind[]> {
  const count = await countRetrievedPages(
    (cursor: string | null) =>
      productVariants.retrieveProductVariants(storeId, cursor),
    null,
  );
  return [{ kind: 'productVariants', ...count }];
}

export async function walkCollections(
  storeId: number,
  { collections }: StoreRetrievers,
): Promise<WalkedKind[]> {
  const { parents, children } = await countNestedPages(
    (cursor: string | null) => collections.retrieveCollections(storeId, cursor),
    null,
    (collection) =>
      countRetrievedPages(
        (cursor: CollectionProductsCursor | null) =>
          collections.retrieveCollectionProducts(
            storeId,
            collection.shopifyId,
            cursor,
          ),
        null,
      ),
  );
  return [
    { kind: 'collections', ...parents },
    { kind: 'collectionProducts', ...children },
  ];
}

export async function walkOrders(
  storeId: number,
  { orders }: StoreRetrievers,
): Promise<WalkedKind[]> {
  const { parents, children } = await countNestedPages(
    (cursor: string | null) => orders.retrieveOrders(storeId, cursor),
    null,
    (order) => countOrderItems(storeId, orders, order),
  );
  return [
    { kind: 'orders', ...parents },
    { kind: 'orderItems', ...children },
  ];
}

async function countOrderItems(
  storeId: number,
  orders: StoreRetrievers['orders'],
  order: RetrievedOrder,
): Promise<WalkCount> {
  const itemsInsideOrder = { ...EMPTY_WALK_COUNT, rows: order.items.length };
  if (order.itemsNextCursor === null) {
    return itemsInsideOrder;
  }
  const remainingItems = await countRetrievedPages(
    (cursor: string) =>
      orders.retrieveOrderItems(storeId, order.shopifyId, cursor),
    order.itemsNextCursor,
  );
  return addWalkCounts(itemsInsideOrder, remainingItems);
}
