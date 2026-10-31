# Providers, Resources & the azurerm Provider

## Why this matters
You've run the workflow; now you need to actually *write* configurations
that build more than a lone resource group. Real infrastructure is many
resources that reference each other — a subnet belongs to a VNet, an NSG
attaches to a subnet. This module covers the anatomy of a resource block,
how resources reference each other by address (which is also how Terraform
figures out what order to create things in), and how version pinning keeps
your builds reproducible across a team.

## Concepts

### Anatomy of a resource block
Every resource block has the same four-part header and a body of arguments:

```hcl
resource "azurerm_virtual_network" "hub" {
  name                = "hub-vnet"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  address_space       = ["10.0.0.0/16"]
}
```

- `resource` — the block type.
- `"azurerm_virtual_network"` — the **resource type**: the provider prefix
  (`azurerm`) plus the specific kind. This maps to an Azure resource type
  and is defined by the provider, not by you.
- `"hub"` — the **local name**, chosen by you, unique within this type in
  this module. It's how you refer to this resource elsewhere. It is *not*
  the Azure name.
- The body — arguments (`name`, `address_space`, …). Which arguments exist,
  which are required, and their exact spellings come from the provider's
  registry documentation. This VNet is the same one you built with
  `az network vnet create` in track 5, module 01 — here's its declarative
  form.

### Resource addressing and references
A resource's **address** is `<type>.<local_name>` — e.g.
`azurerm_resource_group.main`. To use one resource's attribute in another,
you write `<type>.<local_name>.<attribute>`:

```hcl
resource_group_name = azurerm_resource_group.main.name
```

This says "use the `name` attribute of the resource group I named `main`."
Referencing an attribute does two things at once: it wires the value
through, *and* it tells Terraform that this resource depends on that one.

### Implicit dependencies and apply ordering
Because `azurerm_virtual_network.hub` references
`azurerm_resource_group.main.name`, Terraform knows the resource group must
exist first. It builds a **dependency graph** from these references and
creates resources in the correct order automatically (and destroys them in
reverse). You almost never specify order manually — you just reference
attributes and let the graph sort it out. This is why you write
`azurerm_resource_group.main.name` instead of hard-coding the string
`"rg-tf-learn"`: the hard-coded string would create the same *value* but
lose the *dependency*, and Terraform might try to build the VNet before the
group exists.

### Explicit dependencies with `depends_on`
Occasionally two resources depend on each other in a way that isn't
expressed through an attribute reference (e.g. a role assignment that must
exist before some data plane operation, with no direct attribute link).
For those rare cases, `depends_on = [azurerm_role_assignment.example]`
forces ordering explicitly. Reach for it only when there's no natural
attribute reference to use — overusing it makes your graph rigid.

### Reading the registry docs (don't invent arguments)
The authoritative reference for every resource type is the Terraform
Registry: `registry.terraform.io/providers/hashicorp/azurerm/latest/docs`.
Each resource page lists its arguments (required vs optional), its exported
**attributes** (values you can reference elsewhere, like an `id`), and
examples. **Do not guess argument names.** Azure resources have specific,
sometimes surprising argument spellings (`address_space` is a list;
`address_prefixes` on a subnet is also a list; a network security rule uses
`destination_port_range`, singular, or `destination_port_ranges`, plural —
you pick one). When unsure of an exact current argument name, check the
resource's registry page rather than inventing one.

### Provider configuration and version pinning
Two different version numbers matter, and confusing them is common:

- **The Terraform CLI version** — pinned with `required_version` in the
  `terraform` block.
- **The provider version** — pinned per-provider in `required_providers`.

The constraint operators you'll use:

| Constraint | Allows | Typical use |
|---|---|---|
| `= 4.37.0` | exactly that version | rarely; too rigid |
| `>= 4.0.0` | that version or newer | risky — allows major bumps |
| `~> 4.0` | `>= 4.0, < 5.0` (any 4.x) | pin the **major** version |
| `~> 4.37.0` | `>= 4.37.0, < 4.38.0` | pin **major+minor**, allow patches |

Pin the major version (`~> 4.0`) at minimum, so a `5.0` provider with
breaking changes never sneaks in on a routine `terraform init -upgrade`.
The `.terraform.lock.hcl` file (module 01) then records the *exact* version
resolved, so the whole team is byte-identical.

### Multiple provider configurations (aliases)
Sometimes you deploy to two subscriptions or two regions in one config. You
give a provider block an `alias` and reference it per-resource with
`provider = azurerm.<alias>`:

