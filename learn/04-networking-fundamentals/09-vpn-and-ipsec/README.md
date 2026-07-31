# VPN & IPSec

## Why this matters

Module 05's firewalls decide what's allowed through, and module 04's TLS
protects one connection's payload. Neither solves a different, common
need: connecting two entire private networks — your office LAN and your
cloud VNet, or a remote employee's laptop and your company network —
*as if* they were on the same private network, across the public
internet, where anyone in between could otherwise read or tamper with
every packet. A **VPN (Virtual Private Network)** is that connection: an
encrypted tunnel carrying private traffic across an untrusted network.
This is also directly the mechanism behind Azure's VPN Gateway and
every "connect on-prem to the cloud" story in the next track — understand
it here as pure networking, and the Azure version is just this with a
managed control plane.

## Concepts

### What a VPN actually does: tunneling

A VPN's core trick is **tunneling**: taking an entire original packet
(source, destination, payload — often using private addresses that
aren't routable on the internet at all, exactly module 01's private
ranges) and wrapping it inside a *new* outer packet whose source and
destination are the two VPN endpoints' *public* addresses. The outer
packet is what actually traverses the internet; at the far end, the VPN
device strips the outer wrapping and delivers the original inner packet
onto the remote private network. From either private network's point of
view, the other network is just... there, reachable, the way module 05
described a directly-connected subnet — the tunnel makes physically
distant networks behave as logically adjacent ones. Encryption is a
separate, additional property layered on top of tunneling (you can tunnel
without encrypting — GRE does this — but a VPN specifically adds
encryption so the tunneled traffic is unreadable in transit).

### Site-to-site vs remote-access VPNs

- **Site-to-site VPN** — connects two entire networks (your office and
  your cloud VNet, or two office branches) via VPN devices/gateways at
  each site. Every host on either private network can reach every host on
  the other, transparently, with no per-device VPN client needed — the
  tunnel is between the *networks*, not between individual machines.
