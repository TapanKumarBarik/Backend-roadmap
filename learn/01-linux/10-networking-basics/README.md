# Networking Basics

## Why this matters

Almost nothing you'll do next in this curriculum - pulling Docker images, exposing container ports, reaching services inside a Kubernetes cluster, or hitting an AKS endpoint - makes sense without a working mental model of IP addresses, ports, and DNS. WSL2 also has its own private network identity separate from Windows, which trips up nearly every beginner the first time they try to reach a service running inside it. Getting comfortable with `ip`, `curl`, `ss`, and `dig` now means you'll actually understand *why* a container's port mapping works instead of just memorizing the syntax later.

## Concepts

**IP addresses identify a machine on a network.** Just as a postal address identifies a building, an IP address (like `192.168.1.15` or `172.20.10.2`) identifies a device on a network so traffic knows where to go. Your WSL2 Ubuntu instance has its own IP address, separate from your Windows host's IP address, because WSL2 runs as a lightweight virtual machine with its own virtual network adapter.

**Ports identify a specific service on that machine.** An IP address gets you to the right building; a port number gets you to the right door. A single machine can run many services at once (a web server, a database, an SSH daemon), each listening on a different port number - port 80 for HTTP, 443 for HTTPS, 22 for SSH, by long-standing convention, though any program can choose any free port.

```
  https://google.com/search
    │       │           │
    │       │           └── path: which resource on that service
    │       └── hostname → resolved via DNS to an IP address
    └── protocol: HTTPS (TCP under the hood), implies port 443 by convention

  Full picture for one request:
   hostname → DNS lookup → IP address → : port → protocol conversation
   google.com   (dig)      142.250...    443     TLS + HTTP
```

**Protocols are the agreed "rules of conversation."** TCP and UDP are the two most common transport protocols. TCP is connection-oriented and reliable (used by HTTP, SSH, most everyday traffic) - it guarantees delivery and order. UDP is connectionless and faster but doesn't guarantee delivery - used for things like DNS queries and video streaming where occasional loss is tolerable.

**Routing decides which path traffic takes.** When your machine sends a packet destined for an address outside its local network, it needs to know which "next hop" to send it to - this is the routing table, and the default route is essentially "if you don't know a more specific path, send it here" (usually your router/gateway).

**DNS translates names into addresses.** You type `google.com`, not an IP address, because DNS (Domain Name System) is a distributed lookup service that translates human-readable names into IP addresses. Your machine also has a local override file, `/etc/hosts`, that's checked before DNS is consulted - useful for testing or for pointing a hostname at a specific IP without touching real DNS.

**WSL2 networking is a virtual machine behind the scenes.** WSL2 runs Linux inside a lightweight, real virtual machine (unlike WSL1, which translated Linux syscalls directly on Windows). That means WSL2 gets its own virtual network adapter and its own IP address, distinct from Windows' IP address. Microsoft added "localhost forwarding" so that, in most default configurations, a service listening on `localhost`/`127.0.0.1` inside WSL2 is also reachable at `localhost` from Windows (and vice versa) - but this forwarding is a convenience layer, not literally the same network stack, and it can behave differently depending on Windows version, WSL version, and firewall/VPN software. Understanding that WSL2 has its own IP is the key to debugging when localhost forwarding doesn't behave as expected.

```
┌─────────────────────────┐         ┌─────────────────────────┐
│  Windows host             │         │  WSL2 (own lightweight   │
│  its own IP on your        │◄───────►│  VM, own virtual NIC,    │
│  physical/Wi-Fi network    │ vEthernet│  own IP - e.g. 172.x.x.x)│
│                             │ (WSL)   │                          │
│  ipconfig → "vEthernet     │         │  ip a → eth0 inet ...    │
│  (WSL)" adapter shows      │         │                          │
│  the bridge's own subnet   │         │  hostname -I → the same  │
└─────────────────────────┘         │  address, from inside    │
                                     └─────────────────────────┘
        both sides: localhost forwarding makes 127.0.0.1 usually
        reach across this boundary automatically - convenience,
        not evidence they share one network stack
```

