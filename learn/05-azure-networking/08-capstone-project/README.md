# Capstone Project

## Why this matters
Every module so far taught one piece in isolation. Real Azure networks are the
*combination* — a hub-and-spoke landing zone where VNets, peering, NSGs, private
DNS, a firewall, and an L7 gateway all have to cooperate, and where a single
missing route or unlinked zone breaks the whole thing. This capstone makes you
assemble those pieces from memory, prove traffic flows exactly where it should
and nowhere it shouldn't, and then tear it all down cleanly. If you can build
and verify this end to end, you can operate the networking layer any Azure
workload sits on — including the Container Apps track that comes next.

> **Cost warning (read before you start).** This project runs an Azure Firewall
> **and** an Application Gateway simultaneously — the two most expensive
> resources in the track, both billing hourly whether idle or not, plus public
> IPs and container instances. Do the whole project in one focused sitting,
> and run `az group delete` the moment you finish. Budget a few dollars if you
> leave it up for an hour or two; budget real money if you forget it overnight.

## The project

Build a small but complete hub-and-spoke topology, verify its traffic behavior,
and delete it. Put **everything in a single resource group** (e.g.
`capstone-rg`) so one `az group delete` removes it all.

Target topology:

```
                       Internet
                          |
                   [ App Gateway ]  (public frontend, in a spoke)
                          |
        +-----------------+------------------+
        |                                    |
   [ Spoke A VNet 10.1.0.0/16 ]        [ Spoke B VNet 10.2.0.0/16 ]
   - workload subnet + NSG             - workload subnet + NSG
   - App Gateway subnet                - backend web app
   - simple backend (container)
        |                                    |
        +--------------- peering ------------+
                          |
                (both peered to hub)
                          |
              [ Hub VNet 10.0.0.0/16 ]
              - AzureFirewallSubnet -> Azure Firewall
              - private DNS zone linked to hub + spokes
        all spoke egress + spoke-to-spoke routed through the firewall (UDRs)
```

What to build, drawing on the whole track:

1. A **hub VNet** (`10.0.0.0/16`) containing an `AzureFirewallSubnet` and an
   **Azure Firewall** with a public IP (module 07).
2. **Two spoke VNets** (`10.1.0.0/16`, `10.2.0.0/16`), each **peered to the
   hub** with forwarded traffic allowed — not peered to each other (module 05).
3. An **NSG on each spoke's workload subnet** with least-privilege rules
   (module 02).
4. A **private DNS zone** (e.g. `corp.internal`) **linked to the hub and both
   spokes**, so an internal name resolves across the topology (module 03).
5. **Route tables (UDRs)** on the spoke workload subnets sending `0.0.0.0/0`
   (and the other spoke's range) to the **firewall's private IP**, so egress
   and spoke-to-spoke traffic pass through the firewall (module 07).
6. **Firewall rules**: a network rule allowing spoke-A ↔ spoke-B on your app
   port, and an application rule allowing egress to one FQDN only (module 07).
7. A **simple web backend** in a spoke — deploy it with `az container create`
   (reuse a small image from your Docker/Azure track, e.g. a tiny nginx or
   hello-world HTTP container serving on port 80).
8. An **Application Gateway** (Standard_v2 or WAF_v2) in front of that backend,
   with a health probe that matches what the backend actually serves and, if
   you use WAF_v2, the WAF enabled in Detection mode (module 06).

Then **verify behavior** (this is the real point — not just building it):

- Traffic to the App Gateway's public frontend reaches the backend and returns
  a page (probe healthy, routing correct).
- spoke-A can reach spoke-B on the allowed port **through the firewall**, and
  the firewall logs/rules show the flow taking that path (not direct peering).
- Egress from a spoke to the **one allowed FQDN** succeeds and egress to a
  **different** FQDN is **blocked** by the firewall application rule.
- The internal private-DNS name resolves to a private IP from a spoke.
- An NSG rule blocks something it's supposed to (e.g. a port you didn't
  allow), proving the NSG is actually in the path.

