# Design Patterns (Gang of Four)

Reusable solutions to recurring object-design problems. Reach for one when you recognize its
problem shape in the code in front of you — don't apply a pattern speculatively.

## Creational

### Abstract Factory

**Problem shape:** a system must create families of related objects (e.g. UI widgets for one OS) that must stay consistent with each other, and must support swapping the whole family without touching client code.
**Solution:** define one interface with a creation method per product type; concrete factories implement it per family; the client depends only on the abstract factory and product interfaces.
**Recognize the need:** client code branches on a "look and feel" / "platform" flag to pick which concrete classes to `new` up, and that whole set of classes always changes together.
**Do NOT use when:** there's only one product, or the "family" doesn't actually need to vary together — use Factory Method per-product instead.
**Related:** Factory Method (one product vs. a whole family); Builder (incremental construction vs. instant family creation); Prototype (an Abstract Factory can be implemented with prototypes).

### Builder

**Problem shape:** constructing an object needs many steps or optional parameters; a single constructor with a long parameter list is unwieldy, or the same steps must produce different representations.
**Solution:** extract construction into a Builder exposing step methods (`buildPartA`, `buildPartB`) plus a way to retrieve the finished Product; an optional Director calls the steps in a fixed order.
**Recognize the need:** constructors with 5+ optional args, telescoping constructor overloads, or code that partially constructs an object then mutates it into a valid state.
**Do NOT use when:** the object has few fields and one valid construction path — a plain constructor or factory function is enough.
**Related:** Abstract Factory (build in one call vs. incrementally); Composite (Builders often assemble Composite trees).

### Factory Method

**Problem shape:** a class must create objects but can't anticipate the exact concrete type, or wants subclasses to decide it, and hardcoding the concrete class ties the superclass to it.
**Solution:** declare an abstract factory method on the Creator; each ConcreteCreator subclass overrides it to return its own ConcreteProduct.
**Recognize the need:** a base class both defines a workflow and directly instantiates a helper it needs (`new ConcreteHelper()` buried inside otherwise-generic code).
**Do NOT use when:** there's only ever one product type, or the caller — not a subclass — should choose the type; pass a factory function/object instead of subclassing.
**Related:** Abstract Factory (a family of factory methods); Template Method (Factory Method is a specialization of it).

### Prototype

