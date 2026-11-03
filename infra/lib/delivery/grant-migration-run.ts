import { Stack } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import type { MigrationStack } from '../migration/migration-stack.js';

export type MigrationTask = Pick<MigrationStack, 'taskDefinition' | 'logGroup'>;

// What the deploy run does with the task: start it, wait for it, read its log.
export function grantMigrationRun(
  role: iam.Role,
  migration: MigrationTask,
  clusterName: string,
): void {
  const { taskDefinition, logGroup } = migration;
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['ecs:RunTask'],
      resources: [formatTaskDefinitionArn(role, taskDefinition.family)],
    }),
  );
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['ecs:DescribeTasks'],
      resources: [formatTaskArn(role, clusterName)],
    }),
  );
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [
        taskDefinition.obtainExecutionRole().roleArn,
        taskDefinition.taskRole.roleArn,
      ],
    }),
  );
  role.addToPolicy(
    new iam.PolicyStatement({
      actions: ['logs:DescribeLogStreams', 'logs:GetLogEvents'],
      resources: [logGroup.logGroupArn],
    }),
  );
}

// Every revision of the family: each deploy registers a new one, and a revision
// read from the migration stack would go stale.
function formatTaskDefinitionArn(scope: Construct, family: string): string {
  return Stack.of(scope).formatArn({
    service: 'ecs',
    resource: 'task-definition',
    resourceName: `${family}:*`,
  });
}

// Every task of the cluster: a task's own ARN exists only once it runs.
function formatTaskArn(scope: Construct, clusterName: string): string {
  return Stack.of(scope).formatArn({
    service: 'ecs',
    resource: 'task',
    resourceName: `${clusterName}/*`,
  });
}
