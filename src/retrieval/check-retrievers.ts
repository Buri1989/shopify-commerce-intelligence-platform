import { NestFactory } from '@nestjs/core';
import type { Logger as PinoLogger } from 'pino';
import { z } from 'zod';
import { AppModule } from '../app.module.js';
import { APPLICATION_LOGGER } from '../common/logging/logger.js';
import { PinoLoggerAdapter } from '../common/logging/pino-logger.adapter.js';
import { ShopifyCollectionsRetriever } from './shopify-collections-retriever.js';
import { ShopifyOrdersRetriever } from './shopify-orders-retriever.js';
import { ShopifyProductVariantsRetriever } from './shopify-product-variants-retriever.js';
import { ShopifyProductsRetriever } from './shopify-products-retriever.js';
import { walkStoreRetrievers } from './walk-store-retrievers.js';

const storeIdSchema = z.coerce.number().int().positive();

const app = await NestFactory.createApplicationContext(AppModule, {
  bufferLogs: true,
});
app.useLogger(app.get(PinoLoggerAdapter));
const logger = app.get<PinoLogger>(APPLICATION_LOGGER);

try {
  await walkStoreRetrievers(
    storeIdSchema.parse(process.argv[2]),
    {
      products: app.get(ShopifyProductsRetriever),
      productVariants: app.get(ShopifyProductVariantsRetriever),
      collections: app.get(ShopifyCollectionsRetriever),
      orders: app.get(ShopifyOrdersRetriever),
    },
    logger,
  );
} catch (error) {
  logger.error({ err: error }, 'retriever walk failed');
  process.exitCode = 1;
} finally {
  await app.close();
}
