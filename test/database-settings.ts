import type { ConnectionSettings } from '../src/database/resolve-connection-options.js';
import type { DatabaseSettings } from '../src/database/resolve-pool-options.js';

export const connectionSettings = {
  DB_HOST: 'db.internal',
  DB_PORT: 3306,
  DB_NAME: 'commerce_intelligence',
  DB_USER: 'app',
  DB_PASSWORD: 'app',
  DB_SSL_CA_PATH: undefined,
} satisfies ConnectionSettings;

export const databaseSettings = {
  ...connectionSettings,
  DB_POOL_SIZE: 10,
} satisfies DatabaseSettings;
