# Task 2.3 — Migrations: Design

**Date:** 2026-10-31
**Branch:** `feat/task-2.3-migrations`
**Status:** design agreed in chat on 2026-10-31; not yet built.
**Spec:** `docs/Boris-ing.md`, section 4, Task 2.3 (lines 355–376); phase deliverables and
acceptance criteria at lines 406–421; phase questions at lines 390–404; the seven general
questions at lines 71–77.

This document records what was decided for Task 2.3 and why. A builder should be able to implement
from it without going back to the author. Every decision in it was taken by Boris in chat and is
marked **(Boris, decision N)**; the alternatives he rejected are given with each. The mechanics
that follow from the decisions are written in §5. The mechanical details left to the builder are
listed in §8, and every file is shown in chat before it is written.

---

## 1. Intent

Task 2.2 wrote ten tables in TypeScript; no database has them. Task 2.3 gives the project the way
a schema change reaches the database, and uses it five times.

Drizzle writes numbered SQL files from the table definitions. A small script applies the files
not yet applied and writes each one down in the database. The deploy run starts that script as a
one-off task inside the private network, from the image it has just built, and only when the
script has exited cleanly does the run move the service to the new image. A named lock in the
database makes a second run impossible; a failed run stops before the service is touched; every
file keeps the previous image working, so the swap and the rollback button never meet a schema
they cannot live on.

The first chain is five files: the ten tables, an index on orders, a day column on orders, its
fill for the rows that exist, and its tightening. The chain is proven on the throwaway MySQL of
the e2e suite, and a test in the gate fails when a table file changes without a migration.

The companion `task-2.3-questions.md` explains the backward-compatible strategy the spec asks
for, answers the seven general questions for Drizzle, answers phase questions 9 and 13, and gives
the reasons behind every decision here.

## 2. Goals, non-goals, anti-goals

**Goals**

- Every item of spec lines 357–376 traced to a decision (§4.1).
- Drizzle as the migration framework, its files next to the schema, its command-line package in
  the gate (§4.2, §4.13).
- The migration run as a one-off ECS task from the app's own image, started by the deploy
  workflow as a named step before the service moves, described by a sixth stack (§4.3, §4.4, §4.5).
- Two runs at once impossible: a named lock in the database behind the deploy queue (§4.6).
- A failed migration stops the run before the service is touched, forward only, one change per
  file (§4.7).
- Every migration keeps the previous image working: add first, remove later (§4.8).
- Five files: the ten tables, an index, a column, its fill, its tightening (§4.9, §4.10, §4.11, §5.1).
- A plain script with one connection, reusing the settings check and the connection options the
  app has (§4.12).
- The chain proven on the throwaway MySQL; a gate test that catches a table change without a
  migration (§4.14, §4.15).
- The pipeline's right to start the task in the delivery stack; the task under the app's security
  group (§4.17, §4.18).
- The questions doc; the README; `docs/architecture.md`; `CLAUDE.md` (§4.19).

**Non-goals** (later)

- Reading and writing rows, transactions, pagination, filtering, the indexes those queries need
  beyond file 2: Task 2.4.
- Phase questions 5, 6, 7, 8 and 10: Task 2.4 (decision 15).
- Writing orders, and so writing `placed_on`: Phase 3.
- An index on `placed_on` for the daily roll-up: Phase 5, when the query exists, by the path built
  here (decision 10).
- A path for a person into the database: unchanged from Task 2.1 §4.10; the one case that would
  need it is named in §4.7.

**Anti-goals**

- The app running migrations when it starts: ruled out by spec line 374.
- A tunnel from the GitHub runner into the database: ruled out by Task 2.1 decision 9b.
- Undo files: §4.7.

## 3. Constraints

From the spec's general rules (lines 57–66): all infrastructure as code, deploys through GitHub
Actions, no long-lived keys, no secrets in source, tests and a working deployment at the end,
every major decision documented with alternatives.

From earlier tasks:

- The database is reachable only from inside the VPC; the app's security group is the only one
  allowed in (2.1 §4.10, decision 9b). Whatever runs a migration runs inside.
- The login reaches a container as ECS secrets, never as plain environment (2.1 §4.4).
- The deploy role is the only identity that changes AWS from GitHub, and it may only deploy stacks
  and push images (1.5). Starting a task is a right it does not have.
- The image tag is a deploy argument, `-c imageTag=<sha>`; a task definition names
  `repository:tag`, and a running task cannot change its image (1.3).
- Every security group is explicit and the network stack owns every rule (1.2, 1.3).
- Every workflow change starts with a rule in `workflows.spec.ts`, red (1.5).
- A table change updates the ERD in `task-2.2-design.md` §5.1 or the gate fails (2.2 §4.11).
- The deploy workflow queues runs one behind the other and cancels nothing (1.5).

