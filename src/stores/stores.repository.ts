import { Inject, Injectable } from '@nestjs/common';
import { and, eq, getTableColumns } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.tokens.js';
import type { GeneratedColumns } from '../database/generated-columns.js';
import { refuseDuplicateRow } from '../database/refuse-duplicate-row.js';
import { requireRowFound } from '../database/require-row-found.js';
import { storeCredentials, stores } from '../database/schema/index.js';

export type Store = typeof stores.$inferSelect;
export type NewStore = Omit<typeof stores.$inferInsert, GeneratedColumns>;
export type StoreChanges = Partial<Omit<NewStore, 'shopifyId'>>;
export type InstalledStore = Omit<NewStore, 'uninstalledAt'>;
export type NewCredentials = Omit<
  typeof storeCredentials.$inferInsert,
  GeneratedColumns | 'storeId'
>;
export interface Installation {
  readonly store: InstalledStore;
  readonly credentials: NewCredentials;
}
export interface SavedInstallation {
  readonly storeId: number;
  readonly reinstalled: boolean;
}
export type StoreCredentials = typeof storeCredentials.$inferSelect &
  Pick<Store, 'shopDomain'>;
export type StoreCredentialsRefresher = (
  locked: StoreCredentials,
) => Promise<NewCredentials | undefined>;

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Reader = Pick<Database, 'select'>;

@Injectable()
export class StoresRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(store: NewStore): Promise<number> {
    const [{ id }] = await refuseDuplicateRow(() =>
      this.database.insert(stores).values(store).$returningId(),
    );
    return id;
  }

  async findById(storeId: number): Promise<Store | undefined> {
    const [store] = await this.database
      .select()
      .from(stores)
      .where(eq(stores.id, storeId));
    return store;
  }

  async update(storeId: number, changes: StoreChanges): Promise<void> {
    const result = await refuseDuplicateRow(() =>
      this.database.update(stores).set(changes).where(eq(stores.id, storeId)),
    );
    requireRowFound(result);
  }

  async delete(storeId: number): Promise<void> {
    const result = await this.database
      .delete(stores)
      .where(eq(stores.id, storeId));
    requireRowFound(result);
  }

  installStore({
    store,
    credentials,
  }: Installation): Promise<SavedInstallation> {
    return refuseDuplicateRow(() =>
      this.database.transaction(async (transaction) => {
        const saved = await saveStore(transaction, store);
        const keys = { ...credentials, storeId: saved.storeId };
        await transaction
          .insert(storeCredentials)
          .values(keys)
          .onDuplicateKeyUpdate({ set: keys });
        return saved;
      }),
    );
  }

  uninstallStore(storeId: number, uninstalledAt: Date): Promise<void> {
    return this.database.transaction(async (transaction) => {
      const result = await transaction
        .update(stores)
        .set({ uninstalledAt })
        .where(eq(stores.id, storeId));
      requireRowFound(result);
      await transaction
        .delete(storeCredentials)
        .where(eq(storeCredentials.storeId, storeId));
    });
  }

  findStoreCredentials(storeId: number): Promise<StoreCredentials | undefined> {
    return readStoreCredentials(this.database, storeId);
  }

  refreshStoreCredentials(
    storeId: number,
    refresh: StoreCredentialsRefresher,
  ): Promise<StoreCredentials | undefined> {
    return this.database.transaction(async (transaction) => {
      const locked = await lockStoreCredentials(transaction, storeId);
      if (locked === undefined) {
        return undefined;
      }
      const fresh = await refresh(locked);
      if (fresh === undefined) {
        return locked;
      }
      await transaction
        .update(storeCredentials)
        .set({ ...fresh, storeId })
        .where(eq(storeCredentials.storeId, storeId));
      return readStoreCredentials(transaction, storeId);
    });
  }

  async deleteStoreCredentials(
    storeId: number,
    refreshToken: string,
  ): Promise<void> {
    await this.database
      .delete(storeCredentials)
      .where(
        and(
          eq(storeCredentials.storeId, storeId),
          eq(storeCredentials.refreshToken, refreshToken),
        ),
      );
  }
}

async function saveStore(
  transaction: Transaction,
  store: InstalledStore,
): Promise<SavedInstallation> {
  const installed = { ...store, uninstalledAt: null };
  const [known] = await transaction
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.shopifyId, store.shopifyId))
    .for('update');
  if (known === undefined) {
    const [{ id }] = await transaction
      .insert(stores)
      .values(installed)
      .$returningId();
    return { storeId: id, reinstalled: false };
  }
  await transaction
    .update(stores)
    .set(installed)
    .where(eq(stores.id, known.id));
  return { storeId: known.id, reinstalled: true };
}

async function lockStoreCredentials(
  transaction: Transaction,
  storeId: number,
): Promise<StoreCredentials | undefined> {
  await transaction
    .select({ storeId: storeCredentials.storeId })
    .from(storeCredentials)
    .where(eq(storeCredentials.storeId, storeId))
    .for('update');
  return readStoreCredentials(transaction, storeId);
}

async function readStoreCredentials(
  reader: Reader,
  storeId: number,
): Promise<StoreCredentials | undefined> {
  const [credentials] = await reader
    .select({
      ...getTableColumns(storeCredentials),
      shopDomain: stores.shopDomain,
    })
    .from(storeCredentials)
    .innerJoin(stores, eq(stores.id, storeCredentials.storeId))
    .where(eq(storeCredentials.storeId, storeId));
  return credentials;
}
