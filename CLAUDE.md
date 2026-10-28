# CLAUDE.md

## What this is

Commerce Intelligence: a multi-tenant Shopify app backend on NestJS 12, TypeScript, MySQL
and AWS, built as a six-phase training assignment. The assignment is `docs/Boris-ing.md`.
Its general rules are hard constraints: AWS from day one, all infrastructure as code,
deploys through GitHub Actions, no long-lived AWS keys, no secrets in source, every phase
ends with tests and a working deployment, every major decision documented with
alternatives and trade-offs.

## How we work

- One task at a time. The task's design doc (`docs/phase-N/task-N.M-design.md`) is the
  plan; its build order section is the step list. No separate plan documents.
- Show every file in chat and get approval before writing it: the test first, then the
  implementation. Approval is per file when design is involved.
- TDD, every time: write the spec, run it red, write the code, run it green, format, run
  the full gate.
- Commit only when asked. Show the commit message first. Subject is an imperative
  sentence with no type prefix, matching the existing history.
- After a task's code is done, answer its "questions to investigate" in
  `docs/phase-N/task-N.M-questions.md`: short, professional, tied to what was built, and
  ending with a "Why we picked what we picked" section that gives the reason for every
  decision of the task.

## The gate

```bash
npm test && npm run test:e2e && npm run typecheck && npm run lint && npm run format
```

All of it passes before a step is called done. `npm test` does not type-check; always
run `typecheck` separately. CI runs `format:check` and `infra:format:check`, which write nothing.

The infrastructure package has its own gate, run from the root:

```bash
npm run infra:check
```

It needs no AWS session. `cdk synth` is part of it.

## Code rules

Skills in `.claude/skills/` (senior-backend, senior-architect, tdd-guardian) are the
full reference. Apply them while writing, not after. The rules that come up most:

- One responsibility per file. Small functions, one job each, public function first,
  helpers after.
- Names say what they do. `create*` builds something, `map*` converts a foreign shape to
  ours, `is*` is a type guard. One verb per concept across the codebase.
- A constant stays private in the module that uses it. No shared constants file. Move a
  value only when a second module needs it, into a file named for the concept.
- Comments only explain why. Never what.
- Throw `HttpException`s for deliberate rejections. Anything else reaches the global
  filter as a generic 500 and is logged with its stack.
- ESM: relative imports end in `.js`.

## Conventions from Task 1.1

- Config: add a variable to `src/config/env.schema.ts` and `.env.example`; read it through
  `ConfigService<Env, true>`.
- Logging: inject `APPLICATION_LOGGER` for pino directly, or use Nest's `Logger`, which
  is routed through pino. Redaction lives in `src/common/logging/logger.ts`.
- Errors: a new error source gets a mapper in `src/common/errors/` and one line in the
  resolver's list. The filter does not change.
- Validation: `@Body(new ZodValidationPipe(schema))` per parameter. No global pipe.
- Tests: unit specs sit next to the source and boot nothing from Nest. E2E specs live in
  `test/` and boot through `createTestApp()`. Test-only controllers stay inside their
  spec file.
- Edge middleware is registered in `src/app.setup.ts` with `app.use` before `init`, so
  it runs ahead of the body parser.

## Conventions from Task 1.2

- Infrastructure lives in `infra/`, a separate npm package (not a workspace). The app never
  imports from it and the Docker build context excludes it. Root scripts `infra:*` pass
  through.
- Stacks pin the region from the stage config and never the account. No context lookups, so
  synth and tests run without credentials and `cdk.context.json` does not exist.
- Stage settings are one typed object per stage in `infra/lib/config/stage-config.ts`,
  selected by the `stage` context value. New environment-specific values go there.
- Every security group is created with `allowAllOutbound: false` and gets explicit rules with
  a description that says why.
- Spec files hold `beforeAll` and `it` blocks only. Template queries and stack fixtures live
  in `infra/test/` and are imported. Verbs: `find*` looks up in a template, `read*` returns
  a resource's properties, `synthesize*` builds a template, `create*` builds a construct.
- Deploys run from a developer machine with `AWS_PROFILE=ci-admin` until Task 1.5 moves them
  to GitHub Actions. Read `npm run diff` before `npm run deploy`.

## Conventions from Task 1.3

- The image tag is a deploy argument, never configuration: `-c imageTag=<sha>`. `bin/app.ts`
  refuses to synthesize without it; the infra `synth` script passes `gate`. Deploy with
  `npm run deploy -- --all -c imageTag=<sha>`; a running deploy locks `cdk.out`, so a second
  CLI call during one needs `--output <dir>`.
- Three stacks, `-network`, `-registry`, `-app`, wired with CDK's weak references (the
  `cdk.json` flag). A stack that uses the network's security groups imports them with
  `mutable: false` and creates listeners with `open: false`; the network stack owns every rule.
- Test fixtures build their App with `createTestApp()` so they carry `cdk.json`'s feature
  flags. `match*` returns an assertion matcher; `matchStackOutput` matches a cross-stack
  reference.
- The ECS service is created after the load balancer and attached to its target group.
- The NAT instance's logical id carries its type (`replaceOnTypeChange`): boot-time setup runs
  once, so a type change must replace the instance.
