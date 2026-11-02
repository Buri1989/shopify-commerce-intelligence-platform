import { RowNotFoundError } from './row-not-found.error.js';
import { mapRowNotFound } from './row-not-found.mapper.js';

describe('mapRowNotFound', () => {
  it('returns undefined for a plain Error', () => {
    expect(mapRowNotFound(new Error('boom'))).toBeUndefined();
  });

  it('turns a missing row into a 404', () => {
    expect(mapRowNotFound(new RowNotFoundError())).toEqual({
      statusCode: 404,
      body: {
        statusCode: 404,
        error: 'Not Found',
        message: 'Row not found',
      },
    });
  });
});
