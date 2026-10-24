import type { Template } from 'aws-cdk-lib/assertions';
import { matchBootstrapRoleArn } from '../../test/match-bootstrap-role-arn.js';
import { synthesizeDeliveryStack } from '../../test/synthesize-delivery-stack.js';
import {
  findOnlyResourceId,
  findPolicyStatementsOfRole,
  findRoleId,
  readResourceProperties,
} from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createPullRequestRole', () => {
  let template: Template;
  let roleId: string;

  beforeAll(() => {
    template = synthesizeDeliveryStack(resolveStageConfig('dev'));
    roleId = findRoleId(
      template,
      'commerce-intelligence-dev-github-pull-request',
    );
  });

  it('trusts only a GitHub token minted for AWS by a pull request of this repository', () => {
    expect(
      readResourceProperties(template, roleId).AssumeRolePolicyDocument,
    ).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRoleWithWebIdentity',
          Effect: 'Allow',
          Principal: {
            Federated: {
              Ref: findOnlyResourceId(template, 'AWS::IAM::OIDCProvider'),
            },
          },
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub':
                'repo:Buri1989/shopify-commerce-intelligence-platform:pull_request',
            },
          },
        },
      ],
    });
  });

  it('may assume the bootstrap lookup role and nothing else', () => {
    expect(findPolicyStatementsOfRole(template, roleId)).toEqual([
      {
        Action: 'sts:AssumeRole',
        Effect: 'Allow',
        Resource: matchBootstrapRoleArn('lookup'),
      },
    ]);
    expect(
      readResourceProperties(template, roleId).ManagedPolicyArns,
    ).toBeUndefined();
  });
});
