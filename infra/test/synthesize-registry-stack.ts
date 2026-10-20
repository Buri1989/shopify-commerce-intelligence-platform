import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import {
  RegistryStack,
  registryStackId,
} from '../lib/registry/registry-stack.js';
import { createTestApp } from './create-test-app.js';

export function synthesizeRegistryStack(config: StageConfig): Template {
  const app = createTestApp();
  const stack = new RegistryStack(app, registryStackId(config.stage), {
    config,
  });
  return Template.fromStack(stack);
}
