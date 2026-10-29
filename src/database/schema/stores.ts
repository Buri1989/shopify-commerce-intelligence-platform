import {
  char,
  datetime,
  mysqlTable,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core';
import {
  createIdColumn,
  createShopifyIdColumn,
  createTimestampColumns,
} from './shared-columns.js';

export const stores = mysqlTable(
  'stores',
  {
    id: createIdColumn(),
    shopifyId: createShopifyIdColumn(),
    shopDomain: varchar('shop_domain', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    installedAt: datetime('installed_at', { fsp: 3 }).notNull(),
    uninstalledAt: datetime('uninstalled_at', { fsp: 3 }),
    ...createTimestampColumns(),
  },
  (table) => [
    uniqueIndex('stores_shopify_id_unique').on(table.shopifyId),
    uniqueIndex('stores_shop_domain_unique').on(table.shopDomain),
  ],
);
