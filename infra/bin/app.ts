import { App } from 'aws-cdk-lib';
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

new NetworkStack(app, networkStackId(config.stage), { config });
new RegistryStack(app, registryStackId(config.stage), { config });
