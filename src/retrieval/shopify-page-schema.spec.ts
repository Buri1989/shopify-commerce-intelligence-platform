import { z, ZodError } from 'zod';
import { createShopifyPageSchema } from './shopify-page-schema.js';

describe('createShopifyPageSchema', () => {
  const pageSchema = createShopifyPageSchema(z.object({ id: z.string() }));

  it('returns the nodes and the end cursor as the next cursor when Shopify has another page', () => {
    expect(
      pageSchema.parse({
        nodes: [{ id: 'a' }],
        pageInfo: { hasNextPage: true, endCursor: 'cursor-2' },
      }),
    ).toEqual({ nodes: [{ id: 'a' }], nextCursor: 'cursor-2' });
  });

  it('returns no next cursor on the last page', () => {
    expect(
      pageSchema.parse({
        nodes: [{ id: 'a' }],
        pageInfo: { hasNextPage: false, endCursor: 'cursor-2' },
      }),
    ).toEqual({ nodes: [{ id: 'a' }], nextCursor: null });
  });

  it('refuses another page without an end cursor', () => {
    expect(() =>
      pageSchema.parse({
        nodes: [{ id: 'a' }],
        pageInfo: { hasNextPage: true, endCursor: null },
      }),
    ).toThrow(ZodError);
  });

  it('refuses a node that does not match the node schema', () => {
    expect(() =>
      pageSchema.parse({
        nodes: [{ id: 1 }],
        pageInfo: { hasNextPage: false, endCursor: null },
      }),
    ).toThrow(ZodError);
  });
});
