import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createSecretsStack } from './create-secrets-stack.js';
import { createTestApp } from './create-test-app.js';

export function synthesizeSecretsStack(config: StageConfig): Template {
  return Template.fromStack(createSecretsStack(createTestApp(), config));
}
