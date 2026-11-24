# Track: Distributed Systems

Why distribute, partial failures, partitions, consensus, clocks, idempotency, outbox, sagas, consistency models and the traps that show up on the whiteboard.

Part of **Phase 4** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLTQZUTpyfa_k). The written lectures for this track are being published one at a time; a lesson marked *Soon* in the sidebar is still being written.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- When a written lecture lands, the *Soon* marker clears and the notes appear under the video.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Distributed Systems 101: Why Distribute & the 8 Fallacies](01-distributed-systems-101/README.md) | Explain why systems distribute, name the 8 fallacies, and make retries safe with idempotency keys | **Live** |
| 02 | [Partial Failures: Why a Slow Node Is Worse Than a Dead One](02-partial-failures/README.md) | Size timeouts, bulkheads and breakers so one slow dependency cannot take the API down | **Live** |
| 03 | [Network Partitions: CP vs AP, Split Brain & Reconciliation](03-network-partitions/README.md) | Choose CP or AP per feature, size quorums, and plan reconciliation after a heal | **Live** |
| 04 | [Failure Detection: Heartbeats, Timeouts & Phi Accrual](04-failure-detection/README.md) | Pick heartbeat timeouts, use phi accrual and SWIM suspicion, and keep false positives cheap | **Live** |
| 05 | [Clock Skew: Why You Can't Trust Timestamps (NTP, TrueTime)](05-clock-skew/README.md) | Explain skew and drift, use monotonic clocks, and replace last-write-wins with versions or bounded clocks | **Live** |
| 06 | [Lamport Clocks & Happens-Before, Explained Simply](06-lamport-clocks-happens-before-explained-simply/README.md) | Lamport Clocks & Happens-Before, Explained Simply | *Soon* |
| 07 | [Vector Clocks & Hybrid Logical Clocks: Detecting Conflicts](07-vector-clocks-hybrid-logical-clocks/README.md) | Vector Clocks & Hybrid Logical Clocks: Detecting Conflicts | *Soon* |
| 08 | [Leader Election: Leases, etcd & Fencing Tokens vs Zombies](08-leader-election/README.md) | Leader Election: Leases, etcd & Fencing Tokens vs Zombies | *Soon* |
| 09 | [Raft Consensus Explained: Leader Election & Log Replication](09-raft-consensus-explained/README.md) | Raft Consensus Explained: Leader Election & Log Replication | *Soon* |
| 10 | [Paxos Explained: Prepare, Promise, Accept — and vs Raft](10-paxos-explained/README.md) | Paxos Explained: Prepare, Promise, Accept — and vs Raft | *Soon* |
| 11 | [Quorums Explained: W + R Exceeds N, Sloppy Quorums & Hinted Handoff](11-quorums-explained/README.md) | Quorums Explained: W + R Exceeds N, Sloppy Quorums & Hinted Handoff | *Soon* |
| 12 | [Split Brain: Two Leaders, and How Quorums, Witnesses & STONITH Stop It](12-split-brain/README.md) | Split Brain: Two Leaders, and How Quorums, Witnesses & STONITH Stop It | *Soon* |
| 13 | [Distributed Locks: Is Redis Redlock Safe? Leases & Fencing Tokens](13-distributed-locks/README.md) | Distributed Locks: Is Redis Redlock Safe? Leases & Fencing Tokens | *Soon* |
| 14 | [Gossip Protocols: How Clusters Spread News (Merkle Trees, SWIM)](14-gossip-protocols/README.md) | Gossip Protocols: How Clusters Spread News (Merkle Trees, SWIM) | *Soon* |
| 15 | [Distributed Transactions in Microservices: 2PC vs Sagas vs Outbox](15-distributed-transactions-in-microservices/README.md) | Distributed Transactions in Microservices: 2PC vs Sagas vs Outbox | *Soon* |
| 16 | [Two-Phase Commit (2PC) Explained — and Why It Blocks](16-two-phase-commit-explained-and-why-it-blocks/README.md) | Two-Phase Commit (2PC) Explained — and Why It Blocks | *Soon* |
| 17 | [Saga Pattern: Choreography vs Orchestration & Compensations](17-saga-pattern/README.md) | Saga Pattern: Choreography vs Orchestration & Compensations | *Soon* |
| 18 | [Eventual Consistency in Practice: Conflicts, Guarantees & UX](18-eventual-consistency-in-practice/README.md) | Eventual Consistency in Practice: Conflicts, Guarantees & UX | *Soon* |
| 19 | [CRDTs Explained: G-Counters, OR-Sets & Conflict-Free Merges](19-crdts-explained/README.md) | CRDTs Explained: G-Counters, OR-Sets & Conflict-Free Merges | *Soon* |
| 20 | [Idempotent Consumers: Dedup Tables, Upserts & Idempotency Keys](20-idempotent-consumers/README.md) | Idempotent Consumers: Dedup Tables, Upserts & Idempotency Keys | *Soon* |
| 21 | [Exactly-Once Delivery: Myth vs Reality (and What Kafka EOS Really M…](21-exactly-once-delivery/README.md) | Exactly-Once Delivery: Myth vs Reality (and What Kafka EOS Really Means) | *Soon* |
| 22 | [Linearizability vs Serializability (and Strict Serializability)](22-linearizability-vs-serializability/README.md) | Linearizability vs Serializability (and Strict Serializability) | *Soon* |

Start here → [Distributed Systems 101: Why Distribute & the 8 Fallacies](01-distributed-systems-101/README.md)

Back to the course index: [../README.md](../README.md)
