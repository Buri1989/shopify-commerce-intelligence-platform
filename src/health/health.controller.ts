import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  type HealthCheckResult,
  HealthCheckService,
} from '@nestjs/terminus';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get('health')
  checkLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}
