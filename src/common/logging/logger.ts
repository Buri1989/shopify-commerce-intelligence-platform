import {
  pino,
  type DestinationStream,
  type LevelWithSilent,
  type Logger as PinoLogger,
} from 'pino';
import { currentRequestId } from './request-context.js';

export const APPLICATION_LOGGER = Symbol('APPLICATION_LOGGER');
export const SERVICE_NAME = 'commerce-intelligence';

export interface ApplicationLoggerOptions {
  level: LevelWithSilent;
  env: string;
}

export function createApplicationLogger(
  { level, env }: ApplicationLoggerOptions,
  destination?: DestinationStream,
): PinoLogger {
  const options = {
    level,
    base: { service: SERVICE_NAME, env },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label: string) => ({ level: label }) },
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    mixin: () => {
      const requestId = currentRequestId();
      return requestId ? { requestId } : {};
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
