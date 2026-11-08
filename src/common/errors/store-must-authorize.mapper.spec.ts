import { StoreMustAuthorizeError } from './store-must-authorize.error.js';
import { mapStoreMustAuthorize } from './store-must-authorize.mapper.js';

describe('mapStoreMustAuthorize', () => {
  it('returns undefined for a plain Error', () => {
    expect(mapStoreMustAuthorize(new Error('boom'))).toBeUndefined();
  });

  it('turns a store that must authorize again into a 409 naming the store', () => {
    expect(mapStoreMustAuthorize(new StoreMustAuthorizeError(42))).toEqual({
      statusCode: 409,
      body: {
        statusCode: 409,
        error: 'Conflict',
        message: 'Store 42 must authorize the app again.',
      },
    });
  });
});