From MySQL and Drizzle, checked in the code:

- MySQL cannot undo a table change: every `CREATE` and `ALTER` commits on its own, and commits
  whatever came before it in the same transaction. Only data changes roll back.
- Drizzle's migrator (`drizzle-orm/mysql2/migrator`, 0.45.4) reads the journal, runs every file
  whose time is later than the last one recorded in `__drizzle_migrations`, inserts a record after
  each file, and wraps the run in one transaction that MySQL's implicit commits cut at every table
  change. It takes no lock.
- `drizzle-kit` 0.31.11 pairs with `drizzle-orm` 0.45.4. Its `generate` writes a file from the
  difference between the tables and the last snapshot; `generate --custom` writes an empty file
  for hand-written SQL; its `api` module exposes `generateMySQLDrizzleJson` and
  `generateMySQLMigration`, the comparison the drift test uses.

## 4. Decisions

### 4.1 The spec traced

| Spec | Where |
|---|---|
| Choose a migration framework: Drizzle, TypeORM or Flyway (357–361) | §4.2 |
| At least five incremental schema migrations (365) | §4.9, §5.1 |
| Create indexes using migrations (366) | §4.11, §5.1 file 2 |
| Demonstrate a change to an existing populated table (367) | §4.10, §5.1 files 3 and 5, §5.5 |
| Demonstrate a data migration/backfill (368) | §4.10, §5.1 file 4, §5.5 |
| Handle migration failures (369) | §4.7 |
| Explain backward-compatible migration strategies (370) | §4.8; questions doc §1 |
| Integrate database migrations with the deployment process (372) | §4.4, §4.5, §5.4 |
| Controlled, one-off operations, not from every running instance (374) | §4.3 |
| Prevent concurrent migration execution (376) | §4.6 |
| Deliverables: migration scripts (411), updated deployment pipeline (415) | §5.1, §5.4 |
| Phase questions 9 and 13 (400, 404) | questions doc §3 (decision 15) |
| The seven general questions, for Drizzle (71–77) | questions doc §2 (2.2 decision 13) |

The acceptance line (419), migrations execute through the deployment process and schema changes
are applied without manually accessing the database, is met by §5.4 and checked by §7.

### 4.2 The framework: Drizzle

**(Boris, decision 1)** Drizzle ORM migrations. The ten tables are already written in Drizzle;
`drizzle-kit` reads them and writes the SQL; `drizzle-orm`'s migrator applies it and keeps the
record of what ran.

Rejected **(TypeORM migrations)**: the ten tables would be written a second time as TypeORM
entities and kept in step with the Drizzle ones by hand; the day they drift, the app's picture of
a table no longer matches what the migration built, and nothing warns. A second ORM in the image
for one job. Rejected **(Flyway)**: a Java program. The pipeline runs on Node; Flyway would need
Java on the runner or its own container, and the SQL would be written by hand from the TypeScript
definitions, so the schema would again live in two places.

How Drizzle records a run: a table `__drizzle_migrations` with one row per applied file, its hash
and the time stamped in the journal. A run applies every file whose journal time is later than the
last row. An older image, as the rollback button deploys, carries no later file, so its run finds
nothing to do and exits 0.

### 4.3 Where it runs: a one-off task from the same image

**(Boris, decision 2)** The deploy starts one container from the image it has just built, on the
app's Fargate cluster, in the private subnets, with a different start command that runs the
migration script and exits. Same image, same database secret, same network place as the app.

Rejected **(a Lambda function inside the VPC, triggered by CloudFormation)**: a second packaging
of the migration files and the driver, apart from the image, which can drift from it; a 15-minute
limit a large backfill can exceed; logs and failures buried inside the CloudFormation deploy rather
than one named step of the run.

Not options: the app running migrations at startup is ruled out by spec line 374, and with two
instances both would try at once; a tunnel from the runner is ruled out by 2.1 decision 9b.

What the task is: a Fargate task definition of its own (§5.3), ARM64, the stage's `taskCpuUnits`
and `taskMemoryMiB`, the app's environment and secrets, the command `node dist/database/migrate.js`,
no port, no public IP, its own log group `/commerce-intelligence/dev/migration` with the stage's
retention. It is the same image the service is about to run, so what ran the migration is exactly
what the app will run.

### 4.4 Who starts it: the workflow, as its own step

**(Boris, decision 3)** The deploy workflow starts the task as a named step between the image
build and the stack deploy, waits for it to stop, reads the container's exit code, and fails the
run right there if it is not 0. Nothing after the step runs; the service is never touched.

