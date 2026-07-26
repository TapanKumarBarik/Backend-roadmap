# Rightsizing Compute

## Why this matters

You've entered the **Optimize** phase (module 00), and for most organizations the
biggest single lever is embarrassingly simple: they're paying for compute they
don't use. Over-provisioned VM SKUs, AKS node pools sized for a load that never
came, Container Apps with 4x the CPU they touch — this is the most common and
most recoverable waste in any cloud bill. **Rightsizing** is the discipline of
matching provisioned capacity to actual demand. But it has a sharp edge that
separates real FinOps from naive cost-cutting: a rightsizing recommendation that's
*correct on average* can be *catastrophically wrong* for a bursty or spiky
workload — and blindly applying Advisor's suggestions is how a $50/month saving
becomes a $50,000 outage. This module teaches both the mechanics and the judgment.

## Concepts

### Azure Advisor is your automated Optimize backlog

**Azure Advisor** is a free, built-in service that continuously analyzes your
resources and emits recommendations across five categories; the **Cost** category
is a ready-made **Optimize backlog**. Its cost recommendations typically include:
**rightsize or shut down underutilized VMs** (based on observed CPU/network over a
lookback window, usually ~7-14 days), **buy reserved instances/savings plans**
for steady workloads (module 05), delete **unattached public IPs and idle
resources** (module 04 territory), and more. Each recommendation carries an
**estimated monthly/annual savings** and an **impact** rating. Advisor is where
the Optimize phase gets *concrete* — instead of "we should be more efficient,"
it's a scored list of specific actions with dollar figures. But — and this is the
whole judgment lesson — **Advisor's savings estimate assumes its recommendation is
safe to apply, and it doesn't know your workload's *shape* or its *SLOs* (track
20).** It sees average utilization; it can't see the 9am spike or the month-end
batch. Treat Advisor as a **backlog to triage**, not a set of commands to run.

### Rightsizing a VM: SKU families, and why "smaller" isn't one axis

Rightsizing a VM means changing its **SKU** to better fit observed usage. Azure VM
SKUs come in **families** tuned for different ratios: **general-purpose** (D-series,
balanced CPU:memory), **compute-optimized** (F-series, high CPU:memory),
**memory-optimized** (E-series, high memory:CPU), **burstable** (B-series, cheap
baseline with burst credits — key below), and more. Rightsizing isn't only "go
smaller within a family" (e.g. `D4s_v5` → `D2s_v5`, halving vCPU/RAM/cost); it's
often "**move to the right family**" — a VM using 80% memory but 10% CPU is
wasting money on a balanced D-series and belongs on a memory-optimized E-series,
possibly *cheaper* while *better* fit. The mechanics are easy (`az vm resize`); the
skill is reading utilization to pick the right family *and* size. Two cautions:
resizing usually requires a **reboot/deallocate** (brief downtime — plan it), and
not every SKU is available in every region/zone, so a resize can fail on capacity.

### Rightsizing AKS node pools (track 07 callback)

On AKS (track 07), rightsizing operates at two levels, and conflating them is a
classic error. **Node-level:** the **VM SKU of the node pool** — the same SKU
judgment as above, applied to worker nodes. You can't resize nodes in place; you
**add a new node pool** with the right SKU, cordon/drain the old one, and delete
it (the safe migration pattern from track 07). **Cluster-level:** the **Cluster
Autoscaler** (track 07 module 05) sizes the *number* of nodes to pending pods — so
rightsizing here means setting sensible `--min-count`/`--max-count` and, above all,
setting **pod resource `requests` correctly**, because the autoscaler and the
scheduler bin-pack on *requests*, not actual usage. The subtle, expensive AKS waste:
pods with **inflated CPU/memory `requests`** reserve capacity they never use,
forcing the autoscaler to add nodes you're paying for to satisfy phantom demand.
So AKS rightsizing is often *not* "smaller nodes" but "**honest pod requests**,"
after which the autoscaler naturally runs fewer nodes. Tools like the **Vertical
Pod Autoscaler (VPA)** in *recommendation* mode surface right-sized requests from
observed usage — the Kubernetes-native analog of Advisor.

### Rightsizing Container Apps allocations (track 06 callback)

