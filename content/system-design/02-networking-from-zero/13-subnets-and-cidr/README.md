# Lesson 13: Subnets and CIDR — Neighbourhoods of Addresses

> **Prerequisites:** [Lesson 03: IP Addresses](../03-ip-addresses/README.md), [Lesson 12: UDP vs TCP](../12-udp-vs-tcp/README.md), and [Networking From Zero Overview](../README.md) (Lesson 13 of 30).  
> **Estimated Reading Time:** 28 minutes  
> **Target Audience:** Backend and platform engineers sizing cloud VPCs, preventing Kubernetes Pod CIDR IP exhaustion, resolving overlapping VPN/VPC peering collisions, and interpreting CIDR routing tables.  
> **Free PDF Notes:** [Download SD-N-013.pdf](https://backendroadmap.com/notes/system-design/SD-N-013.pdf)

> [!TIP]
> **The Golden Rule of Subnets & CIDR:** **CIDR (`/prefix`)** replaces rigid legacy IP classes with a movable bit divider splitting a `32`-bit IPv4 address into `p` network bits and `32 - p` host bits—giving **$2^{32-p} - 2$** usable LAN hosts (or **$2^{32-p} - 5$** inside AWS/GCP/Azure VPC subnets). Always carve non-overlapping blocks from **RFC 1918** (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) and **RFC 6598 CGNAT** (`100.64.0.0/10`) upfront, because two subnets with overlapping CIDRs can **never** peer cleanly without messy NAT workarounds.

---

## Words You'll Meet Today

| Word | In Plain Words | Role in a Live Backend System |
| :--- | :--- | :--- |
| **CIDR** | *Classless Inter-Domain Routing*: arbitrary bit boundaries instead of fixed sizes. | Lets cloud architects carve exact `/28` to `/16` blocks (`RFC 4632`). |
| **Prefix length (`/p`)** | How many leading bits belong to the neighborhood, out of `32`. | `/24` locks the first `24` bits (`10.20.4.x`) and leaves `8` bits for hosts. |
| **Subnet mask** | `32`-bit bitmask of `1`s followed by `0`s showing network vs. host bits. | `/24` equals `255.255.255.0`; bitwise `ip & mask` extracts the network ID. |
| **Network & Broadcast ID** | First IP (all `0` host bits) and last IP (all `1` host bits) in a subnet. | Reserved by IP standards (plus `3` extra IPs reserved by cloud providers!). |
| **RFC 1918** | Private IPv4 neighborhoods reserved for internal LANs and cloud VPCs. | `10.0.0.0/8`, `172.16.0.0/12`, and `192.168.0.0/16` (unroutable on public internet). |
| **CGNAT (`100.64.0.0/10`)** | Shared carrier-grade NAT address pool (`RFC 6598`, `~4.19M` IPs). | Used by ISPs, Tailscale/WireGuard overlays, and secondary Kubernetes Pod CIDRs. |
| **Longest Prefix Match** | Routing rule picking whichever matching CIDR has the largest `/p`. | Ensures `/24` local subnet routes beat broader `/16` or `0.0.0.0/0` defaults. |
| **CIDR Overlap** | Two VPCs or clusters accidentally claiming the same IP range. | Blocks VPC peering and VPN site-to-site routing (`10.0.0.0/16` collision). |

---

## Visual Mental Models & Architecture

### The Question: Why Did AWS Say "No Available IPs" When You Only Have `250` Containers?

You launch a Kubernetes cluster in a `/24` cloud subnet (`256` addresses) expecting to run `250` services. Everything stalls around `240` containers, and a week later your company acquires another startup whose VPC cannot connect to yours because both used `10.0.0.0/16`. In [lesson 03](../03-ip-addresses/README.md) we met single IP addresses; today we see how addresses group into **subnets**, how bit math controls their exact size, and how bad CIDR planning breaks cloud scale.

### An Everyday Picture First: Adjustable Neighborhood Borders

Early IPv4 (**classful networking**) worked like a rigid real-estate law with only three block sizes: **Class A** (`16,777,216` houses), **Class B** (`65,536` houses), and **Class C** (`256` houses). If a university needed `400` addresses, Class C was too small, so it received an entire Class B—wasting **`65,136`** IP addresses!

**CIDR** threw away fixed classes and introduced a **sliding divider**: write `/p` after an IP (`10.20.4.0/24`) to mark how many of the `32` bits name the neighborhood, leaving `32 - p` bits for individual houses inside it. Move the divider left by one bit (`/24` -> `/23`) and the neighborhood doubles cleanly; move it right (`/24` -> `/25`) and it splits evenly in half.

### Bit-Boundary Math, Subnet Masks, and Cloud Reservations

Every IPv4 address is `32` binary bits grouped into four `8`-bit octets (`0–255`). A `/24` prefix keeps the left `24` bits fixed and varies the right `8` bits:

- **Subnet mask:** `24` ones followed by `8` zeros = `11111111.11111111.11111111.00000000` = **`255.255.255.0`**.
- **Total addresses:** $2^{32-24} = 2^8 = 256$ (`10.20.4.0` through `10.20.4.255`).
- **Standard LAN usable hosts:** $256 - 2 = \mathbf{254}$ because `.0` (all host bits `0`) is the **network ID** and `.255` (all host bits `1`) is the **broadcast address**.
- **Cloud VPC usable hosts (AWS / GCP / Azure):** Cloud virtual networks reserve **`5`** addresses in every subnet! In `10.20.4.0/24`, `.0` is Network, `.1` is VPC Router, `.2` is VPC DNS, `.3` is reserved for future use, and `.255` is Broadcast—leaving **`251` usable IPs**, not `254`! On a tiny `/28` (`16` total IPs), reserving `5` leaves only **`11`** usable hosts (`16 - 5 = 11`).

```mermaid
flowchart TD
    Root["10.20.4.0/24 (256 total IPs - 251 cloud usable)"] --> SplitA["10.20.4.0/25 (128 total IPs - 123 cloud usable)"]
    Root --> SplitB["10.20.4.128/25 (128 total IPs - 123 cloud usable)"]
    SplitA --> Q1["10.20.4.0/26 (AZ-a: 64 IPs, 59 usable)"]
    SplitA --> Q2["10.20.4.64/26 (AZ-b: 64 IPs, 59 usable)"]
    SplitB --> Q3["10.20.4.128/26 (AZ-c: 64 IPs, 59 usable)"]
    SplitB --> Q4["10.20.4.192/26 (Reserved future block)"]
```

*Figure 1. Clean binary subdivision of a `/24` block: each extra prefix bit splits the range in two with zero overlap (`0..63`, `64..127`, `128..191`, `192..255`).*

### `RFC 1918`, `RFC 6598` CGNAT, and Longest Prefix Match

Private networks reuse three **`RFC 1918`** ranges that internet backbone routers refuse to forward publicly:

- **`10.0.0.0/8`** (`10.0.0.0` – `10.255.255.255`): **`16,777,216`** addresses (`2^24`). Cloud standard for large multi-VPC enterprises.
- **`172.16.0.0/12`** (`172.16.0.0` – `172.31.255.255`): **`1,048,576`** addresses (`2^20`). *Careful:* `172.32.0.1` is **public**, not private!
- **`192.168.0.0/16`** (`192.168.0.0` – `192.168.255.255`): **`65,536`** addresses (`2^16`). Common home/office default (`192.168.1.0/24`).

Because corporate clouds often exhaust `RFC 1918` or suffer overlaps during mergers, **`RFC 6598`** defined **`100.64.0.0/10`** (`100.64.0.0` – `100.127.255.255`, `4,194,304` IPs) for Carrier-Grade NAT (CGNAT). Platform teams also adopt `100.64.0.0/10` as a secondary VPC CIDR exclusively for **Kubernetes Pods** or **Tailscale/mesh VPNs** so pods never collide with primary corporate `10.x` routes.

When a packet arrives at a router whose table holds overlapping prefixes (for instance `0.0.0.0/0`, `10.20.0.0/16`, and `10.20.4.0/24`), how does the router choose? By **Longest Prefix Match (LPM)**: every matching CIDR is evaluated, and the **longest `/p`** wins because it names the most specific neighborhood (`24 > 16 > 0`).

```mermaid
flowchart LR
    Pkt["Packet Dst: 10.20.4.15"] --> Match1{"Matches 10.20.4.0/24?"}
    Match1 -->|"Yes (24 matching bits - MOST SPECIFIC)"| R1["Forward directly to Subnet Eth0"]
    Match1 -->|No| Match2{"Matches 10.20.0.0/16?"}
    Match2 -->|"Yes (16 matching bits)"| R2["Forward to VPC Peering Tunnel"]
    Match2 -->|No| Match3["Fallback 0.0.0.0/0 (0 bits - Default Gateway)"]
```

*Figure 2. Longest Prefix Match: `10.20.4.15` matches all three routes in the table, so the router picks `/24` (`24` bits) over `/16` and `0.0.0.0/0` regardless of table row order.*

### Kubernetes Pod CIDR & AWS VPC Exhaustion Traps

In cloud-native Kubernetes plugins like **AWS VPC CNI** or **Azure CNI**, *every Pod* gets a real IP address directly from the VPC subnet—not just each EC2/VM node! A cluster with `40` worker nodes holding `30` pods each consumes `40 + (40 × 30) = 1,240` VPC IPs (plus warm ENI IP pre-allocations!). Put that cluster in a `/24` (`251` IPs) or `/22` (`1,019` IPs), and autoscaling grinds to a halt mid-traffic spike with `FailedCreatePodSandBox`. Meanwhile, leaving every VPC on the wizard default `10.0.0.0/16` makes peering two VPCs impossible later because routers cannot decide which `10.0.0.0/16` owns `10.0.1.25`.

---

## Systematic Reference & Comparison Grid

### Essential CIDR Prefix Reference

| Prefix | Subnet Mask | Total IPs ($2^{32-p}$) | Standard LAN Usable ($-2$) | Cloud VPC Usable ($-5$) | Typical Production Role |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`/32`** | `255.255.255.255` | `1` | `1` (host route) | `1` (EIP / BGP host) | Single-host firewall rule, loopback, BGP `/32` VIP |
| **`/31`** | `255.255.255.254` | `2` | `2` (`RFC 3021` P2P) | N/A | Router-to-router point-to-point fiber links |
| **`/30`** | `255.255.255.252` | `4` | `2` | N/A (cloud min is `/28`) | Legacy point-to-point VPN / Direct Connect links |
| **`/28`** | `255.255.255.240` | `16` | `14` | **`11`** | Smallest AWS/GCP subnet (NAT GW or Transit GW link) |
| **`/26`** | `255.255.255.192` | `64` | `62` | **`59`** | Small database tier subnet per Availability Zone |
| **`/25`** | `255.255.255.128` | `128` | `126` | **`123`** | Public ALB/NLB ingress subnet per AZ |
| **`/24`** | `255.255.255.0` | `256` | `254` | **`251`** | Standard private app subnet or single K8s node Pod CIDR |
| **`/22`** | `255.255.252.0` | `1,024` | `1,022` | **`1,019`** | Medium regional microservice subnet |
| **`/20`** | `255.255.240.0` | `4,096` | `4,094` | **`4,091`** | Production Kubernetes worker subnet per AZ (VPC CNI) |
| **`/16`** | `255.255.0.0` | `65,536` | `65,534` | `65,531` (VPC block) | Entire cloud VPC CIDR (`10.24.0.0/16`) |
| **`/10`** | `255.192.0.0` | `4,194,304` | — | — | `RFC 6598` CGNAT secondary pod/overlay block |
| **`/8`** | `255.0.0.0` | `16,777,216` | `16,777,214` | — | Entire `10.0.0.0/8` enterprise IP space |

The governing sizing equations are:

$$
\text{Total IPs} = 2^{32 - p}, \qquad \text{Usable}_{\text{LAN}} = 2^{32 - p} - 2, \qquad \text{Usable}_{\text{Cloud VPC}} = 2^{32 - p} - 5
$$

*(Exception: `/32` identifies a single host `1` IP, and `/31` per `RFC 3021` omits network/broadcast for `2` point-to-point router IPs.)*

### Special-Purpose IPv4 Address Blocks

| Range | RFC | Scope / Routable? | Production Meaning |
| :--- | :--- | :--- | :--- |
| **`10.0.0.0/8`** | `RFC 1918` | Private | `10.0.0.0` – `10.255.255.255` |
| **`172.16.0.0/12`** | `RFC 1918` | Private | `172.16.0.0` – `172.31.255.255` (`172.32.x` is public!) |
| **`192.168.0.0/16`** | `RFC 1918` | Private | `192.168.0.0` – `192.168.255.255` |
| **`100.64.0.0/10`** | `RFC 6598` | Shared CGNAT | `100.64.0.0` – `100.127.255.255` (Tailscale, K8s Pods, ISP NAT) |
| **`127.0.0.0/8`** | `RFC 1122` | Host Loopback | Never leaves the OS kernel (`127.0.0.1`) |
| **`169.254.0.0/16`** | `RFC 3927` | Link-Local | Zero-conf & cloud metadata service (`169.254.169.254`) |
| **`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`** | `RFC 5737` | Documentation | Safe example "public" IPs for docs, tutorials, and tests |

---

## Production War Story Post-Mortem: Kubernetes IP Exhaustion & VPC Peering Deadlock

- **Severity:** SEV-1 (Zero new autoscaled Pods during peak sale + blocked payment partner integration)
- **Detection / Resolution Time:** 55 minutes to attach secondary CGNAT pod CIDR and unblock autoscaling; 3 weeks of Terraform migration to resolve peering overlap
- **Impact:** Kubernetes nodes hit `251/251` IPs in `10.0.1.0/24`, leaving `80` pending API pods stuck while checkout latency surged `4x`; meanwhile, `prod-payments` VPC could not peer with `prod-core` VPC because both defaulted to `10.0.0.0/16`.

### What Happened

```mermaid
sequenceDiagram
    participant HPA as "K8s Autoscaler"
    participant CNI as "VPC CNI Plugin"
    participant Subnet as "Subnet 10.0.1.0/24 (251 Usable)"
    participant NetAdmin as "VPC Peering Control Plane"

    HPA->>CNI: "Schedule 40 new API pods during traffic surge"
    CNI->>Subnet: "Allocate 40 ENI secondary IPs"
    Subnet-->>CNI: "ERR: InsufficientFreeAddressesInSubnet (251/251 in use)"
    CNI-->>HPA: "Pod stuck Pending: FailedCreatePodSandBox"
    Note over NetAdmin: "Parallel attempt to peer prod-core (10.0.0.0/16) with prod-payments (10.0.0.0/16)"
    NetAdmin-->>HPA: "REJECTED: Overlapping CIDR ranges cannot peer"
```

*Figure 3. Dual CIDR failure: a `/24` VPC CNI subnet ran out of real IPs after 251 pods + ENIs, while identical `10.0.0.0/16` VPC defaults made peering impossible.*

### Root Cause Analysis

1. **Under-Sized Pod Subnet (`/24`):** Engineers assumed `251` IPs was plenty for `12` nodes, forgetting that VPC CNI assigns one real subnet IP to *each Pod* plus pre-warmed ENI buffers (`12 nodes × 20 IPs = 240 IPs`, instantly hitting the `251` wall!).
2. **Wizard-Default Overlap:** Both VPCs accepted `10.0.0.0/16` during setup, violating the golden rule of unique enterprise IPAM allocation.

### The Fix & Architectural Hardening

- **Secondary `RFC 6598` Pod CIDR (`100.64.0.0/16`):** Attached `100.64.0.0/16` as a secondary VPC CIDR and enabled custom networking in VPC CNI so Pods draw from `65,000+` `100.64.x.x` IPs while Nodes/ALBs keep primary `RFC 1918` subnets.
- **Global IPAM Registry:** Assigned distinct `/16` blocks per account/region (`10.10.0.0/16` core-us-east, `10.20.0.0/16` payments-us-east, `10.30.0.0/16` staging) with `/20` (`4,091`-IP) worker subnets per AZ.

---

## Multi-Language Production Implementation

Below is a clean **IPv4 CIDR Parser, IP-in-Subnet Checker & Cloud VPC Subnet Range Calculator** in Go, TypeScript, Python, and C#. Notice how every language uses unsigned `32`-bit bitwise arithmetic (`uint32` / `>>> 0`) so bit shifts never sign-extend into negative numbers!

````carousel
```go
package cidr

import (
	"fmt"
	"net/netip"
)

type SubnetSummary struct {
	CIDR             string
	Network          netip.Addr
	Broadcast        netip.Addr
	FirstUsableCloud netip.Addr
	LastUsableCloud  netip.Addr
	TotalIPs         uint64
	LanUsable        uint64
	CloudUsable      uint64
}

func DescribeIPv4Subnet(cidrStr string) (SubnetSummary, error) {
	prefix, err := netip.ParsePrefix(cidrStr)
	if err != nil || !prefix.Addr().Is4() {
		return SubnetSummary{}, fmt.Errorf("invalid IPv4 CIDR: %s", cidrStr)
	}
	masked := prefix.Masked() // Normalize host bits to zero
	bits := masked.Bits()
	total := uint64(1) << (32 - bits)

	netB := masked.Addr().As4()
	netInt := uint32(netB[0])<<24 | uint32(netB[1])<<16 | uint32(netB[2])<<8 | uint32(netB[3])
	bcastInt := netInt | uint32(total-1)

	toAddr := func(v uint32) netip.Addr {
		return netip.AddrFrom4([4]byte{byte(v >> 24), byte(v >> 16), byte(v >> 8), byte(v)})
	}

	var lanUsable, cloudUsable uint64
	var firstCloud, lastCloud netip.Addr
	if total >= 2 {
		lanUsable = total - 2
	}
	if bits == 32 {
		lanUsable, cloudUsable = 1, 1
		firstCloud, lastCloud = toAddr(netInt), toAddr(netInt)
	} else if total > 5 {
		cloudUsable = total - 5 // Cloud reserves .0, .1, .2, .3, and broadcast
		firstCloud, lastCloud = toAddr(netInt+4), toAddr(bcastInt-1)
	}

	return SubnetSummary{
		CIDR:             masked.String(),
		Network:          toAddr(netInt),
		Broadcast:        toAddr(bcastInt),
		FirstUsableCloud: firstCloud,
		LastUsableCloud:  lastCloud,
		TotalIPs:         total,
		LanUsable:        lanUsable,
		CloudUsable:      cloudUsable,
	}, nil
}

func ContainsIP(cidrStr, ipStr string) (bool, error) {
	p, err := netip.ParsePrefix(cidrStr)
	if err != nil {
		return false, err
	}
	ip, err := netip.ParseAddr(ipStr)
	if err != nil {
		return false, err
	}
	return p.Contains(ip), nil
}
```
<!-- slide -->
```typescript
export interface SubnetSummary {
  cidr: string;
  network: string;
  mask: string;
  broadcast: string;
  totalIps: number;
  lanUsable: number;
  cloudUsable: number;
}

function ipToUint32(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }
  return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}

function uint32ToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function describeCidr(cidr: string): SubnetSummary {
  const [ipStr, prefixStr] = cidr.split("/");
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`Invalid CIDR prefix: ${cidr}`);
  }
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = (ipToUint32(ipStr) & mask) >>> 0;
  const totalIps = 2 ** (32 - prefix);
  const broadcast = (network | (~mask >>> 0)) >>> 0;

  return {
    cidr: `${uint32ToIp(network)}/${prefix}`,
    network: uint32ToIp(network),
    mask: uint32ToIp(mask),
    broadcast: uint32ToIp(broadcast),
    totalIps,
    lanUsable: prefix === 32 ? 1 : prefix === 31 ? 2 : Math.max(0, totalIps - 2),
    cloudUsable: prefix === 32 ? 1 : Math.max(0, totalIps - 5),
  };
}

export function isIpInSubnet(cidr: string, candidateIp: string): boolean {
  const [ipStr, prefixStr] = cidr.split("/");
  const prefix = Number(prefixStr);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return ((ipToUint32(ipStr) & mask) >>> 0) === ((ipToUint32(candidateIp) & mask) >>> 0);
}
```
<!-- slide -->
```python
from dataclasses import dataclass
import ipaddress


@dataclass(frozen=True)
class SubnetSummary:
    cidr: str
    network: str
    mask: str
    broadcast: str
    total_ips: int
    lan_usable: int
    cloud_usable: int


def describe_ipv4_subnet(cidr: str) -> SubnetSummary:
    net = ipaddress.IPv4Network(cidr, strict=False)
    total = net.num_addresses
    if net.prefixlen == 32:
        lan_usable, cloud_usable = 1, 1
    elif net.prefixlen == 31:
        lan_usable, cloud_usable = 2, 0
    else:
        lan_usable = max(0, total - 2)
        cloud_usable = max(0, total - 5)  # Cloud reserves .0, .1, .2, .3, and broadcast

    return SubnetSummary(
        cidr=str(net),
        network=str(net.network_address),
        mask=str(net.netmask),
        broadcast=str(net.broadcast_address),
        total_ips=total,
        lan_usable=lan_usable,
        cloud_usable=cloud_usable,
    )


def ip_in_subnet(cidr: str, ip: str) -> bool:
    return ipaddress.IPv4Address(ip) in ipaddress.IPv4Network(cidr, strict=False)
```
<!-- slide -->
```csharp
using System;
using System.Buffers.Binary;
using System.Net;

public sealed record SubnetSummary(
    string Cidr, string Network, string Mask, string Broadcast,
    ulong TotalIps, ulong LanUsable, ulong CloudUsable);

public static class CidrCalculator
{
    private static uint ParseUInt32(string ip) =>
        BinaryPrimitives.ReadUInt32BigEndian(IPAddress.Parse(ip).GetAddressBytes());

    private static string FormatIp(uint val)
    {
        Span<byte> bytes = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(bytes, val);
        return new IPAddress(bytes).ToString();
    }

    public static SubnetSummary Describe(string cidr)
    {
        var parts = cidr.Split('/');
        int prefix = int.Parse(parts[1]);
        if (prefix < 0 || prefix > 32) throw new ArgumentOutOfRangeException(nameof(cidr));

        uint mask = prefix == 0 ? 0u : ~0u << (32 - prefix);
        uint network = ParseUInt32(parts[0]) & mask;
        uint broadcast = network | ~mask;
        ulong total = 1UL << (32 - prefix);

        ulong lanUsable = prefix == 32 ? 1 : prefix == 31 ? 2 : total >= 2 ? total - 2 : 0;
        ulong cloudUsable = prefix == 32 ? 1 : total > 5 ? total - 5 : 0;

        return new SubnetSummary(
            $"{FormatIp(network)}/{prefix}", FormatIp(network), FormatIp(mask),
            FormatIp(broadcast), total, lanUsable, cloudUsable);
    }

    public static bool Contains(string cidr, string candidateIp)
    {
        var parts = cidr.Split('/');
        int prefix = int.Parse(parts[1]);
        uint mask = prefix == 0 ? 0u : ~0u << (32 - prefix);
        return (ParseUInt32(parts[0]) & mask) == (ParseUInt32(candidateIp) & mask);
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows

### 1. Inspect Your Host's Active CIDR Prefixes and Broadcast Addresses

```bash
ip -4 addr show
```

**Expected Output:**

```text
2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP
    inet 10.20.4.18/24 brd 10.20.4.255 scope global dynamic eth0
```

Here `/24` immediately confirms the local subnet spans `10.20.4.0`–`10.20.4.255` with broadcast `10.20.4.255`.

### 2. Inspect Kernel Longest-Prefix Route Precedence

```bash
ip route show
```

**Expected Output:**

```text
default via 10.20.4.1 dev eth0 proto dhcp src 10.20.4.18 metric 100
10.20.0.0/16 via 10.20.4.1 dev eth0
10.20.4.0/24 dev eth0 proto kernel scope link src 10.20.4.18
```

Notice the kernel keeps `default` (`0.0.0.0/0`), `/16`, and `/24` side by side—evaluating Longest Prefix Match on every packet.

### 3. Verify Arbitrary CIDR Splits & Cloud Capacities With Python

```bash
python3 -c "import ipaddress; n=ipaddress.ip_network('10.20.4.0/24'); print(n.netmask, n.num_addresses, n.num_addresses-5, list(n.subnets(new_prefix=26)))"
```

**Expected Output:**

```text
255.255.255.0 256 251 [IPv4Network('10.20.4.0/26'), IPv4Network('10.20.4.64/26'), IPv4Network('10.20.4.128/26'), IPv4Network('10.20.4.192/26')]
```

---

## Pause and Think

> [!exercise] You carve `10.4.8.0/26` for a Kubernetes subnet inside AWS. How many Pods/instances can run there simultaneously if each requires 1 VPC IP, and what happens if you try to assign `10.4.8.65` inside that subnet? Decide before opening the answer.

<details><summary>Answer</summary>

A `/26` holds $2^{32-26} = 2^6 = 64$ total addresses (`10.4.8.0` through `10.4.8.63`). Subtracting AWS's `5` reserved IPs (`.0` network, `.1` router, `.2` DNS, `.3` future use, `.63` broadcast) leaves **$64 - 5 = 59$ usable IPs**. `10.4.8.65` does **not** belong to `10.4.8.0/26`—it sits inside the adjacent `/26` block (`10.4.8.64/26`)!

</details>

---

## Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: The Classic `172.16.0.0/12` Private Range Trap</strong></summary>

**Scenario:** An engineer creates firewall allowlists treating `172.32.10.5` as an internal `RFC 1918` microservice IP. Security flags an external exposure immediately. Why?

**Solution:**
`RFC 1918` allocates **`172.16.0.0/12`**, NOT `172.0.0.0/8`! A `/12` leaves `4` host bits inside the second octet ($2^4 = 16$ increments starting at `16`), spanning **`172.16.0.0` through `172.31.255.255`**. Anything at `172.32.0.0` or higher is a **globally routable public IP**!

</details>

<details><summary><strong>Checkpoint 2: Carve a `/22` VPC Block Cleanly Across Three Availability Zones</strong></summary>

**Scenario:** You are handed `10.50.0.0/22` (`1,024` IPs) for a new staging VPC spanning `3` Availability Zones, plus `1` reserved future block of equal size. What four CIDR blocks do you create?

**Solution:**
Adding `2` prefix bits splits `/22` into `2^2 = 4` equal `/24` blocks (`256` total / `251` cloud-usable IPs each):
- AZ-a: `10.50.0.0/24` (`10.50.0.0` – `10.50.0.255`)
- AZ-b: `10.50.1.0/24` (`10.50.1.0` – `10.50.1.255`)
- AZ-c: `10.50.2.0/24` (`10.50.2.0` – `10.50.2.255`)
- Future reserve: `10.50.3.0/24` (`10.50.3.0` – `10.50.3.255`)

</details>

<details><summary><strong>Checkpoint 3: Diagnosing Mismatched Subnet Masks on the Same Switch</strong></summary>

**Scenario:** Host A (`10.1.0.50/24`) and Host B (`10.1.1.20/23`) sit on the same Ethernet switch. Host B can send ARP directly for `10.1.0.50`, whereas Host A insists on sending traffic for `10.1.1.20` to its default gateway (`10.1.0.1`). Why?

**Solution:**
From Host B's `/23` view (`10.1.0.0`–`10.1.1.255`), `10.1.0.50` is **on-link in the same subnet**, so Host B broadcasts ARP locally. From Host A's narrower `/24` view (`10.1.0.0`–`10.1.0.255`), `10.1.1.20` sits **outside** its subnet, so Host A routes replies through `10.1.0.1`—creating broken asymmetric ARP/routing! Both hosts on one segment must share the exact same prefix length.

</details>

---

## Common Mistakes & Troubleshooting

### What Goes Wrong

- **Using `/24` subnets for VPC-CNI Kubernetes workers:** Containers consume real subnet IPs directly, exhausting `251` addresses within minutes of autoscaling.
- **Accepting `10.0.0.0/16` everywhere:** Multiple VPCs with identical CIDRs block future VPC peering, Transit Gateways, and corporate VPN integration.
- **Forgetting non-aligned start addresses:** `10.0.0.50/24` is not a valid network boundary; a `/24` must start on a multiple of `256` (`10.0.0.0/24`), and a `/26` must start on `0`, `64`, `128`, or `192`.

### Common Myths

- **"A `/24` gives 254 usable IPs in AWS/GCP/Azure."** Only on bare-metal LANs (`-2`). Cloud VPCs reserve `.0`, `.1`, `.2`, `.3`, and broadcast, leaving **`251`** usable IPs.
- **"Adding 1 to the prefix doubles the subnet."** Backwards! Moving from `/24` to `/25` **halves** the subnet (`256` -> `128`); moving from `/24` to `/23` **doubles** it (`256` -> `512`).

### Troubleshooting Matrix

| Symptom / Error | Network Evidence | Root Cause | Fix |
| :--- | :--- | :--- | :--- |
| `InsufficientFreeAddressesInSubnet` | K8s Pods stuck `Pending` | Pod CNI exhausted `/24` or `/25` | Attach `/19`–`/20` worker subnets or `100.64.0.0/16` secondary Pod CIDR |
| VPC peering creation rejected | `Overlapping CIDR` API error | Two VPCs share `10.0.0.0/16` | Use IPAM registry + distinct `/16`s, or NAT proxy / PrivateLink |
| Firewall allows public IP as internal | Traffic passes to `172.32.x.x` | Misread `172.16.0.0/12` boundary | Audit rules strictly against `172.16.0.0` – `172.31.255.255` |

---

## Recap in Three Lines

1. **CIDR (`/p`)** divides a `32`-bit IPv4 address at any bit boundary: `p` bits name the network neighborhood and `32 - p` bits name hosts inside it (`2^(32-p) - 2` on LANs, `- 5` in cloud VPCs).
2. Routers resolve overlapping prefixes using **Longest Prefix Match**, picking whichever matching route carries the largest `/p`.
3. Carve non-overlapping **`RFC 1918`** and **`RFC 6598` (`100.64.0.0/10`)** blocks via central IPAM upfront so cloud peering and Kubernetes Pod CNI scaling never hit an overlap or exhaustion wall.

---

## Interview Practice Questions

> [!interview] What is CIDR notation, and how many usable IPs are in a `/24` vs. a `/28`? (Basic)

<details><summary>What to say in 30 seconds</summary>

CIDR writes the number of network prefix bits after a slash, leaving 32 minus p bits for hosts. A `/24` has 8 host bits—256 total addresses, 254 usable on a traditional LAN (subtracting network and broadcast) or 251 inside AWS/GCP/Azure VPCs (which reserve 5 IPs). A `/28` has 4 host bits—16 total, 14 LAN usable, or just 11 cloud VPC usable.

</details>

> [!interview] Why did CIDR replace classful networking (Class A, B, C)? (Basic)

<details><summary>What to say in 30 seconds</summary>

Classful networking locked organizations into fixed blocks of 16 million, 65,536, or 256 addresses. Any company needing 500 IPs received an entire Class B of 65,536 addresses—wasting 99% of them—and global routing tables swelled with millions of Class C entries. CIDR lets networks carve exact power-of-two blocks at any bit boundary and aggregate routes together.

</details>

> [!interview] Name the three RFC 1918 private ranges and explain what `100.64.0.0/10` is used for. (Basic)

<details><summary>What to say in 30 seconds</summary>

RFC 1918 reserves `10.0.0.0/8`, `172.16.0.0/12` (ending at `172.31.255.255`, not `172.32`), and `192.168.0.0/16` for internal networks. `100.64.0.0/10` is RFC 6598 Shared Address Space originally created for ISP Carrier-Grade NAT, and today platform teams widely use it as a non-overlapping secondary CIDR for Kubernetes Pods or WireGuard/Tailscale overlays.

</details>

> [!interview] What happens when two AWS VPCs with the same `10.0.0.0/16` CIDR need to talk? (Scenario)

<details><summary>What to say in 30 seconds</summary>

Direct VPC peering fails immediately because routers cannot tell which VPC owns a destination like `10.0.1.15`. Long-term you must migrate one VPC to a non-overlapping CIDR allocated via IPAM; short-term you work around it using AWS PrivateLink (endpoint services), an intermediary proxy/NAT subnet in a disjoint secondary CIDR, or application-level API gateways.

</details>

> [!interview] A Kubernetes cluster in `/24` subnets stops scheduling new Pods at ~240 Pods even though nodes have plenty of CPU and RAM. Why? (Scenario)

<details><summary>What to say in 30 seconds</summary>

With VPC-native CNIs like AWS VPC CNI, every Pod—and warm ENI IP buffer—consumes a real VPC subnet IP, not just each VM node. A `/24` only gives 251 cloud-usable IPs total across nodes and pods. Fix it by migrating workloads to `/20` or `/19` subnets or attaching a `100.64.0.0/16` secondary CGNAT CIDR exclusively for pods.

</details>

> [!interview] A router has entries for `0.0.0.0/0`, `10.20.0.0/16`, and `10.20.4.0/24`. Which route wins for `10.20.4.99` and why? (Tricky)

<details><summary>What to say in 30 seconds</summary>

`10.20.4.0/24` wins regardless of table order because routers always apply Longest Prefix Match. Although `10.20.4.99` matches all three prefixes, `/24` specifies 24 matching leading bits versus 16 and 0, making it the most specific route.

</details>

---

## Free PDF notes

Download these notes as a printable PDF, with the CIDR cheat sheet, cloud reservation math, and interview answers: [SD-N-013.pdf](https://backendroadmap.com/notes/system-design/SD-N-013.pdf).

---

## Sources

- [RFC 4632: Classless Inter-domain Routing (CIDR)](https://www.rfc-editor.org/rfc/rfc4632), `/prefix` allocation and aggregation.
- [RFC 1918: Address Allocation for Private Internets](https://www.rfc-editor.org/rfc/rfc1918), `10/8`, `172.16/12`, `192.168/16`.
- [RFC 6598: IANA-Reserved IPv4 Prefix for Shared Address Space](https://www.rfc-editor.org/rfc/rfc6598), `100.64.0.0/10` CGNAT range.
- [RFC 3021: Using 31-Bit Prefixes on IPv4 Point-to-Point Links](https://www.rfc-editor.org/rfc/rfc3021), `/31` router link exception.
- [AWS VPC Subnet Sizing Documentation](https://docs.aws.amazon.com/vpc/latest/userguide/subnet-sizing.html), the five reserved cloud VPC addresses per subnet.

---

## Next

Next comes [Lesson 14: Routing and NAT — How Packets Find Their Way, and Why Your Phone Shares One Public Address](../14-routing-and-nat/README.md), tracing hop-by-hop forwarding, ARP, and NAT port exhaustion. Until then, the [track overview](../README.md) lists the whole series.
