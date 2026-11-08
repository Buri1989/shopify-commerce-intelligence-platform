# Architecture Boundaries

Distilled from *Clean Architecture* (boundaries, layers, details) and *Fundamentals of Software
Architecture* (styles, characteristics, decisions).

## Boundaries

- Draw a boundary where two things change for different reasons (Separation of Concerns) — not
  along arbitrary file or team lines.
- Cross boundaries only through interfaces. Dependencies point toward policy (inward), never
  toward detail.
- Policy = high-level components farthest from I/O (the business rules). Detail = low-level
  components closest to I/O. Data flow and source-code dependency direction are independent — data
  can flow input → processing → output while dependencies still point inward, because the
  processing layer depends on abstractions (ports), not on the concrete reader/writer. This is the
  Dependency Inversion Principle in practice.
- Boundary strength, weakest to strongest: in-process function calls < deployment components
  (DLL/.jar — deployable without a full recompile) < local processes (separate address space,
  memory-protected) < services (network, independently deployable and scalable). Threads are NOT a
  boundary — they're a concurrency mechanism that operates inside a component.
- Even a single-deployable monolith needs disciplined internal boundaries and component
  separation, or it degrades into a "big ball of mud."
- Boundaries exist at every granularity throughout a system and must be actively recognized, not
  just designed once. Weigh YAGNI (don't build a boundary you don't need yet) against cost of
  delay (adding one late, after code has tangled around its absence, is expensive) — this is
  continuous judgment, not a one-time decision.

## Clean Architecture Rings

- Four concentric rings (canonical, not a hard requirement — real systems may need more): Entities
  (enterprise business rules) → Use Cases (application-specific business rules) → Interface
  Adapters (controllers, presenters, gateways) → Frameworks & Drivers (DB, web, UI — details).
- The Dependency Rule: source-code dependencies point only inward. Nothing in an inner ring may
  name anything declared in an outer ring — no class, function, variable, or data format.
- Entities hold the most general, most stable rules — the ones least likely to change when
  something external (UI, database) changes. Use Cases orchestrate Entities to satisfy one
  specific use case each ("Create Order," "Calculate User Score") and stay independent of UI or
  framework.
- Cross ring boundaries with Dependency Inversion: an inner ring defines an interface (a port); an
  outer ring implements it. A Use Case that needs the database defines a repository interface; a
  class in Interface Adapters implements it.
- Data crossing a ring boundary is a plain, isolated data structure (a Request/Response model) —
  never an Entity, and never a framework-generated object.

## Humble Object

- Split any hard-to-test behavior from easy-to-test behavior into two units: the Humble Object
  (thin, framework-bound, deliberately left untested) and its testable counterpart (pure logic,
  no difficult dependencies).
- Canonical case — View vs. Presenter: the View is humble (rendering, event handling, hard to unit
  test); the Presenter is testable (formats data into a View Model, decides button state and
  enabled/disabled — it never touches a UI widget directly).
- Same pattern generalizes beyond UI: a Database Gateway interface is testable, the SQL/connection
  code behind it is humble; the domain-mapping logic in an ORM layer is testable, the code that
  actually talks to the DB is humble; a service listener's message-formatting/transport code is
  humble, the logic that prepares the data it sends is testable.
- Goal: push all framework- or IO-coupled code to the thinnest possible edge; keep everything else
  pure and covered by tests.

## Partial Boundaries

- A full boundary (polymorphic interface, separate input/output data structures, independent
  deployability) costs real, ongoing effort. Don't build one you don't need yet (YAGNI) — but
  don't ignore a rising cost of delay either.
- "Skip the last step": do all the internal design work of a full boundary (interfaces, separate
  internal modules) but ship it as a single deployable unit. Keeps the option to split later
  without paying the full cost now (e.g., FitNesse shipped its separable web-server component
  bundled with the wiki/testing code for simpler distribution).
- One-dimensional boundary: a `ServiceBoundary` interface plus a `ServiceImpl` class, both inside
  the same deployable, using the Strategy pattern. Risk: erodes over time if the team isn't
  disciplined about which side is allowed to depend on which.
- Facade: a single class fronts a set of internal service classes — the cheapest partial boundary.
  Cost: clients get a transitive dependency on those internals, so changes to the internals can
  force client recompilation, and wrong-direction (backchannel) dependencies creep in easily.
- Every partial boundary is a deliberate trade of upfront cost against future refactoring cost —
  choose the form on purpose, don't default to either extreme.

## Screaming Architecture

