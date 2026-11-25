# Are You Ready for System Design Interviews? Final Checklist

> **Prerequisites:** [Previous lesson: Weak-Area Review Loop: Find and Fix Your System Design Gaps](../12-weak-area-review-loop/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates a week or two before an interview loop, who want an honest self-check and a last-week plan.

> [!NOTE]
> **In one line:** You are ready when you can **run the framework in 45 minutes, defend your choices, and recover from a stumble**, not when you have memorised the most solutions.

> [!TIP]
> **The Golden Rule:** Readiness is about reliable process under pressure. If you can do three timed mocks in a row with no row below a 3 on the rubric, you are ready.

---

## 1. The readiness checklist

Tick each honestly. Anything unticked is your plan for the week.

**Process**
- [ ] I can run the 9-step framework in 45 minutes without notes.
- [ ] I ask clarifying questions and state assumptions before drawing.
- [ ] I produce a capacity estimate and use it later in the design.
- [ ] I finish with a trade-off summary inside the time.

**Knowledge**
- [ ] I can recite the key latency, size and availability numbers.
- [ ] I can choose and defend a database for an access pattern.
- [ ] I can explain caching, queues, idempotency, outbox and sagas.
- [ ] I can design for failure: timeouts, retries, breakers, DR.
- [ ] I can sketch a RAG system with permissions and evaluation.

**Depth**
- [ ] I can go three levels down on at least ten components.
- [ ] I have a trade-off library of at least fifteen entries with switch conditions.
- [ ] I have completed at least five of the full designs in [Track 22](../../22-interview-design-problems/README.md) from a blank page.

**Communication**
- [ ] I have completed at least three timed mocks (one with another person).
- [ ] I have six behavioural stories with numbers.
- [ ] I recover calmly when I am stuck or wrong.

---

## 2. The last-week plan

| Day | Focus |
| :--- | :--- |
| 7 and 6 days before | Two timed full mocks; log weaknesses |
| 5 days | Fix the top weakness with a study block and a retest |
| 4 days | Peer mock, new prompt, rubric feedback |
| 3 days | Revision sheets: numbers, databases, consistency, reliability |
| 2 days | One light mock and behavioural stories out loud |
| 1 day before | Rest. Re-read your trade-off library and the framework steps only |
| Interview day | Eat, arrive early, bring a pen and paper, keep water nearby |

---

## 3. During the interview

- **Slow down at the start.** Two minutes of clarification saves ten minutes of rework.
- **Think aloud.** The interviewer can only credit reasoning they hear.
- **Write the numbers** on the board; they anchor later choices.
- **Check in** after the high-level design: 'Does this match what you expected? Where would you like me to go deeper?'
- **If you are stuck**, say what you are stuck on, offer two options and choose one with a reason.
- **If you made an error**, name it, fix it and move on; recovery shows seniority.
- **Leave time** for failures, security and a summary.

---

## 4. After the interview

Write down the prompt, what you drew, and where you hesitated within an hour while it is fresh. Whatever the outcome, that note feeds your next preparation and counts as a practice session. Rejections in design rounds often come from process gaps (no clarification, no trade-offs, poor time use), not lack of knowledge, so look for those first.

---

## Scoring your readiness

Give each area a score from 1 to 4 and let the script report whether you meet the ready bar and what to fix first.

```python
scores = {"Process": 4, "Estimation": 3, "Databases": 3, "Consistency": 3,
          "Reliability": 2, "GenAI": 3, "Depth": 3, "Communication": 4}
BAR = 3
below = {k: v for k, v in scores.items() if v < BAR}
print("average:", round(sum(scores.values()) / len(scores), 2))
print("ready" if not below else f"fix first: {below}")
```

Output (produced by running this exact code):

```text
average: 3.12
fix first: {'Reliability': 2}
```

The average is high, but Reliability sits below the bar of 3, so the final week should include a revision block on failures before you call yourself ready.

---

## Common Mistakes

- Cramming new topics in the last 48 hours.
- Memorising designs instead of the process.
- Skipping rest the night before.
- Waiting to feel 100% ready.
- Skipping a post-interview write-up.

---

## Practice Questions

<details>
<summary><strong>Q1: How do I know I am ready?</strong></summary>

Three timed mocks in a row with no rubric row below 3, a trade-off library you can recite, and calm recovery when stuck.

</details>

<details>
<summary><strong>Q2: What should I do the night before?</strong></summary>

Light review of the framework and trade-off library, then rest. New material at that point mostly adds anxiety.

</details>

<details>
<summary><strong>Q3: What if I blank in the interview?</strong></summary>

Return to the framework: restate the problem, ask a clarifying question, and write the numbers; the process restarts your thinking.

</details>

<details>
<summary><strong>Q4: Do I need to know every system?</strong></summary>

No. The same components appear in different combinations; knowing the framework and fundamentals covers unfamiliar prompts.

</details>

<details>
<summary><strong>Q5: What if I do not get the offer?</strong></summary>

Write down where you hesitated, find the process gap, fix it with the weak-area loop, and try again; most strong engineers are rejected somewhere along the way.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Ready bar | Three timed mocks, no rubric row below 3 |
| Checklist | Process, knowledge, depth, communication |
| Last week | Mocks, fix top gap, revision sheets, rest the day before |
| During | Clarify, think aloud, write numbers, check in, recover calmly |
| After | Write up within an hour and feed the loop |

---

## Further Reading

- [System Design Interview Framework](../../21-interview-framework/01-system-design-interview-framework/README.md) in this course.
- [Weak-Area Review Loop](../12-weak-area-review-loop/README.md) in this track.

---

## Next

You have reached the end of the course. Go back to the [course index](../../README.md), pick your weakest track, and book your next mock interview.
