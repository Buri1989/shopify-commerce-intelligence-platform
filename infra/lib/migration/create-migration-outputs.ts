import { CfnOutput, Fn } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as ecs from 'aws-cdk-lib/aws-ecs';
import type * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { resolveClusterName } from '../app/cluster-name.js';
import type { StageConfig } from '../config/stage-config.js';

export type MigrationOutputsOptions = {
  readonly taskDefinition: ecs.ITaskDefinition;
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly logGroup: logs.ILogGroup;
  readonly config: StageConfig;
};

// Everything the run step hands to `aws ecs run-task`, read from one outputs file.
export function createMigrationOutputs(
  scope: Construct,
  options: MigrationOutputsOptions,
): void {
  const { taskDefinition, vpc, securityGroup, logGroup, config } = options;
  new CfnOutput(scope, 'TaskDefinitionArn', {
    value: taskDefinition.taskDefinitionArn,
  });
  new CfnOutput(scope, 'ClusterName', { value: resolveClusterName(config) });
  new CfnOutput(scope, 'SubnetIds', {
    value: Fn.join(
      ',',
      vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS })
        .subnetIds,
    ),
  });
  new CfnOutput(scope, 'SecurityGroupId', {
    value: securityGroup.securityGroupId,
  });
  new CfnOutput(scope, 'LogGroupName', { value: logGroup.logGroupName });
}
