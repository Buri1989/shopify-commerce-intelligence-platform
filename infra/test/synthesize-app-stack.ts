import { Template } from 'aws-cdk-lib/assertions';
import { AppStack, appStackId } from '../lib/app/app-stack.js';
import type { StageConfig } from '../lib/config/stage-config.js';
import { NetworkStack, networkStackId } from '../lib/network/network-stack.js';
import {
  RegistryStack,
  registryStackId,
} from '../lib/registry/registry-stack.js';
import { createTestApp } from './create-test-app.js';

// The app stack reads from the other two, so the fixture builds all three the
// way bin/app.ts does and returns only the app's template.
export function synthesizeAppStack(
  config: StageConfig,
  imageTag: string,
): Template {
  const app = createTestApp();
  const network = new NetworkStack(app, networkStackId(config.stage), {
    config,
  });
  const registry = new RegistryStack(app, registryStackId(config.stage), {
    config,
  });
  const stack = new AppStack(app, appStackId(config.stage), {
    config,
    vpc: network.vpc,
    securityGroups: network.securityGroups,
    repository: registry.repository,
    imageTag,
  });
  return Template.fromStack(stack);
}
