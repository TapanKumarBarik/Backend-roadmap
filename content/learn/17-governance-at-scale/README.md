# Track 17: Governance at Scale

This is the track where the curriculum stops thinking about *one* Azure
subscription. Every deployment you've done so far — the AKS clusters from
[track 7](../07-aks/README.md), the Terraform stacks from
[track 9](../09-terraform-on-azure/README.md), the Azure Policy guardrails
from [track 11](../11-security-deep-dive/README.md) — has lived inside a
single dev subscription that you owned end to end. That's how you *learn*
Azure. It is emphatically **not** how a real organization runs on Azure. A
company has many subscriptions (per team, per environment, per cost centre),
a legal and compliance boundary around each, and a platform team that has to
govern all of it *centrally* without hand-editing every subscription. This
track is about that structure: **management groups**, **landing zones** (the
Cloud Adoption Framework), **policy and RBAC applied at organizational
scale**, **multi-subscription Terraform**, and a real **tagging and
compliance** discipline.

You already met Azure Policy basics in
[track 11 module 05](../11-security-deep-dive/05-azure-policy-and-governance-guardrails/README.md)
— definitions, assignments, scope, effects (`Audit`/`Deny`/`DeployIfNotExists`),
and initiatives. That module explicitly said it was "a light preview of
governance-at-scale" and handed the multi-subscription, landing-zone version
to this track. This is that track. We assume that baseline cold and build
*up* from it — from one resource group to an entire org hierarchy.

This track assumes:

- **Azure Policy basics** from
  [track 11 module 05](../11-security-deep-dive/05-azure-policy-and-governance-guardrails/README.md):
  definitions vs. assignments, scope, effects, and initiatives. We scale
  these to management groups; we do not re-teach what a policy effect is.
- **Terraform** from [track 9](../09-terraform-on-azure/README.md): the
  `init`/`plan`/`apply`/`destroy` workflow, modules, variables/outputs,
  remote state, and provider configuration. This track adds *multiple*
  providers and *multiple* environments on top.
- **Identity** from [track 16](../16-identity-deep-dive/README.md): Entra
  ID, service principals, managed identity, and RBAC role assignments. RBAC
  inheritance down a management-group hierarchy is a core topic here, and it
  builds directly on how role assignments and scope worked in track 16.

> **Cost note — mostly free, with a few exceptions.** Management groups,
> policy definitions/assignments, initiatives, exemptions, blueprints/stacks
> metadata, and tags are all **free** Azure control-plane constructs — you
> can build an entire governance hierarchy without spending a cent. The
> exercises are deliberately designed to demonstrate governance using
> **free** resources (policy on a resource group, tags on a storage account)
> so you can practise the structure without a real bill. The only things that
> cost money are the actual resources you deploy *through* a stack or
> Terraform config (a storage account, a cluster) — those are called out and
> cleaned up. You also **cannot** create a second real subscription for a
> lab, so several exercises explicitly note where a real org would have more
> subscriptions than you can provision, and how to simulate the structure
> with management groups + resource groups instead.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [governance-and-why-single-subscription-breaks-down](00-governance-and-why-single-subscription-breaks-down/README.md) | What changes at organizational scale: multiple teams/environments/cost centres, compliance boundaries, why one subscription stops working | 60 min |
| 01 | [management-groups-and-subscription-hierarchy](01-management-groups-and-subscription-hierarchy/README.md) | The management-group tree, subscriptions as leaves, inheritance of policy and RBAC down the hierarchy, designing a hierarchy that fits | 75-90 min |
| 02 | [cloud-adoption-framework-and-landing-zones](02-cloud-adoption-framework-and-landing-zones/README.md) | What a "landing zone" actually is, the CAF reference architecture at a survey level, platform vs. application landing zones — plus a **cumulative review** | 75 min |
| 03 | [azure-policy-at-scale-initiatives-and-exemptions](03-azure-policy-at-scale-initiatives-and-exemptions/README.md) | Grouping track-11 policies into an initiative, assigning at management-group scope, policy exemptions and their scope | 90 min |
| 04 | [repeatable-environments-deployment-stacks-and-template-specs](04-repeatable-environments-deployment-stacks-and-template-specs/README.md) | Deployment Stacks and Template Specs for repeatable provisioning; why Azure Blueprints is deprecated and what replaced it | 75-90 min |
| 05 | [multi-subscription-terraform-patterns](05-multi-subscription-terraform-patterns/README.md) | Provider aliasing across subscriptions, module reuse across environments, workspace-per-env vs. directory-per-env — plus a **cumulative review** | 90-120 min |
| 06 | [tagging-strategy-and-resource-organization](06-tagging-strategy-and-resource-organization/README.md) | A real tagging taxonomy (cost centre, environment, owner, data classification), enforcing and inheriting tags with policy, feeding cost management | 75 min |
| 07 | [compliance-and-regulatory-as-code](07-compliance-and-regulatory-as-code/README.md) | Regulatory compliance initiatives, what "compliance as code" means practically, audit readiness and evidence | 75-90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | Design an org hierarchy, a policy initiative at the MG level, a tagging taxonomy, and a two-environment Terraform structure — then defend it | 4-6 hr |

## How to work through this

- **Go in order.** Module 01 (hierarchy) is assumed by everything after it;
  module 03 (initiatives at scale) assumes 01's inheritance model; module 05
  (multi-sub Terraform) assumes 01's hierarchy and track 9's modules.
- Every standard module follows the same shape: **Why this matters →
  Concepts → Command reference → Hands-on exercises → Independent challenge →
  Common mistakes & troubleshooting → Checkpoint quiz → Next**.
- Two modules (**02** and **05**) add a closed-book **Cumulative review**
  mixing everything up to that point. Take those without notes.
- Exercises run against your **real Azure subscription** plus a **real
  management group** you create at the tenant root. Where a real org would
  need multiple subscriptions you can't provision in a lab, the exercise says
  so and shows the single-subscription approximation. Each module that
  deploys billable resources ends with an explicit cleanup.
- Attempt every quiz question in writing before revealing the answer, and do
  the independent challenge with zero peeking at the solved exercises.

## Prerequisites

- An active Azure subscription (already confirmed for this curriculum) and a
  working `az login`, with enough privilege to **create a management group**
  (Owner or Contributor at the tenant root group, or the
  "Management Group Contributor" role — module 01 covers how to check).
- [track 9 — terraform-on-azure](../09-terraform-on-azure/README.md):
  modules, variables/outputs, remote state, provider configuration.
- [track 11 module 05 — azure-policy-and-governance-guardrails](../11-security-deep-dive/05-azure-policy-and-governance-guardrails/README.md):
  definitions, assignments, scope, effects, initiatives.
- [track 16 — identity-deep-dive](../16-identity-deep-dive/README.md): Entra
  ID, service principals, managed identity, RBAC and role assignments.

[Back to main curriculum](../README.md)

Start here → [00-governance-and-why-single-subscription-breaks-down/README.md](00-governance-and-why-single-subscription-breaks-down/README.md)

After this track, the next one is
**[18-supply-chain-security](../18-supply-chain-security/README.md)**, which
takes the policy-and-admission-control mindset you scale up here and points
it at the software supply chain — signing images, generating SBOMs, and
enforcing provenance at deploy time.
