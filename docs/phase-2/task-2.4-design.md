# Task 2.4 — Database operations: Design

**Date:** 2026-11-02
**Branch:** `feat/task-2.4-database-operations`
**Status:** design agreed in chat on 2026-11-02; built on 2026-11-02, not yet merged.
**Spec:** `docs/Boris-ing.md`, section 4, Task 2.4 (lines 378–404); phase deliverables and
acceptance criteria at lines 406–421; the seven general questions at lines 71–77.

This document records what was decided for Task 2.4 and why. A builder should be able to implement
from it without going back to the author. Every decision in it was taken by Boris in chat and is
marked **(Boris, decision N)**; the alternatives he rejected are given with each. The mechanics
that follow are written in §5. The details left to the builder are listed in §8, and every file is
shown in chat before it is written.

---

## 1. Intent

The ten tables exist and are deployed, but no code reads or writes them. This task adds the code
that does: repositories for stores, products, and orders with their items, with transactions,
paging, filtering, two new indexes and proof that one store can never reach another's rows. It adds
no endpoints. The first callers come in later tasks.

## 2. Goals, non-goals, anti-goals

**Goals**

- Every item of spec lines 380–388 traced to a decision (§4.1).
- Three repositories in three feature folders, every method taking the store id (§4.2, §4.3).
- A clear error for a duplicate row and for a missing row (§4.5).
- An order and its items saved together or not at all (§4.6).
- Lists paged with bookmarks, 50 rows a page, filtered and newest first (§4.9, §4.10).
- Two indexes, each in its own migration file, with their worth measured (§4.11, §4.16).
- Tests on real MySQL (§4.15).
- Phase questions 5, 6, 7, 8 and 10 answered, tied to this code (§4.17).

**Non-goals**

- Endpoints, services or controllers. No spec line of this task asks for them.
- Repositories for the other six tables (§4.2).
- Lookups by Shopify id or shop domain, which wait for the tasks that use them.
- Linking order items to products (§4.3).
- Retries (§4.8) and the order in which Shopify events arrive (§4.7).

**Anti-goals**

- A store id taken from anywhere but a required argument.
- A way to write a row that points into another store.
- A lock or a retry protecting against a case this code does not have.

## 3. Constraints

- All data access goes through Drizzle, and only repositories use it (`CLAUDE.md`, Task 2.1).
- A table change starts in `src/database/schema/`, gets its file from
  `npm run migrate:generate -- --name <what_changed>`, one change per file, forward only, and keeps
  the previous image working (Task 2.3).
- Every query says `store_id = ?` directly (Task 2.2, §4.4).
- Money is a string, times are UTC with milliseconds (Task 2.2).
- A new error source gets a mapper in `src/common/errors/` and one line in the resolver's list.
- TDD, and every file shown in chat first.

## 4. Decisions

### 4.1 The spec traced

| Spec | Item | Where |
| --- | --- | --- |
| 382 | CRUD operations | §4.2, §4.4, §4.12 |
| 383 | Transactions | §4.6, §4.7, §4.8 |
| 384 | Unique constraints | §4.4, §4.5 (the rules exist since Task 2.2) |
| 385 | Pagination | §4.9 |
| 386 | Efficient filtering | §4.10 |
| 387 | Indexes for common queries | §4.11 |
| 388 | Tenant isolation | §4.3 |
| 396–399, 401 | Questions 5, 6, 7, 8, 10 | §4.17 |
| 412 | Database entities and repositories | §4.2, §4.14 |
| 413 | Database tests | §4.15 |
| 414 | Query optimization analysis | §4.16 |

Questions 1–4, 9 and 11–13 were answered in Tasks 2.2 and 2.3.

### 4.2 What gets a repository: three groups now

**(Boris, decision 1)** Repositories for stores, products, and orders with their items: four of
the ten tables, three classes in three files. The other six wait for the task that first needs
them: credentials 3.3, webhook records Phase 4, variants, collections and the collection link 5.1,
analytics 5.2. Until then nothing could call them, and their right shape is not known.

The risk: a strict reader of line 412 could expect all ten. The questions doc says why not.

Rejected: **all ten now**: code with no caller, written before the task that shows what it needs.

