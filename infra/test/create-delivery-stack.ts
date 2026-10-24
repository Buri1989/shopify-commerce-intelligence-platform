import type { App } from 'aws-cdk-lib';
import type { StageConfig } from '../lib/config/stage-config.js';
import {
  DeliveryStack,
  deliveryStackId,
} from '../lib/delivery/delivery-stack.js';
import { createRegistryStack } from './create-registry-stack.js';

// The delivery stack grants push on the registry's repository, so the registry
// is built first in the same App, the way bin/app.ts does.
export function createDeliveryStack(
  app: App,
  config: StageConfig,
): DeliveryStack {
  const registry = createRegistryStack(app, config);
  return new DeliveryStack(app, deliveryStackId(config.stage), {
    config,
    repository: registry.repository,
  });
}
