# Task 2.1 — Add AWS RDS: Design

**Date:** 2026-10-25
**Branch:** `feat/task-2.1-aws-rds`
**Status:** design agreed in chat on 2026-10-25; not yet built.
**Spec:** `docs/Boris-ing.md`, section 4, Task 2.1 (lines 297–312); phase deliverables and
acceptance criteria at lines 406–421.

This document records what was decided for Task 2.1 and why. A builder should be able to implement
from it without going back to the author. Every decision in it was taken by Boris in chat and is
marked **(Boris)**; the alternatives he rejected are given with each. The mechanical details left
open on purpose are listed in §7, and every file is shown in chat before it is written.

---

## 1. Intent

Phase 1 ended with an API that answers but remembers nothing. Task 2.1 gives it a database: one
managed MySQL 8.4 server in the isolated subnets built for it in Task 1.2, reachable from the
application containers and from nothing else. The password is created by AWS, kept in Secrets
Manager and handed to the container by ECS when the task starts; it is never written down anywhere
else. The server refuses unencrypted connections. The application keeps a pool of ten connections
through the `mysql2` driver with Drizzle on top, reports the database in `/ready`, and the deploy
workflow's existing health step therefore proves the connection after every merge.

The server lives in a fifth stack, `commerce-intelligence-dev-data`, with termination protection,
deletion protection and a final snapshot, so that no deploy of the app stack and no mistaken
`destroy` can take the data with it. The stack is deployed by the pipeline like every other one.

Tests run against a real MySQL 8.4 that the test suite starts and throws away itself; local
development gets one from a compose file. Tables, migrations and queries are Tasks 2.2 to 2.4 and
build on this connection.

The companion `task-2.1-questions.md` answers the spec's investigation, RDS against a self-managed
MySQL, the seven general questions for RDS for MySQL as the technology decision, and the reasons
behind every decision here.

## 2. Goals, non-goals, anti-goals

**Goals**

- Every requirement of spec lines 299–310 traced to a decision (§4.1).
- A fifth stack holding one `db.t4g.micro` MySQL 8.4 server in the isolated subnets, inside the
  `data` security group, deployed by the pipeline (§4.2, §4.3).
- The password created by CDK in Secrets Manager and injected by ECS; no person and no file ever
  holds it (§4.4).
- TLS enforced by the server and verified by the app; the app logs in as the admin user for now
  (§4.5).
- Encryption at rest, seven days of backups, deletion protection, a final snapshot (§4.6).
- A pool of ten connections per task, sized by an environment variable, Drizzle on top (§4.7).
- `/ready` reports the database on every call; the deploy's health check proves the connection
  (§4.8).
- E2E tests on a real MySQL 8.4 through Testcontainers; a compose file for `npm run dev` (§4.9).
- The cost known and the budget raised; README, `architecture.md`, `CLAUDE.md` and the questions
  doc updated (§4.11, §4.12).

**Non-goals** (later)

- Tables, the ERD, migrations, queries: Tasks 2.2, 2.3 and 2.4.
- Password rotation: Phase 6, security hardening, together with the app-side handling it needs
  (§4.4).
- A separate application user with limited rights: when Task 2.3 gives the pipeline a way to run
  SQL at deploy (§4.5).
- A path for a person into the database, a Session Manager tunnel through the NAT instance: when
  the need is concrete, Task 2.3 or 2.4 (§4.10).
- RDS logs to CloudWatch (error log, slow query log) and Performance Insights: Task 2.4, with the
  query analysis.
- Storage autoscaling and alarms on the server: Phase 6, observability.
- Multi-AZ, a read replica, RDS Proxy, IAM database login: when a second environment or more
  than a few tasks exist (§4.2, §4.4, §4.7).
- A start/stop schedule for the dev server: a Phase 6 cost idea.

**Anti-goals**

