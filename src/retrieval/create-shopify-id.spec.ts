import { createShopifyId } from './create-shopify-id.js';

describe('createShopifyId', () => {
  it("writes a Shopify id number in Shopify's own id form", () => {
    expect(createShopifyId('Order', 450789469)).toBe(
      'gid://shopify/Order/450789469',
    );
  });
});
