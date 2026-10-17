import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { mapHttpException } from './http-exception.mapper.js';

describe('mapHttpException', () => {
  it('returns undefined for an exception that is not an HttpException', () => {
    expect(mapHttpException(new Error('boom'))).toBeUndefined();
  });

  it('maps the status, error label and message of a Nest exception', () => {
    const notFound = new NotFoundException('shop not found');

    expect(mapHttpException(notFound)).toEqual({
      statusCode: 404,
      body: { statusCode: 404, error: 'Not Found', message: 'shop not found' },
    });
  });

  it('fills the error label from the reason phrase when the exception has none', () => {
    const notFound = new NotFoundException();

    expect(mapHttpException(notFound)?.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Not Found',
    });
  });

  it('uses a string response as the message', () => {
    const teapot = new HttpException('short and stout', 418);

    expect(mapHttpException(teapot)?.body).toEqual({
      statusCode: 418,
      error: "I'm a Teapot",
      message: 'short and stout',
    });
  });

  it('passes validation issues through to the body', () => {
    const issues = [{ path: 'name', message: 'Required' }];
    const invalid = new BadRequestException({
      message: 'Validation failed',
      issues,
    });

    expect(mapHttpException(invalid)?.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues,
    });
  });
});
