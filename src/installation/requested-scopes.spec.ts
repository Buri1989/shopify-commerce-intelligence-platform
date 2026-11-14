import { hasRequestedScopes } from './requested-scopes.js';

describe('hasRequestedScopes', () => {
  it.each([
    'read_products,read_orders',
    'read_orders,read_products',
    'read_products,read_orders,read_customers',
  ])('accepts %s', (grantedScopes) => {
    expect(hasRequestedScopes(grantedScopes)).toBe(true);
  });

  it.each([
    { name: 'nothing', grantedScopes: '' },
    { name: 'products only', grantedScopes: 'read_products' },
    { name: 'orders only', grantedScopes: 'read_orders' },
    {
      name: 'a scope that only ends like a requested one',
      grantedScopes: 'unauthenticated_read_products,read_orders',
    },
  ])('refuses $name', ({ grantedScopes }) => {
    expect(hasRequestedScopes(grantedScopes)).toBe(false);
  });
});
