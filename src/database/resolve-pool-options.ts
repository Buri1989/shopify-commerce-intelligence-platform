import type { PoolOptions } from 'mysql2/promise';
import type { Env } from '../config/env.schema.js';

export type DatabaseSettings = Pick<
  Env,
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_NAME'
  | 'DB_USER'
  | 'DB_PASSWORD'
  | 'DB_POOL_SIZE'
  | 'DB_SSL_CA_PATH'
>;

export function resolvePoolOptions(
  settings: DatabaseSettings,
  readCaBundle: (path: string) => string,
): PoolOptions {
  return {
    host: settings.DB_HOST,
    port: settings.DB_PORT,
    user: settings.DB_USER,
    password: settings.DB_PASSWORD,
    database: settings.DB_NAME,
    connectionLimit: settings.DB_POOL_SIZE,
    ...resolveTlsOptions(settings.DB_SSL_CA_PATH, readCaBundle),
  };
}

// The local server and the test container have no certificate the app could
// verify, so TLS is on only when a bundle is named. Against RDS a plain
// connection is refused by the server, so an unset path fails loudly there
// (design §4.5).
function resolveTlsOptions(
  caBundlePath: string | undefined,
  readCaBundle: (path: string) => string,
): Pick<PoolOptions, 'ssl'> {
  if (caBundlePath === undefined) {
    return {};
  }
  return { ssl: { ca: readCaBundle(caBundlePath), rejectUnauthorized: true } };
}
