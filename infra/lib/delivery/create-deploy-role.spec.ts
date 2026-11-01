import type { Template } from 'aws-cdk-lib/assertions';
import { matchBootstrapRoleArn } from '../../test/match-bootstrap-role-arn.js';
import { synthesizeDeliveryStack } from '../../test/synthesize-delivery-stack.js';
import {
  expectStackOutput,
  findOnlyResourceId,
  findPolicyStatementsOfRole,
  findRoleId,
  readResourceProperties,
} from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const MIGRATION_STACK = 'commerce-intelligence-dev-migration';

describe('createDeployRole', () => {
  let template: Template;
  let roleId: string;

  beforeAll(() => {
    template = synthesizeDeliveryStack(resolveStageConfig('dev'));
    roleId = findRoleId(template, 'commerce-intelligence-dev-github-deploy');
  });

  it('trusts only a GitHub token minted for AWS by a run on main of this repository', () => {
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
                'repo:Buri1989@42779452/shopify-commerce-intelligence-platform@1422111906:ref:refs/heads/main',
            },
          },
        },
      ],
    });
  });

  it('may assume the bootstrap deploy, file-publishing and lookup roles', () => {
    expect(findPolicyStatementsOfRole(template, roleId)).toContainEqual({
      Action: 'sts:AssumeRole',
      Effect: 'Allow',
      Resource: [
        matchBootstrapRoleArn('deploy'),
        matchBootstrapRoleArn('file-publishing'),
        matchBootstrapRoleArn('lookup'),
      ],
    });
  });

  it('may log in to ECR and pull and push images on the project repository', () => {
    const statements = findPolicyStatementsOfRole(template, roleId);
    expect(statements).toContainEqual({
      Action: 'ecr:GetAuthorizationToken',
      Effect: 'Allow',
      Resource: '*',
    });
    expect(statements).toContainEqual({
      Action: [
        'ecr:BatchCheckLayerAvailability',
        'ecr:BatchGetImage',
        'ecr:CompleteLayerUpload',
        'ecr:GetDownloadUrlForLayer',
        'ecr:InitiateLayerUpload',
        'ecr:PutImage',
        'ecr:UploadLayerPart',
      ],
      Effect: 'Allow',
      Resource: {
        'Fn::GetStackOutput': expect.objectContaining({
          StackName: 'commerce-intelligence-dev-registry',
        }),
      },
    });
  });

  it("may start the migration task, watch it, pass its two roles and read its log, each on the migration stack's own resources", () => {
    const statements = findPolicyStatementsOfRole(template, roleId);
    expect(statements).toContainEqual({
      Action: 'ecs:RunTask',
      Effect: 'Allow',
      Resource: expectStackOutput(MIGRATION_STACK, 'TaskDefinition'),
    });
    expect(statements).toContainEqual({
      Action: 'ecs:DescribeTasks',
      Effect: 'Allow',
      Resource: {
        'Fn::Join': [
          '',
          [
            'arn:aws:ecs:eu-north-1:',
            { Ref: 'AWS::AccountId' },
            ':task/commerce-intelligence-dev/*',
          ],
        ],
      },
    });
    expect(statements).toContainEqual({
      Action: 'iam:PassRole',
      Effect: 'Allow',
      Resource: [
        expectStackOutput(MIGRATION_STACK, 'TaskExecutionRole'),
        expectStackOutput(MIGRATION_STACK, 'TaskRole'),
      ],
    });
    expect(statements).toContainEqual({
      Action: ['logs:DescribeLogStreams', 'logs:GetLogEvents'],
      Effect: 'Allow',
      Resource: expectStackOutput(MIGRATION_STACK, 'MigrationLogGroup'),
    });
  });

  it('has no other permission', () => {
    expect(findPolicyStatementsOfRole(template, roleId)).toHaveLength(7);
    expect(
      readResourceProperties(template, roleId).ManagedPolicyArns,
    ).toBeUndefined();
  });
});
