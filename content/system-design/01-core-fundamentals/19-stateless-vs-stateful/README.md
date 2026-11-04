# Lesson 19: Stateless vs Stateful

## Roadmap

You are in **System Design Interview Prep**, Track 01, **Core Fundamentals**: lesson 19 of 19 (sessions, sticky sessions and scaling WebSockets). It builds on [Lesson 18: Simple Beats Clever](../18-simple-beats-clever/README.md). Next comes [Phase 2: The OSI Model](../../README.md).

These are the written notes for the lesson's video. Prefer paper? The same notes are a free, printable PDF: [download SD-A-019.pdf](https://backendroadmap.com/notes/system-design/SD-A-019.pdf).

## Concept

> [!key] Stateless services keep nothing between requests, so any instance can serve anyone and they scale freely; push state into a few purpose-built stateful systems that replicate and rebalance.

## Explanation

### Two kinds of components

![Stateless components are interchangeable; stateful ones hold data or connections that live on a specific node.](images/figure-1.svg)

*Figure 1. Stateless components are interchangeable; stateful ones hold data or connections that live on a specific node.*

Stateless services scale easily: add instances, remove instances, lose one in a crash, and nothing is lost. The load balancer can send any request anywhere, and autoscaling just works.

### Making a service stateless

> [!example] **FastAPI sessions.** The app keeps sessions in an in-memory dictionary. With two pods, half the requests land on the pod that doesn't know the user. Move sessions to Redis (or use signed tokens like JWTs), and every pod becomes interchangeable.

| Option | How | Trade-off |
|---|---|---|
| **Shared session store** | Sessions in Redis, keyed by a cookie | One more system to run (make it redundant) |
| **Signed tokens** | State inside a signed JWT cookie | No store, but hard to revoke; keep tokens small |
| **Sticky sessions** | Load balancer pins a user to one server | Quick fix; uneven load, sessions lost when that server dies |

### What stateful systems need

- **Placement:** which node owns which data or which user (e.g. consistent hashing).
- **Replication:** copies, so a node can die safely.
- **Rebalancing:** moving data or connections when nodes join or leave.

### Scaling a chat app's WebSockets

![Alice and Bob are connected to different servers. A registry finds Bob's server; pub/sub carries the message there.](images/figure-2.svg)

*Figure 2. Alice and Bob are connected to different servers. A registry finds Bob's server; pub/sub carries the message there.*

1. Each user holds a long-lived WebSocket to one server; the server records *user → server* in a registry with a TTL heartbeat.
2. When Alice sends a message, Server 1 looks up Bob and publishes to Server 2's channel (or a per-user/per-room channel).
3. Server 2 pushes it down Bob's socket. Messages are also saved to the database, so a client that reconnects can fetch what it missed.
4. If a server dies, its clients reconnect (with backoff and jitter) to another server, which updates the registry.

> [!model] **The rule of thumb.** Keep compute stateless, and push state into a few systems built to replicate and rebalance: databases, caches, message brokers. Scale the easy parts freely and the hard parts carefully.

## Key terms

| Term | Meaning |
|---|---|
| **Stateless** | nothing kept between requests |
| **Stateful** | data or connections live on a node |
| **Sticky session** | LB pins a user to one server |
| **JWT** | a signed token that carries state |
| **Pub/sub** | publish once, subscribers receive |
| **Rebalancing** | moving data when nodes change |

## Interview questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system) and **Tricky** (the follow-ups interviewers use to go deeper). Answer out loud before you open the answer.

> [!interview] Why are stateless services easier to scale? (Basic)

<details><summary>What a strong answer covers</summary>

Any instance can serve any request, so you can add, remove or lose instances freely and the load balancer can route anywhere.

</details>

> [!interview] How would you scale a stateful WebSocket server? (Basic)

<details><summary>What a strong answer covers</summary>

Add servers behind a load balancer, track which user is on which server, route messages between servers with pub/sub, and let clients reconnect on failure.

</details>

> [!interview] What do stateful systems need that stateless ones don't? (Basic)

<details><summary>What a strong answer covers</summary>

Placement (who owns what), replication (survive node loss) and rebalancing (move data when nodes change).

</details>

> [!interview] After adding a second server, some chat messages never arrive. Why? (Scenario)

<details><summary>What a strong answer covers</summary>

The sender's server only knows its own sockets; the recipient is on another server. Add a user→server registry and pub/sub between servers.

</details>

> [!interview] Sessions in Redis or JWTs? (Scenario)

<details><summary>What a strong answer covers</summary>

Redis: easy revocation and small cookies, but a dependency to keep redundant. JWTs: no store, but revocation is hard and tokens grow. Many systems use short-lived JWTs plus a refresh token in a store.

</details>

> [!interview] A WebSocket server with 100K connections crashes. What happens next? (Scenario)

<details><summary>What a strong answer covers</summary>

Its clients reconnect to other servers; use exponential backoff with jitter to avoid a stampede, update the registry, and fetch missed messages from the database.

</details>

> [!interview] When are sticky sessions acceptable? (Tricky)

<details><summary>What a strong answer covers</summary>

As an optimisation (better cache locality) when losing the session is harmless, or briefly during a migration; not as the only place state lives.

</details>

> [!interview] Is a cache stateful? (Tricky)

<details><summary>What a strong answer covers</summary>

Yes, it holds data, but it's usually treated as disposable: losing it should only cost performance (cache misses), never correctness. Plan for cold-start load on the database.

</details>

## Common mistakes & troubleshooting

- In-memory sessions on horizontally scaled servers.
- Sticky sessions as the long-term answer.
- Broadcasting every chat message to every server.
- Reconnect storms: all clients reconnecting at once with no jitter.

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-A-019.pdf](https://backendroadmap.com/notes/system-design/SD-A-019.pdf). All Phase 1 notes in one file: [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf).

## Next

That completes Core Fundamentals. Continue with [Phase 2: The OSI Model](../../README.md).
