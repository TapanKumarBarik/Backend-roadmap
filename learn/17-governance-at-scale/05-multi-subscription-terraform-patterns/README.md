# Multi-Subscription Terraform Patterns

## Why this matters

In track 9 you drove *one* `azurerm` provider against *one* subscription. A real
org's Terraform spans a hierarchy: a hub network in the Connectivity
subscription, workloads in per-team application-landing-zone subscriptions, dev
and prod that must be *identical in shape but separate in state*. Doing that
safely needs three new Terraform skills on top of track 9: **provider aliasing**
(one config, many subscriptions), **module reuse across environments** (the same
code, different `.tfvars`), and a deliberate **state-isolation strategy**
(workspace-per-env vs. directory-per-env) so a `terraform apply` for dev can
never touch prod. This module scales the IaC spine of the curriculum from a dev
subscription to an organizational footprint — and it's the pattern the capstone
demands.

## Concepts

### Provider aliasing: many subscriptions from one configuration

In track 9 you configured a single provider:

```hcl
provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
```

To manage resources in *more than one* subscription from the same config, you
declare **aliased providers** — additional `provider` blocks with an `alias` and
a different `subscription_id` — then point each resource (or module) at the right
one with `provider = azurerm.<alias>`:

```hcl
provider "azurerm" {              # the default/unaliased provider
  features {}
  subscription_id = var.connectivity_subscription_id
}

provider "azurerm" {
  alias           = "workload"
  features {}
  subscription_id = var.workload_subscription_id
}

resource "azurerm_resource_group" "hub" {
  name     = "rg-hub"
  location = "eastus"
  # uses the default provider => connectivity subscription
}

resource "azurerm_resource_group" "app" {
  provider = azurerm.workload             # explicitly the workload subscription
  name     = "rg-app"
  location = "eastus"
}
```

This is the mechanism behind a hub-and-spoke deploy where the hub lives in one
subscription and the spoke in another, all in one plan — for example a VNet peering
that references resources on *both* sides. Each aliased provider authenticates
independently (the identity running Terraform needs rights in *every* targeted
subscription — an RBAC point straight from track 16). Aliasing is the Terraform
expression of module 00's "many subscriptions" reality.

### Passing aliased providers into modules

A module (track 9 module 04) that must create resources in a *specific*
subscription receives its provider explicitly. The module declares it needs a
provider via a `configuration_aliases` entry, and the caller maps a concrete
aliased provider into it:

```hcl
# in the child module's terraform{} block:
terraform {
  required_providers {
    azurerm = {
      source                = "hashicorp/azurerm"
      configuration_aliases = [azurerm.target]
    }
  }
}

# in the root, calling it:
module "spoke" {
  source    = "./modules/spoke"
  providers = { azurerm.target = azurerm.workload }   # map concrete -> module's expected alias
}
```

This keeps the track 9 rule intact — *the module declares provider requirements,
the root configures and supplies them* — extended so the root can hand *different
subscriptions* to different module instances. A single `spoke` module can thus be
instantiated once per team subscription, each pointed at a different provider.

### Module reuse across environments: same code, different inputs

The core DRY win: **dev and prod should be the same Terraform module, differing
only by input values**, not copied-and-edited resource blocks. You already built
this instinct in track 9 module 04 (a reusable network module called with
different `.tfvars`). At org scale it becomes the *environment* pattern: one
`environment` (or per-component) module, invoked for dev with `dev.tfvars`
(smaller SKUs, permissive, cheap) and for prod with `prod.tfvars` (bigger,
locked-down, HA) — identical shape, different parameters. The payoff is that a
change to the environment's *structure* is written once and both environments
inherit it, guaranteeing dev and prod don't drift apart in shape. "Prod is dev
with different numbers" is the goal; divergent copy-pasted code is the failure.

### State isolation: workspace-per-env vs. directory-per-env

The single most consequential decision here: **dev and prod must have separate
state**, so a dev `apply` can never plan a change to prod. Two established
strategies (this builds on the remote-state backend from track 9 module 05):

- **Workspace-per-environment** — one config directory, one backend, and
  Terraform **workspaces** (`terraform workspace new prod`) each holding a
  *separate state* under the same backend. You switch with
  `terraform workspace select prod` and typically key variables off
  `terraform.workspace`. Pros: least code duplication. Cons: it's easy to be in
  the *wrong* workspace and apply dev changes to prod (the state is separate but
  the *code and commands look identical*); backend config is shared; and it
  encourages `count`/conditionals keyed on workspace that get messy.
