# Data Systems (Designing Data-Intensive Applications)

Distilled reference for choosing data architecture: models, storage, replication,
partitioning, transactions, distributed-systems failure modes, consistency, and
batch/stream processing. Each section is a choosing guide — options, their
trade-offs, and a default to start from.

## The Three Pillars

- Reliability: correct operation despite hardware faults, software bugs, and human
  error — achieved through redundancy, backups, and graceful error handling.
  Skimping here trades an occasional outage for less upfront engineering cost.
- Scalability: capacity to absorb load growth (users, data, throughput) via
  horizontal scaling (more machines — cheaper to add, needs partitioning and
  coordination) or vertical scaling (bigger machines — simpler, hits a ceiling and
  gets expensive).
- Maintainability: operability (tooling, monitoring, automation), simplicity (clear
  abstractions, small modules), evolvability (safe to change as requirements
  shift). Underinvesting here is the invisible trade-off — it doesn't fail loudly,
  it just makes every future change slower.
- Default: budget for all three from the start. Reliability and maintainability are
  far cheaper to design in than to retrofit after an incident or a codebase
  calcifies.

## Data Models

- Relational (SQL): tables/rows/keys, joins, ACID guarantees. Best when data is
  well-structured, relationships matter, and consistency is non-negotiable
  (financial systems, inventory, most CRUD apps).
- Document (JSON/XML, NoSQL): flexible per-document schema. Best for
  hierarchical/one-to-many data (blog posts + comments, product catalogs) and
  schemas that shift often; weaker for cross-document joins.
- Key-value: simplest model, lookup by key only. Best for caching, sessions, user
  profiles — anything read/written by a known key; no query flexibility beyond
  that key.
- Graph: nodes and edges, both with properties. Best for relationship-heavy
  queries (social graphs, recommendations, fraud detection); overkill for
  flat/tabular data.
- Choose by access pattern first, structure second: how you'll query the data
  matters more than what it looks like at rest.
- Default: relational unless a specific access pattern (graph traversal, pure
  key lookup, deeply nested/ragged documents) argues otherwise — it's the safest
  general-purpose choice and the easiest to migrate off of later.

## Storage Engines

- B-trees (page-oriented, update-in-place): balanced tree, shallow depth,
  efficient random reads and writes; the default in most traditional RDBMS.
  Struggles under very high write volume — each write can touch multiple pages.
- LSM-trees (log-structured): writes batch into an in-memory memtable, flush as
  immutable sorted SSTables, background compaction merges them. Excellent write
  throughput; reads may need to check the memtable plus several SSTables
  (mitigated with Bloom filters).
- Secondary indexes: extra sorted structures for fast lookup on non-primary-key
  fields; cost is disk space and slower writes, since every index needs updating
  too.
- Durability and concurrency: write-ahead logging (WAL) enables crash recovery;
  MVCC / snapshot isolation gives lock-free consistent reads without blocking
  writers.
- Default: LSM-tree engines for write-heavy workloads (most modern NoSQL stores);
  B-tree engines for read-heavy/random-access workloads (the default in most
  RDBMS). Add secondary indexes only for query patterns you actually have — each
  one is a standing write-latency tax.

## Replication

- Single-leader (default): all writes to one node, reads anywhere. Simple; async
  followers can serve stale reads — read-your-writes needs care.
- Multi-leader: only for multi-datacenter or offline clients; you inherit
  write-conflict resolution.
- Leaderless (Dynamo-style): quorum reads/writes (w + r > n); high availability,
  sloppy quorums and hinted handoff weaken guarantees.
- Sync replication = durability, latency cost; async = fast, window of loss on
  failover. Semi-sync is the usual compromise.
- Replication lag creates read-after-write, monotonic-read, and consistent-prefix
  problems; fix with routing writes/reads to the leader for the affected user,
  version checks, or causal ordering — not by ignoring the lag.
- Default: single-leader with async followers unless a hard multi-region write
  requirement exists.

## Partitioning

- Range partitioning: split by contiguous key ranges (date, order ID). Efficient
  for range queries on that key; risks hotspots when some ranges are far busier
  than others.
- Hash partitioning: split by hash(key). Even distribution, no hotspots; kills
  range queries — a range scan hits every partition.
- List / composite: list buckets by discrete values (e.g., country); composite
  ranges then hashes within each range (e.g., month, then customer-id hash) —
  balances distribution against locality.
- Secondary indexes: local (per-partition — fast within one partition, needs
  scatter/gather across all partitions for a global query) vs global (single
  cross-partition index — simplifies global queries, adds write-side sync
  overhead).
