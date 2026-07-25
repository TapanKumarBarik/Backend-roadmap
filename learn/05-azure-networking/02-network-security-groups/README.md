# Network Security Groups

## Why this matters
An NSG is how you actually control traffic in Azure — without one, subnets rely
only on default rules that allow all intra-VNet traffic and all outbound
internet. Nearly every "why can't I reach my VM/app?" problem in Azure comes
down to an NSG rule, its priority, or which resource it's attached to. This is
the firewall concept from track 1, implemented as an Azure resource with some
very specific ordering and default-rule behavior you must know cold.

## Concepts

### An NSG is Azure's stateful firewall
An NSG is Azure's implementation of the stateful packet-filtering firewall from
[networking-fundamentals module 05](../../04-networking-fundamentals/README.md).
It holds a prioritized list of allow/deny rules for inbound and outbound
traffic, matching on source/destination IP (or tag), port, and protocol.
Because it's **stateful**, you only write a rule for the initiating direction —
if you allow inbound TCP 443, the return traffic is automatically permitted;
you don't write a matching outbound rule for responses.

### Attachment: subnet vs NIC
An NSG can be associated to a **subnet** (applies to every resource in it) or
to a **NIC** (applies to that one resource), or both. When both apply, inbound
traffic is evaluated against the subnet NSG **then** the NIC NSG (and the
reverse order outbound); traffic must pass *both*. Prefer subnet-level NSGs for
broad policy and use NIC-level sparingly — two NSGs on the same path is a
classic source of "it's allowed in one place but still blocked" confusion.

### Rules, priority, and evaluation order
Each rule has a **priority** from 100 to 4096 (lower number = evaluated first).
Rules are processed in priority order and the **first match wins** — once a
packet matches a rule, no lower-priority rule is consulted. This is the detail
that breaks people: a broad `Deny` at priority 200 will shadow a specific
`Allow` at priority 300, because 200 is evaluated first. Leave gaps between
priorities (100, 200, 300...) so you can insert rules later.

### Default rules and service tags
Every NSG has hidden **default rules** at priorities 65000–65500 you can't
delete (only override with higher-priority rules): allow all inbound within the
VNet (`AllowVnetInBound`), allow inbound from Azure Load Balancer, deny all
other inbound (`DenyAllInBound`); and outbound, allow all VNet + all internet,
deny the rest. Rules reference **service tags** — symbolic names like
`VirtualNetwork`, `Internet`, `AzureLoadBalancer`, `Storage`, `Sql` — instead
of hardcoded IP ranges. Use tags instead of IP literals wherever possible;
Azure keeps the underlying ranges current for you.

### Application Security Groups (ASGs)
An **ASG** lets you group NICs by role (e.g. `web-servers`, `db-servers`) and
then write NSG rules whose source/destination is the ASG name instead of an IP
range. Add a new web VM to the `web-servers` ASG and it inherits the rules — no
NSG edits. ASGs make rules readable and stable as your fleet changes; they're
the Azure answer to "firewall rules that reference roles, not addresses."

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az network nsg create` | Creates an NSG | `az network nsg create -g nsg-lab-rg -n web-nsg` |
| `az network nsg rule create` | Adds a rule to an NSG | `az network nsg rule create -g nsg-lab-rg --nsg-name web-nsg -n allow-https --priority 300 --access Allow --direction Inbound --protocol Tcp --destination-port-ranges 443 --source-address-prefixes Internet` |
| `az network nsg rule list` | Lists rules (add `--include-default`) | `az network nsg rule list -g nsg-lab-rg --nsg-name web-nsg --include-default -o table` |
| `az network nsg rule update` | Edits a rule | `az network nsg rule update -g nsg-lab-rg --nsg-name web-nsg -n allow-https --priority 250` |
| `az network vnet subnet update` | Attaches an NSG to a subnet | `az network vnet subnet update -g nsg-lab-rg --vnet-name lab-vnet -n web-subnet --network-security-group web-nsg` |
| `az network asg create` | Creates an Application Security Group | `az network asg create -g nsg-lab-rg -n web-servers` |
| `az network watcher test-ip-flow` | Simulates whether traffic is allowed/denied | `az network watcher test-ip-flow -g nsg-lab-rg --vm myvm --direction Inbound --protocol TCP --local 10.0.1.4:443 --remote 8.8.8.8:12345` |

Flag breakdown — `az network nsg rule create ... -n allow-https --priority 300 --access Allow --direction Inbound --protocol Tcp --destination-port-ranges 443 --source-address-prefixes Internet`:
- `-n` (`--name`): rule name.
- `--priority`: 100–4096; lower is evaluated first; must be unique per
  direction in the NSG.
- `--access`: `Allow` or `Deny`.
- `--direction`: `Inbound` or `Outbound`.
- `--protocol`: `Tcp`, `Udp`, `Icmp`, or `*` (any).
- `--destination-port-ranges`: port(s) the traffic is going to (e.g. `443`,
  `80 443`, `1000-2000`).
- `--source-address-prefixes`: source IP CIDR(s) or a service tag like
  `Internet` or `VirtualNetwork`.

Flag breakdown — `az network watcher test-ip-flow -g ... --vm myvm --direction Inbound --protocol TCP --local 10.0.1.4:443 --remote 8.8.8.8:12345`:
- `--vm`: the VM whose effective NSG rules are evaluated.
- `--direction`: direction of the simulated packet.
- `--local`: the VM-side `IP:port`.
- `--remote`: the other end's `IP:port`.
- Returns `Allow`/`Deny` **and the name of the matching rule** — the single
  best NSG debugging tool.

## Hands-on exercises

Set up a group, VNet, and subnet:
```
az group create --name nsg-lab-rg --location eastus
az network vnet create -g nsg-lab-rg -n lab-vnet \
  --address-prefixes 10.0.0.0/16 \
  --subnet-name web-subnet --subnet-prefixes 10.0.1.0/24
