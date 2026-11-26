import { Module } from '@nestjs/common';
import { ShopifyShopRetriever } from './shopify-shop-retriever.js';

@Module({
  providers: [ShopifyShopRetriever],
  exports: [ShopifyShopRetriever],
})
export class RetrievalModule {}
