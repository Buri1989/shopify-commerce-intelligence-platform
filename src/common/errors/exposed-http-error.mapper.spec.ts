import { mapExposedHttpError } from './exposed-http-error.mapper.js';

describe('mapExposedHttpError', () => {
  it('returns undefined for a plain Error', () => {
    expect(mapExposedHttpError(new Error('boom'))).toBeUndefined();
  });

  it('keeps the status and message of an exposed error such as an oversized body', () => {
    const tooLarge = Object.assign(new Error('request entity too large'), {
      statusCode: 413,
      expose: true,
    });

    expect(mapExposedHttpError(tooLarge)).toEqual({
      statusCode: 413,
      body: {
        statusCode: 413,
        error: 'Payload Too Large',
        message: 'request entity too large',
      },
    });
  });

  it('returns undefined for an error that is not meant to be exposed', () => {
    const badGateway = Object.assign(new Error('bad gateway'), {
      statusCode: 502,
      expose: false,
    });

    expect(mapExposedHttpError(badGateway)).toBeUndefined();
  });

  it('returns undefined for an exposed error outside the error status range', () => {
    const notAnError = Object.assign(new Error('fine'), {
      statusCode: 200,
      expose: true,
    });

    expect(mapExposedHttpError(notAnError)).toBeUndefined();
  });
});
