import { Match, type Template } from 'aws-cdk-lib/assertions';
import { createSecretsStack } from '../../test/create-secrets-stack.js';
import { createTestApp } from '../../test/create-test-app.js';
import { readValidationViolations } from '../../test/read-validation-violations.js';
import { synthesizeSecretsStack } from '../../test/synthesize-secrets-stack.js';
import { resolveStageConfig } from '../config/stage-config.js';

const devConfig = resolveStageConfig('dev');

describe('SecretsStack', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeSecretsStack(devConfig);
  });

  it('tags the secrets with the project, the stage and the tool', () => {
    template.allResourcesProperties('AWS::SecretsManager::Secret', {
      Tags: Match.arrayWith([
        { Key: 'managed-by', Value: 'cdk' },
        { Key: 'project', Value: 'commerce-intelligence' },
        { Key: 'stage', Value: 'dev' },
      ]),
    });
  });

  it('refuses deletion until termination protection is turned off', () => {
    const stack = createSecretsStack(createTestApp(), devConfig);
    expect(stack.terminationProtection).toBe(true);
  });

  it('leaves no validation finding unacknowledged', () => {
    const app = createTestApp();
    createSecretsStack(app, devConfig);
    expect(readValidationViolations(app)).toEqual([]);
  });
});
