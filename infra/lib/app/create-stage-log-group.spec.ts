import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { createTestApp } from '../../test/create-test-app.js';
import { resolveStageConfig } from '../config/stage-config.js';
import { createStageLogGroup } from './create-stage-log-group.js';

describe('createStageLogGroup', () => {
  let template: Template;

  beforeAll(() => {
    const stack = new Stack(createTestApp());
    createStageLogGroup(
      stack,
      'MigrationLogGroup',
      'migration',
      resolveStageConfig('dev'),
    );
    template = Template.fromStack(stack);
  });

  it('names the group after the project, the stage and its purpose, kept for the configured days', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/commerce-intelligence/dev/migration',
      RetentionInDays: 14,
    });
  });

  it('deletes the group together with the stack', () => {
    template.hasResource('AWS::Logs::LogGroup', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });
});
