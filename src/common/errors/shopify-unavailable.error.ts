export class ShopifyUnavailableError extends Error {
  constructor() {
    super('Shopify did not answer. Try again later.');
    this.name = 'ShopifyUnavailableError';
  }
}