```hcl
provider "azurerm" {
  features {}
  subscription_id = var.primary_subscription_id
}

provider "azurerm" {
  alias           = "dr"
  features {}
  subscription_id = var.dr_subscription_id
}
```

A resource then opts into the aliased provider with
`provider = azurerm.dr`. You won't need this until multi-region work, but
recognize the pattern.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `terraform init -upgrade` | Re-resolves provider versions to the newest allowed by constraints, updating the lock file | `terraform init -upgrade` |
| `terraform providers` | Shows the providers this configuration requires | `terraform providers` |
| `terraform providers lock` | Records provider checksums for multiple platforms in the lock file | `terraform providers lock -platform=linux_amd64` |
| `terraform graph` | Emits the dependency graph in DOT format | `terraform graph` |
| `terraform state list` | Lists tracked resource addresses | `terraform state list` |
| `terraform fmt -recursive` | Formats all `.tf` files in this and subdirectories | `terraform fmt -recursive` |
| `terraform validate` | Checks config syntax and internal references | `terraform validate` |

Flag breakdown — `terraform init -upgrade`:
- `-upgrade` — ignores the currently locked versions and re-selects the
  newest versions permitted by your `required_providers` constraints, then
  rewrites `.terraform.lock.hcl`. Run it intentionally when you *want* to
  move up; a plain `terraform init` respects the existing lock.

Flag breakdown — `terraform providers lock -platform=linux_amd64`:
- `-platform=<os_arch>` — adds checksums for a specific OS/architecture to
  the lock file. Run it for each platform your team + CI use (e.g.
  `linux_amd64`, `darwin_arm64`, `windows_amd64`) so `init` never fails a
  checksum verification on someone else's machine.

## Hands-on exercises

These create free resources (resource group, VNet, subnet). Destroy at the
end regardless.

1. **Set up.** New directory, provider skeleton, subscription exported:
   ```bash
   mkdir -p ~/tf-labs/02-resources && cd ~/tf-labs/02-resources
   export ARM_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
   ```
   Create `main.tf` with the module 00 provider skeleton and a resource
   group named `rg-tf-resources` in `eastus`.

2. **Add a VNet that references the resource group.** Append:
   ```hcl
   resource "azurerm_virtual_network" "hub" {
     name                = "hub-vnet"
     resource_group_name = azurerm_resource_group.main.name
     location            = azurerm_resource_group.main.location
     address_space       = ["10.0.0.0/16"]
   }
   ```
   Run `terraform init` then `terraform plan`.
   > Verify: `Plan: 2 to add`. Note that even though the VNet block is
   > written *after* the resource group, Terraform will create the group
   > first because of the reference — confirm by reading the plan.

3. **Apply and inspect the dependency graph.** Run `terraform apply`
   (`yes`), then:
   ```bash
   terraform state list
   ```
   > Verify: both `azurerm_resource_group.main` and
   > `azurerm_virtual_network.hub` are listed. Confirm in Azure with
   > `az network vnet show -g rg-tf-resources -n hub-vnet -o table` — this
   > is the same VNet you'd have built with `az network vnet create`.

4. **Add a subnet referencing the VNet.** Append:
   ```hcl
   resource "azurerm_subnet" "web" {
     name                 = "web-subnet"
     resource_group_name  = azurerm_resource_group.main.name
     virtual_network_name = azurerm_virtual_network.hub.name
     address_prefixes     = ["10.0.1.0/24"]
   }
   ```
   Run `terraform plan` then `apply`.
   > Verify: `Plan: 1 to add`. The subnet references the VNet's `name`, so
   > Terraform orders it after the VNet automatically.

5. **Prove the reference creates a real dependency.** Run:
   ```bash
   terraform state show azurerm_subnet.web
   ```
   > Verify: the subnet's `id` embeds the VNet and resource group names —
   > exactly the values you referenced, wired through by Terraform rather
   > than hard-coded.

