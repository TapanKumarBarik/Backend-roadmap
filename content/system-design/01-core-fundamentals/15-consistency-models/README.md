# Lesson 15: Consistency Models

## Roadmap

You are in **System Design Interview Prep**, Track 01, **Core Fundamentals**: lesson 15 of 19 (linearizable vs causal vs eventual, and session guarantees). It builds on [Lesson 14: PACELC Theorem](../14-pacelc-theorem/README.md). Next comes [Lesson 16: Fault Tolerance](../16-fault-tolerance/README.md).

These are the written notes for the lesson's video. Prefer paper? The same notes are a free, printable PDF: [download SD-A-015.pdf](https://backendroadmap.com/notes/system-design/SD-A-015.pdf).

## Concept

> [!key] Consistency is a spectrum, from linearizable (one copy, costly) to eventual (cheap, may be stale); session guarantees like read-your-writes protect each user in between.

## Explanation

### The spectrum

![Stronger models are easier to reason about but need coordination; weaker ones are cheaper and stay available.](images/figure-1.svg)

*Figure 1. Stronger models are easier to reason about but need coordination; weaker ones are cheaper and stay available.*

| Model | Promise | Typical use |
|---|---|---|
| **Linearizable** | Once a write completes, every later read (by anyone) sees it, as if there were one copy | Locks, leader election, balances |
| **Sequential** | Everyone sees operations in the same order, but possibly behind real time | Replicated logs |
| **Causal** | If A caused B (a reply to a post), everyone sees A before B; unrelated events may appear in different orders | Comments, chat threads |
| **Eventual** | If writes stop, replicas converge; until then reads may be stale | Likes, view counts, feeds |

### Session guarantees

Between the extremes, session guarantees protect a single user's experience:

- **Read-your-writes:** you always see your own changes.
- **Monotonic reads:** once you've seen a newer value, you never see an older one again.
- **Monotonic writes:** your writes are applied in the order you made them.
- **Writes-follow-reads:** a reply you write is ordered after the post you read.

### Why read-your-writes matters

![The write goes to the primary, the reload reads a lagging replica, and the author sees the old value.](images/figure-2.svg)

*Figure 2. The write goes to the primary, the reload reads a lagging replica, and the author sees the old value.*

> [!example] **Three ways to provide it on replicas.** 1. **Read your own data from the primary** for a short window (e.g. 10 s) after you write.
> 2. **Track a version:** remember the log position (LSN) of the user's last write in the session, and read only from a replica that has caught up to it.
> 3. **Pin the user to one replica** to get monotonic reads, so time never goes backwards for them.

## Key terms

| Term | Meaning |
|---|---|
| **Linearizable** | behaves like one copy |
| **Causal** | causes are seen before effects |
| **Eventual** | replicas converge over time |
| **Read-your-writes** | you see your own changes |
| **Monotonic reads** | never see an older value again |
| **Replica lag** | how far behind a replica is |

## Code

Pick the model per operation, not per system. The question is always: what does it cost if this read is stale, or these two events are seen out of order? A balance read before a withdrawal needs the latest value; a review count can lag; a chat thread needs causal order but not global freshness.

The second technique from the example above, read-your-writes on PostgreSQL replicas, fits in a few lines: remember where in the log the user's last write ended, and read from a replica only if it has replayed that far.

```python
from sqlalchemy import create_engine, text

primary = create_engine("postgresql+psycopg://postgres:devpass@localhost:5432/shop")
replica = create_engine("postgresql+psycopg://postgres:devpass@localhost:5433/shop")
last_write_lsn: dict[int, str] = {}  # per user; in production, keep it in the session

def save_bio(uid: int, bio: str) -> None:
    with primary.begin() as c:
        c.execute(text("UPDATE profiles SET bio = :b WHERE id = :i"), {"b": bio, "i": uid})
    # Read the log position after COMMIT, so it includes the commit itself.
    with primary.connect() as c:
        last_write_lsn[uid] = c.execute(text("SELECT pg_current_wal_lsn()::text")).scalar_one()

def read_bio(uid: int) -> str:
    query = text("SELECT bio FROM profiles WHERE id = :i")
    lsn = last_write_lsn.get(uid)
    with replica.connect() as c:
        caught_up = lsn is None or c.execute(
            text("SELECT pg_last_wal_replay_lsn() >= CAST(:l AS pg_lsn)"), {"l": lsn}
        ).scalar_one()
        if caught_up:
            return c.execute(query, {"i": uid}).scalar_one()
    with primary.connect() as c:  # this replica is behind the user's own write
        return c.execute(query, {"i": uid}).scalar_one()
```

Only the user who just wrote is ever sent to the primary; everyone else keeps reading the replica.

## Practice

### 1. Pick a model per operation

For an online store, say whether each operation needs **strong**, **causal** or **eventual** consistency, with one sentence why: (a) checking that a coupon code is still valid before applying it; (b) the "142 people bought this" badge; (c) the chat thread between buyer and seller; (d) reserving the last unit in stock at checkout; (e) the seller's average star rating.

<details><summary>Answer</summary>

(a) Strong: a stale "still valid" lets the coupon be redeemed too many times. (b) Eventual: 142 or 143 for a few seconds harms nobody. (c) Causal: replies must appear after the messages they answer. (d) Strong: a stale count oversells. (e) Eventual: an average one review behind is invisible. The exact labels matter less than asking the cost question for each operation.

</details>

### 2. Watch read-your-writes work

