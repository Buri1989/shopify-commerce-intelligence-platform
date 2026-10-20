import { CfnOutput } from 'aws-cdk-lib';
import type * as ecs from 'aws-cdk-lib/aws-ecs';
import type * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/stage-config.js';

export type AppOutputsOptions = {
  readonly loadBalancer: elbv2.ILoadBalancerV2;
  readonly cluster: ecs.ICluster;
  readonly service: ecs.IService;
  readonly logGroup: logs.ILogGroup;
  readonly config: StageConfig;
};

export function createAppOutputs(
  scope: Construct,
  options: AppOutputsOptions,
): void {
  const { loadBalancer, cluster, service, logGroup, config } = options;
  new CfnOutput(scope, 'ApiUrl', { value: `https://${config.apiDomainName}` });
  new CfnOutput(scope, 'LoadBalancerDnsName', {
    value: loadBalancer.loadBalancerDnsName,
  });
  new CfnOutput(scope, 'ClusterName', { value: cluster.clusterName });
  new CfnOutput(scope, 'ServiceName', { value: service.serviceName });
  new CfnOutput(scope, 'LogGroupName', { value: logGroup.logGroupName });
}
