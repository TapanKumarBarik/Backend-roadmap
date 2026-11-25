# Behavioral Architecture Stories: STAR Answers for Design Decisions

> **Prerequisites:** [Previous lesson: GenAI System Design Mock Interview: What Interviewers Look For](../10-genai-system-design-mock-interview/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates preparing the behavioural half of senior loops, where design decisions are discussed as stories.

> [!NOTE]
> **In one line:** A good architecture story answers **what was decided, why, what it cost, and what you learned**, in about two minutes, with numbers.

> [!TIP]
> **The Golden Rule:** Be specific about **your** decision and your reasoning. 'We' hides your contribution; vague outcomes hide your impact.

---

## 1. The STAR-D structure

Use STAR and add a D for the decision's trade-off:

| Part | Content | Time |
| :--- | :--- | :--- |
| **S**ituation | System, scale, constraint, why it mattered | 20 s |
| **T**ask | Your responsibility and the goal | 10 s |
| **A**ction | What you did and the options you considered | 60 s |
| **R**esult | Measured outcome with a number | 20 s |
| **D**ecision reflection | What you traded off, and what you would do differently | 20 s |

Prepare each story with the metric (latency down 40%, cost down 30%, incidents down to one per quarter) and one candid lesson.

---

## 2. Stories to prepare (six is enough)

1. **A scaling decision**: how you identified a bottleneck and chose between options.
2. **A reliability failure you owned**: an incident, how you handled it, what you changed.
3. **A disagreement about design**: how you argued with data, and how it ended.
4. **A migration or rewrite**: risk management, incremental rollout, rollback plan.
5. **A trade-off you got wrong**: a decision that did not work and what you learned. Candour is valued.
6. **Influence without authority**: persuading another team or a leader to adopt a design.

---

## 3. A worked example

*Prompt: tell me about a time you improved the performance of a system.*

**Situation.** Our order search page had p95 latency of 3.2 seconds with 40,000 searches per hour, and conversion was dropping.
**Task.** I owned the search service and was asked to bring p95 under 800 ms in a quarter without a rewrite.
**Action.** I profiled and found 70% of time in a join across three tables on every request. I compared three options: add an index, denormalise into a search index, or cache. Caching helped only repeated queries, indexing helped but not enough, so I proposed a search index fed by a change stream, rolled out behind a flag to 5% of traffic, then 100%.
**Result.** p95 fell from 3.2 s to 420 ms and database load fell by about 35%.
**Decision.** I accepted a few seconds of staleness and the cost of operating a new cluster. If I did it again I would add the consistency checks earlier, because we found two drift bugs in the first week.

---

## 4. Common pitfalls

- Describing the team's work instead of **your** actions and decisions.
- No numbers, or numbers that do not match the story.
- Hiding the trade-off, so the story sounds like luck or an obvious choice.
- Only success stories; seniors are expected to have learned from mistakes.
- Blaming others. Describe disagreements by what each side valued.
- Running over three minutes. Practise to a timer, and keep a shorter and a longer version.

---

## A story checklist

Treat each story as a record with required fields, and let a short script show which ones are missing.

```python
REQUIRED = ["situation", "task", "action", "result_metric", "tradeoff", "lesson"]

stories = {
    "search latency": {"situation": "p95 3.2s", "task": "get under 800ms", "action": "search index via change stream",
                       "result_metric": "420 ms p95", "tradeoff": "staleness", "lesson": "consistency checks earlier"},
    "payments outage": {"situation": "duplicate charges", "task": "stop and fix", "action": "idempotency keys",
                        "result_metric": "", "tradeoff": "", "lesson": "test retries"},
}

for name, story in stories.items():
    missing = [f for f in REQUIRED if not story.get(f)]
    print(f"{name}: {'ready' if not missing else 'missing ' + ', '.join(missing)}")
```

Output (produced by running this exact code):

```text
search latency: ready
payments outage: missing result_metric, tradeoff
```

The first story is complete and the second needs a measured result and an explicit trade-off before it is interview-ready.

---

## Common Mistakes

- Saying 'we' for everything.
- No metric.
- Telling a story with no decision or alternative.
- Skipping failures.
- Not rehearsing aloud to a timer.

---

## Practice Questions

<details>
<summary><strong>Q1: How long should a story be?</strong></summary>

About two minutes, with a longer version of three or four minutes ready if the interviewer digs in.

</details>

<details>
<summary><strong>Q2: How many stories do I need?</strong></summary>

Six well-prepared ones, each usable for several prompts by changing the emphasis.

</details>

<details>
<summary><strong>Q3: What if I have no big numbers?</strong></summary>

Use relative or small numbers honestly (hours saved per week, incidents per quarter, review time) and explain how you measured them.

</details>

<details>
<summary><strong>Q4: Is it fine to tell a failure story?</strong></summary>

Yes, it is expected at senior levels; focus on what you learned and changed afterwards.

</details>

<details>
<summary><strong>Q5: How do I show seniority?</strong></summary>

Show the decision among options, the trade-off, the risk management, and how you brought others along.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Structure | Situation, Task, Action, Result, Decision reflection |
| Prepare | Scaling, reliability failure, disagreement, migration, a wrong trade-off, influence |
| Include | Your actions, a metric, a trade-off, a lesson |
| Time | About two minutes, with a longer version ready |
| Avoid | We-only language, no numbers, no failures |

---

## Further Reading

- Will Larson, *Staff Engineer: Leadership beyond the management track*.
- Tanya Reilly, *The Staff Engineer's Path*.

---

## Next

Continue with [Weak-Area Review Loop: Find and Fix Your System Design Gaps](../12-weak-area-review-loop/README.md).
