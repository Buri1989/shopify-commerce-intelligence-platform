import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { NewCollection } from '../collections/collections.repository.js';
import {
  COLLECTION_PRODUCTS_QUERY,
  COLLECTIONS_QUERY,
} from './queries/shopify-collections-queries.js';
import { createEmptyLastPage, type RetrievedPage } from './retrieved-page.js';
import { createShopifyIdSchema } from './shopify-id-schema.js';
import { createShopifyPageSchema } from './shopify-page-schema.js';
import { ShopifyStoreQuerySender } from './shopify-store-query-sender.js';

export type RetrievedCollection = NewCollection;
export type RetrievedCollectionProduct = {
  productShopifyId: number;
  position: number;
};
export type CollectionProductsCursor = { after: string; nextPosition: number };

const FIRST_POSITION = 1;

const collectionsDataSchema = z.object({
  collections: createShopifyPageSchema(
    z.object({
      id: createShopifyIdSchema('Collection'),
      title: z.string().min(1),
      handle: z.string().min(1),
    }),
  ),
});

const collectionProductsDataSchema = z.object({
  collection: z
    .object({
      products: createShopifyPageSchema(
        z.object({ id: createShopifyIdSchema('Product') }),
      ),
    })
    .nullable(),
});

@Injectable()
export class ShopifyCollectionsRetriever {
  constructor(
    @Inject(ShopifyStoreQuerySender)
    private readonly querySender: Pick<
      ShopifyStoreQuerySender,
      'sendStoreQuery'
    >,
  ) {}

  async retrieveCollections(
    storeId: number,
    cursor: string | null,
  ): Promise<RetrievedPage<RetrievedCollection>> {
    const { data, requestedQueryCost } = await this.querySender.sendStoreQuery(
      storeId,
      COLLECTIONS_QUERY,
      { after: cursor },
    );
    const { collections } = collectionsDataSchema.parse(data);
    return {
      rows: collections.nodes.map(({ id, ...collection }) => ({
        shopifyId: id,
        ...collection,
      })),
      nextCursor: collections.nextCursor,
      requestedQueryCost,
    };
  }

  async retrieveCollectionProducts(
    storeId: number,
    collectionShopifyId: number,
    cursor: CollectionProductsCursor | null,
  ): Promise<
    RetrievedPage<RetrievedCollectionProduct, CollectionProductsCursor>
  > {
    const { data, requestedQueryCost } = await this.querySender.sendStoreQuery(
      storeId,
      COLLECTION_PRODUCTS_QUERY,
      {
        id: `gid://shopify/Collection/${collectionShopifyId}`,
        after: cursor?.after ?? null,
      },
    );
    const { collection } = collectionProductsDataSchema.parse(data);
    if (collection === null) {
      return createEmptyLastPage(requestedQueryCost);
    }
    const firstPosition = cursor?.nextPosition ?? FIRST_POSITION;
    const { nodes, nextCursor } = collection.products;
    return {
      rows: nodes.map(({ id }, index) => ({
        productShopifyId: id,
        position: firstPosition + index,
      })),
      nextCursor:
        nextCursor === null
          ? null
          : { after: nextCursor, nextPosition: firstPosition + nodes.length },
      requestedQueryCost,
    };
  }
}
