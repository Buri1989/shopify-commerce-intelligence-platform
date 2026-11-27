import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { NewProductVariant } from '../products/products.repository.js';
import { PRODUCT_VARIANTS_QUERY } from './queries/shopify-product-variants-query.js';
import type { RetrievedPage } from './retrieved-page.js';
import { createShopifyIdSchema } from './shopify-id-schema.js';
import { createShopifyPageSchema } from './shopify-page-schema.js';
import { ShopifyStoreQuerySender } from './shopify-store-query-sender.js';

export type RetrievedProductVariant = Omit<NewProductVariant, 'productId'> & {
  productShopifyId: number;
};

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;

const productVariantsDataSchema = z.object({
  productVariants: createShopifyPageSchema(
    z.object({
      id: createShopifyIdSchema('ProductVariant'),
      title: z.string().min(1),
      sku: z.string().nullable(),
      price: z.string().regex(DECIMAL_PATTERN),
      position: z.number().int().positive(),
      product: z.object({ id: createShopifyIdSchema('Product') }),
    }),
  ),
});

@Injectable()
export class ShopifyProductVariantsRetriever {
  constructor(
    @Inject(ShopifyStoreQuerySender)
    private readonly querySender: Pick<
      ShopifyStoreQuerySender,
      'sendStoreQuery'
    >,
  ) {}

  async retrieveProductVariants(
    storeId: number,
    cursor: string | null,
  ): Promise<RetrievedPage<RetrievedProductVariant>> {
    const { data, requestedQueryCost } = await this.querySender.sendStoreQuery(
      storeId,
      PRODUCT_VARIANTS_QUERY,
      { after: cursor },
    );
    const { productVariants } = productVariantsDataSchema.parse(data);
    return {
      rows: productVariants.nodes.map(({ id, product, ...variant }) => ({
        shopifyId: id,
        ...variant,
        productShopifyId: product.id,
      })),
      nextCursor: productVariants.nextCursor,
      requestedQueryCost,
    };
  }
}
