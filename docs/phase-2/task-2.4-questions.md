# Task 2.4 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Task 2.4 lists the
phase's thirteen questions (spec lines 392–404). Tasks 2.2 and 2.3 answered 1 to 4, 9 and 11 to 13.
This document answers 5, 6, 7, 8 and 10. It also answers the seven general questions (spec lines
71–77) for the repository pattern, which this task adds. Built 2026-11-02. The alternatives and
trade-offs are in `task-2.4-design.md`, and the measurements are in `task-2.4-query-analysis.md`.

## 1. The seven general questions, for the repository pattern

A repository is a class that holds all the database queries for one group of tables. The rest of the
app calls its methods, such as `findById`, and never writes a query itself.

**What problem does it solve?** When queries are spread through an app, the same query gets written
in many places, and one table change means finding all of them. A forgotten filter is also hard to
spot. A repository puts the queries in one place, where they can be changed, reviewed and tested.

**Why did we choose it?** It separates what the app needs from how the database gets it. In an app
with many customers, every query must say which customer it is for, so that rule belongs where the
queries live. The spec also asks for repositories (line 412).

**What alternatives did we consider?**

- Queries inside each feature: less code at first, but the queries get repeated and the customer
  filter must be remembered everywhere.
- Entity classes of our own: a clean split between the app and the tables, but every column is
  written twice more.
- Taking the customer from the web request: the caller writes less, but a repository then depends on
  the web layer.
- A `forStore(storeId)` object: the same result with an extra layer.
- One shared repositories folder: anything needing one repository gets them all.

**What are its limitations?**

- It is one more layer of code, and every new kind of query needs a new method.
- It hides the SQL, so a simple-looking method can be slow.
- It does not make queries correct. Only tests and review stop a method from forgetting a filter.
- A transaction across two repositories needs extra work, because each one runs on its own.

**When would we choose differently?**

- In a very small app, queries can live in the service.
- When several repositories must commit together, the caller opens the transaction and passes it in.
- For heavy reports, a separate read layer or plain SQL fits better.
- When the app's data stops matching the tables, use entity classes.

**What could go wrong in production?**

- A method forgets the customer filter, and one customer sees another's data.
- A method runs one query per row, or a query with no index, and it only hurts once data grows.
- A long transaction holds a connection and locks, so other work waits.
- Two updates to the same row collide, and the older one overwrites the newer.

**How does it behave under increased load?** The pattern itself costs almost nothing, because it is
only a method call. Load lands on what sits under it: how many rows each query reads, how many indexes
each write must update, and how many connections the pool has. When every connection is busy, new
work waits in a queue. In this project the pool has ten connections.

## 2. Phase questions

### 5. What are ACID properties?

A transaction is a group of database changes treated as one unit. ACID is the four guarantees a
database gives for a transaction:

- **Atomicity:** all the changes happen, or none do. If one fails, the database undoes the others.
- **Consistency:** the database moves from one valid state to another. A transaction that would
  break a rule, such as a unique index or a foreign key, is refused.
- **Isolation:** transactions running at the same time do not get in each other's way. How strictly
  this holds depends on the isolation level.
- **Durability:** once a transaction commits, it stays, even if the server crashes straight after.
  The change is written to a log on disk first.

In this project, `orders.create` saves an order and its items in one transaction.

### 6. What are transaction isolation levels?

An isolation level sets how much one transaction can see of what other transactions are doing at the
same time. Each level allows or prevents three problems:

- **Dirty read:** reading a change that another transaction has not committed and may still undo.
- **Non-repeatable read:** reading the same row twice and getting different values, because another
  transaction changed it in between.
- **Phantom read:** running the same search twice and getting extra rows, because another
  transaction added them in between.

| Level            | Dirty read | Non-repeatable read | Phantom read                            |
| ---------------- | ---------- | ------------------- | --------------------------------------- |
| READ UNCOMMITTED | Possible   | Possible            | Possible                                |
| READ COMMITTED   | Prevented  | Possible            | Possible                                |
| REPEATABLE READ  | Prevented  | Prevented           | Possible in the standard, rare in MySQL |
| SERIALIZABLE     | Prevented  | Prevented           | Prevented                               |

Stricter levels are safer, but transactions wait for each other more. A loose level suits reads that
can tolerate slightly stale data. A strict one suits work where a wrong read costs real money.

MySQL's default is REPEATABLE READ. In this project we keep it, because our only transaction just
inserts rows.

### 7. What are deadlocks?

A deadlock is when two transactions each hold a lock the other needs, so neither can continue. A lock
is a mark on a row that says "mine until I finish". For example, transaction A locks row 1 and waits
for row 2, while transaction B locks row 2 and waits for row 1.

The database notices this, cancels one transaction, undoes its changes and returns an error. The
other transaction continues. The app must then retry the cancelled work.

Deadlocks come from touching the same rows in a different order, from long transactions, and from
missing indexes, which make a query lock more rows than it needs. To make them rarer, take locks in
the same order everywhere, keep transactions short and add the right indexes. They cannot be removed
completely, so code that retries safely is still needed.

In this project, retrying belongs to the code that delivers the work (line 633).

### 8. What are optimistic and pessimistic locks?

Both protect a read followed by a write, when someone else might change the row in between.

- **Optimistic locking** assumes conflicts are rare and takes no lock. Each row has a `version`
  number. An update only applies if the version is still the one you read. If it has changed, nothing
  is written, and the caller reads again and retries.
