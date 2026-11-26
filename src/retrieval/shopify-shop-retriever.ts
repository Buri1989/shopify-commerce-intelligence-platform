import { z } from 'zod';
import type { InstalledStore } from '../stores/stores.repository.js';
import { sendShopifyAdminQuery } from './send-shopify-admin-query.js';

export type RetrievedShop = Pick<
  InstalledStore,
  'shopifyId' | 'shopDomain' | 'name' | 'currency'
>;

const SHOP_QUERY = '{ shop { id name currencyCode myshopifyDomain } }';
const NO_VARIABLES = {};

const shopDataSchema = z.object({
  shop: z.object({
    id: z.string().regex(/^gid:\/\/shopify\/Shop\/\d+$/),
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
      shopifyId: Number(shop.id.split('/').at(-1)),
      shopDomain: shop.myshopifyDomain,
      name: shop.name,
      currency: shop.currencyCode,
    };
  }
}
