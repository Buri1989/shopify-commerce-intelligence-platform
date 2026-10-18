import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeNetworkStack } from '../../test/synthesize-network-stack.js';
import {
  findDefaultRoutes,
  findOnlyResourceId,
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

    it('creates one NAT Gateway with an Elastic IP in a public subnet', () => {
      template.resourceCountIs('AWS::EC2::NatGateway', 1);
      template.resourceCountIs('AWS::EC2::EIP', 1);
      const natGateway = readResourceProperties(
        template,
        findOnlyResourceId(template, 'AWS::EC2::NatGateway'),
      );
      expect(natGateway.AllocationId).toEqual({
        'Fn::GetAtt': [
          findOnlyResourceId(template, 'AWS::EC2::EIP'),
          'AllocationId',
        ],
      });
      expect(findSubnetIdsOfTier(template, 'Public')).toContain(
        natGateway.SubnetId.Ref,
      );
    });

    it('routes private subnets to the NAT Gateway', () => {
      const natGatewayId = findOnlyResourceId(template, 'AWS::EC2::NatGateway');
      for (const routeTableId of findRouteTableIdsOfTier(template, 'Private')) {
        expect(findDefaultRoutes(template, routeTableId)).toEqual([
          expect.objectContaining({ NatGatewayId: { Ref: natGatewayId } }),
        ]);
      }
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

  describe('with one NAT Gateway per zone', () => {
    it('routes each private subnet to the gateway in its own zone', () => {
      const template = synthesizeNetworkStack({
        ...devConfig,
        natGatewayCount: 2,
      });
      template.resourceCountIs('AWS::EC2::NatGateway', 2);
      template.resourceCountIs('AWS::EC2::EIP', 2);
      const natGatewayIdsRoutedTo = findRouteTableIdsOfTier(
        template,
        'Private',
      ).map(
        (routeTableId) =>
          findDefaultRoutes(template, routeTableId)[0].NatGatewayId.Ref,
      );
      expect(new Set(natGatewayIdsRoutedTo).size).toBe(2);
    });
  });

  describe('security groups', () => {
    it('creates the three perimeter groups in the VPC', () => {
      const template = synthesizeNetworkStack(devConfig);
      template.resourceCountIs('AWS::EC2::SecurityGroup', 3);
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
});
