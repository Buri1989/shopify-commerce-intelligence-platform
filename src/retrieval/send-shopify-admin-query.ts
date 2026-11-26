import type { StoreAccess } from '../access-tokens/access-tokens.service.js';
import { ShopifyUnavailableError } from '../common/errors/shopify-unavailable.error.js';
import { sendShopifyRequest } from '../common/shopify/send-shopify-request.js';
import {
  isThrottledAnswer,
  readShopifyAdminAnswer,
  type ShopifyAdminAnswer,
} from './read-shopify-admin-answer.js';
import { waitForBucketRefill } from './wait-for-bucket-refill.js';

export type QueryVariables = Readonly<Record<string, unknown>>;

const ADMIN_API_VERSION = '2026-10';

export async function sendShopifyAdminQuery(
  access: StoreAccess,
  query: string,
  variables: QueryVariables,
): Promise<ShopifyAdminAnswer> {
  const answer = await postAdminQuery(access, query, variables);
  if (!isThrottledAnswer(answer)) {
    return readShopifyAdminAnswer(answer);
  }
  await waitForBucketRefill(answer);
  const retried = await postAdminQuery(access, query, variables);
  if (isThrottledAnswer(retried)) {
    throw new ShopifyUnavailableError();
  }
  return readShopifyAdminAnswer(retried);
}

async function postAdminQuery(
  { shopDomain, accessToken }: StoreAccess,
  query: string,
  variables: QueryVariables,
): Promise<unknown> {
  const response = await sendShopifyRequest(
    `https://${shopDomain}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Shopify answered the admin query with status ${response.status}. Check the query and the Admin API version.`,
    );
  }
  return response.json();
}
