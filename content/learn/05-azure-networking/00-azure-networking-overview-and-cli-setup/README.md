# Azure Networking Overview & CLI Setup

## Why this matters
Every command in this track runs against your real subscription, so before
you create anything you need a working, authenticated `az` CLI pointed at the
right subscription in the right region. This module also gives you the mental
map — which Azure resource is the implementation of each general-networking
concept you already know — so the rest of the track is translation, not
relearning.

## Concepts

### The Azure Resource Manager model
Everything in Azure is a *resource* (a VNet, a public IP, an NSG), every
resource lives in exactly one *resource group*, and every resource group
lives in one *subscription*. A resource group is a management and lifecycle
boundary: deleting the group deletes everything in it, which is exactly why
`az group delete` is your cleanup button throughout this track. Resources also
have a *location* (region, e.g. `eastus`); most networking resources are
regional, meaning a VNet in `eastus` cannot directly contain a NIC in
`westus`.

### General-networking terms mapped onto Azure
You already know these concepts from track 1. Here is the Azure name for each:

| General concept (track 1) | Azure implementation |
|---|---|
| A private network you carve into subnets | **Virtual Network (VNet)** + **subnets** |
| Stateful firewall / packet filter | **Network Security Group (NSG)** |
| L4 (TCP/UDP) load balancer | **Azure Load Balancer** (Standard SKU) |
| L7 (HTTP) reverse proxy / load balancer | **Application Gateway** |
| Managed authoritative DNS hosting | **Azure DNS** (public zones) / **Private DNS zones** |
| Split-horizon / internal DNS | **Private DNS zone** linked to a VNet |
| Source NAT for outbound internet | **NAT Gateway** (or Load Balancer outbound rules) |
| A routed connection between two networks | **VNet peering** |
| Centralized egress firewall / perimeter | **Azure Firewall** |
| Web Application Firewall (OWASP rules) | **WAF** (on Application Gateway or Front Door) |

Keep this table nearby; the rest of the track fills in the details of each row.

### The Azure CLI and the network command group
The `az` CLI groups commands by resource type. Almost everything in this track
lives under `az network ...` — for example `az network vnet create`,
`az network nsg rule create`, `az network lb probe create`. The `network`
command group ships with the CLI core (it is not a separate installed
extension the way some preview features are), so if `az` works, `az network`
works. You will confirm this in the exercises.

