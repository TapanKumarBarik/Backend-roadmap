# TCP, UDP, Ports & Sockets

## Why this matters

The IP layer gets a packet to the right *machine*; the transport layer gets it to the right *program* on that machine and decides whether delivery is reliable. Every "connection refused," "connection timed out," and "address already in use" you will ever debug is a transport-layer event. Understanding TCP's handshake and states, UDP's fire-and-forget model, and how ports and sockets identify a conversation is what lets you read `ss` output and immediately know whether a service is even listening, let alone reachable.

## Concepts

### Ports: which program on the host

An IP address identifies a host; a **port number** (0–65535) identifies which program on that host a message is for. It's the apartment number after the street address. A web server listens on port 80 (HTTP) or 443 (HTTPS); SSH on 22; DNS on 53. Ports 0–1023 are **well-known** (privileged — binding them needs root); 1024–49151 are **registered**; and the high range is used for **ephemeral** ports — the temporary source port your client picks for each outbound connection.

A connection is fully identified by a **4-tuple**: source IP, source port, destination IP, destination port. This is why one server on port 443 can serve thousands of clients at once — each client connection differs in at least the source IP or source port, so the tuples are all distinct. The server's side of every one of them is the same `IP:443`.

### Sockets

A **socket** is the OS's handle for one end of a network conversation — the programming object your code reads from and writes to. There are two roles. A **listening socket** is bound to a port and waits for incoming connections (`IP:port`, e.g. `0.0.0.0:443`). When a client connects, the OS creates a new **connected socket** representing that specific 4-tuple, so the listener stays free to accept more. When you run `ss -tlnp` and see a program bound to a port, you are looking at its listening socket. If nothing is listening on the port you're connecting to, you get "connection refused" — the host answered, but no socket was there.

### TCP: reliable, ordered, connection-oriented

TCP gives the application a **reliable, ordered byte stream** on top of best-effort IP. It achieves this with sequence numbers (so lost or reordered segments are detected and fixed), acknowledgements (the receiver confirms what it got), retransmission (unacknowledged data is resent), and flow/congestion control (it slows down rather than drowning the network). The cost is setup latency and per-connection state. Use TCP when every byte must arrive correctly and in order: web pages, APIs, file transfers, SSH, databases.

### The three-way handshake and connection teardown

Before any data flows, TCP establishes a connection with a **three-way handshake**:

1. Client → server: **SYN** ("I want to talk; here's my starting sequence number").
2. Server → client: **SYN-ACK** ("OK, here's mine, and I acknowledge yours").
3. Client → server: **ACK** ("acknowledged — we're connected").

