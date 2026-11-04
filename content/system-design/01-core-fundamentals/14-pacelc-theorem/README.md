# Lesson 14: PACELC Theorem

## Roadmap

You are in **System Design Interview Prep**, Track 01, **Core Fundamentals**: lesson 14 of 19 (CAP's missing half: latency vs consistency). It builds on [Lesson 13: CAP Theorem](../13-cap-theorem/README.md). Next comes [Lesson 15: Consistency Models](../15-consistency-models/README.md).

These are the written notes for the lesson's video. Prefer paper? The same notes are a free, printable PDF: [download SD-A-014.pdf](https://backendroadmap.com/notes/system-design/SD-A-014.pdf).

## Concept

> [!key] PACELC says: during a Partition choose Availability or Consistency; Else, when healthy, choose Latency or Consistency, because keeping replicas in sync always costs waiting time.

## Explanation

### Reading the name

CAP only describes what happens during a network partition, and partitions are rare. PACELC (Daniel Abadi, 2010) covers the other 99%+ of the time. Read it as a sentence: if **P**artition, choose **A** or **C**; **E**lse, choose **L**atency or **C**onsistency.

![PACELC as a decision. The “else” branch applies every day, with no failures at all.](images/figure-1.svg)

*Figure 1. PACELC as a decision. The “else” branch applies every day, with no failures at all.*

### Why there's a trade-off without failures

Replication. To keep replicas consistent, a write must wait until other replicas confirm it, and waiting costs time. If you don't wait, you answer faster, but a replica may briefly return old data.

![Synchronous replication pays latency for agreement; asynchronous pays staleness for speed.](images/figure-2.svg)

*Figure 2. Synchronous replication pays latency for agreement; asynchronous pays staleness for speed.*

### Classifying real databases

| System | Class | What it means |
|---|---|---|
| **Cassandra** (default) | PA / EL | Available during partitions, fast otherwise; tunable per query |
| **DynamoDB** (default) | PA / EL | Eventually consistent reads by default; strongly consistent reads on request, at extra latency and cost |
| **Google Spanner** | PC / EC | Consistent always; pays with commit latency (TrueTime, cross-region consensus) |
| **PostgreSQL + sync replica** | PC / EC | Writes wait for the standby; no stale reads from it |
| **PostgreSQL + async replicas** | EL on reads | Fast writes; replica reads can lag |

> [!model] **A sharper interview answer.** Don't stop at “it's AP”. Say what the system does during a partition *and* what it trades in normal operation: “We accept slightly stale reads for low latency on product pages, but reads on the checkout path go to the primary.”

## Key terms

| Term | Meaning |
|---|---|
| **PACELC** | Partition: A or C; Else: L or C |
| **Synchronous replication** | write waits for replicas |
| **Asynchronous replication** | write returns, replicas catch up |
| **Replication lag** | how far a replica is behind |
| **PA/EL** | available + fast, may be stale |
| **PC/EC** | consistent always, slower |

## Code

The "else" choice is not a property of the product; it is configuration you set. In PostgreSQL:

| Setting | What a `COMMIT` waits for | PACELC |
|---|---|---|
| Asynchronous streaming replication (the default) | the primary's own WAL flush only; replicas catch up afterwards | EL: fast writes, replica reads may lag |
| `synchronous_standby_names = '*'` with `synchronous_commit = on` | the standby has the write on disk | durable on failover, but a read on the standby can still be a moment behind |
| ... with `synchronous_commit = remote_apply` | the standby has applied the write | EC: no stale reads on that standby, slowest writes |

Other stores expose the same dial per request: Cassandra's consistency level, DynamoDB's `ConsistentRead`, and Redis's `WAIT numreplicas timeout`, which blocks until that many replicas have the earlier writes (Redis replication stays asynchronous, so a failover can still lose them).

How far behind a replica is, measured on the replica:

```sql
SELECT now() - pg_last_xact_replay_timestamp() AS replica_lag;
```

That number is your staleness budget: any read from this replica can be up to that far behind. (On an idle primary it keeps growing, because nothing new has been replayed; measure it under write load.)

## Practice

### 1. Pay the E in PACELC

On a primary + streaming replica pair (the two-container setup in [Backend Track 04, Module 08](../../../backend/04-databases-and-data-layer/08-replication-and-sharding/README.md) is enough), benchmark writes with replication asynchronous, then synchronous:

```bash
docker compose exec primary pgbench -U postgres -i shop
docker compose exec primary pgbench -U postgres -c 4 -T 15 shop      # note "latency average"
docker compose exec primary psql -U postgres -c "ALTER SYSTEM SET synchronous_standby_names = '*'" -c "ALTER SYSTEM SET synchronous_commit = 'remote_apply'" -c "SELECT pg_reload_conf()"
docker compose exec primary pgbench -U postgres -c 4 -T 15 shop      # compare
```

What changed, and was there a partition?

<details><summary>Answer</summary>

Average latency goes up and transactions per second go down, because every commit now waits for a round trip to the standby and for the standby to apply it. On one machine the difference is small; across regions each write would pay roughly 100 ms more. There was no partition: this is the "else, latency or consistency" half of PACELC, paid on every write on a perfectly healthy day. Undo it with `ALTER SYSTEM RESET synchronous_standby_names; ALTER SYSTEM RESET synchronous_commit; SELECT pg_reload_conf();`.

</details>

## Interview questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system) and **Tricky** (the follow-ups interviewers use to go deeper). Answer out loud before you open the answer.

> [!interview] What does PACELC add to CAP? (Basic)

<details><summary>What a strong answer covers</summary>

The else case: even with no partition, you trade latency for consistency, because replicas must coordinate to agree.

</details>

> [!interview] Classify DynamoDB under PACELC. (Basic)

<details><summary>What a strong answer covers</summary>

PA/EL by default (eventually consistent reads), with optional strongly consistent reads that move it toward consistency at extra latency and cost.

</details>

> [!interview] Why is Spanner PC/EC? (Basic)

<details><summary>What a strong answer covers</summary>

It keeps strong consistency always, using cross-region consensus and TrueTime, and pays for it with higher commit latency.

</details>

> [!interview] Your app replicates India → Europe. Users in Europe see old data after edits. Options? (Scenario)

<details><summary>What a strong answer covers</summary>

Make the replication synchronous for that data (EC, +100 ms writes), route the author's reads to the primary region for a while (read-your-writes), or accept the lag where it's harmless.

</details>

> [!interview] Which reads in an e-commerce site would you make strongly consistent? (Scenario)

<details><summary>What a strong answer covers</summary>

Inventory at checkout, payment status and order confirmation. Product pages, reviews and recommendations can be eventually consistent for speed and cost.

</details>

> [!interview] When would you pay for synchronous cross-region replication? (Scenario)

<details><summary>What a strong answer covers</summary>

When losing or disagreeing on a write is unacceptable (financial ledgers, critical config) and the business can accept ~100 ms more write latency.

</details>

> [!interview] Is a single-node PostgreSQL PA, PC, EL or EC? (Tricky)

<details><summary>What a strong answer covers</summary>

PACELC is about replicated systems. A single node is consistent but has no replicas to trade against; once you add async replicas, reads from them become EL.

</details>

> [!interview] Can one system be EL for one query and EC for another? (Tricky)

<details><summary>What a strong answer covers</summary>

Yes. Cassandra (consistency level per query) and DynamoDB (consistent-read flag) let you choose per request; describe the behaviour per feature.

</details>

## Common mistakes & troubleshooting

- Thinking consistency only costs something during failures.
- Forgetting cross-region replication adds ~100 ms per synchronous write.
- Labelling a tunable database with one fixed class.
- Using strongly consistent reads everywhere “to be safe” and paying 2× cost.
- Assuming a synchronous standby never serves stale reads. With PostgreSQL's default `synchronous_commit = on` it has the write on disk, not yet applied; only `remote_apply` closes that gap.

## Further reading & sources

- [Consistency Tradeoffs in Modern Distributed Database System Design (Daniel Abadi)](https://www.cs.umd.edu/~abadi/papers/abadi-pacelc.pdf) - the paper that introduced PACELC and its "else, latency or consistency" clause.
- [PACELC theorem (Wikipedia)](https://en.wikipedia.org/wiki/PACELC_theorem) - a short overview with a table classifying common databases.
- [PostgreSQL: High Availability, Load Balancing, and Replication](https://www.postgresql.org/docs/current/high-availability.html) - streaming and synchronous replication, and what each `synchronous_commit` level waits for.

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-A-014.pdf](https://backendroadmap.com/notes/system-design/SD-A-014.pdf). All Phase 1 notes in one file: [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf).

## Next

Continue with [Lesson 15: Consistency Models](../15-consistency-models/README.md).
