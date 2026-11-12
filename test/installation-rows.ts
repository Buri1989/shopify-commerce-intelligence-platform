import { eq } from 'drizzle-orm';
import type { Database } from '../src/database/database.tokens.js';
import { storeCredentials, stores } from '../src/database/schema/index.js';

interface InstallationRows {
  readonly store: typeof stores.$inferSelect;
  readonly credentials: typeof storeCredentials.$inferSelect | null;
}

export async function readInstallationRows(
  database: Database,
  shopifyId: number,
): Promise<InstallationRows | undefined> {
  const [rows] = await database
    .select({ store: stores, credentials: storeCredentials })
    .from(stores)
    .leftJoin(storeCredentials, eq(storeCredentials.storeId, stores.id))
    .where(eq(stores.shopifyId, shopifyId));
  return rows;
}
