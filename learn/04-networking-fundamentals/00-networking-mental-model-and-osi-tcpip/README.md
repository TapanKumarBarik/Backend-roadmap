# Networking Mental Model & OSI/TCP/IP

## Why this matters

Networking looks like a pile of unrelated acronyms until you have a mental model to hang them on. That model is **layering**: every acronym you will learn (IP, TCP, DNS, HTTP, TLS) lives at a specific layer and does one job, trusting the layer below it to handle the rest. Once you can place a concept on the right layer and describe how a packet travels from your laptop to a server and back, the rest of this track becomes filling in detail rather than memorizing trivia.

## Concepts

### Why layering exists

Imagine you had to write one program that turned "load this web page" into electrical signals on a wire, all in a single blob of code: it would have to know about Wi-Fi radio timing, how to find a route across the internet, how to recover a lost chunk of data, and how to format a web request — all at once. Change the Wi-Fi to Ethernet and you'd rewrite the whole thing.

Networking avoids this by splitting the job into **layers**, each with a narrow contract. A lower layer offers a service to the layer above it and hides how it does it. The application layer says "deliver these bytes to that server" without knowing whether the path runs over fiber, Wi-Fi, or a phone's cellular modem. This is the same separation-of-concerns instinct you already use when you put business logic in one module and a database driver in another — the driver can change without touching the logic.

### The practical layer model

Textbooks show the seven-layer OSI model, but in day-to-day work only four layers matter. We will use this simplified stack (the TCP/IP model) top to bottom:

- **Application** — the thing you actually want: HTTP, DNS, SSH, TLS. Produces the meaningful message.
- **Transport** — TCP or UDP. Turns "deliver these bytes to a program on that host" into either a reliable ordered stream (TCP) or fire-and-forget datagrams (UDP), using **port numbers** to pick which program.
- **Internet / IP** — the IP layer. Gives every host an **IP address** and moves packets across networks toward that address, hop by hop, with no guarantee of delivery or order.
- **Link** — the local wire or radio: Ethernet, Wi-Fi. Moves a frame between two directly connected devices using hardware **MAC addresses**.

Keep OSI's seven layers as trivia (you will occasionally hear "that's a layer 3 problem" meaning IP, or "layer 7" meaning application). But reason with these four. A useful mnemonic for "which layer": *link* = same wire, *IP* = which machine anywhere, *transport* = which program on that machine and how reliably, *application* = what the message means.

### Encapsulation: envelopes inside envelopes

Each layer wraps the data from the layer above in its own **header**, like nesting envelopes. Your HTTP request (application) is placed inside a TCP segment (transport header adds source/destination ports), which is placed inside an IP packet (IP header adds source/destination IP addresses), which is placed inside an Ethernet frame (link header adds source/destination MAC addresses). The receiving host unwraps them in reverse: strip the frame, strip the IP header, strip the TCP header, hand the HTTP request to the web server.

The key insight: each layer on the receiving side only reads its own header and hands the rest up. The web server never looks at MAC addresses; the Ethernet card never looks at the HTTP verb. Terminology follows the layer — the same data is called a *frame* at the link layer, a *packet* at the IP layer, a *segment* (TCP) or *datagram* (UDP) at the transport layer, and a *message* at the application layer.

### How a packet travels: laptop to server and back

Suppose you run `curl http://example.com` on your laptop. Conceptually:

1. **Name to address.** The application first needs an IP address for `example.com`, so it asks DNS (module 02). DNS returns something like `93.184.216.34`.
2. **Build the request.** HTTP forms the request text. TCP wraps it, choosing a random high source port and destination port 80. IP wraps that, with your laptop's IP as source and `93.184.216.34` as destination.
3. **Leave the local network.** The destination is not on your local network, so your laptop sends the frame to your **default gateway** (your home router) using the router's MAC address. This is the link layer's job: get the packet to the next hop.
4. **Hop by hop across the internet.** Each **router** along the way looks only at the destination IP, consults its routing table, and forwards the packet one hop closer. No single router knows the whole path; each just knows "for that destination, send it this direction" (module 05). The MAC addresses change at every hop; the IP addresses stay the same end to end.
5. **Arrival.** The server's IP layer receives the packet, hands the segment to TCP, which hands the request to the web server listening on port 80.
6. **The return trip.** The server builds a response and sends it back to *your* IP and the source port you chose — following its own hop-by-hop path home, which may differ from the path out. Your laptop's TCP matches the response to the connection, and `curl` prints the page.

Every later module zooms into one step of this journey: addressing (step 3–4), DNS (step 1), TCP/UDP (step 2, 5), HTTP/TLS (step 2, 6), routing/NAT/firewalls (step 4).

### The TTL field: a hop counter that makes traceroute possible

