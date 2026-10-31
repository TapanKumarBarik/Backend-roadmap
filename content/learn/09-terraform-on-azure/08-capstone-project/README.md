# Capstone Project

## Why this matters
This is where the whole track converges. Everything you did across modules
00-07 in isolation — providers, state, variables, outputs, data sources,
modules, remote state, and provisioning real networking and AKS+ACR — comes
together into one coherent, multi-module Terraform configuration that stands
up a complete environment and tears it back down with single commands. There
is no new concept and no quiz here; the goal is to prove you can *compose*
what you've learned into infrastructure a real team would recognize, and
then destroy it cleanly and confirm nothing's left billing.

Treat this as a project, not a checklist of isolated exercises — the pieces
depend on each other in the order you'd actually build them.

## The project

Build a small but complete Azure environment **entirely in Terraform**,
organized as a root module that calls at least two child modules, with its
state in a remote Azure Storage backend. It reproduces — declaratively, and
now integrated — the by-hand work of tracks 5 and 7.

Your configuration must provision:

1. **A remote-state backend** (module 05): an Azure Storage account +
   container, bootstrapped with `az`, holding this project's state under its
   own `key`. Local state is not acceptable for the capstone.
2. **A `network` module** (modules 04-06): a VNet with at least two subnets
   and an NSG with sensible rules, associated to the appropriate subnet —
   the track 5 stack, packaged as a reusable module with clear inputs and
   outputs (at minimum, it must output the subnet IDs the cluster needs).
3. **A `platform` (or `aks`) module** (modules 04-06): an ACR and an AKS
   cluster placed in the network module's subnet, with the AKS↔ACR
   `AcrPull` role assignment wired up — the track 7 stack, as a module.
4. **A root module** that: configures the provider and remote backend, calls
   both child modules, passes the network module's subnet output into the
   platform module (so the wiring is a real reference, not a hard-coded
   string), and is driven by **variables** (project name, environment,
   region, address space, node size/count, ACR name) with a committed
   `terraform.tfvars` for non-secret values.
5. **Sensible outputs** at the root: at least the resource group name, the
   ACR login server, and the cluster's kubeconfig (marked `sensitive`).

Then **use** it, **prove** it, and **destroy** it — see the acceptance
checklist.

## Acceptance checklist

Work top to bottom; each item depends on the previous ones actually working,
not just existing.

- [ ] A remote backend exists: an `az`-bootstrapped storage account +
      container, and your root config's `terraform { backend "azurerm" }`
      points at it with a project-specific `key`. `terraform init` succeeds
      against it and a state blob appears in the container.
- [ ] The configuration is genuinely **multi-module**: a root module calling
      a `network` child module and a `platform`/`aks` child module, each in
      its own directory with `variables.tf`/`main.tf`/`outputs.tf`. Neither
      child module configures a `provider` block (only the root does).
- [ ] The `network` module creates a VNet with ≥2 subnets and an NSG
      associated to a subnet, and **outputs** the subnet ID(s) the cluster
      uses. `terraform state list` shows these under `module.network.`.
- [ ] The `platform` module creates an ACR and an AKS cluster **placed in a
      subnet produced by the network module** — the subnet ID is passed in
      as a module input, referenced (not hard-coded).
