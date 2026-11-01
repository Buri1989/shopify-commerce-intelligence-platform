import { App } from 'aws-cdk-lib';
import { AppStack, appStackId } from '../lib/app/app-stack.js';
import type { TaskStackProps } from '../lib/app/task-stack-props.js';
import { resolveImageTag } from '../lib/config/image-tag.js';
import { resolveStageConfig } from '../lib/config/stage-config.js';
import { DataStack, dataStackId } from '../lib/data/data-stack.js';
import {
  DeliveryStack,
  deliveryStackId,
} from '../lib/delivery/delivery-stack.js';
import {
  MigrationStack,
  migrationStackId,
} from '../lib/migration/migration-stack.js';
import { NetworkStack, networkStackId } from '../lib/network/network-stack.js';
import {
  RegistryStack,
  registryStackId,
} from '../lib/registry/registry-stack.js';

const DEFAULT_STAGE = 'dev';

const app = new App();
const stage: string = app.node.tryGetContext('stage') ?? DEFAULT_STAGE;
const config = resolveStageConfig(stage);
const imageTag = resolveImageTag(app.node);

const network = new NetworkStack(app, networkStackId(config.stage), { config });
const data = new DataStack(app, dataStackId(config.stage), {
  config,
  vpc: network.vpc,
  securityGroup: network.securityGroups.data,
});
const registry = new RegistryStack(app, registryStackId(config.stage), {
  config,
});
const taskStackProps: TaskStackProps = {
  config,
  vpc: network.vpc,
  securityGroups: network.securityGroups,
  repository: registry.repository,
  database: data.connection,
  imageTag,
};
const migration = new MigrationStack(
  app,
  migrationStackId(config.stage),
  taskStackProps,
);
new DeliveryStack(app, deliveryStackId(config.stage), {
  config,
  repository: registry.repository,
  migration,
});
new AppStack(app, appStackId(config.stage), taskStackProps);
