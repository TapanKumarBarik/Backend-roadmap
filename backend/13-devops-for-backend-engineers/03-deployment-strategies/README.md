# Module 03: Deployment Strategies

## Why this matters

CI (module 02) produces a tested, SHA-tagged image. Now you have to replace the
*running* version with the new one — while real users are mid-request. Do it
naively (stop all old replicas, start all new ones) and every deploy is a visible
outage: dropped requests, 502s, a few seconds where the service is simply down.
Do it well and users never notice; you ship ten times a day and nobody files a
ticket.

The strategies that make deploys invisible — **rolling, blue/green, canary** — are
usually described as platform features, and operationally they are (the deep
mechanics are `learn/03-kubernetes` and `learn/10-cicd-and-gitops`). But every one
of them makes *demands on your backend code* that no platform can satisfy for you.
A rolling deploy runs the old and new versions **simultaneously** for a minute or
two — so your API changes must be backward-compatible and your database schema
must work for both versions at once. A canary sends 5% of traffic to the new
version — so both versions must tolerate the same requests. In-flight requests
must survive a replica being replaced — which is the graceful-shutdown work from
track 08 module 09 and module 01 here, now load-bearing.

This module is about the backend engineer's responsibilities during a deploy: what
each strategy means *for your code*, why "old and new run at once" is the fact that
governs everything, and how to make API and schema changes that survive it. The
orchestration — how Kubernetes sequences a rolling update, how you wire a
blue/green service switch, how a canary controller splits traffic — is `learn/`
territory, cross-referenced throughout.

## Concepts

### The three strategies, and the one fact underneath all of them

- **Rolling deployment** — replace replicas **incrementally**: bring up one (or a
  few) new-version replicas, wait until they're ready, retire the same number of
  old ones, repeat until all are new. At every moment during the rollout, some
  old and some new replicas are serving traffic *at the same time*. The default in
  Kubernetes. Cheap (no extra capacity beyond a small surge), gradual, and
  self-throttling on readiness — but it means **mixed versions run concurrently**.
- **Blue/green** — stand up a *complete* second environment (green) running the
  new version alongside the current one (blue), test green, then flip all traffic
  from blue to green at once (a load-balancer/router switch). Rollback is
  instant (flip back to blue). Costs double capacity during the switch, and the
  cutover is atomic — but for a *brief* window both are live, and any shared
  database is used by both.
- **Canary** — release the new version to a **small slice of traffic** (say 5%),
  watch its error rate and latency, and progressively increase to 100% if it's
  healthy (or abort if not). The safest for risky changes because blast radius is
  bounded — but by definition old and new serve real traffic side by side for the
  whole ramp.

The single fact that unifies them, and that your code must respect: **during a
deploy, two versions of your application run at the same time against the same
data.** Rolling makes this last minutes, canary makes it last as long as the ramp,
blue/green makes it a short window — but none of them can atomically swap every
replica *and* the database in one instant. Everything else in this module follows
from accepting that two versions coexist.

```
 mid-rollout (rolling / canary): old and new serve real traffic at once
                         ┌──────────────┐
        clients ───────►│ load balancer│
                         └──────┬───────┘
              ┌────────────┬────┴───┬────────────┐
              ▼            ▼        ▼            ▼
          ┌───────┐   ┌───────┐ ┌───────┐   ┌───────┐
          │ v1 old│   │ v1 old│ │ v2 NEW│   │ v2 NEW│   (readiness-gated)
          └───┬───┘   └───┬───┘ └───┬───┘   └───┬───┘
              └───────────┴────┬────┴───────────┘
                               ▼
                     ┌───────────────────┐
                     │ ONE shared database│  ← schema must fit v1 AND v2
                     └───────────────────┘
```

### Surviving the rollout: in-flight requests and graceful shutdown

When a rolling deploy (or any strategy) retires an old replica, that replica may
be in the middle of serving requests. If the platform just kills it, those
requests get dropped — connection reset, 502, a failed payment. Making them
survive is entirely the app's job, and it's the graceful-shutdown protocol from
module 01 / track 08 module 09:

1. The platform sends **SIGTERM** to the replica it's retiring.
2. The app **fails its readiness probe** (module 06) so the load balancer stops
   routing *new* requests to it — but keeps the ones already in flight.
3. The app lets in-flight requests **finish** (drain), closes DB/Redis pools, and
   exits before the grace period ends.
4. Meanwhile the new replica only receives traffic *after* its own readiness probe
   passes — so there's never a gap where a not-yet-ready replica gets requests.

