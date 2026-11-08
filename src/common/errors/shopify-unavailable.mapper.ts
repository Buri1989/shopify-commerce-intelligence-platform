import { HttpStatus } from '@nestjs/common';
import { createErrorResponse, type ErrorResponse } from './error-response.js';
import { ShopifyUnavailableError } from './shopify-unavailable.error.js';

export function mapShopifyUnavailable(
  exception: unknown,
): ErrorResponse | undefined {
  if (!(exception instanceof ShopifyUnavailableError)) {
    return undefined;
  }
  return createErrorResponse(HttpStatus.SERVICE_UNAVAILABLE, exception.message);
}
