# 06 - The Decision Framework: Self-Hosted vs. Managed

## Why this matters

You've now built both paths first-hand: a database you run yourself on
Kubernetes with an operator, tested backups, and failover (modules 00-04),
and a database Azure runs for you behind an endpoint (module 05). The
career-relevant skill isn't knowing *how* to do either — it's being able to
walk into a design review and defend *which* one for a specific workload,
against people who'll push back. This module gives you an honest, two-sided
framework across four axes — operational burden, cost, control, and
compliance — so your recommendation is reasoning, not a habit or a
resume-driven preference.

## Concepts

### The framework is four axes, and neither side wins all four

There is no universally correct answer, and any framework that always picks
one side is a strawman. The four axes that actually decide it:

1. **Operational burden** — who does the 3am work (failover, patching,
   backup verification, capacity)?
2. **Cost** — not just the sticker price, but the fully-loaded cost
   including *your team's time*.
3. **Control** — how much can you tune, extend, and customize the engine?
4. **Compliance & data residency** — what do your regulators, contracts,
   and security team actually require?

Most real decisions are won or lost on **one dominant axis** for that
specific workload, with the others as tie-breakers. The skill is
identifying which axis dominates *here*, not scoring all four equally every
time.

### Axis 1 — operational burden (managed usually wins, and that's fine)

Everything you did in modules 03-04 — install and upgrade the operator,
watch replication, test-restore backups, handle a failover that didn't
promote cleanly — is ongoing operational work that a managed service does
for you behind an SLA. This is the axis where managed most often wins, and
admitting that isn't weakness: module 04's "an untested backup is worth
zero" is a genuinely hard discipline to sustain, and a provider doing it at
scale is a real risk reduction.

The honest counter-point: managed removes burden *only within the
provider's paved path*. The moment you need something Azure doesn't offer —
a specific extension, a Postgres version they haven't released, an
odd replication topology — you're stuck waiting on the provider, which is
its own kind of burden (a slower, less-controllable one). Self-hosting
trades steady, predictable operational toil for the ability to fix things
yourself immediately.

### Axis 2 — cost (the sticker price lies in both directions)

Naively, self-hosting on a cluster you already run looks cheaper (you're
"just" adding Pods and disks). Managed looks expensive (a Flexible Server
line item, and module 05 showed how a wrong tier triples it). Both
intuitions are incomplete:

- **Self-hosted true cost** = the Azure Disks (module 02, and orphaned ones
  keep billing), the node capacity the DB reserves, **plus your team's
  time** building and operating everything in modules 03-04, plus the cost
  of the incidents that time doesn't prevent. Engineer-hours are the
  largest and most-often-ignored line.
- **Managed true cost** = the service tier (right-sized — module 05's cost
  levers), which is a predictable, visible number that *includes* the
  operational labor you'd otherwise pay your own team for.

So the comparison isn't "disk + Pods" vs "Flexible Server" — it's
"disk + Pods + engineer-time + incident-risk" vs "Flexible Server tier."
For a small team, managed is frequently *cheaper* fully-loaded even though
the line item is bigger, because engineer time is the scarcest resource.
For a large org running hundreds of databases with a dedicated platform
team, the per-database managed premium can dominate and self-hosting a
well-run operator platform wins. **Scale and team size flip this axis.**

### Axis 3 — control (self-hosted wins when you actually need it)

Self-hosting gives you total control: any Postgres version the day it
ships, any extension, custom `postgresql.conf`, exotic replication, sidecar
tooling, the exact operator behavior you configured in module 03. Managed
gives you a curated subset — the versions, extensions, and parameters Azure
chooses to expose, on their upgrade timeline.

The honest framing: **most workloads never use the control they'd be
buying.** "We might need a custom extension someday" is not a reason to
take on modules 03-04's operational burden today. Control is a decisive
advantage only when you have a *concrete, present* requirement the managed
service can't meet — a specific extension it doesn't offer, a version it
won't run, a tuning knob it hides. Wanting control in the abstract is how
teams talk themselves into unnecessary toil.

### Axis 4 — compliance, residency, and lock-in

Sometimes the decision is made *for* you and the other three axes don't
matter:

