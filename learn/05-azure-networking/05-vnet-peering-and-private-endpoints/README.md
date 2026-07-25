# VNet Peering & Private Endpoints

## Why this matters
Real Azure networks are never one VNet. Peering is how you connect them over
Azure's private backbone (no public internet, no VPN), and it's the foundation
of the hub-and-spoke topology you'll build in module 07 and the capstone.
Private Endpoints are how you pull PaaS services (Storage, SQL, Key Vault) off
the public internet and onto a private IP inside your VNet — and they depend
directly on the private DNS you learned in module 03. Get peering's
non-transitivity and private-endpoint DNS wrong and connections fail in ways
that look like everything but the real cause.

## Concepts

### VNet peering
Peering connects two VNets so resources in each can reach the other by private
IP, as if on one network, using Azure's backbone (low latency, no gateway
required for same-region peering). It's the "routed connection between two
networks" from track 1. Peering is created as **two links** — one from each
VNet's side — and both must exist for traffic to flow. The hard prerequisite:
the two VNets' address spaces **must not overlap** (this is why module 01
insisted on non-overlapping `/16`s).

### Peering is NOT transitive
This is the concept that catches everyone. If spoke-A peers with a hub, and
spoke-B peers with the same hub, **spoke-A cannot reach spoke-B through the
hub by default.** Peering only connects the two directly-peered VNets. To let
spokes talk to each other you must either peer them directly, or route their
traffic through a device in the hub (Azure Firewall or an NVA) using route
tables and the `allowForwardedTraffic` / gateway-transit settings. Hub-and-spoke
in module 07 relies on exactly this: spokes reach each other *via* the hub
firewall, not via peering transitivity.

### Peering settings that matter
Each side of a peering has toggles: `--allow-vnet-access` (permit traffic at
all), `--allow-forwarded-traffic` (accept traffic that originated elsewhere and
was forwarded — needed for hub routing), and gateway transit
(`--allow-gateway-transit` / `--use-remote-gateways`, for sharing a VPN/
ExpressRoute gateway in the hub). For simple spoke-to-hub connectivity you need
vnet-access on both sides; for spoke-to-spoke-via-hub you also need forwarded
traffic allowed.

### Private Endpoints
A **Private Endpoint** gives a PaaS service (Storage account, SQL DB, Key
Vault, etc.) a **private IP inside your subnet**, so your resources reach it
over the VNet/backbone instead of its public endpoint. It creates a NIC in your
subnet mapped to that specific service instance. This removes the service from
public exposure — you can then disable its public endpoint entirely. It's the
private-connectivity counterpart to service endpoints (which keep the service's
public IP but route to it privately); private endpoints are the stronger,
now-preferred pattern.

