# Module 08: Capstone Project

## Why this matters

Every module so far handed you scaffolding — a scoped problem, a worked estimate,
the fan-out decision already framed, a hint when you got stuck. This one doesn't.
The capstone is the integration test for the whole track, and the only way to find
out whether the framework actually became a *reflex* is to sit in front of a
problem you haven't seen worked and drive it end to end — clarify scope, put
numbers on it, design the data model and API, sketch the architecture, deep-dive
the hard part, and talk tradeoffs — with no solution to peek at. The guided
modules built *recognition*: you could follow the reasoning and it made sense.
Real interview competence is *recall plus judgment under a clock* — knowing,
without prompting, that this is a write-heavy problem so the write path is the
bottleneck, that this number forces sharding, that this consistency requirement
rules out a simple cache, and that this component is the single point of failure
you need to address before time runs out.

This is also the most realistic thing you'll do in the track, because it pulls
from *everything* — not just this track's seven problems, but the whole 14-track
curriculum underneath them: request/response, API design, auth, the data layer,
caching, background processing, search, observability, security, distributed-
systems patterns, advanced API paradigms, testing, and devops. A payments/ledger
system, the chosen prompt, is deliberately the one classic problem this track did
*not* work as its own module, and it's the one where the hardest requirement isn't
scale at all — it's **correctness under concurrency**, which is exactly where an
engineer who has internalized the whole curriculum separates from one who
memorized seven templates. Struggling here, before you look anything up, is the
entire point.

## The project

Run a **full mock system-design interview**, out loud and timed to ~45 minutes,
on a problem this track never worked as its own module:

> **Design a payments / ledger processing system** — the backend that moves money
> between accounts (think the core of Stripe, PayPal, or a bank's transaction
> ledger). Users hold balances; the system processes **transactions** (charges,
> payouts, transfers) that debit one account and credit another; every movement is
> recorded in an immutable **ledger**; and balances must **always** be correct —
> money can never be created, lost, or double-counted, even under concurrent
> requests, retries, and partial failures.

This problem is chosen deliberately because its dominant requirement is **not**
raw scale — it's **correctness, consistency, and auditability under concurrency
and failure**. It forces you to combine capacity estimation, data modeling, a
consistency model that leans *strong* (unlike most of the read-heavy problems in
this track), idempotency, caching where it's *safe*, and observability — pulling
together threads from across the entire 14-track curriculum. There is no solution
given. Drive it yourself.

### What to produce

Work the seven-step framework from **01-the-system-design-interview-framework**
in order, out loud, producing an artifact for each step:

1. **Requirements & scope** — functional (process a transaction, maintain
   balances, record an immutable ledger, query history/balance) and the five NFRs,
   with an explicit stance on **consistency** (this is the crux) and **durability**
   (you can *never* lose a committed transaction). State what's out of scope
   (fraud/ML, currency FX, payout scheduling — mention and defer).
2. **Capacity estimation** — DAU/merchants, transactions/sec (avg and peak),
   ledger-entry write rate, storage growth of an append-only ledger over years,
   and read rate for balance/history lookups. Use the module-00 recipe and let the
   numbers tell you whether one database suffices or you must partition.
3. **API design** — the core endpoints, including the **idempotent** transaction-
   submission contract (this is non-negotiable for payments).
4. **Data model** — accounts, transactions, and the **ledger** (double-entry:
   every transaction produces balanced debit/credit entries that sum to zero).
   Decide SQL vs. NoSQL and the partition key, and justify from the consistency
   requirement, not just the scale.
5. **High-level design** — the end-to-end path of one transaction from request to
   committed, balanced ledger entries, including where money-movement correctness
   is enforced.
6. **Deep-dive** — the hard part: guaranteeing **exactly-once, correct** money
   movement under concurrent requests, retries, and partial failures. This is
   where the interview is won or lost.
7. **Bottlenecks & wrap-up** — single points of failure, the component that limits
   throughput, how you'd scale it *without* sacrificing correctness, and the
   tradeoffs you consciously made.

### Acceptance checklist

Tick every box. If you can't, you've found a module (in this track or an earlier
one) to revisit.

