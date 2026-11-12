const SHOP_DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/;

export function isShopDomain(value: unknown): value is string {
  return typeof value === 'string' && SHOP_DOMAIN_PATTERN.test(value);
}