This is why exec-form `CMD` (module 00), the `lifespan` drain (module 01), and
correct readiness probes (module 06) are all deployment concerns, not just tidy
housekeeping. Without them, *every* deploy — rolling, blue/green, or canary —
drops a fraction of requests at the moment replicas turn over. With them, the
turnover is invisible. There's also a subtle race — a replica can receive one last
request in the moment between SIGTERM and the LB noticing it's unready — which is
why a short pre-stop delay before draining is a common belt-and-suspenders
(module 06 covers it).

### Backward-compatible API changes (because old and new coexist)

Since two versions serve traffic simultaneously, **the new version's API must not
break the old version's clients or its own in-flight requests** during the
overlap. Concretely, a single deploy must never make a *breaking* API change.
Breaking changes include: removing or renaming a field a client sends or reads,
making a previously-optional request field required, changing a field's type,
removing an endpoint, or tightening validation to reject inputs that used to be
accepted.

The rule is **expand, then contract**, spread across *separate* deploys:

- To **rename** a field `name` → `full_name`: deploy 1 adds `full_name` while still
  accepting/returning `name` (both work). Once all clients and replicas use
  `full_name`, deploy 2 removes `name`.
- To **make a field required**: deploy 1 accepts it optionally and defaults it;
  only after every client sends it does a later deploy require it.
- To **remove an endpoint**: deprecate it (still serve it) for a release, migrate
  callers, then remove it.

This is the same expand/contract shape as database migrations (module 04) — and
it's not a coincidence: both come from the same constraint that two versions
coexist. Track 01's HTTP/versioning material and track 02's API-design material
are the foundation here; the deployment lens just makes backward compatibility a
*hard requirement of every rollout*, not a nicety. Additive changes (new optional
field, new endpoint) are always safe; anything that removes or tightens must be
split across deploys.

### Database migrations during a rolling deploy: the ordering problem

