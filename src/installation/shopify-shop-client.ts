import { z } from 'zod';
import { sendShopifyRequest } from '../common/shopify/send-shopify-request.js';
import type { InstalledStore } from '../stores/stores.repository.js';

export type ShopDetails = Pick<
  InstalledStore,
  'shopifyId' | 'shopDomain' | 'name' | 'currency'
>;

const ADMIN_API_VERSION = '2026-10';
const SHOP_QUERY = '{ shop { id name currencyCode myshopifyDomain } }';

const errorsAnswerSchema = z.object({ errors: z.array(z.unknown()) });
const shopAnswerSchema = z.object({
  data: z.object({
    shop: z.object({
      id: z.string().regex(/^gid:\/\/shopify\/Shop\/\d+$/),
      name: z.string().min(1),
      currencyCode: z.string().length(3),
      myshopifyDomain: z.string().min(1),
    }),
  }),
});

export class ShopifyShopClient {
  async fetchShopDetails(
    shopDomain: string,
    accessToken: string,
  ): Promise<ShopDetails> {
    const response = await sendShopifyRequest(
      `https://${shopDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: SHOP_QUERY }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Shopify answered the shop query with status ${response.status}. Check the query and the Admin API version.`,
      );
    }
    return readShopDetails(await response.json());
  }
}

function readShopDetails(answer: unknown): ShopDetails {
  const refused = errorsAnswerSchema.safeParse(answer);
  if (refused.success) {
    throw new Error(
      `Shopify answered the shop query with errors: ${JSON.stringify(refused.data.errors)}`,
    );
  }
  const { shop } = shopAnswerSchema.parse(answer).data;
  return {
    shopifyId: Number(shop.id.split('/').at(-1)),
    shopDomain: shop.myshopifyDomain,
    name: shop.name,
    currency: shop.currencyCode,
  };
}
