# Routing Protocols

## Why this matters

Module 05 gave you the routing table and told you entries get populated
"statically (you configure them) or dynamically (routers exchange
reachability with protocols)" — then moved on. That's fine for a single
host or a small lab, but it's not how the internet, or any network with
more than a handful of routers, actually works. Nobody hand-types routes
into thousands of routers, and nobody could keep them correct as links
fail and topologies change. **Dynamic routing protocols** let routers
discover the network and each other's routes automatically, and react to
failures in seconds instead of waiting for a human to notice and fix a
static route. This module is where "the routing table" from module 05
stops being something *you* fill in and becomes something the network
fills in *for* you — and gives you the vocabulary (RIP, OSPF, BGP,
administrative distance) you'll need the moment a real outage traces back
to "the router picked the wrong path."

## Concepts

### Static vs dynamic routing

**Static routing** is what module 05 already covered: an administrator
manually configures each route (`ip route add ...`). It's predictable,
requires no protocol overhead, and is completely fine for small,
stable topologies (a handful of subnets, one path between them) — which
is exactly why this track used it. It does not scale: every topology
change (a new subnet, a failed link) requires manually updating every
affected router, and nothing detects or reroutes around a failure on its
own.

**Dynamic routing** replaces manual configuration with a **routing
protocol**: routers periodically exchange reachability information with
their neighbors, build up a picture of the network, and compute routes
automatically — including automatically removing routes through a link
that just failed. The tradeoff is complexity (a protocol to configure,
understand, and secure) in exchange for scale and self-healing.

### IGP vs EGP: routing within vs between organizations

Routing protocols split into two categories by *scope*:

- **IGP (Interior Gateway Protocol)** — runs *within* a single
  organization's network (one **autonomous system**, or AS — a network
  under one administrative control). RIP and OSPF are IGPs.
- **EGP (Exterior Gateway Protocol)** — runs *between* different
  autonomous systems — between organizations, e.g. between your ISP and
  the next ISP over. BGP is the only EGP in real use today; it's the
  protocol that makes the *internet itself* a connected network of
  independently-run networks.

The practical distinction: you might run OSPF inside your company's
network to route between your own subnets, while your edge router speaks
BGP to your ISP to reach everything outside it. Different jobs, different
protocols, often both running on the same router at once.

### Distance-vector vs link-state: two ways to compute a route

- **Distance-vector** protocols (RIP) work like gossip: each router tells
  its directly-connected neighbors "here's every destination I know
  about, and how many hops away it is," and each neighbor adds one hop
  and passes it on. No router ever sees the whole topology — just what
  its neighbors report. Simple to implement, but slow to converge after a
  failure (routes propagate hop-by-hop, one gossip round at a time) and
  historically prone to routing loops during that convergence window.
