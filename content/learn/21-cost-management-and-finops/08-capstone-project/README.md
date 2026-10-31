# Capstone Project

## Why this matters

This is where the whole track stops being eight separate skills and becomes one
practice. Across modules 00-07 you learned each piece of FinOps in isolation — the
framework, cost analysis, budgets, rightsizing, storage cleanup, commitments,
showback, and the CI/CD gate. But a real FinOps practitioner never gets to do these
one at a time; they arrive together as a single ongoing discipline over a real,
running, costing subscription. There's no new concept and no quiz here. The goal is
to prove you can **operate the full loop** — Inform, Optimize, Operate (module 00) —
against **your own real Azure cost data**, and to produce **evidence** for each
piece, because in FinOps a claim without a measured before/after is just an opinion.
Everything you touch here is real money on your real subscription, which is exactly
the point — and exactly why every part ends in cleanup.

Treat this as a project, not a checklist of isolated tasks. The pieces build on each
other in the order you'd actually run them: first make cost *visible and allocated*
(Inform), then *change* it and *prove* the change (Optimize), then *keep it that way*
with guardrails (Operate).

## The project

Run a **complete FinOps engagement** on your own real Azure subscription — the same
subscription you've used across the curriculum, ideally with real usage on it from
the earlier tracks so there's genuine spend to analyze. Your deliverable has five
parts, each producing **evidence**, all keyed off the **tagging taxonomy from track
17 module 06** (`CostCenter`/`Environment`/`Owner`/`DataClassification`):

1. **A real cost analysis grouped by the track-17 tags** (modules 00-01). Produce a
   written cost breakdown of your subscription for a **complete period** (last
   month), using **amortized** cost, grouped by **`CostCenter`** *and*
   **`Environment`**. It must explicitly state the **(untagged) percentage** (your
   allocation gap), your **top three services** and **resource groups** by cost, and
   **one unit-cost metric** (module 00) computed against a real denominator (requests/
   customers/environments — pull the denominator from your track-12 observability if
   you can). This is the Inform-phase baseline everything else is measured against.

2. **At least one budget with an action-group alert, proven to fire** (module 02).
   Create a budget (subscription-scoped or tag-filtered by `CostCenter`/`Environment`)
   wired to a **reusable action group** (track 07), with both a **forecasted** and an
   **actual** alert threshold. Then **prove it fires** by scoping the amount below
   current spend and **capturing the notification** — a budget you haven't watched
   fire is not evidence. The proof (the alert email/notification) is a required
   artifact.

