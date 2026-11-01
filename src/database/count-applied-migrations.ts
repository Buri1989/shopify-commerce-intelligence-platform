import type { RowDataPacket } from 'mysql2/promise';
import type { QueryConnection } from './query-connection.js';

export const MIGRATIONS_TABLE = '__drizzle_migrations';

export async function countAppliedMigrations(
  connection: QueryConnection,
): Promise<number> {
  if (!(await hasMigrationsTable(connection))) {
    return 0;
  }
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS applied FROM ${MIGRATIONS_TABLE}`,
  );
  return Number(rows[0]?.applied);
}

async function hasMigrationsTable(
  connection: QueryConnection,
): Promise<boolean> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [MIGRATIONS_TABLE],
  );
  return rows.length > 0;
}
