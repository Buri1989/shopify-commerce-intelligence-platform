import { ShopifyStoreQuerySender } from '../src/retrieval/shopify-store-query-sender.js';

export const STORE_ID = 5;
export const STORE_ACCESS = {
  shopDomain: 'store-five.myshopify.com',
  accessToken: 'store-five-token',
};
export const STORE_GRAPHQL_URL =
  'https://store-five.myshopify.com/admin/api/2026-10/graphql.json';

export function createStoreQuerySender(): ShopifyStoreQuerySender {
  return new ShopifyStoreQuerySender({
    getStoreAccess: () => Promise.resolve(STORE_ACCESS),
  });
}
