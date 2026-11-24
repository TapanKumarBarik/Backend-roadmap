# Track: Estimation and Numbers

Back-of-the-envelope math for interviews: traffic, storage, bandwidth, cache, instances, growth, diagrams, bottlenecks and SPOFs.

Part of **Phase 2** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLEBaLYrJs0lI). Every lecture has a video and a full written short-lecture (16-point System Design rubric) with PDF study notes.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Open the lesson page for the written lecture: formulas, Mermaid war stories, multi-language carousels, 12 interview Q&As, and a one-page cheat sheet.
- Free PDFs live at `https://backendroadmap.com/notes/system-design/SD-D-XXX.pdf`.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Back-of-the-Envelope Estimation: Which Numbers to Ask First](01-back-of-the-envelope-estimation/README.md) | Ask for the right inputs and state round assumptions | Live |
| 02 | [Latency Numbers & Powers of Two Every Engineer Should Know](02-latency-numbers-powers-of-two-every-engineer-should-know/README.md) | Convert day totals to RPS and reason with the latency ladder | Live |
| 03 | [How to Estimate RPS: DAU, Reads vs Writes & Peak Traffic](03-how-to-estimate-rps/README.md) | Turn DAU × actions into per-service peak RPS with fan-out | Live |
| 04 | [Peak vs Average Traffic: How to Survive a 50× Spike](04-peak-vs-average-traffic/README.md) | Size for peak + headroom and absorb flash crowds | Live |
| 05 | [Read/Write Ratio: How 100:1 Reads Shape Your Architecture](05-read-write-ratio/README.md) | Choose cache-first vs write-optimized designs from the ratio | Live |
| 06 | [Storage Estimation: Size × Count × Retention × Replicas](06-storage-estimation/README.md) | Multiply four factors and plan compound growth | Live |
| 07 | [Bandwidth Estimation: Ingress, Egress, Gbps & CDN Offload](07-bandwidth-estimation/README.md) | Convert RPS × bytes to Gbps and apply CDN offload | Live |
| 08 | [Cache Sizing: Working Set, the 80/20 Rule & Redis Nodes](08-cache-sizing/README.md) | Size Redis from working set, hot fraction, and headroom | Live |
| 09 | [How Many Servers Do You Need? Capacity, 60% Target & N+2](09-how-many-servers-do-you-need-capacity-60-target-n-2/README.md) | Convert peak RPS into multi-AZ instance counts | Live |
| 10 | [Growth Projections: Compound Growth, Runway & When to Shard](10-growth-projections/README.md) | Compute runway and start shard projects on time | Live |
| 11 | [Back-of-the-Envelope Estimation: Full URL Shortener Drill](11-back-of-the-envelope-estimation/README.md) | Run the full five-minute estimation drill end to end | Live |
| 12 | [Architecture Diagrams: Sync vs Async, Read/Write Paths, C4](12-architecture-diagrams/README.md) | Draw labeled L→R diagrams with sync/async and C4 levels | Live |
| 13 | [Identifying Bottlenecks: Find What Breaks First (50k Writes/s)](13-identifying-bottlenecks/README.md) | Rank load÷capacity on the critical path | Live |
| 14 | [Identifying SPOFs: Ask 'What If This Dies?' for Every Box](14-identifying-spofs/README.md) | Audit boxes, arrows, and hidden dependencies for SPOFs | Live |

Start here → [Back-of-the-Envelope Estimation: Which Numbers to Ask First](01-back-of-the-envelope-estimation/README.md)

Back to the course index: [../README.md](../README.md)
