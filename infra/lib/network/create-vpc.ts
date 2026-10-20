import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';

export function createVpc(
  scope: Construct,
  config: StageConfig,
  natProvider: ec2.NatProvider,
): ec2.Vpc {
  return new ec2.Vpc(scope, 'Vpc', {
    vpcName: `${PROJECT_NAME}-${config.stage}`,
    ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
    availabilityZones: [...config.availabilityZones],
    reservedAzs: RESERVED_ZONES_FOR_GROWTH,
    subnetConfiguration: subnetTiers,
    natGateways: config.natGatewayCount,
    natGatewayProvider: natProvider,
    gatewayEndpoints: { S3: s3GatewayEndpoint },
    restrictDefaultSecurityGroup: true,
  });
}

// Address space is held back for a third zone so that adding it later does not
// renumber, and therefore replace, the subnets that already exist.
const RESERVED_ZONES_FOR_GROWTH = 1;

const subnetTiers: ec2.SubnetConfiguration[] = [
  // Load balancer nodes and the NAT instance live here; nothing launched here
  // gets a public IP by accident.
  {
    name: 'public',
    subnetType: ec2.SubnetType.PUBLIC,
    cidrMask: 24,
    mapPublicIpOnLaunch: false,
  },
  // Application containers; sized so autoscaling never runs out of addresses.
  {
    name: 'private',
    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    cidrMask: 20,
  },
  // Database and cache; no route to the internet in either direction.
  {
    name: 'isolated',
    subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    cidrMask: 24,
  },
];

// Free, and ECR serves image layers from S3, so image pulls bypass the NAT.
// Attached to the private tier only.
const s3GatewayEndpoint: ec2.GatewayVpcEndpointOptions = {
  service: ec2.GatewayVpcEndpointAwsService.S3,
  subnets: [{ subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }],
};
