# IP Addressing & Subnetting

## Why this matters

Every routing decision, firewall rule, and cloud network you will ever configure is expressed in terms of IP addresses and subnets. If you cannot look at `10.0.4.7/22` and immediately say what range it belongs to and whether another address is in the same network, you will misread routes, open firewall holes by accident, and be unable to debug "why can't these two machines talk?" Subnetting is the one piece of arithmetic in this whole track worth doing by hand until it is automatic.

## Concepts

### What an IP address is

An IPv4 address is a 32-bit number, written as four **octets** (bytes) in dotted-decimal: `192.168.1.10`. Each octet is 0–255. That's it — `192.168.1.10` is just a friendlier way to write one 32-bit number. An address identifies an **interface** on a host, not the host itself; a machine with two network cards has two addresses.

An address alone is not enough to communicate. A host also needs a **subnet mask**, which splits the 32 bits into a **network part** (shared by every host on the same local network) and a **host part** (unique to each host within it). Think of it like a postal address: the network part is the street, the host part is the house number. Everyone on the same street can hand mail to each other directly; anything for another street goes to the post office (the gateway).

### CIDR notation and the subnet mask

The mask is written two equivalent ways. The old way is a dotted-decimal mask like `255.255.255.0`. The modern way is **CIDR**: a slash and the number of network bits, like `/24`. `/24` means "the first 24 bits are network, the remaining 8 are host" — which is exactly `255.255.255.0` (24 one-bits followed by 8 zero-bits). So `192.168.1.10/24` says: network bits are the first 24, host bits are the last 8.

The number of host bits determines how many addresses the network holds: `2^(host bits)`. A `/24` has 8 host bits = 256 addresses. But two of those are reserved: the **network address** (all host bits 0, e.g. `192.168.1.0`) names the network itself, and the **broadcast address** (all host bits 1, e.g. `192.168.1.255`) reaches everyone on it. So a `/24` gives `256 - 2 = 254` usable host addresses. General rule: usable hosts = `2^(host bits) - 2`.

### Reading a subnet: network, broadcast, and range

To find the network address, keep the network bits and set all host bits to zero. For `10.0.4.7/22`: `/22` means 22 network bits, 10 host bits. The third octet is where the boundary falls (bits 17–24 are the third octet, so the /22 boundary is 6 bits into the third octet). The block size in the third octet is `256 - 252 = 4` (since a /22 mask third octet is `252`). So networks step by 4 in the third octet: `10.0.0.0`, `10.0.4.0`, `10.0.8.0`... `10.0.4.7` falls in the `10.0.4.0/22` block, which spans `10.0.4.0` through `10.0.7.255`, with broadcast `10.0.7.255` and usable hosts `10.0.4.1`–`10.0.7.254`.

The mechanical trick: for the octet where the mask isn't 0 or 255, the **block size** is `256 - mask_octet`. Network boundaries are multiples of that block size. Find the largest multiple ≤ your address's octet, and you've found the network. Do this by hand a dozen times and it becomes instant; `ipcalc` (below) checks your work.

### Public vs private addresses

Some address ranges are reserved as **private** — usable freely inside any organization but never routed on the public internet. Memorize them:

- `10.0.0.0/8` (10.x.x.x) — 16 million addresses
- `172.16.0.0/12` (172.16.x.x – 172.31.x.x) — note it's only 16–31, not all of 172
- `192.168.0.0/16` (192.168.x.x)

Your home router, WSL2, and Docker all hand out private addresses. Because private ranges repeat in every network on earth, a packet from a private address can't be delivered across the internet — it must be translated to a public address first (NAT, module 05). **Public** addresses are globally unique and assigned by registries. Also note `127.0.0.0/8` (loopback, stays on the local machine) and `169.254.0.0/16` (link-local, a fallback when no address was configured — seeing one usually means DHCP failed).

### The "local or gateway?" decision

