import { Module } from '@nestjs/common';
import { AccessTokensModule } from '../access-tokens/access-tokens.module.js';
import { ShopifyCollectionsRetriever } from './shopify-collections-retriever.js';
import { ShopifyProductVariantsRetriever } from './shopify-product-variants-retriever.js';
import { ShopifyProductsRetriever } from './shopify-products-retriever.js';
import { ShopifyShopRetriever } from './shopify-shop-retriever.js';
import { ShopifyStoreQuerySender } from './shopify-store-query-sender.js';

@Module({
  imports: [AccessTokensModule],
  providers: [
    ShopifyShopRetriever,
    ShopifyStoreQuerySender,
    ShopifyProductsRetriever,
    ShopifyProductVariantsRetriever,
    ShopifyCollectionsRetriever,
  ],
  exports: [ShopifyShopRetriever],
})
export class RetrievalModule {}
