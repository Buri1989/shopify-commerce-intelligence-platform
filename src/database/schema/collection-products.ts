import {
  foreignKey,
  index,
  int,
  mysqlTable,
  primaryKey,
} from 'drizzle-orm/mysql-core';
import { collections } from './collections.js';
import { products } from './products.js';
import {
  createStoreIdColumn,
  createTimestampColumns,
  createUnsignedBigint,
} from './shared-columns.js';

export const collectionProducts = mysqlTable(
  'collection_products',
  {
    collectionId: createUnsignedBigint('collection_id').notNull(),
    productId: createUnsignedBigint('product_id').notNull(),
    storeId: createStoreIdColumn(),
    position: int('position', { unsigned: true }).notNull(),
    ...createTimestampColumns(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.productId] }),
    index('collection_products_store_id_collection_id_idx').on(
      table.storeId,
      table.collectionId,
    ),
    index('collection_products_store_id_product_id_idx').on(
      table.storeId,
      table.productId,
    ),
    foreignKey({
      name: 'collection_products_store_id_collection_id_fk',
      columns: [table.storeId, table.collectionId],
      foreignColumns: [collections.storeId, collections.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'collection_products_store_id_product_id_fk',
      columns: [table.storeId, table.productId],
      foreignColumns: [products.storeId, products.id],
    }).onDelete('cascade'),
  ],
);
