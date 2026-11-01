import type * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { resolveClusterName } from '../app/cluster-name.js';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import { formatBootstrapRoleArn } from './bootstrap-roles.js';
import { createGithubTrust } from './create-github-trust.js';
import {
  grantMigrationRun,
  type MigrationTask,
} from './grant-migration-run.js';

export type DeployRoleOptions = {
  readonly provider: iam.IOidcProvider;
  readonly repository: ecr.IRepository;
  readonly migration: MigrationTask;
  readonly config: StageConfig;
};

export function createDeployRole(
  scope: Construct,
  options: DeployRoleOptions,
): iam.Role {
  const { provider, repository, migration, config } = options;
  const role = new iam.Role(scope, 'DeployRole', {
    roleName: `${PROJECT_NAME}-${config.stage}-github-deploy`,
    assumedBy: createGithubTrust(
      provider,
      `repo:${config.githubRepositoryIdentity}:ref:refs/heads/main`,
    ),
  });
  // No image-publishing role: the image is pushed through the grant below, not as a CDK asset.
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['sts:AssumeRole'],
      resources: [
        formatBootstrapRoleArn(scope, 'deploy'),
        formatBootstrapRoleArn(scope, 'file-publishing'),
        formatBootstrapRoleArn(scope, 'lookup'),
      ],
    }),
  );
  // buildx reads existing manifests while it pushes.
  repository.grantPullPush(role);
  grantMigrationRun(role, migration, resolveClusterName(config));
  return role;
}
