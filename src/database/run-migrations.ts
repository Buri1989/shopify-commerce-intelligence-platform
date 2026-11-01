import { drizzle } from 'drizzle-orm/mysql2';
import { migrate } from 'drizzle-orm/mysql2/migrator';
import type { Connection } from 'mysql2/promise';
import {
  countAppliedMigrations,
  MIGRATIONS_TABLE,
} from './count-applied-migrations.js';
import {
  acquireMigrationLock,
  releaseMigrationLock,
  resolveMigrationLockName,
} from './migration-lock.js';

export async function runMigrations(
  connection: Connection,
  migrationsFolder: string,
): Promise<number> {
  const lockName = resolveMigrationLockName(readDatabaseName(connection));
  await acquireMigrationLock(connection, lockName);
  try {
    const appliedBefore = await countAppliedMigrations(connection);
    await migrate(drizzle({ client: connection }), {
      migrationsFolder,
      migrationsTable: MIGRATIONS_TABLE,
    });
    return (await countAppliedMigrations(connection)) - appliedBefore;
  } finally {
    await releaseMigrationLock(connection, lockName);
  }
}

function readDatabaseName(connection: Connection): string {
  const { database } = connection.config;
  if (database === undefined) {
    throw new Error('the migration connection names no database; set DB_NAME');
  }
  return database;
}
