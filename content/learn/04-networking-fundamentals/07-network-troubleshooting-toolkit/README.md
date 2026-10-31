# Network Troubleshooting Toolkit

## Why this matters

Everything in this track converges here. Real network problems don't announce which layer they're on — you get "it doesn't work," and your job is to find where, fast, without thrashing. A repeatable, layer-by-layer method turns a vague outage into a bounded search: prove each layer works from the bottom up (or bisect), and the first failing layer tells you exactly where the fault is and, just as importantly, where it *isn't*. This method is what you'll carry into the Azure track, where the same failures wear cloud-service names.

## Concepts

### The layered diagnostic method

The core discipline is to **test one layer at a time, in order**, using the mental model from module 00. Ask, and answer with a command, each question bottom-up:

1. **Link/local:** does this host have a correct IP and mask? (`ip addr`, module 01)
2. **IP/routing:** is there a route to the destination, and can packets reach it? (`ip route get`, `ping`, `traceroute`, modules 01/05)
3. **DNS:** does the name resolve to the right address? (`getent hosts`, `dig`, module 02)
4. **Transport:** does the TCP handshake to the target port complete? (`nc -zv`, `ss`, module 03)
5. **TLS:** does the certificate validate? (`openssl s_client`, `curl -v`, module 04)
6. **Application:** does the service return the right HTTP response? (`curl -v`, status codes, modules 04/06)

The power of ordering is that a pass at a lower layer **rules out** everything below when a higher layer fails, and a failure at a lower layer means you needn't touch anything above it yet. "Could not resolve host" (layer 3 above) means stop checking firewalls; "connection refused" means stop checking DNS. Half of troubleshooting speed is knowing which layers to *ignore*.

### Bisecting instead of scanning

You don't always have to start at the bottom. When layers are many, **bisect**: test the middle first and halve the search space. Can you resolve the name? Yes → DNS and below are probably fine, focus above. Does TCP connect but TLS fail? Then everything through transport works; it's a cert problem. Each test should ideally eliminate about half the remaining possibilities. Pair this with **change the one thing that varies**: if it works from host A but not host B, or works to IP but not by name, the difference *is* the clue — resolve name vs address, one subnet vs another, one backend vs the VIP (module 06).

### Refused vs timeout vs reset: reading the failure

The *manner* of failure is diagnostic before you run anything else (this recurs across modules 03, 04, 05):

- **Connection refused (fast, RST):** host reachable, nothing listening on that port. Look at the service, not the network.
- **Connection timed out (slow, silence):** packets dropped — firewall, wrong/dead address, or missing route. Look at routing/firewall, not the app.
- **Could not resolve host:** DNS/name step failed before any packet. Look at resolution only.
- **TLS/certificate error after TCP connects:** transport is fine; it's a cert validation problem.
- **HTTP 4xx vs 5xx:** 4xx your request, 5xx the server/upstream (a 502/504 points at a load balancer→backend hop).

Training yourself to read these before reaching for `tcpdump` saves enormous time — the error message already names the layer.

### TTL and traceroute: locating *where* a path breaks

`traceroute`/`tracepath` are your path-mapping tools, and they work by the IP **TTL** mechanism from module 00: probes are sent with TTL=1, 2, 3, …, each expiring one hop further and eliciting an ICMP "Time Exceeded" that names that router, so the output is the ordered list of hops toward the destination. For troubleshooting this matters in two ways. First, *where* the trace stops advancing (the last hop that replies before a run of `* * *` that never reaches the target) localizes the break to a point in the path — often the boundary between your network and the next. Second, watching the TTL/hop count grow lets you confirm packets are progressing at all. Remember the caveats: many routers rate-limit or suppress ICMP, so `* * *` for a middle hop that later resumes is normal and not itself a fault; only a trace that *stops and never resumes* short of the destination is a real signal. Because routing can be asymmetric (module 05), a trace shows only the forward path.

### Confirming with a packet capture

