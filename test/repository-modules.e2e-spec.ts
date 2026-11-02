import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { OrdersRepository } from '../src/orders/orders.repository.js';
import { ProductsRepository } from '../src/products/products.repository.js';
import { StoresRepository } from '../src/stores/stores.repository.js';
import { createTestApp } from './create-test-app.js';

describe('repository modules (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('hands out the stores repository', () => {
    expect(app.get(StoresRepository)).toBeInstanceOf(StoresRepository);
  });

  it('hands out the products repository', () => {
    expect(app.get(ProductsRepository)).toBeInstanceOf(ProductsRepository);
  });

  it('hands out the orders repository', () => {
    expect(app.get(OrdersRepository)).toBeInstanceOf(OrdersRepository);
  });
});
