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
import { storeAnalytics } from './store-analytics.js';

describe('store_analytics', () => {
  it('is the store_analytics table', () => {
    expect(getTableName(storeAnalytics)).toBe('store_analytics');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(storeAnalytics)).toEqual([
      'store_id',
      'day',
      'orders_count',
      'revenue',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(storeAnalytics)).toEqual({
      store_id: 'bigint unsigned',
      day: 'date',
      orders_count: 'int unsigned',
      revenue: 'decimal(19,4)',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by the store and the day, with no number of its own', () => {
    expect(readPrimaryKey(storeAnalytics)).toEqual(['store_id', 'day']);
    expect(readAutoIncrementColumns(storeAnalytics)).toEqual([]);
  });

  it('points at its store and goes with it', () => {
    expect(readForeignKeys(storeAnalytics)).toEqual([
      {
        name: 'store_analytics_store_id_fk',
        columns: ['store_id'],
        references: { table: 'stores', columns: ['id'] },
        onDelete: 'cascade',
      },
    ]);
  });

  it('has no index beyond its key', () => {
    expect(readUniqueIndexes(storeAnalytics)).toEqual([]);
    expect(readIndexes(storeAnalytics)).toEqual([]);
  });

  it('allows null nowhere', () => {
    expect(readNullableColumns(storeAnalytics)).toEqual([]);
  });

  it('starts both numbers at zero and stamps created_at on the server, updated_at in the app', () => {
    expect(readDefaults(storeAnalytics)).toEqual({
      orders_count: '0',
      revenue: '0',
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(storeAnalytics)).toEqual(['updated_at']);
  });
});
