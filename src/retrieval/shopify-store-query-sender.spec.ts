import {
  createDataAnswer,
  createErrorAnswer,
} from '../../test/shopify-answers.js';
import {
  STORE_ACCESS,
  STORE_GRAPHQL_URL,
  STORE_ID,
} from '../../test/store-query-sender.js';
import type { AccessTokensService } from '../access-tokens/access-tokens.service.js';
import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';
import { StoreMustAuthorizeError } from '../common/errors/store-must-authorize.error.js';
import { ShopifyStoreQuerySender } from './shopify-store-query-sender.js';

const QUERY =
  'query ($after: String) { orders(first: 50, after: $after) { nodes { id } } }';
const VARIABLES = { after: null };
const DATA = { orders: { nodes: [] } };

describe('ShopifyStoreQuerySender', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const getStoreAccess = vi.fn<AccessTokensService['getStoreAccess']>();
  const sender = new ShopifyStoreQuerySender({ getStoreAccess });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    getStoreAccess.mockResolvedValue(STORE_ACCESS);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
    getStoreAccess.mockReset();
  });

  describe('sendStoreQuery', () => {
    it("sends the query to store 5's address with store 5's access token", async () => {
      fetchMock.mockResolvedValue(Response.json(createDataAnswer(DATA)));

      await sender.sendStoreQuery(STORE_ID, QUERY, VARIABLES);

      expect(getStoreAccess).toHaveBeenCalledExactlyOnceWith(STORE_ID);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Shopify-Access-Token': 'store-five-token',
          }),
        }),
      );
    });

    it('returns the data and the requested cost of the query', async () => {
      fetchMock.mockResolvedValue(Response.json(createDataAnswer(DATA, 52)));

      expect(await sender.sendStoreQuery(STORE_ID, QUERY, VARIABLES)).toEqual({
        data: DATA,
        requestedQueryCost: 52,
      });
    });

    it("throws StoreMustAuthorizeError for store 5 with Shopify's message when Shopify denies access", async () => {
      const message =
        'Access denied for orders field. Required access: `read_orders` access scope.';
      fetchMock.mockResolvedValue(
        Response.json(createErrorAnswer('ACCESS_DENIED', message)),
      );

      await expect(
        sender.sendStoreQuery(STORE_ID, QUERY, VARIABLES),
      ).rejects.toStrictEqual(
        new StoreMustAuthorizeError(
          STORE_ID,
          `Shopify denied the admin query access: ${message}`,
        ),
      );
    });

    it('passes any other error on unchanged', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

      await expect(
        sender.sendStoreQuery(STORE_ID, QUERY, VARIABLES),
      ).rejects.toThrow(ShopifyUnavailableError);
    });
  });
});
