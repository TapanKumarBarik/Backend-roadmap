# Capstone Project: Diagnose and Fix a Broken Multi-Host Network

## Why this matters

Reading about troubleshooting and doing it are different skills. This capstone forces you to combine everything — the layer model, addressing and subnets, DNS, TCP/ports, TLS, routing/NAT/firewalls, routing protocols, VPNs, load balancing, CDN/reverse proxy, WebSocket/gRPC, and the diagnostic method — against a scenario that is *deliberately broken in several independent ways at once*, the way real outages actually arrive. No solution is provided, only the broken scenario and a precise definition of "fixed." If you can work this end to end from memory, you are ready for the Azure networking track, where the exact same failure modes reappear wearing service names.

## The project

### Setup: build the lab

You will build a small multi-host network on your WSL2 Ubuntu machine using **either** approach you're comfortable with from your earlier tracks:

- **Option A — network namespaces (`ip netns`):** create three isolated namespaces connected by virtual ethernet (`veth`) pairs through a bridge, simulating three hosts on one or two subnets plus a "router" namespace between two subnets. This keeps everything in pure Linux networking with no extra software.
- **Option B — Docker containers on user-defined bridge networks:** create two user-defined bridge networks and place containers on them (a `web` frontend, an `api` backend, a `db`, and a small DNS or a load-balancer container), using the Docker networking you already know.

Either way, you need at minimum: two subnets, a routing point between them, a name-resolution mechanism (a hosts file or a small DNS), at least one HTTPS service with a certificate, and a firewall you can add rules to (`iptables`/`nft`). Build it working first, verify end-to-end connectivity with your module-07 ladder, and snapshot the working commands — you'll need a known-good reference.

### The break: introduce the faults

Once it works, introduce **the following chain of independent faults** (do this from a script a colleague "wrote," or have a partner set them, so you don't know which are active — that's more realistic and more valuable). Each is drawn directly from an earlier module:

1. **Wrong subnet mask (module 01):** one host is configured with a prefix too narrow (e.g. `/28` where the network is `/24`), so some addresses it should treat as local are wrongly sent to the gateway — or a peer on the same LAN becomes unreachable.
2. **Missing / wrong route (module 05):** the router namespace/host is missing a route to one of the subnets, or a host's default route points at the wrong next hop, so cross-subnet traffic dies.
3. **DNS misconfigured (module 02):** a service name resolves to the wrong address (a stale `/etc/hosts` entry or a bad record), so clients "connect" to the wrong place or fail to resolve entirely.
4. **Firewall blocking a port (module 05):** an `iptables` DROP rule silently blocks the API's port on one host, producing timeouts (not refusals) from clients.
5. **Service on the wrong interface (module 03):** one service is bound to `127.0.0.1` instead of `0.0.0.0`, so it works locally but is unreachable from other hosts.
6. **TLS certificate mismatch (module 04):** the HTTPS service presents a certificate whose name doesn't match the hostname clients use (or an expired/self-signed cert not in the client trust store), so TCP connects but the handshake fails validation.

### Your task

Using **only the troubleshooting toolkit and method from module 07** — `ip addr`/`ip route`, `ping`, `traceroute`/`tracepath`, `getent`/`dig`, `nc`, `ss`, `curl`, `openssl s_client`, and `tcpdump` — locate and fix every fault so the whole system works end to end. Work the layered ladder; for each fault, write down (a) the symptom you observed, (b) the manner of failure (refused/timeout/resolve-fail/cert-error) and what layer it pointed to, (c) the single command that confirmed the root cause, and (d) the fix. Do not fix by guessing and restarting — each fix must follow from a diagnosis. The written diagnosis log is as much the deliverable as the working system.

### Acceptance criteria — what "fixed" looks like

You are done when **all** of the following pass, and you can explain why each was failing:

