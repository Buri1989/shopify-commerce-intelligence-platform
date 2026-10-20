import { Duration } from 'aws-cdk-lib';
import type * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/stage-config.js';
import { HTTPS_PORT } from '../network/ports.js';

export type LoadBalancerOptions = {
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly certificate: acm.ICertificate;
  readonly config: StageConfig;
};

export type ApiLoadBalancer = {
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  readonly targetGroup: elbv2.ApplicationTargetGroup;
};

export function createLoadBalancer(
  scope: Construct,
  options: LoadBalancerOptions,
): ApiLoadBalancer {
  const { vpc, securityGroup, certificate, config } = options;
  const loadBalancer = new elbv2.ApplicationLoadBalancer(
    scope,
    'LoadBalancer',
    {
      vpc,
      internetFacing: true,
      securityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      deletionProtection: false,
      dropInvalidHeaderFields: true,
      // CDK's default, written out because the app's keep-alive timeout in
      // src/common/http/configure-for-load-balancer.ts must stay above it.
      idleTimeout: Duration.seconds(60),
    },
  );
  const targetGroup = createTargetGroup(scope, vpc, config);
  // open: false on both listeners: the alb group from Task 1.2 already allows
  // 80 and 443, and this stack must not add rules to it.
  loadBalancer.addRedirect({ open: false });
  loadBalancer.addListener('Https', {
    port: HTTPS_PORT,
    certificates: [certificate],
    defaultTargetGroups: [targetGroup],
    open: false,
  });
  return { loadBalancer, targetGroup };
}

function createTargetGroup(
  scope: Construct,
  vpc: ec2.IVpc,
  config: StageConfig,
): elbv2.ApplicationTargetGroup {
  return new elbv2.ApplicationTargetGroup(scope, 'AppTargetGroup', {
    vpc,
    // Fargate tasks register by address, not by instance.
    targetType: elbv2.TargetType.IP,
    protocol: elbv2.ApplicationProtocol.HTTP,
    port: config.applicationPort,
    // The default of five minutes would make every deploy wait that long per old task.
    deregistrationDelay: Duration.seconds(30),
    healthCheck: {
      // Readiness, not liveness: the balancer is asking "may I send traffic".
      path: '/ready',
      interval: Duration.seconds(15),
      timeout: Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    },
  });
}
