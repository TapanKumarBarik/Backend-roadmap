# Module 07: Consensus and Coordination

## Why this matters

Follow the thread back through this track. Module 02 needed one process to hold a
lock while others backed off. Track 06's scheduler needed exactly one of two replicas
to fire the nightly job. Module 06's `append` needed all writers to agree that the
next event is version N and only one of them gets it. Every one of those is the same
primitive underneath: **a set of independent nodes has to agree on a single value —
who holds the lock, who is the leader, what comes next — and keep agreeing even when
nodes crash and networks drop packets.** That primitive is **consensus**, and it is
the hardest problem in distributed systems. It's the bedrock every coordination
feature you've used sits on, usually without you noticing.

Here's the punchline this module builds toward, stated up front so the tour has a
destination: **you should almost never implement consensus yourself.** It is
notoriously, famously easy to get subtly wrong in ways that pass every test and then
lose data or elect two leaders during a real partition — and it has already been
solved, correctly, by battle-tested systems (etcd, ZooKeeper, Consul) and by tools
you already run (Postgres). The valuable skill is not writing Raft; it's
*understanding consensus well enough to recognize when you need it, to use those
tools correctly, and to resist the seductive, disastrous urge to roll your own.* This
module gives you a concept-level tour — enough to reason about leader election,
quorums, and split-brain, and to make the right build-vs-use call — without dragging
you through implementing a consensus algorithm you should never ship. It's the
capstone of the coordination story that locks (02), transactions (03), and event
ordering (06) have been circling.

## Concepts

### The consensus problem: agreeing on one value despite failures

**Consensus** is the problem of getting a group of nodes to agree on a single value,
with three guarantees that must all hold even as nodes crash and messages are lost or
delayed:

- **Agreement:** no two nodes decide on *different* values. (This is the one whose
  violation is catastrophic — two leaders, two winners of a lock, a split log.)
- **Validity (integrity):** the value decided was actually proposed by some node —
  you can't agree on garbage nobody suggested.
- **Termination (liveness):** every non-failed node eventually decides — the system
  doesn't hang forever.

That sounds modest until you remember the conditions: nodes fail at arbitrary
moments, the network partitions, and — the deep result — the **FLP impossibility**
theorem proves that in a fully asynchronous network (no bound on message delay) *no*
consensus algorithm can guarantee *all three* in the presence of even one crash. Real
algorithms escape FLP not by cheating agreement/validity (those are never sacrificed
— safety is sacred) but by relaxing *termination*: they use timeouts and randomization
to make progress *overwhelmingly likely* in practice, accepting that during a bad
enough partition the system may *pause* (stop making progress) rather than ever
*decide wrong*. This is the single most important instinct about consensus: **correct
consensus systems choose to stop rather than to disagree.** A consensus system that
"stays available" through a partition by letting both sides decide is not a faster
consensus system — it's a broken one.

### Quorums and majorities: why an odd number, why you can lose a node

Consensus is built on **majority quorums**. Decisions require agreement from a
*majority* of the nodes (⌊N/2⌋ + 1), and this single mechanism is what makes the
whole thing safe under partition. Two majorities of the same cluster must **overlap**
in at least one node — it is arithmetically impossible to have two disjoint majorities
of one set. That overlap is the trick: because any decision needs a majority, and any
two majorities share a node, two conflicting decisions can't both get quorum. The
shared node refuses the second one. Split-brain — two halves of a partition both
deciding — is prevented not by hoping the network heals but by the math of overlapping
majorities.

This is why cluster sizes are **odd** (3, 5, 7). With 5 nodes, a majority is 3; the
cluster tolerates 2 failures and still has a majority to make progress. With 6 nodes
majority is still 4 — you tolerate only 2 failures, same as 5, but you've added cost
and more things to break, so even numbers are wasteful. And it's why the *minority*
side of a partition **stops serving**: if a 5-node cluster splits 3–2, the 3-side has
quorum and keeps operating; the 2-side *cannot* reach majority and correctly refuses
to make decisions (better to be unavailable than to split-brain — CP under partition,
module 00). The quorum is the concrete mechanism behind every "the minority side
sacrifices availability" statement in this track.

### Raft at concept level: leader, term, replicated log

