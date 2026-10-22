import { Aspects, Stack, Validations } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { StageConfig } from '../config/stage-config.js';
import { HTTP_PORT, HTTPS_PORT } from './ports.js';

export function createNatInstanceProvider(
  config: StageConfig,
): ec2.NatInstanceProviderV2 {
  return ec2.NatProvider.instanceV2({
    instanceType: new ec2.InstanceType(config.natInstanceType),
    machineImage: ec2.MachineImage.genericLinux({
      [config.region]: config.natInstanceAmiId,
    }),
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
  config: StageConfig,
): void {
  provider.connections.allowFrom(
    ec2.Peer.ipv4(config.vpcCidr),
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
  provider.gatewayInstances.forEach((natInstance) =>
    configureNatInstance(natInstance, config.natInstanceType),
  );
}

// Everything one instance needs beyond the group rules: no SSH and IMDSv2 only,
// an identity that carries its type, and the image warning answered.
function configureNatInstance(
  natInstance: ec2.Instance,
  instanceType: string,
): void {
  hardenNatInstance(natInstance);
  replaceOnTypeChange(natInstance, instanceType);
  acknowledgePinnedImage(natInstance);
}

// Shell access through Session Manager, so no SSH and nothing inbound; and the
// metadata endpoint only answers session-token requests.
function hardenNatInstance(natInstance: ec2.Instance): void {
  natInstance.role.addManagedPolicy(SESSION_MANAGER_ACCESS);
  Aspects.of(natInstance).add(new ec2.InstanceRequireImdsv2Aspect());
}

// Boot-time setup runs only on a fresh instance. A type change must therefore
// replace the box, not stop and start it, so its identity carries the type.
function replaceOnTypeChange(
  natInstance: ec2.Instance,
  instanceType: string,
): void {
  const resource = natInstance.node.defaultChild as ec2.CfnInstance;
  const originalId = Stack.of(natInstance).getLogicalId(resource);
  resource.overrideLogicalId(`${originalId}${instanceType.replace(/\W/g, '')}`);
}

// The validator flags a literal image id as unportable across regions; this
// stack is pinned to one region and the id is pinned on purpose (1.4 design §4.9).
function acknowledgePinnedImage(natInstance: ec2.Instance): void {
  Validations.of(natInstance).acknowledge({
    id: HARDCODED_AMI_RULE,
    reason:
      'Image pinned on purpose in the stage config; the stack is region-pinned',
  });
}

const SESSION_MANAGER_ACCESS = iam.ManagedPolicy.fromAwsManagedPolicyName(
  'AmazonSSMManagedInstanceCore',
);

const HARDCODED_AMI_RULE = 'CloudFormation-Validate::W9010';
