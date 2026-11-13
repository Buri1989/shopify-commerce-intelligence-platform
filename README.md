# Commerce Intelligence

Multi-tenant Shopify app backend: NestJS 12, TypeScript, MySQL, AWS. Built phase by
phase as a backend engineering training assignment. The assignment is in
`docs/Boris-ing.md`; each task has a design doc and a questions doc under `docs/phase-N/`.

**Status:** Phase 3 in progress. Task 3.1 built: the Shopify install with the authorization code grant and its checks, expiring offline keys refreshed under a row lock, reinstall and uninstall, and the secrets stack.

## Requirements

- Node 24 (`.nvmrc`) and npm
- Docker, for the container image, the e2e suite and the local database

## Setup

```bash
npm ci
cp .env.example .env
```

## Run

Start the local database first:

```bash
docker compose up -d
```

It runs MySQL 8.4 from `docker-compose.yml` with the dev-only login that `.env.example` carries.
`docker compose down` stops it and keeps the data in its named volume; `docker compose down -v`
deletes the data too.

```bash
npm run dev          # watch mode, human-readable logs
npm run start:dev    # watch mode, raw JSON logs
npm run build && npm run start:prod
```

Then `curl localhost:3000/health` and `curl localhost:3000/ready`; `/ready` reports the
database.

## Migrations

The tables are written in `src/database/schema/`; the database learns about them through the
numbered SQL files in `src/database/migrations/`, applied in order, each recorded in the
`__drizzle_migrations` table. Ten files so far: the ten tables, the index on
`orders (store_id, placed_at)`, the `orders.placed_on` column, its fill from `placed_at`, its
tightening to `NOT NULL`, the indexes on `orders (store_id, financial_status, placed_at)` and
`products (store_id, status)`, the `store_credentials` columns `refresh_token` and
`refresh_token_expires_at`, and their tightening to `NOT NULL` together with `expires_at`.

**Writing a file.** Change the table files, then:

```bash
npm run migrate:generate -- --name <what_changed>
```

drizzle-kit compares the table files with its last snapshot under `migrations/meta/` and writes
the difference as `NNNN_<what_changed>.sql`; read the SQL before committing it. A file that changes
rows rather than tables, such as a fill, is written by hand into an empty file:

```bash
npm run migrate:generate -- --custom --name <what_changed>
```

One change per file, forward only, no undo files. Every file keeps the previous image working: add
first, remove in a later deploy, and make a column required only once every running version writes
it; the strategy is in `docs/phase-2/task-2.3-questions.md` §1. A table change without a migration
fails `npm test`.

**Running the chain locally.** With the compose database up:

```bash
npm run migrate
```

The script reads `.env`, opens one connection, takes the MySQL named lock
`migrations:<DB_NAME>` and applies the files the database has not seen. It logs
`migrations applied: N` and exits 1 on a failure, or at once when another run holds the lock. The
e2e suite runs the whole chain on its own MySQL on every `npm run test:e2e`.

**In the deploy.** The deploy run deploys the delivery and migration stacks first, so the migration
task definition names the new image, then starts that task in the private subnets, waits for it to
stop, prints its log, and fails the run if the task exited with anything but 0. Only then does it
deploy the app stack and move the service; a failed migration leaves the old image serving. The
same image runs the migration and the service: `node dist/database/migrate.js` on a one-off task of
the migration stack. The run summary's `Migrations` row says `applied N`, `nothing to run` or
`failed`, with a link to the migration log group `/commerce-intelligence/dev/migration`. A rollback
runs the older image's chain too; it finds nothing new and exits 0.

## Checks

```bash
npm test                   # unit tests
npm run test:e2e           # e2e tests over HTTP; Docker must be running
npm run typecheck          # tsc --noEmit; npm test does not type-check
npm run lint
npm run format             # writes
npm run format:check       # what CI runs: fails on an unformatted file, writes nothing
npm run analyze:queries    # by hand, not part of the gate; Docker must be running
```

