import { getTableName } from 'drizzle-orm';
import {
  readAppUpdatedColumns,
  readAutoIncrementColumns,
  readColumnNames,
  readColumnTypes,
  readDefaults,
  readForeignKeys,
  readIndexes,
  readNullableColumns,
  readPrimaryKey,
  readUniqueIndexes,
} from '../../../test/table-queries.js';
import { products } from './products.js';

describe('products', () => {
  it('is the products table', () => {
    expect(getTableName(products)).toBe('products');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(products)).toEqual([
      'id',
      'store_id',
      'shopify_id',
      'title',
      'handle',
      'vendor',
      'product_type',
      'status',
      'deleted_at',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(products)).toEqual({
      id: 'bigint unsigned',
      store_id: 'bigint unsigned',
      shopify_id: 'bigint unsigned',
      title: 'varchar(255)',
      handle: 'varchar(255)',
      vendor: 'varchar(255)',
      product_type: 'varchar(255)',
      status: 'varchar(32)',
      deleted_at: 'datetime(3)',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by its own number, handed out by MySQL', () => {
    expect(readPrimaryKey(products)).toEqual(['id']);
    expect(readAutoIncrementColumns(products)).toEqual(['id']);
  });

  it('keeps the Shopify id unique inside its store and offers the pair target', () => {
    expect(readUniqueIndexes(products)).toEqual([
      {
        name: 'products_store_id_shopify_id_unique',
        columns: ['store_id', 'shopify_id'],
      },
      { name: 'products_store_id_id_unique', columns: ['store_id', 'id'] },
    ]);
  });

  it('points at its store and goes with it', () => {
    expect(readForeignKeys(products)).toEqual([
      {
        name: 'products_store_id_fk',
        columns: ['store_id'],
        references: { table: 'stores', columns: ['id'] },
        onDelete: 'cascade',
      },
    ]);
  });

  it('has no other index', () => {
    expect(readIndexes(products)).toEqual([]);
  });

  it('allows null in vendor, product_type and the soft delete', () => {
    expect(readNullableColumns(products)).toEqual([
      'vendor',
      'product_type',
      'deleted_at',
    ]);
  });

  it('stamps created_at on the server and updated_at in the app', () => {
    expect(readDefaults(products)).toEqual({
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(products)).toEqual(['updated_at']);
  });
});