3. **A rightsizing recommendation actually applied, with measured before/after cost**
   (module 03). Take a real Azure Advisor cost recommendation (or one you derive from
   a utilization *distribution* — not just the average), **apply it** to a real
   resource (a VM resize, a Container App allocation, or an AKS pod-request/node-pool
   change — tracks 06/07), and **measure the cost impact before and after** using
   module 01 Cost Analysis on that resource/RG (across the 8-24h data lag, so this
   spans two sessions). You must also show you **checked it was safe** (the
   utilization distribution / SLO), i.e. that you didn't naively downsize a bursty
   workload (module 03's trap). The evidence is the before cost, the after cost, the
   measured delta, and the safety check.

4. **An orphaned-resource sweep that finds and cleans up at least one real orphan**
   (module 04). Run a **Resource Graph sweep** (track 17 module 06's tool) for
   orphaned resources — unattached disks (the track-14 trap), unattached public IPs,
   stale snapshots — across your subscription, **estimate the monthly cost** of what
   you find, verify ownership via the **`Owner` tag** before deleting, and **actually
   clean up at least one real orphan** (safely — snapshot if unsure). The evidence is
   the sweep output, the cost estimate, and confirmation the orphan is gone (and its
   bill stopped).

5. **An Infracost-style cost estimate wired into a CI pipeline PR check** (module 07,
   tracks 09/10). Take a Terraform config (from track 09 or a small new one), wire
   **Infracost into a CI pipeline** (track 10) so that opening a PR that changes
   infrastructure **posts the estimated monthly cost diff as a PR comment**, and
   demonstrate it on a **real PR** (change a SKU/count and show the comment reflecting
   the delta). Add at least one **guardrail** — a threshold policy (track 11's Rego
   engine) *or* a preventive Azure Policy (track 17) that denies an expensive choice.
   The evidence is the PR showing the cost comment and the guardrail's behavior.

Then **integrate and reflect** — see the acceptance checklist.

### Acceptance checklist

Work top to bottom; each item leans on the previous ones actually working and
producing evidence, not just existing.

- [ ] **Cost analysis document** exists: last month, **amortized**, grouped by
      **`CostCenter`** and **`Environment`**, with the **(untagged) percentage**
      stated, top-three services and RGs, and **one real unit-cost metric** with its
      denominator. The exact `az costmanagement query` commands are included so it's
      reproducible next month.
- [ ] The analysis **honestly names the allocation gap**: you can say what fraction
      of spend you *cannot* attribute to a team and what that implies for the
      showback/chargeback conversation (module 06).
- [ ] A **budget** exists, wired to a **reusable action group** (track 07) with
      **both** a forecasted and an actual threshold, and you have **captured evidence
      it fired** (the notification), not just that it exists. You can explain why an
      unproven budget provides no real protection (module 02).
- [ ] A **real rightsizing was applied** to a real resource, and you have
      **before-and-after cost** (module 01) showing the measured delta — not "we
      resized" but "\$X/day → \$Y/day, measured across the data lag."
- [ ] The rightsizing is **demonstrably safe**: you show the utilization
      *distribution* (peak/p95, not just average) or the SLO check that proves you
      didn't starve a bursty workload (module 03). If the naive recommendation was
      wrong, you overrode it and can explain why in business terms (module 00).
- [ ] An **orphan sweep** ran (Resource Graph, track 17), covering **at least two**
      orphan classes, with an **estimated monthly cost** of what it found, and **at
      least one real orphan was safely cleaned up** (ownership checked via the
      `Owner` tag; gone confirmed). You can explain why orphans evade compute views
      (module 04).
- [ ] An **Infracost cost check runs on infrastructure PRs** in a CI pipeline (track
      10) and **posts the cost diff as a PR comment**, demonstrated on a **real PR**
      whose comment reflects a change you made. At least **one guardrail** (CI
      threshold policy or preventive Azure Policy) is present and its behavior shown.
- [ ] The five parts **fit together as the FinOps loop**, not five unrelated tasks:
      the analysis (Inform) is grouped by the tags the budget filters on and the
      showback would use; the rightsizing and sweep (Optimize) are measured with the
      analysis's own tooling; the CI gate and budget (Operate) guard against
      regression. You can narrate the loop end to end.
- [ ] You can **defend every decision and every number**: why amortized not actual,
      why this budget scope, why this rightsizing was safe, why this orphan was
      truly orphaned, why this cost-gate threshold. A number you can't source or a
      choice you can't justify is a signal to revisit the module, not to leave it in.

### Hints

- **Do Inform before Optimize.** Part 1's cost analysis is the baseline every other
  part is measured against — a rightsizing "saving" or an orphan's "cost" is
  meaningless without the before-number from part 1's tooling. Get visibility solid
  first (modules 00-01).
- **Prove the budget fires by making it fire.** Scope the amount **below** current
  spend and wait a budget-evaluation cycle (they're periodic, not instant — allow up
  to a day). Capture the notification. An unfired budget looks identical to a healthy
  one — the only evidence is watching it trip (module 02).
- **Measure rightsizing across the data lag.** Cost data lags 8-24h, so the "after"
  cost isn't visible immediately — plan for part 3 to span two sessions. Capture the
  "before" *before* you change anything, or you lose the baseline (module 01/03).
- **Check the distribution before you rightsize.** Pull `--aggregation Average
  Maximum` (module 03) over a window that includes a peak. A low average with a high
  peak means *don't* naively downsize — autoscale, use a burstable SKU, or leave it.
  A saving that risks an outage is a FinOps failure (module 00).
- **Read the `Owner` tag before deleting an orphan.** The whole reason track 17's
  taxonomy exists for cleanup: confirm whose the resource is before `az disk delete`.
  A "detached volume" might be someone's data about to be reattached — snapshot if
  unsure (module 04, track 14).
- **Wire the cost gate as just another CI check.** Structurally it's the same as your
  test/scan steps (track 10): `terraform plan` → `terraform show -json` → `infracost
  diff` → `infracost comment`. Set the guardrail threshold where a human *should*
  look, not at \$5 (module 07's ignored-gate trap).
- **Keep everything cheap and destroy promptly.** The only real spend is the handful
  of resources you rightsize/orphan, and Infracost/analysis/budgets are free. Two
  tiny resources prove each point — there's no need for a cluster. This is the cost
  track; running up a bill here is the one unforgivable irony.
- **Reuse what you already built.** The tagging from track 17 module 06, the action
  groups from track 07, the Terraform from track 09, and the CI pipeline from track
  10 are all still standing — the capstone is about *operating them together as the
  FinOps loop*, not rebuilding each piece.

### Final cleanup

The only real spend is the resources you rightsized/created and any orphan you *made*
to demonstrate the sweep; the analysis, budgets, sweeps, and Infracost gate are free,
but leave your subscription as you found it.

1. Confirm what you built: `az consumption budget list -o table`, `az disk list
   --query "[?managedBy==null]" -o table` (should no longer show the orphan you
   cleaned), and your CI pipeline's PR comment history.
2. Delete any resources you created or rightsized for the demo: `az group delete
   --name <lab-rg> --yes --no-wait` for anything in a dedicated lab RG. Keep a
   genuinely-improved rightsizing or retention change if you want it as a real gain.
3. Remove demo budgets and action groups you don't want to keep (`az consumption
   budget delete`, `az group delete` for the plumbing RG) — keep any real guardrail
   budget you'd genuinely run.
4. Remove any Azure Policy assignment you created for the part-5 guardrail (`az policy
   assignment delete`) unless you're keeping it as a real cost control.
5. Final sweep: `az group list -o table` shows nothing from this project's labs, and
   your orphan sweep returns one fewer orphan than when you started (the one you
   cleaned).

## Before you move on

Once it's cleaned up, don't consider this finished yet. Wait a few days, then — with
no notes, none of the earlier modules open, and no commands in front of you — **run
the FinOps loop from a blank page** on a fresh question: "our subscription's bill
went up 30% last month — what do I do?" Walk yourself through it out loud or in
writing: which cost view and grouping you'd open first and why (amortized, by
`CostCenter`/`Environment` — module 01); how you'd tell healthy growth from waste
(unit economics — module 00); the order you'd apply the Optimize levers and the one
safety check that stops any of them becoming an outage (modules 03-05); where you'd
add a guardrail so it can't silently recur (a budget proven to fire, a CI cost gate —
modules 02/07); and how you'd have the *organizational* conversation with the team
whose spend grew (showback, unit cost, not blame — module 06). Then note **where you
stalled** — was it the amortized-vs-actual toggle? Why a bursty workload resists
rightsizing? How to prove a budget fires? Whatever you couldn't reconstruct cold is
exactly the module to redo. Rebuilding the whole loop from memory, and noticing
precisely where it breaks down, is the truest retention check there is — far more
than re-reading the prose.

## Next

You've now taken every scattered cost warning from tracks 02, 06, 07, 09, 12, 14, and
17 and turned them into a single, ongoing, evidence-driven discipline: you can make
cloud spend **visible, allocated, guarded, optimized, and owned**, and you can prove
each with a measured before/after. Cost is now an engineering property of your
systems, checked like tests and security. The next track,
**[22-disaster-recovery-and-chaos-engineering](../../22-disaster-recovery-and-chaos-engineering/README.md)**,
turns from *what your systems cost* to *whether they survive* — designing real
backup and failover strategies and then deliberately breaking your own systems to
prove they recover. The two disciplines are closer than they look: both are about
**deciding, in advance and with evidence, what you're willing to pay** — here it was
dollars, there it's the cost and complexity of resilience versus the cost of an
outage. You'll find the same "measure it, don't assume it; make the tradeoff
conscious" instinct running straight through it.

[Back to track index](../README.md) · [Back to main curriculum](../../README.md)
