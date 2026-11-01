import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createMigrationStack } from './create-migration-stack.js';
import { createTestApp } from './create-test-app.js';

export function synthesizeMigrationStack(
  config: StageConfig,
  imageTag: string,
): Template {
  return Template.fromStack(
    createMigrationStack(createTestApp(), config, imageTag),
  );
}
