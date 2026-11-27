import { ZodError } from 'zod';
import {
  ORDER_ITEM_ROW,
  SHOPIFY_ORDER_ITEM,
} from '../../test/shopify-orders.js';
import { shopifyOrderItemSchema } from './shopify-order-item-schema.js';

describe('shopifyOrderItemSchema', () => {
  it('reads an item as an item row at the price paid after all discounts, pointing to its product and variant by Shopify id', () => {
    expect(shopifyOrderItemSchema.parse(SHOPIFY_ORDER_ITEM)).toEqual(
      ORDER_ITEM_ROW,
    );
  });

  it('reads an item whose product and variant were deleted with null pointers', () => {
    expect(
      shopifyOrderItemSchema.parse({
        ...SHOPIFY_ORDER_ITEM,
        product: null,
        variant: null,
      }),
    ).toEqual({
      ...ORDER_ITEM_ROW,
      productShopifyId: null,
      variantShopifyId: null,
    });
  });

  it('refuses an item whose price is not an amount', () => {
    expect(() =>
      shopifyOrderItemSchema.parse({
        ...SHOPIFY_ORDER_ITEM,
        discountedUnitPriceAfterAllDiscountsSet: {
          shopMoney: { amount: '39,92' },
        },
      }),
    ).toThrow(ZodError);
  });
});
