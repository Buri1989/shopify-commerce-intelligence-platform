# Task 1.1 — Questions to investigate

Answers reflect the decisions made in this task. The full alternatives and trade-offs are in
`task-1.1-design.md`.

## 1. Why NestJS? What are its advantages and disadvantages?

NestJS is an opinionated Node.js framework built on TypeScript. It provides a module system,
dependency injection and a request pipeline (middleware, guards, pipes, interceptors, filters)
out of the box, so a team does not invent those conventions per project.

Advantages:

- Structure by default. Modules, providers and controllers keep a multi-tenant app with many
  features navigable as it grows.
- Testability. Dependency injection lets every unit be tested with fakes; the 60 unit tests in
  this task boot nothing from Nest.
- Ecosystem. `@nestjs/config`, `@nestjs/terminus` and `@nestjs/testing` covered the foundation
  directly.
- Transport-agnostic. The same module graph can serve HTTP, queues or WebSockets, which matters
  for Shopify webhooks and background sync in later phases.

Disadvantages:

- Heavier than Express or Fastify alone: more concepts, decorator metadata, slower cold start.
- Decorator-based DI depends on TypeScript-only compiler features (`experimentalDecorators`,
  `emitDecoratorMetadata`) outside the ECMAScript standard.
- Its default conventions do not always fit. This task chose zod with per-parameter pipes over
  the class-validator global pipe.

Chosen because the assignment grows across six phases, and the structure pays for its weight.

## 2. What is dependency injection?

A class declares what it needs in its constructor and receives it from outside instead of
creating it. Nest's injector builds the object graph once at boot and hands each class its
collaborators.

Effect: `AllExceptionsFilter` asks for the application logger by token and never knows how pino
is configured. In tests the same constructor receives a fake logger, with no module mocking.
`LoggingModule` is the single place that builds the real logger from config.

## 3. What is the difference between controllers, services, and repositories?

- **Controller**: the HTTP edge. Maps a route and request to a call and a response. Holds no
  business rules. `HealthController` has two routes and no logic.
- **Service**: the business rules. Knows nothing about HTTP; takes typed inputs, returns typed
  results, throws domain exceptions. Unit-tested without a server.
- **Repository**: the data boundary. Translates between domain objects and the database (Prisma
  from Phase 2). Services depend on its interface, so the store can be swapped or faked.

Dependencies point inward: controller → service → repository, never the reverse.

## 4. What makes a REST API well-designed?

- Resources as nouns, HTTP verbs as actions, status codes with their standard meaning.
- One error shape everywhere. Here: `{ statusCode, error, message, requestId, issues? }`, with a
  request id the client can quote back.
- Validation at the edge with specific messages. A 400 lists every invalid field with its path.
- Nothing internal leaks. Unexpected errors are a generic 500; the stack goes to the log.
- Additive evolution. Add fields and endpoints; never change the meaning of existing ones.
- Idempotent writes where retries happen (webhooks, sync jobs), so a replay does not double-apply.
- Predictable collections: pagination, filtering, consistent naming.

## 5. What are middleware, guards, and interceptors?

All three sit on the request path at different points, with different jobs:

- **Middleware** runs first, on the raw request, before routing. It sees every request, including
  404s and malformed bodies. Used here for request ids and the request log line, registered with
  `app.use` ahead of Nest's body parser.
- **Guards** run after routing and before the handler, and answer one question: may this request
  proceed? Authentication and tenant checks belong here (Phase 3).
- **Interceptors** wrap the handler. They transform the response, add timing or cache. They only
  see requests that reached a handler.

Pipes (validate or transform one parameter) and exception filters (turn a thrown error into a
response) complete the pipeline. Choose by what the code needs to see: everything → middleware;
the route and the user → guard; the handler's result → interceptor.

## 6. How should an application handle configuration across environments?

- Configuration comes from the environment, never from source. One image runs everywhere with
  different variables.
- Validate at boot and fail fast. An invalid or missing value stops the process with a message
  naming the variable, before it can serve traffic. A zod schema validates `NODE_ENV`, `PORT`
  and `LOG_LEVEL` here.
