import type { Request, Response } from 'express';
import { currentRequestId } from './request-context.js';
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
} from './request-id.middleware.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function createRequest(incomingRequestId?: string) {
  return {
    header: (name: string) =>
      name === REQUEST_ID_HEADER ? incomingRequestId : undefined,
  } as unknown as Request;
}

function createResponse() {
  const setHeader = vi.fn();
  const response = { setHeader } as unknown as Response;
  return { response, setHeader };
}

function runAndCaptureRequestId(
  request: Request,
  response: Response,
): string | undefined {
  let requestIdSeenByNext: string | undefined;
  requestIdMiddleware(request, response, () => {
    requestIdSeenByNext = currentRequestId();
  });
  return requestIdSeenByNext;
}

describe('requestIdMiddleware', () => {
  it('keeps a valid incoming request id and echoes it in the response', () => {
    const { response, setHeader } = createResponse();

    const requestId = runAndCaptureRequestId(
      createRequest('client-abc-123'),
      response,
    );

    expect(requestId).toBe('client-abc-123');
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'client-abc-123');
  });

  it('generates a request id when none is sent', () => {
    const { response, setHeader } = createResponse();

    const requestId = runAndCaptureRequestId(createRequest(), response);

    expect(requestId).toMatch(UUID_PATTERN);
    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, requestId);
  });

  it.each([
    ['empty', ''],
    ['contains whitespace', 'abc def'],
    ['non-ascii', 'идентификатор'],
    ['longer than 128', 'x'.repeat(129)],
  ])(
    'replaces an invalid incoming id (%s) with a generated one',
    (_reason, incomingRequestId) => {
      const requestId = runAndCaptureRequestId(
        createRequest(incomingRequestId),
        createResponse().response,
      );

      expect(requestId).toMatch(UUID_PATTERN);
    },
  );

  it('leaves no request id behind once the request is over', () => {
    runAndCaptureRequestId(createRequest('abc'), createResponse().response);

    expect(currentRequestId()).toBeUndefined();
  });
});
