import { createErrorResponse, type ErrorResponse } from './error-response.js';

interface ExposedHttpError extends Error {
  statusCode: number;
  expose: true;
}

export function mapExposedHttpError(
  exception: unknown,
): ErrorResponse | undefined {
  if (!isExposedHttpError(exception)) {
    return undefined;
  }
  return createErrorResponse(exception.statusCode, exception.message);
}

function isExposedHttpError(exception: unknown): exception is ExposedHttpError {
  if (!(exception instanceof Error)) {
    return false;
  }
  const { statusCode, expose } = exception as Partial<ExposedHttpError>;
  return expose === true && isErrorStatus(statusCode);
}

function isErrorStatus(statusCode: unknown): statusCode is number {
  return (
    typeof statusCode === 'number' && statusCode >= 400 && statusCode <= 599
  );
}
