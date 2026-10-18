export type StageConfig = {
  readonly stage: string;
  readonly region: string;
  readonly availabilityZones: readonly string[];
  readonly vpcCidr: string;
  readonly natGatewayCount: number;
  readonly applicationPort: number;
  readonly flowLogRetentionDays: number;
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
      // One gateway is the accepted development trade-off; one per zone is production.
      natGatewayCount: 1,
      applicationPort: 3000,
      flowLogRetentionDays: 14,
    },
  ],
]);