- **Data residency / sovereignty** — if data must live in a specific
  region or under specific controls, whichever option can satisfy that wins
  outright. (Both Azure managed services and self-hosted-on-AKS can be
  region-pinned, so this often cuts *both* ways rather than deciding it.)
- **Compliance certifications** — a managed service inherits Azure's
  audited compliance posture (SOC 2, HIPAA, etc.) for the database layer,
  which can be far cheaper than certifying your own operator setup. This
  usually favors *managed*.
- **Air-gapped / on-prem / multi-cloud** — if you must run the same
  database on-prem or across clouds, a Kubernetes operator is portable in a
  way a specific cloud's managed service is not. This favors *self-hosted*.
- **Lock-in** — managed ties you to Azure's API and migration path;
  self-hosted-on-Kubernetes is more portable but you own more. This is a
  real strategic axis, not just an engineering one.

### Putting it together — a decision heuristic

A defensible default, not a law:

- **Start with managed** (Flexible Server) unless a specific axis pushes
  you off it. It minimizes the burden that's genuinely hard to sustain, and
  its cost is honest and predictable.
- **Choose self-hosted** when you have a *concrete* control requirement
  managed can't meet, when portability/multi-cloud/on-prem is a hard
  requirement, or when you're at a scale where a dedicated platform team
  makes the fully-loaded cost favor it.
- **Let compliance/residency override everything** when it applies — check
  it first, because it can make the other three axes moot.
- **Never decide on habit or resume.** "We always self-host" and "managed
  is always simpler" are both how teams get the wrong answer for the
  workload in front of them.

## Command reference

This module is analytical, but you'll gather the real numbers that feed the
decision rather than guessing them. The commands that produce evidence:

| Command | What it produces for the decision | Example |
|---|---|---|
| `az postgres flexible-server list -o table` | Managed inventory + tiers actually running (cost axis) | `az postgres flexible-server list -o table` |
| `az consumption usage list` | Actual Azure spend to compare against estimates | `az consumption usage list -o table` |
| `az vm list-skus --location eastus` | VM/tier options + pricing inputs for both paths | `az vm list-skus -l eastus --query "[?family=='standardBFamily']"` |
| `kubectl top pods -l cnpg.io/cluster=pg` | Real resource use of a self-hosted DB (node-capacity cost) | `kubectl top pods -n db` |
| `az disk list -o table` | Self-hosted storage footprint (incl. orphaned disks) | `az disk list -g <node-rg> -o table` |
| `az postgres flexible-server show` | Managed capabilities available (control axis) | `az postgres flexible-server show -g rg -n pg-flex` |
| `az policy assignment list` | Compliance/residency constraints already in force | `az policy assignment list -o table` |

Flag breakdown — `az vm list-skus -l eastus --query "..."`:
- `-l eastus` — pin to your region; SKU availability and price vary by
  region (a residency-axis input too).
- `--query "[?family=='standardBFamily']"` — filter to the Burstable family
  you'd realistically size a small self-hosted DB node or Flexible Server
  on, so you're comparing like tiers, not a Burstable managed DB against a
  Memory-Optimized node.

## Hands-on exercises

These are analysis exercises with real evidence-gathering, not just prose —
the deliverable each time is a short written judgement backed by a command's
output. Keep a running `decision-log.md`.

### 1. Build the fully-loaded cost of your self-hosted path

Using the module 03 CNPG cluster (or its spec), enumerate every billable
and human-cost component:

```bash
kubectl top pods -l cnpg.io/cluster=pg -n db          # CPU/mem the DB reserves
kubectl get pvc -n db                                  # count + size of disks
az disk list -g <node-rg> -o table                     # actual Azure Disks
```

Write down: node capacity consumed, disk GB × count × SKU price, **and an
honest estimate of engineer-hours/month** to operate it (patching, backup
verification, on-call). That last number is the one people omit — write it
anyway.

### 2. Build the fully-loaded cost of the managed path

```bash
az postgres flexible-server show -g rg-mgdb-lab -n <name> \
  --query "{tier:sku.name, storage:storage.storageSizeGb, ha:highAvailability.mode}"
```

