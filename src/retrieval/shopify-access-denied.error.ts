export class ShopifyAccessDeniedError extends Error {
  constructor(shopifyMessage: string) {
    super(`Shopify denied the admin query access: ${shopifyMessage}`);
    this.name = 'ShopifyAccessDeniedError';
  }
}
