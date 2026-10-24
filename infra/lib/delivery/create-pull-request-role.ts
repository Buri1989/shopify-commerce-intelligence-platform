import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import { formatBootstrapRoleArn } from './bootstrap-roles.js';
import { createGithubTrust } from './create-github-trust.js';

export type PullRequestRoleOptions = {
  readonly provider: iam.IOidcProvider;
  readonly config: StageConfig;
};

export function createPullRequestRole(
  scope: Construct,
  options: PullRequestRoleOptions,
): iam.Role {
  const { provider, config } = options;
  const role = new iam.Role(scope, 'PullRequestRole', {
    roleName: `${PROJECT_NAME}-${config.stage}-github-pull-request`,
    assumedBy: createGithubTrust(
      provider,
      `repo:${config.githubRepositoryIdentity}:pull_request`,
    ),
  });
  // cdk diff --method template needs the lookup role only.
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [formatBootstrapRoleArn(scope, 'lookup')],
    }),
  );
  return role;
}
