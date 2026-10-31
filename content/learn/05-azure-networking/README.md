# Track 5: Azure Networking

This is track 2 of 3. It assumes you already understand general networking
concepts — IP addressing and subnetting, DNS, TCP/UDP, HTTP/TLS, routing,
firewalls, and load balancing — at a protocol level from
[track 4: networking-fundamentals](../04-networking-fundamentals/README.md).
This track does **not** re-teach those ideas. Instead it shows how Azure
implements each one: what Azure calls it, which `az network ...` command
creates it, how the pieces wire together, and where the defaults will trip
you up. If a term like "stateful firewall" or "L4 vs L7 load balancing" is
fuzzy, go back to track 1 first.

Everything here runs against a **real Azure subscription**. You will create
real resources that cost real money.

> **Cost warning.** Most resources here (VNets, subnets, NSGs, private DNS
> zones) are free or nearly free, but **Application Gateway and Azure
> Firewall bill per hour whether or not they're handling traffic** — an idle
> Firewall or App Gateway can quietly run up tens of dollars over a weekend.
> Public IPs, NAT Gateways, and Load Balancers (Standard SKU) also carry
> small hourly charges. **Delete resource groups (`az group delete`) when
> you're done with a module's exercises.** Every module that creates billable
> resources ends with an explicit cleanup step. Do not skip it.

## Modules

| # | Module | What you'll learn | Rough time |
|---|--------|-------------------|-----------|
| 00 | [Azure networking overview & CLI setup](00-azure-networking-overview-and-cli-setup/README.md) | Log in, pick a subscription, confirm the `network` CLI works, and map general-networking terms onto Azure terms | 45 min |
| 01 | [Virtual networks & subnets](01-virtual-networks-and-subnets/README.md) | Create VNets and subnets, understand Azure's address-space rules and reserved IPs | 1.5 hr |
| 02 | [Network Security Groups](02-network-security-groups/README.md) | Azure's stateful firewall: rules, priorities, default rules, and ASGs | 1.5 hr |
| 03 | [Azure DNS & Private DNS](03-azure-dns-and-private-dns/README.md) | Managed public DNS zones and private zones linked to VNets, with auto-registration | 1.5 hr |
| 04 | [Public IPs, Load Balancers & NAT Gateway](04-public-ips-load-balancers-and-nat-gateway/README.md) | Standard public IPs, L4 load balancing with health probes, outbound via NAT Gateway | 2 hr |
| 05 | [VNet peering & Private Endpoints](05-vnet-peering-and-private-endpoints/README.md) | Connect VNets and reach PaaS services privately over the backbone | 1.5 hr |
| 06 | [Application Gateway & WAF](06-application-gateway-and-waf/README.md) | L7 load balancing, path-based routing, TLS termination, and the Web Application Firewall | 2 hr |
| 07 | [Azure Firewall & hub-spoke](07-azure-firewall-and-hub-spoke/README.md) | Central egress control, route tables, and the hub-and-spoke topology | 2 hr |
| 08 | [Capstone project](08-capstone-project/README.md) | Build and verify a full hub-spoke design end to end, then tear it down | 3 hr |

## How to work through this

Go in order — each module builds strictly on the previous ones. Attempt every
quiz question in writing before revealing the answer, do the independent
challenges without peeking at the solved exercises, and take the two
cumulative reviews (in modules 03 and 07) closed-book. Keep an eye on the
Azure Portal's **Cost Management** blade as you go; it's the fastest way to
catch a resource you forgot to delete.

[← Back to curriculum](../README.md)

After this track, the next one is **Azure Container Apps**, which builds
directly on the VNet integration and ingress concepts you learn here.
