import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { APPLICATION_LOGGER, createApplicationLogger } from './logger.js';
import { PinoLoggerAdapter } from './pino-logger.adapter.js';

@Global()
@Module({
  providers: [
    {
      provide: APPLICATION_LOGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createApplicationLogger({
          level: config.get('LOG_LEVEL'),
          env: config.get('NODE_ENV'),
        }),
    },
    PinoLoggerAdapter,
  ],
  exports: [APPLICATION_LOGGER, PinoLoggerAdapter],
})
export class LoggingModule {}
