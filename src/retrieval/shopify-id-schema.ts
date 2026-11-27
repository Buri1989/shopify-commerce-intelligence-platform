import { z } from 'zod';

export function createShopifyIdSchema(type: string): z.ZodType<number, string> {
  return z
    .string()
    .regex(new RegExp(`^gid://shopify/${type}/\\d+$`))
    .transform((id) => Number(id.split('/').at(-1)));
}
