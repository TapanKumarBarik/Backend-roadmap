# DNS Fundamentals

## Why this matters

Nearly every connection starts with a name, not an address, so DNS is the very first thing that runs when almost anything network-related happens — and it fails silently in ways that look like other problems ("the site is down," "the API is broken") when really the name just didn't resolve. A large fraction of real-world outages are DNS. Knowing the resolver chain, record types, and how caching/TTL work lets you tell "the name is wrong" from "the server is down" in seconds instead of chasing the wrong layer.

## Concepts

### What DNS does

DNS (Domain Name System) is the internet's phone book: it translates human-friendly names like `example.com` into IP addresses like `93.184.216.34` that the IP layer can actually route to (module 00, step 1). It's a distributed, hierarchical database — no single server holds every name; responsibility is delegated down a tree. Crucially, DNS is a *separate step* that happens **before** any TCP connection. When something "can't connect," the very first question is: did the name even resolve?

### The name hierarchy

Read a domain name right to left, most-general to most-specific. In `www.example.com.`:

- The trailing `.` (usually implied) is the **root**.
- `com` is the **top-level domain (TLD)**.
- `example` is the **second-level domain** — what an organization registers.
- `www` is a **subdomain / host** within `example.com`, controlled entirely by that organization.

Each level delegates authority for the level below it. The root servers know where the `.com` servers are; the `.com` servers know where `example.com`'s servers are; `example.com`'s **authoritative** servers hold the actual records. This delegation is why no one has to update a global master file when you add a subdomain — you just change your own zone.

### The resolver chain

When your program asks for `example.com`, it doesn't walk the tree itself. It asks a **resolver** (also called a recursive resolver) — typically your ISP's, your company's, or a public one like `8.8.8.8`. The resolver does the walking:

1. Ask a **root** server: "who handles `.com`?" → get a referral to the `.com` servers.
2. Ask a `.com` server: "who handles `example.com`?" → get a referral to `example.com`'s authoritative servers.
3. Ask an **authoritative** server: "what's the A record for `example.com`?" → get the answer.
4. Cache the answer and return it to your program.

Your program's request is **recursive** ("go find the whole answer for me"); the resolver's requests to each server are **iterative** ("just tell me the next step"). On Linux, which resolver you use is configured in `/etc/resolv.conf` (or managed by `systemd-resolved`). The file `/etc/hosts` is checked *first* — a static override that bypasses DNS entirely, which is both a handy tool and a common source of "why is this name resolving to the wrong thing?"

### Record types

A DNS zone holds several **record types**, each answering a different question:

- **A** — name → IPv4 address. The workhorse.
- **AAAA** — name → IPv6 address ("quad-A").
- **CNAME** — name → *another name* (an alias). `www.example.com` might CNAME to `example.com`. The resolver then looks up the target. A name with a CNAME can't also have other record types at the same level.
- **MX** — mail exchanger: where email for the domain goes, with priorities.
- **NS** — which servers are authoritative for the zone (the delegation records).
- **TXT** — arbitrary text, used for domain verification, SPF/DKIM email policy, etc.
- **PTR** — reverse lookup: IP → name (used in reverse DNS).
- **SOA** — start of authority: administrative metadata about the zone, including default TTLs.

### Caching and TTL

Walking the whole tree for every lookup would be catastrophically slow, so answers are **cached** at every level: your OS, your resolver, sometimes the application. Each record carries a **TTL (time to live)** in seconds — how long a cache may keep it before asking again. A record with TTL 3600 can be served from cache for an hour. Note the name collision with the IP-header TTL from module 00: that one is a *hop counter* decremented by routers; this one is a *caching lifetime in seconds*. They are entirely unrelated concepts that happen to share three letters — do not conflate them.

TTL is the knob behind two everyday realities. First, **propagation delay**: when you change a record, the old value can linger in caches worldwide until its TTL expires, which is why DNS changes "take up to 24 hours." Second, planned migrations: operators *lower* the TTL (say to 60 seconds) a day before a change so the switch takes effect quickly. When debugging, remember your machine may be answering from a stale cache — the authoritative server may already have the new value. Tools below let you query the authoritative server directly to bypass caches.

### Resolution order on Linux