- A password in a file, a variable, a stage config, a log line, an output or a template.
- A database reachable from outside the VPC, or from anything but the `app` security group.
- A server that accepts an unencrypted connection.
- A database deleted or replaced by a deploy of the app stack, or by a single mistaken command.
- A schema created or changed by hand in the console, or by the running application at boot.
- A test that passes without a database.

## 3. Constraints

| Constraint | Value |
|---|---|
| Account, region, profile | As before: `eu-north-1`, `AWS_PROFILE=ci-admin` for the hand steps, no access keys |
| Environment | Four stacks deployed, `cdk diff` clean; the service runs image tag `8cef26b…`, the tip of `main`, because every merge deploys, docs-only ones too |
| Network, from 1.2 | Isolated subnets `10.0.64.0/24` and `10.0.65.0/24` with no route out; the `data` group accepts TCP 3306 from `app` and allows nothing out; `app` allows TCP 3306 to `data` and TCP 443 anywhere |
| CDK | `aws-cdk-lib` 2.273.0, CLI 2.1145.0, unchanged. `MysqlEngineVersion` lists only 8.4 minors, so the major-only version is `MysqlEngineVersion.of('8.4', '8.4')`. `storageEncrypted` and `deletionProtection` default to off without a key or a retain policy, so both are set explicitly |
| CloudFormation | A version prefix in `EngineVersion` is prefix-matched during drift detection, so `8.4` stays clean after automatic patches |
| App | NestJS 12, ESM, Zod-validated environment, terminus; `/ready` has no indicators today; e2e specs boot the whole app through `createTestApp()` with the env file ignored |
| Pipeline | The deploy job allows 45 minutes; RDS takes 10 to 15 to create a server. Runners have Docker |
| Budget | 50 USD a month, set by hand in the console on 2026-10-18; the bill is about 44 USD |
| Decided earlier, not reopened | The isolated tier is the database's (1.2); the network stack owns every security group rule and other stacks import groups immutable (1.3); weak references between stacks (1.3); termination protection on stacks that hold state (1.4); a secret is created by AWS and referenced by ARN (1.4); every stack is deployed by the pipeline (1.5) |
| Process | TDD, every file shown before it is written, decisions one at a time |

## 4. Decisions

### 4.1 The spec traced

| Requirement (lines 299–312) | Where |
|---|---|
| Use IaC to provision Amazon RDS for MySQL | the data stack, CDK (§4.2) |
| Deploy RDS into private subnets | the isolated tier (§4.3) |
| Configure appropriate security groups | the `data` group from 1.2, imported immutable (§4.3) |
| Allow connections only from authorized application components | `data` accepts 3306 from `app` only; `publiclyAccessible: false` (§4.3) |
| Configure database credentials securely | Secrets Manager, ECS injection (§4.4) |
| Enable appropriate encryption at rest | `storageEncrypted: true`, AWS's key (§4.6) |
| Configure automated backups | seven days, point-in-time recovery (§4.6) |
| Connect the NestJS backend to RDS | `DatabaseModule`, TLS, `/ready` (§4.5, §4.7, §4.8) |
| Manage connection pooling | `mysql2` pool of ten per task (§4.7) |
| Investigate RDS against self-managed MySQL | questions doc §1 |

Acceptance (lines 417–421): "the application connects securely to RDS" is TLS (§4.5) plus the
injected secret (§4.4), proven from outside by `/ready` in the deploy workflow (§4.8). The rest of
the acceptance line, migrations through the deployment process, is Task 2.3.

### 4.2 The server and its stack

**(Boris, decision 1)** One server in one zone, `db.t4g.micro`, MySQL 8.4. The spec names the
product, "Amazon RDS for MySQL" (line 299), so the engine was not a choice; Aurora appears in the
questions doc as the alternative only.

- `multiAz: false`, driven by a new stage config field `databaseMultiAz`, so a production stage
  turns on the standby copy with one value.
- Instance type `t4g.micro` from the stage config field `databaseInstanceType`, written the way
  `natInstanceType` is; CDK adds the `db.` prefix.
