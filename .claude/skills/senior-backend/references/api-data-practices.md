# API and Data Practices

## API Evolution

- Changing a deployed endpoint's request/response shape breaks lagging clients. Evolve additively: new endpoint or new optional field, never in-place mutation.
- Backward compatibility: new code reads old data. Forward compatibility: old code reads new data (ignores unknown fields).
- Tolerant reader: clients guard missing fields (`?.`, `??`) so a server change degrades instead of crashing.
- Removing a field, narrowing an enum, or making an optional field required are all breaking changes.
- Schema-evolution rules by format: JSON — additive optional fields only; Protobuf/Avro — never reuse a field tag/number, only add optional fields with defaults.
- Version explicitly: a versioned path (`/v2/...`) or a request field/header, so producers and consumers can negotiate which contract is in play.

**Smells:** renamed response field; enum used in a switch without a default arm; required flag added to an existing field.

## Idempotency and Retries

- Idempotent means running the operation twice produces the same end state as running it once. Required for anything that might be retried: network timeout, at-least-once delivery, client retry after no response.
- Crash recovery depends on it: write-ahead logging and checkpoints replay operations to restore a consistent state after failure; that replay is only safe if the replayed operations are idempotent.
- Cross-partition/distributed transactions add latency and can block if the coordinator fails (Two-Phase Commit). Prefer avoiding cross-partition transactions over relying on 2PC; use idempotent retries and denormalization instead.
- Design writes so a retried request is a no-op if it already landed (dedupe by a client-supplied operation/idempotency key) rather than re-executing the side effect.

**Smells:** a mutation endpoint with no way to detect "already applied"; retry code that assumes at-most-once delivery; 2PC used as the default cross-service consistency mechanism.

## Transactions and Isolation

- ACID: Atomicity (all-or-nothing), Consistency (invariants hold), Isolation (concurrent transactions don't interfere), Durability (committed survives a crash).
- Anomalies from insufficient isolation: dirty reads (reading uncommitted data), dirty writes (overwriting another transaction's uncommitted change), read skew / non-repeatable reads, lost updates (concurrent read-modify-write clobbers one update), write skew (each transaction's decision was valid alone, invalid together), phantom reads (a re-run query returns rows another transaction just committed).
- Isolation levels trade consistency for performance, weakest to strongest: Read Uncommitted (allows all anomalies) → Read Committed (blocks dirty reads; common default) → Repeatable Read (also blocks non-repeatable reads) → Serializable (blocks all of the above, behaves as if transactions ran one at a time).
- Concurrency control: Two-Phase Locking holds read/write locks until commit; Serializable Snapshot Isolation (MVCC) lets reads see a consistent snapshot and aborts transactions that would violate serializability.

**Smells:** a read-modify-write sequence not wrapped in a transaction (lost-update risk); a check-then-act invariant check running below Serializable isolation; a transaction held open across a network call or user think-time.

## Schema Evolution

- A schema is a contract: it defines structure and types so producers and consumers agree on what the data means. Binary formats (Avro, Protobuf, Thrift) make the schema explicit and required; JSON/XML are schema-less by default (apply JSON Schema/XSD if you need enforcement).
- Backward compatibility: new code can read data written by old code (new fields optional or defaulted). Forward compatibility: old code can read data written by new code (old code ignores fields it doesn't recognize). Bidirectional compatibility: both hold — this is what allows rolling upgrades without a coordinated deploy.
- Safe changes: add a new optional field with a default.
- Unsafe changes: delete or retype a required field in place; make an optional field required.
- Renaming a field is two steps: add the new name alongside the old one and migrate readers/writers, then deprecate the old name — never a single atomic rename.
- Format-specific rule: for Protobuf/Avro/Thrift, never reuse a field tag/number — old binary data on that tag will be misread as the new field's type.
- A schema registry (for Avro/Protobuf messages on Kafka-like systems) tracks versions so producers and consumers on different versions stay compatible without a coordinated deploy.

**Smells:** a field type changed in place; a reused Protobuf/Avro field number; a single-step field rename; a required field added to an existing message/record.

## Input Validation and Security

- Validate all external input (request bodies, query params, headers) at the API boundary into a typed, schema-checked shape before it touches business logic. Never trust an unchecked parsed value.
- Use parameterized queries / prepared statements for every database call. Never build SQL by string-concatenating user input.
- Keep database access behind a DAO/ORM layer so raw queries don't leak into application code — that boundary is also where parameterization is enforced.

**Smells:** a query built with string concatenation or template literals; a handler reading `req.body.x` straight into business logic with no schema validation; SQL fragments outside the data-access layer.

## Query Performance

- Index the columns you filter or sort on (`WHERE`, `ORDER BY`, join keys). An unindexed filter on a large table forces a sequential scan.
- Run `EXPLAIN` (or your database's query plan tool) before optimizing — confirm the actual bottleneck (missing index, sequential scan, bad join order) instead of guessing.
- Watch for N+1 queries: a loop that issues one query per row instead of a single batched query (join, `WHERE id IN (...)`, or a batch loader). This is the most common ORM-induced regression.
- In a partitioned/sharded database, a query that doesn't use the partition key becomes scatter/gather across every partition — check whether the index it needs is local (per-partition, cheap) or global (spans partitions, adds write overhead).

**Smells:** a loop issuing a query per iteration; an `ORDER BY`/`WHERE` column with no supporting index; a query change shipped without checking its plan.
