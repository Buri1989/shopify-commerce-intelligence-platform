import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Logger as PinoLogger } from 'pino';

// Probes fire every few seconds; logging them would drown everything else.
const PROBE_PATHS = new Set(['/health', '/ready']);

const NANOSECONDS_PER_MILLISECOND = 1_000_000n;

export function createRequestLoggerMiddleware(
  logger: PinoLogger,
): RequestHandler {
  return function requestLoggerMiddleware(
    request: Request,
    response: Response,
    next: NextFunction,
  ): void {
    if (PROBE_PATHS.has(request.path)) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    response.on('finish', () => {
      logger.info(
        {
          context: 'http',
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: elapsedMilliseconds(startedAt),
        },
        'request completed',
      );
    });
    next();
  };
}

function elapsedMilliseconds(startedAt: bigint): number {
  const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
  return Number((elapsedNanoseconds * 10n) / NANOSECONDS_PER_MILLISECOND) / 10;
}
