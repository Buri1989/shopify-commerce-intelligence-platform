import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createAppStack } from './create-app-stack.js';
import { createTestApp } from './create-test-app.js';

export function synthesizeAppStack(
  config: StageConfig,
  imageTag: string,
): Template {
  return Template.fromStack(createAppStack(createTestApp(), config, imageTag));
}
