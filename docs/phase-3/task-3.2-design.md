# Task 3.2 — Shopify API integration: Design

**Date:** 2026-11-25
**Branch:** `feat/task-3.2-shopify-api-integration`
**Status:** design agreed in chat on 2026-11-23 to 2026-11-25; not yet built.
**Spec:** `docs/Boris-ing.md`, section 5, Task 3.2 (lines 458–480); phase deliverables and acceptance
criteria at lines 522–533; the seven general questions at lines 69–77.

This document records what was decided for Task 3.2 and why. Every decision was taken by Boris in
chat and is marked **(Boris, decision N)**, with the alternatives he rejected. The mechanics are in
§5. Every file is shown in chat before it is written.

---

## 1. Intent

Stores can install the app, and it holds a working key for each one, but it asks Shopify for nothing
beyond the shop's details at install. This task adds the retrievers: one piece of code per kind of
data (the store, products, variants, collections, orders) that asks Shopify's Admin GraphQL API for
one page for one store and returns it in our own shape. Every retriever handles Shopify's errors, its
throttling and a missing scope the same way. Nothing is saved; that is Task 5.1 (line 735).

## 2. Goals, non-goals

**Goals**

- Every item of spec lines 460–471 traced to a decision (§4.1).
- One retriever per kind of data, one page per call, in our own shape (§4.2, §4.5, §4.6).
- GraphQL errors, throttling and missing scopes handled once, for every retriever (§4.3).
- The retrievers shown working on both development stores, on the deployed app (§4.10).

**Non-goals**

- Saving retrieved rows, and importing a store's history: Task 5.1 (lines 734–735).
- Routes that return Shopify data, and tenant-level authorization: Task 3.3 (line 498).
- Encrypting the keys: Task 3.3 (line 492).
- Orders older than 60 days and `read_all_orders` (§4.7).
- Bulk operations: answered as question 5 only; the retrievers page (§4.2).

## 3. Constraints

- Every request to Shopify goes through `sendShopifyRequest`; the API version is a constant in the
  file that sends the query (Task 3.1).
- A store's address and key come only from `AccessTokensService` (Task 3.1, §4.14).
- `REQUESTED_SCOPES` stays `read_products`, `read_orders` (3.1 decision 16).
- A deliberate refusal is an `HttpException`; a new error source gets a mapper (Task 1.1).
- A new package only on Boris's decision of package, version and alternatives.
- TDD, every file shown in chat first.

## 4. Decisions

### 4.1 The spec traced

| Spec | Item | Where |
| --- | --- | --- |
| 460 | The Admin GraphQL API | §4.3, §5.2 |
| 464 | Store information | §4.4 |
| 465 | Products and variants | §4.5, §4.6 |
| 466 | Collections | §4.5 |
| 467 | Orders | §4.5, §4.6, §4.7 |
| 468 | GraphQL errors | §4.3 |
| 469 | Pagination | §4.2 |
| 470 | Rate limits | §4.3, §4.5 |
| 471 | Missing or insufficient scopes | §4.3, §4.7 |
| 475–480 | Questions 1–6 | §4.11 |
| 526 | Shopify API integration | §4.10 |
| 533 | Stores' data isolated | §4.10 |

### 4.2 What 3.2 builds: retrievers, our shape, one page per call

**(Boris, decision 1)** Retrievers only: one per kind of data, inside the app, saving nothing.
Nothing in the running app calls them yet.

Rejected: **retrievers plus routes** such as `GET /stores/:id/orders`: until Task 3.3 checks who is
asking, anyone who guesses a store id reads its orders. **Retrievers plus a script run by hand
locally**: the keys exist only in the AWS database, and no store installs locally.

**(Boris, decision 2)** A retriever returns the shape of our own table rows, as 3.1's shop query
does: `shopifyId` as a number, money as a decimal string, no `edges` layers.

Rejected: **Shopify's own shape**: every caller strips `gid://`, unwraps `edges` and converts money,
each in its own way, and changes with every API version. **A third shape of our own**: the table
types said twice, free to drift.

**(Boris, decision 4)** One page per call. A retriever takes a cursor and returns
`{ rows, nextCursor, requestedQueryCost }`; the caller repeats until `nextCursor` is `null`.

