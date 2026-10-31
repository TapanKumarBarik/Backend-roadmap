# 07 - Data Migration and Connection Resilience

## Why this matters

Modules 03-06 gave you two homes for a database and a framework for
choosing between them — but a decision on paper is worthless if you can't
actually *move* the data from one to the other, and an app that can't
survive the failover windows you measured in module 03 will page you every
time a primary moves. This module closes both gaps: migrating data between
self-hosted and managed Postgres, and the client-side resilience —
retry/backoff and connection pooling — that turns a database blip into a
sub-second hiccup instead of an outage. This is the difference between "the
database is highly available" and "the *application* is highly available,"
which are not the same thing.

## Concepts

### Migrating data between the two models

Moving between self-hosted-on-Kubernetes (modules 03-04) and Azure Flexible
Server (module 05) is, mechanically, the logical-backup workflow from
module 04 pointed at a different target — this is *why* module 04 stressed
that logical dumps are **portable** across versions and clusters:

- **Small / one-shot: dump and restore.** `pg_dump -Fc` from the source,
  `pg_restore` into the target. Simple, works in both directions
  (self-hosted → managed and back), and the same `.dump` artifact you
  already made in module 04. The cost is **downtime**: the app is stopped
  (or read-only) from the moment you dump until the restore is verified,
  because anything written to the source after the dump is lost.
- **Large / low-downtime: logical replication.** Postgres publishes changes
  from the source and the target *subscribes*, continuously replaying them
  until the two are caught up; you then cut over during a tiny window. This
  is how you migrate a live, busy database with seconds of downtime instead
  of hours. Azure Database Migration Service wraps this for managed targets.

The direction matters less than you'd think — the same tools move data
*to* managed (adopting Flexible Server) and *from* managed (repatriating to
self-hosted, e.g. after a module-06 decision flips at scale). The
portability of a logical dump is exactly what keeps you from being locked
in.

### The cutover is the risky part, not the copy

Copying data is the easy 90%. The dangerous 10% is the **cutover**: the
moment you repoint the app from the old database to the new one. Get it
wrong and you either lose writes (app still writing to the old DB after you
migrated) or get split data (both DBs taking writes). The discipline, same
spirit as module 04's tested-restore:

1. Freeze writes to the source (read-only, or stop the app).
2. Let replication drain / take a final dump.
3. **Verify row counts and a checksum on the target** before trusting it.
4. Repoint the app's connection (a config/Secret change, or a DNS/Service
   change) to the new database.
5. Keep the old database intact but read-only for a rollback window before
   deleting it.

Never delete the source until the target has served real traffic
successfully. A migration isn't done at "data copied" — it's done at "app
verified on the new database and rollback window elapsed."

### Connection resilience: retry with exponential backoff and jitter

In module 03 you *measured* the failover window — the seconds where
`pg-rw` briefly has no primary. During that window, an app's connections
fail. A resilient client doesn't crash or surface an error to the user; it
**retries with exponential backoff and jitter**:

- **Retry** the failed connection/query rather than failing the request
  immediately — most failover windows are seconds.
- **Exponential backoff** — wait 1s, 2s, 4s, 8s… between attempts, so you
  don't hammer a recovering database with a thundering herd.
- **Jitter** — add randomness to each wait so thousands of clients don't
  retry in lockstep and synchronize into repeated spikes (the thundering
  herd again, at scale).
- **A cap and a deadline** — max backoff (e.g. 30s) and a total timeout, so
  a genuinely-down database eventually surfaces an error instead of
  retrying forever.
- **Distinguish retryable from fatal** — a failover/timeout is retryable; a
  syntax error or auth failure is not, and retrying it just wastes time.

This is the same resilience pattern used for any remote dependency, applied
to the database connection specifically — and it's what makes module 03's
"few-second failover" invisible to users.

### Connection pooling: why raw connections don't scale

Every Postgres connection is a real server-side process with real memory
overhead. Postgres handles a *few hundred* connections well, not thousands.
But a fleet of app Pods, each opening many connections (and each Pod's
framework often keeping its own pool), easily blows past that — and when
the limit is hit, *new connections are refused* and the app falls over
under load even though the queries themselves are cheap. A **connection
pool** sits between the app and Postgres and multiplexes many short-lived
client connections onto a small number of long-lived server connections.

### PgBouncer and pool modes

**PgBouncer** is the standard lightweight Postgres connection pooler. You
point your apps at PgBouncer instead of at Postgres directly; PgBouncer
maintains a small pool of real connections to the database and hands them
out. Its pool *modes* trade efficiency against feature support:

