import { eq } from 'drizzle-orm';
import type { Database } from '../src/database/database.tokens.js';
import { storeCredentials } from '../src/database/schema/index.js';

type CredentialsRow = typeof storeCredentials.$inferSelect;

export async function readCredentialsRow(
  database: Database,
  storeId: number,
): Promise<CredentialsRow | undefined> {
  const [row] = await database
    .select()
    .from(storeCredentials)
    .where(eq(storeCredentials.storeId, storeId));
  return row;
}
