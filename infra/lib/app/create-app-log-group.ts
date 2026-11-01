import type * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/stage-config.js';
import { createStageLogGroup } from './create-stage-log-group.js';

export function createAppLogGroup(
  scope: Construct,
  config: StageConfig,
): logs.LogGroup {
  return createStageLogGroup(scope, 'AppLogGroup', 'app', config);
}
