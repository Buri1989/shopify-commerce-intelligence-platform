import type { ConnectionOptions } from 'mysql2/promise';
import type { Env } from '../config/env.schema.js';

export type ConnectionSettings = Pick<
  Env,
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_NAME'
  | 'DB_USER'
  | 'DB_PASSWORD'
  | 'DB_SSL_CA_PATH'
>;

export type ReadCaBundle = (path: string) => string;

export function resolveConnectionOptions(
  settings: ConnectionSettings,
  readCaBundle: ReadCaBundle,
): ConnectionOptions {
  return {
    host: settings.DB_HOST,
    port: settings.DB_PORT,
    user: settings.DB_USER,
    password: settings.DB_PASSWORD,
    database: settings.DB_NAME,
    ...resolveTlsOptions(settings.DB_SSL_CA_PATH, readCaBundle),
  };
}

// TLS only when a bundle is named: the local server and the test container
// have no certificate the app could verify.
function resolveTlsOptions(
  caBundlePath: string | undefined,
  readCaBundle: ReadCaBundle,
): Pick<ConnectionOptions, 'ssl'> {
  if (caBundlePath === undefined) {
    return {};
  }
  return { ssl: { ca: readCaBundle(caBundlePath), rejectUnauthorized: true } };
}