- **Link-state** protocols (OSPF) work like a shared map: every router
  floods information about its own direct links to *every* other router
  in the area (not just neighbors), so every router ends up with an
  identical, complete picture of the topology, and independently runs a
  shortest-path algorithm (Dijkstra's) over that full picture. Faster,
  more accurate convergence, but more CPU/memory to hold the full map and
  more complex to configure.

### RIP: the simple, mostly-historical distance-vector protocol

**RIP (Routing Information Protocol)** picks routes by **hop count**
only — the path with the fewest routers in between wins, regardless of
whether the "shorter" path is 3 slow satellite links and the "longer" one
is 4 fast fiber links. It's capped at 15 hops (16 means "unreachable"),
which alone rules it out for large networks. RIP is largely a teaching
and legacy protocol today — you'll rarely deploy it in a modern network —
but its simplicity is exactly why it's the right first protocol to
actually configure and watch converge by hand, which is what this
module's exercises use it for.

### OSPF: the standard interior link-state protocol

**OSPF (Open Shortest Path First)** is the dominant IGP in real enterprise
networks. It's link-state (full topology map, Dijkstra shortest-path),
picks routes by **cost** (an administrator-tunable metric, commonly
derived from link bandwidth — a faster link gets a lower cost and wins
over a hop-count-shorter but slower path, exactly what RIP can't express)
and organizes large networks into **areas** to keep the flooded topology
information from growing without bound — a **backbone area (Area 0)**
that every other area must connect to, keeping the design hierarchical
rather than one enormous flat flood domain. Because it reacts to link
failures via flooding rather than periodic gossip, OSPF converges far
faster than RIP after a topology change.

### BGP: the protocol that runs the internet

**BGP (Border Gateway Protocol)** is the EGP that connects autonomous
systems to each other — it's what makes "the internet" one routable
network made of thousands of independently-run networks instead of
thousands of disconnected islands. It's a **path-vector** protocol: each
route carries the actual list of AS numbers it passed through (the
**AS-path**), which both lets a router pick a route and, critically,
lets it detect and reject a route that loops back through its own AS.
BGP doesn't optimize for pure speed or hop count the way RIP/OSPF do —
real-world route selection weighs policy (business relationships between
networks — who's a paid transit provider vs a peer), AS-path length, and
several other attributes, because BGP routing decisions are as much about
*who's willing to carry your traffic and under what commercial terms* as
about the technically shortest path. This is also the protocol behind
module 01's **CIDR route aggregation/summarization**: an ISP advertises
one summarized prefix upstream via BGP instead of every individual
customer subnet, keeping the global routing table from growing
unmanageably as the internet scales.

### Administrative distance: when a router hears about the same route twice

A router can learn a route to the same destination from more than one
source — a static route you configured *and* OSPF learning the same
prefix dynamically, for instance. **Administrative distance (AD)** is
the tie-breaker: a lower AD wins, regardless of the metric either source
would otherwise use. The common defaults, lowest (most trusted) first:

| Source | Typical AD |
|---|---|
| Directly connected | 0 |
| Static route | 1 |
| OSPF | 110 |
| RIP | 120 |
| Unreachable/unusable | 255 |

A static route (AD 1) overrides an OSPF-learned route to the same
destination (AD 110) even if OSPF's path is objectively better by its own
cost metric — this is a common, very real source of "why is traffic
taking the path I *didn't* configure OSPF to prefer" confusion, and the
fix is almost always "a leftover static route is winning by AD, delete
it or raise its AD" rather than anything wrong with the dynamic protocol
itself.

## Command reference

This module uses **FRRouting (FRR)**, the standard open-source router
software also used inside many real network appliances, running directly
on your WSL2 Ubuntu box (or between netns/Docker "routers" the way the
capstone builds a lab).

| Command | What it does | Example |
|---------|--------------|---------|
| `sudo apt install frr` | Installs FRR (`ripd`/`ospfd`/`bgpd` daemons + `vtysh` CLI) | `sudo apt install frr` |
| `sudo vtysh` | Opens FRR's interactive router CLI (Cisco-style) | `sudo vtysh` |
| `show ip route` | Shows the current routing table with the source of each route (`C`=connected, `S`=static, `O`=OSPF, `R`=RIP) | `show ip route` |
| `show ip ospf neighbor` | Lists OSPF neighbors and their adjacency state | `show ip ospf neighbor` |
| `show ip route rip` | Shows only RIP-learned routes | `show ip route rip` |
| `router rip` / `network <cidr>` | Enables RIP and advertises a connected network into it (config mode) | `router rip` then `network 10.0.1.0/24` |
| `router ospf` / `network <cidr> area 0` | Enables OSPF and assigns a network to an area (config mode) | `router ospf` then `network 10.0.1.0/24 area 0` |

Flag/output notes:

- `show ip route` output codes tell you the *source* of each entry at a
  glance — `C` (connected), `S` (static), `O` (OSPF), `R` (RIP) — which is
  exactly what you need to spot an administrative-distance conflict: two
  entries for the same prefix with different source codes means AD is
  the tiebreaker.
- `show ip ospf neighbor` state should reach `Full` for a working
  adjacency; stuck at `Init` or `2-Way` means the neighbor relationship
  never completed — check that both sides are in the same area and can
  reach each other at the link layer first (module 00/05's toolkit).

## Hands-on exercises

Requires FRR (`sudo apt install frr`) in WSL2, and two or three network
namespaces or Docker containers acting as separate "routers" connected by
veth pairs or a bridge (reuse the lab-building approach from the
capstone, module 12) — or, at minimum, run these against a single-router
FRR instance to read its own table and syntax before wiring up multiple
routers.

1. **Install and enter FRR.** `sudo apt install frr`, enable the daemons
   you need by editing `/etc/frr/daemons` (set `ripd=yes` and
   `ospfd=yes`), restart with `sudo systemctl restart frr`, then
   `sudo vtysh`. Run `show ip route` and confirm you see your existing
   connected routes with the `C` code — this is FRR reading the same
   kernel routing table `ip route` shows you, just with source
   annotations.

2. **Configure RIP on a two-router lab and watch it converge.** Build two
   namespaces/containers connected via a shared subnet, each also
   connected to its own private subnet (so each "router" has a network
   the other doesn't yet know about). On each, enter `router rip` and
   `network <its-connected-subnets>`. Within ~30 seconds, run
   `show ip route rip` on router A — expect to see router B's private
   subnet appear, learned automatically, with no static route configured
   for it. This is RIP's gossip in action.

3. **Break a link and time convergence.** With RIP still running from
   exercise 2, disconnect (or `ip link set down`) the link between the
   two routers. Time how long `show ip route rip` takes to remove the
   now-unreachable route. Expected: RIP takes noticeably longer (its
   periodic-update timers are on the order of tens of seconds) than
   you'd want for a production failover — this is the concrete,
   observed version of "distance-vector converges slowly," not just a
   claim from the Concepts section.

4. **Same lab, OSPF instead of RIP.** Disable RIP, configure `router
   ospf` / `network ... area 0` on both routers instead. Run
   `show ip ospf neighbor` and confirm the adjacency reaches `Full`, then
   `show ip route` and confirm the same cross-router route appears, now
   with the `O` code. Repeat exercise 3's link-break test and compare
   convergence time — expect OSPF to notice and reroute meaningfully
   faster.

5. **Trigger and observe an administrative-distance conflict.** With
   OSPF from exercise 4 still learning router B's subnet correctly,
   manually add a static route to that same subnet pointing at a
   deliberately wrong next hop: `ip route add <b's-subnet> via
   <wrong-ip>`. Run `show ip route` — expect the static route (`S`, AD 1)
   to be installed and preferred over the OSPF route (`O`, AD 110) *even
   though it's wrong*, and confirm traffic to that subnet now actually
   breaks. Remove the bad static route and confirm OSPF's route takes
   over again immediately.

## Independent challenge

No lab given. You inherit a network where a specific subnet is
unreachable, and `show ip route` on the router shows an `S` (static)
entry for it pointing at a next hop that no longer exists (a
decommissioned device), while OSPF is confirmed (via `show ip ospf
neighbor` on a full adjacency, and by checking a neighboring router's own
table) to have a valid, working route to the same subnet. Using this
module's administrative-distance table, explain exactly why the OSPF
route isn't being used despite being correct and reachable, and state the
fix. Then explain why simply raising OSPF's administrative distance
(instead of removing the bad static route) would be the wrong fix, even
though it would technically also resolve this specific symptom.

<details><summary>Stuck? One hint</summary>

The static route's AD (1) beats OSPF's AD (110) regardless of which one
actually works — administrative distance is a pure trust-ranking of the
*source*, not a check of whether the route is currently valid. The
correct fix is removing (or correcting) the stale static route, restoring
OSPF's dynamically-learned, currently-correct route to being used. Raising
OSPF's AD above the static route's would only "fix" this one symptom by
coincidence and would make *every future* legitimate static route on this
router lose to OSPF instead — the actual problem is one specific stale
entry, not a general policy about which protocol should be trusted more,
and fixing a specific-entry problem by changing a global trust ranking is
solving the wrong-scoped problem.

</details>

## Common mistakes & troubleshooting

- **Confusing "shorter path" (hop count) with "better path."** RIP's
  hop-count metric can prefer a path over slow links simply because it
  has fewer routers in between — exercise 3's kind of scenario is why
  OSPF's cost-based (bandwidth-aware) metric is preferred for anything
  beyond a small, uniform-link network.
- **Forgetting that a stale static route silently wins over a correct
  dynamic one.** Administrative distance doesn't care whether a route
  still works — exercise 5 and the independent challenge are both this
  exact trap, and it's a genuinely common real-world outage cause.
- **Assuming OSPF adjacency = working routes.** A neighbor stuck at
  `Init`/`2-Way` instead of `Full` means routes aren't actually being
  exchanged yet — check adjacency state before assuming the protocol
  itself is broken.
- **Treating BGP like "OSPF but for the internet."** BGP's route
  selection is policy-and-relationship-driven (who's paying whom, AS-path
  preferences), not simply "shortest/fastest path" — assuming BGP always
  picks the technically optimal route is a common misconception.
- **Running a routing protocol without understanding its convergence
  time.** A protocol that takes 30-60 seconds to notice and route around
  a failure (RIP) is a real, measurable availability gap for a service
  that needs sub-second failover — pick the protocol (and tune its
  timers) to match what the service actually needs, don't assume "it's
  dynamic routing, it'll just handle it" covers every case equally fast.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. What's the practical difference between static and dynamic routing,
   and what does dynamic routing cost you in exchange for scale and
   self-healing?
2. What's the difference between an IGP and an EGP, and which category
   does BGP fall into?
3. Contrast distance-vector and link-state routing in terms of what each
   router actually knows about the topology.
4. Why is RIP's hop-count metric a poor fit for a network with links of
   very different speeds, and what does OSPF use instead?
5. What is administrative distance, and why can a static route "win" over
   a dynamically-learned route to the same destination even when the
   static route is wrong?
6. Why does BGP's route selection depend on more than just "shortest
   path," unlike RIP or OSPF?

<details><summary>Show answers</summary>

1. Static routing is manually configured by an administrator and never
   changes on its own; dynamic routing has routers exchange reachability
   information via a protocol and compute/update routes automatically,
   including reacting to failures without human intervention. The cost is
   protocol complexity — configuration, resource usage, and a new class
   of things that can go wrong (protocol misconfiguration, slow
   convergence, administrative-distance conflicts) in exchange for not
   needing to hand-maintain every route as the network changes.
2. An IGP (like RIP or OSPF) runs within a single autonomous system (one
   organization's network); an EGP runs between autonomous systems. BGP
   is the EGP — it's what connects independently-run networks (like ISPs)
   into the single routable internet.
3. Distance-vector (RIP): each router only knows what its direct
   neighbors report (hop counts to destinations), with no view of the
   full topology — "gossip." Link-state (OSPF): every router floods its
   own direct links to every other router in the area, so every router
   ends up with an identical, complete map of the topology and computes
   shortest paths independently over that full picture.
4. Hop count treats every link as equal regardless of actual speed, so
   RIP can prefer a path with fewer, slower links over a path with more,
   faster links. OSPF uses a cost metric commonly derived from link
   bandwidth, so faster links are preferred even if the path has more
   hops.
5. Administrative distance is a per-source trust ranking used to break
   ties when a router learns a route to the same destination from more
   than one source (e.g. static config vs OSPF) — a lower AD always wins,
   regardless of whether that route's metric, or even its basic
   correctness, is actually better. A static route (AD 1) beats an OSPF
   route (AD 110) purely by source ranking, even if the static route
   points at a dead next hop and the OSPF route is valid and working.
6. Because BGP connects independently-operated networks with real
   business relationships (transit customers, peers, paid agreements) —
   route selection has to reflect policy (who's willing/paid to carry the
   traffic) in addition to path length, unlike RIP/OSPF which operate
   within one organization's network where "shortest/cheapest technical
   path" is the only consideration that matters.

</details>

## Next

[09 — VPN & IPSec](../09-vpn-and-ipsec/README.md): now that you understand
how routes get learned across a network, learn how two networks connect
*securely* across a network neither of them controls — the untrusted
public internet.
