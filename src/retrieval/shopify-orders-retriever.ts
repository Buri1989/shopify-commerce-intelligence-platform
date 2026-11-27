import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { createShopifyId } from './create-shopify-id.js';
import {
  ORDER_ITEMS_QUERY,
  ORDERS_QUERY,
} from './queries/shopify-orders-queries.js';
import { resolveStoreDay } from './resolve-store-day.js';
import { createEmptyLastPage, type RetrievedPage } from './retrieved-page.js';
import {
  type RetrievedOrderItem,
  shopifyOrderItemSchema,
} from './shopify-order-item-schema.js';
import {
  type RetrievedOrder,
  shopifyOrderSchema,
} from './shopify-order-schema.js';
import { createShopifyPageSchema } from './shopify-page-schema.js';
import { ShopifyStoreQuerySender } from './shopify-store-query-sender.js';

const ordersDataSchema = z.object({
  orders: createShopifyPageSchema(shopifyOrderSchema),
  shop: z.object({ ianaTimezone: z.string().min(1) }),
});

const orderItemsDataSchema = z.object({
  order: z
    .object({ lineItems: createShopifyPageSchema(shopifyOrderItemSchema) })
    .nullable(),
});

@Injectable()
export class ShopifyOrdersRetriever {
  constructor(
    @Inject(ShopifyStoreQuerySender)
    private readonly querySender: Pick<
      ShopifyStoreQuerySender,
      'sendStoreQuery'
    >,
  ) {}

  async retrieveOrders(
    storeId: number,
    cursor: string | null,
  ): Promise<RetrievedPage<RetrievedOrder>> {
    const { data, requestedQueryCost } = await this.querySender.sendStoreQuery(
      storeId,
      ORDERS_QUERY,
      { after: cursor },
    );
    const { orders, shop } = ordersDataSchema.parse(data);
    return {
      rows: orders.nodes.map((order) => ({
        ...order,
        placedOn: resolveStoreDay(order.placedAt, shop.ianaTimezone),
      })),
      nextCursor: orders.nextCursor,
      requestedQueryCost,
    };
  }

  async retrieveOrderItems(
    storeId: number,
    orderShopifyId: number,
    cursor: string,
  ): Promise<RetrievedPage<RetrievedOrderItem>> {
    const { data, requestedQueryCost } = await this.querySender.sendStoreQuery(
      storeId,
      ORDER_ITEMS_QUERY,
      { id: createShopifyId('Order', orderShopifyId), after: cursor },
    );
    const { order } = orderItemsDataSchema.parse(data);
    if (order === null) {
      return createEmptyLastPage(requestedQueryCost);
    }
    return {
      rows: order.lineItems.nodes,
      nextCursor: order.lineItems.nextCursor,
      requestedQueryCost,
    };
  }
}