**Problem shape:** creating a new object from scratch is expensive, or you need instances nearly identical to an existing one, without hardcoding the concrete class being copied.
**Solution:** give objects a `clone()` method; create new instances by copying a pre-configured prototype instead of calling a constructor.
**Recognize the need:** expensive initialization repeated for near-duplicate objects, or the "kind" of object is only known/configured at runtime and can't be named in a `new` call.
**Do NOT use when:** objects are cheap to construct and rarely duplicated — plain constructors are clearer; also watch deep-vs-shallow copy semantics on objects with shared mutable state.
**Related:** Abstract Factory (can be prototype-backed); Memento (both copy state, but Memento's copy restores the same object later, not spawns a new independent one).

### Singleton

**Problem shape:** exactly one instance of a class must exist and be reachable from anywhere (shared config, connection pool, logger).
**Solution:** private constructor plus a static accessor (`getInstance()`) that lazily creates and always returns the same instance.
**Recognize the need:** a resource that must never be duplicated (a single DB pool, a single cache) currently passed around awkwardly or re-created by accident.
**Do NOT use when:** almost always — a Singleton is global mutable state: it hides dependencies, complicates unit tests (state leaks between tests), and needs extra care for thread-safe lazy init. Prefer dependency injection of the shared instance; reach for Singleton only after that's ruled out.
**Related:** Abstract Factory / Builder (the factory itself is often a Singleton); Flyweight (also shares instances, but many of them, keyed by intrinsic state, not exactly one).

## Structural

### Adapter

**Problem shape:** an existing class (Adaptee) has a useful implementation but its interface doesn't match what client code (Target) expects, and you can't or shouldn't modify the Adaptee.
**Solution:** wrap the Adaptee in an Adapter implementing Target that translates each call into the Adaptee's actual interface.
**Recognize the need:** integrating a third-party library or legacy class whose method names/signatures don't line up with your domain interface; wrapping several similar libraries behind one common interface.
**Do NOT use when:** you own both sides and can just change one interface directly — adapting adds a layer plain refactoring would avoid.
**Related:** Bridge (same structure, but designed in upfront rather than retrofitted); Facade (Facade defines a new simplified interface, Adapter conforms to an existing one); Decorator (Adapter changes the interface, Decorator keeps it and adds behavior).

### Bridge

**Problem shape:** an abstraction and its implementation each have independent variants (shape types × rendering back-ends), and subclassing both dimensions together explodes the class count.
**Solution:** put the implementation behind its own interface (Implementor); the Abstraction holds a reference to an Implementor and delegates to it, so the two hierarchies vary independently.
**Recognize the need:** a class hierarchy like `RedCircle`, `BlueCircle`, `RedSquare`, `BlueSquare` — two orthogonal concerns forced into one inheritance tree.
**Do NOT use when:** only one dimension actually varies, or the implementation never changes at runtime — plain inheritance is simpler.
**Related:** Adapter (retrofits an incompatible interface after the fact; Bridge is designed in from the start); Abstract Factory (can create the right Implementor for the platform).

### Composite

**Problem shape:** individual objects and groups of them (a tree) need to be treated the same way by client code — e.g. a file vs. a directory of files.
**Solution:** define a Component interface implemented by both Leaf (no children) and Composite (holds children, delegates operations to them); clients only ever talk to Component.
**Recognize the need:** client code has `if (isGroup) { for each child... } else { operate on item }` scattered anywhere it touches the structure.
**Do NOT use when:** the hierarchy has only one level, or leaves and groups need genuinely different, non-overlapping operations — forcing a shared interface then becomes overly generic.
**Related:** Decorator (same recursive-composition shape, different intent: add behavior vs. represent whole/part); Iterator (traverses a Composite); Visitor (adds operations across a Composite without changing its classes).

### Decorator

**Problem shape:** individual objects need extra responsibilities attached at runtime, and subclassing for every combination of features would explode the class count.
**Solution:** a Decorator implements the same Component interface as the object it wraps, holds a reference to it, and adds behavior before/after delegating the call; decorators can be stacked.
**Recognize the need:** a feature must apply to some instances but not others, or in arbitrary combinations (borders, scrolling, coloring on any UI widget) — inheritance would need one subclass per combination.
**Do NOT use when:** the added behavior applies to all instances of a type (put it in the base class), or an object's full feature set is fixed once at construction — Builder/config is simpler.
**Related:** Composite (same recursive wrapping structure, different intent); Proxy (also wraps with the same interface, but controls access rather than adding behavior); Strategy (swaps one algorithm rather than layering several).

### Facade

**Problem shape:** a subsystem has many interacting classes, and client code that talks to all of them directly becomes tightly coupled to internals that shouldn't be its concern.
**Solution:** introduce a Facade exposing a small, high-level interface that internally coordinates the subsystem's classes; clients depend on the Facade, not the subsystem.
**Recognize the need:** onboarding a subsystem requires understanding 5+ collaborating classes just to perform one common task, or the same multi-step orchestration is copy-pasted at every call site.
**Do NOT use when:** clients genuinely need fine-grained control over subsystem internals — a Facade clients must "reach around" to get real work done is a leaky abstraction.
**Related:** Adapter (Facade defines a new simplified interface; Adapter conforms to an existing one); Mediator (Facade simplifies a subsystem for outside callers; Mediator coordinates peers inside a system).

### Flyweight

**Problem shape:** an application needs huge numbers of similar fine-grained objects (characters in a document, map icons), and fully instantiating each one is too costly in memory.
**Solution:** split object state into intrinsic (shared, stored in the Flyweight) and extrinsic (context-dependent, passed in by the caller); a FlyweightFactory hands out shared instances instead of creating new ones.
**Recognize the need:** profiling shows memory/GC pressure from a very large count of near-identical small objects, and most of their state is actually shared or derivable.
**Do NOT use when:** object count is modest, or object identity matters — flyweights are shared, so identity checks between "different" logical objects can wrongly return true.
**Related:** Singleton (the FlyweightFactory is often a Singleton); Composite (flyweights can be leaves in a Composite tree, e.g. glyphs in a document).

### Proxy

**Problem shape:** you need to control access to an object — defer its costly creation, guard it behind permission checks, or represent one that lives remotely — without the client knowing.
**Solution:** a Proxy implements the same interface as the RealSubject and stands in for it, adding access-control/lazy-load/remote-call logic before delegating to the real object.
**Recognize the need:** an object is expensive to construct but rarely used (virtual proxy), lives across a process/network boundary (remote proxy), or every call site needs the same permission check bolted on (protection proxy).
**Do NOT use when:** the added indirection serves no purpose the client couldn't get by calling the real object directly — don't proxy for its own sake.
**Related:** Decorator (same wrapping shape, but adds behavior/features rather than controlling access); Adapter (changes the interface; Proxy keeps it identical).

## Behavioral

### Chain of Responsibility

**Problem shape:** a request could be handled by one of several candidate handlers, and the sender shouldn't need to know or couple to which specific one will handle it.
**Solution:** link handlers into a chain; each handler either processes the request or forwards it to its successor; the client only knows the first handler.
**Recognize the need:** an escalating-tiers workflow (support, approvals), or a cascade of "if this validator/handler can't do it, try the next" logic hardcoded at the call site.
**Do NOT use when:** exactly one handler is always correct and known in advance — a direct call is clearer than a chain with a single link.
**Related:** Command (a handler's action can be encapsulated as a Command); Mediator (both decouple senders from specific receivers, but Mediator centralizes coordination rather than passing a request along).

### Command

**Problem shape:** you need to issue a request without the invoker knowing the operation or its receiver, or you need to queue, log, or undo that request later.
**Solution:** encapsulate the request as a Command object with an `execute()` method bound to a specific Receiver and its parameters; the Invoker just calls `execute()`.
**Recognize the need:** menu items/buttons that must trigger arbitrary, swappable actions; any requirement for undo/redo, request queues, or audit logs of what operations happened.
**Do NOT use when:** the operation is a single, simple direct call with no need for deferral, queuing, logging, or undo — wrapping it in a Command object is pure overhead.
**Related:** Memento (often paired with Command to implement undo, storing state instead of or alongside the inverse operation); Chain of Responsibility (can route Commands to the right handler).

### Interpreter

**Problem shape:** you have a small, fairly stable language or grammar (rules, query filters, simple expressions) and need to represent and evaluate sentences in it.
**Solution:** model the grammar as an abstract syntax tree of Expression classes, each implementing `interpret()`; TerminalExpressions are leaves, NonterminalExpressions combine children, a Context carries shared state.
**Recognize the need:** building an ad hoc parser/evaluator for a DSL, rule engine, or filter-expression syntax embedded in your app.
**Do NOT use when:** the grammar is complex or evolves quickly — a class-per-rule hierarchy becomes unwieldy fast, use a parser generator/library instead; also skip it when raw execution speed matters, since tree-walking interpretation is slow.
**Related:** Composite (the AST is a Composite tree); Visitor (an alternative way to add operations over the AST instead of `interpret()` on each node).

### Iterator

**Problem shape:** client code needs to walk through the elements of a collection sequentially without knowing or depending on how that collection is implemented internally.
**Solution:** give the collection (Aggregate) a method returning an Iterator exposing `next()`/`hasNext()`; client code loops via the Iterator interface only.
**Recognize the need:** client code reaches into a collection's internal fields/structure just to loop over it, coupling it to that one data structure.
**Do NOT use when:** the language/runtime's built-in iteration protocol (e.g. a standard for-each) already covers the case — don't hand-roll one.
**Related:** Composite (iterating a tree structure); Visitor (an alternative to Iterator when the operation, not just traversal, needs to vary).

### Mediator

**Problem shape:** many objects (Colleagues) need to interact, and letting them reference each other directly produces a tangled many-to-many web of dependencies.
**Solution:** introduce a Mediator that Colleagues talk to instead of each other; the Mediator receives notifications and coordinates the resulting actions among Colleagues.
**Recognize the need:** a set of UI components (or services) each holding direct references to several siblings just to stay in sync, so any one change ripples through many classes.
**Do NOT use when:** only two objects interact, or interactions are simple and unlikely to grow — a direct reference is simpler than adding a coordinator.
**Related:** Facade (Mediator coordinates peers that already know about the system; Facade simplifies access from outside it); Observer (Mediator is sometimes implemented using Observer for Colleague-to-Mediator notifications).

### Memento

**Problem shape:** you need to capture an object's internal state to restore it later (undo, rollback), without exposing that state's internal representation to whoever holds the snapshot.
**Solution:** the Originator creates a Memento containing its state; a Caretaker stores Mementos opaquely (without reading/modifying them) and hands one back to the Originator to restore.
**Recognize the need:** implementing undo/redo, or rollback for a multi-step operation (wizard, transaction) where you must not leak the object's internals to the code managing history.
**Do NOT use when:** state is trivial to reconstruct or already immutable/versioned elsewhere — snapshotting adds memory overhead better justified after simpler alternatives are ruled out.
**Related:** Command (commonly paired: undo restores a Memento captured before a Command executed); Prototype (both copy state, but Prototype spawns a new independent object rather than a restore point for the same one).

### Observer

**Problem shape:** when one object's state changes, an open-ended set of other objects need to know and react, without the changed object knowing who they are.
**Solution:** the Subject keeps a list of Observers with attach/detach methods and calls `notify()` on all of them on change; each Observer implements `update()` to react.
**Recognize the need:** any "when X changes, refresh/recompute Y, Z, ..." requirement where the set of dependents varies or grows over time — pub/sub, event listeners, reactive UI bindings.
**Do NOT use when:** there's exactly one fixed dependent, or update ordering/consistency guarantees matter a lot — Observer notification order and partial-failure handling are easy to get wrong; a direct call may be more predictable.
**Related:** Mediator (Observer is often the mechanism Colleagues use to notify a Mediator); State (state transitions are sometimes broadcast via Observer to interested parties).

### State

**Problem shape:** an object's behavior must change based on its internal state, and that logic is a large conditional (`switch`/`if-else` on "current state") duplicated across methods.
**Solution:** encapsulate each state's behavior in its own State class implementing a common interface; the Context delegates every state-dependent call to its current State object and swaps that reference on transition.
**Recognize the need:** a class with a `status`/`mode` field checked at the top of most of its methods, where adding a new state means touching every one of those conditionals.
**Do NOT use when:** there are only two states with barely different behavior (a boolean flag is simpler), or states rarely change during the object's lifetime.
**Related:** Strategy (same structure — an object delegates to an interchangeable class — but State's variants represent the object's own lifecycle stages and often trigger their own transitions, while Strategy's variants are picked by the caller and don't reference each other).

### Strategy

**Problem shape:** several interchangeable algorithms for one job; callers switch on a type/flag to pick one.
**Solution:** extract each algorithm behind one interface; caller holds the interface, picks the concrete at construction/config time.
**Recognize the need:** a growing `switch`/`if-else` chain on "kind" duplicated across methods; subclassing only to change one behavior.
**Do NOT use when:** only two variants that never grow; the variation is data, not algorithm (use a parameter/lookup table instead).
**Related:** State (same structure, intent = internal mode changes over time); Template Method (inheritance-based variant).

### Template Method

**Problem shape:** several algorithms share the same overall sequence of steps, but one or more individual steps differ per case, and duplicating the shared structure invites drift.
**Solution:** put the fixed sequence in a method on an AbstractClass that calls a series of primitive steps; ConcreteClasses override only the steps that vary, not the sequence itself.
**Recognize the need:** near-identical methods across sibling classes that differ in only one or two steps out of many, with the shared steps copy-pasted between them.
**Do NOT use when:** the steps' order or count itself needs to vary per case, not just their content — Strategy (vary the whole algorithm) or Builder (vary the construction sequence) fit better.
**Related:** Strategy (Template Method varies steps via subclassing; Strategy varies the whole algorithm via composition); Factory Method (often one of the overridable steps in a Template Method).

### Visitor

**Problem shape:** new operations must be added to elements of a stable object structure (e.g. a document's node types), and adding them as methods on each element class would bloat those classes or require touching all of them per new operation.
**Solution:** define a Visitor interface with one `visit()` method per element type; each Element implements `accept(visitor)` which calls back into the matching `visit()` method (double dispatch); new operations become new Visitor classes.
**Recognize the need:** repeatedly adding one-off operation methods (export, spell-check, pretty-print) across an entire class hierarchy just to support a new, unrelated feature.
**Do NOT use when:** the object structure's set of element types changes often — every new type forces a new method on every existing Visitor, the inverse maintenance burden.
**Related:** Composite (Visitor commonly operates over a Composite tree); Iterator (an alternative when the operation itself, not just traversal, needs to vary).