Every IP packet header carries a **TTL (Time To Live)** field — a small number (commonly starting at 64 on Linux). Despite the name, it is not a clock; it is a **hop counter**. Every router that forwards the packet **decrements the TTL by one**. If a router decrements it to **zero**, it discards the packet and sends back an **ICMP "Time Exceeded"** message to the original sender. This exists as a safety valve: if a routing mistake created a loop, a packet would otherwise circle forever; TTL guarantees it dies after a bounded number of hops.

That safety mechanism is exactly what `traceroute` (and `tracepath`) exploit to map the path. To find the first router, `traceroute` sends a probe with **TTL=1**; the very first router decrements it to zero, drops it, and replies with Time Exceeded — revealing itself. To find the second router, it sends **TTL=2**, which dies one hop further along, and so on: TTL=3, TTL=4, until a probe finally reaches the destination. Each "Time Exceeded" reply names one hop, so counting up the TTL walks the route one router at a time. When you read `traceroute` output, remember each numbered line corresponds to a deliberately-chosen starting TTL. This is why `traceroute` shows the forward path only, and why a router that refuses to send ICMP shows up as `* * *`.

### Best-effort below, reliability above

One idea worth internalizing now: the IP layer is **best-effort**. It will try to deliver a packet but makes no promise — packets can be dropped, duplicated, delayed, or arrive out of order. That sounds broken, but it is deliberate: keeping the core simple and dumb is what let the internet scale. Reliability, when you need it, is added *on top* by TCP at the transport layer. UDP, by contrast, keeps the best-effort nature and lets the application deal with loss. This "smart edges, dumb core" design is why the same network carries both a file download that must be perfect and a video call that would rather drop a frame than pause.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `ip addr` | Shows this host's network interfaces and their IP addresses | `ip addr show eth0` |
| `ip route` | Shows the routing table, including the default gateway | `ip route` |
| `ip neigh` | Shows the ARP/neighbor table mapping IPs to MAC addresses on the local link | `ip neigh` |
| `ping` | Sends ICMP echo requests to test basic reachability | `ping -c 4 example.com` |
| `traceroute` | Shows the hop-by-hop path (routers) to a destination | `traceroute example.com` |
| `curl` | Makes an application-layer request (HTTP by default) | `curl -v http://example.com` |

Flag breakdowns:

- `ip addr show eth0` — `show` selects the display action; `eth0` limits output to that one interface instead of all of them.
- `ping -c 4 example.com` — `-c 4` sends exactly 4 packets then stops (otherwise `ping` runs until you press Ctrl-C); `example.com` is the target, resolved via DNS first.
- `curl -v http://example.com` — `-v` (verbose) prints the connection steps, the request headers it sent, and the response headers, letting you see the layers at work; the URL's `http://` selects the application protocol and implies port 80.

## Hands-on exercises

1. **See your own layers.** Run `ip addr`. Identify your loopback interface (`lo`, always `127.0.0.1`) and your main interface (often `eth0` in WSL2). Note its IP address and its MAC address (the `link/ether` line). Expected: `lo` shows `127.0.0.1/8`; `eth0` shows a private IP like `172.x.x.x/20` and a 6-byte MAC like `00:15:5d:...`.

2. **Find your gateway.** Run `ip route`. The line starting `default via <IP>` is your gateway — the next hop for anything not on your local network. Write down that IP. Expected: something like `default via 172.28.16.1 dev eth0`.

3. **Map the local link.** Run `ping -c 1 <your-gateway-IP>` then `ip neigh`. You should now see the gateway's IP paired with a MAC address and state `REACHABLE`. This is the link layer resolving an IP to hardware.

4. **Watch a packet's path and the TTL climb.** Run `traceroute example.com` (install with `sudo apt install traceroute` if missing) or `tracepath example.com`. Each numbered line is one router hop, and each corresponds to a probe sent with a starting TTL of 1, 2, 3, and so on — the hop count *is* the TTL that expired there. The first hop is usually your gateway, then several ISP routers, ending at or near the destination. Some hops show `* * *` when a router declines to send the ICMP Time Exceeded reply — that's normal. To make the TTL mechanism explicit, also run `ping -c 1 example.com` and look at the `ttl=` value in the reply: it's the *remaining* TTL when the packet arrived, so `64 - ttl` (or `128 - ttl`, `255 - ttl` depending on the sender's start) roughly tells you how many hops away the responder was.

5. **See encapsulation in words.** Run `curl -v http://example.com >/dev/null`. In the verbose output, identify: the DNS/connect step (`Trying 93.184...`), the TCP connection (`Connected to ... port 80`), and the application request (lines starting `>`) and response (lines starting `<`). Map each to a layer.

6. **Separate name resolution from connection.** Run `getent hosts example.com` to see just the address lookup (application-layer DNS, step 1), then `ping -c 2 <that-IP>` to test reachability of the address directly (IP layer, no DNS). Notice you split step 1 from steps 3–5.

