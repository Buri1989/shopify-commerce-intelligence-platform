import type { RowDataPacket } from 'mysql2/promise';
import type { QueryConnection } from './query-connection.js';

export class MigrationLockHeldError extends Error {
  constructor(lockName: string) {
    super(
      `the lock "${lockName}" was not granted: another migration run holds it; run again when it has finished`,
    );
    this.name = 'MigrationLockHeldError';
  }
}

export function resolveMigrationLockName(databaseName: string): string {
  const lockName = `migrations:${databaseName}`;
  if (lockName.length > MAX_LOCK_NAME_LENGTH) {
    throw new Error(
      `the migration lock name "${lockName}" is ${lockName.length} characters long; MySQL allows ${MAX_LOCK_NAME_LENGTH}`,
    );
  }
  return lockName;
}

export async function acquireMigrationLock(
  connection: QueryConnection,
  lockName: string,
): Promise<void> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT GET_LOCK(?, ?) AS acquired',
    [lockName, WAIT_SECONDS],
  );
  if (rows[0]?.acquired !== LOCK_GRANTED) {
    throw new MigrationLockHeldError(lockName);
  }
}

export async function releaseMigrationLock(
  connection: QueryConnection,
  lockName: string,
): Promise<void> {
  await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
}

const MAX_LOCK_NAME_LENGTH = 64;
const WAIT_SECONDS = 0;
const LOCK_GRANTED = 1;