Rejected: **every page in one call**: everything in memory, and one failure at page 150 throws
away 149 pages. **A stream**: one page in memory, but the hidden cursor is lost with a failure, and
handing it out is this option with more code.

**(Boris, decision 13)** A retrieved row points to another row by that row's Shopify id, as a
number field named for it: `productShopifyId: 123`, `null` when Shopify's product is deleted.

Rejected: **Shopify's id string**: two forms of one id in one shape, and every caller strips the
prefix. **A small object** `product: { shopifyId }`: a layer with one field, and one more `null` to
check.

The cost: retrieved shapes differ from table rows where a row points by our id.

### 4.3 Talking to Shopify: errors, throttling, scopes

All of this lives once, in the query sender (§5.2).

**(Boris, decision 6)** GraphQL errors are sorted by what the caller must do:

| Answer | Becomes | The caller |
| --- | --- | --- |
| `INTERNAL_SERVER_ERROR`, `SHOP_INACTIVE` | `ShopifyUnavailableError` (503) | tries later, keeps its cursor |
| `MAX_COST_EXCEEDED`, an unknown field, any other code | `Error`, a logged 500 | nothing: our code is wrong |
| `data` with `errors` | handled as the error | gets no half page |

Rejected: **one error class carrying the codes**: every caller repeats the sorting, and one that
forgets a code mistakes "later" for "broken". **Keeping what came back**: an order missing its total
handed on as if it were whole.

The cost: a code Shopify adds later counts as "our code is wrong" until it joins the table; the log
line names it.

**(Boris, decision 5)** On `THROTTLED`, the sender waits
`(requestedQueryCost − currentlyAvailable) ÷ restoreRate` seconds and sends once more. A second
`THROTTLED` is `ShopifyUnavailableError`.

Rejected: **no wait**: a routine refusal turned into every caller's failure, with Shopify's wait
thrown away. **The caller pacing itself**: the points it reads are stale once a second caller uses
the bucket, so it still needs this handling.

**(Boris, decision 14)** The wait is at most 10 seconds: Shopify's largest single query, 1,000
points, over its slowest refill, 100 a second. A longer wait is `ShopifyUnavailableError` at once.

Rejected: **no limit**: one wrong `restoreRate` holds a call for minutes. **A shorter limit**:
routine waits on a Standard store refused.

The cost: one call can take about 30 seconds: a 10-second request, a 10-second wait and a 10-second
retry.

**(Boris, decision 7)** A missing scope is learned from Shopify's answer: `ACCESS_DENIED` becomes
`StoreMustAuthorizeError` (409). The store's keys are kept; they still work for what was granted.

Rejected: **checking the saved scopes first**: a second source of what a store granted, which still
needs this handling when it is wrong. **A new `StoreMissingScopeError`**: the same next step as
`StoreMustAuthorizeError`, so every caller catches both.

The cost: the error does not name the scope; the log line carries Shopify's message, which does.

**(Boris, decision 23)** The query sender knows no store ids: `ACCESS_DENIED` there is
`ShopifyAccessDeniedError`, carrying Shopify's message. `sendStoreQuery(storeId, query, variables)`,
which every store-id retriever calls, gets the store's access and turns that error into
`StoreMustAuthorizeError(storeId)`. The shop retriever has no store id, so at install the error
reaches the global filter as a logged 500: the shop query needs no scope, so a refusal means our
query is wrong.

Rejected: **an optional store id on the sender**: a retriever that forgets it turns a 409 into a 500
with no sign. **The install's 403**: the owner told to start again, for a fault in our query.

The cost: an owner who meets it sees a generic error page; the cause is in the log line.

**(Boris, decision 32)** `StoreMustAuthorizeError` takes an optional reason, and `sendStoreQuery`
passes Shopify's message: the 409's message, and so its log line, names the missing scope.

Rejected: **the sender writing its own log line**: a second job beside sending, and the scope kept
apart from the error. **The message as it was**: decision 7's log line would not name the scope.

### 4.4 The store information

**(Boris, decision 3)** 3.1's shop query becomes the shop retriever, under every rule of §4.3. The
install keeps calling it.

Rejected: **leaving it as it is**: line 468 true for four kinds of data and false for the fifth.
**A second shop query**: the same query written twice, the copy with no caller.

**(Boris, decision 8)** Every other retriever takes our store id, and gets a working key inside each
call. The shop retriever takes the address and key, because the install calls it before the store
row exists.

