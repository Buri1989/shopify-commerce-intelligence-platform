import { copyFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Connection, createConnection } from 'mysql2/promise';
import { inject } from 'vitest';
import {
  acquireMigrationLock,
  resolveMigrationLockName,
} from '../src/database/migration-lock.js';
import { readJournal } from './migration-journal.js';

export async function createFreshDatabase(name: string): Promise<void> {
  const connection = await connectAsRoot();
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await connection.query(`CREATE DATABASE \`${name}\``);
  } finally {
    await connection.end();
  }
}

export function connectAsRoot(database?: string): Promise<Connection> {
  const { host, port, rootPassword } = inject('database');
  return createConnection({
    host,
    port,
    user: 'root',
    password: rootPassword,
    database,
  });
}

export async function holdMigrationLock(database: string): Promise<Connection> {
  const connection = await connectAsRoot(database);
  await acquireMigrationLock(connection, resolveMigrationLockName(database));
  return connection;
}

export async function writeChainPrefix(
  migrationsFolder: string,
  fileCount: number,
): Promise<string> {
  const prefixFolder = await mkdtemp(join(tmpdir(), 'migration-chain-'));
  const journal = readJournal(migrationsFolder);
  const entries = journal.entries.slice(0, fileCount);
  await mkdir(join(prefixFolder, 'meta'));
  await writeFile(
    join(prefixFolder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries }),
  );
  for (const { tag } of entries) {
    await copyFile(
      join(migrationsFolder, `${tag}.sql`),
      join(prefixFolder, `${tag}.sql`),
    );
  }
  return prefixFolder;
}
