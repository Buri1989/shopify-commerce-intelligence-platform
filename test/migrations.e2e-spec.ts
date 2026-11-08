import { getTableName } from 'drizzle-orm';
import type { Connection } from 'mysql2/promise';
import {
  countAppliedMigrations,
  MIGRATIONS_TABLE,
} from '../src/database/count-applied-migrations.js';
import { MigrationLockHeldError } from '../src/database/migration-lock.js';
import { MIGRATIONS_FOLDER } from '../src/database/migrations-folder.js';
import { runMigrations } from '../src/database/run-migrations.js';
import * as schema from '../src/database/schema/index.js';
import {
  readColumnNullability,
  readIndexColumns,
  readTableNames,
} from './information-schema.js';
import {
  connectAsRoot,
  createFreshDatabase,
  holdMigrationLock,
  writeChainPrefix,
} from './migration-chain.js';
import { insertStoreWithOrders, readOrderDays } from './order-rows.js';

const DATABASE_NAME = 'migrations_e2e';
const CHAIN_LENGTH = 10;
const FILES_BEFORE_PLACED_ON = 2;
const EXPECTED_TABLES = [
  MIGRATIONS_TABLE,
  ...Object.values(schema).map(getTableName),
].sort();

describe('the migration chain (e2e)', () => {
  let connection: Connection;

  beforeEach(async () => {
    await createFreshDatabase(DATABASE_NAME);
    connection = await connectAsRoot(DATABASE_NAME);
  });

  afterEach(async () => {
    await connection.end();
  });

  it('builds every table from nothing and records every file', async () => {
    const applied = await runMigrations(connection, MIGRATIONS_FOLDER);

    expect(applied).toBe(CHAIN_LENGTH);
    expect(await countAppliedMigrations(connection)).toBe(CHAIN_LENGTH);
    expect(await readTableNames(connection)).toEqual(EXPECTED_TABLES);
  });

  it.each([
    {
      table: 'orders',
      index: 'orders_store_id_placed_at_idx',
      columns: ['store_id', 'placed_at'],
    },
    {
      table: 'orders',
      index: 'orders_store_id_financial_status_placed_at_idx',
      columns: ['store_id', 'financial_status', 'placed_at'],
    },
    {
      table: 'products',
      index: 'products_store_id_status_idx',
      columns: ['store_id', 'status'],
    },
  ])('builds $index', async ({ table, index, columns }) => {
    await runMigrations(connection, MIGRATIONS_FOLDER);

    expect(await readIndexColumns(connection, table, index)).toEqual(columns);
  });

  it('fills placed_on from placed_at for the orders that exist, then requires it', async () => {
    await runMigrations(
      connection,
      await writeChainPrefix(MIGRATIONS_FOLDER, FILES_BEFORE_PLACED_ON),
    );
    await insertStoreWithOrders(connection, [
      '2026-03-01 23:59:59.000',
      '2026-03-02 00:00:00.000',
    ]);

    const applied = await runMigrations(connection, MIGRATIONS_FOLDER);

    expect(applied).toBe(CHAIN_LENGTH - FILES_BEFORE_PLACED_ON);
    expect(await readOrderDays(connection)).toEqual([
      '2026-03-01',
      '2026-03-02',
    ]);
    expect(await readColumnNullability(connection, 'orders', 'placed_on')).toBe(
      'NO',
    );
  });

  it.each(['expires_at', 'refresh_token', 'refresh_token_expires_at'])(
    'requires store_credentials.%s',
    async (column) => {
      await runMigrations(connection, MIGRATIONS_FOLDER);

      expect(
        await readColumnNullability(connection, 'store_credentials', column),
      ).toBe('NO');
    },
  );

  it('stops at once when another run holds the lock and changes nothing', async () => {
    const otherRun = await holdMigrationLock(DATABASE_NAME);
    try {
      await expect(
        runMigrations(connection, MIGRATIONS_FOLDER),
      ).rejects.toThrow(MigrationLockHeldError);
      expect(await countAppliedMigrations(connection)).toBe(0);
    } finally {
      await otherRun.release();
    }
  });

  it('releases the lock when it is done, so a run from another connection proceeds', async () => {
    await runMigrations(connection, MIGRATIONS_FOLDER);
    const laterRun = await connectAsRoot(DATABASE_NAME);
    try {
      expect(await runMigrations(laterRun, MIGRATIONS_FOLDER)).toBe(0);
    } finally {
      await laterRun.end();
    }
  });

  it('applies nothing on a second run', async () => {
    await runMigrations(connection, MIGRATIONS_FOLDER);

    const applied = await runMigrations(connection, MIGRATIONS_FOLDER);

    expect(applied).toBe(0);
    expect(await countAppliedMigrations(connection)).toBe(CHAIN_LENGTH);
  });
});
