import type { Template } from 'aws-cdk-lib/assertions';
import { synthesizeAppStack } from '../../test/synthesize-app-stack.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createCluster', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeAppStack(resolveStageConfig('dev'), 'abc123');
  });

  it('names the cluster after the stage and leaves Container Insights off', () => {
    template.resourceCountIs('AWS::ECS::Cluster', 1);
    template.hasResourceProperties('AWS::ECS::Cluster', {
      ClusterName: 'commerce-intelligence-dev',
      ClusterSettings: [{ Name: 'containerInsights', Value: 'disabled' }],
    });
  });
});
