# Virtual Networks & Subnets

## Why this matters
A Virtual Network (VNet) is the foundation every other Azure networking
resource attaches to — NSGs, load balancers, private endpoints, and Container
Apps environments all live inside or connect to VNets. Get the address-space
and subnet decisions wrong and you'll be renumbering later, which in Azure
often means recreating resources. This module is the "IP planning + subnetting"
you know from track 1, applied to Azure's specific rules.

## Concepts

### What a VNet is
A VNet is Azure's implementation of the private network you carve into subnets
in track 1. It is defined by one or more **address spaces** in CIDR notation
(e.g. `10.0.0.0/16`), it is scoped to a single region and subscription, and it
is isolated by default — nothing outside it can reach in, and (with default
system routes) resources inside can reach the internet outbound and each
other. You subdivide the address space into **subnets**, each its own CIDR
range that must fit within the VNet's address space and must not overlap other
subnets in the same VNet.

### Address space planning (and why overlap is fatal)
Use private RFC 1918 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`),
exactly as in track 1. The one rule that bites hardest in Azure: **two VNets
you ever intend to peer must not have overlapping address spaces.** Peering
(module 05) is just routing between VNets, and you cannot route between two
networks that both claim `10.0.0.0/16`. Plan address spaces up front as if
every VNet will eventually connect — e.g. hub `10.0.0.0/16`, spoke-A
`10.1.0.0/16`, spoke-B `10.2.0.0/16`.

### Azure reserves five addresses in every subnet
This is the Azure-specific subnetting detail. In track 1 you learned a subnet
reserves a network address and a broadcast address. Azure reserves **five**
addresses in every subnet: the first (`.0`, network), the next three (`.1`
default gateway, `.2` and `.3` for Azure DNS mapping), and the last
(broadcast). So a `/24` subnet (256 addresses) gives you **251** usable host
IPs, not 254. This is why Azure requires subnets to be at least `/29` (the
smallest, leaving 3 usable) and recommends `/28` or larger for anything real.

### Subnets as delegation and policy boundaries
A subnet in Azure is more than an IP range — it's the attachment point for
NSGs (module 02), route tables (module 07), service endpoints, and private
endpoints (module 05). Some Azure services require a **delegated** or
**dedicated** subnet: Azure Firewall must live in a subnet named exactly
`AzureFirewallSubnet`, Application Gateway needs its own subnet, and some
services (like Container Apps) require subnet *delegation* that reserves the
subnet for that service's exclusive use. Trying to delegate an already-in-use
subnet, or putting Firewall anywhere but `AzureFirewallSubnet`, are common
early failures.

### NIC IP configuration
Resources don't sit "in" a subnet directly — a resource has a **network
interface (NIC)**, and the NIC has an **IP configuration** that binds to a
subnet and gets a private IP (dynamic by default, or static if you set it). A
VM, load balancer backend, or private endpoint is really "a NIC with an IP
config in this subnet." You'll rarely create NICs by hand in this track, but
knowing the layering explains error messages later.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az network vnet create` | Creates a VNet and optionally a first subnet | `az network vnet create -g net-lab-rg -n hub-vnet --address-prefixes 10.0.0.0/16 --subnet-name web-subnet --subnet-prefixes 10.0.1.0/24` |
| `az network vnet list` | Lists VNets | `az network vnet list -g net-lab-rg -o table` |
| `az network vnet show` | Shows one VNet's details | `az network vnet show -g net-lab-rg -n hub-vnet` |
| `az network vnet subnet create` | Adds a subnet to an existing VNet | `az network vnet subnet create -g net-lab-rg --vnet-name hub-vnet -n db-subnet --address-prefixes 10.0.2.0/24` |
| `az network vnet subnet list` | Lists subnets in a VNet | `az network vnet subnet list -g net-lab-rg --vnet-name hub-vnet -o table` |
| `az network vnet subnet update` | Edits a subnet (delegation, NSG, route table) | `az network vnet subnet update -g net-lab-rg --vnet-name hub-vnet -n db-subnet --delegations Microsoft.DBforPostgreSQL/flexibleServers` |
| `az network vnet subnet show` | Shows one subnet | `az network vnet subnet show -g net-lab-rg --vnet-name hub-vnet -n web-subnet` |
| `az network vnet update` | Edits VNet-level settings (e.g. add address space) | `az network vnet update -g net-lab-rg -n hub-vnet --address-prefixes 10.0.0.0/16 10.10.0.0/16` |

