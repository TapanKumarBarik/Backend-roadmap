# Azure Firewall & Hub-Spoke

## Why this matters
This module ties everything together into the topology real Azure networks
actually use: **hub-and-spoke**, with a central Azure Firewall controlling
egress and inter-spoke traffic. It's where peering (module 05), route tables,
and firewall policy combine — and where you finally make spoke-to-spoke traffic
work despite peering's non-transitivity. Azure Firewall is the second resource
in this track that **bills hourly even when idle**, and it's not cheap, so
cost discipline is at its peak here.

## Concepts

### Azure Firewall
Azure Firewall is a managed, stateful, cloud-scale **network firewall** — the
"centralized egress firewall / perimeter" concept from track 1, delivered as a
service. Unlike an NSG (which is a distributed L3/L4 filter attached to subnets/
NICs), Azure Firewall is a **centralized appliance** with a private IP in the
hub that traffic is *routed through*. It supports **network rules** (L3/L4 by
IP/port/protocol), **application rules** (L7 by FQDN — e.g. allow egress only
to `*.ubuntu.com`), and **NAT rules** (DNAT inbound). It provides FQDN-based
egress filtering that NSGs can't, plus centralized logging. It bills a
significant fixed hourly rate **plus** per-GB processed.

### NSG vs. Azure Firewall — when to use which
They're complementary, not competing. NSGs are free, distributed, and good for
subnet/NIC-level allow/deny on IP and port — your first line of segmentation.
Azure Firewall is centralized, billed, and adds FQDN filtering, application
rules, threat intelligence, and unified logging across the whole network. A
typical design uses **both**: NSGs on every subnet for micro-segmentation, and
a single Firewall in the hub for controlled, logged egress and inter-spoke
traffic. Don't reach for Firewall where an NSG suffices — it's expensive.

### Route tables (UDRs) force traffic through the firewall
By default, Azure's system routes send subnet traffic straight out to the
internet or directly across peerings — **bypassing the firewall**. To force
traffic through the hub firewall you attach a **route table (UDR)** to each
spoke subnet with a route like `0.0.0.0/0 → next hop = the firewall's private
IP` (next hop type `VirtualAppliance`). This is the piece people forget: you
can deploy a perfect firewall and see zero traffic hit it because no route
sends traffic its way. Routing, not the firewall itself, is what puts the
firewall in the path.

