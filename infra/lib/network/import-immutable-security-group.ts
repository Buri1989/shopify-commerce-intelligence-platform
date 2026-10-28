import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';

// Handed the real group, CDK would add duplicate rules to it inside the network
// stack's template; an immutable import attaches the group and changes nothing.
export function importImmutableSecurityGroup(
  scope: Construct,
  id: string,
  group: ec2.ISecurityGroup,
): ec2.ISecurityGroup {
  return ec2.SecurityGroup.fromSecurityGroupId(
    scope,
    id,
    group.securityGroupId,
    { mutable: false },
  );
}
