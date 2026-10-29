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
import { collectionProducts } from './collection-products.js';

describe('collection_products', () => {
  it('is the collection_products table', () => {
    expect(getTableName(collectionProducts)).toBe('collection_products');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(collectionProducts)).toEqual([
      'collection_id',
      'product_id',
      'store_id',
      'position',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(collectionProducts)).toEqual({
      collection_id: 'bigint unsigned',
      product_id: 'bigint unsigned',
      store_id: 'bigint unsigned',
      position: 'int unsigned',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by the pair, with no number of its own', () => {
    expect(readPrimaryKey(collectionProducts)).toEqual([
      'collection_id',
      'product_id',
    ]);
    expect(readAutoIncrementColumns(collectionProducts)).toEqual([]);
  });

  it('points at its collection and its product through the store pair and goes with either', () => {
    expect(readForeignKeys(collectionProducts)).toEqual([
      {
        name: 'collection_products_store_id_collection_id_fk',
        columns: ['store_id', 'collection_id'],
        references: { table: 'collections', columns: ['store_id', 'id'] },
        onDelete: 'cascade',
      },
      {
        name: 'collection_products_store_id_product_id_fk',
        columns: ['store_id', 'product_id'],
        references: { table: 'products', columns: ['store_id', 'id'] },
        onDelete: 'cascade',
      },
    ]);
  });

  it('backs each pair pointer with an index', () => {
    expect(readIndexes(collectionProducts)).toEqual([
      {
        name: 'collection_products_store_id_collection_id_idx',
        columns: ['store_id', 'collection_id'],
      },
      {
        name: 'collection_products_store_id_product_id_idx',
        columns: ['store_id', 'product_id'],
      },
    ]);
  });

  it('has no unique rule beyond its key', () => {
    expect(readUniqueIndexes(collectionProducts)).toEqual([]);
  });

  it('allows null nowhere', () => {
    expect(readNullableColumns(collectionProducts)).toEqual([]);
  });

  it('stamps created_at on the server and updated_at in the app', () => {
    expect(readDefaults(collectionProducts)).toEqual({
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(collectionProducts)).toEqual(['updated_at']);
  });
});
