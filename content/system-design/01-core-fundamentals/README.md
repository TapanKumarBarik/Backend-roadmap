# Track 01: Core Fundamentals

The ideas every system design answer is built from: what to ask before you draw anything, how a system is layered and scaled, the numbers that describe it (latency, throughput, availability), the trade-offs between them (CAP, PACELC, consistency), and what happens when parts of it fail. Nineteen short lectures, about 52 minutes of video in all, each with a written lecture that goes further than the video can.

## How this track works

- Each lecture is a video of two to three minutes on [the channel](https://www.youtube.com/playlist?list=PLdZs-f1PXX48) and a written lecture here. On the site the video plays at the top of the lecture's page, with its chapters; the text underneath has the example in code, a diagram, exercises with answers and the interview questions with what a strong answer covers.
- Go in order. Every lecture assumes the ones before it and nothing outside this track; the first has no prerequisites.
- The same running example, a small web app that grows from one server to a system with replicas, a cache and a CDN, comes back through the track, so the ideas attach to something you can picture.
- Lectures whose written version is not ready yet are marked *Soon* in the sidebar. Their video is already up; open the lesson to watch it.

## Lectures

| # | Lecture | What you'll be able to do | Video |
|---|---------|---------------------------|-------|
| 01 | [What Is System Design? HLD vs LLD](01-what-is-system-design/README.md) | Explain what system design is, how HLD differs from LLD, and what an interviewer is listening for | 2:24 |
| 02 | [Client-Server and Multi-Tier Architecture](02-client-server-and-multi-tier-architecture/README.md) | Describe one-, two-, three- and N-tier systems, and why each tier can scale on its own | 2:46 |
| 03 | [Functional Requirements](03-functional-requirements/README.md) | Turn a vague prompt into three to five core use cases before drawing a single box | 2:29 |
| 04 | [Non-Functional Requirements](04-non-functional-requirements/README.md) | State latency, availability and scale targets, the numbers that decide the architecture | 2:56 |
| 05 | [Trade-offs and How to Justify a Design](05-trade-offs-and-how-to-justify-a-design/README.md) | Justify any design choice by naming what it improves and what it costs | 2:51 |
| 06 | [Vertical Scaling](06-vertical-scaling/README.md) | Know when scaling up is the right first move, and the four limits that end it | 2:35 |
| 07 | [Horizontal Scaling](07-horizontal-scaling/README.md) | Scale out behind a load balancer with stateless services and autoscaling | 2:37 |
| 08 | [Latency](08-latency/README.md) | Think in percentiles and latency budgets, with the numbers every engineer should know | 2:57 |
| 09 | [Throughput and Little's Law](09-throughput-and-littles-law/README.md) | Connect requests per second, concurrency and latency with Little's Law | 2:59 |
| 10 | [Availability](10-availability/README.md) | Read the nines, MTBF and MTTR, and work out availability in series and in parallel | 2:55 |
| 11 | [Reliability, Availability and Durability](11-reliability-availability-and-durability/README.md) | Tell "up" from "correct" from "not lost", and design for each | 2:50 |
| 12 | [Scalability](12-scalability/README.md) | Describe load precisely, and see why systems stop scaling long before the servers run out | 2:43 |
| 13 | [CAP Theorem](13-cap-theorem/README.md) | State what CAP really says, and choose consistency or availability on purpose | 2:56 |
| 14 | [PACELC Theorem](14-pacelc-theorem/README.md) | Reason about the latency-versus-consistency trade-off in the 99% of the time nothing is broken | 2:40 |
| 15 | [Consistency Models](15-consistency-models/README.md) | Place linearizable, causal and eventual consistency on one spectrum and pick by need | 2:51 |
| 16 | [Fault Tolerance](16-fault-tolerance/README.md) | Tell a fault from a failure, and limit the blast radius with zones and redundancy | 2:41 |
| 17 | [Single Point of Failure](17-single-point-of-failure/README.md) | Find single points of failure and remove them, active-passive or active-active | 2:43 |
| 18 | [Simple Beats Clever](18-simple-beats-clever/README.md) | Weigh cost, performance and complexity before adding another box to the diagram | 2:39 |
| 19 | [Stateless vs Stateful](19-stateless-vs-stateful/README.md) | Explain why state breaks scaling, and how sessions, sticky routing and websockets deal with it | 2:54 |

Start here → [01-what-is-system-design/README.md](01-what-is-system-design/README.md)

Back to the course index: [../README.md](../README.md)

---

When this track is done, the depth is in [backend/](../../backend/README.md), and the practice is in [track 14, System Design Interview Practice](../../backend/14-system-design-interview-practice/README.md): capacity estimation, a framework for the whiteboard, and the classic designs end to end.
