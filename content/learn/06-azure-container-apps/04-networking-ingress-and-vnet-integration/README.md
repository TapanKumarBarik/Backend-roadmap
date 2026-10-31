# Networking, Ingress & VNet Integration

## Why this matters

This is where the Azure networking track pays off directly. A Container Apps
Environment lives on a virtual network, and every decision about how traffic
reaches your apps — public or private, which subnet, which DNS resolves the
name — uses the exact VNet, subnet, NSG, private DNS, and load-balancer
concepts from track 2. Get this right and your apps integrate cleanly into a
hub-spoke network; get it wrong and you're stuck with an Environment you can't
re-network without recreating.

## Concepts

### App ingress vs. Environment networking

There are two independent layers, and confusing them is the #1 source of "why
can't I reach it." **App ingress** (per app) is `external`, `internal`, or
`none` — from module 02, it decides whether an app is exposed at all and on
what FQDN. **Environment networking** decides where that exposure *lives*: an
Environment has a load balancer that is either internet-facing (public IP) or
internal (private IP inside your VNet). So an app with `external` ingress on an
**internal Environment** is reachable by anything in the VNet but not the
public internet — "external" is relative to the Environment, not the world.
Both layers must line up for public reachability.

### Custom VNet integration and the delegated subnet

By default Azure gives the Environment a network it manages. For real
deployments you supply your **own VNet and a dedicated subnet** at Environment
creation (`--infrastructure-subnet-resource-id`). This is the same VNet/subnet
you learned to create in track 2, with one ACA-specific requirement: the subnet
must be **dedicated to the Environment** and appropriately sized. Consumption-
only environments require a subnet with **at least a /23** CIDR; workload-
profiles environments require at least a **/27** (sizes per current docs —
verify, as minimums have changed across versions). The subnet is essentially
delegated to Container Apps; you can't share it with other resources. Because
you know subnetting from track 1/2, the only new idea is "ACA needs its own
correctly-sized subnet."

### Internal environments and private DNS

An **internal** Environment (`--internal-only true`, requires custom VNet) has
no public IP — its apps resolve to a **private IP** in your subnet. But the
default FQDN (`<app>.<env-suffix>.<region>.azurecontainerapps.io`) is a public
DNS name; for internal environments you must make that name resolve to the
private IP from inside the VNet. Azure creates a **private DNS zone** named
after the Environment's default domain and links it to your VNet (or you create
and link it yourself), exactly the private-DNS-zone-linked-to-VNet pattern from
track 2's DNS module. Machines outside the VNet can't resolve it; machines
inside (or across peered VNets with the zone linked) can. This is precisely the
private-endpoint-style access pattern you already learned.

### NSGs, egress, and UDRs

