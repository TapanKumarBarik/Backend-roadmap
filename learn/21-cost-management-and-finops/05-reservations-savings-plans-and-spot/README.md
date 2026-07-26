# Reservations, Savings Plans, and Spot

## Why this matters

Rightsizing (module 03) and cleanup (module 04) reduce the compute you *provision*.
This module reduces the **rate** you pay for the compute you've decided you
genuinely need — the last big Optimize lever, and the one where a single decision
can cut a steady workload's compute bill by 40-70%. But it's a **commitment**
lever: the discounts come from promising Azure your spend up front, and the wrong
commitment locks you into paying for capacity you later don't want. The three
instruments — **Reserved Instances**, **Savings Plans**, and **Spot** — trade
**commitment against flexibility** in different ways, and matching the instrument
to the workload's *stability* is the entire skill. Get it right and it's the
highest-ROI hour in this track; get it wrong and you've prepaid for a mistake.

## Concepts

### The commitment-for-discount bargain (and amortized cost, module 01)

Pay-as-you-go (PAYG) is the flexible, expensive default: you pay the on-demand rate
by the second and can stop anytime. Azure's commitment discounts flip that: **you
promise a level of usage or spend for 1 or 3 years, and in exchange pay a
substantially lower rate.** The provider gets predictable revenue and capacity
planning; you get a discount for giving up flexibility. This is *only* a good deal
for **stable, predictable, always-on** workloads — a database that runs 24/7, a
baseline of production nodes that's always up. Committing to spend you won't
actually use is worse than PAYG (you pay for nothing). Crucially, this is where
**amortized cost** from module 01 becomes real: a commitment purchase shows as a
spike in *actual* cost and a flat daily amount in *amortized* cost — so once you
start buying reservations, you **must** analyze with amortized cost or your daily
charts become nonsense. Commitments and the amortized view are two sides of one
coin.

### Reserved Instances: commit to a specific resource shape

A **Reserved Instance (RI)** is a commitment to a **specific resource type** for 1
or 3 years — classically a **VM SKU in a region** (e.g. "a `D4s_v5` in East US for
3 years"), but RIs also exist for other resources (Azure SQL, Cosmos DB, Blob
storage capacity, Software plans). You commit to the *shape*, and Azure applies the
reduced rate to any matching running resource. The trade-off:

- **Biggest discount** of the three instruments (often ~40-60%+ for 3-year).
- **Least flexible** — it's tied to a resource shape. If you rightsize that
  `D4s_v5` down to a `D2s_v5` next quarter (module 03!), the reservation may no
  longer fully match. RIs have **instance-size flexibility** *within* a family
  (a D-family reservation can apply across D sizes in the group), which softens
  this, but change the *family* or region and the fit degrades.
- Payment: all-upfront (biggest discount) or monthly.

RIs suit a workload you're **confident about at a specific size** for years — a
steady production database tier, a fixed baseline of identical nodes. The risk is
exactly the tension with module 03: **reserve, then rightsize, and you've committed
to a shape you no longer run.** Sequence matters — **rightsize first, then reserve
the right-sized shape.**

### Savings Plans: commit to spend, keep shape flexibility

An **Azure Savings Plan** is the newer, more flexible commitment: instead of
committing to a *resource shape*, you commit to a **fixed hourly spend** (e.g.
"$10/hour on compute") for 1 or 3 years, and Azure automatically applies the
discounted rate to **whatever eligible compute you run** up to that amount, across
**SKUs, regions, and even services** (VMs, Container Instances, some others). The
trade-off vs. RIs:

- **Slightly smaller discount** than an equivalent RI (you pay a little for the
  flexibility).
- **Much more flexible** — you can rightsize, change SKU families, move regions,
  or shift between eligible services and *keep* the discount, as long as your
  hourly compute spend stays at or above the commitment. This directly **resolves
  the RI-vs-rightsizing tension** — a Savings Plan doesn't care that you swapped
  `D4s_v5` for a `D2s_v5`.