Look up the tier's monthly price. Write it down as a single predictable
number, and explicitly note that this number *includes* the operational
labor you costed separately in exercise 1. Now compare the two totals —
which wins, and does the answer flip if you halve or 10× the team size?

### 3. Score a small-startup scenario

Scenario: 4-engineer startup, one production Postgres, no dedicated DBA, no
special extensions, standard compliance. Score each axis (managed /
self-hosted / neutral) with a one-line justification, then give a
recommendation. Commit it to your log before reading the expected answer in
the quiz.

### 4. Score a large-regulated-enterprise scenario

Scenario: 200-database platform team at a regulated bank, strict data
residency, an in-house Postgres extension, must also run identical DBs
on-prem. Score each axis and recommend. Notice how the *same framework*
produces a different answer — that's the point.

### 5. Score a deliberately ambiguous scenario

Scenario: mid-size SaaS, growing fast, one control requirement (a Postgres
extension) that Azure *does* currently offer, moderate compliance, a small
but real platform team forming. This one has no clean answer — force
yourself to name the *dominant axis* and decide on it, and write what
single fact would flip your recommendation.

### 6. Check the compliance/residency axis with real constraints

```bash
az policy assignment list -o table
az account list-locations -o table
```

Determine whether any policy or residency rule in your subscription would
*override* the cost/control analysis for a given data class. Write one line:
"For data class X, compliance forces [managed/self-hosted/either] because
[rule]." If nothing applies, say so explicitly — "no binding constraint" is
a valid, important finding.

### 7. Diagnose-and-fix: a decision justified on the wrong axis

Here's a real anti-pattern to correct. A team's design doc says: *"We chose
self-hosted Postgres on AKS to save money — a Flexible Server is
$X/month and our Pods are basically free since we already have the
cluster."* Using your exercise 1-2 numbers, find the flaw in the reasoning
and rewrite the justification honestly. Then decide whether the *conclusion*
(self-host) still holds once the reasoning is fixed.

Expected finding: the cost claim ignored engineer-time and incident-risk
(the largest self-hosted line), so "to save money" is likely false for a
small team — the Pods aren't "basically free" once you load in the modules
03-04 operational labor. The fix is either (a) change the justification to a
*real* reason self-hosting wins here (a concrete control/portability
requirement), or (b) if there's no such reason, change the *decision* to
managed. Lesson: a right decision for a wrong reason is a landmine — it gets
cargo-culted to the next workload where the reason is even more wrong.

### 8. Produce a one-page recommendation you'd defend

