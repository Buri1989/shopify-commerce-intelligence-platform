import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { GITHUB_TOKEN_AUDIENCE, GITHUB_TOKEN_ISSUER } from './github-token.js';

export function createGithubOidcProvider(
  scope: Construct,
): iam.OidcProviderNative {
  // The plain resource; the older construct deploys a Lambda for thumbprints AWS no longer needs.
  return new iam.OidcProviderNative(scope, 'GithubOidcProvider', {
    url: `https://${GITHUB_TOKEN_ISSUER}`,
    clientIds: [GITHUB_TOKEN_AUDIENCE],
  });
}
