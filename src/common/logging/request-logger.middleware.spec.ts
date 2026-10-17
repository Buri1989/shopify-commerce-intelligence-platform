import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import type { Logger as PinoLogger } from 'pino';
import { createRequestLoggerMiddleware } from './request-logger.middleware.js';

function createRequest(method: string, path: string, originalUrl = path) {
  return { method, path, originalUrl } as Request;
}

function createResponse(statusCode: number) {
  const response = new EventEmitter() as unknown as Response;
  response.statusCode = statusCode;
  return response;
}

describe('createRequestLoggerMiddleware', () => {
  let logger: { info: ReturnType<typeof vi.fn> };
  let middleware: ReturnType<typeof createRequestLoggerMiddleware>;

  beforeEach(() => {
    logger = { info: vi.fn() };
    middleware = createRequestLoggerMiddleware(logger as unknown as PinoLogger);
  });

  it('logs one summary line when the response finishes', () => {
    const response = createResponse(201);
    const next = vi.fn();

    middleware(createRequest('POST', '/orders'), response, next);
    response.emit('finish');

    expect(next).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith(
      {
        context: 'http',
        method: 'POST',
        path: '/orders',
        statusCode: 201,
        durationMs: expect.any(Number),
      },
      'request completed',
    );
  });

  it('logs nothing before the response finishes', () => {
    middleware(createRequest('GET', '/orders'), createResponse(200), vi.fn());

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs the path without the query string', () => {
    const response = createResponse(200);
    const request = createRequest(
      'GET',
      '/auth/callback',
      '/auth/callback?code=secret',
    );

    middleware(request, response, vi.fn());
    response.emit('finish');

    const [fields] = logger.info.mock.calls[0];
    expect(fields.path).toBe('/auth/callback');
    expect(JSON.stringify(fields)).not.toContain('secret');
  });

  it.each(['/health', '/ready'])(
    'does not log probe requests to %s',
    (path) => {
      const response = createResponse(200);
      const next = vi.fn();

      middleware(createRequest('GET', path), response, next);
      response.emit('finish');

      expect(next).toHaveBeenCalledOnce();
      expect(logger.info).not.toHaveBeenCalled();
    },
  );
});
