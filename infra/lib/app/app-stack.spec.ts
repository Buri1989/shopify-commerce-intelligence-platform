import { Match, type Template } from 'aws-cdk-lib/assertions';
import { createAppStack } from '../../test/create-app-stack.js';
import { createTestApp } from '../../test/create-test-app.js';
import { synthesizeAppStack } from '../../test/synthesize-app-stack.js';
import { findOnlyResourceId } from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('AppStack', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeAppStack(resolveStageConfig('dev'), 'abc123');
  });

  it('tags its resources with the project, the stage and the tool', () => {
    template.hasResourceProperties('AWS::ECS::Cluster', {
      Tags: Match.arrayWith([
        { Key: 'managed-by', Value: 'cdk' },
        { Key: 'project', Value: 'commerce-intelligence' },
        { Key: 'stage', Value: 'dev' },
      ]),
    });
  });

  it('publishes the API URL and the names the CLI checks and the pipeline need', () => {
    template.hasOutput('ApiUrl', {
      Value: 'https://api.commerce-intelligence.click',
    });
    template.hasOutput('LoadBalancerDnsName', {
      Value: {
        'Fn::GetAtt': [
          findOnlyResourceId(
            template,
            'AWS::ElasticLoadBalancingV2::LoadBalancer',
          ),
          'DNSName',
        ],
      },
    });
    template.hasOutput('ClusterName', {
      Value: { Ref: findOnlyResourceId(template, 'AWS::ECS::Cluster') },
    });
    template.hasOutput('ServiceName', {
      Value: {
        'Fn::GetAtt': [
          findOnlyResourceId(template, 'AWS::ECS::Service'),
          'Name',
        ],
      },
    });
    template.hasOutput('LogGroupName', {
      Value: { Ref: findOnlyResourceId(template, 'AWS::Logs::LogGroup') },
    });
  });

  it('stays destroyable: termination protection is off', () => {
    const stack = createAppStack(
      createTestApp(),
      resolveStageConfig('dev'),
      'abc123',
    );
    expect(stack.terminationProtection).toBe(false);
  });
});
