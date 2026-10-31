# Track 21: Cost Management and FinOps

Every Azure-touching track so far has carried a cost warning: clean up your AKS
cluster (track 07), don't leave a `Retain`ed disk orphaned (track 14), watch
Log Analytics retention (track 12), read the `N to add` in a Terraform plan
(track 09), tag everything so finance can allocate it (track 17). Those were
tactical reflexes. This track promotes cost from a scattered set of warnings
into a **first-class, ongoing engineering discipline**: FinOps.

You already know how to build, secure, observe, and govern platforms on Azure.
What you haven't done yet is treat *what they cost* as a design input you own
rather than a bill someone else reconciles at month-end. This track assumes the
governance and tagging taxonomy you built in **track 17** (especially module 06
— `CostCenter`/`Environment`/`Owner`/`DataClassification`) and the Terraform
fluency from **track 09**, and turns them into cost analysis, budgets and
alerts, rightsizing, reservations, showback/chargeback, and cost gates in CI/CD.

> **Cost warning (yes, even here):** this is the cost track, and it's still
> mostly free — Cost Management, budgets, Advisor, tag queries, and Infracost
> all cost nothing to *look at*. The few exercises that create real resources
> (a small VM or Container App to rightsize, a disk to orphan and clean up)
> tell you to delete them. The irony of running up a bill while learning to
> control bills is real; clean up promptly with `az group delete --name <rg>
> --yes --no-wait`.

## How this track works

- Go in order — module 01 assumes the FinOps framing from module 00, budgets in
  module 02 assume the cost-analysis views from module 01, and so on.
- Every module (except this index and the capstone) follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint quiz →
  Next**. Two modules (02 and 05) also carry a closed-book **Cumulative review**.
- Exercises run against your **real Azure subscription's actual cost data** —
  there's no cost simulator, and reading your own bill is the point.
- Cost data in Azure lags: usage can take **8-24 hours** to appear in Cost
  Management, and budgets evaluate on a schedule. Several exercises tell you to
  come back the next day. Plan around that lag rather than fighting it.
- Module 08 is a capstone with no quiz — it asks you to run a real cost analysis,
  fire a budget alert, apply and measure a rightsizing, sweep an orphaned
  resource, and wire an Infracost check into a PR, all against your subscription.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [finops-concepts-and-the-cost-culture-shift](00-finops-concepts-and-the-cost-culture-shift/README.md) | The FinOps Foundation's Inform/Optimize/Operate phases, cost as an engineering concern, unit economics (cost per request/customer) | 45-60 min |
| 01 | [azure-cost-management-fundamentals](01-azure-cost-management-fundamentals/README.md) | Cost Analysis views, grouping by the track-17 tags, cost allocation, amortized vs. actual cost | 60-75 min |
| 02 | [budgets-and-alerts](02-budgets-and-alerts/README.md) | `az consumption budget`, Cost Management budgets, action groups on a threshold, forecasted vs. actual alerts | 60-90 min |
| 03 | [rightsizing-compute](03-rightsizing-compute/README.md) | Azure Advisor cost recommendations, rightsizing AKS node pools / VM SKUs and Container Apps allocations (tracks 06/07) | 60-90 min |
| 04 | [storage-and-data-cost-optimization](04-storage-and-data-cost-optimization/README.md) | Disk/Blob tiering, orphaned-resource cleanup (the track-14 disk trap), Log Analytics retention cost (track 12) | 60-90 min |
| 05 | [reservations-savings-plans-and-spot](05-reservations-savings-plans-and-spot/README.md) | Reserved Instances vs. Savings Plans vs. Spot — commitment vs. flexibility, break-even, spot node pools | 60-75 min |
| 06 | [showback-and-chargeback](06-showback-and-chargeback/README.md) | Attributing cost to teams/products via the tagging taxonomy, building a showback report, the org conversation it enables | 60-75 min |
| 07 | [cost-as-a-cicd-gate](07-cost-as-a-cicd-gate/README.md) | Infracost estimating cost from a Terraform plan pre-merge (tracks 09/10), policy-based cost guardrails (tracks 11/17) | 75-90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end: real cost analysis, a firing budget alert, a measured rightsizing, an orphaned-resource sweep, an Infracost PR check | 4-6 hours |

## Prerequisites

- An active Azure subscription (already confirmed for this curriculum), with
  some real usage on it — this track reads *your own* cost data, so a subscription
  that's been used across the earlier tracks gives you the most to look at.
- Everything from [17-governance-at-scale](../17-governance-at-scale/README.md),
  especially [module 06 (tagging)](../17-governance-at-scale/06-tagging-strategy-and-resource-organization/README.md):
  a `CostCenter`/`Environment`/`Owner`/`DataClassification` taxonomy is the
  backbone this entire track keys off.
- Everything from [09-terraform-on-azure](../09-terraform-on-azure/README.md):
  reading a plan, modules, and variables — the Infracost gate in module 07
  estimates cost straight off a `terraform plan`.
- Helpful background: [06-azure-container-apps](../06-azure-container-apps/README.md)
  and [07-aks](../07-aks/README.md) (what you'll rightsize), and
  [10-cicd-and-gitops](../10-cicd-and-gitops/README.md) (where the cost gate lives).

Start here → [00-finops-concepts-and-the-cost-culture-shift/README.md](00-finops-concepts-and-the-cost-culture-shift/README.md)

[Back to main curriculum](../README.md)
