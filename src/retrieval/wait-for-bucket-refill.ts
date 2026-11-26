import { z } from 'zod';
import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';

const LONGEST_WAIT_MILLISECONDS = 10_000;
const MILLISECONDS_PER_SECOND = 1000;

const throttledAnswerSchema = z.object({
  extensions: z.object({
    cost: z.object({
      requestedQueryCost: z.number(),
      throttleStatus: z.object({
        currentlyAvailable: z.number(),
        restoreRate: z.number().positive(),
      }),
    }),
  }),
});

export async function waitForBucketRefill(answer: unknown): Promise<void> {
  const { requestedQueryCost, throttleStatus } =
    throttledAnswerSchema.parse(answer).extensions.cost;
  const missingPoints = requestedQueryCost - throttleStatus.currentlyAvailable;
  // Multiplying first keeps the wait exact: 180 ÷ 100 × 1000 is 1800.0000000000002.
  const waitMilliseconds = Math.ceil(
    (missingPoints * MILLISECONDS_PER_SECOND) / throttleStatus.restoreRate,
  );
  // Past the longest wait a normal answer can ask for, Shopify's numbers are wrong and waiting
  // would not help.
  if (waitMilliseconds > LONGEST_WAIT_MILLISECONDS) {
    throw new ShopifyUnavailableError();
  }
  await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
}
