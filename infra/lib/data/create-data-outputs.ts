import { CfnOutput } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { DatabaseConnection } from './database-connection.js';

// The ARN names the secret. Its value is read by ECS when a task starts and is
// never an output, so `describe-stacks` can be run and shared freely.
export function createDataOutputs(
  scope: Construct,
  connection: DatabaseConnection,
): void {
  new CfnOutput(scope, 'DatabaseHost', { value: connection.host });
  new CfnOutput(scope, 'DatabasePort', { value: connection.port });
  new CfnOutput(scope, 'DatabaseSecretArn', {
    value: connection.secret.secretArn,
  });
}
