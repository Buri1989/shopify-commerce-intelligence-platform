import type { App } from 'aws-cdk-lib';
import type { TaskStackProps } from '../lib/app/task-stack-props.js';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createDataStack } from './create-data-stack.js';
import { createNetworkStack } from './create-network-stack.js';
import { createRegistryStack } from './create-registry-stack.js';

// Both task stacks read from the same three stacks, built first in the same
// App, the way bin/app.ts does.
export function createTaskStackProps(
  app: App,
  config: StageConfig,
  imageTag: string,
): TaskStackProps {
  const network = createNetworkStack(app, config);
  const data = createDataStack(app, config, network);
  const registry = createRegistryStack(app, config);
  return {
    config,
    vpc: network.vpc,
    securityGroups: network.securityGroups,
    repository: registry.repository,
    database: data.connection,
    imageTag,
  };
}
