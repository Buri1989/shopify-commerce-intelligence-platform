import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import type { Level, Logger as PinoLogger } from 'pino';
import { APPLICATION_LOGGER } from './logger.js';

@Injectable()
export class PinoLoggerAdapter implements LoggerService {
  constructor(
    @Inject(APPLICATION_LOGGER) private readonly logger: PinoLogger,
  ) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.forward('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.forward('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.forward('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.forward('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.forward('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.forward('fatal', message, optionalParams);
  }

  // Nest's convention: the last string param is the context; for error and fatal,
  // an earlier string param is the stack trace.
  private forward(
    level: Level,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const remainingParams = [...optionalParams];
    const fields: Record<string, unknown> = {};

    if (typeof remainingParams.at(-1) === 'string') {
      fields.context = remainingParams.pop();
    }
    if (level === 'error' || level === 'fatal') {
      const stack = remainingParams.find(
        (param): param is string => typeof param === 'string',
      );
      if (stack) {
        fields.stack = stack;
      }
    }

    if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, message.message);
    } else if (typeof message === 'object' && message !== null) {
      this.logger[level]({ ...fields, ...message });
    } else {
      this.logger[level](fields, String(message));
    }
  }
}