When higher-level tools disagree with your mental model, drop to `tcpdump` and watch the actual packets — the ground truth. A capture answers questions no summary can: did the SYN even leave this host? did a SYN-ACK come back or only silence (firewall drop)? is the app sending a RST? are DNS queries going out and answers returning? Capture narrowly (filter by host and port) so you can read it, and correlate what you see against the handshake and flags from module 03. `tcpdump` is the tool of last resort not because it's hard but because the layered method above usually pinpoints the layer first — you reach for the capture to *confirm* a hypothesis, not to go fishing.

### Working the problem: a checklist you can run

A pragmatic sequence for "I can't reach service X":
resolve the name (`getent hosts X`) → sanity-check the resulting IP against expected subnet (module 01) → reach the IP (`ping`, and `traceroute` if it fails, to see where) → test the port (`nc -zv X port`, reading refused vs timeout) → if HTTPS, validate the cert (`openssl s_client`/`curl -v`) → check the HTTP response (`curl -v`, status class) → and only if something still doesn't add up, capture with `tcpdump`. Each step names the layer, and the first failing step is your answer.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `ip addr` / `ip route get` | Layer 1–3: address, mask, and chosen route to a destination | `ip route get 10.0.0.9` |
| `ping` | Layer 3 reachability via ICMP | `ping -c 3 example.com` |
| `traceroute` / `tracepath` | Maps the hop-by-hop path via TTL; localizes where a path breaks | `traceroute -n example.com` |
| `getent hosts` / `dig` | Layer 7 name resolution (app-view vs raw DNS) | `getent hosts api.example` |
| `nc -zv` | Layer 4 port reachability; refused vs timeout | `nc -zv api.example 443 -w 3` |
| `ss -tlnp` | Local listening sockets and states | `ss -tlnp` |
| `curl -v` | Layers 4–7 in one shot: connect, TLS, request, response | `curl -v https://api.example/health` |
| `openssl s_client` | Layer 6 TLS handshake and certificate detail | `openssl s_client -connect api.example:443 -servername api.example` |
| `tcpdump` | Ground-truth packet capture to confirm a hypothesis | `sudo tcpdump -n -i any host api.example and tcp port 443` |

Flag breakdowns:

- `traceroute -n example.com` — `-n` numeric output (no reverse DNS per hop), so a slow/broken DNS doesn't stall or confuse the trace; each numbered line is one TTL step revealing one router.
- `nc -zv api.example 443 -w 3` — `-z` scan without sending data, `-v` verbose result, `-w 3` cap the wait at 3 seconds so a firewalled (timing-out) port fails quickly and legibly instead of hanging.
- `curl -v https://api.example/health` — `-v` surfaces every layer in order (DNS/connect, TLS handshake and cert, request `>`, response `<`), making it the single best first command for an HTTPS problem.
- `sudo tcpdump -n -i any host api.example and tcp port 443` — `-n` numeric; `-i any` all interfaces; the filter `host ... and tcp port 443` restricts capture to the relevant conversation so the output is readable. Add `-c 20` to stop after 20 packets.

## Hands-on exercises

1. **Run the full ladder once, cleanly.** Pick a working target (`example.com`) and run, in order: `getent hosts example.com`, `ip route get <that-IP>`, `ping -c2 <that-IP>`, `nc -zv example.com 443 -w3`, `curl -sI https://example.com`. Note how each confirms one layer. Expected: all pass — this is your baseline "healthy" trace.

2. **Watch TTL climb hop by hop.** Run `traceroute -n example.com` (or `tracepath example.com`). Observe the hop numbers increasing (1, 2, 3, …) — each is a probe whose TTL expired one router further along. Then run `ping -c1 example.com` and read the `ttl=` in the reply (the *remaining* TTL). Expected: a sequence of hops ending near the target; some middle hops may be `* * *` (ICMP suppressed) yet the trace still reaches the end.

3. **Localize a break with traceroute.** Run `traceroute -n 10.255.255.1` (an unreachable private address). Watch it advance a few hops (your gateway, maybe upstream) then stall on `* * *` and never arrive. Expected: the last replying hop tells you how far the packet got before the path breaks — that boundary is where you'd investigate.

