import { HttpStatus } from '@nestjs/common';
import type { ErrorResponse } from './error-response.js';
import { mapExposedHttpError } from './exposed-http-error.mapper.js';
import { mapHealthCheckFailure } from './health-check.mapper.js';
import { mapHttpException } from './http-exception.mapper.js';
import { reasonPhrase } from './reason-phrase.js';

type ErrorMapper = (exception: unknown) => ErrorResponse | undefined;

// A terminus failure is also an HttpException, so it must be matched first
// or its details would be replaced by a generic 503 body.
const ERROR_MAPPERS: readonly ErrorMapper[] = [
  mapHealthCheckFailure,
  mapHttpException,
  mapExposedHttpError,
];

const INTERNAL_SERVER_ERROR: ErrorResponse = {
  statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
  body: {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    error: reasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR),
    message: 'Internal server error',
  },
};

export function resolveErrorResponse(exception: unknown): ErrorResponse {
  for (const map of ERROR_MAPPERS) {
    const response = map(exception);
    if (response) {
      return response;
    }
  }
  return INTERNAL_SERVER_ERROR;
}
