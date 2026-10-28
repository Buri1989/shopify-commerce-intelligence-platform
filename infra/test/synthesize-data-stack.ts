import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createDataStack } from './create-data-stack.js';
import { createNetworkStack } from './create-network-stack.js';
import { createTestApp } from './create-test-app.js';

export function synthesizeDataStack(config: StageConfig): Template {
  const app = createTestApp();
  const network = createNetworkStack(app, config);
  return Template.fromStack(createDataStack(app, config, network));
}
