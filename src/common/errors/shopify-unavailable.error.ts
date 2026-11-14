export class ShopifyUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('Shopify did not answer. Try again later.', options);
    this.name = 'ShopifyUnavailableError';
  }
}
