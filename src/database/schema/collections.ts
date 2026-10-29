import {
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

export const collections = mysqlTable(
  'collections',
  {
    id: createIdColumn(),
    storeId: createStoreIdColumn(),
    shopifyId: createShopifyIdColumn(),
    title: varchar('title', { length: 255 }).notNull(),
    handle: varchar('handle', { length: 255 }).notNull(),
    ...createTimestampColumns(),
  },
  (table) => [
    uniqueIndex('collections_store_id_shopify_id_unique').on(
      table.storeId,
      table.shopifyId,
    ),
    uniqueIndex('collections_store_id_id_unique').on(table.storeId, table.id),
    foreignKey({
      name: 'collections_store_id_fk',
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }).onDelete('cascade'),
  ],
);
