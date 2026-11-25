# Timed Solo Practice: Run a 45-Minute System Design Mock Alone

> **Prerequisites:** [Previous lesson: Build a Trade-off Library for System Design Interviews](../06-build-a-trade-off-library-for-system-design-interviews/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates who understand the material but have never practised the full 45 minutes under a clock.

> [!NOTE]
> **In one line:** Timed solo practice is **a full mock interview run alone**: a prompt, a timer, a whiteboard, and you speaking aloud as if someone were listening.

> [!TIP]
> **The Golden Rule:** Speak aloud and stop when the timer says stop. A design you only think through teaches far less than one you say and draw against a clock.

---

## 1. The setup

You need a prompt list, a timer, a whiteboard (paper or an app), and a way to record yourself (phone audio is enough).

- **Pick a prompt** you have not studied closely. Use the problems in [Track 22](../../22-interview-design-problems/README.md) as a pool, but do **not** read the lesson first.
- **Set the clock** for 45 minutes, the common length of a design round.
- **Speak aloud the whole time**, as if the interviewer were there. Ask your clarifying questions out loud, then answer them yourself with a stated assumption.
- **Record** the audio. Listening back is uncomfortable and by far the most useful part.

---

## 2. The time budget

| Minutes | Step | Output |
| :--- | :--- | :--- |
| 0 to 5 | Clarify requirements and scope | Functional and non-functional list, out-of-scope list |
| 5 to 10 | Capacity estimation | QPS, storage, bandwidth with assumptions |
| 10 to 15 | API and data model | Endpoints, main entities, store choice |
| 15 to 25 | High-level design | Diagram with request flow |
| 25 to 38 | Deep dives (two or three) | Bottlenecks, algorithms, trade-offs |
| 38 to 43 | Failures, security, scaling | Mitigations |
| 43 to 45 | Summary | Top three trade-offs and what you would do next |

If you are still estimating at minute 15, you have found your first problem. See [Prioritizing Under Time Pressure](../../21-interview-framework/13-prioritizing-under-time-pressure-in-system-design-interviews/README.md).

---

## 3. Review the recording with a checklist

After the session, listen once and score yourself yes or no:

1. Did I ask at least five clarifying questions before drawing?
2. Did I state assumptions and numbers, and use them later?
3. Did I draw a request path, not just boxes?
4. Did I name a trade-off for each major choice, with a cost?
5. Did I pick the deep dives, or did I wait to be told?
6. Did I cover a failure mode and a security point?
7. Did I finish with a summary inside the time?
8. Did I use filler or go silent for more than ten seconds?

Write down the two lowest-scoring items. Those are the next session's focus.

---

## 4. A weekly rhythm that works

- **Two timed sessions per week**, 45 minutes each, different prompts.
- **One review session** for the recordings, 20 minutes.
- **One deep-dive drill** on the weakest component ([Deep-Dive Drills](../09-deep-dive-drills/README.md)).
- After four weeks you will have eight recorded designs and a clear picture of your pattern of mistakes.

---

## A tiny interview timer

This prints the checkpoints for a 45 minute session, so you know where you should be at each point.

```python
plan = [("Clarify", 5), ("Estimate", 5), ("API and data", 5), ("High-level design", 10), ("Deep dives", 13), ("Failures and security", 5), ("Summary", 2)]

t = 0
for name, minutes in plan:
    print(f"{t:>2}-{t + minutes:<2} min  {name}")
    t += minutes
print("total:", t, "minutes")
```

Output (produced by running this exact code):

```text
 0-5  min  Clarify
 5-10 min  Estimate
10-15 min  API and data
15-25 min  High-level design
25-38 min  Deep dives
38-43 min  Failures and security
43-45 min  Summary
total: 45 minutes
```

The blocks add up to exactly 45 minutes. Keep this list next to your whiteboard and glance at it at each boundary.

---

## Common Mistakes

- Thinking silently instead of speaking aloud.
- Reading the solution before the timed attempt.
- Not recording, so there is no evidence to review.
- Spending 20 minutes on one component and skipping failures.
- Always practising the prompts you already like.

---

## Practice Questions

<details>
<summary><strong>Q1: How often should I practise?</strong></summary>

Two timed sessions a week for four weeks beats one long weekend, because the review and spacing do the learning.

</details>

<details>
<summary><strong>Q2: Is solo practice as good as a mock with a person?</strong></summary>

It is not a replacement, but it is cheaper and catches pacing and speaking habits; add peer mocks for feedback on content.

</details>

<details>
<summary><strong>Q3: What should I do when I get stuck mid-session?</strong></summary>

Say what you are stuck on aloud, state two options, pick one with a reason and continue. Stalling is the failure, not the wrong pick.

</details>

<details>
<summary><strong>Q4: How do I choose prompts?</strong></summary>

Rotate categories: storage, messaging, real-time, marketplace, data pipeline and an AI system, and favour ones you find hard.

</details>

<details>
<summary><strong>Q5: How do I know I improved?</strong></summary>

Compare checklist scores and timing across recordings; the same prompt repeated a month later is a good benchmark.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Setup | Prompt, 45 min timer, whiteboard, audio recording |
| Budget | 5 clarify, 5 estimate, 5 API/data, 10 HLD, 13 deep dives, 5 failures, 2 summary |
| Review | Eight-item checklist, note two weakest |
| Rhythm | Two sessions, one review and one drill per week |
| Rule | Speak aloud, stop at the timer |

---

## Further Reading

- Alex Xu, *System Design Interview*, chapter 3 on a framework for system design interviews.
- [Prioritizing Under Time Pressure](../../21-interview-framework/13-prioritizing-under-time-pressure-in-system-design-interviews/README.md) in this course.

---

## Next

Continue with [Peer Mock Interviews for System Design: Rubric and Feedback](../08-peer-mock-interviews-for-system-design/README.md).