**Raft** is the consensus algorithm designed to be *understandable* (that was its
explicit goal, versus the famously opaque Paxos), and you should know it at the level
of its ideas — not its RPCs. Raft reduces consensus to **leader election plus log
replication**:

- **One leader per term.** Time is divided into **terms** (monotonically increasing
  numbers — a logical clock, and a fencing token by another name, module 02). Each
  term has *at most one* leader. All client writes go through the leader; followers
  just replicate.
- **Leader election.** Nodes start as **followers**. If a follower hears nothing from
  a leader within a randomized **election timeout**, it becomes a **candidate**,
  increments the term, and requests votes. A node grants its vote to at most one
  candidate per term, and a candidate that collects votes from a **majority** becomes
  leader. The randomized timeouts make it unlikely two candidates split the vote
  repeatedly; if they do, the term ends with no leader and a new election starts.
  Majority-to-win is what guarantees at most one leader per term.
- **Log replication.** The leader appends a client command to its **log** and sends it
  to followers. Once a **majority** have durably stored the entry, the leader
  **commits** it (applies it to the state machine) and tells followers to do the same.
  Because commitment needs a majority and terms strictly increase, a new leader always
  contains every committed entry — no committed data is ever lost.

The mental model: Raft turns "agree on a value" into "elect one leader by majority
vote, and have that leader replicate an ordered log to a majority." Leader election
handles *liveness* (someone's in charge), the majority rule handles *safety* (only one
leader, no lost commits), and terms handle *stale leaders* (an old leader that was
partitioned away comes back, sees a higher term, and steps down — its stale writes
rejected exactly like a low fencing token). etcd, Consul, and (via Zab, a close
cousin) ZooKeeper all run algorithms of this shape.

### Leader election as the everyday face of consensus

Most of the time you don't need "agree on an arbitrary value" — you need the special
case **leader election**: pick *exactly one* node to be in charge of something (run
the scheduler, be the primary, own a shard), and re-elect automatically if it dies.
This is the coordination primitive you'll actually reach for, and it's *built on*
consensus underneath.

The naive version is the module-02 trap all over again: "everyone tries to `SET
leader me NX EX 10`, the winner is leader" is a lease/lock, and it has the same
expiry-during-pause hole — a leader that stalls past its lease while a new leader is
elected gives you *two* leaders briefly (split-brain), and if both act, corruption.
Doing leader election *correctly* means the same lesson as correctness locks:
either use a strongly-consistent coordinator that provides a **fencing token** (a
term/epoch number) that the protected resource checks, or accept that a lease-based
leader is best-effort and make the leader's actions safe under brief overlap
(idempotency, module 01; fencing at the resource, module 02). The reason
purpose-built tools win here is that they give you leader election *with* a monotonic
fencing token and majority-quorum safety natively — you get correct election as a
library call instead of a subtle protocol you maintain.

### Why you almost always use a battle-tested tool

This is the module's thesis and the track's practical payoff. Consensus and correct
leader election are:

- **Extremely hard to get right.** The failure modes (split-brain, lost commits,
  stale leaders acting on old terms) appear only under specific partition/pause timing
  that your tests won't hit and production will. A hand-rolled implementation that
  "works" is usually one that hasn't yet met the partition that breaks it.
- **Already solved, correctly, by tools you can run.** Match the tool to the need:
  - **Postgres advisory locks** (module 02) — for simple leader election / singleton
    within a system already using Postgres. Strongly consistent, auto-releases on
    connection loss, zero new infrastructure. The right first choice for "only one of
    my replicas runs this job."
  - **etcd / Consul** — purpose-built, Raft-backed key-value stores for
    coordination: leader election, distributed locks with fencing tokens, service
    discovery, config. What Kubernetes itself uses (etcd) for all its coordination.
  - **ZooKeeper** — the veteran (Zab consensus); ephemeral znodes + watches give you
    leader election and locks; used by Kafka (historically), HBase, Hadoop.
  - **Your database / cloud primitives** — a strongly-consistent DB with a
    conditional write, or a cloud lock service, often suffices without a new system.
- **Not your competitive advantage.** Building consensus is deep systems work that
  isn't the product. Every hour spent hand-rolling Raft is an hour not spent on the
  thing your users pay for — and a liability that will page you at 3am during a
  partition.

The senior instinct, identical in spirit to module 03's "don't reach for 2PC" and
module 05's "don't reach for CQRS reflexively": when you feel the need for
coordination, reach for the *smallest* tool that solves it (a Postgres advisory lock
before etcd before ZooKeeper), and **never** write your own consensus. Understand it
deeply — precisely so you know why you're not building it.

## Command reference

| Concept | Mechanism | Notes |
|---|---|---|
| Consensus | agree on one value: agreement + validity + termination | safety (agreement) is never sacrificed; liveness can pause |
| Quorum | majority ⌊N/2⌋+1; two majorities always overlap | the math that prevents split-brain |
| Odd cluster size | 3/5/7 nodes | tolerate ⌊N/2⌋ failures; even sizes waste a node |
| Raft term | monotonically increasing; ≤1 leader per term | a fencing token / logical clock (module 02) |
| Leader election | randomized timeout → candidate → majority vote | re-elects automatically on leader death |
| Log replication | leader appends, commits after majority persists | committed entries never lost across elections |
| Postgres advisory lock | `pg_try_advisory_lock` | simplest correct leader election, no new infra (module 02) |
| etcd / ZooKeeper / Consul | Raft/Zab-backed coordination service | leader election + fenced locks as a primitive |

Leader election the right way for most apps — a **Postgres advisory lock** as a
singleton/leader, with the connection loss *being* the failure detector (no TTL to
tune, strongly consistent):

```python
import time
from sqlalchemy import create_engine, text

