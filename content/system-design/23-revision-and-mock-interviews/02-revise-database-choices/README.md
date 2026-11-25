# Revise Database Choices: SQL vs NoSQL, Indexes, Isolation, Sharding

> **Prerequisites:** [Previous lesson: System Design Numbers to Memorize: Latency, Nines and Powers of Two](../01-system-design-numbers-to-memorize/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates who know each database type but hesitate when asked which one to choose and why.

> [!NOTE]
> **In one line:** Choose a database by **access pattern and consistency need first**, size second, and brand last.

> [!TIP]
> **The Golden Rule:** Start from the queries: what you read by, what you write, how often, and what must never be wrong. The data model follows the queries, not the other way round.

---

## 1. Choosing by access pattern

| Need | Good fit | Why | Watch out for |
| :--- | :--- | :--- | :--- |
| Transactions, joins, constraints | Relational (PostgreSQL, MySQL) | ACID, flexible queries, mature | Vertical limits; sharding is manual work |
| Huge key-value lookups, simple access | Key-value / wide-column (DynamoDB, Cassandra) | Horizontal scale, predictable latency | Queries must match the key design; no joins |
| Documents with varying shape | Document store (MongoDB) | Flexible schema, nested data | Cross-document transactions and joins are weaker |
| Full-text and faceted search | Search engine (Elasticsearch, OpenSearch) | Inverted index, relevance | Not a primary store; eventual consistency |
| Time-ordered metrics | Time-series DB | Compression, downsampling | Cardinality limits |
| Relationships (friends, graphs) | Graph DB or adjacency lists | Fast multi-hop traversal | Scale and tooling |
| Cache, counters, leaderboards | Redis | In-memory, rich structures | Memory cost, durability limits |
| Large files | Object storage | Cheap, durable | Not for small random reads |

Many systems use several: a relational database as the source of truth, a cache in front, and a search index fed by a change stream.

---

## 2. Indexes in one page

- An **index** is a sorted structure (usually a B-tree) that turns a scan of N rows into about log N lookups. It speeds reads and slows writes, and uses space.
- A **composite index** on `(a, b)` helps queries on `a` and on `a, b`, but not on `b` alone (leftmost prefix rule).
- A **covering index** contains every column the query needs, so the table is never touched.
- **LSM trees** (Cassandra, RocksDB) buffer writes in memory and merge sorted files, which makes writes cheap and reads a little more expensive. **B-trees** favour reads and in-place updates.
- Low-cardinality columns (a boolean flag) make poor standalone indexes; high-cardinality columns (user id) make good ones.

---

## 3. Isolation levels and the anomalies they allow

| Isolation level | Dirty read | Non-repeatable read | Phantom read | Write skew |
| :--- | :--- | :--- | :--- | :--- |
| Read committed | No | Possible | Possible | Possible |
| Repeatable read / snapshot | No | No | Mostly no (engine dependent) | Possible |
| Serializable | No | No | No | No |

Default to read committed or snapshot isolation for most workloads, and use serializable (or explicit locks such as `SELECT ... FOR UPDATE`, or conditional updates) where a check-then-write invariant matters, such as not overdrawing an account or not double-booking a seat.

---

## 4. Scaling a database: the ladder

1. **Optimise queries and indexes.** Cheapest and often enough.
2. **Add a cache** in front for hot reads.
3. **Read replicas** for read-heavy load, accepting replication lag.
4. **Vertical scaling**: a bigger machine, until it stops being economic.
5. **Partition by key (sharding)**: pick a shard key with even distribution that matches the main access pattern. Cross-shard queries and transactions become expensive.
6. **Choose a store built for distribution** (Cassandra, DynamoDB, Spanner, CockroachDB) when the access pattern fits.

Shard-key advice: avoid keys that create hot spots (a timestamp, or a celebrity user), prefer a hash of a high-cardinality id, and say what you give up (range queries, cross-shard joins).

---

## Why a composite index follows the leftmost prefix

A composite index on (country, city) is a sorted list; searching by country alone is a range scan, but searching by city alone cannot use the order.

```python
import bisect

rows = [("DE", "Berlin"), ("DE", "Munich"), ("FR", "Lyon"), ("FR", "Paris"), ("IN", "Pune"), ("IN", "Delhi")]
index = sorted(rows)  # composite index on (country, city)

def by_country(c):
    lo = bisect.bisect_left(index, (c,))
    hi = bisect.bisect_left(index, (c + "\uffff",))
    return index[lo:hi]

print(by_country("FR"))
print("by city alone needs a full scan:", [r for r in index if r[1] == "Pune"])
```

Output (produced by running this exact code):

```text
[('FR', 'Lyon'), ('FR', 'Paris')]
by city alone needs a full scan: [('IN', 'Pune')]
```

Looking up a country is two binary searches and a slice, while looking up a city alone has to examine every entry, which is the leftmost prefix rule in action.

---

## Common Mistakes

- Naming a product before stating the access pattern.
- Using a NoSQL store and then needing joins.
- Sharding too early, before queries, indexes and caches are exhausted.
- Choosing a hot shard key such as a timestamp.
- Forgetting that read replicas serve slightly stale data.

---

## Practice Questions

<details>
<summary><strong>Q1: SQL or NoSQL for an e-commerce order system?</strong></summary>

Relational for orders and payments because they need transactions and constraints. Add a cache and a search index around it; use a key-value store for the cart or sessions if scale demands it.

</details>

<details>
<summary><strong>Q2: How do you pick a shard key?</strong></summary>

High cardinality, even spread, matching the dominant query. For user data, the user id hashed. Avoid timestamps and keys that concentrate traffic.

</details>

<details>
<summary><strong>Q3: What is write skew and how do you prevent it?</strong></summary>

Two transactions read the same data, each decides a write is safe, and together they break an invariant (two doctors both go off call). Prevent with serializable isolation, locking the checked rows, or a constraint.

</details>

<details>
<summary><strong>Q4: When do read replicas not help?</strong></summary>

When the bottleneck is writes, when reads need the latest data, or when the working set exceeds memory on each replica.

</details>

<details>
<summary><strong>Q5: B-tree or LSM tree?</strong></summary>

B-trees suit read-heavy and update-in-place workloads; LSM trees suit write-heavy workloads with sequential disk writes, at the cost of read amplification and compaction.

</details>

<details>
<summary><strong>Q6: How do you combine databases in one system?</strong></summary>

One source of truth (often relational), with derived stores (cache, search, analytics) fed from it by a change stream and treated as rebuildable.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Choose by | Access pattern, consistency, scale, then product |
| Relational | Transactions, joins, constraints |
| Key-value / wide-column | Scale and predictable latency, simple queries |
| Indexes | Leftmost prefix, cost on writes, covering indexes |
| Isolation | Read committed default; serializable for invariants |
| Scaling ladder | Query tuning, cache, replicas, bigger box, shard, distributed store |

---

## Further Reading

- Martin Kleppmann, *Designing Data-Intensive Applications*, chapters 3, 5, 6 and 7.
- Use The Index, Luke (use-the-index-luke.com), a free guide to SQL indexing.

---

## Next

Continue with [Revise Caching, Messaging and Consistency: Outbox, Sagas, Idempotency](../03-revise-caching-messaging-and-consistency/README.md).
