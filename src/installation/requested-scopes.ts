export const REQUESTED_SCOPES = ['read_products', 'read_orders'];

export function hasRequestedScopes(grantedScopes: string): boolean {
  const granted = grantedScopes.split(',');
  return REQUESTED_SCOPES.every((scope) => granted.includes(scope));
}
