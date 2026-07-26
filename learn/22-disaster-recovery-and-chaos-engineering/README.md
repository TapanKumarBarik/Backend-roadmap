# Track 22: Disaster Recovery and Chaos Engineering

You can now build platforms (tracks 01-19) and operate them like an SRE
(track 20): SLOs, error budgets, on-call, incident response, blameless
postmortems. This track asks the two questions those disciplines set up but
don't fully answer: **what happens when a whole region goes down**, and
**how do you know your system actually survives failure before it happens
in production?** The first half is disaster recovery — RTO/RPO, the
strategy spectrum from backup-and-restore to active-active, multi-region
architecture on Azure, real DR runbooks, and platform-level backup. The
second half is chaos engineering — deliberately injecting failure in a
controlled way to *prove* resilience rather than assume it. The track ends
where the two meet: scheduled game days that run a chaos experiment and a DR
drill through the incident-response process from track 20, and a gap
analysis of a real system's resilience patterns.

You already have one piece of this: track 14 / module 04 taught **database**
backup and restore — snapshots vs. logical dumps, PITR, and the discipline
of testing the restore. That baseline is assumed here. This track goes
*wider* than a single database: whole-system recovery, multiple Azure
regions, redeploying infrastructure from Terraform, and cluster-level
backup — with deliberate chaos engineering layered on top to verify all of
it holds.

> **Cost warning:** disaster recovery means running infrastructure in *two*
> places. A warm-standby or active-active setup **at least doubles your
> infrastructure bill** — two AKS clusters, geo-replicated storage,
> cross-region egress, a second ACR, a global traffic router. Every module
> that stands up a second region ends with an explicit teardown, and several
> exercises deliberately have you *scale the standby to zero* or use
> `terraform destroy` rather than leave a duplicate environment idling. Chaos
> experiments are cheap; the multi-region substrate they run on is not.
> Treat the FinOps discipline from track 21 as a first-class constraint here,
> not an afterthought — the whole point of choosing a DR strategy is spending
> the *least* that meets your real RTO/RPO, not the most.

## How this track works

- Go in order — module 01's multi-region build assumes the strategy
  vocabulary from module 00, the DR plan in module 02 assumes the
  architecture from module 01, and the game day in module 06 combines the DR
  runbook (module 02) with the chaos tooling (modules 04-05).
- Every module (except this index and the capstone) follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint
  quiz → Next**. Two modules (02 and 05) add a **Cumulative review**.
- Exercises use real `az`, `kubectl`, and `terraform` against your actual
  Azure subscription across **two regions**. There is no simulator for a
  regional outage — you build a real second region and really fail over to
  it. Each module ends with explicit cleanup; the second region is the
  expensive part, so don't skip it.
- Module 08 is a capstone with no quiz — it asks you to design real RTO/RPO
  targets for a system, provision a multi-region failover with Terraform,
  execute a failover drill and record the results, run at least two chaos
  experiments observed through track 12's stack, and produce a prioritized
  resilience gap analysis.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [dr-concepts-rto-rpo-and-strategy-spectrum](00-dr-concepts-rto-rpo-and-strategy-spectrum/README.md) | RTO/RPO defined and how to actually choose them; the DR strategy spectrum (backup/restore, pilot light, warm standby, active-active) and cost/complexity tradeoffs | 60-75 min |
| 01 | [multi-region-architecture-on-azure](01-multi-region-architecture-on-azure/README.md) | Traffic Manager vs. Front Door for regional failover, geo-redundant storage (GRS/RA-GRS), AKS multi-region patterns, building on track 09 Terraform and track 05 networking | 90-120 min |
| 02 | [designing-and-testing-a-dr-plan](02-designing-and-testing-a-dr-plan/README.md) | Writing a real regional-outage runbook and *actually executing a failover drill* rather than just planning it | 90-120 min |
| 03 | [platform-level-backup-strategy](03-platform-level-backup-strategy/README.md) | Beyond track 14's DB backups: Azure Backup for VMs/disks, AKS cluster backup, and "redeploy from Terraform" as a recovery mechanism | 75-90 min |
| 04 | [chaos-engineering-concepts](04-chaos-engineering-concepts/README.md) | Proving resilience by injecting real failure in a controlled way; hypotheses, blast-radius control, starting small in non-prod | 60-75 min |
| 05 | [chaos-engineering-with-azure-chaos-studio](05-chaos-engineering-with-azure-chaos-studio/README.md) | Azure Chaos Studio (and Chaos Mesh on AKS): injecting pod failure, network fault, and resource-exhaustion fault, observed via track 12 and track 20 SLOs | 90-120 min |
| 06 | [game-days-and-dr-drills](06-game-days-and-dr-drills/README.md) | Running a structured, scheduled game day combining chaos + the DR runbook + track 20's incident-response process — the organizational practice | 75-90 min |
| 07 | [resilience-patterns-review-and-gap-analysis](07-resilience-patterns-review-and-gap-analysis/README.md) | Auditing a real system's timeouts/retries/circuit breakers (track 13), health probes, and graceful degradation for where it would actually fail, and prioritizing fixes | 75-90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end: written DR plan with real targets, multi-region Terraform failover, executed drill, ≥2 chaos experiments, prioritized gap analysis | 4-8 hours |

## Prerequisites

- An active Azure subscription (already confirmed for this curriculum) — and
  awareness that this track runs resources in **two regions**.
- Everything from [07-aks](../07-aks/README.md): standing up, deploying to,
  and operating a real AKS cluster.
- Everything from [09-terraform-on-azure](../09-terraform-on-azure/README.md):
  provisioning Azure infrastructure declaratively with reusable modules and
  remote state — you'll reuse those modules to build a *second* region.
- Everything from
  [14-databases-and-stateful-workloads](../14-databases-and-stateful-workloads/README.md),
  especially module 04's backup/restore discipline — the database baseline
  this track builds *outward* from.
- [20-sre-practices](../20-sre-practices/README.md): SLOs/SLIs, error
  budgets, and the incident-response process — the failover drills and game
  days here run *through* that process, not around it.
- Helpful: [05-azure-networking](../05-azure-networking/README.md) (DNS,
  load balancing) and [12-observability-deep-dive](../12-observability-deep-dive/README.md)
  (you observe every chaos experiment through this stack).

[Back to main curriculum](../README.md)

Start here → [00-dr-concepts-rto-rpo-and-strategy-spectrum/README.md](00-dr-concepts-rto-rpo-and-strategy-spectrum/README.md)
