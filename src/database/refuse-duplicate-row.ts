import { DrizzleQueryError } from 'drizzle-orm/errors';
import { DuplicateRowError } from '../common/errors/duplicate-row.error.js';

const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

export async function refuseDuplicateRow<Result>(
  write: () => Promise<Result>,
): Promise<Result> {
  try {
    return await write();
  } catch (error) {
    if (isDuplicateEntry(error)) {
      throw new DuplicateRowError();
    }
    throw error;
  }
}

function isDuplicateEntry(error: unknown): boolean {
  if (!(error instanceof DrizzleQueryError)) {
    return false;
  }
  const { code } = (error.cause ?? {}) as NodeJS.ErrnoException;
  return code === DUPLICATE_ENTRY;
}