Because the Environment sits in your subnet, your track-2 tools apply. **NSGs**
on the subnet control allowed inbound/outbound flows (ACA has specific required
rules — don't blanket-deny outbound to Azure control-plane dependencies).
**Egress** can be forced through a firewall or NAT Gateway using **user-defined
routes (UDRs)** on the subnet, letting you centralize outbound control in a
hub-spoke design — the same egress-control pattern from track 2's Azure
Firewall/hub-spoke module. In workload-profiles environments you can attach a
**UDR/`--infrastructure-subnet`** and route 0.0.0.0/0 to an appliance. The
takeaway: an ACA Environment is "just another workload subnet" from the
network's point of view, so all your NSG/route/firewall knowledge transfers.

### Ports, transport, and TLS

App ingress terminates TLS at Envoy and forwards to your `--target-port` over
HTTP by default; you can set `--transport` to `http`, `http2`, `tcp`, or
`auto`. External ingress gives you managed HTTPS on the default FQDN for free
(Envoy handles certs), and you can bring a **custom domain + certificate** and
bind it. You can also restrict ingress with **IP allow/deny rules** at the app
level (an application-layer analogue of an NSG, evaluated by Envoy). This is
the L7 side; the Environment's load balancer is the L4/public-vs-private side.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az network vnet create` | Create a VNet + subnet for the Environment | `az network vnet create --name vnet-aca --resource-group rg-aca-m04 --address-prefix 10.0.0.0/16 --subnet-name aca-infra --subnet-prefix 10.0.0.0/23` |
| `az containerapp env create` (VNet) | Create an Environment on your subnet | see below |
| `az containerapp env create` (internal) | Create a private, internal-only Environment | see below |
| `az containerapp ingress enable` | Turn on/set ingress for an app | `az containerapp ingress enable --name web --resource-group rg-aca-m04 --type external --target-port 80 --transport auto` |
| `az containerapp ingress show` | Show ingress config + FQDN | `az containerapp ingress show --name web --resource-group rg-aca-m04 -o jsonc` |
| `az containerapp ingress access-restriction set` | Add an IP allow/deny rule | `az containerapp ingress access-restriction set --name web --resource-group rg-aca-m04 --rule-name office --ip-address 203.0.113.10/32 --action Allow` |
| `az containerapp env show` (static IP) | Read the Environment's static/load-balancer IP | `az containerapp env show --name env-m04 --resource-group rg-aca-m04 --query properties.staticIp -o tsv` |

Flag-by-flag breakdowns:

`az network vnet create --name vnet-aca --resource-group rg-aca-m04 --address-prefix 10.0.0.0/16 --subnet-name aca-infra --subnet-prefix 10.0.0.0/23`
- `--address-prefix 10.0.0.0/16` — the VNet's address space (track 2 concept).
- `--subnet-name aca-infra` / `--subnet-prefix 10.0.0.0/23` — a dedicated subnet for the Environment, **/23 minimum** for a Consumption environment. This subnet will be delegated to ACA.

`az containerapp env create --name env-m04 --resource-group rg-aca-m04 --location eastus --infrastructure-subnet-resource-id <subnetId>`
- `--infrastructure-subnet-resource-id` — the full resource ID of your dedicated subnet; this is what makes the Environment use *your* VNet instead of an Azure-managed one. Get it from `az network vnet subnet show ... --query id -o tsv`.

`az containerapp env create --name env-m04i --resource-group rg-aca-m04 --location eastus --infrastructure-subnet-resource-id <subnetId> --internal-only true`
- `--internal-only true` — the Environment's load balancer gets a **private** IP only (no public IP). Requires custom VNet integration. Apps with "external" ingress are then reachable only from within the VNet (and peered/zone-linked networks).

`az containerapp ingress enable --name web --resource-group rg-aca-m04 --type external --target-port 80 --transport auto`
- `--type external` — expose via the Environment endpoint (public if the Environment is public, private if internal).
- `--target-port 80` — container's listening port.
- `--transport auto` — negotiate http/http2 automatically (use `tcp` for non-HTTP).

`az containerapp ingress access-restriction set --name web --resource-group rg-aca-m04 --rule-name office --ip-address 203.0.113.10/32 --action Allow`
- `--rule-name office` — a name for the rule.
- `--ip-address 203.0.113.10/32` — CIDR the rule matches.
- `--action Allow` — allow (or `Deny`); an L7 IP filter enforced by Envoy, analogous to an NSG rule but at the app layer.

## Hands-on exercises

1. **Create group and a VNet with a dedicated /23 subnet.**
   ```powershell
   az group create --name rg-aca-m04 --location eastus
   az network vnet create --name vnet-aca --resource-group rg-aca-m04 `
     --address-prefix 10.0.0.0/16 --subnet-name aca-infra --subnet-prefix 10.0.0.0/23
   $subnet = az network vnet subnet show --resource-group rg-aca-m04 --vnet-name vnet-aca --name aca-infra --query id -o tsv
   ```

2. **Create an Environment on your subnet (external/public).**
   ```powershell
   az containerapp env create --name env-m04 --resource-group rg-aca-m04 --location eastus `
     --infrastructure-subnet-resource-id $subnet
   az containerapp env show --name env-m04 --resource-group rg-aca-m04 --query properties.staticIp -o tsv
   ```
   Verify a **public** static IP prints, and that
   `properties.vnetConfiguration.infrastructureSubnetId` matches your subnet.

3. **Deploy a public app and confirm external reachability.**
   ```powershell
   az containerapp create --name web --resource-group rg-aca-m04 --environment env-m04 `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external
   $fqdn = az containerapp show --name web --resource-group rg-aca-m04 --query properties.configuration.ingress.fqdn -o tsv
   curl "https://$fqdn"
   ```
   200 from your laptop = public reachability works end to end.

4. **Add an app-level IP allow rule (L7 filter).**
   ```powershell
   $myip = (curl -s https://api.ipify.org)
   az containerapp ingress access-restriction set --name web --resource-group rg-aca-m04 `
     --rule-name my-machine --ip-address "$myip/32" --action Allow
   curl "https://$fqdn"
   ```
   Verify you still get 200 (your IP is allowed). Then add an allow rule for a
   different IP only and confirm your now-implicitly-denied machine gets a 403.
   Remove the restriction afterward with
   `az containerapp ingress access-restriction remove --name web --resource-group rg-aca-m04 --rule-name my-machine`.

5. **Create an internal-only Environment.** (Second Environment in the same
   VNet needs its own subnet — add one.)
   ```powershell
   az network vnet subnet create --resource-group rg-aca-m04 --vnet-name vnet-aca --name aca-infra2 --address-prefix 10.0.2.0/23
   $subnet2 = az network vnet subnet show --resource-group rg-aca-m04 --vnet-name vnet-aca --name aca-infra2 --query id -o tsv
   az containerapp env create --name env-m04i --resource-group rg-aca-m04 --location eastus `
     --infrastructure-subnet-resource-id $subnet2 --internal-only true
   az containerapp env show --name env-m04i --resource-group rg-aca-m04 --query properties.staticIp -o tsv
   ```
   Verify the static IP is a **private** (10.0.x.x) address — no public IP.

6. **Deploy an app in the internal Environment and observe private DNS.**
   ```powershell
   az containerapp create --name internalweb --resource-group rg-aca-m04 --environment env-m04i `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external
   $ifqdn = az containerapp show --name internalweb --resource-group rg-aca-m04 --query properties.configuration.ingress.fqdn -o tsv
   nslookup $ifqdn
   ```
   From your laptop the name either won't resolve to something you can reach or
   resolves to the private IP you can't route to — that's the point. Confirm a
   private DNS zone exists for the internal env:
   `az network private-dns zone list --resource-group rg-aca-m04 -o table`.

7. **Prove internal reachability from inside the VNet.** Spin up a tiny test VM
   (or use Cloud Shell attached to the VNet / a jumpbox) in `vnet-aca`, then
   from it `curl https://<ifqdn>`. Verify it returns 200 from inside but not
   from outside. (If you skip the VM to save cost, at minimum reason through
   *why* it would work: the VM's DNS resolves the zone, and the private IP is
   routable within the VNet.)

8. **Diagnose and fix: subnet too small.** Try to create an Environment on an
   undersized subnet:
   ```powershell
   az network vnet subnet create --resource-group rg-aca-m04 --vnet-name vnet-aca --name toosmall --address-prefix 10.0.4.0/27
   $small = az network vnet subnet show --resource-group rg-aca-m04 --vnet-name vnet-aca --name toosmall --query id -o tsv
   az containerapp env create --name env-small --resource-group rg-aca-m04 --location eastus --infrastructure-subnet-resource-id $small
   ```
   Observe the failure (subnet too small for a Consumption environment, which
   needs /23). **Fix** by using a /23-or-larger subnet. Lesson: size the ACA
   subnet correctly up front — it can't be resized under a live Environment.

9. **Diagnose and fix: "external" app unreachable because the Environment is
   internal.** In `env-m04i`, `internalweb` has `--ingress external` yet your
   laptop can't reach it. Explain (in notes) that the app-level `external` is
   relative to an Environment whose load balancer is private. The "fix"
   depends on intent: if it *should* be public, it belongs in a **public**
   Environment (you can't flip `--internal-only` on an existing Environment —
   you'd recreate it). Confirm your understanding by comparing the two
   Environments' `staticIp` values (public vs private).

10. **Cleanup.**
    ```powershell
    az group delete --name rg-aca-m04 --yes --no-wait
    ```
    (If you created a test VM, this removes it too — VMs bill per hour, so
    don't leave it running.)

## Independent challenge

Stand up a **private** Container Apps Environment integrated into a VNet you
build yourself (correctly-sized dedicated subnet), deploy one app with external
ingress into it, and demonstrate the private-access pattern: the app's FQDN
must resolve and return 200 from a resource *inside* the VNet but be
unreachable from your laptop. Combine this module with **module 01** (reuse a
Log Analytics workspace you created for the Environment). Tie it explicitly to
track 2 by identifying which private DNS zone makes the internal resolution
work and which VNet it's linked to. Tear down the resource group when finished
(and stop any test VM immediately — it's the pricey part).

<details><summary>Stuck? One hint</summary>

The private resolution hinges on a **private DNS zone** named after the
Environment's default domain (`<something>.<region>.azurecontainerapps.io`)
being **linked to your VNet**. List zones with
`az network private-dns zone list` and check the VNet link with
`az network private-dns link vnet list`; a machine only resolves the name if
it's using DNS that sees that linked zone.

</details>

## Common mistakes & troubleshooting

- **Confusing app "external" with Environment public.** `--ingress external` on
  an `--internal-only` Environment is still private. Public reachability needs
  both the app external *and* the Environment public.
- **Undersized or shared subnet.** The ACA subnet must be dedicated and meet
  the minimum size (/23 Consumption, /27 workload-profiles — verify current
  minimums). Too small or shared → creation fails.
- **Expecting to re-network later.** VNet integration and `--internal-only` are
  set at creation and effectively immutable. Design the network first.
- **Blanket-denying subnet egress.** ACA needs outbound access to its
  control-plane dependencies. An NSG or UDR that blocks required egress makes
  apps fail to start or scale in confusing ways. Follow the documented required
  rules; route egress through a firewall deliberately, not by accident.
- **Private DNS not linked.** An internal Environment's FQDN won't resolve from
  a VNet that isn't linked to the Environment's private DNS zone — the classic
  track-2 private-DNS mistake.
- **Cost pitfall: leftover test VM / NAT Gateway / firewall.** The Environment
  itself may idle cheap, but a jumpbox VM, NAT Gateway, or Azure Firewall you
  attached for egress bills per hour. Delete them with the group.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. What's the difference between an app's `external` ingress and an
   Environment being public?
2. What are the subnet requirements for a custom-VNet Consumption Environment
   (dedicated? minimum size?)?
3. For an internal Environment, what makes the app's default FQDN resolve to
   its private IP from inside the VNet — and what track-2 concept is that?
4. Can you change an Environment from public to internal after creation? What's
   the practical implication?
5. Your app has `--ingress external` but you can't reach it from your laptop,
   and its `staticIp` is a 10.x address. What's going on?
6. How would you force all outbound traffic from an ACA Environment through a
   central firewall, using track-2 tools?
7. What layer does `ingress access-restriction` operate at, and what NSG-like
   thing is it analogous to?

<details><summary>Show answers</summary>

1. App `external` means the app is exposed on the Environment's endpoint;
   whether that endpoint is reachable from the internet depends on whether the
   **Environment's load balancer** is public or internal. External app +
   internal Environment = private.
2. A **dedicated** subnet (delegated to ACA, not shared), **/23 minimum** for
   Consumption (/27 for workload-profiles) — verify current minimums.
3. A **private DNS zone** named after the Environment's default domain, linked
   to the VNet, maps the FQDN to the private IP — the same private-DNS-zone-
   linked-to-VNet pattern from track 2's DNS module.
4. No — `--internal-only` (and VNet integration) is fixed at creation. To
   change it you recreate the Environment (and redeploy the apps).
5. The Environment is internal-only (private load balancer, 10.x static IP), so
   even an "external" app is only reachable from within the VNet. From your
   laptop it's unreachable.
6. Put a **UDR** on the ACA subnet routing 0.0.0.0/0 to an Azure Firewall/NVA
   in a hub VNet (hub-spoke), and allow required egress — track 2's egress-
   control pattern.
7. Layer 7 (application), enforced by Envoy on the app's ingress; analogous to
   an NSG rule but at the app/HTTP layer rather than the subnet/NIC layer.

</details>

## Next

[05-revisions-traffic-splitting-and-dapr](../05-revisions-traffic-splitting-and-dapr/README.md)
— run multiple revisions at once, split traffic for blue/green and canary
releases, and wire Dapr service invocation between apps.
