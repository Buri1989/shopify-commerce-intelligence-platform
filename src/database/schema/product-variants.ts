import {
  decimal,
  foreignKey,
  index,
  int,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import { products } from './products.js';
import {
  createIdColumn,
  createShopifyIdColumn,
  createStoreIdColumn,
  createTimestampColumns,
  createUnsignedBigint,
} from './shared-columns.js';

export const productVariants = mysqlTable(
  'product_variants',
  {
    id: createIdColumn(),
    storeId: createStoreIdColumn(),
    shopifyId: createShopifyIdColumn(),
    productId: createUnsignedBigint('product_id').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    sku: varchar('sku', { length: 255 }),
    price: decimal('price', { precision: 19, scale: 4 }).notNull(),
    position: int('position', { unsigned: true }).notNull(),
    ...createTimestampColumns(),
  },
  (table) => [
    uniqueIndex('product_variants_store_id_shopify_id_unique').on(
      table.storeId,
      table.shopifyId,
    ),
    uniqueIndex('product_variants_store_id_id_unique').on(
      table.storeId,
      table.id,
    ),
    index('product_variants_store_id_product_id_idx').on(
      table.storeId,
      table.productId,
    ),
    foreignKey({
      name: 'product_variants_store_id_product_id_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('cascade'),
  ],
);
