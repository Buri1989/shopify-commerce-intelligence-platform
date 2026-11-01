import { createConnection } from 'mysql2/promise';
import { createApplicationLogger } from '../common/logging/logger.js';
import { type Env, validateEnv } from '../config/env.schema.js';
import { MIGRATIONS_FOLDER } from './migrations-folder.js';
import { readCaBundle } from './read-ca-bundle.js';
import { resolveConnectionOptions } from './resolve-connection-options.js';
import { runMigrations } from './run-migrations.js';

const env = validateEnv(process.env);
const logger = createApplicationLogger({
  level: env.LOG_LEVEL,
  env: env.NODE_ENV,
});

try {
  const applied = await migrateDatabase(env);
  logger.info({ applied }, `migrations applied: ${applied}`);
} catch (error) {
  logger.error({ err: error }, 'migrations failed');
  process.exitCode = 1;
}

async function migrateDatabase(env: Env): Promise<number> {
  const connection = await createConnection(
    resolveConnectionOptions(env, readCaBundle),
  );
  try {
    return await runMigrations(connection, MIGRATIONS_FOLDER);
  } finally {
    await connection.end();
  }
}
