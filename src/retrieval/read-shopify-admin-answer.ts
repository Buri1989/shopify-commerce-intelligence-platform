import { z } from 'zod';
import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';
import { ShopifyAccessDeniedError } from './shopify-access-denied.error.js';

export interface ShopifyAdminAnswer {
  readonly data: Record<string, unknown>;
  readonly requestedQueryCost: number;
}

const THROTTLED = 'THROTTLED';
const ACCESS_DENIED = 'ACCESS_DENIED';
const UNAVAILABLE_CODES = new Set(['INTERNAL_SERVER_ERROR', 'SHOP_INACTIVE']);

const errorSchema = z.object({
  message: z.string(),
  extensions: z.object({ code: z.string() }).optional(),
});
const errorsAnswerSchema = z.object({ errors: z.array(errorSchema).min(1) });
const dataAnswerSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  extensions: z.object({
    cost: z.object({ requestedQueryCost: z.number() }),
  }),
});

type ShopifyGraphqlError = z.infer<typeof errorSchema>;

export function readShopifyAdminAnswer(answer: unknown): ShopifyAdminAnswer {
  const errors = readErrors(answer);
  // Data that comes with errors may be missing fields, such as an order's total, so it is
  // never handed on.
  if (errors !== undefined) {
    throw createAnswerError(errors);
  }
  const { data, extensions } = dataAnswerSchema.parse(answer);
  return { data, requestedQueryCost: extensions.cost.requestedQueryCost };
}

export function isThrottledAnswer(answer: unknown): boolean {
  return readErrors(answer)?.[0].extensions?.code === THROTTLED;
}

function readErrors(answer: unknown): ShopifyGraphqlError[] | undefined {
  const refused = errorsAnswerSchema.safeParse(answer);
  return refused.success ? refused.data.errors : undefined;
}

// One answer becomes one error, so the first of Shopify's errors decides which.
function createAnswerError(errors: ShopifyGraphqlError[]): Error {
  const [{ message, extensions }] = errors;
  if (extensions?.code === ACCESS_DENIED) {
    return new ShopifyAccessDeniedError(message);
  }
  if (extensions !== undefined && UNAVAILABLE_CODES.has(extensions.code)) {
    return new ShopifyUnavailableError();
  }
  return new Error(
    `Shopify answered the admin query with errors: ${JSON.stringify(errors)}. Check the query against the Admin API version.`,
  );
}
