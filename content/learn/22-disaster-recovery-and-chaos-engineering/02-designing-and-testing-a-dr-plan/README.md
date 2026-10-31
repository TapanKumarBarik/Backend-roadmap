# 02 - Designing and Testing a DR Plan

## Why this matters

A DR plan that has never been executed is a hypothesis, not a plan. Module 01
gave you a substrate that *can* fail over; this module turns that capability
into a written runbook a stressed on-call engineer can follow at 3am — and
then, the part that actually separates real DR from theatre, has you
**execute a failover drill** against your two regions and measure whether
traffic truly redirected. Most "DR plans" die the first time they meet a real
DNS TTL, a stale replica, or a step that assumed a human who's on holiday.
You'll find those failures in a drill, on purpose, instead of during an
outage.

## Concepts

### A runbook is written for the worst version of you

The audience for a DR runbook is a tired, stressed engineer, possibly not the
author, during a real outage with alarms going off (the on-call context from
track 20 / module 04). That dictates the form:

- **Numbered, copy-pasteable steps**, not prose. Each step is one action with
  the exact command and its expected output.
- **Explicit preconditions and decision points** — "if the primary's health
  endpoint returns non-200 for >2 min, declare a regional incident and
  proceed; otherwise investigate in-region first." Ambiguity is what causes
  hesitation during an incident.
- **Verification after every consequential step**, not just at the end — how
  do you *know* the database promoted, the traffic shifted, the app is
  serving? A runbook without verification steps is a wish list.
- **Rollback / abort criteria** — when do you stop and *not* fail over
  (because failing over unnecessarily is its own outage)?
- **Named roles**, not names — "the Incident Commander decides to declare,"
  mapping to track 20 / module 05's incident-response roles, so the plan
  doesn't depend on one specific person being reachable.

### The anatomy of a regional-failover runbook

A concrete structure you can reuse for any system:

1. **Detection & declaration** — what signal (SLO burn alert from track 20,
   health-probe failure, Azure Service Health) triggers this runbook, and who
   declares a DR event. Include the "don't fail over for a blip" guard.
2. **Communication** — declare an incident (track 20 / module 05), open the
   comms channel, set expectations. Failover is a customer-visible event.
3. **Data promotion** — promote the secondary region's data store to
   primary/writable (Azure SQL geo-failover, replica promotion, or storage
   account failover). This is usually the step with the real RPO consequence.
4. **Traffic cutover** — shift the global router to the secondary (disable the
   primary endpoint / raise the secondary's priority / let health probes do
   it). This is where DNS TTL bites.
5. **Scale-up** (pilot light / warm standby) — bring the secondary to full
   capacity if it wasn't already.
6. **Verification** — end-to-end checks that real user journeys work in the
   secondary, not just that pods are Running.
7. **Failback plan** — how you return to the primary once it recovers, which
   is often *harder* than the failover (you must re-replicate data that
   changed in the secondary without losing it).

### Failover time is detection + promotion + cutover + warm-up

Your achieved RTO is the sum of the phases, and it's worth decomposing
because each has a different lever:

```
RTO_achieved = t_detect + t_declare + t_promote_data + t_cutover(DNS) + t_scale_up + t_verify
```

- `t_detect` — health-probe interval × failures, or SLO burn-rate alert
  latency (track 20 / module 03).
- `t_declare` — human decision time; shrink with clear declaration criteria.
- `t_promote_data` — database/storage failover time (seconds to minutes).
- `t_cutover(DNS)` — **the DNS-TTL term for Traffic Manager** (near-zero for
  Front Door). This is the one people forget.
- `t_scale_up` — zero for warm standby / active-active, minutes for pilot
  light.
- `t_verify` — how long to confirm it actually works.

Measuring these in a drill is how you learn whether your *paper* RTO is
achievable. Almost always the first drill blows the target, and the decomposed
timing tells you which phase to fix.

### DNS TTL and caching: why "failover" sometimes changes nothing

The single most common failover surprise (foreshadowed in module 01): you
disable the primary endpoint, Traffic Manager immediately starts answering
with the secondary IP, and yet **users keep hitting the dead primary for
minutes**. Why? Every resolver and client between you and the user cached the
old DNS answer for the record's TTL, and some (browsers, JVMs with infinite
DNS caching, corporate resolvers that ignore low TTLs) hold it even longer.
So the failover "succeeded" at the Traffic Manager level and *did nothing
observable* for real users during the TTL window. The fixes, in order of
preference:

