import { Size } from 'aws-cdk-lib';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { StageConfig } from '../config/stage-config.js';

export type TaskDefinitionOptions = {
  readonly repository: ecr.IRepository;
  readonly imageTag: string;
  readonly logGroup: logs.ILogGroup;
  readonly config: StageConfig;
};

export function createTaskDefinition(
  scope: Construct,
  options: TaskDefinitionOptions,
): ecs.FargateTaskDefinition {
  const { repository, imageTag, logGroup, config } = options;
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
    environment: {
      NODE_ENV: 'production',
      PORT: String(config.applicationPort),
      LOG_LEVEL: 'info',
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
