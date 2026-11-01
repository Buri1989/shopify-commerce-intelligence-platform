import type { Template } from 'aws-cdk-lib/assertions';
import { synthesizeMigrationStack } from '../../test/synthesize-migration-stack.js';
import {
  findOnlyResourceId,
  matchStackOutput,
} from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const NETWORK_STACK = 'commerce-intelligence-dev-network';

describe('createMigrationOutputs', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeMigrationStack(resolveStageConfig('dev'), 'abc123');
  });

  it('publishes what run-task takes: the task definition, the cluster, the private subnets and the app group', () => {
    template.hasOutput('TaskDefinitionArn', {
      Value: { Ref: findOnlyResourceId(template, 'AWS::ECS::TaskDefinition') },
    });
    template.hasOutput('ClusterName', { Value: 'commerce-intelligence-dev' });
    template.hasOutput('SubnetIds', {
      Value: {
        'Fn::Join': [
          ',',
          [
            matchStackOutput(NETWORK_STACK, 'privateSubnet1'),
            matchStackOutput(NETWORK_STACK, 'privateSubnet2'),
          ],
        ],
      },
    });
    template.hasOutput('SecurityGroupId', {
      Value: matchStackOutput(NETWORK_STACK, 'AppSecurityGroup'),
    });
  });

  it('publishes the log group the run step prints from', () => {
    template.hasOutput('LogGroupName', {
      Value: { Ref: findOnlyResourceId(template, 'AWS::Logs::LogGroup') },
    });
  });
});
