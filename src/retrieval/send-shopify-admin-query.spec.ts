import {
  createDataAnswer,
  EMPTY_PRODUCTS_DATA,
  createThrottledAnswer,
} from '../../test/shopify-answers.js';
import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';
import { sendShopifyAdminQuery } from './send-shopify-admin-query.js';

const ACCESS = {
  shopDomain: 'example-store.myshopify.com',
  accessToken: 'access-token',
};
const GRAPHQL_URL =
  'https://example-store.myshopify.com/admin/api/2026-10/graphql.json';
const QUERY =
  'query ($after: String) { products(first: 250, after: $after) { nodes { id } } }';
const VARIABLES = { after: 'eyJsYXN0X2lkIjo1NTk' };
const THROTTLE_STATUS = {
  requestedQueryCost: 300,
  currentlyAvailable: 120,
  restoreRate: 100,
};
const THROTTLE_WAIT_MILLISECONDS = 1_800;

describe('sendShopifyAdminQuery', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  it('posts the query and its variables to Admin API version 2026-10 with the access token', async () => {
    fetchMock.mockResolvedValue(
      Response.json(createDataAnswer(EMPTY_PRODUCTS_DATA)),
    );

    await sendShopifyAdminQuery(ACCESS, QUERY, VARIABLES);

    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': 'access-token',
      },
      body: JSON.stringify({ query: QUERY, variables: VARIABLES }),
      signal: expect.any(AbortSignal),
    });
  });

  it('returns the data and the requested cost of the query', async () => {
    fetchMock.mockResolvedValue(
      Response.json(createDataAnswer(EMPTY_PRODUCTS_DATA, 252)),
    );

    expect(await sendShopifyAdminQuery(ACCESS, QUERY, VARIABLES)).toEqual({
      data: EMPTY_PRODUCTS_DATA,
      requestedQueryCost: 252,
    });
  });

  it.each([429, 500, 503])(
    'throws ShopifyUnavailableError when Shopify answers %i',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(
        sendShopifyAdminQuery(ACCESS, QUERY, VARIABLES),
      ).rejects.toThrow(ShopifyUnavailableError);
    },
  );

  it('throws ShopifyUnavailableError when Shopify does not answer in time', async () => {
    fetchMock.mockRejectedValue(
      new DOMException('The operation timed out.', 'TimeoutError'),
    );

    await expect(
      sendShopifyAdminQuery(ACCESS, QUERY, VARIABLES),
    ).rejects.toThrow(ShopifyUnavailableError);
  });

  it.each([400, 401, 402, 403, 404, 423])(
    'throws an error that names the status when Shopify answers %i',
    async (status) => {
      fetchMock.mockResolvedValue(new Response(null, { status }));

      await expect(
        sendShopifyAdminQuery(ACCESS, QUERY, VARIABLES),
      ).rejects.toThrow(
        `Shopify answered the admin query with status ${status}.`,
      );
    },
  );

  describe('when Shopify throttles the query', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('sends the query again once the bucket has refilled', async () => {
      fetchMock
        .mockResolvedValueOnce(
          Response.json(createThrottledAnswer(THROTTLE_STATUS)),
        )
        .mockResolvedValueOnce(
          Response.json(createDataAnswer(EMPTY_PRODUCTS_DATA, 300)),
        );

      const answer = sendShopifyAdminQuery(ACCESS, QUERY, VARIABLES);
      await vi.advanceTimersByTimeAsync(THROTTLE_WAIT_MILLISECONDS);

      expect(await answer).toEqual({
        data: EMPTY_PRODUCTS_DATA,
        requestedQueryCost: 300,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws ShopifyUnavailableError when Shopify throttles the query a second time', async () => {
      fetchMock.mockImplementation(async () =>
        Response.json(createThrottledAnswer(THROTTLE_STATUS)),
      );

      const answer = sendShopifyAdminQuery(ACCESS, QUERY, VARIABLES);
      const refused = expect(answer).rejects.toThrow(ShopifyUnavailableError);
      await vi.advanceTimersByTimeAsync(THROTTLE_WAIT_MILLISECONDS);

      await refused;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
