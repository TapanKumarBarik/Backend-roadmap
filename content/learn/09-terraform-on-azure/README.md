# Track 9: Terraform on Azure

This is the track where the curriculum stops typing infrastructure by hand.
Every Azure resource you've built so far — the VNets and NSGs from
[track 5](../05-azure-networking/README.md), the AKS clusters and ACR from
[track 7](../07-aks/README.md) — you created **imperatively**, one `az`
command at a time. That works, but it isn't repeatable, reviewable, or
auditable: there's no single artifact that says "this is what our
infrastructure *is*." Terraform fixes that. You write your infrastructure
as **declarative code**, commit it to Git (which you now know cold from
[track 8](../08-git-and-version-control/README.md)), and let Terraform
figure out the `az`-equivalent API calls to make reality match the code.

This track assumes:

- **Git fluency** from [track 8](../08-git-and-version-control/README.md) —
  you'll treat Terraform configs as code: branch, commit, review, and never
  commit secrets or state.
- **Azure networking** from [track 5](../05-azure-networking/README.md) —
  VNets, subnets, NSGs, and address planning. This track re-creates those
  resources declaratively; it does not re-teach what a subnet is.
- **AKS and ACR** from [track 7](../07-aks/README.md) — node pools, cluster
  tiers, managed identity, and the `AcrPull` attach flow. You'll reproduce
  the whole thing in HCL.
- A working **Azure CLI** login (`az login`) — the `azurerm` provider
  authenticates through the same credentials `az` already uses.

> **Cost warning — read this before your first `terraform apply`.**
> Terraform creates **real, billable Azure resources**, and it does so
> *fast*: a single `terraform apply` can stand up an AKS cluster, a load
> balancer, and public IPs in one shot. Worse, a `count` or `for_each`
> mistake can create **ten of something you meant to create one of** before
> you've read the plan. Two rules that will save you money:
> 1. **Always read the plan before typing `yes`.** The line that matters is
>    the summary: `Plan: N to add, M to change, K to destroy`. If `N` is
>    bigger than you expected, stop.
> 2. **Always `terraform destroy` when you're done with a module.** Every
>    module that creates billable resources ends with an explicit destroy
>    step. Unlike a forgotten `az` resource, a whole Terraform-managed
>    environment tears down with one command — use it.

## Modules

| # | Module | What you'll learn | Rough time |
|---|--------|-------------------|-----------|
| 00 | [IaC concepts & Terraform setup](00-iac-concepts-and-terraform-setup/README.md) | Why declarative beats imperative, install Terraform, `terraform version`, provider blocks, `azurerm` auth via `az login` | 60 min |
| 01 | [The core workflow & state](01-core-workflow-and-state/README.md) | `init`/`plan`/`apply`/`destroy`, the state file, why state matters, detecting drift | 90 min |
| 02 | [Providers, resources & the azurerm provider](02-providers-resources-and-the-azurerm-provider/README.md) | Resource blocks, resource addressing, dependencies, provider & version pinning | 90 min |
| 03 | [Variables, outputs & data sources](03-variables-outputs-and-data-sources/README.md) | `variable`, `output`, `locals`, `data` blocks referencing existing Azure resources | 90 min |
| 04 | [Modules & code organization](04-modules-and-code-organization/README.md) | Writing a reusable module, module inputs/outputs, calling and versioning modules | 90 min |
| 05 | [Remote state & collaboration](05-remote-state-and-collaboration/README.md) | Azure Storage backend, state locking, why local state breaks in a team | 90 min |
| 06 | [Provisioning real Azure infrastructure](06-provisioning-azure-infrastructure/README.md) | Build a VNet+subnets+NSG (track 5) and an AKS cluster + ACR (track 7) declaratively | 2.5 hr |
| 07 | [Terraform in CI/CD & testing](07-terraform-in-cicd-and-testing/README.md) | `fmt`/`validate`, `plan`/`apply` from a pipeline, `tflint`/`checkov`, a taste of `terraform test` | 90 min |
| 08 | [Capstone project](08-capstone-project/README.md) | Multi-module config: VNet+NSG, AKS+ACR, remote state, variables/outputs — then destroy it all | 3-5 hr |

## How to work through this

- **Go in order.** Module 01 assumes module 00's install is done; module 06
  assumes you can write variables (03) and modules (04); module 07 assumes a
  remote backend (05). Nothing later is assumed by anything earlier.
- Every standard module follows the same shape: **Why this matters →
  Concepts → Command reference → Hands-on exercises → Independent challenge →
  Common mistakes & troubleshooting → Checkpoint quiz → Next**.
- Two modules (**02** and **05**) add a closed-book **Cumulative review**
  mixing everything up to that point. Take those without notes.
- Every exercise runs against your **real Azure subscription**. There is no
  Terraform simulator — this is the point. Each module ends with an explicit
  `terraform destroy` (or a note that cleanup is deferred within the module).
  Do not skip it.
- Attempt every quiz question in writing before revealing the answer, and do
  the independent challenge with zero peeking at the solved exercises.

## Prerequisites

- An active Azure subscription (already confirmed for this curriculum) and a
  working `az login`.
- [track 8 — git-and-version-control](../08-git-and-version-control/README.md):
  branching, commits, `.gitignore`, and PR-based review.
- [track 5 — azure-networking](../05-azure-networking/README.md): VNets,
  subnets, NSGs, address-space planning.
- [track 7 — aks](../07-aks/README.md): AKS node pools, tiers, managed
  identity, and attaching ACR.

[Back to main curriculum](../README.md)

Start here → [00-iac-concepts-and-terraform-setup/README.md](00-iac-concepts-and-terraform-setup/README.md)

After this track, the next one is
**[10-cicd-and-gitops](../10-cicd-and-gitops/README.md)**, where the
`terraform plan`/`apply` you run by hand here gets automated into a real
pipeline and paired with GitOps.
