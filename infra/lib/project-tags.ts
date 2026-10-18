import { Tags } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';
import { PROJECT_NAME } from './config/project-name.js';

export function applyProjectTags(scope: IConstruct, stage: string): void {
  Tags.of(scope).add('project', PROJECT_NAME);
  Tags.of(scope).add('stage', stage);
  Tags.of(scope).add('managed-by', 'cdk');
}
