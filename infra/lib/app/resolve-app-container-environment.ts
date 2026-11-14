import type { StageConfig } from '../config/stage-config.js';

export function resolveAppContainerEnvironment(
  config: StageConfig,
): Record<string, string> {
  return {
    SHOPIFY_CLIENT_ID: config.shopifyClientId,
    SHOPIFY_CALLBACK_URL: `https://${config.apiDomainName}${SHOPIFY_CALLBACK_PATH}`,
  };
}

const SHOPIFY_CALLBACK_PATH = '/installation/callback';
