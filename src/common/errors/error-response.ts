import { reasonPhrase } from './reason-phrase.js';

export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
  issues?: unknown;
}

export interface ErrorResponse {
  statusCode: number;
  body: object;
}

export function createErrorResponse(
  statusCode: number,
  message: string,
): ErrorResponse {
  return {
    statusCode,
    body: { statusCode, error: reasonPhrase(statusCode), message },
  };
}