Here is why the mask matters operationally. When a host wants to send a packet, it applies its own mask to both its address and the destination address. If the network parts match, the destination is **on the same local network** and the host delivers directly over the link layer (resolving the destination's MAC via ARP). If they differ, the destination is **remote**, and the host sends the packet to its **default gateway** instead. This single comparison, made for every packet, is the whole reason a wrong subnet mask breaks connectivity: get the mask wrong and the host either tries to deliver locally something that's remote, or ships to the gateway something that was a neighbor all along.

### IPv6 in one breath

IPv4's 32 bits (~4 billion addresses) ran out, so IPv6 uses **128 bits**, written as eight groups of four hex digits: `2001:0db8:0000:0000:0000:ff00:0042:8329`. Long runs of zeros compress: leading zeros in a group drop, and one run of all-zero groups becomes `::`, giving `2001:db8::ff00:42:8329`. The concepts transfer directly — there's still a prefix length (`/64` is the standard subnet size), still network and host portions, still public and special ranges (`fe80::/10` is link-local, `::1` is loopback). You will meet IPv6 more in the Azure track; for now, know it exists, know `::1` is "localhost," and know the CIDR idea is identical.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `ip addr` | Shows interfaces, their IP addresses, and prefix lengths | `ip -brief addr` |
| `ip route` | Shows which subnets are reachable directly vs via the gateway | `ip route get 8.8.8.8` |
| `ipcalc` | Calculates network, broadcast, and host range from a CIDR | `ipcalc 10.0.4.7/22` |
| `ping` | Tests reachability of a specific address | `ping -c 3 192.168.1.1` |
| `ip addr add` | Assigns an address+mask to an interface (needs sudo) | `sudo ip addr add 10.0.0.5/24 dev eth0` |
| `ip addr del` | Removes an address from an interface (needs sudo) | `sudo ip addr del 10.0.0.5/24 dev eth0` |

Flag breakdowns:

- `ip -brief addr` — `-brief` (or `-br`) prints one compact line per interface (name, state, addresses) instead of the verbose multi-line default; far easier to scan.
- `ip route get 8.8.8.8` — `get` asks the kernel to show exactly which route and gateway *this specific destination* would use, resolving the "local or gateway?" decision for you.
- `ipcalc 10.0.4.7/22` — takes an address in CIDR form and prints the network address, broadcast, netmask, and usable host range; add `-b` on some versions to suppress the binary display.
- `sudo ip addr add 10.0.0.5/24 dev eth0` — `add` assigns a new address; `10.0.0.5/24` is the address plus prefix length (mask); `dev eth0` names the interface it's bound to.

## Hands-on exercises

1. **Read your own subnet.** Run `ip -brief addr`. Take your `eth0` address with its `/prefix` and run `ipcalc <that-address>`. Confirm the network address, broadcast, and host range. Expected: for `172.28.20.5/20`, network `172.28.16.0`, broadcast `172.28.31.255`, 4094 usable hosts.

2. **Subnet by hand, then check.** Without tools, compute the network and broadcast for `192.168.10.130/26`. (Hint: /26 → mask octet 192 → block size 64 → boundaries 0,64,128,192.) Then verify with `ipcalc 192.168.10.130/26`. Expected: network `192.168.10.128`, broadcast `192.168.10.191`, hosts `.129`–`.190`.

3. **Same network or not?** Given `10.1.2.3/23` and `10.1.3.200/23`, decide by hand whether they're in the same subnet, then verify with `ipcalc` on each. Expected: /23 block size 2 in the third octet → both fall in `10.1.2.0/23` (spanning `10.1.2.0`–`10.1.3.255`), so yes, same network.

4. **Let the kernel decide local vs remote.** Run `ip route get <an-IP-on-your-subnet>` and `ip route get 8.8.8.8`. Compare: the on-subnet one shows a direct `dev` with no `via`; the remote one shows `via <gateway>`. You've watched the "local or gateway?" decision happen.

5. **Count the hosts.** For each of /30, /29, /28, /24, /16, state the number of usable hosts from memory (`2^(32-prefix) - 2`), then confirm a couple with `ipcalc`. Expected: /30 → 2, /29 → 6, /28 → 14, /24 → 254, /16 → 65534.

6. **Spot the private ranges.** For `172.15.0.1`, `172.20.0.1`, `192.168.5.5`, `10.255.255.254`, and `169.254.10.10`, label each as private, public, or special. Expected: `172.15` is *public* (private is only 16–31); `172.20` private; `192.168.5.5` private; `10.255.255.254` private; `169.254.x` link-local (DHCP-failure fallback).

7. **Create and remove an address.** On a throwaway interface (or `eth0`, carefully), run `sudo ip addr add 10.99.99.2/24 dev eth0`, confirm with `ip -br addr`, then `sudo ip addr del 10.99.99.2/24 dev eth0`. Expected: the address appears then disappears. (Don't remove your primary address.)

8. **Diagnose and fix: wrong subnet mask.** Set up the failure: `sudo ip addr add 10.50.0.10/28 dev eth0`. Now `ip route get 10.50.0.200` — with a /28, `10.50.0.200` is *outside* your `10.50.0.0/28` block (which ends at `.15`), so the kernel routes it via the gateway even though you intended them to be neighbors on a /24. The symptom "host on the same LAN is unreachable" is classically a mask that's too narrow. **Fix:** remove and re-add with the correct mask — `sudo ip addr del 10.50.0.10/28 dev eth0` then `sudo ip addr add 10.50.0.10/24 dev eth0` — and re-run `ip route get 10.50.0.200` to confirm it's now treated as local (direct `dev`, no `via`). Clean up with `ip addr del` afterward.

## Independent challenge

You are handed the block `172.16.0.0/22` for a small lab and told to carve it into four equal subnets, one per team, each needing at least 100 usable hosts. Determine the correct prefix length for the four subnets, list the network address, usable range, and broadcast for each, and state which subnet the address `172.16.2.150` lands in. This builds directly on the "local or gateway?" and block-size ideas here; it also leans on the layering model from **module 00** — specifically why a host on team 2's subnet reaching a host on team 3's subnet must go through a gateway rather than delivering directly.

<details><summary>Stuck? One hint</summary>

Four equal subnets means borrowing 2 host bits from the /22 (because `2^2 = 4`), giving you four /24s. Check the host count survives the requirement: a /24 has 254 usable hosts, comfortably above 100. Now just step through the third octet in blocks of 1 (since these are /24s within the /22): the four networks are `172.16.0.0`, `172.16.1.0`, `172.16.2.0`, `172.16.3.0`. Place `172.16.2.150` by its third octet.

</details>

## Common mistakes & troubleshooting

- **Off-by-one on the block size.** The block size is `256 - mask_octet`, and networks start at multiples of it *including zero*. Forgetting the zero boundary (`x.x.0.0`) is the most common subnetting error.
- **Assuming 172 is all private.** Only `172.16.0.0` through `172.31.255.255` (a /12) is private. `172.15.x.x` and `172.32.x.x` are public. This trips people constantly.
- **Forgetting the two reserved addresses.** The network and broadcast addresses are not assignable to hosts. A /30 (common for point-to-point links) has 4 addresses but only 2 usable.
- **Confusing prefix length with host count directly.** `/24` is not "24 hosts." It's 24 network bits, leaving 8 host bits = 254 usable. Always convert to host bits first.
- **A `169.254.x.x` address means something failed.** If a host self-assigned a link-local address, it means it never got a real one (DHCP failure). Don't try to route through it — fix the address assignment.
- **Changing your primary address over SSH/WSL.** Deleting the address you're connected through will drop your session. Practice `ip addr add/del` on a spare address, not your lifeline.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Convert `/26` to a dotted-decimal mask and state how many usable hosts it provides.
2. What is the network address and broadcast for `10.20.30.200/27`?
3. Are `192.168.1.100/24` and `192.168.2.100/24` in the same subnet? What happens when the first tries to reach the second?
4. Which of these are private: `10.0.0.1`, `172.31.255.1`, `172.32.0.1`, `192.168.0.1`?
5. Why does a host need the subnet mask, not just its own address, to send a packet?
6. What does a `169.254.x.x` address usually indicate?
7. How many usable hosts in a `/30`, and what is it commonly used for?

<details><summary>Show answers</summary>

1. `/26` = `255.255.255.192` (26 one-bits). Host bits = 6, so `2^6 - 2 = 62` usable hosts.
2. `/27` → mask octet 224, block size 32. `200` falls in the block starting at `192`. Network `10.20.30.192`, broadcast `10.20.30.223`, hosts `.193`–`.222`.
3. No — different network parts (`192.168.1` vs `192.168.2`). The first host sees the destination as remote and sends it to its default gateway rather than delivering directly.
4. Private: `10.0.0.1`, `172.31.255.1`, `192.168.0.1`. Public: `172.32.0.1` (private range stops at 172.31).
5. The mask tells the host which bits are network vs host, which is how it decides whether a destination is local (deliver directly) or remote (send to the gateway). Without it, that decision is impossible.
6. Link-local self-assignment — the host failed to obtain an address (e.g., DHCP didn't answer).
7. `2^2 - 2 = 2` usable hosts. Commonly used for point-to-point links between two routers, where exactly two addresses are needed.

</details>

## Next

[02 — DNS fundamentals](../02-dns-fundamentals/README.md): you can now reason about addresses, but humans use names. Learn how `example.com` becomes an IP before any packet is ever sent.
