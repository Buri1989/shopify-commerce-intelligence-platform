import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';

export function createCluster(
  scope: Construct,
  vpc: ec2.IVpc,
  config: StageConfig,
): ecs.Cluster {
  return new ecs.Cluster(scope, 'Cluster', {
    vpc,
    clusterName: `${PROJECT_NAME}-${config.stage}`,
    // Billed per metric; Phase 6 turns it on with the rest of the monitoring.
    containerInsightsV2: ecs.ContainerInsights.DISABLED,
  });
}
