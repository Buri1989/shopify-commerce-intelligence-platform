import { readFileSync } from 'node:fs';
import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/mysql2';
import { createPool, type Pool } from 'mysql2/promise';
import type { Env } from '../config/env.schema.js';
import { DATABASE, DATABASE_POOL } from './database.tokens.js';
import {
  type DatabaseSettings,
  resolvePoolOptions,
} from './resolve-pool-options.js';

@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createPool(
          resolvePoolOptions(readDatabaseSettings(config), (path) =>
            readFileSync(path, 'utf8'),
          ),
        ),
    },
    {
      provide: DATABASE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => drizzle({ client: pool }),
    },
  ],
  exports: [DATABASE_POOL, DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pick<Pool, 'end'>,
  ) {}

  // In-flight queries finish and every connection closes, so a stopping task
  // leaves nothing half-done on the server.
  onApplicationShutdown(): Promise<void> {
    return this.pool.end();
  }
}

function readDatabaseSettings(
  config: ConfigService<Env, true>,
): DatabaseSettings {
  return {
    DB_HOST: config.get('DB_HOST'),
    DB_PORT: config.get('DB_PORT'),
    DB_NAME: config.get('DB_NAME'),
    DB_USER: config.get('DB_USER'),
    DB_PASSWORD: config.get('DB_PASSWORD'),
    DB_POOL_SIZE: config.get('DB_POOL_SIZE'),
    DB_SSL_CA_PATH: config.get('DB_SSL_CA_PATH'),
  };
}
