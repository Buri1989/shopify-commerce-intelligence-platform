import type { RowDataPacket } from 'mysql2/promise';
import type { QueryConnection } from '../src/database/query-connection.js';

export async function readTableNames(
  connection: QueryConnection,
): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  return readNames(rows).sort();
}

export async function readIndexColumns(
  connection: QueryConnection,
  table: string,
  index: string,
): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT column_name AS name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? ORDER BY seq_in_index',
    [table, index],
  );
  return readNames(rows);
}

export async function readColumnNullability(
  connection: QueryConnection,
  table: string,
  column: string,
): Promise<string> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
    [table, column],
  );
  return String(rows[0]?.nullable);
}

function readNames(rows: RowDataPacket[]): string[] {
  return rows.map((row) => String(row.name));
}