- Engine `MysqlEngineVersion.of('8.4', '8.4')`: the template names the major version only.
  **(Boris, decision 9a)** `autoMinorVersionUpgrade: true`: RDS installs 8.4 patch releases in a
  weekly maintenance window, Sunday 03:00–04:00 UTC, with a restart of a few minutes. CloudFormation
  prefix-matches `8.4` during drift detection, so `npm run drift` stays clean afterwards.
- Storage: 20 GiB of gp3, the minimum, from the stage config field `databaseAllocatedStorageGiB`.
  No storage autoscaling (non-goal).

Rejected **(1a)**: Multi-AZ. Roughly double the price for a dev environment whose only user is us;
the same reasoning gave Phase 1 one NAT instance and one task. Rejected **(1b)**: `db.t4g.small`.
Twice the price for memory a few dev stores do not need; moving up later is a setting change and a
short restart. Rejected **(1c)**: MySQL 8.0. Its standard support on RDS ended on 2026-07-31; since
August every 8.0 server pays an extended-support fee per hour on top of the normal price.
Rejected **(9a)**: a pinned patch version. The NAT image is pinned because a new image replaces the
machine and reruns its boot script; a MySQL patch is applied in place with a snapshot taken first,
and pinning would make us the patch team. A pinned minor also fights CloudFormation: once RDS has
moved on, the next unrelated change would try to send the old version back.

**(Boris, decision 2)** A fifth stack, `commerce-intelligence-dev-data`, with
`terminationProtection: true`. In Boris's words: "just like the other stacks, when we change
something all the other things will not get changes." It holds the parameter group (§4.5), the
server, its secret (§4.4) and its outputs. It reads the VPC and the `data` security group from the
network stack through weak references, the way the app stack does; the app stack reads the
server's address, port, database name and secret from it. `bin/app.ts` creates it after the network
stack and before the app stack.

Rejected **(b)**: inside the network stack, which is the ground everything stands on and almost
never changes; every database change would then touch the stack that holds the VPC. Rejected
**(c)**: inside the app stack, which is redeployed on every merge and carries no termination
protection on purpose because nothing in it holds state; the database is the one thing that must
survive a bad deploy or a stack rebuild.

### 4.3 Placement and network

Mechanics that follow from 1.2 and 1.3; nothing new was decided.

- `vpcSubnets: { subnetType: PRIVATE_ISOLATED }`: CDK builds a DB subnet group over the two isolated
  subnets. No route leads out of them in either direction.
- `securityGroups: [the data group]`, imported with `mutable: false` like the app stack's imports,
  so the data stack adds no rule and the network stack stays the only owner of rules. The import
  helper that today sits at the bottom of `app-stack.ts` gains a second user and moves to its own
  module, `infra/lib/network/import-immutable-security-group.ts`, as the rule in `CLAUDE.md`
  says.
- `MYSQL_PORT` moves from `perimeter-security-groups.ts` to `ports.ts`, as the comment there has
  said since 1.2; the server listens on it.
- `publiclyAccessible: false`, stated even though the isolated subnets make it moot, so the
  template says what the spec asks.
- Outputs: `DatabaseHost`, `DatabasePort`, `DatabaseSecretArn`. The ARN names the secret; it
  never carries the value.

### 4.4 The password

**(Boris, decision 3a: rotation later; 3b: ECS hands it over)**

- A `DatabaseSecret` for the user `admin`, handed to the server with `Credentials.fromSecret`. CDK
  creates it in Secrets Manager at deploy with a generated password, encrypted with the AWS-managed
  Secrets Manager key, and attaches it to the server, so the secret's JSON also carries the host,
  port and database name. The template refers to the username and the password with dynamic
  references; `cdk diff` shows the references, never the values. About 0.40 USD a month.