Flag breakdown — `az network vnet create -g net-lab-rg -n hub-vnet --address-prefixes 10.0.0.0/16 --subnet-name web-subnet --subnet-prefixes 10.0.1.0/24`:
- `-g` (`--resource-group`): the group to create the VNet in.
- `-n` (`--name`): the VNet name (unique within the group).
- `--address-prefixes`: one or more CIDR blocks for the whole VNet.
- `--subnet-name`: name of a first subnet created in the same call (optional).
- `--subnet-prefixes`: the CIDR for that first subnet; must fit inside
  `--address-prefixes` and not overlap other subnets.

Flag breakdown — `az network vnet subnet create -g net-lab-rg --vnet-name hub-vnet -n db-subnet --address-prefixes 10.0.2.0/24`:
- `--vnet-name`: which existing VNet to add the subnet to.
- `-n` (`--name`): subnet name.
- `--address-prefixes`: the subnet's CIDR; must fit the VNet and not overlap.

Flag breakdown — `az network vnet subnet update ... --delegations Microsoft.DBforPostgreSQL/flexibleServers`:
- `--delegations`: hands the subnet to a specific Azure service. Once
  delegated, that subnet is reserved for that service and can't host arbitrary
  NICs.

## Hands-on exercises

Assumes you're logged in (module 00). Create a fresh group for this module:
```
az group create --name vnet-lab-rg --location eastus
```

1. **Create a VNet with a first subnet.**
   ```
   az network vnet create -g vnet-lab-rg -n hub-vnet \
     --address-prefixes 10.0.0.0/16 \
     --subnet-name web-subnet --subnet-prefixes 10.0.1.0/24
   ```
   > Verify: `az network vnet show -g vnet-lab-rg -n hub-vnet -o table` shows
   > the VNet; `az network vnet subnet list -g vnet-lab-rg --vnet-name
   > hub-vnet -o table` shows `web-subnet` with prefix `10.0.1.0/24`.

2. **Add two more subnets.**
   ```
   az network vnet subnet create -g vnet-lab-rg --vnet-name hub-vnet \
     -n app-subnet --address-prefixes 10.0.2.0/24
   az network vnet subnet create -g vnet-lab-rg --vnet-name hub-vnet \
     -n db-subnet --address-prefixes 10.0.3.0/24
   ```
   > Verify: the subnet list now shows three subnets, none overlapping.

3. **Prove the five-reserved-IPs rule.** Look at the usable range. A `/24`
   has 256 addresses but Azure reserves `.0`, `.1`, `.2`, `.3`, and `.255`.
   Confirm your understanding by predicting the first assignable IP in
   `web-subnet` (answer: `10.0.1.4`). You can see this in action once you
   place a resource; for now, reason it out.

4. **Inspect the default outbound and gateway behavior.** Run:
   ```
   az network vnet subnet show -g vnet-lab-rg --vnet-name hub-vnet \
     -n web-subnet
   ```
   Note there is no explicit route table or NSG attached yet — the subnet
   relies on Azure's default system routes (local VNet, internet, etc.), the
   same defaults you'll override in modules 02 and 07.

5. **Create a dedicated subnet for a future gateway.** Application Gateway
   needs its own subnet. Add one now so module 06 is ready:
   ```
   az network vnet subnet create -g vnet-lab-rg --vnet-name hub-vnet \
     -n appgw-subnet --address-prefixes 10.0.4.0/24
   ```

6. **Add a second address space.** Suppose you're running low on room. Extend
   the VNet:
   ```
   az network vnet update -g vnet-lab-rg -n hub-vnet \
     --address-prefixes 10.0.0.0/16 10.10.0.0/16
   ```
   > Verify: `az network vnet show` now lists both prefixes under
   > `addressSpace.addressPrefixes`.

7. **Diagnose and fix: overlapping subnet.** Try to create a subnet that
   overlaps an existing one:
   ```
   az network vnet subnet create -g vnet-lab-rg --vnet-name hub-vnet \
     -n bad-subnet --address-prefixes 10.0.1.128/25
   ```
   This fails because `10.0.1.128/25` overlaps `web-subnet` (`10.0.1.0/24`).
   Read the error (`NetcfgInvalidSubnet` / overlap). Fix it by choosing a
   non-overlapping range that still fits the VNet:
   ```
   az network vnet subnet create -g vnet-lab-rg --vnet-name hub-vnet \
     -n good-subnet --address-prefixes 10.0.5.0/24
   ```
   > Verify: `good-subnet` appears; `bad-subnet` does not.