Rejected **(CloudFormation starts it through a custom resource)**: brings back the Lambda of
§4.3 as the helper that calls "run task" and polls; more code, logs and roles of ours; and a failed
migration would answer with a stack rollback, which cannot undo a half-applied migration and can
leave the service mid-update. With the workflow step the failure is one red line in the run, with
the task's log next to it, the way every other step has read since Task 1.5.

The run does not change for the rollback button: the deploy job is the same job for both triggers
and the two new steps have no condition, so a rollback deploys the stacks and runs the task like a
merge; the older image's run finds nothing to do (§4.2). The order inside the job is in §5.4.

### 4.5 Which stack: a sixth, `-migration`

**(Boris, decision 4)** A sixth stack, `commerce-intelligence-dev-migration`, holds the task
definition, its two roles and its log group. The run deploys it first, with the new image tag, so
the recipe points at the new image while the service still runs the old one; then the task runs;
then every stack deploys. Boris's reason: simpler to manage later.

Rejected **(inside the app stack)**: the app stack deploys the task definition and the service
from one tag in one deploy, so there is no moment where the migration runs on the new image while
the service still runs the old; getting that order inside one stack needs two tags or two deploys
of the same stack. Rejected **(inside the data stack)**: the data stack is the database, protected
and meant to change rarely; the migration recipe changes on every merge, and a mistake in it would
land in the stack that guards the data.