The hardest part of "two versions at once" is the database, because there's only
*one* database and both app versions use it. If deploy N+1 needs a new column, when
do you add it — before, during, or after the app rollout? Get the ordering wrong
and either the old version breaks (a migration removed something it still needs) or
the new version breaks (it needs a column that isn't there yet).

The governing rule: **the schema must be compatible with *both* the old and the
new app version at every instant of the rollout.** That forces migrations to be
**backward-compatible and additive-first**, applied in a specific order relative
to the code:

- **Adding** a column/table (nullable or defaulted): run the migration **before**
  the new code deploys. The old code ignores the new column; the new code uses it.
  Both are happy. ✅
- **Removing** a column: you must **not** drop it until *no running version*
  references it. So: deploy new code that stops using the column *first*, let the
  old version fully roll out, and only *then*, in a later deploy, drop the column.
  Dropping it while old replicas still read it breaks them. ✅
- **Renaming / changing a type**: never in one step — it's an expand/contract
  sequence (add new column, backfill, dual-write, switch reads, drop old),
  exactly module 04's subject.

The short version for this module: **additive migrations go before the code that
needs them; destructive migrations go after every version that used the thing is
gone — never in the same deploy as the code change that motivates them.** Module 04
is the full treatment (expand/contract, backfills, dual-writes, zero-downtime);
here the goal is to internalize *why* migration ordering is inseparable from
deployment strategy: because the rollout period is exactly when schema and code are
out of lockstep.

### Rollback: the property that makes fast deploys safe

The reason you can deploy confidently and often is that you can **undo** quickly
when something's wrong. Each strategy has its rollback:

- **Rolling:** redeploy the previous SHA-tagged image (module 02's tagging is what
  makes "the previous known-good image" a concrete, addressable thing) — itself a
  rolling deploy back to the old version.
- **Blue/green:** flip the router back to blue. Near-instant, which is blue/green's
  main selling point.
- **Canary:** abort the ramp and shift 100% back to the stable version.

But rollback of the *code* only works if the *data* can roll back with it — which
is precisely why destructive migrations are dangerous. If deploy N dropped a column
and you roll the code back to N-1, N-1 expects that column and now breaks. This is
the deployment-level payoff of expand/contract: because you never destroy
something the previous version needs *in the same deploy*, the code can always roll
back to the immediately previous version safely. **Migrations should be
forward-only and each individually backward-compatible**, so rollback is always a
code-only operation. Designing every change so it's independently rollbackable is
the discipline that makes frequent deployment safe rather than reckless.

## Command reference

| Strategy | How traffic moves | Rollback | Extra capacity | Backend demand |
|---|---|---|---|---|
| Rolling | Replicas swapped incrementally | Redeploy prev SHA | Small surge | Mixed versions concurrent; graceful drain |
| Blue/green | Router flips all at once | Flip back to blue | ~2× during switch | Both live briefly; shared DB compat |
| Canary | Small % → ramp to 100% | Shift % back to stable | Small (canary only) | Both serve real traffic through ramp |

Kubernetes rolling-update surge/unavailability knobs (the mechanics are
`learn/03-kubernetes`; this is the app-relevant contract):

```yaml
# Deployment strategy — one new replica up before an old one comes down
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1            # at most 1 extra replica above desired during rollout
      maxUnavailable: 0      # never drop below desired capacity — no capacity gap
  template:
    spec:
      terminationGracePeriodSeconds: 30   # time your app has to drain on SIGTERM
      containers:
        - name: app
          image: registry.example.com/myapp:git-<sha>   # module 02's immutable tag
          readinessProbe:                                # module 06 — gates traffic
            httpGet: { path: /readyz, port: 8000 }
```

Backward-compatible API change — expand then contract, across two deploys:

```python
# DEPLOY 1 (expand): accept and return BOTH the old and new field name.
class UserOut(BaseModel):
    full_name: str
    name: str | None = None          # legacy alias kept alive during the overlap

    @model_validator(mode="after")
    def mirror(self):
        self.name = self.name or self.full_name   # old clients still get `name`
        return self

# ...every client and replica migrated to `full_name`...

# DEPLOY 2 (contract): now safe to drop `name`, because nothing reads it anymore.
class UserOut(BaseModel):
    full_name: str
```

Migration ordering relative to code (the rule of this module; module 04 is the
depth):

```text
Additive change  (add nullable column):   migrate  BEFORE  new code   ✅ both versions fine
Destructive change (drop column):          migrate  AFTER   old code is fully gone   ✅
Rename / retype:                           expand → backfill → switch → contract (module 04)
Rollback of code:                          always safe IF no destructive migration shipped with it
```

## Hands-on exercises

Run a FastAPI app as multiple replicas locally (`docker compose up --scale app=3`
behind a proxy, or a local `kind`/`minikube` cluster if you're doing `learn/03` in
parallel). You'll rehearse deploys against it.

### 1. Feel a naive deploy drop traffic

Run 3 replicas behind a load balancer. Start a load generator sending steady
traffic. Now stop *all* replicas and start the new version at once (simulate a
"recreate" deploy). Watch the load generator record failed requests during the
gap. This is the outage you're about to eliminate.

### 2. Rolling deploy with graceful drain

Give the app the `lifespan` SIGTERM drain (module 01) and a readiness probe. Now
replace replicas one at a time (stop one old, start one new, wait for ready,
repeat) while the load generator runs. Confirm **zero** failed requests. Compare to
exercise 1 and name what changed.

### 3. Break it by removing the drain

Switch `CMD` to shell form (or remove the `lifespan` shutdown) and repeat the
rolling deploy. Watch a few requests fail at each replica turnover. Restore the
drain. You've just proven graceful shutdown is a *deployment* requirement.

### 4. Make a backward-compatible API change

Rename a response field using expand/contract across two deploys: deploy 1 returns
both old and new names; migrate a mock client to the new name; deploy 2 removes the
old name. Verify that at no point during a rolling deploy does a client (old or
new) get a broken response.

### 5. Make a *breaking* change and watch it break

Now do the rename in a *single* deploy (remove the old field, add the new one, all
at once). During the rolling deploy, hit the service repeatedly with an old client:
some requests hit new replicas (missing old field) and some hit old replicas —
inconsistent, broken responses. This is why single-deploy breaking changes are
forbidden.

### 6. Order a migration correctly

Add a new nullable column your new code will use. Practice the correct order:
apply the migration first (old code ignores the column), *then* roll out the new
code. Confirm both the pre-deploy old version and the post-deploy new version work
throughout. Then reason out loud: what order would you use to *drop* a column?

### 7. Rehearse a rollback

Deploy a new version, then roll back by redeploying the previous SHA-tagged image
(module 02). Confirm it's clean. Then imagine deploy N had *also* dropped a column
the old code needs — explain why the rollback would now break, and how
expand/contract would have prevented it.

### 8. Diagnose and fix

A team runs rolling deploys and hits three recurring problems: (1) every deploy
drops ~2% of requests; (2) last Tuesday's deploy renamed `user.email` to
`user.email_address` in one PR and mobile clients broke for ten minutes; (3) a
deploy that added `alter table orders drop column legacy_ref;` in the same PR as
the code change broke the still-running old replicas mid-rollout. Diagnose each and
prescribe the fix.

<details>
<summary>Solution</summary>

1. **Dropped requests each deploy** → the app isn't draining on SIGTERM (missing
   `lifespan` shutdown and/or shell-form `CMD`, and/or no readiness probe so the LB
   keeps sending to a terminating replica). Fix: exec-form `CMD` (module 00),
   `lifespan` drain + fail-readiness-first (module 01 / track 08 module 09),
   correct readiness probe (module 06), and `maxUnavailable: 0`.
