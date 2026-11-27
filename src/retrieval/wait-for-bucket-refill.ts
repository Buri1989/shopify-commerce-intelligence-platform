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
  const missingMilliseconds = missingPoints * MILLISECONDS_PER_SECOND;
  const waitMilliseconds = Math.ceil(
    missingMilliseconds / throttleStatus.restoreRate,
  );
  if (waitMilliseconds > LONGEST_WAIT_MILLISECONDS) {
    throw new ShopifyUnavailableError();
  }
  await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
}
