import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createDeliveryStack } from './create-delivery-stack.js';
import { createTestApp } from './create-test-app.js';

export function synthesizeDeliveryStack(config: StageConfig): Template {
  return Template.fromStack(createDeliveryStack(createTestApp(), config));
}
