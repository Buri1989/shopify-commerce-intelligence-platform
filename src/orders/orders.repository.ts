import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt, or, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.tokens.js';
import type { GeneratedColumns } from '../database/generated-columns.js';
import { createPage, PAGE_QUERY_LIMIT, type Page } from '../database/page.js';
import { refuseDuplicateRow } from '../database/refuse-duplicate-row.js';
import { requireRowFound } from '../database/require-row-found.js';
import { orderItems, orders } from '../database/schema/index.js';

export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type OrderWithItems = Order & { items: OrderItem[] };
export type NewOrder = Omit<
  typeof orders.$inferInsert,
  GeneratedColumns | 'storeId'
>;
export type NewOrderItem = Omit<
  typeof orderItems.$inferInsert,
  GeneratedColumns | 'storeId' | 'orderId' | 'productId' | 'variantId'
>;
export type OrderChanges = Partial<Omit<NewOrder, 'shopifyId'>>;
export type OrderFilters = {
  readonly placedFrom?: Date; // included
  readonly placedBefore?: Date; // not included
  readonly financialStatus?: string;
};
export type OrderCursor = Pick<Order, 'placedAt' | 'id'>;

@Injectable()
export class OrdersRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  create(
    storeId: number,
    order: NewOrder,
    items: NewOrderItem[],
  ): Promise<number> {
    return refuseDuplicateRow(() =>
      this.database.transaction(async (transaction) => {
        const [{ id }] = await transaction
          .insert(orders)
          .values({ ...order, storeId })
          .$returningId();
        if (items.length > 0) {
          await transaction
            .insert(orderItems)
            .values(items.map((item) => createItemRow(item, storeId, id)));
        }
        return id;
      }),
    );
  }

  async findById(
    storeId: number,
    orderId: number,
  ): Promise<OrderWithItems | undefined> {
    const [order] = await this.database
      .select()
      .from(orders)
      .where(createOrderCondition(storeId, orderId));
    if (order === undefined) {
      return undefined;
    }
    const items = await this.database
      .select()
      .from(orderItems)
      .where(
        and(eq(orderItems.storeId, storeId), eq(orderItems.orderId, orderId)),
      )
      .orderBy(orderItems.id);
    return { ...order, items };
  }

  async list(
    storeId: number,
    filters: OrderFilters = {},
    cursor: OrderCursor | null = null,
  ): Promise<Page<Order, OrderCursor>> {
    const rows = await this.database
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.storeId, storeId),
          createFilterCondition(filters),
          createCursorCondition(cursor),
        ),
      )
      .orderBy(desc(orders.placedAt), desc(orders.id))
      .limit(PAGE_QUERY_LIMIT);
    return createPage(rows, ({ placedAt, id }) => ({ placedAt, id }));
  }

  async update(
    storeId: number,
    orderId: number,
    changes: OrderChanges,
  ): Promise<void> {
    const result = await this.database
      .update(orders)
      .set({ ...changes, storeId })
      .where(createOrderCondition(storeId, orderId));
    requireRowFound(result);
  }
}

function createItemRow(
  item: NewOrderItem,
  storeId: number,
  orderId: number,
): typeof orderItems.$inferInsert {
  // Empty until the task that fills them checks they belong to this store.
  return { ...item, productId: null, variantId: null, storeId, orderId };
}

function createOrderCondition(
  storeId: number,
  orderId: number,
): SQL | undefined {
  return and(eq(orders.storeId, storeId), eq(orders.id, orderId));
}

function createFilterCondition({
  placedFrom,
  placedBefore,
  financialStatus,
}: OrderFilters): SQL | undefined {
  return and(
    placedFrom === undefined ? undefined : gte(orders.placedAt, placedFrom),
    placedBefore === undefined ? undefined : lt(orders.placedAt, placedBefore),
    financialStatus === undefined
      ? undefined
      : eq(orders.financialStatus, financialStatus),
  );
}

function createCursorCondition(cursor: OrderCursor | null): SQL | undefined {
  if (cursor === null) {
    return undefined;
  }
  return or(
    lt(orders.placedAt, cursor.placedAt),
    and(eq(orders.placedAt, cursor.placedAt), lt(orders.id, cursor.id)),
  );
}
