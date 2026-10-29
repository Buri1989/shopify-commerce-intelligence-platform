import {
  datetime,
  foreignKey,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  createIdColumn,
  createShopifyIdColumn,
  createStoreIdColumn,
  createTimestampColumns,
} from './shared-columns.js';
import { stores } from './stores.js';

export const products = mysqlTable(
  'products',
  {
    id: createIdColumn(),
    storeId: createStoreIdColumn(),
    shopifyId: createShopifyIdColumn(),
    title: varchar('title', { length: 255 }).notNull(),
    handle: varchar('handle', { length: 255 }).notNull(),
    vendor: varchar('vendor', { length: 255 }),
    productType: varchar('product_type', { length: 255 }),
    status: varchar('status', { length: 32 }).notNull(),
    deletedAt: datetime('deleted_at', { fsp: 3 }),
    ...createTimestampColumns(),
  },
  (table) => [
    uniqueIndex('products_store_id_shopify_id_unique').on(
      table.storeId,
      table.shopifyId,
    ),
    uniqueIndex('products_store_id_id_unique').on(table.storeId, table.id),
    foreignKey({
      name: 'products_store_id_fk',
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }).onDelete('cascade'),
  ],
);
