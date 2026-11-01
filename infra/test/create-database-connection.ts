import { Stack } from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { DatabaseConnection } from '../lib/data/database-connection.js';
import { DATABASE_NAME } from '../lib/data/database-name.js';
import { createTestApp } from './create-test-app.js';

export const DATABASE_SECRET_ARN =
  'arn:aws:secretsmanager:eu-north-1:000000000000:secret:database-admin-AbCdEf';

// Plain values where the data stack would hand out tokens.
export function createDatabaseConnection(): DatabaseConnection {
  return {
    host: 'db.internal',
    port: '3306',
    databaseName: DATABASE_NAME,
    secret: secretsmanager.Secret.fromSecretCompleteArn(
      new Stack(createTestApp()),
      'DatabaseSecret',
      DATABASE_SECRET_ARN,
    ),
  };
}