On Azure Container Apps (track 06), you don't manage VMs at all — you set a
**CPU/memory allocation per replica** (e.g. 0.5 vCPU / 1 GiB), in fixed valid
combinations, and you pay per the vCPU-seconds and GiB-seconds your replicas
consume while running. Rightsizing here is **lowering the per-replica allocation
to fit actual usage** and, just as importantly, tuning the **KEDA scale rules**
(track 06 module 03) — especially **scale-to-zero** (`minReplicas: 0`), the single
biggest Container Apps cost lever, so an idle app costs *nothing* instead of
holding warm replicas. The interplay matters: an over-generous per-replica
allocation multiplied across `maxReplicas` under load is where Container Apps bills
add up. Because Container Apps abstracts the node (track 06 vs track 07's
hand-managed nodes), rightsizing is *simpler* here — allocation + scale rules — but
the same principle holds: match provisioned capacity to real demand, and let it
scale to zero when there's no demand at all.

### The bursty-workload trap: when the recommendation is wrong

Here is the judgment that separates FinOps from cost-cutting. Advisor (and any
average-utilization tool) computes recommendations from **average or percentile
CPU over a lookback window**. A workload with a **low average but sharp bursts** —
a payment service quiet all day that spikes at checkout, a batch job that pegs the
CPU for 20 minutes at 2am, a Black-Friday retailer — has a *low average* and so
gets a "rightsize down" recommendation. **Applying it removes exactly the
headroom the burst needs**, causing throttling, latency-SLO breaches (track 20), or
an outage precisely when the workload matters most. The saving ($X/month) is real;
the risk (a checkout outage) dwarfs it. The correct FinOps move is not "obey
Advisor" and not "ignore Advisor" — it's **look at the utilization *distribution*,
not just the average**: the p95/p99 and the peak, the shape over a representative
window (including your known peak events). For a genuinely bursty workload, the
right answer might be a **burstable B-series** (cheap baseline, bursts on credits)
rather than a smaller fixed SKU, or keeping the size but adding **autoscaling** so
capacity follows demand — not a static downsize. This is exactly module 00's
"value, not just savings," made concrete, and it's this module's diagnose-and-fix.

## Command reference

Advisor and utilization metrics are **free** to read. `az vm resize` and node-pool
changes affect real (billable) resources — the exercises keep them tiny and clean
them up.

| Command | What it does | Example |
|---|---|---|
| `az advisor recommendation list --category Cost` | Lists cost recommendations with estimated savings (the Optimize backlog) | `az advisor recommendation list --category Cost -o table` |
| `az vm list-sizes` / `az vm list-skus` | Shows available SKUs (and their vCPU/RAM) in a region — for picking a target size/family | `az vm list-skus -l eastus --resource-type virtualMachines -o table` |
| `az vm resize` | Changes a VM's SKU (rightsize); usually requires reboot/deallocate | see breakdown below |
| `az monitor metrics list` | Pulls a VM's CPU/utilization metrics — read the *distribution*, not just the average | see breakdown below |
| `az aks nodepool add` / `delete` | Adds a right-SKU node pool / removes the old one (AKS rightsizing, track 07) | `az aks nodepool add -g <rg> --cluster-name <c> -n right --node-vm-size Standard_D2s_v5 --node-count 2` |
| `az containerapp update --cpu --memory` | Changes a Container App's per-replica allocation (track 06) | `az containerapp update -n app -g rg --cpu 0.5 --memory 1.0Gi` |
| `az containerapp update --min-replicas 0` | Enables scale-to-zero (the biggest Container Apps lever, track 06) | `az containerapp update -n app -g rg --min-replicas 0 --max-replicas 5` |

Flag breakdown — `az vm resize --resource-group rg-app --name vm-web --size Standard_B2s`:

- `--name vm-web` — the VM to rightsize.
- `--size Standard_B2s` — the **target SKU**. Here a **burstable B-series** —
  chosen deliberately for a low-average/bursty workload so it keeps a cheap
  baseline but can burst on credits, instead of a fixed smaller SKU that would
  starve the burst. Verify availability with `az vm list-skus -l <region>` first.
- (implicit) resizing across some SKU families forces a **deallocate/reboot** —
  plan the brief downtime; the command may stop/start the VM.

Flag breakdown — read the utilization *distribution* before trusting a recommendation:

