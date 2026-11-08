import { HttpStatus } from '@nestjs/common';
import { createErrorResponse, type ErrorResponse } from './error-response.js';
import { StoreMustAuthorizeError } from './store-must-authorize.error.js';

export function mapStoreMustAuthorize(
  exception: unknown,
): ErrorResponse | undefined {
  if (!(exception instanceof StoreMustAuthorizeError)) {
    return undefined;
  }
  return createErrorResponse(HttpStatus.CONFLICT, exception.message);
}
