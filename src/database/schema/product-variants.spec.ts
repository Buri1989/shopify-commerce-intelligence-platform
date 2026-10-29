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
import { productVariants } from './product-variants.js';

describe('product_variants', () => {
  it('is the product_variants table', () => {
    expect(getTableName(productVariants)).toBe('product_variants');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(productVariants)).toEqual([
      'id',
      'store_id',
      'shopify_id',
      'product_id',
      'title',
      'sku',
      'price',
      'position',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(productVariants)).toEqual({
      id: 'bigint unsigned',
      store_id: 'bigint unsigned',
      shopify_id: 'bigint unsigned',
      product_id: 'bigint unsigned',
      title: 'varchar(255)',
      sku: 'varchar(255)',
      price: 'decimal(19,4)',
      position: 'int unsigned',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by its own number, handed out by MySQL', () => {
    expect(readPrimaryKey(productVariants)).toEqual(['id']);
    expect(readAutoIncrementColumns(productVariants)).toEqual(['id']);
  });

  it('keeps the Shopify id unique inside its store and offers the pair target', () => {
    expect(readUniqueIndexes(productVariants)).toEqual([
      {
        name: 'product_variants_store_id_shopify_id_unique',
        columns: ['store_id', 'shopify_id'],
      },
      {
        name: 'product_variants_store_id_id_unique',
        columns: ['store_id', 'id'],
      },
    ]);
  });

  it('points at its product through the store pair and goes with it', () => {
    expect(readForeignKeys(productVariants)).toEqual([
      {
        name: 'product_variants_store_id_product_id_fk',
        columns: ['store_id', 'product_id'],
        references: { table: 'products', columns: ['store_id', 'id'] },
        onDelete: 'cascade',
      },
    ]);
  });

  it('backs the pair pointer with an index', () => {
    expect(readIndexes(productVariants)).toEqual([
      {
        name: 'product_variants_store_id_product_id_idx',
        columns: ['store_id', 'product_id'],
      },
    ]);
  });

  it('allows null only in sku', () => {
    expect(readNullableColumns(productVariants)).toEqual(['sku']);
  });

  it('stamps created_at on the server and updated_at in the app', () => {
    expect(readDefaults(productVariants)).toEqual({
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(productVariants)).toEqual(['updated_at']);
  });
});
