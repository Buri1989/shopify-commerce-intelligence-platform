import { REQUESTED_SCOPES } from './requested-scopes.js';

export interface ShopifyAuthorization {
  readonly shopDomain: string;
  readonly clientId: string;
  readonly callbackUrl: string;
  readonly state: string;
}

export function createShopifyAuthorizeUrl({
  shopDomain,
  clientId,
  callbackUrl,
  state,
}: ShopifyAuthorization): string {
  const query = new URLSearchParams({
    client_id: clientId,
    scope: REQUESTED_SCOPES.join(','),
    redirect_uri: callbackUrl,
    state,
  });
  return `https://${shopDomain}/admin/oauth/authorize?${query.toString()}`;
}
