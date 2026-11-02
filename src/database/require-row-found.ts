import type { ResultSetHeader } from 'mysql2/promise';
import { RowNotFoundError } from '../common/errors/row-not-found.error.js';

type WriteResult = readonly [
  Pick<ResultSetHeader, 'affectedRows'>,
  ...unknown[],
];

// mysql2 counts rows matched, not rows changed, so a write that sets the same
// values still counts as found.
export function requireRowFound([{ affectedRows }]: WriteResult): void {
  if (affectedRows === 0) {
    throw new RowNotFoundError();
  }
}
