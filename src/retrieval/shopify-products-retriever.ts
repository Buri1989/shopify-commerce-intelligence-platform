import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { NewProduct } from '../products/products.repository.js';
import { PRODUCTS_QUERY } from './queries/shopify-products-query.js';
import type { RetrievedPage } from './retrieved-page.js';
import { createShopifyIdSchema } from './shopify-id-schema.js';
import { createShopifyPageSchema } from './shopify-page-schema.js';
import { ShopifyStoreQuerySender } from './shopify-store-query-sender.js';

export type RetrievedProduct = NewProduct;

const emptyTextAsNullSchema = z
  .string()
  .transform((text) => (text === '' ? null : text));

const productsDataSchema = z.object({
  products: createShopifyPageSchema(
    z.object({
      id: createShopifyIdSchema('Product'),
      title: z.string().min(1),
      handle: z.string().min(1),
      vendor: emptyTextAsNullSchema,
      productType: emptyTextAsNullSchema,
      status: z.string().min(1),
    }),
  ),
});

@Injectable()
export class ShopifyProductsRetriever {
  constructor(
    @Inject(ShopifyStoreQuerySender)
    private readonly querySender: Pick<
      ShopifyStoreQuerySender,
      'sendStoreQuery'
    >,
  ) {}

  async retrieveProducts(
    storeId: number,
    cursor: string | null,
  ): Promise<RetrievedPage<RetrievedProduct>> {
    const { data, requestedQueryCost } = await this.querySender.sendStoreQuery(
      storeId,
      PRODUCTS_QUERY,
      { after: cursor },
    );
    const { products } = productsDataSchema.parse(data);
    return {
      rows: products.nodes.map(({ id, ...product }) => ({
        shopifyId: id,
        ...product,
      })),
      nextCursor: products.nextCursor,
      requestedQueryCost,
    };
  }
}
