import type { App } from 'aws-cdk-lib';
import type { StageConfig } from '../lib/config/stage-config.js';
import {
  MigrationStack,
  migrationStackId,
} from '../lib/migration/migration-stack.js';
import { createTaskStackProps } from './create-task-stack-props.js';

export function createMigrationStack(
  app: App,
  config: StageConfig,
  imageTag: string,
): MigrationStack {
  return new MigrationStack(
    app,
    migrationStackId(config.stage),
    createTaskStackProps(app, config, imageTag),
  );
}
