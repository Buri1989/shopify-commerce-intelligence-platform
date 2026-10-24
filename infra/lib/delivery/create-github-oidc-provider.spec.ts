import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeDeliveryStack } from '../../test/synthesize-delivery-stack.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createGithubOidcProvider', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeDeliveryStack(resolveStageConfig('dev'));
  });

  it('accepts tokens issued by GitHub Actions and meant for AWS STS', () => {
    template.resourceCountIs('AWS::IAM::OIDCProvider', 1);
    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      Url: 'https://token.actions.githubusercontent.com',
      ClientIdList: ['sts.amazonaws.com'],
    });
  });

  it('carries no certificate thumbprint and deploys no Lambda to fetch one', () => {
    template.hasResourceProperties('AWS::IAM::OIDCProvider', {
      ThumbprintList: Match.absent(),
    });
    template.resourceCountIs('AWS::Lambda::Function', 0);
  });
});
