import type { Template } from 'aws-cdk-lib/assertions';
import { synthesizeMigrationStack } from '../../test/synthesize-migration-stack.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createMigrationLogGroup', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeMigrationStack(resolveStageConfig('dev'), 'abc123');
  });

  it("writes the migration's log under its own name, next to the app's", () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 1);
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/commerce-intelligence/dev/migration',
    });
  });
});