Rejected: **the caller passes address and key**: a caller that fetches the key once fails 60 minutes
into a long walk. **Both layers**: two pieces per kind of data, for one caller.

**(Boris, decision 9)** `getStoreAccessToken` becomes `getStoreAccess`, returning
`StoreAccess = { shopDomain, accessToken }` from the one read it already does.

Rejected: **reading the address separately**: two reads per page, which can disagree after an
uninstall. **A second method beside the first**: `getStoreAccessToken` left with no caller.

### 4.5 Products, variants, collections, orders

**(Boris, decision 10)** Products and variants are two lists: `products` without variants, and
`productVariants`, each variant carrying its product's Shopify id.

Rejected: **variants inside products**: pages of about 10 products, and a second cursor for any
product over 90 variants. **One variants call per product**: 1,000 calls for 1,000 products.

The cost: a product created between the two walks can show up as a variant with no product; the
caller decides what to do with it.

**(Boris, decision 11)** Collections are one list, then one walk per collection for its products in
the collection's own order, which gives `position`.

Rejected: **products inside collections**: small pages and a second cursor, as in decision 10.
**Each product's collections**: no order, so no `position`.

The cost: one walk per collection; a store with 500 collections makes 500 walks.

**(Boris, decision 24)** The collection-products cursor is `{ after, nextPosition }`: page 2 numbers
from 251, and a retry or a resume numbers right with nothing else to keep.

Rejected: **the caller passing the first position**: a second number kept beside the cursor, wrong
without any error when the two drift. **No position from the retriever**: a required column numbered
by every caller.

The cost: this retriever's cursor differs from the others', which are Shopify's string.

**(Boris, decision 38)** A collection Shopify no longer has, deleted between the collections list and
its products walk, returns an empty last page.

Rejected: **an error**: the walk stops at that collection on every try. **`null` instead of a
page**: a second "nothing", and every caller doing what the empty page does.

The cost: a wrong id from our own code also reads as an empty collection.

**(Boris, decision 12)** Order items arrive inside their orders, up to 15 per order. An order with
more gets one more call for the rest, 250 at a time. Shopify has no list of items across orders.

Rejected: **one items call per order**: 10,000 calls for 10,000 orders.

**(Boris, decision 15)** Page sizes: 250, Shopify's largest, for products, variants, collections and
a collection's products; 50 orders with up to 15 items each, about 800 points by estimate. A walk
costs the same points whatever the page size, so the largest page sends the fewest requests.

Rejected: **100, and 25 × 10**: the same points and waits, 2.5 times the requests. **50 × 5**: an
extra call for every order of 6 or more items.

The cost: the 800 is our multiplication; the first check run (§4.10) reports Shopify's own number.

### 4.6 Which field fills which column

Under decision 2, these follow without a choice: every `shopify_id` from `id`, the number after
`gid://shopify/…/`; products' `title`, `handle`, `status`; variants' `title`, `sku`, `price`,
`position`; collections' `title`, `handle`; orders' `name`, `fulfillment_status` from
`displayFulfillmentStatus`, `cancelled_at`; items' `title`, `variant_title`, `sku`, `quantity`.

**(Boris, decision 25)** `placed_at` is `processedAt`: when the customer bought, which for an
imported order is its real day.

Rejected: **`createdAt`**: an imported history lands on the store's move day as one false spike.

The cost: `processedAt` is only as right as whoever set it.

**(Boris, decision 26)** Money is the store's currency: `currency` from `currencyCode`, every amount
from `shopMoney`. Shopify converts at payment, so a store's orders sum without a rate.

Rejected: **the customer's currency**: every revenue figure needs a rate we would have to source,
after Shopify already applied one.

The cost: what the customer saw and paid is not kept.

**(Boris, decision 27)** `order_items.price` is `discountedUnitPriceAfterAllDiscountsSet`: what the
customer paid per unit, codes and order-level discounts included.

Rejected: **`originalUnitPriceSet`**: the list price, so a 50%-off code doubles an item's revenue.
**`discountedUnitPriceSet`**: line discounts in, codes out, so two equal payments show two prices.

The cost: an order-wide discount split across units can round by a cent, and the undiscounted price
is not kept.

