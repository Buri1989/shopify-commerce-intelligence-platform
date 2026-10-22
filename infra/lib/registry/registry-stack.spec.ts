import { Match, type Template } from 'aws-cdk-lib/assertions';
import { createRegistryStack } from '../../test/create-registry-stack.js';
import { createTestApp } from '../../test/create-test-app.js';
import { synthesizeRegistryStack } from '../../test/synthesize-registry-stack.js';
import { findOnlyResourceId } from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('RegistryStack', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeRegistryStack(resolveStageConfig('dev'));
  });

  it('tags the repository with the project, the stage and the tool', () => {
    template.hasResourceProperties('AWS::ECR::Repository', {
      Tags: Match.arrayWith([
        { Key: 'managed-by', Value: 'cdk' },
        { Key: 'project', Value: 'commerce-intelligence' },
        { Key: 'stage', Value: 'dev' },
      ]),
    });
  });

  it('publishes the repository URI for the push commands', () => {
    template.hasOutput('RepositoryUri', {
      Value: {
        'Fn::Join': [
          '',
          Match.arrayWith([
            { Ref: findOnlyResourceId(template, 'AWS::ECR::Repository') },
          ]),
        ],
      },
    });
  });

  it('refuses deletion until termination protection is turned off', () => {
    const stack = createRegistryStack(
      createTestApp(),
      resolveStageConfig('dev'),
    );
    expect(stack.terminationProtection).toBe(true);
  });
});