```bash
az monitor metrics list \
  --resource $(az vm show -g rg-app -n vm-web --query id -o tsv) \
  --metric "Percentage CPU" \
  --start-time 2026-07-10T00:00:00Z --end-time 2026-07-24T00:00:00Z \
  --interval PT1H \
  --aggregation Average Maximum \
  -o table
```

- `--metric "Percentage CPU"` — the utilization signal Advisor also uses.
- `--start-time`/`--end-time` — a **representative window** (here ~2 weeks);
  include a known peak event if you have one, or Advisor's blind spot becomes yours.
- `--interval PT1H` — hourly buckets; fine-grained enough to reveal spikes an
  average would hide.
- `--aggregation Average Maximum` — **the whole point**: pull `Maximum` alongside
  `Average` so you can see the peaks. A 12% average with a 95% max is a bursty
  workload Advisor will wrongly tell you to shrink.

## Hands-on exercises

Advisor and metrics are free. The VM/Container App exercises create small,
short-lived billable resources — clean them up. Advisor's lookback means brand-new
resources won't have recommendations yet; use *existing* resources where you can.

1. **Pull your cost recommendation backlog.** Run `az advisor recommendation list
   --category Cost -o table` (add the extension if prompted). Read the estimated
   savings and impact. This is your Optimize to-do list — but a *backlog to
   triage*, not a script to run.

2. **Inspect one recommendation in detail.** Pick the highest-savings rightsizing
   recommendation and `az advisor recommendation list --category Cost --query
   "[?contains(shortDescription.solution,'right')]" -o json`. Note the target
   resource and the *assumed* saving. Write down: what does Advisor *not* know
   about this workload?

3. **Read a VM's utilization distribution.** For a real VM (or a small one you
   create), run the `az monitor metrics list` query from the command reference
   with `--aggregation Average Maximum`. Compare the average CPU to the maximum.
   Write both down — the gap between them is the whole rightsizing judgment.

4. **Rightsize a VM down within a family.** Create a small VM, then resize it:
   ```bash
   az group create -n rg-rightsize -l eastus
   az vm create -g rg-rightsize -n vm-demo --image Ubuntu2204 --size Standard_D2s_v5 \
     --admin-username azureuser --generate-ssh-keys --no-wait
   # ...wait for it, then rightsize down:
   az vm resize -g rg-rightsize -n vm-demo --size Standard_B1s
   ```
   Note the resize triggered a deallocate/reboot, and compare the two SKUs' hourly
   prices (portal or `az vm list-skus`). This is the mechanic; the judgment is next.

5. **Choose a family, not just a size.** Using `az vm list-skus -l eastus
   --resource-type virtualMachines --query "[?contains(name,'B2')||contains(name,'D2')||contains(name,'E2')]"
   -o table`, compare a general-purpose `D2s_v5`, a burstable `B2s`, and a
   memory-optimized `E2s_v5` on vCPU/RAM. Write down which you'd pick for: a steady
   80%-CPU service, a low-average bursty web app, and a memory-hungry cache. The
   answer is rarely "the smallest."

6. **Rightsize a Container App allocation and enable scale-to-zero (track 06).**
   If you have a Container App from track 06 (or make a trivial one), lower its
   allocation and let it scale to zero:
   ```bash
   az containerapp update -n <app> -g <rg> --cpu 0.25 --memory 0.5Gi
   az containerapp update -n <app> -g <rg> --min-replicas 0 --max-replicas 5
   ```
   Note that `--min-replicas 0` means an idle app bills **nothing** — the single
   biggest lever on Container Apps (track 06 module 03's KEDA scaling, now framed
   as cost).

7. **(AKS, design or real) Rightsize via honest pod requests.** Reason through (or,
   if you have a cluster up, demonstrate) the AKS lever: a Deployment with
   `requests: cpu: 1000m` that actually uses `50m` forces the autoscaler to reserve
   20x the CPU it needs, adding nodes you pay for. Lower the request to a realistic
   value and observe (or explain) the autoscaler consolidating onto fewer nodes.
   Write the one-sentence rule: *the autoscaler bin-packs on requests, not usage.*

8. **Measure impact before/after (the capstone skill).** For the VM you resized in
   exercise 4, capture its **daily cost before** (module 01 Cost Analysis on that
   resource/RG over the prior week) and its **daily cost after** (over the following
   days — remember the 8-24h lag, so this spans two sessions). Write down the
   measured delta. "We rightsized" is a claim; "we cut this VM from $X to $Y/day,
   measured" is FinOps. The capstone requires exactly this before/after.

