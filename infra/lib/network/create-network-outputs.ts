import { CfnOutput } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import type { PerimeterSecurityGroups } from './perimeter-security-groups.js';

export function createNetworkOutputs(
  scope: Construct,
  vpc: ec2.IVpc,
  securityGroups: PerimeterSecurityGroups,
): void {
  new CfnOutput(scope, 'VpcId', { value: vpc.vpcId });
  new CfnOutput(scope, 'AlbSecurityGroupId', {
    value: securityGroups.alb.securityGroupId,
  });
  new CfnOutput(scope, 'AppSecurityGroupId', {
    value: securityGroups.app.securityGroupId,
  });
  new CfnOutput(scope, 'DataSecurityGroupId', {
    value: securityGroups.data.securityGroupId,
  });
}
