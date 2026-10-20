export type StageConfig = {
  readonly stage: string;
  readonly region: string;
  readonly availabilityZones: readonly string[];
  readonly vpcCidr: string;
  readonly natGatewayCount: number;
  readonly natInstanceType: string;
  readonly applicationPort: number;
  readonly taskCpuUnits: number;
  readonly taskMemoryMiB: number;
  readonly desiredCount: number;
  readonly logRetentionDays: number;
  readonly hostedZoneId: string;
  readonly hostedZoneName: string;
  readonly apiDomainName: string;
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
      natInstanceType: 't4g.nano',
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
    },
  ],
]);
