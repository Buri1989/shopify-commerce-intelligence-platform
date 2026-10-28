import type { Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { synthesizeOnMinimalVpc } from '../../test/synthesize-on-minimal-vpc.js';
import { importImmutableSecurityGroup } from './import-immutable-security-group.js';

describe('importImmutableSecurityGroup', () => {
  let template: Template;
  let source: ec2.SecurityGroup;
  let imported: ec2.ISecurityGroup;

  beforeAll(() => {
    template = synthesizeOnMinimalVpc((stack, vpc) => {
      source = new ec2.SecurityGroup(stack, 'SourceSecurityGroup', {
        vpc,
        allowAllOutbound: false,
      });
      imported = importImmutableSecurityGroup(stack, 'Imported', source);
      imported.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Ignored');
      imported.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Ignored');
    });
  });

  it('attaches the group it is given and creates none of its own', () => {
    expect(imported.securityGroupId).toBe(source.securityGroupId);
    template.resourceCountIs('AWS::EC2::SecurityGroup', 1);
  });

  it('ignores rules added through it, so the network stack stays the only writer of rules', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 0);
    template.resourceCountIs('AWS::EC2::SecurityGroupEgress', 0);
  });
});