9. **Diagnose and fix: the wrong recommendation for a bursty workload.** The
   judgment exercise. Take a VM (real or hypothetical) that Advisor says to
   downsize from `D2s_v5` to `B1s` for a $Z/month saving. Pull its CPU with
   `--aggregation Average Maximum` over a window **including a peak**: suppose the
   **average is 9%** but the **maximum is 96%** (a spike at checkout / a nightly
   batch). **Diagnose:** the recommendation is computed from the *average* and is
   **wrong** — `B1s` would throttle during the spike, breaching a latency SLO
   (track 20) and risking an outage worth far more than $Z. **Fix, three correct
   options:** (a) keep the size and add **autoscaling** so capacity follows the
   burst; (b) move to a **burstable B-series sized for the burst** (`B2s`+), whose
   credit model *is* built for low-average/spiky loads, rather than a fixed tiny
   SKU; (c) accept the recommendation only after confirming the peak is genuinely
   gone. The wrong fix is applying Advisor's number blindly. Lesson: **rightsize on
   the utilization *distribution* (p95/max/peak events), never the average — a
   saving that risks an outage is a FinOps failure (module 00).**

10. **Clean up.**
    ```bash
    az group delete -n rg-rightsize --yes --no-wait
    ```
    Delete any Container App/AKS resources you spun up unless a later module needs
    them. Confirm with `az group show -n rg-rightsize -o table` (gone).

## Independent challenge

No commands given. Drawing on this module, Azure Advisor, the metric-reading from
**track 12** (observability), your AKS knowledge from **track 07** (node pools,
autoscaler) and Container Apps from **track 06** (allocations, KEDA), and the
before/after measurement discipline from **module 01**, produce a **rightsizing
proposal** for three real (or realistic) workloads on your subscription: one VM,
one AKS node pool *or* pod-request fix, and one Container App. For each, state the
**observed utilization distribution** (average *and* peak/p95, not just average),
the **recommended change** (target SKU/family, node count, allocation, or request
value — with justification), the **estimated saving**, and — mandatory — the
**risk and how you'd de-risk it** (SLO check, autoscaling, burstable SKU, staged
rollout). Include at least one workload where the *naive* recommendation is
**wrong** and you override it, explaining why in business terms. The deliverable is
the written proposal with the exact metric queries backing each utilization claim.

<details>
<summary>Stuck? One hint</summary>

Start every workload from `az monitor metrics list --aggregation Average Maximum`
(or the Container Apps / AKS equivalent), over a window that *includes* a known
peak — the peak is the thing Advisor can't see and the thing that determines
whether the recommendation is safe. For the "wrong recommendation" workload, pick
something with an obvious spike shape (a checkout service, a nightly batch, a
cron-triggered job): its low average will earn a downsize recommendation that its
high peak makes dangerous. The de-risk move is almost always one of three:
**autoscale** so capacity tracks demand (HPA/Cluster Autoscaler from track 07,
KEDA from track 06), choose a **burstable B-series** whose credit model fits a
spiky load, or **stage** the change and watch the SLO (track 20) before committing.
The saving is the easy half; the risk column is where the FinOps judgment lives.

</details>

## Common mistakes & troubleshooting

- **Applying Advisor recommendations blindly.** Advisor sees *average*
  utilization, not your workload's shape or SLOs. Its estimate assumes the change
  is safe. Triage the backlog against the utilization *distribution* — never
  auto-apply.
- **Reading the average and ignoring the peak.** A 10% average with a 95% max is a
  bursty workload a downsize would break. Always pull `Maximum`/p95 alongside
  `Average` over a window that includes known peaks.
- **Thinking rightsizing means "one size smaller."** Often the win is a *different
  family* (memory-optimized for a memory-heavy VM, burstable for a spiky one) —
  sometimes cheaper *and* better-fitting than a smaller same-family SKU.
