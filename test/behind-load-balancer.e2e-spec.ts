import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';
import type { Server } from 'node:http';
import type { App } from 'supertest/types.js';
import { createTestApp } from './create-test-app.js';

describe('running behind the load balancer (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('keeps idle connections open longer than the load balancer does', () => {
    const server = app.getHttpServer() as Server;

    expect(server.keepAliveTimeout).toBe(65_000);
    expect(server.headersTimeout).toBe(66_000);
  });

  it('trusts exactly one proxy hop for the client address', () => {
    const express: Express = app.getHttpAdapter().getInstance();

    expect(express.get('trust proxy')).toBe(1);
  });
});
