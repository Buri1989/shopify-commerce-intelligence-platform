export function createShopifyId(type: string, shopifyId: number): string {
  return `gid://shopify/${type}/${shopifyId}`;
}
