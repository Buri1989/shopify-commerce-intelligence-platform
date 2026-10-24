import * as iam from 'aws-cdk-lib/aws-iam';
import { GITHUB_TOKEN_AUDIENCE, GITHUB_TOKEN_ISSUER } from './github-token.js';

// StringEquals, so no wildcard can widen the rule.
export function createGithubTrust(
  provider: iam.IOidcProvider,
  subject: string,
): iam.IPrincipal {
  return new iam.OpenIdConnectPrincipal(provider, {
    StringEquals: {
      [`${GITHUB_TOKEN_ISSUER}:aud`]: GITHUB_TOKEN_AUDIENCE,
      [`${GITHUB_TOKEN_ISSUER}:sub`]: subject,
    },
  });
}
