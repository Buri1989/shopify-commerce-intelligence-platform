import { Size } from 'aws-cdk-lib';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import type * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/stage-config.js';
import type { DatabaseConnection } from '../data/database-connection.js';
import type { AppSecrets } from '../secrets/create-app-secrets.js';
import { createEcsTaskRole } from './create-ecs-task-role.js';
import { resolveAppContainerEnvironment } from './resolve-app-container-environment.js';
import { resolveAppContainerSecrets } from './resolve-app-container-secrets.js';
import { resolveContainerEnvironment } from './resolve-container-environment.js';
import { resolveContainerSecrets } from './resolve-container-secrets.js';
import { resolveTaskPlatform } from './resolve-task-platform.js';

export type TaskDefinitionOptions = {
  readonly repository: ecr.IRepository;
  readonly imageTag: string;
  readonly logGroup: logs.ILogGroup;
  readonly database: DatabaseConnection;
  readonly config: StageConfig;
};

export type AppTaskDefinitionOptions = TaskDefinitionOptions & {
  readonly appSecrets: AppSecrets;
};

export function createTaskDefinition(
  scope: Construct,
  options: AppTaskDefinitionOptions,
): ecs.FargateTaskDefinition {
  const { repository, imageTag, logGroup, database, config, appSecrets } =
    options;
  const taskDefinition = new ecs.FargateTaskDefinition(
    scope,
    'TaskDefinition',
    {
      ...resolveTaskPlatform(config),
      executionRole: createEcsTaskRole(
        scope,
        'TaskExecutionRole',
        'Used by ECS to pull the image and write logs',
      ),
      taskRole: createEcsTaskRole(
        scope,
        'TaskRole',
        'Used by the application at runtime',
      ),
    },
  );
  taskDefinition.addContainer(CONTAINER_NAME, {
    image: ecs.ContainerImage.fromEcrRepository(repository, imageTag),
    environment: {
      ...resolveContainerEnvironment(config, database),
      ...resolveAppContainerEnvironment(config),
    },
    secrets: {
      ...resolveContainerSecrets(database),
      ...resolveAppContainerSecrets(appSecrets),
    },
    portMappings: [{ containerPort: config.applicationPort }],
    logging: ecs.LogDrivers.awsLogs({
      logGroup,
      streamPrefix: CONTAINER_NAME,
      // If CloudWatch is unreachable the app keeps serving and drops lines
      // instead of stalling on every write.
      mode: ecs.AwsLogDriverMode.NON_BLOCKING,
      maxBufferSize: LOG_BUFFER_SIZE,
    }),
  });
  return taskDefinition;
}

const CONTAINER_NAME = 'app';
const LOG_BUFFER_SIZE = Size.mebibytes(25);
