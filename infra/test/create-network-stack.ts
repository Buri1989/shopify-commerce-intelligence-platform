import type { App } from 'aws-cdk-lib';
import type { StageConfig } from '../lib/config/stage-config.js';
import { NetworkStack, networkStackId } from '../lib/network/network-stack.js';

export function createNetworkStack(
  app: App,
  config: StageConfig,
): NetworkStack {
  return new NetworkStack(app, networkStackId(config.stage), { config });
}