### Hub-and-spoke topology
The hub-and-spoke pattern: a central **hub** VNet holds shared services (the
firewall, and often a VPN/ExpressRoute gateway and DNS), and each workload lives
in its own **spoke** VNet peered to the hub. Spokes don't peer to each other;
instead, spoke-to-spoke traffic is routed through the hub firewall (recall from
module 05 that peering isn't transitive). This centralizes egress control,
logging, and shared services while keeping workloads isolated in their own
VNets. It's the standard enterprise Azure landing-zone shape.

### Making spoke-to-spoke work
To let spoke-A reach spoke-B *through* the hub firewall you need three things
together: (1) both spokes peered to the hub with `--allow-forwarded-traffic`
enabled so the hub can forward their traffic, (2) a UDR on each spoke subnet
routing the other spoke's range (or `0.0.0.0/0`) to the firewall's private IP,
and (3) a firewall network rule permitting spoke-A ↔ spoke-B. Miss any one and
the traffic silently drops or takes the wrong path.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az network firewall create` | Creates an Azure Firewall | `az network firewall create -g hub-lab-rg -n hub-fw --vnet-name hub-vnet` |
| `az network firewall ip-config create` | Assigns the firewall a public IP + subnet | `az network firewall ip-config create -g hub-lab-rg -f hub-fw -n fw-ipconfig --public-ip-address fw-pip --vnet-name hub-vnet` |
| `az network firewall network-rule create` | Adds an L3/L4 network rule | `az network firewall network-rule create -g hub-lab-rg -f hub-fw --collection-name net-coll --name allow-spoke --protocols TCP --source-addresses 10.1.0.0/16 --destination-addresses 10.2.0.0/16 --destination-ports 443 --action Allow --priority 100` |
| `az network firewall application-rule create` | Adds an L7 FQDN rule | `az network firewall application-rule create -g hub-lab-rg -f hub-fw --collection-name app-coll --name allow-ubuntu --protocols Http=80 Https=443 --source-addresses 10.1.0.0/16 --target-fqdns *.ubuntu.com --action Allow --priority 200` |
| `az network route-table create` | Creates a route table (UDR) | `az network route-table create -g hub-lab-rg -n spokeA-rt` |
| `az network route-table route create` | Adds a route | `az network route-table route create -g hub-lab-rg --route-table-name spokeA-rt -n to-fw --address-prefix 0.0.0.0/0 --next-hop-type VirtualAppliance --next-hop-ip-address 10.0.1.4` |
| `az network vnet subnet update` | Attaches a route table to a subnet | `az network vnet subnet update -g hub-lab-rg --vnet-name spokeA-vnet -n app-subnet --route-table spokeA-rt` |

Flag breakdown — `az network firewall network-rule create ... --collection-name net-coll --name allow-spoke --protocols TCP --source-addresses 10.1.0.0/16 --destination-addresses 10.2.0.0/16 --destination-ports 443 --action Allow --priority 100`:
- `--collection-name`: rule collection to add to (created on first rule);
  `--priority` and `--action` apply at the collection level.
- `--protocols`: `TCP`/`UDP`/`ICMP`/`Any`.
- `--source-addresses` / `--destination-addresses`: CIDR(s) for each end.
- `--destination-ports`: allowed destination port(s).
- `--action`: `Allow` or `Deny` for the collection.
- `--priority`: collection priority (100–65000; lower first).

Flag breakdown — `az network route-table route create ... -n to-fw --address-prefix 0.0.0.0/0 --next-hop-type VirtualAppliance --next-hop-ip-address 10.0.1.4`:
- `--address-prefix`: which destination range this route matches (`0.0.0.0/0`
  = all traffic / default route).
- `--next-hop-type`: `VirtualAppliance` (send to an IP like a firewall),
  `Internet`, `VnetLocal`, `VirtualNetworkGateway`, or `None`.
- `--next-hop-ip-address`: the firewall's private IP (required when next hop is
  `VirtualAppliance`).

## Hands-on exercises

> Cost warning: Azure Firewall bills a substantial hourly rate plus per-GB the
> entire time it exists — this is the most expensive resource in the track. Do
> this module in one sitting and delete the group immediately after.

Build the hub and two spokes (non-overlapping ranges), with the firewall's
mandatory subnet:
```
az group create --name hub-lab-rg --location eastus
az network vnet create -g hub-lab-rg -n hub-vnet --address-prefixes 10.0.0.0/16 \
  --subnet-name AzureFirewallSubnet --subnet-prefixes 10.0.1.0/26
az network vnet create -g hub-lab-rg -n spokeA-vnet --address-prefixes 10.1.0.0/16 \
  --subnet-name app-subnet --subnet-prefixes 10.1.1.0/24
az network vnet create -g hub-lab-rg -n spokeB-vnet --address-prefixes 10.2.0.0/16 \
  --subnet-name app-subnet --subnet-prefixes 10.2.1.0/24
```

1. **Peer both spokes to the hub with forwarding allowed.**
   ```
   az network vnet peering create -g hub-lab-rg -n hub-to-A \
     --vnet-name hub-vnet --remote-vnet spokeA-vnet \
     --allow-vnet-access --allow-forwarded-traffic
   az network vnet peering create -g hub-lab-rg -n A-to-hub \
     --vnet-name spokeA-vnet --remote-vnet hub-vnet \
     --allow-vnet-access --allow-forwarded-traffic
   az network vnet peering create -g hub-lab-rg -n hub-to-B \
     --vnet-name hub-vnet --remote-vnet spokeB-vnet \
     --allow-vnet-access --allow-forwarded-traffic
   az network vnet peering create -g hub-lab-rg -n B-to-hub \
     --vnet-name spokeB-vnet --remote-vnet hub-vnet \
     --allow-vnet-access --allow-forwarded-traffic
   ```
   > Verify: all four peerings show `Connected`.

2. **Create the Azure Firewall.** (Takes several minutes.)
   ```
   az network public-ip create -g hub-lab-rg -n fw-pip \
     --sku Standard --allocation-method Static
   az network firewall create -g hub-lab-rg -n hub-fw --vnet-name hub-vnet
   az network firewall ip-config create -g hub-lab-rg -f hub-fw \
     -n fw-ipconfig --public-ip-address fw-pip --vnet-name hub-vnet
   ```
   > Verify: capture the firewall's private IP —
   > ```
   > az network firewall show -g hub-lab-rg -n hub-fw \
   >   --query "ipConfigurations[0].privateIPAddress" -o tsv
   > ```
   > (likely `10.0.1.4`). You'll route to this IP.

3. **Create route tables sending each spoke's traffic to the firewall.**
   Assume the firewall private IP is `10.0.1.4`:
   ```
   az network route-table create -g hub-lab-rg -n spokeA-rt
   az network route-table route create -g hub-lab-rg \
     --route-table-name spokeA-rt -n to-fw --address-prefix 0.0.0.0/0 \
     --next-hop-type VirtualAppliance --next-hop-ip-address 10.0.1.4
   az network vnet subnet update -g hub-lab-rg --vnet-name spokeA-vnet \
     -n app-subnet --route-table spokeA-rt
   ```
   Repeat for spokeB (`spokeB-rt`, attached to spokeB's `app-subnet`).
   > Verify: `az network vnet subnet show ... -n app-subnet --query routeTable`
   > references the route table.

4. **Add a firewall network rule allowing spokeA ↔ spokeB.**
   ```
   az network firewall network-rule create -g hub-lab-rg -f hub-fw \
     --collection-name spoke-coll --name allow-A-to-B --protocols TCP \
     --source-addresses 10.1.0.0/16 --destination-addresses 10.2.0.0/16 \
     --destination-ports 443 --action Allow --priority 100
   ```
   Now spokeA→spokeB on 443 is routed to the firewall (via the UDR) and
   permitted by this rule — spoke-to-spoke works despite non-transitive
   peering.

5. **Add an application rule for controlled egress.** Allow spokes to reach
   only Ubuntu package mirrors over HTTP/HTTPS, nothing else:
   ```
   az network firewall application-rule create -g hub-lab-rg -f hub-fw \
     --collection-name egress-coll --name allow-ubuntu \
     --protocols Http=80 Https=443 --source-addresses 10.1.0.0/16 10.2.0.0/16 \
     --target-fqdns "*.ubuntu.com" --action Allow --priority 200
   ```
   This is FQDN-based egress filtering — something an NSG cannot do.

6. **Diagnose and fix: firewall deployed but no traffic hits it.** Remove the
   route table from spokeA to simulate the classic mistake:
   ```
   az network vnet subnet update -g hub-lab-rg --vnet-name spokeA-vnet \
     -n app-subnet --remove routeTable
   ```
   Now spokeA's default route is the system route (straight to internet /
   direct peering), so **traffic never reaches the firewall** — the firewall
   rules appear to do nothing and spoke-to-spoke stops flowing through it.
   **Diagnose:** the firewall config is correct but the subnet has no UDR
   pointing at it — routing, not the rules, is the problem. **Fix:** re-attach
   the route table:
   ```
   az network vnet subnet update -g hub-lab-rg --vnet-name spokeA-vnet \
     -n app-subnet --route-table spokeA-rt
   ```
   > Verify: subnet again references `spokeA-rt`. **Lesson: a firewall only
   > filters traffic that's routed to it. Without a UDR (0.0.0.0/0 →
   > firewall private IP) on the subnet, the firewall is bypassed entirely.**

7. **Diagnose and fix: spoke-to-spoke blocked despite the route.** Suppose the
   UDR is in place but spokeA still can't reach spokeB. Two remaining culprits:
   the peering isn't allowing forwarded traffic, or the firewall has no rule
   permitting the flow. Check the peering has `--allow-forwarded-traffic`
   (exercise 1) and that a network rule allows the source/destination/port
   (exercise 4). Reason through which layer is dropping the packet: routing gets
   it to the firewall; the firewall rule decides allow/deny; the peering's
   forwarded-traffic flag decides whether the hub may relay it. All three must
   line up.

8. **Cleanup — do this now.** Azure Firewall is the priciest thing in the
   track. Delete the group immediately:
   ```
   az group delete --name hub-lab-rg --yes --no-wait
   ```
   > Verify: `az group show -n hub-lab-rg` eventually returns not-found, and
   > check Cost Management to confirm no Firewall or public IP lingers.

## Independent challenge
Combine this module with **module 04 (NAT Gateway / outbound) and module 03
(private DNS)** conceptually. Build a hub with an Azure Firewall and one spoke,
route the spoke's egress through the firewall, and configure an **application
rule** that allows the spoke to reach exactly one FQDN (say `*.microsoft.com`)
and denies all other web egress. Then reason about how this centralized,
FQDN-based egress control differs from a NAT Gateway's role (module 04): one
controls *what* you can reach by name, the other controls *which IP* your
outbound traffic appears from. Confirm you can explain when you'd use each.
Tear the resource group down the instant you're done — the firewall bills every
hour it exists.

<details><summary>Stuck? One hint</summary>

The firewall only sees traffic a UDR sends it (`0.0.0.0/0 → firewall private
IP` on the spoke subnet). Once traffic arrives, an *application* rule filters
by destination FQDN, while a *network* rule filters by IP/port — for
"only *.microsoft.com" you want an application rule with `--target-fqdns`. A NAT
Gateway, by contrast, doesn't filter destinations at all; it just SNATs your
outbound to a stable public IP. Different jobs: FQDN allow-listing vs. source
NAT.
</details>

## Common mistakes & troubleshooting
- **Firewall deployed but bypassed.** No UDR means traffic never routes to the
  firewall — the rules look inert. Attach a route table with `0.0.0.0/0 → fw
  private IP` to each subnet whose traffic must be inspected.
- **Spoke-to-spoke silently fails.** Needs all three: peering with forwarded
  traffic, a UDR to the firewall, and a firewall network rule allowing it.
- **Wrong firewall subnet name.** Must be exactly `AzureFirewallSubnet`,
  recommended `/26`.
- **Using Firewall where an NSG suffices.** NSGs are free and handle basic
  subnet allow/deny; the Firewall is for FQDN egress, centralized logging, and
  inter-spoke control. Don't pay for what an NSG does.
- **Cost pitfall (the biggest in the track):** Azure Firewall bills a large
  fixed hourly rate plus per-GB regardless of traffic, and it's easy to forget
  because it has no obvious "on" indicator. An idle Firewall left over a
  weekend can be the most expensive mistake in this curriculum. Delete the
  group the moment you finish, and confirm in Cost Management.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. You deployed an Azure Firewall with correct rules, but your spoke traffic
   goes straight to the internet and never hits the firewall. What's missing?
2. What are the three rule types Azure Firewall supports, and which one filters
   by destination FQDN?
3. Name the three things that must all be in place for spoke-A to reach spoke-B
   through the hub firewall.
4. What must the firewall's subnet be named, and what's the recommended size?
5. Give two ways Azure Firewall differs from an NSG.
6. In a route table, what `--next-hop-type` and `--next-hop-ip-address` do you
   use to send `0.0.0.0/0` through the firewall?
7. Why is "use an NSG instead of the Firewall where possible" good advice?

<details><summary>Show answers</summary>

1. A route table (UDR) on the spoke subnet with `0.0.0.0/0 → firewall private
   IP` (next hop `VirtualAppliance`). The firewall only filters traffic that's
   routed to it.
2. Network rules (L3/L4 by IP/port/protocol), application rules (L7 by FQDN),
   and NAT rules (DNAT). Application rules filter by FQDN.
3. (1) Both spoke↔hub peerings with `--allow-forwarded-traffic`, (2) a UDR on
   each spoke routing the other spoke (or `0.0.0.0/0`) to the firewall IP, and
   (3) a firewall network rule allowing the flow.
4. `AzureFirewallSubnet` (exact, case-sensitive), recommended `/26` or larger.
5. Any two: NSG is distributed/free/L3-L4 on IP-port with no FQDN filtering;
   Firewall is a centralized appliance, billed hourly + per-GB, adds L7 FQDN
   application rules, threat intel, and centralized logging.
6. `--next-hop-type VirtualAppliance` and `--next-hop-ip-address <firewall
   private IP>`.
7. NSGs are free and handle basic subnet/NIC allow-deny; the Firewall bills a
   large hourly rate, so reserving it for what only it can do (FQDN egress,
   centralized logging, inter-spoke control) avoids unnecessary cost.
</details>

## Cumulative review
Closed-book. Answer all of these in writing before opening the solutions —
they mix modules 04 through 07 on purpose.

1. A public-facing web app needs URL path-based routing, TLS termination, and a
   WAF; a separate internal service just needs raw TCP flow distribution across
   three backends. Which Azure resource for each, and why?
2. Your Standard Load Balancer's backends all show unhealthy and your App
   Gateway returns 502. Name the single root-cause *category* both failures
   most commonly share, and the diagnostic command for each.
3. You built a hub-spoke with a firewall, correct peerings (forwarded traffic
   on), and correct firewall rules, but spoke traffic still goes straight to
   the internet, ignoring the firewall. What's missing and how do you fix it?
4. Explain why spoke-A can't reach spoke-B "through the hub" just because both
   are peered to the hub, and list the three things needed to make it work.
5. A VM in a spoke has no outbound internet at all (not even to allowed FQDNs).
   Give two independent possible causes — one from module 04, one from module
   07 — and how you'd distinguish them.
6. Contrast an NSG and Azure Firewall on: layer/granularity, centralized vs.
   distributed, FQDN filtering, and cost.
7. You need outbound traffic from a subnet to always appear from one stable
   public IP, and separately you need to allow-list which FQDNs that subnet can
   reach. Which resource does each job?
8. Which two resources in modules 04–07 bill hourly even when completely idle,
   and what's your standing habit to avoid surprise charges?

<details><summary>Show answers</summary>

1. Public web app → Application Gateway (WAF_v2) — L7, so it can do path
   routing, TLS termination, and WAF. Internal TCP service → Azure Load
   Balancer (L4, internal/ILB) — cheaper, sufficient for raw flow
   distribution.
2. Category: **health-probe / backend-health misconfiguration** (probe port/
   path/host doesn't match what the backend serves, or an NSG blocks the
   probe). LB: `az network watcher test-ip-flow` and probe/port check; App
   Gateway: `az network application-gateway show-backend-health`.
3. A route table (UDR) on the spoke subnet with `0.0.0.0/0 → firewall private
   IP` (next hop `VirtualAppliance`). Without it, system routes bypass the
   firewall. Attach the UDR with `az network vnet subnet update ...
   --route-table`.
4. Peering isn't transitive — it only connects directly-peered VNets. Needed:
   (1) both spoke↔hub peerings with `--allow-forwarded-traffic`, (2) a UDR on
   each spoke routing the other spoke (or `0.0.0.0/0`) to the firewall IP, and
   (3) a firewall network rule allowing spoke-A ↔ spoke-B.
5. (a) Module 04: no NAT Gateway / outbound path on a Standard-LB subnet, so no
   SNAT for egress. (b) Module 07: egress is routed to the firewall but no
   application/network rule allows it (default deny). Distinguish by checking
   whether a UDR points to the firewall (if yes, it's a firewall rule problem;
   if no NAT/route at all, it's outbound-path/SNAT).
6. NSG: L3/L4 on IP/port, distributed on subnets/NICs, no FQDN filtering, free.
   Azure Firewall: L3/L4 + L7 FQDN application rules, centralized appliance in
   the hub, FQDN filtering yes, bills hourly + per-GB.
7. Stable outbound source IP → NAT Gateway (module 04). FQDN allow-listing →
   Azure Firewall application rules (module 07).
8. Application Gateway (v2) and Azure Firewall. Standing habit: delete the
   resource group with `az group delete` the moment the exercise ends, and
   verify in Cost Management that nothing lingers.
</details>

## Next
[08 — Capstone project](../08-capstone-project/README.md): assemble a full
hub-and-spoke design end to end, verify traffic flows and is blocked where it
should be, then tear it all down.
