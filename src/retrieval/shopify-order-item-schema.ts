import { z } from 'zod';
import type { NewOrderItem } from '../orders/orders.repository.js';
import { shopMoneyAmountSchema } from './shopify-amount-schema.js';
import { createShopifyIdSchema } from './shopify-id-schema.js';

export type RetrievedOrderItem = NewOrderItem & {
  productShopifyId: number | null;
  variantShopifyId: number | null;
};

export const shopifyOrderItemSchema: z.ZodType<RetrievedOrderItem> = z
  .object({
    id: createShopifyIdSchema('LineItem'),
    title: z.string().min(1),
    variantTitle: z.string().nullable(),
    sku: z.string().nullable(),
    quantity: z.number().int().nonnegative(),
    discountedUnitPriceAfterAllDiscountsSet: shopMoneyAmountSchema,
    product: z.object({ id: createShopifyIdSchema('Product') }).nullable(),
    variant: z
      .object({ id: createShopifyIdSchema('ProductVariant') })
      .nullable(),
  })
  .transform((item) => ({
    shopifyId: item.id,
    title: item.title,
    variantTitle: item.variantTitle,
    sku: item.sku,
    quantity: item.quantity,
    price: item.discountedUnitPriceAfterAllDiscountsSet,
    productShopifyId: item.product?.id ?? null,
    variantShopifyId: item.variant?.id ?? null,
  }));
