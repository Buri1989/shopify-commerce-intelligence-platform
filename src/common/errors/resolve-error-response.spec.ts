import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { resolveErrorResponse } from './resolve-error-response.js';

describe('resolveErrorResponse', () => {
  it('falls back to a generic 500 that hides the error details', () => {
    const response = resolveErrorResponse(new Error('db password is hunter2'));

    expect(response).toEqual({
      statusCode: 500,
      body: {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal server error',
      },
    });
  });

  it('uses the matching mapper for a Nest exception', () => {
    const response = resolveErrorResponse(new BadRequestException('bad input'));

    expect(response.statusCode).toBe(400);
  });

  it('keeps a terminus failure intact instead of flattening it to a plain 503', () => {
    const result = {
      status: 'error',
      details: { database: { status: 'down' } },
    };

    const response = resolveErrorResponse(
      new ServiceUnavailableException(result),
    );

    expect(response.body).toBe(result);
  });

  it('turns a non-exposed http error into the generic 500', () => {
    const badGateway = Object.assign(new Error('upstream leaked'), {
      statusCode: 502,
      expose: false,
    });

    expect(resolveErrorResponse(badGateway).statusCode).toBe(500);
  });
});