- [ ] The AKS↔ACR attach is an explicit `azurerm_role_assignment` granting
      the cluster's **kubelet** identity `AcrPull` on the ACR. `az role
      assignment list --scope <acr-id>` confirms it.
- [ ] Everything is parameterized by **variables** with a `terraform.tfvars`
      for non-secret values; no environment-specific names, regions, or
      CIDRs are hard-coded inside resource blocks. Deploying a second
      environment would be a different `.tfvars`, not edited resource code.
- [ ] Root **outputs** expose at least the resource group name, the ACR
      login server, and a `sensitive` kubeconfig. `terraform output -raw
      kube_config` yields a working config: `kubectl get nodes` shows all
      nodes `Ready`.
- [ ] You **read the plan before applying** and it matched your expectation
      (you can state the `N to add` you predicted and got). No surprise
      destroy-and-recreate slipped through.
- [ ] An image pushed to the ACR is pullable by the cluster with no image
      pull secret (proving the AcrPull attach works end to end).
- [ ] `terraform destroy` tears the **entire** environment down in one
      command; afterward `az aks list -o table` is empty, the workload
      resource group and the AKS `MC_*` group are gone, and you've separately
      removed the state-backend storage group. `az group list -o table`
      shows nothing from this project remaining.
- [ ] You can explain, for every resource, what it corresponds to in the
      by-hand track 5/7 work and why it's ordered where it is in the
      dependency graph. If you can't explain a piece, that's a signal to go
      back and understand it, not to leave a copy-pasted block that happened
      to apply.

## Hints

- **Bootstrap the backend first, separately.** The state storage account
  can't be created by the config that uses it (module 05's chicken-and-egg).
  Create it with `az` up front, note the exact account name and `key`, then
  write your backend block. Get `terraform init -migrate-state` (or a clean
  init against the empty backend) working *before* you add the expensive
  resources.
- **Build in dependency order, applying as you go.** Get the network module
  applying on its own first, then add the platform module, then the AcrPull
  wiring — don't write all three modules and debug a 20-resource plan in one
  shot. Each `apply` that works is a checkpoint you can build on.
- **Pass the subnet in as a reference, not a string.** The whole point of
  the multi-module design is that `module.platform` receives
  `module.network.subnet_ids[0]` (or similar) as an input — that reference
  is what makes Terraform order the network before the cluster. A hard-coded
  subnet ID would apply but defeats the exercise.
- **Read every plan's summary line.** This capstone creates an AKS cluster;
  a `count`/`for_each` slip on a node pool or subnet list can multiply
  billable resources. The `N to add` line is your last defense — predict it,
  then confirm the plan matches before typing `yes`.
- **Keep the cluster small and destroy promptly.** Two burstable nodes is
  plenty. This is real spend; don't leave it running while you write up your
  notes.
- **Reuse names and patterns you already validated** in modules 04-06 rather
  than inventing new configuration — the capstone is about integration, not
  fresh discovery.

## Final cleanup

This is the end of the track's real-Azure-spend. Clean up deliberately.

1. Confirm what you're about to delete:
   `terraform state list` (everything Terraform manages) and
   `az resource list -g <your-workload-rg> -o table`.
2. Destroy the whole environment: `terraform destroy` — review the destroy
   plan, confirm it includes the AKS cluster, then `yes`.
3. Remove the state-backend storage separately — it's a persistent resource
   `terraform destroy` won't touch:
   `az group delete -n <your-tfstate-rg> --yes --no-wait`.
4. Final sweep across the subscription: `az aks list -o table` (empty) and
   `az group list -o table` (nothing from this project). An empty result
   from both is your signal you're no longer being billed for any of it.

## Before you move on

Once everything is torn down, don't consider this finished yet. Wait a few
days, then — with no notes, none of the earlier modules open, and none of
the HCL in front of you — **rebuild the entire capstone from memory**: the
bootstrapped remote backend, the two child modules with clean inputs and
outputs, the root wiring the subnet from the network module into the AKS
cluster, the AcrPull attach, sensible variables and outputs, a working
`kubectl get nodes`, and a clean one-command destroy. Rebuilding the whole
structure cold — and noticing exactly where you stall (Was it the backend
bootstrap? The kubelet identity reference? The module output wiring?) — is
the truest retention check there is. Tear it all down again afterward and
confirm the subscription is clean.

## Next

You've now taken the infrastructure you built by hand in tracks 5 and 7 and
made it reproducible, reviewable, and destroyable as code — the foundation
every later platform-engineering track assumes. The immediate next step is
**[10-cicd-and-gitops](../../10-cicd-and-gitops/README.md)**, which lifts
the `terraform plan`/`apply` you've been running by hand into a real
pipeline: a PR runs `fmt`/`validate`/`plan` and posts it for review, a merge
runs `apply` of that exact plan with an OIDC-federated identity no human
holds — exactly the pipeline shape you sketched in module 07, now built for
real and paired with GitOps for the application layer on top of the AKS
cluster this track taught you to provision.

[Back to track index](../README.md) · [Back to main curriculum](../../README.md)
