import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeSecretsStack } from '../../test/synthesize-secrets-stack.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createAppSecrets', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeSecretsStack(resolveStageConfig('dev'));
  });

  it('creates the Shopify client secret and the cookie secret under the stage name', () => {
    template.resourceCountIs('AWS::SecretsManager::Secret', 2);
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'commerce-intelligence-dev/shopify-client-secret',
    });
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'commerce-intelligence-dev/cookie-secret',
    });
  });

  it('has AWS generate both values with its default settings, so no value is in the code', () => {
    template.allResourcesProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: Match.exact({}),
      SecretString: Match.absent(),
    });
  });

  it('deletes both secrets when they leave the stack', () => {
    template.allResources('AWS::SecretsManager::Secret', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });
});
