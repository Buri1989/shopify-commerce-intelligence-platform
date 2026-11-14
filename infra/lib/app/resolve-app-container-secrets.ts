import * as ecs from 'aws-cdk-lib/aws-ecs';
import type { AppSecrets } from '../secrets/create-app-secrets.js';

export function resolveAppContainerSecrets(
  appSecrets: AppSecrets,
): Record<string, ecs.Secret> {
  return {
    SHOPIFY_CLIENT_SECRET: ecs.Secret.fromSecretsManager(
      appSecrets.shopifyClientSecret,
    ),
    COOKIE_SECRET: ecs.Secret.fromSecretsManager(appSecrets.cookieSecret),
  };
}
