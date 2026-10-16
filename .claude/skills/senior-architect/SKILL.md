---
name: senior-architect
description: Design-time decision process distilled from Clean Architecture, Design Patterns (GoF), Fundamentals of Software Architecture, and DDIA. Use when designing a feature or system, writing a spec or implementation plan, structuring modules or components, refactoring architecture, choosing between approaches, evaluating trade-offs, or deciding whether a design pattern applies.
---

# Senior Architect

Five-step design process, run top to bottom whenever a design decision needs justifying — a spec,
a plan, a refactor, a "does a pattern apply here" call. Steps 1-3 apply at any scale; step 4 is a
lookup; step 5 is for system-level work only.

## 1. Responsibility check

Every unit under design — function, class, component — should have one reason to change, one actor
it answers to. A `*Manager`/`*Processor` name, a diff for feature A that forces retesting feature B,
or two teams editing one file for unrelated reasons are the tells. Split by actor, not by technical
layer, before doing anything else.
→ references/solid-components.md#SRP

## 2. Dependency direction

Dependencies point toward stability and abstraction — never let a high-level policy import a
low-level detail directly. Check for cycles: a component depending on one less stable than itself,
or any loop in the dependency graph, means neither side can be built, tested, or deployed
independently.
→ references/solid-components.md#DIP, #Component Coupling

## 3. Boundary check

Decide where the lines go. Database, framework, and UI are details that live behind interfaces;
business rules stay at the center and never name a detail directly. A full boundary isn't always
affordable — a partial boundary (do the internal design work, ship as one deployable) is a
deliberate trade, not a shortcut taken by default.
→ references/architecture-boundaries.md

## 4. Pattern match

Scan the inline index below for the problem shape in front of you. Only open
references/design-patterns.md for the matched candidate(s) — don't read the whole file
speculatively.

## 5. Style & data decisions

For system-level work (not a single component): pick an architecture style from the styles table
and size the data-layer trade-offs — model, replication, partitioning, consistency — against this
system's actual access pattern and failure tolerance, not habit.
→ references/architecture-boundaries.md#Architecture Styles, references/data-systems.md

## Pattern index

| You see | Consider |
|---|---|
| switch/if-else chain on a type code, duplicated around | Strategy, State, Polymorphism |
| families of related objects created together | Abstract Factory |
| complex construction, many optional parts | Builder |
| subclass decides what to instantiate | Factory Method |
| part-whole tree treated uniformly | Composite |
| add behavior without subclass explosion | Decorator |
| incompatible interface you don't own | Adapter |
| abstraction and implementation both vary | Bridge |
| simple face over a messy subsystem | Facade |
| thousands of similar objects, shared state | Flyweight |
| control/lazy/remote access to an object | Proxy |
| notify many dependents of state change | Observer |
| encapsulate an action (undo, queue, log) | Command |
| request handled by first able handler | Chain of Responsibility |
| snapshot and restore state | Memento |
| many-to-many object chatter | Mediator |
| walk a collection without exposing internals | Iterator |
| algorithm skeleton fixed, steps vary | Template Method |
| operations added to a stable type family | Visitor |
| behavior changes with internal mode | State |
| one instance, global access (prefer DI) | Singleton |
| grammar to evaluate repeatedly | Interpreter |
| copy configured objects instead of rebuilding | Prototype |

Match found → read that entry in references/design-patterns.md, check its "Do NOT use when" before
committing.
No match → don't force a pattern. Simplest structure that satisfies the responsibility and
dependency checks wins.
