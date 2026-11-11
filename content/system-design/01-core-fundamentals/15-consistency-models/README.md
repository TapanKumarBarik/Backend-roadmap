# Lesson 15: Consistency Models

> **Prerequisites:** [Lesson 14: PACELC Theorem](../14-pacelc-theorem/README.md).  
> **Estimated Reading Time:** 30 minutes  
> **Target Audience:** Backend and platform engineers choosing exact per-operation consistency guarantees—from strict Linearizability and Causal Ordering down to WAL-LSN Read-Your-Writes session routing.

> [!TIP]
> **The Golden Rule of Consistency Modeling:** Consistency is never a binary toggle—it is a costed **spectrum** running from **Linearizable** (real-time single-copy illusion, highest coordination latency) down through **Sequential**, **Causal**, and **Eventual** consistency (cheapest, highest availability). Always select the weakest model that protects business invariants **per operation**, and shield individual user UX on cheap asynchronous replicas using **session guarantees** like **Read-Your-Writes** and **Monotonic Reads**.

---

## Visual Mental Models & Architecture

### The Consistency Strength vs. Coordination Cost Spectrum

![Stronger models are easier to reason about but need coordination; weaker ones are cheaper and stay available.](images/figure-1.svg)

*Figure 1. Stronger models are easier to reason about but need coordination; weaker ones are cheaper and stay available.*

### Why Read-Your-Writes Fails Across Asynchronous Replicas

![The write goes to the primary, the reload reads a lagging replica, and the author sees the old value.](images/figure-2.svg)

*Figure 2. The write goes to the primary, the reload reads a lagging replica, and the author sees the old value.*

### LSN-Tracked Read-Your-Writes Architecture (99% Replica Scale + 100% Author Freshness)

```mermaid
sequenceDiagram
    autonumber
    actor Author as Editing User
    actor Reader as Other Anonymous Readers
    participant Router as Smart Session Router
    participant Primary as PostgreSQL Primary
    participant Replica as Async Streaming Replica

    Author->>Router: POST /profile (Save New Bio)
    Router->>Primary: UPDATE profiles SET bio=...; SELECT pg_current_wal_lsn()
    Primary-->>Router: Committed at WAL LSN = '0/1A04F00'
    Router-->>Author: 200 OK (Store LSN '0/1A04F00' in User Session/Cookie)

    Author->>Router: Immediate Refresh: GET /profile
    Router->>Replica: Check pg_last_wal_replay_lsn() >= '0/1A04F00'?
    Replica-->>Router: FALSE (Currently at '0/1A04B10' — 400KB behind!)
    Router->>Primary: Fallback strictly for Author -> Query Primary DB
    Primary-->>Author: Returns Fresh New Bio!

    Reader->>Router: GET /profile (No recent write LSN)
    Router->>Replica: Serve directly from Async Replica
    Replica-->>Reader: Ultra-fast scaled read (Zero Primary Load!)
```

---

## Systematic Taxonomic Reference Grids

### The Four Core Consistency Models Matrix

| Consistency Model | Exact Ordering & Freshness Promise | Hardware / Network Cost | Safe Use Cases | Dangerous Failure Mode If Misapplied |
| :--- | :--- | :--- | :--- | :--- |
| **Linearizable** | Once a write completes in real physical time, **every subsequent read globally** observes it—as if one physical copy existed. | Highest (Consensus quorum / cross-node coordination + RTT wait). | Distributed locks, leader election, unique seat reservations, financial balances. | Overpaying synchronization latency on cosmetic or cacheable reads. |
| **Sequential** | All nodes agree on the exact **total order** of operations, though reads may trail real wall-clock time slightly. | High (Ordered log replication, weaker real-time freshness guarantee). | Replicated state machines, event logs, sequential audit pipelines. | Confusing sequential order with real-time linearizability across external channels. |
| **Causal** | Any operation **causally dependent** on another (e.g., reply B to post A) is seen in cause-before-effect order by everyone; unrelated writes can commute. | Moderate (Logical clocks / vector versions; stays partition-tolerant!). | Chat threads, nested comment trees, collaborative edits. | Comments appearing above the parent post they reply to if dropped to eventual. |
| **Eventual** | If new writes halt, replicas eventually converge to matching values; until then, reads can return arbitrarily stale snapshots. | **Lowest** (Zero coordination on read path; scales linearly with async replicas). | Like counters, view counts, analytics dashboards, catalogs, search indexes. | **Vanishing edits / overselling:** user updates bio and refresh says "old bio", or 2 buyers claim last stock unit. |

