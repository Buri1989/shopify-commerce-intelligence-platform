import { RemovalPolicy } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';

export function createAppLogGroup(
  scope: Construct,
  config: StageConfig,
): logs.LogGroup {
  return new logs.LogGroup(scope, 'AppLogGroup', {
    logGroupName: `/${PROJECT_NAME}/${config.stage}/app`,
    retention: config.logRetentionDays,
    // Development logs go away with the stack.
    removalPolicy: RemovalPolicy.DESTROY,
  });
}