8. **Diagnose and fix: subnet too small.** Try a `/30` subnet:
   ```
   az network vnet subnet create -g vnet-lab-rg --vnet-name hub-vnet \
     -n tiny-subnet --address-prefixes 10.0.6.0/30
   ```
   A `/30` (4 addresses) can't satisfy Azure's five-reserved rule and is
   rejected as too small. Fix by using at least `/29`:
   ```
   az network vnet subnet create -g vnet-lab-rg --vnet-name hub-vnet \
     -n small-subnet --address-prefixes 10.0.6.0/29
   ```
   > Verify: `small-subnet` (`/29`) is created — it has 3 usable IPs.

9. **Cleanup.** VNets and subnets themselves are free, but delete the group so
   you start module 02 clean (and so nothing lingers):
   ```
   az group delete --name vnet-lab-rg --yes --no-wait
   ```

## Independent challenge
Design and build address space for a future hub-and-spoke lab **without any
overlaps**, since you'll peer these in module 05. Create three VNets in one
resource group: a hub (`10.0.0.0/16`) with a subnet reserved for a firewall,
and two spokes (`10.1.0.0/16` and `10.2.0.0/16`), each with one workload
subnet. Verify none of the ranges overlap and that the firewall subnet is
named correctly for Azure Firewall. This combines this module's subnetting
with module 00's resource-group discipline. Delete the resource group when
you're done so nothing is left behind.

<details><summary>Stuck? One hint</summary>

Azure Firewall requires a subnet named **exactly** `AzureFirewallSubnet`
(case-sensitive) and recommends it be at least `/26`. The three VNets use
different `/16` second octets (0, 1, 2) precisely so their ranges never
collide when peered.
</details>

## Common mistakes & troubleshooting
- **Overlapping address spaces across VNets.** Fine until you try to peer,
  then unfixable without renumbering. Plan non-overlapping `/16`s up front.
- **Forgetting Azure reserves five IPs per subnet.** Your first host is `.4`,
  and a `/29` gives only 3 usable addresses.
- **Wrong name for special subnets.** `AzureFirewallSubnet` and (later)
  `GatewaySubnet` must be named exactly; App Gateway needs its own dedicated
  subnet with nothing else in it.
- **Trying to delegate or resize a subnet that already has resources.** Azure
  blocks it; you must empty the subnet first.
- **Cost note:** VNets and subnets are free. The cost creeps in with what you
  *attach* to them (public IPs, gateways, firewalls) in later modules — so a
  VNet-only lab left running is harmless, but get in the habit of deleting the
  group anyway.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. How many usable host IPs does a `/24` subnet give you in Azure, and why not
   254?
2. Two teams each built a VNet using `10.0.0.0/16`. What breaks when they try
   to connect them, and why?
3. What is the smallest subnet size Azure allows, and how many usable
   addresses does it have?
4. Where must Azure Firewall's subnet live, and what must it be named?
5. What's the difference between a VNet's address space and a subnet's address
   prefix?
6. Can you shrink or delegate a subnet that already contains a running
   resource? What do you do instead?
7. What's the first assignable private IP in a subnet defined as `10.0.1.0/24`?

<details><summary>Show answers</summary>

1. 251. Azure reserves five addresses per subnet: `.0` (network), `.1`
   (gateway), `.2` and `.3` (Azure DNS mapping), and `.255` (broadcast).
2. Peering breaks — you can't route between two networks with overlapping
   address ranges. There's no fix short of renumbering one VNet.
3. `/29`, which yields 3 usable addresses (8 total minus 5 reserved).
4. In the same VNet, in a subnet named exactly `AzureFirewallSubnet`
   (case-sensitive), recommended `/26` or larger.
5. The address space is the full CIDR range(s) the VNet owns; a subnet prefix
   is a smaller CIDR carved out of that space. Subnets must fit inside the
   address space and not overlap each other.
6. No. You must remove the resources from the subnet first, then modify or
   delegate it.
7. `10.0.1.4` (`.0`–`.3` are reserved).
</details>

## Next
[02 — Network Security Groups](../02-network-security-groups/README.md):
attach Azure's stateful firewall to your subnets and control who can reach
what.
