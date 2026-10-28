import { Size } from 'aws-cdk-lib';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/stage-config.js';
import type { DatabaseConnection } from '../data/database-connection.js';

export type TaskDefinitionOptions = {
  readonly repository: ecr.IRepository;
  readonly imageTag: string;
  readonly logGroup: logs.ILogGroup;
  readonly database: DatabaseConnection;
  readonly config: StageConfig;
};

export function createTaskDefinition(
  scope: Construct,
  options: TaskDefinitionOptions,
): ecs.FargateTaskDefinition {
  const { repository, imageTag, logGroup, database, config } = options;
  const taskDefinition = new ecs.FargateTaskDefinition(
    scope,
    'TaskDefinition',
    {
      cpu: config.taskCpuUnits,
      memoryLimitMiB: config.taskMemoryMiB,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
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
    environment: resolveContainerEnvironment(config, database),
    secrets: resolveContainerSecrets(database),
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

// Plain values only. The login travels as secrets, so it is never in the task
// definition, which anyone with ECS read access can describe.
function resolveContainerEnvironment(
  config: StageConfig,
  database: DatabaseConnection,
): Record<string, string> {
  return {
    NODE_ENV: 'production',
    PORT: String(config.applicationPort),
    LOG_LEVEL: 'info',
    DB_HOST: database.host,
    DB_PORT: database.port,
    DB_NAME: database.databaseName,
    DB_POOL_SIZE: String(config.databasePoolSize),
    DB_SSL_CA_PATH: `${CA_BUNDLE_DIRECTORY}/${config.region}-bundle.pem`,
  };
}

// ECS reads the two fields when the task starts and places them in the
// container's environment. CDK grants the execution role, and only it, read on
// this one secret (design §4.4).
function resolveContainerSecrets(
  database: DatabaseConnection,
): Record<string, ecs.Secret> {
  return {
    DB_USER: ecs.Secret.fromSecretsManager(database.secret, 'username'),
    DB_PASSWORD: ecs.Secret.fromSecretsManager(database.secret, 'password'),
  };
}

// Both roles are assumed by the ECS tasks service; what differs is who uses the
// credentials: ECS itself to start the task, or the application once it runs.
function createEcsTaskRole(
  scope: Construct,
  id: string,
  description: string,
): iam.Role {
  return new iam.Role(scope, id, {
    assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    description,
  });
}

const CONTAINER_NAME = 'app';
const LOG_BUFFER_SIZE = Size.mebibytes(25);
// Where the Dockerfile copies certs/, under its WORKDIR. The file is AWS's RDS
// certificate bundle for the stage's region (design §4.5).
const CA_BUNDLE_DIRECTORY = '/app/certs';
