import type * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { createStageLogGroup } from '../app/create-stage-log-group.js';
import type { StageConfig } from '../config/stage-config.js';

export function createMigrationLogGroup(
  scope: Construct,
  config: StageConfig,
): logs.LogGroup {
  return createStageLogGroup(scope, 'MigrationLogGroup', 'migration', config);
}
