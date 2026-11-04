# Lesson 11: Reliability, Availability and Durability

## Roadmap

You are in **System Design Interview Prep**, Track 01, **Core Fundamentals**: lesson 11 of 19 (up is not the same as right). It builds on [Lesson 10: Availability](../10-availability/README.md). Next comes [Lesson 12: Scalability](../12-scalability/README.md).

These are the written notes for the lesson's video. Prefer paper? The same notes are a free, printable PDF: [download SD-A-011.pdf](https://backendroadmap.com/notes/system-design/SD-A-011.pdf).

## Concept

> [!key] Availability is being up, reliability is being correct over time, and durability is never losing acknowledged data; a system can be fully up and still wrong.

## Explanation

### Three different questions

![A reliable system must also be available, but an available system is not automatically reliable.](images/figure-1.svg)

*Figure 1. A reliable system must also be available, but an available system is not automatically reliable.*

### Up, but unreliable

Your banking app opens instantly and every request returns 200 OK, but the balance is wrong. The system is *available*, not *reliable*. Common ways this happens:

- Serving stale data from a broken or never-invalidated cache.
- Wrong prices after a bad deploy or config change.
- Silently dropping writes (a full queue, an ignored error).
- Returning 200 OK with an error message inside the body.

![Uptime monitoring can be all green while users get wrong answers.](images/figure-2.svg)

*Figure 2. Uptime monitoring can be all green while users get wrong answers.*

### Measuring reliability

Not just “is it up?” but “is it right?”:

- **Error rates** and failed requests, including errors hidden in 200 responses.
- **Time between failures** (MTBF) for correctness incidents, not only outages.
- **Correctness checks**: reconcile totals (orders vs payments), validate responses end to end, run synthetic transactions.

### Durability: does the data survive?

Durability belongs to storage: once a write is acknowledged, it must never be lost. It's not about reaching the data right now; it's about the data still existing. You get it with replication across disks and zones, checksums to detect corruption, and backups you actually restore from in tests.

> [!example] **Amazon S3: different targets for different properties.** S3 Standard is designed for **99.999999999% durability** (eleven nines): store 10 million objects and you might lose one about once every 10,000 years. But it's designed for **99.99% availability**: occasionally you can't reach a file, yet it's almost certainly still there.

### Tools for each property

| Property | Main tools |
|---|---|
| **Availability** | Redundancy, health checks, fast failover, removing single points of failure |
| **Reliability** | Testing, input validation, idempotent operations, safe deploys (canaries), monitoring correctness, not just uptime |
| **Durability** | Replication across zones, write-ahead logs, checksums, backups, tested restores |

## Key terms

| Term | Meaning |
|---|---|
| **Availability** | the system answers |
| **Reliability** | the answers are correct, over time |
| **Durability** | acknowledged data survives |
| **Idempotent** | safe to retry |
| **Checksum** | detects corrupted data |
| **Restore test** | proving backups actually work |

## Interview questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system) and **Tricky** (the follow-ups interviewers use to go deeper). Answer out loud before you open the answer.

> [!interview] Can a system be highly available but unreliable? (Basic)

<details><summary>What a strong answer covers</summary>

Yes. It can be up and fast while returning wrong or stale data, dropping writes or hiding errors inside 200 responses.

</details>

> [!interview] What is durability? (Basic)

<details><summary>What a strong answer covers</summary>

The guarantee that acknowledged data is never lost, achieved with replication, checksums and tested backups.

</details>

> [!interview] How is durability different from availability? (Basic)

<details><summary>What a strong answer covers</summary>

Availability: can I reach the data now? Durability: does the data still exist? S3 has 11 nines of durability but 4 nines of availability.

</details>

> [!interview] How would you detect that an e-commerce site is up but wrong? (Scenario)

<details><summary>What a strong answer covers</summary>

Reconcile orders against payments and inventory, run synthetic purchases end to end, alert on business metrics (e.g. orders per minute dropping), and track errors inside responses.

</details>

> [!interview] Design storage so an acknowledged order is never lost. (Scenario)

<details><summary>What a strong answer covers</summary>

Write to a database that replicates synchronously to another zone (or a quorum) before acknowledging, keep a write-ahead log, take regular backups and restore-test them.

</details>

> [!interview] A retry charged a customer twice. Which property failed, and how do you fix it? (Scenario)

<details><summary>What a strong answer covers</summary>

Reliability (correctness). Make the payment API idempotent with an idempotency key, so a retried request returns the first result instead of charging again.

</details>

> [!interview] Do backups give durability? (Tricky)

<details><summary>What a strong answer covers</summary>

Only if they're recent, stored elsewhere, uncorrupted and restorable. Untested backups often fail when needed; replication alone doesn't protect against accidental deletes or bad writes.

</details>

> [!interview] Is replication enough for durability? (Tricky)

<details><summary>What a strong answer covers</summary>

It protects against losing a disk or a zone, but it also copies mistakes instantly: a bad delete or corruption replicates too. You still need point-in-time backups.

</details>

## Common mistakes & troubleshooting

- Treating 99.99% uptime as “reliable”.
- Backups that were never restored in a test.
- Acknowledging a write before it's safely stored.
- Monitoring only process health, not response correctness.

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-A-011.pdf](https://backendroadmap.com/notes/system-design/SD-A-011.pdf). All Phase 1 notes in one file: [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf).

## Next

Continue with [Lesson 12: Scalability](../12-scalability/README.md).