### Regions, names, and idempotency
Pick one region and stick with it for a whole module — cross-region wiring
adds latency, cost, and failure modes you don't want while learning. Resource
names must be unique within their scope (e.g. a VNet name is unique within its
resource group; a public DNS name label must be globally unique). Most `az
network ... create` commands are **not** idempotent — running create twice
usually errors or edits in place, so prefer `create` once then `update`.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az login` | Authenticates the CLI to Azure | `az login` |
| `az account show` | Shows the currently active subscription | `az account show --output table` |
| `az account list` | Lists subscriptions you can access | `az account list --output table` |
| `az account set` | Sets the active (default) subscription | `az account set --subscription "My Sub"` |
| `az group create` | Creates a resource group | `az group create --name net-lab-rg --location eastus` |
| `az group list` | Lists resource groups | `az group list --output table` |
| `az group delete` | Deletes a resource group and everything in it | `az group delete --name net-lab-rg --yes --no-wait` |
| `az version` | Shows CLI and extension versions | `az version` |
| `az configure` | Sets CLI defaults (e.g. default group/location) | `az configure --defaults group=net-lab-rg location=eastus` |

Flag breakdown — `az group create --name net-lab-rg --location eastus`:
- `--name` (`-n`): the resource group's name, unique within the subscription.
- `--location` (`-l`): the region metadata for the group; resources inside can
  technically be elsewhere, but keep them together for simplicity.

Flag breakdown — `az group delete --name net-lab-rg --yes --no-wait`:
- `--name` (`-n`): which group to delete.
- `--yes`: skips the interactive "are you sure?" confirmation.
- `--no-wait`: returns immediately instead of blocking until deletion finishes;
  the delete continues server-side.

Flag breakdown — `az configure --defaults group=net-lab-rg location=eastus`:
- `--defaults`: stores key=value defaults so you can omit `--resource-group`
  and `--location` on later commands. Convenient, but be aware later exercises
  spell out the flags explicitly for clarity.

## Hands-on exercises

1. **Log in.** Run `az login`. A browser window opens; complete the sign-in.
   On success the CLI prints a JSON/table list of subscriptions you can reach.
   > Verify: `az account show --output table` prints a subscription with an
   > `IsDefault` of `True`.

2. **Inspect your subscriptions.** Run `az account list --output table`. Note
   the `Name` and `SubscriptionId` of the one you intend to use for this
   track.

3. **Set the active subscription.** If the default isn't the one you want:
   ```
   az account set --subscription "<your-subscription-name-or-id>"
   ```
   Re-run `az account show --output table` and confirm the name matches.

4. **Confirm the CLI and network commands work.** Run:
   ```
   az version
   az network -h
   ```
   `az version` prints `azure-cli` and a version number; `az network -h`
   prints a long list of subgroups (`vnet`, `nsg`, `public-ip`, `lb`, ...).
   If those appear, the network command group is available — nothing to
   install.

5. **Create your lab resource group.**
   ```
   az group create --name net-lab-rg --location eastus
   ```
   > Verify: `az group list --output table` shows `net-lab-rg` with
   > `Location` `eastus` and `ProvisioningState` `Succeeded`.

6. **Set CLI defaults (optional convenience).**
   ```
   az configure --defaults group=net-lab-rg location=eastus
   ```
   Later modules still write out `--resource-group` for clarity, but this
   saves typing if you experiment on your own.

7. **List everything in the group.** Run:
   ```
   az resource list --resource-group net-lab-rg --output table
   ```
   Right now it should be empty (or nearly so). This is the command you'll use
   throughout the track to see what you've actually created — and what you
   forgot to delete.

8. **Diagnose and fix: wrong subscription.** Simulate a common mistake.
   Suppose you have two subscriptions and accidentally created `net-lab-rg` in
   the wrong one. Run `az group show --name net-lab-rg --output table`. If it
   errors with "ResourceGroupNotFound" even though you just created it, the
   likely cause is that your active subscription changed (or was never the one
   you created it in). Fix it: run `az account list --output table`, find the
   subscription that actually holds the group, then
   `az account set --subscription "<correct-one>"` and re-run the show. The
   lesson: **"not found" errors in Azure are frequently a wrong-subscription
   or wrong-resource-group problem, not a missing resource.**

9. **Cleanup.** You can keep `net-lab-rg` for module 01, or delete it now:
   ```
   az group delete --name net-lab-rg --yes --no-wait
   ```
   The group in this module holds no billable resources, so keeping it costs
   nothing. Module 01 assumes you're logged in but creates its own group.

## Independent challenge
Without copying the exercises above, prove to yourself that you can go from a
cold terminal to a ready state entirely from memory: authenticate, select the
correct subscription, create a resource group named `challenge-rg` in a region
of your choice, confirm it exists and is empty, then delete it. Combine this
with nothing prior (this is module 00) but do write down each command before
running it. Remember to delete `challenge-rg` at the end so you leave no
resources behind.

<details><summary>Stuck? One hint</summary>

The four verbs you need, in order, are `login`, `set` (on `az account`),
`create` (on `az group`), and `delete` (on `az group`). Use
`--output table` on the `show`/`list` commands to read results at a glance,
and `--yes` to avoid the delete confirmation prompt.
</details>

## Common mistakes & troubleshooting
- **Operating in the wrong subscription.** The single most common Azure CLI
  mistake. Always confirm with `az account show` before creating resources.
- **Region sprawl.** Creating resources in mixed regions makes peering and
  cost tracking harder. Pick one region per module.
- **Assuming `create` is idempotent.** Re-running a create can error or
  silently change configuration. When unsure of current state, use `show`
  first.
- **Forgetting `--yes` / `--no-wait` on delete.** In scripts, a delete without
  `--yes` blocks on a prompt; without `--no-wait` it blocks until finished.
- **Cost pitfall (habit-forming):** even though nothing here bills, get in the
  habit *now* of ending every session with
  `az resource list -g <rg> --output table` to see what's live. In later
  modules an overlooked resource is real money.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. What is the relationship between a subscription, a resource group, and a
   resource?
2. Which Azure resource is the implementation of "a stateful firewall"? Which
   is the L7 load balancer?
3. Do you need to install a separate CLI extension to run `az network vnet
   create`? How would you confirm?
4. What does `az group delete --name X --yes --no-wait` do, flag by flag?
5. You run `az group show -n myrg` and get "ResourceGroupNotFound" even though
   you're sure you created it. What's the most likely cause and how do you
   confirm?
6. Why does this track tell you to keep all resources in one region per
   module?

<details><summary>Show answers</summary>

1. A resource belongs to exactly one resource group; a resource group belongs
   to exactly one subscription. Deleting a resource group deletes all
   resources in it.
2. Stateful firewall → **Network Security Group (NSG)**. L7 load balancer →
   **Application Gateway**.
3. No — the `network` command group is part of the CLI core. Confirm with
   `az network -h` (it lists subgroups like `vnet`, `nsg`, `lb`) or just run a
   `az network vnet list`.
4. `--name X`: target group; `--yes`: skip the confirmation prompt;
   `--no-wait`: return immediately and let deletion continue server-side.
5. Most likely you're in the wrong active subscription (or the group is in a
   different subscription). Confirm with `az account show` and
   `az account list --output table`, then `az account set` to the right one.
6. Cross-region resources add latency and cost, complicate VNet peering, and
   make cleanup/cost tracking harder — regional co-location keeps the lab
   simple.
</details>

## Next
[01 — Virtual networks & subnets](../01-virtual-networks-and-subnets/README.md):
carve your first VNet into subnets and see how Azure reserves IPs inside every
subnet.
