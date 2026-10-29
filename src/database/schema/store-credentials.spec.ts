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
import { storeCredentials } from './store-credentials.js';

describe('store_credentials', () => {
  it('is the store_credentials table', () => {
    expect(getTableName(storeCredentials)).toBe('store_credentials');
  });

  it('has the columns of the design, in order', () => {
    expect(readColumnNames(storeCredentials)).toEqual([
      'store_id',
      'access_token',
      'scopes',
      'expires_at',
      'created_at',
      'updated_at',
    ]);
  });

  it('types every column as the design says', () => {
    expect(readColumnTypes(storeCredentials)).toEqual({
      store_id: 'bigint unsigned',
      access_token: 'varchar(255)',
      scopes: 'text',
      expires_at: 'datetime(3)',
      created_at: 'datetime(3)',
      updated_at: 'datetime(3)',
    });
  });

  it('is keyed by the store it belongs to, with no number of its own', () => {
    expect(readPrimaryKey(storeCredentials)).toEqual(['store_id']);
    expect(readAutoIncrementColumns(storeCredentials)).toEqual([]);
  });

  it('points at its store and goes with it', () => {
    expect(readForeignKeys(storeCredentials)).toEqual([
      {
        name: 'store_credentials_store_id_fk',
        columns: ['store_id'],
        references: { table: 'stores', columns: ['id'] },
        onDelete: 'cascade',
      },
    ]);
  });

  it('has no index beyond its key', () => {
    expect(readUniqueIndexes(storeCredentials)).toEqual([]);
    expect(readIndexes(storeCredentials)).toEqual([]);
  });

  it('allows null only in expires_at', () => {
    expect(readNullableColumns(storeCredentials)).toEqual(['expires_at']);
  });

  it('stamps created_at on the server and updated_at in the app', () => {
    expect(readDefaults(storeCredentials)).toEqual({
      created_at: 'CURRENT_TIMESTAMP(3)',
      updated_at: 'CURRENT_TIMESTAMP(3)',
    });
    expect(readAppUpdatedColumns(storeCredentials)).toEqual(['updated_at']);
  });
});