On a primary + streaming replica pair (the two-container setup in [Backend Track 04, Module 08](../../../backend/04-databases-and-data-layer/08-replication-and-sharding/README.md) is enough), create `profiles (id INT PRIMARY KEY, bio TEXT)` with one row on the primary. Freeze the replica with `SELECT pg_wal_replay_pause();` (run on the replica; it keeps answering queries but stops applying changes). Call `save_bio`, then `read_bio`, and also query the replica directly. Then run `SELECT pg_wal_replay_resume();` and call `read_bio` again.

<details><summary>Answer</summary>

While replay is paused, a direct query on the replica returns the old bio: that is eventual consistency, frozen so you can see it. `read_bio` still returns the new bio, because the replica's replay position is behind the stored LSN and the read falls back to the primary. After resuming, the replica catches up, the check passes and `read_bio` is served by the replica again. The author gets read-your-writes; every other reader still costs the primary nothing.

</details>

### 3. Diagnose: the vanishing signup

A user reports: "I created my account, landed on my dashboard, and it said *user not found*. When I refreshed, I was there." Signup writes the user row on the primary and returns `201`; the dashboard immediately calls `GET /me`, which the team recently "optimized" to read from a replica. What is the cause, and what are two correct fixes?

<details><summary>Answer</summary>

A **read-your-writes** violation. `GET /me` reached a replica that had not yet received the new row, so it correctly returned "not found"; by the refresh it had caught up. The replica is behaving exactly as an eventually consistent replica should. The bug is sending a read that needs the user's own fresh write to a store that cannot promise it yet.

Fixes: (1) route this read to the primary (per operation, not "all reads go to replicas"); (2) store the signup's log position in the session and serve `/me` from a replica only once it has replayed past it, as in the code above. A simpler third option is "read from the primary for N seconds after a write".

</details>

## Project

Design the consistency strategy for **seat selection** in a concert-ticketing system: users browse a live seat map, see "12 seats left in this section", place a temporary hold on seats during checkout, and buy. For each of those four operations, state the consistency model, how much staleness it tolerates, and what a user would see go wrong if you chose a weaker model for the operations that need a strong one. No solution is given. (Hint: the line between strong and eventual is the *claim*, not the *browse*.)

## Interview questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system) and **Tricky** (the follow-ups interviewers use to go deeper). Answer out loud before you open the answer.

> [!interview] Linearizability vs eventual consistency? (Basic)

<details><summary>What a strong answer covers</summary>

Linearizable: every read sees the latest completed write, as if there were one copy. Eventual: replicas converge only over time, so reads may be stale.

</details>

> [!interview] What is causal consistency? (Basic)

<details><summary>What a strong answer covers</summary>

Operations that are causally related (a reply and its post) are seen in the same order by everyone; unrelated operations may be seen in different orders.

</details>

> [!interview] How do you provide read-your-writes on replicas? (Basic)

<details><summary>What a strong answer covers</summary>

Route the author's reads to the primary for a short window, or read only from replicas that have caught up to the version of their last write.

</details>

> [!interview] Comments sometimes appear before the post they reply to. Which model fixes it? (Scenario)

<details><summary>What a strong answer covers</summary>

Causal consistency: track the dependency (the reply references the post's version) and don't show the reply until the post is visible on that replica.

</details>

> [!interview] A user's balance flickers between two values on refresh. Why, and how do you fix it? (Scenario)

<details><summary>What a strong answer covers</summary>

Reads hit different replicas with different lag. Provide monotonic reads by pinning the user to one replica, or read balances from the primary.

</details>

> [!interview] Which consistency model for a like counter, and for a seat reservation? (Scenario)

<details><summary>What a strong answer covers</summary>

Likes: eventual (a few seconds stale is harmless). Seat reservation: linearizable (two people must never get the same seat).

</details>

> [!interview] Does eventual consistency mean data can be lost? (Tricky)

<details><summary>What a strong answer covers</summary>

No. It's about when replicas agree, not durability. An acknowledged write is still stored; some replicas just see it later.

</details>

> [!interview] Is linearizable the same as serializable? (Tricky)

<details><summary>What a strong answer covers</summary>

No. Linearizability is about single-object reads and writes being up to date in real time. Serializability is about transactions over many objects behaving as if run one at a time. Strict serializability is both.

</details>

## Common mistakes & troubleshooting

- Treating consistency as a yes/no choice.
- Using eventual consistency for data the author just edited.
- Load balancing reads across replicas so a user sees values jump back and forth.
- Paying for linearizability where causal or eventual is enough.
- Picking one model for the whole system. Different data tolerates different staleness; decide per operation and write down why.

## Further reading & sources

- [Jepsen: Consistency Models](https://jepsen.io/consistency) - a precise map of the models on this page, from strict serializable and linearizable down to session guarantees.
- [Designing Data-Intensive Applications (Martin Kleppmann)](https://dataintensive.net/) - its replication and consistency chapters cover replication lag, read-your-writes, monotonic reads and linearizability in depth.
- [PostgreSQL: System administration functions](https://www.postgresql.org/docs/current/functions-admin.html) - `pg_current_wal_lsn`, `pg_last_wal_replay_lsn` and `pg_wal_replay_pause`, used in the code and practice above.

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-A-015.pdf](https://backendroadmap.com/notes/system-design/SD-A-015.pdf). All Phase 1 notes in one file: [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf).

## Next

Continue with [Lesson 16: Fault Tolerance](../16-fault-tolerance/README.md).