1. **Lower the TTL in advance** (module 01's `--ttl 30`) — you can't lower it
   *during* an incident and have it help, because the high TTL is already
   cached; it must be low *before* the outage.
2. **Use Front Door** (L7 edge failover) if you need failover faster than any
   safe DNS TTL allows.
3. **Know your worst-cached clients** — some ignore TTL entirely; the runbook
   should set expectations that a small tail keeps hitting the old region.

You'll reproduce this exact trap in the drill and measure the window.

### The drill is the deliverable — and its result is data

Echoing track 14 / module 04's "the restore is the deliverable": a DR plan is
not done when it's written, it's done when a **drill** has executed it and you
have *recorded results*: achieved RTO/RPO per phase, every step that was
wrong/missing/ambiguous, and a list of fixes. A drill that "went fine" with no
notes is nearly worthless — the value is in the discrepancies you find (a step
that assumed a credential you didn't have, a replica that was 40 minutes
behind, a scale-up that hit a quota). Record them, fix the runbook, and
re-drill. This "execute and record, don't just write" discipline is the whole
point of this module and the backbone of the game days in module 06.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az network traffic-manager endpoint update --endpoint-status Disabled` | Forces failover by disabling the primary endpoint (drill trigger) | see breakdown |
| `az sql failover-group set-primary` | Promotes the secondary Azure SQL region to primary (data promotion) | see breakdown |
| `az storage account failover` | Initiates account failover for GRS storage (data promotion) | `az storage account failover -n <acct> --yes` |
| `az aks nodepool scale` | Scales a pilot-light standby up to capacity | `az aks nodepool scale -g <rg> --cluster-name <c> -n <np> --node-count 3` |
| `kubectl scale deployment --replicas` | Scales the app tier up in the standby | `kubectl scale deployment web --replicas=3` |
| `dig +short <fqdn>` / `while true; do curl -s ...; done` | Measures what clients *actually* resolve/reach during cutover | see exercises |
| `az monitor metrics list` | Pulls Traffic Manager / Front Door metrics to time the drill | see track 12 |

Flag breakdown — forcing a failover by disabling the primary endpoint (the
controlled drill trigger — safer than actually killing the region):

```bash
az network traffic-manager endpoint update \
  -g dr-rg --profile-name app-tm -n primary \
  --type externalEndpoints \
  --endpoint-status Disabled
```
- `--endpoint-status Disabled` — Traffic Manager stops handing out this
  endpoint's IP, so new DNS answers point at the secondary. This simulates
  "the primary is out of rotation" without destroying the primary — you can
  re-enable it to fail back. Crucially it does *not* flush anyone's cached DNS,
  so it exposes the real TTL window.

Flag breakdown — promoting an Azure SQL failover group (data promotion step):

```bash
az sql failover-group set-primary \
  --name <fg-name> \
  --resource-group <secondary-rg> \
  --server <secondary-server>
```
- `--server <secondary-server>` — the server in the DR region you're making
  primary. Run *against the secondary* — you're telling Azure "this side is
  now authoritative." A **forced** failover (add `--allow-data-loss` in a real
  regional outage where the primary is unreachable) accepts the async
  replication gap as your realized RPO — measure it.

## Hands-on exercises

These run a real drill against the two regions from module 01. Rebuild that
substrate (or a minimal echo app on two clusters behind one Traffic Manager
profile) first. Keep a timer/notes file open — the *recorded results* are the
deliverable, not just "it worked." Tear the second region down in exercise 9.

### 1. Write the runbook before touching anything

Using the anatomy above, write an actual numbered runbook (in a
`dr-runbook.md`) for "primary region is down, fail the web app to the
secondary." Every step must have the exact command and an expected-output
verification. Include declaration criteria and a failback outline. Do this
*first* — the drill's job is to find where this written plan is wrong.

### 2. Establish a steady-state baseline

```bash
FQDN=$(az network traffic-manager profile show -g dr-rg -n app-tm --query dnsConfig.fqdn -o tsv)
dig +short "$FQDN"                       # should be the PRIMARY ip
curl -s "http://$FQDN/" | grep -o "Welcome.*" | head -1
```

Record: which IP serves now, and that a user journey works. You need the
"before" to prove the "after."

### 3. Start a continuous probe (your measurement instrument)

In a separate terminal, hit the app once a second and log which region
answers (have each region's app return a header or body identifying itself, or
resolve+log the IP):

```bash
while true; do
  echo "$(date +%T) $(curl -s -m 2 -o /dev/null -w '%{http_code}' http://$FQDN/) $(dig +short $FQDN | head -1)"
  sleep 1
done | tee drill-log.txt
```

This log is how you'll measure `t_cutover` and the DNS-TTL tail. Leave it
running through the drill.

### 4. Execute the failover (trigger + data + cutover)

Note the wall-clock time, then run your runbook's steps:

```bash
date +%T   # T0 — declare
# (data promotion step for your data store — e.g. az storage account failover, if applicable)
az network traffic-manager endpoint update -g dr-rg --profile-name app-tm \
  -n primary --type externalEndpoints --endpoint-status Disabled
date +%T   # cutover initiated
```

Watch `drill-log.txt`: note the timestamp when the answered IP *first* becomes
the secondary, and when it *stops* ever being the primary.

### 5. Scale up the standby (if pilot light / warm standby)

```bash
az aks nodepool scale -g dr-secondary-rg --cluster-name aks-wus -n nodepool1 --node-count 3
kubectl --context aks-wus scale deployment web --replicas=3
kubectl --context aks-wus get pods -w
```

Time this phase — it's `t_scale_up`, and it's often the biggest surprise
(node provisioning + image pull + readiness).

### 6. Verify like a user, not like a dashboard

Confirm a real end-to-end journey in the secondary — not just "pods Running":

```bash
curl -s "http://$FQDN/" | grep -o "Welcome.*"      # served from secondary now
# hit an endpoint that touches the data store, and confirm the data is present & current
```

Record achieved RTO (T0 → first successful secondary response for a *new*
client) and, if you promoted a replicated data store, the RPO (how far behind
the secondary's data was).

### 7. Diagnose-and-fix: the failover that didn't redirect traffic (DNS TTL)

This is the module's core lesson. Look at `drill-log.txt`: you'll almost
certainly see the answered IP flip to the secondary quickly, **but requests
that reused an already-resolved connection or a cached resolver answer keep
landing on the (now disabled) primary for up to the TTL** — appearing as a
tail of failures or old-region responses after cutover. Reproduce it sharply:

```bash
# Set a deliberately long TTL, re-baseline, then fail over and watch the tail:
az network traffic-manager profile update -g dr-rg -n app-tm --ttl 300
sleep 5
# re-run steps 3-4 and observe: cutover at the TM level is instant, but clients
# keep hitting the old IP for up to ~300s.
```

**Findings to record:** Traffic Manager switched immediately, yet real
failover (from the *client's* perspective) lagged by up to the TTL. **Fixes:**
(1) lower the TTL *before* incidents (`--ttl 30` or lower) so the cached
window is small; you cannot fix it mid-incident because the long TTL is
already cached. (2) For sub-TTL failover, move the entry point to **Front
Door** (L7 edge failover, no client DNS in the path) — re-run the drill
through the Front Door endpoint and confirm the tail is seconds, not minutes.
Update `dr-runbook.md` to note the realistic client-side failover window and
the TTL precondition.

### 8. Record results and fix the runbook

Write a short **drill report**: achieved RTO decomposed by phase (`t_detect`,
`t_promote`, `t_cutover`, `t_scale_up`, `t_verify`), achieved RPO, and a
numbered list of every runbook step that was wrong, missing, ambiguous, or
slower than assumed. For each, note the fix. Then edit `dr-runbook.md`
accordingly. **This report is the deliverable** — a drill with no recorded
discrepancies means you didn't look hard enough.

### 9. Fail back, then clean up

Failback is a real step (and often harder). Re-enable the primary and shift
back, being explicit about any data written to the secondary during the drill:

```bash
az network traffic-manager endpoint update -g dr-rg --profile-name app-tm \
  -n primary --type externalEndpoints --endpoint-status Enabled
az network traffic-manager profile update -g dr-rg -n app-tm --ttl 30   # keep it low
# Then tear the expensive standby down:
az group delete -n dr-secondary-rg --yes --no-wait
az afd profile delete -g dr-rg --profile-name fd --yes 2>/dev/null
az network traffic-manager profile delete -g dr-rg -n app-tm
az group delete -n dr-rg --yes --no-wait
az aks list -o table   # confirm the DR cluster is gone
```

Expected: back on the primary, and the billable second region destroyed.
Never leave a drilled-up standby running — that's the doubled bill.

## Independent challenge

Take a stateful system (the AKS + database environment from track 07 or track
14's capstone). Write and then **actually execute** a regional-failover drill
for it that includes a *data* promotion step, not just traffic — promote a
geo-replicated data store (Azure SQL failover group, storage account failover,
or a promoted read replica) and measure the **RPO you really achieved**
(how much data the async replication gap cost you), alongside the decomposed
RTO. Record a drill report and fix at least three concrete runbook defects you
find. Reference module 00 (your RTO/RPO targets), module 01 (the substrate),
track 20 / module 05 (declare it as an incident with roles), and track 14
(the data layer). **Destroy the second region and any promoted-back resources
immediately after** — this drill runs real duplicated infrastructure.

<details>
<summary>Stuck? One hint</summary>

The data-promotion step is where the *real* RPO reveals itself, and it's the
step people leave out because traffic cutover is more visible. Before you fail
over, write a known row to the primary's database every second (a timestamp
loop); after you promote the secondary, query the highest timestamp that made
it across — the gap between "last write to primary" and "last write present in
secondary" is your achieved RPO in seconds. If you used a forced failover with
`--allow-data-loss`, that gap is exactly the data you accepted losing. That
single measurement turns "our RPO is ~5 min" from a hope into a number.

</details>

## Common mistakes & troubleshooting

- **Writing the plan and never running it.** An unexecuted runbook is a
  hypothesis; the first drill always finds broken steps. The drill, with a
  recorded report, is the actual deliverable.
- **Forgetting the DNS-TTL term in the failover time.** Traffic Manager
  switching is instant; real client failover lags by the cached TTL. Lower
  TTL *before* incidents or use Front Door — you can't fix it mid-outage.
- **Verifying pods, not user journeys.** "Pods Running in the secondary"
  isn't recovery; a real end-to-end request touching the data layer is. Bake
  user-journey verification into the runbook.
- **Ignoring failback.** Returning to the primary is often harder than
  leaving it — you must reconcile data written to the secondary. A plan with
  no failback strategy strands you in the DR region.
- **Runbook depends on one person or un-scripted tribal knowledge.** Use
  named roles (track 20 / module 05) and exact commands, so anyone on-call can
  execute it.
- **Cost pitfall — leaving the drilled-up standby running (ties to track
  21).** Scaling the secondary to full capacity for a drill and forgetting to
  scale it back (or destroy it) is a classic way to double your bill silently
  for weeks. Make "scale back / destroy the standby" the final, non-optional
  runbook step, and confirm with `az aks list` that it's gone.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Who is the audience a DR runbook is written for, and how does that shape
   its form?
2. List the seven phases of a regional-failover runbook in order.
3. Decompose achieved RTO into its component terms, and say which term the
   DNS TTL lives in and which router avoids that term entirely.
4. Why is "the plan is written" not the same as "the plan works," and what is
   the actual deliverable of this module?
5. In the drill, Traffic Manager switched to the secondary instantly, yet
   users kept hitting the dead primary. Explain why, and give the fix that
   must be applied *before* the incident.
6. Why is verifying "pods are Running in the secondary" insufficient, and
   what should you verify instead?
7. Why is failback often harder than the failover itself?
8. Which track/module's incident-response roles does the runbook reference,
   and why use named roles rather than named people?

<details>
<summary>Show answers</summary>

1. A tired, stressed on-call engineer — possibly not the author — during a
   real outage. So the runbook must be numbered, copy-pasteable steps with
   exact commands, explicit decision points, per-step verification, and
   rollback/abort criteria, leaving no room for hesitation.
2. Detection & declaration → communication → data promotion → traffic
   cutover → scale-up (pilot light/warm standby) → verification → failback.
3. `t_detect + t_declare + t_promote_data + t_cutover(DNS) + t_scale_up +
   t_verify`. The DNS TTL lives in `t_cutover`; Front Door (L7 edge failover)
   removes that term.
4. Because an unexecuted runbook is a hypothesis — the first drill always
   finds broken, missing, or ambiguous steps. The deliverable is an *executed*
   drill with a recorded report of achieved RTO/RPO and the defects found and
   fixed.
5. Resolvers and clients had cached the old DNS answer for the record's TTL,
   so they kept resolving the dead primary until it expired. Fix beforehand:
   lower the TTL in advance (or use Front Door) — you can't fix it during the
   incident because the long TTL is already cached.
6. Because pods Running doesn't prove the system serves users — the data
   layer, DNS, and dependencies must all work. Verify a real end-to-end user
   journey that touches the data store, not just pod status.
7. Failback must reconcile data written to the secondary during the outage
   back to the primary without losing it, and re-establish replication in the
   right direction — a data-consistency problem the initial failover didn't
   face.
8. Track 20 / module 05's incident-response roles (Incident Commander, comms,
   scribe, etc.). Named roles rather than people so the plan doesn't depend on
   one specific person being reachable during an outage.

</details>

## Cumulative review

Closed-book. Cover the answers and write each out first — this mixes modules
00-02, roughly the first third of the track.

1. Define RTO and RPO, and name the DR strategy that minimizes each at the
   highest cost.
2. Name the four DR strategies in cost order and give the RTO/RPO shape of
   each.
3. Which failure domain does multi-region DR *not* cover, and what layer must
   you add to cover it?
4. Why does choosing Azure's *paired* region as your DR region help, and name
   two things it gives you for free.
5. Explain the core Traffic-Manager-vs-Front-Door difference and why it
   determines failover speed.
6. Decompose achieved RTO into its phases, and say which phase the DNS TTL
   lives in and which router avoids that term.
7. In the drill, "Traffic Manager switched instantly but users kept hitting
   the dead region." Explain why, and give the fix that must be applied
   *before* the incident.
8. Why is a DR runbook written in numbered copy-pasteable steps with
   per-step verification, rather than prose, and whose incident-response roles
   (which track/module) does it reference?
9. What makes failback often harder than failover?
10. Give the one FinOps rule that keeps DR drills from doubling your bill,
    tying it to track 21.

<details>
<summary>Show answers</summary>

1. RTO = max time to restore service; RPO = max data loss in time.
   Active-active minimizes both at the highest cost.
2. Backup/restore (RTO hours-day, RPO backup interval) → pilot light (RTO
   ~1hr, RPO seconds) → warm standby (RTO minutes, RPO seconds) →
   active-active (RTO seconds, RPO ~zero).
3. Logical damage (corruption, bad migration, deletion) — it replicates
   instantly; you must add a point-in-time backup layer (track 14 / module
   04).
4. The pair gets automatic GRS replication and Azure sequences platform
   maintenance so both aren't updated at once — replication and coordinated
   maintenance, for free.
5. Traffic Manager routes at DNS (bounded by cached TTL); Front Door routes
   at its L7 edge with no client DNS in the failover path — so Front Door
   fails over in seconds regardless of TTL.
6. `t_detect + t_declare + t_promote_data + t_cutover(DNS) + t_scale_up +
   t_verify`. The DNS TTL lives in `t_cutover`; Front Door removes that term.
7. Resolvers and clients cached the old DNS answer for the TTL, so they kept
   resolving the dead primary until the cache expired. Fix: lower the TTL
   *before* the incident (or use Front Door) — you can't fix it mid-incident
   because the long TTL is already cached.
8. Because the reader is a stressed, possibly-unfamiliar on-call engineer
   during an outage; unambiguous numbered steps with verification prevent
   hesitation and let you know each step worked. It references track 20 /
   module 05's incident-response roles (Incident Commander, etc.).
9. Failback must reconcile data written to the secondary during the outage
   back to the primary without losing it, and re-establish replication in the
   correct direction — a data-consistency problem the initial failover didn't
   have.
10. Make "scale the standby back down / destroy the second region" the final
    mandatory runbook step and verify it's gone — running a full-size standby
    after a drill is the classic doubled-bill FinOps failure from track 21.

</details>

## Next

[03-platform-level-backup-strategy](../03-platform-level-backup-strategy/README.md) —
you can fail over a running system to another region. But some disasters
(corruption, a botched cluster upgrade, "delete the whole resource group")
need *backups*, not failover. Time to extend track 14's database backups to
the whole platform: VMs, disks, the cluster itself, and Terraform as a
recovery mechanism.