## Command reference

| Command | What it does | Example |
|---|---|---|
| `ip addr` / `ip a` | Shows all network interfaces and their assigned IP addresses. | `ip a` lists interfaces like `lo` (loopback) and `eth0`, each with an `inet` line showing its IPv4 address. |
| `ip route` | Shows the routing table - which network destinations go through which interface/gateway. | `ip route` - the line starting `default via ...` shows your default gateway. |
| `ifconfig` | Legacy command that shows interface configuration; largely superseded by `ip addr`, and may need `sudo apt install net-tools` to be available. | `ifconfig` - mentioned here because you'll see it in older tutorials, but prefer `ip a` going forward. |
| `ping host` | Sends ICMP echo requests to a host and reports whether/how fast it responds; stops with Ctrl+C. | `ping -c 4 google.com` - the `-c 4` limits it to 4 pings instead of running forever. |
| `curl url` | Fetches a URL and prints the response body (a basic GET request) - the general-purpose HTTP client. | `curl https://example.com` - prints the raw HTML of the page. |
| `curl -I url` | Fetches only the HTTP response headers, not the body (a HEAD-style request). | `curl -I https://example.com` - shows status code and headers like `Content-Type` without downloading the page body. |
| `curl -o file url` | Saves the response body to a file instead of printing it. | `curl -o page.html https://example.com` - saves the page as `page.html`. |
| `wget url` | Downloads a file from a URL, saving it to disk by default (unlike plain `curl`, which prints to stdout). | `wget https://example.com/file.tar.gz` - downloads and saves `file.tar.gz` in the current directory. |
| `ss` | Shows active sockets (network connections and listening ports) - the modern replacement for `netstat`. | `ss -tulwn` - `-t` TCP, `-u` UDP, `-l` listening only, `-n` show numeric ports instead of resolving service names. |
| `netstat` | Older tool showing network connections/listening ports; may need `sudo apt install net-tools`. | `netstat -tulpn` - similar flags to `ss` (`-p` also shows the owning process, needs sudo for full detail). |
| `dig host` | Queries DNS and shows detailed resolution information for a hostname. | `dig google.com` - shows the ANSWER SECTION with the resolved IP address(es). |
| `nslookup host` | Simpler, older DNS lookup tool. | `nslookup google.com` - prints the resolved IP address in a shorter format than `dig`. |
| `traceroute host` | Shows the network hops (routers) a packet passes through to reach a destination; may need `sudo apt install traceroute`. | `traceroute google.com` - lists each hop with its response time; useful for diagnosing where connectivity slows down or breaks. |
| `cat /etc/hosts` | Views the local hostname-to-IP override file, checked before DNS. | `cat /etc/hosts` - typically shows `127.0.0.1 localhost` plus any custom entries. |
| `hostname -I` | Prints the IP address(es) assigned to this machine. | `hostname -I` inside WSL2 - prints your WSL2 instance's own IP address. |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Run `ip a` and find the entry for `eth0` (or similar). Note the `inet` address - this is your WSL2 instance's own IP address, separate from Windows'.

2. Run `hostname -I` as a quicker way to get just the IP address. Confirm the address matches what you saw in step 1.

3. In a Windows PowerShell or Command Prompt window (not WSL2), run `ipconfig` and look for the "vEthernet (WSL)" adapter. Compare its IP range to the address you found in WSL2 - they'll typically be on the same subnet but with different host addresses, confirming WSL2 has its own address on a virtual network Windows also has an interface into.

4. Back in WSL2, run `ip route` and identify the `default via ...` line. This tells you the gateway address your WSL2 instance uses to reach anything outside its own local network (including the internet).

5. Test basic connectivity: `ping -c 4 8.8.8.8`. Expect 4 replies with round-trip times. Then try `ping -c 4 google.com` - this additionally requires DNS resolution to succeed before ping can even send a packet, so it tests both DNS and connectivity at once.

