import { Match, type Template } from 'aws-cdk-lib/assertions';
import { createMigrationStack } from '../../test/create-migration-stack.js';
import { createTestApp } from '../../test/create-test-app.js';
import { readValidationViolations } from '../../test/read-validation-violations.js';
import { synthesizeMigrationStack } from '../../test/synthesize-migration-stack.js';
import { readResourceTypes } from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const devConfig = resolveStageConfig('dev');

describe('MigrationStack', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeMigrationStack(devConfig, 'abc123');
  });

  it('holds the task definition, its two roles with their policy, the log group and nothing else', () => {
    template.resourceCountIs('AWS::IAM::Role', 2);
    expect(readResourceTypes(template)).toEqual([
      'AWS::ECS::TaskDefinition',
      'AWS::IAM::Policy',
      'AWS::IAM::Role',
      'AWS::Logs::LogGroup',
    ]);
  });

  it('tags its resources with the project, the stage and the tool', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      Tags: Match.arrayWith([
        { Key: 'managed-by', Value: 'cdk' },
        { Key: 'project', Value: 'commerce-intelligence' },
        { Key: 'stage', Value: 'dev' },
      ]),
    });
  });

  it('stays destroyable: termination protection is off', () => {
    const stack = createMigrationStack(createTestApp(), devConfig, 'abc123');
    expect(stack.terminationProtection).toBe(false);
  });

  it('leaves no validation finding unacknowledged', () => {
    const app = createTestApp();
    createMigrationStack(app, devConfig, 'abc123');
    expect(readValidationViolations(app)).toEqual([]);
  });
});