- The top-level directory structure and core component names should announce the system's domain
  ("healthcare system," "e-commerce platform") — not its frameworks ("Spring app," "Rails
  project"). This is the "scream test."
- Center the architecture on use cases, not the delivery mechanism. You should be able to describe
  what the system does without mentioning a specific framework, database, or web server.
- Frameworks, databases, UI, and the web are details — important, but details nonetheless. They
  should be heard, not seen: don't let them shape top-level structure.
- A screaming architecture keeps technology decisions deferred and changeable for as long as
  possible — the opposite of committing early to a framework's directory conventions.

## Details (DB, Web, Frameworks)

- Database, web framework, and UI framework are deferrable decisions — architecturally they
  belong in the outermost ring, not the center.
- Keep every detail behind a gateway/interface owned by the inner (policy) layer; the detail
  implements that interface, never the other way around.
- Marry the framework and you're stuck: tight coupling to a framework's base classes, annotations,
  or directory layout blocks a future swap and usually blocks testing core logic without booting
  the framework. Treat a framework as a tool called through an adapter, not the skeleton your code
  hangs on.
- The database is a detail: hide it behind Repository/Gateway interfaces and abstract both the
  storage technology (SQL vs. NoSQL) and the data model, so schema or vendor changes stay
  contained in the adapter layer. Business-rule tests should run with no live database.
- The web is a detail: it's one possible delivery mechanism, not an architectural driver. The core
  must not know or care whether it's invoked over HTTP, from a CLI, or from a queue consumer.
- Litmus test: your core business-rule tests run with the framework absent. If they can't, the
  detail has leaked into the policy.

## Architecture Styles

| Style | Choose when | It buys | It costs |
|---|---|---|---|
| Layered | small team, simple domain, quick start | familiarity, low cost | low deployability; "architecture sinkhole" pass-through layers |
| Pipeline | one-way data transformation flows (ETL) | simplicity, composable filters | poor fit for interactive apps; low elasticity |
| Microkernel | stable core + plug-in features (IDEs, product lines) | extensibility, isolation of variants | core contract hard to evolve; plug-in registry complexity |
| Service-based | domain services, one shared DB, mid-size team | deployability without distributed-data pain | shared DB couples services |
| Event-driven | async workflows, burst traffic, broadcast | scalability, decoupling | hard debugging, eventual consistency, error handling |
| Space-based | extreme unpredictable concurrency (flash sales) | elastic scale, no DB bottleneck | cache-sync complexity, cost |
| Orchestration SOA | (historical) enterprise reuse mandate | central reuse | brittle central orchestrator — cautionary tale |
| Microservices | independent teams, independent deploy/scale per domain | decoupling, granular scale | operational cost, distributed transactions, latency |

Style vs. pattern: a style (e.g., microservices) is the high-level, strategic structure; a pattern
(e.g., Sidecar) is a lower-level, reusable solution within a style — don't conflate the two.

Two anti-patterns to recognize regardless of style: the Big Ball of Mud (no deliberate style at
all — everything coupled to everything) and, for layered systems specifically, the Architecture
Sinkhole (a request passes through a layer with no logic applied, adding pure overhead).

Before picking a style, count your architectural quanta (see Architectural Characteristics). One
quantum suffices → monolithic style (Layered, Pipeline, Microkernel) is usually simplest. Multiple
quanta with conflicting characteristics → a distributed style (Service-based, Event-driven,
Space-based, Microservices) is required. Remember the Eight Fallacies of Distributed Computing
before choosing a distributed style: the network is reliable; latency is zero; bandwidth is
infinite; the network is secure; topology doesn't change; there is only one administrator;
transport cost is zero; the network is homogeneous — every one of these is false, and a distributed
style must be designed as if it is.

Team topology must match the style (Conway's Law): one large team pulls toward a monolith;
microservices need small, autonomous, stream-aligned teams that each own their services.

## Architectural Characteristics

- Call them "architectural characteristics" (or "-ilities"), not "non-functional requirements" —
  the label undersells attributes (throughput, security) that shape the whole system.
- Three groupings: Operational (performance, scalability, elasticity, availability, reliability,
  fault tolerance, deployability, data integrity — ops/SRE-owned), Structural (modularity,
  testability, maintainability, extensibility, installability, configurability, portability —
  architect/dev-owned), Cross-Cutting (security, accessibility, usability, interoperability,
  legal/compliance — span both).
- Define every characteristic quantitatively, never as a bare adjective. Use a Quality Attribute
  Scenario: Source → Stimulus → Environment → Artifact → Response → Response Measure (e.g., "95%
  of login requests complete under 500ms at 1,000 concurrent users").
- You cannot maximize every characteristic at once. Pick the 3-4 that matter most for this system
  and this project, and let the rest be "good enough" — this trade-off, not a perfect system, is
  the job.
- Scope characteristics to an Architectural Quantum: an independently deployable component with
  high functional cohesion and strong synchronous connascence — the "blast radius" for a given set
  of characteristics. A monolith has one quantum, so every part gets the same uniform
  characteristics (forcing compromise). Microservices give each service its own quantum for
  fine-grained tuning. Service-based architecture sits in between with a handful of coarser quanta.
- Govern characteristics with fitness functions, scoped to a quantum: structural measures
  (cyclomatic complexity, coupling, cohesion — static analysis), operational measures (load/perf
  tests — dynamic), process measures (deploy frequency, lead time for changes). Wire the static
  ones into CI (e.g., an ArchUnit rule that fails the build on a forbidden dependency) so drift
  fails fast instead of accumulating silently. Treat governance as a guardrail that gives fast
  feedback, not a rigid gate.

## Decision Records

- Record every architecturally significant decision as an ADR: Title (short, descriptive), Status
  (Proposed / Accepted / Superseded), Context (the problem forcing the decision and the
  alternatives considered), Decision (the choice, stated affirmatively — "We will use asynchronous
  messaging..." — including the why that ties it to business/technical goals), Consequences (the
  trade-offs and overall impact, positive and negative).
- Justify a decision by its trade-offs against this system's characteristics and constraints —
  never by fashion or "everyone uses it now."
- Avoid three anti-patterns: Covering Your Assets (stalling a decision out of fear of being wrong —
  instead decide at the "last responsible moment," the point with enough information but before
  the team is blocked); Groundhog Day (re-litigating a decision endlessly because no one recorded
  why it was made); Email-Driven Architecture (a decision that lives only in an email thread —
  email is for notification, not documentation).
- Quantify risk the same way you quantify characteristics: score Impact × Likelihood (1-9) to get
  low/medium/high risk, and use it to prioritize what needs a decision or a mitigation now.
- An ADR outlives the meeting it came from — write it so someone with zero context can read it in a
  year and understand both the choice and the reasoning.