- **Session pooling** — a server connection is tied to a client for the
  whole session. Safest (all features work), least efficient.
- **Transaction pooling** — a server connection is returned to the pool
  after each *transaction*. Far more efficient (the common production
  choice) but breaks session-level features (prepared statements across
  transactions, `SET`, advisory locks) unless the app is written for it.
- **Statement pooling** — returned after each statement; most aggressive,
  most restrictive.

On the managed side, Azure Flexible Server offers **built-in PgBouncer** as
a toggle — the same tool, run for you, consistent with module 05's "managed
does the operational work" theme. Self-hosted, you run PgBouncer as its own
Deployment (often as a sidecar or a shared service) in front of your CNPG
cluster. Either way, the app connects to the pooler, and the pooler
protects the database from connection exhaustion — the failure you'll
reproduce and fix below.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `pg_dump -Fc` | Logical dump for migration (portable, module 04) | `pg_dump -Fc "$SRC" > db.dump` |
| `pg_restore --clean --if-exists -d` | Restores a dump into the target DB | `pg_restore --clean --if-exists -d "$DST" db.dump` |
| `psql -c "CREATE PUBLICATION ..."` | Sets up logical replication on the source | `psql "$SRC" -c "CREATE PUBLICATION mig FOR ALL TABLES;"` |
| `psql -c "CREATE SUBSCRIPTION ..."` | Subscribes the target to the source (low-downtime) | see exercises |
| `SHOW max_connections;` | Postgres's hard connection ceiling | `psql -c "SHOW max_connections;"` |
| `SELECT count(*) FROM pg_stat_activity;` | Current open connections (watch it approach the ceiling) | `psql -c "SELECT count(*) FROM pg_stat_activity;"` |
| `az postgres flexible-server parameter set` | Enables built-in PgBouncer on Flexible Server | `... --name pgbouncer.enabled --value true` |
| `kubectl apply -f pgbouncer.yaml` | Deploys a self-hosted PgBouncer pooler | see exercises |

Flag breakdown — `pg_restore --clean --if-exists -d "$DST" db.dump`:
- `--clean` — drop existing objects before recreating them (so a re-run is
  idempotent), rather than erroring on conflicts.
- `--if-exists` — don't error when a `--clean` drop targets something that
  isn't there (safe on a fresh target).
- `-d "$DST"` — the target connection string (the *new* database you're
  migrating into).

Flag breakdown — PgBouncer transaction-mode config:
- `pool_mode = transaction` — return the server connection to the pool
  after each transaction (efficient; the common production choice).
- `max_client_conn` — how many *client* connections PgBouncer accepts
  (large — this is what the app fleet sees).
- `default_pool_size` — how many *server* connections PgBouncer opens to
  Postgres per user/db (small — this is what protects Postgres).

## Hands-on exercises

Build on the module 03 CNPG cluster (self-hosted) and, where marked, the
module 05 Flexible Server (managed). Namespace `db`.

```bash
kubectl config set-context --current --namespace=db
PW=$(kubectl get secret pg-app -o jsonpath='{.data.password}' | base64 -d)
SRC="postgresql://app:$PW@pg-rw.db.svc.cluster.local/app"
```

### 1. Seed a migration source

```bash
kubectl run seed --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "CREATE TABLE orders(id serial primary key, item text, qty int); \
  INSERT INTO orders(item,qty) SELECT 'item-'||g, g FROM generate_series(1,1000) g;"
kubectl run seed --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT count(*) FROM orders;"
```

Expected: 1000 rows — a known dataset you'll verify after migrating.

### 2. Migrate self-hosted → managed with dump/restore (Azure)

Dump from the CNPG cluster, restore into Flexible Server (module 05's
`$DST`). Get a managed connection string/token as in module 05:

```bash
# from a client pod that can reach both:
kubectl run mig --image=postgres:16 --restart=Never -- sleep 600
kubectl exec mig -- sh -c "pg_dump -Fc '$SRC' > /tmp/orders.dump"
# DST built from the Flexible Server FQDN + Entra token (module 05 ex 4)
kubectl exec mig -- sh -c "pg_restore --clean --if-exists -d '<DST>' /tmp/orders.dump"
kubectl exec mig -- psql "<DST>" -c "SELECT count(*) FROM orders;"
kubectl delete pod mig
```

Expected: 1000 rows on the managed target — the same portable `.dump`
workflow from module 04, now used to *migrate* rather than restore. On kind
(no managed target), migrate between two CNPG clusters instead to practice
the mechanics.