2. **Breaking rename in one deploy** → during the rollout, old and new replicas
   returned different field names, so clients broke. Fix: expand/contract — deploy
   1 returns *both* `email` and `email_address`; migrate clients; deploy 2 removes
   `email`. Never a breaking rename in a single deploy.
3. **Destructive migration shipped with the code change** → dropping
   `legacy_ref` while old replicas still read it breaks them mid-rollout. Fix:
   order it — first deploy code that stops using `legacy_ref`, let it fully roll
   out, and only in a *later* deploy drop the column. Additive-before-code,
   destructive-after-everything-that-used-it (module 04).

Root theme, all three: **two versions run against one database during a rollout.**
Drain so turnover is invisible, keep API changes additive/backward-compatible, and
order migrations so the schema fits both versions at every instant.

</details>

## Independent challenge

No code given. Take the containerized, CI-built service from **module 02
(CI pipelines for backend code)** and prepare it for **zero-downtime rolling
deploys**, then prove it. First, make the deploy invisible: implement the graceful
drain from **module 01 (The 12-factor app in a container)** and its reference back
to **track 08's module 09 (Graceful shutdown)**, add a readiness probe, and run a
rolling deploy under steady load showing zero dropped requests — then deliberately
remove the drain and show the requests you now drop, to prove the drain is what
did it. Second, ship a **backward-compatible API change** (rename a field via
expand/contract across two deploys) and demonstrate that no client breaks at any
point during the rollout, contrasting it with the same change done as a single
breaking deploy. Third, sequence a schema change correctly: add a column *before*
the code that needs it, and write out (in prose) the correct order to *drop* a
column and why. Finish with a one-paragraph rollback plan explaining why every
change you shipped is independently rollbackable, pointing to `learn/03-kubernetes`
for the rolling-update mechanics and `learn/10-cicd-and-gitops` for how a real
pipeline would orchestrate the promotion.

<details>
<summary>Hint</summary>

Every demand in this challenge traces to one fact: during the rollout, old and new
run at once against one database. The drain proof is cleanest as a before/after: a
load generator recording zero failures with the drain, then non-zero with it
removed — same as module 01's SIGTERM exercise, now under a rolling deploy. For the
API change, the expand step is the whole trick: return *both* field names
simultaneously so a request served by either an old or a new replica is valid;
only after every client uses the new name is the contract (removal) safe. For
migration ordering, the test to apply to any change is "is the schema valid for
*both* versions at this instant?" — additive changes pass that test *before* the
code deploys, destructive ones only pass *after* the last version that used the
thing is gone.

</details>

## Common mistakes & troubleshooting

- **No graceful drain.** Every deploy drops in-flight requests at replica
  turnover. Fail readiness first, drain, then exit (module 01); exec-form `CMD`;
  correct readiness probe (module 06).
- **Breaking API change in a single deploy.** During the overlap, old and new
  replicas disagree and clients break. Use expand/contract across separate deploys;
  additive changes only, per deploy.
- **Destructive migration shipped with the code that motivated it.** Drops
  something the still-running old version needs. Additive migrations *before* the
  code; destructive ones *after* every version that used it is gone.
- **`maxUnavailable` too high.** Capacity dips during rollout → overload/errors.
  Keep `maxUnavailable: 0` with a small `maxSurge` for true zero-downtime.
- **Tagging deploys `:latest`.** No addressable previous image to roll back to.
  Deploy the SHA tag (module 02).
- **Assuming rollback is free.** Code rolls back fine, but a destructive migration
  that shipped with it doesn't — the old code breaks. Keep migrations forward-only
  and each backward-compatible so code rollback is always safe.
- **Slow startup / heavy work in startup.** New replicas take too long to become
  ready, stalling the rollout. Keep startup fast (module 01); do heavy work as a
  one-off job (module 04, factor XII).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the single fact that underlies all three deployment strategies, and
   explain why it's the source of every backend demand in this module.
