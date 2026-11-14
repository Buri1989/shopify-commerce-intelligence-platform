import { isShopDomain } from './is-shop-domain.js';

describe('isShopDomain', () => {
  it.each([
    'example.myshopify.com',
    'shop-1.myshopify.com',
    'Example-Shop.myshopify.com',
    '9lives.myshopify.com',
  ])('accepts %s', (value) => {
    expect(isShopDomain(value)).toBe(true);
  });

  it.each([
    { name: 'a missing value', value: undefined },
    { name: 'an empty string', value: '' },
    {
      name: 'a repeated parameter',
      value: ['example.myshopify.com', 'other.myshopify.com'],
    },
    { name: 'another domain', value: 'example.com' },
    { name: 'no name', value: '.myshopify.com' },
    {
      name: 'a name that starts with a hyphen',
      value: '-example.myshopify.com',
    },
    { name: 'a name with a dot', value: 'admin.example.myshopify.com' },
    { name: 'a lookalike without the dot', value: 'examplemyshopify.com' },
    {
      name: 'a domain that only starts like a shop',
      value: 'example.myshopify.com.evil.com',
    },
    {
      name: 'a domain that only ends like a shop',
      value: 'evil.com/example.myshopify.com',
    },
    { name: 'a full address', value: 'https://example.myshopify.com' },
    { name: 'a path after the domain', value: 'example.myshopify.com/admin' },
    { name: 'a line break after the domain', value: 'example.myshopify.com\n' },
  ])('refuses $name', ({ value }) => {
    expect(isShopDomain(value)).toBe(false);
  });
});
