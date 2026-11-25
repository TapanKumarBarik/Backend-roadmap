# Revise Caching, Messaging and Consistency: Outbox, Sagas, Idempotency

> **Prerequisites:** [Previous lesson: Revise Database Choices: SQL vs NoSQL, Indexes, Isolation, Sharding](../02-revise-database-choices/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates revising how cached, queued and distributed data stays correct, including outbox, sagas and idempotency.

> [!NOTE]
> **In one line:** Caches, queues and distributed writes all trade **freshness and simplicity for speed and scale**; the patterns here are how you keep them correct.

> [!TIP]
> **The Golden Rule:** Assume every message can be delivered twice, every cache can be stale, and every step can fail halfway. Design each operation to be safe to repeat.

---

## 1. Caching patterns

| Pattern | How it works | Use when | Risk |
| :--- | :--- | :--- | :--- |
| Cache-aside | App checks cache, on miss reads DB and fills cache | Most read-heavy cases | Stale data, stampede on expiry |
| Read-through | Cache loads from DB itself | Simpler clients | Same as above |
| Write-through | Write to cache and DB together | Reads must see fresh data | Write latency, cache of unread data |
| Write-behind | Write to cache, flush to DB later | Very high write rates | Data loss if the cache dies |
| Write-around | Write to DB, skip cache | Data rarely read after write | First read is a miss |

Invalidate on write (delete the key) rather than update it, which avoids races. Add TTLs as a safety net. Prevent stampedes with request coalescing, jittered TTLs and early refresh. Eviction is usually LRU or LFU.

---

## 2. Messaging semantics

- **At-most-once**: may lose messages, never duplicates. Fine for metrics.
- **At-least-once**: never loses, may duplicate. The practical default; consumers must be idempotent.
- **Exactly-once effect**: at-least-once delivery plus idempotent processing (or transactional writes). True exactly-once delivery across systems is not generally achievable.

Ordering is usually guaranteed **per partition or key**, not globally. Use a key (user id, order id) to keep related events in order. Use consumer groups to scale consumers, and dead-letter queues for poison messages. Retry with exponential backoff and jitter.

---

## 3. Idempotency, outbox and sagas

**Idempotency key.** The client sends a unique key per logical operation; the server stores the key and result and returns the stored result on a repeat. Essential for payments and anything retried.

**Transactional outbox.** To update the database and publish an event without losing either, write the event to an `outbox` table in the **same transaction** as the data change, and have a separate relay publish it. This avoids the dual-write problem (database commit succeeds, message publish fails).

**Saga.** A multi-service business transaction as a sequence of local transactions, each with a compensating action. Two styles: *orchestration* (a coordinator calls the steps) and *choreography* (services react to events). Compensations must be safe to retry. Sagas give eventual consistency, not isolation, so design for intermediate states.

---

## 4. Consistency vocabulary

| Term | Meaning | Example |
| :--- | :--- | :--- |
| Strong (linearizable) | Every read sees the latest write | A bank balance |
| Eventual | Replicas converge if writes stop | A like count |
| Read-your-writes | You see your own updates | Profile edit shows immediately |
| Monotonic reads | You never see time go backwards | Feed does not lose items on refresh |
| Causal | Related events appear in order | Reply after the comment |

CAP in one line: during a **partition** you must choose between consistency (refuse some requests) and availability (answer, possibly stale). PACELC adds that even without a partition there is a latency versus consistency trade-off.

---

## Idempotent consumer with a processed-ids set

At-least-once delivery sends a message twice; the consumer records ids it has handled so the effect happens once.

```python
processed = set()
balance = {"acct": 100}

def handle(msg):
    if msg["id"] in processed:
        return "duplicate ignored"
    balance["acct"] += msg["amount"]
    processed.add(msg["id"])
    return "applied"

stream = [{"id": "m1", "amount": 50}, {"id": "m1", "amount": 50}, {"id": "m2", "amount": -20}]
print([handle(m) for m in stream])
print(balance)
```

Output (produced by running this exact code):

```text
['applied', 'duplicate ignored', 'applied']
{'acct': 130}
```

The redelivered message `m1` is ignored, so the balance is 130 (100 + 50 - 20) and not 180. In production the processed-ids set and the balance update must be committed in the same transaction.

---

## Common Mistakes

- Updating the cache instead of deleting the key on write.
- Dual writes to the database and a broker without an outbox.
- Promising exactly-once delivery.
- Assuming global ordering across partitions.
- A saga without compensations or without handling intermediate states.

---

## Practice Questions

<details>
<summary><strong>Q1: How do you invalidate a cache correctly?</strong></summary>

Delete the key after the database write commits (cache-aside), add a TTL as a safety net, and accept a short window of staleness.

</details>

<details>
<summary><strong>Q2: What is the dual-write problem?</strong></summary>

Writing to a database and a message broker separately can leave them inconsistent if one fails. The outbox pattern writes the event in the same transaction as the data and publishes it afterwards.

</details>

<details>
<summary><strong>Q3: Can you get exactly-once?</strong></summary>

Not as a delivery guarantee across systems. You get exactly-once effect by combining at-least-once delivery with idempotent processing.

</details>

<details>
<summary><strong>Q4: How do you order events for one user?</strong></summary>

Use the user id as the partition key so all their events go to one partition and are processed in order.

</details>

<details>
<summary><strong>Q5: Orchestration or choreography?</strong></summary>

Orchestration is easier to follow and monitor for complex flows; choreography has less coupling to a coordinator but is harder to trace. Pick orchestration when the flow is business critical.

</details>

<details>
<summary><strong>Q6: What does CAP say?</strong></summary>

During a network partition a system must choose between consistency and availability; when there is no partition it can have both.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Cache | Cache-aside, delete on write, TTL, coalesce loads |
| Delivery | At-least-once plus idempotent consumers |
| Ordering | Per partition key, not global |
| Outbox | Event row in the same transaction, relay publishes |
| Saga | Local transactions plus compensations |
| Consistency | Strong for money, eventual for counts, read-your-writes for UX |

---

## Further Reading

- Chris Richardson, *Microservices Patterns*, chapters on sagas and the transactional outbox.
- Kyle Kingsbury, *Jepsen* analyses, for how real systems fail consistency claims.

---

## Next

Continue with [Revise Reliability and Security Patterns: Breakers, DR, RTO/RPO, OAuth](../04-revise-reliability-and-security-patterns/README.md).
