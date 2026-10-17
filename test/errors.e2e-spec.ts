import { Controller, Get, type INestApplication, Post } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { REQUEST_ID_HEADER } from '../src/common/logging/request-id.middleware.js';
import { createTestApp } from './create-test-app.js';

@Controller('test-errors')
class ErrorsController {
  @Get('crash')
  crash(): never {
    throw new Error('database password is hunter2');
  }

  @Post('echo')
  echo(): { received: true } {
    return { received: true };
  }
}

const UUID_PATTERN = /^[0-9a-f-]{36}$/;

describe('error responses (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp([ErrorsController]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers an unknown route with the agreed 404 shape and a request id', async () => {
    const response = await request(app.getHttpServer())
      .get('/nope')
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Cannot GET /nope',
      requestId: expect.stringMatching(UUID_PATTERN),
    });
  });

  it('echoes the incoming x-request-id in the header and the body', async () => {
    const response = await request(app.getHttpServer())
      .get('/nope')
      .set(REQUEST_ID_HEADER, 'client-abc-123')
      .expect(404);

    expect(response.headers[REQUEST_ID_HEADER]).toBe('client-abc-123');
    expect(response.body).toMatchObject({ requestId: 'client-abc-123' });
  });

  it('hides the details of an unexpected error behind a generic 500', async () => {
    const response = await request(app.getHttpServer())
      .get('/test-errors/crash')
      .expect(500);

    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
      requestId: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
  });

  it('rejects malformed JSON with a 400 in the agreed shape', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-errors/echo')
      .set('content-type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: expect.any(String),
      requestId: expect.any(String),
    });
  });

  it('rejects a body over the parser limit with a 413 in the agreed shape', async () => {
    const oversized = { padding: 'x'.repeat(200 * 1024) };

    const response = await request(app.getHttpServer())
      .post('/test-errors/echo')
      .send(oversized)
      .expect(413);

    expect(response.body).toEqual({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'request entity too large',
      requestId: expect.any(String),
    });
  });
});
