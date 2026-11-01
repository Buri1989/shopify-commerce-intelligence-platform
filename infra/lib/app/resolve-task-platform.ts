import * as ecs from 'aws-cdk-lib/aws-ecs';
import type { StageConfig } from '../config/stage-config.js';

export type TaskPlatform = Pick<
  ecs.FargateTaskDefinitionProps,
  'cpu' | 'memoryLimitMiB' | 'runtimePlatform'
>;

export function resolveTaskPlatform(config: StageConfig): TaskPlatform {
  return {
    cpu: config.taskCpuUnits,
    memoryLimitMiB: config.taskMemoryMiB,
    runtimePlatform: {
      cpuArchitecture: ecs.CpuArchitecture.ARM64,
      operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
    },
  };
}
