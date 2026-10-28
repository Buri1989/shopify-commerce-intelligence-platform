# Task 1.1 — Questions to investigate

Short answers. Alternatives and trade-offs are in `task-1.1-design.md`.

## 1. Why NestJS? What are its advantages and disadvantages?

A TypeScript framework with modules, dependency injection and a request pipeline built in.

Advantages:

- Structure that holds up across many modules.
- Testable: dependency injection lets every unit take fakes.
- `@nestjs/config`, `@nestjs/terminus` and `@nestjs/testing` cover the foundation.
- The same modules can serve HTTP, queues or WebSockets.

Disadvantages:

- Heavier than Express or Fastify: more concepts, slower cold start.
- Relies on TypeScript-only decorator features.
- Some defaults do not fit; we chose zod over class-validator.

Chosen because six phases of features need the structure.

## 2. What is dependency injection?

A class names what it needs in its constructor and gets it from outside. Nest builds the object
graph once at boot.

Example: `AllExceptionsFilter` asks for the logger by token. In tests it gets a fake, with no
module mocking.

## 3. What is the difference between controllers, services, and repositories?

- **Controller**: HTTP in, HTTP out. No business rules.
- **Service**: the business rules. No HTTP. Unit-tested without a server.
- **Repository**: the database boundary. Services depend on its interface, so it can be faked.

Dependencies go controller → service → repository, never back.

## 4. What makes a REST API well-designed?

- Nouns for resources, HTTP verbs for actions, standard status codes.
- One error shape everywhere: `{ statusCode, error, message, requestId, issues? }`.
- Validation at the edge. A 400 names every bad field.
- Nothing internal leaks. Unexpected errors are a generic 500; the stack goes to the log.
- Additive changes only.
- Idempotent writes where retries happen.
- Pagination and filtering on collections.

## 5. What are middleware, guards, and interceptors?

- **Middleware**: runs before routing, sees every request. Used for request ids and the request
  log line.
- **Guards**: run after routing, before the handler. Answer one question: may this request
  proceed? Auth lives here.
- **Interceptors**: wrap the handler. Transform the response, add timing or caching.

Pipes validate one parameter. Exception filters turn a thrown error into a response.

## 6. How should an application handle configuration across environments?

- From the environment, never from source. One image, different variables.
- Validated at boot with zod. A bad value stops the process and names the variable.
- Typed access through `ConfigService`.
- Secrets come from AWS at runtime, locally from an untracked `.env`. `.env.example` lists
  every variable.
- Tests ignore `.env`.

## 7. Why are health and readiness endpoints different?

- `/health`: is the process alive? 200 while it runs. Depends on nothing external. Failure
  restarts the container.
- `/ready`: can it take traffic now? 503 while a dependency is down or during shutdown. Failure
  stops traffic, no restart.

Verified on the image: after SIGTERM `/ready` is 503, `/health` stays 200, the container drains
for 5 seconds, then exits 0.

## Why we picked what we picked

- **NestJS**: structure for six phases. See question 1.
- **zod over class-validator**: one schema gives the check and the type. Per parameter, because
  a zod schema is a value Nest cannot reflect on.
- **zod for env**: same library. A bad value stops the boot.
- **pino**: JSON lines CloudWatch can query, and the fastest. Nest's own lines go through it, so
  there is one format.
- **Request id via AsyncLocalStorage**: every log line carries it without passing it around.
- **`app.use` before `init`**: Nest's body parser runs before module middleware. This puts ours
  ahead of it.
- **One global exception filter**: one response shape for every error.
- **Nest-style error body over RFC 9457**: nobody consumes `type` and `instance` yet. Fields can
  be added later.
- **Mappers plus a resolver**: a new error source is a new file, not a filter edit.
- **terminus**: handles the shutdown 503 and ships database indicators.
- **Separate `/health` and `/ready`**: see question 7.
- **Node 24 LTS**: pinned in `.nvmrc` and `engines`.
- **Two-stage Alpine image**: runtime stage carries only the compiled app, runs non-root.
- **Vitest**: in the scaffold, native ESM and TypeScript.
- **Unit tests boot nothing from Nest**: fast, fail for one reason. E2E covers HTTP.
