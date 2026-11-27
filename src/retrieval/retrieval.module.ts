import { Module } from '@nestjs/common';
import { AccessTokensModule } from '../access-tokens/access-tokens.module.js';
import { ShopifyProductsRetriever } from './shopify-products-retriever.js';
import { ShopifyShopRetriever } from './shopify-shop-retriever.js';
import { ShopifyStoreQuerySender } from './shopify-store-query-sender.js';

@Module({
  imports: [AccessTokensModule],
  providers: [
    ShopifyShopRetriever,
    ShopifyStoreQuerySender,
    ShopifyProductsRetriever,
  ],
  exports: [ShopifyShopRetriever],
})
export class RetrievalModule {}