Finally, **tear everything down** and confirm nothing is left.

### Acceptance criteria checklist

Build:
- [ ] Single resource group holds every resource.
- [ ] Hub VNet `10.0.0.0/16` with an `AzureFirewallSubnet` (exact name, ≥ /26).
- [ ] Azure Firewall deployed with a public IP; its private IP recorded.
- [ ] Two spoke VNets with non-overlapping ranges, each peered to the hub
      **both directions** (`Connected`) with `--allow-forwarded-traffic`.
- [ ] Spokes are **not** peered to each other.
- [ ] An NSG attached to each spoke workload subnet with least-privilege rules.
- [ ] A private DNS zone linked to the hub and both spokes (one internal A
      record present).
- [ ] A route table on each spoke workload subnet routing `0.0.0.0/0` (and the
      other spoke's CIDR) to the firewall's private IP.
- [ ] A firewall network rule allowing spoke-A ↔ spoke-B on the app port.
- [ ] A firewall application rule allowing exactly one egress FQDN.
- [ ] A web backend running via `az container create`.
- [ ] An Application Gateway in front of the backend with a probe that matches
      the served path/port (backend health = Healthy).

Verify:
- [ ] App Gateway public frontend returns the backend page.
- [ ] spoke-A → spoke-B on the allowed port works and is routed via the
      firewall.
- [ ] Egress to the allowed FQDN succeeds; egress to a disallowed FQDN is
      blocked.
- [ ] The private-DNS internal name resolves to a private IP from a spoke.
- [ ] A deliberately-not-allowed port is blocked by an NSG (proving it's in the
      path).

Tear down:
- [ ] `az group delete --name capstone-rg --yes` run.
- [ ] `az group show -n capstone-rg` returns not-found.
- [ ] Cost Management confirms no Firewall, App Gateway, or public IP lingers.

### Hints (not a solution)

- **Order of build matters.** Create VNets/subnets first, then the firewall
  (record its private IP), then route tables that reference that IP, then
  peerings, then DNS, then the backend, then the App Gateway last. The firewall
  and App Gateway each take several minutes to provision — start them early.
- **Backend health first.** If the App Gateway returns 502, check
  `az network application-gateway show-backend-health` before anything else —
  it's almost always a probe path/port mismatch (module 06), not the routing.
- **"Firewall does nothing" = routing.** If firewall rules seem to have no
  effect, the subnet is missing its UDR to the firewall's private IP (module
  07). The firewall only filters traffic that's routed to it.
- **Spoke-to-spoke needs three things** aligned: forwarded-traffic on the
  peerings, a UDR to the firewall, and a firewall network rule (module 05 + 07).
- **DNS resolves but won't connect?** Resolution (private DNS link) and
  reachability (NSG/firewall rules) are independent layers (module 03). Test
  each separately.
- **Verify egress blocking positively.** Don't just confirm the allowed FQDN
  works — actively try a disallowed one and confirm it's blocked, or you
  haven't proven the firewall is enforcing anything.
- **Use `az container create` for the backend** with a tiny HTTP image so the
  compute cost is negligible and startup is fast; the expensive resources are
  the Firewall and App Gateway, so those are the ones to delete first if you
  need to pause.

There is no full solution here on purpose. Every command you need appeared in
modules 01–07; rebuilding the wiring from those references is the exercise.

## Next

There is no "next module" — this is the end of the Azure Networking track.

**Before you move on:** a few days from now, sit down with a blank page and
redraw this entire hub-and-spoke topology from memory — every VNet, subnet,
peering, route table, and where the firewall and App Gateway sit — without
looking back at this file. If any piece is fuzzy, reread that module before
starting the next track; the Container Apps material assumes this networking is
second nature. And one more time: run `az group delete` and then actually
confirm it removed everything — Application Gateway and Azure Firewall are the
two resources people forget, and they're the two that cost the most.

The next track is **[06-azure-container-apps](../../06-azure-container-apps/README.md)**,
which builds directly on the VNet integration, ingress, and DNS concepts you
just learned.
