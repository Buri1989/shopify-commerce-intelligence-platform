import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DrizzleMySQLSnapshotJSON } from 'drizzle-kit/api';

export interface Journal {
  entries: { idx: number; tag: string }[];
}

export function readLatestSnapshot(
  migrationsFolder: string,
): DrizzleMySQLSnapshotJSON {
  const latest = readJournal(migrationsFolder).entries.at(-1);
  if (latest === undefined) {
    throw new Error(
      `${migrationsFolder} has a journal with no migration in it`,
    );
  }
  return readJson(snapshotPath(migrationsFolder, latest.idx));
}

export function readJournal(migrationsFolder: string): Journal {
  return readJson(join(migrationsFolder, 'meta', '_journal.json'));
}

function snapshotPath(migrationsFolder: string, idx: number): string {
  const number = String(idx).padStart(4, '0');
  return join(migrationsFolder, 'meta', `${number}_snapshot.json`);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