### 3. Verify the migration before trusting it

Never cut over on "it restored." Compare both sides:

```bash
echo "source:"; kubectl run v --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT count(*), sum(qty), md5(string_agg(item,',' ORDER BY id)) FROM orders;"
echo "target:"; kubectl run v --rm -it --image=postgres:16 --restart=Never -- \
  psql "<DST>" -c "SELECT count(*), sum(qty), md5(string_agg(item,',' ORDER BY id)) FROM orders;"
```

Expected: identical count, sum, and checksum on both. If they differ, the
migration is *not* done — this verification step is the module-04
tested-restore discipline applied to cutover.

### 4. Low-downtime migration with logical replication (shape)

Set up a publication on the source and a subscription on the target so new
writes flow continuously:

```bash
kubectl run pub --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "CREATE PUBLICATION mig FOR ALL TABLES;"
# On the target:
#   CREATE SUBSCRIPTION mig CONNECTION '<SRC-reachable-from-target>' PUBLICATION mig;
```

Expected: writes to the source `orders` table replicate to the target
automatically. Insert a new row on the source and confirm it appears on the
target — proving you could cut over with only a brief final-drain window
instead of a long dump/restore outage. (Flexible Server supports being a
logical-replication subscriber; on kind, use two CNPG clusters.)

### 5. Add retry/backoff to an app connection

Deploy a tiny app that connects in a loop *without* resilience, then break
it with a failover:

```python
# resilient.py — mount into a python pod, or inline via a ConfigMap
import os, time, random, sys
import psycopg  # pip install psycopg[binary]

def connect_with_retry(dsn, attempts=8):
    delay = 1.0
    for i in range(attempts):
        try:
            return psycopg.connect(dsn, connect_timeout=3)
        except psycopg.OperationalError as e:   # retryable: failover/timeout
            wait = min(delay, 30) + random.uniform(0, 0.5)   # backoff + jitter
            print(f"attempt {i+1} failed ({e}); retrying in {wait:.1f}s", flush=True)
            time.sleep(wait)
            delay *= 2
    raise SystemExit("database unreachable after retries")

dsn = os.environ["DSN"]
while True:
    conn = connect_with_retry(dsn)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM orders;")
        print("rows:", cur.fetchone()[0], flush=True)
    conn.close()
    time.sleep(2)
```

Run it against `pg-rw`, then trigger a failover (module 03 exercise 5) by
deleting the primary Pod and watch the output.

Expected: during the failover window the app prints `attempt N failed …
retrying`, then resumes printing `rows: 1000` once `pg-rw` repoints —
**the failover is invisible except for a brief pause.** That's application
HA, built on top of the database HA from module 03.

### 6. Diagnose-and-fix: connection pool exhaustion under load

Reproduce the failure a pool prevents. Lower the DB's connection ceiling to
make it easy to hit, then hammer it:

```bash
# See the ceiling and current usage
kubectl run c --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SHOW max_connections;"
# Generate many concurrent connections (each sleeps holding a connection)
for i in $(seq 1 200); do
  kubectl run load-$i --image=postgres:16 --restart=Never -- \
    psql "$SRC" -c "SELECT pg_sleep(60);" >/dev/null 2>&1 &
done
```

Now try one more connection:

```bash
kubectl run probe --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT 1;"
```

Expected failure: `FATAL: sorry, too many clients already` (or
`remaining connection slots are reserved`) — the database refused a new
connection because the pool of server processes is exhausted, *not* because
queries were slow. Diagnose:

