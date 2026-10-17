import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';

// After SIGTERM, /ready answers 503 for this long before the process exits,
// so the load balancer stops routing here first. Tune against the ALB
// deregistration delay in Task 1.3.
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 5000;

@Module({
  imports: [
    TerminusModule.forRoot({
      gracefulShutdownTimeoutMs: GRACEFUL_SHUTDOWN_TIMEOUT_MS,
    }),
  ],
  controllers: [HealthController],
})
export class HealthModule {}
