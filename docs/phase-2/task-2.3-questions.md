# Task 2.3 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Task 2.3 asks for
one explanation, the backward-compatible migration strategy (spec line 370). This document also
answers the seven general questions (spec lines 71–77) for Drizzle, the tool that writes and runs
our migrations; Task 2.2 left them to the task that first runs Drizzle against the database. Then
it answers phase questions 9 and 13 (spec lines 400 and 404), the two that the code of this task
shows. Questions 5 to 8 and 10 wait for Task 2.4. Built 2026-11-01. The alternatives and
trade-offs are in `task-2.3-design.md`.

## 1. Backward-compatible migration strategy

A migration is a file of SQL that changes the database: it makes a table, adds a column, adds an
index. The files are numbered and run in order, and the database remembers which ones have run.
This task's chain is five files in `src/database/migrations/`.

Backward-compatible means: after a migration has run, the old version of the app still works. We
need that for two reasons. During a deploy, old and new containers run side by side for a minute
or two, both on the new database. And when we roll back, an older version of the app runs on the
newest database. The database itself is never rolled back.

Three kinds of change, three ways to stay inside the rule:

- **Adding something** is safe in one deploy: a new table, a new index, a new column that may be
  empty or has a default. The old code does not know the new thing and does not need to. Files 0,
  1 and 2 do this.
- **Removing or renaming** takes two deploys. First the code stops using the column and ships. In a
  later deploy a migration drops it. Dropped in one go, the old code still running would ask for a
  column that is gone. Nothing has been removed yet.
- **Making a column required** takes three steps. Add it as optional (file 2). Fill it for the rows
  that already exist (file 3, which sets `placed_on` to the day of `placed_at`). Make it required
  (file 4), but only once every running version writes it. Today no code inserts orders, so the
  three steps could ship in one task. From Phase 3 on, every version of the app writes `placed_on`.

The database does not check this rule; we keep it when we write the file. The e2e test shows the
shape once: it runs files 0 to 2, inserts orders, runs files 3 and 4, and checks that the orders
got their day and that the column is now required.

## 2. The seven general questions, for Drizzle

**What problem does it solve?** Our ten tables are written in TypeScript (Task 2.2). Something has
to turn them into SQL, run it against the database in order, once, and remember what ran. Drizzle
does both halves. `drizzle-kit generate` looks at the table files, compares them with what it saw
last time, and writes a new SQL file for the difference. The migrator in `drizzle-orm` runs the
files the database has not seen yet and writes one row per file into a table called
`__drizzle_migrations`, the journal. Our script `src/database/migrate.ts` calls that migrator.

**Why did we choose it?** The tables were already written in Drizzle. One set of files drives three
things: the app's queries, the migrations, and the test that fails when a table changes without a
migration. There is no second copy of the schema to keep in step by hand.

**What alternatives did we consider?** Prisma, in Task 2.1, when the ORM was chosen. Prisma
describes the tables in its own language and generates a client that writes the SQL for us, so
every question about what the database did would be answered by reading what Prisma did, not what
we wrote; and the advanced queries fall back to raw SQL strings anyway. The spec also names TypeORM
and Flyway (lines 357–361): with TypeORM we would write the ten tables a second time, as TypeORM
classes; Flyway is a Java tool, so the SQL would be written by hand from the TypeScript and Java
would run inside a Node pipeline. All three put a second description of the schema between us and
the database.

**What are its limitations?**

- No undo files. We only move forward (why: §4).
- No lock of its own. Two runs at the same time would both apply the files; our own lock (§4) is
  the only guard.
- In MySQL every table change commits on its own and cannot be undone as a group, so a file with
  several changes can stop half done. We write one change per file.
- `generate` compares the table files with its own last snapshot, not with the real database. A SQL
  file edited by hand is caught only by running the chain, which our e2e test does.
- The journal row is written after the file has run. If the connection drops in between, the change
  is in the database but not recorded, and the next run fails with "already exists".

**When would we choose differently?** When several services or languages share one database: then
a tool that belongs to none of them, Flyway or Liquibase, with the SQL as the source of truth. Or
when the schema uses stored procedures, triggers or partitions, which Drizzle does not model.

**What could go wrong in production?**

- A fill like file 3 on a big table runs long and holds locks. The task may run for the job's 45
  minutes; a big fill is written in batches.
- A file fails in the middle of the chain. The deploy run goes red and the service keeps running the
  old version. The journal and the task's log say which file. The fix is the next deploy, with a
  corrected or an added file.
- File 0 fails halfway on the empty database. The tables it made must be dropped by hand before the
  next run, and nobody has a way into the database today; the way in is in the Task 2.1 design,
  §4.10. This is the price of forward-only on MySQL.
- A rollback runs an older version's chain. It finds nothing new, exits 0, and the newest schema
  stays. That is fine because of the rule in §1.

**How does it behave under increased load?** The migration is a one-off task. It does not run inside
the app, and no request waits for it. Load reaches it through locks: a table change waits for the
statements running on that table, and blocks writes to it while it runs. MySQL 8.4 adds a column or
an index without rewriting the table. Making a column required rewrites the table, with reads and
writes still allowed meanwhile. On a big table, a change like file 4 runs at a quiet hour.

## 3. Phase questions

### 9. How do indexes affect write performance?

