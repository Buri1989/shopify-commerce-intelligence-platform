# Task 1.1 — Questions to investigate

Short answers in plain words, so that they can be explained to the next person. Alternatives and
trade-offs are in `task-1.1-design.md`.

## 1. Why NestJS? What are its advantages and disadvantages?

NestJS is a framework for building server applications in TypeScript. It gives the app a
structure out of the box: the code is split into modules, every class says what it needs and
gets it handed in (dependency injection, question 2), and every request passes through a fixed
pipeline of steps on its way to our code.

Advantages:

- The structure holds up when the app grows to many modules; every module looks the same.
- It is easy to test. Every class gets its dependencies handed in, so a test can hand in fakes.
- The official packages cover the foundation: `@nestjs/config` for settings, `@nestjs/terminus`
  for health checks, `@nestjs/testing` for tests.
- The same modules can later serve HTTP, queues or WebSockets.

Disadvantages:

- Heavier than Express or Fastify: more concepts to learn, and the process takes longer to start.
- It leans on decorators, a TypeScript feature that plain JavaScript does not have.
- Some of its defaults did not fit us; we chose zod instead of class-validator for validation.

We chose it because six phases of features need the structure.

## 2. What is dependency injection?

A class names what it needs in its constructor and gets it from outside, instead of creating it
itself. Nest builds the whole set of objects once, when the app starts, and hands each class what
it asked for.

Example: `AllExceptionsFilter`, the class that turns a thrown error into a response, asks for the
logger by a token, a name. In tests it gets a fake logger, with no module mocking.

## 3. What is the difference between controllers, services, and repositories?

- **Controller**: takes the HTTP request in and sends the HTTP response out. No business rules.
- **Service**: holds the business rules. It knows nothing about HTTP, so it is unit-tested
  without a server.
- **Repository**: the boundary to the database. A service depends on the repository's interface,
  not on its code, so a test can swap in a fake.

Dependencies go one way: controller → service → repository, never back.

## 4. What makes a REST API well-designed?

- Nouns for resources, HTTP verbs for actions, the standard status codes.
- One error shape on every endpoint, so a client handles every failure the same way.
- Validation at the edge, where the request comes in. A 400 names every bad field.
- Nothing internal leaks. An unexpected error becomes a generic 500; its stack trace goes to the
  log, not to the client.
- Changes only add. Nothing a client relies on is removed or renamed.
- A write that may be retried is idempotent: sending the same request twice has the effect of
  sending it once.
- Lists are paginated and can be filtered.

## 5. What are middleware, guards, and interceptors?

Three kinds of code that run around a request, at different points.

- **Middleware** runs first, before Nest has decided which handler the request goes to, and
  sees every request. We use it for the request id and the request log line.
- **Guards** run after routing, before the handler. They answer one question: may this request
  proceed? Authentication lives here.
- **Interceptors** wrap the handler: code before it and after it. Used to transform the
  response, add timing or caching.

Two more: a pipe validates one parameter, and an exception filter turns a thrown error into a
response.

## 6. How should an application handle configuration across environments?

- Keep settings outside the code, in environment variables, so one build runs everywhere with
  different values.
- Validate them when the app starts. A bad value stops the process at once and names the variable,
  instead of failing later on a real request.
- Read them through one typed module, not `process.env` scattered through the code.
- Keep secrets out of the repository: a secret store in production, an untracked file locally, and
  an example file that lists every variable without values.
- Tests do not read a developer's local settings.

In this project, zod validates the variables, `ConfigService` reads them, and `.env.example` lists
them.

## 7. Why are health and readiness endpoints different?

- `/health` answers "is the process alive?". It returns 200 as long as the process runs, and it
  depends on nothing outside the app. When it fails, the platform restarts the container.
- `/ready` answers "can it take traffic right now?". It returns 503 while a dependency is down
  or while the app is shutting down. When it fails, the platform stops sending traffic, with no
  restart.

Verified on the built image: after the stop signal, SIGTERM, `/ready` returns 503 while
`/health` stays 200, the container keeps answering the requests in flight for 5 seconds, then
exits with code 0.

## Why we picked what we picked

- **NestJS.** Structure for six phases of features. Question 1.
- **zod instead of class-validator for request validation.** One zod schema gives both the
  check and the TypeScript type, so a shape is written once. It is applied per parameter, not as
  a global pipe: Nest's global validation reads the class of a parameter to learn its shape, and
  a zod schema is a value, not a class, so there is nothing for it to read.
- **zod for the environment too.** The same library; a bad value stops the boot.
- **pino for logging.** It writes JSON lines that CloudWatch can query, and it is the fastest
  Node logger. Nest's own log lines are routed through it, so there is one format.
- **The request id kept in AsyncLocalStorage.** A per-request store that Node provides; every
  log line of a request carries the id without passing it from function to function.
- **Our middleware registered with `app.use` before `init`.** Nest's body parser runs before
  module middleware; registering ours this way puts it ahead of the parser.
- **One global exception filter.** One response shape for every error.
- **Nest's error body rather than RFC 9457, "problem details".** Nobody consumes its `type` and
  `instance` fields yet; fields can be added later.
- **Mappers plus a resolver for errors.** Each source of errors has its own small mapper; a new
  source is a new file, not an edit to the filter.
- **terminus for health.** It handles the 503 during shutdown and ships ready-made database
  indicators for Phase 2.
- **Separate `/health` and `/ready`.** Question 7.
- **Node 24 LTS.** Pinned in `.nvmrc` and in `engines`.
- **A two-stage Alpine image.** One stage installs and compiles; the runtime stage carries only
  the compiled app and runs as a non-root user.
- **Vitest.** It came with the scaffold and runs ESM and TypeScript natively.
- **Unit tests boot nothing from Nest.** Fast, and they fail for one reason. E2E tests cover
  HTTP.
