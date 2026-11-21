# Lesson 02: Packets: Why Data Travels in Small Pieces

> **Prerequisites:** [Lesson 01: What Is a Network?](../01-what-is-a-network/README.md) ([Track Overview](../README.md)).  
> **Estimated Reading Time:** 20 minutes  
> **Target Audience:** Developers learning how bytes actually cross wires and engineers troubleshooting MTU black holes, packet loss, fragmentation bottlenecks, and out-of-order reassembly.  
> **Free PDF Notes:** [Download SD-N-002.pdf](https://backendroadmap.com/notes/system-design/SD-N-002.pdf)

> [!NOTE]
> **In one line:** Data crosses the network in small packets, each a header (addresses and a number) plus a payload; the MTU, usually 1,500 bytes, sets the size, and the numbers let the receiver reassemble everything and ask again for just the missing piece.

> [!TIP]
> **The Golden Rule of Packets:** Networks never fire an entire file across the internet as one uninterrupted `3 MB` stream—they slice payloads into small, self-contained **packets** capped by the Ethernet **MTU (`1,500 bytes`)**, leaving **`1,460 bytes` of user payload** after a **`40-byte` IP + TCP header**. Small packets keep recovery cheap (`1` dropped piece costs `1,460 B` instead of `3,000,000 B`) and let millions of devices share links fairly without a single upload blocking everyone else.

---

## Words You'll Meet Today

| Word | Everyday Meaning | Role in a Live Network |
| :--- | :--- | :--- |
| **Packet** | A single small chunk of data with an address-and-order label attached. | Fundamental unit of Layer-3 forwarding across routers worldwide. |
| **Header** | The shipping label at the front of a packet carrying routing and sequence fields. | IPv4 (`20 B`) + TCP (`20 B`) minimum = `40 bytes` before payload begins. |
| **Payload** | The actual message bytes tucked inside the packet after headers are stripped. | Up to `1,460 bytes` of your photo, HTML, or JSON inside a standard Ethernet packet. |
| **MTU** | *Maximum Transmission Unit* — the largest packet size a physical link can carry at once. | Standard Ethernet/Wi-Fi MTU is **`1,500 bytes`**. |
| **Reassemble** | Putting arriving numbered packets back in exact sequence to rebuild the original bytes. | Handled by the receiving TCP stack using sequence numbers before waking the app. |
| **Byte** | Standard unit of digital data (`8 bits`, e.g., roughly one ASCII letter). | Building block of bandwidth, buffer sizing, and packet length math. |
| **Router** | Traffic junction that reads a packet's destination header and forwards it toward the next hop. | Inspects destination IP per packet; may drop packets cleanly when queues overflow. |
| **Megabyte (`MB`)** | Roughly `1,000,000 bytes` (about one compressed mobile photo or short audio clip). | Helps estimate how many MTU-sized chunks an API upload produces (`~685` chunks per MB). |

---

## Visual Mental Models & Architecture

### Cutting, Labelling, and Reassembling Data

In [Lesson 01](../01-what-is-a-network/README.md), we saw a client request travel across the network. On real copper wires, Wi-Fi radios, and fiber backbones, that transfer does not flow as one giant continuous blob—every message is sliced into **packets**.

![Figure 1. A photo travels as packets: cut into pieces, each labelled with a header, sent on its own, and reassembled by number at the other end.](images/figure-1.svg)

*Figure 1. A photo travels as packets: cut into pieces, each labelled with a header, sent on its own, and reassembled by number at the other end.*

Think of **moving a sofa from Bengaluru to Pune**. It is too wide to fit through doorways or fit in a single parcel van intact. So you disassemble it into **20 numbered boxes**, slap `"box 3 of 20 — to flat 5, Pune"` onto every carton, send them in vans that might even take slightly different highways, and bolt all 20 parts back together inside the Pune flat by reading the numbers.

![Figure 2. The everyday picture: moving a sofa as 20 numbered boxes.](images/figure-2.svg)

*Figure 2. The everyday picture: moving a sofa as 20 numbered boxes.*

### Step-by-Step Anatomy of a `3 MB` Photo Transfer

![Figure 3. Inside one packet: a 40-byte header (20 bytes IP, 20 bytes TCP) and up to 1,460 bytes of payload.](images/figure-3.svg)

*Figure 3. Inside one packet: a 40-byte header (20 bytes IP, 20 bytes TCP) and up to 1,460 bytes of payload.*

1. **Cut:** Your WhatsApp client splits a **`3 MB` (`3,000,000 B`)** photo into **`~2,055` small chunks** of up to **`1,460 bytes`** each.
2. **Label:** The OS kernel prepends a **`40-byte` header** (`20 B` IP + `20 B` TCP) carrying sender address, destination address, and byte sequence offset.
3. **Send:** Routers inspect each packet independently, forwarding packets along healthy paths while other laptops on the same Wi-Fi interleave their own packets in between.
4. **Reassemble:** The receiving OS sorts incoming pieces by sequence number (covered deeply in [Lesson 08](../08-tcp-sequence-numbers-and-acks/README.md)), detects any missing gap, and delivers a clean, intact `3 MB` file to WhatsApp.

```mermaid
flowchart LR
    File["3 MB Photo (3,000,000 B)"] --> Cut["Slice into 2,055 Chunks (1,460 B Payload Max)"]
    Cut --> Header["Add 40 B Header (20 B IP + 20 B TCP) = 1,500 B MTU"]
    Header --> Wire["Travel Hop-by-Hop Across Shared Routers"]
    Wire --> Recv["Sort by Sequence Number & Spot Gaps"]
    Recv --> Out["Deliver Intact 3 MB Photo to App"]
```

---

## Real Numbers & Systematic Reference Grids

Inside almost every wired Ethernet and Wi-Fi hop, the physical link enforces a **`1,500-byte` MTU**:

$$\text{Max Payload (MSS)} = 1{,}500\text{ B MTU} - 20\text{ B IPv4 Header} - 20\text{ B TCP Header} = 1{,}460\text{ bytes}$$

*(Note: IPv6 expands the IP header to `40 bytes`, leaving `1,440 bytes` of payload per `1,500-byte` Ethernet frame—still under `4%` header overhead.)*

### Packetization Arithmetic: The Math of Chunks

| Question / Metric | Arithmetic | Value / Result |
| :--- | :--- | :--- |
| **Payload per Packet (MSS)** | $1{,}500 - 20 - 20$ | **`1,460 bytes`** |
| **Packets for a 3 MB Photo** | $3{,}000{,}000 \div 1{,}460$ | **`≈ 2,055 packets`** |
| **Cost of the Headers** | $40 \div 1{,}500$ | **`≈ 2.67%`** (under 3%) |
| **Resend Cost After 1 Loss** | One packet payload | **`1,460 bytes`** (vs $3{,}000{,}000$ B; $\approx 2{,}055\times$ cheaper) |
| **Serialization Time (1 Packet on 10 Mbit/s)** | $(1{,}500 \times 8) \div 10{,}000{,}000$ | **`1.2 ms`** |
| **Serialization Time (3 MB Unsplit on 10 Mbit/s)** | $(3{,}000{,}000 \times 8) \div 10{,}000{,}000$ | **`2.4 seconds`** |

![Figure 4. Real numbers: a 3 MB photo is about 2,055 packets; a loss costs one packet; small packets let everyone take turns.](images/figure-4.svg)

*Figure 4. Real numbers: a 3 MB photo is about 2,055 packets; a loss costs one packet; small packets let everyone take turns.*

### Why Small (`1,500 B`) Packets Beat Sending Whole Files Unsplit

| Property | Whole `3 MB` Stream Unsplit | `1,460 B` Payload Packets (`1,500 B` MTU) | Engineering Advantage |
| :--- | :--- | :--- | :--- |
| **Header Overhead** | Tiny (`~40 B` once) | `40 ÷ 1,500 ≈ 2.7%` (IPv4) | Negligible tax (`< 3%`) to gain routing & order tracking on every chunk. |
| **Count for `3 MB` File** | `1` giant unbroken transmission | `3,000,000 ÷ 1,460 ≈ 2,055` packets | Independent per-packet path selection and error recovery. |
| **Cost of `1` Bit Error / Drop** | Resend all **`3,000,000 bytes`**! | Resend only **`1,460 bytes`** (`0.05%`)! | Cuts recovery waste by `2,055x` on lossy Wi-Fi and mobile links. |
| **Fairness on `10 Mbit/s` Link** | Blocks shared link for **`2.4 seconds`**! | One packet occupies link for **`1.2 ms`**! | Interactive pings, Zoom audio, and chats share Wi-Fi smoothly without freezing. |

> [!NOTE]
> **Why `10 Mbit/s` Shows Link Monopolization So Clearly:** Calculating serialization time ($\text{bits} \div \text{bit/s}$): one `1,500-byte` (`12,000-bit`) packet finishes in `12,000 ÷ 10,000,000 = 1.2 ms`, whereas one unchunked `3,000,000-byte` (`24,000,000-bit`) stream traps every other user's packets behind it for `2.4 full seconds`—and any glitch at second `2.3` destroys the entire transfer.

---

## What Goes Wrong & Production War Story Post-Mortem

Real routers drop packets during queue congestion, and packets taking alternative paths frequently arrive out of order:

![Figure 5. What goes wrong: packet 7 is dropped and 8 and 9 arrive the wrong way round. The receiver sorts by number, sees the gap and asks for 7 again.](images/figure-5.svg)

*Figure 5. What goes wrong: packet 7 is dropped and 8 and 9 arrive the wrong way round. The receiver sorts by number, sees the gap and asks for 7 again.*

Because packets carry numbers, the receiver **holds packets `8` and `9` in its receive buffer**, spots the gap right after packet `6`, asks the sender cleanly to retransmit **only packet `7`**, and passes `[6, 7, 8, 9]` upward once `7` lands—saving all earlier and later chunks from re-transfer.

### SEV-2 Post-Mortem: The Cloud VPN "Path MTU Black Hole" That Hung Every Large Upload Silently

#### Incident Overview
* **Severity:** SEV-2 (`100%` Failure on File Uploads `> 1.4 KB` Over Corporate VPN Tunnel; Health Checks Stayed Green!)
* **Detection Time:** `42 minutes` (small `200 B` JSON health checks and login tokens worked fine, hiding the break!)
* **Resolution Time:** `18 minutes` once caught via `tcpdump` & `ping -M do -s`
* **Impact:** Every photo upload and large API POST payload froze forever (`Connection reset by peer` after timeout) between Kubernetes nodes inside a `1,400-byte` WireGuard/IPsec VPN overlay.

#### What Happened
```mermaid
sequenceDiagram
    autonumber
    actor App as "Client Pod (MTU 1,500 B)"
    participant VPN as "VPN Tunnel Router (Effective MTU 1,400 B)"
    participant FW as "Misconfigured Firewall (Drops ICMP)"
    participant Origin as "Upload Backend"

    App->>VPN: "POST /login (300 B packet) -> Fits cleanly!"
    VPN->>Origin: "Delivered 200 OK!"
    App->>VPN: "POST /upload chunk (1,500 B with Dont-Fragment bit set!)"
    Note over VPN: "1,500 B + 80 B tunnel header > 1,500 B! Cannot pass#59; emits ICMP Frag-Needed"
    VPN--xFW: "ICMP Type 3 Code 4 (Please shrink to 1,420 B!)"
    Note over FW: "Firewall blindly blocks ALL ICMP traffic!"
    Note over App: "Client never shrinks packet#59; retries exact 1,500 B forever until socket hangs!"
```

1. Engineers added an encrypted tunnel wrapping outgoing `1,500-byte` packets with an extra `80-byte` tunnel header, pushing total size to `1,580 B` and shrinking inner **Path MTU** to `1,420 B`.
2. Small requests (`GET /healthz`, small JSON logins under `1,400 B`) fit completely untouched—leaving synthetic monitors green!
3. Any payload exceeding `1,420 B` filled up to `1,500 B` with the `DF` (*Don't Fragment*) flag set. The tunnel router dropped those large packets and sent back an **ICMP "Fragmentation Needed"** signal asking the client to downsize packets.
4. A tight security firewall blocked **all ICMP** unconditionally—starving **Path MTU Discovery (PMTUD)**! The sender kept endlessly retrying identical `1,500 B` chunks into a black hole.

#### Root Cause Analysis
1. **MTU Overrun on Encapsulated Links:** Tunnel encapsulation overhead shrunk effective link MTU below the assumed `1,500 bytes`.
2. **ICMP Blackholing:** Blocking essential ICMP `Fragmentation Needed` errors broke automatic Path MTU Discovery.
3. **Too-Small Health Probes:** Tiny `200-byte` health checks failed to catch payload-size failures near the `1,500 B` MTU boundary.

#### The Fix & Architectural Hardening
1. **Allow ICMP Type 3 Code 4 (and IPv6 Packet Too Big):** Permitted essential Path MTU feedback packets across security groups so senders clamp packet size cleanly.
2. **TCP MSS Clamping (`1,380 bytes`) on Tunnel Interfaces:** Adjusted tunnel edge routers so negotiated MSS never exceeds encapsulated capacity.
3. **MTU-Sized Synthetic Probes:** Added a `4 KB` multi-packet probe (`> 1,500 B`) to uptime monitoring so black holes alert immediately.

---

## Multi-Language Production Implementation: Packet Chunker & Out-of-Order Reassembly Buffer

Each implementation models the core packet engine inside a networking stack: **(1)** slicing arbitrary payloads into fixed `1,460-byte` MSS chunks tagged with sequence IDs, and **(2)** reassembling reordered arrivals while pinpointing missing packet gaps for selective resend (like packet `7` arriving late behind `8` and `9`).

````carousel
```go
package packetengine

import "fmt"

const MaxPayloadBytes = 1460 // 1500 MTU - 20 IP - 20 TCP

type Packet struct {
	Seq     int
	Total   int
	Payload []byte
}

func SliceToPackets(data []byte) []Packet {
	if len(data) == 0 {
		return nil
	}
	total := (len(data) + MaxPayloadBytes - 1) / MaxPayloadBytes
	out := make([]Packet, 0, total)
	for seq := 0; seq < total; seq++ {
		start := seq * MaxPayloadBytes
		end := start + MaxPayloadBytes
		if end > len(data) {
			end = len(data)
		}
		out = append(out, Packet{Seq: seq + 1, Total: total, Payload: data[start:end]})
	}
	return out
}

type Reassembler struct {
	total    int
	received map[int][]byte
}

func NewReassembler(total int) *Reassembler {
	return &Reassembler{total: total, received: make(map[int][]byte, total)}
}

func (r *Reassembler) Ingest(pkt Packet) {
	r.received[pkt.Seq] = pkt.Payload
}

// MissingSeqs reports exact sequence numbers to request for retransmission (e.g., Packet #7 only).
func (r *Reassembler) MissingSeqs() []int {
	var gaps []int
	for seq := 1; seq <= r.total; seq++ {
		if _, ok := r.received[seq]; !ok {
			gaps = append(gaps, seq)
		}
	}
	return gaps
}

func (r *Reassembler) Assemble() ([]byte, error) {
	if missing := r.MissingSeqs(); len(missing) > 0 {
		return nil, fmt.Errorf("cannot reassemble; missing packets: %v", missing)
	}
	var result []byte
	for seq := 1; seq <= r.total; seq++ {
		result = append(result, r.received[seq]...)
	}
	return result, nil
}
```
<!-- slide -->
```typescript
export const MAX_PAYLOAD_BYTES = 1460; // 1500 MTU - 40B IP/TCP header

export interface Packet {
  seq: number;
  total: number;
  payload: Uint8Array;
}

export function sliceIntoPackets(data: Uint8Array): Packet[] {
  const total = Math.ceil(data.length / MAX_PAYLOAD_BYTES);
  const packets: Packet[] = [];
  for (let i = 0; i < total; i++) {
    const start = i * MAX_PAYLOAD_BYTES;
    const end = Math.min(start + MAX_PAYLOAD_BYTES, data.length);
    packets.push({ seq: i + 1, total, payload: data.slice(start, end) });
  }
  return packets;
}

export class ReassemblyBuffer {
  private readonly chunks = new Map<number, Uint8Array>();

  constructor(private readonly totalPackets: number) {}

  ingest(pkt: Packet): void {
    this.chunks.set(pkt.seq, pkt.payload);
  }

  missingSequences(): number[] {
    const missing: number[] = [];
    for (let seq = 1; seq <= this.totalPackets; seq++) {
      if (!this.chunks.has(seq)) missing.push(seq);
    }
    return missing;
  }

  assemble(): Uint8Array {
    const gaps = this.missingSequences();
    if (gaps.length > 0) {
      throw new Error(`Incomplete stream; request retransmit for packets: ${gaps.join(", ")}`);
    }
    const totalLen = Array.from(this.chunks.values()).reduce((sum, c) => sum + c.length, 0);
    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (let seq = 1; seq <= this.totalPackets; seq++) {
      const part = this.chunks.get(seq)!;
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}
```
<!-- slide -->
```python
from dataclasses import dataclass

MAX_PAYLOAD_BYTES = 1460  # 1500 B Ethernet MTU - 20 B IPv4 - 20 B TCP


@dataclass(frozen=True)
class Packet:
    seq: int
    total: int
    payload: bytes


def slice_to_packets(data: bytes) -> list[Packet]:
    total = max(1, (len(data) + MAX_PAYLOAD_BYTES - 1) // MAX_PAYLOAD_BYTES)
    return [
        Packet(seq=i + 1, total=total, payload=data[i * MAX_PAYLOAD_BYTES : (i + 1) * MAX_PAYLOAD_BYTES])
        for i in range(total)
    ]


class ReassemblyBuffer:
    def __init__(self, total_packets: int) -> None:
        self.total_packets = total_packets
        self._buffer: dict[int, bytes] = {}

    def ingest(self, pkt: Packet) -> None:
        self._buffer[pkt.seq] = pkt.payload

    def missing_seqs(self) -> list[int]:
        return [seq for seq in range(1, self.total_packets + 1) if seq not in self._buffer]

    def assemble(self) -> bytes:
        gaps = self.missing_seqs()
        if gaps:
            raise ValueError(f"Waiting for selective retransmission of packets: {gaps}")
        return b"".join(self._buffer[seq] for seq in range(1, self.total_packets + 1))
```
<!-- slide -->
```csharp
using System;
using System.Collections.Generic;
using System.IO;

public sealed record Packet(int Seq, int Total, byte[] Payload);

public sealed class PacketSlicer
{
    public const int MaxPayloadBytes = 1460;

    public static List<Packet> Slice(byte[] data)
    {
        int total = (data.Length + MaxPayloadBytes - 1) / MaxPayloadBytes;
        var packets = new List<Packet>(total);
        for (int i = 0; i < total; i++)
        {
            int offset = i * MaxPayloadBytes;
            int count = Math.Min(MaxPayloadBytes, data.Length - offset);
            var chunk = new byte[count];
            Buffer.BlockCopy(data, offset, chunk, 0, count);
            packets.Add(new Packet(i + 1, total, chunk));
        }
        return packets;
    }
}

public sealed class ReassemblyBuffer(int totalPackets)
{
    private readonly Dictionary<int, byte[]> _chunks = new();

    public void Ingest(Packet pkt) => _chunks[pkt.Seq] = pkt.Payload;

    public List<int> GetMissingSeqs()
    {
        var missing = new List<int>();
        for (int s = 1; s <= totalPackets; s++)
            if (!_chunks.ContainsKey(s)) missing.Add(s);
        return missing;
    }

    public byte[] Assemble()
    {
        var gaps = GetMissingSeqs();
        if (gaps.Count > 0)
            throw new InvalidOperationException($"Missing packet(s): {string.Join(", ", gaps)}");

        using var ms = new MemoryStream();
        for (int s = 1; s <= totalPackets; s++)
            ms.Write(_chunks[s], 0, _chunks[s].Length);
        return ms.ToArray();
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows

Verify packet slicing math (`3 MB -> 2,055 packets`), header efficiency (`< 3%`), selective gap detection when packet `7` drops while `8` and `9` reorder, AND check the actual MTU configured on your local OS network interface!

### Step 1: Simulate Out-of-Order Delivery + Inspect Real Interface MTU

```bash
python3 - <<'EOF'
mtu = 1500
header_bytes = 20 + 20  # 20B IPv4 + 20B TCP
mss = mtu - header_bytes
photo_bytes = 3_000_000
total_packets = (photo_bytes + mss - 1) // mss

print(f"MTU={mtu} B | Header={header_bytes} B ({header_bytes/mtu*100:.2f}% overhead) | Payload={mss} B")
print(f"3 MB photo ({photo_bytes:,} B) splits into {total_packets:,} packets.")
print(f"Single dropped packet resend cost: {mss:,} B ({mss/photo_bytes*100:.3f}% of total)\n")

# Simulate packets 1..10 arriving with #7 dropped and #8,#9 swapped
arriving = [1, 2, 3, 4, 5, 6, 9, 8, 10]
buf = set()
for seq in arriving:
    buf.add(seq)
missing = [s for s in range(1, 11) if s not in buf]
print(f"Arrived out of order: {arriving}")
print(f"Buffered safely; receiver asks sender ONLY for missing seq(s): {missing}")
EOF
```

**Expected Output:**
```text
MTU=1500 B | Header=40 B (2.67% overhead) | Payload=1460 B
3 MB photo (3,000,000 B) splits into 2,055 packets.
Single dropped packet resend cost: 1,460 B (0.049% of total)

Arrived out of order: [1, 2, 3, 4, 5, 6, 9, 8, 10]
Buffered safely; receiver asks sender ONLY for missing seq(s): [7]
```

> [!TIP]
> **Check Your Own Machine's MTU:** On Linux run `ip link show` (look for `mtu 1500` or loopback `mtu 65536`); on macOS run `ifconfig en0 | grep mtu`; on Windows PowerShell run `netsh interface ipv4 show subinterfaces`.

---

## Pause and Think & Validation Checkpoints

### Pause and Think

You send a `1.46 MB` voice note (`1,460,000 bytes`) over a `1,500`-byte MTU network (`1,460 bytes` of payload per packet). Packet `500` gets dropped on the way. Roughly how many bytes need to be resent?

<details>
<summary><strong>Click to see the answer</strong></summary>

**`1,460 bytes` — just packet `500`.** The `1,460,000`-byte voice note splits into `1,460,000 ÷ 1,460 = 1,000` packets. Only packet `500` failed to arrive; packets `1` to `499` and `501` to `1,000` arrived cleanly and stay buffered at the receiver waiting to be bolted together once packet `500` lands.

![Figure 6. 1,000 packets, and only packet 500 is sent again.](images/figure-6.svg)

*Figure 6. 1,000 packets, and only packet 500 is sent again.*

</details>

### Operational Validation Checkpoints (Scenario Quizzes)

<details>
<summary><strong>Checkpoint 1: Tiny-Packet Throughput Tax</strong></summary>

**Scenario:** A developer serializes telemetry in chunks of `10 bytes` of JSON per TCP write with Nagle's algorithm disabled—producing packets holding `40 B` of IP/TCP headers and only `10 B` of user data. What happens to network efficiency?

<strong>Answer:</strong>
Header overhead shoots from **`2.7%`** (`40 ÷ 1,500`) to **`80%`** (`40 ÷ 50`)! On a `10 Mbit/s` pipe, `8 Mbit/s` gets burned carrying address envelopes rather than telemetry payload. Batching small telemetry writes up toward the `1,460 B` MSS ceiling slashes packet rate and header waste dramatically.
</details>

<details>
<summary><strong>Checkpoint 2: Why Health Checks Pass During an MTU Black Hole</strong></summary>

**Scenario:** After enabling a VPN gateway between microservices, `GET /health` (`95 bytes`) passes `100%`, yet `POST /invoice` (`12 KB`) hangs indefinitely on `99%` of requests. Explain why size differentiates success from failure.

<strong>Answer:</strong>
The `95-byte` health check fits cleanly inside one tunnel packet (`95 + headers < 1,420 B`), whereas the `12 KB` invoice generates `1,500-byte` MTU packets with `DF` set that overshoot the encrypted tunnel ceiling and trigger black-holed ICMP `Fragmentation Needed` errors.
</details>

<details>
<summary><strong>Checkpoint 3: Out-of-Order Buffering vs. App-Layer Ordering</strong></summary>

**Scenario:** Router A fails mid-upload, rerouting packets `#50–#100` across a slightly shorter path so packet `#52` reaches the destination server `8 ms` ahead of packet `#51`. Does your Python/Go HTTP handler receive corrupted out-of-order bytes?

<strong>Answer:</strong>
**No (when using TCP).** The operating system kernel buffers `#52` quietly in its receive queue, waits for `#51` to arrive (or triggers retransmission if lost), orders the stream monotonically, and only hands ordered bytes `[#50, #51, #52]` up to the HTTP handler.
</details>

---

## Interview Practice Questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system), and **Tricky** (deep follow-ups). Answer out loud before opening the solution.

<details>
<summary><strong>1. What is a packet, and what is inside one? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
A packet is one small piece of data that travels across the network on its own. It consists of two parts:
1. **Header (label):** Delivery metadata containing source and destination IP addresses, port numbers, flags, and sequence numbers (typically 40 bytes: 20 bytes IPv4 + 20 bytes TCP).
2. **Payload (cargo):** The actual application slice (e.g. up to 1,460 bytes of photo, HTML, or JSON).

</details>

<details>
<summary><strong>2. What is the MTU, and what is it on most networks? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
**MTU (Maximum Transmission Unit)** is the largest packet size a physical network link accepts in a single transmission. On standard Ethernet, fiber, and typical home/office Wi-Fi, the MTU is **1,500 bytes**. Slicing data into MTU-bounded packets ensures fair multiplexing and predictable queueing delays across intermediate switches and routers.

</details>

<details>
<summary><strong>3. What is the difference between MTU and MSS? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
- **MTU (Maximum Transmission Unit):** Total packet size including all protocol headers at Layer 3 (typically `1,500 bytes`).
- **MSS (Maximum Segment Size):** Pure application payload capacity inside the TCP segment at Layer 4, calculated by subtracting IP and TCP headers from the MTU:
  $$\text{MSS} = \text{MTU} - (\text{IP Header} + \text{TCP Header}) = 1{,}500 - (20 + 20) = 1{,}460\text{ bytes}$$

</details>

<details>
<summary><strong>4. What happens when a packet's size exceeds an intermediate link's MTU and the Don't Fragment (DF) bit is set? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
When a router receives a packet larger than the outbound interface MTU with the `DF` (*Don't Fragment*) flag set, it **drops the packet immediately**. The router emits an **ICMP Type 3, Code 4** error message (*Fragmentation Needed and DF set*) back to the sender containing the maximum acceptable MTU for that hop, allowing the sender to adjust its Path MTU cleanly.

</details>

<details>
<summary><strong>5. How many packets does a 3 MB photo need, and what is the header overhead percentage? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
A 3 MB photo ($3{,}000{,}000\text{ bytes}$) divided by $1{,}460\text{ bytes}$ payload per packet requires:
$$\left\lceil \frac{3{,}000{,}000}{1{,}460} \right\rceil = 2{,}055\text{ packets}$$
The 40 bytes of header on every 1,500-byte frame represents an overhead of:
$$\frac{40}{1{,}500} \approx 2.67\%$$
This negligible tax ($< 3\%$) provides independent routing, addressing, and error recovery on every single piece.

</details>

<details>
<summary><strong>6. Why not send the whole file as one big piece? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Two critical operational reasons:
1. **Error Recovery Cost:** If a single bit flips or drops on a lossy wire, you only retransmit **1,460 bytes** rather than re-sending the entire 3,000,000 bytes ($2,055\times$ savings).
2. **Link Fairness:** Small packets interleave smoothly on shared links. On a 10 Mbit/s line, a 1,500-byte packet takes $1.2\text{ ms}$, whereas an unsplit 3 MB stream monopolizes the physical cable for $2.4\text{ seconds}$, freezing all concurrent chats, DNS lookups, and VoIP calls.

</details>

<details>
<summary><strong>7. Packets 5 and 6 arrive before packet 4. Does the receiver drop them? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
No. The receiving TCP stack buffers out-of-order packets 5 and 6 in its kernel receive queue, detects the sequence gap at packet 4, and asks the sender to retransmit only packet 4. When packet 4 arrives, the kernel reassembles `[4, 5, 6]` in exact monotonic order and releases the contiguous byte stream to the application.

</details>

<details>
<summary><strong>8. After adding an IPsec/WireGuard VPN gateway between microservices, small health checks succeed but 12 KB file uploads hang indefinitely. What is causing this? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
This is a classic **Path MTU (PMTU) Black Hole**:
1. The VPN tunnel encapsulation adds extra headers (e.g. 60–80 bytes), shrinking the effective MTU of the tunnel link to `1,420 bytes`.
2. Small health check requests (`< 1,000 bytes`) fit easily and return 200 OK.
3. Large 12 KB uploads produce full 1,500-byte packets with the `DF` bit set.
4. The VPN router drops the oversized packets and emits ICMP *Fragmentation Needed* messages, but a misconfigured corporate firewall blocks all incoming ICMP.
5. The client never receives the signal to downsize packets and retransmits 1,500-byte chunks until the connection times out.
**Fix:** Permit ICMP Type 3 Code 4 or configure **TCP MSS Clamping** (`iptables -t mangle -A POSTROUTING -p tcp --tcp-flags SYN,RST SYN -j TCPMSS --clamp-mss-to-pmtu`).

</details>

<details>
<summary><strong>9. Packets arrive out of order and one is missing. Is the file broken? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
No. The internet is a packet-switched network where routers route packets across dynamic paths independently. The receiver sorts packets by sequence numbers in their headers, keeps received pieces in memory, and triggers selective retransmission for the missing sequence range. Only when all gaps are filled is the data delivered to the application, guaranteed intact and in sequence.

</details>

<details>
<summary><strong>10. Does one lost packet mean the download restarts? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
No. Only the specific missing packet is resent; everything that previously arrived successfully is preserved in the receive buffer. (In TCP, sequence numbers count bytes rather than packet indices, and Selective Acknowledgments / SACK inform the sender of the exact discontinuous byte ranges received).

</details>

<details>
<summary><strong>11. Why don't we make packets tiny, like 100 bytes each, or huge, like 64 KB? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
- **If packets were 100 bytes:** Header overhead explodes to $40\%$ ($\frac{40\text{ B}}{100\text{ B}}$), and routers burn immense CPU overhead parsing 15 times more packet headers per megabyte of throughput.
- **If packets were 64 KB:** Memory buffers inside router switches would quickly overflow (bufferbloat), bit error drop rates on physical cables would force massive retransmissions, and serialization delays would freeze interactive traffic for tens of milliseconds on slower links.
- **1,500 bytes** is the battle-tested sweet spot balancing low overhead ($2.7\%$) with low latency and millisecond-level link sharing.

</details>

<details>
<summary><strong>12. In high-performance data center environments, why do engineers use "Jumbo Frames" (9,000-byte MTU), and why aren't they used across the public internet? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
- **Inside Data Centers:** Private links (SAN storage, NVMe-over-Fabrics, distributed databases) use **Jumbo Frames (9,000-byte MTU)**. Carrying 8,960 bytes of payload per header cuts header overhead to $0.44\%$ and slashes network card interrupt rates and CPU utilization by $6\times$ during gigabytes-per-second transfers.
- **On the Public Internet:** Every router, switch, ISP gateway, and Wi-Fi access point between sender and receiver must support 9,000-byte frames. Because millions of legacy network devices enforce the 1,500-byte ceiling, attempting to send Jumbo Frames across the public internet results in universal packet drops and fragmentation failures.

</details>

---

## One-Page Master Cheat Sheet

```text
====================================================================================================
                        PACKETS: DATA IN SMALL PIECES — PRODUCTION CHEAT SHEET
====================================================================================================
CORE PACKET ANATOMY
  * Packet            : Small independent unit of Layer-3 network transit. Header + Payload.
  * Header (IPv4+TCP) : 40 bytes minimum (20 bytes IP + 20 bytes TCP). Carries addresses & sequence numbers.
  * Standard MTU      : 1,500 bytes (Maximum Transmission Unit) on standard Ethernet & Wi-Fi.
  * Maximum MSS       : MTU (1,500) - Headers (40) = 1,460 bytes of user payload per packet.
  * Header Overhead   : 40 / 1,500 ≈ 2.67% (negligible tax for independent routing & recovery).

THE TWO REASONS DATA TRAVELS IN PIECES
  1. Cheap Recovery   : Losing 1 packet resends 1,460 bytes, not the whole 3,000,000 bytes (2,055x cheaper).
  2. Fair Link Sharing: 1 packet @ 10 Mbps = 1.2ms; unsplit 3 MB = 2.4s monopolization of the wire.

OUT-OF-ORDER ARRIVALS & REASSEMBLY
  * Multi-Path Reality: Routers forward packets independently; packets arrive shuffled (e.g. 1,2,3,5,6,4).
  * Receive Buffer    : OS TCP stack buffers out-of-order packets, detects gaps, requests selective resend.
  * Safe App Delivery : Application handler receives monotonic, gap-free byte stream once missing piece lands.

PRODUCTION HAZARDS & DEFENSES
  * Path MTU Blackhole: VPN / encapsulation overlays add headers, shrinking MTU (e.g. 1,500 -> 1,420).
  * ICMP Blocking Trap: Firewalls dropping ICMP Type 3 Code 4 (Frag-Needed) break PMTUD; sockets hang.
  * MSS Clamping      : Configure border routers to clamp TCP MSS (e.g. 1,360 - 1,380 bytes) on tunnel hops.
  * Jumbo Frames      : 9,000-byte MTU used inside private DC networks (storage/HPC); dropped on public internet.
====================================================================================================
```

---

## Common Mistakes & Troubleshooting

- **Confusing `MTU` (`1,500 B`) with `MSS` (`1,460 B`):** Treating `1,500 B` as user payload ignores the `40 B` IPv4 + TCP headers (or `60 B` over IPv6).
- **Assuming routers keep packets locked in send order:** Multi-path routing means receivers frequently observe reordered packets; sequence numbers exist specifically to rebuild order.
- **Ignoring VPN / overlay MTU reductions:** Blindly dropping ICMP `Fragmentation Needed` breaks Path MTU Discovery (`PMTUD`) and stalls large transfers while tiny health checks pass.

---

## Recap in Three Lines

1. Networks slice every transfer into small **packets**, each pairing a **`40`-byte delivery header** with up to **`1,460` bytes of payload** inside a **`1,500`-byte MTU**.
2. Small packets keep lost-packet retries negligible (`0.05%` of a `3 MB` photo) and stop large transfers from monopolizing shared Wi-Fi and cables.
3. Because packet headers carry sequence order, receivers buffer out-of-order arrivals and ask for only missing pieces back.

---

## Sources

- [RFC 791: Internet Protocol](https://www.rfc-editor.org/rfc/rfc791) — packet format, IP header structure (`20-byte` minimum), and fragmentation rules.
- [RFC 9293: Transmission Control Protocol](https://www.rfc-editor.org/rfc/rfc9293) — TCP `20-byte` header, sequence ordering, and reliable retransmission.
- [RFC 894: Transmission of IP Datagrams over Ethernet Networks](https://www.rfc-editor.org/rfc/rfc894) — standard **`1,500-byte` Ethernet MTU**.

---

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-N-002.pdf](https://backendroadmap.com/notes/system-design/SD-N-002.pdf).

---

## Next

Continue with [Lesson 03: IP Addresses: The Street Address of Every Device](../03-ip-addresses/README.md) to see how every packet finds the exact home router and device inside billions of endpoints on Earth.
