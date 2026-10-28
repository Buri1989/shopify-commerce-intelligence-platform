import { Duration, RemovalPolicy, Validations } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import { MYSQL_PORT } from '../network/ports.js';
import { DATABASE_NAME } from './database-name.js';
import { MYSQL_ENGINE } from './mysql-engine.js';

export type DatabaseServerOptions = {
  readonly vpc: ec2.IVpc;
  readonly securityGroup: ec2.ISecurityGroup;
  readonly parameterGroup: rds.IParameterGroup;
  readonly adminSecret: secretsmanager.ISecret;
  readonly config: StageConfig;
};

export function createDatabaseServer(
  scope: Construct,
  options: DatabaseServerOptions,
): rds.DatabaseInstance {
  const { vpc, securityGroup, parameterGroup, adminSecret, config } = options;
  const server = new rds.DatabaseInstance(scope, 'DatabaseServer', {
    engine: MYSQL_ENGINE,
    instanceIdentifier: `${PROJECT_NAME}-${config.stage}`,
    instanceType: new ec2.InstanceType(config.databaseInstanceType),
    multiAz: config.databaseMultiAz,
    databaseName: DATABASE_NAME,
    port: MYSQL_PORT,
    credentials: rds.Credentials.fromSecret(adminSecret),
    parameterGroup,
    // Set explicitly so a change of AWS's default never alters the server by surprise.
    caCertificate: rds.CaCertificate.RDS_CA_RSA2048_G1,
    vpc,
    vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    securityGroups: [securityGroup],
    // Moot in the isolated subnets; stated so the template says what the spec asks.
    publiclyAccessible: false,
    ...resolveStorageSettings(config),
    ...resolveBackupSettings(config),
    ...automaticPatching,
    ...deletionLocks,
  });
  acknowledgeMajorVersion(server);
  return server;
}

// No key named, so the AWS-managed key. CDK's default without one is unencrypted,
// and encryption at rest can only be set at creation (design §4.6).
function resolveStorageSettings(
  config: StageConfig,
): Pick<
  rds.DatabaseInstanceProps,
  'storageType' | 'allocatedStorage' | 'storageEncrypted'
> {
  return {
    storageType: rds.StorageType.GP3,
    allocatedStorage: config.databaseAllocatedStorageGiB,
    storageEncrypted: true,
  };
}

// Daily, at night in UTC, two hours before the maintenance window so the two
// never overlap. Point-in-time recovery comes with the retention (design §4.6).
function resolveBackupSettings(
  config: StageConfig,
): Pick<
  rds.DatabaseInstanceProps,
  'backupRetention' | 'preferredBackupWindow' | 'copyTagsToSnapshot'
> {
  return {
    backupRetention: Duration.days(config.databaseBackupRetentionDays),
    preferredBackupWindow: '01:00-02:00',
    copyTagsToSnapshot: true,
  };
}

// The validator checks the version against a list of full versions; RDS accepts
// the major version and installs its current patch, which is the point (design §4.2).
function acknowledgeMajorVersion(server: rds.DatabaseInstance): void {
  Validations.of(server).acknowledge({
    id: ENGINE_VERSION_RULE,
    reason:
      'Major version on purpose: RDS applies 8.4 patches in the maintenance window',
  });
}

// RDS installs 8.4 patch releases itself, Sunday nights in UTC, with a snapshot
// first and a restart of a few minutes (design §4.2).
const automaticPatching: Pick<
  rds.DatabaseInstanceProps,
  'autoMinorVersionUpgrade' | 'preferredMaintenanceWindow'
> = {
  autoMinorVersionUpgrade: true,
  preferredMaintenanceWindow: 'sun:03:00-sun:04:00',
};

// Two of the three locks on the data; the stack's termination protection is the
// third. A server deleted past all three still leaves a snapshot (design §4.6).
const deletionLocks: Pick<
  rds.DatabaseInstanceProps,
  'deletionProtection' | 'removalPolicy'
> = {
  deletionProtection: true,
  removalPolicy: RemovalPolicy.SNAPSHOT,
};

const ENGINE_VERSION_RULE = 'CloudFormation-Validate::E9006';