Only now does application data move. This round-trip is why a fresh TCP connection has a latency cost before the first byte. Teardown is a polite four-way exchange of **FIN**/**ACK** in each direction (either side can close). A **RST** (reset) is the abrupt alternative — sent, for example, when you try to connect to a port with nothing listening, producing "connection refused." Recognizing SYN, SYN-ACK, FIN, and RST in a `tcpdump` capture tells you exactly how far a connection got.

### TCP connection states

A TCP connection is a state machine, and `ss`/`netstat` show you the state, which is diagnostic gold:

- **LISTEN** — a server socket waiting for connections. If your service isn't in LISTEN on the expected port, it isn't ready; nothing else matters yet.
- **ESTABLISHED** — the handshake completed; data can flow.
- **SYN-SENT** — the client sent SYN and is waiting. Stuck here means the SYN-ACK never came back (firewall dropping, host down, or wrong address).
- **TIME-WAIT** — a closed connection lingering briefly to catch stray packets. Many of these is normal on a busy client; they're not a leak.
- **CLOSE-WAIT** — the remote closed but the local app hasn't; piles of these usually mean an application bug (not closing sockets).

### UDP: fast, connectionless, best-effort

UDP adds almost nothing to IP: just source/destination ports and a checksum. There's **no handshake, no acknowledgement, no retransmission, no ordering** — you send a datagram and hope. That sounds worse, but for the right jobs it's better: no setup round-trip, no head-of-line blocking, minimal state. DNS queries, video/voice calls, gaming, and DHCP use UDP because a lost packet is cheaper to ignore (or handle in the application) than to wait for TCP to recover. The mental rule: **TCP when correctness matters more than speed; UDP when timeliness matters more than completeness.** With UDP there's no "connection refused" in the TCP sense — a closed UDP port may reply with an ICMP "port unreachable" or simply stay silent, which is why UDP problems are harder to diagnose.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `ss` | Shows sockets: listening ports, connections, and their states | `ss -tlnp` |
| `ss` (filtered) | Filters sockets by state or port | `ss -tan state established` |
| `nc` (netcat) | Opens or listens on TCP/UDP ports; a Swiss-army connection tool | `nc -zv example.com 443` |
| `nc -l` | Listens on a port (acts as a tiny server) | `nc -l 9000` |
| `curl` | Connects over TCP to test an application port | `curl -v telnet://example.com:80` |
| `tcpdump` | Captures packets so you can see SYN/ACK/FIN/RST | `sudo tcpdump -n -i any tcp port 80` |
| `/dev/tcp` | Bash built-in for a raw TCP connection test | `bash -c 'echo > /dev/tcp/example.com/443'` |

Flag breakdowns:

- `ss -tlnp` — `-t` TCP only; `-l` listening sockets only; `-n` numeric (don't resolve ports to names, faster and clearer); `-p` show the owning process (needs sudo for others' processes). This is the single most useful "what's listening here?" command.
- `ss -tan state established` — `-t` TCP; `-a` all sockets (listening and non); `-n` numeric; `state established` filters to just established connections.
- `nc -zv example.com 443` — `-z` zero-I/O mode (just check if the port is open, send no data); `-v` verbose (prints success/failure); the host and port to test. Perfect for "is this port reachable?"
- `nc -l 9000` — `-l` listen mode, turning netcat into a minimal server on port 9000 so you can test connectivity to yourself.
- `sudo tcpdump -n -i any tcp port 80` — `-n` don't resolve IPs/ports to names; `-i any` capture on all interfaces; `tcp port 80` a filter expression limiting capture to TCP traffic on port 80.

## Hands-on exercises

1. **See what's listening.** Run `ss -tlnp`. Read each line: local `address:port`, state LISTEN, and the process. Note the difference between something bound to `127.0.0.1:x` (loopback only) and `0.0.0.0:x` (all interfaces). Expected: at minimum some system services; possibly nothing on user ports.

2. **Stand up a listener and connect.** In terminal A run `nc -l 9000`. In terminal B run `nc -zv 127.0.0.1 9000` — expect `succeeded`/`open`. Then in B run `ss -tlnp | grep 9000` to see your listener's socket. Stop A and re-run the `nc -zv` — now expect `Connection refused`.

3. **Watch the handshake.** In terminal A run `sudo tcpdump -n -i any tcp port 443`. In terminal B run `curl -s https://example.com >/dev/null`. In A's capture, identify the `[S]` (SYN), `[S.]` (SYN-ACK), and `[.]` (ACK) flags of the three-way handshake, then the `[F]`/`[R]` at teardown. Expected: SYN, SYN-ACK, ACK in sequence before data.

4. **Test remote ports.** Run `nc -zv example.com 443` (expect open) and `nc -zv example.com 81` (expect timeout or refused). This is the fastest "is the port reachable?" check. Expected: 443 succeeds, 81 hangs/refuses.

5. **Read connection states.** With a connection open (`curl` a slow endpoint, or keep an SSH session), run `ss -tan`. Find ESTABLISHED entries and, right after closing something, a TIME-WAIT. Expected: mix of LISTEN and ESTABLISHED; transient TIME-WAIT after closes.

6. **Ephemeral ports and the 4-tuple.** Run `curl -s https://example.com >/dev/null &` a few times quickly, and during them `ss -tan state established`. Notice each connection has the same remote `IP:443` but a *different local ephemeral port* — the 4-tuple in action. Expected: several rows differing only in local port.

7. **UDP vs TCP behavior.** Run `dig example.com` while capturing with `sudo tcpdump -n -i any udp port 53`. Note DNS uses UDP — a single query and response, no handshake. Contrast with the TCP handshake you saw in exercise 3. Expected: two UDP packets (query, response), no SYN/ACK.

8. **Diagnose and fix: service on the wrong interface.** Start a listener bound only to loopback: `nc -l 127.0.0.1 9000` in terminal A. From terminal B, `nc -zv 127.0.0.1 9000` succeeds, but `nc -zv <your-eth0-IP> 9000` **fails** — the service is listening on `127.0.0.1` only, so it's unreachable from any real interface. Confirm with `ss -tlnp | grep 9000` (you'll see `127.0.0.1:9000`, not `0.0.0.0:9000`). **Fix:** stop it and rebind to all interfaces — `nc -l 0.0.0.0 9000` — then `nc -zv <your-eth0-IP> 9000` succeeds. "Works on localhost but not from other hosts" almost always means a service bound to `127.0.0.1` instead of `0.0.0.0`; `ss -tlnp` shows it instantly.

9. **Diagnose and fix: connect to a dead port.** Run `curl -v --connect-timeout 3 http://127.0.0.1:9999`. You get `Connection refused` immediately (a RST — the host is up, no socket listening). Contrast with `curl -v --connect-timeout 3 http://10.255.255.1:9999`, which *hangs* then times out (no host / packets dropped, no RST). The distinction — instant refused vs slow timeout — tells you "host up, nothing listening" versus "can't even reach the host," a diagnostic split you'll use constantly.

## Independent challenge

You're told an internal HTTP service "should be running on port 8080 on host X but clients can't reach it." Without being given any commands, construct a diagnosis that determines, in order: whether anything is listening on 8080 at all, whether it's bound to the right interface, whether the TCP handshake completes from a client, and — if it does complete but the client still fails — whether the problem has moved *above* the transport layer. This requires combining this module with **module 02 (DNS)**: part of "clients can't reach it" may be that clients resolve host X's name to the wrong address entirely, so verify the name-to-address step before ever touching ports.

<details><summary>Stuck? One hint</summary>

Work bottom-up but start one layer higher than you think: first confirm the client resolves host X to the IP you expect (`getent hosts X` — module 02), because a wrong IP makes every port test meaningless. Then on the server use `ss -tlnp` to prove something is in LISTEN on 8080 and check whether it's `0.0.0.0:8080` or `127.0.0.1:8080`. From the client, `nc -zv X 8080` tests whether the handshake completes. If the handshake completes but the app still fails, the transport layer did its job and the fault is application-layer (HTTP), which is the next module.

</details>

## Common mistakes & troubleshooting

- **Confusing "connection refused" with "connection timed out."** Refused = host reachable, nothing listening (a RST came back, fast). Timed out = no response at all, usually a firewall dropping packets or a wrong/dead address (slow). These point to completely different fixes.
- **Binding to `127.0.0.1` and expecting external access.** A service on loopback is invisible to other hosts. Bind to `0.0.0.0` (or a specific external interface) for reachability. `ss -tlnp` reveals which.
- **Panicking over TIME-WAIT.** Many TIME-WAIT sockets on a busy client are normal and harmless; they clear on their own. CLOSE-WAIT piling up, by contrast, is a real app bug.
- **Assuming UDP "connections."** UDP is connectionless — there's no handshake and often no error when a port is closed, so `nc -zv -u` results are unreliable. UDP reachability often needs application-level confirmation.
- **Forgetting privileged ports need root.** Binding a port below 1024 without privileges fails with "permission denied," which looks like a code bug but is a permissions issue.
- **"Address already in use."** A previous process still holds the port (often in TIME-WAIT or still running). Find it with `ss -tlnp` before assuming your code is wrong.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does a port number identify, and what does an IP address identify? Why does a connection need both ends' IPs *and* ports?
2. List the three steps of the TCP three-way handshake and what each one signals.
3. You see a socket in state `LISTEN` vs `ESTABLISHED` vs `SYN-SENT`. What does each tell you about where a connection stands?
4. Give two concrete differences between TCP and UDP, and one service that fits each and why.
5. Why can one web server on `0.0.0.0:443` handle thousands of simultaneous clients? Reference the 4-tuple.
6. What's the difference in observed behavior between connecting to a port with nothing listening versus a port a firewall is dropping?
7. A service works via `curl 127.0.0.1:8080` but not from another host. What's the most likely cause and which command confirms it?
8. What does a growing pile of `CLOSE-WAIT` sockets usually indicate, and how does that differ from many `TIME-WAIT` sockets?

<details><summary>Show answers</summary>

1. A port identifies which program/socket on a host; an IP identifies which host. A connection is a 4-tuple (source IP+port, destination IP+port); both ends' ports are needed so the OS can demultiplex which specific conversation each packet belongs to.
2. SYN (client requests a connection, sends its initial sequence number), SYN-ACK (server accepts, sends its own sequence number and acknowledges the client's), ACK (client acknowledges the server's — connection established, data can flow).
3. LISTEN: a server socket waiting for incoming connections (service is ready). ESTABLISHED: handshake complete, data flowing. SYN-SENT: the client sent a SYN and is still waiting for the SYN-ACK — stuck here means the reply never came (firewall drop, host down, wrong address).
4. TCP is connection-oriented, reliable, ordered (handshake, acks, retransmission); UDP is connectionless, best-effort, unordered, no handshake. HTTP/SSH/databases use TCP (every byte must arrive correctly); DNS/voice/video/gaming use UDP (timeliness beats completeness, loss is cheaper to tolerate or retry).
5. Every client connection is a distinct 4-tuple (differing in source IP and/or source port), so the server distinguishes them all even though its side is always `IP:443`. The single listening socket only accepts; each accepted connection is its own connected socket keyed by the 4-tuple.
6. Nothing listening → an immediate RST → "connection refused" (fast). Firewall dropping → no response at all → "connection timed out" (slow).
7. The service is bound to `127.0.0.1` (loopback only) instead of `0.0.0.0` (all interfaces). `ss -tlnp` confirms it by showing `127.0.0.1:8080` rather than `0.0.0.0:8080`.
8. Many CLOSE-WAIT usually means an application bug — the remote closed but the local app isn't closing its sockets (a leak). Many TIME-WAIT is normal on a busy client (recently closed connections lingering briefly) and clears on its own.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these. These deliberately mix concepts across modules 00–03.

1. You run `curl http://shop.example`. Walk from the name to the first byte of the HTTP request, naming which layer/step handles: resolving the name, deciding whether the destination is local or via the gateway, choosing a source port, and establishing the connection.
2. A host is `10.0.5.40/29`. It tries to reach `10.0.5.44` on port 22 and it fails. Explain, using addressing *and* transport reasoning, at least two distinct things that could be wrong and how you'd tell them apart.
3. `dig example.com` returns the correct IP, but `nc -zv example.com 443` times out. Which layers are proven working and which is suspect? What single follow-up test narrows it further?
4. Why does DNS traditionally use UDP while HTTP uses TCP? Tie your answer to what each protocol guarantees and what each application can tolerate.
5. A connection sits in SYN-SENT and never advances. Relate this to the three-way handshake: which specific packet is missing, and name two lower-layer causes.
6. Explain how one server on `0.0.0.0:443` handles 5,000 simultaneous clients, referencing the 4-tuple and the difference between a listening socket and a connected socket.
7. `getent hosts api.example` returns `169.254.10.5`. Before you even test the port, why is this address already a red flag, and what does it usually mean?
8. Put SYN, SYN-ACK, ACK, and RST on the mental-model layer stack: which layer are they, and what does each tell you when you see it in a `tcpdump` capture?

<details><summary>Show answers</summary>

1. Name → IP is DNS at the application layer (module 02), a separate step before any packet. Local-vs-gateway is the IP layer applying the subnet mask (module 01/00). Choosing a source port and doing the handshake is TCP at the transport layer (module 03), using an ephemeral source port and destination port 80. Only after the SYN/SYN-ACK/ACK completes does the HTTP request go out (module 00 encapsulation).
2. `10.0.5.40/29` covers `10.0.5.40`–`.47`, so `.44` *is* on the same subnet — good. Possibilities: (a) nothing is listening on 22 on `.44` (would give an immediate "connection refused"/RST); (b) a firewall is dropping the SYN (would give a slow *timeout*, connection stuck in SYN-SENT); (c) the host is down (also timeout). Tell them apart by the speed and nature of failure: instant refused vs slow timeout, and by checking `ss -tlnp` on `.44` and any firewall rules.
3. DNS/application resolution works and the name is correct. The suspect is transport/IP reachability to port 443 — likely a firewall dropping the SYN or the host being down (timeout, not refused). Follow up with `ping <IP>` and/or `curl -v --connect-timeout 3` to distinguish "host unreachable" from "port filtered," and try another port to see if it's port-specific.
4. DNS queries are small, single request/response, and can simply be retried if lost — timeliness beats the overhead of a TCP handshake, so UDP fits. HTTP needs every byte of a page/response delivered correctly and in order, so it needs TCP's reliability and ordering despite the setup cost.
5. The SYN-ACK (server's reply) never came back. Lower-layer causes: a firewall dropping the SYN or the SYN-ACK, the destination host being down/unreachable, or the wrong IP so no one answers.
6. Every client's connection is a distinct 4-tuple (their source IP+port differs), so the server distinguishes them even though its side is always `IP:443`. The single listening socket only accepts; each accepted connection becomes its own connected socket keyed by the 4-tuple, so thousands coexist.
7. `169.254.x.x` is link-local — a self-assigned address that appears when the host failed to get a real one (module 01). It's not a routable service address, so any port test is pointless; fix address assignment/DNS first.
8. They're transport-layer (TCP). SYN = a client is trying to open a connection; SYN-ACK = the server accepted and replied (path works both ways so far); ACK = handshake complete, data can flow; RST = abrupt refusal/reset, typically "no socket listening on that port" or a forced close. Seeing SYN but no SYN-ACK means the request left but nothing came back — look lower (firewall/host).

</details>

## Next

[04 — HTTP, HTTPS & TLS fundamentals](../04-http-https-and-tls-fundamentals/README.md): with a reliable TCP connection established, learn the application protocol that rides on it — and how TLS wraps it for security.
