# Deep-Dive Drills: Go Three Levels Deep on Any Component

> **Prerequisites:** [Previous lesson: Peer Mock Interviews for System Design: Rubric and Feedback](../08-peer-mock-interviews-for-system-design/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates who draw a good high-level diagram but run out of depth when the interviewer asks 'how does that actually work?'

> [!NOTE]
> **In one line:** A deep dive is **going three levels down on one component**: what it does, how it does it, and what breaks.

> [!TIP]
> **The Golden Rule:** For any box you draw, be ready to answer: what is the data structure, what is the failure mode, and what is the trade-off. If you cannot, you drew a label, not a design.

---

## 1. The three-level drill

Pick a component and answer in order:

| Level | Question | Example for a message queue |
| :--- | :--- | :--- |
| 1. What | What problem does it solve and what is its interface? | Decouples producers and consumers; enqueue, receive, ack |
| 2. How | What are the data structures and algorithms inside? | Partitioned append-only log, consumer offsets, replication |
| 3. Break | How does it fail, and what do you do about it? | Consumer crash: redelivery; broker loss: replica takes over; poison message: dead-letter queue |

Practise until each level takes about a minute without notes.

---

## 2. Component checklist

Run these questions against any component:

- **Data**: what is stored, what is the key, what is the size, how is it partitioned?
- **Read and write path**: step by step, what happens for one request?
- **Consistency**: what guarantees does it give, and what can be stale?
- **Scaling**: what is the bottleneck, and how do you add capacity?
- **Failure**: what if it is slow, down, or returns wrong data? What is the blast radius?
- **Operations**: how do you deploy, migrate and monitor it?
- **Cost**: what grows with scale (storage, bandwidth, compute)?

---

## 3. Twelve drills to rotate through

1. Cache: eviction, stampede, invalidation, hot keys.
2. Message queue: ordering, redelivery, backpressure, poison messages.
3. Rate limiter: algorithm, atomic counters, failure mode.
4. Consistent hashing: ring, virtual nodes, rebalancing.
5. Database sharding: shard key, hot shard, resharding, cross-shard queries.
6. Replication: leader-follower, lag, failover, split brain.
7. Search index: inverted index, sharding, ranking, freshness.
8. Distributed lock: lease, fencing token, clock issues.
9. ID generation: Snowflake layout, clock skew, ordering.
10. CDN: cache keys, TTL, purge, origin shield.
11. WebSocket gateway: connection state, routing, reconnect.
12. Object storage: durability, erasure coding, lifecycle.

---

## 4. A worked example: distributed lock

**Level 1.** A lock ensures only one worker performs a critical action at a time across machines. Interface: acquire with a lease, release.

**Level 2.** A key in a store (Redis or a consensus system such as etcd) set only if absent, with a time-to-live so a crashed holder cannot block forever. The holder renews the lease while working.

**Level 3.** A paused holder (long garbage collection) may wake after its lease expired and act while a new holder is working, which causes corruption. The fix is a **fencing token**: each lock grant carries an increasing number, and the protected resource rejects any request with an older token. Clocks cannot be trusted for correctness, so rely on the store's ordering, not on local time.

---

## Fencing tokens in a few lines

A stale lock holder is rejected by the resource because its token is older than the newest one it has seen.

```python
class Resource:
    def __init__(self):
        self.highest = 0
        self.value = None

    def write(self, token, value):
        if token < self.highest:
            return f"rejected stale token {token}"
        self.highest = token
        self.value = value
        return f"accepted token {token}"

r = Resource()
print(r.write(1, "A"))   # holder 1 gets the lock
print(r.write(2, "B"))   # holder 1 paused, lease expired, holder 2 took over
print(r.write(1, "A2"))  # holder 1 wakes up and tries to write
print(r.value)
```

Output (produced by running this exact code):

```text
accepted token 1
accepted token 2
rejected stale token 1
B
```

The late write from the first holder is rejected, so the value stays `B`. The lock alone could not have prevented this; the fencing token at the resource does.

---

## Common Mistakes

- Naming a component and stopping.
- Describing the happy path only.
- Using wall-clock time for correctness in locks.
- No mention of what grows with scale.
- Memorising answers instead of practising the three levels.

---

## Practice Questions

<details>
<summary><strong>Q1: What is a deep dive in an interview?</strong></summary>

The interviewer picks a component and asks how it really works; you go from interface to internals to failure modes.

</details>

<details>
<summary><strong>Q2: How do you prepare?</strong></summary>

Rotate through a list of common components and practise the three-level drill aloud until each level takes about a minute.

</details>

<details>
<summary><strong>Q3: What if I do not know the internals?</strong></summary>

Reason from requirements: state the data and access pattern, propose a structure, and name the failure modes; say which part you are unsure of.

</details>

<details>
<summary><strong>Q4: Why is a distributed lock tricky?</strong></summary>

Leases expire while a holder is paused, so two holders may act. A fencing token checked by the resource prevents the stale one from writing.

</details>

<details>
<summary><strong>Q5: How deep is deep enough?</strong></summary>

Until you have named a data structure or algorithm, a failure mode and a trade-off for the component.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Three levels | What, how, break |
| Checklist | Data, paths, consistency, scaling, failure, operations, cost |
| Rotate | Cache, queue, limiter, hashing, sharding, replication, search, lock, IDs, CDN, WebSocket, object storage |
| Lock | Lease plus fencing token; do not trust clocks |
| Rule | Always finish with a failure mode and a trade-off |

---

## Further Reading

- Martin Kleppmann, *How to do distributed locking* (martin.kleppmann.com).
- [Deep Dives and Bottlenecks](../../21-interview-framework/10-deep-dives-and-bottlenecks/README.md) in this course.

---

## Next

Continue with [GenAI System Design Mock Interview: What Interviewers Look For](../10-genai-system-design-mock-interview/README.md).
