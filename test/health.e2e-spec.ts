import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { createTestApp } from './create-test-app.js';

describe('health endpoints (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health reports the process is alive', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /ready reports terminus readiness with no indicators', async () => {
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      info: {},
      error: {},
      details: {},
    });
  });
});
