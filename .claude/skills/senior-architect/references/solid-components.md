# SOLID and Component Principles

## SRP

- A module has one reason to change — one actor/stakeholder it answers to.
- Violation smell: a class named `*Manager`/`*Processor`/`*Utils`; a diff for feature A forces retesting feature B; two teams editing one file for different reasons.
- Fix move: split by actor, not by technical layer; extract the second responsibility into its own module and inject it.

## OCP

- A module is open for extension, closed for modification — add behavior with new code, don't edit existing, already-tested code.
- Violation smell: adding one new case means editing an existing class or a growing if/switch chain; every new feature touches modules that already shipped.
- Fix move: define an interface or base type once; add the new behavior as a new implementation that plugs into it (e.g. `PartTimeEmployee`, `FullTimeEmployee` implementing a common `Employee` interface) — zero edits to existing classes.

## LSP

- A subtype must be substitutable for its base type without breaking the caller's expectations — same preconditions, no surprise exceptions, no surprise side effects.
- Violation smell: an override throws where the base method never did; `Square extends Rectangle` and setting width silently changes height, breaking any caller that assumed width and height vary independently.
- Fix move: don't force an inheritance relationship that changes the observable contract; model the two types as siblings behind a shared interface instead of parent/child.

## ISP

- Clients depend only on the methods they actually use; no class should be forced to implement methods it doesn't need.
- Violation smell: a fat interface (`save`/`print`/`load`) where implementers stub out or throw on the methods they don't support.
- Fix move: split the fat interface into role interfaces (`Savable`, `Printable`, `Loadable`); each class implements only the roles it needs.

## DIP

- High-level modules depend on abstractions, not low-level concretions; both the policy and the detail depend on an interface the high-level module owns.
- Violation smell: business logic directly instantiates or calls a concrete database/framework class; swapping the database means editing business-rule code.
- Fix move: define the abstraction the high-level module needs, implement it in the low-level module, inject the implementation — the dependency arrow now points at the abstraction, not the detail.

## Component Cohesion

Governs how classes are grouped into a component (a deployable, independently buildable/testable/releasable unit).

- REP (Reuse/Release Equivalence): the granule of reuse is the granule of release. If you reuse part of a component, you reuse the whole thing — classes released and versioned together belong together.
- CCP (Common Closure): classes that change for the same reason, at the same time, belong in the same component. A change to one business rule should touch one component, not cascade across several. Data-access logic and business rules that change for different reasons belong in separate components.
- CRP (Common Reuse): classes that are used together belong together. Don't force a client to depend on classes it doesn't need just because they happen to live in the same component as one it does need.
- Tension triangle: REP, CCP, and CRP pull against each other — no component structure maximizes all three at once. Early-stage projects favor CCP (changeability matters more than reuse discipline); mature, widely-consumed libraries favor REP/CRP (reuse and minimizing unwanted client dependencies matter more than same-team convenience).

## Component Coupling

Governs how components depend on each other.

- ADP (Acyclic Dependencies): the component dependency graph must be a DAG — no cycles. A cycle means no component in it can be built, tested, or deployed independently, and a change anywhere in the cycle ripples through the whole cycle. Break a cycle by applying DIP at the component level (introduce an abstraction one side depends on instead of the concrete other side) or by extracting a new component both sides depend on.
- SDP (Stable Dependencies): depend in the direction of stability. `Stability(S) = Fan-Out / (Fan-In + Fan-Out)`, where fan-in is the number of external classes depending on this component and fan-out is the number of external classes this component depends on. S near 1 = stable (many depend on it, expect few changes); S near 0 = unstable (few depend on it, expect frequent change). A component must not depend on one less stable than itself; in a layered system, UI (unstable) depends on data access (stable), never the reverse.
- SAP (Stable Abstractions): a component's abstraction should track its stability. `Abstraction(A) = (abstract classes + interfaces) / total classes`. Stable components should be abstract (A near 1) so they can be extended without modification, per OCP; volatile components should be concrete (A near 0). Zone of pain: stable and concrete — hard to change, hard to extend (a rigid schema everything depends on). Zone of uselessness: unstable and abstract — an abstraction with no one depending on it and no reason to be abstract.

## Coupling Types

Coupling is a spectrum of magnitude, not binary: the strength of coupling is the probability that a change in a provider module forces a change in a consumer.

- Shared lifecycle: once two modules are coupled, they stop being independent units of deployment or change. This shows up as three parallel symptoms, none inherently worse than the others — co-evolution (can't update one without immediately updating the other), deployment lock-step (both must ship to production at the same moment to function), and functional fragility (a bug in one component surfaces as a failure in a seemingly unrelated part of the system).
- Shared knowledge: coupling is at heart a measure of how much one module knows about another. That knowledge can be explicit (a documented API signature) or implicit (an unstated assumption, e.g. that a database record always exists). Implicit knowledge is the more dangerous of the two — not a different type of coupling, but a more severe one, because the ripple stays invisible until it breaks instead of being trackable like an explicit contract.
- Fix move: coupling can't be eliminated, only managed — aim for deep modules, where a large amount of internal logic sits behind a thin, stable interface, so consumers depend on the interface rather than the internals.