### 4.3 Tenant isolation: a required argument, and no pointer to set

**(Boris, decision 2)** Every method takes the store id as a required argument:
`findById(storeId, orderId)`. A test per method proves no other store's rows come back.

Rejected: **a `forStore(storeId)` object**: an extra layer for the same result. **The store from
the web request**: there are no requests here, and the repository would depend on the web layer.

**(Boris, decision 21)** Task 2.2 §4.4 left the store match on `order_items.product_id` and
`variant_id` to the app, because MySQL cannot check it there. `orders.create` does not accept those
two columns, so they stay empty and cannot point into another store. Nothing can fill them yet:
Shopify sends its own ids, and turning those into ours needs lookups that wait for later tasks.

**Promise to a later task:** the task that fills these columns, most likely Task 5.1 (line 734),
adds the check that the product and variant belong to the order's store.

Rejected: **check in `create` now**: an extra query per order and code reading the variants table,
to protect a value nothing can supply. **Trust the caller**: the gap line 388 says to close.

### 4.4 Create and update are separate

**(Boris, decision 3)** Separate `create` and `update`. A create on an existing row is refused by
the unique rule. The same Shopify id twice in one store is refused; in two stores it is accepted.

Rejected: **one `save`**: it quietly overwrites, and Task 5.3 owns that question. **All three.**

**(Boris, decision 17)** `create` returns the new id, through Drizzle's `$returningId()`, because
MySQL cannot hand back a saved row. `update`, `delete` and `markDeleted` return nothing.

Rejected: **read the whole row back**: an extra read on every write, once per order during Task
5.1's import (line 734), for results nothing uses.

### 4.5 Refused writes: two errors of our own

