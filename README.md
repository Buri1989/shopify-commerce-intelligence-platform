# Commerce Intelligence

Multi-tenant Shopify app backend: NestJS 12, TypeScript, MySQL, AWS. Built phase by
phase as a backend engineering training assignment. The assignment is in
`docs/Boris-ing.md`; each task has a design doc and a questions doc under `docs/phase-N/`.

**Status:** Phase 1. Tasks 1.1 to 1.4 complete and deployed; Task 1.5 (CI/CD) in progress.

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
npm test                   # unit tests
npm run test:e2e           # e2e tests over HTTP
npm run typecheck          # tsc --noEmit; npm test does not type-check
npm run lint
npm run format             # writes
npm run format:check       # what CI runs: fails on an unformatted file, writes nothing
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

Four stacks, deployed in this order:

| Stack                                | Holds                                                                                                                                                                                             | Idle cost per month |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `commerce-intelligence-dev-network`  | VPC over two zones with public, private and isolated subnets, a `t4g.micro` NAT instance on a pinned Amazon Linux 2023 image, the `alb`, `app` and `data` security groups, a reject-only flow log | about 10.5 USD      |
| `commerce-intelligence-dev-registry` | the ECR repository: immutable tags, scan on push, the last 20 images kept, retained on delete                                                                                                     | cents               |
| `commerce-intelligence-dev-delivery` | the GitHub OIDC provider and the two roles the workflows assume: pull request (read-only) and deploy                                                                                              | nothing             |
| `commerce-intelligence-dev-app`      | ECS cluster, task definition and service, the load balancer with HTTPS, the certificate and the `api` DNS record, the log group                                                                   | about 33 USD        |

About 44 USD a month in total, plus 0.50 USD for the hosted zone and 3 USD a year for the
domain. Stage settings live in `infra/lib/config/stage-config.ts`. The API answers at
`https://api.commerce-intelligence.click/health`.

The network, registry and delivery stacks carry termination protection: a delete is refused until
the flag is turned off by hand (see Tearing down). The app stack does not; it is the one removed on
purpose. The picture of all of it is `docs/phase-1/architecture.md`.

### Deploying

A merge to `main` deploys. The deploy workflow re-runs the checks on the merge commit, builds the
ARM image, tags it with the commit SHA, pushes it, runs `cdk deploy --all --require-approval never`
for the four stacks, calls `/health` and `/ready` over HTTPS from outside, and writes a summary on
the run page: commit, tag, each stack's result, the two responses, links to CloudFormation and the
log group. GitHub emails the committer when a run on `main` fails. Deploys queue behind each other;
nothing is ever cancelled.

**Rollback.** Actions → Deploy → Run workflow, with the tag of the last good image, a commit SHA
already in the repository; or from a terminal:

```bash
gh workflow run deploy.yml -f imageTag=<sha>
```

The run checks that the image exists, skips the checks and the build, deploys that tag and checks
the API; about five minutes. The fix is a normal pull request afterwards.

**Logging in.** Every run proves who it is to AWS with GitHub's OIDC token and receives credentials
that expire within the hour. The delivery stack holds the provider and two roles. The pull request
role may only assume the bootstrap lookup role, enough for `cdk diff`. The deploy role may assume the
bootstrap deploy, file-publishing and lookup roles and push to the repository. Both trust rules name
this repository by its immutable identity, `Buri1989@42779452/shopify-commerce-intelligence-platform@1422111906`,
kept in the stage config; a token from any other repository, or from a branch other than `main` for
the deploy role, is refused.

**The first deploy into an empty account**, after the bootstrap, from `infra/` with
`AWS_PROFILE=ci-admin`:

1. `npm run deploy -- commerce-intelligence-dev-network commerce-intelligence-dev-registry commerce-intelligence-dev-delivery -c imageTag=none`.
   The tag is irrelevant to these three stacks, but the app stack must synthesize.
2. Set the three GitHub variables (GitHub setup below) from the delivery stack's outputs.
3. Merge to `main`. The deploy workflow builds the first image and creates the app stack; that
   first run waits for the certificate to validate, usually a few minutes.

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
   stack depends on it through weak references that CloudFormation does not enforce.
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
AWS_PROFILE=ci-admin npm run destroy -- commerce-intelligence-dev-app -c imageTag=gate
```

For a long pause the network stack can go too. It is protected, so the flag comes off first; the
next deploy turns it back on.

```bash
AWS_PROFILE=ci-admin aws cloudformation update-termination-protection --no-enable-termination-protection --stack-name commerce-intelligence-dev-network --region eu-north-1
AWS_PROFILE=ci-admin npm run destroy -- commerce-intelligence-dev-network -c imageTag=gate
```

The registry and delivery stacks stay: both are protected, both cost nothing to keep, and without
the delivery stack no pipeline run can log in. If the registry stack were ever deleted, the
repository would survive under its fixed name, and recreating the stack would need the repository
brought under it with `cdk import` or deleted first. The hosted zone stays until deleted by hand.
Bringing everything back is the first-deploy sequence under Deploying.

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
  bin/app.ts         CDK entry point: stage config and image tag → the four stacks
  lib/config/        stage settings, the project name, the image tag resolver
  lib/network/       the VPC, NAT instance, security groups, flow log, outputs, and the stack
  lib/registry/      the ECR repository and its stack
  lib/delivery/      the GitHub OIDC provider, the pull request and deploy roles, and the stack
  lib/app/           cluster, task definition, service, load balancer, certificate, record, outputs, and the stack
  lib/project-tags.ts
  test/              template queries, the test App, stack fixtures and the validation-report reader used by the specs
.github/workflows/   checks.yml, pull-request.yml, deploy.yml, and the rules test that guards them
docs/                the assignment, per-task design and questions docs
```

## Documentation

- `docs/Boris-ing.md`: the assignment
- `docs/phase-1/task-1.1-design.md`: decisions, alternatives and trade-offs
- `docs/phase-1/task-1.1-questions.md`: answers to the task's questions
- `docs/phase-1/task-1.2-design.md` and `task-1.2-questions.md`: AWS networking
- `docs/phase-1/task-1.3-design.md` and `task-1.3-questions.md`: compute and deployment
- `docs/phase-1/task-1.4-design.md` and `task-1.4-questions.md`: infrastructure as code
- `docs/phase-1/task-1.5-design.md` and `task-1.5-questions.md`: the GitHub Actions pipeline
- `docs/phase-1/architecture.md`: the environment as deployed, updated by every task that changes it
