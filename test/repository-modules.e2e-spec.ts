import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { OrdersRepository } from '../src/orders/orders.repository.js';
import { ProductsRepository } from '../src/products/products.repository.js';
import { ShopifyCollectionsRetriever } from '../src/retrieval/shopify-collections-retriever.js';
import { ShopifyOrdersRetriever } from '../src/retrieval/shopify-orders-retriever.js';
import { ShopifyProductVariantsRetriever } from '../src/retrieval/shopify-product-variants-retriever.js';
import { ShopifyProductsRetriever } from '../src/retrieval/shopify-products-retriever.js';
import { ShopifyShopRetriever } from '../src/retrieval/shopify-shop-retriever.js';
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

  it('hands out the shop retriever', () => {
    expect(app.get(ShopifyShopRetriever)).toBeInstanceOf(ShopifyShopRetriever);
  });

  it('hands out the products retriever', () => {
    expect(app.get(ShopifyProductsRetriever)).toBeInstanceOf(
      ShopifyProductsRetriever,
    );
  });

  it('hands out the product variants retriever', () => {
    expect(app.get(ShopifyProductVariantsRetriever)).toBeInstanceOf(
      ShopifyProductVariantsRetriever,
    );
  });

  it('hands out the collections retriever', () => {
    expect(app.get(ShopifyCollectionsRetriever)).toBeInstanceOf(
      ShopifyCollectionsRetriever,
    );
  });

  it('hands out the orders retriever', () => {
    expect(app.get(ShopifyOrdersRetriever)).toBeInstanceOf(
      ShopifyOrdersRetriever,
    );
  });
});
