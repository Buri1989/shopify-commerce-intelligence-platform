import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import type { StageConfig } from '../config/stage-config.js';
import type { DatabaseConnection } from '../data/database-connection.js';
import type { PerimeterSecurityGroups } from '../network/perimeter-security-groups.js';

export type TaskStackProps = {
  readonly config: StageConfig;
  readonly vpc: ec2.IVpc;
  readonly securityGroups: PerimeterSecurityGroups;
  readonly repository: ecr.IRepository;
  readonly database: DatabaseConnection;
  readonly imageTag: string;
};