# A dedicated, long-lived connection: the advisory lock is held for the life of
# the SESSION and auto-released the instant this connection dies (crash, network).
engine = create_engine("postgresql+psycopg://app@primary:5432/app",
                       pool_pre_ping=True)
LEADER_KEY = 42  # any app-wide constant

def run_as_leader(do_leader_work) -> None:
    """Exactly one process across the fleet becomes leader and does the work;
    the rest wait and take over automatically if the leader's session drops."""
    while True:
        with engine.connect() as conn:
            got = conn.execute(text("SELECT pg_try_advisory_lock(:k)"),
                               {"k": LEADER_KEY}).scalar_one()
            if not got:
                time.sleep(5)            # someone else leads; stand by, retry
                continue
            try:
                # We are the single leader as long as this session lives.
                do_leader_work()         # e.g. run the scheduler loop
            finally:
                conn.execute(text("SELECT pg_advisory_unlock(:k)"),
                             {"k": LEADER_KEY})
        # Lost the connection/lock -> loop and contend for leadership again.
```

Leader election with a **fencing token (term)** so the protected resource can reject a
stale leader — the etcd/ZooKeeper pattern, sketched against Redis to show the shape
(prefer a real coordinator for correctness):

```python
# On becoming leader, obtain a strictly-increasing TERM (fencing token).
# The RESOURCE records the highest term it has served and rejects lower ones,
# so a stalled old leader that resumes cannot act on stale authority.
def become_leader(node_id: str):
    if not r.set("leader", node_id, nx=True, px=10_000):
        return None                      # someone else is leader
    term = r.incr("leader:term")         # monotonic -> the fencing token
    return term

#   UPDATE cluster_state
#   SET    value = :v, leader_term = :term
#   WHERE  id = :id AND leader_term <= :term;   -- 0 rows => stale leader, rejected
#
# This is module 02's fencing token, now guarding "who is allowed to lead."
# A real system (etcd lease + revision, ZooKeeper zxid) gives you this natively
# with majority-quorum safety you do NOT get from a single Redis key.
```

etcd, conceptually, hands you exactly this as a primitive (a lease you hold, a
revision number that fences, a watch that notifies on leader change) — which is why
you use it instead of assembling the above by hand.

## Hands-on exercises

You need Postgres (`docker run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=pg
postgres:16`) and, for the etcd exercises, a single-node etcd (`docker run -d --name
etcd -p 2379:2379 quay.io/coreos/etcd:v3.5 etcd
--advertise-client-urls http://0.0.0.0:2379 --listen-client-urls
http://0.0.0.0:2379`). `pip install "sqlalchemy>=2" psycopg[binary] python-etcd3` (or
use `etcdctl` in the container). Most exercises are about *reasoning* and *using tools
correctly*, not implementing consensus — that's the point.