- Any eligible usage **above** the commitment is billed at PAYG; usage **below**
  it is wasted commitment.

The rule of thumb: **RI for a shape you're certain won't change (max discount);
Savings Plan for steady spend whose *shape* might evolve (flexibility).** Many orgs
layer them — RIs for the rock-stable core, a Savings Plan over the variable-but-
always-present remainder.

### Spot: dirt-cheap, interruptible capacity

**Spot VMs** (and **AKS spot node pools**, track 07) are the opposite bargain: Azure
sells you its **spare capacity** at a steep discount (often 60-90% off) with **no
availability guarantee** — Azure can **evict** your spot instance with ~30 seconds'
notice when it needs the capacity back (or when your price cap is exceeded). No
commitment, huge discount, but the workload **must tolerate sudden termination**.
Spot fits **fault-tolerant, interruptible, stateless, or re-runnable** work: batch
jobs, CI runners, dev/test, stateless workers behind a queue, ML training with
checkpointing, and — on AKS — a **spot node pool** for workloads that can reschedule
(with `spec.tolerations` for the spot taint, so only opted-in pods land there). It
is **wrong** for anything that must stay up: a production database, a stateful
singleton, a latency-critical always-on service. A common robust pattern is
**mixed node pools**: a small on-demand (or reserved) pool for the baseline/critical
pods and a spot pool the Cluster Autoscaler (track 07 module 05) scales for the
interruptible bulk — cheap capacity with a safe floor. The mental model: Spot trades
**reliability** for price; RI/Savings Plans trade **flexibility** for price.

### Choosing: a decision framework across the three

Put the three on one axis of **how much you're willing to give up for the
discount**:

