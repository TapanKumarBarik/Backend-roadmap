# Lesson 07: Horizontal Scaling

## Roadmap

You are in **System Design Interview Prep**, Track 01, **Core Fundamentals**: lesson 7 of 19 (add more servers instead of a bigger one). It builds on [Lesson 06: Vertical Scaling](../06-vertical-scaling/README.md). Next comes [Lesson 08: Latency](../08-latency/README.md).

These are the written notes for the lesson's video. Prefer paper? The same notes are a free, printable PDF: [download SD-A-007.pdf](https://backendroadmap.com/notes/system-design/SD-A-007.pdf).

## Concept

> [!key] Horizontal scaling (scaling out) runs many copies behind a load balancer; it only works when the service is stateless, and it's much harder for databases because they hold state.

## Explanation

### Scale out, not up

One machine always hits a ceiling. Scaling out runs many copies of a service side by side, with a load balancer in front spreading requests across them. Need more capacity? Add a copy. Traffic drops? Remove one. There's no hard ceiling, and losing one copy doesn't take the service down.

### The rule: be stateless

Imagine a server keeps a user's session in its own memory. The next request lands on a different server, the session isn't there, and the user is logged out. The fix is to move state out of the servers: sessions to a shared store like Redis (or a signed token), files to object storage, data to the database.

![A horizontally scaled service: identical, stateless copies behind a load balancer, with state in shared stores.](images/figure-1.svg)

*Figure 1. A horizontally scaled service: identical, stateless copies behind a load balancer, with state in shared stores.*

### A real example: autoscaling on Kubernetes

> [!example] **Elastic FastAPI service.** Twenty FastAPI pods run behind a Kubernetes Service. A Horizontal Pod Autoscaler (HPA) watches average CPU, targeting, say, 60%. When traffic spikes and CPU rises, it adds pods; when traffic falls, it removes them (with a cooldown so it doesn't flap). This ability to grow and shrink with demand is **elasticity**.

### What changes when you scale out

|  | Effect |
|---|---|
| **Availability** ↑ | One copy dies, the others keep serving (if health checks remove it quickly) |
| **Cost** flexible | Pay for what you run; scale down at night |
| **Complexity** ↑ | Load balancing, health checks, service discovery, config and deploys across many machines |
| **Debugging** harder | A request may touch any copy; you need central logs and tracing |

### Why databases are harder to scale out

![Stateless web servers share nothing. Databases share everything.](images/figure-2.svg)

*Figure 2. Stateless web servers share nothing. Databases share everything.*

Read load can scale with **read replicas** (copies that follow the primary). Write load needs **sharding**: splitting data across machines by a key. Then queries that join across shards, and transactions that touch several shards, become slow or complicated. That's why teams scale the database up first, and shard only when they must.

## Key terms

| Term | Meaning |
|---|---|
| **Horizontal scaling** | more machines (scale out) |
| **Stateless** | no user state kept between requests |
| **Elasticity** | grow and shrink with demand |
| **HPA** | Kubernetes autoscaler for pods |
| **Read replica** | a copy for reads |
| **Sharding** | splitting data across machines by a key |

## Interview questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system) and **Tricky** (the follow-ups interviewers use to go deeper). Answer out loud before you open the answer.

> [!interview] What must be true before a service can scale horizontally? (Basic)

<details><summary>What a strong answer covers</summary>

It must be stateless: sessions, files and data live in shared stores, so any instance can serve any request and instances can be added or removed freely.

</details>

> [!interview] Why is scaling a database horizontally harder? (Basic)

<details><summary>What a strong answer covers</summary>

State must be replicated (kept in sync) or partitioned (sharded) while staying consistent; cross-shard joins and transactions become hard. Web servers share nothing.

</details>

> [!interview] What is elasticity? (Basic)

<details><summary>What a strong answer covers</summary>

Adding capacity when load rises and removing it when load falls, automatically, so you pay for what you use.

</details>

> [!interview] Users get logged out randomly after you add servers. Why, and how do you fix it? (Scenario)

<details><summary>What a strong answer covers</summary>

Sessions are stored in each server's memory, so a request on another server finds none. Move sessions to Redis or use signed tokens; sticky sessions only hide the problem.

</details>

> [!interview] You scale the API from 10 to 50 pods and the database falls over. What happened? (Scenario)

<details><summary>What a strong answer covers</summary>

Each pod opens its own connection pool, so connections jumped 5× past the database's limit. Use a connection pooler (e.g. PgBouncer), smaller per-pod pools, and cache reads.

</details>

> [!interview] Which metric would you autoscale a queue worker on? (Scenario)

<details><summary>What a strong answer covers</summary>

Queue depth or message age, not CPU: they measure the backlog directly. Workers waiting on I/O can have low CPU while the queue grows.

</details>

> [!interview] Are sticky sessions a good way to scale a stateful app? (Tricky)

<details><summary>What a strong answer covers</summary>

Only as a short-term patch: load becomes uneven, sessions are lost when a server dies, and deploys get harder. Externalise the state instead.

</details>

> [!interview] Can you scale writes with read replicas? (Tricky)

<details><summary>What a strong answer covers</summary>

No. Replicas copy the primary's writes, so every write still goes through the primary. Write scaling needs sharding or a database built to partition writes.

</details>

## Common mistakes & troubleshooting

- Scaling out a service that keeps sessions in memory.
- Relying on sticky sessions as the fix (uneven load, lost sessions on failure).
- Autoscaling on CPU when the real bottleneck is the database.
- Forgetting the database connection limit when adding 50 app copies.

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-A-007.pdf](https://backendroadmap.com/notes/system-design/SD-A-007.pdf). All Phase 1 notes in one file: [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf).

## Next

Continue with [Lesson 08: Latency](../08-latency/README.md).