### 1. Prove the majority-overlap property by hand

For clusters of size 3, 4, 5, and 6, write down the majority size, how many failures
each tolerates, and show why two disjoint majorities are impossible. Then explain in
one sentence why 5 is better than 6.

Expected: majorities 2/3/3/4; failures tolerated 1/1/2/2; any two majorities share ≥1
node because `2·(⌊N/2⌋+1) > N`. Five beats six because both tolerate 2 failures but 6
costs an extra node and more failure surface for no gain — hence odd sizes. This is
the arithmetic that makes split-brain impossible.

### 2. Simulate split-brain prevention with quorum

Model a 5-node cluster as a set. Partition it 3–2. Have each side try to "commit a
value" only if it can gather a majority (3) of the 5. 

Expected: the 3-side commits; the 2-side *cannot* reach 3 and must refuse. Now flip to
a 2–2–1 three-way partition: *no* side has a majority, so *nobody* commits — the
cluster pauses (sacrificing liveness) rather than risk disagreement. You've reproduced
"correct consensus stops rather than disagrees."

### 3. Correct leader election with a Postgres advisory lock

Implement `run_as_leader`. Start it in **three** separate processes against the same
Postgres, each printing "LEADING" while it holds the lock.

Expected: exactly one prints "LEADING"; the other two stand by. Kill the leader
process; within moments its session drops, the advisory lock auto-releases, and one
standby takes over — automatic failover with no TTL to tune and strong consistency,
for free from a DB you already run. This is the right answer for most "only one
replica runs X" needs.

### 4. Break naive lease-based leadership (split-brain)

Implement the naive version: `SET leader me NX EX 3`, act as leader while the key
exists, *don't* renew reliably. In one leader, simulate a stall with `sleep(5)` while
"still leading." Have a second process take leadership when the key expires. Have both
print a "leader action" with their identity after the stall.

Expected: **both** act as leader — the stalled first leader's lease expired, a second
was elected, and the first resumed unaware. Split-brain, exactly the module-02
expiry-during-pause bug applied to leadership. Note that no amount of "check if I'm
still leader" before acting fully closes it (the check races the action).

### 5. Fence the stale leader at the resource

Add a `leader:term` (`INCR` on election) and a resource table with a `leader_term`
column; each leader action does `UPDATE ... WHERE leader_term <= :term`. Redo exercise
4.

Expected: the new leader (term 2) writes fine; the stalled old leader (term 1) resumes
and its write affects **0 rows** — fenced off at the resource because it presents a
lower term. This is the only construction in the exercise that's actually safe under a
pause, and it's exactly why real coordinators hand you a monotonic token.

### 6. Use etcd for leader election and watch failover

Use etcd's lease + campaign primitive (or `etcdctl elect`): run two processes that
campaign for leadership of key `/svc/leader`; the winner leads, and each holds a
*lease* it must keep alive. Kill the leader.

Expected: one wins; on kill, its lease expires and etcd promotes the other, notifying
via a watch. Note what etcd gave you that the Redis sketch couldn't: majority-quorum
safety and a monotonic revision (fencing token) as a built-in primitive — correct
leader election as a library call. Contrast the lines of code and the correctness
guarantees with rolling your own.

### 7. Map the track's coordination features onto consensus

For each, name the underlying coordination need and the *smallest correct tool*: (a)
module 02's "only one worker rebuilds the cache"; (b) track 06's "one of two
schedulers fires the cron"; (c) module 06's "two writers must not both claim event
version N"; (d) "elect a primary among 5 replicas with automatic failover."

Expected: (a) efficiency lock → single Redis lock (or advisory lock); (b) leader
election/singleton → Postgres advisory lock; (c) optimistic concurrency / ordered log
→ a unique constraint / conditional write (or an event store); (d) true leader
election with failover → etcd/ZooKeeper (or a managed primitive). The skill is
reaching for the *smallest* tool that's correct — and never hand-rolling consensus.

### 8. Decide build-vs-use for four scenarios

For each, decide "use Postgres advisory lock," "use etcd/ZooKeeper," or "you do NOT
need consensus here," with one-sentence justification: (a) a singleton nightly job in
an app already on Postgres; (b) a 7-node stateful cluster needing a primary with
automatic failover and fenced writes; (c) deduping webhook deliveries; (d) "we'll
write our own Raft so we have no dependencies."

