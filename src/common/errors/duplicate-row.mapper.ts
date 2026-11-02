import { HttpStatus } from '@nestjs/common';
import { DuplicateRowError } from './duplicate-row.error.js';
import { createErrorResponse, type ErrorResponse } from './error-response.js';

export function mapDuplicateRow(exception: unknown): ErrorResponse | undefined {
  if (!(exception instanceof DuplicateRowError)) {
    return undefined;
  }
  return createErrorResponse(HttpStatus.CONFLICT, exception.message);
}
