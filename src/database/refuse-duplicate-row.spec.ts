import { DrizzleQueryError } from 'drizzle-orm/errors';
import { DuplicateRowError } from '../common/errors/duplicate-row.error.js';
import { refuseDuplicateRow } from './refuse-duplicate-row.js';

function createQueryError(code: string): DrizzleQueryError {
  const cause = Object.assign(new Error('refused by MySQL'), { code });
  return new DrizzleQueryError('insert into `orders`', [], cause);
}

describe('refuseDuplicateRow', () => {
  it('hands back what the write returned', async () => {
    await expect(refuseDuplicateRow(() => Promise.resolve(7))).resolves.toBe(7);
  });

  it('turns a duplicate entry into a DuplicateRowError', async () => {
    const write = () => Promise.reject(createQueryError('ER_DUP_ENTRY'));

    await expect(refuseDuplicateRow(write)).rejects.toThrow(DuplicateRowError);
  });

  it('leaves any other query failure as it is', async () => {
    const deadlock = createQueryError('ER_LOCK_DEADLOCK');

    await expect(
      refuseDuplicateRow(() => Promise.reject(deadlock)),
    ).rejects.toBe(deadlock);
  });

  it('leaves an error that is not a query failure as it is', async () => {
    const failure = new Error('boom');

    await expect(
      refuseDuplicateRow(() => Promise.reject(failure)),
    ).rejects.toBe(failure);
  });
});
