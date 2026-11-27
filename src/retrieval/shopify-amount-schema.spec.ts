import { ZodError } from 'zod';
import {
  shopifyAmountSchema,
  shopMoneyAmountSchema,
} from './shopify-amount-schema.js';

describe('shopifyAmountSchema', () => {
  it.each(['49.90', '120', '0.0'])(
    'keeps %s as the decimal string it is',
    (amount) => {
      expect(shopifyAmountSchema.parse(amount)).toBe(amount);
    },
  );

  it.each(['49,90', '-5.00', '', '1e3'])(
    'refuses %s as an amount',
    (amount) => {
      expect(() => shopifyAmountSchema.parse(amount)).toThrow(ZodError);
    },
  );
});

describe('shopMoneyAmountSchema', () => {
  it("reads the amount in the store's money", () => {
    expect(
      shopMoneyAmountSchema.parse({ shopMoney: { amount: '84.84' } }),
    ).toBe('84.84');
  });
});
