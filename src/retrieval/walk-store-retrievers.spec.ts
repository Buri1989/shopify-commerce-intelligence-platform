import type { Logger as PinoLogger } from 'pino';
import { COLLECTION_ROW, PRODUCT_ROW } from '../../test/retrieved-rows.js';
import { PLACED_ORDER_ROW } from '../../test/shopify-orders.js';
import { STORE_ID } from '../../test/store-query-sender.js';
import {
  createEmptyStoreRetrievers,
  type FakeStoreRetrievers,
} from '../../test/store-retrievers.js';
import { walkStoreRetrievers } from './walk-store-retrievers.js';

const ONE_EMPTY_PAGE = { rows: 0, pages: 1, highestRequestedQueryCost: 1 };
const NOTHING_WALKED = { rows: 0, pages: 0, highestRequestedQueryCost: 0 };
const LINE_WITH_ONLY_COUNTS = {
  context: 'walkStoreRetrievers',
  storeId: STORE_ID,
  kind: expect.any(String),
  rows: expect.any(Number),
  pages: expect.any(Number),
  highestRequestedQueryCost: expect.any(Number),
};

describe('walkStoreRetrievers', () => {
  const logger = { info: vi.fn<PinoLogger['info']>() };
  let retrievers: FakeStoreRetrievers;

  beforeEach(() => {
    retrievers = createEmptyStoreRetrievers();
  });

  afterEach(() => {
    logger.info.mockReset();
  });

  it("logs one line per kind of data, in order, with the store id and the kind's count", async () => {
    await walkStoreRetrievers(STORE_ID, retrievers, logger);

    expect(logger.info.mock.calls).toEqual([
      [
        {
          context: 'walkStoreRetrievers',
          storeId: STORE_ID,
          kind: 'products',
          ...ONE_EMPTY_PAGE,
        },
        'kind walked',
      ],
      [
        {
          context: 'walkStoreRetrievers',
          storeId: STORE_ID,
          kind: 'productVariants',
          ...ONE_EMPTY_PAGE,
        },
        'kind walked',
      ],
      [
        {
          context: 'walkStoreRetrievers',
          storeId: STORE_ID,
          kind: 'collections',
          ...ONE_EMPTY_PAGE,
        },
        'kind walked',
      ],
      [
        {
          context: 'walkStoreRetrievers',
          storeId: STORE_ID,
          kind: 'collectionProducts',
          ...NOTHING_WALKED,
        },
        'kind walked',
      ],
      [
        {
          context: 'walkStoreRetrievers',
          storeId: STORE_ID,
          kind: 'orders',
          ...ONE_EMPTY_PAGE,
        },
        'kind walked',
      ],
      [
        {
          context: 'walkStoreRetrievers',
          storeId: STORE_ID,
          kind: 'orderItems',
          ...NOTHING_WALKED,
        },
        'kind walked',
      ],
    ]);
  });

  it("logs only counts, never the store's data", async () => {
    retrievers.products.retrieveProducts.mockResolvedValueOnce({
      rows: [PRODUCT_ROW],
      nextCursor: null,
      requestedQueryCost: 12,
    });
    retrievers.collections.retrieveCollections.mockResolvedValueOnce({
      rows: [COLLECTION_ROW],
      nextCursor: null,
      requestedQueryCost: 12,
    });
    retrievers.orders.retrieveOrders.mockResolvedValueOnce({
      rows: [PLACED_ORDER_ROW],
      nextCursor: null,
      requestedQueryCost: 252,
    });

    await walkStoreRetrievers(STORE_ID, retrievers, logger);

    expect(logger.info.mock.calls).toEqual(
      Array.from({ length: 6 }, () => [LINE_WITH_ONLY_COUNTS, 'kind walked']),
    );
  });

  it('stops with the error of a failing retriever, after logging the kinds walked before it', async () => {
    const failure = new Error('collections failed');
    retrievers.collections.retrieveCollections.mockRejectedValueOnce(failure);

    await expect(
      walkStoreRetrievers(STORE_ID, retrievers, logger),
    ).rejects.toBe(failure);
    expect(logger.info).toHaveBeenCalledTimes(2);
  });
});
