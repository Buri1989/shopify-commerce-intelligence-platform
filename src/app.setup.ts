import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Logger as PinoLogger } from 'pino';
import { configureForLoadBalancer } from './common/http/configure-for-load-balancer.js';
import { APPLICATION_LOGGER } from './common/logging/logger.js';
import { PinoLoggerAdapter } from './common/logging/pino-logger.adapter.js';
import { requestIdMiddleware } from './common/logging/request-id.middleware.js';
import { createRequestLoggerMiddleware } from './common/logging/request-logger.middleware.js';
import type { Env } from './config/env.schema.js';

// Must run before app.init(): middleware added here sits ahead of Nest's body
// parser, so even a malformed or oversized request gets a request id and a log line.
export function configureApp(app: INestApplication): void {
  const logger = app.get<PinoLogger>(APPLICATION_LOGGER);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(PinoLoggerAdapter));
  app.use(requestIdMiddleware);
  app.use(createRequestLoggerMiddleware(logger));
  app.use(cookieParser(config.get('COOKIE_SECRET')));
  app.enableShutdownHooks();
  configureForLoadBalancer(app);
}
