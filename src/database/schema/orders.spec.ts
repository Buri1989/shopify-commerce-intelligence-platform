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
import { orders } from './orders.js';

describe('orders', () => {
  it('is the orders table', () => {
    expect(getTableName(orders)).toBe('orders');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(orders)).toEqual([
      'id',
      'store_id',
      'shopify_id',
      'name',
      'currency',
      'total_price',
      'financial_status',
      'fulfillment_status',
      'placed_at',
      'cancelled_at',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(orders)).toEqual({
      id: 'bigint unsigned',
      store_id: 'bigint unsigned',
      shopify_id: 'bigint unsigned',
      name: 'varchar(255)',
      currency: 'char(3)',
      total_price: 'decimal(19,4)',
      financial_status: 'varchar(32)',
      fulfillment_status: 'varchar(32)',
      placed_at: 'datetime(3)',
      cancelled_at: 'datetime(3)',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by its own number, handed out by MySQL', () => {
    expect(readPrimaryKey(orders)).toEqual(['id']);
    expect(readAutoIncrementColumns(orders)).toEqual(['id']);
  });

  it('keeps the Shopify id unique inside its store and offers the pair target', () => {
    expect(readUniqueIndexes(orders)).toEqual([
      {
        name: 'orders_store_id_shopify_id_unique',
        columns: ['store_id', 'shopify_id'],
      },
      { name: 'orders_store_id_id_unique', columns: ['store_id', 'id'] },
    ]);
  });

  it('points at its store and goes with it', () => {
    expect(readForeignKeys(orders)).toEqual([
      {
        name: 'orders_store_id_fk',
        columns: ['store_id'],
        references: { table: 'stores', columns: ['id'] },
        onDelete: 'cascade',
      },
    ]);
  });

  it('has no other index', () => {
    expect(readIndexes(orders)).toEqual([]);
  });

  it('allows null in fulfillment_status and cancelled_at', () => {
    expect(readNullableColumns(orders)).toEqual([
      'fulfillment_status',
      'cancelled_at',
    ]);
  });

  it('stamps created_at on the server and updated_at in the app', () => {
    expect(readDefaults(orders)).toEqual({
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(orders)).toEqual(['updated_at']);
  });
});
