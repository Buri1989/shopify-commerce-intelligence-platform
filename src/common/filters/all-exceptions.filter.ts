import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Logger as PinoLogger } from 'pino';
import { resolveErrorResponse } from '../errors/resolve-error-response.js';
import { APPLICATION_LOGGER } from '../logging/logger.js';
import { currentRequestId } from '../logging/request-context.js';

const LOG_CONTEXT = 'AllExceptionsFilter';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(APPLICATION_LOGGER) private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const { statusCode, body } = resolveErrorResponse(exception);

    this.logFailure(request, statusCode, exception);
    response
      .status(statusCode)
      .json({ ...body, requestId: currentRequestId() });
  }

  private logFailure(
    request: Request,
    statusCode: number,
    exception: unknown,
  ): void {
    const fields = {
      context: LOG_CONTEXT,
      method: request.method,
      path: request.path,
      statusCode,
    };
    if (isUnexpected(exception, statusCode)) {
      this.logger.error({ ...fields, err: exception }, 'request failed');
      return;
    }
    this.logger.warn(
      { ...fields, reason: errorMessage(exception) },
      'request rejected',
    );
  }
}

function errorMessage(exception: unknown): string {
  return exception instanceof Error ? exception.message : String(exception);
}

// A 5xx that no code threw on purpose: the generic 500 fallback, or a hidden
// http error. A thrown HttpException, including a terminus 503, is a
// deliberate response and only needs its message.
function isUnexpected(exception: unknown, statusCode: number): boolean {
  return (
    statusCode >= HttpStatus.INTERNAL_SERVER_ERROR &&
    !(exception instanceof HttpException)
  );
}