- **Remote-access VPN** — connects a single device (an employee's laptop)
  into a private network. The device runs VPN client software, connects
  to a VPN gateway/concentrator, and — once connected — behaves as if
  it's physically on that private network, able to reach internal-only
  resources it couldn't reach from the open internet.

Both use the same underlying tunneling/encryption mechanisms; the
difference is entirely about *what's on each end of the tunnel* — a
whole network's gateway device, or one client machine.

### IPSec: the standard framework for encrypting IP traffic

**IPSec (IP Security)** isn't one protocol but a *suite* — a standard,
widely-implemented framework most site-to-site VPNs (and many
remote-access ones) are built on. Two protocols within it matter most:

- **AH (Authentication Header)** — guarantees the packet wasn't tampered
  with and really came from who it claims (integrity + authentication),
  but does **not** encrypt the payload — the data itself is still
  readable in transit. Rarely used alone in practice, because "tamper-
  proof but readable" isn't what most VPN use cases actually need.
- **ESP (Encapsulating Security Payload)** — provides integrity
  *and* authentication *and* encryption (confidentiality) — the payload
  is actually unreadable to anyone intercepting it. This is what almost
  every real-world IPSec VPN uses; AH-only deployments are uncommon.

IPSec also runs in two **modes**, which decide *how much* of the original
packet gets wrapped:

- **Transport mode** — encrypts only the payload of the original IP
  packet, leaving the original IP header exposed. Used for host-to-host
  protection where both ends are the actual traffic's real
  source/destination — less common for VPNs specifically.
- **Tunnel mode** — encrypts the *entire* original packet (header
  included) and wraps it inside a brand-new outer IP packet with the VPN
  gateways' own addresses. This is what site-to-site VPNs use: it's what
  lets private, non-routable inner addresses traverse the public internet
  safely inside a routable outer packet, exactly the tunneling behavior
  described above.

### IKE: how two devices agree on encryption without a pre-shared secret sent in the clear

Before ESP can encrypt anything, both VPN endpoints need to agree on
encryption keys and algorithms — and they have to do that negotiation
*itself* securely, without ever transmitting the actual shared key in the
open. **IKE (Internet Key Exchange)** is the protocol that does this,
typically in two phases: **Phase 1** establishes a secure, authenticated
channel between the two endpoints themselves (using Diffie-Hellman key
exchange — the same category of "agree on a shared secret over a public
channel without ever transmitting the secret itself" trick TLS's handshake
uses in module 04); **Phase 2** uses that now-secure channel to negotiate
the actual IPSec (ESP) parameters — the keys and algorithms that will
encrypt the real tunneled traffic. The practical takeaway: a VPN
connection has two distinct negotiation layers (IKE, then IPSec/ESP) with
their own separate configuration and their own separate ways to fail —
"IKE Phase 1 failed" and "Phase 2/IPSec failed" are genuinely different
troubleshooting situations, not interchangeable "the VPN is down."

### SSL/TLS VPNs: the browser-friendly alternative

Not every VPN uses IPSec. **SSL VPNs** (sometimes marketed as "TLS VPN")
use the same TLS mechanism from module 04 instead of IPSec's separate
IKE/ESP machinery — commonly delivered as a browser-accessible portal
(clientless, reaching specific internal web apps through a gateway) or a
lightweight client that tunnels traffic over a standard TLS connection.
The practical advantage: TLS traffic on port 443 passes through far more
restrictive firewalls/proxies than IPSec's protocols and ports typically
do, since it's indistinguishable at the network level from ordinary HTTPS
traffic — a real, common reason organizations choose SSL VPN specifically
for remote-access scenarios where users connect from unpredictable,
locked-down networks (hotel wifi, a client's corporate firewall).

### The classic VPN failure mode: overlapping private ranges

Module 05 already warned about this in passing; it's worth stating
directly here because VPNs are where it bites hardest. Two private
networks connected by a VPN — say, your office (`192.168.1.0/24`) and a
partner's office (also, coincidentally, `192.168.1.0/24`) — cannot be
unambiguously routed once tunneled together: a packet destined for
`192.168.1.50` could mean either network's host. This is not a VPN
misconfiguration to "fix" with a setting — it requires re-addressing one
of the two networks (or, in some products, NAT applied specifically at
the VPN boundary to translate the overlap away) before the tunnel can
work correctly. Always check both sides' address ranges *before* building
a site-to-site VPN, not after it mysteriously misroutes.

## Command reference

This module's hands-on work uses **strongSwan** (a widely-used open-source
IPSec implementation) on WSL2 Ubuntu, connecting two network namespaces
the way earlier modules built small labs.

| Command | What it does | Example |
|---------|--------------|---------|
| `sudo apt install strongswan` | Installs the strongSwan IPSec daemon and `ipsec` CLI | `sudo apt install strongswan` |
| `sudo ipsec status` | Shows current IPSec connection states | `sudo ipsec status` |
| `sudo ipsec statusall` | Detailed status including IKE/ESP algorithm negotiation | `sudo ipsec statusall` |
| `sudo ipsec up <name>` | Manually brings up a configured tunnel | `sudo ipsec up site-to-site` |
| `sudo ipsec down <name>` | Tears down a tunnel | `sudo ipsec down site-to-site` |
| `sudo tcpdump -i any esp` | Captures ESP traffic to confirm packets are actually encrypted on the wire | `sudo tcpdump -i eth0 esp` |
| `ip xfrm state` | Shows the kernel's active IPSec security associations (keys/algorithms in use) | `ip xfrm state` |

Flag/output notes:

- `sudo ipsec statusall` output distinguishes IKE_SA (the Phase 1
  channel) from CHILD_SA (the Phase 2/ESP tunnel) — if a tunnel isn't
  passing traffic, this is the first place to see *which* phase actually
  failed, rather than treating "the VPN is down" as one undifferentiated
  problem.
- `sudo tcpdump -i any esp` filters specifically for ESP-protocol
  packets — seeing them on the wire (and being unable to read their
  contents, unlike plain IP traffic) is the direct, observable proof
  that tunnel-mode encryption is actually happening, not just configured.
- `ip xfrm state` is the kernel's own view of active IPSec security
  associations — useful to confirm the negotiated encryption algorithm
  matches what you configured, and that a security association actually
  exists at all (an empty result means no active tunnel, regardless of
  what a config file says should exist).

## Hands-on exercises

Requires `sudo apt install strongswan` and two network namespaces
connected via a shared "internet" link (reuse the netns-building approach
from module 05/12).

1. **Build two "sites" and confirm they can't reach each other's private
   subnet without a VPN.** Set up two namespaces, each with its own
   private subnet behind it (simulating two offices) and a shared public
   link between their "gateway" interfaces (simulating the internet).
   Confirm a host on site A's private subnet **cannot** ping a host on
   site B's private subnet yet — there's no route, and even if there
   were, the addresses are private and this is meant to simulate crossing
   the public internet. This is your before-state.

2. **Configure a site-to-site IPSec tunnel and confirm connectivity.**
   Install strongSwan on both gateway namespaces, configure a basic
   pre-shared-key tunnel in `/etc/ipsec.conf` (site A's private subnet as
   `leftsubnet`, site B's as `rightsubnet`, each gateway's public-facing
   address as `left`/`right`), `sudo ipsec up <name>` on both sides, and
   confirm with `sudo ipsec status` that the tunnel is `ESTABLISHED`.
   Re-run the ping from exercise 1 — expect it to succeed now, tunneled
   across the "internet" link.

3. **Watch encryption happen on the wire.** With the tunnel up, run
   `sudo tcpdump -i <public-interface> esp` on the shared link while
   pinging across the tunnel from exercise 2. Expected: you see ESP
   packets on the public-facing capture (proving the traffic is actually
   tunneled and encrypted at that point), while a capture taken *inside*
   either private subnet shows the original, unencrypted ICMP packets —
   the encryption boundary is exactly at the tunnel, not before or after
   it.

4. **Break Phase 1 and diagnose it specifically.** Deliberately
   mismatch the pre-shared key on one side's config, restart the tunnel,
   and run `sudo ipsec statusall`. Expected: the IKE_SA never reaches an
   established state — confirm the log output (`sudo journalctl -u
   strongswan` or `/var/log/syslog`) shows an authentication failure
   specifically at the IKE/Phase 1 stage, distinct from what a Phase
   2/subnet-mismatch failure would show (exercise 5). Fix the key
   mismatch and confirm `ESTABLISHED` returns.

5. **Break Phase 2 instead and compare the failure signature.** Restore
   the correct key, but now deliberately misconfigure one side's
   `rightsubnet` to a different (wrong) CIDR than site B's actual private
   range. Expected: `sudo ipsec statusall` now shows the IKE_SA
   established (Phase 1 succeeded — the endpoints authenticated each
   other fine) but the CHILD_SA (Phase 2/the actual tunnel) fails or
   never installs correctly — a visibly different failure point than
   exercise 4's, proving the two phases really do fail independently and
   distinguishably.

6. **Diagnose and fix: the overlapping-subnet VPN.** Reconfigure site B's
   private subnet to be identical to site A's (e.g. both `10.10.10.0/24`)
   and attempt to bring the tunnel up again with otherwise-correct
   config. Reason through (you don't need to fully resolve strongSwan's
   specific error) why this is fundamentally different from exercises 4
   and 5's misconfigurations — this isn't a wrong key or wrong subnet
   *typo*, it's a structurally ambiguous routing situation that no IPSec
   setting alone can resolve. State what the actual fix has to be (from
   the Concepts section).

## Independent challenge

No lab given. A company has a working site-to-site VPN between their
office and their cloud VNet. Remote employees, working from home or
hotel wifi, also need access to internal-only resources, but IT reports
that IPSec-based remote-access VPN connections frequently fail to
establish from hotel and coffee-shop networks specifically, while the
existing site-to-site tunnel (between two fixed, known networks) has
never had this problem. Explain the likely networking reason IPSec
struggles specifically in these unpredictable-network scenarios, and
recommend (with justification, using this module's concepts) an
alternative VPN approach better suited to this specific remote-access
case — while keeping the existing, working site-to-site tunnel as-is.

<details><summary>Stuck? One hint</summary>

Many hotel/public/corporate-guest networks restrictively firewall
outbound traffic to "web-looking" ports/protocols only, and IPSec's
IKE/ESP traffic (not standard TCP port 443 HTTP(S) traffic) is a common,
specific casualty of that kind of restrictive filtering — it simply gets
blocked by a firewall the user has no control over, long before it
reaches the company's VPN gateway at all. An **SSL/TLS VPN** for the
remote-access case specifically solves this: it rides over a standard TLS
connection on port 443, indistinguishable from ordinary HTTPS traffic to
any firewall in between, so it survives exactly the restrictive networks
IPSec struggles on. The fixed, known site-to-site tunnel between two
company-controlled networks has no such unpredictable-firewall problem in
the path, which is why it's never shown this symptom — this is precisely
the site-to-site-vs-remote-access, IPSec-vs-SSL-VPN distinction the
Concepts section draws, applied to a real mixed deployment where both
approaches coexist for different use cases.

</details>

## Common mistakes & troubleshooting

- **Treating "the VPN is down" as one problem instead of checking IKE
  Phase 1 vs IPSec/Phase 2 separately.** Exercises 4 and 5 show these
  fail independently with different signatures — `statusall`'s IKE_SA vs
  CHILD_SA distinction is the first thing to check, not a symptom to
  guess at.
- **Building a site-to-site VPN without checking for overlapping private
  ranges first.** Exercise 6's trap, and a genuinely common real-world
  VPN failure — this requires re-addressing one side, not a config
  tweak, so it's much cheaper to catch before building the tunnel than
  after.
- **Assuming AH is "IPSec" the way ESP is.** AH authenticates but never
  encrypts — almost every real VPN you'll actually deploy or troubleshoot
  uses ESP (with encryption), not AH alone.
- **Assuming transport mode is what site-to-site VPNs use.** Site-to-site
  tunnels need tunnel mode specifically, to wrap the entire original
  (often privately-addressed) packet inside a new, publicly-routable
  outer packet — transport mode leaves the original header exposed and
  doesn't provide this.
- **Not accounting for restrictive networks in remote-access VPN
  design.** IPSec's non-web-standard traffic is a common casualty of
  hotel/guest-network firewalls — an SSL VPN riding on TLS/443 is the
  standard fix for this specific, real deployment problem (the
  independent challenge).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. What does "tunneling" mean, and how is it different from (but
   complementary to) encryption?
2. What's the difference between a site-to-site VPN and a remote-access
   VPN?
3. What's the difference between AH and ESP within IPSec, and which one
   do almost all real deployments actually use?
4. Why do site-to-site VPNs use IPSec tunnel mode rather than transport
   mode?
5. What does IKE do, and why does it matter that it happens in two
   distinct phases when you're troubleshooting a broken tunnel?
6. Why can two private networks with identical (overlapping) address
   ranges not be connected by a VPN without first re-addressing one of
   them?
7. Why might an SSL/TLS VPN succeed on a restrictive public network where
   an IPSec VPN fails?

<details><summary>Show answers</summary>

1. Tunneling wraps an entire original packet inside a new outer packet
   addressed between two VPN endpoints, so the inner packet (which may
   use private, non-internet-routable addresses) can traverse a public
   network via the outer packet's public addressing. Encryption is a
   separate, additional property — you can tunnel without encrypting
   (e.g. GRE) — a VPN specifically combines tunneling with encryption so
   the tunneled contents are also unreadable in transit.
2. A site-to-site VPN connects two entire networks via gateway devices at
   each end, transparently linking every host on both sides with no
   per-device client needed. A remote-access VPN connects a single client
   device into a private network, requiring VPN client software on that
   device.
3. AH provides integrity and authentication but does not encrypt the
   payload (contents remain readable in transit); ESP provides integrity,
   authentication, *and* encryption. Almost all real-world IPSec
   deployments use ESP, since "tamper-proof but readable" alone rarely
   meets actual VPN requirements.
4. Tunnel mode encrypts and wraps the *entire* original packet (including
   its header) inside a new outer packet with the VPN gateways' own
   addresses — this is what allows privately-addressed inner traffic to
   be carried across the public internet inside a publicly-routable outer
   packet. Transport mode only encrypts the payload and leaves the
   original header exposed, which doesn't provide the address-hiding
   tunneling behavior site-to-site VPNs need.
5. IKE negotiates encryption keys/algorithms between the two VPN
   endpoints without ever transmitting the shared secret itself in the
   open — Phase 1 establishes a secure channel between the endpoints
   (via Diffie-Hellman), Phase 2 uses that channel to negotiate the actual
   IPSec/ESP tunnel parameters. It matters for troubleshooting because
   Phase 1 and Phase 2 fail independently with different symptoms (an
   authentication mismatch fails Phase 1; a subnet/policy mismatch can
   fail Phase 2 even with Phase 1 succeeding) — checking which phase
   actually failed narrows the diagnosis immediately instead of treating
   "VPN down" as one undifferentiated problem.
6. Because once tunneled together, a destination address like
   `192.168.1.50` would be ambiguous — it could mean either network's
   host — and no VPN setting can resolve that ambiguity; the routing
   itself is broken by definition until the overlap is removed by
   re-addressing one side (or applying boundary NAT specifically to
   translate the overlap away, where supported).
7. Because SSL/TLS VPN traffic rides over a standard TLS connection,
   typically on port 443, which is indistinguishable at the network level
   from ordinary HTTPS browsing traffic — restrictive networks (hotels,
   guest wifi, locked-down corporate firewalls) that block IPSec's
   IKE/ESP traffic specifically usually still allow standard HTTPS
   traffic through, so the SSL VPN survives filtering the IPSec VPN does
   not.

</details>

## Next

[10 — CDN & reverse proxy](../10-cdn-and-reverse-proxy/README.md): VPNs
connect private networks securely across the public internet; now look at
the opposite direction — serving *public* content to everyone, fast and
close to them, and shielding your real servers while doing it.
