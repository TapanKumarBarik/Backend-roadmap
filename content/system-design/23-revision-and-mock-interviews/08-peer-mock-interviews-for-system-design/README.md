# Peer Mock Interviews for System Design: Rubric and Feedback

> **Prerequisites:** [Previous lesson: Timed Solo Practice: Run a 45-Minute System Design Mock Alone](../07-timed-solo-practice/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates who have practised alone and now need real feedback from another person, and the people willing to give it.

> [!NOTE]
> **In one line:** A peer mock works when **one person interviews, one is interviewed, and both score against the same written rubric**, then swap.

> [!TIP]
> **The Golden Rule:** Feedback must be specific and tied to a rubric line. 'That was good' helps nobody; 'you never stated a cost for choosing Kafka' does.

---

## 1. Roles and structure (90 minutes)

| Time | Activity |
| :--- | :--- |
| 0 to 5 | Interviewer reads the prompt and rules (no hints unless asked) |
| 5 to 50 | Mock interview, 45 minutes |
| 50 to 65 | Candidate self-assesses first, then interviewer gives feedback |
| 65 to 70 | Break and swap roles |
| 70 to 90 | Second mock, shorter (about 15 minutes) or just a deep dive |

**Interviewer behaviour:** stay in role, answer clarifying questions with consistent numbers, ask probing follow-ups ('what if traffic is 10x?', 'what happens when this node dies?'), and do not teach during the session. Take notes with timestamps.

---

## 2. The rubric

Score each row from 1 (missing) to 4 (strong). Use the same rubric every time.

| Area | What a strong answer shows |
| :--- | :--- |
| Requirements | Clarifying questions, explicit scope, functional and non-functional split |
| Estimation | Stated assumptions, correct arithmetic, uses the results to choose designs |
| API and data | Clear endpoints, a data model that fits the access pattern |
| Architecture | Coherent diagram, request path explained, sensible components |
| Depth | Chooses and goes deep on the hardest parts, understands internals |
| Trade-offs | States options, costs and switch conditions |
| Reliability and security | Failure modes, mitigations, abuse and auth |
| Communication | Signposts, checks in, structured, handles hints |

A total near 24 of 32 is a good mock; any row at 1 is the thing to fix first.

---

## 3. Giving feedback that helps

1. **Start with what to repeat**: one or two specific strengths.
2. **Give three specific gaps**, each with the moment it happened ('at minute 20 you chose a relational database without saying why').
3. **Offer a concrete alternative** ('you could have said: I would use a key-value store because access is by id').
4. **Separate content from delivery**: wrong technical claim, versus unclear explanation.
5. **Ask the candidate for their own view first.** People usually spot their biggest gap themselves.

---

## 4. Receiving feedback

- Do not defend. Write down what you hear and ask for the example.
- Pick **one** thing to change before the next mock, not seven.
- Redo the same prompt a week later with only that one change, to see if it worked.
- Rotate partners: different interviewers push on different things, and you need that range.

---

## 5. Finding partners and keeping it fair

Ask colleagues, former classmates, study groups or online communities for a regular partner. Agree on a fixed cadence (weekly), a shared rubric, and that **you swap roles every session**. Being the interviewer is itself excellent practice: you see what a clear answer looks like.

---

## Totalling a rubric and finding the weakest row

Keep scores in a small file and let the computer tell you what to practise next.

```python
scores = {
    "Requirements": 3, "Estimation": 2, "API and data": 3, "Architecture": 4,
    "Depth": 2, "Trade-offs": 2, "Reliability and security": 3, "Communication": 4,
}
total = sum(scores.values())
print(f"total: {total}/32")
weakest = sorted(scores, key=scores.get)[:3]
print("practise next:", weakest)
```

Output (produced by running this exact code):

```text
total: 23/32
practise next: ['Estimation', 'Depth', 'Trade-offs']
```

The total is 23 of 32 and the three lowest rows (Estimation, Depth and Trade-offs) become the focus for the next session.

---

## Common Mistakes

- Giving praise-only feedback.
- Teaching during the mock instead of after.
- Changing the rubric each time, so scores cannot be compared.
- Trying to fix many things at once.
- Always interviewing the same friendly partner.

---

## Practice Questions

<details>
<summary><strong>Q1: How do I get honest feedback from a friend?</strong></summary>

Give them the rubric and ask them to score each row with an example; a structure makes honesty easier.

</details>

<details>
<summary><strong>Q2: Should the interviewer give hints?</strong></summary>

Only when asked or when the candidate is stuck for several minutes, and note it; in real interviews hints affect the evaluation.

</details>

<details>
<summary><strong>Q3: What should the interviewer prepare?</strong></summary>

A prompt, assumed numbers for clarifying questions, and two or three probing follow-ups, so the session is consistent.

</details>

<details>
<summary><strong>Q4: How is a peer mock different from solo practice?</strong></summary>

A person interrupts, asks 'why', and notices unclear explanations, which you cannot do to yourself.

</details>

<details>
<summary><strong>Q5: How many mocks are enough?</strong></summary>

Most candidates see clear improvement after six to ten, with a mix of partners and prompts.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Structure | 5 prompt, 45 mock, 15 feedback, swap roles |
| Rubric | Requirements, estimation, API/data, architecture, depth, trade-offs, reliability/security, communication |
| Feedback | Strengths first, three specific gaps with moments, a concrete alternative |
| Receive | Do not defend; change one thing; redo the prompt |
| Partners | Rotate, swap roles |

---

## Further Reading

- Gayle Laakmann McDowell, *Cracking the Coding Interview*, chapter on behavioural and design interviews.
- [Communicating Design Decisions Clearly](../../21-interview-framework/14-communicating-design-decisions-clearly/README.md) in this course.

---

## Next

Continue with [Deep-Dive Drills: Go Three Levels Deep on Any Component](../09-deep-dive-drills/README.md).
