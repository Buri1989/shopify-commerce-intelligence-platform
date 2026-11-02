import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lt, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.tokens.js';
import type { GeneratedColumns } from '../database/generated-columns.js';
import { createPage, PAGE_QUERY_LIMIT, type Page } from '../database/page.js';
import { refuseDuplicateRow } from '../database/refuse-duplicate-row.js';
import { requireRowFound } from '../database/require-row-found.js';
import { products } from '../database/schema/index.js';

export type Product = typeof products.$inferSelect;
export type NewProduct = Omit<
  typeof products.$inferInsert,
  GeneratedColumns | 'storeId' | 'deletedAt'
>;
export type ProductChanges = Partial<Omit<NewProduct, 'shopifyId'>>;
export type ProductFilters = { readonly status?: string };
export type ProductCursor = Pick<Product, 'id'>;

@Injectable()
export class ProductsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(storeId: number, product: NewProduct): Promise<number> {
    const [{ id }] = await refuseDuplicateRow(() =>
      this.database
        .insert(products)
        .values({ ...product, storeId })
        .$returningId(),
    );
    return id;
  }

  async findById(
    storeId: number,
    productId: number,
  ): Promise<Product | undefined> {
    const [product] = await this.database
      .select()
      .from(products)
      .where(createProductCondition(storeId, productId));
    return product;
  }

  async list(
    storeId: number,
    filters: ProductFilters = {},
    cursor: ProductCursor | null = null,
  ): Promise<Page<Product, ProductCursor>> {
    const rows = await this.database
      .select()
      .from(products)
      .where(
        and(
          eq(products.storeId, storeId),
          isNull(products.deletedAt),
          filters.status === undefined
            ? undefined
            : eq(products.status, filters.status),
          cursor === null ? undefined : lt(products.id, cursor.id),
        ),
      )
      .orderBy(desc(products.id))
      .limit(PAGE_QUERY_LIMIT);
    return createPage(rows, ({ id }) => ({ id }));
  }

  async update(
    storeId: number,
    productId: number,
    changes: ProductChanges,
  ): Promise<void> {
    const result = await this.database
      .update(products)
      .set({ ...changes, storeId })
      .where(createProductCondition(storeId, productId));
    requireRowFound(result);
  }

  async markDeleted(storeId: number, productId: number): Promise<void> {
    const result = await this.database
      .update(products)
      .set({ deletedAt: new Date() })
      .where(createProductCondition(storeId, productId));
    requireRowFound(result);
  }
}

function createProductCondition(
  storeId: number,
  productId: number,
): SQL | undefined {
  return and(eq(products.storeId, storeId), eq(products.id, productId));
}
