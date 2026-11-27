import { z } from 'zod';

type ShopifyPage<Node> = { nodes: Node[]; nextCursor: string | null };

// Another page without a cursor would end a walk early with nothing said, so it is refused.
const pageInfoSchema = z.discriminatedUnion('hasNextPage', [
  z.object({ hasNextPage: z.literal(true), endCursor: z.string() }),
  z.object({ hasNextPage: z.literal(false), endCursor: z.string().nullable() }),
]);

export function createShopifyPageSchema<Node extends z.ZodType>(
  nodeSchema: Node,
): z.ZodType<ShopifyPage<z.output<Node>>> {
  return z
    .object({ nodes: z.array(nodeSchema), pageInfo: pageInfoSchema })
    .transform(({ nodes, pageInfo }) => ({
      nodes,
      nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
    }));
}
