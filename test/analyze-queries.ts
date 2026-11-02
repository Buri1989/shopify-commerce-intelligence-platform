import { MySqlContainer } from '@testcontainers/mysql';
import type { Logger } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/mysql2';
import {
  type Connection,
  createConnection,
  type RowDataPacket,
} from 'mysql2/promise';
import { MIGRATIONS_FOLDER } from '../src/database/migrations-folder.js';
import type { Page } from '../src/database/page.js';
import { runMigrations } from '../src/database/run-migrations.js';
import {
  type OrderCursor,
  type OrderFilters,
  OrdersRepository,
} from '../src/orders/orders.repository.js';
import {
  type ProductCursor,
  type ProductFilters,
  ProductsRepository,
} from '../src/products/products.repository.js';
import { fillAnalysisRows, MEASURED_STORE_ID } from './fill-analysis-rows.js';
import { MYSQL_IMAGE } from './mysql-image.js';

const DATABASE_NAME = 'query_analysis';
const ORDERS_INDEX = 'orders_store_id_financial_status_placed_at_idx';
const PRODUCTS_INDEX = 'products_store_id_status_idx';
const PLACED_FROM = new Date('2025-02-01T00:00:00.000Z');
const PLACED_BEFORE = new Date('2025-10-01T00:00:00.000Z');

type RecordedQuery = { readonly sql: string; readonly params: unknown[] };
type ListCase = {
  readonly label: string;
  readonly table: string;
  readonly index: string;
};
type ReadPage<Row, Cursor> = (
  cursor: Cursor | null,
) => Promise<Page<Row, Cursor>>;

interface Analysis {
  readonly connection: Connection;
  readonly recorder: QueryRecorder;
  readonly orders: OrdersRepository;
  readonly products: ProductsRepository;
}

// Records what the repository really sends, so the plans below can never
// measure a hand-written copy of its query.
class QueryRecorder implements Logger {
  lastQuery: RecordedQuery = { sql: '', params: [] };

  logQuery(sql: string, params: unknown[]): void {
    this.lastQuery = { sql, params };
  }
}

async function main(): Promise<void> {
  const container = await new MySqlContainer(MYSQL_IMAGE)
    .withDatabase(DATABASE_NAME)
    .start();
  const connection = await createConnection({
    host: container.getHost(),
    port: container.getPort(),
    user: 'root',
    password: container.getRootPassword(),
    database: DATABASE_NAME,
  });
  try {
    await runMigrations(connection, MIGRATIONS_FOLDER);
    await fillAnalysisRows(connection);
    await analyzeLists(connection);
  } finally {
    await connection.end();
    await container.stop();
  }
}

async function analyzeLists(connection: Connection): Promise<void> {
  const recorder = new QueryRecorder();
  const database = drizzle({ client: connection, logger: recorder });
  const analysis = {
    connection,
    recorder,
    orders: new OrdersRepository(database),
    products: new ProductsRepository(database),
  };
  await analyzeOrders(analysis, 'orders, paid (70%)', {
    financialStatus: 'paid',
  });
  await analyzeOrders(analysis, 'orders, voided (2%)', {
    financialStatus: 'voided',
  });
  await analyzeOrders(analysis, 'orders, voided (2%) in a date range', {
    financialStatus: 'voided',
    placedFrom: PLACED_FROM,
    placedBefore: PLACED_BEFORE,
  });
  await analyzeProducts(analysis, 'products, active (80%)', {
    status: 'active',
  });
  await analyzeProducts(analysis, 'products, archived (5%)', {
    status: 'archived',
  });
}

function analyzeOrders(
  analysis: Analysis,
  label: string,
  filters: OrderFilters,
): Promise<void> {
  return analyzeList(
    analysis,
    { label, table: 'orders', index: ORDERS_INDEX },
    (cursor: OrderCursor | null) =>
      analysis.orders.list(MEASURED_STORE_ID, filters, cursor),
  );
}

function analyzeProducts(
  analysis: Analysis,
  label: string,
  filters: ProductFilters,
): Promise<void> {
  return analyzeList(
    analysis,
    { label, table: 'products', index: PRODUCTS_INDEX },
    (cursor: ProductCursor | null) =>
      analysis.products.list(MEASURED_STORE_ID, filters, cursor),
  );
}

async function analyzeList<Row, Cursor>(
  analysis: Analysis,
  listCase: ListCase,
  readPage: ReadPage<Row, Cursor>,
): Promise<void> {
  const lastCursor = await findLastCursor(readPage);
  await analyzePage(
    analysis,
    { ...listCase, label: `${listCase.label}, first page` },
    () => readPage(null),
  );
  await analyzePage(
    analysis,
    { ...listCase, label: `${listCase.label}, last page` },
    () => readPage(lastCursor),
  );
}

async function findLastCursor<Row, Cursor>(
  readPage: ReadPage<Row, Cursor>,
): Promise<Cursor | null> {
  let lastCursor: Cursor | null = null;
  let { nextCursor } = await readPage(null);
  while (nextCursor !== null) {
    lastCursor = nextCursor;
    ({ nextCursor } = await readPage(lastCursor));
  }
  return lastCursor;
}

async function analyzePage(
  { connection, recorder }: Analysis,
  { label, table, index }: ListCase,
  readPage: () => Promise<unknown>,
): Promise<void> {
  await readPage();
  const { sql, params } = recorder.lastQuery;
  printPlan(
    `${label}, as MySQL chooses`,
    await explain(connection, sql, params),
  );
  printPlan(
    `${label}, without the new index`,
    await explain(connection, ignoreIndex(sql, table, index), params),
  );
}

async function explain(
  connection: Connection,
  sql: string,
  params: unknown[],
): Promise<string> {
  // The first run warms the cache, so both sides of a comparison start equal.
  await connection.query(sql, params);
  const [rows] = await connection.query<RowDataPacket[]>(
    `EXPLAIN ANALYZE ${sql}`,
    params,
  );
  return String(rows[0].EXPLAIN);
}

function ignoreIndex(sql: string, table: string, index: string): string {
  const tableClause = `from \`${table}\``;
  if (!sql.includes(tableClause)) {
    throw new Error(`expected ${tableClause} in the recorded query: ${sql}`);
  }
  return sql.replace(tableClause, `${tableClause} IGNORE INDEX (\`${index}\`)`);
}

function printPlan(label: string, plan: string): void {
  console.log(`\n--- ${label}\n${plan}`);
}

await main();