### Private Endpoints depend on private DNS
The catch: your app still connects using the service's **public hostname**
(e.g. `myacct.blob.core.windows.net`). For that name to resolve to the private
IP instead of the public one, you need a private DNS zone named exactly for the
service's **privatelink** domain (e.g. `privatelink.blob.core.windows.net`),
linked to your VNet, with an A record for the endpoint. Azure can auto-create
this via a **private DNS zone group** on the endpoint. Skip the DNS piece and
the name keeps resolving to the public IP — the private endpoint exists but
nothing uses it. This is module 03's "zone must be linked" lesson with higher
stakes.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az network vnet peering create` | Creates one side of a peering | `az network vnet peering create -g pl-lab-rg -n hub-to-spokeA --vnet-name hub-vnet --remote-vnet spokeA-vnet --allow-vnet-access` |
| `az network vnet peering list` | Lists peerings on a VNet | `az network vnet peering list -g pl-lab-rg --vnet-name hub-vnet -o table` |
| `az network vnet peering show` | Shows a peering (incl. state) | `az network vnet peering show -g pl-lab-rg -n hub-to-spokeA --vnet-name hub-vnet` |
| `az network private-endpoint create` | Creates a private endpoint to a PaaS resource | `az network private-endpoint create -g pl-lab-rg -n stg-pe --vnet-name spokeA-vnet --subnet app-subnet --private-connection-resource-id <storage-id> --group-id blob --connection-name stg-conn` |
| `az network private-endpoint dns-zone-group create` | Wires the endpoint to a private DNS zone | `az network private-endpoint dns-zone-group create -g pl-lab-rg --endpoint-name stg-pe -n default --private-dns-zone privatelink.blob.core.windows.net --zone-name blob` |
| `az network private-dns zone create` | Creates the privatelink zone | `az network private-dns zone create -g pl-lab-rg -n privatelink.blob.core.windows.net` |

Flag breakdown — `az network vnet peering create -g pl-lab-rg -n hub-to-spokeA --vnet-name hub-vnet --remote-vnet spokeA-vnet --allow-vnet-access`:
- `-n` (`--name`): a name for this side of the peering.
- `--vnet-name`: the local VNet this link is created on.
- `--remote-vnet`: the other VNet (name in same group, or full resource ID
  across groups/subscriptions).
- `--allow-vnet-access`: permit traffic between the two VNets. (Add
  `--allow-forwarded-traffic` when the hub must forward spoke-to-spoke
  traffic.)

Flag breakdown — `az network private-endpoint create ... --private-connection-resource-id <storage-id> --group-id blob --connection-name stg-conn`:
- `--vnet-name` / `--subnet`: where the endpoint's NIC/private IP lands.
- `--private-connection-resource-id`: the full resource ID of the PaaS
  resource you're connecting to.
- `--group-id` (sub-resource): which part of the service (e.g. `blob`, `file`,
  `sqlServer`) — determines the privatelink zone name you need.
- `--connection-name`: a name for the connection.

## Hands-on exercises

Set up a group and three VNets with non-overlapping address spaces:
```
az group create --name pl-lab-rg --location eastus
az network vnet create -g pl-lab-rg -n hub-vnet --address-prefixes 10.0.0.0/16 \
  --subnet-name hub-subnet --subnet-prefixes 10.0.1.0/24
az network vnet create -g pl-lab-rg -n spokeA-vnet --address-prefixes 10.1.0.0/16 \
  --subnet-name app-subnet --subnet-prefixes 10.1.1.0/24
az network vnet create -g pl-lab-rg -n spokeB-vnet --address-prefixes 10.2.0.0/16 \
  --subnet-name app-subnet --subnet-prefixes 10.2.1.0/24
