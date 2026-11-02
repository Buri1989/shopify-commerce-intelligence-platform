import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.tokens.js';
import type { GeneratedColumns } from '../database/generated-columns.js';
import { refuseDuplicateRow } from '../database/refuse-duplicate-row.js';
import { requireRowFound } from '../database/require-row-found.js';
import { stores } from '../database/schema/index.js';

export type Store = typeof stores.$inferSelect;
export type NewStore = Omit<typeof stores.$inferInsert, GeneratedColumns>;
export type StoreChanges = Partial<Omit<NewStore, 'shopifyId'>>;

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
}
