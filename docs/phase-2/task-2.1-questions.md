# Task 2.1 — Questions to investigate

Short answers. Task 2.1 asks for one investigation, RDS against a self-managed MySQL, and the
general rules ask seven questions of the decision. Built 2026-10-28, not yet deployed.
Alternatives and trade-offs are in `task-2.1-design.md`. §4 is filled after the first deploy.

## 1. RDS against a self-managed MySQL

Self-managed means MySQL on an EC2 instance we install, patch, back up, monitor and restore
ourselves.

Advantages of RDS:

- Patching, backups, point-in-time recovery, encryption at rest, a standby copy and failover are
  settings, not work.
- The password is created by AWS and never written down.
- The server is a resource in the template; drift and configuration are reviewed like code.
- A failed instance is restored from a snapshot with no runbook.

Limitations of RDS:

- No root on the box, no custom plugins, no file system; some parameters are locked.
- About double the price of the same machine on EC2 (`db.t4g.micro` about 12 USD, `t4g.micro`
  about 6 USD), and an extended-support fee on old majors.
- A restart for patches inside the weekly maintenance window.
- Backups and replicas use AWS's tooling; a plain dump still works.

Self-managed wins when a plugin or engine build RDS does not ship is needed, a hard cost ceiling
applies, or a team already runs MySQL. None of those hold here.

## 2. RDS for MySQL, the seven questions

- **Problem**: a database the app can rely on without anyone running a database. Created,
  patched, backed up and restored by the service.
- **Why**: the spec names Amazon RDS for MySQL. The design chose the shape: one `db.t4g.micro`,
  MySQL 8.4, one zone, in the isolated subnets, in its own stack.
- **Alternatives**: Aurora MySQL (faster failover, storage that grows itself; its smallest sizes
  cost several times this server); self-managed MySQL on EC2 (§1); MySQL 8.0 (extended-support
  fee since August 2026); Multi-AZ (double the price, the production answer).
- **Limitations**: no OS access; locked parameters; a restart in the Sunday window for patches; a
  micro's connection limit around 60 to 80; the diff never shows the password, by design.
- **When differently**: a second environment or real traffic: Multi-AZ. Many tasks sharing one
  small server: RDS Proxy. Very large or global data: Aurora. A plugin RDS lacks: EC2.
- **What could go wrong**: the password changed by hand in the console: every task fails to log
  in until the tasks restart. The server deleted: three locks stand in the way and the last one
  takes a snapshot. The disk fills: no autoscaling yet, the server goes read-only; an alarm is
  Phase 6. A long outage: `/ready` is 503, the balancer stops routing, ECS replaces tasks every
  few minutes, nothing is lost. `DB_PASSWORD` in plain environment: a test fails.
- **Under load**: ten connections per task; a second task doubles them, inside the micro's
  limit. A `t4g` runs out of CPU credits under sustained load; the step up is `db.t4g.small`
  with a short restart. Reads scale with a replica, writes with a bigger instance.

## 3. Cost

| Item                                | Per month        |
| ----------------------------------- | ---------------- |
| `db.t4g.micro`, one zone, on demand | about 12 USD     |
| 20 GiB gp3                          | about 2.5 USD    |
| Automated backups within 20 GiB     | free             |
| The secret                          | 0.40 USD         |
| **Added**                           | **about 15 USD** |
| **Environment**                     | **about 59 USD** |

The budget rose from 50 to 75 USD on 2026-10-28, alerts at 50, 80 and 100 percent.

Ways to pay less, each with its catch:

- Sign-up credits: cover a few months, then stop.
- Reserve for a year: about a third off, on a server we may resize.
- A start/stop schedule: free while stopped, but RDS restarts a stopped server after seven
  days, and the e2e proof on every merge needs it up.
- MySQL on EC2: half the price, all the work (§1).

## 4. What the first deploy showed

Written after the first deploy.

## Why we picked what we picked

- **One `db.t4g.micro`, one zone, MySQL 8.4**: the spec names the product; the smallest size for
  a dev store; 8.0 pays extended support since August 2026. Multi-AZ is one stage config value,
  `databaseMultiAz`.
- **Major version only, automatic minor upgrades**: patches apply in place with a snapshot
  first; a pinned minor fights CloudFormation once RDS moves on. The validation finding is
  acknowledged on the construct.
- **A fifth stack with termination protection**: the data must survive an app deploy or a stack
  rebuild; the network stack almost never changes and should stay that way.
- **Isolated subnets, the `data` group imported immutable, `publiclyAccessible: false`**: no
  route out, 3306 from `app` only; the network stack owns every rule.
- **`DatabaseSecret`, injected by ECS as `DB_USER` and `DB_PASSWORD`**: AWS creates the
  password, the execution role reads it at task start, the template holds dynamic references.
  No new library in the app.
- **Rotation later**: RDS-managed rotation needs the app to rebuild its pool on the fly.
  Phase 6.
- **Admin login for now**: a limited user needs a way to run SQL at deploy, which Task 2.3
  brings.
- **`require_secure_transport ON`, and the app verifying the CA bundle**: a wrong client setting
  fails loudly; the bundle is a public file under `certs/`, copied into the image; TLS is off
  only when `DB_SSL_CA_PATH` is unset, locally and in tests.
- **Encryption with the AWS key**: set at creation only; our own key costs a dollar a month for
  control nobody needs here.
- **Seven days of backups**: a Friday mistake found on Monday is still recoverable; 35 days is a
  one-line change.
- **Deletion protection plus a final snapshot**: three locks between a command and the data; the
  README has the three-step destroy.
- **A pool of ten in the app, `DB_POOL_SIZE`**: no pool means three handshakes per request; RDS
  Proxy costs more than the server; five starves requests; twenty is more than a quarter vCPU
  drives.
- **Drizzle on mysql2**: typed queries from Task 2.2 on a plain pool.
- **`/ready` runs `SELECT 1` with a 3-second limit**: the balancer stops routing to a task
  without a database; the deploy's health step proves the connection on every merge.
- **Testcontainers for e2e, compose for dev**: one real MySQL 8.4 per test run, fresh every
  time; a fake proves nothing about SQL.
- **No human path into the database yet**: a Session Manager tunnel through the NAT instance
  when the need is concrete.
- **Budget 75 USD**: an alarm that fires every month on a known bill gets ignored.
