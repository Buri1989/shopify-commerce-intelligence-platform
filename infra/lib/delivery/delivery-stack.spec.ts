import { Match, type Template } from 'aws-cdk-lib/assertions';
import { createDeliveryStack } from '../../test/create-delivery-stack.js';
import { createTestApp } from '../../test/create-test-app.js';
import { readValidationViolations } from '../../test/read-validation-violations.js';
import { synthesizeDeliveryStack } from '../../test/synthesize-delivery-stack.js';
import { findRoleId, readResourceTypes } from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const devConfig = resolveStageConfig('dev');

describe('DeliveryStack', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeDeliveryStack(devConfig);
  });

  it('holds the provider, the two roles with their policies, and nothing else', () => {
    template.resourceCountIs('AWS::IAM::OIDCProvider', 1);
    template.resourceCountIs('AWS::IAM::Role', 2);
    expect(readResourceTypes(template)).toEqual([
      'AWS::IAM::OIDCProvider',
      'AWS::IAM::Policy',
      'AWS::IAM::Role',
    ]);
  });

  it('publishes the two role ARNs for the GitHub variables', () => {
    template.hasOutput('PullRequestRoleArn', {
      Value: {
        'Fn::GetAtt': [
          findRoleId(template, 'commerce-intelligence-dev-github-pull-request'),
          'Arn',
        ],
      },
    });
    template.hasOutput('DeployRoleArn', {
      Value: {
        'Fn::GetAtt': [
          findRoleId(template, 'commerce-intelligence-dev-github-deploy'),
          'Arn',
        ],
      },
    });
  });

  it('tags the roles with the project, the stage and the tool', () => {
    template.allResourcesProperties('AWS::IAM::Role', {
      Tags: Match.arrayWith([
        { Key: 'managed-by', Value: 'cdk' },
        { Key: 'project', Value: 'commerce-intelligence' },
        { Key: 'stage', Value: 'dev' },
      ]),
    });
  });

  it('refuses deletion until termination protection is turned off', () => {
    const stack = createDeliveryStack(createTestApp(), devConfig);
    expect(stack.terminationProtection).toBe(true);
  });

  it('leaves no validation finding unacknowledged', () => {
    const app = createTestApp();
    createDeliveryStack(app, devConfig);
    expect(readValidationViolations(app)).toEqual([]);
  });
});
