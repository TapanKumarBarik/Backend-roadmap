# Repeatable Environments: Deployment Stacks and Template Specs

## Why this matters

A landing zone (module 02) is only useful if you can hand out *many* of them
consistently. When a new team needs an environment, you don't want someone
click-opsing resources or copy-pasting a script — you want a **versioned,
governed template** that provisions the whole thing the same way every time, and
a way to manage the resulting set of resources as *one lifecycle unit*. Azure
has native mechanisms for this — **Template Specs** and **Deployment Stacks** —
and it also *had* one (**Azure Blueprints**) that you'll still find in old docs
and that is now deprecated. This module makes you accurate about the current
tooling: what each native mechanism is, when to use it, and how it relates to
the Terraform you already know (track 9) and will scale in module 05.

## Concepts

### The problem: repeatable, governed, managed-as-a-unit provisioning

Three requirements stack up when you provision environments at scale:

1. **Repeatable** — the same inputs produce the same environment, every time,
   with no manual steps to forget. (This is the declarative-IaC argument from
   track 9 module 00, now at environment granularity.)
2. **Versioned & governed** — the template is a first-class, immutable,
   shareable artifact with versions, so "environment v2" is a known thing and
   teams can only deploy blessed versions.
3. **Managed as a unit** — the resources a template creates form one lifecycle:
   you can see them together, update them together, and *delete them together*,
   and ideally *prevent* someone deleting or drifting them out from under you.

Terraform (track 9) gives you 1 and part of 3 (via state and `destroy`). Azure's
native mechanisms give you 2 and a stronger version of 3. Knowing both — and
that they *overlap* — is the point; you don't need all of them, you need the
right one for a given org's tooling.

### Template Specs: a versioned, shareable ARM/Bicep template as an Azure resource

A **Template Spec** is an ARM/Bicep template stored **as a first-class Azure
resource**, with **versions**. Instead of passing a `template.json` file around
(email, repo, wiki), you publish it once as a Template Spec; it lives in a
resource group, has RBAC on it (so you control who can deploy it), and every
publish creates an immutable **version**. Teams then deploy *a specific version*
of the spec. This solves requirement 2 (versioned, governed, shareable): the
template is a governed artifact, not a loose file. What a Template Spec does
*not* do by itself is manage the deployed resources as a tracked unit — it's the
*template* that's versioned, not the *deployment*. Think of it as "the blessed
blueprint on a shelf, with a version label," analogous to a pinned, published
Terraform module (track 9 module 04) but native to Azure.

### Deployment Stacks: manage a set of resources as one governed lifecycle unit

A **Deployment Stack** is the newer, GA mechanism that addresses requirement 3
head-on. A stack is an Azure resource that represents a **collection of resources
deployed together and managed as a single unit**. Deploy a template (or a
Template Spec) *as a stack* and Azure tracks exactly which resources the stack
owns. That unlocks two things a plain deployment can't:

- **Whole-unit lifecycle** — update the stack and it reconciles the managed
  resources (adding, updating, and optionally *deleting* resources that fell out
  of the template — like a Terraform apply that prunes); delete the stack and it
  can delete all its managed resources in one action.
- **Deny-settings (drift/deletion protection)** — a stack can apply
  **`denySettings`** that *prevent* anyone from deleting or modifying the
  stack's managed resources outside the stack itself, even users with
  permissions. This is the "don't let someone hand-delete a landing-zone
  resource" guardrail Blueprints used to provide via locks.

Stacks can be scoped at resource group, subscription, or **management group**
level — so a platform team can deploy a governed environment across a scope and
lock it against tampering. Stacks are the current native answer to "provision a
governed environment and keep it governed."

### Azure Blueprints is deprecated — know what replaced it

You will find **Azure Blueprints** in older governance docs and tutorials. Be
accurate: **Azure Blueprints has been deprecated by Microsoft** (it never left
preview), with its retirement in **July 2026**, and Microsoft's guidance is to
**use Template Specs and Deployment Stacks instead**. Blueprints tried to bundle
ARM templates + policy assignments + RBAC assignments into one versioned,
lockable package applied at a subscription/MG scope — conceptually attractive for
landing zones, but it's now a dead end. The replacement mapping:

| Old Blueprints capability | Current mechanism |
|---|---|
| Versioned, shareable template artifact | **Template Spec** |
| Deploy + manage resources as one locked unit | **Deployment Stack** (with `denySettings`) |
| Bundled policy/RBAC assignments at scope | **Policy initiatives** (module 03) + **RBAC at MG** (module 01), assigned directly |

