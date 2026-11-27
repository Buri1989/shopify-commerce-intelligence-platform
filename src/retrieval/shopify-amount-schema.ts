import { z } from 'zod';

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

export const shopifyAmountSchema = z.string().regex(DECIMAL_PATTERN);

export const shopMoneyAmountSchema = z
  .object({ shopMoney: z.object({ amount: shopifyAmountSchema }) })
  .transform(({ shopMoney }) => shopMoney.amount);
