# Lesson 18: Simple Beats Clever

## Roadmap

You are in **System Design Interview Prep**, Track 01, **Core Fundamentals**: lesson 18 of 19 (cost, performance and complexity trade-offs). It builds on [Lesson 17: Single Point of Failure](../17-single-point-of-failure/README.md). Next comes [Lesson 19: Stateless vs Stateful](../19-stateless-vs-stateful/README.md).

These are the written notes for the lesson's video. Prefer paper? The same notes are a free, printable PDF: [download SD-A-018.pdf](https://backendroadmap.com/notes/system-design/SD-A-018.pdf).

## Concept

> [!key] Every component costs money, operational effort and new failure modes; design for your real scale plus reasonable growth, compare designs by total cost of ownership, and keep the simplest one that meets the numbers.

## Explanation

### Every box has a price

![The cloud bill is the smallest part of what a component costs.](images/figure-1.svg)

*Figure 1. The cloud bill is the smallest part of what a component costs.*

The real cost is the **total cost of ownership (TCO)**: infrastructure plus engineering time, on-call pain and slower feature work. A design that saves 10% on servers but needs two more engineers to run it is not cheaper.

### A worked example

![Both designs meet the load; the simple one does it with far less to build and run.](images/figure-2.svg)

*Figure 2. Both designs meet the load; the simple one does it with far less to build and run.*

### YAGNI: you aren't gonna need it

Design for your real scale plus reasonable growth, perhaps 10×, not 100×. Leave clear **seams** (a data-access layer, an interface in front of the store) so you can add caching or sharding later, when the numbers demand it.

> [!model] **Triggers to add complexity.** Add sharding when the primary's write load or data size nears its limits even after scaling up; add a cache when read latency or database load misses targets; split a service when a team or a scaling need demands it. Each trigger is a number, not a feeling.

### Estimating cost per request

> [!example] **Worked example.** **Load:** 2,000 queries/s × ~2.6 M seconds a month ≈ **5.2 billion requests a month**. **Monthly cost:** add up servers, storage, network and the share of engineering time. **Divide:** say $6,000 / 5,200 million ≈ **$1.15 per million requests**. Now two designs can be compared with real numbers instead of opinions.

### Performance has a price curve

Going from 500 ms to 100 ms may be cheap: an index, a cache, fewer round trips. Going from 10 ms to 2 ms can cost a fortune: more memory, more regions, specialised hardware. Spend where users actually feel the difference, and stop when the requirement is met.

## Key terms

| Term | Meaning |
|---|---|
| **TCO** | total cost: infrastructure + people + risk |
| **YAGNI** | don't build what you don't need yet |
| **Seam** | an interface that lets you swap parts later |
| **Cost per request** | monthly cost ÷ monthly requests |
| **Operational load** | work to deploy, monitor, fix |
| **Over-engineering** | complexity beyond the requirements |

## Interview questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system) and **Tricky** (the follow-ups interviewers use to go deeper). Answer out loud before you open the answer.

> [!interview] When is a simpler design better, even if it scales less? (Basic)

<details><summary>What a strong answer covers</summary>

When it meets the real load with headroom: it's cheaper to run, easier to operate, and has fewer failure modes.

</details>

> [!interview] How do you estimate the cost of a design? (Basic)

<details><summary>What a strong answer covers</summary>

Estimate the load, add up monthly infrastructure and people costs, and compute cost per request or per million requests.

</details>

> [!interview] What is YAGNI in system design? (Basic)

<details><summary>What a strong answer covers</summary>

Don't build for scale or features you don't need yet; design for real scale plus ~10× growth, and leave seams to extend later.

</details>

> [!interview] 2,000 QPS, mostly reads. Shard or not? (Scenario)

<details><summary>What a strong answer covers</summary>

Not yet: a Postgres primary with read replicas (and maybe a cache) handles it comfortably. Shard when write load or data size approaches a single primary's limits.

</details>

> [!interview] Your team proposes Kafka for 50 events a second. Your view? (Scenario)

<details><summary>What a strong answer covers</summary>

Probably overkill: a database table or a managed queue handles 50/s with far less to operate. Kafka pays off at high throughput, replay or many consumers.

</details>

> [!interview] Product wants p99 from 40 ms to 10 ms. How do you decide? (Scenario)

<details><summary>What a strong answer covers</summary>

Ask what users or revenue gain, estimate the cost (memory, regions, rework), and compare. If 40 ms already feels instant, spend elsewhere.

</details>

> [!interview] Isn't designing for 100× scale the safe choice? (Tricky)

<details><summary>What a strong answer covers</summary>

No. It costs money and complexity now, slows feature work, and the real bottlenecks at 100× are hard to predict. Seams plus measured triggers are safer.

</details>

> [!interview] Can a simpler design be less reliable? (Tricky)

<details><summary>What a strong answer covers</summary>

Sometimes; a single database is a SPOF. Simple doesn't mean no redundancy: keep replicas and failover, just avoid complexity the requirements don't ask for.

</details>

## Common mistakes & troubleshooting

- Big-tech architecture on day one: microservices, Kafka, sharding for 1,000 users.
- Comparing designs on cloud cost only.
- Optimising latency far beyond what users notice.
- No seams, so the simple design can't grow later.

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-A-018.pdf](https://backendroadmap.com/notes/system-design/SD-A-018.pdf). All Phase 1 notes in one file: [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf).

## Next

Continue with [Lesson 19: Stateless vs Stateful](../19-stateless-vs-stateful/README.md).
