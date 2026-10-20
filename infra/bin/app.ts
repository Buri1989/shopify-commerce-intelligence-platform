import { App } from 'aws-cdk-lib';
import { AppStack, appStackId } from '../lib/app/app-stack.js';
import { resolveImageTag } from '../lib/config/image-tag.js';
import { resolveStageConfig } from '../lib/config/stage-config.js';
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
const registry = new RegistryStack(app, registryStackId(config.stage), {
  config,
});
new AppStack(app, appStackId(config.stage), {
  config,
  vpc: network.vpc,
  securityGroups: network.securityGroups,
  repository: registry.repository,
  imageTag,
});
