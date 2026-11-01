import type { StageConfig } from '../config/stage-config.js';
import type { DatabaseConnection } from '../data/database-connection.js';

// Plain values only: the login travels as secrets, never in the task
// definition, which anyone with ECS read access can describe.
export function resolveContainerEnvironment(
  config: StageConfig,
  database: DatabaseConnection,
): Record<string, string> {
  return {
    NODE_ENV: 'production',
    PORT: String(config.applicationPort),
    LOG_LEVEL: 'info',
    DB_HOST: database.host,
    DB_PORT: database.port,
    DB_NAME: database.databaseName,
    DB_POOL_SIZE: String(config.databasePoolSize),
    DB_SSL_CA_PATH: `${CA_BUNDLE_DIRECTORY}/${config.region}-bundle.pem`,
  };
}

// Where the Dockerfile copies certs/, under its WORKDIR.
const CA_BUNDLE_DIRECTORY = '/app/certs';
