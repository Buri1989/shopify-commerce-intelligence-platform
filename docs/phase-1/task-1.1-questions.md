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
