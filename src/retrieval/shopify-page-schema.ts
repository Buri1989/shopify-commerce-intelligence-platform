import { z } from 'zod';

type ShopifyPage<Node> = { nodes: Node[]; nextCursor: string | null };

const nextPageInfoSchema = z.object({
  hasNextPage: z.literal(true),
  endCursor: z.string(),
});
const lastPageInfoSchema = z.object({
  hasNextPage: z.literal(false),
  endCursor: z.string().nullable(),
});
const pageInfoSchema = z.discriminatedUnion('hasNextPage', [
  nextPageInfoSchema,
  lastPageInfoSchema,
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