The e2e suite starts its own MySQL 8.4 container with Testcontainers, once per run, fresh and
empty, and removes it when the run ends. The first run pulls the image. The same command works on
a laptop and on the GitHub runner.

`npm run analyze:queries` starts its own MySQL 8.4 container, fills about 100,000 made-up orders and
20,000 products, prints `EXPLAIN ANALYZE` for each list query with and without the new index, and
removes the container. The results are in `docs/phase-2/task-2.4-query-analysis.md`.

## Configuration

Every variable is validated at boot by `src/config/env.schema.ts`. An invalid value stops
the process with a message naming the variable. The database and Shopify variables have no
default unless the table gives one; a missing one stops the process the same way. The migration
script checks every variable except `PORT` and the four Shopify ones.

| Variable                | Default       | Values                                                                                  |
| ----------------------- | ------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`              | `development` | `development`, `test`, `production`                                                     |
| `PORT`                  | `3000`        | 1–65535                                                                                 |
| `LOG_LEVEL`             | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`                            |
| `DB_HOST`               | none          | the database server's hostname                                                          |
| `DB_PORT`               | `3306`        | 1–65535                                                                                 |
| `DB_NAME`               | none          | the database on that server; `commerce_intelligence` everywhere                         |
| `DB_USER`               | none          | the login                                                                               |
| `DB_PASSWORD`           | none          | the login's password; never written to a log                                            |
| `DB_POOL_SIZE`          | `10`          | connections one process keeps open, 1 or more                                           |
| `DB_SSL_CA_PATH`        | unset         | path to a PEM bundle; set, the app requires TLS and verifies the server                 |
| `SHOPIFY_CLIENT_ID`     | none          | the app's client id from the Dev Dashboard; not a credential                            |
| `SHOPIFY_CALLBACK_URL`  | none          | a URL: `/installation/callback` on the API's domain, where Shopify sends the owner back |
| `SHOPIFY_CLIENT_SECRET` | none          | the app's client secret from the Dev Dashboard; never written to a log                  |
| `COOKIE_SECRET`         | none          | signs the install's state cookie; never written to a log                                |

Locally the values come from `.env`, copied from `.env.example`, and point at the compose
database; `DB_SSL_CA_PATH` stays unset because that server has no certificate the app could
verify. In AWS the task definition sets them all: `DB_HOST`, `DB_PORT`, `DB_NAME` and
`DB_POOL_SIZE` as plain environment read from the data stack, `DB_SSL_CA_PATH` as
`/app/certs/eu-north-1-bundle.pem`, AWS's certificate bundle for the region copied into the
image, and `DB_USER` and `DB_PASSWORD` as ECS secrets, read from the Secrets Manager secret when
the task starts and placed in the container's environment. The password is in no file, no
template, no output and no log; only the task execution role may read the secret.

`SHOPIFY_CLIENT_ID` and `SHOPIFY_CALLBACK_URL` are plain environment from the stage config;
`SHOPIFY_CLIENT_SECRET` and `COOKIE_SECRET` are ECS secrets from the secrets stack, read the same
way at task start. All four reach the app's task only: the migration task never holds them, and its
role cannot read the two secrets. Locally, `.env.example` carries stand-ins so the app starts; a
real install runs only on the deployed app (Shopify app, below).

## Endpoints

| Route                        | Purpose                                                                                                                                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                | Liveness. `200 { "status": "ok" }` while the process runs, whatever the database does.                                                                                                                                 |
| `GET /ready`                 | Readiness via terminus. Runs `SELECT 1` through the pool with a 3-second limit and reports `database` up or down; `503` while shutting down or down.                                                                   |
| `GET /installation/start`    | Starts an install for `?shop=<store>.myshopify.com`: checks the shop address, sets the signed `oauth_state` cookie for 10 minutes and redirects to the shop's approval page. The Dev Dashboard's App URL.              |
| `GET /installation/callback` | Where Shopify sends the owner back. Checks the shop address, the HMAC and the state, trades the code for the store's keys, reads the shop's details, saves both in one transaction and answers one line of plain text. |

