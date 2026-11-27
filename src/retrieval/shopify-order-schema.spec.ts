import { ZodError } from 'zod';
import { NEXT_PAGE_INFO } from '../../test/shopify-answers.js';
import { ORDER_ROW, SHOPIFY_ORDER } from '../../test/shopify-orders.js';
import { shopifyOrderSchema } from './shopify-order-schema.js';

describe('shopifyOrderSchema', () => {
  it("reads an order as an order row in the store's money, placed when the customer bought, with its items", () => {
    expect(shopifyOrderSchema.parse(SHOPIFY_ORDER)).toEqual(ORDER_ROW);
  });

  it('reads the time a cancelled order was cancelled', () => {
    expect(
      shopifyOrderSchema.parse({
        ...SHOPIFY_ORDER,
        cancelledAt: '2026-11-28T09:00:00Z',
      }),
    ).toEqual({ ...ORDER_ROW, cancelledAt: new Date('2026-11-28T09:00:00Z') });
  });

  it('keeps a missing financial status as null', () => {
    expect(
      shopifyOrderSchema.parse({
        ...SHOPIFY_ORDER,
        displayFinancialStatus: null,
      }),
    ).toEqual({ ...ORDER_ROW, financialStatus: null });
  });

  it('returns the items cursor of an order with more than 15 items', () => {
    expect(
      shopifyOrderSchema.parse({
        ...SHOPIFY_ORDER,
        lineItems: { ...SHOPIFY_ORDER.lineItems, pageInfo: NEXT_PAGE_INFO },
      }),
    ).toEqual({ ...ORDER_ROW, itemsNextCursor: 'cursor-2' });
  });

  it('refuses an order whose processed time is not a date and time', () => {
    expect(() =>
      shopifyOrderSchema.parse({ ...SHOPIFY_ORDER, processedAt: 'yesterday' }),
    ).toThrow(ZodError);
  });
});
