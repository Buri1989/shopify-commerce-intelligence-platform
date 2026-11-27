import { ZodError } from 'zod';
import { createShopifyIdSchema } from './shopify-id-schema.js';

describe('createShopifyIdSchema', () => {
  const productIdSchema = createShopifyIdSchema('Product');

  it('reads a Shopify product id as the number after its type', () => {
    expect(productIdSchema.parse('gid://shopify/Product/108828309')).toBe(
      108828309,
    );
  });

  it.each([
    'gid://shopify/Collection/108828309',
    'gid://shopify/ProductVariant/108828309',
    'gid://shopify/Product/abc',
    '108828309',
  ])('refuses %s as a product id', (id) => {
    expect(() => productIdSchema.parse(id)).toThrow(ZodError);
  });
});
