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

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-A-015.pdf](https://backendroadmap.com/notes/system-design/SD-A-015.pdf). All Phase 1 notes in one file: [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf).

## Next

Continue with [Lesson 16: Fault Tolerance](../16-fault-tolerance/README.md).
