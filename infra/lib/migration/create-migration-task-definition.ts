import { Stack } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import type { Construct } from 'constructs';
import { createEcsTaskRole } from '../app/create-ecs-task-role.js';
import type { TaskDefinitionOptions } from '../app/create-task-definition.js';
import { resolveContainerEnvironment } from '../app/resolve-container-environment.js';
import { resolveContainerSecrets } from '../app/resolve-container-secrets.js';
import { resolveTaskPlatform } from '../app/resolve-task-platform.js';

export function createMigrationTaskDefinition(
  scope: Construct,
  options: TaskDefinitionOptions,
): ecs.FargateTaskDefinition {
  const { repository, imageTag, logGroup, database, config } = options;
  const taskDefinition = new ecs.FargateTaskDefinition(
    scope,
    'TaskDefinition',
    {
      // Named like its stack, so the task list reads like the stack list.
      family: Stack.of(scope).stackName,
      ...resolveTaskPlatform(config),
      executionRole: createEcsTaskRole(
        scope,
        'TaskExecutionRole',
        'Used by ECS to pull the image and write logs',
      ),
      taskRole: createEcsTaskRole(
        scope,
        'TaskRole',
        'Used by the migration script at runtime',
      ),
    },
  );
  taskDefinition.addContainer(CONTAINER_NAME, {
    image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
    command: MIGRATE_COMMAND,
    environment: resolveContainerEnvironment(config, database),
    secrets: resolveContainerSecrets(database),
    logging: ecs.LogDrivers.awsLogs({
      logGroup,
      streamPrefix: CONTAINER_NAME,
      // A line dropped here is a migration nobody can account for.
      mode: ecs.AwsLogDriverMode.BLOCKING,
    }),
  });
  return taskDefinition;
}

const CONTAINER_NAME = 'migration';
const MIGRATE_COMMAND = ['node', 'dist/database/migrate.js'];