- The ECS task definition gets `DB_USER` and `DB_PASSWORD` as `secrets`, each
  `ecs.Secret.fromSecretsManager(secret, field)`; CDK grants the task execution role
  `secretsmanager:GetSecretValue` on that one secret and nothing else. ECS reads the secret when the
  task starts, over HTTPS through the NAT, the egress rule the `app` group already has, and places
  the two values in the container's environment. `DB_HOST`, `DB_PORT` and `DB_NAME` are plain
  environment, read from the data stack. The task role, the one the application uses, gets no
  permission on the secret.
- The app reads the five values the way it reads everything, through the Zod-validated
  environment (§4.7). The CDK flag `manageMasterUserPassword`, which would let RDS own and rotate the
  password, is not used: it turns on a seven-day rotation that a running task cannot follow.
- Rotation in Phase 6 will need one of two things, recorded here so that phase can start from it:
  the app re-reading the secret and rebuilding its pool when a login fails, or injection kept as
  it is with a restart of the tasks after each rotation.

Rejected **(3a now)**: RDS-managed rotation now. One flag on the server, but it forces the app to
re-read the secret and rebuild its pool on the fly, or to live with a self-healing outage of a few
minutes each week when the pool's old connections die; that is app code that belongs with the
hardening phase. Rejected **(3b, the app reads Secrets Manager itself)**: a new AWS library and a
second way of configuring the app, doing the job ECS does with zero code. Rejected **(3b, IAM login
tokens)**: no password at all, the strongest option, but it needs TLS, a fresh fifteen-minute token
per connection and a pool that understands a changing password; Phase 6 material.

### 4.5 The connection

**(Boris, decision 4a)** The app logs in as the admin user, the one RDS creates with the server. A
separate user with only the rights the app needs comes when Task 2.3 gives the pipeline a way to
run SQL at deploy. Rejected **(4a now)**: creating that user today means either a hand in the
console, the thing the spec says we must not need, or a Lambda inside the VPC built to run one
statement.

**(Boris, decision 4b)** Encryption on the wire is required by the server and verified by the app.

- A DB parameter group for the family `mysql8.4` with `require_secure_transport = ON`. It is a
  dynamic parameter: no reboot. A plain connection is refused by the server, so a wrong client
  setting fails loudly instead of silently downgrading.
- `caCertificate: CaCertificate.RDS_CA_RSA2048_G1`, set explicitly so a change of AWS's default
  never alters the server by surprise. It is valid until 2061.
