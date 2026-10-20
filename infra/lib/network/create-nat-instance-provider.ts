import { Aspects } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { StageConfig } from '../config/stage-config.js';
import { HTTP_PORT, HTTPS_PORT } from './ports.js';

export function createNatInstanceProvider(
  config: StageConfig,
): ec2.NatInstanceProviderV2 {
  return ec2.NatProvider.instanceV2({
    instanceType: new ec2.InstanceType(config.natInstanceType),
    // The public subnets do not assign addresses on launch (Task 1.2); a NAT needs one.
    associatePublicIpAddress: true,
    // The provider's default opens its group to all traffic from everywhere.
    defaultAllowedTraffic: ec2.NatTrafficDirection.NONE,
  });
}

// Runs after the VPC is built: the provider creates its group and instances
// only once the VPC attaches it.
export function hardenNatInstances(
  provider: ec2.NatInstanceProviderV2,
  vpcCidr: string,
): void {
  provider.connections.allowFrom(
    ec2.Peer.ipv4(vpcCidr),
    ec2.Port.allTraffic(),
    'Traffic from the private subnets, to forward',
  );
  provider.connections.allowTo(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(HTTPS_PORT),
    'Forwarded HTTPS, package installs and the SSM agent',
  );
  provider.connections.allowTo(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(HTTP_PORT),
    'Forwarded HTTP',
  );
  provider.gatewayInstances.forEach(hardenNatInstance);
}

// Shell access through Session Manager, so no SSH and nothing inbound; and the
// metadata endpoint only answers session-token requests.
function hardenNatInstance(natInstance: ec2.Instance): void {
  natInstance.role.addManagedPolicy(SESSION_MANAGER_ACCESS);
  Aspects.of(natInstance).add(new ec2.InstanceRequireImdsv2Aspect());
}

const SESSION_MANAGER_ACCESS = iam.ManagedPolicy.fromAwsManagedPolicyName(
  'AmazonSSMManagedInstanceCore',
);