4. **Read failure manner instantly.** Run each and name the layer from the error alone before analyzing: `curl -v http://example.invalid` (resolve fail), `curl -v --connect-timeout 3 http://127.0.0.1:9999` (refused), `curl -v --connect-timeout 3 http://10.255.255.1:8080` (timeout). Expected: three distinct failure manners → three different layers, no deep analysis needed.

5. **Bisect a made-up problem.** Given "can't reach `https://example.com`," decide your *first* test to eliminate the most possibilities, then justify it. Run `curl -v https://example.com` and note it collapses DNS+TCP+TLS+HTTP into one output you can read top to bottom to find the first failing line. Expected: you can point at the exact line where a failure would first appear.

6. **Capture a healthy handshake.** In terminal A: `sudo tcpdump -n -i any host example.com and tcp port 443 -c 12`. In terminal B: `curl -sI https://example.com >/dev/null`. In A, identify SYN `[S]`, SYN-ACK `[S.]`, ACK `[.]`, then TLS data. Expected: the handshake precedes any encrypted payload — ground truth for module 03/04.

7. **Compare app-view vs raw DNS.** Run `getent hosts example.com` and `dig +short example.com`. When these ever disagree, `/etc/hosts` is overriding DNS (module 02). Expected: they agree now; you know how to spot when they won't.

8. **Diagnose and fix (integrated): a service you can't reach.** Create a layered failure and walk the ladder. Start a listener on the wrong interface and firewall a port: `nc -l 127.0.0.1 8080` in one terminal. From another, run the ladder against `<eth0-IP>:8080`: `getent hosts localhost` (resolves), `ping -c1 <eth0-IP>` (reachable), `nc -zv <eth0-IP> 8080 -w3` (**fails** — refused, because the listener is bound to loopback only). `ss -tlnp | grep 8080` reveals `127.0.0.1:8080`, not `0.0.0.0:8080`. **Fix:** rebind — `nc -l 0.0.0.0 8080` — and the port test passes. The method, not the memorized answer, is the point: each rung either passed (rule it out) or failed (stop and fix there).

9. **Diagnose and fix: DNS-then-TLS chain.** Consider a report "our HTTPS API is broken." Run `curl -v https://expired.badssl.com`. The ladder shows DNS resolves, TCP connects (`Connected to ...`), and the failure is the *certificate* (`certificate has expired`) — so every layer through transport is proven fine and the fix lives with the cert owner (module 04), not the network. Contrast by running the ladder against `https://example.com`, which passes all rungs. Expected: you can state precisely which rung failed and therefore who owns the fix.

## Independent challenge

You're handed a fresh, unfamiliar failure: "the monitoring dashboard at `https://dash.internal.example` shows blank and sometimes returns 504, but only for people in the London office." With no commands given, design the complete diagnostic plan — the exact sequence of layers you'd test, what a pass/fail at each would tell you, and where the "only London" and "sometimes 504" clues steer you. You must combine this module's method with **module 06 (load balancing)**: a `504` and an intermittent, location-correlated symptom should immediately make you think about health checks, a specific unhealthy backend, and the balancer→backend hop, not just raw connectivity.

<details><summary>Stuck? One hint</summary>

Walk the ladder but let the two clues bias your bisection. "Only London" is a *what varies* signal (module 07 method) — compare `getent hosts dash.internal.example` and `traceroute` from a London host vs a working one; a different resolved IP or a path that breaks at a specific hop localizes it fast. "Sometimes 504" is a module-06 signal: a gateway timeout on some requests but not others suggests one unhealthy backend still in rotation behind the balancer, so hit backends directly with `curl --resolve` and compare status/timing. Confirm whichever hypothesis with a narrow `tcpdump` only if the higher-level tools leave doubt.

</details>

## Common mistakes & troubleshooting

