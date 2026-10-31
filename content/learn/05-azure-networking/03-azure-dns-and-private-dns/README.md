# Azure DNS & Private DNS

## Why this matters
Almost everything reaches a service by name, not IP — so DNS is where a lot of
"the network is fine but it still won't connect" problems actually live. Azure
splits this into public DNS zones (authoritative hosting for a domain you own)
and private DNS zones (internal name resolution inside your VNets). The single
most common private-DNS failure — a zone that exists but resolves nothing —
comes from forgetting one link, and you'll deliberately reproduce and fix it
here.

## Concepts

### Azure DNS public zones
A public DNS zone is Azure's implementation of the managed authoritative DNS
hosting from track 1: you host a domain you own (e.g. `example.com`), Azure
gives you four name servers, and you create records (`A`, `AAAA`, `CNAME`,
`MX`, `TXT`, etc.) in the zone. To make it live, you update your domain
registrar's NS records to point at Azure's name servers. This is exactly the
delegation model from track 1's DNS material, just with Azure as the hosting
provider.

### Private DNS zones
A private DNS zone provides name resolution **inside** your VNets — the
split-horizon / internal DNS concept from track 1. It looks like a normal zone
(any name you choose, e.g. `corp.internal` or a service-specific name like
`privatelink.blob.core.windows.net`) but it is only visible to VNets you
explicitly link to it. It is the mechanism that lets `db.corp.internal` resolve
to a private `10.x` address for your VMs while being invisible to the public
internet.

### Virtual network links (the step everyone forgets)
A private zone does nothing on its own. You must create a **virtual network
link** joining the zone to each VNet that should use it. Resolution only works
from VNets that are linked. **This is the number-one private DNS failure:** the
zone exists, the records exist, but a VM can't resolve them because its VNet was
never linked. Symptom: `nslookup name.corp.internal` returns NXDOMAIN or public
resolver results instead of your private record.

### Auto-registration
When you create a VNet link with **auto-registration enabled**, Azure
automatically creates and maintains an `A` record in the private zone for every
VM in that VNet, named after the VM's hostname. This is Azure's dynamic-DNS
equivalent: spin up `web01` and `web01.corp.internal` resolves to its private
IP with no manual record. Only one linked VNet per zone can have
auto-registration on. For records you manage by hand (or for PaaS private
endpoints in module 05), leave auto-registration off and create records
explicitly.

### How VMs resolve names
By default, VMs use Azure-provided DNS (the platform resolver at `168.63.129.16`)
which consults any private zones linked to the VM's VNet first, then falls back
to public resolution. You can override a VNet's DNS servers to point at custom
resolvers, but for this track the default Azure resolver plus a linked private
zone is all you need — and understanding that default explains why linking is
what makes private resolution "just work."

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az network dns zone create` | Creates a **public** DNS zone | `az network dns zone create -g dns-lab-rg -n example.com` |
| `az network dns record-set a add-record` | Adds an A record to a public zone | `az network dns record-set a add-record -g dns-lab-rg -z example.com -n www --ipv4-address 20.1.2.3` |
| `az network private-dns zone create` | Creates a **private** DNS zone | `az network private-dns zone create -g dns-lab-rg -n corp.internal` |
| `az network private-dns link vnet create` | Links a VNet to a private zone (optionally auto-register) | `az network private-dns link vnet create -g dns-lab-rg -z corp.internal -n link-to-lab --virtual-network lab-vnet --registration-enabled true` |
| `az network private-dns record-set a add-record` | Adds an A record to a private zone | `az network private-dns record-set a add-record -g dns-lab-rg -z corp.internal -n db --ipv4-address 10.0.2.10` |
| `az network private-dns zone show` | Shows a private zone (incl. record/link counts) | `az network private-dns zone show -g dns-lab-rg -n corp.internal` |
| `az network private-dns link vnet list` | Lists VNet links on a private zone | `az network private-dns link vnet list -g dns-lab-rg -z corp.internal -o table` |

Flag breakdown — `az network private-dns link vnet create -g dns-lab-rg -z corp.internal -n link-to-lab --virtual-network lab-vnet --registration-enabled true`:
- `-z` (`--zone-name`): the private zone to link.
- `-n` (`--name`): a name for the link resource.
- `--virtual-network`: the VNet (name or ID) to link to the zone.
- `--registration-enabled`: `true` turns on auto-registration (Azure creates A
  records for VMs in that VNet); `false` means resolution-only.

Flag breakdown — `az network private-dns record-set a add-record -g dns-lab-rg -z corp.internal -n db --ipv4-address 10.0.2.10`:
- `-z`: the private zone.
- `-n`: the record name (relative to the zone, so this is
  `db.corp.internal`).
- `--ipv4-address`: the IP the A record points to.

## Hands-on exercises

Set up a group and a VNet:
```
az group create --name dns-lab-rg --location eastus
az network vnet create -g dns-lab-rg -n lab-vnet \
  --address-prefixes 10.0.0.0/16 \
  --subnet-name app-subnet --subnet-prefixes 10.0.2.0/24
