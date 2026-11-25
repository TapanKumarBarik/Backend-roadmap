# Weak-Area Review Loop: Find and Fix Your System Design Gaps

> **Prerequisites:** [Previous lesson: Behavioral Architecture Stories: STAR Answers for Design Decisions](../11-behavioral-architecture-stories/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates who have done several mocks and want a systematic way to turn feedback into improvement.

> [!NOTE]
> **In one line:** A weak-area loop is **measure, pick one gap, study it, test it, repeat**, with a log that shows progress.

> [!TIP]
> **The Golden Rule:** Fix one weakness at a time and prove the fix with a fresh attempt. Studying everything equally is how weak areas stay weak.

---

## 1. The loop

1. **Collect evidence**: rubric scores and notes from every mock (solo and peer).
2. **Find the pattern**: the lowest rows across the last three sessions, not the latest one alone.
3. **Pick one weakness** and name it narrowly ('capacity estimation: I forget to use the numbers later', not 'scale').
4. **Study it** for a fixed block (45 to 60 minutes): a lesson, a worked example and a drill.
5. **Test it** with a fresh prompt aimed at that skill, timed.
6. **Log the result** and either keep the item open or close it and pick the next.

---

## 2. A weakness log

| Date | Weakness | Evidence | Fix block | Retest result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 03 Dec | Estimation not used later | 2/4 in two mocks | Estimation lesson plus 3 drills | 3/4 | Open |
| 10 Dec | No failure modes | 1/4 | Failures lesson, checklist | 3/4 | Open |
| 17 Dec | Estimation not used later | Retest 4/4 | Repeat drill | 4/4 | Closed |

A weakness is closed only after two consecutive good results, because one good session can be luck.

---

## 3. Matching weaknesses to lessons

| Weakness | Study this |
| :--- | :--- |
| Do not know where to start | [Interview Framework](../../21-interview-framework/README.md), lessons 1 to 4 |
| Estimates feel random | [Numbers to memorise](../01-system-design-numbers-to-memorize/README.md) and [Capacity Estimation](../../21-interview-framework/05-capacity-estimation-in-system-design-interviews/README.md) |
| Shallow on databases | [Revise database choices](../02-revise-database-choices/README.md) |
| Shaky on consistency | [Revise caching, messaging and consistency](../03-revise-caching-messaging-and-consistency/README.md) |
| Ignore failures | [Revise reliability and security](../04-revise-reliability-and-security-patterns/README.md) |
| GenAI gaps | [Revise GenAI system design](../05-revise-genai-system-design/README.md) |
| Cannot defend choices | [Trade-off library](../06-build-a-trade-off-library-for-system-design-interviews/README.md) |
| Run out of depth | [Deep-dive drills](../09-deep-dive-drills/README.md) |
| Slow or rambling | [Timed solo practice](../07-timed-solo-practice/README.md) |

---

## 4. Pitfalls

- **Studying what you enjoy** instead of what the evidence says.
- **Vague weaknesses** ('communication') that cannot be tested. Make each one observable.
- **No retest**, so improvement is assumed rather than shown.
- **Too many open items**: keep at most three open at once.
- **Skipping the log**: the log is what shows you progress when it feels like none.

---

## Finding the pattern across sessions

Average the rubric rows over the last three mocks to see which weakness is consistent rather than a one-off.

```python
sessions = [
    {"Estimation": 2, "Depth": 3, "Trade-offs": 2, "Failures": 1},
    {"Estimation": 3, "Depth": 3, "Trade-offs": 2, "Failures": 2},
    {"Estimation": 2, "Depth": 4, "Trade-offs": 3, "Failures": 1},
]
areas = sessions[0].keys()
avg = {a: sum(s[a] for s in sessions) / len(sessions) for a in areas}
for a, v in sorted(avg.items(), key=lambda kv: kv[1]):
    print(f"{a:<11} {v:.2f}")
print("focus on:", min(avg, key=avg.get))
```

Output (produced by running this exact code):

```text
Failures    1.33
Estimation  2.33
Trade-offs  2.33
Depth       3.33
focus on: Failures
```

Failures average 1.33 across three sessions, so it is the consistent gap and the next study block, even though estimation also scored low once.

---

## Common Mistakes

- Choosing weaknesses by feel.
- Studying many topics at once.
- Declaring a weakness fixed after one good session.
- Keeping no written log.
- Never revisiting closed items.

---

## Practice Questions

<details>
<summary><strong>Q1: How do I find my weakest area?</strong></summary>

Average rubric rows across several mocks and look at the lowest consistent ones, plus the moments reviewers noted.

</details>

<details>
<summary><strong>Q2: How long should a fix block be?</strong></summary>

45 to 60 minutes of focused study and a drill, followed by a fresh timed test.

</details>

<details>
<summary><strong>Q3: When is a weakness closed?</strong></summary>

After two consecutive good retests on different prompts.

</details>

<details>
<summary><strong>Q4: How many gaps should I work on at once?</strong></summary>

One active, at most three open, so the practice stays focused.

</details>

<details>
<summary><strong>Q5: What if everything looks equally weak?</strong></summary>

Start with requirements and estimation: they shape the rest of the interview and improve fastest.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Loop | Evidence, pattern, one weakness, study, retest, log |
| Log | Date, weakness, evidence, fix, retest, status |
| Close when | Two good retests in a row |
| Limit | One active, at most three open |
| Match | Use the weakness-to-lesson table |

---

## Further Reading

- Anders Ericsson and Robert Pool, *Peak: Secrets from the New Science of Expertise* (deliberate practice).
- [Peer Mock Interviews](../08-peer-mock-interviews-for-system-design/README.md) in this track.

---

## Next

Continue with [Are You Ready for System Design Interviews? Final Checklist](../13-are-you-ready-for-system-design-interviews-final-checklist/README.md).
