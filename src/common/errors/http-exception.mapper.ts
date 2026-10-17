import { HttpException } from '@nestjs/common';
import type { ErrorResponse, ErrorResponseBody } from './error-response.js';
import { reasonPhrase } from './reason-phrase.js';

export function mapHttpException(
  exception: unknown,
): ErrorResponse | undefined {
  if (!(exception instanceof HttpException)) {
    return undefined;
  }
  const statusCode = exception.getStatus();
  return {
    statusCode,
    body: createErrorResponseBody(statusCode, exception.getResponse()),
  };
}

function createErrorResponseBody(
  statusCode: number,
  response: string | object,
): ErrorResponseBody {
  if (typeof response === 'string') {
    return { statusCode, error: reasonPhrase(statusCode), message: response };
  }
  const { message, error, issues } = response as Partial<ErrorResponseBody>;
  return {
    statusCode,
    error: error ?? reasonPhrase(statusCode),
    message: message ?? reasonPhrase(statusCode),
    ...(issues !== undefined && { issues }),
  };
}