6. **Read the registry to add a correct argument.** Suppose you want the
   VNet to have custom DNS servers. *Before writing anything*, open the
   `azurerm_virtual_network` page on the Terraform Registry and find the
   correct argument name (it's `dns_servers`, a list). Add:
   ```hcl
     dns_servers = ["10.0.0.4", "10.0.0.5"]
   ```
   Run `terraform plan`.
   > Verify: `Plan: 0 to add, 1 to change` (`~` update in place). The point
   > of this exercise is the *habit* of confirming the argument name in the
   > docs instead of guessing.

7. **Diagnose and fix: a made-up argument.** Now do the wrong thing on
   purpose. Add a plausible-but-fake argument to the VNet:
   ```hcl
     enable_ddos = true
   ```
   Run `terraform validate`.
   > Verify: it errors with `An argument named "enable_ddos" is not
   > expected here`. Terraform validates argument names against the
   > provider schema, catching invented arguments. Remove the line. (The
   > real DDoS setting is configured via a separate
   > `ddos_protection_plan` block — another reason to read the docs.)

8. **Diagnose and fix: an unpinned provider bites you (thought
   experiment + real command).** Look at your current constraint (`~> 4.0`)
   and run:
   ```bash
   terraform providers
   ```
   > Verify: it prints `provider[registry.terraform.io/hashicorp/azurerm]
   > ~> 4.0`. Now imagine you'd written `>= 4.0.0` instead and a `5.0`
   > provider shipped with breaking changes: a routine `terraform init
   > -upgrade` would pull it and your config could break. The fix is
   > exactly what you have — pin the major version with `~>`. Confirm the
   > lock file recorded a specific version: `grep version
   > .terraform.lock.hcl`.

9. **Format your code.** Deliberately mangle the indentation in `main.tf`,
   then:
   ```bash
   terraform fmt
   ```
   > Verify: `fmt` prints the filename it fixed and the indentation is now
   > canonical. Run `terraform fmt -check` — it exits 0 (clean). This is
   > the check CI will run in module 07.

10. **Clean up.** Everything here is free, but destroy anyway:
    ```bash
    terraform destroy
    ```
    Confirm with `az group show -n rg-tf-resources -o table` that it's
    gone (`ResourceGroupNotFound`).

## Independent challenge
Without copying the exercise blocks, write a single configuration that
builds a resource group, a VNet with **two** subnets, and adds a second,
non-overlapping address space to the VNet — reproducing declaratively what
you did imperatively in track 5, module 01 (the multi-subnet VNet with a
second address space). Every cross-resource value must be a *reference*, not
a hard-coded string. Before applying, predict the exact "N to add" number
and confirm the plan matches. After applying, use `terraform state show` to
prove the subnets' IDs embed the VNet you created. Destroy when done. This
draws on this module's addressing/dependency concepts and track 5's VNet
subnetting rules.

<details><summary>Stuck? One hint</summary>

A VNet's `address_space` is a **list**, so a second address space is just a
second element: `address_space = ["10.0.0.0/16", "10.10.0.0/16"]`. Each
subnet is its own `azurerm_subnet` resource with a unique local name, both
referencing `azurerm_virtual_network.<name>.name`. Read the plan's summary
line — you should be predicting `4 to add` (group + VNet + 2 subnets).
</details>

## Common mistakes & troubleshooting
- **Hard-coding a value instead of referencing it.** Writing
  `resource_group_name = "rg-tf-resources"` produces the right value but
  drops the dependency edge, so Terraform may try to build in the wrong
  order. Always reference `azurerm_resource_group.main.name`.
- **Inventing argument names.** The provider schema is exact. Guessing
  (`enable_ddos`, `subnet_name` on a VNet, etc.) fails `validate`. Read the
  resource's registry page.
- **Confusing the local name with the Azure name.** `"hub"` in
  `azurerm_virtual_network.hub` is your Terraform label; the Azure name is
  the `name = "hub-vnet"` argument. They can differ and often do.
- **Not pinning the provider major version.** `>= 4.0.0` invites a breaking
  `5.0` on the next `-upgrade`. Use `~> 4.0`, and commit the lock file.
- **Overusing `depends_on`.** If you can express a dependency through an
  attribute reference, do that instead — it's clearer and keeps the graph
  accurate. Reserve `depends_on` for genuinely reference-less ordering.
- **Cost pitfall:** these specific resources (RG, VNet, subnets) are free,
  but the same *pattern* in module 06 creates billable AKS/load-balancer
  resources. The destroy habit you're building now is what stops those from
  lingering.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. Break down the header `resource "azurerm_subnet" "web"` — what is each
   of the three parts?
2. What's the difference between a resource's *local name* and its Azure
   `name` argument?
3. When you write `resource_group_name = azurerm_resource_group.main.name`,
   what *two* things does that reference accomplish?
4. How does Terraform decide what order to create resources in? Do you
   usually set it manually?
5. What does `~> 4.0` allow and disallow, and why is it better than
   `>= 4.0.0`?
6. You're not sure whether a subnet argument is `address_prefix` or
   `address_prefixes`. What's the right way to find out?
7. When is `depends_on` actually necessary, given implicit dependencies
   exist?

<details><summary>Show answers</summary>

1. `resource` = block type; `"azurerm_subnet"` = the resource type
   (provider + kind, defined by the provider); `"web"` = the local name you
   chose to reference it by.
2. The local name is your Terraform-internal label (used in addresses and
   references); the `name` argument is the actual name Azure gives the
   resource. They're independent and often different.
3. It passes the resource group's name into the subnet as a value, *and* it
   creates a dependency edge so Terraform creates the group before the
   subnet (and destroys in reverse).
4. From the dependency graph it builds out of attribute references. You
   usually don't set order manually — references imply it; `depends_on` is
   the rare exception.
5. It allows any `4.x` (`>= 4.0, < 5.0`) and disallows `5.0`+. It's better
   than `>= 4.0.0` because it prevents a breaking major-version bump from
   being pulled in automatically.
6. Read the `azurerm_subnet` page in the Terraform Registry docs — it lists
   exact argument names. (It's `address_prefixes`, a list.) Don't guess.
7. Only when two resources must be ordered but have no attribute reference
   linking them (e.g. a permission that must exist before a data-plane
   action). If an attribute reference can express it, use that instead.

</details>

## Cumulative review
Closed-book. Cover the answers and write out each one before checking — this
mixes everything from modules 00-02.

1. Contrast imperative (`az`) and declarative (Terraform) infrastructure
   management, and give one advantage of declarative you experienced the
   absence of in tracks 5-7.
2. What are the two mandatory blocks in a minimal Azure Terraform config,
   and what one easy-to-forget empty block must the provider block contain?
3. Put these in the order you'd run them the first time and say what each
   does: `apply`, `plan`, `init`, `destroy`.
4. What is the state file, why must it never be committed to Git, and what
   *related* file *should* be committed?
5. In a plan, what do `+`, `~`, and `-/+` each mean, and which one should
   make you stop before applying?
6. A teammate changed a Terraform-managed NSG rule in the portal. What is
   this called, how does Terraform surface it, and what are your two valid
   responses?
7. Why do you write `resource_group_name = azurerm_resource_group.main.name`
   rather than the literal string, in terms of the dependency graph?
8. Your CI must apply exactly the plan a reviewer approved, with no
   re-computation. Which two commands, in order, achieve that?
9. What does `~> 4.0` mean, and what disaster does it prevent compared to
   `>= 4.0.0`?

<details><summary>Show answers</summary>

1. Imperative issues ordered commands that mutate state immediately and
   don't leave a reusable definition; declarative describes desired end
   state that Terraform reconciles idempotently. Advantages felt earlier:
   no reviewable/auditable record of infra changes, and no easy repeatable
   rebuild — you re-typed `az` commands by hand.
2. The `terraform` block (with `required_providers`) and the `provider
   "azurerm"` block; the latter must contain an empty `features {}` block.
3. `init` (download providers / set up backend), then `plan` (preview
   changes), then `apply` (make and record them), then `destroy` (tear
   everything down).
4. It's the JSON mapping of config addresses to real Azure objects
   (Terraform's memory). Never commit it: it can hold plaintext secrets and
   is machine-managed. The `.terraform.lock.hcl` lock file *should* be
   committed.
5. `+` create, `~` update in place, `-/+` destroy-and-recreate. `-/+`
   should make you stop — it can mean data loss or a changed identity/IP.
6. Drift. Terraform surfaces it during `plan`'s refresh as a diff that
   would revert the change. Valid responses: apply to revert (config wins),
   or update config / `apply -refresh-only` to adopt the change.
7. The reference both passes the value through and creates a dependency
   edge, so Terraform creates the resource group before the resource that
   references it; a literal string would pass the value but lose the
   ordering guarantee.
8. `terraform plan -out=tfplan` then `terraform apply tfplan`.
9. `~> 4.0` allows any `4.x` but not `5.0`+. It prevents a breaking
   major-version provider upgrade from being pulled automatically, which
   `>= 4.0.0` would permit.

</details>

## Next
[03 — Variables, outputs & data sources](../03-variables-outputs-and-data-sources/README.md):
stop hard-coding names and regions, expose useful values after apply, and
reference existing Azure resources you didn't create with Terraform.
