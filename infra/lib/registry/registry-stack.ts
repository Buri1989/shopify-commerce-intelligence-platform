import { CfnOutput, Stack } from 'aws-cdk-lib';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import { applyProjectTags } from '../project-tags.js';
import { createRepository } from './create-repository.js';

export type RegistryStackProps = {
  readonly config: StageConfig;
};

export class RegistryStack extends Stack {
  readonly repository: ecr.Repository;

  constructor(scope: Construct, id: string, props: RegistryStackProps) {
    super(scope, id, {
      env: { region: props.config.region },
      // The repository is retained under a fixed name, so a deleted stack cannot
      // be recreated; its images are also the rollback targets.
      terminationProtection: true,
    });
    this.repository = createRepository(this, props.config.stage);
    new CfnOutput(this, 'RepositoryUri', {
      value: this.repository.repositoryUri,
    });
    applyProjectTags(this, props.config.stage);
  }
}

export function registryStackId(stage: string): string {
  return `${PROJECT_NAME}-${stage}-registry`;
}