2. During a rolling deploy, what exactly must the app do when a replica is retired
   so that in-flight requests aren't dropped? Tie each step to the module that
   introduced it.
3. Why can a single deploy never contain a breaking API change, and what's the
   general pattern for making a breaking change safely?
4. Give the correct ordering rule for an *additive* migration and for a
   *destructive* migration relative to the code rollout, and explain why each
   ordering is forced.
5. Compare rollback for rolling vs blue/green vs canary. Why does a destructive
   migration threaten *all three* code rollbacks?
6. Contrast blue/green and canary on blast radius and cost, and say which you'd
   choose for a high-risk change to a payments endpoint and why.

<details>
<summary>Answers</summary>

1. **During a deploy, two versions of the app run simultaneously against the same
   data.** No strategy can atomically swap every replica *and* the database in one
   instant — rolling stretches the overlap over minutes, canary over the ramp,
   blue/green over a short window. Every demand (graceful drain, backward-compatible
   APIs, migration ordering) exists to make the app correct *during* that overlap.
2. On SIGTERM (delivered because of exec-form `CMD`, module 00): **fail the
   readiness probe** (module 06) so the LB stops sending *new* requests, **drain**
   in-flight requests to completion, **close pools/connections**, then exit before
   the grace period — all in the `lifespan` shutdown (module 01 / track 08 module
   09). New replicas only get traffic after their own readiness probe passes, so
   there's no gap.
3. Because during the overlap old and new replicas serve traffic together; a
   breaking change (removed/renamed/retyped field, newly-required field, removed
   endpoint) makes the two versions disagree and breaks clients or in-flight
   requests. The pattern is **expand/contract across separate deploys**: first add
   the new form while keeping the old (both work), migrate all clients/replicas,
   then in a later deploy remove the old form.
4. **Additive** (add nullable/defaulted column): migrate **before** the new code —
   the old code ignores the column, the new code uses it, both valid. **Destructive**
   (drop column): migrate **after** every version that referenced it is gone —
   deploy code that stops using it first, let it fully roll out, then drop. Each is
   forced by the rule that the schema must be valid for *both* versions at every
   instant of the rollout.
5. Rolling: redeploy the previous SHA image. Blue/green: flip the router back to
   blue (near-instant). Canary: shift the traffic percentage back to stable. A
   destructive migration threatens all three because rolling *code* back to the
   prior version reintroduces code that needs the thing the migration destroyed —
   so the data can't roll back with the code, and the restored old version breaks.
   Keeping migrations forward-only and individually backward-compatible makes code
   rollback always safe.
6. Blue/green flips *all* traffic at once (blast radius = everyone for the window,
   but instant rollback) and costs ~2× capacity during the switch; canary exposes
   only a small % and ramps (bounded blast radius, small extra cost) but rollback
   is "shift the % back." For a high-risk payments change, **canary** — you want the
   smallest possible blast radius and the ability to watch error/latency on 5% of
   real traffic before committing, aborting the ramp if it misbehaves.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-03 while attempting these — the point is to
find out what actually stuck.

1. You change one line of Python and your Docker build reinstalls every
   dependency, taking four minutes. Explain the cause using the build-cache rule
   (module 00) and give the exact Dockerfile fix.
2. An app "works on one replica, breaks on three": inconsistent counters and lost
   uploads. Name the factor violated (module 01), the two distinct sub-causes
   (memory vs disk), and the fix for each — then explain why fixing this is a
   *precondition* for the rolling deploys in module 03.
3. Your CI is green on every PR yet bugs and a leaked key reached prod and you
   can't roll back to yesterday's image. List four pipeline flaws (module 02) and
   their fixes, and say specifically which fix module 03's rollback depends on.
4. Trace a single request-and-shutdown story: a rolling deploy retires a replica
   while it's serving a 4-second request. Walk from SIGTERM to clean exit, naming
   what makes uvicorn receive the signal (module 00), what the app does (module
   01), and what the platform does with readiness (module 03/06).
5. You must rename `orders.ref` to `orders.reference` (used by the API and read by
   old replicas) with zero downtime. Give the full sequence of deploys and
   migrations, and state the invariant that must hold at every step (modules 03,
   and previews 04).
6. For each, say whether it's safe in a single rolling deploy or must be split, and
   why: (a) add a new optional query parameter; (b) make an existing optional
   request field required; (c) add a new nullable DB column; (d) drop an unused DB
   column; (e) add a new endpoint.
