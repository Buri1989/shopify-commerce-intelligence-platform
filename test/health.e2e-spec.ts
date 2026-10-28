import type { INestApplication } from '@nestjs/common';
import { createPool } from 'mysql2/promise';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DATABASE_POOL } from '../src/database/database.tokens.js';
import { createTestApp } from './create-test-app.js';

// Nothing listens on port 1, so the connection is refused at once instead of
// hanging until the indicator's time limit. The IPv4 loopback by name: through
// `localhost` Node tries both loopbacks and reports one combined error whose
// message says nothing about the cause.
const CLOSED_PORT = 1;
const LOOPBACK = '127.0.0.1';

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

  it('GET /ready reports the database up', async () => {
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      info: { database: { status: 'up', responseTime: expect.any(Number) } },
      error: {},
      details: { database: { status: 'up', responseTime: expect.any(Number) } },
    });
  });
});

describe('health endpoints with the database unreachable (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp(
      [],
      [
        {
          provide: DATABASE_POOL,
          useValue: createPool({ host: LOOPBACK, port: CLOSED_PORT }),
        },
      ],
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /health still reports the process is alive', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('GET /ready answers 503 and reports the database down', async () => {
    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(503);

    const down = {
      status: 'down',
      message: expect.stringContaining('ECONNREFUSED'),
      responseTime: expect.any(Number),
    };
    expect(response.body).toEqual({
      status: 'error',
      info: {},
      error: { database: down },
      details: { database: down },
      requestId: expect.any(String),
    });
  });
});
