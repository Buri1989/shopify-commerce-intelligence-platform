import { ServiceUnavailableException } from '@nestjs/common';
import type { HealthCheckResult } from '@nestjs/terminus';
import type { ErrorResponse } from './error-response.js';

export function mapHealthCheckFailure(
  exception: unknown,
): ErrorResponse | undefined {
  if (!(exception instanceof ServiceUnavailableException)) {
    return undefined;
  }
  const result = exception.getResponse();
  if (!isHealthCheckResult(result)) {
    return undefined;
  }
  return { statusCode: exception.getStatus(), body: result };
}

function isHealthCheckResult(
  response: string | object,
): response is HealthCheckResult {
  return (
    typeof response === 'object' &&
    'status' in response &&
    'details' in response
  );
}
