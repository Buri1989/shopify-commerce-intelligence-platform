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
import { orderItems } from './order-items.js';

describe('order_items', () => {
  it('is the order_items table', () => {
    expect(getTableName(orderItems)).toBe('order_items');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(orderItems)).toEqual([
      'id',
      'store_id',
      'order_id',
      'product_id',
      'variant_id',
      'shopify_id',
      'title',
      'variant_title',
      'sku',
      'quantity',
      'price',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(orderItems)).toEqual({
      id: 'bigint unsigned',
      store_id: 'bigint unsigned',
      order_id: 'bigint unsigned',
      product_id: 'bigint unsigned',
      variant_id: 'bigint unsigned',
      shopify_id: 'bigint unsigned',
      title: 'varchar(255)',
      variant_title: 'varchar(255)',
      sku: 'varchar(255)',
      quantity: 'int unsigned',
      price: 'decimal(19,4)',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by its own number, handed out by MySQL', () => {
    expect(readPrimaryKey(orderItems)).toEqual(['id']);
    expect(readAutoIncrementColumns(orderItems)).toEqual(['id']);
  });

  it('keeps the Shopify line item id unique inside its store', () => {
    expect(readUniqueIndexes(orderItems)).toEqual([
      {
        name: 'order_items_store_id_shopify_id_unique',
        columns: ['store_id', 'shopify_id'],
      },
    ]);
  });

  it('goes with its order and keeps its row when the product or variant goes', () => {
    expect(readForeignKeys(orderItems)).toEqual([
      {
        name: 'order_items_store_id_order_id_fk',
        columns: ['store_id', 'order_id'],
        references: { table: 'orders', columns: ['store_id', 'id'] },
        onDelete: 'cascade',
      },
      {
        name: 'order_items_product_id_fk',
        columns: ['product_id'],
        references: { table: 'products', columns: ['id'] },
        onDelete: 'set null',
      },
      {
        name: 'order_items_variant_id_fk',
        columns: ['variant_id'],
        references: { table: 'product_variants', columns: ['id'] },
        onDelete: 'set null',
      },
    ]);
  });

  it('backs each pointer with an index', () => {
    expect(readIndexes(orderItems)).toEqual([
      {
        name: 'order_items_store_id_order_id_idx',
        columns: ['store_id', 'order_id'],
      },
      { name: 'order_items_product_id_idx', columns: ['product_id'] },
      { name: 'order_items_variant_id_idx', columns: ['variant_id'] },
    ]);
  });

  it('allows null in the two emptied pointers, variant_title and sku', () => {
    expect(readNullableColumns(orderItems)).toEqual([
      'product_id',
      'variant_id',
      'variant_title',
      'sku',
    ]);
  });

  it('stamps created_at on the server and updated_at in the app', () => {
    expect(readDefaults(orderItems)).toEqual({
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(orderItems)).toEqual(['updated_at']);
  });
});
