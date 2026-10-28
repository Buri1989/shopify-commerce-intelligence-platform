import * as rds from 'aws-cdk-lib/aws-rds';
import type { Construct } from 'constructs';
import { MYSQL_ENGINE } from './mysql-engine.js';

export function createDatabaseParameterGroup(
  scope: Construct,
): rds.ParameterGroup {
  return new rds.ParameterGroup(scope, 'DatabaseParameterGroup', {
    engine: MYSQL_ENGINE,
    description: 'MySQL 8.4 with TLS required on every connection',
    // A dynamic parameter, so no reboot. The server refuses a plain connection;
    // a wrong client setting fails loudly instead of downgrading (design §4.5).
    parameters: { require_secure_transport: 'ON' },
  });
}