### The Four Session Guarantees (Protecting Individual Users on Cheap Replicas)

Between strong linearizability and raw eventual consistency, **session guarantees** restore human sanity per user without sacrificing fleet-wide read scaling:

1. **Read-Your-Writes:** After a user mutates data, subsequent reads by that *same user* always observe their own commit (via short primary pinning, WAL LSN comparison, or sticky write-window cookies).
2. **Monotonic Reads:** Once a user observes version $V_2$, subsequent reads by that user will never revert backwards in time to an older replica holding $V_1$ (achieved via LSN high-watermarks or pinning a user session to one replica).
3. **Monotonic Writes:** Consecutive writes issued by the same session serialize in order ($W_1$ always executes before $W_2$) so later updates never get reordered ahead of earlier ones.
4. **Writes-Follow-Reads:** Any write a user performs after reading state $S$ is ordered strictly causally after $S$ globally (preventing replies from landing chronologically ahead of the parent comment).

> [!NOTE]
> **Linearizable vs. Serializable (Classic Tricky Interview Question):**
> - **Linearizability** is a real-time **single-object** recency guarantee (CAP's `C`).
> - **Serializability** is a **multi-object transaction isolation** guarantee (ACID's `I`: concurrent multi-row transactions produce a result equivalent to running serially, without necessarily respecting real-time order across unrelated connections).
> - **Strict Serializability (External Consistency)** combines both—delivering transactional ACID isolation *and* real-time linearizable order simultaneously (e.g., Google Spanner).

### Key Terms Reference

| Term | Operational Meaning |
| :--- | :--- |
| **Linearizable** | Real-time single-copy read/write semantics across all clients. |
| **Causal** | Causes always become visible ahead of their effects; independent operations stay concurrent. |
| **Eventual** | Replicas converge once writes pause, permitting transient stale reads. |
| **Read-Your-Writes** | Session guarantee ensuring authors immediately see their own completed mutations. |
| **Monotonic Reads** | Session guarantee preventing a user's timeline/balance from jumping backwards on refresh. |
| **Replica Lag** | Replication delay measured as time (`pg_last_xact_replay_timestamp`) or byte offset (`pg_last_wal_replay_lsn`). |

---

## Production War Stories: Incident Post-Mortem

### SEV-2 Post-Mortem: The Vanishing Signup & Disordered Comment Thread Outage

#### Incident Overview
* **Severity:** SEV-2 (`12%` Onboarding Drop-Off & Customer Support Flood)
* **Detection Time:** 2 hours 40 minutes post-replica rollout
* **Resolution Time:** 45 minutes
* **Impact:** `3,400+` newly registered accounts saw `"404 User Not Found"` right after clicking "Create Account" while `POST /signup` returned `201 Created`, and users reloading profile screens watched saved bios flicker randomly between old and new text.

#### What Happened
A growing consumer web app added 4 asynchronous PostgreSQL read replicas (`~350ms` average lag, spiking to `1.8s` under traffic) and routed **every** HTTP `GET` request globally round-robin across those replicas.
1. A new user submitted `POST /signup` (routed to the **Primary**), received `201 Created`, and the frontend SPA immediately triggered `GET /api/me` (`20ms` later) to load their dashboard.
2. Load balancing sent `GET /api/me` to Replica #3, which hadn't yet replayed the signup WAL frame—returning `404 User Not Found` and locking the brand-new customer onto an error screen!
3. Meanwhile, users editing bios refreshed repeatedly, hitting Replica #1 (caught up -> new bio), then Replica #4 (lagging -> old bio), violating both **Read-Your-Writes** and **Monotonic Reads**.

```mermaid
sequenceDiagram
    autonumber
    actor User as New Signup User
    participant LB as Load Balancer
    participant Primary as Primary DB (WAL LSN 0/900)
    participant Rep3 as Replica 3 (WAL LSN 0/700 — 350ms Behind!)
    participant Rep1 as Replica 1 (WAL LSN 0/900 — Caught Up!)

    User->>LB: POST /signup (Account Created)
    LB->>Primary: INSERT INTO users ... (Committed at LSN 0/900)
    Primary-->>User: 201 Created (Session Started!)

    User->>LB: Immediate Redirect -> GET /api/me (20ms later)
    LB->>Rep3: Round-Robin routes GET /api/me to Replica 3
    Rep3-->>User: 404 User Not Found! (Violates Read-Your-Writes!)

    Note over User: User clicks Refresh...
    User->>LB: GET /api/me
    LB->>Rep1: Round-Robin sends to caught-up Replica 1
    Rep1-->>User: 200 OK (User exists! Confusing flicker!)
```

#### Root Cause Analysis
1. **Naive Global Read-Replica Splitting:** Routing `GET` calls indiscriminately across round-robin async replicas ignored per-operation consistency requirements (`GET /api/me` immediately post-write requires Read-Your-Writes).
2. **Absence of Monotonic Session High-Watermarks:** Without LSN tracking or replica pinning per session, consecutive page refreshes bounced between replicas at different replay positions.

#### The Fix & Architectural Hardening
1. **WAL-LSN Session Tracking (`pg_current_wal_lsn`):** Stored each user's last write LSN inside an encrypted session cookie/Redis hash (`last_write_lsn:{uid}`). Subsequent reads inspect replica `pg_last_wal_replay_lsn() >= session_lsn`: only lagging replicas fall back to the primary; once caught up (or for users who didn't just write), all traffic stays on cheap replicas!
2. **Authoritative Primary Pin for Auth & Signup Paths:** Hard-pinned `GET /api/me` after `POST /signup` (`window = 5s`) directly to primary/LSN check.

---

## Multi-Language Production Implementation: WAL-LSN Read-Your-Writes Router

Notice how clean the pattern is across all languages: **(1)** commit write on Primary, **(2)** capture `pg_current_wal_lsn()`, and **(3)** on reads check whether the target replica satisfies `pg_last_wal_replay_lsn() >= user_lsn`, falling back strictly for that author if the replica lags—keeping $99\%+$ of unrelated traffic on replicas.

````carousel
```python
from sqlalchemy import create_engine, text

primary = create_engine("postgresql+psycopg://postgres:devpass@localhost:5432/shop")
replica = create_engine("postgresql+psycopg://postgres:devpass@localhost:5433/shop")
last_write_lsn: dict[int, str] = {}  # per user; in production, keep in Redis / signed session cookie


def save_bio(uid: int, bio: str) -> str:
    with primary.begin() as c:
        c.execute(text("UPDATE profiles SET bio = :b WHERE id = :i"), {"b": bio, "i": uid})
    # Capture log position strictly AFTER COMMIT so the LSN covers the committed transaction
    with primary.connect() as c:
        lsn = c.execute(text("SELECT pg_current_wal_lsn()::text")).scalar_one()
        last_write_lsn[uid] = lsn
        return lsn


def read_bio(uid: int) -> tuple[str, str]:
    query = text("SELECT bio FROM profiles WHERE id = :i")
    lsn = last_write_lsn.get(uid)
    with replica.connect() as c:
        caught_up = lsn is None or c.execute(
            text("SELECT pg_last_wal_replay_lsn() >= CAST(:l AS pg_lsn)"), {"l": lsn}
        ).scalar_one()
        if caught_up:
            return "replica", c.execute(query, {"i": uid}).scalar_one()

    # Replica still lags behind this user's own commit -> protect Read-Your-Writes via Primary
    with primary.connect() as c:
        return "primary_fallback", c.execute(query, {"i": uid}).scalar_one()
```
<!-- slide -->
```go
package consistencymodels

import (
	"context"
	"database/sql"
	"sync"
)

type LSNTrackedRouter struct {
	primary      *sql.DB
	replica      *sql.DB
	mu           sync.RWMutex
	userWriteLSN map[int64]string
}

func NewLSNTrackedRouter(primary, replica *sql.DB) *LSNTrackedRouter {
	return &LSNTrackedRouter{
		primary:      primary,
		replica:      replica,
		userWriteLSN: make(map[int64]string),
	}
}

func (r *LSNTrackedRouter) SaveBio(ctx context.Context, userID int64, bio string) error {
	tx, err := r.primary.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, "UPDATE profiles SET bio = $1 WHERE id = $2", bio, userID); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}

	var lsn string
	if err := r.primary.QueryRowContext(ctx, "SELECT pg_current_wal_lsn()::text").Scan(&lsn); err != nil {
		return err
	}
	r.mu.Lock()
	r.userWriteLSN[userID] = lsn
	r.mu.Unlock()
	return nil
}

func (r *LSNTrackedRouter) ReadBio(ctx context.Context, userID int64) (bio string, source string, err error) {
	r.mu.RLock()
	lsn, hasWrite := r.userWriteLSN[userID]
	r.mu.RUnlock()

	if !hasWrite {
		err = r.replica.QueryRowContext(ctx, "SELECT bio FROM profiles WHERE id = $1", userID).Scan(&bio)
		return bio, "replica", err
	}

	var caughtUp bool
	err = r.replica.QueryRowContext(ctx,
		"SELECT pg_last_wal_replay_lsn() >= CAST($1 AS pg_lsn)", lsn).Scan(&caughtUp)
	if err == nil && caughtUp {
		err = r.replica.QueryRowContext(ctx, "SELECT bio FROM profiles WHERE id = $1", userID).Scan(&bio)
		return bio, "replica_caught_up", err
	}

	err = r.primary.QueryRowContext(ctx, "SELECT bio FROM profiles WHERE id = $1", userID).Scan(&bio)
	return bio, "primary_read_your_writes", err
}
```
<!-- slide -->
```typescript
import { Pool } from "pg";

export class ReadYourWritesProfileService {
  private readonly lastWriteLsn = new Map<number, string>(); // store in Redis/session in prod

  constructor(private readonly primary: Pool, private readonly replica: Pool) {}

  async saveBio(uid: number, bio: string): Promise<string> {
    const client = await this.primary.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE profiles SET bio = $1 WHERE id = $2", [bio, uid]);
      await client.query("COMMIT");

      const lsnRes = await client.query("SELECT pg_current_wal_lsn()::text AS lsn");
      const lsn = lsnRes.rows[0].lsn as string;
      this.lastWriteLsn.set(uid, lsn);
      return lsn;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async readBio(uid: number): Promise<{ source: string; bio: string }> {
    const targetLsn = this.lastWriteLsn.get(uid);
    if (targetLsn) {
      const lagCheck = await this.replica.query(
        "SELECT pg_last_wal_replay_lsn() >= CAST($1 AS pg_lsn) AS caught_up",
        [targetLsn]
      );
      if (!lagCheck.rows[0]?.caught_up) {
        const res = await this.primary.query("SELECT bio FROM profiles WHERE id = $1", [uid]);
        return { source: "primary-read-your-writes", bio: res.rows[0].bio };
      }
    }

    const res = await this.replica.query("SELECT bio FROM profiles WHERE id = $1", [uid]);
    return { source: "replica", bio: res.rows[0].bio };
  }
}
```
<!-- slide -->
```csharp
using System.Collections.Concurrent;
using Npgsql;

public sealed class LsnReadYourWritesRouter(NpgsqlDataSource primary, NpgsqlDataSource replica)
{
    private readonly ConcurrentDictionary<long, string> _userLsn = new();

    public async Task<string> SaveBioAsync(long userId, string bio)
    {
        await using var conn = await primary.OpenConnectionAsync();
        await using var tx = await conn.BeginTransactionAsync();

        await using var upd = new NpgsqlCommand("UPDATE profiles SET bio = @b WHERE id = @i", conn, tx);
        upd.Parameters.AddWithValue("b", bio);
        upd.Parameters.AddWithValue("i", userId);
        await upd.ExecuteNonQueryAsync();
        await tx.CommitAsync();

        await using var lsnCmd = new NpgsqlCommand("SELECT pg_current_wal_lsn()::text", conn);
        var lsn = (string)(await lsnCmd.ExecuteScalarAsync())!;
        _userLsn[userId] = lsn;
        return lsn;
    }

    public async Task<(string Source, string Bio)> ReadBioAsync(long userId)
    {
        if (_userLsn.TryGetValue(userId, out var targetLsn))
        {
            await using var chk = replica.CreateCommand("SELECT pg_last_wal_replay_lsn() >= CAST(@l AS pg_lsn)");
            chk.Parameters.AddWithValue("l", targetLsn);
            var caughtUp = Convert.ToBoolean(await chk.ExecuteScalarAsync());
            if (!caughtUp)
            {
                await using var pCmd = primary.CreateCommand("SELECT bio FROM profiles WHERE id = @i");
                pCmd.Parameters.AddWithValue("i", userId);
                return ("primary-read-your-writes", (string)(await pCmd.ExecuteScalarAsync())!);
            }
        }

        await using var rCmd = replica.CreateCommand("SELECT bio FROM profiles WHERE id = @i");
        rCmd.Parameters.AddWithValue("i", userId);
        return ("replica", (string)(await rCmd.ExecuteScalarAsync())!);
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows & Practice Labs

### Practice 1: Pick a Consistency Model Per Operation

For an online storefront, decide whether each operation requires **strong (linearizable)**, **causal**, or **eventual** consistency, with one sentence explaining why:
- (a) Checking whether a single-use coupon code is still valid before applying it.
- (b) Rendering the `"142 people bought this"` social-proof badge.
- (c) Displaying a threaded chat conversation between buyer and seller.
- (d) Reserving the last physical unit in warehouse inventory at checkout.
- (e) Computing the seller's average 4.8-star rating.

<details><summary><strong>Answer</strong></summary>

- **(a) Strong:** A stale `"valid"` check allows double-redemption beyond the budget.
- **(b) Eventual:** Showing `142` instead of `143` for a few seconds harms nobody.
- **(c) Causal:** A seller's answer must always appear strictly after the buyer's question they replied to.
- **(d) Strong:** Reading stale stock counts oversells physical items.
- **(e) Eventual:** An average rating trailing by one review for a couple of seconds is completely invisible.

*(Always derive the model per operation by asking what stale reads cost, rather than applying a blanket label across the database.)*

</details>

### Practice 2 (CLI Lab): Watch LSN-Tracked Read-Your-Writes Work Live

Using a primary + streaming replica pair (the two-container setup in [Backend Track 04, Module 08](../../../backend/04-databases-and-data-layer/08-replication-and-sharding/README.md)), freeze replica replay intentionally to inspect eventual lag alongside LSN-protected fallback:

```bash
# 1. Create profiles table & initial row on Primary
docker compose exec primary psql -U postgres -d shop -c \
  "CREATE TABLE IF NOT EXISTS profiles (id INT PRIMARY KEY, bio TEXT); INSERT INTO profiles VALUES (1, 'old bio') ON CONFLICT DO NOTHING;"

# 2. Freeze WAL replay strictly on Replica (it still answers SQL reads using frozen old state!)
docker compose exec replica psql -U postgres -d shop -c "SELECT pg_wal_replay_pause();"

# 3. Now execute save_bio(1, 'new bio') in Python -> inspect direct replica vs read_bio(1)
docker compose exec replica psql -U postgres -d shop -c "SELECT bio FROM profiles WHERE id = 1;"
# Expected while paused: 'old bio' (Eventual consistency exposed!)
# Meanwhile read_bio(1) detects pg_last_wal_replay_lsn() < session_lsn and returns ('primary_fallback', 'new bio')!

# 4. Resume WAL replay -> replica catches up and read_bio(1) seamlessly switches back to replica!
docker compose exec replica psql -U postgres -d shop -c "SELECT pg_wal_replay_resume();"
```

<details><summary><strong>Expected Behavior & Diagnosis</strong></summary>

While WAL replay stays paused, raw queries hitting the replica return `'old bio'`—that is **eventual consistency** frozen in time so you can observe it directly. Yet `read_bio(1)` still returns `'new bio'` because checking `pg_last_wal_replay_lsn() >= CAST(:l AS pg_lsn)` proves the replica is behind this user's commit and transparently sends *only that user* to Primary. After `pg_wal_replay_resume()`, the replica replays the missed WAL segment and `read_bio(1)` immediately switches back off Primary—guaranteeing **Read-Your-Writes** for authors while every other user continues hitting replicas with zero Primary overhead.

</details>

### Practice 3: Diagnose `"The Vanishing Signup"`

A user complains: *"I registered my account, landed on my dashboard, and it told me `user not found`. When I clicked Refresh, my profile appeared."* Signup writes the row on the Primary and replies `201 Created`; the dashboard immediately calls `GET /me`, which Engineering recently "optimized" to hit a read replica. What caused this, and what are two valid fixes?

<details><summary><strong>Answer</strong></summary>

A classic **Read-Your-Writes** violation. `GET /me` hit an asynchronous replica that had not yet replayed the signup WAL record, so the replica truthfully answered `user not found` until catching up seconds later before the refresh. The replica behaved correctly for an eventually consistent store; the bug was sending an immediately post-write read without session freshness awareness.

**Two Clean Fixes:**
1. **Route `GET /me` (post-auth/signup reads) to Primary**—decide routing per operation rather than sending all HTTP `GET` traffic blindly to replicas.
2. **Track the Signup Write LSN in the Session:** Store `pg_current_wal_lsn()` in the session token/cookie upon `POST /signup` and read replicas only once `pg_last_wal_replay_lsn() >= session_lsn` (falling back to Primary otherwise, or using a simple `N`-second primary-pinning window after writes).

</details>

---

## Design Project Exercise

Design the end-to-end consistency strategy for **seat selection** in a concert-ticketing platform across four user actions:
1. Users **browse** a live interactive stadium seat map.
2. Users see a banner showing **"12 seats left in this section"**.
3. Users **place a temporary 8-minute hold** on specific seats at checkout.
4. Users **complete purchase** (`POST /checkout`).

For each of the four steps, specify: **(a)** the chosen consistency model, **(b)** how much staleness can safely be tolerated, and **(c)** exactly what visible user bug occurs if you pick too weak a model on the strict operations. *(No pre-written solution is provided—design this yourself. Hint: the bright dividing line between strong and eventual consistency sits at the **claim**, not the **browse**.)*

---

## Operational Validation Checkpoints (Scenario Quizzes)

<details>
<summary><strong>Checkpoint 1: Monotonic Reads & Flickering Balances</strong></summary>

**Scenario:** A banking app scales horizontally using 3 asynchronous read replicas (`Replica A`: 20ms lag, `Replica B`: 900ms lag, `Replica C`: 15ms lag). A customer receives a paycheck deposit, opens their dashboard, sees `$3,500`, refreshes 1 second later, and sees `$1,200`, causing panic. What exact session guarantee failed, and how do two complementary fixes eliminate it?

<strong>Answer:</strong>
**Monotonic Reads** failed: the first `GET /balance` landed on fast `Replica A` (seeing the deposit), while the second `GET /balance` round-robined onto lagging `Replica B` (rolling their perceived state backwards in time!).
- **Fix 1 (Authoritative Per-Operation Rule):** Financial account balances shouldn't hit async replicas at all unless zero-lag is enforced—read balances from Primary (**Linearizable**).
- **Fix 2 (Sticky Session / LSN High-Watermark):** For non-ledger screens where replica scale is kept, store `max_seen_lsn` in the user session or consistently pin `user_id` to the same replica shard so their timeline only ever moves forward.
</details>

<details>
<summary><strong>Checkpoint 2: Causal Ordering in Nested Comment Trees</strong></summary>

**Scenario:** A discussion forum uses an eventually consistent multi-region store for speed. Alice in New York posts *"Wait, is Friday's exam canceled?"* Bob in London immediately sees it and posts a reply *"No, Professor Smith confirmed it's still at 9 AM!"* Because network propagation delays Alice's original write to Frankfurt replicas, Carol in Berlin briefly sees Bob's reply `"No..."` attached to a nonexistent/broken parent post! Why didn't linearizability or eventual consistency fit naturally, and which model solves it cleanly?

<strong>Answer:</strong>
- **Eventual consistency** fails because Bob's reply is **causally dependent** on Alice's post arriving first, yet replicas applied them out of order.
- **Linearizability** solves it *but pays unnecessary global coordination tax*—Carol doesn't care about global millisecond timestamps on unrelated posts in Japan, she only needs **cause (Alice's post)** to appear before **effect (Bob's reply)**.
- **Causal Consistency** is the exact sweet spot: attach Alice's logical timestamp / parent version vector ID to Bob's reply, and instruct replicas not to surface the reply until all causal dependencies (`parent_version`) have materialized locally.
</details>

<details>
<summary><strong>Checkpoint 3: Distinguishing Linearizability vs. Serializability in Bank Transfers</strong></summary>

**Scenario:** A distributed SQL database commits an atomic transfer transferring `$100` from Account A to Account B in a single transaction, ensuring nobody ever reads half a transfer (`$100` missing from both accounts). Later, someone calls `SELECT balance FROM B` on a stale asynchronous replica immediately after commit and briefly observes the *pre-transfer* balance before catching up 50ms later. Which guarantee held and which did not?

<strong>Answer:</strong>
**Serializability (Transaction Isolation)** held—if any query observes the transaction, it sees both debit and credit atomically (never a split intermediate state where money vanished). However, **Linearizability (Real-time single-copy recency)** did *not* hold on that stale replica read, because a read occurring chronologically after commit observed an outdated snapshot. Combining both simultaneously defines **Strict Serializability**.
</details>

---

## Interview Practice Questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system), and **Tricky** (deep follow-ups). Answer out loud before opening the solution.

<details>
<summary><strong>1. Linearizability vs eventual consistency? (Basic)</strong></summary>

<strong>What a strong answer covers:</strong>
**Linearizability** guarantees every read sees the most recently completed global write in real time, acting as a single copy. **Eventual consistency** only promises replicas will converge once writes stop, permitting stale or out-of-order reads temporarily in exchange for low latency and high availability.
</details>

<details>
<summary><strong>2. What is causal consistency? (Basic)</strong></summary>

<strong>What a strong answer covers:</strong>
Any operations linked by a cause-and-effect chain (e.g., posting a thread and replying to it) are observed in causal order by every reader globally, whereas concurrent unrelated writes may appear in different orders across different replicas.
</details>

<details>
<summary><strong>3. How do you provide read-your-writes on replicas? (Basic)</strong></summary>

<strong>What a strong answer covers:</strong>
Either route the author's own reads directly to the Primary for a short time window post-write (`5–10s`), or store the author's last committed WAL LSN/version in session state and only query replicas whose `pg_last_wal_replay_lsn()` has caught up past it.
</details>

<details>
<summary><strong>4. Comments sometimes appear before the post they reply to. Which model fixes it? (Scenario)</strong></summary>

<strong>What a strong answer covers:</strong>
**Causal consistency:** record the causal dependency (parent post's logical version / Lamport clock / vector version) inside the reply metadata, and withhold displaying or delivering the reply on any replica until that parent version is locally committed.
</details>

<details>
<summary><strong>5. A user's balance flickers between two values on refresh. Why, and how do you fix it? (Scenario)</strong></summary>

<strong>What a strong answer covers:</strong>
Repeated refreshes load-balanced across asynchronous replicas hit nodes with differing replication lag—violating **monotonic reads**. Fix it either by pinning the user session to one replica / enforcing monotonic LSN watermarks, or—for sensitive balances—always reading directly from Primary.
</details>

<details>
<summary><strong>6. Which consistency model for a like counter, and for a seat reservation? (Scenario)</strong></summary>

<strong>What a strong answer covers:</strong>
**Like counter: Eventual consistency** (being off by a few likes briefly costs nothing and maximizes scale). **Seat reservation: Linearizable (Strong)**—two concurrent buyers must never reserve the exact same physical seat.
</details>

<details>
<summary><strong>7. Does eventual consistency mean data can be lost? (Tricky)</strong></summary>

<strong>What a strong answer covers:</strong>
**No.** Consistency governs *when replicas agree on reads*; durability governs *whether committed bytes survive hardware loss*. An eventually consistent system can still be highly durable once writes flush synchronously to multi-AZ disks/quorums—other replicas merely converge behind asynchronously.
</details>

<details>
<summary><strong>8. Is linearizable the same as serializable? (Tricky)</strong></summary>

<strong>What a strong answer covers:</strong>
**No.** Linearizability guarantees real-time wall-clock recency on single-object reads/writes. Serializability guarantees multi-object transactions execute equivalently to some serial order without anomalies (preventing lost updates or write skew). Offering both simultaneously is **Strict Serializability**.
</details>

---

## Common Mistakes & Troubleshooting

- **Treating consistency as a binary "strong vs weak" toggle:** Place every operation deliberately on the spectrum.
- **Serving fresh edits off eventually consistent replicas without session protection:** Users perceive vanishing saves as severe data-loss bugs.
- **Round-robin load balancing user reads across un-tracked lagging replicas:** Breaks monotonic reads cleanly whenever lags diverge.
- **Paying for linearizable consensus on likes, feeds, or star averages:** Wastes cross-node RTT where causal or eventual suffices.
- **Applying one consistency level to an entire microservice:** Separate *browse* (eventual), *threads* (causal), and *claims/payments* (linearizable) explicitly.

---

## Further Reading & Sources

- [Jepsen: Consistency Models](https://jepsen.io/consistency) — Precise formal taxonomy mapping strict serializable and linearizable guarantees down to session guarantees.
- [Designing Data-Intensive Applications (Martin Kleppmann)](https://dataintensive.net/) — Deep treatment of replication lag, read-your-writes, monotonic reads, causal dependencies, and linearizability vs. serializability.
- [PostgreSQL: System administration functions](https://www.postgresql.org/docs/current/functions-admin.html) — Reference documentation for `pg_current_wal_lsn`, `pg_last_wal_replay_lsn`, and `pg_wal_replay_pause` used in the code and lab above.

---

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-A-015.pdf](https://backendroadmap.com/notes/system-design/SD-A-015.pdf). All Phase 1 notes in one file: [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf).

---

## Next

Continue with [Lesson 16: Fault Tolerance](../16-fault-tolerance/README.md) to explore how systems detect partial failures, shed overload, isolate blast radii, and survive entire zones dropping off the network.