A `200` carries `"info": { "database": { "status": "up", "responseTime": … } }`; a `503` carries
the same shape under `error`, with the failure's message and the request id. The load balancer
calls `/ready` every 15 seconds, so a task whose database is unreachable stops receiving traffic
and is replaced.

## Errors and request ids

Every error has one shape. Send an `x-request-id` header to correlate a request; it is
echoed in the response header, the error body and every log line for that request.

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Validation failed",
  "requestId": "…",
  "issues": [{ "path": "total", "message": "…" }]
}
```

`issues` appears only on validation failures. Unexpected errors return a generic 500; the
stack goes to the log, never the client.

## Shopify app

The app is registered by hand in Shopify's Dev Dashboard as Commerce Intelligence. One app, with
one client id and one secret, serves every store; each install adds one `stores` row and one
`store_credentials` row. The settings, under the Dashboard's own field names:

| Field                      | Value                                                           |
| -------------------------- | --------------------------------------------------------------- |
| App name                   | Commerce Intelligence                                           |
| App URL                    | `https://api.commerce-intelligence.click/installation/start`    |
| Embed app in Shopify admin | unchecked                                                       |
| Allowed redirection URL(s) | `https://api.commerce-intelligence.click/installation/callback` |
| Use legacy install flow    | checked                                                         |
| Scopes                     | `read_products,read_orders`                                     |
| Version name (optional)    | empty                                                           |
| Webhooks API version       | `2026-10`, the form's default                                   |

Distribution is public, chosen in the Partner Dashboard, and Shopify allows no change back; the app
has no App Store listing. The client id is `shopifyClientId` in `infra/lib/config/stage-config.ts`.
The scopes are also `REQUESTED_SCOPES` in `src/installation/requested-scopes.ts`, which the
authorize URL sends; the two lists change together. Expiring offline keys have no Dashboard
setting: the code trade asks for them with `expiring=1`. The table stays true only if a change in
the Dashboard changes it in the same pull request.

**The client secret.** The secrets stack creates `commerce-intelligence-dev/shopify-client-secret`
holding a random placeholder, so no value is ever written in code. Once, after the stack exists,
copy the client secret from the app in the Dev Dashboard and paste it at the hidden prompt of the
first line; nothing shows while you paste:

```bash
read -rs SHOPIFY_CLIENT_SECRET
AWS_PROFILE=ci-admin aws secretsmanager put-secret-value --region eu-north-1 --secret-id commerce-intelligence-dev/shopify-client-secret --secret-string "$SHOPIFY_CLIENT_SECRET"
unset SHOPIFY_CLIENT_SECRET
```

The value never reaches the screen, the shell history or the disk. ECS reads secrets only when a
task starts, so a task already running keeps the placeholder, and every install fails, until a new
task replaces it. When the app is already running, start a new deployment of the same task
definition; the old task serves until the new one passes its health checks, and the last line waits
for that, up to 10 minutes:

```bash
SERVICE=$(AWS_PROFILE=ci-admin aws cloudformation describe-stacks --region eu-north-1 --stack-name commerce-intelligence-dev-app --query "Stacks[0].Outputs[?OutputKey=='ServiceName'].OutputValue" --output text)
AWS_PROFILE=ci-admin aws ecs update-service --region eu-north-1 --cluster commerce-intelligence-dev --service "$SERVICE" --force-new-deployment
AWS_PROFILE=ci-admin aws ecs wait services-stable --region eu-north-1 --cluster commerce-intelligence-dev --services "$SERVICE"
```

It changes no setting, so `cdk diff` stays clean. The cookie secret,
`commerce-intelligence-dev/cookie-secret`, is generated by AWS and never touched.

