export type StageConfig = {
  readonly stage: string;
  readonly region: string;
  readonly availabilityZones: readonly string[];
  readonly vpcCidr: string;
  readonly natGatewayCount: number;
  readonly natInstanceType: string;
  readonly natInstanceAmiId: string;
  readonly applicationPort: number;
  readonly taskCpuUnits: number;
  readonly taskMemoryMiB: number;
  readonly desiredCount: number;
  readonly logRetentionDays: number;
  readonly hostedZoneId: string;
  readonly hostedZoneName: string;
  readonly apiDomainName: string;
  readonly githubRepositoryIdentity: string;
};

export function resolveStageConfig(stageName: string): StageConfig {
  const config = stageConfigs.get(stageName);
  if (config === undefined) {
    const knownStages = [...stageConfigs.keys()].join(', ');
    throw new Error(
      `Unknown stage '${stageName}'. Known stages: ${knownStages}`,
    );
  }
  return config;
}

const stageConfigs: ReadonlyMap<string, StageConfig> = new Map([
  [
    'dev',
    {
      stage: 'dev',
      region: 'eu-north-1',
      availabilityZones: ['eu-north-1a', 'eu-north-1b'],
      vpcCidr: '10.0.0.0/16',
      // The number of NAT devices. One is the development trade-off; one per zone is production.
      natGatewayCount: 1,
      // The smallest size whose memory survives the package install at boot;
      // on a nano the installer is killed and the NAT never gets its rule.
      natInstanceType: 't4g.micro',
      // Amazon Linux 2023 ARM, 2023.12.20261016.0. Pinned so a deploy never replaces
      // the NAT by surprise; a newer image is a deliberate change (1.4 design §4.9).
      natInstanceAmiId: 'ami-04e0c7320ad3a3a48',
      applicationPort: 3000,
      // Fargate's smallest size: 256 units are a quarter of a vCPU.
      taskCpuUnits: 256,
      taskMemoryMiB: 512,
      // One task is the cost choice; two spread across the zones.
      desiredCount: 1,
      logRetentionDays: 14,
      // Created by the domain registration on 2026-10-20; read from the account, never looked up.
      hostedZoneId: 'Z03536663804YHQ8G2EL1',
      hostedZoneName: 'commerce-intelligence.click',
      apiDomainName: 'api.commerce-intelligence.click',
      // login@id/name@id, as GitHub writes it in its tokens; printed by
      // gh api repos/Buri1989/shopify-commerce-intelligence-platform/actions/oidc/customization/sub
      githubRepositoryIdentity:
        'Buri1989@42779452/shopify-commerce-intelligence-platform@1422111906',
    },
  ],
]);
