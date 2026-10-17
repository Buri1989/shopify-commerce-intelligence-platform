# Task 1.1 — Backend Foundation: Design

**Date:** 2026-10-17
**Branch:** `feat/task-1.1-backend-foundation`
**Status:** approved design, nothing built yet
**Spec:** `docs/Boris-ing.md`, section 3, Task 1.1

This document records what was decided for Task 1.1 and why. A builder should be able to implement
from it without going back to the author. Anything marked **(builder's call)** is left open on
purpose. Anything marked **(my call)** was decided by Claude during planning and can be overridden.

---

## 1. Intent

Turn the bare NestJS scaffold into a production-shaped backend foundation that every later phase
extends: configuration, logging, error handling, validation, health endpoints, tests, and a Docker
image. No Shopify logic. No database. The point is that when Phase 1.2 to 1.5 put this on AWS, the
application side is already behaving like a service you can operate: it fails fast on bad config,
logs JSON that CloudWatch can query, answers liveness and readiness probes, and shuts down cleanly
on SIGTERM.

This is a training assignment. Every decision below is one the author must be able to explain and
defend. The companion file `task-1.1-questions.md` answers the spec's seven "questions to
investigate" once the code exists.

## 2. Goals, non-goals, anti-goals

**Goals**

- A new clone can `cp .env.example .env`, `npm ci`, `npm run start:dev`, and hit `/health` and
  `/ready`.
- Invalid or missing environment variables stop the process at boot with a readable message.
- Every log line is one JSON object with `level` (a string label), `time` (ISO), `msg`,
  `context`, and `requestId`.
- Every error response has one shape and carries the request id.
- `docker build` produces a small image that runs as a non-root user and answers both endpoints.
- Every behaviour above has a test that was red before it was green.

**Non-goals**

- Any Shopify, database, queue, or analytics code.
- Swagger / OpenAPI generation.
- Authentication or authorization.
- The request-id decorator sugar (`@ZodBody(schema)`); explicit pipes are fine for now.
- Deleting the `deploy` script or `@nestjs/mau` from `package.json`; out of scope, left alone.

**Anti-goals** (would make this a failure even if it technically works)

- Reading `process.env` anywhere outside the config module.
- A secret or a `.env` file inside the Docker image or the repo.
- Stack traces or internal error messages reaching an HTTP client.
- `/health` failing because a dependency is down.
- Tests that boot `AppModule` differently from `main.ts` so they exercise a different app than
  production.

## 3. Constraints

From the spec (section 1, General Rules): no secrets in source control, automated tests in every
phase, documented decisions, prefer simplicity over extra technology.

From the repo as it stands:

| Constraint | Value |
|---|---|
| Framework | NestJS 12.1.x on Express, already installed |
| Module system | ESM (`"type": "module"`); relative imports need the `.js` suffix |
| TypeScript | 6.x, `experimentalDecorators` and `emitDecoratorMetadata` on |
| Test runner | Vitest 4 with `globals: true`; unit specs co-located, e2e in `test/` |
| Lint / format | oxlint, Prettier, already configured |
| Package manager | npm (lockfile is npm) |
| Node | 24 LTS, pinned (see §4.8). Local machine runs 26; use `nvm use` |
| Process | TDD per `.claude/skills/tdd-guardian`: red → green → refactor, no production code without a failing test |
| Working agreement | Every test and every code file is shown in chat and approved before it is written to disk |

## 4. Decisions

### 4.1 Layout

```
src/
  main.ts                        bootstrap only
  app.module.ts                  root module; imports config, logging, health; registers middleware
  app.setup.ts                   configureApp(app): the bits main.ts and e2e tests must share

  config/
    config.module.ts             wraps @nestjs/config; global; validates env on boot
    env.schema.ts                zod schema + Env type + validateEnv()

  common/
    logging/
      logging.module.ts          global; provides the pino instance and the Nest adapter
      pino-logger.adapter.ts     implements LoggerService, forwards to pino
      request-context.ts         requestContextStorage (AsyncLocalStorage<RequestContext>) and currentRequestId()
      request-id.middleware.ts   assigns / propagates x-request-id
      request-logger.middleware.ts   one summary line per finished request
    errors/
      error-response.ts          ErrorResponse { statusCode, body } and ErrorResponseBody
      reason-phrase.ts           reasonPhrase(statusCode) from node's STATUS_CODES
      http-exception.mapper.ts   mapHttpException(): Nest HttpException -> ErrorResponse
      exposed-http-error.mapper.ts   mapExposedHttpError(): body-parser style errors -> ErrorResponse
      health-check.mapper.ts     mapHealthCheckFailure(): terminus 503 result -> ErrorResponse
      resolve-error-response.ts  resolveErrorResponse(): tries the mappers in order, else generic 500
    filters/
      all-exceptions.filter.ts   the single global exception filter: resolve, log, send
    validation/
      zod-validation.pipe.ts     ZodValidationPipe(schema)

  health/
    health.module.ts             imports TerminusModule
    health.controller.ts         GET /health, GET /ready

test/
  setup.ts                       test-wide env (LOG_LEVEL=silent etc.)
  health.e2e-spec.ts
  errors.e2e-spec.ts
  validation.e2e-spec.ts

Dockerfile
.dockerignore
.env.example
.nvmrc
```

Rules: `config/` and `common/` are infrastructure with no business meaning. `health/` is the first
feature-shaped module. Later features (`shopify/`, `sync/`, `webhooks/`, `analytics/`) are
siblings of `health/`. A feature folder never imports from another feature folder; shared things
go through `common/` or a dedicated module.

The scaffold's hello-world files are deleted: `src/app.controller.ts`, `src/app.service.ts`,
`src/app.controller.spec.ts`, `test/app.e2e-spec.ts`. **(my call)**

### 4.2 Configuration: `@nestjs/config` + zod

- Environment variables are the only input. Locally they come from `.env` (gitignored); on AWS
  from the ECS task definition. The app does not know the difference.
- `env.schema.ts` is the single source of truth for which variables exist:

  | Variable | Type | Default | Notes |
  |---|---|---|---|
  | `NODE_ENV` | `development \| test \| production` | `development` | |
  | `PORT` | integer 1–65535 (coerced from string) | `3000` | |
  | `LOG_LEVEL` | `fatal \| error \| warn \| info \| debug \| trace \| silent` | `info` | `silent` exists for tests |

  Nothing else until a phase needs it. A variable not in the schema is not read anywhere.
- `validateEnv(raw)` runs `schema.safeParse`; on failure it throws an `Error` whose message lists
  each bad variable and why (one line per issue). `@nestjs/config`'s `validate` option calls it,
  so a bad environment stops `NestFactory.create` before anything listens.
- `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })`. When `NODE_ENV === 'test'`
  the module ignores `.env` (`ignoreEnvFile: true`) so tests never depend on a developer's local
  file; `test/setup.ts` sets what tests need. Vitest sets `NODE_ENV=test` by default.
- Consumers inject `ConfigService<Env, true>` and call `config.get('PORT')`; the second generic
  makes `get` return the inferred type, not `string | undefined`.
- `.env.example` is committed and lists every schema variable with a safe local value
  (`LOG_LEVEL=debug`).

### 4.3 Request validation: zod + a hand-written pipe

- `ZodValidationPipe` takes a `ZodType` in its constructor, runs `safeParse`, returns
  `result.data` on success, and on failure throws `BadRequestException` with body
  `{ message: 'Validation failed', issues: [{ path: 'a.b', message: '...' }] }`.
- Not registered globally (a zod schema is a value, not a class, so there is nothing to reflect).
  Used per parameter: `@Body(new ZodValidationPipe(Schema)) body: z.infer<typeof Schema>`.
- Zod objects strip unknown keys by default; that is the intended behaviour (equivalent to
  class-validator's whitelist mode).
- Phase 1 has no real inputs. The pipe is proven by a unit test and by an e2e test that registers
  a test-only controller inside the test file. No demo endpoint ships in `src/`. **(my call)**

### 4.4 Logging: pino behind a Nest `LoggerService` adapter

- Dependencies: `pino` (runtime), `pino-pretty` (dev only, for human-readable local output via a
  pipe, never configured inside the app).
- The pino instance is created once in `LoggingModule` with: `level` from `LOG_LEVEL`; `base`
  fields `service: 'commerce-intelligence'` and `env: NODE_ENV`; ISO timestamps
  (`pino.stdTimeFunctions.isoTime`); the level written as its string label
  (`formatters.level: (label) => ({ level: label })`) so CloudWatch queries read
  `level = "error"` rather than `level = 50`; pino's default `msg` key kept; `redact` for
  `req.headers.authorization` and `req.headers.cookie` (list grows in Phase 3); and a `mixin()`
  that reads the current request id from `AsyncLocalStorage` and adds `requestId` to every line
  logged during a request. **(my call, after builder check)**
- `context` values: Nest classes pass their own (`NestApplication`, `RoutesResolver`, …); the
  request logger uses `http`; the exception filter uses `AllExceptionsFilter`.
- `PinoLoggerAdapter implements LoggerService`. Mapping: Nest `log` → pino `info`, `error` →
  `error`, `warn` → `warn`, `debug` → `debug`, `verbose` → `trace`, `fatal` → `fatal`. Nest's
  trailing `context` argument becomes a `context` field.
- `main.ts` creates the app with `bufferLogs: true` and calls `app.useLogger(app.get(PinoLoggerAdapter))`
  so Nest's own startup lines come out as JSON too.
- `RequestIdMiddleware`: reads `x-request-id`; accepts it if it is 1–128 printable ASCII
  characters, otherwise generates `crypto.randomUUID()`; sets the response header; wraps `next()`
  in `als.run({ requestId }, ...)`. Runs first.
- `RequestLoggerMiddleware`: on the response `finish` event logs at `info`
  `{ method, path, statusCode, durationMs }` with message `request completed`. `path` is
  `req.path`, never `req.originalUrl` or the query string, because Phase 3 OAuth callbacks carry
  secrets in query parameters. Skips `/health` and `/ready` so probes do not flood CloudWatch.
  Runs second.
- Both are plain Express-style middleware functions registered with `app.use()` inside
  `configureApp` (§4.7), in that order, **before** `app.init()`. Not in `AppModule.configure()`:
  Nest registers its body parser before module middleware, so module middleware never runs for a
  malformed-JSON or oversized-body request, and those responses would lack a request id. Edge
  middleware registered on the raw app runs ahead of the body parser and sees everything.
  Middleware rather than interceptor because middleware sees every request, including 404s and
  requests a guard rejects; interceptors only see requests that reach a handler.
  **(my call, revised after builder check)**
- Local developer script: `npm run start:dev` keeps emitting JSON; a second script
  `npm run dev` pipes it through `pino-pretty`. Exact script name is **(builder's call)**.

### 4.5 Centralized error handling: one global filter

- `AllExceptionsFilter` decorated `@Catch()` (catches everything), registered as
  `{ provide: APP_FILTER, useClass: AllExceptionsFilter }` so it can inject the logger.
- Response shape, always:

  ```json
  { "statusCode": 400, "error": "Bad Request", "message": "Validation failed",
    "requestId": "…", "issues": [ { "path": "total", "message": "…" } ] }
  ```

  `issues` is present only when the thrown exception carried it. Nothing else is ever added from
  the exception.
- Mapping, in order:
  1. **Terminus health response.** A `ServiceUnavailableException` whose response object carries
     both `status` and `details` is a readiness result, not an API error. The filter sends that
     body with 503 and adds only `requestId`, so `/ready` keeps terminus's own shape (the reason
     terminus was chosen). **(my call, after builder check; `requestId` added in step 4 so the
     filter has no terminus branch)**
  2. **`HttpException`** keeps its status; `error` and `message` come from
     `exception.getResponse()` (string → `message`; object → its `message`, `error`, `issues`).
  3. **Express / body-parser errors.** A non-`HttpException` `Error` with a numeric
     `statusCode` in 400–599 and `expose === true` keeps that status and its message. This is what
     Nest's own base filter does and it covers malformed JSON (400) and oversized bodies (413)
     without inventing a 500. **(my call, after builder check)**
  4. **Anything else** → `500`, `error: 'Internal Server Error'`,
     `message: 'Internal server error'`.
- Logging: an unexpected error, meaning a status of 500 or above that is not an `HttpException`
  (the generic 500 fallback or a hidden http error), → `logger.error` with the exception as
  `err` (stack included). Any 4xx and any deliberately thrown `HttpException`, including a
  terminus 503, → `logger.warn` with the message as `reason`. Found in the step 7 boot check:
  with a status-only rule the shutdown 503 wrote a stack on every readiness probe. All include
  the request id via the mixin.
- Unknown routes are a `NotFoundException` thrown by Nest, so they flow through the same filter
  and get the same shape.

### 4.6 Health and readiness: `@nestjs/terminus`

- `GET /health` is **liveness**: returns `200 { "status": "ok" }` unconditionally while the
  process runs. Does not use terminus, checks nothing, is unaffected by shutdown state. Intended
  consumer: the ECS container health check (configured in Task 1.3).
- `GET /ready` is **readiness**: `@HealthCheck()` + `HealthCheckService.check([])`. With no
  indicators it returns terminus's standard `200 { status: 'ok', info: {}, error: {}, details: {} }`.
  After SIGTERM it returns `503` with `status: 'shutting_down'`; when an indicator fails (Phase 2
  onward) it returns `503` with terminus's `{ status: 'error', info, error, details }`. Terminus
  raises these as a `ServiceUnavailableException`; the global filter passes that body through
  untouched (§4.5 rule 1). Intended consumer: the ALB target group (Task 1.3). Phase 2 adds
  `PrismaHealthIndicator`.
- `TerminusModule.forRoot({ gracefulShutdownTimeoutMs: 5000 })` and `app.enableShutdownHooks()`
  in `configureApp`. The 5 s value is a starting point to be tuned against the ALB deregistration
  delay in Task 1.3. **(my call)**
- Neither endpoint requires auth. Both are excluded from request logging (§4.4).
- Verified against the registry on 2026-10-17: `@nestjs/terminus@12.1.0` declares
  `@nestjs/common ^11 || ^12` and lists `@prisma/client` as an optional peer.

### 4.7 Bootstrap

`src/app.setup.ts` exports `configureApp(app: INestApplication)` which, in order:

1. `app.useLogger(app.get(PinoLoggerAdapter))`
2. `app.use(requestIdMiddleware)` then `app.use(createRequestLoggerMiddleware(logger))`, where the
   logger comes from `app.get(...)`
3. `app.enableShutdownHooks()`

It must run before `app.init()` / `app.listen()` so the middleware lands ahead of Nest's body
parser (§4.4). `main.ts` is:

```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureApp(app);
await app.listen(app.get(ConfigService<Env, true>).get('PORT'));
```

E2E tests call `configureApp` on the app they create from `AppModule` before `app.init()`, so
they run the same logger, middleware, and filter as production. The filter is wired through
`APP_FILTER`; the middleware and logger are the only `main.ts`-side setup, and `configureApp` is
the single place they live.

### 4.8 Docker

- Multi-stage. Stage `build` on `node:24-alpine`: `npm ci`, copy sources and tsconfigs, `npm run
  build`, then `npm prune --omit=dev`. Stage `runtime` on `node:24-alpine`: `ENV NODE_ENV=production`,
  `USER node`, copy `dist`, pruned `node_modules`, and `package.json` from `build` with
  `--chown=node:node`, `EXPOSE 3000`, `CMD ["node", "dist/main.js"]`.
- No `HEALTHCHECK` instruction; ECS ignores it and the task definition defines the check in
  Task 1.3. **(my call)**
- No init process in the image; Node handles SIGTERM as PID 1. `initProcessEnabled` is an ECS
  option to revisit in Task 1.3 if needed.
- `.dockerignore`: `node_modules`, `dist`, `.git`, `.env*` (except `.env.example` is harmless but
  not needed), `coverage`, `docs`, `.claude`, `*.md`.
- `package.json` gets `"engines": { "node": "24.x" }`; `.nvmrc` contains `24`.
- Alpine note: musl rather than glibc. Prisma ships a musl query engine, so Phase 2 is covered.
  If a future native dependency misbehaves, switch the runtime stage to `node:24-slim`.

### 4.9 Tests

All written red first. Unit tests boot nothing from Nest where possible.

**Unit (`*.spec.ts`, co-located)**

| File | Behaviours |
|---|---|
| `config/env.schema.spec.ts` | accepts a valid env and returns typed values (PORT is a number); applies defaults; rejects a bad PORT, a bad LOG_LEVEL, a bad NODE_ENV; the error message names each bad variable |
| `common/validation/zod-validation.pipe.spec.ts` | returns parsed data; coerces per schema; strips unknown keys; throws `BadRequestException` whose response has `message: 'Validation failed'` and an `issues` array with `path` and `message` |
| `common/errors/http-exception.mapper.spec.ts` | maps status, error label and message; fills the label from the reason phrase when missing; a string response becomes the message; `issues` pass through; a non-`HttpException` gives undefined |
| `common/errors/exposed-http-error.mapper.spec.ts` | an exposed 4xx/5xx keeps its status and message; a non-exposed error or one outside 400–599 gives undefined |
| `common/errors/health-check.mapper.spec.ts` | a terminus result is kept as the body with 503; a plain 503 or a plain `Error` gives undefined |
| `common/errors/resolve-error-response.spec.ts` | unknown `Error` becomes the generic 500 with no details; a Nest exception uses its mapper; a terminus failure is kept intact (mapper order); a non-exposed http error becomes 500 |
| `common/filters/all-exceptions.filter.spec.ts` | sends the resolved status and body with `requestId`; sends a terminus body plus `requestId`; an unexpected error logs at error with `err`; a 4xx and a deliberate 5xx log at warn with `reason` |
| `common/logging/pino-logger.adapter.spec.ts` | each Nest level maps to the expected pino level; the context argument becomes the `context` field |
| `common/logging/logger.spec.ts` (the pino instance factory) | writes `level` as a string label and `time` as ISO; includes `service` and `env` base fields; redacts `authorization` and `cookie` headers; adds `requestId` when logging inside a request context and omits it outside |
| `common/logging/request-id.middleware.spec.ts` | uses a valid incoming id; replaces an invalid one; generates a UUID when absent; sets the response header; the id is visible via `AsyncLocalStorage` inside `next()` |
| `common/logging/request-logger.middleware.spec.ts` | logs one `info` line on `finish` with `method`, `path`, `statusCode`, `durationMs`, `context: 'http'`; logs `req.path` without the query string; logs nothing for `/health` and `/ready` |

The config module's "ignore `.env` under test" behaviour has no unit test; it is covered by the
e2e suite booting in CI where no `.env` exists.

**E2E (`test/*.e2e-spec.ts`, real app over HTTP, `configureApp` applied)**

| File | Behaviours |
|---|---|
| `health.e2e-spec.ts` | `GET /health` → 200 `{ status: 'ok' }`; `GET /ready` → 200 with terminus shape and `status: 'ok'` |
| `errors.e2e-spec.ts` | unknown route → 404 in the agreed shape with a `requestId`; the `x-request-id` request header is echoed in the response header and in the error body; a route that throws a plain `Error` (test-only controller) → 500 with the generic message and no stack; malformed JSON body → 400 in the agreed shape with a `requestId`; body over the parser limit → 413 in the agreed shape |
| `validation.e2e-spec.ts` | test-only `POST` route with a zod schema → valid body 201 with parsed data; invalid body 400 in the agreed shape with `issues` |

Test-only controllers are declared inside the test file and added to the testing module alongside
`AppModule`. `test/setup.ts` sets `LOG_LEVEL=silent` only (supertest binds its own ephemeral port,
so `PORT` is left to its default) and is referenced from both Vitest configs via `setupFiles`.

**Not automated:** the `/ready` → 503 `shutting_down` behaviour after SIGTERM belongs to
terminus, not to this code; this project only configures it. It is verified by hand against the
Docker image (§6) and the result is recorded in `task-1.1-questions.md`. **(my call, after
builder check)**

### 4.10 Documentation

```
docs/
  Boris-ing.md                 the assignment
  phase-1/
    task-1.1-design.md         this file
    task-1.1-questions.md      answers to the seven questions, written after the code
```

## 5. Build order

One piece at a time. Each piece: show the failing test in chat → approval → write it → run it red
→ show the implementation in chat → approval → write it → run it green → run the whole suite.

1. Remove hello-world files; add `.nvmrc`, `engines`, `.env.example`; install `@nestjs/config`,
   `@nestjs/terminus`, `zod`, `pino`, `pino-pretty`.
2. `config/`: schema, `validateEnv`, module.
3. `common/logging/`: request context, pino instance, adapter, both middlewares, module.
4. `common/errors/`: type, reason phrase, three mappers, resolver; then `common/filters/`: the
   exception filter.
5. `common/validation/`: the pipe.
6. `health/`: module and controller.
7. `app.module.ts`, `app.setup.ts`, `main.ts`; `test/setup.ts`; the three e2e files.
8. `Dockerfile`, `.dockerignore`; build and run the container locally, curl both endpoints.

Commits happen when the author says so.

## 6. Done when

- `npm run lint`, `npx tsc --noEmit`, `npm test`, and `npm run test:e2e` all pass.
- `npm run build` succeeds and `node dist/main.js` serves `/health` and `/ready`.
- `docker build -t commerce-intelligence .` succeeds; `docker run -p 3000:3000 --env-file .env`
  serves both endpoints; the container runs as `node`, not root.
- Starting with `PORT=abc` exits non-zero with a message naming `PORT`.
- A request with `x-request-id: test-123` gets that header back, and an error response carries it
  in the body.
- Manual SIGTERM check: with the container running, `docker kill -s TERM <id>` and then, within
  5 seconds, `curl -i localhost:3000/ready` returns 503 with `"status":"shutting_down"`, and the
  container exits 0 afterwards.
- `docs/phase-1/task-1.1-questions.md` exists with answers to all seven questions.

## 7. Left to the builder

- Pino options beyond those named in §4.4, and whether the pino instance is a plain provider
  token or a class.
- Internal helper names and file-level organisation inside each folder, as long as the public
  files in §4.1 exist.
- The dev script name for the pretty-printed log pipe.
- How `test/setup.ts` is wired into the two Vitest configs.
- Whether `PinoLoggerAdapter` is also exported for direct injection into application services, or
  services use Nest's `Logger` class with `useLogger` routing it; either satisfies this design.
