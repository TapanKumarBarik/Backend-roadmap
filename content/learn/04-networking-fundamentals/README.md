# Track 4: Networking Fundamentals

This track teaches computer networking from first principles: how data moves from one machine to another, how addresses and names work, how the protocols you use every day (TCP, UDP, HTTP, TLS, DNS) actually behave, and how to diagnose it all when something breaks.

It assumes you are comfortable in a Linux shell — you finished the Linux, Docker, and Kubernetes tracks, you can write a bash loop, and you already use `ip`, `curl`, and friends without looking them up. It does **not** assume any prior networking theory, and it does **not** assume AKS — that track comes later, after this curriculum's networking and Container Apps tracks.

This track is deliberately **Azure-agnostic**. Everything here is pure networking concept and protocol behavior that applies to any cloud, any datacenter, and your home router. Azure-specific mechanics (VNets, NSGs, private endpoints, load balancers as a service) live in the next track. Learn the fundamentals here so that the Azure abstractions later feel like named conveniences rather than magic.

All hands-on work runs in your **WSL2 Ubuntu terminal** using standard tools: `ip`, `ping`, `traceroute`/`tracepath`, `dig`, `curl`, `openssl s_client`, `nc`, `ss`, and `tcpdump`.

## Modules

| # | Module | What it covers | Est. time |
|---|--------|----------------|-----------|
| 00 | [Networking mental model & OSI/TCP/IP](00-networking-mental-model-and-osi-tcpip/README.md) | Why layering exists; the practical layer model; how a packet travels laptop → server → back | 1.5–2 h |
| 01 | [IP addressing & subnetting](01-ip-addressing-and-subnetting/README.md) | IPv4/IPv6 addresses, CIDR, subnet masks, gateways, public vs private | 2.5–3 h |
| 02 | [DNS fundamentals](02-dns-fundamentals/README.md) | Names to addresses, resolver chain, record types, caching and TTL | 2–2.5 h |
| 03 | [TCP, UDP, ports & sockets](03-tcp-udp-ports-and-sockets/README.md) | Reliable vs unreliable transport, the handshake, ports, sockets, connection states | 2.5–3 h |
| 04 | [HTTP, HTTPS & TLS fundamentals](04-http-https-and-tls-fundamentals/README.md) | HTTP requests/responses, the TLS handshake, certificates, trust chains | 2.5–3 h |
| 05 | [Routing, NAT & firewalls](05-routing-nat-and-firewalls/README.md) | How packets choose a path, address translation, packet filtering | 2.5–3 h |
| 06 | [Load balancing concepts](06-load-balancing-concepts/README.md) | L4 vs L7, algorithms, health checks, session persistence | 2–2.5 h |
| 07 | [Network troubleshooting toolkit](07-network-troubleshooting-toolkit/README.md) | A repeatable diagnostic method and the tools that support it | 2.5–3 h |
| 08 | [Routing protocols](08-routing-protocols/README.md) | Static vs dynamic routing, IGP vs EGP, distance-vector vs link-state, RIP, OSPF, BGP, administrative distance | 2.5–3 h |
| 09 | [VPN & IPSec](09-vpn-and-ipsec/README.md) | Tunneling, site-to-site vs remote-access VPNs, AH vs ESP, transport vs tunnel mode, IKE, SSL VPNs | 2.5–3 h |
| 10 | [CDN & reverse proxy](10-cdn-and-reverse-proxy/README.md) | Forward vs reverse proxy, CDN edge caching, cache hit/miss, cache invalidation, reading failures through the stack | 2–2.5 h |
| 11 | [WebSocket & gRPC](11-websocket-and-grpc/README.md) | Beyond request/response: persistent two-way connections, HTTP/2-based RPC, streaming, and how load balancing/proxies/timeouts change | 2.5–3 h |
| 12 | [Capstone project](12-capstone-project/README.md) | Diagnose and fix a chain of connectivity failures in a multi-host lab | 3–4 h |

Total: roughly 30–38 hours of focused work.

## How to use this track

Work the modules in order. Each one builds strictly on the ones before it — subnetting assumes the mental model, DNS assumes IP addressing, TLS assumes TCP, and so on. Do the hands-on exercises in your own terminal rather than reading them; networking is a skill of the fingers as much as the head. Attempt every checkpoint quiz and independent challenge before revealing answers.

Start here: [00 — Networking mental model & OSI/TCP/IP](00-networking-mental-model-and-osi-tcpip/README.md).

[Back to curriculum](../README.md)

---

Next track: **Azure networking**, where these fundamentals become VNets, subnets, NSGs, route tables, and managed load balancers.