- **Directory-per-environment** — a separate directory per environment
  (`envs/dev/`, `envs/prod/`), each with its **own backend config** (its own
  state file/key) and its own `.tfvars`, both calling the *same shared modules*.
  Pros: strong isolation (different directory, different backend, different state
  — hard to cross the streams); prod has its own backend credentials and can be
  permissioned separately; the diff between environments is explicit in
  `*.tfvars`. Cons: a little more boilerplate per environment. **This is the
  pattern most teams and this curriculum prefer** for anything approaching prod,
  precisely because the isolation is structural, not a mental note about which
  workspace you're in.

The rule of thumb: **workspaces for ephemeral/near-identical variants; separate
directories (and backends) for real, permission-separated environments like
prod.** The capstone requires the directory-per-env approach for exactly the
isolation reason.

### Separate backends and blast-radius per environment

Following from the above: each real environment should have its **own remote
state backend** (or at least its own state *key* and, ideally, its own storage
account/container with its own RBAC) — extending track 9 module 05's single
backend to one-per-environment. Why: state is sensitive and powerful (whoever can
write prod state can reshape prod), so prod state should be access-controlled
separately from dev, and a corrupted/locked dev state must not be able to affect
prod. Combined with directory-per-env, this gives you the property that matters
most at scale: **the blast radius of any single `terraform apply` is exactly one
environment**, enforced by structure (separate directory, separate backend,
separate credentials) rather than by discipline. This is the Terraform-layer
version of module 00's isolation force.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `terraform workspace new` | Creates a new workspace (separate state under the same backend) | `terraform workspace new prod` |
| `terraform workspace select` | Switches the active workspace | `terraform workspace select dev` |
| `terraform workspace list` | Lists workspaces (`*` marks the active one) | `terraform workspace list` |
| `terraform init -backend-config=...` | Initializes with an environment-specific backend (directory-per-env) | see breakdown below |
| `terraform plan -var-file=...` | Plans with an environment's variable file | `terraform plan -var-file=prod.tfvars` |
| `terraform apply -var-file=...` | Applies one environment's config | `terraform apply -var-file=dev.tfvars` |
| `az account list` | Confirms which subscriptions your identity can target (aliasing prep) | `az account list --query "[].{name:name, id:id}" -o table` |

Flag breakdown — `terraform init -backend-config=backends/prod.hcl -reconfigure` (directory-per-env / partial backend config):

- `-backend-config=backends/prod.hcl` — supplies the backend settings (storage
  account, container, **key**) from an environment-specific file instead of
  hard-coding them in the `terraform{}` block. Each environment points at its own
  state blob (its own `key`, ideally its own account), giving separate,
  separately-permissioned state — the track 9 module 05 backend, parameterized
  per environment.
- `-reconfigure` — re-initializes the backend ignoring any previously cached
  backend settings; used when switching a directory between backends so you don't
  accidentally inherit dev's backend when initializing prod.

Flag breakdown — provider aliasing in a resource: `resource "azurerm_virtual_network" "spoke" { provider = azurerm.workload ... }`:

- `provider = azurerm.workload` — binds this resource to the **aliased**
  provider (a specific subscription), overriding the default provider. Omit it
  and the resource uses the default (unaliased) provider. This one line is what
  routes a resource to the right subscription in a multi-sub config.

Flag breakdown — module provider mapping: `module "spoke" { providers = { azurerm = azurerm.workload, azurerm.dns = azurerm.connectivity } }`:

- `providers = { <module-alias> = <concrete-alias> }` — maps the module's
  *expected* provider(s) (declared via `configuration_aliases`) to the root's
  *concrete* aliased providers. This is how one module instance is pointed at one
  subscription and another instance at a different one.

## Hands-on exercises

You have **one real subscription**, so you cannot truly apply an aliased provider
against a *second* subscription. Every exercise is designed to teach the pattern
within that constraint: you'll write and `validate`/`plan` multi-provider and
multi-environment configs (which is free and needs no second subscription), use
*resource groups* to stand in for separate environments where an apply is
required, and the exercises explicitly mark where a real org would point at a
second subscription. Reuse track 9 habits: read every plan's `N to add`.