```

1. **Peer hub ↔ spokeA (both sides).**
   ```
   az network vnet peering create -g pl-lab-rg -n hub-to-spokeA \
     --vnet-name hub-vnet --remote-vnet spokeA-vnet --allow-vnet-access
   az network vnet peering create -g pl-lab-rg -n spokeA-to-hub \
     --vnet-name spokeA-vnet --remote-vnet hub-vnet --allow-vnet-access
   ```
   > Verify: `az network vnet peering show -g pl-lab-rg -n hub-to-spokeA
   > --vnet-name hub-vnet --query peeringState` returns `Connected`. Only one
   > side created = `Initiated`, not `Connected`.

2. **Peer hub ↔ spokeB (both sides).** Repeat the pattern for spokeB.
   ```
   az network vnet peering create -g pl-lab-rg -n hub-to-spokeB \
     --vnet-name hub-vnet --remote-vnet spokeB-vnet --allow-vnet-access
   az network vnet peering create -g pl-lab-rg -n spokeB-to-hub \
     --vnet-name spokeB-vnet --remote-vnet hub-vnet --allow-vnet-access
   ```

3. **Diagnose: peering stuck at `Initiated`.** If you created only one side of
   a peering (or the second side names the wrong remote VNet), the state stays
   `Initiated` and traffic doesn't flow. **Fix:** create the matching link on
   the other VNet with the correct `--remote-vnet`. Both links must exist and
   reference each other for `Connected`.
   > Verify: both `hub-to-spokeA` and `spokeA-to-hub` show `Connected`.

4. **Prove non-transitivity (reason it through).** spokeA is peered to hub, and
   spokeB is peered to hub, but spokeA and spokeB are **not** peered to each
   other. A VM in spokeA therefore **cannot** reach a VM in spokeB — peering is
   not transitive. Confirm there is no direct spokeA↔spokeB peering:
   ```
   az network vnet peering list -g pl-lab-rg --vnet-name spokeA-vnet -o table
   ```
   You'll see only `spokeA-to-hub`. (In module 07 you'll route spoke-to-spoke
   through the hub firewall instead of peering them directly.)

5. **Diagnose and fix: overlapping address space blocks peering.** Try to
   create a fourth VNet that overlaps the hub and peer it:
   ```
   az network vnet create -g pl-lab-rg -n bad-vnet \
     --address-prefixes 10.0.0.0/16 --subnet-name s1 \
     --subnet-prefixes 10.0.5.0/24
   az network vnet peering create -g pl-lab-rg -n hub-to-bad \
     --vnet-name hub-vnet --remote-vnet bad-vnet --allow-vnet-access
   ```
   The peering fails because `bad-vnet` (`10.0.0.0/16`) overlaps `hub-vnet`.
   **Fix:** overlapping VNets can't be peered — the only remedy is to
   re-address one of them. Delete `bad-vnet`.

6. **Create a Storage account and a private endpoint to it.** (Storage bills
   minimally; delete with the group.)
   ```
   STG=stg$RANDOM$RANDOM
   az storage account create -g pl-lab-rg -n $STG --sku Standard_LRS
   STGID=$(az storage account show -g pl-lab-rg -n $STG --query id -o tsv)
   az network private-endpoint create -g pl-lab-rg -n stg-pe \
     --vnet-name spokeA-vnet --subnet app-subnet \
     --private-connection-resource-id "$STGID" --group-id blob \
     --connection-name stg-conn
   ```
   > Verify: `az network private-endpoint show -g pl-lab-rg -n stg-pe --query
   > 'customDnsConfigs'` shows a private IP from `app-subnet` (10.1.1.x).

7. **Diagnose and fix: private endpoint exists but the name still resolves
   public.** Right now there's no private DNS, so `<acct>.blob.core.windows.net`
   still resolves to the **public** IP — the private endpoint is unused.
   **Fix:** create the privatelink zone, link it to the VNet, and attach a DNS
   zone group so Azure creates the A record:
   ```
   az network private-dns zone create -g pl-lab-rg \
     -n privatelink.blob.core.windows.net
   az network private-dns link vnet create -g pl-lab-rg \
     -z privatelink.blob.core.windows.net -n link-spokeA \
     --virtual-network spokeA-vnet --registration-enabled false
   az network private-endpoint dns-zone-group create -g pl-lab-rg \
     --endpoint-name stg-pe -n default \
     --private-dns-zone privatelink.blob.core.windows.net --zone-name blob
   ```
   > Verify: the private zone now has an A record for the storage account
   > pointing at the endpoint's private IP. From a VM in spokeA,
   > `nslookup <acct>.blob.core.windows.net` would return the `10.1.1.x`
   > private IP instead of a public one. **Lesson: a private endpoint without
   > its privatelink DNS zone (linked to the VNet) is invisible — the name
   > keeps resolving to the public endpoint.**

8. **Cleanup.** Peerings are free, but the storage account and private
   endpoint carry small charges. Delete the group:
   ```
   az group delete --name pl-lab-rg --yes --no-wait
   ```

## Independent challenge
Combine this module with **module 03 (private DNS)**. Build two VNets with
non-overlapping address spaces, peer them both directions, create a private
endpoint to a new Key Vault (or Storage account) in one VNet, and wire up the
correct `privatelink.*` private DNS zone linked so that a resource in the
*peered* VNet — not just the endpoint's own VNet — resolves the service to its
private IP. Confirm you understand which VNets must be linked to the
privatelink zone for cross-VNet private resolution to work. Delete the resource
group afterward — the endpoint and PaaS resource bill while they exist.

<details><summary>Stuck? One hint</summary>

For a peered VNet to resolve the private endpoint privately, the
`privatelink.*` zone must be linked to **that** VNet too (or the two VNets must
share a resolver that sees the zone). Peering routes the *traffic*; the private
DNS link is what makes the *name* resolve to the private IP. Both are required
— test resolution from the peered VNet specifically, not just from the VNet
holding the endpoint.
</details>

## Common mistakes & troubleshooting
- **Only creating one side of a peering.** State stays `Initiated`; you need
  both links, each pointing at the other, for `Connected`.
- **Overlapping address spaces.** Peering simply won't establish; re-address
  one VNet — there's no override.
- **Expecting transitivity.** spoke-A → hub → spoke-B does not work by default.
  Peer directly or route through a hub device (module 07).
- **Private endpoint without private DNS.** The endpoint exists but the service
  name still resolves to the public IP, so nothing uses the private path. You
  need the `privatelink.*` zone, linked to the VNet, with the A record.
- **Forgetting `allow-forwarded-traffic` for hub routing.** Spoke-to-spoke via
  a hub NVA/firewall needs forwarded traffic allowed on the peerings plus route
  tables (module 07).
- **Cost note:** peerings themselves are free (you pay a small per-GB data
  transfer for traffic across them), but private endpoints bill a small hourly
  rate plus per-GB, and the PaaS resources bill on their own. Delete the group
  when done.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. spoke-A and spoke-B are each peered to a hub. Can a VM in spoke-A reach a VM
   in spoke-B by default? Explain, and give two ways to make it work.
2. A peering shows `Initiated`, not `Connected`. What's the cause and fix?
3. Why can't you peer two VNets that both use `10.0.0.0/16`?
4. What does a Private Endpoint give a PaaS service, and how does that differ
   from a service endpoint?
5. You created a private endpoint to a storage account but connections still
   go to the public IP. What's missing, precisely?
6. What exactly must the private DNS zone for a blob private endpoint be named,
   and what has to be linked to it?
7. Which peering setting must be enabled for a hub to forward spoke-to-spoke
   traffic through a firewall?

<details><summary>Show answers</summary>

1. No — peering is not transitive. Make it work by (a) peering spoke-A and
   spoke-B directly, or (b) routing spoke-to-spoke through a hub device
   (Firewall/NVA) using route tables plus `allow-forwarded-traffic`.
2. Only one side of the peering exists (or the second side references the wrong
   remote VNet). Create the matching link on the other VNet pointing back; both
   are needed for `Connected`.
3. Overlapping address spaces can't be routed between — Azure can't decide
   which VNet owns `10.0.0.0/16`. Re-address one.
4. A Private Endpoint gives the service a private IP (a NIC) inside your subnet,
   removing it from public exposure. A service endpoint keeps the service's
   public IP but routes to it over the backbone from a specific subnet —
   weaker isolation; private endpoints are preferred.
5. The privatelink private DNS zone, linked to the VNet, with the A record for
   the endpoint (a private DNS zone group). Without it the public hostname
   still resolves to the public IP.
6. `privatelink.blob.core.windows.net`, and the VNet(s) that need to resolve it
   must be linked to that zone (plus the endpoint's A record present).
7. `--allow-forwarded-traffic` on the relevant peering(s), alongside route
   tables directing spoke traffic to the hub device.
</details>

## Next
[06 — Application Gateway & WAF](../06-application-gateway-and-waf/README.md):
move up to L7 load balancing with path-based routing, TLS termination, and a
Web Application Firewall.