- **Jumping straight to `tcpdump`.** The capture is for *confirming* a hypothesis, not forming one. The error manner and the layered ladder usually name the layer first, in seconds.
- **Skipping DNS.** Half of "it's down" reports are name-resolution problems. Always confirm `getent hosts` returns the *expected* address before testing ports or blaming the server.
- **Reading `* * *` in traceroute as failure.** Middle hops routinely suppress ICMP. Only a trace that stalls and *never* reaches the destination localizes a break; a gap that later resumes is noise.
- **Ignoring the failure manner.** Refused, timeout, resolve-fail, and cert-error each point at a different layer *before* you investigate. Rushing past the error text throws away the biggest clue.
- **Testing only through the front door.** If a load balancer is involved, test backends directly (`curl --resolve`) — the VIP hides which backend is bad (module 06).
- **Not changing one variable at a time.** "Works from A not B" or "works by IP not name" is the answer in disguise. Hold everything constant except the suspected variable.
- **Forgetting asymmetric routing.** `traceroute` shows only the outbound path; a problem on the return path won't appear in it.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why does testing layers in order (bottom-up) make troubleshooting faster? What does a *pass* at a lower layer let you do?
2. Match each failure manner to the layer it implicates: "could not resolve host," "connection refused," "connection timed out," "certificate has expired."
3. What is the single most useful first command for an HTTPS problem, and why does it bisect so well?
4. In `traceroute` output, what does a run of `* * *` in the *middle* of the trace mean versus a trace that stalls and never reaches the destination?
5. Explain the mechanism by which `traceroute` maps hops, in terms of the IP TTL field.
6. You can `nc -zv host 443` but `curl https://host` fails. Which layer is proven fine and which is suspect?
7. When should you reach for `tcpdump`, and why is it usually a tool of confirmation rather than discovery?
8. "Works from host A but not host B." Why is that difference itself the most valuable clue, and what's your next step?

<details><summary>Show answers</summary>

1. Because a failure at a lower layer makes every test above it meaningless, and a pass at a lower layer rules out everything below it. A pass lets you *stop checking* those layers and focus the search upward — half of speed is knowing which layers to ignore.
2. "Could not resolve host" → DNS/name resolution (application, before any packet). "Connection refused" → transport: host reachable, nothing listening. "Connection timed out" → routing/firewall: packets dropped or no route. "Certificate has expired" → TLS: transport is fine, certificate validation failed.
3. `curl -v https://host` — it exercises DNS, TCP, TLS, and HTTP in one ordered, readable output, so the first failing line names the layer and eliminates roughly half the possibilities at once.
4. Middle `* * *` usually means those routers suppress/rate-limit ICMP Time Exceeded but still forward — normal noise. A trace that stalls and never reaches the destination localizes a real break to just past the last replying hop.
5. `traceroute` sends probes with TTL=1, 2, 3, …; each router decrements TTL and, at zero, drops the packet and returns an ICMP Time Exceeded. So the probe with TTL=n expires at the nth router, which reveals itself — walking the TTL up maps the path one hop at a time.
6. Transport (TCP to 443) is proven fine; the suspect is TLS/certificate validation (or TLS version/cipher/SNI). Inspect the cert with `curl -v` or `openssl s_client -servername`.
7. Reach for `tcpdump` only after the layered ladder and failure manner have produced a hypothesis you need to confirm (e.g., "did the SYN even leave?" "is the server sending a RST?"). It's confirmation because starting there means reading raw packets without a theory — slow and noisy — when the error text and ladder usually name the layer first.
8. Because the difference between the working and failing case *is* the fault, in disguise. Next step: hold everything else constant and compare the one variable — resolve the name on both (`getent hosts`), check routes/paths (`traceroute`), or test the same backend from both — to isolate what actually differs.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these. These deliberately mix concepts across modules 04–07.

