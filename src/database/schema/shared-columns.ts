import { sql } from 'drizzle-orm';
import { bigint, datetime } from 'drizzle-orm/mysql-core';

export function createIdColumn() {
  return createUnsignedBigint('id').autoincrement().primaryKey();
}

export function createStoreIdColumn() {
  return createUnsignedBigint('store_id').notNull();
}

export function createShopifyIdColumn() {
  return createUnsignedBigint('shopify_id').notNull();
}

export function createTimestampColumns() {
  return {
    createdAt: datetime('created_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime('updated_at', { fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdate(() => new Date()),
  };
}

// Shopify's ids are 64-bit, but today's values sit far below 2^53, so a plain
// number keeps every comparison and JSON body simple (design §8).
export function createUnsignedBigint(name: string) {
  return bigint(name, { mode: 'number', unsigned: true });
}
