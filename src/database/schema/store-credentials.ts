import {
  datetime,
  foreignKey,
  mysqlTable,
  text,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  createStoreIdColumn,
  createTimestampColumns,
} from './shared-columns.js';
import { stores } from './stores.js';

export const storeCredentials = mysqlTable(
  'store_credentials',
  {
    storeId: createStoreIdColumn().primaryKey(),
    accessToken: varchar('access_token', { length: 255 }).notNull(),
    scopes: text('scopes').notNull(),
    expiresAt: datetime('expires_at', { fsp: 3 }),
    ...createTimestampColumns(),
  },
  (table) => [
    foreignKey({
      name: 'store_credentials_store_id_fk',
      columns: [table.storeId],
      foreignColumns: [stores.id],
    }).onDelete('cascade'),
  ],
);
