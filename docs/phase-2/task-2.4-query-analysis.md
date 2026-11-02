# Task 2.4 — Query optimization analysis

This is the query optimization analysis the phase asks for (spec line 414). It checks whether the
two indexes added in this task earn their place. Both do, so both stay.

Run on 2026-11-02 with `npm run analyze:queries`, on a laptop, in a throwaway MySQL 8.4 container.

## What was measured

An index is a sorted list MySQL keeps beside a table, so that it can find rows without reading
them all. This task added two:

- `orders_store_id_financial_status_placed_at_idx` on orders: store, status, then time.
- `products_store_id_status_idx` on products: store, then status.

The script fills 100,000 made-up orders and 20,000 products across 10 stores, then measures one
store. Each list query runs twice: once as MySQL chooses, and once with `IGNORE INDEX`, which forbids
the new index. It is measured on the first page and on the last, because a slow paging method only
shows its cost deep in the list.

`EXPLAIN ANALYZE` is what does the measuring. It runs the query and reports the plan MySQL really
used, with the rows it read and the time it took.

The queries are the repository's own. Drizzle's logger records the SQL that `list` sends, so the
plan cannot be of a copy that has drifted from the code.

Statuses are uneven on purpose, as real ones are. An index on status has the most to do when the
status is rare.

| Table    | Status shares                                      |
| -------- | -------------------------------------------------- |
| orders   | `paid` 70%, `pending` 20%, `refunded` 8%, `voided` 2% |
| products | `active` 80%, `draft` 15%, `archived` 5%            |

## How to read the results

"Rows read" is the number to trust. It comes from the data and the plan, so it is the same on any
machine. The times come from a laptop with a warm cache and move between runs, so they only show
the size of a difference.

"Sort" means MySQL had to sort the rows itself, because the index it used did not already hold them
in order.

## Results

One store: 10,000 orders and 2,000 products. A page is 50 rows, and MySQL asks for 51 to learn
whether another page exists. The last page of each list is shorter or equal, so 16 and 22 are not
errors.

| List                             | Page  | Rows read, with | Rows read, without | ms, with | ms, without |
| -------------------------------- | ----- | --------------- | ------------------ | -------- | ----------- |
| Orders, `paid` (70%)             | first | 51              | 72                 | 0.05     | 0.05        |
| Orders, `paid` (70%)             | last  | 50              | 72                 | 0.03     | 0.04        |
| Orders, `voided` (2%)            | first | 51              | 2,546              | 0.03     | 1.08        |
| Orders, `voided` (2%)            | last  | 50              | 2,527              | 0.03     | 1.19        |
| Orders, `voided` in a date range | first | 51              | 2,525              | 0.04     | 1.35        |
| Orders, `voided` in a date range | last  | 16              | 810                | 0.01     | 0.39        |
| Products, `active` (80%)         | first | 53              | 2,000 + sort       | 0.03     | 0.95        |
| Products, `active` (80%)         | last  | 22 + sort       | 28                 | 0.02     | 0.02        |
| Products, `archived` (5%)        | first | 51              | 2,000 + sort       | 0.03     | 0.81        |
| Products, `archived` (5%)        | last  | 50 + sort       | 1,008 + sort       | 0.04     | 0.53        |

The sorts on the "with" side cover the 22 and 50 rows of the page, so they cost almost nothing.

## What the results show

**The orders index helps when the status is rare.** For `voided`, MySQL reads about 50 times fewer
rows. For `paid` it makes almost no difference: the older `(store_id, placed_at)` index walks the
store's orders newest first, and 7 in 10 match, so it reaches 51 quickly.

Here is the same page both ways. With the index, MySQL goes straight to the `voided` rows:

```text
-> Limit: 51 row(s)  (actual rows=51)
    -> Index lookup on orders using orders_store_id_financial_status_placed_at_idx
       (store_id=1, financial_status='voided') (reverse)  (actual rows=51)
```

Without it, MySQL walks the store's orders and throws away 49 in 50:

```text
-> Limit: 51 row(s)  (actual rows=51)
    -> Filter: (orders.financial_status = 'voided')  (actual rows=51)
        -> Index lookup on orders using orders_store_id_placed_at_idx
           (store_id=1) (reverse)  (actual rows=2546)
```

These two plans are shortened from the script's output: the cost figures and time ranges are left
out.

**The products index helps when the status is rare, and on small stores at any status.** On a store
of 2,000 products, MySQL without the index reads the whole store and sorts it, even for `active`.
That plan does not carry over to bigger stores. A one-off run with 20,000 products per store showed
MySQL switching to the `(store_id, id)` index, which already holds products newest first:

| List                      | Page  | Rows read, with | Rows read, without |
| ------------------------- | ----- | --------------- | ------------------ |
| Products, `active` (80%)  | first | 53              | 66                 |
| Products, `active` (80%)  | last  | 53 + sort       | 67                 |
| Products, `archived` (5%) | first | 51              | 1,019              |
| Products, `archived` (5%) | last  | 50 + sort       | 1,008              |

So on a bigger store the rows read depend on how rare the status is, not on how many products the
store has. At 5% the index saves about 20 times the rows. For a common status it saves almost
nothing, the same as on orders.

**The cost of a page does not grow with depth.** No last page in the main results reads more rows
than its first page, with or without the index. That is what bookmark paging (decision 6) promised:
MySQL jumps to the bookmark instead of counting past every earlier row.

## A mistake this run caught

The first run wrote each store's rows in one solid block. A real table mixes stores, because orders
arrive from all of them at once. Store 1 sat at the very start of `products`, so MySQL could walk the
primary key, and three of the products last pages looked better or chose differently from how
production would behave. The orders numbers did not move.

The fill now takes turns between stores, and the results above come from that fill. A made-up data
set has to match the shape of the real one, not only its size.

## Limits

- The rows are made up. Real status shares will differ, and they decide how much the orders index
  gives.
- The main run measures one store of 10,000 orders and 2,000 products. The 20,000-product run was
  done once on a changed copy of the script, and `npm run analyze:queries` does not repeat it.
- Write cost is not measured. Each index is one more list for MySQL to update on every insert, and
  the new orders index overlaps the older one. Question 9 in `task-2.3-questions.md` covers that
  trade-off.
- Nothing stops a later change from losing an index. The script runs by hand, because a gate test on
  index use would be slow and could fail with nothing wrong (design §4.16).

## Decision

Keep both indexes. The orders index turns a rare-status list from thousands of rows read into about
50. The products index turns one from about 1,000 into about 50, and spares a small store a full
read and sort. For a common status neither does much. Neither was dropped.