- **Trying to resize AKS nodes in place.** You can't — add a new right-SKU node
  pool, cordon/drain, and delete the old one (track 07's safe migration).
- **Chasing node count instead of fixing pod requests.** The autoscaler bin-packs
  on **requests**, not usage. Inflated requests reserve phantom capacity and add
  nodes you pay for; honest requests are the real AKS lever.
- **Forgetting scale-to-zero on Container Apps.** `minReplicas: 0` makes an idle
  app free (track 06). Leaving a warm replica running 24/7 for a rarely-used app is
  pure waste.
- **Claiming savings without measuring them.** "We rightsized" is not a result.
  Capture before/after daily cost (module 01) across the data lag — the measured
  delta is the deliverable (and a capstone requirement).
- **Ignoring the reboot/capacity cost of a resize.** `az vm resize` can force a
  deallocate/reboot and can fail if the target SKU is unavailable in the
  region/zone. Plan the downtime and check availability first.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What is Azure Advisor's Cost category, and why should you treat it as a
   *backlog to triage* rather than a list of commands to run?
2. Rightsizing a VM isn't just "go smaller." What's the other axis, and give an
   example where moving *family* is the right (possibly cheaper) call?
3. On AKS, what are the two levels rightsizing operates at, and what's the subtle,
   expensive mistake involving pod `requests` and the autoscaler?
4. On Container Apps, what two knobs do you tune to rightsize, and which single
   setting is the biggest cost lever for a rarely-used app?
5. Explain the bursty-workload trap: why does an average-based recommendation go
   wrong, and what should you look at instead?
6. Give three legitimate ways to handle a low-average/high-peak workload instead of
   blindly downsizing it.
7. Why is measuring before/after cost (not just making the change) a required part
   of rightsizing, and which module's tooling do you use?
8. A rightsizing saves $50/month but risks a checkout outage during peak. In
   FinOps terms (module 00), is applying it a success or a failure, and why?

</details>

<details>
<summary>Show answers</summary>

1. It's a free, continuously-updated list of specific cost actions (rightsize/shut
   down VMs, buy reservations, delete idle resources) with estimated savings. Triage
   it because Advisor's estimate **assumes the change is safe** and is computed from
   **average utilization** — it doesn't know your workload's shape or SLOs.
2. The other axis is **SKU family**. A VM at 80% memory / 10% CPU is wasting money
   on a balanced D-series and belongs on a **memory-optimized E-series** — often a
   better fit *and* cheaper than a smaller D-series, because you stop paying for CPU
   you don't use.
3. **Node-level** (the node pool's VM SKU — migrate via a new pool, can't resize in
   place) and **cluster-level** (autoscaler node *count* + pod requests). The subtle
   mistake: **inflated pod `requests`** — the autoscaler and scheduler bin-pack on
   requests, not actual usage, so over-requesting reserves phantom capacity and adds
   nodes you pay for. Honest requests are the real lever.
4. The **per-replica CPU/memory allocation** and the **KEDA scale rules**
   (min/max replicas). The biggest lever is **scale-to-zero** (`minReplicas: 0`) —
   an idle app then bills nothing.
5. Recommendations are computed from **average/percentile CPU over a lookback**. A
   workload with a **low average but sharp bursts** gets a downsize recommendation
   that removes exactly the headroom the burst needs — causing throttling/SLO
   breaches/outages at peak. Look at the **distribution** (p95/max and known peak
   events), not the average.
6. (a) Keep the size and add **autoscaling** so capacity follows demand;
   (b) move to a **burstable B-series** sized for the burst (its credit model fits
   spiky loads); (c) downsize only after confirming the peak is genuinely gone. Not:
   apply Advisor's number blindly.
7. Because "we rightsized" is a claim, not a result — only the **measured** delta
   proves value and catches a change that didn't help (or hurt). Use **module 01**
   Cost Analysis on the resource/RG, before and after, across the 8-24h data lag.
8. A **failure**. FinOps maximizes business value per dollar; a $50/month saving
   that risks an outage worth orders of magnitude more destroys value. The correct
   move is to de-risk (autoscale/burstable/stage), not to take the naive saving.

</details>

## Next

Continue to
[04-storage-and-data-cost-optimization](../04-storage-and-data-cost-optimization/README.md)
— compute is usually the biggest lever, but storage and data are the *quietest*
waste: orphaned disks billing for weeks (the exact track-14 trap), un-tiered blobs,
and Log Analytics retention (track 12) silently accumulating. Next you'll sweep and
tier the storage side of the bill.