- [ ] You **clarified scope and stated all five NFRs** before drawing anything,
      and took an explicit position that this system needs **strong consistency**
      on balances/ledger (not eventual) — and said *why*, unlike the read-heavy
      systems earlier in the track.
- [ ] You produced a **capacity estimate** (transactions/sec avg+peak, ledger
      write rate, multi-year append-only storage, balance-read rate) and used it
      to justify (not assume) your storage/partitioning decision.
- [ ] Your API includes an **idempotent submit** using an idempotency key so a
      client retry can never double-charge — and you can explain the dedup
      mechanism (recall the idempotency-key pattern from
      **10-distributed-systems-patterns**).
- [ ] Your data model uses an **immutable, append-only ledger** with **double-
      entry** (balanced debits/credits summing to zero), and you can explain how a
      balance is derived/maintained from it and how you audit it.
- [ ] You addressed **atomic money movement**: a debit and its matching credit
      either both commit or neither does — via a transaction, a saga with
      compensation, or an equivalent — and you justified the choice (recall
      transactions from **04-databases-and-data-layer** and sagas from
      **10-distributed-systems-patterns**).
- [ ] You handled **concurrent updates to the same account** correctly (no lost
      updates, no negative balance from a race) — naming the concurrency-control
      mechanism (optimistic/pessimistic locking, or serialized per-account
      processing).
- [ ] You decided **where caching is safe and where it is not** — e.g. you do
      *not* serve a stale balance for an authorization decision — and justified it
      against the consistency requirement (recall **05-caching-and-performance**).
- [ ] You addressed **partial failure and recovery**: what happens if the process
      crashes mid-transaction, how retries stay safe (idempotency again), and how
      the ledger's append-only nature enables recovery/audit.
- [ ] You identified **single points of failure** and the **throughput
      bottleneck**, and proposed scaling (e.g. partition by account) that
      **preserves correctness** rather than trading it away.
- [ ] You covered **observability**: what you'd log/trace/alert on to detect a
      money discrepancy fast, and how you'd reconcile (recall
      **08-observability-and-operational-readiness**). A ledger that's silently
      wrong is the worst-case failure.
- [ ] You **managed the clock** — hit every framework step, went deep on the
      correctness problem (the right place to spend depth), and stated the
      tradeoffs you made out loud.
- [ ] You can defend **every box in your diagram** with a specific requirement or
      number behind it — nothing added out of habit.

### Suggested approach

1. **Resist the scale reflex.** Every prior module trained you to jump to "shard
   and cache." Payments is different: start by nailing the **consistency and
   correctness** requirement, and let *that* — not QPS — drive the early design.
   The numbers still matter, but here they're the secondary constraint.
2. **Do the estimation anyway**, because it decides your storage strategy for the
   append-only ledger (which only grows) and whether a single strongly-consistent
   database can hold the write rate or you must partition by account.
3. **Design the ledger first**, before the API — double-entry, append-only, and
   how a balance relates to it. The rest of the system exists to write to this
   ledger correctly.
4. **Spend your deep-dive budget on the correctness core**: idempotent submission,
   atomic debit+credit, per-account concurrency control, and safe retries under
   partial failure. This is the whole point of the problem.
5. **Then scale it without breaking it**: partitioning by account, read replicas
   for history (but *not* for authorization balance reads), and where async
   processing is safe versus where it isn't.
6. **Close on observability and reconciliation** — how you'd *know* within
   minutes if the ledger ever went wrong, and how you'd fix it.
7. **Run the acceptance checklist as an adversary** trying to break each box: "can
   a retry double-charge? can two concurrent transfers overdraw an account? if the
   process dies after the debit but before the credit, is money lost?"

### Hints (design nudges, not solutions)

<details>
<summary>Hint: why this problem inverts the track's usual instincts</summary>

Almost every problem in this track was read-heavy and tolerant of eventual
consistency, so the reflexes you built — cache aggressively, denormalize, fan out
async, serve stale-but-fast — are mostly the *wrong* reflexes here. Payments is
the counterexample the curriculum saved for last: the balance you read to
authorize a charge must be **correct now**, not a few seconds stale, so you cannot
blindly cache it the way you cached a feed. The senior signal is recognizing this
inversion out loud — "unlike the feed, this needs strong consistency on the
money path, so I'll accept lower availability under partition (a CP posture) and
only cache where a stale value can't cause a wrong money decision." If you catch
yourself reaching for a write-back cache on the balance, stop.

