import type { App } from 'aws-cdk-lib';
import type { StageConfig } from '../lib/config/stage-config.js';
import {
  RegistryStack,
  registryStackId,
} from '../lib/registry/registry-stack.js';

export function createRegistryStack(
  app: App,
  config: StageConfig,
): RegistryStack {
  return new RegistryStack(app, registryStackId(config.stage), { config });
}
