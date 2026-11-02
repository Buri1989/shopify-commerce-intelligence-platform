import { HttpStatus } from '@nestjs/common';
import { mapDuplicateRow } from './duplicate-row.mapper.js';
import { createErrorResponse, type ErrorResponse } from './error-response.js';
import { mapExposedHttpError } from './exposed-http-error.mapper.js';
import { mapHealthCheckFailure } from './health-check.mapper.js';
import { mapHttpException } from './http-exception.mapper.js';
import { mapRowNotFound } from './row-not-found.mapper.js';

type ErrorMapper = (exception: unknown) => ErrorResponse | undefined;

// A terminus failure is also an HttpException, so it must be matched first
// or its details would be replaced by a generic 503 body.
const ERROR_MAPPERS: readonly ErrorMapper[] = [
  mapHealthCheckFailure,
  mapHttpException,
  mapExposedHttpError,
  mapDuplicateRow,
  mapRowNotFound,
];

const INTERNAL_SERVER_ERROR = createErrorResponse(
  HttpStatus.INTERNAL_SERVER_ERROR,
  'Internal server error',
);

export function resolveErrorResponse(exception: unknown): ErrorResponse {
  for (const map of ERROR_MAPPERS) {
    const response = map(exception);
    if (response) {
      return response;
    }
  }
  return INTERNAL_SERVER_ERROR;
}