The stack needs the network (the VPC's private subnets and the app security group), the data
stack (the connection and the secret) and the registry (the repository); nothing from the app
stack. The cluster name it reports is computed the same way the app stack names the cluster,
through one shared function. It carries no termination protection, like the app stack. Cost: a
stack, a task definition, two roles and a log group cost nothing idle; the task bills a few seconds
of Fargate per deploy.

### 4.6 Two runs at once: a named lock in the database, behind the deploy queue

**(Boris, decision 5)** Before the script touches anything it asks MySQL for a named lock,
`GET_LOCK` with a timeout of 0, on the one connection it then uses for the whole run. If it gets
the lock it runs and releases it at the end; if the lock is taken it exits 1 at once with a clear
message, having touched nothing. MySQL releases a named lock the instant its connection drops, so
a crashed task never blocks the next run. The deploy queue of Task 1.5 stays as the first fence:
two deploy runs never overlap.

Rejected **(the deploy queue alone)**: it covers runs inside GitHub only. A recovery deploy from
a laptop, a task started from the console or a step retried after a timeout is outside it, and
spec line 376 asks that the solution prevents it. Rejected **(a marker outside the database, for
example a parameter the workflow writes and removes)**: it goes stale when the task dies before
removing it and blocks every deploy until someone deletes it by hand; one more AWS thing to
create, grant and watch, guarding a database that can guard itself.

Why stop rather than wait: in normal life the lock is never taken, because the queue spaces the
runs. If it is, something unusual is happening, and a red step that says so is better than a
second task waiting quietly and hiding it. Drizzle's migrator takes no lock of its own (§3), so
this one is the only one.

### 4.7 Failures: forward only, one change per file

**(Boris, decision 6)** No undo files. A failed run goes red, the service keeps the old image on
the old schema, `__drizzle_migrations` says which files ran, the task's log shows the statement
that failed, and the fix is the next deploy with a corrected or additional file. Every file from
the second on holds one change, so a file either ran or it did not. A fill runs as one statement,
which InnoDB applies or rolls back whole, so no rows are left half-filled. The daily backups of
Task 2.1 (seven days, §4.6 there) are for disaster, not for a failed step. Boris's reason: we
know what to fix, and fixing is faster.

Rejected **(undo files)**: after a failure an undo file runs against a state it cannot know,
because MySQL has already committed every table change along the way; Drizzle has no undo files,
so they would be hand-written and run by nothing until the day they are needed; the undo of a
fill or of a drop is losing data.

What "one change per file" buys, exactly: Drizzle inserts a file's record after its statements,
in autocommit once a table change has cut the transaction. So a file with one statement is either
recorded with its statement done, or not recorded with nothing done, except in one window: the
connection dropping in the milliseconds between the statement and the record. Then the file is
applied but not recorded, and the next run fails on it with "already exists", which the log says
plainly.

The first file is the exception to "one change": it creates the ten tables and their pointers,
some thirty statements, on an empty database. It is proven on the throwaway MySQL in every pull
request, so the only way it fails on the dev database is the database going away in the middle.
Then the tables it made must be dropped before the next run, because Drizzle re-runs an
unrecorded file first and would fail on them. Nobody has a path to do that today, by 2.1
decision 9b; the way in when the need comes is the one recorded in 2.1 §4.10. This is the honest
limit of forward-only on MySQL, and it is written in the questions doc.

### 4.8 Old code on a newer schema: add first, remove later

**(Boris, decision 7)** Every migration keeps the previous image working. Adding is always safe:
a new table, a new index, a new column that may be empty or has a default. Removing or renaming
takes two deploys: the code stops using the thing and ships; a later migration drops it. A column
that must become required takes three: add it optional, fill it, make it required once the code
writes it. This is the backward-compatible strategy spec line 370 asks to explain, and the answer
to phase question 13.

Rejected **(no rule; a migration may change the schema any way it likes)**: the service swaps
containers one by one, so on every deploy old and new containers run side by side on the new
schema for a minute or two, and a breaking migration would error the old ones in the middle of
every such deploy, not only on rollback; the rollback button would be unusable exactly when a
release is biggest; going back would mean restoring a backup and losing every row written since.

What it costs: a removal or rename takes two or three deploys instead of one, and for a while the
schema carries a column nobody reads. The rule is a promise kept when writing migrations; MySQL
does not check it. The five files of §5.1 keep it, and the three-step shape of files 3 to 5 is it,
lived once.

Applied to file 5: a required column without a default would break an image that inserts orders
without it. No code inserts orders today; Phase 3 is the first, and it writes `placed_on` from its
first line. So the three steps ship in one task here, and the rule for every later case stands:
the tightening ships only once the running code writes the column.

### 4.9 The chain: five files, one per spec line

**(Boris, decision 8)** Five files in one chain:

| File | What | Spec line |
|---|---|---|
| 0000 | creates the ten tables of Task 2.2, their keys and pointers | 419, the schema applied |
| 0001 | adds the index of §4.11 on `orders` | 366 |
| 0002 | adds `orders.placed_on`, optional | 367 |
| 0003 | fills `placed_on` for every row from `placed_at`, hand-written | 368 |
| 0004 | makes `placed_on` required | 367 |

Each file is one change (§4.7); files 2 to 4 are the three steps of §4.8.

Rejected **(the ten tables cut into five files by concept, then the same four changes: nine
files)**: the ten tables were designed together in one task and go into the database together;
five files would tell a history that never happened, and producing them means hiding table files
from the generator and running it five times, a manual trick nobody can redo.

### 4.10 The column: `orders.placed_on`

**(Boris, decision 9)** A new column on `orders`: `placed_on DATE NOT NULL`, the UTC day of
`placed_at`, declared as `date('placed_on', { mode: 'string' })` per the 2.2 convention for a day.
File 2 adds it optional, file 3 fills it with `DATE(placed_at)` where empty, file 4 makes it
required. The daily analytics row of Task 2.2 is per store per UTC day; this is the day it reads.
From Phase 3 the code writes `placed_on` on every insert.

Rejected **(`fulfillment_status`: fill the empty ones with "unfulfilled" and make the column
required)**: the most real change of the three, but it adds no column, so the "change to a
populated table" would be thin, and it reopens a column decided in 2.2 for a reason that still
holds. Rejected **(`test`, Shopify's flag for test orders, filled with false)**: a constant fill
is what a default does on its own in the add step, so the fill step would do nothing real; and
whether an order is a test order is something Phase 3 learns from Shopify.

Noted: MySQL could compute such a column by itself, as a stored generated column. We write it
ourselves because the app owns what it stores, and because the fill is what spec line 368 asks to
demonstrate.

The ERD in `task-2.2-design.md` §5.1 gains the column, by the 2.2 convention that a table change
updates the drawing; §5.2 of that document stays the record of what 2.2 decided, and this document
is where `placed_on` is explained.

### 4.11 The index: `orders (store_id, placed_at)`

**(Boris, decision 10)** File 1 creates `orders_store_id_placed_at_idx` on
`(store_id, placed_at)`, declared in `orders.ts` with the 2.2 naming rule. It answers the first
question every commerce screen asks, a store's orders newest first, and a store's orders between
two dates; Task 2.4's pagination of orders reads it. Phase question 9, what an index costs on
writes, is answered on it in the questions doc.

Rejected **(an index on `placed_on`)**: the column does not exist when file 1 runs, so it would
be a sixth file at the end; and an index is best added when the query that needs it exists, which
for the day roll-up is Phase 5, by the same path. Rejected **(`webhook_records (store_id,
status)`, for retries of failed deliveries)**: Phase 4's question; added then.

### 4.12 The script: a small plain script with one connection

**(Boris, decision 11)** `src/database/migrate.ts` is the entry the task runs. It validates
`process.env` with the app's `validateEnv`, opens one `mysql2` connection from the same options the
pool uses (host, port, login, database, TLS when `DB_SSL_CA_PATH` names a bundle), logs through
`createApplicationLogger`, and calls `runMigrations`, which takes the lock, runs Drizzle's
`migrate` on that connection, counts the records before and after, logs "migrations applied: n",
and releases the lock. The connection is closed in every case; the process exits 0 on success and
1 on any error, with the error logged. It does not start Nest.

Rejected **(the Nest application context, started without its web port)**: it loads everything
the app has, and any of it failing fails the migration for a reason unrelated to the database; it
hands the script a pool sized for the app when one connection is needed; and a named lock belongs
to the connection that took it, so with a pool the lock could sit on one connection while the
files run on another. One connection makes that mistake impossible.

Files: `migrate.ts` (the entry), `run-migrations.ts` (lock, migrate, count, release),
`migration-lock.ts` (acquire and release, the error for a held lock),
`resolve-connection-options.ts` (split out of `resolve-pool-options.ts`, which spreads it and adds
the pool size), `migrations-folder.ts` (the one path, read by the script and by
`drizzle.config.ts`). `PORT` is in the environment and ignored; the settings check gives it a
default anyway.

### 4.13 Where the files live: `src/database/migrations/`

**(Boris, decision 12)** The SQL files and Drizzle's `meta/` folder (the journal and one snapshot
per file) live in `src/database/migrations/`, next to the schema, committed. `drizzle.config.ts`
at the root points `schema` at `src/database/schema/index.ts` and `out` at the folder, dialect
`mysql`, statement breakpoints on, which is what the migrator splits on. The runtime stage of the
Dockerfile copies the folder into the image at the same relative path, like the certificate
bundle, so the script finds it at `src/database/migrations` from the working directory both on a
laptop and in the container.

Rejected **(`drizzle/` at the root, the tool's default)**: a root folder named after the tool
says who wrote it, not what it is; everything about the database is under `src/database/` since
Task 2.1, and the migrations are the last piece of the same thing.

Scripts: `npm run migrate:generate -- --name <name>` writes a file from a table change;
`npm run migrate:generate -- --custom --name <name>` writes an empty file for hand-written SQL;
`npm run migrate` runs the chain against `.env` through `tsx`, after `docker compose up -d`. The
image's command runs the compiled `dist/database/migrate.js`; both run the same source.
Prettier and oxlint cover `*.ts` only, so the generated SQL and JSON are not formatted or linted.

### 4.14 Tests: the chain proven on the throwaway MySQL

**(Boris, decision 13)** `test/migrations.e2e-spec.ts`, in `npm run test:e2e`, on the MySQL that
`test/global-setup.ts` starts, in a database of its own created with the container's root login,
so the other specs' database is untouched. Four checks:

1. On an empty database the chain runs clean, the ten tables exist, and `__drizzle_migrations`
   holds five rows.
2. With the first two files applied, a store and orders with `placed_at` are inserted; the rest
   of the chain runs; every order's `placed_on` equals the day of its `placed_at`, and the column
   is `NOT NULL` in `information_schema`.
3. A second run applies nothing.
4. With a second connection holding the lock, a run exits with the lock error at once and
   `__drizzle_migrations` is unchanged.

Plus the specs with no database: unit specs for the lock and the connection options; the drift
test of §4.15; infra specs for the migration stack and the deploy role's new rights; rules in
`workflows.spec.ts` for the two new steps and their place in the job.

Rejected **(only the specs with no database; the deploy proves the chain)**: a wrong file would
be found on the dev database, after the merge, mid-deploy, the expensive place of §4.7; and the
two demonstrations of lines 367 and 368 would have nothing to run on, because the dev database has
no orders until Phase 3.

Partial runs for check 2: `runMigrations` takes the folder as a parameter, and a helper in
`test/migration-chain.ts` writes a copy of the folder holding the first n files and a journal cut
to them, so the same function runs a prefix of the chain.

### 4.15 The drift test: a table change without a migration fails the gate

**(Boris, decision 14)** `src/database/migrations-match-schema.spec.ts`, in `npm test`, reads
the latest snapshot in `meta/`, builds the current one from `src/database/schema/index.ts` with
`generateMySQLDrizzleJson`, and asks `generateMySQLMigration` for the difference, which must be
empty. The failure message says a table changed and a migration must be written. Boris's reason:
the alternative keeps it on a person.

Rejected **(review catches it)**: Task 2.2 holds the ERD to the code with a test for the same
reason, a drawing and code drift apart quietly on a long diff; the chain and the table files are
the same kind of pair, and a quiet drift here lands in the database.

Its limits, honest: one more step on every table change, running the generate script; it leans on
Drizzle's comparison, which an upgrade can change; it compares the table files with the snapshot,
not with the real database, so a hand-edited SQL file is caught by §4.14, not here, and a database
changed by hand cannot happen.

### 4.16 Phase questions: 9 and 13 here, the rest in 2.4

**(Boris, decision 15)** The questions doc answers 9 (how indexes affect write performance, on
the index of §4.11) and 13 (zero-downtime schema change, which is §4.8). Questions 5, 6, 7, 8 and
10 (ACID, isolation levels, deadlocks, locks, EXPLAIN) are about running queries and transactions,
Task 2.4's code, and are answered there, tied to it.

Rejected **(all seven here)**: answers from theory before the code that shows them exists.
Rejected **(13 only)**: file 1 adds an index by migration, and question 9 is what that costs; built
here, so answered here.

### 4.17 The task's network identity: the app's security group

**(Boris, decision 16)** The task runs under the app security group from the network stack,
imported immutable like the service does. It needs out to the database and out on 443 to pull the
image and write logs; the app's group gives both. Nothing changes in the network stack.

Rejected **(a security group of its own, with its rules and a rule on the data group to accept
it)**: the only thing the app's group allows that the task does not need is traffic in from the
load balancer, and the task listens on no port, so that rule can never carry anything; a group and
three rules more to keep in step forever, for no safety.

### 4.18 The pipeline's right to start the task: in the delivery stack

**(Boris, decision 17)** The deploy role gains, in the delivery stack where every right of the
pipeline lives: run the migration task definition, describe tasks on the cluster, pass the task's
two roles, and read the migration log group. Each scoped to the migration stack's own resources,
read from it as weak references like every other cross-stack value. Because the grant must exist
before the first run that uses it, the new deploy step deploys the delivery stack and the
migration stack together (§5.4). Boris's reason: the delivery stack already holds what GitHub may
do.

Rejected **(the grant in the migration stack, attached to the deploy role from there)**: the
delivery stack is the one place to read what GitHub may do in the account; a right in another
stack is one an audit has to know to look for.

### 4.19 Documentation

- This document, written before any code, by the build order below.
- `docs/phase-2/task-2.3-questions.md`: §1 the backward-compatible strategy (spec 370);
  §2 the seven general questions (71–77), for Drizzle; §3 phase questions 9 and 13; §4 why we
  picked what we picked.
- `README.md`: the status line; a Migrations part (writing a file, running the chain locally, how
  the deploy runs it); the first-deploy sequence under Deploying gains the migration stack before
  the delivery stack; Tearing down gains the migration stack, unprotected, removed with the app
  stack; the stack table.
- `docs/architecture.md`: the delivery path gets the two steps and the sixth stack, the stacks
  table gets its row, the "Last updated" line moves.
- `CLAUDE.md`: "Conventions from Task 2.3".
- `docs/phase-2/task-2.2-design.md` §5.1: `placed_on` in the orders entity of the ERD (§4.10).

## 5. The design

### 5.1 The chain, file by file

Files are named by `--name`; Drizzle prefixes the number.

| File | Made by | SQL | Keeps the previous image working because |
|---|---|---|---|
| `0000_create_tables` | `generate`, from the ten table files as merged in 2.2 | `CREATE TABLE` × 10, the unique indexes, the pair indexes, `ALTER TABLE … ADD CONSTRAINT` for every pointer | there is no previous image that reads these tables |
| `0001_index_orders_by_store_and_time` | `generate`, after `orders.ts` gains `index('orders_store_id_placed_at_idx').on(storeId, placedAt)` | `CREATE INDEX orders_store_id_placed_at_idx ON orders (store_id, placed_at)` | an index changes nothing a reader or writer sees |
| `0002_add_orders_placed_on` | `generate`, after `orders.ts` gains `placedOn: date('placed_on', { mode: 'string' })` after `placedAt` | `ALTER TABLE orders ADD placed_on date` | optional: an image that does not write it inserts as before |
| `0003_fill_orders_placed_on` | `generate --custom`, written by hand | `UPDATE orders SET placed_on = DATE(placed_at) WHERE placed_on IS NULL;` | changes data the previous image does not read |
| `0004_require_orders_placed_on` | `generate`, after `placedOn` gets `.notNull()` | `ALTER TABLE orders MODIFY placed_on date NOT NULL` | no image inserts orders yet; from Phase 3 every image writes it (§4.8) |

The exact SQL is what Drizzle writes; the table above says what it does. The e2e spec of §5.5
checks the effect, not the text. File 0 is shown in chat like every file, read, and committed as
written; it is never edited by hand. The drift test compares the snapshot it left with the schema.

### 5.2 The script, step by step

`node dist/database/migrate.js` in the container, `npm run migrate` on a laptop:

1. `validateEnv(process.env)`: the same check as the app's config module; a missing `DB_*` fails
   here with the same message.
2. One connection: `createConnection(resolveConnectionOptions(settings, readCaBundle))`; TLS on
   when `DB_SSL_CA_PATH` names a bundle, exactly as the pool.
3. `runMigrations(connection, MIGRATIONS_FOLDER, logger)`:
   1. `SELECT GET_LOCK(?, 0)` with the lock name; `1` continues; anything else throws
      `MigrationLockHeldError` and nothing has been touched.
   2. Count `__drizzle_migrations` (zero rows when the table does not exist yet).
   3. `migrate(drizzle({ client: connection }), { migrationsFolder })`.
   4. Count again; log `migrations applied: n` at info.
   5. `SELECT RELEASE_LOCK(?)` in a `finally`.
4. `connection.end()` in a `finally`; `process.exitCode = 0`, or `1` with the error logged at
   error level, stack included, through the app's logger and its redaction.

The lock name carries the database name, so two databases on one server do not share a lock.
Nothing in the script knows about ECS, GitHub or AWS.

### 5.3 The migration stack

`infra/lib/migration/`, built like the other stacks: `migration-stack.ts`,
`create-migration-task-definition.ts`, `create-migration-log-group.ts`,
`create-migration-outputs.ts`, each with its spec; `migrationStackId(stage)` gives
`commerce-intelligence-dev-migration`.

Props: `config`, `vpc`, `securityGroups` (the app one is used), `repository`, `database`,
`imageTag`. Resources:

- A `FargateTaskDefinition`, family `commerce-intelligence-dev-migration`, ARM64, the stage's
  `taskCpuUnits` and `taskMemoryMiB`, an execution role (pull the image, write logs, read the
  secret) and a task role (nothing), the container `migration` from
  `repository:imageTag` with `command: ['node', 'dist/database/migrate.js']`, the app's environment
  and secrets, no port mapping, the `awslogs` driver to the stack's log group with the blocking
  mode, because a migration log line must not be dropped.
- A log group `/commerce-intelligence/dev/migration`, the stage's retention, destroyed with the
  stack.
- Outputs for the run step: `TaskDefinitionArn`, `ClusterName`, `SubnetIds` (the private subnets,
  comma-separated), `SecurityGroupId`, `LogGroupName`.

What moves to be shared: the cluster name into `infra/lib/app/cluster-name.ts`
(`resolveClusterName(config)`), used by `createCluster` and by the outputs here; the container
environment and secrets out of `create-task-definition.ts` into
`infra/lib/app/resolve-container-environment.ts` and `resolve-container-secrets.ts`, used by both
task definitions. The app's task definition keeps its port mapping and non-blocking logging.

`bin/app.ts` creates the migration stack after the registry stack and before the delivery stack,
and hands the delivery stack the task definition, the two roles and the log group for the grant of
§4.18. The delivery stack reads them weakly, like it reads the repository.

### 5.4 The deploy run

`deploy.yml`, the `deploy` job, in order; **new** marks what this task adds:

1. Checkout, Node, `npm ci` in `infra`, log in with the deploy role: as today.
2. "Check that the image exists before touching any stack": as today.
3. **new** "Deploy the delivery and migration stacks": `npm run -s deploy --
   commerce-intelligence-dev-delivery commerce-intelligence-dev-migration --require-approval never
   --progress events --no-notices --outputs-file "$RUNNER_TEMP/migration-outputs.json"
   -c imageTag="$IMAGE_TAG"`. CDK deploys their dependencies first when those changed, which the
   next deploy step would do anyway. After it the task definition points at the new image and the
   deploy role holds the right to start it.
4. **new** "Run the migrations": reads the five outputs; `aws ecs run-task` on the cluster with
   the task definition, Fargate, the private subnets, the app security group, no public IP,
   `--started-by deploy-$GITHUB_RUN_ID`; polls `aws ecs describe-tasks` every ten seconds until
   `lastStatus` is `STOPPED`, bounded by the job's time limit rather than the CLI waiter's fixed
   ten minutes; prints the task's log stream from the log group; reads `containers[0].exitCode`;
   exits 1 when it is missing or not 0, which also covers a task that never started (the
   `stoppedReason` is printed). The applied count from the log goes to the summary.
5. "Deploy all stacks": as today. The migration stack is in `--all` and has nothing left to change.
6. "Check /health and /ready from outside": as today.
7. "Write the run summary": gains a `Migrations` line: `applied n`, `nothing to run`, or
   `failed`, and a link to the migration log group.

A failure in step 3 or 4 fails the job before step 5: the service keeps the old image on the old
schema. The job's `timeout-minutes` stays 45. The pull request run is unchanged: it builds no
image, starts no task and reaches no database; its `cdk diff` shows the migration stack's change
like any other.

Rules added to `workflows.spec.ts`, each red first: the two steps exist by name, in this order,
after the image check and before "Deploy all stacks"; the stack deploy names the delivery and
migration stacks and passes the tag; the run step starts a task and fails on a non-zero exit;
no job outside `deploy` runs a task.

### 5.5 The tests

| Spec | Where | Checks |
|---|---|---|
| `migrations.e2e-spec.ts` | `test/` | the four checks of §4.14 on the container, in a database of its own |
| `migrations-match-schema.spec.ts` | `src/database/` | the drift test of §4.15 |
| `migration-lock.spec.ts` | `src/database/` | `1` acquires; `0` and `NULL` throw the held error; release runs the release statement |
| `resolve-connection-options.spec.ts` | `src/database/` | the fields, TLS on with a bundle and off without; `resolve-pool-options.spec.ts` keeps covering the pool size |
| `migration-stack.spec.ts` and the `create-*.spec.ts` beside it | `infra/lib/migration/` | the family, the image, the command, no port, blocking logs, the secrets by ARN, no public IP, the outputs, no termination protection |
| `create-deploy-role.spec.ts` | `infra/lib/delivery/` | the four new rights, each scoped to the migration stack's resources and nothing wider |
| `workflows.spec.ts` | `.github/workflows/` | the rules of §5.4 |
| `erd.spec.ts` | `src/database/schema/` | unchanged; goes red when `placed_on` enters `orders.ts`, green when the drawing has it |

Helpers, in `test/`: `migration-chain.ts` (open the spec's own database with the root login;
write a prefix of the chain to a temporary folder; count applied files; read a column's
nullability from `information_schema`). `global-setup.ts` provides the root password beside the
app login. Spec files hold `beforeAll` and `it` blocks only.

## 6. Build order

One piece at a time. Each piece: show the failing spec in chat → approval → write it → run it red →
show the implementation in chat → approval → write it → run it green → run the whole gate.

1. Branch `feat/task-2.3-migrations`; this document.
2. `drizzle-kit` and `tsx` as dev dependencies; `migrations-folder.ts`; `drizzle.config.ts`; the
   two npm scripts. The drift spec, red because there is no snapshot; file 0 generated; green.
3. `resolve-connection-options.ts` split out of the pool options, spec first; `migration-lock.ts`,
   spec first; `run-migrations.ts`; `migrate.ts`.
4. `test/migration-chain.ts` and the root login in `global-setup.ts`; the e2e spec with checks 1
   and 3; green on file 0 alone.
5. File 1: the index in `orders.ts`, the drift spec red, generate, green; the e2e check for the
   index.
6. Files 2 to 4: the e2e check 2, red; `placedOn` optional in `orders.ts`, generate file 2; file 3
   by hand; `.notNull()`, generate file 4; the ERD in `task-2.2-design.md` §5.1; green.
7. The e2e check 4, the lock, red then green.
8. The Dockerfile line; `docker build .` locally; the container runs `node dist/database/migrate.js`
   against `docker compose`'s MySQL and applies the chain.
9. Infra: the shared cluster name and container settings, specs first; the migration stack and its
   pieces, specs first; `bin/app.ts`; the delivery stack's grant, spec first; `npm run infra:check`.
10. The workflow rules, red; `deploy.yml`'s two steps and the summary line; green.
11. Docs: the questions doc; the README; `docs/architecture.md`; `CLAUDE.md` "Conventions from
    Task 2.3".
12. Gate; push; the pull request; the four checks green, the diff read (a new stack, the delivery
    role's four rights, the app stack's moved environment with no change in it); merge. The deploy
    run: the two new steps green, the first chain on the dev database (five files applied), the
    service on the new image, `/ready` 200; `cdk diff` clean.

Commits happen when Boris says so.

## 7. Done when

- `npm test`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run format:check` and
  `npm run infra:check` pass; the chain runs on the throwaway MySQL with the four checks green.
- The deploy run on the merge shows "Deploy the delivery and migration stacks" and "Run the
  migrations" green, `Migrations: applied 5` in the summary, the service on the new image,
  `/health` and `/ready` 200.
- The dev database holds the ten tables, the index, `placed_on` required, and five rows in
  `__drizzle_migrations`; nobody has opened a connection to it by hand.
- A second run of the rollback button on the same tag, if ever pressed, shows `nothing to run`.
- The questions doc, the README, `docs/architecture.md`, `CLAUDE.md` and the ERD are updated.
- `cdk diff` is clean after the deploy.

## 8. Left to the builder

- The lock name's exact form, carrying the database name, under MySQL's 64-character limit.
- The polling interval and the log lines printed by the run step.
- The name of the e2e spec's own database and how the root login reaches the workers through
  `provide` and `inject`.
- The exact wording of the drift test's failure message.
- Which `information_schema` view the nullability check reads.
