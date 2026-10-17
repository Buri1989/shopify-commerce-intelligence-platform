import {
  type ArgumentsHost,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Logger as PinoLogger } from 'pino';
import { requestContextStorage } from '../logging/request-context.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function createResponse() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status } as unknown as Response;
  return { response, status, json };
}

function createHost(response: Response): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', path: '/shops/1' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let logger: {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    logger = { error: vi.fn(), warn: vi.fn() };
    filter = new AllExceptionsFilter(logger as unknown as PinoLogger);
  });

  it('sends the resolved status and body with the request id', () => {
    const { response, status, json } = createResponse();

    requestContextStorage.run({ requestId: 'req-1' }, () => {
      filter.catch(
        new NotFoundException('shop not found'),
        createHost(response),
      );
    });

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      statusCode: 404,
      error: 'Not Found',
      message: 'shop not found',
      requestId: 'req-1',
    });
  });

  it('sends a terminus failure as is, plus the request id', () => {
    const { response, status, json } = createResponse();
    const result = {
      status: 'error',
      details: { database: { status: 'down' } },
    };

    requestContextStorage.run({ requestId: 'req-2' }, () => {
      filter.catch(
        new ServiceUnavailableException(result),
        createHost(response),
      );
    });

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ ...result, requestId: 'req-2' });
  });

  it('logs an unexpected error at error level with the exception', () => {
    const { response } = createResponse();
    const crash = new Error('boom');

    filter.catch(crash, createHost(response));

    expect(logger.error).toHaveBeenCalledWith(
      {
        context: 'AllExceptionsFilter',
        method: 'GET',
        path: '/shops/1',
        statusCode: 500,
        err: crash,
      },
      'request failed',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs a client error at warn level with the reason', () => {
    const { response } = createResponse();

    filter.catch(new NotFoundException('shop not found'), createHost(response));

    expect(logger.warn).toHaveBeenCalledWith(
      {
        context: 'AllExceptionsFilter',
        method: 'GET',
        path: '/shops/1',
        statusCode: 404,
        reason: 'shop not found',
      },
      'request rejected',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
  it('logs a deliberate 5xx at warn level with the reason', () => {
    const { response } = createResponse();

    filter.catch(
      new ServiceUnavailableException('upstream unreachable'),
      createHost(response),
    );

    expect(logger.warn).toHaveBeenCalledWith(
      {
        context: 'AllExceptionsFilter',
        method: 'GET',
        path: '/shops/1',
        statusCode: 503,
        reason: 'upstream unreachable',
      },
      'request rejected',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });
});
