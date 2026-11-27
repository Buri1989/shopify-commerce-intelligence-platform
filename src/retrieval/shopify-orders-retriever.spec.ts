import {
  createDataAnswer,
  LAST_PAGE_INFO,
  NEXT_PAGE_INFO,
} from '../../test/shopify-answers.js';
import {
  ORDER_ITEM_ROW,
  ORDER_ROW,
  SHOPIFY_ORDER,
  SHOPIFY_ORDER_ITEM,
} from '../../test/shopify-orders.js';
import {
  createStoreQuerySender,
  STORE_GRAPHQL_URL,
  STORE_ID,
} from '../../test/store-query-sender.js';
import { graphql } from './graphql.js';
import { ShopifyOrdersRetriever } from './shopify-orders-retriever.js';

const ORDERS_QUERY = graphql`
  query ($after: String) {
    orders(first: 50, after: $after) {
      nodes {
        id
        name
        currencyCode
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        displayFinancialStatus
        displayFulfillmentStatus
        processedAt
        cancelledAt
        lineItems(first: 15) {
          nodes {
            id
            title
            variantTitle
            sku
            quantity
            discountedUnitPriceAfterAllDiscountsSet {
              shopMoney {
                amount
              }
            }
            product {
              id
            }
            variant {
              id
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
    shop {
      ianaTimezone
    }
  }
`;
const ORDER_ITEMS_QUERY = graphql`
  query ($id: ID!, $after: String) {
    order(id: $id) {
      lineItems(first: 250, after: $after) {
        nodes {
          id
          title
          variantTitle
          sku
          quantity
          discountedUnitPriceAfterAllDiscountsSet {
            shopMoney {
              amount
            }
          }
          product {
            id
          }
          variant {
            id
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;
const NEW_YORK_SHOP = { ianaTimezone: 'America/New_York' };
const ORDER_SHOPIFY_ID = 450789469;

describe('ShopifyOrdersRetriever', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const retriever = new ShopifyOrdersRetriever(createStoreQuerySender());

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  describe('retrieveOrders', () => {
    it('asks for the first 50 orders, 15 items each, and the store timezone when there is no cursor', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            orders: { nodes: [], pageInfo: LAST_PAGE_INFO },
            shop: NEW_YORK_SHOP,
          }),
        ),
      );

      await retriever.retrieveOrders(STORE_ID, null);

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: ORDERS_QUERY,
            variables: { after: null },
          }),
        }),
      );
    });

    it('asks for the 50 orders after the cursor', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            orders: { nodes: [], pageInfo: LAST_PAGE_INFO },
            shop: NEW_YORK_SHOP,
          }),
        ),
      );

      await retriever.retrieveOrders(STORE_ID, 'cursor-1');

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: ORDERS_QUERY,
            variables: { after: 'cursor-1' },
          }),
        }),
      );
    });

    it("returns each order row on the store's day, no next cursor on the last page, and the query's requested cost", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer(
            {
              orders: { nodes: [SHOPIFY_ORDER], pageInfo: LAST_PAGE_INFO },
              shop: NEW_YORK_SHOP,
            },
            252,
          ),
        ),
      );

      expect(await retriever.retrieveOrders(STORE_ID, null)).toEqual({
        rows: [{ ...ORDER_ROW, placedOn: '2026-11-26' }],
        nextCursor: null,
        requestedQueryCost: 252,
      });
    });

    it('returns the day after the UTC day for a store whose timezone is ahead of it', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            orders: {
              nodes: [
                { ...SHOPIFY_ORDER, processedAt: '2026-11-27T22:30:00Z' },
              ],
              pageInfo: LAST_PAGE_INFO,
            },
            shop: { ianaTimezone: 'Asia/Tokyo' },
          }),
        ),
      );

      const page = await retriever.retrieveOrders(STORE_ID, null);

      expect(page.rows).toEqual([
        expect.objectContaining({ placedOn: '2026-11-28' }),
      ]);
    });

    it('returns the end cursor as the next cursor when Shopify has another page', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            orders: { nodes: [SHOPIFY_ORDER], pageInfo: NEXT_PAGE_INFO },
            shop: NEW_YORK_SHOP,
          }),
        ),
      );

      const page = await retriever.retrieveOrders(STORE_ID, null);

      expect(page.nextCursor).toBe('cursor-2');
    });
  });

  describe('retrieveOrderItems', () => {
    it("asks for the 250 items of the order by its Shopify id after the order's items cursor", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            order: { lineItems: { nodes: [], pageInfo: LAST_PAGE_INFO } },
          }),
        ),
      );

      await retriever.retrieveOrderItems(
        STORE_ID,
        ORDER_SHOPIFY_ID,
        'cursor-1',
      );

      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        STORE_GRAPHQL_URL,
        expect.objectContaining({
          body: JSON.stringify({
            query: ORDER_ITEMS_QUERY,
            variables: {
              id: 'gid://shopify/Order/450789469',
              after: 'cursor-1',
            },
          }),
        }),
      );
    });

    it("returns each item row, no next cursor on the last page, and the query's requested cost", async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer(
            {
              order: {
                lineItems: {
                  nodes: [SHOPIFY_ORDER_ITEM],
                  pageInfo: LAST_PAGE_INFO,
                },
              },
            },
            9,
          ),
        ),
      );

      expect(
        await retriever.retrieveOrderItems(
          STORE_ID,
          ORDER_SHOPIFY_ID,
          'cursor-1',
        ),
      ).toEqual({
        rows: [ORDER_ITEM_ROW],
        nextCursor: null,
        requestedQueryCost: 9,
      });
    });

    it('returns the end cursor as the next cursor when the order has more items', async () => {
      fetchMock.mockResolvedValue(
        Response.json(
          createDataAnswer({
            order: {
              lineItems: {
                nodes: [SHOPIFY_ORDER_ITEM],
                pageInfo: NEXT_PAGE_INFO,
              },
            },
          }),
        ),
      );

      const page = await retriever.retrieveOrderItems(
        STORE_ID,
        ORDER_SHOPIFY_ID,
        'cursor-1',
      );

      expect(page.nextCursor).toBe('cursor-2');
    });

    it('returns an empty last page when Shopify no longer has the order', async () => {
      fetchMock.mockResolvedValue(
        Response.json(createDataAnswer({ order: null }, 3)),
      );

      expect(
        await retriever.retrieveOrderItems(
          STORE_ID,
          ORDER_SHOPIFY_ID,
          'cursor-1',
        ),
      ).toEqual({ rows: [], nextCursor: null, requestedQueryCost: 3 });
    });
  });
});