</details>

<details>
<summary>Hint: the idempotency + atomicity core</summary>

Two independent correctness problems live at the center, and you need both. (1)
**Idempotency**: a client whose network times out will *retry* the same charge —
if each retry creates a new transaction, you double-charge. Require an
**idempotency key** per transaction; the first request records it and its result,
and any retry with the same key returns the original result instead of re-
executing (module 10's pattern). (2) **Atomicity of the money movement**: the
debit and the matching credit must both happen or neither — a database
**transaction** across both ledger entries if they're co-located, or a **saga with
compensating entries** if they span partitions/services (a reversal entry, since
the ledger is append-only and you never delete). Keep these two ideas distinct:
idempotency stops *duplicate* execution; atomicity stops *partial* execution.

</details>

<details>
<summary>Hint: concurrency on a single account</summary>

The classic race: two transfers hit the same account at the same instant, both
read balance = $100, both think they can withdraw $80, both commit — the account
goes to −$60 and you've created money that doesn't exist. This is the lost-update
problem from **04-databases-and-data-layer**. Options, each a tradeoff:
**pessimistic locking** (lock the account row for the transaction — correct,
simple, but serializes that account and can bottleneck a hot account);
**optimistic concurrency** (version the balance, commit only if the version is
unchanged, retry on conflict — better under low contention, wasteful under high);
or **serialized per-account processing** (route all of one account's transactions
to a single queue/worker so they never run concurrently — scales by partitioning
accounts, and echoes the per-conversation ordering idea from module 06). Pick one
and justify it against your expected contention.

</details>

<details>
<summary>Hint: how you'd know it broke</summary>

For a ledger, being *silently* wrong is catastrophic — worse than being down. So
observability here isn't an afterthought, it's a correctness control. Double-entry
gives you a continuous invariant: the sum of all debits must equal the sum of all
credits, and every account's balance must equal the sum of its ledger entries — so
you run **continuous reconciliation** that recomputes balances from the immutable
ledger and alerts the instant the derived balance diverges from the stored/cached
one. Trace every transaction end to end (recall
**08-observability-and-operational-readiness**), log with the idempotency key and
transaction id as correlation keys, and alert on any invariant violation, stuck
in-flight transaction, or retry storm. The append-only ledger is also your
recovery tool: because you never mutate history, you can always replay or audit to
reconstruct the true state.

</details>

## Next

You've reached the end — not just of this module, but of **track 14 and the entire
14-track backend curriculum**. You started at how a single request travels from
browser to backend, and you finish able to run a structured system-design
whiteboard session end to end: scope a vague prompt, size it with back-of-envelope
math, and drive a complete design through requirements, data model, architecture,
a deep-dive on the genuinely hard part, and an honest accounting of the tradeoffs
— across read-heavy, write-heavy, real-time, storage, search, and correctness-
critical systems.

There's no next track. What's left is *practice and integration*, and the best way
to do it is to go back and connect the threads:

- **Re-run this track's designs cold.** Take modules 02–07 and drive each one from
  a blank whiteboard, no notes, out loud, timed. The first pass built recognition;
  cold repetition builds the recall you'll actually have in an interview.
- **Revisit the earlier tracks' capstones** now that you can see how they fit into
  a whole system. The task queue from **06-background-processing-and-realtime**,
  the idempotency and CAP reasoning from **10-distributed-systems-patterns**, the
  caching strategies from **05-caching-and-performance**, the observability from
  **08-observability-and-operational-readiness**, the tested, deployed service
  from **12-testing-and-code-quality** and **13-devops-for-backend-engineers** —
  every one of them is now a *component* you can place, size, and justify inside a
  larger design. Re-reading them through the system-design lens is where the
  curriculum's pieces lock together.
- **Design something real.** The strongest consolidation is to take a system you
  actually use, or one you'd like to build, and run the full framework on it —
  then build a slice of it for real, reusing the FastAPI, database, caching, and
  testing skills from across the curriculum.

You have the whole toolkit now. Go build things — and when someone hands you a
blank whiteboard and says "design X," you'll know exactly where to start.
