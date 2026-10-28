import type { Template } from 'aws-cdk-lib/assertions';
import { synthesizeDataStack } from '../../test/synthesize-data-stack.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createDatabaseParameterGroup', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeDataStack(resolveStageConfig('dev'));
  });

  it('requires TLS on every connection to a MySQL 8.4 server', () => {
    template.resourceCountIs('AWS::RDS::DBParameterGroup', 1);
    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Family: 'mysql8.4',
      Parameters: { require_secure_transport: 'ON' },
    });
  });
});