```bash
kubectl run c --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

Expected: connection count pinned at `max_connections`, mostly idle/sleeping
— proof it's a *connection* limit, not a compute limit. **Fix: put a pooler
in front.** Deploy PgBouncer in transaction mode so hundreds of clients
share a handful of server connections:

```yaml
# pgbouncer-config (essentials)
# pool_mode = transaction
# max_client_conn = 1000
# default_pool_size = 20
```

Point the app (and the load) at PgBouncer instead of `pg-rw`, repeat the
load, and confirm the probe now succeeds — 200 clients multiplex onto ~20
server connections, so Postgres never sees the flood. (On Flexible Server,
instead just enable built-in PgBouncer:
`az postgres flexible-server parameter set --name pgbouncer.enabled --value true`
and point the app at the PgBouncer port.) Clean up the load Pods:
`kubectl delete pod -l run --field-selector=status.phase!=Running 2>/dev/null; for i in $(seq 1 200); do kubectl delete pod load-$i --ignore-not-found >/dev/null 2>&1 & done`.

Lesson: connection exhaustion looks like a database outage but is a
client-architecture problem — pooling, not a bigger database, is the fix.

### 7. Prove the pool protects the database under a fleet

With PgBouncer in place, re-run the 200-client load and watch
`pg_stat_activity` on the *database*:

```bash
kubectl run c --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT count(*) FROM pg_stat_activity WHERE datname='app';"
```

Expected: server-side connections stay small (≈ `default_pool_size`) even
under hundreds of clients — the pooler absorbed the fan-out. This is why a
pooler is standard in front of any Postgres serving a Pod fleet.

### 8. Diagnose-and-fix: a migration cutover that lost writes

Reproduce the classic cutover mistake. Migrate `orders` (dump/restore),
but *don't* freeze writes on the source first — insert a new row on the
source *after* the dump, then cut the app over to the target:

```bash
# after dump/restore of 1000 rows, before cutover, a write sneaks into the source:
kubectl run late --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "INSERT INTO orders(item,qty) VALUES('LATE-ORDER',999);"
# now the app is pointed at the target, which never got this row
kubectl run chk --rm -it --image=postgres:16 --restart=Never -- \
  psql "<DST>" -c "SELECT * FROM orders WHERE item='LATE-ORDER';"