```

1. **Create a public zone.**
   ```
   az network dns zone create -g dns-lab-rg -n example.com
   ```
   > Verify: `az network dns zone show -g dns-lab-rg -n example.com --query
   > nameServers` prints four Azure name servers. (You'd give these to your
   > registrar to make it live; here it's just for learning — no registrar
   > change needed.)

2. **Add a public A record.**
   ```
   az network dns record-set a add-record -g dns-lab-rg -z example.com \
     -n www --ipv4-address 20.1.2.3
   ```
   > Verify: `az network dns record-set a show -g dns-lab-rg -z example.com -n
   > www` shows the record.

3. **Create a private zone.**
   ```
   az network private-dns zone create -g dns-lab-rg -n corp.internal
   ```
   > Verify: `az network private-dns zone show -g dns-lab-rg -n corp.internal`
   > shows the zone with `numberOfRecordSets` of 1 (the SOA) and **zero**
   > virtual network links.

4. **Add a private A record.**
   ```
   az network private-dns record-set a add-record -g dns-lab-rg \
     -z corp.internal -n db --ipv4-address 10.0.2.10
   ```
   This is `db.corp.internal → 10.0.2.10`.

5. **Observe the failure BEFORE linking.** At this point the zone and record
   exist but no VNet is linked. If you had a VM in `lab-vnet` and ran
   `nslookup db.corp.internal`, it would **fail** (NXDOMAIN) — the VM's
   resolver doesn't know about this zone yet. Confirm the missing link:
   ```
   az network private-dns link vnet list -g dns-lab-rg -z corp.internal \
     -o table
   ```
   Empty list = no VNet can resolve this zone. This is the exercise-7 bug in
   its natural habitat.

6. **Link the VNet (resolution only).**
   ```
   az network private-dns link vnet create -g dns-lab-rg -z corp.internal \
     -n link-to-lab --virtual-network lab-vnet --registration-enabled false
   ```
   > Verify: the link list now shows `link-to-lab` with
   > `VirtualNetworkLinkState` `Completed`. Now a VM in `lab-vnet` *would*
   > resolve `db.corp.internal` to `10.0.2.10`.

7. **Diagnose and fix: private zone resolves nothing.** This is the canonical
   private-DNS failure. Suppose a teammate reports `app01` in a *different*
   VNet can't resolve `db.corp.internal`. Reproduce and reason it out:
   create a second VNet `other-vnet` (`10.5.0.0/16`) but do **not** link it.
   ```
   az network vnet create -g dns-lab-rg -n other-vnet \
     --address-prefixes 10.5.0.0/16 --subnet-name s1 \
     --subnet-prefixes 10.5.1.0/24
   ```
   A VM in `other-vnet` fails to resolve the record because `other-vnet` is not
   linked to `corp.internal` — the records only exist for linked VNets.
   **Fix:** link it.
   ```
   az network private-dns link vnet create -g dns-lab-rg -z corp.internal \
     -n link-to-other --virtual-network other-vnet --registration-enabled false
   ```
   > Verify: the link list now shows two links, both `Completed`. Resolution
   > from `other-vnet` now works. **Lesson: a private zone resolves only from
   > VNets explicitly linked to it — the zone and records existing is not
   > enough.**

8. **Enable auto-registration on one link.** Recreate the `lab-vnet` link with
   registration on (delete the old one first, since only one link per zone can
   auto-register):
   ```
   az network private-dns link vnet delete -g dns-lab-rg -z corp.internal \
     -n link-to-lab --yes
   az network private-dns link vnet create -g dns-lab-rg -z corp.internal \
     -n link-to-lab-reg --virtual-network lab-vnet --registration-enabled true
   ```
   Now any VM you create in `lab-vnet` auto-gets an `A` record in
   `corp.internal`. (Try to enable registration on the `other-vnet` link too
   and note Azure won't allow a second auto-registering link on the same zone.)

9. **Cleanup.** DNS zones and links are inexpensive but not always free
   (public zones carry a small per-zone-per-month and per-query charge).
   Delete the group:
   ```
   az group delete --name dns-lab-rg --yes --no-wait
   ```

## Independent challenge
Combine this module with **module 01 and module 02**. Build a VNet with a
`web-subnet` and a `data-subnet`, put a private DNS zone `svc.internal` in
place, link it to the VNet with auto-registration on, and add a manual A record
`cache.svc.internal` pointing to an IP in `data-subnet`. Then reason about
(or, if you deploy a VM, actually test) how an NSG on `data-subnet` interacts
with DNS: DNS resolution succeeding does **not** mean the NSG will let the
connection through. Confirm you can articulate the difference between "name
resolves" and "traffic allowed." Clean up the resource group afterward.

<details><summary>Stuck? One hint</summary>

Resolution and reachability are independent layers. A successful `nslookup`
only proves the private zone is linked and the record exists; whether traffic
to that IP actually flows is decided by the NSG rules from module 02. Test them
separately: `nslookup` for DNS, then a port test (or `az network watcher
test-ip-flow`) for the NSG verdict.
</details>

## Common mistakes & troubleshooting
- **Zone exists, resolves nothing.** You forgot the VNet link. Check
  `az network private-dns link vnet list`; an empty list is the smoking gun.
- **Two auto-registering links.** Only one linked VNet per private zone can
  have `--registration-enabled true`. Azure rejects the second.
- **Confusing public and private zone commands.** `az network dns ...` is
  public; `az network private-dns ...` is private. They are separate command
  trees.
- **Expecting DNS to imply connectivity.** Name resolution and NSG allow/deny
  are independent. A resolvable name with a blocking NSG still won't connect.
- **Registrar delegation missed for public zones.** A public zone doesn't go
  live until your registrar's NS records point to Azure's four name servers.
- **Cost note:** private zones and links are cheap; public zones bill a small
  monthly fee per zone plus per-million queries. Delete practice zones you
  don't need.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. A private DNS zone and its A records exist, but a VM in your VNet gets
   NXDOMAIN. What single step is almost certainly missing?
2. What is auto-registration, and how many linked VNets per zone can have it
   enabled?
3. Which command tree is for public zones and which for private zones?
4. Your app resolves an internal name correctly but still can't connect to the
   service. Which two independent layers are involved, and which one does DNS
   *not* control?
5. What must you do at your domain registrar to make an Azure **public** DNS
   zone actually authoritative for your domain?
6. From which VNets can a private DNS zone be resolved?
7. Two teammates in two different VNets both need to resolve
   `db.corp.internal`. What has to be true for both?

<details><summary>Show answers</summary>

1. A **virtual network link** joining the zone to that VM's VNet. Records
   resolve only from linked VNets.
2. When enabled on a VNet link, Azure automatically creates/maintains an A
   record for every VM in that VNet. Only one linked VNet per zone may have
   auto-registration enabled.
3. Public: `az network dns ...`. Private: `az network private-dns ...`. They
   are separate command trees.
4. DNS resolution (the zone/link) and reachability (NSG allow/deny, module 02).
   DNS does not control reachability — a resolvable name can still be blocked
   by an NSG.
5. Update the registrar's NS records to point to the four Azure name servers
   listed on the zone (`az network dns zone show --query nameServers`).
6. Only from VNets explicitly linked to that private zone.
7. Both VNets must be linked to the `corp.internal` private zone, and the A
   record must exist. Linking one VNet does not make the record resolve from
   the other.
</details>

## Cumulative review
Closed-book. Answer all of these in writing before opening the solutions —
they mix modules 00 through 03 on purpose.

1. You created a resource group and a VNet, but `az network vnet show` reports
   the group doesn't exist. Walk through the two most likely causes (one from
   module 00, one operational) and how you'd confirm each.
2. You need a `/24` web subnet with room for at least 200 hosts. Does `/24`
   work in Azure? Show the usable-count arithmetic, and name the first
   assignable IP.
3. An NSG on `web-subnet` has: priority 150 Deny TCP 443 from Internet;
   priority 300 Allow TCP 443 from Internet. Is HTTPS from the internet
   allowed? What one change (staying with these two rules) would flip the
   verdict?
4. A private DNS zone `corp.internal` has an A record `db → 10.0.2.10`, but a
   VM in `lab-vnet` gets NXDOMAIN. The zone and record definitely exist. What's
   wrong and what's the exact fix?
5. Explain why "the name resolves correctly" and "I can connect to the
   service" are two independent facts, naming the Azure resource responsible
   for each.
6. You want every VM in `lab-vnet` to automatically get an internal DNS name.
   What do you configure, and what's the constraint on how many VNets per zone
   can do this?
7. Map these four general-networking terms to their Azure resources: stateful
   firewall; internal/split-horizon DNS; the private network you subnet; a
   symbolic name for a maintained set of IP ranges used in firewall rules.
8. Two VNets both use `10.0.0.0/16`. Independent of DNS, name one module-01
   consequence and one module-05-preview consequence of this choice.
9. You've finished a lab that created a public DNS zone and several VNets.
   Which of these bill you if left running, and what's the one command that
   removes them all?

<details><summary>Show answers</summary>

1. (a) Wrong active subscription — the group exists in a different subscription
   than the one currently selected; confirm with `az account show` /
   `az account list` and `az account set`. (b) You're targeting the wrong
   resource-group name or region, or the create actually failed; confirm with
   `az group list -o table`.
2. Yes. A `/24` = 256 addresses; Azure reserves 5, leaving **251** usable ≥
   200. First assignable IP is `.4` (e.g. `10.0.1.4`).
3. Denied — priority 150 (Deny) is evaluated before 300 (Allow), first match
   wins. Flip it by making the Allow's priority lower than 150 (e.g. 100), so
   the allow is evaluated first.
4. `lab-vnet` isn't linked to the private zone. Fix:
   `az network private-dns link vnet create ... -z corp.internal
   --virtual-network lab-vnet`. Records resolve only from linked VNets.
5. Resolution is handled by the (private/public) DNS zone — it turns a name
   into an IP. Reachability is handled by the NSG (module 02) — it allows or
   denies traffic to that IP. Both must succeed; one succeeding says nothing
   about the other.
6. Create a VNet link with `--registration-enabled true` (auto-registration).
   Only one linked VNet per private zone may have auto-registration enabled.
7. Stateful firewall → NSG; internal DNS → private DNS zone (linked to VNet);
   private network you subnet → VNet + subnets; symbolic maintained IP set →
   service tag.
8. Module 01: fine in isolation, but you can't carve non-overlapping subnets
   across them meaningfully for a shared design. Module-05 preview: you can't
   peer them — overlapping ranges can't be routed between.
9. The public DNS zone bills a small monthly + per-query charge; VNets/subnets
   are free. `az group delete --name <rg> --yes --no-wait` removes everything
   at once.
</details>

## Next
[04 — Public IPs, Load Balancers & NAT Gateway](../04-public-ips-load-balancers-and-nat-gateway/README.md):
give resources public addresses, spread traffic across backends at L4, and
control outbound connectivity.
