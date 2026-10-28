import type { App } from 'aws-cdk-lib';
import type { StageConfig } from '../lib/config/stage-config.js';
import { DataStack, dataStackId } from '../lib/data/data-stack.js';
import type { NetworkStack } from '../lib/network/network-stack.js';

// Takes the network stack it reads from, the way bin/app.ts hands it over, so a
// fixture that builds several stacks builds the network once.
export function createDataStack(
  app: App,
  config: StageConfig,
  network: NetworkStack,
): DataStack {
  return new DataStack(app, dataStackId(config.stage), {
    config,
    vpc: network.vpc,
    securityGroup: network.securityGroups.data,
  });
}