Expected: (a) Postgres advisory lock — smallest correct tool, no new infra; (b)
etcd/ZooKeeper — real multi-node leader election with quorum safety and fencing is
exactly their job; (c) no consensus — that's idempotency/dedupe (module 01), not
agreement; (d) never — hand-rolled consensus is a subtle-bug generator that isn't your
product; use a battle-tested tool. Recognizing (c) and (d) is as important as (a)/(b).

### 9. Diagnose and fix: the two active primaries

A team runs a stateful service with 2 replicas for HA. Leadership is a Redis key `SET
primary <id> NX EX 15`, renewed every 5s; whoever holds it is the write primary. After
a network hiccup between the app and Redis, both replicas logged "I am primary" and
accepted writes for ~20 seconds, and some writes were lost/conflicting. Explain the
root cause and give the correct fix.

<details>
<summary>Answer</summary>

Root cause: **split-brain from a lease-based leader with no quorum and no fencing**,
compounded by an **even (2-node) cluster** that can't form a meaningful majority. When
the network hiccuped, replica A couldn't renew its lease in time so the key expired;
replica B acquired it and became primary; meanwhile A hadn't crashed — it was just
briefly partitioned from Redis — and continued believing it was primary until it
noticed, so *both* accepted writes (module 02's expiry-during-pause, now at the
leadership level). Nothing fenced A's stale writes, so its writes conflicted with B's.
A 2-node setup makes it worse: there's no odd-sized majority quorum to arbitrate, so
"HA" here actually *increased* the split-brain risk.

Fix: stop hand-rolling leader election on a single Redis key. Use a **consensus-backed
coordinator** — etcd or ZooKeeper (or Postgres advisory locks if the scale allows) —
which elects a single leader via **majority quorum** (so a partitioned minority can't
also lead) and hands out a **monotonic term/revision** as a fencing token. Make the
storage layer **reject writes carrying a stale term** (`WHERE leader_term <= :term`),
so even if a deposed primary briefly thinks it leads, its writes are fenced at the
resource — the only thing that's actually safe under a pause. Run an **odd** number of
nodes (3 or 5) so a real majority exists. The meta-lesson of the module: leader
election is consensus, consensus is easy to get catastrophically wrong, and the right
move is a battle-tested tool that provides quorum safety and fencing tokens natively —
never a `SET NX EX` key you renew and hope.

</details>

## Independent challenge

No code given. Reach back to **02-distributed-locking** — you'll extend its
efficiency-vs-correctness and fencing-token lessons up to full leadership. You're
designing the control plane for a distributed job scheduler that runs across a fleet:
exactly one node must be the **active scheduler** (dispatching jobs) at any time, a
failed scheduler must be replaced automatically within seconds, and — critically — a
scheduler that is *paused* (GC, VM migration) and then resumes must **not** dispatch
jobs while a new scheduler is already active (a double-dispatch runs every job twice).
Write a design that specifies: (1) whether this is a job for a hand-rolled lease, a
Postgres advisory lock, or a consensus coordinator (etcd/ZooKeeper), and defend it
against the "why not build it yourself?" question; (2) how leadership is granted and
how automatic failover happens; (3) exactly how you prevent the paused-then-resumed
scheduler from double-dispatching (name the mechanism); (4) how many nodes you run and
why that number; and (5) what the fleet does during a network partition — who leads,
who stops, and why that's the *correct* behavior rather than a bug.

<details>
<summary>Hint</summary>