- **Pessimistic locking** assumes conflicts are common and locks the row while reading it, with
  `SELECT ... FOR UPDATE`. Everyone else waits until the transaction ends.

|           | Optimistic                         | Pessimistic                             |
| --------- | ---------------------------------- | --------------------------------------- |
| Best when | Conflicts are rare, reads are many | Conflicts are common, a retry is costly |
| Cost      | Retries when a conflict happens    | Waiting, and a higher risk of deadlocks |

In this project we use neither, because no method reads a row and then writes it back.

### 10. How do you diagnose slow queries using EXPLAIN?

`EXPLAIN` is a MySQL command. You put it in front of a query, and MySQL tells you how it would run
that query, without running it: which tables it reads, which index it uses, and about how many rows
it expects to read. `EXPLAIN ANALYZE` goes further. It really runs the query, then reports the rows
each step read and the time it took.

To diagnose a slow query:

1. Find it. MySQL's slow query log records every query that takes longer than a time you set.
2. Run `EXPLAIN` on it, or `EXPLAIN ANALYZE` for real numbers.
3. Look for the warning signs:
   - `type: ALL`, or `Table scan`: MySQL reads every row in the table.
   - `key: NULL`: it uses no index.
   - `rows` far above what the query returns: it reads many rows and throws most away.
   - `Using filesort`, or `Sort`: it sorts the rows itself, because no index holds them in order.
   - `Using temporary`: it builds a temporary table to get the answer.
4. Fix the cause. Usually that means an index on the columns in `WHERE` and `ORDER BY`, or a
   rewritten query.
5. Run it again and compare the rows read.

Compare rows, not times, because times change between runs. Test on data shaped like production,
because the plan can change with the data.

In this project, a list for a rare status went from 2,546 rows read to 51 with a new index.

## 3. Why we picked what we picked

- **Three repositories, not ten (decision 1).** Line 412 asks for "database entities and
  repositories", and a strict reader could expect all ten tables. The other six have no caller until
  their tasks arrive: credentials 3.3, webhook records Phase 4, variants and collections 5.1,
  analytics 5.2. Writing them now would guess at what those tasks need.
- **Drizzle's row types are the entities (decision 15).** A strict reader of line 412 could expect
  classes. With Drizzle, the table file plus `typeof orders.$inferSelect` is the entity: one
  definition, no second copy to keep in step.
- **The store id is a required argument (decision 2).** A caller cannot forget it, because the code
  will not compile. A test per method proves no other store's rows come back.
- **The store id is written last, on create and update.** Types do not exist at run time, so a stray
  value in the input must not win. No update can move a row to another store.
- **An order item's product and variant stay empty (decision 21).** MySQL cannot check that they
  belong to the same store, and nothing can fill them yet. `create` blanks them, so a stray id cannot
  point into another store. The task that fills them adds the check.
- **Separate `create` and `update` (decision 3).** One `save` would quietly overwrite, and Task 5.3
  owns that question.
- **`create` returns only the id (decision 17).** Reading the whole row back would cost one extra
  read per order during Task 5.1's import, for a result nothing uses.
- **Our own `DuplicateRowError` (decision 4).** A repository should not know about HTTP, and the raw
  database error holds the query. A mapper turns ours into a 409.
- **`findById` returns nothing, writes throw `RowNotFoundError` (decision 11).** "Not there" is a
  normal answer to a read. A write that changed nothing should not pass quietly. Missing and another
  store's look the same, so the answer tells a caller nothing about other stores.
- **The transaction lives inside `orders.create` (decision 5).** Only that method needs one today.
  Passing transactions around would make every caller repeat the work.
- **No locks (decision 12).** A lock protects a read followed by a write, and no method does that. A
  `version` column would be a schema change every caller must handle.
- **Let a deadlock fail (decision 13).** MySQL undoes the whole transaction, so nothing is left
  half-written. A retry here would stack on the queue's retries in Phase 4.
- **Bookmark paging (decision 6).** A bookmark says "the rows after this one". Page numbers get
  slower the deeper they go, and rows shift between pages. The measurements show a last page costing
  no more than a first.
- **Always 50 rows (decision 7).** No caller needs to choose yet, and a fixed size keeps every page's
  cost known.
- **The bookmark is a plain object (decision 18).** Orders use `{ placedAt, id }` because two orders
  can share a time, and the id settles it. A coded string is for outside callers, and we have none.
- **Orders filter by date and status, products by status (decision 8).** These are the questions
  commerce screens ask. Filtering on most columns would need an index for every combination.
- **Two new indexes, both kept (decisions 9 and 20).** The measurements decided it. For a rare status
  they read about 20 to 50 times fewer rows. For a common status they do little.
- **The method list (decision 10).** Only what the spec's items need. Orders have no delete, and an
  order's `update` leaves items alone until Phase 4 and Task 5.3 show what should happen.
- **`findById` brings items, `list` does not (decision 16).** One call shows one whole order. A page
  of 50 orders should not load rows it does not show.
- **One folder per feature (decision 14).** A feature that needs one repository gets only that one,
  and feature code stays apart from the connection and the migrations.
- **Each spec gets its own database on real MySQL (decision 19).** Files running together would share
  rows otherwise, and a fake could not refuse a duplicate or undo a transaction.
- **A script by hand, not a gate test (decision 20).** MySQL's choice of index can shift with nothing
  wrong, so a test could fail for no reason. The script measures the repository's own query, through
  Drizzle's logger, so it cannot measure an outdated copy.