**Installing a store.** The owner opens

```text
https://api.commerce-intelligence.click/installation/start?shop=<store>.myshopify.com
```

approves the two scopes on Shopify, and lands on one line: "Commerce Intelligence is installed on
<store>.myshopify.com. You can close this page." The app log gets one `store installed` line with
the store id, the shop's domain and `reinstalled`. A reinstall, and a store that must authorize
again after Shopify refused its keys, take the same link. A failed install answers with the error
shape above, its message saying what to do next.

## Docker

```bash
docker build -t commerce-intelligence:local .
docker run --rm -p 3000:3000 --env-file .env -e LOG_LEVEL=info -e DB_HOST=host.docker.internal commerce-intelligence:local
```

Two-stage image on Node 24 Alpine, production dependencies only, runs as the `node` user.
On SIGTERM `/ready` answers 503 for 5 seconds so a load balancer can drain, then the
process exits. The image also carries AWS's RDS certificate bundle under `/app/certs`, the path
the task definition hands the app as `DB_SSL_CA_PATH`; locally the variable stays unset.

## Infrastructure

AWS resources are defined with AWS CDK in `infra/`, a separate npm package with its own
dependencies and gate. Everything deploys to `eu-north-1` from GitHub Actions, which logs in to AWS
with OIDC; the hand steps below use an IAM Identity Center profile. There are no long-lived access
keys anywhere.

Requirements: AWS CLI v2 and a profile named `ci-admin` configured with `aws configure sso`
(start URL and account come from the Identity Center admin), and Docker for the image.

```bash
cd infra && npm ci && cd ..
npm run infra:check                    # tests, type-check, lint, format, synth; no AWS session needed
npm run infra:format:check             # what CI runs instead of infra:format
aws sso login --profile ci-admin       # once per session, opens the browser
```

Once per account and region, before the first deploy, CDK needs its bootstrap stack: an S3 bucket
and an ECR repository for its assets, and the roles it deploys through. The CLI says when a newer
CLI wants it run again.

```bash
cd infra && AWS_PROFILE=ci-admin npx cdk bootstrap aws://$(AWS_PROFILE=ci-admin aws sts get-caller-identity --query Account --output text)/eu-north-1
```

Seven stacks, deployed in this order; `cdk deploy --all` orders them by what they read from each
other:

| Stack                                 | Holds                                                                                                                                                                                                                                                    | Idle cost per month |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `commerce-intelligence-dev-network`   | VPC over two zones with public, private and isolated subnets, a `t4g.micro` NAT instance on a pinned Amazon Linux 2023 image, the `alb`, `app` and `data` security groups, a reject-only flow log                                                        | about 10.5 USD      |
| `commerce-intelligence-dev-data`      | MySQL 8.4 on a `db.t4g.micro` in the isolated subnets, one zone, 20 GiB gp3 encrypted with AWS's key, seven days of backups, deletion protection and a final snapshot on delete, TLS required by its parameter group, the admin login in Secrets Manager | about 15 USD        |
| `commerce-intelligence-dev-registry`  | the ECR repository: immutable tags, scan on push, the last 20 images kept, retained on delete                                                                                                                                                            | cents               |
| `commerce-intelligence-dev-secrets`   | the app's two secrets in Secrets Manager: the Shopify client secret, pasted by hand once, and the cookie secret, generated by AWS; both deleted with the stack                                                                                           | about 0.80 USD      |
| `commerce-intelligence-dev-migration` | the migration task definition with its two roles, the log group `/commerce-intelligence/dev/migration`, and the outputs the deploy step reads; a task runs from it once per deploy, before the service moves                                             | cents               |
| `commerce-intelligence-dev-delivery`  | the GitHub OIDC provider and the two roles the workflows assume: pull request (read-only) and deploy                                                                                                                                                     | nothing             |
| `commerce-intelligence-dev-app`       | ECS cluster, task definition and service, the load balancer with HTTPS, the certificate and the `api` DNS record, the log group                                                                                                                          | about 33 USD        |