So don't design anything new on Blueprints. If you inherit a Blueprints-based
environment, the migration path is Template Specs + Deployment Stacks for the
provisioning, and native policy/RBAC assignments for the governance the blueprint
used to carry. Being able to *say this accurately in an interview or design
review* is the concrete takeaway.

### Where Terraform fits (and why this track still teaches both)

If you're all-in on Terraform (module 05), do you need stacks and specs at all?
Often no — Terraform already gives you repeatability (state), pruning (`destroy`/
plan), and versioned modules (registry pins). Many orgs standardize on Terraform
and never touch Deployment Stacks. But you should know the native mechanisms
because: (a) some orgs are Bicep/ARM shops and stacks are their idiom; (b)
stacks' `denySettings` deletion-protection is a *native control-plane* guarantee
Terraform can't fully replicate (Terraform state doesn't stop a portal user
deleting a resource); and (c) the CAF accelerators and Microsoft reference
material assume this vocabulary. The honest framing: **Terraform and Deployment
Stacks are overlapping tools for repeatable provisioning — pick one primary
mechanism per org, and know the other exists.** Module 05 goes deep on the
Terraform path because it's this curriculum's spine; this module makes sure you
can name and reason about the native alternative.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az ts create` | Publishes/updates a **Template Spec** version | see breakdown below |
| `az ts show` | Shows a Template Spec (and versions) | `az ts show --name env-baseline --resource-group rg-specs --version 1.0.0` |
| `az deployment group create --template-spec <id>` | Deploys a specific Template Spec version (plain deployment) | `az deployment group create -g rg-app --template-spec <version-id>` |
| `az stack sub create` | Creates a **Deployment Stack** at *subscription* scope | see breakdown below |
| `az stack group create` | Creates a Deployment Stack at *resource-group* scope | `az stack group create --name app-stack -g rg-app --template-file main.bicep --deny-settings-mode denyDelete --action-on-unmanage deleteAll` |
| `az stack mg create` | Creates a Deployment Stack at *management-group* scope | `az stack mg create --name lz-stack -m mg-corp --location eastus --template-file lz.bicep --deny-settings-mode denyWriteAndDelete --action-on-unmanage detachAll` |
| `az stack sub list` | Lists Deployment Stacks at a scope | `az stack sub list -o table` |
| `az stack sub delete` | Deletes a stack (and, per `--action-on-unmanage`, its resources) | `az stack sub delete --name lz-stack` |

Flag breakdown — `az ts create --name env-baseline --version 1.0.0 --resource-group rg-specs --location eastus --template-file env.bicep`:

- `--name env-baseline` — the Template Spec resource's name (the artifact on the
  shelf).
- `--version 1.0.0` — the **immutable version** being published; deployers pin
  to a version, so publishing `1.1.0` later doesn't change anyone already on
  `1.0.0` (the pinning discipline from track 9 module 04).
- `--resource-group rg-specs` — where the spec lives; RBAC on this RG controls
  who can deploy the spec.
- `--template-file env.bicep` — the ARM/Bicep template captured as this version.

Flag breakdown — `az stack sub create --name lz-corp --location eastus --template-file lz.bicep --deny-settings-mode denyDelete --action-on-unmanage deleteResources --deployment-resource-group-name rg-lz`:

- `--name lz-corp` — the stack's name; the handle for the whole managed unit.
- `--location eastus` — where the stack *resource* itself is stored (not
  necessarily where every deployed resource goes).
- `--template-file lz.bicep` — the template (or `--template-spec <id>` to deploy
  a governed spec version as a stack — combining both mechanisms).
- `--deny-settings-mode denyDelete` — the **drift/deletion protection**:
  `denyDelete` blocks deletion of managed resources, `denyWriteAndDelete` blocks
  modification too, `none` disables it. This is the native "lock" that replaces
  Blueprints locks.
- `--action-on-unmanage deleteResources` — what happens to managed resources
  when they leave the stack or the stack is deleted: `deleteResources` /
  `deleteAll` prunes them, `detachAll` leaves them behind (unmanaged). This is
  the whole-unit lifecycle control — the "delete the environment in one action"
  power.
- `--deployment-resource-group-name rg-lz` — for a subscription-scope stack,
  which RG the resources deploy into.

## Hands-on exercises

Template Specs and stack *metadata* are free; the **resources a stack/spec
deploys are real and billable**, so every exercise deploys something trivial and
cheap (a storage account or a resource group) and cleans up. Reuse your `mg-corp`
landing-zone MG from module 02 where noted. Bicep is used for the templates (ARM
JSON works identically); if you don't have Bicep, `az bicep install` first.

1. **(Azure) Author a tiny environment template.** Create `env.bicep` describing
   a minimal "environment" — one storage account with a required tag:
   ```bash
   mkdir -p ~/gov-labs/04 && cd ~/gov-labs/04
   cat > env.bicep <<'BICEP'
   param location string = resourceGroup().location
   param costCenter string
   resource sa 'Microsoft.Storage/storageAccounts@2023-01-01' = {
     name: 'govstk${uniqueString(resourceGroup().id)}'
     location: location
     sku: { name: 'Standard_LRS' }
     kind: 'StorageV2'
     tags: { CostCenter: costCenter }
   }
   BICEP
   ```
   This is the repeatable unit you'll publish and deploy governed.

2. **(Azure) Publish it as a versioned Template Spec.** Put the template on the
   shelf as a governed artifact:
   ```bash
   az group create -n rg-specs -l eastus
   az ts create --name env-baseline --version 1.0.0 \
     --resource-group rg-specs --location eastus --template-file env.bicep
   az ts show --name env-baseline -g rg-specs --query "versions" -o json
   ```
   Expect a Template Spec `env-baseline` with version `1.0.0`. This is now a
   shareable, RBAC-controllable artifact — not a loose file.

3. **(Azure) Deploy a specific spec version (plain deployment).** Provision an
   environment *from the versioned artifact*:
   ```bash
   az group create -n rg-env-a -l eastus
   SPECV=$(az ts show --name env-baseline -g rg-specs --version 1.0.0 --query id -o tsv)
   az deployment group create -g rg-env-a --template-spec "$SPECV" --parameters costCenter=CC-1001
   az resource list -g rg-env-a -o table
   ```
   Expect a storage account created from spec `1.0.0`. Two teams deploying the
   *same version* get identical environments — requirement 1 + 2 met.

4. **(Azure) Now deploy as a Deployment Stack and see the managed unit.** Deploy
   the same template as a *stack* so Azure tracks the resources as one unit:
   ```bash
   az stack group create --name env-b-stack -g rg-env-a \
     --template-file env.bicep --parameters costCenter=CC-1002 \
     --deny-settings-mode none --action-on-unmanage deleteAll --yes
   az stack group show --name env-b-stack -g rg-env-a --query "resources[].id" -o json
   ```
   Expect the stack listing the exact resources it manages. Unlike the plain
   deployment in exercise 3, this set now has a *handle* (`env-b-stack`) you can
   manage and delete as one.

5. **(Azure) Turn on deletion protection (`denySettings`) and prove it.** Update
   the stack to `denyDelete` and then try to delete a managed resource directly —
   Azure blocks it:
   ```bash
   az stack group create --name env-b-stack -g rg-env-a \
     --template-file env.bicep --parameters costCenter=CC-1002 \
     --deny-settings-mode denyDelete --action-on-unmanage deleteAll --yes
   SA=$(az stack group show --name env-b-stack -g rg-env-a --query "resources[0].id" -o tsv)
   az resource delete --ids "$SA" 2>&1 | head   # expect a denial from the stack's deny-settings
   ```
   Expect the direct delete to be **rejected** — the stack protects its managed
   resources even from users with delete permission. This is the native control
   Terraform state alone can't give you, and the replacement for Blueprints
   locks.

6. **(Azure) Delete the whole environment in one action.** The whole-unit
   lifecycle payoff — remove the stack and, per `--action-on-unmanage`, its
   resources:
   ```bash
   az stack group delete --name env-b-stack -g rg-env-a --action-on-unmanage deleteAll --yes
   az resource list -g rg-env-a -o table   # the stack-managed storage account is gone
   ```
   Expect the managed resources deleted together. Compare to Terraform `destroy`
   (track 9) — same "tear down the environment with one command" idea, native.

7. **(Written) Map Blueprints to its replacements — accuracy check.** Without
   deploying anything, write down: (a) that Azure Blueprints is **deprecated**
   (retiring July 2026) and you would *not* build new on it; (b) for each of the
   three things Blueprints bundled — versioned template artifact, locked
   deploy-as-a-unit, bundled policy/RBAC — which *current* mechanism replaces it
   (Template Spec; Deployment Stack with `denySettings`; policy initiatives from
   module 03 + RBAC at MG from module 01). This is the interview-ready takeaway.

8. **Diagnose and fix: "someone deleted a landing-zone resource we thought was
   protected."** A governance-real scenario. You deployed a stack with
   `--deny-settings-mode none` (the default in exercise 4) believing it was
   protected, and a resource got hand-deleted. Reproduce and fix:
   ```bash
   # (Re)create a stack WITHOUT protection — the mistake:
   az group create -n rg-env-c -l eastus
   az stack group create --name unprotected-stack -g rg-env-c \
     --template-file env.bicep --parameters costCenter=CC-1003 \
     --deny-settings-mode none --action-on-unmanage deleteAll --yes
   SA=$(az stack group show --name unprotected-stack -g rg-env-c --query "resources[0].id" -o tsv)
   az resource delete --ids "$SA"   # SUCCEEDS — no protection
   ```
   **Diagnose:** the stack existed, but `deny-settings-mode` was `none`, so it
   tracked the resources without *protecting* them — a stack is not automatically
   a lock. Confirm with
   `az stack group show --name unprotected-stack -g rg-env-c --query "denySettings" -o json`
   (mode `none`). **Fix:** redeploy the stack with `--deny-settings-mode
   denyDelete` (or `denyWriteAndDelete` for full drift protection) so managed
   resources can't be deleted/modified outside the stack:
   ```bash
   az stack group create --name unprotected-stack -g rg-env-c \
     --template-file env.bicep --parameters costCenter=CC-1003 \
     --deny-settings-mode denyDelete --action-on-unmanage deleteAll --yes
   ```
   Lesson: **deploying *as* a stack gives you the managed-unit lifecycle;
   protection is a separate opt-in (`denySettings`) you must set.** "It's a
   stack" ≠ "it's protected."

9. **(Azure) Clean up everything.** Remove stacks, specs, and lab RGs:
   ```bash
   az stack group delete --name unprotected-stack -g rg-env-c --action-on-unmanage deleteAll --yes 2>/dev/null; true
   az group delete -n rg-env-a --yes --no-wait
   az group delete -n rg-env-c --yes --no-wait
   az group delete -n rg-specs --yes --no-wait   # removes the Template Spec too
   ```
   Confirm with `az stack group list -g rg-env-a -o table` (should error/empty)
   and `az group list -o table`.

## Independent challenge

No commands given — build it yourself, drawing on this module, track 9 (declarative
IaC, versioned modules) and module 02 (landing zones). Design a **repeatable
"application landing zone" provisioning mechanism** using the current native
tooling: author a small Bicep/ARM template that stands up a minimal governed
environment (at least a resource group's worth of resources with required tags),
publish it as a **versioned Template Spec** so it's a governed artifact teams
deploy by version, and then deploy it **as a Deployment Stack** with
**deletion-protection** (`denySettings`) turned on and an explicit
`action-on-unmanage` policy, so the environment is both provisioned repeatably
and protected from ad-hoc tampering. Deploy two "environments" from the *same*
spec version to prove repeatability, then delete one entirely via its stack in a
single action. Finally, write a short paragraph stating precisely why you would
**not** use Azure Blueprints for this, and mapping each capability you used
(versioned artifact, locked managed unit) to the mechanism that provided it —
and note in one sentence how you'd achieve the same outcome in Terraform (module
05) and what the native `denySettings` gives you that Terraform state does not.
Clean up all billable resources.

<details>
<summary>Stuck? One hint</summary>

Combine the two mechanisms rather than choosing between them: publish the
template once with `az ts create --name <spec> --version 1.0.0`, then deploy it
*as a stack* by passing the spec's version id to the stack
(`az stack group create --template-spec <version-id> --deny-settings-mode
denyDelete --action-on-unmanage deleteAll`). That gives you the governed,
versioned artifact (Template Spec) *and* the protected, managed-as-a-unit
lifecycle (Deployment Stack) in one flow — which is exactly the pair of things
Blueprints tried to do in a single now-deprecated object. The Terraform
equivalent is a pinned published module + `terraform destroy`; the thing
`denySettings` adds that Terraform can't is a *control-plane* guarantee that even
a portal user with delete rights can't remove the resource out of band.

</details>

## Common mistakes & troubleshooting

- **Designing anything new on Azure Blueprints.** It's deprecated (retiring July
  2026) and never left preview. Use Template Specs + Deployment Stacks +
  native policy/RBAC assignments instead. Recognize Blueprints in old docs; don't
  build on it.
- **Assuming a Deployment Stack automatically protects its resources.** The
  managed-unit tracking and the *protection* are separate — protection requires
  `--deny-settings-mode denyDelete`/`denyWriteAndDelete`. A stack with mode
  `none` tracks but does not lock. (Exercise 8.)
- **Confusing a Template Spec with a Deployment Stack.** A Template Spec is a
  *versioned template artifact* (the blueprint on the shelf); a Deployment Stack
  is a *managed set of deployed resources* (the running environment). Specs
  version the template; stacks manage the deployment. They compose.
- **Forgetting `--action-on-unmanage`.** When you delete a stack or a resource
  leaves it, this flag decides whether the resources are deleted or detached
  (left orphaned). Not setting it deliberately can leave billable resources
  behind after you thought you'd torn everything down.
- **Publishing a new Template Spec version and expecting existing deployments to
  change.** Versions are immutable and deployers pin to one; publishing `1.1.0`
  doesn't touch anything on `1.0.0` — you must re-deploy the new version (the
  same pinning behaviour as track 9 module modules).
- **Reaching for stacks when your org is all-Terraform.** Terraform already
  gives repeatability and pruning; adding stacks on top can create two competing
  sources of truth. Pick one primary mechanism per environment.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What is a Template Spec, and which of the three provisioning requirements
   (repeatable / versioned-governed / managed-as-a-unit) does it primarily
   satisfy?
2. What does a Deployment Stack give you that a plain deployment does not? Name
   the two headline capabilities.
3. What is `denySettings` on a stack, and what governance guarantee does it
   provide that Terraform state cannot?
4. Is Azure Blueprints something you'd design a new landing-zone mechanism on
   today? Explain, and give the replacement for each thing Blueprints bundled.
5. You deployed resources as a stack but a user still deleted one. What was
   almost certainly misconfigured?
6. What does `--action-on-unmanage deleteAll` vs `detachAll` control?
7. When might an org legitimately skip Deployment Stacks entirely?

</details>

<details>
<summary>Show answers</summary>

1. A Template Spec is an ARM/Bicep template stored as a first-class,
   RBAC-controlled Azure resource with immutable **versions**. It primarily
   satisfies **versioned & governed** (a shareable, pinned template artifact) —
   not managed-as-a-unit by itself.
2. Whole-unit lifecycle (update reconciles/prunes the managed set; delete can
   remove all managed resources in one action) and **deletion/drift protection**
   via `denySettings`. A plain deployment does neither — it just creates
   resources and forgets the grouping.
3. `denySettings` prevents deletion (`denyDelete`) or modification and deletion
   (`denyWriteAndDelete`) of a stack's managed resources *outside* the stack,
   even by users with permissions — a native control-plane lock. Terraform state
   can't stop a portal/CLI user from deleting a resource out of band; it only
   detects the drift afterward.
4. No — Blueprints is deprecated (retiring July 2026) and never left preview.
   Replacements: versioned template artifact → **Template Spec**; locked
   deploy-as-one-unit → **Deployment Stack** with `denySettings`; bundled
   policy/RBAC assignments → **policy initiatives** (module 03) + **RBAC at MG**
   (module 01) assigned natively.
5. The stack's `--deny-settings-mode` was `none` (the default) — it tracked the
   resources as a unit but did not protect them. Protection is a separate opt-in
   (`denyDelete`/`denyWriteAndDelete`); being a stack isn't the same as being
   locked.
6. What happens to the stack's managed resources when they leave the stack or
   the stack is deleted: `deleteAll` deletes them (tear the environment down),
   `detachAll` leaves them in place as unmanaged resources (orphaned from the
   stack).
7. When the org standardizes on Terraform (module 05), which already provides
   repeatability (state), pruning (`destroy`/plan), and versioned modules —
   adding stacks would create a second, competing source of truth. They'd still
   note stacks' native `denySettings` as the one capability Terraform lacks.

</details>

## Next

Continue to
[05-multi-subscription-terraform-patterns](../05-multi-subscription-terraform-patterns/README.md)
— you've seen the native provisioning mechanisms; now scale the Terraform from
track 9 across *multiple subscriptions and environments* with provider aliasing,
module reuse, and per-environment state strategies.
