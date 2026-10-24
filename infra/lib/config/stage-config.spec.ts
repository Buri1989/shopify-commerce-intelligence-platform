import { resolveStageConfig } from './stage-config.js';

describe('resolveStageConfig', () => {
  it('resolves dev to the documented settings', () => {
    expect(resolveStageConfig('dev')).toEqual({
      stage: 'dev',
      region: 'eu-north-1',
      availabilityZones: ['eu-north-1a', 'eu-north-1b'],
      vpcCidr: '10.0.0.0/16',
      natGatewayCount: 1,
      natInstanceType: 't4g.micro',
      natInstanceAmiId: 'ami-04e0c7320ad3a3a48',
      applicationPort: 3000,
      taskCpuUnits: 256,
      taskMemoryMiB: 512,
      desiredCount: 1,
      logRetentionDays: 14,
      hostedZoneId: 'Z03536663804YHQ8G2EL1',
      hostedZoneName: 'commerce-intelligence.click',
      apiDomainName: 'api.commerce-intelligence.click',
      githubRepositoryIdentity:
        'Buri1989@42779452/shopify-commerce-intelligence-platform@1422111906',
    });
  });

  it('rejects an unknown stage and names the known ones', () => {
    expect(() => resolveStageConfig('staging')).toThrow(
      "Unknown stage 'staging'. Known stages: dev",
    );
  });
});
