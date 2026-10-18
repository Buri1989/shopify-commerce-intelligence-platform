import { resolveStageConfig } from './stage-config.js';

describe('resolveStageConfig', () => {
  it('resolves dev to the documented network settings', () => {
    expect(resolveStageConfig('dev')).toEqual({
      stage: 'dev',
      region: 'eu-north-1',
      availabilityZones: ['eu-north-1a', 'eu-north-1b'],
      vpcCidr: '10.0.0.0/16',
      natGatewayCount: 1,
      applicationPort: 3000,
      flowLogRetentionDays: 14,
    });
  });

  it('rejects an unknown stage and names the known ones', () => {
    expect(() => resolveStageConfig('staging')).toThrow(
      "Unknown stage 'staging'. Known stages: dev",
    );
  });
});
