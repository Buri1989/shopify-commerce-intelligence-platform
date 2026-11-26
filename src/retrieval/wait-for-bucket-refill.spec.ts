import {
  createErrorAnswer,
  createThrottledAnswer,
} from '../../test/shopify-answers.js';
import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';
import { waitForBucketRefill } from './wait-for-bucket-refill.js';

describe('waitForBucketRefill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    {
      requestedQueryCost: 300,
      currentlyAvailable: 120,
      restoreRate: 100,
      milliseconds: 1_800,
    },
    {
      requestedQueryCost: 1000,
      currentlyAvailable: 0,
      restoreRate: 100,
      milliseconds: 10_000,
    },
  ])(
    'waits $milliseconds ms for $requestedQueryCost points with $currentlyAvailable left at $restoreRate a second',
    async ({ milliseconds, ...status }) => {
      const refilled = vi.fn();
      void waitForBucketRefill(createThrottledAnswer(status)).then(refilled);

      await vi.advanceTimersByTimeAsync(milliseconds - 1);
      expect(refilled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);

      expect(refilled).toHaveBeenCalledOnce();
    },
  );

  it('throws ShopifyUnavailableError without waiting when the throttle status asks for more than 10 seconds', async () => {
    const answer = createThrottledAnswer({
      requestedQueryCost: 1000,
      currentlyAvailable: 0,
      restoreRate: 50,
    });

    await expect(waitForBucketRefill(answer)).rejects.toThrow(
      ShopifyUnavailableError,
    );
  });

  it('throws an error when the throttle status says the bucket never refills', async () => {
    const answer = createThrottledAnswer({
      requestedQueryCost: 300,
      currentlyAvailable: 0,
      restoreRate: 0,
    });

    await expect(waitForBucketRefill(answer)).rejects.toThrow(/restoreRate/);
  });

  it('throws an error when a throttled answer carries no cost', async () => {
    await expect(
      waitForBucketRefill(createErrorAnswer('THROTTLED')),
    ).rejects.toThrow(/extensions/);
  });
});