**(Boris, decision 28)** A null `displayFinancialStatus` passes through:
`RetrievedOrder.financialStatus` is `string | null`. The column change belongs to the first code
that saves orders.

Rejected: **refusing the answer**: one order blocks the store's walk at that page on every try.
**Our own `UNKNOWN`**: a value Shopify never sent, among Shopify's states.

The cost: such an order cannot be saved into today's table until the column allows null.

**(Boris, decision 29)** `placed_on` is the store's own day: `placed_at` read in `shop {
ianaTimezone }`, asked in the same orders query, through Node's `Intl`. Daily counts (lines 750,
752) run midnight to midnight where the owner is.

Rejected: **the UTC day**: a New York store's evenings counted as the next day, fixed later only by
rewriting rows. **Leaving it to the saver**: the timezone looked up again by every saver.

The cost: a store that changes timezone keeps its older days in the old one, and `placed_on` no
longer equals `DATE(placed_at)`.

**(Boris, decision 30)** An empty `vendor` or `productType`, which Shopify sends as `""`, becomes
null, our one way to say "none".

Rejected: **keeping `""`**: two values meaning "none", and every query checking both.

### 4.7 What orders need

**(Boris, decision 16)** The orders retriever asks for all orders and takes what Shopify returns,
which under `read_orders` is the last 60 days.

Rejected: **filtering to 60 days ourselves**: Shopify's rule written twice, free to disagree at the
edge. **A warning from the saved scopes**: the same line for every store on every walk.

**(Boris, decision 17)** Orders are protected customer data. The Dev Dashboard declares Level 1
only, with the reason it is used: the orders query asks for no customer name, email, phone or
address. The README's Dev Dashboard table gains the row in this task's pull request.

Rejected: **Level 1 and 2**: customer fields nothing retrieves and nothing stores. **Declaring after
the first failure**: a known failure met on purpose, and the README out of step.

The cost: a Dashboard change by hand.

### 4.8 Code layout and names

**(Boris, decision 19)** One folder, `src/retrieval/`, for the query sender, every retriever and the
check command.

Rejected: **each retriever beside its repository**: a Shopify concern in five folders, and a
collections folder holding only a retriever. **One class with every query**: six reasons to change.

The cost: the install's shop query moves out of `src/installation/`.

**(Boris, decision 20)** `Shopify…Retriever` classes with `retrieve…` methods, `Retrieved…` shapes
and `sendShopifyAdminQuery`. `ShopifyShopClient.fetchShopDetails` becomes
`ShopifyShopRetriever.retrieveShop`.

Rejected: **3.1's `Client` and `fetch`**: not the spec's verb. **No `Shopify` prefix**:
`ProductsRetriever` beside `ProductsRepository` says nothing about where rows come from.

**(Boris, decision 22)** The renames reach the code, the specs and `AGENTS.md` lines 345, 361 and
368. The 3.1 design keeps 3.1's names as the record of 3.1; this section records the renames.

Rejected: **the 3.1 design too**: 3.1's tree would show a folder 3.1 never had. **The code only**:
`AGENTS.md` naming a method that no longer exists.

**(Boris, decision 33)** A Shopify id becomes a number in one place: `createShopifyIdSchema(type)`,
a zod schema that checks `gid://shopify/<type>/<digits>` and returns the number. Every retriever's
schema uses it, the shop retriever's too.

Rejected: **a plain function for the conversion only**: the pattern written in every retriever, and
the conversion trusting a check made in another place.

**(Boris, decision 34)** `RetrievedPage` has its own file, `retrieved-page.ts`, from the first
retriever: it is the shape every retriever returns.

Rejected: **inside the products retriever until a second one uses it**: a products file holding a
shape that is not about products, and changed again a step later to give it away.

**(Boris, decision 35)** `NewProductVariant` sits beside `NewProduct` in `products.repository.ts`,
built as 2.4 builds every `New…` type: variants belong to their products.

Rejected: **built in the retriever from the table**: Drizzle outside a repository, and the type
written again when variants are saved. **The fields written by hand**: decision 2's third shape.

**(Boris, decision 36)** A Shopify page is read in one place: `createShopifyPageSchema(nodeSchema)`
checks `nodes` and `pageInfo` and returns `{ nodes, nextCursor }`; another page without a cursor is
refused.

Rejected: **a shared page info schema and a next-cursor function**: the wrapper written in every
retriever, and the reading apart from the check.