7. **Reliable vs best-effort, felt.** Run `ping -c 20 example.com` and watch the summary line. Note the packet loss percentage and round-trip times. Expected: usually 0% loss on a good connection, times in the tens of milliseconds. This is IP being best-effort — occasional loss here is expected and normal, and no one retransmits it.

8. **Diagnose and fix: a made-up name.** Run `curl -v http://example.invalid`. It fails early with something like `Could not resolve host`. Decide *which layer* failed. It never reached TCP or IP — the failure is at step 1 (name resolution), not connectivity. Now confirm your diagnosis: `curl -v http://example.com` succeeds, proving the lower layers are fine and only the name was bad. The fix for a "could not resolve host" is always a naming/DNS problem, never a cable or firewall problem — recognizing the layer tells you where *not* to waste time.

## Independent challenge

Using only what this module covered, write a short prose account (no commands shown to a reader) of exactly what happens, layer by layer, when you run `curl http://example.com` on your laptop and get a page back — from the DNS lookup through the return of the HTTP response. Then actually run the relevant commands from this module to *verify* each claim you made (that a gateway is used, that multiple router hops exist, that a specific IP answered). This combines the mental model with hands-on observation; you are checking your story against reality.

<details><summary>Stuck? One hint</summary>

Build your narrative around the four layers in order, and remember the crucial asymmetry: the *IP addresses* (source and destination) stay the same for the whole trip end to end, but the *MAC addresses* change at every single hop because the link layer only ever moves a frame to the next directly-connected device. Use `traceroute` to prove the "many hops" claim and `ip neigh` to prove the "first hop is a MAC on my local link" claim.

</details>

## Common mistakes & troubleshooting

- **Confusing IP addresses with MAC addresses.** IP addresses are logical and end-to-end (they identify a host anywhere); MAC addresses are physical and hop-local (they only matter between two directly connected devices). If you catch yourself thinking a MAC address travels across the internet, stop — it doesn't.
- **Assuming the path out equals the path back.** Routing is per-packet and directional. `traceroute` shows only the forward path; the return path can differ entirely.
- **Treating `ping` failure as "the internet is down."** `ping` uses ICMP, which many hosts and firewalls deliberately drop. A host can serve web traffic perfectly while refusing to answer `ping`. Never conclude "unreachable" from ICMP alone.
- **Over-formalizing OSI.** Do not burn time memorizing "session" and "presentation" layers. For real troubleshooting, "which of link / IP / transport / application broke?" is the question that pays off.
- **Forgetting `lo`.** `127.0.0.1` (loopback) never leaves your machine. Reaching a service on loopback proves nothing about network connectivity to other hosts.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the four practical layers, top to bottom, and one protocol or job at each.
2. As a packet crosses the internet, which address stays the same end-to-end and which changes at every hop?
3. What does "best-effort" mean at the IP layer, and which layer adds reliability when needed?
4. When you unwrap received data, in what order do the layers strip their headers?
5. Why can a server serve web pages fine but not answer `ping`?
6. In `curl http://example.com`, which layer's job is turning `example.com` into an IP address?
7. What is a "default gateway" and when is it used?
8. What is the TTL field in the IP header, what happens when it reaches zero, and how does `traceroute` exploit this to map the path?

<details><summary>Show answers</summary>

1. Application (HTTP/DNS/SSH), Transport (TCP/UDP, ports, reliability), Internet/IP (IP addresses, routing between networks), Link (Ethernet/Wi-Fi, MAC addresses, same wire).
2. The IP addresses (source and destination) stay the same end-to-end; the MAC addresses change at every hop.
3. Best-effort means IP will attempt delivery but does not guarantee it — packets may be dropped, duplicated, delayed, or reordered. TCP (transport layer) adds reliability on top.
4. Reverse order of wrapping: strip the link/Ethernet frame, then the IP header, then the transport (TCP/UDP) header, then hand the application message up.
5. `ping` uses ICMP, which firewalls or the host may deliberately drop, while TCP port 80/443 web traffic is allowed. ICMP silence does not mean the host is down.
6. The application layer, via DNS (a separate lookup step before any TCP connection is made).
7. The router the host sends packets to when the destination is *not* on the local network — the exit point toward everywhere else.
8. TTL (Time To Live) is a hop counter in the IP header, decremented by 1 at every router. When it hits zero the router drops the packet and sends an ICMP "Time Exceeded" back to the sender (preventing infinite routing loops). `traceroute` sends probes with TTL=1, 2, 3… so each dies one hop further along and the resulting Time Exceeded replies reveal each router in turn.

</details>

## Next

[01 — IP addressing & subnetting](../01-ip-addressing-and-subnetting/README.md): now that you know packets travel by IP address, learn exactly how those addresses are structured, split into networks, and how a host decides "local or gateway?"