About 60 USD a month in total, against a budget of 75 USD with alerts at 50, 80 and 100 percent,
plus 0.50 USD for the hosted zone and 3 USD a year for the domain. The data stack's 15 USD is the
server (about 12), the disk (about 2.5) and the secret (0.40); automated backups are free up to
the disk's size. Stage settings live in `infra/lib/config/stage-config.ts`. The API answers at
`https://api.commerce-intelligence.click/health`.

The network, data, registry, secrets and delivery stacks carry termination protection: a delete is
refused until the flag is turned off by hand (see Tearing down). The secrets stack carries it so the
pasted Shopify secret survives a pause. The app and migration stacks do not; they are the two
removed on purpose. The picture of all of it is `docs/architecture.md`.

### Deploying

A merge to `main` deploys. The deploy workflow re-runs the checks on the merge commit, builds the
ARM image, tags it with the commit SHA, pushes it, deploys the delivery and migration stacks with
that tag, runs the migration task and waits for it (Migrations, above), runs
`cdk deploy --all --require-approval never` for the seven stacks, calls `/health` and `/ready` over
HTTPS from outside, and writes a summary on the run page: commit, tag, the migration result, each
stack's result, the two responses, links to CloudFormation and the two log groups. GitHub emails
the committer when a run on `main` fails. Deploys queue behind each other; nothing is ever
cancelled.

**When a deploy fails**, three places, in this order:

- [The deploy runs](https://github.com/Buri1989/shopify-commerce-intelligence-platform/actions/workflows/deploy.yml):
  the red step is the one named line that broke, and the summary on the run page keeps each
  stack's result and the two health answers.
- [CloudFormation](https://eu-north-1.console.aws.amazon.com/cloudformation/home?region=eu-north-1#/stacks?filteringText=commerce-intelligence-dev):
  a stack's events name the resource and the reason. The app stack in `UPDATE_ROLLBACK_COMPLETE`
  means the new tasks never passed the health check, the circuit breaker rolled the service back
  and the previous image is still serving.
  [ECS](https://eu-north-1.console.aws.amazon.com/ecs/v2/clusters/commerce-intelligence-dev/services?region=eu-north-1)
  keeps the service's events, which say why a task stopped.
- [The app log group](https://eu-north-1.console.aws.amazon.com/cloudwatch/home?region=eu-north-1#logsV2:log-groups/log-group/$252Fcommerce-intelligence$252Fdev$252Fapp),
  `/commerce-intelligence/dev/app`: what the task printed, one JSON line per event, the request
  id on every line of a request.

The console links assume the browser is signed in to the project account. The same log from a
terminal, live:

```bash
AWS_PROFILE=ci-admin aws logs tail /commerce-intelligence/dev/app --region eu-north-1 --since 30m --follow
```

**Rollback.** Actions → Deploy → Run workflow, with the tag of the last good image, a commit SHA
already in the repository; or from a terminal:

```bash
gh workflow run deploy.yml -f imageTag=<sha>
```

The run checks that the image exists, skips the checks and the build, deploys that tag and checks
the API; four to five minutes. The fix is a normal pull request afterwards.

**Logging in.** Every run proves who it is to AWS with GitHub's OIDC token and receives credentials
that expire within the hour. The delivery stack holds the provider and two roles. The pull request
role may only assume the bootstrap lookup role, enough for `cdk diff`. The deploy role may assume the
bootstrap deploy, file-publishing and lookup roles and push to the repository. Both trust rules name
this repository by its immutable identity, `Buri1989@42779452/shopify-commerce-intelligence-platform@1422111906`,
kept in the stage config; a token from any other repository, or from a branch other than `main` for
the deploy role, is refused.

**The first deploy into an empty account**, after the bootstrap, from `infra/` with
`AWS_PROFILE=ci-admin`:

1. `npm run deploy -- commerce-intelligence-dev-network commerce-intelligence-dev-data commerce-intelligence-dev-registry commerce-intelligence-dev-secrets commerce-intelligence-dev-migration commerce-intelligence-dev-delivery -c imageTag=none`.
   The migration stack comes before the delivery stack, which reads its outputs. The secrets stack
   comes before the merge, so the app's first task reads the real Shopify secret. The tag is
   written into the migration task definition and nothing runs it yet; the first merge rewrites
   it. The data stack takes 10 to 15 minutes: RDS creates the server, then CloudFormation attaches
   the secret.
2. Paste the Shopify client secret (Shopify app, above). No restart: the app is not running yet.
3. Set the three GitHub variables (GitHub setup below) from the delivery stack's outputs.
4. Merge to `main`. The deploy workflow builds the first image, runs the migration chain against
   the empty database and creates the app stack; that first run waits for the certificate to
   validate, usually a few minutes.

**Recovery**, when the pipeline itself is what is broken. The same steps a run performs, from a
clean commit, from the repository root:

```bash
SHA=$(git rev-parse HEAD)
REPO=$(AWS_PROFILE=ci-admin aws cloudformation describe-stacks --region eu-north-1 --stack-name commerce-intelligence-dev-registry --query "Stacks[0].Outputs[?OutputKey=='RepositoryUri'].OutputValue" --output text)
aws ecr get-login-password --region eu-north-1 --profile ci-admin | docker login --username AWS --password-stdin "${REPO%%/*}"
docker build --platform linux/arm64 -t "$REPO:$SHA" .
docker push "$REPO:$SHA"
```

```bash
cd infra
AWS_PROFILE=ci-admin npm run diff -- -c imageTag=$SHA            # what a deploy would change, all stacks
AWS_PROFILE=ci-admin npm run deploy -- --all -c imageTag=$SHA    # asks before IAM or security group changes
```

A running deploy locks `cdk.out`; a second CLI call during one needs `--output <dir>`.

The app keeps idle connections open for 65 seconds because the load balancer keeps them for
60; the two values live in `src/common/http/configure-for-load-balancer.ts` and
`infra/lib/app/create-load-balancer.ts` and move together.

### GitHub setup

Done once by hand, after the delivery stack exists. Three repository variables, under Settings →
Secrets and variables → Actions → Variables, read by the workflows as `vars.*`. Variables, not
secrets: an ARN is a name and the region is configuration. The workflow files name nothing about
the account, so a clone deploys elsewhere by changing these three and no file.

| Variable                    | Value                                            |
| --------------------------- | ------------------------------------------------ |
| `AWS_PULL_REQUEST_ROLE_ARN` | the delivery stack's `PullRequestRoleArn` output |
| `AWS_DEPLOY_ROLE_ARN`       | the delivery stack's `DeployRoleArn` output      |
| `AWS_REGION`                | `eu-north-1`                                     |

Branch protection on `main`: the checks `checks / app`, `checks / infra`, `diff` and `docker`
required, the rule applied to administrators too, no review approval. Set once by hand after the
pull request workflow has run, so GitHub knows the check names:

```bash
gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input - <<'EOF'
{
  "required_status_checks": { "strict": false, "contexts": ["checks / app", "checks / infra", "diff", "docker"] },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
```

GitHub offers branch protection on a private repository only on a paid plan; this repository has
been public since 2026-10-24 for that reason (design §4.8).

### How infrastructure changes are reviewed and applied

CloudFormation holds the state; there is no state file. The review is the diff between the code
and what is deployed.

1. Change on a branch. `npm run infra:check` passes locally.
2. Open a pull request. The pull request workflow runs the app gate, the infra gate, the Docker
   build and `cdk diff` against the deployed stacks through the read-only role, computed with the
   image tag `main` runs, and posts the diff as one comment that follows the latest commit.
3. Review the diff. Three things get a second look: IAM and security-group changes, which CDK
   marks; resources marked for replacement; and any change to the network stack, because the app
   and data stacks depend on it through weak references that CloudFormation does not enforce.
4. Merge. The deploy workflow builds and pushes the image and runs
   `cdk deploy --all --require-approval never`; what deploys is what was reviewed.
5. Verify: the run summary is green, and `npm run diff` with the deployed tag reports no differences.
6. Drift. Before a planned infrastructure change, and after anyone has worked in the console:
   ```bash
   cd infra && AWS_PROFILE=ci-admin npm run drift
   ```
   A drifted resource is brought back by a deploy when the code still says what is wanted, or
   the code is changed to match and deployed. Standalone security-group rules, IAM policies,
   route-table associations, the certificate and the DNS record are not checked by drift
   detection; the diff review is the only guard for those.

The NAT instance's image is pinned in `infra/lib/config/stage-config.ts`, so a deploy never
replaces it by surprise. Before a network-stack deploy, and at least once a quarter, compare the
pinned id with Amazon's current one; moving to it is a one-line change whose diff shows the
replacement:

```bash
aws ssm get-parameter --region eu-north-1 --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-arm64 --query Parameter.Value --output text
```

### Tearing down

```bash
cd infra
AWS_PROFILE=ci-admin npm run destroy -- commerce-intelligence-dev-app commerce-intelligence-dev-migration -c imageTag=gate
```

Neither stack is protected, and the next merge brings both back. The data stack holds the only
state, and three locks stand between a command and the data: the stack's termination protection,
the server's deletion protection, and the final snapshot taken if the server is deleted anyway. A
planned destroy is three steps, after the app and migration stacks are gone, because both read the
data stack's outputs:

1. Termination protection off on the stack:
   ```bash
   AWS_PROFILE=ci-admin aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name commerce-intelligence-dev-data --region eu-north-1
   ```
2. Deletion protection off on the server: set `deletionProtection` to `false` in
   `infra/lib/data/create-database-server.ts` and deploy the data stack alone,
   `npm run deploy -- commerce-intelligence-dev-data -c imageTag=gate`. Revert the edit before
   anything is merged; it is a one-deploy change, never a commit.
3. Destroy:
   ```bash
   AWS_PROFILE=ci-admin npm run destroy -- commerce-intelligence-dev-data -c imageTag=gate
   ```
   CloudFormation takes a final snapshot of the server before deleting it. The snapshot keeps the
   data and costs backup storage until it is deleted by hand, in the RDS console or with
   `aws rds delete-db-snapshot`; that is the step that really loses the data. The next deploy of
   the data stack creates an empty server with a new secret, both protections on.

For a long pause the network stack can go too, once the data stack is gone, since the server sits
in its subnets. It is protected, so the flag comes off first; the next deploy turns it back on.

```bash
AWS_PROFILE=ci-admin aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name commerce-intelligence-dev-network --region eu-north-1
AWS_PROFILE=ci-admin npm run destroy -- commerce-intelligence-dev-network -c imageTag=gate
```

The registry, secrets and delivery stacks stay: all three are protected and cost little or nothing
to keep, the secrets stack holds the pasted Shopify secret, and without the delivery stack no
pipeline run can log in. If the registry stack were ever deleted, the repository would survive
under its fixed name, and recreating the stack would need the repository brought under it with
`cdk import` or deleted first. The hosted zone stays until deleted by hand. Bringing everything
back is the first-deploy sequence under Deploying.

## Layout

```
src/
  config/            env schema and the global config module
  common/
    logging/         pino logger, Nest adapter, request-id and request-log middleware
    errors/          mappers from thrown values to one error response, and the resolver
    filters/         the global exception filter
    validation/      zod validation pipe
    http/            keep-alive and proxy settings for life behind the load balancer
    shopify/         the one POST every Shopify call goes through: the 10-second limit, a 429 or 5xx as ShopifyUnavailableError
  database/          the pool and Drizzle on it; schema/ the ten tables; migrations/ the SQL chain with drizzle-kit's journal and snapshots; the migration script and its lock; the paging and write helpers every repository shares
  health/            /health and /ready, with the database indicator behind /ready
  stores/            the stores repository, with the stores' keys, and its module
  products/          the products repository and its module
  orders/            the orders repository, with their items, and its module
  access-tokens/     the token client for the code and refresh trades, and the service that returns a store's working key
  installation/      /installation/start and /installation/callback: the shop, HMAC, state and scope checks, the authorize URL, the state cookie, the shop query
  app.setup.ts       configureApp: logger, edge middleware, signed cookies, shutdown hooks
  main.ts
test/                e2e specs, the shared app-boot helper, the migration, repository and install helpers, the query analysis script, global-setup.ts (one MySQL container per run) and e2e-setup.ts (its address into every worker's environment)
certs/               AWS's RDS certificate bundle for eu-north-1, copied into the image
docker-compose.yml   MySQL 8.4 for local development, dev-only login, data in a named volume
drizzle.config.ts    drizzle-kit: the table files in, the migrations folder out
infra/
  bin/app.ts         CDK entry point: stage config and image tag → the seven stacks
  lib/config/        stage settings, the project name, the image tag resolver
  lib/network/       the VPC, NAT instance, security groups, flow log, outputs, the immutable import helper, and the stack
  lib/data/          the MySQL engine, the parameter group, the admin secret, the server, the connection, outputs, and the stack
  lib/registry/      the ECR repository and its stack
  lib/secrets/       the app's two secrets and their stack
  lib/delivery/      the GitHub OIDC provider, the pull request and deploy roles, the grant that lets the deploy role run the migration task, and the stack
  lib/app/           cluster, task definition, service, load balancer, certificate, record, outputs, the stack, the pieces both task definitions share, and the app task's own settings and secrets
  lib/migration/     the migration task definition, its log group, the outputs the deploy step reads, and the stack
  lib/project-tags.ts
  test/              template queries, the test App, stack fixtures and the validation-report reader used by the specs
.github/workflows/   checks.yml, pull-request.yml, deploy.yml, and the rules test that guards them
docs/                the assignment, per-task design and questions docs, and the architecture picture
```

## Documentation

- `docs/Boris-ing.md`: the assignment
- `docs/phase-1/task-1.1-design.md`: decisions, alternatives and trade-offs
- `docs/phase-1/task-1.1-questions.md`: answers to the task's questions
- `docs/phase-1/task-1.2-design.md` and `task-1.2-questions.md`: AWS networking
- `docs/phase-1/task-1.3-design.md` and `task-1.3-questions.md`: compute and deployment
- `docs/phase-1/task-1.4-design.md` and `task-1.4-questions.md`: infrastructure as code
- `docs/phase-1/task-1.5-design.md` and `task-1.5-questions.md`: the GitHub Actions pipeline
- `docs/phase-2/task-2.1-design.md` and `task-2.1-questions.md`: RDS for MySQL, the secret, TLS, the pool
- `docs/phase-2/task-2.2-design.md` and `task-2.2-questions.md`: the schema, the ERD, keys, pointers, delete rules
- `docs/phase-2/task-2.3-design.md` and `task-2.3-questions.md`: migrations, the one-off task, the lock, the backward-compatible strategy
- `docs/phase-2/task-2.4-design.md`, `task-2.4-questions.md` and `task-2.4-query-analysis.md`: repositories, transactions, paging, the two indexes and what they do
- `docs/phase-3/task-3.1-design.md`: the Shopify install, its checks, the expiring keys and their refresh, the secrets stack
- `docs/architecture.md`: the environment as deployed, updated by every task that changes it