**(Boris, decision 37)** `NewCollection` sits in `src/collections/collections.repository.ts`, the
file 5.1's collections repository fills, built as 2.4 builds every `New…` type.

Rejected: **beside `NewProductVariant` in the products repository**: collections are not part of
products. **Built in the retriever from the table**: Drizzle outside a repository. **The fields
written by hand**: decision 2's third shape.

The cost: until 5.1 the folder holds one type and no class.

**(Boris, decision 39)** The collection's id is written back into Shopify's form in the retriever,
`gid://shopify/Collection/<id>`; the second use, in the orders retriever, decides where it moves.

Rejected: **a shared function now**: one caller, and no more said than the template.
**Beside the id schema**: a schema file building strings, with one caller.

### 4.9 Tests

**(Boris, decision 21)** A unit spec per file, `fetch` replaced by `vi.stubGlobal`, fake timers for
the throttle wait, no app booted. Answer builders live in `test/shopify-answers.ts`. The install e2e
spec swaps in `ShopifyShopRetriever`; `repository-modules.e2e-spec.ts` builds `RetrievalModule` too.

Rejected: **an e2e spec per retriever with `fetch` stubbed**: against 3.1's rule that e2e replaces
our pieces, never Shopify's address, and proves again what the unit and access-token specs prove.
**Saved real answers**: none exist, and a store's orders would land in the repository.

The cost: the answers are written from Shopify's docs; a mismatch shows only in the check run.

### 4.10 The real stores

**(Boris, decision 18)** A check command in the image, `dist/retrieval/check-retrievers.js`, run as
a one-off ECS task once per store, on Boris's word. It walks every retriever for one store and logs
counts and costs, never store data. Run on both development stores, it shows the integration
working (line 526) and each store's walk returning that store's rows (line 533).

Rejected: **queries pasted into Shopify's GraphiQL app**: proves the query text only, with another
app's key. **Tests only**: the first real mismatch found in Task 5.1.

The cost: a file in the image that only this check runs, and a run by hand per store.

**(Boris, decision 31)** A query's cost travels with its answer: the sender returns
`{ data, requestedQueryCost }`, and every page carries `requestedQueryCost` beside `rows` and
`nextCursor`. The check keeps the highest per kind of data.

Rejected: **the sender logging each cost**: the number exists only at debug level, untyped, one line
per query. **No cost in the check**: decision 15's estimate never confirmed.

The cost: a page field that only the check reads today.

### 4.11 Phase questions and documentation

Questions 1–6 (lines 475–480) are answered in `docs/phase-3/task-3.2-questions.md` by Boris, one at a
time, with the seven general questions and "Why we picked what we picked". The README gains the
protected customer data row (§4.7). `AGENTS.md` lines 345, 361 and 368 gain the new names (§4.8).

## 5. The design

### 5.1 The files

```text
src/retrieval/       retrieval.module.ts
                     send-shopify-admin-query.ts
                     read-shopify-admin-answer.ts
                     wait-for-bucket-refill.ts
                     shopify-access-denied.error.ts
                     shopify-store-query-sender.ts
                     shopify-id-schema.ts   retrieved-page.ts
                     shopify-page-schema.ts
                     shopify-shop-retriever.ts            (moved from src/installation/shopify-shop-client.ts)
                     shopify-products-retriever.ts
                     shopify-product-variants-retriever.ts
                     shopify-collections-retriever.ts
                     shopify-orders-retriever.ts
                     check-retrievers.ts   walk-store-retrievers.ts
src/access-tokens/   access-tokens.service.ts (getStoreAccess, StoreAccess)
src/products/        products.repository.ts (NewProductVariant)
src/collections/     collections.repository.ts (NewCollection)
src/common/errors/   store-must-authorize.error.ts (an optional reason)
src/installation/    installation.service.ts   installation.module.ts (the shop retriever)
src/app.module.ts    RetrievalModule
test/                shopify-answers.ts
                     store-query-sender.ts
                     access-tokens.e2e-spec.ts   installation.e2e-spec.ts   new-rows.ts
                     repository-modules.e2e-spec.ts
```

Each source file has its unit spec beside it.

### 5.2 The query sender

`sendShopifyAdminQuery({ shopDomain, accessToken }, query, variables)`:

1. `POST https://{shopDomain}/admin/api/2026-10/graphql.json` through `sendShopifyRequest`, with
   `X-Shopify-Access-Token` and `{ query, variables }`, 10 seconds.
2. A non-2xx that `sendShopifyRequest` lets through → `Error`.
3. `errors` present: `THROTTLED` → wait as in §4.3, at most 10 seconds, once; `ACCESS_DENIED` →
   `ShopifyAccessDeniedError`; otherwise the table in §4.3. An answer with several errors is
   judged by its first.
4. Otherwise `{ data, requestedQueryCost }`: the answer's `data`, which the retriever checks with
   its own zod schema, and `extensions.cost.requestedQueryCost`.

Steps 1, 2 and the second send live in `send-shopify-admin-query.ts`; the wait of step 3 in
`wait-for-bucket-refill.ts`; the reading of steps 3 and 4 in `read-shopify-admin-answer.ts`.

`ShopifyStoreQuerySender.sendStoreQuery(storeId, query, variables)`: `getStoreAccess(storeId)`, then
`sendShopifyAdminQuery`; `ShopifyAccessDeniedError` becomes `StoreMustAuthorizeError(storeId)` with
Shopify's message as its reason.
Every retriever except the shop retriever sends through it.

### 5.3 The queries

| Retriever | Query |
| --- | --- |
| `retrieveShop(shopDomain, accessToken)` | `shop { id name currencyCode myshopifyDomain }` |
| `retrieveProducts(storeId, cursor)` | `products(first: 250, after:) { nodes { id title handle vendor productType status } }` |
| `retrieveProductVariants(storeId, cursor)` | `productVariants(first: 250, after:) { nodes { id title sku price position product { id } } }` |
| `retrieveCollections(storeId, cursor)` | `collections(first: 250, after:) { nodes { id title handle } }` |
| `retrieveCollectionProducts(storeId, collectionShopifyId, cursor)` | `collection(id:) { products(first: 250, after: cursor.after) { nodes { id } } }`; positions from `cursor.nextPosition` |
| `retrieveOrders(storeId, cursor)` | `orders(first: 50, after:) { nodes { id name currencyCode totalPriceSet { shopMoney { amount } } displayFinancialStatus displayFulfillmentStatus processedAt cancelledAt lineItems(first: 15) { nodes { id title variantTitle sku quantity discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } } product { id } variant { id } } } } } shop { ianaTimezone }` |
| `retrieveOrderItems(storeId, orderShopifyId, cursor)` | `order(id:) { lineItems(first: 250, after:) { … } }` |

Every list also asks for `pageInfo { hasNextPage endCursor }`.

### 5.4 The shapes

```ts
type RetrievedPage<Row, Cursor = string> = {
  rows: Row[];
  nextCursor: Cursor | null;
  requestedQueryCost: number;
};
type RetrievedShop = Pick<InstalledStore, 'shopifyId' | 'shopDomain' | 'name' | 'currency'>;
type RetrievedProduct = NewProduct;
type RetrievedProductVariant = Omit<NewProductVariant, 'productId'> & { productShopifyId: number };
type RetrievedCollection = NewCollection;
type RetrievedCollectionProduct = { productShopifyId: number; position: number };
type CollectionProductsCursor = { after: string; nextPosition: number };
type RetrievedOrder = Omit<NewOrder, 'financialStatus'> & {
  financialStatus: string | null;
  items: RetrievedOrderItem[];
  itemsNextCursor: string | null;
};
type RetrievedOrderItem = NewOrderItem & {
  productShopifyId: number | null;
  variantShopifyId: number | null;
};
```

`New…` is each table's insert type without generated columns, the store id and our-id pointers. The
fields that fill them: §4.6.

### 5.5 The errors

| Case | Error | Status |
| --- | --- | --- |
| no answer, 429, 5xx, `INTERNAL_SERVER_ERROR`, `SHOP_INACTIVE` | `ShopifyUnavailableError` | 503 |
| `THROTTLED` twice, or a wait over 10 seconds | `ShopifyUnavailableError` | 503 |
| `ACCESS_DENIED` through `sendStoreQuery`, no keys, refresh refused | `StoreMustAuthorizeError` | 409 |
| `ACCESS_DENIED` on the shop query at install | `ShopifyAccessDeniedError` | 500 |
| `MAX_COST_EXCEEDED`, unknown field, any other code, another status | `Error` | 500 |