- The app verifies the server's certificate: `mysql2` is given `ssl: { ca, rejectUnauthorized:
  true }`, where `ca` is AWS's published certificate bundle for the region,
  `eu-north-1-bundle.pem`, committed to the repository under `certs/` and copied into the runtime
  image. Its path reaches the app as `DB_SSL_CA_PATH`, set by the task definition. When the variable
  is unset, the app connects without TLS: that is the local container and the tests, where the
  server has only a self-signed certificate. Against RDS an unset variable is refused by the server.
- The bundle is committed rather than downloaded at image build so the build has no network
  dependency and a change of bundle is a reviewed diff. It is a public certificate, not a secret.

Rejected **(optional TLS)**: the app encrypts, the server also accepts plain; a wrong setting goes
unnoticed. Rejected **(off)**: inside the VPC only, but the spec asks for production-style controls
throughout, and the Phase 6 login tokens require TLS anyway.

### 4.6 Protecting the data

**(Boris, decision 5a)** `storageEncrypted: true` with no key named, so RDS uses the AWS-managed key
`aws/rds`. CDK's default without a key is unencrypted, so the flag is explicit and the spec asserts
it. Encryption at rest can only be set at creation, never after. Rejected **(our own KMS key)**: a
dollar a month for control nobody needs here; Phase 3 brings our own key for the Shopify tokens,
where that control is the point.

**(Boris, decision 5b)** `backupRetention: Duration.days(7)`, driven by the stage config field
`databaseBackupRetentionDays`, with a backup window at night in UTC before the maintenance window.
Point-in-time recovery to any minute inside the seven days comes with it. Backup storage is free up
to the disk's size. Rejected **(1 day)**: a bad migration deployed on Friday is found on Monday, when
the good copy is gone. Rejected **(35 days)**: free, but nobody restores a dev database to a month
ago, and it is a one-line change.

**(Boris, decision 5c)** `deletionProtection: true` and `removalPolicy: RemovalPolicy.SNAPSHOT`,
with `copyTagsToSnapshot: true`. Three locks stand between a command and the data: the stack's
termination protection, the server's deletion protection, and the final snapshot taken if both are
turned off and the server is deleted anyway. A planned destroy is three steps, documented in the
README's "Tearing down": protection off on the stack, a deploy that turns deletion protection off,
then `destroy`. Rejected **(retain)**: an orphaned server costing 12 USD a month with CDK no longer
aware of it. Rejected **(destroy)**: one change that forces a replacement, and the data is gone.

### 4.7 The pool and the module

**(Boris, decision 7a: in the app; 7b: ten per task)**

- `mysql2`'s `createPool` inside the application. `connectionLimit` comes from `DB_POOL_SIZE`,
  default 10, set by the task definition from the stage config field `databasePoolSize`; a stage
  changes it without a code change. The pool opens connections lazily, so the process boots
  without the database and `/ready` tells the truth about it (§4.8).
- Drizzle sits on the pool: `drizzle({ client: pool })` from `drizzle-orm/mysql2`, with no table
  definitions yet; Task 2.2 adds them. Drizzle's migration tool, `drizzle-kit`, arrives with Task
  2.3, not here.
- A `DatabaseModule` under `src/database/` builds the pool from the environment, provides the
  pool and the Drizzle instance under injection tokens, and closes the pool on application
  shutdown. The pool options are built by one pure function from the validated environment, so
  they are unit-tested without a database.
- New variables in `env.schema.ts` and `.env.example`: `DB_HOST`, `DB_PORT` (default 3306),
  `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_POOL_SIZE` (default 10), `DB_SSL_CA_PATH` (optional).
  The database name, `commerce_intelligence`, is a constant in the data stack, passed to the app
  stack; it is not environment-specific.

Rejected **(RDS Proxy)**: about 22 USD a month, more than the server, for a benefit that appears
when many tasks or Lambdas share one small database or when failover time matters. Rejected **(no
pool)**: three handshakes per request, and a burst could run past the micro's connection limit,
on the order of 60 to 80. Rejected **(5)**: a few slow queries hold all five and every other
request waits for a connection rather than for the database. Rejected **(20)**: a quarter of a vCPU
cannot drive twenty queries at once, and two tasks would hold forty connections for nothing.

### 4.8 Readiness

**(Boris, decision 8a)** `/ready` checks the database on every call. Terminus ships no Drizzle
indicator, so a `DatabaseHealthIndicator` built on terminus's `HealthIndicatorService` runs
`SELECT 1` through the pool with a timeout shorter than the balancer's five seconds, and reports
`database` as up or down. `/health` stays as it is: liveness is about the process.

What follows: the balancer stops routing to a task whose database is unreachable; after three
failures ECS replaces the task; a deploy whose new task never becomes healthy rolls back, as it
does today. While the database is down for long, ECS replaces the task every couple of minutes;
nothing is lost, and the alternative is serving errors. The deploy workflow's health step, which
already calls `/ready` from outside, now proves the connection end to end on every merge; the
run summary shows it.

Rejected **(startup only)**: a database that dies after boot keeps receiving traffic, every request
a 500 while the balancer says healthy. Rejected **(not at all)**: the acceptance line is "connects
securely to RDS", and the existing health step is the natural proof.

### 4.9 Tests and local development

**(Boris, decision 8b)** E2E tests run against a real MySQL 8.4 that the suite starts itself with
Testcontainers (`@testcontainers/mysql`, image `mysql:8.4`), once per run in the e2e config's
global setup, and removes when the run ends. Every run gets a fresh, empty database, which is what
the constraint and transaction tests of Task 2.4 will need. The same `npm run test:e2e` works on a
laptop and on the GitHub runner; no workflow changes. Docker must be running for the e2e suite;
the README says so. The image pull adds some seconds to the app job's first run on a runner.

- The health e2e spec expects `/ready` to report `database: { status: 'up' }`.
- A second readiness case boots the app against a closed port and expects 503, proving that the
  indicator fails fast rather than hanging.
- Unit specs boot nothing, as before: the pool options from the environment, the indicator with a
  fake query function, the stage config, and the CDK templates: the data stack's subnets, group,
  no public access, encryption, retention, deletion protection, snapshot policy, engine version
  `8.4`, automatic minor upgrades, maintenance window, the parameter, the CA, the port, the storage,
  the instance class, the outputs; the app stack's two secrets referencing the secret, the three
  plain variables, and no `DB_PASSWORD` among the plain environment.

Rejected **(a GitHub Actions service container plus a compose file)**: two ways to start the same
database that drift apart, and a test command that only works after someone remembered to start
it. Rejected **(a fake in place of Drizzle)**: proves nothing about SQL, indexes or constraints,
which is exactly what the database tests are for.

**(Boris, decision 8c)** `docker-compose.yml` at the repository root with `mysql:8.4`, a named
volume so local data survives restarts, port 3306 on localhost, and dev-only credentials that
`.env.example` mirrors. They are not secrets: they open a database that listens on the developer's
own machine. `npm run dev` is preceded by `docker compose up -d`; the README's Run section says so.
Rejected **(a `docker run` one-liner in the README)**: ten flags nobody remembers; the compose
file is the same thing written down once.

### 4.10 No path for a person yet

**(Boris, decision 9b)** No way into the database from outside the VPC in 2.1. The app and, from
Task 2.3, the migration task are its only clients, which is spec line 305. Boris: "I will need to
see the rows and the db, but later."

What it will be when the need comes, recorded so 2.3 or 2.4 can pick it up: Session Manager port
forwarding through the NAT instance, which already runs the agent. The NAT's role gets the SSM
managed policy; the NAT's group gets an egress rule to `data` on 3306 and `data` an ingress rule
from it; one laptop command opens a local port to the server, with no open ports, no keys and every
session logged.

Rejected **(the tunnel now)**: a human path into the database is a security decision to take when
the need is concrete, when the questions doc can point at what had to be seen rather than say "in
case". Rejected **(a bastion host)**: a machine idling at 3 to 4 USD a month for a job the NAT
instance can do for nothing.

### 4.11 Cost

| Item | Per month |
|---|---|
| `db.t4g.micro`, one zone, on demand | about 12 USD |
| 20 GiB gp3 | about 2.5 USD |
| Automated backups within 20 GiB | free |
| The secret | 0.40 USD |
| **Added** | **about 15 USD** |
| **Environment** | **about 59 USD** |

**(Boris, decision 9c)** The budget rises from 50 to 75 USD a month, by hand in the console where
it was created, with the alerts kept at 50, 80 and 100 percent. Rejected **(leave it at 50)**: an
alarm that fires every month on a known bill is one we learn to ignore.

Ways to pay less than this, each with its catch, are in the questions doc: sign-up credits,
reserving the server for a year, a start/stop schedule, running MySQL ourselves.

### 4.12 Documentation

- README: Requirements (Docker also for the e2e suite and the local database); Run (`docker compose
  up -d` first); Checks (Docker needed for e2e); Configuration (the seven `DB_*` variables);
  Endpoints (`/ready` reports the database); Infrastructure (five stacks, the cost table, the order);
  Tearing down (the three steps for the data stack); Layout (`infra/lib/data/`, `src/database/`,
  `certs/`, `docker-compose.yml`); Documentation (the 2.1 docs).
- `docs/architecture.md`: a new section for the data path, the server, the secret, TLS and the
  pool, drawn like the others; the stacks table gains the data stack; "Last updated: 2026-10-25,
  Task 2.1".
- `CLAUDE.md`: "Conventions from Task 2.1".
- `docs/phase-2/task-2.1-questions.md`: RDS against self-managed MySQL (the spec's investigation),
  the seven general questions for RDS for MySQL, what the first deploy showed, and "Why we picked
  what we picked".

## 5. Build order

One piece at a time. Each piece: show the failing test in chat → approval → write it → run it red →
show the implementation in chat → approval → write it → run it green → run the whole gate.

1. Branch; this document. The `architecture.md` move with its fixed links is its own commit,
   when Boris asks for it.
2. `MYSQL_PORT` to `ports.ts`; the immutable import helper to its own module; the app stack
   using both; specs. `npm run infra:check` green.
3. The stage config fields (`databaseInstanceType`, `databaseAllocatedStorageGiB`,
   `databaseBackupRetentionDays`, `databaseMultiAz`, `databasePoolSize`), spec first.
4. The data stack: fixtures (`createDataStack`, `synthesizeDataStack`), the parameter group, the
   server, the outputs, the stack, `bin/app.ts`, each with its spec. `npm run infra:check` green.
5. The app stack: the task definition's three plain variables, the two secrets and
   `DB_SSL_CA_PATH`, spec first. Boris logs in; `npm run diff -- -c imageTag=<deployed sha>` read in
   chat: one new stack, the app stack's task definition changed, the network stack gains the three
   outputs the data stack reads, registry and delivery unchanged.
6. The app: `env.schema.ts` and `.env.example`; `src/database/` (pool options, module, tokens);
   the health indicator and `/ready`; unit specs. Root gate green with the e2e suite still on
   today's expectations, which now needs step 7 to pass.
7. The tests' database: `@testcontainers/mysql`, the e2e global setup, the health spec's new
   expectations, the closed-port case. `docker-compose.yml`; the README's Run section. Root gate
   green.
8. The certificate bundle: `certs/eu-north-1-bundle.pem` from AWS's truststore (the download is
   asked for in chat first), the Dockerfile's `COPY`, a local `docker build` to see it land.
9. Docs: README, `architecture.md`, `CLAUDE.md`, the questions doc without the deploy section.
10. Boris raises the budget to 75. Push; open the pull request; the four checks green; the diff
    comment shows the new stack and the task definition change. Merge. The deploy run watched in
    chat: the data stack's 10 to 15 minutes, then the app stack; `/ready` 200 with the database up;
    `npm run diff` and `npm run drift` clean.
11. Follow-up: the questions doc's "what the first deploy showed" section.

Commits happen when Boris says so.

## 6. Done when

- `npm test`, `npm run test:e2e` (with Docker running), `npm run typecheck`, `npm run lint`,
  `npm run format:check` and `npm run infra:check` pass locally; the infra gate with no AWS session.
- Five stacks deployed; `describe-stacks` shows protection on for network, registry, delivery and
  data, off for app; `cdk diff` and `cdk drift` report nothing.
- `describe-db-instances` shows `db.t4g.micro`, a `8.4.x` engine, not publicly accessible,
  storage encrypted, seven days of backups, deletion protection on, automatic minor upgrades on,
  the parameter group, the `rds-ca-rsa2048-g1` certificate, the isolated subnet group and the
  `data` group.
- `/ready` from outside answers 200 with `database: { status: 'up' }`; the run summary shows it.
- The secret exists in Secrets Manager; its value appears nowhere in git, in `cdk.out`, in the
  stack outputs or in the logs.
- The budget is 75 USD; the cost table in the README matches §4.11.
- README, `architecture.md` and `CLAUDE.md` describe the database; the questions doc exists.

## 7. Left to the builder

- The exact `it` names, the injection token names, the file names inside `src/database/` and
  `infra/lib/data/`.
- Pool details: connect timeout, idle timeout below MySQL's `wait_timeout`, queue limit, keep-alive.
- The readiness query's timeout, under the balancer's five seconds.
- The exact minutes of the backup and maintenance windows, at night in UTC, not overlapping.
- How the e2e global setup hands the container's address to the test workers.
- The compose file's volume name and health check; the dev-only credential values.
