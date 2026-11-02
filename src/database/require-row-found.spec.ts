import { RowNotFoundError } from '../common/errors/row-not-found.error.js';
import { requireRowFound } from './require-row-found.js';

describe('requireRowFound', () => {
  it('accepts a write that matched a row', () => {
    expect(() => requireRowFound([{ affectedRows: 1 }])).not.toThrow();
  });

  it('throws RowNotFoundError when the write matched nothing', () => {
    expect(() => requireRowFound([{ affectedRows: 0 }])).toThrow(
      RowNotFoundError,
    );
  });
});
