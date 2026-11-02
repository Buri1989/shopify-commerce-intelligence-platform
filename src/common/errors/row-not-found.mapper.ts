import { HttpStatus } from '@nestjs/common';
import { createErrorResponse, type ErrorResponse } from './error-response.js';
import { RowNotFoundError } from './row-not-found.error.js';

export function mapRowNotFound(exception: unknown): ErrorResponse | undefined {
  if (!(exception instanceof RowNotFoundError)) {
    return undefined;
  }
  return createErrorResponse(HttpStatus.NOT_FOUND, exception.message);
}
