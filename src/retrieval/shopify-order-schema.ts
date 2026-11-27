import { z } from 'zod';
import type { NewOrder } from '../orders/orders.repository.js';
import { shopMoneyAmountSchema } from './shopify-amount-schema.js';
import { createShopifyIdSchema } from './shopify-id-schema.js';
import {
  type RetrievedOrderItem,
  shopifyOrderItemSchema,
} from './shopify-order-item-schema.js';
import { createShopifyPageSchema } from './shopify-page-schema.js';

export type RetrievedOrder = Omit<NewOrder, 'financialStatus'> & {
  financialStatus: string | null;
  items: RetrievedOrderItem[];
  itemsNextCursor: string | null;
};

const dateTimeSchema = z.iso
  .datetime({ offset: true })
  .transform((text) => new Date(text));

export const shopifyOrderSchema: z.ZodType<Omit<RetrievedOrder, 'placedOn'>> = z
  .object({
    id: createShopifyIdSchema('Order'),
    name: z.string().min(1),
    currencyCode: z.string().length(3),
    totalPriceSet: shopMoneyAmountSchema,
    displayFinancialStatus: z.string().min(1).nullable(),
    displayFulfillmentStatus: z.string().min(1),
    processedAt: dateTimeSchema,
    cancelledAt: dateTimeSchema.nullable(),
    lineItems: createShopifyPageSchema(shopifyOrderItemSchema),
  })
  .transform((order) => ({
    shopifyId: order.id,
    name: order.name,
    currency: order.currencyCode,
    totalPrice: order.totalPriceSet,
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    placedAt: order.processedAt,
    cancelledAt: order.cancelledAt,
    items: order.lineItems.nodes,
    itemsNextCursor: order.lineItems.nextCursor,
  }));