### 5.6 The check run

`walkStoreRetrievers(storeId, retrievers, logger)` walks every retriever to its last page, each
collection's products and each large order's items, and logs one line per kind of data:
`{ storeId, kind, rows, pages, highestRequestedQueryCost }`. `check-retrievers.ts` reads the store id
argument, builds the app context and calls it; a failure exits with code 1.

The store ids come from the install log lines (`store installed`). The run, on Boris's word:

```bash
aws ecs run-task --cluster <ClusterName> --task-definition <the service's task definition> \
  --network-configuration <the service's network configuration> --launch-type FARGATE \
  --overrides '{"containerOverrides":[{"name":"app","command":["node","dist/retrieval/check-retrievers.js","<storeId>"]}]}'
```

`ClusterName` is the app stack's output; the task definition and network configuration are the
service's own, read with `aws ecs describe-services`. The lines are read in the app's log group.

### 5.7 The Dev Dashboard setting

| Setting | Value |
| --- | --- |
| Protected customer data | Level 1, orders; no Level 2 fields |

The exact field names and the reason chosen are copied from the Dashboard into the README.

### 5.8 What the specs prove

- `send-shopify-admin-query.spec.ts`: the URL, version, header and body; no answer, 429, 5xx and
  another status; the second send after the wait; a second `THROTTLED`.
  `read-shopify-admin-answer.spec.ts`: §5.5's GraphQL codes; `data` with `errors`; the first error
  deciding; `ACCESS_DENIED` as `ShopifyAccessDeniedError` with Shopify's message.
  `wait-for-bucket-refill.spec.ts`: the wait computed from the throttle status; exactly 10 seconds
  waited; a wait over 10 seconds refused without waiting.
  `shopify-store-query-sender.spec.ts`: store 5's address and key on the request;
  `ShopifyAccessDeniedError` as `StoreMustAuthorizeError(5)` with Shopify's message.
- One spec per retriever: the exact query and variables, the page size, the mapping to its shape
  (id numbers, pointers, `null` for a deleted product or variant, §4.6's fields: `processedAt`,
  `shopMoney`, the price after all discounts, a null status kept, `placed_on` in the store's
  timezone across midnight, `""` as null), `nextCursor`, positions from `nextPosition`.
- `walk-store-retrievers.spec.ts`: with fake retrievers, every page walked, one line per kind, no
  store data in the lines.
- E2E: the install with `ShopifyShopRetriever` faked; `getStoreAccess` returning address and key;
  the app builds with `RetrievalModule`.

## 6. Build order

One piece at a time. Each piece: show the failing spec in chat → approval → write it → run it red →
show the implementation in chat → approval → write it → run it green → run the whole gate.

1. Branch `feat/task-3.2-shopify-api-integration`; this document.
2. `getStoreAccess` and `StoreAccess`; `access-tokens.e2e-spec.ts`.
3. `test/shopify-answers.ts`; `sendShopifyAdminQuery`, `readShopifyAdminAnswer`,
   `waitForBucketRefill` and `ShopifyAccessDeniedError`;
   `ShopifyStoreQuerySender`.
4. `ShopifyShopRetriever` moved into `src/retrieval/`; `RetrievalModule`; the install, its module,
   `installation.e2e-spec.ts`, `new-rows.ts`.
5. `ShopifyProductsRetriever`.
6. `ShopifyProductVariantsRetriever`.
7. `ShopifyCollectionsRetriever`.
8. `ShopifyOrdersRetriever`.
9. `RetrievalModule` in `AppModule`; `repository-modules.e2e-spec.ts`.
10. `walkStoreRetrievers`, `check-retrievers.ts`.
11. Boris declares protected customer data in the Dev Dashboard (§5.7); the README row.
12. `AGENTS.md` lines 345, 361, 368.
13. The questions doc, Boris answering one question at a time.
14. Gate; push; the pull request; checks green; Boris merges, which deploys. On his word: the check
    run on both development stores, the lines read.

Commits happen when Boris says so.

## 7. Done when

- `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run format:check` and
  `npm run infra:check` pass.
- Every §5.8 proof is a passing test.
- The check run on both development stores logs every kind of data with no failure.
- The README, `AGENTS.md` and the questions doc are updated.
