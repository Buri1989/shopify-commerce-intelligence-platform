import { Stack } from 'aws-cdk-lib';
import type * as ecs from 'aws-cdk-lib/aws-ecs';
import type * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import type { TaskStackProps } from '../app/task-stack-props.js';
import { PROJECT_NAME } from '../config/project-name.js';
import { applyProjectTags } from '../project-tags.js';
import { createMigrationLogGroup } from './create-migration-log-group.js';
import { createMigrationOutputs } from './create-migration-outputs.js';
import { createMigrationTaskDefinition } from './create-migration-task-definition.js';

export class MigrationStack extends Stack {
  readonly taskDefinition: ecs.FargateTaskDefinition;
  readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: TaskStackProps) {
    super(scope, id, { env: { region: props.config.region } });
    const { config, repository, database, imageTag } = props;
    this.logGroup = createMigrationLogGroup(this, config);
    this.taskDefinition = createMigrationTaskDefinition(this, {
      repository,
      imageTag,
      logGroup: this.logGroup,
      database,
      config,
    });
    createMigrationOutputs(this, {
      taskDefinition: this.taskDefinition,
      vpc: props.vpc,
      securityGroup: props.securityGroups.app,
      logGroup: this.logGroup,
      config,
    });
    applyProjectTags(this, config.stage);
  }
}

export function migrationStackId(stage: string): string {
  return `${PROJECT_NAME}-${stage}-migration`;
}
