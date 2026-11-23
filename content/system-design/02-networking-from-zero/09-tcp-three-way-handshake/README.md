# Lesson 09: TCP Part 2, the Three-Way Handshake

> **Prerequisites:** [Lesson 08: TCP Part 1, Sequence Numbers and ACKs](../08-tcp-sequence-numbers-and-acks/README.md) and [Lesson 06: The OSI Model, Made Simple](../06-osi-model/README.md) ([Networking From Zero Overview](../README.md)).  
> **Estimated Reading Time:** 33 minutes  
> **Target Audience:** Backend engineers and SREs mastering TCP connection establishment, ISN security, MSS negotiation, SYN retransmission backoff, kernel backlog queues, and SYN flood defenses.  
> **Free PDF Notes:** [Download SD-N-009.pdf](https://backendroadmap.com/notes/system-design/SD-N-009.pdf)

> [!NOTE]
> **In one line:** before any data, TCP sends three messages (SYN, SYN-ACK and ACK); each side sends a random starting number and the other confirms it with that number plus one; it costs one round trip, and a lost SYN waits a full second or more.

> [!TIP]
> **The Golden Rule of the TCP Handshake:** Before a single application byte moves, TCP exchanges three control segments—**SYN**, **SYN-ACK**, and **ACK**—so both ends share random **Initial Sequence Numbers (ISNs)**, confirm each other's reachability with `ISN + 1`, and negotiate options such as **MSS** in one round trip. A dropped `SYN` stalls for `1 s` before retrying with exponential doubling (`1, 2, 4, 8, 16, 32, 64 ≈ 127 s`), making bounded connect timeouts, connection reuse, and kernel backlog sizing essential for production reliability.

---

## Words You'll Meet Today

Before watching packets synchronize across ports and kernel queues, anchor these eight essential terms:

| Word | Everyday Meaning | Role in a Live Backend System |
| :--- | :--- | :--- |
| **Connection** | Two programs agreeing to talk, with a counter on each side. | Kernel 4-tuple state (`src_ip, src_port, dst_ip, dst_port`) tracking send/receive sequence windows. |
| **SYN** | Synchronise: the message that says "here's my starting number". | Opening TCP segment (`SYN=1`) consuming 1 sequence number (`ISN`) and advertising MSS. |
| **ISN** | Initial sequence number: that random starting number. | CSPRNG-seeded 32-bit counter preventing blind spoofing and stale-packet injection. |
| **SYN-ACK** | The server's reply: its own SYN and an ACK in one segment. | Confirms client `ISN + 1` while sending the server's own random `ISN`. |
| **Flag** | One bit in the TCP header that marks the kind of message. | Control bits (`SYN`, `ACK`, `FIN`, `RST`, `PSH`) driving TCP's state machine. |
| **ESTABLISHED** | The state once the handshake is done and data can flow. | Both directions confirmed; socket moves into the server's `Accept` queue for `accept()`. |
| **MSS** | Maximum segment size: the most data in one segment, often `1,460` bytes. | Negotiated during `SYN`/`SYN-ACK` (`1,500 B MTU - 20 B IP - 20 B TCP = 1,460 B`). |
| **RST** | Reset: a flag meaning no, or stop, this connection. | Emitted immediately when no socket listens on the target port (`connection refused`). |

---

## What It Is vs. What It Isn't

The handshake is small, but it is misread in four different ways. Separate them:

| Term | Precise Meaning | What It Is **NOT** | Production Example |
| :--- | :--- | :--- | :--- |
| **Three-way handshake** | `SYN` -> `SYN-ACK` -> `ACK`: each side sends its **ISN** and the peer confirms it with `ISN + 1`, plus option negotiation (MSS, window scale, SACK, timestamps). | Not per request, not encryption, not authentication — only agreement on numbers and options. | `curl` opens one connection, then reuses it for later requests. |
| **ISN** | A **random 32-bit** start number per direction. The `SYN` flag itself consumes **one** sequence number. | Not `0`, not predictable, not "bytes received". | `SYN seq=4000` -> first data byte `4001`. |
| **`ESTABLISHED`** | Both directions confirmed; the kernel can accept data. On the server the socket first waits in the **accept queue**. | Not "the app is talking to the client yet": the app only sees the socket when it calls `accept()`. | `ss -lnt` `Recv-Q` = sockets waiting for `accept()`. |
| **`RST` vs. silence** | `RST` = an immediate, explicit **no** (`connection refused`). Silence = a **drop**; the client retries with doubling waits (`connection timed out`). | Not equivalent: one fails in `~1 RTT`, the other can take **`127 s`** on Linux. | Security-group `DROP` vs. an unbound port. |
| **Half-open connection** | A server socket in `SYN_RECV` that has sent `SYN-ACK` but not yet received the final `ACK`. | Not an established connection and not free: it occupies a **SYN-queue slot** (until SYN cookies). | The resource a **SYN flood** exhausts. |

> **The handshake proves reachability and agrees on numbers, nothing more.** A completed `connect()` means the *kernel* answered — it says nothing about whether the application behind the port is healthy (Lesson 06's L4-vs-L7 lesson, again).

---

## Visual Mental Models & Architecture

### The Question: Three Tiny Messages, No Data

Before your phone sends a single byte of your photo, it sends three tiny messages to the server. No data at all. Just: hello.

In [lesson 8](../08-tcp-sequence-numbers-and-acks/README.md), we saw that TCP numbers every byte. But each side starts counting from a random number. So before any data moves, both sides must tell each other where they start. That's the three-way handshake, and today we follow it one message at a time.

### An Everyday Picture First: A Call on a Bad Line

You call a friend on a bad line. You say: hello, can you hear me? Your friend says: yes, I can hear you. Can you hear me?

You say: yes, I can. Now both of you know two things: my voice reaches you, and your voice reaches me. Only then does the real conversation start.

Count the messages. Three. Two would not be enough: after only two, your friend still doesn't know that you can hear them.

![Two people on a call. You: hello, can you hear me? Your friend: yes, I can hear you, can you hear me? You: yes, I can. Three numbered messages.](images/figure-1.svg)

*Figure 1. The analogy: a call on a bad line takes three messages before both people know that each voice reaches the other.*

### The Real Thing, One Message at a Time

The server is waiting on port `443`. In TCP's words, it is **listening**. Your phone picks a random starting number, say `4,000`.

1. **SYN.** Your phone sends a segment with the `SYN` flag set, and sequence number `4,000`. In plain words: *I want to talk, and my bytes start at 4,000.*
2. **SYN-ACK.** The server picks its own random number, say `9,000`. Its reply has both flags set: `SYN`, with sequence number `9,000`, and `ACK 4,001`. In plain words: *got your number, and my bytes start at 9,000.*
3. **ACK.** Your phone replies: `ACK 9,001`. *Got your number too.* Now both sides are in the state called **ESTABLISHED**, and the connection exists.

Why `4,001`, and not `4,000`? Remember the rule from lesson 8: the ACK is the next number the receiver expects. The `SYN` itself uses up one number, so the next one is `4,001`.

The first byte of your photo will carry sequence number `4,001`. The first byte of the server's reply: `9,001`. Two directions, two counters, both confirmed.

![A sequence diagram between your phone and a server listening on port 443: SYN with seq 4,000; SYN-ACK with seq 9,000 and ack 4,001; ACK with ack 9,001. Both sides are then established.](images/figure-2.svg)

*Figure 2. The three-way handshake with real numbers: each side sends its random starting number, and the other confirms it with that number plus one.*

| # | From → To | Flags | `seq` | `ack` |
| :--- | :--- | :--- | :--- | :--- |
| 1 | phone → server | `SYN` | `4,000` | `-` |
| 2 | server → phone | `SYN + ACK` | `9,000` | `4,001` |
| 3 | phone → server | `ACK` | `4,001` | `9,001` |

Read the numbers: each ACK is the other side's number, plus one.

```mermaid
sequenceDiagram
    participant Client as Client Socket
    participant SynQ as Server Kernel SYN Queue
    participant AcceptQ as Server Kernel Accept Queue
    participant App as Server App

    Note over Client: CLOSED -> SYN_SENT
    Client->>SynQ: 1. SYN seq=4000 MSS=1460
    Note over SynQ: LISTEN -> SYN_RCVD (Half-Open Slot)
    SynQ-->>Client: 2. SYN-ACK seq=9000 ack=4001 MSS=1460
    Client->>AcceptQ: 3. ACK seq=4001 ack=9001 (+ Optional First Payload)
    Note over Client: SYN_SENT -> ESTABLISHED
    Note over AcceptQ: Moves from SYN Queue to Accept Queue (ESTABLISHED)
    App->>AcceptQ: accept() pops established socket
```

### Why Three Messages, and Why Random Numbers?

Why three messages, and not two, or four? Each direction needs its own number, sent and confirmed. That's four jobs. But the server sends its `SYN` and its `ACK` in the same segment. Four jobs, three messages.

![Four boxes: phone sends its number, server confirms it, server sends its number, phone confirms it. The middle two are braced as one segment, SYN-ACK; the first is SYN and the last is ACK.](images/figure-3.svg)

*Figure 3. Why three messages: four jobs (each side sends its number, the other confirms it), and the server combines its confirmation and its own number in one SYN-ACK.*

And why random starting numbers? Two reasons. A late packet from an old connection on the same ports won't be mistaken for new data. And an attacker can't easily guess the numbers to fake a connection.

### Options, and Real Numbers for Time

The `SYN` also carries options. The most important is the **maximum segment size** (`MSS`): how much data fits in one segment. On normal Ethernet or Wi-Fi, it's **1,460 bytes**: the 1,500-byte packet from [lesson 6](../06-osi-model/README.md), minus 20 bytes of IP header, and 20 bytes of TCP header.

![A bar: IP header 20 bytes, TCP header 20 bytes, data up to 1,460 bytes, braced together as one 1,500-byte packet.](images/figure-4.svg)

*Figure 4. The SYN's most important option, the maximum segment size: 1,500 bytes per packet minus 20 bytes of IP header and 20 of TCP header leaves 1,460 bytes of data.*

The handshake costs **one round trip** before any data. Your phone can send its first data together with the final `ACK`, so one round trip is all it costs.

| Where the Server Is | One Round Trip |
| :--- | :--- |
| the same city | a few ms |
| India → Singapore | about `60 ms` |
| India → US east coast | about `200` to `250 ms` |

You pay it once per connection, which is why opening connections is expensive, and reusing them matters ([lesson 29](../29-connection-pooling-and-keep-alive/README.md)).

![Left: a ladder diagram, SYN, SYN-ACK and then ACK with the first data, with the first two braced as one round trip. Right: bars for one round trip, a few milliseconds in the same city, about 60 ms from India to Singapore, about 200 to 250 ms from India to the US east coast.](images/figure-5.svg)

*Figure 5. The handshake costs one round trip before any data (the first data can ride with the final ACK), and how long one round trip is depends on distance.*

### What Goes Wrong

- **No reply.** Maybe the server is down, or a firewall silently drops the `SYN`. Your phone waits, then sends the `SYN` again. On Linux, the first wait is one second, and then it doubles: two, four, eight, and so on. After six retries, about two minutes in all, you see: *connection timed out*.
- **Nobody listening.** The server is up, but no program is listening on that port. The server answers straight away with a reset: a segment with the **RST** flag. You see: *connection refused*. Fast, and honest.

![A row of waits, 1, 2, 4, 8, 16, 32 and 64 seconds, with a SYN resent between each: about 127 seconds, then connection timed out. Below: phone sends SYN, the server answers RST, connection refused.](images/figure-6.svg)

*Figure 6. What goes wrong: with no reply the client resends the SYN, doubling the wait each time, until "connection timed out"; with no program on the port the server sends RST and you see "connection refused".*

**A SYN flood.** An attacker sends millions of `SYN`s, and never sends the final `ACK`. The server keeps a slot for each half-open connection, and its queue fills up, so real users can't get in. The usual fix is **SYN cookies**: the server keeps no slot, and hides what it needs inside its own starting number.

![An attacker sends many SYNs into a server's queue, which fills with half-open slots; a real user's SYN is rejected. A note: fix, SYN cookies, the server keeps no slot and hides what it needs in its starting number.](images/figure-7.svg)

*Figure 7. A SYN flood: an attacker sends SYNs and never the final ACK, filling the server's queue of half-open connections so real users can't connect. SYN cookies keep no slot until the ACK arrives.*

---

## Systematic Reference & Protocol Comparison

### Handshake Failure Modes Compared

| Symptom | Wire Event | Elapsed Wait Time | Root Cause | Diagnostic Action |
| :--- | :--- | :--- | :--- | :--- |
| **`Connection refused` (`ECONNREFUSED`)** | Server sends immediate `RST` | `~1 RTT` (`< 5 ms` on LAN) | Host reachable, but no process bound to that port (or active reject firewall) | Run `ss -lnt` on target host; verify process started and bound `0.0.0.0:port` |
| **`Connection timed out` (`ETIMEDOUT`)** | Client retries `SYN` (`1, 2, 4, 8, 16, 32, 64 s`) | `~127 s` (`tcp_syn_retries=6`) | Silent firewall `DROP`, dead host, routing blackhole, or full `SYN`/`Accept` queue | Inspect security groups, routing tables, and `TcpExtListenOverflows` |
| **Intermittent `1 s` or `3 s` Connect Latency** | Initial `SYN` or `SYN-ACK` dropped; retry succeeds | `1,000 ms + RTT` (or `3,000 ms`) | Transient congestion or ECMP drop during handshake | Check `TcpRetransSegs` / packet drops on NIC and edge load balancer |

### Linux Kernel Handshake Queues & Tuning Parameters

| Sysctl / Option | Default (Modern Linux) | Role in Three-Way Handshake |
| :--- | :--- | :--- |
| **`net.ipv4.tcp_syn_retries`** | `6` (`~127 s` total) | Number of times client kernel resends an unanswered `SYN` (`1+2+4+8+16+32+64`). |
| **`net.ipv4.tcp_max_syn_backlog`** | `1024`–`4096` | Max half-open (`SYN_RECV`) connections queued before dropping `SYN` or triggering SYN cookies. |
| **`net.core.somaxconn`** | `4096` (older kernels `128`) | Ceiling on the `Accept` queue of fully `ESTABLISHED` sockets waiting for app `accept()`. |
| **`net.ipv4.tcp_syncookies`** | `1` (enabled on overflow) | Encodes MSS and connection hash into server's `ISN` so half-open floods use zero RAM. |
| **`TCP_FASTOPEN` (`RFC 7413`)** | Opt-in cookie | Allows repeat clients to carry HTTP payload inside the initial `SYN`, saving 1 RTT. |

### Handshake Math: Retry Schedules, Queues, and Flood Economics

**1. The client SYN retry schedule (Linux `tcp_syn_retries = 6`).** The initial RTO is `1 s` and doubles after each loss. The retransmissions go out at $t = 1, 3, 7, 15, 31, 63$ s, and the kernel aborts at $127$ s:

$$T_{\text{abort}} = \sum_{k=0}^{6} 2^k = 2^7 - 1 = 127\ \text{s}$$

**Time to ESTABLISHED when the first $k$ SYNs are lost** (RTT = `100 ms`):

| SYNs lost | Last SYN sent at | `connect()` returns after | User-visible effect |
| :--- | :--- | :--- | :--- |
| `0` | `0 s` | `0.1 s` | Normal |
| `1` | `1 s` | **`1.1 s`** | Page "feels stuck" |
| `2` | `3 s` | `3.1 s` | Visibly broken |
| `3` | `7 s` | `7.1 s` | Users reload / give up |
| `4` | `15 s` | `15.1 s` | Mobile apps time out |
| `6` | `63 s` | `63.1 s` | Thread pools exhausted |
| all `7` | `63 s` | **`127 s` -> `ETIMEDOUT`** | Outage if no `connectTimeout` |

The default OS wait varies: **Linux `~127 s`**, **Windows `~21 s`** (`3 + 6 + 12`), **macOS `~75 s`**. A bounded application `connectTimeout` of `~3x` the normal p99 RTT (`200-500 ms` internally) beats all of them.

**2. Tail latency from handshake loss.** A handshake stalls if the `SYN` **or** the `SYN-ACK` is lost (a lost final `ACK` is repaired by the first data segment). With independent per-packet loss $p$:

$$P(\text{handshake retried}) = 1 - (1-p)^2 \approx 2p$$

| Packet loss $p$ | $P(\text{retry})$ | Mean extra latency ($\approx P \times 1\,\text{s}$) | What users see |
| :--- | :--- | :--- | :--- |
| `0.1%` | `0.2%` | `+2 ms` | Invisible in the mean, **visible at p99.9** (`~1.1 s`). |
| `1%` | `2.0%` | `+20 ms` | **p98 jumps from `~RTT` to `~1 s`.** |
| `5%` | `9.75%` | `+98 ms` | Roughly 1 in 10 connections stalls for a full second. |

The *mean* hides it; the **tail** shows it. That is why TCP connect time must be a **histogram metric**, not an average.

**3. The server-side `SYN-ACK` schedule.** `net.ipv4.tcp_synack_retries = 5`: the server resends `SYN-ACK` at `1, 3, 7, 15, 31 s` and drops the half-open entry at `63 s`. A half-open slot therefore lives **up to ~63 s**.

**4. SYN-flood economics — why a *small* attack works.** To keep a backlog of $Q$ half-open slots permanently full, the attacker needs only

$$R_{\text{attack}} = \frac{Q}{T_{\text{slot}}} = \frac{4{,}096}{63\ \text{s}} \approx \mathbf{65\ SYN/s} \qquad \left(Q = 1{,}024 \Rightarrow 16\ \text{SYN/s}\right)$$

~65 packets per second (`~28 kbit/s`!) can lock out a default-sized listener, because **each SYN costs the attacker `~54 bytes` and the victim a memory slot for a full minute**. With **SYN cookies** the slot cost is `0`: state is recomputed from the returning `ACK`. Trade-offs: the cookie can encode only a handful of MSS values, and without TCP timestamps it loses options such as window scale and SACK; Linux therefore uses cookies **only when the queue overflows** (`tcp_syncookies = 1`).

**5. The accept queue and how to size it.** After the final `ACK`, the socket waits in the **accept queue** whose depth is capped at $\min(\texttt{backlog},\ \texttt{somaxconn})$. It drains only as fast as the app calls `accept()`:

$$\text{queue depth needed} \approx \lambda_{\text{peak}} \times t_{\text{stall}}$$

Example: a burst of `5,000 new conn/s` and an event loop that stalls for `100 ms` (GC pause, blocking call) needs `~500` slots. If the app passes `listen(fd, 128)`, `~370` clients lose their handshake: `ListenOverflows` rises and those clients retry the `SYN` after **1 s** — the mysterious "p99 = 1.0 s" connect spikes with idle CPUs.

**6. Cost of the handshake in serial call chains.** Cold connections multiply by the number of *serial* dependencies:

| Scenario | RTT | Handshake cost / hop | 5 serial cold calls | Same chain with pooled connections |
| :--- | :--- | :--- | :--- | :--- |
| Same AZ | `0.5 ms` | `0.5 ms` | `2.5 ms` | `0 ms` of handshake |
| Same region, cross-AZ | `2 ms` | `2 ms` | `10 ms` | `0 ms` |
| India -> Singapore | `60 ms` | `60 ms` | `300 ms` | `0 ms` |
| India -> US east | `225 ms` | `225 ms` | **`1.1 s`** | `0 ms` |

Add `+1 RTT` per hop for TLS 1.3 (`+2` for TLS 1.2). **TCP Fast Open** (cookie-based, RFC 7413) can carry data in the `SYN` of a *repeat* connection, saving one RTT; **QUIC** folds transport and TLS into a single round trip and offers `0-RTT` resumption.

**7. MSS negotiation.** Each side advertises its `MSS` in the `SYN`; the effective value is the **minimum** of the two (and of the path-MTU-derived limit): $\text{MSS} = \min(\text{MSS}_c, \text{MSS}_s)$. Typical values: `1460` (IPv4/Ethernet), `1440` (IPv6/Ethernet, or `MTU 1480` tunnels), `1432` (PPPoE-style `MTU 1492`), `1380` (many VPNs). The lesson's `tcpdump` capture shows `mss 1460` vs `mss 1440` -> the connection uses `1440`. **MSS clamping** on gateways fixes MTU black holes without relying on ICMP.

### The Observability Gap: Where Do Handshake Failures Show Up?

A dropped `SYN` never reaches your application, so **your access logs cannot show it**.

| Vantage Point | What It Shows | What It **Hides** |
| :--- | :--- | :--- |
| **Client app** (`connect` error + elapsed time) | `ECONNREFUSED` vs `ETIMEDOUT`, exact connect duration | Whether the cause is the firewall, the host, or the accept queue. Many clients don't even record connect time **separately** from request time. |
| **Server access / application logs** | Nothing for failed or dropped handshakes | **100% of handshake failures** — the app only sees sockets after `accept()`. |
| **`ss -ltn` on the server** | `LISTEN` `Recv-Q` = accept-queue depth, `Send-Q` = its limit | Historical overflows; needs sampling. |
| **`nstat`** (`TcpExtListenOverflows`, `TcpExtListenDrops`, `TcpExtTCPReqQFullDrop`, `TcpExtTCPReqQFullDoCookies`, `TcpExtSyncookiesSent/Recv/Failed`, `TcpAttemptFails`, `TcpPassiveOpens`) | Kernel-level counters for queue overflows and cookies | Which clients/source IPs. |
| **Load balancer metrics** (`TCP_Target_Reset_Count`, `ClientTLSNegotiationErrorCount`, `UnHealthyHostCount`) | Resets and failed target connects | The reason the target reset. |
| **Packet capture** (`tcpdump 'tcp[tcpflags] & (tcp-syn\|tcp-rst) != 0'`) | Ground truth: SYN retransmits, RSTs, MSS, options | Encrypted content; heavy at scale. |

**Instrument these three things:** (1) **TCP connect latency histogram** per dependency (separate from request latency), (2) **`ListenOverflows` / `ListenDrops` rate** on every server, (3) **ratio of connect timeouts to refused** per target. A rising *timeout* ratio signals firewall/routing; a rising *refused* ratio signals a dead process.

---

---

## Production War Story Post-Mortem

### SEV-1: Silent Firewall Drop + Missing Connect Timeout Turns Dead Redis Shard into 127s Thread Exhaustion

- **Severity:** SEV-1 (Full API outage across 3 availability zones)
- **Detection Time:** 3 minutes (`502 Bad Gateway` surge on ingress)
- **Resolution Time:** 21 minutes
- **Impact:** All 400 API worker threads froze for over 2 minutes per connection attempt, taking down unrelated read endpoints.

#### What Happened

A blue-green Redis migration stood up a new cache shard in a subnet whose security group omitted an ingress rule for port `6379`—configured to silently `DROP` unauthorized packets instead of rejecting with `RST`. Meanwhile, the backend Redis client used an explicit `readTimeout = 200 ms`, but left `connectTimeout` unset (falling back to the Linux kernel's default `tcp_syn_retries = 6`). Every single request hitting the new shard blocked a worker thread for **`127 seconds`** as the kernel patiently doubled its `SYN` retransmission timer: `1s -> 2s -> 4s -> 8s -> 16s -> 32s -> 64s`.

```mermaid
sequenceDiagram
    participant Worker as API Worker Pool
    participant Kernel as Linux TCP Stack
    participant SG as Security Group (Silent DROP)

    Worker->>Kernel: connect(10.42.8.15 port 6379) with no connectTimeout
    Kernel->>SG: SYN #1 at t=0s
    SG--xKernel: Silently Dropped (No RST)
    Kernel->>SG: SYN #2 at t=1s
    Kernel->>SG: SYN #3 at t=3s (waited 2s)
    Kernel->>SG: SYN #4 at t=7s (waited 4s)
    Kernel->>SG: SYN #5 at t=15s (waited 8s)
    Kernel->>SG: SYN #6 at t=31s (waited 16s)
    Kernel->>SG: SYN #7 at t=63s (waited 32s)
    Note over Kernel: Waits 64s Final Window -> ETIMEDOUT at ~127s
    Kernel-->>Worker: Socket Fails After 127 Seconds (Worker Pool Exhausted)
```

#### Root Cause Analysis

1. **Unbounded Kernel Connect Wait:** Application timeouts (`readTimeout`) only start *after* the TCP handshake transitions to `ESTABLISHED`. Without an explicit user-space `connectTimeout`, the kernel dictates `127 seconds` of blocking.
2. **Silent Drop vs. Immediate `RST`:** Unlike an immediate `RST` (`connection refused` in milliseconds), silent packet drops force full exponential backoff retries.

#### The Fix & Architectural Hardening

1. **Strict Bounded Connect Timeouts (`<= 500 ms`):** Configured `DialTimeout` / `connectTimeout = 500 ms` on every internal datastore and RPC pool so failed handshakes fail fast before the `1 s` first `SYN` retransmit even blocks the pool.
2. **Pre-Flight Smoke Probes & Explicit Rejects in VPCs:** Added automated TCP port-reachability canary probes during blue-green cutovers and configured internal health/ACL boundaries to return `RST`/ICMP unreachable rather than silent drops where appropriate.

---

## Multi-Language Production Implementation

Below is a **TCP Three-Way Handshake Simulator & Bounded Connect Dialer** in four languages. It models CSPRNG `ISN` selection, `ISN + 1` confirmation across `SYN -> SYN-ACK -> ACK`, `MSS` negotiation, `RST` vs `SYN` cookie protection, and a production bounded-timeout TCP dial helper.

````carousel
```go
package main

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"net"
	"time"
)

type Segment struct {
	SYN, ACK, RST bool
	Seq, Ack      uint32
	MSS           uint16
}

func randomISN() uint32 {
	var b [4]byte
	_, _ = rand.Read(b[:])
	return binary.BigEndian.Uint32(b[:])
}

func SimulateHandshake(listening bool, clientMSS, serverMSS uint16) error {
	clientISN := randomISN()
	syn := Segment{SYN: true, Seq: clientISN, MSS: clientMSS}
	fmt.Printf("1. Client -> Server: SYN seq=%d MSS=%d\n", syn.Seq, syn.MSS)

	if !listening {
		fmt.Println("2. Server -> Client: RST (Connection refused)")
		return errors.New("ECONNREFUSED")
	}

	serverISN := randomISN()
	synAck := Segment{SYN: true, ACK: true, Seq: serverISN, Ack: syn.Seq + 1, MSS: serverMSS}
	fmt.Printf("2. Server -> Client: SYN-ACK seq=%d ack=%d MSS=%d\n", synAck.Seq, synAck.Ack, synAck.MSS)

	if synAck.Ack != clientISN+1 {
		return errors.New("invalid SYN-ACK ack number")
	}

	negotiatedMSS := min(clientMSS, serverMSS)
	finalAck := Segment{ACK: true, Seq: clientISN + 1, Ack: synAck.Seq + 1}
	fmt.Printf("3. Client -> Server: ACK seq=%d ack=%d -> ESTABLISHED (MSS=%d)\n",
		finalAck.Seq, finalAck.Ack, negotiatedMSS)
	return nil
}

// Production pattern: always bound Connect timeout well below Linux's ~127s tcp_syn_retries
func BoundedDial(addr string, timeout time.Duration) (net.Conn, error) {
	return net.DialTimeout("tcp", addr, timeout)
}

func main() {
	_ = SimulateHandshake(true, 1460, 1400)
	_ = SimulateHandshake(false, 1460, 1460)
}
```
<!-- slide -->
```typescript
import * as crypto from "node:crypto";
import * as net from "node:net";

interface Segment {
  syn?: boolean;
  ack?: boolean;
  rst?: boolean;
  seq: number;
  ackNum?: number;
  mss?: number;
}

const randomISN = (): number => crypto.randomBytes(4).readUInt32BE(0);

export function simulateHandshake(listening: boolean, clientMss = 1460, serverMss = 1400): void {
  const clientIsn = randomISN();
  const syn: Segment = { syn: true, seq: clientIsn, mss: clientMss };
  console.log(`1. Client -> Server: SYN seq=${syn.seq} MSS=${syn.mss}`);

  if (!listening) {
    console.log("2. Server -> Client: RST (ECONNREFUSED)");
    return;
  }

  const serverIsn = randomISN();
  const synAck: Segment = {
    syn: true,
    ack: true,
    seq: serverIsn,
    ackNum: (syn.seq + 1) >>> 0,
    mss: serverMss,
  };
  console.log(`2. Server -> Client: SYN-ACK seq=${synAck.seq} ack=${synAck.ackNum} MSS=${synAck.mss}`);

  const negotiatedMss = Math.min(clientMss, serverMss);
  const ack: Segment = {
    ack: true,
    seq: (clientIsn + 1) >>> 0,
    ackNum: (serverIsn + 1) >>> 0,
  };
  console.log(`3. Client -> Server: ACK seq=${ack.seq} ack=${ack.ackNum} -> ESTABLISHED (MSS=${negotiatedMss})`);
}

// Production pattern: bound TCP connect timeout to prevent 127s kernel SYN retry hang
export function boundedConnect(host: string, port: number, timeoutMs = 500): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      sock.destroy(new Error(`ETIMEDOUT after ${timeoutMs}ms during TCP handshake`));
    }, timeoutMs);
    sock.once("connect", () => {
      clearTimeout(timer);
      resolve(sock);
    });
    sock.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

simulateHandshake(true);
simulateHandshake(false);
```
<!-- slide -->
```python
import secrets
import socket


def random_isn() -> int:
    return secrets.randbits(32)


def simulate_handshake(listening: bool, client_mss: int = 1460, server_mss: int = 1400) -> str:
    client_isn = random_isn()
    print(f"1. Client -> Server: SYN seq={client_isn} MSS={client_mss}")

    if not listening:
        print("2. Server -> Client: RST (ConnectionRefusedError)")
        return "CLOSED"

    server_isn = random_isn()
    server_ack = (client_isn + 1) & 0xFFFFFFFF
    print(f"2. Server -> Client: SYN-ACK seq={server_isn} ack={server_ack} MSS={server_mss}")

    client_seq = server_ack
    client_ack = (server_isn + 1) & 0xFFFFFFFF
    negotiated_mss = min(client_mss, server_mss)
    print(f"3. Client -> Server: ACK seq={client_seq} ack={client_ack} -> ESTABLISHED (MSS={negotiated_mss})")
    return "ESTABLISHED"


def bounded_connect(host: str, port: int, timeout_sec: float = 0.5) -> socket.socket:
    """Explicit connect timeout protects threads from 127s Linux SYN backoff."""
    return socket.create_connection((host, port), timeout=timeout_sec)


if __name__ == "__main__":
    simulate_handshake(listening=True)
    simulate_handshake(listening=False)
```
<!-- slide -->
```csharp
using System;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Threading;
using System.Threading.Tasks;

public static class TcpHandshakeDemo
{
    private static uint RandomIsn() => RandomNumberGenerator.GetInt32(int.MaxValue) * 2U;

    public static void SimulateHandshake(bool listening, ushort clientMss = 1460, ushort serverMss = 1400)
    {
        uint clientIsn = RandomIsn();
        Console.WriteLine($"1. Client -> Server: SYN seq={clientIsn} MSS={clientMss}");

        if (!listening)
        {
            Console.WriteLine("2. Server -> Client: RST (SocketError.ConnectionRefused)");
            return;
        }

        uint serverIsn = RandomIsn();
        uint ackToClient = unchecked(clientIsn + 1);
        Console.WriteLine($"2. Server -> Client: SYN-ACK seq={serverIsn} ack={ackToClient} MSS={serverMss}");

        uint ackToServer = unchecked(serverIsn + 1);
        ushort negotiatedMss = Math.Min(clientMss, serverMss);
        Console.WriteLine($"3. Client -> Server: ACK seq={ackToClient} ack={ackToServer} -> ESTABLISHED (MSS={negotiatedMss})");
    }

    public static async Task<TcpClient> BoundedConnectAsync(string host, int port, int timeoutMs = 500)
    {
        var client = new TcpClient();
        using var cts = new CancellationTokenSource(timeoutMs);
        await client.ConnectAsync(host, port, cts.Token);
        return client;
    }

    public static void Main()
    {
        SimulateHandshake(listening: true);
        SimulateHandshake(listening: false);
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows

Run these commands to capture the real 3-way handshake on the wire, inspect kernel `SYN` and `Accept` queues, and observe `RST` vs `SYN` retransmission backoff:

### 1. Capture Absolute ISNs, Flags, and Negotiated `MSS` with `tcpdump -S`

```bash
sudo tcpdump -i eth0 -S -nn 'tcp[tcpflags] & (tcp-syn|tcp-rst) != 0' -c 4
```

**Expected Output:**

```text
11:02:10.001120 IP 192.168.1.42.54112 > 198.51.100.10.443: Flags [S], seq 2894112004, win 64240, options [mss 1460,sackOK,TS val 190123 ecr 0,nop,wscale 7], length 0
11:02:10.049331 IP 198.51.100.10.443 > 192.168.1.42.54112: Flags [S.], seq 1044982112, ack 2894112005, win 65160, options [mss 1440,sackOK,TS val 98122 ecr 190123,nop,wscale 7], length 0
```

Notice `-S` disables relative sequence numbers so you see the true random 32-bit `ISN` (`2894112004`), the server's `ack` (`2894112005 = ISN + 1`), and each side's advertised `mss` (`1460` vs `1440`).

### 2. Inspect Kernel Listening Backlog & `SYN_RECV` Queue State with `ss`

```bash
ss -lnt && ss -ant state syn-recv
```

**Expected Output:**

```text
State   Recv-Q  Send-Q  Local Address:Port   Peer Address:Port
LISTEN  0       4096    0.0.0.0:443          0.0.0.0:*
State   Recv-Q  Send-Q  Local Address:Port   Peer Address:Port
```

For a `LISTEN` socket, `Recv-Q` shows the current number of completed connections waiting in the **Accept queue** for `accept()`, while `Send-Q` displays the configured backlog ceiling (`4096`).

### 3. Inspect `tcp_syn_retries`, `tcp_syncookies`, and `somaxconn` + Test `RST`

```bash
sysctl net.ipv4.tcp_syn_retries net.ipv4.tcp_syncookies net.core.somaxconn
nc -zv 127.0.0.1 65432
```

**Expected Output:**

```text
net.ipv4.tcp_syn_retries = 6
net.ipv4.tcp_syncookies = 1
net.core.somaxconn = 4096
nc: connect to 127.0.0.1 port 65432 (tcp) failed: Connection refused
```

---

## Pause and Think

> [!exercise] The round trip to a server is 100 milliseconds. Your phone's first SYN is lost. How long until the connection is established? Decide before you open the answer.

<details><summary>Answer</summary>

About 1.1 seconds. Your phone waits one full second for a reply that never comes. Then it resends the SYN, and the handshake takes one round trip: 100 milliseconds. One lost packet, and the page feels stuck for a second.

![A bar: one second of waiting for a reply that never comes, then 0.1 seconds for the resend and the handshake: about 1.1 seconds.](images/figure-8.svg)

*Figure 8. The pause-and-think answer: a lost first SYN costs the one-second retransmission wait, then one round trip, about 1.1 seconds in all.*

</details>

---

## Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Handshake Sequence & ACK Math Through First Payload</strong></summary>

A client selects random `ISN = 42,000`, the server selects `ISN = 81,500`, and right after the handshake completes the client sends a `500-byte` HTTP request. List `(Flags, seq, ack)` for all four segments (`SYN`, `SYN-ACK`, `ACK`, and the `500 B` request).

**Answer:**
1. Client -> Server: `SYN`, `seq = 42,000`, `ack = -`
2. Server -> Client: `SYN + ACK`, `seq = 81,500`, `ack = 42,001`
3. Client -> Server: `ACK`, `seq = 42,001`, `ack = 81,501`
4. Client -> Server: `PSH + ACK` (`500 B`), `seq = 42,001`, `ack = 81,501` (server replies `ACK 42,501`)

</details>

<details><summary><strong>Checkpoint 2: Diagnosing Immediate Failure vs. 2-Minute Hang</strong></summary>

Calling Service A on port `8080` fails with `Connection refused` in `2 ms`. Calling Service B on port `8080` hangs and fails with `Connection timed out` after `127 s`. What is happening on the wire for each?

**Answer:** Service A's host OS is alive and reachable, saw nothing listening on `8080`, and returned an immediate **TCP `RST`**. Service B's `SYN` packets received **zero reply** (silent firewall `DROP` or dead host), causing Linux to retry `SYN` six times (`1 + 2 + 4 + 8 + 16 + 32 + 64 = 127 s`) before aborting.

</details>

<details><summary><strong>Checkpoint 3: How SYN Cookies Survive Half-Open Floods</strong></summary>

During a massive `SYN` flood from spoofed source IPs, `net.ipv4.tcp_max_syn_backlog` fills up. With `tcp_syncookies = 1`, how does the Linux kernel validate a legitimate client's final `ACK` without storing any per-SYN memory slot?

**Answer:** Instead of storing the half-open connection in the `SYN` queue, the server computes a cryptographic hash of the 4-tuple, timestamp, and client's `MSS` index, and embeds it into its own **32-bit server `ISN`** inside the `SYN-ACK`. When a real client answers with `ACK = server_ISN + 1`, the server subtracts `1`, recomputes the hash, verifies validity, and reconstructs the socket directly into `ESTABLISHED`.

</details>

---

## Common Mistakes & Troubleshooting

- **"There's a handshake for every request."** No. It happens once per connection, and many requests can reuse it ([lesson 29](../29-connection-pooling-and-keep-alive/README.md)).
- **"The handshake makes the connection secure."** No. It only agrees numbers. Encryption is TLS, which starts after it ([lesson 21](../21-tls-1-3-handshake/README.md)).
- **"ACK 4,001 means 4,001 bytes were received."** No. It means: the next number I expect is `4,001`.
- **Measuring only total request latency.** Without a separate **connect-latency histogram**, handshake stalls (`1 s`, `3 s`, `7 s` steps) vanish into a blended average.
- **Relying on server access logs to find handshake failures.** Dropped `SYN`s and accept-queue overflows never reach the application; read `ss -lnt` and `nstat` counters instead.
- **Passing a tiny `listen()` backlog (e.g. `128`) and assuming `somaxconn` fixes it.** The accept queue is `min(backlog, somaxconn)`; raise both.
- **Using silent `DROP` rules inside private networks.** A forgotten rule becomes a `127 s` hang instead of an instant `connection refused`.
- **Treating a successful `connect()` as "the service is healthy".** The kernel can complete the handshake for an application that is deadlocked (the Lesson 06 L4-vs-L7 trap).
- **Churning short-lived connections to one destination.** Each one costs a handshake RTT, an ephemeral port, and `TIME_WAIT` (Lessons 04 and 11); pool them.
- **Setting only HTTP read timeouts without a TCP connect timeout.** Read timeouts do not start until the handshake finishes; an un-bounded `connect()` against a silently dropped IP stalls threads for `~127 s` (`tcp_syn_retries=6`).

---

## Recap in Three Lines

1. Before any data, TCP sends three messages: SYN, SYN-ACK and ACK.
2. Each side sends a random starting number, and the other confirms it with that number plus one.
3. It costs one round trip, and a lost SYN waits a full second, or more.

---

## Interview Practice Questions

Exactly **12 questions**, tagged by kind: **[BASIC]** (Q1-Q4, definitions), **[SCENARIO]** (Q5-Q8, apply it to a system), and **[TRICKY]** (Q9-Q12, deep follow-ups). Answer out loud for 30 seconds before opening the solution.

<details>
<summary><strong>Q1: Explain the TCP three-way handshake. [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
1. **SYN:** the client picks a random **ISN** (say `4000`) and sends `SYN, seq=4000` (+ options: MSS, window scale, SACK, timestamps). *State: `SYN_SENT`.*
2. **SYN-ACK:** the server (in `LISTEN`) picks its own random ISN (`9000`) and replies `SYN+ACK, seq=9000, ack=4001`. *State: `SYN_RCVD`.*
3. **ACK:** the client replies `ACK, ack=9001` — and may carry the first data. *Both sides: `ESTABLISHED`.*
The `SYN` consumes one sequence number, hence `+1`; the first data byte is `4001` (client) and `9001` (server). The handshake costs **one RTT** before the client can send data and is paid **once per connection**.

</details>

<details>
<summary><strong>Q2: Why three messages and not two? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Each **direction** needs its own starting number **sent and confirmed** — four jobs (client sends ISN, server confirms it, server sends ISN, client confirms it). The server combines its confirmation and its own `SYN` into one `SYN-ACK`, so **four jobs fit in three messages**. With only two, the server would never learn that the client received *its* ISN, so the server-to-client direction is unconfirmed. It also protects against **old duplicate SYNs**: the final ACK lets the server verify the client really wants *this* connection. (Four messages would also work, but is wasteful.)

</details>

<details>
<summary><strong>Q3: Which states do the client and the server pass through, and where does the connection wait on the server? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
**Client:** `CLOSED -> SYN_SENT -> ESTABLISHED`. **Server:** `LISTEN -> SYN_RCVD (half-open) -> ESTABLISHED`. Linux keeps two queues: the **SYN queue** (half-open, sized by `tcp_max_syn_backlog`) and the **accept queue** (fully established, waiting for `accept()`, capped at `min(listen backlog, somaxconn)`). The application only sees a connection when it calls `accept()`. Observe with `ss -ant state syn-recv`, and for `LISTEN` sockets `ss -lnt` where **`Recv-Q` = current accept-queue depth** and **`Send-Q` = its limit**.

</details>

<details>
<summary><strong>Q4: What is the MSS, and how is it negotiated? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
The **Maximum Segment Size** is the largest TCP *payload* per segment. Each side announces its MSS in a **`SYN` option**; the connection uses the **minimum** of the two. On Ethernet `MSS = MTU - IP header - TCP header = 1500 - 20 - 20 = 1460` (IPv6: `1440`). The same `SYN` also negotiates **window scale** (windows `> 64 KiB`), **SACK-permitted**, and **timestamps**. Options are **only** negotiated in the `SYN`/`SYN-ACK`, which is why middleboxes that strip them hurt performance, and why **MSS clamping** (`--clamp-mss-to-pmtu`) is the standard fix for MTU black holes behind tunnels/VPNs.

</details>

<details>
<summary><strong>Q5: One server returns "connection refused" and another "connection timed out". What is the difference on the wire? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
**Refused:** the host's kernel answers the `SYN` with an immediate **`RST`** (`~1 RTT`, a few ms): the machine is up and reachable but **nothing is listening** on that port (or a firewall *rejects*). **Timed out:** **no reply at all**; the client resends the `SYN` at `1, 3, 7, 15, 31, 63 s` and gives up at **`~127 s`** (Linux): a firewall/security group **dropping** packets, a dead host, a routing blackhole, or a full queue. Diagnose: refused -> `ss -lnt` on the host, check the bind address/port; timed out -> SG/NACL/firewall rules, routes, `traceroute`/`mtr`, `tcpdump` on both ends (does the SYN arrive? is there a SYN-ACK?), and `nstat` for `ListenOverflows`.

</details>

<details>
<summary><strong>Q6: What is a SYN flood, and how do you defend against it? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
An attacker sends many `SYN`s (often from **spoofed** sources) and never completes the handshake. Each leaves a **half-open** slot for up to `~63 s`, so just `backlog / 63 s ≈ 65 SYN/s` fills a `4096`-entry queue and real users cannot connect. Defences: **SYN cookies** (`tcp_syncookies=1`: no state, validation data encoded in the server ISN), larger `tcp_max_syn_backlog` and `somaxconn`, lower `tcp_synack_retries`, **rate limiting** (`iptables hashlimit`, nftables), **upstream scrubbing** (cloud LB, CDN, DDoS protection absorbs the SYNs), **BCP 38 ingress filtering**, and eBPF/XDP filters. Trade-off: cookies drop some options unless timestamps are on.

</details>

<details>
<summary><strong>Q7: You set a 200 ms read timeout on your Redis client, yet requests to a newly added shard hang for ~2 minutes and exhaust the thread pool. Why? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
**Read timeouts start only after `ESTABLISHED`.** The new shard's security group **silently drops** `SYN`s, so `connect()` blocks in the kernel for the full SYN-retry schedule: **`1+2+4+8+16+32+64 = 127 s`** per attempt, holding a worker the whole time. Fix: set an explicit **`connectTimeout` (`<= 500 ms`)** separately from read/write timeouts; add **circuit breakers/bulkheads** so one dead dependency cannot absorb all workers; run **TCP reachability canaries** during blue/green cutovers; prefer explicit **REJECT** (RST/ICMP) in internal ACLs so mistakes fail in milliseconds; and use async/non-blocking I/O with deadlines. Always give every network call **connect, TLS, read, and total** deadlines.

</details>

<details>
<summary><strong>Q8: During traffic spikes clients see occasional exactly-1-second connect latencies, but CPU is idle and nothing errors. What do you check? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
A **dropped `SYN` or final `ACK`** is retried after **1 s** (the initial RTO). The most common server-side cause is **accept-queue overflow**: the app stalls (GC pause, blocking call, too few acceptors) and the queue (`min(backlog, somaxconn)`) fills, so the kernel **drops/ignores** new handshakes. Check `ss -lnt` (`Recv-Q` close to `Send-Q`), `nstat -az TcpExtListenOverflows TcpExtListenDrops`, `TcpExtTCPReqQFullDrop`; also **conntrack table full**, NIC/ECMP drops, and `tcp_max_syn_backlog`. Fixes: raise `somaxconn` **and** the app's `listen()` backlog (Go, Nginx `backlog=`, Node `server.listen(port, backlog)`), use `SO_REUSEPORT` with multiple acceptors, fix the stall, and **pool connections** to avoid bursts of new handshakes.

</details>

<details>
<summary><strong>Q9: Why are initial sequence numbers random instead of starting at 0? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Two reasons. **(1) Stale segments:** a delayed packet from a *previous* incarnation of the same 4-tuple must not land inside the new connection's window and be accepted as data. **(2) Security:** if ISNs were predictable, an off-path attacker could **blindly spoof** a connection or inject data/RSTs (Mitnick-style attacks). RFC 6528 recommends `ISN = M + F(src IP, src port, dst IP, dst port, secret)`, where `M` is a ~4 µs clock tick (so ISNs for the same 4-tuple still grow, which helps `TIME_WAIT` reuse, Lesson 11) and `F` is a keyed hash. Randomness is **per direction**: both sides pick their own.

</details>

<details>
<summary><strong>Q10: How does the handshake affect latency, and what reduces its cost? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
It adds **1 RTT before the first request byte**, and TLS adds **1** (TLS 1.3) or **2** (TLS 1.2) more, so a cold HTTPS call costs `2-3 RTT` before the request — and `5 serial cold hops x 225 ms ≈ 1.1 s` cross-ocean. Remedies, in order: **reuse connections** (keep-alive, pools, HTTP/2 multiplexing); **move closer** (CDN/edge termination, regional deploys); **TLS 1.3 + session resumption**; **TCP Fast Open** (data in the `SYN`; limited by middlebox support and replay/security caveats); **QUIC/HTTP/3** (transport + TLS in 1 RTT, 0-RTT resumption); **preconnect** hints. Also **avoid** churning connections: it burns ephemeral ports (Lesson 04) and `TIME_WAIT` (Lesson 11).

</details>

<details>
<summary><strong>Q11: What happens if the final ACK of the handshake is lost? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
The client believes it is `ESTABLISHED` and may immediately send data; the server is still in `SYN_RCVD`. **Two repair paths:** (1) the client's **first data segment carries `ACK = server_ISN + 1`**, which completes the handshake at the server (so the loss is silent if the client talks first); (2) if the client waits for the server to speak first (SMTP, MySQL, SSH banner), the server's **retransmitted `SYN-ACK`** (`1, 3, 7, 15, 31 s`, `tcp_synack_retries`) makes the client **re-send the ACK**. Failure mode: if the server's accept queue is full, Linux (default `tcp_abort_on_overflow=0`) **ignores** the final ACK, so the **client sees a successful connect** but the server never delivers it — requests then stall until retransmits succeed. That asymmetry explains "connected but no response" under load.

</details>

<details>
<summary><strong>Q12: How do SYN cookies work, what do they sacrifice, and why isn't TCP Fast Open universally enabled? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
**SYN cookies:** when the SYN queue overflows, the server stops storing state and encodes `hash(4-tuple, coarse timestamp, secret)` plus a small **MSS index** into the **ISN of its `SYN-ACK`**. A legitimate client answers with `ack = ISN + 1`; the server subtracts `1`, recomputes and verifies the hash, rebuilds the socket directly into `ESTABLISHED`, and a spoofed source never completes. **Sacrifices:** only a few MSS values can be encoded, and options (window scale, SACK) are lost unless TCP timestamps carry them — so throughput is slightly worse during an attack, and cookies are used only **on overflow**. **TCP Fast Open** saves 1 RTT on **repeat** connections by sending data in the `SYN` with a cookie, but many middleboxes drop SYNs with data/unknown options, the data may be **replayed** (so the first request must be idempotent), and it needs client+server opt-in — which is why **QUIC** (0-RTT with similar replay caveats) largely replaced it as the answer to handshake latency.

</details>

---

## One-Page Master Cheat Sheet

```text
====================================================================================================
                    TCP PART 2: THE THREE-WAY HANDSHAKE — ONE-PAGE CHEAT SHEET
====================================================================================================
THE HANDSHAKE (1 RTT, once per connection, NO data yet — data may ride with the final ACK)
  1 Client -> Server  SYN            seq = ISN_c (random)                          client: SYN_SENT
  2 Server -> Client  SYN + ACK      seq = ISN_s (random), ack = ISN_c + 1         server: SYN_RCVD (half-open)
  3 Client -> Server  ACK            seq = ISN_c + 1,      ack = ISN_s + 1         both : ESTABLISHED
  * SYN consumes ONE sequence number => first data byte = ISN + 1.   4 jobs (2 ISNs sent + confirmed) = 3 msgs.
  * Options live ONLY in SYN/SYN-ACK: MSS (min of both: 1460 v4 / 1440 v6), window scale, SACK-ok, timestamps.

FAILURE SIGNATURES
  RST back, ~1 RTT           -> "connection refused": host up, nobody listening / REJECT rule
  Silence                    -> "timed out": SYN retries at 1,3,7,15,31,63 s, abort at 127 s (Linux; Win ~21 s; mac ~75 s)
  Idle CPU + 1.0 s connects  -> accept-queue overflow / SYN drop (retry after 1 s) -> check ListenOverflows
  Connected but no response  -> final ACK ignored on full accept queue (tcp_abort_on_overflow=0)

NUMBERS
  Time to connect with k lost SYNs @ RTT 100 ms : k=1 1.1 s | k=2 3.1 s | k=3 7.1 s | k=6 63.1 s | all lost 127 s
  P(handshake retried) = 1-(1-p)^2 ~= 2p  (p=1% -> 2% of connects pay +1 s: p98 explodes, mean looks fine)
  SYN-flood: attack rate to fill queue = backlog / 63 s  (4096 -> ~65 SYN/s ~ 28 kbit/s)  -> use SYN COOKIES
  Accept-queue depth ~= peak_conn_rate x app_stall  (5000/s x 0.1 s = 500)    cap = min(listen backlog, somaxconn)
  Cold hop cost = 1 RTT (+1 TLS1.3 / +2 TLS1.2):  5 serial cold calls x 225 ms ~= 1.1 s  -> POOL connections

KERNEL KNOBS (Linux)
  tcp_syn_retries=6 (127 s) | tcp_synack_retries=5 (63 s) | tcp_max_syn_backlog 1024-4096 | somaxconn 4096
  tcp_syncookies=1 (on overflow) | tcp_abort_on_overflow=0 | TCP_FASTOPEN opt-in (RFC 7413)

OBSERVE
  tcpdump -S -nn 'tcp[tcpflags] & (tcp-syn|tcp-rst) != 0'     ss -lnt (Recv-Q/Send-Q = accept q depth/limit)
  ss -ant state syn-recv       nstat -az TcpExtListenOverflows TcpExtListenDrops TcpExtSyncookiesSent TcpAttemptFails
  Instrument: connect-latency HISTOGRAM per dependency | ListenOverflows rate | timeouts:refused ratio.
  Server access logs NEVER show dropped handshakes.

RULES
  1 ALWAYS set connectTimeout (<=500 ms internal) separate from read/total timeouts.   2 Reuse connections.
  3 Size listen backlog + somaxconn for bursts.   4 Prefer REJECT over DROP on internal ACLs.   5 SYN cookies on.
====================================================================================================
```

---

## Free PDF notes

Download these notes as a printable PDF, with every picture, the handshake table and the interview answers: [SD-N-009.pdf](https://backendroadmap.com/notes/system-design/SD-N-009.pdf).

## Sources

- [RFC 9293: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293), the three-way handshake, connection states and RST.
- [RFC 6528: Defending against Sequence Number Attacks](https://www.rfc-editor.org/rfc/rfc6528), why initial sequence numbers are random.
- [RFC 4987: TCP SYN Flooding Attacks and Common Mitigations](https://www.rfc-editor.org/rfc/rfc4987), SYN floods and SYN cookies.
- [RFC 6298: Computing TCP's Retransmission Timer](https://www.rfc-editor.org/rfc/rfc6298), the 1-second initial timeout and doubling.
- [RFC 7413: TCP Fast Open](https://www.rfc-editor.org/rfc/rfc7413), sending data in the SYN on repeat connections.
- [Linux tcp(7) manual page](https://man7.org/linux/man-pages/man7/tcp.7.html), `tcp_syn_retries` (6 by default).

## Next

Next comes [lesson 10, TCP part 3](../10-tcp-flow-and-congestion-control/README.md): how TCP decides how fast to send, without drowning the receiver or the network. The [track overview](../README.md) lists the whole series.
