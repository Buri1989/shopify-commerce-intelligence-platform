import { ShopifyUnavailableError } from './shopify-unavailable.error.js';
import { mapShopifyUnavailable } from './shopify-unavailable.mapper.js';

describe('mapShopifyUnavailable', () => {
  it('returns undefined for a plain Error', () => {
    expect(mapShopifyUnavailable(new Error('boom'))).toBeUndefined();
  });

  it('turns Shopify not answering into a 503 that says to try again', () => {
    expect(mapShopifyUnavailable(new ShopifyUnavailableError())).toEqual({
      statusCode: 503,
      body: {
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Shopify did not answer. Try again later.',
      },
    });
  });
});
