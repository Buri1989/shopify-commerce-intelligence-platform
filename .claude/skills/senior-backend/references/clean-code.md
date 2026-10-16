# Clean Code

## Naming

- Names reveal intent: `customerOrderTotal`, never `x` or `data2`. If a name needs a comment, the name failed.
- Never disinform: a name must not suggest a different behavior than the code has (`productList` that is not a List).
- Distinctions must mean something: `productData` vs `productInfo` is noise; rename to the actual difference.
- Pronounceable and searchable: no `genymdhms`; single-letter names only as loop indices in tiny scopes.
- No encodings: no Hungarian (`strName`, `iCount`), no member prefixes (`m_`), no `I` interface prefix.
- One word per concept per codebase: pick `fetch` OR `retrieve` OR `get` and stick to it.
- Classes are nouns describing what they represent (`InvoicePrinter`, not `Manager` or `Processor`); methods are verbs describing the action performed.

**Smells:** name needs a comment; grep for the name returns unrelated hits; two names differ only by a noise word; a class name ending in `Manager`/`Processor`/`Data`.

## Functions

- Keep functions small — a few lines, not a screen. Size drives clarity: a compact function's purpose is obvious at a glance.
- Do one thing. One function, one reason to change (SRP applied to functions, not just classes).
- Avoid deep indentation and nesting; keep the body flat.
- Name functions with verbs that state the action: `calculateTotalOrderAmount()`, not `processData()`.
- At most 3 arguments. Past that, encapsulate them into a single object/dataclass.
- No boolean flag arguments — a flag means the function branches into two behaviors; split it into two functions.
- Error handling is one shape per function: either return an error value or throw, never both in the same function.

**Smells:** a function you must scroll to read; nesting past 2-3 levels; a `boolean` or `enable*` parameter; a signature with 4+ positional args; a function that sometimes returns `null`/error code and sometimes throws.

## Comments

- A comment is never a fix for confusing code — refactor the code instead of explaining it.
- Well-written code is self-documenting; that's the bar, not an aspiration.
- Never let a comment drift from the code — a comment that contradicts what's beneath it is worse than no comment.
- Delete comments that just restate the next line; they add no information and rot immediately.
- Comment the why (a business rule, a constraint that forced this shape), never the how (the mechanics the code already shows).
- Legal notices and short-lived workaround notes are the narrow exception — keep them rare, not the default.
- Delete dead code and its comments together; unused code left "for reference" is clutter and a lie waiting to happen.

**Smells:** comment restates the line below it; comment contradicts the code; commented-out code left in the file; a comment describing loop mechanics instead of the business reason for the loop.

## Formatting

- Formatting is not up for debate in review — wire an automated formatter (oxfmt/prettier-equivalent) and stop discussing style in PRs.
- Vertical: consistent blank-line spacing between logical blocks; break lines that force horizontal scrolling.
- Indentation is the visual map of nesting — one consistent style, applied everywhere, so scope is legible at a glance.
- Horizontal: consistent spacing/alignment within a line; break long expressions across lines without creating ambiguity about precedence or grouping.
- IDE code folding is a navigation aid, not a substitute for code that's actually well-formatted underneath.

**Smells:** formatting nitpicks in code review (push it into the formatter config instead); a file mixing indentation styles; a line that requires horizontal scroll to read.

## Objects vs Data Structures

- Objects hide data behind methods and expose behavior — reach for objects when the point is what the thing does.
- Data structures expose data directly and carry no real behavior — reach for them when the point is direct manipulation of the data (procedural code, DTOs, wire payloads).
- Trade-off is structural: objects make it easy to add a new behavior (new subclass/method) but touch every class to add a new operation; data structures make it easy to add a new operation but touch every function to add a new field/variant.
- Law of Demeter: talk only to your immediate collaborators, never reach through them (`a.getB().getC().doThing()` is a violation).
- No hybrids — a half-object/half-data-structure type is the worst of both worlds (hard to add functions AND hard to add types). Decide deliberately per type; don't force one paradigm on everything.

**Smells:** `a.getB().getC()` chains; a "class" that's all getters/setters and no behavior pretending to be an object; a `switch`/`if` on a type tag repeated across many functions instead of one place.

## Error Handling