- Cross-partition transactions: avoid where possible (denormalize or use
  materialized views instead); when unavoidable, two-phase commit (2PC) gives
  atomicity at the cost of latency and coordinator-failure blocking risk.
- Default: hash partitioning for even load distribution unless range queries on
  the partition key are a primary access pattern — then range (or composite)
  partitioning, accepting the hotspot risk and monitoring for skew.

## Transactions

- ACID: atomicity (all-or-nothing), consistency (invariants preserved), isolation
  (concurrent transactions behave as if run serially), durability (committed data
  survives crashes).
- Isolation ladder — each level kills more anomalies, at a performance cost:
  - Read committed: kills dirty reads (seeing another transaction's uncommitted
    write). Still allows read skew and phantoms. The common default.
  - Snapshot / repeatable read: also kills read skew (non-repeatable reads — the
    same query returning different values within one transaction). Write skew and
    phantoms can still occur.
  - Serializable: also kills write skew and phantom reads by making concurrent
    transactions behave as if executed one at a time. Achieved via strict
    two-phase locking (2PL — lock-based, blocks) or serializable snapshot
    isolation (SSI — MVCC-based, aborts conflicting transactions instead of
    blocking).
- Distributed transactions (span partitions or services): two-phase commit (2PC)
  gives atomicity but blocks on coordinator failure; sagas (local transactions
  plus compensating actions) trade strict atomicity for fault tolerance.
- Default: strongest isolation level you can afford; know which anomaly you
  accepted. Read committed is the safe baseline; move up to snapshot isolation or
  serializable when invariants span multiple rows (classic write-skew territory,
  e.g., "at least one of N must hold" constraints).

## Distributed Pitfalls

- Network: unreliable — packets delayed, dropped, reordered; partitions split the
  cluster into subgroups that can't see each other. Mitigate with timeouts and
  retries; retries need idempotency or they create duplicates.
- Clocks: physical clocks drift and NTP sync is imperfect, so cross-machine
  timestamp ordering is unreliable. Use logical clocks (Lamport timestamps, vector
  clocks) to track causal order instead of wall-clock time.
- Process failures: crash-stop (node halts cleanly — the easy case) vs Byzantine
  (node sends conflicting or malicious data — hard, needs Byzantine
  fault-tolerant protocols, rare outside adversarial/blockchain settings).
  Failure detection (heartbeats, timeouts) can't distinguish "dead" from "slow,"
  so false positives are inherent.
- Default: assume the network will partition, clocks will skew, and nodes will
  crash-stop (not Byzantine, unless operating in an adversarial trust domain) —
  design idempotent operations and quorum-based decisions rather than betting on
  a clean failure signal.

## Consistency and Consensus

- Linearizability (strong consistency): operations appear instantaneous and
  globally ordered, consistent with real time. Strongest guarantee; costs latency
  and availability (per CAP: unavailable or inconsistent during a partition).
- Eventual consistency: replicas converge once writes stop; no ordering guarantee
  in between. Cheapest on latency and availability; requires the application to
  tolerate stale reads.
- CAP theorem: during a network partition, choose consistency or availability —
  partition tolerance itself isn't optional in a real distributed system.
- Consensus (Paxos, Raft): gets all non-faulty nodes to agree on one value
  (leader, commit decision, ordering) despite failures and message loss; Raft is
  favored for understandability. Quorums (majority acknowledgment) underpin both
  consensus and quorum replication.
- Default: linearizable/consensus-backed (e.g., Raft-based leader election) for
  anything where correctness depends on a single agreed state (money, leader
  election, configuration); eventual consistency for anything read-heavy and
  tolerant of staleness (feeds, counters, caches) — decide per data item, not per
  system.

## Batch vs Stream

- Batch: bounded, static datasets processed as a complete job (MapReduce/Hadoop
  style); optimizes for throughput, not latency. Standard for ETL, data
  warehousing, periodic reports, and ML training.
- Partitioning within batch jobs: hash (even load, breaks key-sorted locality) vs
  range (preserves sort order, risks skew) — the same trade-off as database
  partitioning, applied to reducers.
- Fault tolerance: checkpointing lets a job resume from its last saved state
  instead of restarting from scratch; retried tasks must be idempotent so a retry
  doesn't double-count or corrupt output.
- Stream: continuous, unbounded data processed as it arrives (Kafka Streams,
  Flink); optimizes for latency over throughput, trading the simplicity of a
  batch's natural restart point for continuous operation — the same
  idempotent-retry discipline (previous bullet) has to hold indefinitely, since
  there's no batch boundary to fall back to.
- Default: batch for anything where results can wait (hours is fine) and
  correctness/simplicity matter most; stream only when a real business
  requirement needs sub-minute freshness — it costs meaningfully more operational
  complexity.
