# Variables, Outputs & Data Sources

## Why this matters
Everything you've written so far hard-codes names, regions, and CIDR ranges
directly in resource blocks. That doesn't scale: you can't reuse a config
for dev *and* prod, you can't cleanly hand off a value like a cluster's FQDN
to whoever needs it, and you can't reference the resources other teams
already built. Variables, outputs, locals, and data sources fix all four —
they're what turn a one-off script into reusable, composable
infrastructure code, and they're prerequisites for writing modules
(module 04).

## Concepts

### Input variables
A `variable` block declares a parameter your config accepts, so callers can
change behavior without editing resource blocks:

```hcl
variable "location" {
  type        = string
  default     = "eastus"
  description = "Azure region for all resources"
}
```

You reference it as `var.location`. Key fields:

- `type` — `string`, `number`, `bool`, or complex types (`list(string)`,
  `map(string)`, `object({...})`). Terraform enforces the type.
- `default` — makes the variable optional. **No default = required**; if
  the caller doesn't supply it, Terraform prompts (interactively) or errors
  (in automation).
- `description` — documents it (shows up in errors and tooling).
- `sensitive = true` — redacts the value from plan/apply output (use for
  anything secret; note it's still stored in state).
- `validation { ... }` — a custom rule (e.g. "must be one of these
  regions") that rejects bad input at plan time.

### How variable values get supplied
Terraform resolves a variable's value from the first source that provides
it, in this precedence (highest wins):

1. `-var` on the command line: `terraform apply -var="location=westus"`.
2. `-var-file`: `terraform apply -var-file=prod.tfvars`.
3. **Automatically loaded** `terraform.tfvars` and `*.auto.tfvars` files.
4. Environment variables named `TF_VAR_<name>` (e.g. `TF_VAR_location`).
5. The `default` in the `variable` block.

The everyday pattern: declare variables with sensible defaults, and put
per-environment overrides in a `dev.tfvars` / `prod.tfvars` file you pass
with `-var-file`. **Never put secrets in a `.tfvars` file you commit** —
use `TF_VAR_` env vars or a secrets manager for those.

### Locals: named expressions, not inputs
A `locals` block names a computed value used in multiple places. Unlike a
variable, a local is *not* an input — the caller can't override it; it's
internal DRY-ing:

```hcl
locals {
  name_prefix = "${var.project}-${var.environment}"
  common_tags = {
    environment = var.environment
    managed_by  = "terraform"
    project     = var.project
  }
}
```

Reference them as `local.name_prefix`, `local.common_tags`. Use variables
for things a caller should control; use locals for values you *derive* from
variables (or from resource attributes) and want to reuse.

### Output values
An `output` block surfaces a value after apply — on the terminal, and (more
importantly) for other configurations/modules to consume:

```hcl
output "resource_group_name" {
  value       = azurerm_resource_group.main.name
  description = "The name of the created resource group"
}
```

Outputs are how a module hands results back to its caller (module 04) and
how you programmatically grab a value (`terraform output -raw
resource_group_name`) to feed into a script or a `kubectl` command. Mark an
output `sensitive = true` to keep it out of console logs.

### Data sources: referencing what you didn't create
A `resource` block *creates and manages* something. A **`data` block**
*reads* something that already exists — whether another team made it, you
made it in the portal, or another Terraform config owns it:

```hcl
data "azurerm_resource_group" "existing" {
  name = "rg-shared-networking"
}
```

You reference its attributes as
`data.azurerm_resource_group.existing.location`. Terraform does not manage
or destroy a data source — it only queries it during refresh. This is the
clean way to deploy *into* a shared VNet another team owns without taking
ownership of it: read it with a `data` block, reference its ID, and let the
other team's Terraform keep managing it. In a plan, data sources show as
`<=` (read).

### Variable validation
A `validation` block catches bad input before any API call:

```hcl
variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}
```

This turns a class of runtime failures (typo'd environment name → wrongly
named resources) into an immediate, readable plan-time error.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `terraform plan -var` | Sets one variable inline | `terraform plan -var="location=westus"` |
| `terraform apply -var-file` | Loads variables from a file | `terraform apply -var-file=prod.tfvars` |
| `terraform output` | Prints all output values | `terraform output` |
| `terraform output <name>` | Prints one output | `terraform output resource_group_name` |
| `terraform output -raw <name>` | Prints one output with no quotes/formatting (for scripts) | `terraform output -raw kube_config` |
| `terraform output -json` | Prints all outputs as JSON | `terraform output -json` |
| `terraform console` | Interactive expression evaluator (test `local.`/`var.` expressions) | `terraform console` |
| `terraform plan -var-file` | Plans with a var file | `terraform plan -var-file=dev.tfvars` |

Flag breakdown — `terraform apply -var-file=prod.tfvars`:
- `-var-file=<file>` — loads variable assignments from the named file. Pass
  it explicitly for files not auto-loaded (anything not named
  `terraform.tfvars` or `*.auto.tfvars`). This is how you keep dev and prod
  values in separate, reviewable files.

Flag breakdown — `terraform output -raw <name>`:
- `-raw` — prints the value with no surrounding quotes or HCL formatting,
  so it's safe to embed directly in a shell command, e.g.
  `az aks get-credentials -g "$(terraform output -raw rg_name)" ...`. Only
  works for string/number outputs.

## Hands-on exercises

Free resources again (RG + VNet + subnet). Destroy at the end.

1. **Set up with variables.** New directory:
   ```bash
   mkdir -p ~/tf-labs/03-variables && cd ~/tf-labs/03-variables
   export ARM_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
   ```
   Create `variables.tf`:
   ```hcl
   variable "project" {
     type        = string
     description = "Short project slug used in resource names"
     default     = "tflab"
   }

   variable "location" {
     type        = string
     description = "Azure region"
     default     = "eastus"
   }

   variable "environment" {
     type        = string
     description = "Deployment environment"
     validation {
       condition     = contains(["dev", "staging", "prod"], var.environment)
       error_message = "environment must be dev, staging, or prod."
     }
   }
   ```
   Note `environment` has **no default** — it's required.

2. **Add locals and resources that use them.** Create `main.tf` with the
   provider skeleton, then:
   ```hcl
   locals {
     name_prefix = "${var.project}-${var.environment}"
     common_tags = {
       environment = var.environment
       managed_by  = "terraform"
     }
   }

   resource "azurerm_resource_group" "main" {
     name     = "rg-${local.name_prefix}"
     location = var.location
     tags     = local.common_tags
   }

   resource "azurerm_virtual_network" "hub" {
     name                = "${local.name_prefix}-vnet"
     resource_group_name = azurerm_resource_group.main.name
     location            = azurerm_resource_group.main.location
     address_space       = ["10.0.0.0/16"]
     tags                = local.common_tags
   }
   ```

3. **Watch validation reject bad input.** Try an invalid environment:
   ```bash
   terraform init
   terraform plan -var="environment=production"
   ```
   > Verify: it fails immediately with your custom message
   > (`environment must be dev, staging, or prod.`) — no Azure call made.
   > Now run `terraform plan -var="environment=dev"` and confirm it plans
   > `2 to add`, with names like `rg-tflab-dev`.

4. **Use a tfvars file instead of `-var`.** Create `dev.tfvars`:
   ```hcl
   environment = "dev"
   location    = "eastus"
   ```
   Then:
   ```bash
   terraform apply -var-file=dev.tfvars
   ```
   > Verify: resources are created with `-dev` in their names. Confirm with
   > `az group show -n rg-tflab-dev -o table`.

5. **Add outputs.** Create `outputs.tf`:
   ```hcl
   output "resource_group_name" {
     value       = azurerm_resource_group.main.name
     description = "Name of the created resource group"
   }

   output "vnet_id" {
     value       = azurerm_virtual_network.hub.id
     description = "Full Azure resource ID of the VNet"
   }
   ```
   Run `terraform apply -var-file=dev.tfvars` again, then:
   ```bash
   terraform output
   terraform output -raw resource_group_name
   ```
   > Verify: `terraform output` lists both; `-raw` prints just the group
   > name with no quotes — the form you'd pipe into another command.

6. **Reference an output from a real command.** Prove outputs are useful
   for scripting:
   ```bash
   az group show -n "$(terraform output -raw resource_group_name)" -o table
   ```
   > Verify: it shows your resource group, fetched by feeding Terraform's
   > output straight into `az`.

7. **Add a data source for an existing resource.** First, create something
   *outside* Terraform with `az` to read back:
   ```bash
   az group create -n rg-preexisting-lab -l eastus
   ```
   Add to `main.tf`:
   ```hcl
   data "azurerm_resource_group" "external" {
     name = "rg-preexisting-lab"
   }

   output "external_rg_location" {
     value = data.azurerm_resource_group.external.location
   }
   ```
   Run `terraform plan -var-file=dev.tfvars`.
   > Verify: the data source shows as a read (`<=`), *not* a create, and
   > the plan adds only the new output — Terraform reads `rg-preexisting-lab`
   > but does **not** try to create or manage it. Apply, then
   > `terraform output external_rg_location` prints `eastus`.

8. **Diagnose and fix: a data source that doesn't exist.** Point the data
   source at a non-existent group:
   ```hcl
   data "azurerm_resource_group" "external" {
     name = "rg-does-not-exist-xyz"
   }
   ```
   Run `terraform plan -var-file=dev.tfvars`.
   > Verify: it errors during refresh with something like
   > `Resource group "rg-does-not-exist-xyz" was not found`. A data source
   > must reference something that *actually exists* — unlike a resource,
   > Terraform won't create it. Fix by pointing it back at
   > `rg-preexisting-lab`.

9. **Experiment in the console.** Test expressions without applying:
   ```bash
   terraform console -var-file=dev.tfvars
   ```
   At the prompt type `local.name_prefix` and `local.common_tags`, then
   `exit`.
   > Verify: it evaluates them to `tflab-dev` and the tag map — a fast way
   > to debug expressions before they hit a resource.

10. **Clean up both groups.** The data-source group isn't managed by
    Terraform, so `destroy` won't remove it — delete it separately:
    ```bash
    terraform destroy -var-file=dev.tfvars
    az group delete -n rg-preexisting-lab --yes --no-wait
    ```
    > Verify: `terraform destroy` removes only the resources it manages
    > (the `-dev` group and its VNet), and leaves `rg-preexisting-lab`
    > untouched — which is exactly why you delete that one by hand. Confirm
    > both are gone with `az group list -o table`.

## Independent challenge
Without copying the exercises, write a configuration that is fully
parameterized for **two environments**: it should build a resource group
and a VNet whose names, region, and address space all come from variables,
with a `dev.tfvars` and a `prod.tfvars` that put dev in one region with
`10.0.0.0/16` and prod in another region with `10.1.0.0/16`. Deploy *both*
(they must not collide — different names), then use outputs to print each
VNet's ID, and finally destroy both. As a stretch, add a data source that
reads the *dev* resource group from within the prod config to prove one
config can reference another's output. This builds on this module's
variables/outputs/data-sources and track 5's non-overlapping-address-space
discipline.

<details><summary>Stuck? One hint</summary>

To run two environments from one config directory without them clobbering
each other's state, either use two separate directories each with its own
`.tfvars`, or use `terraform workspace new prod` / `terraform workspace
select dev` so each environment gets its own state file. The simplest,
clearest approach for learning is two directories. Make sure every resource
name derives from `var.environment` so `dev` and `prod` names never
collide.
</details>

## Common mistakes & troubleshooting
- **Putting secrets in a committed `.tfvars` file.** `.tfvars` files are
  plaintext and often committed. Use `TF_VAR_<name>` env vars or a secrets
  manager for anything sensitive, and `.gitignore` any `*.tfvars` holding
  secrets.
- **Expecting a data source to create the resource.** `data` blocks only
  *read*. If the target doesn't exist, refresh fails — data sources are for
  things that already exist, `resource` blocks are for things you own.
- **Confusing variables and locals.** Variables are caller-supplied inputs
  (overridable); locals are internally-derived values (not overridable). If
  a caller should control it, it's a variable.
- **Forgetting a required variable in automation.** A variable with no
  `default` prompts interactively — which *hangs* a CI job. Supply every
  required variable via `-var-file`/`TF_VAR_` in automation.
- **Marking something `sensitive` and thinking it's now safe in state.**
  `sensitive = true` only redacts console output; the value is still stored
  in plaintext in state. Protect state itself (module 05).
- **Cost pitfall:** `terraform destroy` only removes resources Terraform
  *manages* — anything you created with `az` (like the data-source group
  here) survives and keeps billing if it's a paid resource. Track
  out-of-band resources yourself and delete them explicitly.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. What makes a variable *required* versus optional?
2. Rank these value sources by precedence (which wins): a `default`, a
   `-var` flag, a `terraform.tfvars` file, a `TF_VAR_` env var.
3. What's the difference between a `variable` and a `local`?
4. What does an `output` block do, and name two things you'd use one for.
5. What's the fundamental difference between a `resource` block and a
   `data` block?
6. In a plan, what symbol marks a data source, and does Terraform ever
   destroy what a data source reads?
7. You need a cluster password never to appear in `terraform plan` output.
   What do you set — and what's the important caveat about state?
8. `terraform destroy` ran cleanly, but a resource you created earlier with
   `az` is still there and billing. Why, and whose job is it to remove it?

<details><summary>Show answers</summary>

1. A variable is required if it has **no** `default`. With no default and
   no supplied value, Terraform prompts (interactively) or errors (in
   automation).
2. Highest to lowest: `-var` flag > `terraform.tfvars` file (auto-loaded) >
   `TF_VAR_` env var > `default`. (A `-var-file` sits with the file tier,
   above env vars.)
3. A variable is a caller-supplied input that can be overridden; a local is
   an internally-computed named value that callers cannot override — used
   to DRY up derived expressions.
4. It surfaces a value after apply, on the console and for other
   modules/configs to consume. Uses: handing a result to a calling module,
   or grabbing a value (`-raw`) to feed into a script/`az`/`kubectl`.
5. A `resource` creates and manages something (Terraform owns its
   lifecycle); a `data` block only reads an existing thing Terraform does
   not own or destroy.
6. `<=` (read). No — Terraform never creates or destroys what a data source
   references; it only queries it.
7. `sensitive = true` on the variable/output. Caveat: it only redacts
   console output — the value is still stored in plaintext in the state
   file, so you must also protect state itself.
8. `terraform destroy` only removes resources in *its* state (things
   Terraform manages). The `az`-created resource was never managed by
   Terraform, so it's your responsibility to delete it separately.

</details>

## Next
[04 — Modules & code organization](../04-modules-and-code-organization/README.md):
package a reusable chunk of infrastructure with its own inputs and outputs,
and stop copy-pasting the same resource blocks between projects.