**(Boris, decision 4)** Our own `DuplicateRowError`. The repository catches the database's refusal
(Drizzle's `DrizzleQueryError` with `ER_DUP_ENTRY` in its cause) and throws it. A mapper makes it a
409.

Rejected: **Nest's `ConflictException`**: a repository should not know about HTTP. **The raw
error**: every caller would have to read Drizzle's error, and its message holds the query.

**(Boris, decision 11)** `findById` returns nothing when the row is missing or belongs to another
store; the two cases look identical. `update`, `delete` and `markDeleted` throw our own
`RowNotFoundError`, and a mapper makes it a 404.

Rejected: **`findById` throws too**: "not there" is a normal answer to a read. **True or false from
the writes**: every caller must remember to check.

### 4.6 Transactions: inside the method

**(Boris, decision 5)** The transaction lives in `ordersRepository.create(storeId, order, items)`.
If one item fails, no order stays.

Known limit: a transaction across two repositories (uninstall: store and credentials) is a later
task's need.

Rejected: **the caller opens it and passes it in**: every caller repeats the work, with no caller
that needs it today.

### 4.7 Locks and isolation levels: none needed yet

**(Boris, decision 12)** No lock. The last update wins, and MySQL's default isolation level,
REPEATABLE READ, stays. A lock protects a read followed by a write, and no method does that: each
update is one statement. The order-with-items read does two reads, but items do not change after
create (§4.12).

The risk: an older update arriving last overwrites a newer one. Task 5.3 (line 765) owns that.

Rejected: **a `version` column**: a schema change that every caller must handle, and Shopify's own
timing may be the right check. **`SELECT ... FOR UPDATE`**: waiting and more deadlock risk with
nothing to protect.

### 4.8 Deadlocks: let it fail

**(Boris, decision 13)** MySQL cancels one transaction and undoes all of it, so nothing is left
half-written. The error goes up as a normal 500 and is logged. Retrying belongs to the code that
delivers the work: Task 4.3 (line 633) and Phase 4's acceptance (line 714).

The cost: until Phase 4 nothing retries. Nothing calls these methods yet.

Rejected: **retry inside `orders.create`**: it stacks on the queue's retries and needs a forced
deadlock to test. **A `DeadlockError` as a 503**: the queue retries any failure, so it changes
nothing.

### 4.9 Pagination: bookmarks, 50 rows, a plain object

**(Boris, decision 6)** Bookmark (cursor) pagination: the next rows after this row. There is no jump
to a page number and no total count.

Rejected: **page numbers with `OFFSET`**: slow deep in a list, and rows shift between pages.

**(Boris, decision 7)** A page is always 50 rows, one named constant. Two repositories need it, so
it lives in `src/database/page.ts`.

Rejected: **the caller chooses**: a choice no caller needs yet.

**(Boris, decision 18)** `list` returns `{ rows, nextCursor }`. The bookmark is a plain object:
orders `{ placedAt, id }`, because two orders can share a time and the id settles it; products
`{ id }`; `null` on the last page. An endpoint later turns it into text.

Rejected: **a coded string**: for outside callers, and we have none. **The id alone for orders**:
one extra query per page.

### 4.10 Filtering

**(Boris, decision 8)** Orders filter by date range and `financial_status`, in any combination.
Products filter by `status`. Both lists are newest first. Deleted products are hidden from lists
(Task 2.2, §4.6) and still reached by `findById`, because order history needs them.

Rejected: **date only**, **most columns**: the second means an index for every combination.

### 4.11 Indexes: two new ones

**(Boris, decision 9)** Two indexes, each its own migration file: orders
`(store_id, financial_status, placed_at)`, products `(store_id, status)`. Their worth is measured
in §4.16, not assumed.

Rejected: **orders only**. **Widening `(store_id, placed_at)` with status**: a status in the middle
of that index would slow date-only lists.

### 4.12 The method list

**(Boris, decision 10)**

```ts
StoresRepository:
  create(store), findById(storeId), update(storeId, changes), delete(storeId)
ProductsRepository:
  create(storeId, product), findById(storeId, productId), list(storeId, filters, cursor),
  update(storeId, productId, changes), markDeleted(storeId, productId)
OrdersRepository:
  create(storeId, order, items), findById(storeId, orderId), list(storeId, filters, cursor),
  update(storeId, orderId, changes)
```

An order's `update` touches its own columns only. Items stay as created until Phase 4 and Task 5.3
show what should happen. Orders have no delete (Task 2.2, §4.6).

Rejected: **`update` replaces the items**: a guess at behaviour those tasks define.

**(Boris, decision 16)** An order's `findById` brings its items in an `items` array, through two
small queries, both with the store id. `list` returns orders only.

Rejected: **a separate `findItems`**: a method outside decision 10, and two calls to see one order.
**`list` brings items too**: a page of 50 orders would load rows the page does not show.

### 4.13 Layout: one folder per feature

**(Boris, decision 14)** `src/stores/`, `src/products/`, `src/orders/`, each with its own module
and repository file, the shape of `src/health/`.

Rejected: **one `src/database/repositories/` folder**: any feature needing one repository would get
all three, and feature code would sit with the connection and migrations.

### 4.14 Entities: Drizzle's row types

**(Boris, decision 15)** Repositories hand back the type Drizzle works out from the table:
`export type Order = typeof orders.$inferSelect`. With Drizzle, the table file plus this type is
the entity of line 412. A strict reader could expect classes; the questions doc explains this.

The cost: callers see the database's shape, so renaming a column changes them.

Rejected: **own entity classes with `mapOrderRow`**: every column written twice more, to separate
two shapes that are the same today.

### 4.15 Tests: real MySQL, one database per spec file

**(Boris, decision 19)** Each repository spec creates its own database on the suite's MySQL, such
as `orders_repository_e2e`, and runs the real migration files once. It builds the repository
directly, with no Nest app. Each test creates its own store, so tests do not see each other's rows.
The module wiring is proven separately (§5.8).

Rejected: **one shared database**: files running together share rows, which makes flaky tests.
**A fake Drizzle**: it cannot refuse a duplicate or undo a transaction.

### 4.16 The query analysis: a script and a doc

**(Boris, decision 20)** `npm run analyze:queries` runs by hand. It adds about 100,000 made-up
orders and 20,000 products across 10 stores, then runs `EXPLAIN ANALYZE` on each list query with the
new index and without it. Results go in `docs/phase-2/task-2.4-query-analysis.md`. It runs in its
own throwaway MySQL 8.4 container, because the compose database's root password is random and our
dev rows stay out of it.

An index that does not help is shown to Boris and removed before the merge.

The costs: the times come from a laptop, and nothing stops a later change from losing an index.

Rejected: **a gate test on index use**: slow, and MySQL's choice of index can shift with nothing
wrong. **The script on the AWS dev database**: no way in for a person, and made-up rows there.

### 4.17 Phase questions and documentation

Questions 5, 6, 7, 8 and 10 are answered in `docs/phase-2/task-2.4-questions.md`, tied to this
code, with the seven general questions and "Why we picked what we picked", including the reason for
§4.2. The README gains the new command and layout. `docs/architecture.md` gains the two indexes and
its "Last updated" line. `CLAUDE.md` gains "Conventions from Task 2.4".

### 4.18 What later tasks inherit

- The check on an order item's product and variant (§4.3).
- A transaction across two repositories, for uninstall (§4.6).
- Older updates arriving last, Task 5.3 (§4.7).
- Retries, Phase 4 (§4.8).
- Order items after an order changes, Phase 4 and Task 5.3 (§4.12).
- Turning the bookmark into text, the task that adds an endpoint (§4.9).
- Repositories for the other six tables (§4.2).

## 5. The design

### 5.1 The files

```text
src/common/errors/   duplicate-row.error.ts   duplicate-row.mapper.ts
                     row-not-found.error.ts   row-not-found.mapper.ts
src/database/        refuse-duplicate-row.ts  require-row-found.ts  page.ts
                     generated-columns.ts
src/stores/          stores.module.ts         stores.repository.ts
src/products/        products.module.ts       products.repository.ts
src/orders/          orders.module.ts         orders.repository.ts
test/                repository-database.ts   analyze-queries.ts
                     new-rows.ts              read-all-pages.ts
                     fill-analysis-rows.ts    mysql-image.ts
                     stores.repository.e2e-spec.ts
                     products.repository.e2e-spec.ts
                     orders.repository.e2e-spec.ts
                     repository-modules.e2e-spec.ts
```

The error classes sit in `common` so that `src/database/` depends on them, not the reverse.

### 5.2 The types

The input types leave out what a caller must not set. `storeId` is not in them, and the repository
writes it last, on create and on update, because types do not exist at run time and a stray value
must not win. `shopifyId` is not in `changes`, because it is what the row is. `deletedAt` is not in
a product's input types, because `markDeleted` is the way to set it. No update can move a row to
another store. `productId` and `variantId` are not in `NewOrderItem`, and `create` writes them
empty, so a stray id cannot point an item at another store's product.

```ts
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
```

Stores and products follow the same shape. `ProductFilters` is `{ status?: string }` and
`ProductCursor` is `Pick<Product, 'id'>`.

### 5.3 Saving an order

```ts
create(storeId: number, order: NewOrder, items: NewOrderItem[]): Promise<number> {
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
```

A duplicate order or item rolls the whole thing back and becomes `DuplicateRowError`. An order with
no items is allowed. A store that does not exist is refused by MySQL's pointer and goes up as a
plain 500, because a caller holds a store id it already found.

### 5.4 The two helpers

`refuseDuplicateRow(write)` runs the write and turns `ER_DUP_ENTRY` into `DuplicateRowError`;
anything else passes through unchanged. It wraps every `create`, and `stores.update`, the one update
that can hit a unique rule (`shop_domain`).

`requireRowFound(result)` throws `RowNotFoundError` when `affectedRows` is 0. mysql2 sets
`FOUND_ROWS` by default, so `affectedRows` counts rows matched, not rows changed: an update with
the same values does not count as missing. `updated_at` changes on every update, so a test cannot
tell the two apart; the fact comes from mysql2's source. A second `markDeleted` matches the row and
moves its time; repeated events are Task 5.3's.

Neither error's message carries the query or its values.

### 5.5 A page

`list` asks for `PAGE_SIZE + 1` rows. A 51st row means there is another page; it is dropped, and the
bookmark comes from the 50th. `page.ts` holds `PAGE_SIZE`, `PAGE_QUERY_LIMIT`, the
`Page<Row, Cursor>` type and the one function that does this.

Orders sort by `placed_at` then `id`, both newest first. The bookmark's condition:

```sql
WHERE store_id = ?
  AND (placed_at < ? OR (placed_at = ? AND id < ?))
ORDER BY placed_at DESC, id DESC
LIMIT 51
```

Products sort by `id` newest first, with `id < ?` and `deleted_at IS NULL`.

### 5.6 The two migration files

```text
0005_index_orders_by_store_status_and_time.sql
    orders_store_id_financial_status_placed_at_idx
0006_index_products_by_store_and_status.sql
    products_store_id_status_idx
```

Both add an index, so the previous image keeps working. No column changes, so the ERD stays as it
is. `CHAIN_LENGTH` in `migrations.e2e-spec.ts` becomes 7. The deploy runs them through the existing
step.

### 5.7 What the repository specs prove

- Every method: another store's id returns nothing or throws `RowNotFoundError`, and the row stays
  as it was.
- Stores: a duplicate Shopify id or domain is refused, on create and on update of the domain;
  delete removes the store's orders and products.
- Products: the same Shopify id twice in one store is refused, and in two stores accepted; a
  deleted product leaves `list` and stays reachable by `findById`.
- Orders: create saves the order and its items; a duplicate item leaves no order behind;
  `findById` brings items and `list` does not; `update` leaves the items alone.
- Lists: 50 rows, then the next 50 with no row skipped or repeated, including orders with the exact
  same time; `null` on the last page; each filter alone and together.
- `update` with the same values does not throw.

`test/repository-database.ts` creates the database, runs the migration files and hands back a
Drizzle connection and a way to close it, using the existing `createFreshDatabase` and
`runMigrations`.

### 5.8 The module wiring

The three modules are imported in `AppModule`. `repository-modules.e2e-spec.ts` boots
`createTestApp()` and gets each repository from the app, which proves `DATABASE` reaches all three.

### 5.9 The analysis script

`test/analyze-queries.ts` is outside `src/`, so it never reaches the image, and it is covered by
lint, format and typecheck. It starts `mysql:8.4` with Testcontainers, runs the migration files,
fills the rows, runs `EXPLAIN ANALYZE` on each list query, first page and deep page, with the index
and with `IGNORE INDEX`, prints the results and stops the container.

The query comes from the repository itself, through Drizzle's logger, so the plan can never measure
a copy that has drifted. `paid` is 70% of the orders and `voided` 2%, because an index on status has
the most to do when the status is rare.

## 6. Build order

One piece at a time. Each piece: show the failing spec in chat → approval → write it → run it red →
show the implementation in chat → approval → write it → run it green → run the whole gate.

1. Branch `feat/task-2.4-database-operations`; this document.
2. The two errors and their mappers, specs first; one line each in the resolver's list.
3. `refuse-duplicate-row.ts`, `require-row-found.ts`, `page.ts`, specs first.
4. `test/repository-database.ts`; stores: spec red, repository, module, green.
5. Products: spec red, repository, module, green.
6. Orders: spec red, repository, module, green.
7. The modules in `AppModule`; `repository-modules.e2e-spec.ts`.
8. The orders index: `orders.spec.ts` red, `orders.ts`, the drift spec red, generate, green. The
   same for products. `CHAIN_LENGTH` to 7, and an e2e check for each index.
9. `analyze-queries.ts` and the npm script; run it; show Boris the results;
   `task-2.4-query-analysis.md`.
10. Docs: the questions doc; the README; `docs/architecture.md`; `CLAUDE.md`.
11. Gate; push; the pull request; the checks green; merge. The deploy run: `applied: 2`, the service
    on the new image, `/ready` 200; `cdk diff` clean.

Commits happen when Boris says so.

## 7. Done when

- `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run format:check` and
  `npm run infra:check` pass.
- Every §5.7 proof is a passing test.
- The query analysis shows what each new index does, and any index that did not help is gone.
- The deploy run on the merge shows `applied: 2`, `/health` and `/ready` 200.
- The questions doc, the analysis doc, the README, `docs/architecture.md` and `CLAUDE.md` are
  updated.
- `cdk diff` is clean after the deploy.

## 8. Left to the builder

- The wording of the two errors' messages.
- The made-up rows' exact mix of statuses, dates and stores in the analysis.
- The names of each spec's own database.
- How a test builds its rows, in `test/`, once a second spec needs the same helper.
