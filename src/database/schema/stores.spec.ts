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
import { stores } from './stores.js';

describe('stores', () => {
  it('is the stores table', () => {
    expect(getTableName(stores)).toBe('stores');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(stores)).toEqual([
      'id',
      'shopify_id',
      'shop_domain',
      'name',
      'currency',
      'installed_at',
      'uninstalled_at',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(stores)).toEqual({
      id: 'bigint unsigned',
      shopify_id: 'bigint unsigned',
      shop_domain: 'varchar(255)',
      name: 'varchar(255)',
      currency: 'char(3)',
      installed_at: 'datetime(3)',
      uninstalled_at: 'datetime(3)',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by its own number, handed out by MySQL', () => {
    expect(readPrimaryKey(stores)).toEqual(['id']);
    expect(readAutoIncrementColumns(stores)).toEqual(['id']);
  });

  it('keeps the Shopify id and the shop domain unique on their own', () => {
    expect(readUniqueIndexes(stores)).toEqual([
      { name: 'stores_shopify_id_unique', columns: ['shopify_id'] },
      { name: 'stores_shop_domain_unique', columns: ['shop_domain'] },
    ]);
  });

  it('has no other index and points at nothing', () => {
    expect(readIndexes(stores)).toEqual([]);
    expect(readForeignKeys(stores)).toEqual([]);
  });

  it('allows null only in uninstalled_at', () => {
    expect(readNullableColumns(stores)).toEqual(['uninstalled_at']);
  });

  it('stamps created_at on the server and updated_at in the app', () => {
    expect(readDefaults(stores)).toEqual({
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(stores)).toEqual(['updated_at']);
  });
});