This is a **correctness** leadership problem (a double-dispatch corrupts by running
jobs twice), so a bare lease is out — use a **consensus coordinator** (etcd or
ZooKeeper), and the answer to "why not build it yourself?" is module 07's whole
thesis: consensus is catastrophically easy to get wrong under exactly the
partition/pause timing that breaks a hand-rolled lease, it's already solved correctly,
and it isn't your product. Leadership: campaign for a leader key backed by a
**lease**; the coordinator elects one via **majority quorum** and revokes the lease if
the leader stops renewing, promoting a standby within seconds (automatic failover).
The paused-then-resumed double-dispatch is prevented by a **fencing token** — the
coordinator's monotonic term/revision (module 02) — that the *dispatch target* checks:
the job queue/executor records the highest scheduler term it has accepted and rejects
dispatches carrying a lower term, so the resumed old scheduler (old term) is fenced off
even though it still thinks it leads. Run an **odd** number (3 or 5) so a real majority
exists and tolerate 1–2 failures. During a partition, only the side with **quorum**
elects/keeps a leader and dispatches; the minority side *cannot* reach majority and
correctly *stops dispatching* — that's CP-under-partition (module 00), and it's the
right behavior because pausing is strictly better than two schedulers double-running
every job.

</details>

## Common mistakes & troubleshooting

- **Rolling your own consensus.** The failure modes appear only under partition/pause
  timing your tests won't reproduce; a hand-rolled implementation that passes tests is
  usually one that hasn't met its breaking partition yet. Use etcd/ZooKeeper/Consul or
  Postgres — never build it.
- **Lease-based leadership without fencing.** `SET leader me NX EX` is module 02's
  naive lock at the leadership level: a paused leader whose lease expires while a new
  one is elected gives two leaders. For correctness you need a monotonic term/epoch
  the resource checks — best obtained from a real coordinator.
- **Even-numbered clusters.** 2, 4, 6 nodes waste a node (same fault tolerance as the
  odd number below) and a 2-node "HA" pair can't form a meaningful majority, *raising*
  split-brain risk. Always odd: 3, 5, 7.
- **Expecting availability from the minority side of a partition.** Correct consensus
  makes the minority *stop* (no quorum → no decisions). If your system keeps serving
  writes on both sides of a partition, it isn't more available — it's split-brained
  and losing data.
- **Confusing "we need coordination" with "we need consensus."** Deduping, idempotency
  (module 01), and simple mutual exclusion (an efficiency lock) are *not* consensus.
  Reach for the smallest tool: a unique constraint or advisory lock before etcd before
  a multi-node cluster.
- **Treating leader election as fire-and-forget.** Leadership can be *lost* (lease
  expiry, partition) at any moment; a leader must keep verifying it still leads and
  its actions must be fenced/idempotent so a brief overlap during failover doesn't
  corrupt.
- **Over-provisioning coordination.** Standing up a 5-node ZooKeeper ensemble for "one
  replica runs the cron" is the opposite mistake — a Postgres advisory lock does it
  with zero new infrastructure. Match the tool's weight to the actual need.
- **Ignoring the coordinator's own failure/latency.** etcd/ZooKeeper are themselves
  distributed systems with quorum requirements and latency; every coordination call
  can be slow or unavailable during *their* partition. Design for the coordinator
  being briefly unreachable (cached leadership with a lease, fail-safe behavior).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the three guarantees of consensus. Under FLP, which one do real algorithms
   relax, and what does relaxing it look like in practice?
2. Explain how majority quorums prevent split-brain, and why cluster sizes are odd.
3. Describe Raft at concept level: what are terms, how is a leader elected, and how is
   the log committed — and which property does each mechanism protect?
4. Why is "leader election" the everyday face of consensus, and what goes wrong with a
   naive lease-based leader?
5. Give the module's thesis on build-vs-use, and name the smallest correct tool for
   (a) a singleton cron in a Postgres app and (b) fenced primary election across 5
   stateful nodes.
6. During a network partition of a 5-node cluster split 3–2, what does each side do,
   and why is that the *correct* behavior?

<details>
<summary>Answers</summary>

1. Agreement (no two nodes decide different values), validity (the decided value was
   proposed by some node), termination (every non-failed node eventually decides). FLP
   proves you can't guarantee all three in a fully asynchronous network with even one
   crash, so real algorithms relax **termination (liveness)** — never safety. In
   practice they use timeouts and randomization to make progress overwhelmingly
   likely, and during a bad partition they *pause* (stop deciding) rather than ever
   decide inconsistently.
2. A decision requires a majority (⌊N/2⌋+1), and any two majorities of the same set
   must share at least one node (two disjoint majorities are arithmetically
   impossible), so two conflicting decisions can't both get quorum — the shared node
   refuses the second. The minority side of a partition can't reach majority and stops.
   Sizes are odd because an even N tolerates the same number of failures as the odd
   N−1 while costing an extra node and more failure surface — even numbers waste a
   node.
