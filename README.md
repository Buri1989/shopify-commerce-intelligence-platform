# Commerce Intelligence

Multi-tenant Shopify app backend: NestJS 12, TypeScript, MySQL, AWS. Built phase by
phase as a backend engineering training assignment. The assignment is in
`docs/Boris-ing.md`; each task has a design doc and a questions doc under `docs/phase-N/`.

**Status:** Phase 1, Task 1.2 (AWS networking) code complete; its first deploy opens
Task 1.3. Task 1.1 (backend foundation) complete.

## Requirements

- Node 24 (`.nvmrc`) and npm
- Docker, for the container image

## Setup

```bash
npm ci
cp .env.example .env
```

## Run

```bash
npm run dev          # watch mode, human-readable logs
npm run start:dev    # watch mode, raw JSON logs
npm run build && npm run start:prod
```

Then `curl localhost:3000/health` and `curl localhost:3000/ready`.

## Checks

```bash
npm test             # unit tests
npm run test:e2e     # e2e tests over HTTP
npm run lint
npx tsc --noEmit
npm run format
```

## Configuration

Every variable is validated at boot by `src/config/env.schema.ts`. An invalid value stops
the process with a message naming the variable.

| Variable    | Default       | Values                                                       |
| ----------- | ------------- | ------------------------------------------------------------ |
| `NODE_ENV`  | `development` | `development`, `test`, `production`                          |
| `PORT`      | `3000`        | 1–65535                                                      |
| `LOG_LEVEL` | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` |

## Endpoints

| Route         | Purpose                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| `GET /health` | Liveness. `200 { "status": "ok" }` while the process runs.                 |
| `GET /ready`  | Readiness via terminus. `503` while shutting down or a dependency is down. |

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

## Docker

```bash
docker build -t commerce-intelligence:local .
docker run --rm -p 3000:3000 -e LOG_LEVEL=info commerce-intelligence:local
```

Two-stage image on Node 24 Alpine, production dependencies only, runs as the `node` user.
On SIGTERM `/ready` answers 503 for 5 seconds so a load balancer can drain, then the
process exits.

## Infrastructure

AWS resources are defined with AWS CDK in `infra/`, a separate npm package with its own
dependencies and gate. Everything deploys to `eu-north-1` through an IAM Identity Center
profile; there are no long-lived access keys.

Requirements: AWS CLI v2 and a profile named `ci-admin` configured with `aws configure sso`
(start URL and account come from the Identity Center admin).

```bash
cd infra && npm ci && cd ..
npm run infra:check                    # tests, type-check, lint, format, synth; no AWS session needed
aws sso login --profile ci-admin       # once per session, opens the browser
```

```bash
cd infra
AWS_PROFILE=ci-admin npx cdk bootstrap aws://<account-id>/eu-north-1   # once per account and region
AWS_PROFILE=ci-admin npm run diff      # what a deploy would change
AWS_PROFILE=ci-admin npm run deploy    # asks before creating IAM or security group changes
```

The `commerce-intelligence-dev-network` stack holds the VPC (two zones, public, private and
isolated subnets, one NAT Gateway, an S3 gateway endpoint), the `alb`, `app` and `data`
security groups, and a flow log of rejected traffic. While deployed it costs roughly 38 USD a
month, almost all of it the NAT Gateway. Stage settings live in `infra/lib/config/stage-config.ts`;
`natGatewayCount: 2` is the production value.

## Layout

```
src/
  config/            env schema and the global config module
  common/
    logging/         pino logger, Nest adapter, request-id and request-log middleware
    errors/          mappers from thrown values to one error response, and the resolver
    filters/         the global exception filter
    validation/      zod validation pipe
  health/            /health and /ready
  app.setup.ts       configureApp: logger, edge middleware, shutdown hooks
  main.ts
test/                e2e specs and the shared app-boot helper
infra/
  bin/app.ts         CDK entry point: stage config → NetworkStack
  lib/config/        stage settings and the project name
  lib/network/       the VPC, security groups, flow log, outputs, and the stack
  lib/project-tags.ts
  test/              template queries and stack fixtures used by the specs
docs/                the assignment, per-task design and questions docs
```

## Documentation

- `docs/Boris-ing.md`: the assignment
- `docs/phase-1/task-1.1-design.md`: decisions, alternatives and trade-offs
- `docs/phase-1/task-1.1-questions.md`: answers to the task's questions
- `docs/phase-1/task-1.2-design.md` and `task-1.2-questions.md`: AWS networking