Pick one of your own real or hypothetical workloads. Write a one-page
decision: the four axes scored, the dominant axis named, the
recommendation, and — critically — the *conditions under which you'd
revisit it* (e.g. "revisit if we exceed 20 databases" or "revisit if Azure
drops support for extension Y"). A decision with no revisit trigger is a
decision nobody will ever re-examine when the facts change.

## Independent challenge

No template given. Take the exact application you'll build in the capstone
(module 08) — an app that needs one Postgres database — and write a genuine
two-sided decision memo a senior engineer would sign off on. Score all four
axes (operational burden, cost, control, compliance) using *real numbers*
you gather with the commands above (fully-loaded cost including
engineer-time, actual tier prices, your subscription's real policy
constraints), name the dominant axis, and make a recommendation. Then —
this is the hard part — write the *strongest honest argument for the option
you did not choose*, and explain specifically why it loses *for this
workload* rather than dismissing it. This draws on module 02's storage
cost model, modules 03-04's operational burden, and module 05's managed
tiers and cost levers. The memo should be good enough that the capstone's
required written comparison is largely a matter of filling in what you
actually observed building both paths.

<details>
<summary>Stuck? One hint</summary>

The trap is treating all four axes as equally weighted every time — they're
not. For most single-database, small-team workloads the *operational
burden* and fully-loaded *cost* axes dominate and point at managed, while
*control* is a theoretical advantage nobody will use. Your memo is only
credible if the "argument for the road not taken" is real: for a managed
recommendation, the strongest counter is a *specific* control or
portability requirement (not "we might want control someday"); for a
self-hosted recommendation, the strongest counter is the engineer-time cost
and the module-04 backup-verification discipline you'd have to sustain
forever.

</details>

## Common mistakes & troubleshooting

- **Scoring all four axes equally every time.** Real decisions turn on a
  single dominant axis for that workload; forcing a balanced scorecard
  hides which fact actually decides it.
- **Comparing sticker prices, not fully-loaded costs.** "Pods are free, the
  managed tier is $X" ignores the largest self-hosted line item —
  engineer-time and incident-risk (exercise 7). Always load in the human
  cost of modules 03-04.
- **Justifying self-hosting with control you'll never use.** "We might need
  a custom extension" is not a present requirement. Control decides it only
  when there's a *concrete, current* need managed can't meet.
- **Treating managed as always-simpler.** Managed removes burden only on
  the paved path; a requirement Azure doesn't support turns "managed" into
  "wait indefinitely for the provider," a burden of its own.
- **Ignoring compliance until late.** Data residency/certification can
  override the other three axes entirely — check it *first*, because it can
  make an elaborate cost/control analysis irrelevant.
- **Deciding once and never revisiting.** The right answer flips with scale,
  team size, and provider capabilities. A decision with no written revisit
  trigger becomes permanent by neglect.
- **Cost pitfall — the decision itself leaves resources running.** Costing
  both paths for real means provisioning both (a CNPG cluster *and* a
  Flexible Server). Tear both down after the analysis — a comparison lab
  that outlives the comparison is exactly the orphaned-disk / idle-server
  bill this track keeps warning about (`az disk list`, `az postgres
  flexible-server list`).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the four axes of the framework, and explain why scoring them
   equally every time is a mistake.
2. On the cost axis, what is the largest self-hosted line item that teams
   most often omit, and why does it flip the naive comparison?
3. Control is a real advantage — but under exactly what condition does it
   actually decide the outcome, versus being a distraction?
4. Give one scenario where the framework points to *managed* and one where
   it points to *self-hosted*, each on its dominant axis.
5. Why should you check the compliance/residency axis *first*?
6. In exercise 7, the reasoning "self-host to save money, the Pods are
   free" was wrong. What was omitted, and what are the two valid ways to
   fix a decision justified on a wrong axis?
7. What makes a decision memo defensible rather than a rationalization of a
   preexisting preference?

<details>
<summary>Show answers</summary>

1. Operational burden, cost, control, and compliance/residency. Scoring
   them equally hides the reality that most decisions turn on a single
   dominant axis for that workload — a balanced scorecard obscures which
   fact actually decides it.
2. Engineer-time (plus incident-risk) — the ongoing operational labor of
   modules 03-04. It flips the naive "Pods are cheaper than a managed tier"
   comparison because that labor is usually the largest fully-loaded cost,
   often making managed cheaper in total for a small team despite the
   bigger line item.
3. Only when there's a *concrete, present* requirement the managed service
   can't meet (a specific extension/version/tuning knob). Wanting control
   in the abstract ("we might need it someday") is a distraction that talks
   teams into unnecessary operational burden.
4. Managed: a small startup, one DB, no DBA, no special needs — operational
   burden and fully-loaded cost dominate. Self-hosted: a regulated
   enterprise that must run identical DBs on-prem/multi-cloud with a custom
   extension — portability and control dominate.
5. Because a residency or certification requirement can override the other
   three axes entirely; discovering it late means potentially redoing a
   whole cost/control analysis that a compliance rule made moot.
6. It omitted engineer-time and incident-risk, so "Pods are free / saves
   money" was likely false for a small team. Fix by either (a) replacing
   the justification with a real reason self-hosting wins here (a concrete
   control/portability need), or (b) changing the decision to managed if no
   such reason exists.
7. It scores the axes with real gathered numbers, names the dominant axis,
   states a revisit trigger, and includes the strongest honest argument for
   the option *not* chosen with a specific reason it loses for this
   workload — rather than dismissing the alternative to protect a habit or
   preference.

</details>

## Next

[07-data-migration-and-connection-resilience](../07-data-migration-and-connection-resilience/README.md) —
whichever path you pick, apps still have to *connect* to the database and
survive its failovers, and you'll often need to *move* data from one path
to the other. Next: migrating data between self-hosted and managed, and the
retry/backoff and connection-pooling patterns that keep an app alive
through the failover windows you measured in module 03.
