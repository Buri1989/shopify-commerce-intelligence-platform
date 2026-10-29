import {
  datetime,
  foreignKey,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  createIdColumn,
  createStoreIdColumn,
  createTimestampColumns,
  createUnsignedBigint,
} from './shared-columns.js';
import { stores } from './stores.js';

export const webhookRecords = mysqlTable(
  'webhook_records',
  {
    id: createIdColumn(),
    storeId: createStoreIdColumn(),
    deliveryId: varchar('delivery_id', { length: 64 }).notNull(),
    topic: varchar('topic', { length: 64 }).notNull(),
    subjectShopifyId: createUnsignedBigint('subject_shopify_id'),
    status: mysqlEnum('status', ['received', 'processed', 'failed']).notNull(),
    receivedAt: datetime('received_at', { fsp: 3 }).notNull(),
    processedAt: datetime('processed_at', { fsp: 3 }),
    attempts: int('attempts', { unsigned: true }).notNull().default(0),
    lastError: text('last_error'),
    ...createTimestampColumns(),
  },
  (table) => [
    uniqueIndex('webhook_records_store_id_delivery_id_unique').on(
      table.storeId,
      table.deliveryId,
    ),
    foreignKey({
      name: 'webhook_records_store_id_fk',
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }).onDelete('cascade'),
  ],
);
