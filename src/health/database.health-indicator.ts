import { Inject, Injectable } from '@nestjs/common';
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from '@nestjs/terminus';
import type { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../database/database.tokens.js';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(DATABASE_POOL) private readonly pool: Pick<Pool, 'query'>,
  ) {}

  // One round trip through the pool proves the host, the login and TLS at
  // once, with the cheapest statement the server answers.
  async isHealthy(): Promise<HealthIndicatorResult> {
    return this.healthIndicatorService
      .check('database')
      .attempt(async () => {
        await this.pool.query('SELECT 1');
      })
      .withTimeout(QUERY_TIMEOUT_MS);
  }
}

// Under the balancer's five-second health timeout, so a hanging database is
// reported down by the app instead of timing out at the balancer (design §4.8).
const QUERY_TIMEOUT_MS = 3000;