```

1. **Create an NSG and attach it to the subnet.**
   ```
   az network nsg create -g nsg-lab-rg -n web-nsg
   az network vnet subnet update -g nsg-lab-rg --vnet-name lab-vnet \
     -n web-subnet --network-security-group web-nsg
   ```
   > Verify: `az network vnet subnet show -g nsg-lab-rg --vnet-name lab-vnet
   > -n web-subnet` now shows a `networkSecurityGroup` reference.

2. **Inspect the default rules.**
   ```
   az network nsg rule list -g nsg-lab-rg --nsg-name web-nsg \
     --include-default -o table
   ```
   > Verify: you see `AllowVnetInBound`, `AllowAzureLoadBalancerInBound`,
   > `DenyAllInBound` (65000–65500) and the outbound equivalents. You have no
   > custom rules yet.

3. **Allow HTTPS from the internet.**
   ```
   az network nsg rule create -g nsg-lab-rg --nsg-name web-nsg \
     -n allow-https --priority 300 --access Allow --direction Inbound \
     --protocol Tcp --destination-port-ranges 443 \
     --source-address-prefixes Internet
   ```
   > Verify: rule list (without `--include-default`) shows `allow-https`.

4. **Allow SSH only from your IP.** Replace `<your-ip>` with your actual
   public IP (find it at whatismyip or `curl ifconfig.me`):
   ```
   az network nsg rule create -g nsg-lab-rg --nsg-name web-nsg \
     -n allow-ssh-mgmt --priority 310 --access Allow --direction Inbound \
     --protocol Tcp --destination-port-ranges 22 \
     --source-address-prefixes <your-ip>/32
   ```
   This is far safer than opening 22 to `Internet`.

5. **Use service tags instead of IP ranges.** Add an outbound rule allowing
   only Azure Storage:
   ```
   az network nsg rule create -g nsg-lab-rg --nsg-name web-nsg \
     -n allow-storage-out --priority 300 --access Allow --direction Outbound \
     --protocol Tcp --destination-port-ranges 443 \
     --destination-address-prefixes Storage
   ```
   Note you referenced the `Storage` tag, not any IP range.

6. **Create and use an ASG.**
   ```
   az network asg create -g nsg-lab-rg -n web-servers
   ```
   Then rewrite the HTTPS rule to target the ASG as destination instead of the
   whole subnet:
   ```
   az network nsg rule update -g nsg-lab-rg --nsg-name web-nsg \
     -n allow-https --destination-asgs web-servers
   ```
   (In a real deployment you'd add each web NIC to `web-servers`; here you're
   learning the wiring.)

7. **Diagnose and fix: a broad deny shadows a specific allow.** Add a
   deliberately misordered pair of rules:
   ```
   az network nsg rule create -g nsg-lab-rg --nsg-name web-nsg \
     -n deny-all-web --priority 200 --access Deny --direction Inbound \
     --protocol Tcp --destination-port-ranges 80 443 \
     --source-address-prefixes Internet
   ```
   Now your `allow-https` at priority 300 never fires, because `deny-all-web`
   at 200 is evaluated first and matches 443. **Diagnose:** list rules and
   note the priority ordering — 200 < 300, first match wins, so 443 is denied.
   **Fix:** either raise `allow-https` above the deny, or narrow the deny. Give
   the allow a lower (earlier) priority than the deny:
   ```
   az network nsg rule update -g nsg-lab-rg --nsg-name web-nsg \
     -n allow-https --priority 150
   ```
   Now 443 is allowed (150) before the deny (200) is reached. This
   priority-ordering trap is the most common NSG bug in production.

8. **Verify with the flow simulator (if you have a VM).** If you place a VM in
   the subnet, `az network watcher test-ip-flow` tells you the verdict *and*
   the matching rule name — the definitive way to confirm exercise 7's fix
   rather than guessing. Without a VM, reason through the priority list
   instead.

9. **Cleanup.** NSGs are free, but delete the group to stay tidy:
   ```
   az group delete --name nsg-lab-rg --yes --no-wait
   ```

## Independent challenge
Build a two-tier NSG design combining this module with **module 01**. In a
fresh resource group, create a VNet with a `web-subnet` and a `db-subnet`. Put
an NSG on each. The web NSG should allow HTTPS from the internet and SSH only
from your IP; the db NSG should allow the database port (say TCP 5432) **only
from the web subnet's address range** and deny it from everywhere else,
including the internet. Prove the ordering is correct by listing the effective
rules and reasoning about which fires first. Clean up the resource group
afterward.

<details><summary>Stuck? One hint</summary>

For the db rule, set `--source-address-prefixes` to the web subnet's CIDR (or
better, use the `VirtualNetwork` service tag combined with a higher-priority
deny for `Internet`). Remember NSGs are stateful — you do not need a
corresponding outbound rule for the database's replies. Confirm the ordering
by listing rules with `--include-default` and checking that no broad deny sits
at a lower priority number than your allows.
</details>

## Common mistakes & troubleshooting
- **Priority ordering.** Lowest number wins and first match stops evaluation.
  A broad deny at a low priority silently shadows specific allows above it in
  number. This is *the* NSG bug.
- **Two NSGs on the same path.** Traffic must pass both the subnet NSG and the
  NIC NSG. If one allows and the other denies, it's denied — check both.
- **Opening management ports to `Internet`.** Never open 22/3389 to
  `Internet`; scope to your IP or use a bastion.
- **Forgetting statefulness.** You do not write return-path rules. Adding
  redundant outbound "response" rules just adds confusion.
- **Editing default rules.** You can't delete them; you override by adding a
  higher-priority (lower-number) custom rule.
- **Cost note:** NSGs themselves are free, so leaving one attached costs
  nothing — but a misconfigured NSG that blocks a health probe can make a
  *billable* Load Balancer or App Gateway (later modules) look broken while
  still charging you. Debug the NSG first.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. An NSG has an `Allow` rule for TCP 443 at priority 300 and a `Deny` rule for
   TCP 443 at priority 200. Is 443 allowed or denied? Why?
2. Why don't you need to write an outbound rule to permit the responses to an
   allowed inbound connection?
3. What's the difference between attaching an NSG to a subnet vs. a NIC, and
   what happens when both are present?
4. What is a service tag, and give two examples. Why prefer them over IP
   literals?
5. Which default rule blocks inbound internet traffic, and at what priority
   range? Can you delete it?
6. What problem do Application Security Groups solve?
7. What single `az` command tells you both whether traffic is allowed and which
   rule decided it?

<details><summary>Show answers</summary>

1. Denied. Priority 200 is evaluated before 300, and the first matching rule
   wins, so the deny fires and the allow is never reached.
2. NSGs are stateful; the return traffic of an allowed flow is automatically
   permitted.
3. Subnet NSG applies to all resources in the subnet; NIC NSG applies to one
   resource. When both exist, traffic must pass both (subnet then NIC inbound;
   reverse outbound). If either denies, it's denied.
4. A symbolic name for an Azure-maintained set of IP ranges (e.g. `Internet`,
   `VirtualNetwork`, `Storage`, `AzureLoadBalancer`). They stay current
   automatically and are more readable than hardcoded CIDRs.
5. `DenyAllInBound`, in the 65000–65500 default range. You can't delete it;
   you override it with a higher-priority custom allow.
6. They let rules reference role-based groups of NICs instead of IP ranges, so
   rules stay stable as machines are added/removed.
7. `az network watcher test-ip-flow`.
</details>

## Next
[03 — Azure DNS & Private DNS](../03-azure-dns-and-private-dns/README.md):
host public and private DNS zones and see why a private zone silently fails to
resolve until it's linked to your VNet.
