# Routing, NAT & Firewalls

## Why this matters

Every packet that leaves your machine faces three questions: which way do I send it (routing), what source address should it carry when it crosses network boundaries (NAT), and am I even allowed through (firewalls). These three mechanisms explain the majority of "it can reach here but not there" mysteries — why a container can call out but nothing can call in, why two private networks with the same subnet can't talk, why a port is open locally but blocked remotely. This is also the conceptual bedrock under every cloud "route table," "NAT gateway," and "security group" you'll meet in the Azure track.

## Concepts

### The routing table: choosing the next hop

A host or router decides where to send each packet by consulting its **routing table** — an ordered set of rules mapping destination prefixes to a next hop and outgoing interface. For each packet it finds the **most specific matching route** (the longest prefix that contains the destination) and forwards accordingly. You already met the two essential entries in module 01: **directly connected** routes (destinations on a subnet you're attached to — deliver locally) and the **default route** (`0.0.0.0/0`, the catch-all "everything else goes to the gateway"). `ip route get <dest>` shows exactly which route wins for a given destination.

Longest-prefix matching is the key rule. If the table has both `10.0.0.0/8 via A` and `10.5.0.0/16 via B`, a packet to `10.5.1.1` takes route B because `/16` is more specific than `/8`. The default route `0.0.0.0/0` is the least specific possible, so it only wins when nothing else matches — which is exactly what you want for "the rest of the internet."

### Routers and hop-by-hop forwarding

No single device knows the whole path to a destination (module 00). Each **router** only knows its own next hop for each prefix; forwarding is a relay race where every runner just knows who to hand off to. A packet crosses many routers, each making an independent longest-prefix decision, until it reaches the destination's directly-connected network. Recall from module 00 that the IP TTL decrements at each of these hops and caps the total, and that `traceroute` exploits exactly this to reveal the routers in the path. Routing tables get populated statically (you configure them) or dynamically (routers exchange reachability with protocols like BGP on the internet) — for this track, the static, single-host view is what you'll work with directly.

### NAT: sharing one public address

Private addresses (`10/8`, `172.16/12`, `192.168/16` from module 01) can't be routed on the public internet, yet your laptop, phone, and containers all reach the internet through one public address. **NAT (Network Address Translation)** makes this work: a NAT device rewrites the source address (and often port) of outbound packets to its own public address, remembers the mapping in a translation table, and rewrites the responses back on the way in. The common form is **source NAT / PAT (Port Address Translation)** — many private hosts multiplexed behind one public IP, distinguished by port. This is exactly what your home router and Docker's default bridge do.

The consequence worth internalizing: NAT is inherently **outbound-friendly, inbound-hostile**. An internal host can initiate a connection out (NAT creates a mapping for the reply), but an outside host can't initiate a connection *in* — there's no pre-existing mapping and the private address isn't routable. That's why a container can `curl` the internet but you can't reach a server inside it without an explicit **port forward** (DNAT — destination NAT — that maps an external `IP:port` to an internal one). "Outbound works, inbound doesn't" is the signature of NAT, and recognizing it saves hours.

### Firewalls: filtering by rule

A **firewall** inspects packets and **allows** or **denies** them based on rules, typically matching on source/destination IP, port, protocol, and direction. Two behaviors matter most. First, **default policy**: a firewall may default-deny (block everything not explicitly allowed — secure, common on servers and cloud) or default-allow. Second, **stateful vs stateless**: a **stateful** firewall tracks connections, so if it allows your outbound request it automatically permits the return traffic (you only write rules for the initiating direction); a stateless one filters each packet independently. Almost all modern firewalls (Linux `nftables`/`iptables`, cloud security groups) are stateful.

The diagnostic fingerprint of a firewall **drop** is a **timeout**, not a refusal (module 03): a dropped SYN gets no response, so the client waits and times out, versus a closed port that sends a RST ("connection refused") immediately. So "connection refused" points at "nothing listening," while "connection timed out" points at "firewall dropping" or "host unreachable." A firewall that *rejects* (rather than silently drops) may send an ICMP unreachable, giving a faster failure — but silent drop is the common, harder case.

### How they combine on one packet's journey

Putting it together for a packet leaving a private host to a public server: the host's routing table sends it to the default gateway; the firewall on the way out checks the outbound policy; the NAT device rewrites the source to a public address and records the mapping; routers forward it hop-by-hop across the internet; the server's firewall checks its inbound policy before anything listens. The reply retraces: the server's routing sends it back, and the NAT device rewrites the destination back to the private host using its mapping, and the stateful firewall permits the reply because it matches an allowed outbound flow. Every one of these is a place the packet can be stopped — which is why "trace the packet through routing, NAT, and firewall in order" is the core troubleshooting move.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `ip route` | Shows the routing table | `ip route` |
| `ip route get` | Shows which route/gateway a specific destination uses | `ip route get 8.8.8.8` |
| `ip route add` | Adds a static route (needs sudo) | `sudo ip route add 10.9.0.0/24 via 10.0.0.1` |
| `traceroute` | Reveals the routers (hops) toward a destination | `traceroute -n example.com` |
| `sudo iptables -L -n -v` | Lists firewall rules and packet counts (legacy but readable) | `sudo iptables -L -n -v` |
| `sudo nft list ruleset` | Lists the modern nftables firewall ruleset | `sudo nft list ruleset` |
| `sudo iptables -t nat -L -n` | Shows NAT rules (masquerade/DNAT) | `sudo iptables -t nat -L -n` |
| `nc -zv` | Tests whether a port is reachable (times out when firewalled) | `nc -zv host 443` |

Flag breakdowns:

- `sudo ip route add 10.9.0.0/24 via 10.0.0.1` — `add` inserts a route; `10.9.0.0/24` is the destination prefix; `via 10.0.0.1` is the next-hop router to send matching packets to. Add `dev eth0` to pin the interface.
- `traceroute -n example.com` — `-n` prints numeric IPs instead of resolving each hop to a name (faster, and avoids DNS noise while you're diagnosing routing). Each line is a hop, exploiting TTL as covered in module 00.
- `sudo iptables -L -n -v` — `-L` list rules; `-n` numeric (don't resolve addresses/ports); `-v` verbose (shows packet and byte counters per rule, so you can see which rule is actually catching traffic). The counters are the key diagnostic: a rule with rising drop counts is catching your packets.
- `sudo iptables -t nat -L -n` — `-t nat` selects the NAT table (default is `filter`); reveals `MASQUERADE`/`SNAT` (source rewriting) and `DNAT` (port forwarding) rules.

## Hands-on exercises

1. **Read your routing table.** Run `ip route`. Identify the `default via ...` line (your catch-all) and the directly-connected line for your subnet (`<subnet>/prefix dev eth0 ... scope link`). Expected: one default route plus one or more connected subnets.

2. **Watch longest-prefix matching.** Run `ip route get 8.8.8.8` (takes the default) and `ip route get <an-IP-on-your-subnet>` (takes the connected route, no `via`). The kernel is choosing the most specific match for you. Expected: remote shows `via <gateway>`, local shows just `dev`.

3. **See NAT's effect on your source address.** Run `curl -s https://ifconfig.me` (or `https://api.ipify.org`). The address returned is your *public* NAT address, not your private `eth0` address from `ip addr`. Expected: the two differ — proof that NAT rewrote your source on the way out.

4. **Add and remove a static route.** Run `sudo ip route add 10.123.0.0/24 via <your-gateway>`, confirm with `ip route get 10.123.0.5` (now shows your added next hop), then `sudo ip route del 10.123.0.0/24`. Expected: the route appears then disappears; the `get` result changes accordingly.

5. **Inspect the firewall.** Run `sudo iptables -L -n -v` (or `sudo nft list ruleset`). Identify the default policy on each chain (`policy ACCEPT`/`DROP`) and any rules with nonzero packet counters. Expected: on WSL2 often permissive/empty; note what default policy you see.

6. **Inspect NAT rules.** Run `sudo iptables -t nat -L -n -v`. Look for `MASQUERADE` (source NAT) entries — Docker adds these for its bridge networks. Expected: if Docker is installed, MASQUERADE rules for the `172.17.0.0/16` bridge subnet.

7. **Refused vs dropped, revisited.** First establish the baseline: start `nc -l 0.0.0.0 9000` and from another terminal `nc -zv <eth0-IP> 9000 -w 3` succeeds. Now add a firewall drop and observe the change: `sudo iptables -A INPUT -p tcp --dport 9000 -j DROP`, then re-run `nc -zv <eth0-IP> 9000 -w 3` — it now **times out** instead of connecting. Remove the rule: `sudo iptables -D INPUT -p tcp --dport 9000 -j DROP`. Expected: with the DROP rule the connect times out; without it, it succeeds — timeout is the firewall fingerprint.

8. **Diagnose and fix: a firewall rule blocking traffic.** Set up the failure: `sudo iptables -A INPUT -p tcp --dport 8080 -j DROP`, then start a listener `nc -l 0.0.0.0 8080` and from another terminal `nc -zv <eth0-IP> 8080 -w 3`. It times out. Now diagnose without assuming: `ss -tlnp | grep 8080` confirms the service *is* listening (so it's not a "nothing listening" refusal), and the *timeout rather than refused* points at a drop, not a dead port. Find the culprit: `sudo iptables -L INPUT -n -v` shows a DROP rule on dport 8080 with a rising packet counter. **Fix:** delete the rule — `sudo iptables -D INPUT -p tcp --dport 8080 -j DROP` — and re-test; the connect now succeeds. The lesson: listening + timeout (not refused) + a matching DROP rule with climbing counters = firewall block, and the fix is the rule, not the service.

## Independent challenge

Two Docker containers, `web` and `db`, sit on the same user-defined bridge network; `web` can reach `db` but a third container `report` on a *different* bridge network cannot reach `db` at all, timing out. Design a diagnosis that determines whether the failure is routing (no route between the two bridge subnets), NAT (translation hiding addresses), or firewall (a rule dropping cross-network traffic), and decide what would make `report` able to reach `db`. Combine this module with **module 01 (subnetting)**: start by establishing whether the two bridge networks are even in the same subnet or different ones, because that alone determines whether this is a "same-LAN" or a "needs-routing-between-networks" problem.

<details><summary>Stuck? One hint</summary>

First get the facts from module 01: `docker network inspect` each bridge and note their subnets — if `db`'s network and `report`'s network are different subnets, then reaching across requires routing between them, and Docker's default is precisely *not* to route or allow that (isolation is intentional). A timeout (not "connection refused") plus confirmation via `ss` that `db` is listening points away from "nothing listening" and toward a routing/firewall block between the bridges. Check `sudo iptables -L -n -v` for the Docker `DOCKER-ISOLATION`/`FORWARD` chain drops between bridge interfaces. The clean fix is to put `report` on the *same* network as `db` (or attach it to both), not to hand-edit iptables.

</details>

## Common mistakes & troubleshooting

- **Blaming the firewall when it's routing (or vice versa).** A timeout can be either. Check `ip route get <dest>` for a sane path *and* the firewall counters before concluding. If there's no route at all, no firewall rule matters.
- **Expecting inbound to work because outbound does.** NAT is asymmetric by nature. "My container reaches the internet, so the internet should reach my container" is wrong — inbound needs an explicit port forward (DNAT).
- **Ignoring the direction and default policy of firewall chains.** A rule on `INPUT` doesn't affect `OUTPUT` or `FORWARD`. And a permissive-looking ruleset with a `policy DROP` at the end still blocks anything not explicitly allowed.
- **Overlapping/duplicate private subnets.** Two networks both using `192.168.1.0/24` can't route to each other cleanly — addresses are ambiguous. This bites when connecting home/VPN/cloud networks that all defaulted to the same range.
- **Reading refused as firewalled.** "Connection refused" is a RST from a reachable host with nothing listening — a firewall *drop* gives a timeout instead. Don't go rewriting firewall rules for a refused connection.
- **Forgetting stateful return traffic.** On a stateful firewall you usually only need a rule for the initiating direction; adding redundant return-path rules (or removing them and expecting breakage) reflects a misunderstanding of connection tracking.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. When a routing table has several matching routes, which one is used, and where does the default route (`0.0.0.0/0`) fall in that ordering?
2. Why can an internal host initiate a connection out through NAT but an external host can't initiate one in?
3. What's the difference in observed failure between a port blocked by a firewall drop and a port with nothing listening?
4. What does "stateful" mean for a firewall, and how does it change the rules you must write?
5. Your container reaches the internet fine but you can't connect to a server running inside it. Which mechanism explains this and what's the fix?
6. Two networks both use `192.168.1.0/24` and can't talk. What's the underlying problem?
7. How does `ip route get <dest>` help you separate a routing problem from a firewall problem?
8. What is DNAT (port forwarding) and how does it differ from the source NAT your router does by default?

<details><summary>Show answers</summary>

1. The most specific match wins (longest prefix). `0.0.0.0/0` is the least specific possible, so it only applies when no more-specific route matches — the catch-all for "everything else."
2. Outbound traffic creates a NAT mapping so replies can be translated back. An external host has no pre-existing mapping to reach, and the internal private address isn't routable on the internet, so inbound initiation has nowhere to land without an explicit forward.
3. A firewall drop gives no response, so the client *times out* (slow). Nothing listening gives an immediate RST, i.e. "connection refused" (fast).
4. Stateful means the firewall tracks connections, so allowing an outbound flow automatically permits its return traffic. You only need rules for the initiating direction rather than both directions.
5. NAT — it's outbound-friendly, inbound-hostile. The fix is an explicit port forward (DNAT) mapping an external `IP:port` to the internal container's `IP:port`.
6. Overlapping subnets: the same address range exists on both sides, so a destination like `192.168.1.10` is ambiguous and can't be routed unambiguously between them. Re-address one network.
7. It shows the exact route and next hop the kernel would use. If there's no route or a wrong gateway, it's a routing problem; if the route is sane but packets still don't arrive (and it times out), suspect the firewall.
8. DNAT rewrites the *destination* of inbound packets to redirect an external `IP:port` to an internal host — it enables inbound access. Default source NAT (masquerade/PAT) rewrites the *source* of outbound packets so many private hosts share one public IP.

</details>

## Next

[06 — Load balancing concepts](../06-load-balancing-concepts/README.md): now that packets can route, translate, and pass firewalls, learn how one virtual address is spread across many backend servers — and why that changes how you read failures.
