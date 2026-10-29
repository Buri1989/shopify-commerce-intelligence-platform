# Task 2.2 — Questions to investigate

Short answers. Task 2.2 asks for two explanations, the one-to-one and the one-to-many, and builds
the material of six of the phase's thirteen questions; the other seven wait for 2.3 and 2.4. The
seven general questions for Drizzle are answered in Task 2.3, where it first runs against the
database. Built 2026-10-29; nothing of it reaches the database until Task 2.3 applies the schema.
Alternatives and trade-offs are in `task-2.2-design.md`.

## 1. One-to-one: when to split an entity into two tables

Built: `stores` and `store_credentials`, one row each, `store_credentials.store_id` both the
primary key and the pointer to `stores.id`.

Split when:

- The halves are read by different code at different rates. The stores row is read by listings
  and analytics all day; the token only by the code that calls Shopify.
- One half needs its own protection. Task 3.3 encrypts the token; one small table changes, not
  the one every query touches.
- One half has its own lifetime. A store that uninstalled has no credentials row; the stores row
  stays with `uninstalled_at` set, and no column holds a dead token.

Keep together when every read needs both halves and the columns share one lifetime; a split is
then a join on every read for nothing.

## 2. One-to-many: foreign keys, integrity, cascades, indexes

Built: Store → Orders, Order → Order Items, Product → Variants.

- **Foreign key**: a column, or a pair, that must match a key of the parent table.
  `orders.store_id` → `stores.id`; `order_items (store_id, order_id)` → `orders (store_id, id)`.
- **Referential integrity**: MySQL refuses a child whose parent row does not exist and decides
  what happens to children when the parent goes. An item for an order that never existed cannot
  be written, whatever the code does.
- **Cascading**: the delete rule on the pointer. `CASCADE` takes the children with the parent:
  a store and everything of it, an order and its items, a product and its variants. `SET NULL`
  keeps the child and empties the pointer: an order item and its product or variant. The rule
  is chosen per pointer: a row that cannot exist without its parent cascades; a fact of history
  keeps its row.
- **Indexing**: MySQL requires an index whose leading columns are the pointing columns, and a
  pair pointer requires a unique index on the target pair. Every pointer here carries its
  index, which is also the lookup "children of this parent": `(store_id, order_id)` on items,
  `(store_id, product_id)` on variants.

## 3. What are primary and foreign keys?

- **Primary key**: the column or columns that identify a row; unique, never null, one per table.
  InnoDB stores the rows in its order, so a growing number appends. Here: `id BIGINT UNSIGNED
  AUTO_INCREMENT` on seven tables; the pair `(collection_id, product_id)` on
  `collection_products`; `(store_id, day)` on `store_analytics`; `store_id` on
  `store_credentials`.
- **Foreign key**: a column or columns that must match the primary key or a unique key of another
  table, checked by the database on every write and delete. Twelve pointers here, each named
  `<table>_<columns>_fk`, each with a delete rule and an index.

## 4. What are composite indexes?

An index on more than one column, sorted by the first column, then the second within it. It
serves a query that filters on the leading columns: `(store_id, shopify_id)` serves `store_id = ?`
and `store_id = ? AND shopify_id = ?`, not `shopify_id = ?` alone. So the column every query
filters on goes first. Every unique rule and pointer index here starts with `store_id`, and one
index serves both the tenant filter and the lookup: `products (store_id, shopify_id)` finds the
product a webhook names; `order_items (store_id, order_id)` lists an order's items.

## 5. What is database normalization?

Each fact stored once, in the table it belongs to, reached by key. The forms, as they appear here:

- No lists in a column: a product's collections are rows of `collection_products`, not a column
  of ids on the product, so the database can check them and index them.
- Every column depends on the whole key: on `collection_products`, `position` is a fact of the
  pair, not of the product alone.
- No column depends on another non-key column: a variant's product is `product_id`, and the
  product's title lives on `products` only.

