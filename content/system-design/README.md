# System Design Interview Prep: From Requirements to Distributed Systems

A short-lecture course on the ideas every system design interview is built on. Each lecture is a video of a few minutes on [the YouTube channel](https://www.youtube.com/@tapankumarbarik9454) and a written lecture here: the example in code, a diagram, exercises with answers, and the interview questions with what a strong answer covers. Watch first and read to keep it, or read first and watch to check yourself. On the site, the lecture's page plays the video at the top.

This is a large course — nine YouTube phases, hundreds of lessons — being built out one written lecture at a time. A lecture whose text is still to come is marked *Soon* in the sidebar: open it to see what it will cover. Related deeper modules in [`backend/`](../backend/README.md), [`learn/`](../learn/README.md) and [`genai/`](../genai/README.md) may already play the same video beside a longer lesson; this course is the System Design short-lecture home.

## How this course fits with the rest of the site

- [`backend/`](../backend/README.md) is where the depth is. Every idea here is a short version of something taught properly there, and its last track, [System Design Interview Practice](../backend/14-system-design-interview-practice/README.md), is the whiteboard practice this course leads to.
- [`lld/`](../lld/README.md) is the other half of the interview. System design in the sense of this course is high-level design (services, storage, data flow); low-level design is how the classes inside one service are shaped, and has its own course.
- Open the site's **Videos** page for every playlist in order.

## Naming convention

Same convention as `backend/`:

- **Tracks** are top-level folders under `system-design/`, named `NN-track-name`, in the order you do them in.
- **Lectures** are subfolders of a track, named `NN-lecture-name`.
- Every lecture folder contains exactly one `README.md`, and a lecture's video is attached to it in `content/videos.json` (`docs/VIDEOS.md` explains how), not written into the file.
- This file is the index of the course.

## Full roadmap (9 phases)

| Phase | Playlist | Tracks on this course | Written notes |
|------:|----------|-----------------------|---------------|
| 1 | [Core Fundamentals](https://www.youtube.com/playlist?list=PLdZs-f1PXX48) | [01-core-fundamentals](01-core-fundamentals/README.md) | Live |
| 2 | [Networking, APIs & Databases](https://www.youtube.com/playlist?list=PLEBaLYrJs0lI) | [02-networking-from-zero](02-networking-from-zero/README.md) · [03-api-design](03-api-design/README.md) · [04-databases](04-databases/README.md) · [05-estimation-and-numbers](05-estimation-and-numbers/README.md) | Networking + API + Databases + Estimation live |
| 3 | [Caching, Scaling & Traffic](https://www.youtube.com/playlist?list=PLWDD-HPgiAnA) | [06-load-balancing](06-load-balancing/README.md) · [07-caching](07-caching/README.md) · [08-performance-and-traffic](08-performance-and-traffic/README.md) | Live |
| 4 | [Distributed Systems & Messaging](https://www.youtube.com/playlist?list=PLTQZUTpyfa_k) | [09-distributed-systems](09-distributed-systems/README.md) · [10-messaging](10-messaging/README.md) | *Coming soon* |
| 5 | [Architecture, Reliability, Security & Observability](https://www.youtube.com/playlist?list=PLNdzHik9GD0I) | [11-reliability-and-sre](11-reliability-and-sre/README.md) · [12-architecture-patterns](12-architecture-patterns/README.md) · [13-security](13-security/README.md) · [14-observability-and-delivery](14-observability-and-delivery/README.md) | *Coming soon* |
| 6 | [Advanced & Specialized Systems](https://www.youtube.com/playlist?list=PLbu9hGadb_zQ) | [15-storage](15-storage/README.md) · [16-search](16-search/README.md) · [17-realtime-and-data](17-realtime-and-data/README.md) · [18-multi-tenant-saas](18-multi-tenant-saas/README.md) · [19-cloud-and-platform](19-cloud-and-platform/README.md) | *Coming soon* |
| 7 | [AI & GenAI System Design](https://www.youtube.com/playlist?list=PLUzoYXMCrSX4) | [20-ai-and-genai-system-design](20-ai-and-genai-system-design/README.md) | *Coming soon* |
| 8 | [Interview Design Problems](https://www.youtube.com/playlist?list=PLCa3R_S2yPGI) | [21-interview-framework](21-interview-framework/README.md) · [22-interview-design-problems](22-interview-design-problems/README.md) | *Coming soon* |
| 9 | [Revision & Mock Interviews](https://www.youtube.com/playlist?list=PLY0eWXEZNuF8) | [23-revision-and-mock-interviews](23-revision-and-mock-interviews/README.md) | *Coming soon* |

## Tracks

| # | Track | What you'll be able to do after | Status |
|---|-------|---------------------------------|--------|
| 1 | [01-core-fundamentals](01-core-fundamentals/README.md) | Start a design by clarifying requirements, describe a system's layers, scale it out, reason about latency, throughput, availability, CAP and consistency, and design for failure | Live |
| 2 | [02-networking-from-zero](02-networking-from-zero/README.md) | Explain, from nothing, how data crosses the internet: packets, addresses, TCP, DNS, HTTP, TLS and the infrastructure in between | Live |
| 3 | [03-api-design](03-api-design/README.md) | Design REST/GraphQL/gRPC surfaces, versioning, pagination, idempotency, rate limits and contracts | Live |
| 4 | [04-databases](04-databases/README.md) | Choose and reason about SQL/NoSQL, indexes, isolation, replication and sharding | Live |
| 5 | [05-estimation-and-numbers](05-estimation-and-numbers/README.md) | Do back-of-the-envelope traffic, storage, bandwidth and capacity math | Live |
| 6 | [06-load-balancing](06-load-balancing/README.md) | Pick L4/L7 algorithms, health checks and HA for load balancers | Live |
| 7 | [07-caching](07-caching/README.md) | Place caches, pick TTLs/eviction and avoid stampedes | Live |
| 8 | [08-performance-and-traffic](08-performance-and-traffic/README.md) | Scale stateless and stateful services and apply backpressure | Live |
| 9 | [09-distributed-systems](09-distributed-systems/README.md) | Reason about partitions, consensus, idempotency and consistency | Coming soon |
| 10 | [10-messaging](10-messaging/README.md) | Choose brokers vs streams and delivery semantics | Coming soon |
| 11 | [11-reliability-and-sre](11-reliability-and-sre/README.md) | Set SLOs, error budgets and resilience patterns | Coming soon |
| 12 | [12-architecture-patterns](12-architecture-patterns/README.md) | Choose monolith, modular monolith or services on purpose | Coming soon |
| 13 | [13-security](13-security/README.md) | Cover authn/authz, secrets and threat modeling in a design | Coming soon |
| 14 | [14-observability-and-delivery](14-observability-and-delivery/README.md) | Use logs/metrics/traces, canaries and feature flags | Coming soon |
| 15 | [15-storage](15-storage/README.md) | Pick object/block/file storage and backup tiers | Coming soon |
| 16 | [16-search](16-search/README.md) | Design full-text search and scale it | Coming soon |
| 17 | [17-realtime-and-data](17-realtime-and-data/README.md) | Design chat, presence, feeds and top-K | Coming soon |
| 18 | [18-multi-tenant-saas](18-multi-tenant-saas/README.md) | Isolate tenants and handle noisy neighbors | Coming soon |
| 19 | [19-cloud-and-platform](19-cloud-and-platform/README.md) | Use regions, AZs and cloud service models deliberately | Coming soon |
| 20 | [20-ai-and-genai-system-design](20-ai-and-genai-system-design/README.md) | Design LLM apps, RAG, serving, agents and safety | Coming soon |
| 21 | [21-interview-framework](21-interview-framework/README.md) | Structure a 45-minute system design interview | Coming soon |
| 22 | [22-interview-design-problems](22-interview-design-problems/README.md) | Walk classic and modern design prompts end to end | Coming soon |
| 23 | [23-revision-and-mock-interviews](23-revision-and-mock-interviews/README.md) | Revise numbers, weak areas and check readiness | Coming soon |

Start here → [01-core-fundamentals/01-what-is-system-design/README.md](01-core-fundamentals/01-what-is-system-design/README.md)
