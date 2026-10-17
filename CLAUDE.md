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
  `docs/phase-N/task-N.M-questions.md`: short, professional, tied to what was built.

## The gate

```bash
npm test && npm run test:e2e && npx tsc --noEmit && npm run lint && npm run format
```

All of it passes before a step is called done. `npm test` does not type-check; always
run `tsc` separately.

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
