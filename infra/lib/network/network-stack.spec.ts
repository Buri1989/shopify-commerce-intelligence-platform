import { Match, type Template } from 'aws-cdk-lib/assertions';
import { createNetworkStack } from '../../test/create-network-stack.js';
import { createTestApp } from '../../test/create-test-app.js';
import { readValidationViolations } from '../../test/read-validation-violations.js';
import { synthesizeNetworkStack } from '../../test/synthesize-network-stack.js';
import {
  findDefaultRoutes,
  findInboundRules,
  findOnlyResourceId,
  findOutboundRules,
  findRouteTableIdsOfTier,
  findSubnetIdsOfTier,
  readResourceProperties,
  securityGroupIdAttribute,
} from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const devConfig = resolveStageConfig('dev');

describe('NetworkStack', () => {
  describe('VPC', () => {
    let template: Template;

    beforeAll(() => {
      template = synthesizeNetworkStack(devConfig);
    });

    it('creates one VPC with the stage CIDR, DNS enabled and the stage name', () => {
      template.resourceCountIs('AWS::EC2::VPC', 1);
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.0.0.0/16',
        EnableDnsSupport: true,
        EnableDnsHostnames: true,
        Tags: Match.arrayWith([
          { Key: 'Name', Value: 'commerce-intelligence-dev' },
        ]),
      });
    });

    it('creates two subnets per tier at the documented addresses, one per zone', () => {
      template.resourceCountIs('AWS::EC2::Subnet', 6);
      const expectedSubnets = [
        { tier: 'Public', cidr: '10.0.0.0/24', zone: 'eu-north-1a' },
        { tier: 'Public', cidr: '10.0.1.0/24', zone: 'eu-north-1b' },
        { tier: 'Private', cidr: '10.0.16.0/20', zone: 'eu-north-1a' },
        { tier: 'Private', cidr: '10.0.32.0/20', zone: 'eu-north-1b' },
        { tier: 'Isolated', cidr: '10.0.64.0/24', zone: 'eu-north-1a' },
        { tier: 'Isolated', cidr: '10.0.65.0/24', zone: 'eu-north-1b' },
      ];
      for (const { tier, cidr, zone } of expectedSubnets) {
        template.hasResourceProperties('AWS::EC2::Subnet', {
          CidrBlock: cidr,
          AvailabilityZone: zone,
          Tags: Match.arrayWith([{ Key: 'aws-cdk:subnet-type', Value: tier }]),
        });
      }
    });

    it('does not auto-assign public IPs in the public subnets', () => {
      const publicSubnetIds = findSubnetIdsOfTier(template, 'Public');
      expect(publicSubnetIds).toHaveLength(2);
      for (const subnetId of publicSubnetIds) {
        expect(
          readResourceProperties(template, subnetId).MapPublicIpOnLaunch,
        ).toBe(false);
      }
    });

    it('attaches one Internet Gateway to the VPC', () => {
      template.resourceCountIs('AWS::EC2::InternetGateway', 1);
      template.resourceCountIs('AWS::EC2::VPCGatewayAttachment', 1);
      template.hasResourceProperties('AWS::EC2::VPCGatewayAttachment', {
        InternetGatewayId: {
          Ref: findOnlyResourceId(template, 'AWS::EC2::InternetGateway'),
        },
        VpcId: { Ref: findOnlyResourceId(template, 'AWS::EC2::VPC') },
      });
    });

    it('gives every subnet its own route table', () => {
      template.resourceCountIs('AWS::EC2::RouteTable', 6);
      template.resourceCountIs('AWS::EC2::SubnetRouteTableAssociation', 6);
    });

    it('routes public subnets to the Internet Gateway', () => {
      const internetGatewayId = findOnlyResourceId(
        template,
        'AWS::EC2::InternetGateway',
      );
      for (const routeTableId of findRouteTableIdsOfTier(template, 'Public')) {
        expect(findDefaultRoutes(template, routeTableId)).toEqual([
          expect.objectContaining({ GatewayId: { Ref: internetGatewayId } }),
        ]);
      }
    });

    it('creates one NAT instance of the configured type in a public subnet with a public IP', () => {
      template.resourceCountIs('AWS::EC2::Instance', 1);
      template.resourceCountIs('AWS::EC2::NatGateway', 0);
      template.resourceCountIs('AWS::EC2::EIP', 0);
      const natInstance = readResourceProperties(
        template,
        findOnlyResourceId(template, 'AWS::EC2::Instance'),
      );
      expect(natInstance.InstanceType).toBe('t4g.micro');
      expect(natInstance.SourceDestCheck).toBe(false);
      expect(natInstance.KeyName).toBeUndefined();
      expect(natInstance.NetworkInterfaces).toEqual([
        expect.objectContaining({ AssociatePublicIpAddress: true }),
      ]);
      expect(findSubnetIdsOfTier(template, 'Public')).toContain(
        natInstance.NetworkInterfaces[0].SubnetId.Ref,
      );
    });

    it('boots the NAT instance from the image pinned in the stage config, set up to forward', () => {
      template.hasResourceProperties('AWS::EC2::Instance', {
        ImageId: devConfig.natInstanceAmiId,
        UserData: {
          'Fn::Base64': Match.stringLikeRegexp(
            'ip_forward=1[\\s\\S]*MASQUERADE',
          ),
        },
      });
      expect(
        template.findParameters('*', {
          Type: 'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>',
        }),
      ).toEqual({});
    });

    it('lets the NAT instance forward traffic from the VPC only, and only HTTPS and HTTP out', () => {
      expect(findInboundRules(template, 'VpcNatSecurityGroup')).toEqual([
        expect.objectContaining({ IpProtocol: '-1', CidrIp: '10.0.0.0/16' }),
      ]);
      expect(findOutboundRules(template, 'VpcNatSecurityGroup')).toEqual([
        expect.objectContaining({
          IpProtocol: 'tcp',
          FromPort: 443,
          ToPort: 443,
          CidrIp: '0.0.0.0/0',
        }),
        expect.objectContaining({
          IpProtocol: 'tcp',
          FromPort: 80,
          ToPort: 80,
          CidrIp: '0.0.0.0/0',
        }),
      ]);
    });

    it('requires IMDSv2 on the NAT instance and allows Session Manager instead of SSH', () => {
      template.resourceCountIs('AWS::EC2::LaunchTemplate', 1);
      template.hasResourceProperties('AWS::EC2::LaunchTemplate', {
        LaunchTemplateData: { MetadataOptions: { HttpTokens: 'required' } },
      });
      template.hasResourceProperties('AWS::EC2::Instance', {
        LaunchTemplate: Match.objectLike({ Version: Match.anyValue() }),
      });
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [
            Match.objectLike({ Principal: { Service: 'ec2.amazonaws.com' } }),
          ],
        },
        ManagedPolicyArns: [
          {
            'Fn::Join': [
              '',
              Match.arrayWith([
                ':iam::aws:policy/AmazonSSMManagedInstanceCore',
              ]),
            ],
          },
        ],
      });
    });

    it('routes private subnets to the NAT instance', () => {
      const natInstanceId = findOnlyResourceId(template, 'AWS::EC2::Instance');
      for (const routeTableId of findRouteTableIdsOfTier(template, 'Private')) {
        expect(findDefaultRoutes(template, routeTableId)).toEqual([
          expect.objectContaining({ InstanceId: { Ref: natInstanceId } }),
        ]);
      }
    });

    it('replaces the NAT instance, rather than restarting it, when its type changes', () => {
      const withAnotherType = synthesizeNetworkStack({
        ...devConfig,
        natInstanceType: 't4g.small',
      });
      expect(
        findOnlyResourceId(withAnotherType, 'AWS::EC2::Instance'),
      ).not.toBe(findOnlyResourceId(template, 'AWS::EC2::Instance'));
    });

    it('leaves isolated subnets without a default route', () => {
      const isolatedRouteTableIds = findRouteTableIdsOfTier(
        template,
        'Isolated',
      );
      expect(isolatedRouteTableIds).toHaveLength(2);
      for (const routeTableId of isolatedRouteTableIds) {
        expect(findDefaultRoutes(template, routeTableId)).toEqual([]);
      }
    });

    it('attaches a free S3 gateway endpoint to the private route tables only', () => {
      template.resourceCountIs('AWS::EC2::VPCEndpoint', 1);
      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        VpcEndpointType: 'Gateway',
        ServiceName: { 'Fn::Join': ['', Match.arrayWith(['.s3'])] },
      });
      const endpoint = readResourceProperties(
        template,
        findOnlyResourceId(template, 'AWS::EC2::VPCEndpoint'),
      );
      const attachedRouteTableIds = endpoint.RouteTableIds.map(
        (routeTable: { Ref: string }) => routeTable.Ref,
      );
      expect(attachedRouteTableIds.sort()).toEqual(
        findRouteTableIdsOfTier(template, 'Private').sort(),
      );
    });

    it('restricts the default security group', () => {
      template.resourceCountIs('Custom::VpcRestrictDefaultSG', 1);
    });
  });

  describe('with one NAT instance per zone', () => {
    it('routes each private subnet to the instance in its own zone', () => {
      const template = synthesizeNetworkStack({
        ...devConfig,
        natGatewayCount: 2,
      });
      template.resourceCountIs('AWS::EC2::Instance', 2);
      const natInstanceIdsRoutedTo = findRouteTableIdsOfTier(
        template,
        'Private',
      ).map(
        (routeTableId) =>
          findDefaultRoutes(template, routeTableId)[0].InstanceId.Ref,
      );
      expect(new Set(natInstanceIdsRoutedTo).size).toBe(2);
    });
  });

  describe('security groups', () => {
    it('creates the three perimeter groups and the NAT group in the VPC', () => {
      const template = synthesizeNetworkStack(devConfig);
      template.resourceCountIs('AWS::EC2::SecurityGroup', 4);
      template.allResourcesProperties('AWS::EC2::SecurityGroup', {
        VpcId: { Ref: findOnlyResourceId(template, 'AWS::EC2::VPC') },
      });
    });
  });

  describe('flow log', () => {
    it('logs rejected traffic to a log group named after the stage', () => {
      const template = synthesizeNetworkStack(devConfig);
      template.hasResourceProperties('AWS::EC2::FlowLog', {
        TrafficType: 'REJECT',
      });
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/commerce-intelligence/dev/vpc-flow-logs',
        RetentionInDays: 14,
      });
    });
  });

  describe('tags', () => {
    it('tags the VPC with the project, the stage and the tool', () => {
      const template = synthesizeNetworkStack(devConfig);
      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([
          { Key: 'managed-by', Value: 'cdk' },
          { Key: 'project', Value: 'commerce-intelligence' },
          { Key: 'stage', Value: 'dev' },
        ]),
      });
    });
  });

  describe('outputs', () => {
    it('publishes the VPC id and the three security group ids', () => {
      const template = synthesizeNetworkStack(devConfig);
      template.hasOutput('VpcId', {
        Value: { Ref: findOnlyResourceId(template, 'AWS::EC2::VPC') },
      });
      template.hasOutput('AlbSecurityGroupId', {
        Value: securityGroupIdAttribute(template, 'AlbSecurityGroup'),
      });
      template.hasOutput('AppSecurityGroupId', {
        Value: securityGroupIdAttribute(template, 'AppSecurityGroup'),
      });
      template.hasOutput('DataSecurityGroupId', {
        Value: securityGroupIdAttribute(template, 'DataSecurityGroup'),
      });
    });
  });

  describe('deletion', () => {
    it('refuses deletion until termination protection is turned off', () => {
      const stack = createNetworkStack(createTestApp(), devConfig);
      expect(stack.terminationProtection).toBe(true);
    });
  });

  describe('validation', () => {
    it('leaves no validation finding unacknowledged', () => {
      const app = createTestApp();
      createNetworkStack(app, devConfig);
      expect(readValidationViolations(app)).toEqual([]);
    });
  });
});
