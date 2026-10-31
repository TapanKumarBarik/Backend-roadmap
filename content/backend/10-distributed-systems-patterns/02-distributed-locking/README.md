# Module 02: Distributed Locking

## Why this matters

In track 06's scheduling module you hit a problem and were handed a quick fix:
when you run two copies of a scheduler for high availability, both fire the
nightly job, so you "take a lock" to make sure only one wins. That was a
distributed lock, used without being explained. This module explains it — because
distributed locking is one of the easiest things in backend engineering to get
*subtly, dangerously* wrong, and the failure mode isn't a crash you'll notice.
It's two processes both believing they hold the lock, both doing the "only one at
a time" work, and silently corrupting data.

The core difficulty is that the tools you already reach for don't work here.
`threading.Lock`, a mutex, a `synchronized` block — every in-process lock you know
coordinates threads *within one process's memory*. The instant your "one at a
time" guarantee must hold across *different processes on different machines* — two
API replicas, a fleet of Celery workers, two scheduler instances — that shared
memory is gone, and so is the lock. You need a lock whose state lives in a place
all the contenders can see: a shared datastore. That sounds simple, and the naive
version (`SET lock 1`) is a trap that works in every test and fails in production
the first time a lock holder pauses at the wrong moment. Getting this right means
understanding *lock expiry*, *fencing tokens*, and the honest limits of what a
distributed lock can promise — which is what separates a lock that protects your
data from one that merely makes you feel protected.

## Concepts

### Why local locks don't cross the process boundary

A `threading.Lock` (or `asyncio.Lock`, or a process-local mutex) is a variable in
one process's address space. Two threads in that process can both see it and
cooperate. But run two copies of your FastAPI app — on two containers, two hosts,
or even two `uvicorn` workers — and each has its *own* `Lock` object in its *own*
memory. Process A's lock and process B's lock are unrelated variables; A acquiring
its lock tells B nothing. So "acquire the lock before decrementing inventory"
protects you against concurrent *threads in one process* and does absolutely
nothing against concurrent *requests hitting different replicas* — which is the
normal way real traffic arrives. The moment you scale past one process (which is
the moment you have a distributed system), in-process locks are theater.

The fix is conceptually simple: put the lock somewhere *all* contenders can see —
a shared datastore they all connect to. The three common homes:

- **Redis** — fast, the usual choice for short-lived operational locks (this
  module's focus).
- **A relational database** — e.g. Postgres **advisory locks** (`pg_advisory_lock`)
  or a `SELECT ... FOR UPDATE` on a "lock row." Reuses infrastructure you already
  have and is strongly consistent (module 07 returns to this).
- **A dedicated coordination service** — ZooKeeper, etcd, Consul — purpose-built
  for locks/leader-election with strong consistency guarantees (module 07).

### The naive Redis lock and its two fatal bugs

The obvious first attempt: to acquire, `SET lockkey 1`; to release, `DEL lockkey`.
It has two independent, both-fatal flaws.

- **Bug 1 — no expiry: a crash holds the lock forever.** If the process that set
  the key crashes (or is killed, or hangs) before deleting it, the key stays in
  Redis indefinitely and *nobody* can ever acquire the lock again. Your "only one
  at a time" feature is now "zero at a time," permanently, until a human notices
  and deletes the key. **Fix:** set the key with an expiry (a TTL) so an abandoned
  lock auto-releases: `SET lockkey <token> NX EX 30`. `NX` = only if not already
  set (this *is* the acquire); `EX 30` = expire in 30s.
- **Bug 2 — releasing someone else's lock.** With a TTL, imagine process A
  acquires the lock (TTL 30s), then stalls (GC pause, slow disk, CPU starvation)
  for 31 seconds. The lock *expires*. Process B now legitimately acquires it and
  starts working. Then A wakes up, finishes, and runs `DEL lockkey` — deleting
  **B's** lock. Now C can acquire it while B is still working: two holders. **Fix:**
  each acquirer writes a *unique token* as the value, and release only deletes the
  key *if the value still matches its own token* — atomically, via a Lua script
  (a `GET`-then-`DEL` isn't atomic and reintroduces the race).

The correct minimal Redis lock is therefore: acquire with `SET key <random-token>
NX EX <ttl>`; release with a Lua script that deletes only if `GET key == my
token`. That handles crashes (TTL) and stale releases (token check). But it does
*not* — cannot — handle the deeper problem the next concept describes.

### Lock expiry is a lie you must plan around: fencing tokens

Here is the hard truth most tutorials skip. A TTL means **the lock can expire while
you still think you hold it.** Any lock with a timeout has this property, and you
*need* the timeout (bug 1), so you can't escape it. Concretely: A acquires the lock
(TTL 30s), does 25s of work, then pauses for 10s (a stop-the-world GC pause, a
container CPU throttle, a `fsync` that blocks). During that pause the lock expires
and B acquires it. Now A resumes — *it never got any signal that it lost the lock*
— and performs its write. B also performs its write. **Two writers, mutual
exclusion violated, despite a "correct" lock.** The token-check release doesn't
save you: A's *write* already happened; the release is too late.

The defense is a **fencing token**: every time the lock is granted, the lock
service hands out a number that **strictly increases** with each grant (A gets
33, B gets 34). The protected resource — the database, the storage system — must
*reject any write carrying a token lower than the highest it has already seen*. So
when A resumes and writes with token 33, the resource sees it has already accepted
34 (from B) and rejects 33. A's stale write is fenced off. The critical insight:
**fencing pushes the safety check down to the resource being protected**, because
the lock alone can never guarantee the holder still holds it at the moment of the
write. A lock without fencing is best-effort mutual exclusion (great for
efficiency — "usually only one worker rebuilds the cache"); a lock *with* fencing
is the only thing that's correct when a duplicate write would corrupt data.

```
  A acquires lock ─► fence=33 ─► [long pause; TTL expires]
                                       │
  B acquires lock ─► fence=34 ─► writes ─► resource records highest=34
                                       │
  A resumes (still "thinks" it holds) ─► writes with fence=33
                                       │
                                       ▼
        resource: accept only if token > highest seen  ─► 33 < 34: REJECTED
```

### Redlock, and the honest debate about it

**Redlock** is an algorithm (by Redis's author) for distributed locking across
*multiple independent* Redis nodes, so that a single Redis failover can't hand the
same lock to two clients. The client tries to acquire the lock on a majority of N
independent Redis instances (e.g. 3 of 5) within a time budget; it holds the lock
only if it got a majority before the TTL, and it accounts for clock drift and the
time spent acquiring. The goal is to remove the single-node-Redis failure mode:
with one Redis, if it fails over to a replica that hadn't yet replicated the lock,
two clients can both hold it.

You should know Redlock *conceptually* and know the **famous critique** (Martin
Kleppmann's) even more: Redlock relies on reasonably synchronized clocks and
bounded pauses, and under the process-pause scenario above it *still* can't
prevent two holders — so if correctness matters, you need **fencing tokens
regardless of Redlock**, at which point (the critique argues) you might as well use
a system that gives you a monotonic token natively (ZooKeeper, etcd) or a
strongly-consistent lock (Postgres). The practical takeaways: (1) for
*efficiency* locks (avoid duplicate work, occasional double-run is merely
wasteful) a simple single-Redis lock is fine; (2) for *correctness* locks (a
double action corrupts data or double-charges) you need fencing, and you should
prefer a strongly-consistent coordinator over rolling your own multi-Redis
Redlock. This distinction — efficiency vs correctness — is the single most useful
lens for choosing a locking approach.

### Avoiding deadlocks and self-inflicted outages

Distributed locks bring their own operational hazards beyond mutual exclusion:

- **Always set a TTL** (bug 1). A lock with no expiry *will* eventually get
  orphaned by a crash and wedge the feature. The TTL is a safety valve, not an
  optimization.
- **Size the TTL against realistic worst-case work time**, then extend it if
  needed. Too short and it expires mid-work (constant fencing/contention); too long
  and a genuine crash wedges the feature for that whole duration. For long jobs,
  use a *watchdog* that periodically extends the TTL while the holder is provably
  alive — but understand a watchdog reduces, not eliminates, the expiry-during-pause
  window.
- **Acquire multiple locks in a consistent order** — the same rule as database
  deadlocks in track 04 module 04. If task X grabs lock A then B, and task Y grabs
  B then A, they can deadlock waiting on each other. Order lock acquisition (e.g.
  by key name) so a cycle can't form.
- **Never block forever waiting for a lock.** Use a bounded acquire timeout so a
  stuck holder doesn't pile up an unbounded queue of waiters (which becomes an
  outage). Fail fast, shed load, or retry with backoff.
- **Make the locked operation idempotent anyway** (module 01). Because the lock can
  expire under you, idempotency is your second line of defense: even if two holders
  briefly overlap, an idempotent operation limits the damage. Lock + fencing +
  idempotency are layers, not alternatives.

## Command reference

| Operation | Redis | Meaning |
|---|---|---|
| Acquire | `SET lock:<name> <token> NX EX <ttl>` | set if absent, with expiry; returns OK or nil |
| Release (safe) | Lua: `if GET == token then DEL` | delete only if we still own it (atomic) |
| Extend (watchdog) | Lua: `if GET == token then PEXPIRE` | refresh TTL only if we still own it |
| Check owner | `GET lock:<name>` | inspect current holder token |
| Postgres advisory (session) | `SELECT pg_advisory_lock(:key)` | blocks until acquired; auto-released on session end |
| Postgres advisory (try) | `SELECT pg_try_advisory_lock(:key)` | returns true/false immediately, no blocking |

A correct Redis lock with a unique token, TTL, atomic token-checked release, and a
watchdog — using `redis-py`:

```python
import secrets, time, threading
import redis

r = redis.Redis(host="localhost", port=6379)

# Release ONLY if we still own the lock. GET+DEL as one atomic step.
_RELEASE = r.register_script("""
    if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
    else
        return 0
    end
""")
# Extend ONLY if we still own it (watchdog for long jobs).
_EXTEND = r.register_script("""
    if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('pexpire', KEYS[1], ARGV[2])
    else
        return 0
    end
""")

class DistributedLock:
    def __init__(self, name: str, ttl_ms: int = 30_000):
        self.key = f"lock:{name}"
        self.ttl_ms = ttl_ms
        self.token = secrets.token_hex(16)   # unique per acquisition
        self._stop = threading.Event()

    def acquire(self, wait_ms: int = 0) -> bool:
        deadline = time.monotonic() + wait_ms / 1000
        while True:
            if r.set(self.key, self.token, nx=True, px=self.ttl_ms):
                return True
            if time.monotonic() >= deadline:      # bounded wait; never forever
                return False
            time.sleep(0.05)

    def release(self) -> None:
        self._stop.set()
        _RELEASE(keys=[self.key], args=[self.token])   # no-op if we lost it

    def __enter__(self):
        if not self.acquire(wait_ms=5000):
            raise TimeoutError("could not acquire lock")
        return self

    def __exit__(self, *exc):
        self.release()
```

Using it around the "only one at a time" operation:

```python
with DistributedLock("nightly-report", ttl_ms=60_000):
    generate_nightly_report()     # only one process across the fleet runs this
```

Fencing: hand the caller a monotonic token, and have the *resource* enforce it.
Redis `INCR` gives a strictly-increasing token per grant:

```python
def acquire_with_fence(name: str, ttl_ms: int = 30_000):
    token = secrets.token_hex(16)
    if not r.set(f"lock:{name}", token, nx=True, px=ttl_ms):
        return None
    fence = r.incr(f"fence:{name}")    # strictly increases every grant
    return token, fence

# The RESOURCE rejects stale writes. Enforced in the DB, not in the lock:
#   UPDATE resource
#   SET    value = :v, last_fence = :fence
#   WHERE  id = :id AND last_fence < :fence;   -- 0 rows => stale token, rejected
```

Postgres advisory lock (a strongly-consistent alternative that needs no extra
infrastructure), the scheduler-singleton pattern from track 06:

```python
from sqlalchemy import create_engine, text
db = create_engine("postgresql+psycopg://app@primary:5432/shop")

def run_if_leader(lock_id: int, job) -> None:
    with db.connect() as c:
        got = c.execute(text("SELECT pg_try_advisory_lock(:k)"),
                        {"k": lock_id}).scalar_one()
        if not got:
            return                     # someone else holds it; do nothing
        try:
            job()
        finally:
            c.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": lock_id})
```

## Hands-on exercises

Redis via Docker (`docker run -d --name redis -p 6379:6379 redis:7`) and Postgres
from earlier modules. `pip install redis "sqlalchemy>=2" psycopg[binary]`. For the
"two processes" exercises, open two terminals running the same script, or use two
Python shells — the point is *separate processes*, not threads.

### 1. Show a local lock fails across processes

Write a script that increments a shared counter row in Postgres 1000 times, guarded
by a module-level `threading.Lock`. Run **two copies** concurrently against the
same row (read-modify-write in app code, no DB lock). Compare the final value to
2000.

Expected: the final value is *less* than 2000 — lost updates. The `threading.Lock`
did nothing because each process has its own lock object. This is the failure the
whole module addresses: in-process locks don't cross the process boundary.

### 2. Reproduce naive-lock bug 1 (orphaned lock)

Acquire a lock with plain `SET lock:x 1` (no `NX`, no `EX`), then kill the process
(`Ctrl+C`) before it deletes the key. Start a second process that tries to acquire
by checking the key.

Expected: the second process can never acquire — the key is orphaned forever. Now
`redis-cli DEL lock:x` by hand to recover. Lesson: without a TTL, a crash wedges the
lock permanently.

### 3. Reproduce naive-lock bug 2 (releasing someone else's lock)

Simulate: process A does `SET lock:x A-token EX 2`, then `sleep(3)` (longer than the
TTL). Meanwhile process B acquires (`SET lock:x B-token NX EX 30`) — it succeeds
because A's expired. Now A wakes and does a *plain* `DEL lock:x`.

Expected: A deletes B's lock. Confirm with `GET lock:x` (empty) while B still
"holds" it. Now redo A's release with the token-checked Lua script from the command
reference and confirm A's release is a *no-op* (B's token doesn't match A's), so B
keeps its lock. You've fixed bug 2.

### 4. Build and use the correct lock

Implement `DistributedLock` from the command reference. Run two processes that each
try to `with DistributedLock("job"):` and print "working" for 5 seconds.

Expected: exactly one prints "working" at a time; the other waits (up to its
acquire timeout) then either gets the lock after the first releases, or times out.
No overlap. This is the working single-Redis lock.

### 5. Demonstrate expiry-during-pause (why fencing is needed)

Set a short TTL (2s). Process A acquires, then simulates a pause with `sleep(4)`
*while still inside the `with` block* (comment out the watchdog). Process B acquires
during A's pause. Have both print a "writing" line with their token after the
sleep/work.

Expected: **both** processes "write" — A's lock expired mid-work and B acquired, yet
A has no idea and proceeds. This is the fundamental limit: a TTL lock cannot
guarantee you still hold it at write time. No token check on *release* prevents
this, because the damage is the *write*, which already happened.

### 6. Add fencing tokens and prove the stale write is rejected

Use `acquire_with_fence` and a Postgres `resource` table with a `last_fence`
column. Redo exercise 5, but each writer does the fenced `UPDATE ... WHERE last_fence
< :fence`. A gets fence 1, B gets fence 2; both attempt their write.

Expected: B's write (fence 2) succeeds; A's late write (fence 1) affects **0 rows**
— rejected because the resource already saw fence 2. The stale writer is fenced off
*at the resource*. This is the only construction in the module that's actually
correct under a pause.

### 7. Add a watchdog and size the TTL

Add the watchdog thread to `DistributedLock` (extend the TTL every `ttl/3` ms while
working). Run a job that takes 20s with a 6s TTL.

Expected: the lock survives the whole 20s job (the watchdog keeps extending it),
and it *still* auto-releases within ~6s if you kill the process (the watchdog stops
extending). Discuss: the watchdog shrinks but does not eliminate the pause window
from exercise 5 — a pause longer than the TTL between extensions still loses the
lock.

### 8. Postgres advisory lock as a strongly-consistent alternative

Implement the scheduler-singleton with `pg_try_advisory_lock` (from the command
reference). Run two "scheduler" processes that each try to grab advisory lock `42`
and, if they get it, run a job.

Expected: exactly one runs the job; the other's `pg_try_advisory_lock` returns
`false` and it skips. Note what you got "for free": no TTL to tune (the lock
auto-releases when the session ends/crashes) and strong consistency from Postgres.
Discuss the trade-off vs Redis (advisory locks tie you to a DB connection and don't
scale to millions of locks, but they're correct and need no extra infra).

### 9. Diagnose and fix: the double-charged subscription cron

A billing cron runs on two hosts for HA. Each night it does: `SET lock:billing 1 EX
3600` (if it fails, skip), then charges every active subscription, then `DEL
lock:billing`. Some months, a few customers are charged twice. The team insists
"the lock works — we tested it." Explain the root cause and give a layered fix.

<details>
<summary>Answer</summary>

Two root causes stack up. (1) **The release isn't token-checked**, so if host A's
run runs long and the 1-hour TTL expires, host B acquires and starts charging;
when A finishes it `DEL`s B's lock, letting a *third* run (or B's next cycle)
overlap — classic bug 2. (2) More fundamentally, **the charge is a correctness
operation guarded only by an efficiency lock**: even a perfectly implemented
single-Redis lock can expire during a process pause (GC, host throttle) and let two
hosts charge concurrently — exactly the expiry-during-pause scenario. A lock alone
can never guarantee the holder still holds it at charge time.

Layered fix: (a) use the correct lock — unique token, `NX EX`, token-checked Lua
release — to remove bug 2 and reduce accidental overlap; (b) because double-charging
*corrupts* (money), treat this as a **correctness** lock: give each charge a stable
**idempotency key** (module 01) per (subscription, billing-period) and pass it to
the payment provider, so even if two runs overlap, the second charge for a given
subscription-period is deduped and does nothing — this is the real guarantee; (c)
optionally record `last_charged_period` per subscription and only charge `WHERE
last_charged_period < :period` (a fencing-like conditional write at the resource).
The lock reduces the probability of overlap; idempotency + the conditional write
make a double charge *impossible*. The team's mistake was trusting a lock to
provide correctness that only fencing/idempotency at the resource can provide.

</details>

## Independent challenge

No code given. Recall **01-idempotency-in-practice** — you'll layer it on top of a
lock here. Design a "rebuild the product-search index" operation that: is expensive
(takes minutes), must not run more than once concurrently across a fleet of workers
(a second concurrent rebuild wastes huge resources and can produce a half-written
index), can be triggered both on a schedule and manually by an admin, and must
survive a worker crash mid-rebuild (the lock must not stay orphaned, and the next
run must be able to complete a clean rebuild). Specify: is this an *efficiency* lock
or a *correctness* lock, and how does that decide whether you need fencing? What TTL
and watchdog strategy fits a minutes-long job? How does idempotency of the rebuild
itself act as a safety net? And what does the admin see if they click "rebuild"
while a rebuild is already running?

<details>
<summary>Hint</summary>

Classify it first: a concurrent double-rebuild is *wasteful* but, if the rebuild
writes to a fresh index and atomically swaps it in at the end, not *corrupting* —
so this is primarily an **efficiency** lock, and a correct single-Redis lock
(unique token, TTL, token-checked release) plus a **watchdog** to extend the TTL
across the minutes-long job is appropriate; you don't strictly need fencing tokens
*if* the swap-in is atomic and idempotent. The crash-survival requirement is exactly
why the TTL matters (an orphaned lock from a crashed worker must auto-expire so the
next run can proceed) and why the rebuild should be **idempotent** — build into a
uniquely-named temp index and atomically promote it, so a crashed half-rebuild
leaves no half-written live index and a re-run cleanly redoes it. The admin clicking
"rebuild" during an active rebuild should get a fast "a rebuild is already in
progress" response (bounded acquire timeout → fail fast), not a blocked request or a
second rebuild.

</details>

## Common mistakes & troubleshooting

- **Using an in-process lock across processes.** `threading.Lock`/`asyncio.Lock`
  only coordinate within one process. Across replicas or workers they're useless —
  you need a lock in a shared datastore.
- **A lock with no expiry.** A crashed holder orphans the lock forever and wedges
  the feature. Always `SET ... NX EX/PX`. The TTL is mandatory safety, not tuning.
- **Releasing without checking ownership.** A plain `DEL` can delete a lock a
  *different* holder now owns (after your TTL expired). Release only if the stored
  token matches yours, atomically (Lua) — a `GET` then `DEL` still races.
- **Believing the lock guarantees you still hold it.** Any TTL lock can expire
  during a process pause while you think you're the holder. For *correctness* you
  need fencing tokens enforced at the resource; the lock alone is best-effort.
- **Confusing efficiency locks with correctness locks.** If an occasional double-run
  is merely wasteful, a simple lock suffices. If a double action corrupts data or
  double-charges, you need fencing and/or idempotency at the resource — a plain lock
  is not enough.
- **TTL sized wrong.** Too short → expires mid-work, constant contention; too long →
  a real crash wedges the feature for that long. Size to realistic worst-case work
  time and use a watchdog for long jobs.
- **Blocking forever to acquire.** An unbounded wait turns one stuck holder into a
  pile-up of waiters and an outage. Bound the acquire timeout; fail fast or retry
  with backoff.
- **Rolling your own multi-node Redlock for correctness.** If you truly need
  correctness, prefer a strongly-consistent coordinator (etcd/ZooKeeper/Postgres)
  that gives you a monotonic fencing token natively, rather than a hand-rolled
  Redlock plus separate fencing.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why does a `threading.Lock` fail to provide mutual exclusion across two API
   replicas, and what has to change to fix it?
2. Name the two fatal bugs in a `SET lock 1` / `DEL lock` naive Redis lock and the
   fix for each.
3. Why does even a correct token-checked Redis lock fail to guarantee mutual
   exclusion, and what mechanism actually fixes it?
4. Explain fencing tokens: what they are, where the enforcement happens, and why it
   *has* to happen there.
5. Distinguish an "efficiency" lock from a "correctness" lock and say how the
   distinction changes what you build.
6. What's the one-line summary of the Redlock critique, and what does it imply you
   should do if correctness matters?
7. Give three operational rules for using distributed locks safely (TTL, ordering,
   waiting, idempotency — pick and justify).

<details>
<summary>Answers</summary>

1. A `threading.Lock` is a variable in one process's memory; a second replica has
   its own separate lock object, so one acquiring tells the other nothing. To fix
   it, the lock state must live in a datastore all contenders share (Redis,
   Postgres advisory locks, etcd/ZooKeeper).
2. Bug 1: no expiry → a crashed holder orphans the lock forever; fix with a TTL
   (`SET ... NX EX`). Bug 2: a plain `DEL` can release a lock now held by someone
   else (after your TTL expired); fix by storing a unique token and deleting only
   if the stored value matches yours, atomically via Lua.
3. Because the TTL can expire while the holder is paused (GC/CPU-throttle) and
   still believes it holds the lock, so it performs its write while a new holder
   also does — two writers. The token-checked *release* is too late (the write
   already happened). Fencing tokens fix it.
4. A fencing token is a strictly-increasing number handed out on each lock grant.
   The *resource* being written to records the highest token it has accepted and
   rejects any write carrying a lower one. Enforcement must be at the resource
   because the lock service can't guarantee the holder still holds the lock at the
   moment of the write — only the resource sees the actual write and can reject a
   stale one.
5. An efficiency lock just avoids duplicate/wasteful work; an occasional overlap is
   harmless, so a simple single-Redis lock is fine. A correctness lock protects an
   operation where overlap corrupts data or double-charges; that requires fencing
   tokens at the resource and/or idempotency — a plain lock is insufficient. Decide
   which you have *before* choosing the mechanism.
6. Redlock relies on synchronized clocks and bounded pauses and still can't prevent
   two holders under a long process pause — so if correctness matters you need
   fencing tokens anyway, and you're better off with a strongly-consistent
   coordinator that provides a monotonic token natively than with a hand-rolled
   multi-Redis Redlock.
7. (Any three) Always set a TTL so a crash can't orphan the lock; acquire multiple
   locks in a consistent order to avoid deadlock cycles (same rule as DB
   deadlocks); bound the acquire wait so a stuck holder can't pile up waiters into
   an outage; and make the locked operation idempotent so a brief overlap from an
   expired lock does bounded damage.

</details>

## Further reading & sources

- [Distributed Locks with Redis (Redlock)](https://redis.io/docs/latest/develop/use-cases/patterns/distributed-locks/) - the official single-instance lock and the multi-node Redlock algorithm this module builds and critiques.
- [How to do distributed locking (Martin Kleppmann)](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) - the classic critique of Redlock and the fencing-token argument at the heart of this module.
- [Is Redlock safe? (Salvatore Sanfilippo / antirez)](http://antirez.com/news/101) - the Redis author's rebuttal, giving you both sides of the canonical distributed-locking debate.
- [Redis SET command (NX / EX / PX options)](https://redis.io/docs/latest/commands/set/) - the set-if-absent-with-expiry primitive behind a correct acquire.
- [PostgreSQL: Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS) - the strongly-consistent, auto-releasing alternative used in the exercises.

## Next

[03-distributed-transactions-and-two-phase-commit](../03-distributed-transactions-and-two-phase-commit/README.md)
— locks coordinate access to a single shared resource; the next problem is bigger:
how do you make a change that spans *multiple* independent services or databases
happen atomically — all commit or all abort? The next module examines two-phase
commit, the coordinator it requires, why it scales poorly, and — crucially — when
you actually need it versus when you're about to reach for the saga pattern
instead.
