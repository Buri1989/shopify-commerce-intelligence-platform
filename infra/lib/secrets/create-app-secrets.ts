import { RemovalPolicy } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';

export type AppSecrets = {
  readonly shopifyClientSecret: secretsmanager.ISecret;
  readonly cookieSecret: secretsmanager.ISecret;
};

export function createAppSecrets(scope: Construct, stage: string): AppSecrets {
  return {
    shopifyClientSecret: createGeneratedSecret(
      scope,
      'ShopifyClientSecret',
      `${PROJECT_NAME}-${stage}/shopify-client-secret`,
    ),
    cookieSecret: createGeneratedSecret(
      scope,
      'CookieSecret',
      `${PROJECT_NAME}-${stage}/cookie-secret`,
    ),
  };
}

function createGeneratedSecret(
  scope: Construct,
  id: string,
  secretName: string,
): secretsmanager.Secret {
  return new secretsmanager.Secret(scope, id, {
    secretName,
    removalPolicy: RemovalPolicy.DESTROY,
  });
}
