import { HttpStatus } from '@nestjs/common';
import { ShopifyUnavailableError } from '../errors/shopify-unavailable.error.js';

const ANSWER_TIME_LIMIT_MILLISECONDS = 10_000;

export interface ShopifyRequest {
  readonly headers: Record<string, string>;
  readonly body: string;
}

export async function sendShopifyRequest(
  url: string,
  { headers, body }: ShopifyRequest,
): Promise<Response> {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(ANSWER_TIME_LIMIT_MILLISECONDS),
  }).catch((cause: unknown) => {
    throw new ShopifyUnavailableError({ cause });
  });
  if (isShopifyUnavailable(response.status)) {
    throw new ShopifyUnavailableError();
  }
  return response;
}

function isShopifyUnavailable(status: number): boolean {
  return (
    status === HttpStatus.TOO_MANY_REQUESTS ||
    status >= HttpStatus.INTERNAL_SERVER_ERROR
  );
}
