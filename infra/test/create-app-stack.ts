import type { App } from 'aws-cdk-lib';
import { AppStack, appStackId } from '../lib/app/app-stack.js';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createNetworkStack } from './create-network-stack.js';
import { createRegistryStack } from './create-registry-stack.js';

// The app stack reads from the other two, so they are built first in the same
// App, the way bin/app.ts does.
export function createAppStack(
  app: App,
  config: StageConfig,
  imageTag: string,
): AppStack {
  const network = createNetworkStack(app, config);
  const registry = createRegistryStack(app, config);
  return new AppStack(app, appStackId(config.stage), {
    config,
    vpc: network.vpc,
    securityGroups: network.securityGroups,
    repository: registry.repository,
    imageTag,
  });
}
