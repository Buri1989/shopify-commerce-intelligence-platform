import * as ecs from 'aws-cdk-lib/aws-ecs';
import type { DatabaseConnection } from '../data/database-connection.js';

// ECS reads the two fields at task start and places them in the container's
// environment; CDK grants the read to the execution role and nothing else.
export function resolveContainerSecrets(
  database: DatabaseConnection,
): Record<string, ecs.Secret> {
  return {
    DB_USER: ecs.Secret.fromSecretsManager(database.secret, 'username'),
    DB_PASSWORD: ecs.Secret.fromSecretsManager(database.secret, 'password'),
  };
}
