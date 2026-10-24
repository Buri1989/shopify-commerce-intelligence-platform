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
                'repo:Buri1989/shopify-commerce-intelligence-platform:ref:refs/heads/main',
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

  it('has no other permission', () => {
    expect(findPolicyStatementsOfRole(template, roleId)).toHaveLength(3);
    expect(
      readResourceProperties(template, roleId).ManagedPolicyArns,
    ).toBeUndefined();
  });
});
