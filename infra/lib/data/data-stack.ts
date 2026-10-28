import { Stack } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import { importImmutableSecurityGroup } from '../network/import-immutable-security-group.js';
import { applyProjectTags } from '../project-tags.js';
import { createAdminSecret } from './create-admin-secret.js';
import { createDataOutputs } from './create-data-outputs.js';
import { createDatabaseParameterGroup } from './create-database-parameter-group.js';
import { createDatabaseServer } from './create-database-server.js';
import {
  type DatabaseConnection,
  resolveDatabaseConnection,
} from './database-connection.js';

export type DataStackProps = {
  readonly config: StageConfig;
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
};

export class DataStack extends Stack {
  readonly connection: DatabaseConnection;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, {
      env: { region: props.config.region },
      // The database is the one thing that must survive a bad deploy or a stack
      // rebuild; deleting it must take several deliberate steps.
      terminationProtection: true,
    });
    const { config } = props;
    const parameterGroup = createDatabaseParameterGroup(this);
    const adminSecret = createAdminSecret(this);
    const server = createDatabaseServer(this, {
      vpc: props.vpc,
      securityGroup: importImmutableSecurityGroup(
        this,
        'DataSecurityGroup',
        props.securityGroup,
      ),
      parameterGroup,
      adminSecret,
      config,
    });
    this.connection = resolveDatabaseConnection(server, adminSecret);
    createDataOutputs(this, this.connection);
    applyProjectTags(this, config.stage);
  }
}

export function dataStackId(stage: string): string {
  return `${PROJECT_NAME}-${stage}-data`;
}