1. **(Setup) Confirm your targetable subscriptions.** See what aliasing *could*
   target:
   ```bash
   az account list --query "[].{name:name, id:id}" -o table
   export ARM_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
   mkdir -p ~/gov-labs/05 && cd ~/gov-labs/05
   ```
   Most learners see one subscription. Note: in a real org you'd have several
   ids here, one per landing zone — that's what the aliases below would point at.

2. **(Terraform) Write a two-provider config and validate it.** Create a config
   with a default and an aliased provider — using your *one* subscription id for
   both (so it `validate`s), but structured exactly as a real two-subscription
   setup:
   ```bash
   cat > providers.tf <<'HCL'
   terraform {
     required_providers {
       azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
     }
   }
   variable "connectivity_subscription_id" { type = string }
   variable "workload_subscription_id"     { type = string }

   provider "azurerm" {
     features {}
     subscription_id = var.connectivity_subscription_id
   }
   provider "azurerm" {
     alias           = "workload"
     features {}
     subscription_id = var.workload_subscription_id
   }
   HCL
   cat > main.tf <<'HCL'
   resource "azurerm_resource_group" "hub" {
     name     = "rg-hub-demo"
     location = "eastus"
   }
   resource "azurerm_resource_group" "spoke" {
     provider = azurerm.workload
     name     = "rg-spoke-demo"
     location = "eastus"
   }
   HCL
   terraform init
   terraform validate
   ```
   Expect `Success! The configuration is valid.` You've written a genuine
   multi-subscription structure; the two vars would differ in a real org.

3. **(Terraform) Plan it (single-sub stand-in) and read the routing.** Apply with
   *both* vars set to your real subscription so it actually runs:
   ```bash
   terraform plan -var "connectivity_subscription_id=$ARM_SUBSCRIPTION_ID" \
                  -var "workload_subscription_id=$ARM_SUBSCRIPTION_ID"
   ```
   Expect `Plan: 2 to add` (two RGs). The `spoke` RG is routed through
   `azurerm.workload`; in a real org, changing `workload_subscription_id` to a
   *different* id is all it takes to place `rg-spoke-demo` in another
   subscription. Apply it (`terraform apply -var ... -var ...`), then confirm
   both RGs exist. Destroy at exercise 8.

4. **(Terraform) Build one reusable `environment` module.** Create a module that
   represents "an environment" (a tagged RG + a storage account sized by input):
   ```bash
   mkdir -p modules/environment
   cat > modules/environment/variables.tf <<'HCL'
   variable "env"        { type = string }
   variable "location"   { type = string }
   variable "sku"        { type = string }   # differs dev vs prod
   variable "cost_center"{ type = string }
   HCL
   cat > modules/environment/main.tf <<'HCL'
   resource "azurerm_resource_group" "this" {
     name     = "rg-app-${var.env}"
     location = var.location
     tags     = { Environment = var.env, CostCenter = var.cost_center }
   }
   resource "azurerm_storage_account" "this" {
     name                     = "app${var.env}${substr(md5(var.env),0,6)}"
     resource_group_name      = azurerm_resource_group.this.name
     location                 = azurerm_resource_group.this.location
     account_tier             = "Standard"
     account_replication_type = var.sku
     tags                     = { Environment = var.env, CostCenter = var.cost_center }
   }
   HCL
   cat > modules/environment/versions.tf <<'HCL'
   terraform { required_providers { azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" } } }
   HCL
   ```
   This one module is the shape of *both* environments — the DRY unit.

