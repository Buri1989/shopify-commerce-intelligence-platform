import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createRegistryStack } from './create-registry-stack.js';
import { createTestApp } from './create-test-app.js';

export function synthesizeRegistryStack(config: StageConfig): Template {
  return Template.fromStack(createRegistryStack(createTestApp(), config));
}
