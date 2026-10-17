import { Body, Controller, type INestApplication, Post } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { ZodValidationPipe } from '../src/common/validation/zod-validation.pipe.js';
import { createTestApp } from './create-test-app.js';

const orderSchema = z.object({
  total: z.coerce.number().int().min(0),
  currency: z.string().length(3),
});
type Order = z.infer<typeof orderSchema>;

@Controller('test-orders')
class OrdersController {
  @Post()
  create(@Body(new ZodValidationPipe(orderSchema)) order: Order): Order {
    return order;
  }
}

describe('request validation (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    app = await createTestApp([OrdersController]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts a valid body and hands the parsed value to the handler', async () => {
    await request(app.getHttpServer())
      .post('/test-orders')
      .send({ total: '12', currency: 'USD', isAdmin: true })
      .expect(201)
      .expect({ total: 12, currency: 'USD' });
  });

  it('rejects an invalid body with a 400 that lists the issues', async () => {
    const response = await request(app.getHttpServer())
      .post('/test-orders')
      .send({ total: -1, currency: 'USDX' })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      issues: [
        { path: 'total', message: expect.any(String) },
        { path: 'currency', message: expect.any(String) },
      ],
      requestId: expect.any(String),
    });
  });
});