- [ ] Every host has a correct IP and subnet mask; `ip route get <peer>` treats same-subnet peers as local (direct `dev`, no `via`) and other subnets via the correct router.
- [ ] Cross-subnet traffic works both directions: a host on subnet A can reach a host on subnet B and get replies (verified with `ping` and a real service test, not just one direction).
- [ ] Every service name resolves to the *correct* address from every client (`getent hosts <name>` matches the intended IP; `getent` and `dig`/the authoritative source agree).
- [ ] Every service is reachable on its port from the hosts that need it: `nc -zv <host> <port>` succeeds (no timeouts from firewall drops, no refusals from wrong-interface binds), and `ss -tlnp` on each server shows the service on `0.0.0.0` (or the correct interface), not stuck on `127.0.0.1`.
- [ ] The HTTPS service validates cleanly: `curl https://<name>/` succeeds *without* `-k`, and `openssl s_client -connect <host>:443 -servername <name>` reports `Verify return code: 0 (ok)` with matching names and valid dates.
- [ ] The full application path returns healthy HTTP: `curl -v https://<name>/<health-path>` returns a `2xx`, and if a load balancer is present, requests succeed consistently across repeated calls (no intermittent `502`/`504` from an unhealthy backend still in rotation).
- [ ] You have a written diagnosis log: for each of the (at least) six faults, the symptom, the failure manner, the confirming command, and the fix — proving each was diagnosed, not stumbled upon.

### Hints (not a solution)

<details><summary>Hint 1 — where to start</summary>

Don't fix in the order the faults are listed — fix in *layer* order, bottom-up, because a lower-layer fault masks everything above it. If addressing/routing is broken, no DNS, port, or TLS test above it is trustworthy yet. Run the module-07 ladder against one failing path and fix the *first* rung that fails before looking higher.

</details>

<details><summary>Hint 2 — let the failure manner narrow it</summary>

Before deep analysis, read the manner: *resolve-fail* → DNS (fault 3); *timeout* on a port → firewall drop or routing (faults 2, 4); *refused* on a port → nothing listening / wrong interface (fault 5); *cert error after TCP connects* → TLS (fault 6); a same-LAN peer unreachable while others work → suspect the subnet mask (fault 1). The error text often names the fault before you run a second command.

</details>

<details><summary>Hint 3 — the tools that isolate each layer</summary>

`ip route get <dest>` separates "no route" from everything else. `getent hosts` vs `dig` separates a hosts-file override from real DNS. `ss -tlnp` on the server distinguishes `127.0.0.1` (wrong interface) from `0.0.0.0`. `nc -zv` with `-w 3` makes a firewall timeout fail fast and legibly, and *refused vs timeout* separates fault 5 from fault 4. `openssl s_client -servername ...` shows the cert's names/dates for fault 6. `traceroute` localizes where cross-subnet routing dies for fault 2.

</details>

<details><summary>Hint 4 — don't trust one direction or one host</summary>

Cross-subnet and NAT problems are often asymmetric — test both directions and from more than one host. "Works from the router but not from the client," or "resolves right on host A but wrong on host B," is the difference that pinpoints the fault. Change one variable at a time.

</details>

### Before you move on

Do this project once with the faults set for you, then — a few days later — rebuild the lab, re-introduce a *different* mix of the same faults, and diagnose it again **from memory**, without rereading module 07. The goal isn't to recall a specific answer but to make the layered ladder automatic, because the Azure networking track next is largely these same failures (wrong subnet, missing route, blocked port, broken name resolution, cert mismatch, unhealthy backend) expressed as VNets, route tables, NSGs, private DNS zones, and load balancer health probes. If the method is second nature here, the cloud version will feel like renaming what you already know.

## Next

You've completed Track 1. Continue to the **Azure networking** track, where these platform-agnostic fundamentals become concrete Azure constructs — VNets and subnets, network security groups, route tables and NAT gateways, private DNS, and managed load balancers — and the diagnostic instincts you built here transfer directly.
