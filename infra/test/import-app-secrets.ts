import { Stack } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { AppSecrets } from '../lib/secrets/create-app-secrets.js';
import { createTestApp } from './create-test-app.js';

export const SHOPIFY_CLIENT_SECRET_ARN =
  'arn:aws:secretsmanager:eu-north-1:000000000000:secret:shopify-client-secret-AbCdEf';
export const COOKIE_SECRET_ARN =
  'arn:aws:secretsmanager:eu-north-1:000000000000:secret:cookie-secret-AbCdEf';

export function importAppSecrets(): AppSecrets {
  const stack = new Stack(createTestApp());
  return {
    shopifyClientSecret: secretsmanager.Secret.fromSecretCompleteArn(
      stack,
      'ShopifyClientSecret',
      SHOPIFY_CLIENT_SECRET_ARN,
    ),
    cookieSecret: secretsmanager.Secret.fromSecretCompleteArn(
      stack,
      'CookieSecret',
      COOKIE_SECRET_ARN,
    ),
  };
}
