# Build a Trade-off Library for System Design Interviews

> **Prerequisites:** [Previous lesson: Revise GenAI System Design: RAG, Evaluation, Guardrails and Cost](../05-revise-genai-system-design/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates who can name options but struggle to defend a choice under questioning.

> [!NOTE]
> **In one line:** A trade-off library is **a personal list of decisions written as: what you gain, what you pay, and when you pick each side**.

> [!TIP]
> **The Golden Rule:** Never say 'X is better'. Say 'X is better **when** this condition holds, and it costs this'. The condition is the answer.

---

## 1. The sentence template

Use one fixed shape so it comes out fluently under pressure:

> **"I would choose [A] over [B] because [requirement]. It costs [downside], which I accept because [reason]. If [condition changes], I would switch to [B]."**

Example: *"I would choose a cache-aside Redis layer over write-through because reads are 100 times writes and a few seconds of staleness is acceptable. It costs possible stale reads and stampedes on expiry, which I handle with TTL jitter. If we needed read-after-write on every update, I would invalidate on write or move to write-through."*

---

## 2. A starter library (copy and extend)

| Decision | Pick A when | Pick B when | Cost of A |
| :--- | :--- | :--- | :--- |
| SQL vs NoSQL | Transactions, joins, flexible queries | Scale and simple key access | Harder horizontal scaling |
| Cache-aside vs write-through | Read-heavy, staleness tolerable | Reads must be fresh | Stale reads, stampedes |
| Push vs pull fan-out (feed) | Normal accounts, fast reads | Celebrity accounts | Write amplification |
| Sync call vs async queue | Caller needs the answer now | Work can finish later, spikes likely | Coupling and latency |
| Strong vs eventual consistency | Money, inventory, identity | Counts, feeds, search | Latency and availability |
| Monolith vs microservices | Small team, early product | Many teams, independent scaling | Hard to scale teams and parts |
| Orchestration vs choreography | Complex, auditable flows | Simple event reactions | A central coordinator |
| Polling vs push (WebSocket/SSE) | Infrequent updates | Live updates | Wasted requests, latency |
| Fixed vs content-defined chunking | Simple, uniform data | Edits shift data | Poor reuse after insertions |
| Replicate vs partition | Read scaling and availability | Write and storage scaling | Replication lag; or cross-shard cost |
| Build vs buy | Core differentiator | Commodity capability | Maintenance burden |
| Batch vs stream | Latency of hours is fine | Seconds matter | Freshness |

---

## 3. How to extend the library

1. After every practice problem, write the **two or three decisions that mattered most** in the template.
2. For each, write the *switch condition*: the change in requirements that would flip the choice. Interviewers love a follow-up that changes one requirement.
3. Keep a **cost column**: if you cannot name a cost of your choice, you have not understood it.
4. Group entries by theme (data, communication, consistency, reliability, cost) so you can recall by category.
5. Review the list before each mock, and delete entries you can recite without looking.

---

## 4. Using it in the interview

- Raise a trade-off **before** being asked: it shows senior thinking (see [Evaluating Trade-offs Aloud](../../21-interview-framework/11-evaluating-trade-offs-aloud-in-system-design-interviews/README.md)).
- When the interviewer pushes back, do not defend by repetition. Say which requirement they changed, and what you would switch to.
- Finish a design with a **top three trade-offs** summary, which doubles as a recap.

---

## A library as data you can drill

Keeping the library as structured data lets you quiz yourself; this picks the side that fits a stated condition.

```python
library = {
    "cache write policy": {
        "reads dominate, staleness tolerable": "cache-aside",
        "reads must see fresh data": "write-through",
    },
    "fan-out": {
        "typical accounts": "push",
        "millions of followers": "pull",
    },
}

def recommend(decision, condition):
    return library[decision].get(condition, "ask for the requirement first")

print(recommend("cache write policy", "reads must see fresh data"))
print(recommend("fan-out", "millions of followers"))
print(recommend("fan-out", "unknown"))
```

Output (produced by running this exact code):

```text
write-through
pull
ask for the requirement first
```

The condition decides the answer, which is the habit to build: you ask for the requirement before naming a side.

---

## Common Mistakes

- Saying one option is simply better.
- Naming a benefit without the cost.
- Defending a choice by repetition when a requirement changed.
- Keeping the library in your head only.
- Listing options but never giving the switch condition.

---

## Practice Questions

<details>
<summary><strong>Q1: How do you answer 'why not the other option?'</strong></summary>

Name the requirement that favours your choice, state the cost you accept, and say what would make you switch.

</details>

<details>
<summary><strong>Q2: What if the interviewer changes a requirement?</strong></summary>

Treat it as the planned follow-up: say which decision it flips and re-derive the choice.

</details>

<details>
<summary><strong>Q3: How many trade-offs should a design mention?</strong></summary>

The three that matter most, stated clearly, rather than a long list.

</details>

<details>
<summary><strong>Q4: How do you build the library fast?</strong></summary>

After each practice problem, add the two or three key decisions in the fixed template with their switch conditions.

</details>

<details>
<summary><strong>Q5: Give a trade-off for async processing.</strong></summary>

Async queues absorb spikes and decouple services but add latency and complexity (idempotency, retries); choose sync only when the caller needs the result immediately.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Template | Choose A over B because X; costs Y; accept because Z; switch if W |
| Always state | Gain, cost and switch condition |
| Build | Two to three entries after every practice problem |
| Use | Raise it first; recap the top three at the end |
| Avoid | 'Better' without a condition |

---

## Further Reading

- Martin Kleppmann, *Designing Data-Intensive Applications*, which is organised around trade-offs.
- Neal Ford and Mark Richards, *Fundamentals of Software Architecture*, on trade-off analysis.

---

## Next

Continue with [Timed Solo Practice: Run a 45-Minute System Design Mock Alone](../07-timed-solo-practice/README.md).
