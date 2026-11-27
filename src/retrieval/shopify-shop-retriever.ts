import { z } from 'zod';
import type { InstalledStore } from '../stores/stores.repository.js';
import { SHOP_QUERY } from './queries/shopify-shop-query.js';
import { sendShopifyAdminQuery } from './send-shopify-admin-query.js';
import { createShopifyIdSchema } from './shopify-id-schema.js';

export type RetrievedShop = Pick<
  InstalledStore,
  'shopifyId' | 'shopDomain' | 'name' | 'currency'
>;

const NO_VARIABLES = {};

const shopDataSchema = z.object({
  shop: z.object({
    id: createShopifyIdSchema('Shop'),
    name: z.string().min(1),
    currencyCode: z.string().length(3),
    myshopifyDomain: z.string().min(1),
  }),
});

export class ShopifyShopRetriever {
  async retrieveShop(
    shopDomain: string,
    accessToken: string,
  ): Promise<RetrievedShop> {
    const { data } = await sendShopifyAdminQuery(
      { shopDomain, accessToken },
      SHOP_QUERY,
      NO_VARIABLES,
    );
    const { shop } = shopDataSchema.parse(data);
    return {
      shopifyId: shop.id,
      shopDomain: shop.myshopifyDomain,
      name: shop.name,
      currency: shop.currencyCode,
    };
  }
}