| Instrument | You give up | You get | Right for |
|---|---|---|---|
| **Reserved Instance** | Flexibility (locked to a shape, 1-3 yr) | Biggest discount | Stable workload, **known size**, for years (steady DB tier, fixed node baseline) |
| **Savings Plan** | Flexibility (locked to hourly *spend*, 1-3 yr) — but shape-free | Big discount, keeps SKU/region/service flexibility | Steady **spend** whose shape may change (evolving fleet you'll rightsize) |
| **Spot** | Reliability (evictable, ~30s notice) | Steepest discount, no commitment | Interruptible/stateless/re-runnable work (batch, CI, dev, stateless workers) |
| **PAYG** | Nothing | Nothing (full price) | Spiky/unpredictable/short-lived workloads not worth committing |

The decision procedure: (1) **rightsize first** (module 03) so you commit to the
*correct* size; (2) identify your **always-on baseline** vs. your **variable** vs.
your **interruptible** load; (3) cover the interruptible part with **Spot**, the
stable-and-fixed part with **RIs**, and the stable-but-evolving remainder with a
**Savings Plan**; (4) leave genuinely spiky/short-lived load on **PAYG**. Model the
**break-even** before committing — a 1-year commitment only pays off if you'll
actually run that workload for most of the year; if there's real doubt, a shorter
term or a Savings Plan's flexibility is the safer bet. This is module 00's "value,
not just savings" again: the biggest discount on capacity you won't use is negative
value.

## Command reference

Reservations and savings plans are **real financial commitments** — the exercises
mostly *inspect, price, and model* them (free) rather than buy (which spends real
money for 1-3 years; **don't buy one for a lab**). Spot VMs/node pools are cheap and
cleaned up.

| Command | What it does | Example |
|---|---|---|
| `az reservations reservation-order list` | Lists reservation orders you hold (inspect existing commitments) | `az reservations reservation-order list -o table` |
| `az reservations catalog show` | Shows purchasable reservation SKUs/terms and prices for a region | `az reservations catalog show --reserved-resource-type VirtualMachines --location eastus` |
| Cost Management → Reservations → "Buy" (portal) | Shows **recommendations** (which RIs/Savings Plans would save, based on your usage) | portal; or `az consumption reservation recommendation list` |
| `az consumption reservation recommendation list` | Azure's data-driven RI recommendations from your actual usage | `az consumption reservation recommendation list --query "[].{sku:skuName, savings:netSavings, term:term}" -o table` |
| `az reservations reservation-order calculate` | Prices a specific reservation before buying (break-even modeling) | `az reservations reservation-order calculate --billing-scope <id> --reserved-resource-type VirtualMachines ...` |
| `az vm create --priority Spot` | Creates a Spot VM (evictable, cheap) | see breakdown below |
| `az aks nodepool add --priority Spot` | Adds an AKS **spot node pool** (track 07) | see breakdown below |

Flag breakdown — `az vm create --resource-group rg --name vm-batch --image Ubuntu2204 --priority Spot --max-price -1 --eviction-policy Deallocate --size Standard_D2s_v5`:

- `--priority Spot` — provision as **Spot** (spare capacity, steep discount,
  evictable).
- `--max-price -1` — the price cap; **-1** means "pay up to the on-demand price"
  (only evicted for *capacity*, not price). A set cap (e.g. `0.05`) also evicts you
  if the spot price rises above it — cheaper but more evictions.
- `--eviction-policy Deallocate` — on eviction, **stop/deallocate** the VM (you keep
  the disk, can restart later) vs. `Delete` (fully removed). `Deallocate` suits work
  you'll resume; `Delete` suits fully ephemeral runs.

Flag breakdown — `az aks nodepool add --resource-group rg --cluster-name aks --name spotpool --priority Spot --eviction-policy Delete --spot-max-price -1 --enable-cluster-autoscaler --min-count 0 --max-count 10 --node-taints "kubernetes.azure.com/scalesetpriority=spot:NoSchedule"`:

- `--priority Spot --spot-max-price -1` — a spot node pool at up to on-demand price
  (evicted only on capacity).
- `--enable-cluster-autoscaler --min-count 0 --max-count 10` — let the autoscaler
  (track 07 module 05) scale spot nodes **from zero**, so the cheap pool only exists
  when there's interruptible work.
- `--node-taints "...scalesetpriority=spot:NoSchedule"` — taint spot nodes so **only
  pods that explicitly tolerate spot** land there — the safe-floor pattern that keeps
  critical pods on the on-demand pool.

## Hands-on exercises

Inspection, recommendations, and pricing are **free** — do those for real. **Do not
actually buy** a reservation or savings plan for a lab (it's a 1-3 year real
commitment). Spot VMs/pools are cheap; clean them up.

1. **Read Azure's own commitment recommendations.** Run
   `az consumption reservation recommendation list --query "[].{sku:skuName, term:term, savings:netSavings}" -o table 2>/dev/null || echo "view under Cost Management → Reservations → Add in the portal"`.
   These are computed from *your* usage — Azure telling you which RIs would pay off.
   Note the SKUs and the estimated savings; this is where you'd start a real
   commitment decision.

2. **Browse the reservation catalog and compare terms.** Run
   `az reservations catalog show --reserved-resource-type VirtualMachines --location eastus -o table 2>/dev/null | head`.
   Compare 1-year vs 3-year pricing for a SKU you actually run. Write down the
   discount vs. PAYG for each term — the longer term is cheaper but a bigger bet.

3. **Model a break-even.** Take a VM SKU you run steadily. Find its PAYG monthly
   cost (module 01 / portal) and a 1-year RI price. Compute: how many months must
   you run it for the RI to beat PAYG? Then ask honestly: *are you confident it'll
   run that long at that size?* Write the break-even months and your confidence.
   This is the actual reservation decision, done on paper.

4. **The rightsize-then-reserve ordering (thought exercise).** Suppose you reserve a
   `D4s_v5` for 3 years, then next quarter module 03 says rightsize it to `D2s_v5`.
   Write down what happens to the reservation's fit, how instance-size flexibility
   *within the family* helps, and why the correct sequence is **rightsize first,
   then reserve**. This ordering trap is exercise 9's fix.

5. **Compare RI vs Savings Plan for one workload.** For a steady workload you expect
   to *evolve* (you'll probably change its SKU within a year), argue in writing
   whether an RI or a Savings Plan fits better and why. Then do the same for a
   workload you're certain is fixed for 3 years. The two answers should differ — if
   they don't, re-read the flexibility trade-off.

6. **Create a Spot VM and understand eviction.** Make a cheap spot VM:
   ```bash
   az group create -n rg-spot-lab -l eastus
   az vm create -g rg-spot-lab -n vm-spot --image Ubuntu2204 --size Standard_D2s_v5 \
     --priority Spot --max-price -1 --eviction-policy Deallocate \
     --admin-username azureuser --generate-ssh-keys --no-wait
   ```
   Compare its price to the same SKU on-demand (portal). Write down what
   `--eviction-policy Deallocate` vs `Delete` means for a job you'd want to resume vs.
   one that's fully ephemeral, and why a production database must **never** be Spot.

7. **(AKS, design or real) Add a spot node pool with a safe floor.** Reason through
   (or, with a cluster up, run) the `az aks nodepool add --priority Spot ... --node-taints`
   pattern from the command reference. Explain the mixed-pool design: critical pods
   on the on-demand pool, interruptible pods *tolerating* the spot taint on the
   autoscaled-from-zero spot pool. Write the one-sentence rule: *Spot for
   interruptible, on-demand/reserved for the floor.*

8. **Pick instruments for a whole fleet.** Take a realistic fleet: a 24/7 production
   database, a fixed baseline of 3 always-on API nodes, a variable API tier that
   scales with traffic, a nightly batch job, and CI runners. Assign each to RI /
   Savings Plan / Spot / PAYG **and justify each choice** using stability and
   interruptibility. This is the module's core competency in one table.

9. **Diagnose and fix: the commitment that no longer fits.** The commitment
   footgun. Scenario: six months ago the team bought a **3-year RI for a `D8s_v5`**
   to save money; then, following module 03, they **rightsized the workload to a
   `D2s_v5`**. Now Cost Analysis (amortized, module 01) shows the reservation is
   **under-utilized** — they're paying for `D8s_v5` capacity they no longer run.
   **Diagnose:** RI committed to a *shape*, and rightsizing changed the shape;
   instance-size flexibility covers *within-family* sizing so *some* benefit still
   applies across D-sizes, but the commitment was oversized for the new footprint —
   a classic **reserve-before-rightsize** mistake. **Fix options:** (a) check whether
   **instance-size flexibility** already reapplies the reservation to the smaller
   D-SKUs (often it partially does); (b) **exchange** the reservation for one matching
   the new footprint (Azure allows reservation exchanges within rules); (c) for the
   future, prefer a **Savings Plan** for evolving workloads so shape changes don't
   strand the commitment; and (d) **always rightsize first, then commit**. Lesson:
   **commit to the size you'll actually run — sequence rightsizing *before*
   reserving, and use Savings Plans when the shape is uncertain.**

10. **Clean up.**
    ```bash
    az group delete -n rg-spot-lab --yes --no-wait
    ```
    You didn't buy any real commitment (correct). Confirm the spot lab RG is gone.

## Independent challenge

No commands given. Drawing on this module, the rightsizing discipline from
**module 03**, the amortized-vs-actual view from **module 01**, AKS node pools and
the Cluster Autoscaler from **track 07**, and Container Apps scaling from **track
06**, produce a **commitment-and-capacity strategy** for a realistic three-tier
application on your subscription: a stateful production database, an always-on API
baseline, an autoscaling API tier, and a batch/CI workload. For each tier, choose
**RI / Savings Plan / Spot / PAYG**, justify it in terms of **stability vs.
flexibility vs. interruptibility**, state the **term** (1 vs 3 year) and a
**break-even** rationale for any commitment, and identify the **one ordering rule**
(vs. module 03) you must follow so a future rightsize doesn't strand a commitment.
Finish with two or three sentences on why, once you've bought anything here, all
your cost analysis (modules 01, 06) must switch to the **amortized** view. Model,
justify, and write it — **do not actually purchase** a reservation or savings plan.

<details>
<summary>Stuck? One hint</summary>

Sort the fleet by two questions before picking any instrument: *"is it always on?"*
and *"can it survive being killed with 30 seconds' notice?"* The batch/CI tier
answers "no" to always-on and "yes" to survivable → **Spot**. The database answers
"yes/critical" and "no, must stay up" → never Spot; if its size is truly fixed for
years, **RI** (max discount), otherwise **Savings Plan**. The always-on API
baseline is a Savings Plan (steady spend, but you'll likely rightsize it, so keep
shape-flexibility). The autoscaling variable tier and anything spiky stays **PAYG**
below the commitment line. The ordering rule is the module's whole cautionary
tale: **rightsize (module 03) *then* commit**, or you reserve a shape you're about
to change — and prefer a Savings Plan whenever the shape is even slightly uncertain.

</details>

## Common mistakes & troubleshooting

- **Reserving before rightsizing.** Commit to a shape, then module 03 changes the
  shape, and you've stranded the commitment. Always **rightsize first, then
  reserve** the correct size.
- **Committing to spend you won't use.** A commitment below your real usage saves
  money; a commitment *above* it wastes money — you pay for capacity you don't run.
  The biggest discount on unused capacity is negative value.
- **Using an RI where a Savings Plan fits.** If the workload's *shape* might evolve,
  an RI's shape-lock will hurt; a Savings Plan keeps SKU/region/service flexibility
  for a slightly smaller discount. Match the instrument to how fixed the shape is.
- **Putting the wrong thing on Spot.** Spot is evictable with ~30s notice. A
  production database, stateful singleton, or latency-critical always-on service
  must never be Spot. Spot is for interruptible/stateless/re-runnable work.
- **No safe floor on a spot node pool.** Taint spot nodes and keep a small
  on-demand/reserved pool for critical pods, so an eviction storm can't take out the
  baseline. Autoscale the spot pool from zero.
- **Analyzing cost with the actual view after committing.** Once you buy a
  reservation/savings plan, *actual* cost shows a purchase spike and misleading
  zeros; switch all engineering/allocation analysis to **amortized** (module 01).
- **Ignoring break-even and confidence.** A 1-3 year commitment only pays off if the
  workload runs most of the term at that size. If you're not confident, choose a
  shorter term, a Savings Plan, or stay on PAYG.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What's the fundamental bargain behind all commitment discounts, and what kind of
   workload is it *only* a good deal for?
2. What does a Reserved Instance commit you to, what's its main advantage and its
   main drawback, and how does instance-size flexibility soften the drawback?
3. What does a Savings Plan commit you to instead, and which specific tension with
   module 03 does that flexibility resolve?
4. What is Spot capacity, what do you give up for its discount, and name two
   workloads it fits and one it must never be used for.
5. State the one-line rule for choosing RI vs. Savings Plan vs. Spot.
6. What is the correct *ordering* between rightsizing (module 03) and reserving, and
   what goes wrong if you reverse it?
7. Once you buy any commitment, which module 01 cost view must you analyze with, and
   why does the other view become misleading?
8. Describe the mixed-node-pool pattern on AKS (track 07) and what the taint on the
   spot pool accomplishes.

</details>

<details>
<summary>Show answers</summary>

1. You **promise 1-3 years of usage or spend** in exchange for a much lower rate —
   trading flexibility for discount. It's only a good deal for **stable,
   predictable, always-on** workloads; committing to usage you won't consume is
   worse than PAYG.
2. An RI commits to a **specific resource shape** (e.g. a VM SKU in a region) for
   1-3 years. Advantage: **biggest discount**. Drawback: **least flexible** — tied to
   the shape, so changing size/family/region degrades the fit. **Instance-size
   flexibility** lets a family reservation apply across sizes *within* that family
   group, softening (not eliminating) the lock.
3. A Savings Plan commits to a **fixed hourly spend**, shape-free — Azure applies the
   discount to whatever eligible compute you run up to that amount across
   SKUs/regions/services. It resolves the **reserve-vs-rightsize tension**: you can
   rightsize/change SKU and keep the discount.
4. Spot is Azure's **spare capacity** at a steep discount with **no availability
   guarantee** — evictable with ~30s notice. You give up **reliability**. Fits
   batch/CI/dev/stateless-workers/checkpointed-ML; must **never** run a production
   database or stateful/latency-critical always-on service.
5. **RI** for a shape you're certain won't change (max discount); **Savings Plan**
   for steady spend whose shape may evolve (flexibility); **Spot** for
   interruptible/stateless/re-runnable work (steepest discount, no commitment).
6. **Rightsize first, then reserve** the correct size. Reversed, you commit to a
   shape and then change it, stranding the reservation on capacity you no longer run
   (the module's diagnose-and-fix).
7. **Amortized** cost. After a commitment, *actual* cost shows a big purchase spike
   and then misleading zeros, so daily/allocation analysis only makes sense on the
   amortized view that spreads the purchase across usage.
8. A small **on-demand/reserved** pool for baseline/critical pods plus an
   **autoscaled-from-zero spot pool** for interruptible pods. The **taint** on the
   spot pool ensures only pods that *tolerate* spot schedule there, keeping critical
   pods on the safe on-demand floor even during a spot eviction.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-05 or earlier tracks while attempting these —
find out what actually stuck. These mix the whole Optimize phase (modules 03-05)
with the Inform foundations (00-02) and the tagging/AKS/observability tracks.

1. A steady production service is over-provisioned *and* on PAYG. Walk the full
   Optimize sequence you'd apply, in the right order, naming the module for each
   step — and explain why doing them out of order (committing before rightsizing)
   is a documented mistake.
2. Give one workload each that is best served by rightsizing-down, by cleanup, by an
   RI, by a Savings Plan, and by Spot — and the single property of each workload
   that makes that the right lever.
3. You bought a 3-year RI, then your daily *actual*-cost chart went weird (a spike,
   then near-zero for that VM). Explain what happened in terms of module 01, and
   what you must do to all your cost analysis from now on.
4. A bursty checkout service (module 03) and a nightly batch job (module 05) both
   have low average CPU. Why do they get *opposite* correct treatments, and what
   would blindly downsizing each cause?
5. Tie tagging (track 17 module 06) to two different Optimize activities: how does
   the `Owner` tag help an orphan sweep (module 04), and how does `CostCenter` help
   you decide whether a commitment is worth it (modules 01/05)?
6. Storage waste and an over-committed reservation are both "paying for capacity you
   don't use," yet they hide differently. Contrast *why* each is invisible in a
   naive cost view and which module's tool surfaces each.
7. You have an AKS cluster (track 07) running a mix of critical API pods and
   interruptible workers. Design the node-pool + commitment strategy across modules
   03/05 and track 07: SKUs, pools, taints, autoscaling, and which pools you'd
   reserve vs. leave spot vs. PAYG.
8. From a blank page, list the Optimize-phase levers in rough order of "biggest,
   cheapest win first" for a typical over-provisioned estate, and name the one
   judgment check (module 03) that stops any of them from becoming a FinOps failure.
9. A teammate proposes archiving all logs older than 30 days to Blob Archive and
   buying a 3-year RI for the log-analytics ingestion VM. Critique both ideas using
   modules 04 and 05 — what's right, what's risky, and what's a category error.
10. Explain how *every* module so far feeds the single sentence "we cut this
    workload's cost from $X to $Y/day without breaking its SLO" — naming which
    module provides the measurement, which the change, which the judgment, and which
    the guardrail.

<details>
<summary>Show answers</summary>

1. (1) **Rightsize** the over-provisioning (module 03) so you commit to the correct
   size; (2) **clean up** any orphans/tiers around it (module 04); (3) then apply a
   **commitment** — RI if the right-sized shape is fixed for years, Savings Plan if
   it'll evolve (module 05). Out of order (commit first) strands the commitment when
   you later rightsize the shape — the module 05 footgun.
2. Rightsize-down: an over-provisioned steady VM (average *and* peak both low →
   genuinely oversized). Cleanup: an unattached disk (provisioned-but-unused).
   RI: a fixed-size 24/7 database (stable + known shape). Savings Plan: an always-on
   fleet you'll rightsize (steady spend, evolving shape). Spot: a nightly batch job
   (interruptible/re-runnable).
3. A commitment purchase shows as a **spike in actual cost on the purchase day**,
   then near-zero for that resource's compute (module 01 amortized-vs-actual). From
   now on analyze with **amortized** cost, which spreads the purchase across usage
   days, or your daily/allocation charts are meaningless.
4. The checkout service must **stay up during its spike**, so downsizing removes the
   headroom it needs → SLO breach/outage; correct treatment is keep size + autoscale
   or a burstable SKU (module 03). The batch job **tolerates interruption**, so
   correct treatment is cheap **Spot** (module 05). Blindly downsizing the checkout
   causes a peak outage; blindly leaving batch on-demand just overpays.
5. `Owner` (track 17) tells an orphan sweep *whose* resource it is, so you can safely
   confirm before deleting (module 04) instead of guessing. `CostCenter` lets you
   isolate a team's steady spend in Cost Analysis (modules 01/05) to see whether it's
   large and stable enough to justify a commitment — you commit against *allocated*
   steady spend, not a blur.
6. An **orphan** is invisible because it's decoupled from compute — no utilization to
   show — so only a **Resource Graph sweep/Advisor** (module 04) finds it. An
   **over-committed reservation** is invisible in the *actual* view (it looks paid-for)
   and only shows as under-utilization in the **amortized** view / reservation
   utilization report (modules 01/05).
7. On-demand or **reserved** pool for the critical API baseline (Savings Plan/RI on
   its steady size), a **spot** node pool (tainted, autoscaled from zero, track 07
   module 05) for interruptible workers that tolerate the spot taint, and PAYG
   headroom for spiky bursts. Rightsize the pods' requests first (module 03) so the
   autoscaler runs the right node count.
8. Roughly: **delete orphans** (module 04, free money), **rightsize** over-provisioned
   compute (module 03), **tier/retention** storage and logs (module 04), then
   **commit** (RI/Savings Plan) and **Spot** the interruptible load (module 05). The
   judgment check: **read the utilization distribution/SLO, not the average**
   (module 03) — it's what stops a saving from causing an outage (module 00).
9. Archiving logs older than 30 days: fine *only* if you genuinely never query them
   interactively — Archive retrieval is slow/expensive, and log-analytics data isn't
   Blob anyway (retention/archive is tuned on the workspace, module 04), so "move to
   Blob Archive" is partly a **category error**. Buying a 3-year RI for the ingestion
   VM is risky: only worth it if that VM is truly fixed for 3 years and you've
   rightsized it first (module 05) — otherwise a Savings Plan or PAYG is safer.
10. **Measurement:** module 01 (before/after amortized cost). **Change:** modules
    03/04/05 (rightsize/cleanup/tier/commit/Spot). **Judgment:** module 03/00 (read
    the distribution and SLO so the change is safe, value not just savings).
    **Guardrail:** module 02 (a budget/alert that would catch it regressing). The
    sentence is only true when all four are present.

</details>

## Next

Continue to
[06-showback-and-chargeback](../06-showback-and-chargeback/README.md)
— you can now see, allocate, guard, and optimize spend. The **Operate** phase makes
it stick culturally: attributing cost back to the teams who incur it (showback) and,
sometimes, actually billing them for it (chargeback) — the organizational
conversation that turns cost from a platform-team headache into something every team
owns, built entirely on the track-17 tags you've keyed off all track.
