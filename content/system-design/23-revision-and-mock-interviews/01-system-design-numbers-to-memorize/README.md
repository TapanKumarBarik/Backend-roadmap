# System Design Numbers to Memorize: Latency, Nines and Powers of Two

> **Prerequisites:** [Lesson 37: Design a Multi-Tenant SaaS Platform](../../22-interview-design-problems/37-design-a-multi-tenant-saas-platform/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Anyone who freezes when asked to estimate, and wants a small set of numbers to carry into every interview.

> [!NOTE]
> **In one line:** You do not need exact figures, only **orders of magnitude** you can trust: how long things take, how big powers of two are, and what each extra "nine" of availability costs.

> [!TIP]
> **The Golden Rule:** Memorise ratios, not decimals. Knowing that memory is about 1,000 times faster than SSD and SSD about 100 times faster than a cross-region call is worth more than any single exact number.

---

## 1. Latency numbers (orders of magnitude)

These are rounded figures popularised by Jeff Dean and updated by many engineers since. Hardware changes, so quote them as approximations and say so.

| Operation | Approximate time | Useful comparison |
| :--- | :--- | :--- |
| CPU cache reference (L1) | ~1 ns | Everything in a register or cache |
| Main memory reference | ~100 ns | 100x slower than L1 |
| Compress 1 KB | ~2 microseconds | Cheap |
| Read 1 MB sequentially from memory | ~10 to 50 microseconds | Memory is fast for streams |
| SSD random read | ~100 microseconds | ~1,000x slower than memory |
| Round trip inside one data centre | ~0.5 ms | A network hop costs about 5,000 memory reads |
| Read 1 MB sequentially from SSD | ~0.5 to 1 ms | |
| Spinning disk seek | ~10 ms | Why databases avoid random disk I/O |
| Round trip across a continent | ~50 to 100 ms | Physics: light in fibre |
| Round trip across oceans | ~150 ms | Cannot be improved by code |

**What to take from it:** memory beats SSD beats network beats disk seek beats the speed of light. A design that does a network call per item in a loop of 1,000 items costs about half a second even inside one data centre.

---

## 2. Powers of two and data sizes

| Power | Value | Name | Handy fact |
| :--- | :--- | :--- | :--- |
| 2^10 | 1,024 | 1 KB | About a thousand |
| 2^20 | ~1 million | 1 MB | A short photo thumbnail |
| 2^30 | ~1 billion | 1 GB | A movie at low quality |
| 2^40 | ~1 trillion | 1 TB | A big database shard |
| 2^50 | ~1 quadrillion | 1 PB | A large company's logs for a week |

Useful sizes: a character is 1 byte (ASCII) to 4 bytes (UTF-8 worst case); a UUID is 16 bytes (36 as text); a timestamp is 8 bytes; a tweet-sized post is about 300 bytes with metadata; a 1080p photo is 2 to 5 MB; a minute of 1080p video is about 50 to 100 MB; one 64-bit id is 8 bytes. A base62 code of 7 characters gives 62^7, about 3.5 trillion values.

---

## 3. Time and traffic shortcuts

- A day has **86,400 seconds**, which you can round to **100,000** to divide quickly.
- **1 million requests per day is about 12 per second.** 100 million per day is about 1,200 per second.
- Peak traffic is usually **2 to 10 times** the average; state your assumption.
- A single modern server handles roughly **1,000 to 10,000 simple requests per second**, a Redis node about **100,000 operations per second**, and a well-tuned relational database a few **thousand to tens of thousands of simple queries per second**.
- 1 Gbps moves about **125 MB per second**. 10 Gbps moves about 1.25 GB per second.
- A month is about **2.6 million seconds** and a year about **31.5 million seconds**.

---

## 4. Availability and the nines

Each extra nine cuts the allowed downtime by 10 times, and costs far more than 10 times as much to achieve. Allowed downtime per year at each level:

| Availability | Common name | Downtime per year | Downtime per month |
| :--- | :--- | :--- | :--- |
| 99% | Two nines | 3.65 days | 7.2 hours |
| 99.9% | Three nines | 8.76 hours | 43.8 minutes |
| 99.99% | Four nines | 52.6 minutes | 4.4 minutes |
| 99.999% | Five nines | 5.3 minutes | 26 seconds |

Components in series multiply: two 99.9% services in a chain give about 99.8%. Components in parallel (redundant) improve it: two independent 99% replicas give 99.99%, if failures really are independent. The common failure of the second case is shared fate (same zone, same deploy, same config).

---

## Compute downtime for any availability

This turns an availability target into minutes of allowed downtime, and shows how chaining and redundancy change it.

```python
MIN_YEAR = 365 * 24 * 60

for a in (0.99, 0.999, 0.9999, 0.99999):
    print(f"{a:.3%} -> {MIN_YEAR * (1 - a):8.1f} min/year")

series = 0.999 * 0.999
parallel = 1 - (1 - 0.99) ** 2
print("two 99.9% in series:", f"{series:.4%}")
print("two 99% in parallel:", f"{parallel:.4%}")
print("1M requests/day =", round(1e6 / 86400, 1), "per second")
```

Output (produced by running this exact code):

```text
99.000% ->   5256.0 min/year
99.900% ->    525.6 min/year
99.990% ->     52.6 min/year
99.999% ->      5.3 min/year
two 99.9% in series: 99.8001%
two 99% in parallel: 99.9900%
1M requests/day = 11.6 per second
```

Five nines leave only about five minutes a year, a chain of two three-nine services drops to roughly 99.8%, and redundancy turns two 99% parts into 99.99%.

---

## Common Mistakes

- Quoting a latency number as exact instead of an order of magnitude.
- Forgetting that a network call inside a loop multiplies.
- Treating redundant components as independent when they share a zone or a deploy.
- Mixing bits and bytes (Gbps versus MB/s).
- Doing long multiplications aloud instead of rounding to powers of ten.

---

## Practice Questions

<details>
<summary><strong>Q1: Memory, SSD and a cross-region call: roughly how do they compare?</strong></summary>

About 100 nanoseconds, 100 microseconds and 100 milliseconds: each step is about 1,000 times slower.

</details>

<details>
<summary><strong>Q2: How many requests per second is 100 million per day?</strong></summary>

About 1,200 (100 million divided by roughly 86,400), and peak could be several times that.

</details>

<details>
<summary><strong>Q3: What does 99.99% availability allow per year?</strong></summary>

About 52 minutes of downtime.

</details>

<details>
<summary><strong>Q4: Two services at 99.9% are called in sequence. What is the combined availability?</strong></summary>

About 99.8%, because availabilities multiply (0.999 x 0.999).

</details>

<details>
<summary><strong>Q5: How big is 62^7?</strong></summary>

About 3.5 trillion, which is why 7 base62 characters suffice for a URL shortener.

</details>

<details>
<summary><strong>Q6: Why does round-trip time across regions matter in design?</strong></summary>

It is bounded by the speed of light in fibre, so a 100 ms trip cannot be tuned away; you reduce the number of round trips or move data closer.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Latency | Memory 100 ns, SSD 100 us, DC hop 0.5 ms, disk seek 10 ms, cross-continent 100 ms |
| Sizes | KB 10^3, MB 10^6, GB 10^9, TB 10^12, PB 10^15 |
| Traffic | 1M per day = 12 per second; day = 10^5 seconds |
| Throughput | Server 1-10K rps, Redis 100K ops/s, 1 Gbps = 125 MB/s |
| Nines | 99.9% = 8.8 h/yr, 99.99% = 53 min/yr, 99.999% = 5 min/yr |
| Combine | Series multiplies, parallel improves if independent |

---

## Further Reading

- Jeff Dean, *Software Engineering Advice from Building Large-Scale Distributed Systems* (the original latency table).
- Colin Scott, *Latency Numbers Every Programmer Should Know* (interactive, year by year).

---

## Next

Continue with [Revise Database Choices: SQL vs NoSQL, Indexes, Isolation, Sharding](../02-revise-database-choices/README.md).
