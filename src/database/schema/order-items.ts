import {
  decimal,
  foreignKey,
  index,
  int,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { orders } from './orders.js';
import { productVariants } from './product-variants.js';
import { products } from './products.js';
import {
  createIdColumn,
  createShopifyIdColumn,
  createStoreIdColumn,
  createTimestampColumns,
  createUnsignedBigint,
} from './shared-columns.js';

export const orderItems = mysqlTable(
  'order_items',
  {
    id: createIdColumn(),
    storeId: createStoreIdColumn(),
    orderId: createUnsignedBigint('order_id').notNull(),
    productId: createUnsignedBigint('product_id'),
    variantId: createUnsignedBigint('variant_id'),
    shopifyId: createShopifyIdColumn(),
    title: varchar('title', { length: 255 }).notNull(),
    variantTitle: varchar('variant_title', { length: 255 }),
    sku: varchar('sku', { length: 255 }),
    quantity: int('quantity', { unsigned: true }).notNull(),
    price: decimal('price', { precision: 19, scale: 4 }).notNull(),
    ...createTimestampColumns(),
  },
  (table) => [
    uniqueIndex('order_items_store_id_shopify_id_unique').on(
      table.storeId,
      table.shopifyId,
    ),
    index('order_items_store_id_order_id_idx').on(table.storeId, table.orderId),
    index('order_items_product_id_idx').on(table.productId),
    index('order_items_variant_id_idx').on(table.variantId),
    foreignKey({
      name: 'order_items_store_id_order_id_fk',
      columns: [table.storeId, table.orderId],
      foreignColumns: [orders.storeId, orders.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'order_items_product_id_fk',
      columns: [table.productId],
      foreignColumns: [products.id],
    }).onDelete('set null'),
    foreignKey({
      name: 'order_items_variant_id_fk',
      columns: [table.variantId],
      foreignColumns: [productVariants.id],
    }).onDelete('set null'),
  ],
);