5. **(Terraform) Directory-per-environment layout.** Create `envs/dev` and
   `envs/prod`, each calling the *same* module with different `.tfvars` and its
   *own* backend key. Model separate state with distinct local state paths (a
   stand-in for separate remote backends you can't fully provision in a lab):
   ```bash
   mkdir -p envs/dev envs/prod
   for E in dev prod; do
   cat > envs/$E/main.tf <<HCL
   terraform { required_providers { azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" } } }
   provider "azurerm" { features {} subscription_id = var.subscription_id }
   variable "subscription_id" { type = string }
   variable "env"         { type = string }
   variable "location"    { type = string }
   variable "sku"         { type = string }
   variable "cost_center" { type = string }
   module "environment" {
     source      = "../../modules/environment"
     env         = var.env
     location    = var.location
     sku         = var.sku
     cost_center = var.cost_center
   }
   HCL
   done
   cat > envs/dev/dev.tfvars  <<'HCL'
   env = "dev"
   location = "eastus"
   sku = "LRS"
   cost_center = "CC-DEV-01"
   HCL
   cat > envs/prod/prod.tfvars <<'HCL'
   env = "prod"
   location = "eastus"
   sku = "GRS"
   cost_center = "CC-PROD-01"
   HCL
   ```
   Note what differs between environments lives **only** in the `.tfvars`
   (`sku` LRS→GRS, cost center) — the *structure* is one shared module. In a real
   org each `envs/<E>/` would also have its own `backend "azurerm"` block pointing
   at a separate state storage account.

6. **(Terraform) Apply dev and prove prod is untouched (state isolation).**
   Initialize and apply *only* dev, then confirm prod's directory has no state
   and would plan independently:
   ```bash
   cd ~/gov-labs/05/envs/dev
   terraform init
   terraform apply -var "subscription_id=$ARM_SUBSCRIPTION_ID" -var-file=dev.tfvars
   terraform state list                 # dev's resources only
   cd ~/gov-labs/05/envs/prod
   terraform init
   terraform plan -var "subscription_id=$ARM_SUBSCRIPTION_ID" -var-file=prod.tfvars
   ```
   Expect: dev's `state list` shows only `module.environment.*` for dev; prod's
   `plan` shows `2 to add` and **references nothing about dev**. The directories
   have *separate state* — a dev apply structurally cannot alter prod. This is the
   isolation the capstone wants.

7. **(Terraform) Contrast with the workspace approach and see its footgun.** In a
   *separate* scratch dir, use workspaces instead and feel why they're riskier for
   real prod:
   ```bash
   mkdir -p ~/gov-labs/05/ws && cd ~/gov-labs/05/ws
   cp ../envs/dev/main.tf .
   terraform init
   terraform workspace new dev
   terraform workspace new prod
   terraform workspace list          # note '*' — which one are you in NOW?
   ```
   The point: the code and commands for dev and prod are **identical**; only the
   invisible `terraform.workspace` differs. It's genuinely easy to run
   `terraform apply -var-file=prod.tfvars` while selected on the *dev* workspace
   (or vice versa) and hit the wrong state. Write down why directory-per-env
   makes that mistake structurally harder (different directory = different
   backend/state = a wrong-environment apply requires being in the wrong folder,
   which is far more visible).

8. **Diagnose and fix: "my prod apply is about to modify dev's resources."** The
   classic multi-env accident, reproduced in the workspace dir. Being on the wrong
   workspace makes Terraform plan changes against the wrong state:
   ```bash
   cd ~/gov-labs/05/ws
   terraform workspace select dev
   terraform apply -var "subscription_id=$ARM_SUBSCRIPTION_ID" -var-file=../envs/dev/dev.tfvars   # creates dev in THIS state
   # Now the mistake: still selected on 'dev', you intend to deploy prod:
   terraform workspace show          # says 'dev' — but you THINK you're doing prod
   terraform plan -var "subscription_id=$ARM_SUBSCRIPTION_ID" -var-file=../envs/prod/prod.tfvars
   ```
   **Diagnose:** the plan wants to *modify/replace* the dev-created resources to
   look like prod, because you're applying prod's vars against **dev's state** —
   `terraform workspace show` reveals you're on `dev`, not `prod`. The tell is a
   plan full of `~`/`-/+` (change/replace) on resources you expected to be
   *added* fresh. **Fix:** select the correct workspace (or, better, use the
   directory-per-env layout where this can't happen):
   ```bash
   terraform workspace select prod
   terraform workspace show          # now 'prod' — separate empty state
   terraform plan -var "subscription_id=$ARM_SUBSCRIPTION_ID" -var-file=../envs/prod/prod.tfvars   # now '2 to add', clean
   ```
   Lesson: **always confirm `terraform workspace show` before an apply**, and
   prefer **directory-per-env** for real prod so "wrong environment" means "wrong
   folder," which you'll notice.

9. **(Terraform) Clean up all environments.** Destroy dev, the workspace lab, and
   the two-provider demo:
   ```bash
   cd ~/gov-labs/05/envs/dev && terraform destroy -var "subscription_id=$ARM_SUBSCRIPTION_ID" -var-file=dev.tfvars
   cd ~/gov-labs/05/ws && terraform workspace select dev && terraform destroy -var "subscription_id=$ARM_SUBSCRIPTION_ID" -var-file=../envs/dev/dev.tfvars
   cd ~/gov-labs/05 && terraform destroy -var "connectivity_subscription_id=$ARM_SUBSCRIPTION_ID" -var "workload_subscription_id=$ARM_SUBSCRIPTION_ID"
   ```
   Confirm with `az group list -o table` that `rg-hub-demo`, `rg-spoke-demo`, and
   `rg-app-dev` are gone. (Prod was never applied — you only planned it.)

## Independent challenge

No commands given — build it yourself, drawing on this module and track 9
(modules, variables/outputs, remote state, provider config). Design and stand up
(within your single subscription, using resource groups to stand in for separate
subscriptions where needed) a **two-environment Terraform structure** for one
application, using **directory-per-environment** with a **single shared module**
that both dev and prod call. The only differences between environments must live
in `*.tfvars` (at minimum: a size/SKU that's smaller in dev, and distinct
`Environment`/`CostCenter` tags) — no copied-and-edited resource blocks. Wire in
**provider aliasing** structured as though the hub/shared resources live in a
*connectivity* subscription and the app lives in a *workload* subscription (both
pointed at your one real id, but written so changing one variable would move the
app to another subscription). Give each environment its **own backend
configuration** (its own state key), apply *dev* only, and prove via
`terraform state list` in each directory that a dev apply cannot see or touch
prod's state. Finally, write a short paragraph justifying your choice of
directory-per-env over workspace-per-env for this app, referencing the specific
wrong-environment failure from exercise 8. Destroy everything and confirm the
subscription is clean.

<details>
<summary>Stuck? One hint</summary>

The shape that satisfies every requirement is: `modules/app/` (one shared module
with `variables.tf`/`main.tf`/`outputs.tf`, declaring `configuration_aliases`
for any provider it needs), and `envs/dev/` + `envs/prod/` each containing a
tiny root that declares the default + aliased `azurerm` providers, a
`terraform { backend "azurerm" { key = "app-dev.tfstate" } }` (a *different* key
per env), a `providers = { ... }` mapping into the module call, and a
`<env>.tfvars`. Apply dev with `terraform -chdir=envs/dev apply -var-file=dev.tfvars`;
the isolation proof is that `terraform -chdir=envs/prod state list` is empty
after a dev apply because it reads a *different* state key. The
directory-per-env justification is exactly exercise 8: with separate directories
and backends, deploying the wrong environment requires being in the wrong folder
(visible), whereas with workspaces the invisible `terraform.workspace` selection
lets a prod-vars apply hit dev state.

</details>

## Common mistakes & troubleshooting

- **Forgetting the identity needs rights in every targeted subscription.** An
  aliased provider authenticates independently; the service principal/user
  running Terraform must have RBAC (track 16) in *each* subscription an alias
  points at, or the plan/apply fails for that provider only.
- **Putting a `provider` block (not just `configuration_aliases`) in a child
  module.** The track 9 module 04 rule still holds — child modules declare
  provider *requirements* (and `configuration_aliases`); the root *configures*
  and *maps* providers via `providers = { ... }`.
- **Using workspaces for real, permission-separated environments.** Workspaces
  share a backend and identical code/commands, making wrong-environment applies
  easy (exercise 8). Prefer directory-per-env with separate backends for prod.
- **Sharing one state backend across dev and prod.** Whoever can write prod
  state can reshape prod; give prod its own state (own key, ideally own
  account/RBAC) so a dev mishap or a broad grant can't reach it.
- **Copy-pasting resource blocks between dev and prod.** They drift apart
  immediately. Use one shared module and let `*.tfvars` be the *only* difference —
  "prod is dev with different numbers."
- **Applying without confirming the environment.** Always check
  `terraform workspace show` (workspaces) or which `envs/<E>/` directory you're in
  (directory-per-env) before `apply`. Read the plan's change/replace lines: a plan
  full of `~`/`-/+` where you expected `+` is a wrong-state tell.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What is provider aliasing, and what one line routes a specific resource to a
   specific subscription?
2. How does a child module receive a *specific* aliased provider from its caller,
   and what must the module declare to accept one?
3. State the goal "prod is dev with different numbers" in terms of module reuse —
   what should be the *only* thing that differs between environments?
4. Compare workspace-per-env and directory-per-env on isolation strength and the
   main risk of each.
5. Why should prod have its own state backend rather than sharing dev's?
6. You run a prod-vars `apply` and the plan is full of *change/replace* lines on
   resources you expected to be freshly *added*. What likely happened and how do
   you confirm it?
7. Why does the identity running a multi-subscription Terraform config need RBAC
   in more than one place?

</details>

<details>
<summary>Show answers</summary>

1. Provider aliasing declares extra `provider "azurerm"` blocks with an `alias`
   and different `subscription_id`s, so one config can manage multiple
   subscriptions. `provider = azurerm.<alias>` on a resource (or a `providers =
   {...}` map on a module) routes it to that subscription; without it a resource
   uses the default provider.
2. The caller passes `providers = { azurerm.target = azurerm.workload }` in the
   `module` block, mapping a concrete aliased provider to the module's expected
   one. The module must declare that expectation via `configuration_aliases =
   [azurerm.target]` in its `required_providers`, and must *not* configure its own
   provider block.
3. There should be **one shared module** describing the environment's structure,
   called once per environment; the *only* difference between dev and prod should
   be the input values in each environment's `*.tfvars` (SKUs, sizes, tags) — not
   copied or edited resource code.
4. **Workspace-per-env**: least duplication but weak isolation — same backend,
   identical code/commands, so it's easy to apply against the wrong state by
   being on the wrong workspace. **Directory-per-env**: a little more
   boilerplate but strong isolation — separate directory, backend, and state, so
   a wrong-environment apply requires being in the wrong folder (visible) and prod
   can be permissioned separately. Prefer directory-per-env for real prod.
5. State is powerful and sensitive — whoever can write prod state can reshape
   prod. Separate backends (own key/account/RBAC) let prod state be
   access-controlled independently and ensure a dev state problem (corruption,
   lock, over-broad grant) can't reach prod.
6. You applied one environment's vars against *another environment's state* —
   e.g. prod `.tfvars` while selected on the dev workspace — so Terraform wants to
   morph dev's existing resources into prod's shape. Confirm with `terraform
   workspace show` (or check which `envs/` directory you're in); fix by selecting
   the right workspace or, better, using directory-per-env.
7. Each aliased provider authenticates independently against its own
   subscription, so the running identity needs RBAC (role assignments) in *every*
   subscription any alias targets — a hub in Connectivity and a spoke in a
   Workload subscription both require rights, or that provider's operations fail.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-05 or earlier tracks while attempting these
— the point is to find out what actually stuck. These mix this track's first six
modules with the baselines from tracks 9, 11, and 16.

1. Walk a single new team's request "we need dev and prod for our app" from
   scratch through this track: which management group(s) their subscriptions land
   under (modules 01/02), what baseline they inherit (module 03), how you'd
   provision the environments repeatably (module 04 *or* 05), and how you keep the
   two environments' state isolated (module 05).
2. You must apply an org baseline of five policies to every current and future
   subscription, with one legacy resource group legitimately exempt from just the
   tag rule. Name every object you'd create and the scope of each (modules 03/01),
   and explain why the exemption's scope and expiry are what they are.
3. Compare Deployment Stacks (module 04) and Terraform (module 05) for
   provisioning a protected landing zone: what does each give you, and what's the
   one native guarantee stacks have that Terraform state lacks?
4. Explain "broad high, specific low" (module 01) and show it operating in *two*
   different mechanisms from this track — a policy initiative assignment and a
   management-group hierarchy design.
5. A `Deny` policy inherited from `mg-org` is blocking a legitimate prod
   deployment. Give two correct remedies (one from module 03, one about scope
   placement from module 01) and say which is more appropriate and why.
6. Your multi-subscription Terraform `apply` fails only for resources routed to
   the `azurerm.workload` provider, with an authorization error, while the default
   provider's resources plan fine. Diagnose using module 05 + track 16.
7. Describe the directory-per-env layout end to end (directories, shared module,
   tfvars, backends) and state the exact property it guarantees about the blast
   radius of one `terraform apply`.
8. Azure Blueprints appears in a design doc you inherited. State its status, and
   rewrite the doc's three Blueprint-provided capabilities as current mechanisms
   (modules 01/03/04).
9. A subscription created last week isn't getting the org baseline initiative.
   Give the two most likely causes across modules 02 and 03 and how you'd tell
   them apart.
10. Tie it together: name the single assignment (and its scope) that would apply
    an entire security standard to every subscription in the org at once, the
    mechanism that lets a new subscription inherit it automatically, and the one
    escape hatch for a legitimate exception — citing the module each comes from.

<details>
<summary>Show answers</summary>

1. Place the team's dev subscription under a non-prod/landing-zone MG and prod
   under a prod landing-zone MG (modules 01/02), so each inherits the baseline
   initiative assigned at the org-root/environment MG (module 03). Provision each
   environment repeatably via a versioned Template Spec deployed as a protected
   Deployment Stack (module 04) *or* a shared Terraform module called per
   environment (module 05). Keep state isolated with directory-per-env + separate
   backends so a dev apply can't touch prod (module 05).
2. A custom **initiative** (policy set) bundling the five definitions, created at
   the org-root MG; one **initiative assignment** at the org-root MG scope (so all
   current/future subscriptions inherit it, module 01); and one **exemption**
   scoped to the single legacy resource group, targeting only the tag member
   policy by reference id, `Waiver` category, with an `expiresOn`. Narrow scope
   keeps the rest of the baseline enforced everywhere; the expiry forces
   re-review so the carve-out can't become permanent.
3. Deployment Stacks give native versioned/managed-as-a-unit provisioning with
   `denySettings` deletion/drift protection at the control plane; Terraform gives
   repeatability (state), pruning (plan/destroy), and versioned modules. The one
   native guarantee stacks have that Terraform lacks: `denySettings` can *prevent*
   a portal/CLI user with permissions from deleting/modifying a managed resource
   out of band — Terraform state only detects drift after the fact.
4. Broad universal guardrails go high (org-root MG) so everything inherits them;
   specific strict rules go low, on just the scope that needs them. In a **policy
   initiative assignment**: assign the broad baseline at `mg-org`, a stricter
   exposure policy only at `mg-online`. In **hierarchy design**: put "everyone"
   rules at the root MG and environment-specific strictness on the Production MG.
5. (a) Create a scoped, documented, time-bound **exemption** for the legitimate
   prod deployment against that assignment (module 03). (b) Re-examine whether the
   `Deny` should have been assigned so high — move it to a lower MG that excludes
   prod if prod was never meant to be covered (module 01). The exemption is
   usually more appropriate when the rule *should* apply org-wide and this is a
   genuine one-off; re-scoping is right only if the policy was mis-placed to begin
   with.
6. The identity running Terraform lacks RBAC in the *workload* subscription the
   `azurerm.workload` alias points at, even though it has rights in the default
   provider's subscription. Aliased providers authenticate independently (module
   05), so you need a role assignment (track 16) for that principal in the
   workload subscription; confirm with `az role assignment list --assignee <sp>
   --subscription <workload-id>`.
7. `envs/dev/` and `envs/prod/` directories, each a small root calling the *same*
   `modules/<app>/` shared module, each with its own `*.tfvars` (the only
   per-env differences) and its own `backend` config (own state key/account).
   Guarantee: the blast radius of any single `terraform apply` is exactly one
   environment, enforced structurally (separate directory, backend, state,
   credentials) rather than by remembering which workspace you're on.
8. Azure Blueprints is **deprecated** (never left preview, retiring July 2026) —
   don't build new on it. Rewrites: versioned template artifact → **Template
   Spec** (module 04); locked deploy-as-one-unit → **Deployment Stack** with
   `denySettings` (module 04); bundled policy/RBAC → **policy initiative** (module
   03) + **RBAC at management-group scope** (module 01), assigned natively.
9. (a) The subscription is in the **wrong management group / branch** (module 02),
   so it doesn't inherit the initiative assigned on the intended MG — check its MG
   placement. (b) Compliance simply **hasn't evaluated yet** (module 03 / track 11
   module 05), which takes up to ~30 min for a new scope — wait and re-check. Tell
   them apart by confirming the subscription's MG parent (`az account
   management-group` / assignment visibility) versus just waiting for the
   evaluation cycle.
10. A single **initiative assignment** at the **org-root management-group scope**
    applies the whole standard at once (module 03 + module 01). **Inheritance**
    down the management-group tree makes every new subscription pick it up
    automatically (module 01). The one escape hatch for a legitimate exception is
    a scoped, time-bound **policy exemption** (module 03).

</details>

## Next

Continue to
[06-tagging-strategy-and-resource-organization](../06-tagging-strategy-and-resource-organization/README.md)
— you can structure and provision the org; now impose the *metadata* discipline
(a real tagging taxonomy) that makes cost allocation and resource organization
possible, feeding the cost-management track (21) later.