6. Break DNS on purpose to see the error, then understand it: run `ping -c 2 not-a-real-domain-xyz123.com`. Read the error message closely - it should indicate the name could not be resolved. This is a DNS failure, not a network failure - contrast it with what you'd see if you pinged a valid domain but had no internet at all (a timeout instead of a resolution error).

7. Use `dig` to inspect DNS resolution in detail: `dig google.com`. Find the `ANSWER SECTION` and note the IP address(es) returned. Then run `nslookup google.com` and compare - it should show the same resolved address in a simpler format.

8. Fetch a real web page with curl: `curl -I https://example.com`. Confirm you see a status line like `HTTP/2 200` along with headers. Then run `curl https://example.com` (no `-I`) and note the difference - this time you get the full HTML body.

9. Download a file with `wget` and compare it to `curl -o`. Run `wget https://example.com -O example1.html` then `curl -o example2.html https://example.com`. Run `ls -l example1.html example2.html` and confirm both downloaded successfully and are similar in size.

10. Check listening services on your WSL2 instance: `ss -tulwn`. Look at the `Local Address:Port` column - if nothing is listening yet, that's expected at this stage; you'll revisit this command once you run actual services (starting in module 11, and heavily in Docker/Kubernetes).

11. Explore `/etc/hosts`: run `cat /etc/hosts`. Note the `127.0.0.1 localhost` line - this is why `ping localhost` or `curl localhost` resolves without needing real DNS. Then test the WSL2-to-Windows localhost forwarding behavior: if you have any web server available on Windows (or skip to just understanding the concept), note that in modern WSL2 setups, a service bound to `localhost` inside WSL2 is generally also reachable via `localhost` from Windows and vice versa - this is a convenience feature layered on top of WSL2's separate networking, not evidence that WSL2 and Windows literally share one network stack.

12. (Optional, if `traceroute` is installed - install with `sudo apt install traceroute` if needed) Run `traceroute google.com` and observe the list of hops. Some hops may show `* * *` (no response) - this is common for routers that don't reply to traceroute probes and doesn't necessarily indicate a problem.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** For a website of your choice, determine three separate things and be able to state which tool answered each: the IP address the name resolves to, whether the host is reachable at the network level at all, and what HTTP status code the web service returns. Then deliberately reason through how you would tell apart three different failure modes using these tools — a DNS resolution failure, a network-connectivity failure, and a "host is up but the web service is down" situation. If you want the check to be repeatable, wrap the whole sequence in a small script using module 09's skills.

<details>
<summary>Stuck? One hint</summary>

`dig` gives you the resolved address, `ping` (against both a name and a raw IP) separates DNS problems from connectivity problems, and `curl -I` reports the HTTP status without downloading the whole page body.

</details>

## Common mistakes & troubleshooting

- **Assuming WSL2's IP address is fixed.** WSL2's virtual network adapter IP can change between reboots or `wsl --shutdown` cycles. If a script or bookmark hardcodes WSL2's IP, it may break later - prefer `localhost` where forwarding applies, or re-check `hostname -I` when something stops connecting.
- **Confusing WSL2's IP with Windows' IP.** Beginners often try to reach a Windows-side service using the IP shown by `ip a` inside WSL2, or vice versa - these are different addresses on different (though bridged) virtual interfaces.
- **Expecting `ping` to always confirm a working web service.** A host can block ICMP (ping) traffic entirely while still serving HTTP/HTTPS just fine, and conversely a host can respond to ping but have its web service down. Use `curl` to actually test the specific service/protocol you care about.
- **Not distinguishing a DNS failure from a connectivity failure.** "Could not resolve host" means DNS lookup failed (check `/etc/hosts`, `dig`, and your DNS configuration). A timeout with no such error usually means the name resolved fine but the destination didn't respond - a different problem entirely.
- **Forgetting `-c` with `ping` on Linux.** Unlike some tools, Linux's `ping` runs forever by default until you press Ctrl+C - always use `-c N` in scripts or quick tests to avoid it hanging your terminal.
- **`ifconfig`/`netstat` not found.** These legacy tools live in the `net-tools` package, which isn't installed by default on modern Ubuntu. `sudo apt install net-tools` fixes it, but prefer `ip` and `ss` going forward since they're the actively maintained tools.
- **Assuming `wget` and `curl` behave identically by default.** `wget` saves to a file by default; `curl` prints to stdout by default (requiring `-o`/`-O` to save). Mixing up the default behavior is a common source of "why did it dump garbage in my terminal" or "where did my file go" confusion.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why does WSL2 have its own IP address separate from the Windows host's IP address?
2. What's the practical difference between what an IP address identifies versus what a port number identifies?
3. If `ping google.com` fails with "could not resolve host" but `ping 8.8.8.8` succeeds, what does that tell you about where the problem lies?
4. Why might a server respond normally to `curl` but not respond to `ping` at all?
5. What is `/etc/hosts` for, and why is it checked before DNS?
6. What does the "default route" in `ip route` actually represent?
7. Why would you use `curl -I` instead of plain `curl` when you just want to check if a site is up and returning a 200 status?
8. What's a plausible reason a hardcoded WSL2 IP address in a script might stop working after a Windows reboot?

