import type * as rds from 'aws-cdk-lib/aws-rds';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { DATABASE_NAME } from './database-name.js';

// What a client needs to reach the server. The app stack turns it into
// environment variables and never sees the server itself.
export type DatabaseConnection = {
  readonly host: string;
  readonly port: string;
  readonly databaseName: string;
  readonly secret: secretsmanager.ISecret;
};

export function resolveDatabaseConnection(
  server: rds.IDatabaseInstance,
  adminSecret: secretsmanager.ISecret,
): DatabaseConnection {
  return {
    host: server.dbInstanceEndpointAddress,
    port: server.dbInstanceEndpointPort,
    databaseName: DATABASE_NAME,
    secret: adminSecret,
  };
}
