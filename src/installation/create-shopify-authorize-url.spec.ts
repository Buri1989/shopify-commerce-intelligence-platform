import { createShopifyAuthorizeUrl } from './create-shopify-authorize-url.js';

describe('createShopifyAuthorizeUrl', () => {
  it("builds the shop's authorize address with the client id, both scopes, the callback and the state", () => {
    expect(
      createShopifyAuthorizeUrl({
        shopDomain: 'example.myshopify.com',
        clientId: 'test-client-id',
        callbackUrl: 'https://api.example.test/installation/callback',
        state: 'state-value',
      }),
    ).toBe(
      'https://example.myshopify.com/admin/oauth/authorize?client_id=test-client-id&scope=read_products%2Cread_orders&redirect_uri=https%3A%2F%2Fapi.example.test%2Finstallation%2Fcallback&state=state-value',
    );
  });
});
