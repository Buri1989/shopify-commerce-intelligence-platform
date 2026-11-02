import { drizzle } from 'drizzle-orm/mysql2';
import { createPool } from 'mysql2/promise';
import type { Database } from '../src/database/database.tokens.js';
import { MIGRATIONS_FOLDER } from '../src/database/migrations-folder.js';
import { runMigrations } from '../src/database/run-migrations.js';
import {
  connectAsRoot,
  createFreshDatabase,
  resolveRootLogin,
} from './migration-chain.js';

export interface RepositoryDatabase {
  readonly database: Database;
  close(): Promise<void>;
}

export async function createRepositoryDatabase(
  name: string,
): Promise<RepositoryDatabase> {
  await createFreshDatabase(name);
  const connection = await connectAsRoot(name);
  await runMigrations(connection, MIGRATIONS_FOLDER);
  await connection.end();
  const pool = createPool(resolveRootLogin(name));
  return { database: drizzle({ client: pool }), close: () => pool.end() };
}
