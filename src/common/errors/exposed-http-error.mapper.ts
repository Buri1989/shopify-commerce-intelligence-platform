import type { ErrorResponse } from './error-response.js';
import { reasonPhrase } from './reason-phrase.js';

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
  const { statusCode, message } = exception;
  return {
    statusCode,
    body: { statusCode, error: reasonPhrase(statusCode), message },
  };
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
