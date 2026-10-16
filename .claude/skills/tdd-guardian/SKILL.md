---
name: tdd-guardian
description: "Enforces Red-Green-Refactor TDD discipline for this NestJS + Vitest backend and helps maintain a stable, tested codebase. Use this skill whenever the user is writing tests, asks about testing strategy, wants to add a feature test-first, is debugging failing tests, or mentions TDD, test coverage, test stability, or 'tests are broken'. Also trigger when the user says 'write tests for this', 'how should I test this', 'tests keep failing', or is about to commit code that changes behavior. If someone is writing code without tests or has a failing test suite, this skill should fire immediately."
---

# TDD Guardian — Red-Green-Refactor

You are helping maintain a codebase where tests are first-class citizens. The discipline is simple: never write production code without a failing test that demands it. This isn't dogma — it's the fastest path to code that works and stays working.

## The Cycle

```
   ┌──────────┐
   │   RED    │  Write a failing test that describes the behavior you want
   └────┬─────┘
        ↓
   ┌──────────┐
   │  GREEN   │  Write the minimum code to make it pass
   └────┬─────┘
        ↓
   ┌──────────┐
   │ REFACTOR │  Clean up — tests must stay green
   └────┬─────┘
        ↓
     (repeat)
```

### Why This Order Matters
- **RED first** proves the test actually tests something. A test that passes immediately might be testing nothing.
- **GREEN minimally** prevents over-engineering. You build exactly what's needed.
- **REFACTOR with green tests** gives you a safety net. If you break something, you know immediately.

## Project Test Setup

- **Runner:** Vitest with `globals: true` — `describe`, `it`, `expect`, `vi` need no import.
- **Unit tests:** `*.spec.ts`, co-located next to the source (`orders.service.ts` → `orders.service.spec.ts`). Run with `npm test`.
- **E2E tests:** `test/*.e2e-spec.ts`, boot the real Nest app and hit it over HTTP with `supertest`. Run with `npm run test:e2e`.
- **ESM:** the package is `"type": "module"` — relative imports need the `.js` suffix (`import { OrdersService } from './orders.service.js'`).
- **Watch mode while doing TDD:** `npm run test:watch`.

## Practical TDD with Vitest + @nestjs/testing

### Testing Patterns by Layer

**Pure functions / domain logic** — the easiest, start here. No Nest, no DI:
```ts
// RED: write the test
import { calculateGrossMargin } from './margin.js';

describe('calculateGrossMargin', () => {
  it('returns margin as a fraction of revenue', () => {
    expect(calculateGrossMargin({ revenue: 200, cost: 150 })).toBe(0.25);
  });

  it('returns 0 when there is no revenue', () => {
    expect(calculateGrossMargin({ revenue: 0, cost: 0 })).toBe(0);
  });
});

// GREEN: implement
export function calculateGrossMargin({ revenue, cost }: { revenue: number; cost: number }): number {
  if (revenue === 0) return 0;
  return (revenue - cost) / revenue;
}
```

**Services** — build a testing module and replace dependencies at the boundary with fakes:
```ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrdersService } from './orders.service.js';
import { ORDERS_REPOSITORY, OrdersRepository } from './orders.repository.js';

describe('OrdersService', () => {
  let service: OrdersService;
  let repository: OrdersRepository;

  beforeEach(async () => {
    repository = { findByShop: vi.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [OrdersService, { provide: ORDERS_REPOSITORY, useValue: repository }],
    }).compile();

    service = moduleRef.get(OrdersService);
  });

  it('sums order totals for a shop', async () => {
    vi.mocked(repository.findByShop).mockResolvedValue([{ total: 10 }, { total: 15 }]);

    expect(await service.totalRevenue('shop-1')).toBe(25);
  });

  it('throws NotFoundException when the shop has no orders', async () => {
    vi.mocked(repository.findByShop).mockResolvedValue([]);

    await expect(service.totalRevenue('missing')).rejects.toThrow(NotFoundException);
  });
});
```

**Controllers** — keep them thin; test only the mapping from request to service call and from result to response. Business rules belong in services and are tested there.

**HTTP behavior (E2E)** — boot the real module graph, swap only external boundaries with `overrideProvider`, and assert on status codes, response bodies, validation, and guards:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { SHOPIFY_CLIENT } from '../src/shopify/shopify.client.js';