3. Terms are monotonically increasing numbers with at most one leader each (a logical
   clock / fencing token). A follower that hears no leader within a randomized election
   timeout becomes a candidate, increments the term, and requests votes; a candidate
   winning a *majority* of votes becomes leader (protects safety: ≤1 leader/term). The
   leader appends client commands to its log and *commits* an entry once a *majority*
   have durably stored it, then applies it (protects safety: committed entries survive
   any election since a new leader must contain them). Election protects liveness
   (someone leads); majority + terms protect safety (one leader, no lost commits, stale
   leaders step down).
4. Because most real needs aren't "agree on an arbitrary value" but "pick exactly one
   node in charge (primary, scheduler, shard owner) and re-elect on failure" — a
   special case of consensus. A naive lease-based leader (`SET leader me NX EX`) has
   module 02's expiry-during-pause hole: a leader that stalls past its lease while a
   new leader is elected yields two leaders (split-brain), and if both act, corruption
   — unless a fencing token (term) checked at the resource fences the stale one.
5. Thesis: consensus/correct leader election is extremely hard to get right, already
   solved correctly by battle-tested tools, and not your competitive advantage — so
   understand it deeply but *never build your own*; reach for the smallest correct
   tool. (a) A **Postgres advisory lock** — strongly consistent, auto-releasing, no new
   infra. (b) **etcd or ZooKeeper** — Raft/Zab-backed leader election with majority
   quorum and a native monotonic fencing token for fenced writes.
6. The 3-side has a majority (3 of 5), so it keeps operating — electing/retaining a
   leader and committing. The 2-side cannot reach majority (needs 3) and therefore
   *refuses* to make decisions, becoming unavailable. That's correct because allowing
   the minority to also decide would produce two conflicting decisions (split-brain,
   lost/divergent data); pausing the minority (CP under partition, module 00)
   sacrifices availability to preserve agreement, which is exactly the trade correct
   consensus is supposed to make.

</details>

## Cumulative review

Closed book — cover modules 00–07 and answer from memory. This is the track's second
and final cumulative review; it stitches every pattern into the single story the track
has been telling: *in a distributed system, failure and concurrency are the default,
and each pattern is a specific, principled response to a failure the previous ones
exposed.*

1. **(00, 03, 07)** Trace the consistency-vs-availability trade-off through three
   modules: how CAP frames it (00), how 2PC's coordinator makes the *wrong* trade
   under failure (03), and how consensus quorums make the *right* one (07). What single
   principle unifies "the minority side stops" across all three?
2. **(01, 02, 04, 06)** Idempotency (01) recurs in almost every later module. Explain
   precisely why sagas (04), event-sourced command handling (06), and lock/lease-based
   coordination (02) each *require* it, and name the common underlying cause.
3. **(02 → 07)** Fencing tokens appear first as a locking mechanism (02) and reappear
   as Raft terms and leader epochs (07). Explain why they're the *same idea*, and why
   enforcement must happen at the resource in both cases.
4. **(03 → 04 → 05 → 06)** Tell the four-module arc as one story: 2PC's problem (03),
   how sagas trade atomicity for availability (04), how CQRS splits the write and read
   models the saga implied (05), and how event sourcing makes the write model a log the
   read models project from (06). What thread runs through all four?
5. **(00–07 synthesis)** You're the architect for a ride-hailing "request a ride"
   feature: match a rider to exactly one nearby driver, charge the rider, record the
   trip's lifecycle for support/audit, and show the rider live status. For each of
   these needs, name the pattern(s) from this track you'd apply and the specific
   failure each prevents: (a) the same driver must never be matched to two riders; (b)
   the rider's flaky phone retries "request ride"; (c) charge + match + trip-record
   span services; (d) support must reconstruct exactly what happened to a trip; (e) the
   live status screen must be fast and can lag slightly.

<details>
<summary>Answers</summary>

