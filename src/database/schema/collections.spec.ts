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
import { collections } from './collections.js';

describe('collections', () => {
  it('is the collections table', () => {
    expect(getTableName(collections)).toBe('collections');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(collections)).toEqual([
      'id',
      'store_id',
      'shopify_id',
      'title',
      'handle',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(collections)).toEqual({
      id: 'bigint unsigned',
      store_id: 'bigint unsigned',
      shopify_id: 'bigint unsigned',
      title: 'varchar(255)',
      handle: 'varchar(255)',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by its own number, handed out by MySQL', () => {
    expect(readPrimaryKey(collections)).toEqual(['id']);
    expect(readAutoIncrementColumns(collections)).toEqual(['id']);
  });

  it('keeps the Shopify id unique inside its store and offers the pair target', () => {
    expect(readUniqueIndexes(collections)).toEqual([
      {
        name: 'collections_store_id_shopify_id_unique',
        columns: ['store_id', 'shopify_id'],
      },
      { name: 'collections_store_id_id_unique', columns: ['store_id', 'id'] },
    ]);
  });

  it('points at its store and goes with it', () => {
    expect(readForeignKeys(collections)).toEqual([
      {
        name: 'collections_store_id_fk',
        columns: ['store_id'],
        references: { table: 'stores', columns: ['id'] },
        onDelete: 'cascade',
      },
    ]);
  });

  it('has no other index', () => {
    expect(readIndexes(collections)).toEqual([]);
  });

  it('allows null nowhere', () => {
    expect(readNullableColumns(collections)).toEqual([]);
  });

  it('stamps created_at on the server and updated_at in the app', () => {
    expect(readDefaults(collections)).toEqual({
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(collections)).toEqual(['updated_at']);
  });
});