describe('GET /shops/:id/revenue (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SHOPIFY_CLIENT)
      .useValue({ fetchOrders: vi.fn().mockResolvedValue([{ total: 10 }]) })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns the shop revenue', () => {
    return request(app.getHttpServer()).get('/shops/shop-1/revenue').expect(200).expect({ revenue: 10 });
  });

  it('rejects an invalid date range with 400', () => {
    return request(app.getHttpServer()).get('/shops/shop-1/revenue?from=not-a-date').expect(400);
  });
});
```
Apply the same global pipes, filters, and interceptors as `main.ts`, otherwise E2E tests exercise a different app than production.

### What to Test (and What to Skip)

**Always test:**
- Business logic: calculations, aggregations, transformations, filtering
- API contract: status codes, response shapes, pagination
- Validation: invalid DTOs return 400 with a useful message; valid ones pass
- Auth: guards reject unauthenticated or unauthorized requests
- Error paths: what happens when the database, Shopify, or another dependency fails
- Edge cases: empty lists, null values, boundary dates, currency rounding
- Idempotency: replaying a webhook or write does not double-apply it

**Skip:**
- Implementation details: private methods, how many times an internal helper was called
- Framework internals: don't test that Nest injects providers or that decorators register routes
- Trivial pass-through: a controller method that only forwards to a service (E2E covers it)
- Third-party library internals: test your adapter around them, not the library
- Snapshot tests (in most cases): they break on every change and test nothing specific

## Keeping Tests Fast and Stable

### Speed
- Push logic into plain functions and services — unit tests that don't boot Nest run in milliseconds
- Use E2E tests for the HTTP contract, not for every branch of business logic
- Mock external calls at the boundary — never hit the real Shopify API or any network in tests
- Build the smallest testing module that covers the unit — import only what it needs, not `AppModule`

### Stability
- No shared mutable state between tests — each test builds its own module and data in `beforeEach`
- Always `await app.close()` in `afterEach` so connections and timers don't leak between tests
- Fake time with `vi.useFakeTimers()` / `vi.setSystemTime()` instead of depending on the real clock
- Reset mocks between tests (`vi.restoreAllMocks()`, or `restoreMocks: true` in the Vitest config)
- For database tests, use a dedicated test database and a clean state per test (transaction rollback or truncate)

### Faking Dependencies
Prefer replacing the dependency you own over patching modules:
1. **Provider override** — `{ provide: TOKEN, useValue: fake }` or `.overrideProvider(TOKEN)` — best: works with DI and keeps tests honest about boundaries
2. **Hand-written fake class** implementing the same interface — when the fake needs real behavior (an in-memory repository)
3. **`vi.fn()` / `vi.spyOn()`** — for simple stubs and checking that a side effect happened
4. **`vi.mock()` module mocking** — last resort only; it usually means a dependency isn't injected

## The Golden Rules

1. **Never commit with failing tests.** If a test is broken, fix it or delete it — don't skip it.
2. **Never write production code without a failing test.** The test is your specification.
3. **One assertion per behavior.** A test can have multiple `expect` calls if they verify one logical behavior, but don't test unrelated things together.
4. **Tests are documentation.** A new developer should understand the feature by reading the test descriptions.
5. **If it's hard to test, the code design is wrong.** Difficulty testing is a signal to restructure, not to write a more complex test.

## Workflow When Adding a Feature

1. **Write a failing test** for the simplest case of the new behavior
2. **Run it** — confirm it fails (RED) and fails for the right reason
3. **Write the minimum code** to make it pass (GREEN)
4. **Run all tests** — confirm nothing else broke
5. **Refactor** if needed — tests stay green
6. **Add the next test** for the next behavior/edge case
7. **Repeat** until the feature is complete

## Checklist Before Committing

- [ ] All unit tests pass (`npm test`)
- [ ] All E2E tests pass (`npm run test:e2e`)
- [ ] New behavior has tests (RED → GREEN → REFACTOR)
- [ ] No skipped or focused tests (`it.skip`, `describe.skip`, `it.only`)
- [ ] Tests describe behavior, not implementation
- [ ] No real network calls, hardcoded timeouts, or sleeps in tests
- [ ] Tests run independently (no order dependency)
