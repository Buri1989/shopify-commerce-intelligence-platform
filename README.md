# Commerce Intelligence

Multi-tenant Shopify app backend: NestJS 12, TypeScript, MySQL, AWS. Built phase by
phase as a backend engineering training assignment. The assignment is in
`docs/Boris-ing.md`; each task has a design doc and a questions doc under `docs/phase-N/`.

**Status:** Phase 1. Tasks 1.1 to 1.3 complete and deployed; Task 1.4 (infrastructure as code)
in progress; Task 1.5 (CI/CD) next.

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
(start URL and account come from the Identity Center admin), and Docker for the image.

```bash
cd infra && npm ci && cd ..
npm run infra:check                    # tests, type-check, lint, format, synth; no AWS session needed
aws sso login --profile ci-admin       # once per session, opens the browser
```

Once per account and region, before the first deploy, CDK needs its bootstrap stack: an S3 bucket
and an ECR repository for its assets, and the roles it deploys through. The CLI says when a newer
CLI wants it run again.

```bash
cd infra && AWS_PROFILE=ci-admin npx cdk bootstrap aws://$(AWS_PROFILE=ci-admin aws sts get-caller-identity --query Account --output text)/eu-north-1
```

Three stacks, deployed in this order:

| Stack | Holds | Idle cost per month |
|---|---|---|
| `commerce-intelligence-dev-network` | VPC over two zones with public, private and isolated subnets, a `t4g.micro` NAT instance on a pinned Amazon Linux 2023 image, the `alb`, `app` and `data` security groups, a reject-only flow log | about 10.5 USD |
| `commerce-intelligence-dev-registry` | the ECR repository: immutable tags, scan on push, the last 20 images kept, retained on delete | cents |
| `commerce-intelligence-dev-app` | ECS cluster, task definition and service, the load balancer with HTTPS, the certificate and the `api` DNS record, the log group | about 33 USD |

About 44 USD a month in total, plus 0.50 USD for the hosted zone and 3 USD a year for the
domain. Stage settings live in `infra/lib/config/stage-config.ts`. The API answers at
`https://api.commerce-intelligence.click/health`.

The network and registry stacks carry termination protection: a delete is refused until the flag is
turned off by hand (see Tearing down). The app stack does not; it is the one removed on purpose.
The picture of all of it is `docs/phase-1/architecture.md`.

### Deploying, until Task 1.5 automates it

The image is built from a clean commit and tagged with that commit's SHA; the deploy names the tag.

**The first deploy** into an empty account, after the bootstrap:

1. Network and registry: `cd infra && AWS_PROFILE=ci-admin npm run deploy -- commerce-intelligence-dev-network commerce-intelligence-dev-registry -c imageTag=none`.
   The tag is irrelevant to these two stacks, but the app stack must synthesize.
2. Build and push the image, the first block below.
3. The app stack, the second block below. The first run waits for the certificate to validate,
   usually a few minutes.

**Every deploy after that**, from the repository root:

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

A rollback is the same deploy with an older tag. A running deploy locks `cdk.out`; a second CLI
call during one needs `--output <dir>`.

The app keeps idle connections open for 65 seconds because the load balancer keeps them for
60; the two values live in `src/common/http/configure-for-load-balancer.ts` and
`infra/lib/app/create-load-balancer.ts` and move together.

### How infrastructure changes are reviewed and applied

CloudFormation holds the state; there is no state file. The review is the diff between the code
and what is deployed. Steps marked *(until 1.5)* are the interim form and go when the workflows land.

1. Change on a branch. `npm run infra:check` passes locally.
2. Open a pull request. The pull-request workflow runs the app gate, the infra gate, the Docker
   build and `cdk diff` against the deployed stacks through a read-only role, and posts the diff
   on the pull request. *(until 1.5: run the diff yourself and paste it into the description.)*
   ```bash
   cd infra && AWS_PROFILE=ci-admin npm run diff -- -c imageTag=$(git rev-parse HEAD)
   ```
3. Review the diff. Three things get a second look: IAM and security-group changes, which CDK
   marks; resources marked for replacement; and any change to the network stack, because the app
   stack depends on it through weak references that CloudFormation does not enforce.
4. Merge. The deploy workflow builds and pushes the image and runs
   `cdk deploy --all --require-approval never`; what deploys is what was reviewed.
   *(until 1.5: deploy from your machine after the merge, with the prompt.)*
5. Verify: `npm run diff` with the deployed tag reports no differences.
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

Requiring the pull-request workflow to pass before a merge is a branch-protection setting on
GitHub, set once by hand when Task 1.5 lands.

### Tearing down

```bash
cd infra
AWS_PROFILE=ci-admin npm run destroy -- commerce-intelligence-dev-app -c imageTag=gate
```

For a long pause the network stack can go too. It is protected, so the flag comes off first; the
next deploy turns it back on.

```bash
AWS_PROFILE=ci-admin aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name commerce-intelligence-dev-network --region eu-north-1
AWS_PROFILE=ci-admin npm run destroy -- commerce-intelligence-dev-network -c imageTag=gate
```

The registry stack stays: it is protected and costs cents. If it were ever deleted, the repository
would survive under its fixed name, and recreating the stack would need the repository brought
under it with `cdk import` or deleted first. The hosted zone stays until deleted by hand. Bringing
everything back is the deploy above.

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
  health/            /health and /ready
  app.setup.ts       configureApp: logger, edge middleware, shutdown hooks
  main.ts
test/                e2e specs and the shared app-boot helper
infra/
  bin/app.ts         CDK entry point: stage config and image tag → the three stacks
  lib/config/        stage settings, the project name, the image tag resolver
  lib/network/       the VPC, NAT instance, security groups, flow log, outputs, and the stack
  lib/registry/      the ECR repository and its stack
  lib/app/           cluster, task definition, service, load balancer, certificate, record, outputs, and the stack
  lib/project-tags.ts
  test/              template queries, the test App, stack fixtures and the validation-report reader used by the specs
docs/                the assignment, per-task design and questions docs
```

## Documentation

- `docs/Boris-ing.md`: the assignment
- `docs/phase-1/task-1.1-design.md`: decisions, alternatives and trade-offs
- `docs/phase-1/task-1.1-questions.md`: answers to the task's questions
- `docs/phase-1/task-1.2-design.md` and `task-1.2-questions.md`: AWS networking
- `docs/phase-1/task-1.3-design.md` and `task-1.3-questions.md`: compute and deployment
- `docs/phase-1/task-1.4-design.md` and `task-1.4-questions.md`: infrastructure as code
- `docs/phase-1/architecture.md`: the environment as deployed, updated by every task that changes it
