import { DuplicateRowError } from './duplicate-row.error.js';
import { mapDuplicateRow } from './duplicate-row.mapper.js';

describe('mapDuplicateRow', () => {
  it('returns undefined for a plain Error', () => {
    expect(mapDuplicateRow(new Error('boom'))).toBeUndefined();
  });

  it('turns a duplicate row into a 409', () => {
    expect(mapDuplicateRow(new DuplicateRowError())).toEqual({
      statusCode: 409,
      body: {
        statusCode: 409,
        error: 'Conflict',
        message: 'A row with these values already exists',
      },
    });
  });
});
