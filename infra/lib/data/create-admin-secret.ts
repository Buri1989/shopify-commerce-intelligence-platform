import * as rds from 'aws-cdk-lib/aws-rds';
import type { Construct } from 'constructs';

// CDK generates the password into Secrets Manager at deploy; the template refers
// to it by a dynamic reference and the value is written nowhere (design §4.4).
// Rotation is Phase 6: it changes this file and nothing about the server.
export function createAdminSecret(scope: Construct): rds.DatabaseSecret {
  return new rds.DatabaseSecret(scope, 'DatabaseAdminSecret', {
    username: ADMIN_USERNAME,
  });
}

// The user RDS creates with the server; the app logs in as it until Task 2.3
// can create a narrower one at deploy (design §4.5).
const ADMIN_USERNAME = 'admin';
