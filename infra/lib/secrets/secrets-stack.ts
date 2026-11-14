import { Stack } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import { applyProjectTags } from '../project-tags.js';
import { type AppSecrets, createAppSecrets } from './create-app-secrets.js';

export type SecretsStackProps = {
  readonly config: StageConfig;
};

export class SecretsStack extends Stack {
  readonly appSecrets: AppSecrets;

  constructor(scope: Construct, id: string, props: SecretsStackProps) {
    super(scope, id, {
      env: { region: props.config.region },
      terminationProtection: true,
    });
    this.appSecrets = createAppSecrets(this, props.config.stage);
    applyProjectTags(this, props.config.stage);
  }
}

export function secretsStackId(stage: string): string {
  return `${PROJECT_NAME}-${stage}-secrets`;
}