- Typed access. Consumers read `config.get('PORT')` as a number, not a possibly undefined string.
- Secrets are not config files. In AWS they come from Secrets Manager or SSM at runtime (Task 1.3
  onward); locally from an untracked `.env`. `.env.example` documents every variable with a safe
  local value.
- Tests ignore `.env` and set what they need, so a developer's local file cannot change a result.

## 7. Why are health and readiness endpoints different?

They answer different questions for different consumers.

- **Health (liveness)**: is the process alive? `/health` returns 200 as long as the process runs.
  On failure the orchestrator restarts the container. It must not depend on anything external,
  or a database outage would restart every container at once.
- **Readiness**: can this instance take traffic right now? `/ready` answers through terminus. It
  returns 503 while a dependency is down (Phase 2 adds the database check) and during shutdown.
  On failure the load balancer stops routing to the instance but does not restart it.

Verified on the Docker image in this task: after SIGTERM, `/ready` returns 503 `shutting_down`
while `/health` stays 200, the container keeps serving for the configured 5 seconds so the load
balancer can drain, then exits with code 0.

## Why we picked what we picked

Short reasons for each Task 1.1 decision. The alternatives and trade-offs in full are in
`task-1.1-design.md`.

- **NestJS over plain Express or Fastify.** The assignment grows to six phases with many
  modules; Nest's module system and dependency injection keep that navigable and testable.
  See question 1.
- **zod over class-validator for validation.** One schema gives both the runtime check and
  the TypeScript type, so a request type cannot drift from its validation. class-validator
  needs a class per DTO and a second library for transformation. Used per parameter, not as
  a global pipe, because a zod schema is a value with nothing for Nest to reflect on.
- **zod for environment validation too.** Same reason, same library. The env schema is the
  one list of variables the app reads; a bad value stops the boot naming the variable.
- **pino over Nest's built-in logger or winston.** Pino writes JSON lines by default, which
  CloudWatch can query by field, and it is the fastest of the three. Nest's logger prints
  for humans; winston needs more setup to reach the same output. Nest's own startup lines are
  routed through pino so there is one log format, not two.
- **Request id through AsyncLocalStorage.** It lets the logger stamp the id on every line
  without passing it as an argument through every call, and it works for lines Nest itself
  writes.
- **Edge middleware with `app.use`, not Nest module middleware.** Nest registers its body
  parser before module middleware, so a malformed or oversized body would never reach ours.
  Registering on the raw app before `init` puts us ahead of the parser.
- **One global exception filter.** Every error, including ones Nest throws for unknown
  routes, becomes one response shape. Clients and the log parse one format.
- **Nest-style error body over RFC 9457 Problem Details.** Problem Details adds `type` and
  `instance` URIs that nobody here consumes yet. The Nest shape plus `requestId` and
  `issues` gives the client the message it needs and keeps the built-in exceptions
  compatible. Easy to move to Problem Details later by adding fields, not changing them.
- **Mappers plus a resolver inside the filter.** Each error source we do not own (Nest
  exceptions, body-parser errors, terminus results) gets its own small adapter into our
  shape. Adding a source means adding a file, not editing the filter.
- **terminus over a hand-written readiness check.** It already handles the shutdown flip to
  503 and ships a Prisma indicator for Phase 2. Writing that ourselves would be code to
  maintain with no advantage.
- **Separate `/health` and `/ready`.** Different consumers, different questions. See
  question 7.
- **Node 24 LTS, pinned.** The current LTS line gets security fixes for years; the local
  machine's Node 26 is not LTS yet. Pinned with `.nvmrc` and `engines` so every environment
  runs the same major version.
- **Two-stage Docker image on Alpine.** The build stage carries the compiler and dev tools;
  the runtime stage carries only the compiled app and production dependencies, runs as a
  non-root user, and is small. Alpine's musl is fine for Prisma, which ships a musl engine.
- **Vitest.** Already in the scaffold, native ESM and TypeScript, fast. No reason to swap it
  for Jest.
- **Unit tests that boot nothing from Nest.** Pure functions and hand-built fakes run in
  milliseconds and fail for one reason. The e2e suite covers the HTTP contract over the real
  app.
