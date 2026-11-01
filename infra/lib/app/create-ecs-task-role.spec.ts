import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { createTestApp } from '../../test/create-test-app.js';
import { createEcsTaskRole } from './create-ecs-task-role.js';

describe('createEcsTaskRole', () => {
  it('is assumed by the ECS tasks service only and says who uses it', () => {
    const stack = new Stack(createTestApp());
    createEcsTaskRole(
      stack,
      'TaskRole',
      'Used by the migration script at runtime',
    );

    Template.fromStack(stack).hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: { Service: 'ecs-tasks.amazonaws.com' },
          },
        ],
        Version: '2012-10-17',
      },
      Description: 'Used by the migration script at runtime',
    });
  });
});
