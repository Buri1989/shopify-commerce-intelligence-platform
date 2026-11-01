import * as ecs from 'aws-cdk-lib/aws-ecs';
import { resolveStageConfig } from '../config/stage-config.js';
import { resolveTaskPlatform } from './resolve-task-platform.js';

describe('resolveTaskPlatform', () => {
  it('sizes the task from the stage and runs it on ARM Linux', () => {
    expect(resolveTaskPlatform(resolveStageConfig('dev'))).toEqual({
      cpu: 256,
      memoryLimitMiB: 512,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });
  });
});