Understanding *where* a name gets resolved prevents hours of confusion. The typical order: the application asks the C library resolver, which follows `/etc/nsswitch.conf` — usually `files` (i.e. `/etc/hosts`) first, then `dns` (the resolvers in `/etc/resolv.conf`). So a line in `/etc/hosts` wins over the entire DNS system. In WSL2 and containers, `/etc/resolv.conf` is often auto-generated, which matters when a name resolves differently than you expect — always check what resolver is actually configured before blaming the wider internet.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `dig` | Full-detail DNS query tool; shows the answer, TTL, and query path | `dig example.com A` |
| `dig @server` | Queries a *specific* DNS server, bypassing your default resolver | `dig @8.8.8.8 example.com` |
| `dig +trace` | Walks the delegation from the root, showing each referral | `dig +trace example.com` |
| `dig +short` | Prints just the answer, nothing else | `dig +short example.com` |
| `host` | Simple name-to-address lookup | `host example.com` |
| `getent hosts` | Resolves a name the way applications do (honors `/etc/hosts`) | `getent hosts example.com` |
| `nslookup` | Interactive/legacy lookup tool | `nslookup example.com` |
| `resolvectl` | Shows/queries systemd-resolved's configuration and cache | `resolvectl status` |

Flag breakdowns:

- `dig @8.8.8.8 example.com A` — `@8.8.8.8` directs the query to that specific server instead of your configured resolver (great for comparing what different servers return); `example.com` is the name; `A` is the record type to request.
- `dig +trace example.com` — `+trace` makes `dig` itself perform the iterative walk from the root servers down, printing each delegation step, so you see the whole resolver chain rather than a cached final answer.
- `dig +short +noall +answer example.com` — `+short` collapses output to the bare answer; alternatively `+noall +answer` shows just the answer section with TTLs, useful for reading TTL values while staying concise.

## Hands-on exercises

1. **A basic lookup.** Run `dig example.com A`. Identify the `ANSWER SECTION`, the returned IP, and the TTL (the number before `IN A`). Expected: one or more A records with a TTL counting down on repeat queries served from cache.

2. **Just the answer.** Run `dig +short example.com` and `getent hosts example.com`. Note that `getent` is what your applications actually use (it consults `/etc/hosts` first), while `dig` always talks to a DNS server. Expected: both return the same IP normally.

3. **Query a specific server.** Run `dig @8.8.8.8 example.com` and `dig @1.1.1.1 example.com`. Comparing answers from different resolvers is how you check whether a stale or wrong answer is local to you. Expected: matching IPs (for a stable domain).

4. **Watch caching happen.** Run `dig example.com` twice in quick succession and compare the TTL values. Expected: the second query shows a *lower* TTL (counting down) if served from your resolver's cache; when it hits zero the resolver refetches.

5. **Explore record types.** Run `dig example.com MX`, `dig example.com NS`, `dig example.com TXT`, and `dig example.com AAAA`. Expected: NS lists authoritative name servers; MX may be empty for `example.com`; AAAA shows an IPv6 address; TXT shows any text records.

6. **Trace the delegation.** Run `dig +trace example.com`. Read it top to bottom: root servers → `.com` servers → authoritative servers → final answer. Expected: several referral blocks ending in the A record, mirroring the resolver chain concept.

7. **Reverse lookup.** Take an IP from exercise 1 and run `dig -x <that-IP>`. This asks for the PTR record. Expected: either a hostname or no PTR record (many addresses lack reverse DNS).

8. **Diagnose and fix: DNS not resolving.** Create the failure with a bad `/etc/hosts` override: `echo "127.0.0.1 example.com" | sudo tee -a /etc/hosts`, then `getent hosts example.com` (returns `127.0.0.1`!) and `curl -v http://example.com` (connects to your own machine and fails). Notice `dig example.com` still returns the *real* IP — because `dig` ignores `/etc/hosts`. That discrepancy (`dig` right, `getent`/`curl` wrong) is the fingerprint of a hosts-file override. **Fix:** remove the bad line — `sudo sed -i '/127.0.0.1 example.com/d' /etc/hosts` — then confirm `getent hosts example.com` again returns the real IP. This is the exact reason to check `/etc/hosts` and compare `dig` vs `getent` when a name resolves wrongly.

9. **Diagnose and fix: broken resolver.** Inspect `/etc/resolv.conf` (`cat /etc/resolv.conf`). Imagine it listed an unreachable `nameserver 10.0.0.253`. The symptom: every DNS lookup hangs then times out, but `dig @8.8.8.8 example.com` (bypassing the configured resolver) works instantly. That split — direct-to-8.8.8.8 works, default resolver hangs — points straight at a bad `nameserver` entry rather than at the network or the destination. (Don't edit WSL2's auto-generated resolv.conf permanently; just reason through the diagnosis.)

## Independent challenge

