import { Duration } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import type * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/stage-config.js';

export type ServiceOptions = {
  readonly cluster: ecs.ICluster;
  readonly taskDefinition: ecs.FargateTaskDefinition;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly targetGroup: elbv2.ApplicationTargetGroup;
  readonly config: StageConfig;
};

export function createService(
  scope: Construct,
  options: ServiceOptions,
): ecs.FargateService {
  const { cluster, taskDefinition, securityGroup, targetGroup, config } =
    options;
  const service = new ecs.FargateService(scope, 'Service', {
    cluster,
    taskDefinition,
    desiredCount: config.desiredCount,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
    securityGroups: [securityGroup],
    assignPublicIp: false,
    // The new task is healthy before the old one stops, even with one task.
    minHealthyPercent: 100,
    maxHealthyPercent: 200,
    // A task definition whose tasks never pass the health check is rolled
    // back by ECS itself.
    circuitBreaker: { enable: true, rollback: true },
    healthCheckGracePeriod: Duration.seconds(60),
  });
  targetGroup.addTarget(service);
  return service;
}