1. A client gets `curl: (60) certificate ... expired` for `https://api.example`. Which layers (04's stack) are already proven working the moment you see that message, and who owns the fix?
2. Requests to a VIP fail with `504` about one time in three. Combine module 06 and 07: what does the ratio suggest, how do you confirm which backend is at fault, and why is a `504` (not `404`) the deciding clue?
3. `traceroute -n dest` advances to hop 4 then shows `* * *` for the rest and never arrives. Give two different explanations and the follow-up test that distinguishes "path genuinely breaks after hop 4" from "hops just suppress ICMP."
4. You can `nc -zv host 443` successfully but `curl https://host` fails. Name the two most likely causes and the single command that tells them apart.
5. An L7 load balancer terminates TLS and talks plain HTTP to backends. A backend returns `500`. Explain what status the client sees and why debugging the backend's certificate would be a waste of time.
6. Order these into a bisection plan for "can't reach `https://svc.example`," and justify why your first test eliminates the most: `openssl s_client`, `getent hosts`, `nc -zv ... 443`, `curl -v`.
7. Explain, tying together IP TTL (module 00/05) and the troubleshooting use of traceroute, why the hop count in traceroute output *is* the TTL that expired at each router — and why the return path might differ from what you see.
8. A health check is a plain TCP connect to port 8080. A backend's app is deadlocked but its socket still accepts connections. Predict what clients experience and how you'd redesign the check (module 06) so the balancer evicts that backend.

<details><summary>Show answers</summary>

1. DNS resolved, TCP connected, and the TLS handshake got far enough to receive the certificate — so link, IP, transport, and DNS are all fine; only certificate *validation* failed. The fix is the certificate (renew it), owned by the server operator, not anything on the client or network.
2. Roughly one-in-three failures across a pool suggests one unhealthy backend out of ~three still in rotation. Confirm by hitting each backend directly with `curl --resolve` and comparing status/timing. A `504` (gateway timeout) means the balancer couldn't get a timely response from a backend — a backend/upstream problem — whereas a `404` would be a client/request error, so the 504 is what points you at the balancer→backend hop.
3. (a) The path genuinely breaks after hop 4 (no route / firewall / dead segment beyond it); (b) hops 5+ simply suppress ICMP Time Exceeded but forwarding still works. Distinguish by testing the actual destination service directly — `nc -zv dest <port>` or `curl`: if the service responds, forwarding works and the `* * *` was just ICMP suppression; if it also times out, the path really breaks past hop 4.
4. TLS/certificate validation failure or a TLS-version/cipher/SNI mismatch — transport is fine (443 reachable) but the handshake or cert check fails. `curl -v https://host` (or `openssl s_client -connect host:443 -servername host`) shows exactly which: the cert dates/names/issuer or the negotiated protocol.
5. The client sees `502` (or the backend's error surfaced by the LB) — a gateway/upstream error. Because the L7 balancer terminated TLS and speaks plain HTTP to the backend, the backend isn't presenting the public certificate at all, so its cert is irrelevant to a `500`; debug the backend app/logs, not its TLS.
6. First run `curl -v https://svc.example` — it exercises DNS, TCP, TLS, and HTTP in one readable, ordered output, so the first failing line names the layer and eliminates the most at once. If it's ambiguous, drop to the specific tools: `getent hosts` (DNS), `nc -zv 443` (transport), `openssl s_client` (TLS). Starting with the all-in-one bisects fastest.
7. traceroute sends probes with increasing TTL (1, 2, 3, …); each router decrements TTL and, when it hits zero, drops the packet and returns an ICMP Time Exceeded — so the hop that replies at TTL=n is exactly the nth router, making the hop count equal to the TTL that expired there. The return path can differ because routing is per-packet and directional (asymmetric), so the ICMP replies (and the real return traffic) may traverse different routers than the forward probes.
8. Clients get connections accepted but then hang/timeout (or 504 through a balancer) because the deadlocked app never responds, yet the TCP-only check keeps passing and the balancer keeps sending traffic. Redesign the check as an L7 request to a `/healthz` endpoint that returns 200 only when the app is truly serving (ideally checking key dependencies), so a deadlocked backend fails the check and is pulled from rotation.

</details>

## Next

[08 — Routing protocols](../08-routing-protocols/README.md): module 05 covered forwarding and static routes; now see how routers learn routes from *each other* automatically — RIP, OSPF, and BGP — and add that to your diagnostic toolkit.
