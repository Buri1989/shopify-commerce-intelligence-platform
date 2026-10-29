import {
  date,
  decimal,
  foreignKey,
  int,
  mysqlTable,
  primaryKey,
} from 'drizzle-orm/mysql-core';
import {
  createStoreIdColumn,
  createTimestampColumns,
} from './shared-columns.js';
import { stores } from './stores.js';

export const storeAnalytics = mysqlTable(
  'store_analytics',
  {
    storeId: createStoreIdColumn(),
    day: date('day', { mode: 'string' }).notNull(),
    ordersCount: int('orders_count', { unsigned: true }).notNull().default(0),
    revenue: decimal('revenue', { precision: 19, scale: 4 })
      .notNull()
      .default('0'),
    ...createTimestampColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.day] }),
    foreignKey({
      name: 'store_analytics_store_id_fk',
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }).onDelete('cascade'),
  ],
);
