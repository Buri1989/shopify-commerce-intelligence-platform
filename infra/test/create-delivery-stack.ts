import type { App } from 'aws-cdk-lib';
import type { StageConfig } from '../lib/config/stage-config.js';
import {
  DeliveryStack,
  deliveryStackId,
} from '../lib/delivery/delivery-stack.js';
import {
  MigrationStack,
  migrationStackId,
} from '../lib/migration/migration-stack.js';
import { createTaskStackProps } from './create-task-stack-props.js';

const ANY_IMAGE_TAG = 'abc123';

// The delivery stack grants on the registry's repository and on the migration
// stack's task, so both are built first in the same App, the way bin/app.ts does.
export function createDeliveryStack(
  app: App,
  config: StageConfig,
): DeliveryStack {
  const taskStackProps = createTaskStackProps(app, config, ANY_IMAGE_TAG);
  const migration = new MigrationStack(
    app,
    migrationStackId(config.stage),
    taskStackProps,
  );
  return new DeliveryStack(app, deliveryStackId(config.stage), {
    config,
    repository: taskStackProps.repository,
    migration,
  });
}
