import type { GeneratedColumns } from '../database/generated-columns.js';
import type { collections } from '../database/schema/index.js';

export type NewCollection = Omit<
  typeof collections.$inferInsert,
  GeneratedColumns | 'storeId'
>;