1. CAP (00) frames it as a forced choice *during a partition*: keep serving and risk
   inconsistency (AP) or refuse and stay consistent (CP). 2PC (03) makes the wrong
   trade under failure — when the coordinator dies mid-protocol, participants block
   *holding locks* indefinitely, sacrificing availability *without even guaranteeing
   progress*, and it re-couples independent services' fate. Consensus quorums (07) make
   the right trade: the majority side keeps operating while the minority *stops*
   (refuses to decide without quorum), sacrificing availability on the minority side to
   preserve agreement. The unifying principle: **when you can't guarantee correctness,
   stop rather than diverge** — the minority/uncertain side chooses unavailability over
   inconsistency, deliberately (CP under partition).
2. The common underlying cause is **at-least-once execution**: unreliable networks,
   retrying clients/orchestrators, redelivering brokers, and expiring leases all mean
   any operation can run more than once. Sagas (04) retry steps and compensations and
   ride on at-least-once events, so a non-idempotent step double-charges. Event-sourced
   command handling (06) receives retried commands over the network, so without an
   idempotency key it appends duplicate events. Lock/lease coordination (02) can expire
   mid-work and let two holders overlap, so the protected operation must be idempotent
   as a second line of defense. In every case idempotency converts "ran N times" into
   "effect happened once."
3. A fencing token (02) is a strictly-increasing number handed out on each lock grant;
   a Raft term / leader epoch (07) is a strictly-increasing number handed out on each
   leadership grant — same construct, different scope (a lock vs leadership). Both exist
   because the grant can't guarantee the holder *still* holds it at the moment of the
   action (a pause can expire the lease while a new holder is minted), so the only safe
   check is at the **resource**: it records the highest token/term it has accepted and
   rejects any lower one, fencing off a stale holder/leader whose action arrives late.
   Enforcement must be at the resource in both because only the resource sees the actual
   write and can reject the stale one — the lock/coordinator can't.
4. 2PC (03) can make a cross-service change atomic but blocks on a coordinator and
   crushes availability, so it's the wrong tool for high-throughput multi-service
   transactions. Sagas (04) trade that instant atomicity for availability and loose
   coupling: a sequence of local transactions with compensations, accepting a brief,
   explicitly-modeled inconsistent window. That window works because the *write* side
   and the *read* side want different things — which CQRS (05) makes architectural,
   splitting the model you command from the model(s) you query so each is optimized and
   consistency is chosen per read. Event sourcing (06) then makes the write model an
   immutable *log of events*, from which CQRS's read models are just projections — and
   which gives the audit/history the whole chain kept implying. The thread: **reads and
   writes, and consistency and availability, are separable concerns, and each pattern
   separates one more of them so you can make the right per-concern trade** instead of
   one blunt system-wide choice.
5. (a) **Consensus/leader-election-style single-winner + fencing, or an atomic
   conditional write / distributed lock (02, 07)** — matching a driver is a correctness
   mutual-exclusion problem; an atomic `UPDATE drivers SET rider=:r WHERE id=:d AND
   rider IS NULL` (or a fenced lock) ensures exactly one rider claims a driver,
   preventing double-matching. (b) **Idempotency keys (01)** — a client-supplied
   request id makes the retried "request ride" a no-op that returns the first result,
   preventing duplicate ride requests/charges. (c) **Saga (04) + idempotency (01) +
   transactional outbox (04/06)** — charge, match, and trip-record are local
   transactions in a saga with compensations (refund, release driver), preventing a
   charge with no ride or a match with no charge, without a blocking 2PC. (d)
   **Event sourcing (06)** — record the trip's lifecycle as an immutable event log, so
   support can replay exactly what happened and reconstruct any past state (audit,
   tamper-evident). (e) **CQRS read model (05) + eventual consistency (00)** — serve
   live status from a fast denormalized projection that tolerates slight lag, with
   read-your-writes for the rider's own trip so they always see their current status
   immediately.

</details>

## Next

[08-capstone-project](../08-capstone-project/README.md) — you now hold the whole
toolkit: per-operation consistency (00), idempotency (01), locking and fencing (02),
the 2PC trade-off (03), sagas (04), CQRS (05), event sourcing (06), and consensus/
coordination (07). The capstone stops teaching new patterns and asks you to *combine*
them: design and partially build a distributed order-processing system that uses
idempotency keys to make requests safe, a saga to coordinate the multi-step
transaction across services, and event sourcing to record the order's state history —
integrating the reliability disciplines of the entire track into one system.
