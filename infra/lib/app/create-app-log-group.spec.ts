import type { Template } from 'aws-cdk-lib/assertions';
import { synthesizeAppStack } from '../../test/synthesize-app-stack.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createAppLogGroup', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeAppStack(resolveStageConfig('dev'), 'abc123');
  });

  it('names the log group after the stage and keeps it for the configured days', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 1);
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/commerce-intelligence/dev/app',
      RetentionInDays: 14,
    });
  });

  it('deletes the log group together with the stack', () => {
    template.hasResource('AWS::Logs::LogGroup', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });
});