7. Map each choice to the `learn/` track you'd go deep in: full Docker image
   internals and registries; the rolling-update/probe mechanics of an orchestrator;
   real CI/CD pipeline tooling and GitOps; image scanning and supply-chain
   security.

<details>
<summary>Answers</summary>

1. The build cache reuses a layer only if its instruction and all prior layers are
   unchanged; `COPY . .` before `pip install` means any code change busts the copy
   layer and thus the install layer after it, reinstalling everything. Fix: copy
   the manifest and install *first* — `COPY requirements.txt .` then
   `RUN pip install -r requirements.txt` — *before* `COPY . .`, so the deps layer
   stays cached across code changes (module 00).
2. Factor VI (stateless processes). Sub-causes: **in-memory state** (a counter/
   session dict each replica holds separately → inconsistent) → move to Redis; and
   **local-disk state** (uploads on one ephemeral replica → lost on
   reschedule/deploy) → object storage with a DB pointer (module 01). It's a
   precondition for rolling deploys because a rolling deploy kills and replaces
   replicas one at a time — safe only if any replica can serve any request
   identically, i.e. only if the app holds no local state (module 03).
3. (i) Unpinned deps → pin/lock; (ii) no ruff/mypy/secret scan → add them as
   gating steps; (iii) blanket retries or no branch protection → enable branch
   protection, quarantine specific flakes; (iv) tagging only `:latest` → tag by
   commit SHA. Module 03's **rollback** depends specifically on the SHA-tagging
   fix — without an immutable per-commit tag there's no addressable "previous
   known-good image" to redeploy (module 02).
4. The platform sends SIGTERM to PID 1 — uvicorn receives it because `CMD` is
   exec form (module 00). The app's `lifespan` shutdown runs: it fails the
   readiness probe so the LB stops routing *new* requests, lets the in-flight
   4-second request finish (drain), closes pools, and exits before the grace
   period (module 01 / track 08 module 09). The platform, seeing readiness fail,
   stops sending new traffic to this replica and only sends to the new replica once
   *its* readiness passes (module 03/06) — so the turnover is invisible.
5. Expand/contract: **Deploy 1** — migration adds `reference` (nullable), code
   dual-writes both `ref` and `reference` and reads `ref`; backfill `reference`
   from `ref`. **Deploy 2** — code switches reads to `reference` (still writing
   both). **Deploy 3** — code stops using `ref`. **Deploy 4** — migration drops
   `ref`. Invariant at every step: the schema and API are valid for **both** the
   old and new running versions simultaneously (modules 03, 04).
6. (a) Safe — additive/optional. (b) Split — making an optional field required is
   breaking; accept-optional first, require later. (c) Safe — additive nullable
   column, migrate before code. (d) Split — destructive; stop using it in code,
   fully roll out, then drop in a later deploy. (e) Safe — additive.
7. Docker image internals/registries → `learn/02-docker`; orchestrator
   rolling-update/probe mechanics → `learn/03-kubernetes`; CI/CD tooling and
   GitOps → `learn/10-cicd-and-gitops`; image scanning/supply-chain →
   `learn/11-security-deep-dive` (and `learn/18-supply-chain-security`).

</details>

## Further reading & sources

- [Martin Fowler: BlueGreenDeployment](https://martinfowler.com/bliki/BlueGreenDeployment.html) - The canonical description of standing up a parallel environment and flipping traffic atomically, with instant rollback.
- [Martin Fowler: CanaryRelease](https://martinfowler.com/bliki/CanaryRelease.html) - Releasing to a small slice of traffic and ramping — the bounded-blast-radius strategy for risky changes.
- [Kubernetes: Performing a rolling update](https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/) - How an orchestrator swaps replicas incrementally, the default strategy discussed here.
- [Kubernetes: Deployment strategy (maxSurge / maxUnavailable)](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy) - The surge/unavailability knobs that make a rolling update truly zero-downtime.
- [Google SRE Book: Release Engineering](https://sre.google/sre-book/release-engineering/) - Why immutable, addressable artifacts and safe rollback make frequent deploys reliable rather than reckless.

## Next

[04-database-migrations-in-deployment-pipelines](../04-database-migrations-in-deployment-pipelines/README.md)
— you now know migration *ordering* is inseparable from deployment. The next module
goes deep on doing migrations safely as part of a deploy: the expand/contract
pattern in full, backfills and dual-writes, avoiding table locks that cause
downtime, and running migrations as one-off admin processes (factor XII) in the
pipeline.
