import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import { NetworkStack, networkStackId } from '../lib/network/network-stack.js';
import { createTestApp } from './create-test-app.js';

export function synthesizeNetworkStack(config: StageConfig): Template {
  const app = createTestApp();
  const stack = new NetworkStack(app, networkStackId(config.stage), { config });
  return Template.fromStack(stack);
}
