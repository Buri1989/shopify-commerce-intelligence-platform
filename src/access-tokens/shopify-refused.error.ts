export class ShopifyRefusedError extends Error {
  constructor() {
    super('Shopify refused the code or the refresh token.');
    this.name = 'ShopifyRefusedError';
  }
}
