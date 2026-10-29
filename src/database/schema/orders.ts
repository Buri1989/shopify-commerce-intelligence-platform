import {
  char,
  datetime,
  decimal,
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

export const orders = mysqlTable(
  'orders',
  {
    id: createIdColumn(),
    storeId: createStoreIdColumn(),
    shopifyId: createShopifyIdColumn(),
    name: varchar('name', { length: 255 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    totalPrice: decimal('total_price', { precision: 19, scale: 4 }).notNull(),
    financialStatus: varchar('financial_status', { length: 32 }).notNull(),
    fulfillmentStatus: varchar('fulfillment_status', { length: 32 }),
    placedAt: datetime('placed_at', { fsp: 3 }).notNull(),
    cancelledAt: datetime('cancelled_at', { fsp: 3 }),
    ...createTimestampColumns(),
  },
  (table) => [
    uniqueIndex('orders_store_id_shopify_id_unique').on(
      table.storeId,
      table.shopifyId,
    ),
    uniqueIndex('orders_store_id_id_unique').on(table.storeId, table.id),
    foreignKey({
      name: 'orders_store_id_fk',
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }).onDelete('cascade'),
  ],
);