- `configureForLoadBalancer` in the app keeps Node's keep-alive timeout above the balancer's
  idle timeout; the two values are paired across the packages.

## Conventions from Task 1.4

- Credentials never appear anywhere. Stack code, stage config and workflow files never name the
  account; documents may. A secret is created by AWS and referenced by ARN, never a stage config
  value or an environment literal.
- The network and registry stacks carry `terminationProtection: true`; the app stack does not. A
  planned destroy of a protected stack turns the flag off first (README, Tearing down).
- The NAT image is pinned in the stage config as `natInstanceAmiId`. Moving to a newer image is its
  own pull request. `cdk diff` is clean after every deploy and is read before every merge; the
  review-and-apply procedure is in the README.
- `npm run drift` in `infra/` before a planned infrastructure change and after console work.
- A CDK validation finding is acknowledged on the construct with
  `Validations.of(scope).acknowledge({ id, reason })`, never silenced globally; the network spec
  asserts that no finding is left unacknowledged.
- Fixtures: `create*Stack(app, config)` returns a stack, `synthesize*` returns its template,
  `read*` reads from a synthesized assembly.
- `docs/architecture.md` is the living picture of the environment. A task that changes
  what runs updates it and its "Last updated" line.

## Conventions from Task 1.5

- Three workflows in `.github/workflows/`: `checks.yml` (reusable: the app and infra gates),
  `pull-request.yml` and `deploy.yml`. Steps run the npm scripts, one script per step, so a failure
  is one named line in the run. The only raw commands are `docker build`, the health curl and the
  summary.
- Every action is pinned to a 40-character commit SHA with the version as a trailing comment.
  `.github/workflows/workflows.spec.ts` enforces that and the other rules (permissions, triggers,
  concurrency, `.nvmrc`, time limits) and runs with the root `npm test`. A workflow change starts
  with a rule, red.
- Permissions: `contents: read` at the top of every workflow. A job that logs in to AWS declares
  `contents: read` and `id-token: write` itself, because a job-level block replaces the top one.
  `pull-requests: write` only on the `diff` job.
- The roles reach the workflows as the repository variables `AWS_PULL_REQUEST_ROLE_ARN`,
  `AWS_DEPLOY_ROLE_ARN` and `AWS_REGION`, never as literals. The delivery stack that creates them
  is deployed by hand only the first time; after that every merge deploys all four stacks.
- The repository is named in the stage config by its immutable identity, `owner@id/name@id`, as
  GitHub writes it in its tokens. Trust rules use `StringEquals`, never a wildcard.
- `cdk diff` in CI runs `--method template --fail-on never` through the lookup role: information for
  the reviewer, not a check. Nothing in the pipeline is cancelled: `cancel-in-progress: false`
  everywhere.
- A deploy from a laptop is for the first deploy into an empty account and for recovery only.

## Conventions from Task 2.1

- Five stacks: `-data` joins `-network`, `-registry`, `-delivery` and `-app`. The data stack carries
  `terminationProtection: true`; the server carries deletion protection and a snapshot removal
  policy, so a planned destroy is three steps (README, Tearing down).
- Database settings that differ per stage (`databaseInstanceType`, `databaseAllocatedStorageGiB`,
  `databaseBackupRetentionDays`, `databaseMultiAz`, `databasePoolSize`) live in the stage config.
  The database name is a constant in `infra/lib/data/database-name.ts`. The engine version is the
  major only, `8.4`; its CloudFormation validation finding is acknowledged on the server construct.
- The admin login is a `DatabaseSecret` the data stack creates. It reaches the task as ECS secrets,
  `DB_USER` and `DB_PASSWORD`, read by the execution role at task start, never as plain environment.
  The plain variables are `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_POOL_SIZE` and `DB_SSL_CA_PATH`.
- Verbs: `resolve*` computes a value from inputs (`resolvePoolOptions`, `resolveDatabaseConnection`);
  `import*` attaches an existing resource without changing it (`importImmutableSecurityGroup`).
- The app reaches the database through `src/database/`: `DATABASE_POOL` is the mysql2 pool,
  `DATABASE` is Drizzle on top of it. A feature module imports `DatabaseModule` explicitly. The pool
  options are a pure function of the validated environment; TLS is on only when `DB_SSL_CA_PATH`
  names a bundle. `certs/<region>-bundle.pem` is committed and copied into the image.
- `/ready` runs `SELECT 1` through the pool with a 3-second limit via terminus's `attempt`. A new
  indicator is a class on `HealthIndicatorService`, added to the controller's list. `/health` never
  touches a dependency.
- The e2e suite gets a real MySQL 8.4 from Testcontainers in `test/global-setup.ts`; the address
  reaches the workers through vitest's `provide` and `inject` in `test/e2e-setup.ts`, which must set
  `process.env` before any spec imports the app, because the config module validates at import time.
  A boundary is swapped per spec with `createTestApp([], [{ provide, useValue }])`. Docker must be
  running for `npm run test:e2e`; locally, `docker compose up -d` before `npm run dev`.