```

Expected: the `LATE-ORDER` row is **missing** on the target — a lost write,
because the source kept taking writes after the point-in-time the dump
captured. Diagnose with the verification from exercise 3 (counts now
differ). **Fix:** the migration procedure must freeze writes (read-only or
stop the app) *before* the final dump, or use logical replication
(exercise 4) to drain in-flight writes, then verify counts match *before*
repointing the app. Redo the cutover correctly and confirm counts match.
Lesson: the copy is easy; the *cutover discipline* is what prevents data
loss — exactly the module-04 lesson that "it copied" isn't "it's correct."

### 9. Clean up

```bash
kubectl delete pod -l run --ignore-not-found 2>/dev/null || true
# remove PgBouncer, publications/subscriptions, and any load pods
kubectl delete cluster pg --ignore-not-found       # if done with self-hosted
kubectl delete pvc -l cnpg.io/cluster=pg --ignore-not-found
# az postgres flexible-server delete -g rg-mgdb-lab -n <name> --yes   # stop managed bill
# az disk list -g <node-rg> -o table                                  # confirm no orphans
```

Expected: no lingering load Pods, clusters, Flexible Servers, or disks.
Both a migration *source* and *target* running at once is double the bill —
delete the one you're no longer using once the cutover is verified.

## Independent challenge

No full app or config given. Perform a complete, verified, low-downtime
migration of a *live* database from one model to the other and prove the
application survived it. Start the module-03 CNPG cluster serving the
retry/backoff app from exercise 5 under a trickle of continuous writes.
Migrate that database to a Terraform-provisioned Flexible Server (module 05)
using logical replication so writes keep flowing during the copy, verify the
target matches the source with a row-count *and* checksum comparison, then
cut the running app over to the managed database — repointing its connection
with the app still up — and demonstrate, from the app's own output, that no
writes were lost and the user-visible interruption was seconds, not
minutes. Keep the old database read-only as a rollback path until you've
confirmed the app is healthy on the target. This integrates module 04's
logical-dump portability, module 05's managed target and passwordless
connection, module 03's failover-window reality, and this module's cutover
discipline and retry logic — it is a rehearsal for the capstone's two-path
requirement.

<details>
<summary>Stuck? One hint</summary>

The low-downtime shape is: (1) set up logical replication (publication on
source, subscription on target) so the target continuously catches up while
the app keeps writing to the source; (2) when replication lag is ~zero,
briefly set the source read-only, let the last changes drain, and run the
count+checksum verification from exercise 3; (3) only then repoint the app's
`DSN` (a Secret/ConfigMap change and Pod restart, or a Service swap) at the
managed target — the retry/backoff loop from exercise 5 absorbs the
reconnect so the user sees a pause, not an error. Do *not* delete or write
to the source until the app has served real traffic on the target; that
read-only source is your rollback.

</details>

## Common mistakes & troubleshooting

- **Treating "data copied" as "migration done."** The copy is the easy
  part; the cutover is where writes get lost or split (exercise 8). Freeze
  writes or drain via replication, verify counts+checksum, *then* repoint —
  and keep the source as a rollback until the target is proven.
- **Deleting the source too early.** Until the app has served real traffic
  on the target and a rollback window has elapsed, the old database is your
  safety net. Deleting it at "copied" turns a recoverable hiccup into an
  unrecoverable one.
- **No retry/backoff in the app.** Without it, every module-03 failover
  window surfaces as user-facing errors. With exponential backoff + jitter
  + a cap, the same failover is an invisible pause — but retrying
  *non-retryable* errors (syntax, auth) just wastes time; distinguish them.
- **Retrying in lockstep (thundering herd).** Fixed-interval retries across
  a fleet synchronize into repeated spikes that keep knocking a recovering
  database over. Jitter is not optional at scale.
- **Connecting a Pod fleet straight to Postgres.** Hundreds of Pods ×
  per-Pod pools blow past `max_connections`, and Postgres *refuses* new
  connections (`too many clients already`) — an outage that looks like a DB
  failure but is a client-architecture problem. Put PgBouncer in front.
- **Wrong PgBouncer pool mode.** Transaction mode is efficient but breaks
  session-level features (cross-transaction prepared statements, `SET`,
  advisory locks) unless the app expects it. Match the mode to what the app
  actually uses, or you'll get subtle, intermittent breakage.
- **Cost pitfall — running both databases indefinitely.** During a
  migration you pay for *both* the source and the target. That's fine
  briefly; forgetting to delete the retired one after cutover is a doubled
  bill — and if the retired one is self-hosted, its `Retain`ed Azure Disks
  orphan just like module 02 warned (`az disk list`).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Which module-04 property of logical dumps is what makes them the tool
   for migrating *between* self-hosted and managed, and why?
2. What's the trade-off between dump/restore migration and logical-
   replication migration?
3. Walk through the safe cutover procedure. Why can't you delete the source
   the moment the data is copied?
4. Name the three ingredients of a resilient connection-retry strategy and
   what each one prevents.
5. Why does retrying a query without jitter make a recovering database's
   life *worse* at scale?
6. In exercise 6, the database refused new connections even though queries
   were cheap. What was actually exhausted, and what's the fix — a bigger
   database or something else?
7. What does PgBouncer's transaction pool mode buy you, and what does it
   break?
8. In exercise 8, a write was lost during cutover. What in the procedure
   was skipped, and what are the two ways to prevent it?

<details>
<summary>Show answers</summary>

1. Portability — a logical dump is engine-level SQL/archive output that
   restores across versions and clusters, so it moves data both *to* and
   *from* managed Postgres. A physical/volume backup (module 04) is tied to
   the specific storage and can't cross into a managed service you don't
   control the disks of.
2. Dump/restore is simple but requires downtime (writes after the dump are
   lost, so the app is stopped/read-only for the whole copy+verify).
   Logical replication continuously streams changes so the app stays up,
   cutting downtime to a brief final-drain window — at the cost of more
   setup complexity.
3. Freeze writes on the source (read-only or stop the app) or drain via
   replication; take the final dump / let replication catch up; verify
   count+checksum on the target; repoint the app; keep the source read-only
   as rollback; delete it only after the app is proven on the target. You
   can't delete the source at "copied" because it's your only rollback if
   the target turns out wrong.
4. Retry (survive transient failover windows), exponential backoff (avoid
   hammering a recovering DB), and jitter (avoid a synchronized thundering
   herd) — plus a cap/deadline so a truly-down DB eventually errors instead
   of retrying forever.
5. Without jitter, thousands of clients retry at the same intervals and
   synchronize into repeated simultaneous spikes that keep overwhelming the
   database just as it recovers — the thundering-herd effect; randomized
   waits spread the load out.
6. The pool of server-side connections (`max_connections`) was exhausted —
   a connection limit, not compute. The fix is a connection pooler
   (PgBouncer) multiplexing many clients onto few server connections, not a
   bigger database.
7. Transaction mode returns a server connection to the pool after each
   transaction, so a few server connections serve many clients (high
   efficiency). It breaks session-level features that span transactions —
   cross-transaction prepared statements, `SET`, advisory locks — unless
   the app is written for it.
8. Writes weren't frozen on the source before the final dump, so a write
   after the dump's point-in-time was lost. Prevent it by (a) making the
   source read-only / stopping the app before the final dump, or (b) using
   logical replication to drain in-flight writes — and in both cases verify
   counts match before repointing.

</details>

## Next

[08-capstone-project](../08-capstone-project/README.md) — you now have every
piece: run a database on Kubernetes with an operator, give it real Azure
storage, back it up and *test the restore*, provision a managed alternative,
choose between them deliberately, and migrate and connect resiliently. The
capstone makes you build both paths for one app and write the comparison
that only building both can earn you.
