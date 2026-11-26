interface ThrottleStatus {
  readonly requestedQueryCost: number;
  readonly currentlyAvailable: number;
  readonly restoreRate: number;
}

const FULL_BUCKET = 1000;
const RESTORE_RATE = 100;

export const EMPTY_PRODUCTS_DATA = { products: { nodes: [] } };

export function createDataAnswer(
  data: unknown,
  requestedQueryCost = 1,
): object {
  return {
    data,
    extensions: createCostExtensions({
      requestedQueryCost,
      currentlyAvailable: FULL_BUCKET - requestedQueryCost,
      restoreRate: RESTORE_RATE,
    }),
  };
}

export function createErrorAnswer(
  code: string,
  message = `${code} message`,
): object {
  return { errors: [{ message, extensions: { code } }] };
}

export function createThrottledAnswer(status: ThrottleStatus): object {
  return {
    errors: [{ message: 'Throttled', extensions: { code: 'THROTTLED' } }],
    extensions: createCostExtensions(status),
  };
}

function createCostExtensions({
  requestedQueryCost,
  currentlyAvailable,
  restoreRate,
}: ThrottleStatus): object {
  return {
    cost: {
      requestedQueryCost,
      actualQueryCost: requestedQueryCost,
      throttleStatus: {
        maximumAvailable: FULL_BUCKET,
        currentlyAvailable,
        restoreRate,
      },
    },
  };
}
