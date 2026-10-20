import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import {
  RegistryStack,
  registryStackId,
} from '../lib/registry/registry-stack.js';

export function synthesizeRegistryStack(config: StageConfig): Template {
  const app = new App();
  const stack = new RegistryStack(app, registryStackId(config.stage), {
    config,
  });
  return Template.fromStack(stack);
}
