import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContextStorage } from './request-context.js';

export const REQUEST_ID_HEADER = 'x-request-id';

// 1–128 printable ASCII characters with no whitespace: safe to echo in a header and a log line.
const ACCEPTED_REQUEST_ID_PATTERN = /^[\x21-\x7e]{1,128}$/;

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incomingRequestId = request.header(REQUEST_ID_HEADER);
  const requestId =
    incomingRequestId && ACCEPTED_REQUEST_ID_PATTERN.test(incomingRequestId)
      ? incomingRequestId
      : randomUUID();

  response.setHeader(REQUEST_ID_HEADER, requestId);
  requestContextStorage.run({ requestId }, next);
}