## 6. When should denormalization be used?

When a read would walk many rows on every request, or when a fact must freeze. Two cases built,
each with its source of truth kept:

- `store_analytics`: one row per store per day with that day's order count and revenue, filled
  as orders arrive. "Revenue over time" is a range of rows; without it every request sums every
  order the store ever had. The orders are the source; the rows can be rebuilt from them.
- `order_items.title`, `variant_title`, `sku`, `price`: as sold. Prices change and products get
  renamed; the order must not. The product row is still reached by `product_id` for counting.

Not done: copying `stores.currency` onto every analytics row, since it is one join away and
rarely read.

## 7. How should external Shopify IDs be represented?

As a number, `BIGINT UNSIGNED`, in its own column `shopify_id`, unique together with `store_id`;
never as our primary key, never as the `gid://shopify/Product/123` text. Shopify's ids are
64-bit; eight bytes compare and index fast, and the GraphQL form is rebuilt in one line when the
API needs it. In TypeScript the column is a `number` (Drizzle `mode: 'number'`), exact to 2^53
while Shopify's ids are around 10^13; the switch to `bigint` is one line in
`shared-columns.ts` if they ever pass that.

## 8. How can tenant isolation be enforced?

Three layers in the schema:

- `store_id` on every table, grandchildren included, so every query says `store_id = ?` with no
  detour through the parent that a query could forget.
- Every unique rule and pointer index starts with `store_id`, so that filter is always indexed.
- The database checks the store match: a grandchild's pointer is the pair `(store_id, parent_id)`
  referencing the parent's `(store_id, id)`, so an item of one store pointing at an order of
  another is refused on write.

The one gap is deliberate: an order item's pointers to its product and variant are single-column
with `SET NULL`, because `SET NULL` on a pair would empty `store_id` too. The item's store is
still fixed by its pair pointer to the order; the product match there is the app's to keep. The
app layer that passes the store on every query comes with the first endpoints.

## Why we picked what we picked

- **The ERD in Mermaid inside the design doc, held to the code by a spec**: reviewed line by line
  next to its reasons; a column added without updating the drawing fails the gate.
- **Our own number as the key, Shopify's id beside it**: no outside system owns our identity,
  half the tables have no Shopify id, eight bytes sit in every index, and a UUID would scatter
  inserts.
- **`store_id` everywhere, pair pointers for grandchildren**: no query can leak another store by
  forgetting a detour, and the database refuses a wrong store on write.
- **A shared key for credentials**: one row per store comes from the key itself; the token lives
  apart from the row everything reads; Task 3.3 encrypts one table.
- **Store delete cascades, product soft-deletes, item pointers empty**: the erase is one
  statement; sold history survives a product delete; nothing on the erase path refuses.
- **The junction keyed by the pair**: a duplicate listing is impossible by construction; the
  reverse index serves "collections of this product".
- **One webhook row per delivery, unique on store and delivery id**: "already handled" is a key
  lookup; a redelivery and a new event are told apart.
- **One analytics row per store per day**: totals and over-time come from the same rows; no
  request walks every order.
- **`DECIMAL(19,4)`, `DATETIME(3)` in UTC, `updated_at` set by the app**: exact money; a time
  type with no zone and no 2038; Drizzle's `datetime` has no on-update rule, so the app stamps it.
- **Plural snake_case tables, camelCase properties**: `order` is a reserved word; a table is a
  set of rows.
- **Every pointer and index named by hand, `<table>_<columns>_<kind>`**: Drizzle's automatic
  pointer names carry the target table and pass 64 characters on `collection_products`.
- **One spec per table on the definition, plus the ERD spec, no database**: a wrong delete rule
  fails today in `npm test`; MySQL's acceptance of the definitions is proven by 2.3's first
  migration.
- **The drawing compared in order**: order is the first thing that drifts when a column is added.