A teammate reports that `api.internal.example` "won't connect" from their machine, but it works from yours. Design and carry out a diagnosis that distinguishes among four possibilities: (a) the name doesn't resolve at all on their box, (b) it resolves to a *different* IP than on yours, (c) it resolves correctly but the host is unreachable, or (d) a stale cache is involved. You must combine this module with **module 01** — because part of the diagnosis is checking whether the IP it resolves to is even in a routable/expected subnet versus a private or wrong range. Write down which command distinguishes each case.

<details><summary>Stuck? One hint</summary>

Split "resolve" from "reach." First compare `getent hosts api.internal.example` on both machines — if the IPs differ, suspect `/etc/hosts` or different resolvers (`cat /etc/resolv.conf`). Then check whether the resolved IP is even sane using your module-01 subnet knowledge (is it a `169.254.x`, a wrong private range, or a real one?). Only after the name resolves to a correct, expected IP do you test reachability of that IP directly with `ping`/`curl`. Comparing `dig` (real DNS) against `getent` (honors `/etc/hosts`) tells you whether a static override is in play.

</details>

## Common mistakes & troubleshooting

- **Treating a resolution failure as a connectivity failure.** "Could not resolve host" never means the network is down — it means the name step failed. Don't check cables and firewalls for a DNS problem.
- **Forgetting `/etc/hosts` wins.** A stray line there silently overrides real DNS. When `dig` and `curl`/`getent` disagree, `/etc/hosts` is the prime suspect.
- **Trusting your local cache during a migration.** After a DNS change, your machine may serve the old value until TTL expires. Query the authoritative server (`dig @<authoritative-NS>`) or use `+trace` to see truth.
- **Confusing CNAME with a redirect.** A CNAME is a DNS-level alias resolved before any connection; it is not an HTTP redirect. Chained CNAMEs add lookups and latency.
- **Assuming `dig` reflects what apps see.** `dig` bypasses `/etc/hosts` and sometimes uses a different resolver path than the C library. For "what will my app actually get," use `getent hosts`.
- **Ignoring TTL when planning changes.** Lower the TTL *before* a migration, not during it — lowering it after the change still leaves old-TTL copies cached.
- **IP TTL and DNS TTL share a name and nothing else.** The TTL you saw in module 00 is an IP-header *hop counter* decremented by each router (a packet is dropped when it hits zero). The TTL here is a *caching duration in seconds* telling resolvers how long they may keep a DNS record before refetching. Same three letters, completely unrelated mechanisms — a DNS TTL of 3600 has nothing to do with hops, and an IP TTL of 64 has nothing to do with time. Don't let the collision confuse a diagnosis.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In the resolver chain, what is the difference between a recursive query and an iterative query?
2. Your app resolves `foo.example` to the wrong IP, but `dig foo.example` returns the right one. What's the most likely cause?
3. What does a record's TTL control, and why does that cause "DNS changes take up to 24 hours"?
4. Which record type maps a name to another name, and what restriction comes with it?
5. You changed an A record but still see the old IP. Name two ways to see the authoritative (real) current value.
6. What's the difference between what `dig` consults and what `getent hosts` consults?
7. Reading `www.example.com` right to left, name the root, TLD, and registered domain.

<details><summary>Show answers</summary>

1. Recursive: "find me the complete final answer" — what your program asks its resolver. Iterative: "just tell me the next step/referral" — what the resolver asks each server as it walks root → TLD → authoritative.
2. `/etc/hosts` (or `/etc/nsswitch.conf` order) is overriding DNS for that name, since `dig` ignores `/etc/hosts` but the app doesn't.
3. TTL is how many seconds caches may keep the record before refetching. Old values linger in caches worldwide until their TTL expires, so changes appear to "propagate" slowly.
4. CNAME. A name with a CNAME cannot also hold other record types at the same level.
5. Query the authoritative name server directly (`dig @<NS> ...`), or use `dig +trace` to walk from the root and bypass caches.
6. `dig` queries DNS servers directly (ignoring `/etc/hosts`); `getent hosts` follows the system resolver order (`/etc/nsswitch.conf`), which normally checks `/etc/hosts` first, so it reflects what applications actually get.
7. Root = the implied trailing `.`; TLD = `com`; registered/second-level domain = `example` (with `www` a subdomain of it).

</details>

## Next

[03 — TCP, UDP, ports & sockets](../03-tcp-udp-ports-and-sockets/README.md): the name is resolved to an address — now learn how the transport layer actually opens a connection to a program on that host, reliably or not.
