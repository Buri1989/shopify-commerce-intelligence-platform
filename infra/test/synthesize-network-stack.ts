import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createNetworkStack } from './create-network-stack.js';
import { createTestApp } from './create-test-app.js';

export function synthesizeNetworkStack(config: StageConfig): Template {
  return Template.fromStack(createNetworkStack(createTestApp(), config));
}