- Exceptions are for exceptional conditions, never for normal control flow — don't replace `if/else` with `try/catch`.
- Prefer specific/custom exception types over generic ones; they should carry precise, actionable context.
- Fail fast: raise as soon as an invalid state is detected instead of letting the program continue on bad data.
- Wrap external dependencies (DB, network, third-party API) behind your own class so error handling has exactly one place to live.
- Never return `null` to signal an error — it relocates the crash to a NullPointerException downstream; throw or use a Result/Option type.
- Exception messages state what operation failed and with what input, not just that something failed.
- Never catch and do nothing — handle it (retry, surface to the user) or at minimum log it.
- Error-handling code paths get tests too, including the exceptional scenarios they exist to catch.

**Smells:** empty `catch {}` block; a function returning `null` for "not found" instead of throwing or an Option type; `try/catch` used to branch on expected input; an exception message with no operation/input context.

## Third-Party Boundaries

- Treat every external system — database, third-party API, message queue, framework — as a boundary: define your own interface for it, never let its shape leak into core logic.
- Learning tests: when integrating an unfamiliar external system, write throwaway tests against it purely to document how it actually behaves; they're not for production.
- Wrap external systems in adapter classes; core code depends on your adapter's interface, never the vendor SDK directly.
- Frameworks get the same treatment — isolate framework-specific code behind a boundary so an upgrade or swap doesn't ripple through the app.
- Mock the external system at your boundary in tests, keeping unit tests fast and independent of the real dependency.
- Keep SQL and other database specifics behind a DAO or ORM layer, never inline in application code.
- Test the boundary itself, including its error conditions, not just the code that calls it.

**Smells:** vendor SDK types/calls scattered through business logic; SQL strings inside handler/application code; a "unit" test that requires the real network or DB to pass; no adapter between your code and an integration point.

## Unit Tests

- TDD's three laws: write a failing test before any production code; write only enough production code to pass it; eliminate any duplication created — repeat per unit of behavior.
- Structure every test Arrange / Act / Assert.
- One test, one concept — don't cram multiple scenarios or assertions covering different behaviors into a single test.
- Test names are descriptive enough to state what's being checked without reading the body.
- Tests are isolated — no shared mutable state, no dependency on another test's side effects or run order.
- Tests are fast — a slow suite gets skipped, which defeats the entire purpose of having it.
- Keep test code DRY too: reuse setup/fixtures rather than copy-pasting arrange blocks.
- Test public behavior, not private implementation — testing internals makes tests brittle to refactors that don't change behavior.
- A green suite is what makes refactoring safe; that safety net is the whole payoff of writing tests.

**Smells:** a test asserting several unrelated things at once; a test named `test1`/`testFoo`; a test that only passes when run after another specific test; a suite slow enough nobody runs it locally; a test reaching into a private method or field.

## Classes

- SRP: a class has one reason to change. A class serving multiple stakeholders has multiple responsibilities and violates it.
- Aim for high cohesion — fields and methods tightly related to one purpose; split apart classes with low cohesion.
- Encapsulate: private fields, public methods only where the outside world genuinely needs access.
- Keep methods short, single-task, and descriptively named — same rules as top-level functions.
- Order class members top to bottom: fields, constructors, public methods, private methods.
- DIP: depend on abstractions, not concrete implementations, in both directions between high- and low-level modules.
- OCP: extend behavior through new code (inheritance/interfaces); don't modify code that already works.
- Push real abstractions into classes — hide low-level detail behind a higher-level interface clients actually use.
- Data clumps: when the same group of parameters keeps appearing together across signatures, extract them into their own class.
- Cap constructor overloads; once the parameter list grows, prefer a Builder or sensible defaults over another overload.
- Prefer many small, focused classes over a few large ones.
- POLA: a class's behavior should never surprise the caller.

**Smells:** a class edited by unrelated feature teams for unrelated reasons ("God class"); public fields with no accessors; a third overloaded constructor doing meaningfully different setup; the same 3-4 parameters passed together across multiple method signatures.

## Emergent Design

- Don't front-load a perfect upfront design — let structure emerge as understanding of the problem domain grows.
- Prioritize simplicity: the simplest thing that could work now, revisited as requirements sharpen, over speculative generality.
- Design for adaptability — avoid rigid, over-specialized code that forces a cascade of changes when the next requirement lands.
- Optimize for readability first: code is read far more than it's written, and a reader who understands it can safely evolve it.
- This is not "skip planning" — it's continuous refinement instead of one big upfront design.

**Smells:** an elaborate abstraction built for a requirement that hasn't arrived yet; one requirement change forcing edits across many unrelated files; code only its original author can safely modify.
