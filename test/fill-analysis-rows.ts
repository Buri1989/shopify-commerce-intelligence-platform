import type { Connection } from 'mysql2/promise';

export const MEASURED_STORE_ID = 1;

const STORE_COUNT = 10;
const ORDERS_PER_STORE = 10_000;
const PRODUCTS_PER_STORE = 2_000;
const BATCH_SIZE = 1_000;
const FIRST_ORDER_TIME = Date.parse('2025-01-01T00:00:00.000Z');
const ONE_HOUR = 3_600_000;
// Shares no factor with 100, so each status spreads evenly through the rows.
const SCATTER = 37;
const DELETED_EVERY = 20;
const ORDER_STATUSES = createStatusShares({
  paid: 70,
  pending: 20,
  refunded: 8,
  voided: 2,
});
const PRODUCT_STATUSES = createStatusShares({
  active: 80,
  draft: 15,
  archived: 5,
});
const INSERT_STORES =
  'INSERT INTO stores (id, shopify_id, shop_domain, name, currency, installed_at) VALUES ?';
const INSERT_ORDERS =
  'INSERT INTO orders (store_id, shopify_id, name, currency, total_price, financial_status, placed_at, placed_on) VALUES ?';
const INSERT_PRODUCTS =
  'INSERT INTO products (store_id, shopify_id, title, handle, status, deleted_at) VALUES ?';

export async function fillAnalysisRows(connection: Connection): Promise<void> {
  await connection.query(INSERT_STORES, [
    createRows(STORE_COUNT, createStoreRow),
  ]);
  await insertInBatches(
    connection,
    INSERT_ORDERS,
    createRows(STORE_COUNT * ORDERS_PER_STORE, createOrderRow),
  );
  await insertInBatches(
    connection,
    INSERT_PRODUCTS,
    createRows(STORE_COUNT * PRODUCTS_PER_STORE, createProductRow),
  );
  // Fresh statistics, so MySQL chooses from what is really in the tables.
  await connection.query('ANALYZE TABLE orders, products');
}

async function insertInBatches(
  connection: Connection,
  insert: string,
  rows: unknown[][],
): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    await connection.query(insert, [rows.slice(start, start + BATCH_SIZE)]);
  }
}

function createStoreRow(index: number): unknown[] {
  const id = index + 1;
  return [
    id,
    id,
    `analysis-${id}.example.com`,
    `Store ${id}`,
    'EUR',
    '2025-01-01 00:00:00.000',
  ];
}

function createOrderRow(row: number): unknown[] {
  const storeId = readStoreId(row);
  const index = readStoreRowIndex(row);
  const placedAt = new Date(FIRST_ORDER_TIME + index * ONE_HOUR).toISOString();
  return [
    storeId,
    index + 1,
    `#${index + 1}`,
    'EUR',
    '10.0000',
    pickStatus(ORDER_STATUSES, index),
    formatDateTime(placedAt),
    placedAt.slice(0, 10),
  ];
}

function createProductRow(row: number): unknown[] {
  const storeId = readStoreId(row);
  const index = readStoreRowIndex(row);
  return [
    storeId,
    index + 1,
    `Product ${index + 1}`,
    `product-${index + 1}`,
    pickStatus(PRODUCT_STATUSES, index),
    index % DELETED_EVERY === 0 ? '2025-06-01 00:00:00.000' : null,
  ];
}

// Rows take turns between stores, the way a real table mixes them. A block per
// store would flatter any plan that walks the primary key.
function readStoreId(row: number): number {
  return (row % STORE_COUNT) + 1;
}

function readStoreRowIndex(row: number): number {
  return Math.floor(row / STORE_COUNT);
}

function createStatusShares(shares: Record<string, number>): string[] {
  return Object.entries(shares).flatMap(([status, percent]) =>
    Array<string>(percent).fill(status),
  );
}

function pickStatus(statuses: string[], index: number): string {
  return statuses[(index * SCATTER) % statuses.length];
}

function createRows<Row>(
  count: number,
  createRow: (index: number) => Row,
): Row[] {
  return Array.from({ length: count }, (_, index) => createRow(index));
}

function formatDateTime(isoTime: string): string {
  return isoTime.replace('T', ' ').replace('Z', '');
}
