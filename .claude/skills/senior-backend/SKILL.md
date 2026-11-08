---
name: senior-backend
description: Code-quality checklist and backend practices distilled from Clean Code and Designing Data-Intensive Applications. Use when writing or reviewing backend, server, or API code — implementing endpoints, services, data access, business logic, or refactoring existing server code. Enforces naming, function size, error handling, code organization, duplication, and API-evolution rules.
---

# Senior Backend

Apply this checklist while WRITING code, not after. Each item names its deep-dive section.

## The Checklist

**Names** — intention-revealing; no disinformation; searchable; no encodings. → [clean-code.md#naming](references/clean-code.md#naming)
**Functions** — small, one purpose, one abstraction level, ≤3 params, no flag arguments, no hidden side effects. → [clean-code.md#functions](references/clean-code.md#functions)
**Duplication** — rule of three: extract on the third occurrence, not the first.
**Organization** — public API first, private helpers after; no nested function definitions (small inline callbacks excepted); one responsibility per module.
**Errors** — fail fast; exceptions not return codes; never swallow; message carries operation + input + suggested fix; errors as types. → [clean-code.md#error-handling](references/clean-code.md#error-handling)
**Objects vs data structures** — per type pick one: behavior-hiding object or transparent data. No hybrids. → [clean-code.md#objects-vs-data-structures](references/clean-code.md#objects-vs-data-structures)
**Comments** — only WHY; refactor instead of explaining WHAT; delete commented-out code. → [clean-code.md#comments](references/clean-code.md#comments)
**Tests** — behavior not implementation; edges and error paths; one concept per test. → [clean-code.md#unit-tests](references/clean-code.md#unit-tests)
**Boundaries** — wrap third-party APIs behind your own interface; validate external data at the edge into typed shapes, trust types inward. → [clean-code.md#third-party-boundaries](references/clean-code.md#third-party-boundaries)
**API & data** — evolve endpoints additively; idempotent writes; pick isolation level deliberately. → [api-data-practices.md](references/api-data-practices.md)

## When reviewing

Walk the checklist top to bottom against the diff. Report violations with file:line and the checklist item name.
