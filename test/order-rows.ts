import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { QueryConnection } from '../src/database/query-connection.js';

export async function insertStoreWithOrders(
  connection: QueryConnection,
  orderTimes: readonly string[],
): Promise<void> {
  const [store] = await connection.query<ResultSetHeader>(
    "INSERT INTO stores (shopify_id, shop_domain, name, currency, installed_at) VALUES (1, 'shop.example.com', 'Shop', 'EUR', '2026-01-01 00:00:00.000')",
  );
  for (const [index, placedAt] of orderTimes.entries()) {
    await connection.query(
      "INSERT INTO orders (store_id, shopify_id, name, currency, total_price, financial_status, placed_at) VALUES (?, ?, ?, 'EUR', '10.0000', 'paid', ?)",
      [store.insertId, index + 1, `#${index + 1}`, placedAt],
    );
  }
}

export async function readOrderDays(
  connection: QueryConnection,
): Promise<string[]> {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT DATE_FORMAT(placed_on, '%Y-%m-%d') AS day FROM orders ORDER BY id",
  );
  return rows.map((row) => String(row.day));
}
