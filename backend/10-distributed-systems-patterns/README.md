# 10 - Distributed Systems Patterns

This track is about what changes the moment your system stops being a single
process talking to a single database and becomes *many* processes, services, and
datastores that must cooperate over an unreliable network. Once state lives in more
than one place — a primary and a replica, a cache and a database, three services
each owning their own store — failure and duplication stop being edge cases and
become the *default* operating condition: requests get retried, messages get
redelivered, nodes crash mid-operation, and the network partitions when you least
expect it. Each module here is a specific, battle-tested pattern for staying correct
under exactly those conditions — consistency choices, idempotency, locking,
transactions, sagas, CQRS, event sourcing, and consensus — and, just as important,
the *judgment* about when each pattern earns its complexity and when it's overkill.

## How this track works

- It assumes you've finished **track 04 (Databases and Data Layer)** — you're
  comfortable with transactions, ACID, isolation levels, lost updates, `SELECT ...
  FOR UPDATE`, replication, and primary/replica setups, all of which this track
  builds directly on — and **track 06 (Background Processing and Realtime)**, whose
  at-least-once delivery, retries, webhooks, and the transactional outbox recur in
  almost every module here (idempotency, sagas, and CQRS projections all lean on
  them).
- Every module builds on the ones before it, and they tell one continuous story:
  each pattern is a response to a failure the previous module exposed. The
  reliability disciplines established early — per-operation consistency, idempotent
  operations, fencing tokens — recur throughout and converge in the capstone. Go in
  order.
- Each standard module (00–07) has the same shape: why it matters, concepts, a
  command reference with real Python/FastAPI code, progressive hands-on exercises
  (including a "diagnose and fix" scenario each), an independent challenge with no
  code, common mistakes, and a checkpoint quiz. Modules 04 and 07 also carry a
  closed-book **cumulative review** that stitches the preceding modules together.
- All exercises run locally against Postgres, Redis, and (for the coordination
  module) etcd in Docker — no cloud account required.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [CAP theorem and consistency models](00-cap-theorem-and-consistency-models/README.md) | Choose the right consistency (strong/eventual/causal) *per operation*, reason with CAP and PACELC, and handle replication lag and read-your-writes | 75-100 min |
| 01 | [Idempotency in practice](01-idempotency-in-practice/README.md) | Make non-idempotent operations safe to retry with idempotency keys, natural idempotency, and idempotent consumers | 75-100 min |
| 02 | [Distributed locking](02-distributed-locking/README.md) | Build a correct Redis lock, understand lock expiry and fencing tokens, and tell efficiency locks from correctness locks | 75-100 min |
| 03 | [Distributed transactions and two-phase commit](03-distributed-transactions-and-two-phase-commit/README.md) | Understand 2PC, why the coordinator blocks and doesn't scale, and when to avoid distributed transactions entirely | 75-100 min |
| 04 | [The saga pattern](04-the-saga-pattern/README.md) | Coordinate multi-service transactions with choreography/orchestration sagas and compensating transactions | 90-120 min |
| 05 | [CQRS](05-cqrs/README.md) | Separate read and write models, judge when the split earns its complexity, and handle the eventual consistency it introduces | 75-100 min |
| 06 | [Event sourcing](06-event-sourcing/README.md) | Store state as an immutable event log, rebuild state by replaying, use snapshots, and pair event sourcing with CQRS | 90-120 min |
| 07 | [Consensus and coordination](07-consensus-and-coordination/README.md) | Reason about consensus (Raft), quorums, and leader election, and use etcd/ZooKeeper/Postgres instead of building your own | 90-120 min |
| 08 | [Capstone project](08-capstone-project/README.md) | Design and partially build a distributed order-processing system integrating idempotency, a saga, and event sourcing | 4-6 hrs |

Start here → [00-cap-theorem-and-consistency-models/README.md](00-cap-theorem-and-consistency-models/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, you'll carry these patterns into every system
design that follows — you'll recognize the saga hiding in every multi-step workflow,
the idempotency key missing from every retry path, and the consensus problem lurking
behind every "just have one of them do it."
