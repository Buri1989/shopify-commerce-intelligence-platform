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
import { webhookRecords } from './webhook-records.js';

describe('webhook_records', () => {
  it('is the webhook_records table', () => {
    expect(getTableName(webhookRecords)).toBe('webhook_records');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(webhookRecords)).toEqual([
      'id',
      'store_id',
      'delivery_id',
      'topic',
      'subject_shopify_id',
      'status',
      'received_at',
      'processed_at',
      'attempts',
      'last_error',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(webhookRecords)).toEqual({
      id: 'bigint unsigned',
      store_id: 'bigint unsigned',
      delivery_id: 'varchar(64)',
      topic: 'varchar(64)',
      subject_shopify_id: 'bigint unsigned',
      status: "enum('received','processed','failed')",
      received_at: 'datetime(3)',
      processed_at: 'datetime(3)',
      attempts: 'int unsigned',
      last_error: 'text',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by its own number, handed out by MySQL', () => {
    expect(readPrimaryKey(webhookRecords)).toEqual(['id']);
    expect(readAutoIncrementColumns(webhookRecords)).toEqual(['id']);
  });

  it('keeps the delivery id unique inside its store', () => {
    expect(readUniqueIndexes(webhookRecords)).toEqual([
      {
        name: 'webhook_records_store_id_delivery_id_unique',
        columns: ['store_id', 'delivery_id'],
      },
    ]);
  });

  it('points at its store and goes with it', () => {
    expect(readForeignKeys(webhookRecords)).toEqual([
      {
        name: 'webhook_records_store_id_fk',
        columns: ['store_id'],
        references: { table: 'stores', columns: ['id'] },
        onDelete: 'cascade',
      },
    ]);
  });

  it('has no other index', () => {
    expect(readIndexes(webhookRecords)).toEqual([]);
  });

  it('allows null in subject_shopify_id, processed_at and last_error', () => {
    expect(readNullableColumns(webhookRecords)).toEqual([
      'subject_shopify_id',
      'processed_at',
      'last_error',
    ]);
  });

  it('starts attempts at zero and stamps created_at on the server, updated_at in the app', () => {
    expect(readDefaults(webhookRecords)).toEqual({
      attempts: '0',
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(webhookRecords)).toEqual(['updated_at']);
  });
});