Built: file 1, the index `orders_store_id_placed_at_idx` on `(store_id, placed_at)`.

An index is a sorted copy of some columns that the database keeps next to the table, so it can
find rows fast. The database must update it on every insert, on every update of a column it
holds, and on every delete. Each index is one more place to write: more disk, more log. `orders`
now has five indexes besides the primary key: the two unique ones and the two pointer indexes from
Task 2.2, and this one. One insert into `orders` writes six structures. The cost is paid on every
write and paid back on every read that uses the index: a store's orders newest first, or between
two dates. Without the index those reads look at every order of the store. So an index is added
when there is a query that needs it; the index on `placed_on` waits for the daily roll-up of
Phase 5.

### 13. How do you perform a zero-downtime schema change?

Zero downtime means the service answers requests the whole time. Two parts make it work. The rule
of §1: no migration breaks the version that is running, so old and new code can both live on the
new schema. And the order of the deploy: the migration runs as its own task, from the new image,
before the service moves. Only when it exits 0 does the service swap containers, one at a time,
the old ones still answering. There is never a moment without a service and never a moment with
two schemas. The lock makes two runs at once impossible, the deploy queue makes them unlikely, and
MySQL does the changes of files 1 and 2 without rewriting the table.

## 4. Why we picked what we picked

- **Drizzle writes and runs the migrations.** The tables are already in Drizzle, so one set of
  files feeds the app, the migrations and the drift test. Prisma, TypeORM or Flyway would mean
  describing the schema a second time.
- **The migration runs as a one-off Fargate task from the app's own image.** The image is the
  packaged app that ECS runs. Running the migration from the same image means what ran the
  migration is exactly what the service is about to run, with the same secret and the same place in
  the network. A Lambda function would be a second package that can drift, and it stops after 15
  minutes.
- **The deploy workflow starts it as its own step.** A failed migration is one red line in the run,
  with the task's log beside it, and nothing after it runs. The alternative, a CloudFormation custom
  resource, answers a failure with a rollback that cannot undo half a migration.
- **A sixth stack, `-migration`.** A stack is a group of AWS resources deployed together. The
  migration task has its own, deployed first with the new image tag, so the task points at the new
  image while the service still runs the old. In the app stack it would deploy together with the
  service; in the data stack it would change the stack that guards the data on every deploy.
- **A named lock in the database, `GET_LOCK`, without waiting.** MySQL can hand one connection a
  lock by name and releases it when that connection ends. The script takes it before running and
  stops at once if someone else holds it. The deploy queue only covers GitHub; a run from a laptop
  or the console is outside it. Stopping rather than waiting: a taken lock means something unusual
  is going on, and a red step says so.
- **Forward only, one change per file.** No undo files: MySQL commits every table change on its
  own, so an undo would run against a state it cannot know. One change per file means a file either
  ran or did not.
- **Add first, remove later.** The rule of §1. The service swaps containers one at a time, so old
  code always meets the new schema.
- **Five files, one per spec line.** The ten tables go in one file: they were designed together in
  Task 2.2, and cutting them into several files would tell a history that never happened. Then one
  file each for the index, the column, the fill and the tightening, as the spec lists them (lines
  366–368).
- **`orders.placed_on` as the change to a populated table.** A real new column that the daily
  analytics will read, filled from a value every order has. The other candidates either added no
  column or filled a constant that a default would have filled.
- **`orders (store_id, placed_at)` as the index.** A store's orders by time is the first question
  every commerce screen asks. Task 2.4's pagination reads it.
- **A small plain script with one connection, not the Nest app.** The script opens one connection,
  takes the lock, runs the files, releases the lock. Booting the whole Nest app would let anything
  unrelated to the database fail the migration, and a pool of connections would break the lock,
  which belongs to the one connection that took it.
- **The files live under `src/database/migrations/`.** Everything about the database is under
  `src/database/` since Task 2.1. A root folder named `drizzle/` would say who wrote the files, not
  what they are.
- **The chain is proven on the throwaway MySQL of the e2e suite.** A wrong file fails in the pull
  request, not mid-deploy against the dev database. And spec lines 367 and 368 need orders to run
  on; the test inserts them.
- **The drift test.** A test compares the table files with the migration files; a table change
  without a migration fails `npm test`. The ERD test of Task 2.2 guards the drawing the same way.
- **Questions 9 and 13 here, the rest in Task 2.4.** File 1 adds an index, so its cost is answered
  where it is paid. ACID, isolation levels and deadlocks are about running queries, which Task 2.4
  writes.
- **The task uses the app's security group.** A security group is the firewall rule set of a
  container. The task needs the same two exits as the app: to the database, and out on 443. The
  app's group has one extra rule, in from the load balancer, which can carry nothing to a task that
  opens no port. A group of its own would be a copy to keep in step.
- **GitHub's right to start the task lives in the delivery stack.** That stack holds the role
  GitHub Actions uses, so it is the one place to read what the pipeline may do in the account. Four
  rights were added: start the task, watch it, pass its two roles, read its log, each on the
  migration stack's own resources.
- **The shared pieces in `infra/lib/app/`.** The cluster name, the container environment, the
  secrets, the roles, the task size and the log group are each written once and used by both task
  definitions. A copy edited on one side would let the migration task drift from the app's.
