# Task 2.1 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Task 2.1 asks
for one investigation, RDS against a self-managed MySQL, and the general rules ask seven
questions of the decision. Built 2026-10-28, not yet deployed. Alternatives and trade-offs are in
`task-2.1-design.md`.

## 1. RDS against a self-managed MySQL

RDS is AWS's managed database service: AWS runs the MySQL server for us. Self-managed means
MySQL on an EC2 virtual machine that we install, patch, back up, monitor and restore ourselves.

Advantages of RDS:

- Patching, backups, point-in-time recovery (restoring the database to any minute of the last
  days), encryption of the disk, a standby copy in another zone and the switch to it when the
  main one fails: all of these are settings we turn on, not work we do.
- The password is created by AWS and never written down anywhere.
- The server is a resource in our CloudFormation template, so its configuration is reviewed like
  code, and a change made by hand shows up as drift.
- A failed server is restored from a snapshot, a saved copy of the disk, with no runbook.

Limitations of RDS:

- No root access to the machine, no custom plugins, no file system; some server parameters are
  locked.
- About double the price of the same machine on EC2 (`db.t4g.micro` about 12 USD, `t4g.micro`
  about 6 USD), and an extra fee, extended support, for old major versions.
- A restart for patches inside the weekly maintenance window.
- Backups and replicas use AWS's tooling; a plain dump still works.

Self-managed wins when we need a plugin or an engine build that RDS does not ship, when a hard
cost ceiling applies, or when a team already runs MySQL. None of those hold here.

## 2. RDS for MySQL, the seven questions

- **What problem does it solve?** A database the app can rely on without anyone running a
  database. The service creates it, patches it, backs it up and restores it.
- **Why did we choose it?** The spec names Amazon RDS for MySQL. The design chose the shape: one
  `db.t4g.micro`, MySQL 8.4, one zone, in the isolated subnets, in its own stack.
- **What alternatives did we consider?** Aurora MySQL, AWS's own MySQL-compatible engine: faster
  failover and storage that grows by itself, but its smallest sizes cost several times this
  server. Self-managed MySQL on EC2, question 1. MySQL 8.0, which pays the extended-support fee
  since August 2026. Multi-AZ, a standby copy in a second zone: double the price, the production
  answer.
- **What are its limitations?** No access to the operating system; locked parameters; a restart
  in the Sunday window for patches; a micro's connection limit is around 60 to 80; `cdk diff`
  never shows the password, by design.
- **When would we choose differently?** A second environment or real traffic: Multi-AZ. Many
  tasks sharing one small server: RDS Proxy, which pools their connections. Very large or global
  data: Aurora. A plugin RDS lacks: EC2.
- **What could go wrong in production?** The password changed by hand in the console: every task
  fails to log in until the tasks restart. The server deleted: three locks stand in the way, and
  the last one takes a snapshot first. The disk fills: there is no storage autoscaling yet, so
  the server goes read-only; an alarm is Phase 6. A long outage: `/ready` answers 503, the
  balancer stops routing, ECS replaces the tasks every few minutes, nothing is lost.
  `DB_PASSWORD` put in plain environment: a test fails.
- **How does it behave under increased load?** Ten connections per task; a second task doubles
  them, still inside the micro's limit. A `t4g` runs out of CPU credits under sustained load; the
  step up is `db.t4g.small`, with a short restart. Reads scale with a read replica, writes with a
  bigger instance.

## 3. Cost

| Item                                | Per month        |
| ----------------------------------- | ---------------- |
| `db.t4g.micro`, one zone, on demand | about 12 USD     |
| 20 GiB gp3                          | about 2.5 USD    |
| Automated backups within 20 GiB     | free             |
| The secret                          | 0.40 USD         |
| **Added**                           | **about 15 USD** |
| **Environment**                     | **about 59 USD** |

The budget rose from 50 to 75 USD on 2026-10-28, with alerts at 50, 80 and 100 percent.

Ways to pay less, each with its catch:

- Sign-up credits: cover a few months, then stop.
- Reserve for a year: about a third off, on a server we may resize.
- A start/stop schedule: free while stopped, but RDS restarts a stopped server after seven
  days, and the e2e proof on every merge needs it up.
- MySQL on EC2: half the price, all the work; question 1.

## Why we picked what we picked

- **One `db.t4g.micro`, one zone, MySQL 8.4.** The spec names the product. The micro is the
  smallest size, enough for a dev store. MySQL 8.0 pays extended support since August 2026.
  Multi-AZ is one stage config value, `databaseMultiAz`.
- **The major version only, with automatic minor upgrades.** Patches apply in place, with a
  snapshot taken first. A pinned minor version fights CloudFormation once RDS moves on. CDK's
  validation finding about this is acknowledged on the construct, with the reason.
- **A fifth stack, with termination protection.** The data must survive an app deploy or a stack
  rebuild, so it lives apart from the app stack. The network stack almost never changes and
  should stay that way, so the database does not go there either.
- **Isolated subnets, the `data` group imported immutable, `publiclyAccessible: false`.** No
  route out, port 3306 open from the `app` group only, and the network stack owns every rule.
- **A `DatabaseSecret`, handed to the task by ECS as `DB_USER` and `DB_PASSWORD`.** AWS creates
  the password. The execution role, the role ECS uses to start the task, reads the secret at task
  start. The template holds only references to the secret, never the value. No new library in
  the app.
- **Rotation later.** RDS-managed rotation changes the password on a schedule; that needs the app
  to rebuild its connection pool on the fly. Phase 6.
- **The admin login for now.** A limited user needs a way to run SQL at deploy, which Task 2.3
  brings.
- **`require_secure_transport ON`, and the app verifying the CA bundle.** The server accepts
  encrypted connections only, so a wrong client setting fails loudly. The CA bundle is the public
  file that lets the app check it is talking to the real server; it is under `certs/` and copied
  into the image. TLS is off only when `DB_SSL_CA_PATH` is unset, locally and in tests.
- **Encryption with the AWS key.** Encryption of the disk is set at creation only. A key of our
  own costs a dollar a month for control nobody needs here.
- **Seven days of backups.** A Friday mistake found on Monday is still recoverable. 35 days is a
  one-line change.
- **Deletion protection plus a final snapshot.** Three locks stand between a delete command and
  the data. The README has the three-step destroy.
- **A pool of ten connections in the app, `DB_POOL_SIZE`.** A pool keeps connections open
  between requests. No pool means three handshakes per request. RDS Proxy costs more than the
  server. Five starves requests; twenty is more than a quarter vCPU drives.
- **Drizzle on mysql2.** Typed queries from Task 2.2 on top of a plain pool.
- **`/ready` runs `SELECT 1` with a 3-second limit.** The balancer stops routing to a task
  without a database, and the deploy's health step proves the connection on every merge.
- **Testcontainers for e2e, compose for dev.** Testcontainers starts one real MySQL 8.4 in Docker
  per test run, fresh every time; a fake proves nothing about SQL. Docker compose runs the same
  MySQL for local development.
- **No human path into the database yet.** A Session Manager tunnel through the NAT instance
  will be added when the need is concrete.
- **Budget 75 USD.** An alarm that fires every month on a known bill gets ignored.
