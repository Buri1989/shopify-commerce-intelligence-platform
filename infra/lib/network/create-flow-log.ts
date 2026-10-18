import { RemovalPolicy } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';

export type FlowLogOptions = {
  readonly stage: string;
  readonly retentionDays: number;
};

export function createRejectFlowLog(
  scope: Construct,
  vpc: ec2.IVpc,
  options: FlowLogOptions,
): ec2.FlowLog {
  const logGroup = new logs.LogGroup(scope, 'VpcFlowLogGroup', {
    logGroupName: `/${PROJECT_NAME}/${options.stage}/vpc-flow-logs`,
    retention: options.retentionDays,
    // A diagnostic log for a development network; it goes away with the stack.
    removalPolicy: RemovalPolicy.DESTROY,
  });
  return new ec2.FlowLog(scope, 'VpcRejectFlowLog', {
    resourceType: ec2.FlowLogResourceType.fromVpc(vpc),
    // Rejected traffic is the signal that a security group rule is wrong;
    // accepted traffic would mostly be health checks.
    trafficType: ec2.FlowLogTrafficType.REJECT,
    // A reject shows up within a minute instead of ten while someone is debugging.
    maxAggregationInterval: ec2.FlowLogMaxAggregationInterval.ONE_MINUTE,
    destination: ec2.FlowLogDestination.toCloudWatchLogs(logGroup),
  });
}
