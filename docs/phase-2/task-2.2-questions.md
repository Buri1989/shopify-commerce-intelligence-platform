# Task 2.2 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Task 2.2 asks for
two explanations, the one-to-one and the one-to-many relationship, and builds the material of six
of the phase's thirteen questions; the other seven wait for Tasks 2.3 and 2.4. The seven general
questions for Drizzle are answered in Task 2.3, where it first runs against the database. Built
2026-10-29; nothing of it reaches the database until Task 2.3 applies the schema. Alternatives
and trade-offs are in `task-2.2-design.md`.

## 1. One-to-one: when to split an entity into two tables

One-to-one means a row in one table has at most one matching row in another table. Splitting an
entity into two tables this way is appropriate when:

- The two halves are read at very different rates. Frequent reads stay small and skip columns they
  do not use.
- One half needs its own protection, such as stricter access or encryption.
- One half has its own lifetime. It can be missing or removed while the other half stays.

Keep them together when every read needs both halves and the columns live and die together. A
split would then cost a join, two tables read as one, on every read, for nothing.

In this project `stores` and `store_credentials` are split. Only the code that calls Shopify reads
the access token, Task 3.3 encrypts it, and it goes when a store uninstalls while the store row
stays. `store_credentials.store_id` is both the table's primary key and the pointer to `stores.id`.

## 2. One-to-many: foreign keys, integrity, cascades, indexes

One-to-many means a row in a parent table has many matching rows in a child table, and each child
has one parent.

- **Foreign key**: a column, or a pair of columns, in the child table whose value must match a key
  of the parent table; we also call it a pointer.
- **Referential integrity**: the database keeps the pointers true. It refuses a child row whose
  parent does not exist, and it applies a rule when a parent is deleted. Whatever the code does, no
  child can point at nothing.
- **Cascading**: the rule for what happens to the children when the parent is deleted. `CASCADE`
  deletes them too. `SET NULL` keeps them and empties the pointer. `RESTRICT` refuses the delete
  while children exist. A row that cannot exist without its parent cascades; a fact of history keeps
  its row.
- **Indexing**: an index is a sorted copy of some columns that the database keeps next to the table,
  to find rows fast. A foreign key needs one, so the database can check the pointer and find a
  parent's children without reading the whole table.

In this project: Store → Orders, Order → Order Items, Product → Variants. Deleting a store, an order
or a product row deletes its children, and an order item keeps its row with the pointer emptied when
its product or variant goes.

## 3. What are primary and foreign keys?

- **Primary key**: the column or columns that identify a row. It is unique, never null, and a table
  has one. InnoDB, MySQL's storage engine, stores rows in primary key order, so a growing number
  appends at the end instead of inserting in the middle.
- **Foreign key**: a column or columns that must match the primary key or a unique key of another
  table. It links the two tables, and the database checks that link on every write and every delete.

In this project, seven tables use `id BIGINT UNSIGNED AUTO_INCREMENT`, the other three use a key that
suits them, and twelve foreign keys are named by hand.

## 4. What are composite indexes?

An index on more than one column, sorted by the first column, then by the second within it, like a
phone book sorted by last name and then by first name. It serves a query that filters on the leading
columns: `(a, b)` serves `a = ?` and `a = ? AND b = ?`, but not `b = ?` alone. So the columns a query
tests for equality go first, and a column it sorts by or searches as a range goes last. A good one
can also return rows already in order, so the database does not have to sort them.

In this project, every unique rule and pointer index starts with `store_id`, so one index serves both
the store filter and the lookup.

## 5. What is database normalization?

Normalization means storing each fact once, in the table it belongs to, and reaching it by key.
Copies cannot disagree, and changing a fact means changing one row. The cost is more joins on read.
The rules are called normal forms:

- **First normal form:** no lists inside a column. Repeated items become rows of their own table.
- **Second normal form:** every column depends on the whole key. In a table keyed by a pair, a fact
  about only one half moves to that half's table.
- **Third normal form:** no column depends on another column that is not the key. A customer's city
  does not sit on an order beside the customer's id.

In this project, a product's collections are rows of `collection_products`, not a list on the
product.

## 6. When should denormalization be used?

Denormalization is storing a fact a second time, on purpose, to make reads cheaper. Use it when:

- A read would have to join or add up many rows on every request, and a stored copy or total is much
  cheaper.
- A fact must freeze at a moment in time, such as the price on a past order.

Try an index or a better query first. The cost is extra work on every write and copies that can
disagree, so one place stays the source of truth and the copy can be rebuilt from it.

In this project, `store_analytics` keeps one total per store per day, rebuilt from the orders, and
`order_items` keeps the title, SKU and price as sold.

## 7. How should external Shopify IDs be represented?

As a number, `BIGINT UNSIGNED`, in its own column `shopify_id`, unique together with `store_id`.
Never as our primary key, and never as the text form `gid://shopify/Product/123`. Shopify's ids
are 64-bit numbers; eight bytes compare and index fast, and the GraphQL text form is rebuilt in
one line when the API needs it. In TypeScript the column is a `number` (Drizzle
`mode: 'number'`), exact up to 2^53, while Shopify's ids are around 10^13; the switch to `bigint`
is one line in `shared-columns.ts` if they ever pass that.

## 8. How can tenant isolation be enforced?

A tenant is one customer of a shared system; here, one store. Isolation means one tenant can never
see or touch another tenant's rows. There are three common ways to arrange the data:

- **A server per tenant:** the strongest split, and the most expensive to run.
- **A database per tenant on one server:** a strong split, but every migration runs once per tenant.
- **Shared tables with a tenant column:** the cheapest and simplest to run, but every query must
  filter, and one mistake leaks data.

With shared tables, several layers work together, so one mistake is not enough:

- A tenant column on every table, so every query can filter directly.
- Indexes that start with the tenant column, so that filter is always fast.
- Foreign keys that include the tenant column, so the database refuses a row that points across
  tenants.
- One layer of the app where the tenant is a required argument, with tests for every query.

In this project we use shared tables with `store_id`. One gap is deliberate: an order item's pointers
to its product and variant are single-column with `SET NULL`, because `SET NULL` on a pair would empty
`store_id` too. So the app keeps that match.

## Why we picked what we picked

- **The ERD in Mermaid inside the design doc, held to the code by a spec.** An ERD is the drawing
  of the tables and their pointers; Mermaid is text that GitHub renders as a drawing. It sits
  next to its reasons and is reviewed line by line; a column added without updating the drawing
  fails the gate.
- **Our own number as the key, Shopify's id beside it.** No outside system owns our identity;
  half the tables have no Shopify id anyway; eight bytes sit in every index; a UUID, a random
  16-byte id, would scatter inserts across the table.
- **`store_id` everywhere, pair pointers for grandchildren.** No query can leak another store's
  rows by forgetting a detour, and the database refuses a wrong store on write.
- **A shared key for credentials.** One row per store follows from the key itself; the token
  lives apart from the row everything reads; Task 3.3 encrypts one table.
- **Store delete cascades, product soft-deletes, item pointers empty.** Erasing a store is one
  statement; sold history survives a product delete, because a product row is only marked
  deleted, not removed; nothing on the erase path refuses.
- **The junction table keyed by the pair.** `collection_products`, the table that links products
  to collections, has the pair as its primary key, so a duplicate listing is impossible by
  construction; the reverse index serves "collections of this product".
- **One webhook row per delivery, unique on store and delivery id.** "Already handled" is a key
  lookup; a redelivery and a new event are told apart.
- **One analytics row per store per day.** Totals and over-time come from the same rows; no
  request walks every order.
- **`DECIMAL(19,4)`, `DATETIME(3)` in UTC, `updated_at` set by the app.** Exact money, not
  floating point; a time type with no zone and no year-2038 limit; Drizzle's `datetime` has no
  on-update rule, so the app stamps `updated_at`.
- **Plural snake_case tables, camelCase properties.** `order` is a reserved word in SQL; a table
  is a set of rows, so `orders`.
- **Every pointer and index named by hand, `<table>_<columns>_<kind>`.** Drizzle's automatic
  pointer names carry the target table and pass 64 characters, MySQL's limit, on
  `collection_products`.
- **One spec per table on the definition, plus the ERD spec, no database.** A wrong delete rule
  fails today in `npm test`; that MySQL accepts the definitions is proven by 2.3's first
  migration.
- **The drawing compared in order.** Column order is the first thing that drifts when a column
  is added.