<details>
<summary>Show answers</summary>

1. WSL2 runs Linux inside an actual lightweight virtual machine with its own virtual network adapter, distinct from WSL1's approach of translating Linux syscalls directly on Windows - so it gets a genuinely separate network identity, bridged to Windows via a virtual network rather than sharing Windows' interface directly.
2. An IP address identifies a specific machine (or network interface) on a network - which device to reach. A port number identifies a specific service or process running on that machine - which "door" on that device to knock on, since one machine can run many services simultaneously.
3. It tells you DNS resolution is broken or unreachable (the hostname could not be translated to an IP), while basic network connectivity is fine, since a raw IP address like 8.8.8.8 works without needing any name resolution.
4. Servers can be configured to ignore or block ICMP (ping) traffic for security/traffic-shaping reasons while still fully serving HTTP/HTTPS requests normally - ping and a web request use completely different protocols, so one being blocked doesn't imply the other is down.
5. `/etc/hosts` is a local, manual file mapping hostnames to IP addresses, checked before the system falls back to real DNS lookups. It's useful for testing, overriding a specific hostname's resolution, or working without a DNS server at all.
6. It's the "catch-all" next hop - the gateway/router traffic is sent to when the destination doesn't match any more specific route in the routing table, typically used to reach anything outside the local network (like the internet).
7. `curl -I` fetches only the response headers (including the status code) without downloading the full response body, which is faster and sufficient when you only need to confirm the site responds and what status it returns.
8. WSL2's virtual network adapter can be assigned a different IP address after a reboot or after `wsl --shutdown`, since the address isn't guaranteed to be static across restarts - a script relying on the old hardcoded IP would then fail to connect.

</details>

## Further reading & sources

- [Microsoft: Accessing network applications with WSL](https://learn.microsoft.com/en-us/windows/wsl/networking) - the official, current explanation of WSL2 networking modes (NAT vs. mirrored) and localhost forwarding behavior, including known limitations.
- [`man7.org`: ip(8)](https://man7.org/linux/man-pages/man8/ip.8.html) and [ss(8)](https://man7.org/linux/man-pages/man8/ss.8.html) - full option references for the modern `ip`/`ss` toolset this module favors over the legacy `ifconfig`/`netstat`.
- [`man7.org`: curl(1)](https://man7.org/linux/man-pages/man1/curl.1.html) - curl has dozens of flags beyond `-I`/`-o`; worth a skim once you start scripting HTTP checks.
- [Cloudflare Learning: What is DNS?](https://www.cloudflare.com/learning/dns/what-is-dns/) - a clear, vendor-neutral explanation of the DNS resolution process `dig`'s output represents.
- [Julia Evans: "A few reasons DNS is slow" / networking zines](https://wizardzines.com/zines/dns/) - practitioner-written, approachable deep dives if you want more networking intuition beyond this module.

## Next

Continue to [11-systemd-services](../11-systemd-services/README.md) to learn how Linux manages background services - and how to enable and use systemd inside WSL2.
