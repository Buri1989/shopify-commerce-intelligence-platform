import { CfnOutput, Stack } from 'aws-cdk-lib';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import { applyProjectTags } from '../project-tags.js';
import { createDeployRole } from './create-deploy-role.js';
import { createGithubOidcProvider } from './create-github-oidc-provider.js';
import { createPullRequestRole } from './create-pull-request-role.js';

export type DeliveryStackProps = {
  readonly config: StageConfig;
  readonly repository: ecr.IRepository;
};

export class DeliveryStack extends Stack {
  constructor(scope: Construct, id: string, props: DeliveryStackProps) {
    super(scope, id, {
      env: { region: props.config.region },
      // Nothing runs here, but without it no pipeline run can log in.
      terminationProtection: true,
    });
    const provider = createGithubOidcProvider(this);
    const pullRequestRole = createPullRequestRole(this, {
      provider,
      config: props.config,
    });
    const deployRole = createDeployRole(this, {
      provider,
      repository: props.repository,
      config: props.config,
    });
    new CfnOutput(this, 'PullRequestRoleArn', {
      value: pullRequestRole.roleArn,
    });
    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
    applyProjectTags(this, props.config.stage);
  }
}

export function deliveryStackId(stage: string): string {
  return `${PROJECT_NAME}-${stage}-delivery`;
}
