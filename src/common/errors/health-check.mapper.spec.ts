import { ServiceUnavailableException } from '@nestjs/common';
import type { HealthCheckResult } from '@nestjs/terminus';
import { mapHealthCheckFailure } from './health-check.mapper.js';

const failedResult: HealthCheckResult = {
  status: 'error',
  info: {},
  error: { database: { status: 'down', message: 'timeout' } },
  details: { database: { status: 'down', message: 'timeout' } },
};

describe('mapHealthCheckFailure', () => {
  it('returns undefined for a plain Error', () => {
    expect(mapHealthCheckFailure(new Error('boom'))).toBeUndefined();
  });

  it('returns undefined for a 503 that does not carry a health check result', () => {
    const maintenance = new ServiceUnavailableException('down for maintenance');

    expect(mapHealthCheckFailure(maintenance)).toBeUndefined();
  });

  it('keeps the terminus result as the body of a failed check', () => {
    const failedCheck = new ServiceUnavailableException(failedResult);

    expect(mapHealthCheckFailure(failedCheck)).toEqual({
      statusCode: 503,
      body: failedResult,
    });
  });
});
