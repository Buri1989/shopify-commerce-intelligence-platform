import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeDataStack } from '../../test/synthesize-data-stack.js';
import {
  findOnlyResourceId,
  matchStackOutput,
  secretFieldReference,
} from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const NETWORK_STACK = 'commerce-intelligence-dev-network';

describe('createDatabaseServer', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeDataStack(resolveStageConfig('dev'));
  });

  it('runs one MySQL 8.4 server of the configured size in one zone, named after the stage', () => {
    template.resourceCountIs('AWS::RDS::DBInstance', 1);
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'mysql',
      EngineVersion: '8.4',
      DBInstanceClass: 'db.t4g.micro',
      DBInstanceIdentifier: 'commerce-intelligence-dev',
      DBName: 'commerce_intelligence',
      Port: '3306',
      MultiAZ: false,
    });
  });

  it('takes 8.4 patches itself in the Sunday night maintenance window', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      AutoMinorVersionUpgrade: true,
      PreferredMaintenanceWindow: 'sun:03:00-sun:04:00',
    });
  });

  it('sits in the isolated subnets inside the data group, unreachable from the internet', () => {
    template.hasResourceProperties('AWS::RDS::DBSubnetGroup', {
      SubnetIds: [
        matchStackOutput(NETWORK_STACK, 'isolatedSubnet1'),
        matchStackOutput(NETWORK_STACK, 'isolatedSubnet2'),
      ],
    });
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBSubnetGroupName: {
        Ref: findOnlyResourceId(template, 'AWS::RDS::DBSubnetGroup'),
      },
      VPCSecurityGroups: [matchStackOutput(NETWORK_STACK, 'DataSecurityGroup')],
      PubliclyAccessible: false,
    });
  });

  it('adds no security group and no rule to the perimeter groups', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 0);
    template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 0);
    template.resourceCountIs('AWS::EC2::SecurityGroupEgress', 0);
  });

  it('encrypts 20 GiB of gp3 storage with the AWS-managed key', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      StorageEncrypted: true,
      KmsKeyId: Match.absent(),
      StorageType: 'gp3',
      AllocatedStorage: '20',
    });
  });

  it('keeps seven days of backups, taken at night before the maintenance window', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      BackupRetentionPeriod: 7,
      PreferredBackupWindow: '01:00-02:00',
      CopyTagsToSnapshot: true,
    });
  });

  it('refuses deletion, and leaves a final snapshot if deleted anyway', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DeletionProtection: true,
    });
    template.hasResource('AWS::RDS::DBInstance', {
      DeletionPolicy: 'Snapshot',
      UpdateReplacePolicy: 'Snapshot',
    });
  });

  it('requires TLS through the parameter group and presents the rsa2048 g1 certificate', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBParameterGroupName: {
        Ref: findOnlyResourceId(template, 'AWS::RDS::DBParameterGroup'),
      },
      CACertificateIdentifier: 'rds-ca-rsa2048-g1',
    });
  });

  it('logs in as admin with a password generated into Secrets Manager; the template only points at it', () => {
    template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    const secretId = findOnlyResourceId(
      template,
      'AWS::SecretsManager::Secret',
    );
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: Match.objectLike({
        SecretStringTemplate: '{"username":"admin"}',
        GenerateStringKey: 'password',
      }),
    });
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      MasterUsername: secretFieldReference(secretId, 'username'),
      MasterUserPassword: secretFieldReference(secretId, 'password'),
    });
    template.hasResourceProperties(
      'AWS::SecretsManager::SecretTargetAttachment',
      {
        SecretId: { Ref: secretId },
        TargetId: {
          Ref: findOnlyResourceId(template, 'AWS::RDS::DBInstance'),
        },
        TargetType: 'AWS::RDS::DBInstance',
      },
    );
  });
});
