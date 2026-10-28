import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
} from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health-indicator.js';

@Controller()
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get('health')
  checkLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.database.isHealthy()]);
  }
}
