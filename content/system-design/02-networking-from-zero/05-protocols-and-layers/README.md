# Lesson 05: Protocols and Layers: Agreed Languages, and Why We Stack Them

> **Prerequisites:** [Lesson 02: Packets](../02-packets/README.md), [Lesson 03: IP Addresses](../03-ip-addresses/README.md), and [Lesson 04: Ports and Sockets](../04-ports-and-sockets/README.md) ([Track Overview](../README.md)).  
> **Estimated Reading Time:** 30 minutes  
> **Target Audience:** Developers understanding how HTTP, TCP, IP, and Wi-Fi fit together and backend engineers debugging multi-layer protocol mismatches, encapsulation overhead, and frame drops cleanly layer by layer.  
> **Free PDF Notes:** [Download SD-N-005.pdf](https://backendroadmap.com/notes/system-design/SD-N-005.pdf)

> [!NOTE]
> **In one line:** a protocol is a set of agreed rules so two machines understand each other; the internet splits the work into four layers (application, transport, network and link), each with its own protocol, and each layer adds its own header on the way down and removes it on the way up.

> [!TIP]
> **The Golden Rule of Protocols & Layers:** A **protocol** is an agreed-upon message grammar so software from different vendors interoperates cleanly, while **layering** puts each concern—App grammar (**HTTP**), Reliable delivery & Ports (**TCP/UDP**), Global routing (**IP**), and Physical hop transfer (**Wi-Fi/Ethernet**)—in an isolated box wrapped by **encapsulation**. Because each layer adds only its own small envelope (`40 B` TCP+IP header on a `1,500 B` frame, `< 3%` overhead) and peels only its own header at the receiver, swapping copper cables for fiber optics breaks nothing in your web browser!

---

## Words You'll Meet Today

| Word | Everyday Meaning | Role in the Protocol Stack |
| :--- | :--- | :--- |
| **Protocol** | An exact written set of rules governing message format, timing, and error replies. | Lets an Android app speak seamlessly to a Linux Rust server (`HTTP`, `TCP`, `IP`). |
| **Layer** | One independent box in a clean stack where each level handles strictly one job. | Four TCP/IP layers: **Application**, **Transport**, **Network**, **Link**. |
| **Header** | Label tacked onto the front of data by a layer before handing it down. | `HTTP` text -> `TCP` ports/seq -> `IP` src/dst addresses -> `MAC` frame header. |
| **Encapsulation** | Wrapping data progressively inside nested envelopes from top layer down to the wire. | Data -> Segment -> Packet -> Frame -> Bits -> reverse **decapsulation** upward. |
| **Segment** | **Transport layer (TCP/UDP)** chunk holding your app data + port & order headers. | Ensures ordered, reliable byte streams (`TCP`) or fast datagrams (`UDP`). |
| **Packet** | **Network layer (IP)** parcel wrapping a segment inside source + destination IP addresses. | Routed hop by hop across intermediate internet routers toward the target host. |
| **Frame** | **Link layer (Ethernet/Wi-Fi)** package adding local MAC addresses + a trailing error check (**FCS**). | Travels strictly across one physical cable or wireless hop at a time. |
| **MTU** | *Maximum Transmission Unit* (`1,500 bytes` on Ethernet) bounding total packet size per frame. | Leaves **`1,460 bytes`** of payload (`1,500 - 20 IP - 20 TCP`) cleanly below `3%` overhead. |

---

## What It Is vs. What It Isn't

"Protocol", "layer", "model" and "stack" are used loosely in meetings. Pin them down:

| Term | Precise Meaning | What It Is **NOT** | Production Example |
| :--- | :--- | :--- | :--- |
| **Protocol** | A written rulebook: message format, order, timing, and error behaviour between two peers *at the same layer*. | Not software, not a wire, not a product — it is a *specification* that many implementations follow. | HTTP (RFC 9110), TCP (RFC 9293), IP (RFC 791). |
| **Layer** | One job in a stack, talking to its **peer** layer on the remote host and only to the layers directly above/below locally. | Not a physical box. Layers are logical; one process or NIC chip can span several. | Link = NIC driver; Transport = kernel TCP; Application = your Go/Node code. |
| **TCP/IP model** | The practical **4-layer** stack the real internet runs (RFC 1122): Application, Transport, Internet/Network, Link. | Not "one protocol called TCP/IP" — it is a family named after its two most famous members. | What `tcpdump` and the Linux kernel actually implement. |
| **OSI model** | A **7-layer** teaching/reference model (Lesson 06) that splits Application into Application/Presentation/Session and Link into Data Link/Physical. | Not what packets literally implement; no production stack has a separate "Session layer" binary. | The vocabulary in interviews: "L4 load balancer", "L7 firewall". |
| **Encapsulation** | Each layer **prepends its own header** (Link also appends a trailer) to the payload from above. | Not encryption and not compression — nothing is hidden or shrunk; it is labelling. | `HTTP` -> `TCP segment` -> `IP packet` -> `Ethernet frame`. |

> **Layering is an agreement about who may read what.** Routers peel only to the IP header; the two endpoints peel everything. Middleboxes that cheat (NAT, firewalls, L7 load balancers) trade simplicity for power — and are the usual source of "mystery" bugs.

---

## Visual Mental Models & Architecture

### Why Protocols Must Be Exact Rules (Not Unwritten Habits)

Humans run unwritten protocols on every phone call: `"Hello?"` -> `"Hi, it's Ravi"` -> chat -> `"Bye!"`. Machines cannot guess vague social cues—so **HTTP (`RFC 9110`)**, **TCP (`RFC 9293`)**, and **IP (`RFC 791`)** write every keyword, byte offset, and status code (`200 OK`, `400 Bad Request`) in public RFC standards so teams at Google, Mozilla, Apple, and startups worldwide build compatible software without talking to each other:

![Figure 1. A protocol is a set of agreed rules. A phone call follows unwritten ones; HTTP writes them down exactly, so machines from different companies understand each other.](images/figure-1.svg)

*Figure 1. A protocol is a set of agreed rules. A phone call follows unwritten ones; HTTP writes them down exactly, so machines from different companies understand each other.*

### The Gift Parcel Analogy: Four Stacked Jobs

We now have pieces from earlier lessons—packets ([Lesson 02](../02-packets/README.md)), IPs ([Lesson 03](../03-ip-addresses/README.md)), and ports ([Lesson 04](../04-ports-and-sockets/README.md)). Think of mailing a birthday gift from **Bengaluru to Pune** through four completely decoupled helpers:

![Figure 2. The gift, layer by layer: the card is the application layer, the tracking number is transport, the address is the network layer, and the van is the link layer.](images/figure-2.svg)

*Figure 2. The gift, layer by layer: the card is the application layer, the tracking number is transport, the address is the network layer, and the van is the link layer.*

1. **You & Your Friend (Application Layer — HTTP):** Write a card `"Happy birthday!"` inside the box. Neither the courier nor the van driver reads the card.
2. **Courier Desk Clerk (Transport Layer — TCP / UDP):** Sticks on a **tracking number, piece count, and person's name (Port)** so missing boxes are spotted and ordered (`segments`).
3. **Sorting Hub Dispatcher (Network Layer — IP):** Writes **"From Bengaluru -> To Pune, flat 5" (IP address)** so city hubs steer the parcel toward the destination building (`packets`).
4. **Delivery Van Driver (Link Layer — Wi-Fi / Ethernet):** Moves the sealed carton across **one road stretch (one hop)** into the next hub or flat door (`frames`).

### Encapsulation Down, Decapsulation Up

```mermaid
flowchart TB
    App["4. Application (HTTP / DNS): 'GET /shoes' (Data)"] --> Trans["3. Transport (TCP / UDP): + Ports & Seq (Segment)"]
    Trans --> Net["2. Network (IPv4 / IPv6): + Src/Dst IPs (Packet)"]
    Net --> Link["1. Link (Wi-Fi / Ethernet): + Next-Hop MAC + FCS Trailer (Frame)"]
    Link --> Wire["Physical Wire / Radio Waves -> Arrives at Server -> Peel Layer-by-Layer Upward!"]
```

On the sender, each layer wraps the layer above it (**encapsulation**):

![Figure 3. Encapsulation on the way down: the data gets a TCP header (a segment), then an IP header (a packet), then a link header and trailer (a frame).](images/figure-3.svg)

*Figure 3. Encapsulation on the way down: the data gets a TCP header (a segment), then an IP header (a packet), then a link header and trailer (a frame).*

At the receiving server, each layer peels **strictly its own envelope** (**decapsulation**) and hands the untouched inside package straight upward until `"GET /shoes"` lands cleanly inside your backend handler:

![Figure 4. On the way up each layer removes only its own header. The sizes: 20 bytes of IP header and at least 20 of TCP leave up to 1,460 bytes of data in a 1,500-byte packet.](images/figure-4.svg)

*Figure 4. On the way up each layer removes only its own header. The sizes: 20 bytes of IP header and at least 20 of TCP leave up to 1,460 bytes of data in a 1,500-byte packet.*

---

## Real Numbers & Systematic Reference Grids

### The 4-Layer TCP/IP Reference Stack

| Layer | Unit Name | Example Protocols | Primary Job & Scope | Standard Header Overhead |
| :--- | :--- | :--- | :--- | :--- |
| **4. Application** | **Data / Message** | **HTTP/HTTPS, DNS, SSH, SMTP** | Speaks the app's structured grammar (`GET /shoes`, `200 OK`). | Application-specific (`HTTP` headers etc.) |
| **3. Transport** | **Segment (TCP) / Datagram (UDP)** | **TCP, UDP, QUIC** | Delivers bytes to the right **port** (`:443`) + orders & recovers lost pieces (**TCP**; Lesson 08). | **`20 bytes`** base TCP (`+12 B` w/ timestamps option) |
| **2. Network** | **Packet** | **IPv4, IPv6, ICMP** | Routes packets end-to-end across networks using **IP addresses**. | **`20 bytes`** base IPv4 (`40 bytes` IPv6) |
| **1. Link** | **Frame** | **Ethernet (wired), Wi-Fi (802.11)** | Moves a frame over **one physical hop** + rejects electrical glitches via **FCS trailer**. | Ethernet `14 B` header + **`4 B` FCS trailer** (outside the `1,500 B` IP MTU) |

> [!NOTE]
> **Layer Overhead Math (`< 3%`):** On standard Ethernet (`1,500`-byte MTU), `20 B` IPv4 + `20 B` TCP consume **`40 bytes`**, leaving **`1,460 bytes` MSS** of application data (`40 ÷ 1,460 < 3%` tax). For a `3 MB` photo (`~2,055` chunks), encapsulation guarantees every hop knows where to route and verify checksums cleanly for negligible bandwidth cost. *(Note: Lesson 06 covers the classic **7-layer OSI model** used heavily in certification exams alongside this practical **4-layer TCP/IP stack** from RFC 1122!)*

### Header Overhead & Efficiency Math

Let $H$ be the total header bytes per packet and $S$ the payload bytes. **Efficiency** (goodput share) is

$$\eta = \frac{S}{S + H}$$

On Ethernet the *wire* also carries things the IP MTU does not count: **preamble + start delimiter `8 B`**, **Ethernet header `14 B`**, **FCS `4 B`**, and the **inter-frame gap `12 B`** — `38 B` of per-frame link overhead in total.

| Scenario | IP + TCP Headers | Payload $S$ | Efficiency on the **IP MTU** | Efficiency on the **physical wire** (adds `38 B`) |
| :--- | :--- | :--- | :--- | :--- |
| IPv4 + TCP, no options, `MTU 1500` | `20 + 20 = 40 B` | `1,460 B` | `97.3%` (`1460/1500`) | `94.9%` (`1460/1538`) |
| IPv4 + TCP + Timestamps (Linux default) | `20 + 32 = 52 B` | `1,448 B` | `96.5%` | `94.1%` (`1448/1538`) |
| IPv6 + TCP + Timestamps | `40 + 32 = 72 B` | `1,428 B` | `95.2%` | `92.8%` (`1428/1538`) |
| **Jumbo frames** `MTU 9000`, IPv4 + TCP | `40 B` | `8,960 B` | `99.6%` | `99.2%` (`8960/9038`) |
| **Tiny RPC**, 1-byte payload | `40 B` | `1 B` | `2.4%` | `1.2%` — plus a 64 B minimum Ethernet frame |

**Packet-count math (why small payloads hurt):** a 3 MB photo needs $\lceil 3{,}000{,}000 / 1{,}460 \rceil = 2{,}055$ packets. A `10 Gbps` link at full MTU is about $10^{10} / (1538 \times 8) \approx 812{,}744$ packets/s; with 64-byte frames that jumps to `~14.88 M` packets/s. Routers, NICs, and `conntrack` run out of **packets per second** long before **bits per second** — an observability trap for chatty microservices.

**Serialization delay** (time to push one frame onto a link, $t = \frac{8 \cdot L}{B}$) shows that layers add *time* as well as bytes:

| Frame Size | `10 Mbps` | `1 Gbps` | `10 Gbps` |
| :--- | :--- | :--- | :--- |
| `1,538 B` on the wire | `1.23 ms` | `12.3 µs` | `1.23 µs` |
| `64 B` on the wire (min frame + preamble + IFG = 84 B) | `67 µs` | `0.67 µs` | `0.067 µs` |

**Overlay/tunnel tax:** every extra encapsulation steals payload from the same `1,500 B` budget — **VXLAN +50 B**, **GRE +24 B**, **WireGuard +60 B (IPv4)**, **PPPoE +8 B** (so DSL uses `MTU 1492`). Forgetting this is the root of the classic "small requests work, big uploads hang" bug (see Interview Q8).

### The Observability Gap: Which Layer Is Telling You What?

| Layer | What You Can Measure | Tool / Metric | What It **Hides** |
| :--- | :--- | :--- | :--- |
| **Link** | Frame errors, FCS/CRC drops, speed/duplex, ring-buffer overruns | `ip -s link`, `ethtool -S eth0` (`rx_crc_errors`, `rx_dropped`) | Whether the app noticed anything — **TCP retransmits mask link loss** from HTTP latency graphs until p99 explodes. |
| **Network** | Routing path, TTL, ICMP errors, fragmentation / PMTU failures | `traceroute`/`mtr`, `ip route get`, `nstat -a` (`IpInDiscards`, `IcmpInDestUnreachs`) | Which *application* flow is affected; ICMP is often filtered so failures look like silence. |
| **Transport** | Retransmits, RTT, resets, queue depths, zero-window | `ss -ti`, `nstat -az TcpRetransSegs`, `netstat -s` | Whether retransmits are from congestion, a bad Wi-Fi link, or an overloaded receiver. |
| **Application** | Status codes, latency percentiles, TLS errors | Access logs, APM traces, `curl -w` timings | The 3 layers below: a `502` or `400` says *what* failed, never *which layer*. |
| **All (ground truth)** | Actual bytes on the wire per layer | `tcpdump -i any -nn -vv`, Wireshark (shows nested Ethernet > IP > TCP > TLS/HTTP) | Encrypted payloads (TLS) — you still see layers 1-4, not the HTTP inside. |

**Rule:** debug **bottom-up** (Link -> Network -> Transport -> Application) and stop at the first layer that fails. `ping` proves Network; `nc -zv host port` proves Transport; `curl -v` proves Application.

---

---

## What Goes Wrong & Production War Story Post-Mortem

Because layers have crisp boundaries, failures stay cleanly **isolated or cleanly surfaced**:

![Figure 5. What goes wrong: a damaged frame is dropped by the link layer and resent by TCP, and a protocol mismatch (plain HTTP to an HTTPS port) gets an error.](images/figure-5.svg)

*Figure 5. What goes wrong: a damaged frame is dropped by the link layer and resent by TCP, and a protocol mismatch (plain HTTP to an HTTPS port) gets an error.*

* **Microwave noise corrupts a Wi-Fi frame (Link drops -> TCP recovers):** The Link layer spots a bad **Frame Check Sequence (FCS)** trailer checksum and silently discards the mangled frame; the **Transport layer (TCP)** catches the missing sequence gap and retransmits cleanly ([Lesson 08](../08-tcp-sequence-numbers-and-acks/README.md)). Your **Application layer (`HTTP` handler)** never even knows radio interference occurred!
* **Wrong Application Protocol on the right port (TLS port `443` fed plain HTTP):** Transport and Network succeed (`198.51.100.10:443` accepts TCP!), then the server expects a **TLS ClientHello** binary handshake instead of ASCII `"GET / HTTP/1.1"`—returning `400 Bad Request (The plain HTTP request was sent to HTTPS port)`.

### SEV-2 Post-Mortem: Plain HTTP Inside an HTTPS ALB Target Group Loop

#### Incident Overview
* **Severity:** SEV-2 (`100%` `502 Bad Gateway` Errors Across One Newly Deployed Billing Region)
* **Detection Time:** `12 seconds` after automated Blue/Green DNS switchover
* **Resolution Time:** `9 minutes`
* **Impact:** Every checkout call failed with `502 Bad Gateway` immediately after cutover even though ECS container health checks passed cleanly on local HTTP ports.

#### What Happened
```mermaid
sequenceDiagram
    autonumber
    actor Browser as "User Browser"
    participant ALB as "Load Balancer (:443 TLS Terminated)"
    participant Proxy as "Internal Envoy Sidecar (:8443 HTTPS)"
    participant App as "Payment Container (:8080 Plain HTTP)"

    Browser->>ALB: "HTTPS GET /checkout (TLS encrypted)"
    Note over ALB: "ALB terminates TLS cleanly -> config mistakenly forwards as TLS HTTPS to container!"
    ALB->>App: "Send binary TLS ClientHello bytes onto plain HTTP :8080!"
    App--xALB: "HTTP Parser Crash -> 400 Bad Request / Immediate RST!"
    ALB--xBrowser: "Return 502 Bad Gateway to shopper!"
```

1. Terraform wired the Load Balancer's backend target port to `:8080`, **while accidentally copying `protocol = "HTTPS"`** from a previous TLS-passthrough module.
2. Layer 1 (**Link**), Layer 2 (**IP**), and Layer 3 (**TCP** handshake on `:8080`) all succeeded `100%`!
3. At Layer 4 (**Application**), the load balancer opened a **TLS ClientHello** encrypted handshake onto a plain-text **HTTP/1.1** server expecting `"GET /..."` ASCII text.
4. The app's HTTP parser immediately rejected the garbled binary TLS header (`400 Bad Request`), causing the load balancer to emit `502 Bad Gateway`!

#### Root Cause Analysis
1. **Application Protocol Mismatch Across Matching TCP Ports:** Having TCP `:8080` reachable proves only Layer 2/3 connectivity—never that both endpoints speak the exact same Layer 4 protocol!
2. **Untested Target Group Smoke Check After IaC Refactor:** Synthetic probes skipped testing full load-balancer-to-container protocol alignment prior to weighted DNS cutover.

#### The Fix & Architectural Hardening
1. **Aligned Protocol Contracts Explicitly (`HTTPS` -> Sidecar `:8443`, OR `HTTP` -> App `:8080`):** Matched both port number and application protocol (`TLS` vs plain `HTTP`) in Terraform modules with schema validation assertions.
2. **Canary Cutover Test (`1%` Traffic) Before `100%` Cutover:** Verified full end-to-end encrypted curl requests through the ALB before migrating live shopper traffic.

---

## Multi-Language Production Implementation: Layered Encapsulator & Decapsulator With Frame Checksum Verification

Each implementation constructs a simplified **4-layer protocol frame** cleanly from top to bottom—**(4) Application payload -> (3) TCP segment -> (2) IP packet -> (1) Link frame + CRC32 FCS checksum**—and proves how bit-flip corruption at the Link layer is caught and dropped before garbage ever leaks up to the app!

````carousel
```go
package stacksim

import (
	"encoding/binary"
	"errors"
	"fmt"
	"hash/crc32"
)

type Segment struct{ SrcPort, DstPort uint16; Seq uint32; Data []byte }
type Packet struct{ SrcIP, DstIP [4]byte; Seg []byte }
type Frame struct{ DstMAC, SrcMAC string; Packet []byte; FCS uint32 }

func Encapsulate(appPayload []byte, srcPort, dstPort uint16, seq uint32, srcIP, dstIP [4]byte) Frame {
	// Layer 3 (Transport): 8-byte simplified TCP-like header (ports + seq)
	seg := make([]byte, 8+len(appPayload))
	binary.BigEndian.PutUint16(seg[0:2], srcPort)
	binary.BigEndian.PutUint16(seg[2:4], dstPort)
	binary.BigEndian.PutUint32(seg[4:8], seq)
	copy(seg[8:], appPayload)

	// Layer 2 (Network): prepend 4B srcIP + 4B dstIP
	pkt := make([]byte, 8+len(seg))
	copy(pkt[0:4], srcIP[:])
	copy(pkt[4:8], dstIP[:])
	copy(pkt[8:], seg)

	// Layer 1 (Link): wrap in Ethernet-like frame with CRC32 FCS trailer
	return Frame{
		SrcMAC: "aa:bb:cc:00:00:01",
		DstMAC: "dd:ee:ff:00:00:02",
		Packet: pkt,
		FCS:    crc32.ChecksumIEEE(pkt),
	}
}

func Decapsulate(f Frame) (dstPort uint16, appData string, err error) {
	if crc32.ChecksumIEEE(f.Packet) != f.FCS {
		return 0, "", errors.New("Link Layer FCS mismatch: damaged frame dropped (TCP will resend!)")
	}
	seg := f.Packet[8:] // Network layer strips src/dst IP
	dstPort = binary.BigEndian.Uint16(seg[2:4]) // Transport layer inspects destination port
	return dstPort, string(seg[8:]), nil        // App receives untouched payload!
}

func CorruptBitExample(f *Frame) {
	f.Packet[len(f.Packet)-1] ^= 0xFF // Simulate Wi-Fi noise flipping last byte
	_ = fmt.Sprintf("corrupted frame trailing byte")
}
```
<!-- slide -->
```typescript
import { crc32 } from "node:zlib";

export interface LinkFrame {
  srcMac: string;
  dstMac: string;
  wirePacket: Buffer;
  fcsCrc32: number;
}

export function encapsulateHttpRequest(
  httpText: string,
  srcPort: number,
  dstPort: number,
  seq: number,
  srcIp: [number, number, number, number],
  dstIp: [number, number, number, number]
): LinkFrame {
  const appBytes = Buffer.from(httpText, "utf8");

  // Layer 3 (Transport): ports + sequence header
  const tcpHeader = Buffer.alloc(8);
  tcpHeader.writeUInt16BE(srcPort, 0);
  tcpHeader.writeUInt16BE(dstPort, 2);
  tcpHeader.writeUInt32BE(seq, 4);
  const segment = Buffer.concat([tcpHeader, appBytes]);

  // Layer 2 (Network): src + dst IPv4
  const ipHeader = Buffer.from([...srcIp, ...dstIp]);
  const packet = Buffer.concat([ipHeader, segment]);

  // Layer 1 (Link): Frame + FCS trailer
  return {
    srcMac: "aa:bb:cc:00:00:01",
    dstMac: "dd:ee:ff:00:00:02",
    wirePacket: packet,
    fcsCrc32: crc32(packet),
  };
}

export function decapsulateFrame(frame: LinkFrame): { dstPort: number; appText: string } {
  if (crc32(frame.wirePacket) !== frame.fcsCrc32) {
    throw new Error("Link Layer dropped frame: FCS checksum failed (waiting on TCP resend)");
  }
  const segment = frame.wirePacket.subarray(8); // Peel IP header
  const dstPort = segment.readUInt16BE(2);
  const appBytes = segment.subarray(8);         // Peel TCP header
  return { dstPort, appText: appBytes.toString("utf8") };
}
```
<!-- slide -->
```python
import ipaddress
import struct
import zlib
from dataclasses import dataclass


@dataclass
class LinkFrame:
    src_mac: str
    dst_mac: str
    ip_packet: bytes
    fcs_trailer: int


def encapsulate(http_msg: str, src_port: int, dst_port: int, seq: int, src_ip: str, dst_ip: str) -> LinkFrame:
    # 4. Application -> bytes
    app_data = http_msg.encode("utf-8")
    # 3. Transport -> Segment (+ ports & seq)
    segment = struct.pack("!HHI", src_port, dst_port, seq) + app_data
    # 2. Network -> Packet (+ src & dst IPv4)
    ip_header = ipaddress.IPv4Address(src_ip).packed + ipaddress.IPv4Address(dst_ip).packed
    packet = ip_header + segment
    # 1. Link -> Frame (+ MAC addresses + CRC32 FCS error check)
    return LinkFrame("aa:bb:cc:00:00:01", "dd:ee:ff:00:00:02", packet, zlib.crc32(packet))


def decapsulate(frame: LinkFrame) -> tuple[str, int, str]:
    # 1. Link checks FCS before even parsing upper bytes
    if zlib.crc32(frame.ip_packet) != frame.fcs_trailer:
        raise ValueError("Link Layer: Bad FCS checksum! Frame silently discarded for TCP retry.")
    # 2. Network peels 8-byte simplified IP header
    dst_ip = str(ipaddress.IPv4Address(frame.ip_packet[4:8]))
    segment = frame.ip_packet[8:]
    # 3. Transport peels 8-byte simplified TCP header
    _, dst_port, _ = struct.unpack("!HHI", segment[:8])
    app_data = segment[8:].decode("utf-8")
    # 4. Application receives intact message
    return dst_ip, dst_port, app_data
```
<!-- slide -->
```csharp
using System;
using System.Buffers.Binary;
using System.IO.Hashing;
using System.Net;
using System.Text;

public sealed record LinkFrame(string SrcMac, string DstMac, byte[] Packet, uint FcsTrailer);

public static class ProtocolStackEncoder
{
    public static LinkFrame Encapsulate(string httpText, ushort srcPort, ushort dstPort, uint seq, string srcIp, string dstIp)
    {
        byte[] app = Encoding.UTF8.GetBytes(httpText);
        byte[] packet = new byte[8 + 8 + app.Length];

        // Network Layer (IPs) + Transport Layer (Ports & Seq) + App Data
        IPAddress.Parse(srcIp).GetAddressBytes().CopyTo(packet, 0);
        IPAddress.Parse(dstIp).GetAddressBytes().CopyTo(packet, 4);
        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(8, 2), srcPort);
        BinaryPrimitives.WriteUInt16BigEndian(packet.AsSpan(10, 2), dstPort);
        BinaryPrimitives.WriteUInt32BigEndian(packet.AsSpan(12, 4), seq);
        app.CopyTo(packet, 16);

        return new LinkFrame("aa:bb:cc:00:00:01", "dd:ee:ff:00:00:02", packet, Crc32.HashToUInt32(packet));
    }

    public static (ushort DstPort, string AppData) Decapsulate(LinkFrame frame)
    {
        if (Crc32.HashToUInt32(frame.Packet) != frame.FcsTrailer)
            throw new InvalidOperationException("Link Layer FCS failed: frame dropped safely.");

        ushort dstPort = BinaryPrimitives.ReadUInt16BigEndian(frame.Packet.AsSpan(10, 2));
        string payload = Encoding.UTF8.GetString(frame.Packet, 16, frame.Packet.Length - 16);
        return (dstPort, payload);
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows

Watch full 4-layer encapsulation down to raw bytes, prove that standard `20 B IP + 20 B TCP` headers take under `3%` of a `1,500`-byte frame, and simulate microwave Wi-Fi corruption dropping the broken frame cleanly at the Link layer.

### Step 1: Run Layered Encapsulation, Decapsulation & Frame-Corruption Recovery Check

```bash
python3 - <<'EOF'
import ipaddress, struct, zlib

http_msg = b"GET /shoes HTTP/1.1\r\nHost: shop.example\r\n\r\n"

# Wrap top-down (Application -> Transport -> Network -> Link)
segment = struct.pack("!HHI", 51234, 443, 1) + http_msg
packet  = ipaddress.IPv4Address("203.0.113.7").packed + ipaddress.IPv4Address("198.51.100.10").packed + segment
fcs_ok  = zlib.crc32(packet)

print(f"Real MTU overhead check: 40B IPv4+TCP out of 1,500B = {40/1500*100:.2f}% (< 3%!)")
print(f"Layer Sizes -> App={len(http_msg)}B | Segment={len(segment)}B | Packet={len(packet)}B | FCS=0x{fcs_ok:08x}\n")

# Clean reception decapsulation
assert zlib.crc32(packet) == fcs_ok
dst_ip = str(ipaddress.IPv4Address(packet[4:8]))
_, dst_port, _ = struct.unpack("!HHI", packet[8:16])
print(f"Healthy Frame Decapsulated -> Delivered to {dst_ip}:{dst_port} | App sees: {packet[16:35].decode()}...")

# Flip 1 byte in transit (Wi-Fi interference)
corrupted = bytearray(packet)
corrupted[-5] ^= 0xFF
if zlib.crc32(bytes(corrupted)) != fcs_ok:
    print("Corrupted Frame Detected   -> Link Layer FCS mismatch! Dropped silently so TCP retransmits.")
EOF
```

**Expected Output:**
```text
Real MTU overhead check: 40B IPv4+TCP out of 1,500B = 2.67% (< 3%!)
Layer Sizes -> App=41B | Segment=49B | Packet=57B | FCS=0x...

Healthy Frame Decapsulated -> Delivered to 198.51.100.10:443 | App sees: GET /shoes HTTP/1.1...
Corrupted Frame Detected   -> Link Layer FCS mismatch! Dropped silently so TCP retransmits.
```

---

## Pause and Think & Validation Checkpoints

### Pause and Think

Your home internet is upgraded from old **copper wire to optical fibre**. Why does your web browser not need a single line of code changed?

<details>
<summary><strong>Click to see the answer</strong></summary>

**Only the Link / physical layer changed.** Fibre optics swap how bits cross the physical hop (`Link` layer `frames` running over glass light pulses instead of copper electrical signals). Every layer stacked above it—**IP packets** (`Network`), **TCP segments** (`Transport`), and **HTTP** (`Application` inside your browser)—relies strictly on clean interfaces rather than cable physics, so the browser keeps running untouched.

![Figure 6. The pause-and-think answer: swapping copper for fibre changes only the link layer; the network, transport and application layers work exactly as before.](images/figure-6.svg)

*Figure 6. The pause-and-think answer: swapping copper for fibre changes only the link layer; the network, transport and application layers work exactly as before.*

</details>

### Operational Validation Checkpoints (Scenario Quizzes)

<details>
<summary><strong>Checkpoint 1: Moving a Server From Ethernet Cable to Wi-Fi Without Touching App Code</strong></summary>

**Scenario:** An on-prem IoT gateway runs an HTTP telemetry daemon written in Python. You unplug its Cat6 Ethernet cable and switch it onto enterprise Wi-Fi. Why do IP, TCP, and HTTP work completely unmodified?

<strong>Answer:</strong>
Because networking uses **layered separation of concerns**. Swapping Ethernet (`802.3`) for Wi-Fi (`802.11`) alters strictly **Link layer framing and radio transmission**. As long as the OS Link driver delivers unwrapped IP packets upward, neither IP routing, TCP ordering, nor the Python HTTP server notices the physical swap.
</details>

<details>
<summary><strong>Checkpoint 2: Why `ping` Succeeds While `curl https://...` Returns `400 Bad Request`</strong></summary>

**Scenario:** You run `curl http://my-api.internal:443` and receive `400 Bad Request: The plain HTTP request was sent to HTTPS port`. Meanwhile `nc -zv my-api.internal 443` reports `Connection succeeded!`. Which layers passed and which layer failed?

<strong>Answer:</strong>
* **Link + Network (IP) + Transport (TCP `:443`) ALL passed!** (`nc` opened the 3-way TCP handshake cleanly).
* **Application Layer failed:** Your client sent plain ASCII `HTTP` (`GET /...`) to a port expecting a **TLS/HTTPS** handshake! Switching `http://` to `https://` aligns the Application/Presentation protocol.
</details>

<details>
<summary><strong>Checkpoint 3: Adding TCP Timestamps + IPv6 Header Budget</strong></summary>

**Scenario:** Modern Linux connections commonly add the **`12-byte` TCP Timestamps option** (`20 + 12 = 32 B` TCP header) and travel over **IPv6 (`40 B` header)** inside a `1,500 B` Ethernet MTU. How much application payload fits per packet, and is header overhead still low?

<strong>Answer:</strong>
$1{,}500 - 40\text{ (IPv6)} - 32\text{ (TCP + timestamps)} = \mathbf{1{,}428\text{ bytes}}$ of payload. Headers consume `72 ÷ 1,500 = 4.8%`—still vastly efficient while leaving `> 95%` of every wire packet for application bytes!
</details>

---

## Interview Practice Questions

Exactly **12 questions**, tagged by kind: **[BASIC]** (Q1-Q4, definitions), **[SCENARIO]** (Q5-Q8, apply it to a system), and **[TRICKY]** (Q9-Q12, deep follow-ups). Answer out loud for 30 seconds before opening the solution.

<details>
<summary><strong>Q1: What is a protocol? Name three examples from this lesson. [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
A **protocol** is an agreed specification of how two sides exchange messages: **format, order, timing, and what to do on error**. Because it is written down exactly, software from different companies interoperates. Examples: **HTTP** (Application: `GET /shoes` -> `200 OK`), **TCP / UDP** (Transport), **IP** (Network), and **Ethernet / Wi-Fi** (Link). A protocol is a *specification*, not a program — many implementations (nginx, Envoy, Go `net/http`) follow the same HTTP rules.

</details>

<details>
<summary><strong>Q2: What are the four layers of the TCP/IP model, and what does each do? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
1. **Application** (`HTTP`, `DNS`, `SSH`): what the app means -> **data/message**.
2. **Transport** (`TCP`, `UDP`, `QUIC`): *which app* via **ports**, plus (TCP) ordered, reliable delivery -> **segment/datagram**.
3. **Network/Internet** (`IPv4`, `IPv6`, `ICMP`): addressing and routing to the right **device** anywhere -> **packet**.
4. **Link** (`Ethernet`, `Wi-Fi`): move the bits across **one hop** to the next device and detect damage with the FCS -> **frame**.
Bonus: Lesson 06 splits this into the 7-layer OSI vocabulary used in "L4 vs L7 load balancer" talk.

</details>

<details>
<summary><strong>Q3: What is encapsulation? What happens on the way down and on the way up? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
**Down (sender):** data -> `+ TCP header` = **segment** -> `+ IP header` = **packet** -> `+ link header & FCS trailer` = **frame**. **Up (receiver, decapsulation):** Link verifies the FCS and strips the frame header/trailer; Network checks *"is this destination IP mine?"* and strips the IP header; Transport uses the **port** and sequence number, strips the TCP header; the Application reads `GET /shoes`. Each layer reads and removes **only its own header**. It is labelling, not encryption.

</details>

<details>
<summary><strong>Q4: Why do we use layers instead of one big protocol? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
**Separation of concerns.** Each layer has one job and a narrow interface, so you can **swap one without touching the others** (copper -> fibre, Wi-Fi -> 5G, HTTP/1.1 -> HTTP/2, IPv4 -> IPv6), **different vendors** can build different layers (app vendor, OS kernel, NIC chip), and **each layer handles its own errors** (Link drops damaged frames, TCP resends, HTTP retries). The cost: a little header overhead and some cross-layer awkwardness (NAT, TLS offload, QUIC reaching across L4/L7).

</details>

<details>
<summary><strong>Q5: A browser sends plain HTTP to port 443 and gets `400 Bad Request`. Which layers worked and which failed? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
**Link, Network, and Transport all worked** — the packet reached the right host and the TCP handshake on `:443` succeeded (`nc -zv host 443` says *open*). The **Application/TLS layer failed**: the server expected a binary **TLS ClientHello** but received ASCII `GET / HTTP/1.1`. TCP guarantees *bytes in order*, not that both sides speak the same protocol. Fix: use `https://`, or terminate TLS on `443` and run plain HTTP on a different port. Lesson: a **port-open check only validates the transport layer**.

</details>

<details>
<summary><strong>Q6: A 3 MB photo is uploaded over Ethernet. How many packets, and how much do headers cost? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
MSS = `1,500 - 20 (IP) - 20 (TCP) = 1,460 B`. Packets $= \lceil 3{,}000{,}000 / 1{,}460 \rceil = 2{,}055$. IP+TCP headers add `2,055 × 40 ≈ 82 KB`, i.e. `~2.7%` of the payload. With the Linux default TCP timestamps option (`+12 B`) MSS drops to `1,448` -> `2,072` packets; on the wire you also pay `38 B` of Ethernet preamble/header/FCS/IFG per frame, so effective line efficiency is about `94-95%`. Note ACKs flow the other way (typically one per two segments), so the reverse direction also carries packets.

</details>

<details>
<summary><strong>Q7: Users report "the site is down". How do you use the layers to find the fault quickly? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Work **bottom-up** and stop at the first failure:
1. **Link:** `ip link`, `ethtool` — interface up? CRC errors? Wi-Fi signal?
2. **Network:** `ping <ip>` (works without DNS), `ip route get`, `mtr` — is there a route? TTL expiry or `Destination Unreachable`?
3. **Transport:** `nc -zv host 443` / `ss -ltn` — does the TCP handshake complete? *Refused* = nobody listening; *timeout* = DROP/route problem.
4. **Application:** `curl -v https://host` — TLS cert errors? `502`/`503`/`400`?
Also separate **DNS** (`dig host`) as the layer-4 prerequisite that often fails first. This turns "it's broken" into "layer 3 passes, layer 4 times out" within a minute.

</details>

<details>
<summary><strong>Q8: After moving to Kubernetes with a VXLAN overlay, small API calls work but large uploads hang. Why? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
A classic **MTU / path-MTU black hole**. VXLAN adds `~50 B` of outer headers, so the pod interface should use `MTU 1450` on a `1500` underlay. If the pod keeps `1500`, large packets exceed the path MTU. Routers should answer with ICMP *"Fragmentation needed"* (PMTUD), but **firewalls often drop ICMP**, so the sender never learns and keeps retransmitting the same oversized segments — small requests (one packet) still work. Diagnose with `ping -M do -s 1472 host` (finds the largest unfragmented payload) and `tracepath`. Fix: set CNI/interface MTU correctly, **clamp TCP MSS** (`iptables ... --clamp-mss-to-pmtu`), and allow ICMP type 3 code 4 (and ICMPv6 *Packet Too Big*).

</details>

<details>
<summary><strong>Q9: A Wi-Fi frame is damaged by a microwave. Which layer notices, which fixes it, and does HTTP resend the file? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
The **Link layer notices** — the **FCS** (CRC-32) at the end of the frame doesn't match, so it **drops** the frame (it does not repair it; Wi-Fi also has its own link-level retries). **TCP (Transport)** later sees a **gap in sequence numbers** (or receives duplicate ACKs / hits an RTO) and retransmits **only the missing `~1,460 B` segment** (Lesson 08). **HTTP never knows**, never re-requests the file. This is the point of layering — each layer fixes its own problems. Operational twist: this *masks* loss in your logs; only latency and `TcpRetransSegs` show it.

</details>

<details>
<summary><strong>Q10: How much of a 1,500-byte packet is your data? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
"It depends on the headers." IPv4 (`20`) + TCP without options (`20`) -> **`1,460 B`** (the classic MSS). Add the Linux-default **TCP Timestamps** (`+12`) -> `1,448 B`. IPv6 (`40`) + TCP + timestamps -> `1,428 B`. UDP is only `8 B` -> `1,472 B` over IPv4. Tunnels (VXLAN, WireGuard, GRE) subtract more. Also note the **1,500 B is the IP MTU**: the Ethernet header (`14 B`) and FCS (`4 B`) sit *outside* it. The trap answer is "1,500".

</details>

<details>
<summary><strong>Q11: Which layer is TLS, and which headers can a router, a firewall, and an L7 load balancer actually read? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
TLS doesn't fit neatly in TCP/IP; it runs **on top of TCP** and **below HTTP** — in OSI terms, Presentation/Session (L5-6), in practice "between L4 and L7". **A plain router** reads only the **Link and IP headers** (forwarding by destination IP/TTL); it never needs the TCP header. A **stateful firewall / NAT / L4 load balancer** also reads **TCP/UDP ports and flags** (it must, to track flows). An **L7 load balancer or WAF** reads the **HTTP** content — which requires **terminating TLS** (or seeing SNI at least). With TLS the payload is opaque to everyone but the endpoints; middleboxes see layers 1-4 and, at most, the **SNI** (unless ECH is used). The "every device reads every header" idea is wrong.

</details>

<details>
<summary><strong>Q12: Your phone moves from Wi-Fi to 5G mid-download. Which layer changes, and what breaks? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Strictly the **Link layer** changes (802.11 -> cellular). But the **Network layer** also changes — you get a **new IP address** from the carrier. A TCP connection is keyed by the **4-tuple** `(src IP, src port, dst IP, dst port)`, so the old connection **breaks** (the server keeps replying to the old IP) and the app sees a reset or timeout, then reconnects. **QUIC / HTTP/3** survives this because it identifies a connection by a **Connection ID** rather than the IP/port, enabling **connection migration**; MPTCP is the TCP-side equivalent. So layering isolates the *radio* swap, but not the *addressing* consequence — a great follow-up to Lesson 04's 4-tuple.

</details>

---

## One-Page Master Cheat Sheet

```text
====================================================================================================
                  PROTOCOLS AND LAYERS: AGREED LANGUAGES & WHY WE STACK THEM — CHEAT SHEET
====================================================================================================
DEFINITIONS
  * Protocol      = written rulebook (format + order + timing + errors) so strangers interoperate.
  * Layer         = one job; talks to its PEER on the remote host and to adjacent layers locally.
  * Encapsulation = each layer ADDS its own header on the way down; strips ONLY its own on the way up.

THE 4-LAYER TCP/IP STACK (RFC 1122)            UNIT       EXAMPLES            HEADER
  4 Application  what the app means            Data       HTTP DNS SSH SMTP   app-specific
  3 Transport    which APP (port) + reliability Segment   TCP UDP QUIC        TCP 20 B (+12 ts) / UDP 8 B
  2 Network      which DEVICE, route anywhere   Packet    IPv4 IPv6 ICMP      IPv4 20 B / IPv6 40 B
  1 Link         ONE hop, detect damage (FCS)   Frame     Ethernet Wi-Fi 5G   14 B hdr + 4 B FCS (+8 B preamble +12 B IFG)

  OSI mapping (Lesson 06): L7 App | L6 Pres | L5 Session | L4 Transport | L3 Network | L2 Data-Link | L1 Physical

NUMBERS TO REMEMBER
  MTU 1,500 B (IP)   -> MSS = 1,500 - 20 - 20 = 1,460 B  (1,448 w/ TCP timestamps; 1,428 IPv6+ts)
  Header tax: 40 / 1,500 = 2.7%    Wire efficiency (with Ethernet's 38 B): ~94.9%
  3 MB photo = ceil(3,000,000 / 1,460) = 2,055 packets    Jumbo MTU 9,000 -> 99.6% efficient
  Tunnel tax: VXLAN -50 B | GRE -24 B | WireGuard -60 B | PPPoE -8 B (MTU 1,492)
  Serialization: t = 8L / B  (1,538 B @ 1 Gbps = 12.3 us)

WHO READS WHAT
  Router / switch  -> Link + IP only.     NAT / firewall / L4 LB -> + TCP/UDP ports & flags.
  L7 LB / WAF      -> HTTP (needs TLS termination).     Endpoints -> everything.

FAILURE ISOLATION
  Corrupt frame  -> LINK drops (FCS) -> TCP retransmits only the gap -> HTTP never knows.
  HTTP to HTTPS port -> L1-L4 OK, APP fails (400).   Big uploads hang -> suspect MTU / PMTUD / ICMP blocked.
  Wi-Fi -> 5G: new IP => TCP 4-tuple breaks; QUIC Connection-ID survives.

DEBUG BOTTOM-UP:  ip link/ethtool -> ping/mtr -> nc -zv / ss -ti -> curl -v -> tcpdump/Wireshark
====================================================================================================
```

---

## Common Mistakes & Troubleshooting

- **Confusing the names `frame`, `packet`, `segment`, and `message`:** Frames carry **MAC/link hop** metadata (Link); packets carry **IP addresses** (Network); segments carry **TCP ports & order** (Transport); messages/data belong to **HTTP/DNS** (Application).
- **Assuming routers or switches read HTTP headers:** Intermediate routers operate strictly at **Link/Network layers**—they inspect IP headers and leave encrypted/inner payloads sealed until the destination endpoint.
- **Misreading "TCP `:443` connected" as "TLS/HTTP is healthy":** Port reachability tests only **Transport**, not Application protocol agreement.
- **Assuming MTU is always `1,500`:** VXLAN, WireGuard, GRE, and PPPoE shrink it; mismatched MTUs create "small requests work, big uploads hang" black holes.
- **Blocking all ICMP in the firewall:** It breaks Path MTU Discovery (`Fragmentation needed` / IPv6 `Packet Too Big`) and makes failures look like silence.
- **Calling `TCP/IP` "one protocol" or treating OSI layers as literal software modules:** It is a family of protocols; OSI is a vocabulary for reasoning, not a deployment diagram.
- **Debugging top-down:** Start at Link/Network (`ip link`, `ping`, `mtr`), then Transport (`nc -zv`), then Application (`curl -v`); jumping to app logs first hides lower-layer faults.
- **Trusting application latency graphs to reveal packet loss:** TCP retransmits and Link retries hide loss until p99 spikes—watch `TcpRetransSegs` and `ethtool -S` counters.

---

## Recap in Three Lines

1. A **protocol** sets exact conversation rules (`HTTP`, `TCP`, `IP`, `Ethernet`), while **four clean layers** let each job evolve independently (like swapping Wi-Fi for fiber without editing browsers).
2. **Encapsulation** wraps app **data** into a **TCP segment**, then an **IP packet**, then a **Link frame**—costing under `3%` (`40 B` of `1,500 B`) while decapsulation peels one layer per step on arrival.
3. Layer isolation means the Link layer drops radio noise via **FCS**, TCP retries only the lost piece cleanly, and app code never handles raw wire physics.

---

## Sources

- [RFC 1122: Requirements for Internet Hosts, Communication Layers](https://www.rfc-editor.org/rfc/rfc1122) — defines the 4-layer TCP/IP Internet architecture (`Application`, `Transport`, `Internet`, `Link`).
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) — modern Application-layer HTTP request/response specification.
- [RFC 9293: Transmission Control Protocol (TCP)](https://www.rfc-editor.org/rfc/rfc9293) — Transport-layer segment formatting, reliability, and ports.
- [RFC 791: Internet Protocol](https://www.rfc-editor.org/rfc/rfc791) — Network-layer `20-byte` minimum IPv4 header and packet forwarding.
- [RFC 894: A Standard for the Transmission of IP Datagrams over Ethernet Networks](https://www.rfc-editor.org/rfc/rfc894) — Link-layer Ethernet framing (`1,500-byte` MTU) carrying IP packets.
- [RFC 879: The TCP Maximum Segment Size and Related Topics](https://www.rfc-editor.org/rfc/rfc879) — derives `1,460`-byte default TCP MSS (`1,500 - 20 IP - 20 TCP`).

---

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-N-005.pdf](https://backendroadmap.com/notes/system-design/SD-N-005.pdf).

---

## Next

Continue with [Lesson 06: The OSI Model (7 Layers), Mapped to Real Packets](../06-osi-model/README.md) to map this practical 4-layer stack cleanly onto the classic 7-layer OSI interview & troubleshooting model.
