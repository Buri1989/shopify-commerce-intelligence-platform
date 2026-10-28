import { Match, type Template } from 'aws-cdk-lib/assertions';
import { createDataStack } from '../../test/create-data-stack.js';
import { createNetworkStack } from '../../test/create-network-stack.js';
import { createTestApp } from '../../test/create-test-app.js';
import { readValidationViolations } from '../../test/read-validation-violations.js';
import { synthesizeDataStack } from '../../test/synthesize-data-stack.js';
import { findOnlyResourceId } from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const devConfig = resolveStageConfig('dev');

describe('DataStack', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeDataStack(devConfig);
  });

  it('tags the server with the project, the stage and the tool', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Tags: Match.arrayWith([
        { Key: 'managed-by', Value: 'cdk' },
        { Key: 'project', Value: 'commerce-intelligence' },
        { Key: 'stage', Value: 'dev' },
      ]),
    });
  });

  it('publishes the host, the port and the ARN of the secret, never its value', () => {
    const serverId = findOnlyResourceId(template, 'AWS::RDS::DBInstance');
    template.hasOutput('DatabaseHost', {
      Value: { 'Fn::GetAtt': [serverId, 'Endpoint.Address'] },
    });
    template.hasOutput('DatabasePort', {
      Value: { 'Fn::GetAtt': [serverId, 'Endpoint.Port'] },
    });
    template.hasOutput('DatabaseSecretArn', {
      Value: {
        Ref: findOnlyResourceId(template, 'AWS::SecretsManager::Secret'),
      },
    });
    expect(JSON.stringify(template.findOutputs('*'))).not.toContain(
      'SecretString',
    );
  });

  it('refuses deletion until termination protection is turned off', () => {
    const app = createTestApp();
    const stack = createDataStack(
      app,
      devConfig,
      createNetworkStack(app, devConfig),
    );
    expect(stack.terminationProtection).toBe(true);
  });

  it('leaves no validation finding unacknowledged', () => {
    const app = createTestApp();
    createDataStack(app, devConfig, createNetworkStack(app, devConfig));
    expect(readValidationViolations(app)).toEqual([]);
  });
});
