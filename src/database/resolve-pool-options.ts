import type { PoolOptions } from 'mysql2/promise';
import type { Env } from '../config/env.schema.js';
import {
  type ConnectionSettings,
  type ReadCaBundle,
  resolveConnectionOptions,
} from './resolve-connection-options.js';

export type DatabaseSettings = ConnectionSettings & Pick<Env, 'DB_POOL_SIZE'>;

export function resolvePoolOptions(
  settings: DatabaseSettings,
  readCaBundle: ReadCaBundle,
): PoolOptions {
  return {
    ...resolveConnectionOptions(settings, readCaBundle),
    connectionLimit: settings.DB_POOL_SIZE,
  };
}
