# Peer Mock Interviews for System Design: Rubric and Feedback

> **Prerequisites:** [Previous lesson: Timed Solo Practice: Run a 45-Minute System Design Mock Alone](../07-timed-solo-practice/README.md).
> **Estimated Reading Time:** 22–28 minutes
> **Target Audience:** Candidates who have practised alone and now need real feedback from another person, and the people willing to give it.

> [!NOTE]
> **In one line:** A peer mock works when **one person interviews, one is interviewed, and both score against the same written rubric**, then swap.

> [!TIP]
> **The Golden Rule:** Feedback must be specific and tied to a rubric line. 'That was good' helps nobody; 'you never stated a cost for choosing Kafka' does.

---

## 1. Core Concept & Why Interviewers Test It

Solo practice fixes pacing and dead air, but it cannot replicate the single hardest variable of a real system design loop: **an unscripted human interviewer who interrupts, challenges assumptions, and changes requirements mid-flight**. A peer mock closes that gap—provided both participants treat it like a calibrated engineering evaluation rather than a casual chat.

Unstructured peer mocks fail because friends give polite praise (*"Yeah, looked super solid!"*) or interrupt mid-diagram to debate their favorite database. A structured peer mock enforces three invariants:
1. **Strict Role Separation:** During the 45-minute window, the interviewer stays in character—answering clarifying questions with consistent numbers, probing bottlenecks, and logging timestamped observations without teaching.
2. **A Fixed 8-Row, 32-Point Rubric:** Both candidate and interviewer score the exact same dimensions independently before comparing notes, making strengths and blind spots comparable across weeks.
3. **Reciprocal Role Swapping:** Being the interviewer is as valuable as being the candidate; watching someone else struggle with unclear signposting or unstated trade-offs calibrates your own internal bar immediately.

| Session Format | Time Split | Primary Failure Mode | Fix |
| :--- | :--- | :--- | :--- |
| **Casual "Chat" Mock** | Unbounded | Friend teaches mid-session; vague praise at the end | Enforce 45-min no-teaching rule + written rubric |
| **Full 90-Min Peer Mock** | 5m setup + 45m mock + 15m debrief + 5m break + 20m reverse mini-mock | One partner dominates or skips debrief | Hard timers + candidate self-assesses *first* |
| **Full Double-Header** | 2x (45m mock + 15m debrief) = 120m | Cognitive fatigue in mock #2 | Keep mock #2 focused on a 15–20m deep dive if tired |

### Why It Matters in Interviews

1. **Calibration Against Real Scoring Bars:** Hiring committees score on standardized rubrics (Requirements, Estimation, Architecture, Depth, Trade-offs, Communication), not vibes (see [Communicating Design Decisions Clearly](../../21-interview-framework/14-communicating-design-decisions-clearly/README.md)).
2. **Stress-Testing Ambiguity & Pushback:** Only another person can ask *"What happens when your Redis cluster splits?"* at minute 28 while you are still finishing your sharding explanation.
3. **Interviewer Empathy:** Running 5 mocks as the interviewer teaches you what signals make an interviewer's note-taking easy versus exhausting.

---

## 2. Quantitative Foundations & Time/Capacity Math

### The 90-Minute Session Schedule

| Window | Duration | Activity | Owner |
| :--- | :--- | :--- | :--- |
| `00–05` | 5 min | Interviewer reads prompt, states rules (no hints unless asked), shares link | Interviewer |
| `05–50` | 45 min | Full timed mock interview (timestamped notes only; zero teaching) | Both |
| `50–65` | 15 min | **Candidate self-assesses first** (3–5m), then interviewer delivers rubric scores + 3 gaps | Both |
| `65–70` | 5 min | Break and swap roles | Both |
| `70–90` | 20 min | Reverse mini-mock (15m targeted deep dive or HLD + 5m debrief) | Swapped |

### Rubric Scoring Math (8 Rows $\times$ 1–4 Scale = 32 Points)

Each of the 8 rubric dimensions is scored from **1 (Missing)** to **4 (Strong / Staff Signal)**:

$$S_{\text{total}} = \sum_{i=1}^{8} r_i, \qquad r_i \in \{1, 2, 3, 4\}, \qquad S_{\text{total}} \in [8, 32]$$

$$\text{Weighted Readiness Index} = \frac{S_{\text{total}}}{32} \times 100\%$$

### Score Interpretation & Hiring Bar Calibration

| Total Score | % Band | Equivalent Interview Signal | Immediate Action Rule |
| :--- | :--- | :--- | :--- |
| **8–15 / 32** | $< 50\%$ | **No Hire** (structural gaps or incomplete) | Return to timed solo practice (`07-timed-solo-practice`) for 2 weeks |
| **16–21 / 32** | $50\%–65\%$ | **Lean No Hire / Borderline** | Fix any row scored `1` immediately; drill weakest 2 rows |
| **22–26 / 32** | $68\%–81\%$ | **Hire (Senior Baseline)** | Target rows scored `2`; sharpen trade-off switch conditions |
| **27–32 / 32** | $84\%–100\%$ | **Strong Hire (Staff Signal)** | Maintain with 1 weekly peer mock + hard GenAI/distributed prompts |

### Worked Numerical Example: Diagnosing a 23/32 Mock

Suppose your partner scores your 45-minute mock as:
- `Requirements: 3`, `Estimation: 2`, `API and data: 3`, `Architecture: 4`, `Depth: 2`, `Trade-offs: 2`, `Reliability and security: 3`, `Communication: 4`.
- **Total:** $3+2+3+4+2+2+3+4 = \mathbf{23/32}$ ($71.9\%$).
- **Diagnosis:** Your high-level architecture (`4`) and communication (`4`) are already Senior/Staff level, but **Estimation (`2`)**, **Depth (`2`)**, and **Trade-offs (`2`)** are dragging you into Borderline territory. Instead of doing random mocks, your **single goal** for next week is raising `Trade-offs` or `Depth` from `2` to `3+` on the same prompt.

---

## 3. Decision Matrices, Rubrics & Trade-Off Rules

### The 8-Row Peer Mock Rubric (1 = Missing, 2 = Weak, 3 = Solid, 4 = Strong)

Use this exact rubric every single session so scores remain comparable over time:

| # | Area | Score 1 (Missing) | Score 2 (Weak) | Score 3 (Solid) | Score 4 (Strong / Staff) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **Requirements** | Jumps straight to drawing | Asks 1–2 vague questions | Clarifies functional + non-functional + scope | Locks SLAs, consistency bounds, and out-of-scope in `<5m` |
| **2** | **Estimation** | Skips numbers completely | Math errors or unused numbers | Correct QPS & storage estimates | Connects QPS/storage directly to DB/cache/sharding choices |
| **3** | **API & Data** | No schema or endpoints | Generic CRUD; wrong store | Clean endpoints + fitting schema | Partition/sort keys aligned to access patterns & hot-key risks |
| **4** | **Architecture** | Disconnected boxes | Missing read or write path | Coherent E2E diagram + flows | Clean, minimal components; explicit sync vs. async boundaries |
| **5** | **Depth** | Surface labels only | Waits to be pushed; shallow | Goes deep on 1–2 bottlenecks | Proactively dives 3 levels deep (data structures, internals, edge cases) |
| **6** | **Trade-offs** | "X is best" (no cost) | Lists options without picking | States choice + cost | Proactive choice + cost + mitigation + explicit switch condition |
| **7** | **Reliability & Security** | Zero failure modes | Mentions "add replicas" only | Covers SPOFs, retries, rate limits | Blast-radius isolation, DLQs, idempotency, auth, abuse prevention |
| **8** | **Communication** | Long silences or rambling | Needs frequent redirection | Clear structure and pacing | Crisp signposting, checks in, adapts smoothly to hints/pushback |

> [!WARNING]
> **The #1 Peer Mock Trap:** The interviewer breaking character to **teach** during the 45-minute mock (*"Actually, you shouldn't use Postgres there, let me explain why..."*). Teaching mid-mock destroys pacing, ruins the candidate's confidence, and invalidates the 45-minute simulation. Write the timestamp down (`[20:14] Chose Postgres without stating write-QPS limit`) and save it for the debrief.

---

## 4. Visual Workflows & Architecture Diagrams

### Diagram 1: End-to-End 90-Minute Peer Mock Workflow

```mermaid
flowchart LR
    Prep["Interviewer Preps Prompt + Numbers + 3 Probes"] --> Mock["45-Min Mock (Strict Role, Timestamped Notes)"]
    Mock --> Self["Candidate Self-Assesses First (5m)"]
    Self --> Debrief["Interviewer Gives 2 Strengths + 3 Gaps + 1 Alt (10m)"]
    Debrief --> Score["Both Log 8-Row Rubric (32 pts)"]
    Score --> Swap["5-Min Break and Swap Roles"]
    Swap --> Mini["20-Min Reverse Mini-Mock"]
    Mini --> Action["Pick 1 Change -> Redo Same Prompt in 7 Days"]
```

### Diagram 2: Calibrated Feedback Delivery Sequence

```mermaid
sequenceDiagram
    participant C as Candidate
    participant I as Interviewer

    Note over C,I: Minute 50: Timer Stops
    I->>C: Ask: How do you think that went? Where did you feel weakest?
    C->>I: Self-assessment (usually spots 1-2 biggest gaps accurately)
    I->>C: 1. Two specific strengths to repeat (with timestamps)
    I->>C: 2. Three specific gaps (rubric row + exact minute + quote)
    I->>C: 3. Concrete alternative phrasing for the biggest gap
    I->>C: 4. Reveal numeric 8-row rubric scores (X/32)
    C->>I: Write notes without defending; pick ONE fix for next week
```

---

## 5. Deep-Dive Drill 1: How to Be a Great Mock Interviewer

Most candidates prepare only for the interviewee seat. Preparing the **interviewer** seat well makes the session 3x more valuable for both people:

1. **Prepare a 1-Page Interviewer Sheet Before the Call:**
   - *Prompt:* One crisp sentence (e.g., *"Design a distributed rate limiter for an API gateway"*).
   - *Consistent Numbers:* Pre-decide DAU, QPS, latency SLA, and payload size so you don't invent contradictory numbers mid-session.
   - *Three Probing Follow-Ups:* E.g., (a) *"What if Redis is partitioned?"*, (b) *"How do you avoid race conditions on read-modify-write?"*, (c) *"What if one tenant spikes 100x?"*
2. **Take Timestamped Notes:** Write `[MM:SS] Observation` (e.g., `[14:20] Picked DynamoDB without naming partition key`). Timestamps turn vague impressions into undeniable, actionable feedback.
3. **Give Hints Only When Stuck >2 Minutes (and Log Them):** If the candidate stalls, give a gentle nudge (*"How might we avoid hitting the DB on every single read?"*) and note `[27:00] Needed hint for caching`. In real interviews, hints cap your maximum score on that row.

---

## 6. Deep-Dive Drill 2: Delivering High-Signal, Non-Vague Feedback

Follow this 5-step debrief protocol in minutes `50–65`:

1. **Candidate Speaks First:** Ask *"Before I share my notes, how did you feel that went?"* Candidates almost always identify their biggest timing or depth gap themselves, which lowers defensiveness.
2. **Start With 1–2 Specific Strengths to Repeat:** Never say *"Good job."* Say: *"At minute 04, your explicit out-of-scope list saved us 10 minutes later—keep doing that."*
3. **Deliver Exactly 3 Specific Gaps (Moment + Rubric Row + Impact):**
   - *Bad:* "Your trade-offs were weak."
   - *Good:* "On **Trade-offs (Row 6)**, at **minute 20** you chose Kafka without stating its operational cost or when a simpler SQS queue would suffice."
4. **Offer a Concrete Alternative Phrasing:** Give them the exact sentence they could have used: *"You could have said: 'I'll use Kafka over SQS because we need multi-consumer replay, accepting partition management overhead.'"*
5. **Separate Content Errors from Delivery Errors:** Clarify whether a gap was a **wrong technical claim** (e.g., thinking Redis Pub/Sub persists messages for offline consumers) versus **unclear delivery** (knowing it, but failing to state it aloud).

---

## 7. Deep-Dive Drill 3: Receiving Feedback & The 1-Change Loop

How you process feedback determines whether 6 peer mocks transform your performance or leave you stuck at 23/32:

1. **Zero Defensiveness Rule:** While your partner is speaking, **write everything down and do not explain what you "meant to say."** If an experienced peer didn't hear it, a real interviewer wouldn't credit it either. Ask only clarifying questions: *"At minute 22, what would have made that explanation clearer?"*
2. **The "Pick One" Constraint:** Never try to fix 5 rubric rows in your next mock. Pick **one** concrete behavior (e.g., *"Every time I draw a DB or queue, state one cost before moving on"*).
3. **The 7-Day Same-Prompt Retest:** Redo the **exact same prompt** 7 days later (either solo or with a different partner) applying *only* that one fix. Watching a row jump from `2` to `4` builds real muscle memory.
4. **Rotate Partners Every 2–3 Sessions:** Friendly regular partners learn your shorthand and stop challenging your assumptions. Rotate across 3–4 peers from different backgrounds (infra, backend, data, ML).

---

## 8. Adapting Answers Across Scale (1K vs 100K vs 10M+ Users)

In peer mocks, interviewers often test adaptability by escalating scale mid-session. Practice how both roles handle scale shifts:

| Mock Stage | Interviewer's Scale Probe | Strong Candidate Response |
| :--- | :--- | :--- |
| **Baseline (1K–10K QPS)** | *"Do we really need Kafka and sharding here?"* | *"No—at 2K QPS, a single Postgres primary + read replica + Redis handles this cleanly with lower ops cost."* |
| **10x Spike (100K QPS)** | *"Traffic just grew 10x overnight. What breaks first?"* | Points directly to the bottleneck: *"Single DB write leader saturates at ~15K W/s; I'd shard by `tenant_id` and move non-critical writes async."* |
| **100x Global (10M+ DAU)** | *"Now we're multi-region in US, EU, and APAC. What changes?"* | Addresses cross-region latency, data residency (GDPR), active-active vs. active-passive DB, and CDN/edge caching. |

---

## 9. Failure Modes, Traps & Recovery

1. **The "Polite Praise" Trap:** Both partners say *"Great job, 4/4 everywhere!"* to avoid awkwardness.
   - *Recovery:* Agree upfront on a **forced-distribution rule**: the interviewer *must* name at least 2 specific gaps with timestamps, even in a strong mock.
2. **The "Debate Club" Hijack:** Partner A interrupts at minute 18 to argue for 10 minutes about Cassandra vs. ScyllaDB.
   - *Recovery:* Use a hard rule: the interviewer may probe for 60 seconds, then must let the candidate own their choice and proceed.
3. **Changing the Rubric Every Week:** Scoring out of 10 one week, pass/fail the next.
   - *Recovery:* Pin the 8-row, 32-point rubric in a shared spreadsheet/Markdown tracker so you can plot progress over 6–10 mocks.
4. **Never Swapping Roles:** Only being the candidate.
   - *Recovery:* Always swap roles; interviewing teaches you how fast unclear diagrams lose the listener.

---

## 10. Production / Interview Calibration Case Study

### Case Study: From 21/32 ("Lean No") to 28/32 ("Strong Hire") in 6 Peer Mocks

- **Baseline (Mock #1, Score 21/32):** A backend engineer with 6 years of experience ran a peer mock on *Design a Notification System*.
  - *Rubric Breakdown:* `Requirements: 3`, `Estimation: 2`, `API: 3`, `Architecture: 3`, `Depth: 2`, `Trade-offs: 2`, `Reliability: 3`, `Communication: 3`.
  - *Timestamped Debrief:* Interviewer noted at `[19:00]` *"Chose RabbitMQ without mentioning Kafka or why"*, at `[29:00]` *"Stopped at 'retry worker' without explaining exponential backoff, jitter, or DLQ poisoning"*, and at `[35:00]` *"Still needed 2 hints to address per-channel rate limiting."*
- **Targeted 1-Change Interventions:**
  - *Mocks #2–#3:* Focused strictly on **Trade-offs** (stating cost + switch condition for every box). Score rose to **24/32**.
  - *Mocks #4–#5:* Focused strictly on **Depth** (running the 3-level drill on queues and rate limiters). Score rose to **26/32**.
  - *Mock #6 (Re-test of Notification System with a new partner):* Scored **28/32** (`Depth: 4`, `Trade-offs: 4`), proactively detailing token-bucket vendor throttling, idempotency keys, and DLQ replay without a single hint.

---

## 11. Executable Reference Tooling (4 Languages)

Keep your peer mock scores in a structured tracker so you can automatically compute your 32-point score, hiring-bar band, and **top 3 weakest rubric rows** to drill next. Below is a **Peer Mock Rubric Scorer** in Go, TypeScript, Python, and C#.

````carousel
```go
package main

import (
	"fmt"
	"sort"
)

type RowScore struct {
	Area  string
	Score int
}

func EvaluateMock(scores map[string]int) {
	total := 0
	rows := make([]RowScore, 0, len(scores))
	for k, v := range scores {
		total += v
		rows = append(rows, RowScore{Area: k, Score: v})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Score == rows[j].Score {
			return rows[i].Area < rows[j].Area
		}
		return rows[i].Score < rows[j].Score
	})

	fmt.Printf("Total: %d/32 (%.1f%%)\n", total, float64(total)/32.0*100)
	fmt.Printf("Practise next: %s (%d), %s (%d), %s (%d)\n",
		rows[0].Area, rows[0].Score,
		rows[1].Area, rows[1].Score,
		rows[2].Area, rows[2].Score)
}

func main() {
	EvaluateMock(map[string]int{
		"Requirements": 3, "Estimation": 2, "API and data": 3, "Architecture": 4,
		"Depth": 2, "Trade-offs": 2, "Reliability and security": 3, "Communication": 4,
	})
}
```
<!-- slide -->
```typescript
type RubricScores = Record<string, number>;

function evaluateMock(scores: RubricScores): void {
  const entries = Object.entries(scores);
  const total = entries.reduce((sum, [, val]) => sum + val, 0);
  const sorted = [...entries].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const weakest = sorted.slice(0, 3).map(([area]) => area);

  console.log(`total: ${total}/32 (${((total / 32) * 100).toFixed(1)}%)`);
  console.log("practise next:", weakest);
}

evaluateMock({
  Requirements: 3,
  Estimation: 2,
  "API and data": 3,
  Architecture: 4,
  Depth: 2,
  "Trade-offs": 2,
  "Reliability and security": 3,
  Communication: 4,
});
```
<!-- slide -->
```python
scores = {
    "Requirements": 3,
    "Estimation": 2,
    "API and data": 3,
    "Architecture": 4,
    "Depth": 2,
    "Trade-offs": 2,
    "Reliability and security": 3,
    "Communication": 4,
}

total = sum(scores.values())
print(f"total: {total}/32 ({total / 32 * 100:.1f}%)")
weakest = sorted(scores, key=scores.get)[:3]
print("practise next:", weakest)
```
<!-- slide -->
```csharp
using System;
using System.Collections.Generic;
using System.Linq;

public static class RubricEvaluator
{
    public static void Main()
    {
        var scores = new Dictionary<string, int>
        {
            ["Requirements"] = 3,
            ["Estimation"] = 2,
            ["API and data"] = 3,
            ["Architecture"] = 4,
            ["Depth"] = 2,
            ["Trade-offs"] = 2,
            ["Reliability and security"] = 3,
            ["Communication"] = 4,
        };

        int total = scores.Values.Sum();
        var weakest = scores.OrderBy(kv => kv.Value).ThenBy(kv => kv.Key).Take(3).Select(kv => kv.Key);

        Console.WriteLine($"total: {total}/32 ({total / 32.0 * 100:F1}%)");
        Console.WriteLine("practise next: " + string.Join(", ", weakest));
    }
}
```
````

---

## 12. Verification & CLI Diagnostics

Use these CLI commands to score a completed mock, check readiness trends across multiple sessions, and generate an interviewer prep template:

```bash
# 1. Score a mock and identify the top 3 weakest rows
python3 -c '
scores = {"Requirements":3,"Estimation":2,"API and data":3,"Architecture":4,"Depth":2,"Trade-offs":2,"Reliability and security":3,"Communication":4}
print(f"total: {sum(scores.values())}/32")
print("practise next:", sorted(scores, key=scores.get)[:3])
'

# 2. Compute trend across 4 mock sessions from inline JSON
python3 -c '
history = [
    {"mock": 1, "total": 21, "lowest": "Depth"},
    {"mock": 2, "total": 23, "lowest": "Trade-offs"},
    {"mock": 3, "total": 26, "lowest": "Estimation"},
    {"mock": 4, "total": 28, "lowest": "None (all >= 3)"},
]
for h in history:
    bar = "#" * (h["total"] // 2)
    print(f"Mock {h[\"mock\"]}: {h[\"total\"]}/32 {bar} | Focus: {h[\"lowest\"]}")
'

# 3. Print a blank 8-row rubric template to paste into a shared doc before a call
python3 -c '
rows = ["Requirements","Estimation","API and data","Architecture","Depth","Trade-offs","Reliability and security","Communication"]
print("| Area | Score (1-4) | Timestamped Evidence |\n| :--- | :--- | :--- |")
for r in rows:
    print(f"| {r} | /4 | |")
'
```

---

## 13. Common Interview Mistakes & Red Flags

- **Giving praise-only feedback** (*"You did great!"*) without citing a rubric row or timestamp.
- **Teaching during the 45-minute mock** instead of staying in role and saving feedback for minute 50.
- **Changing the rubric each time**, making it impossible to measure whether practice is actually working.
- **Trying to fix five weaknesses at once** instead of isolating **one** behavioral change per mock.
- **Always interviewing with the same friendly partner** who stops challenging your assumptions.
- **Skipping the candidate's self-assessment** at the start of the debrief.
- **Arguing defensively during feedback** (*"Well, I was going to mention that later"*), instead of logging the gap.

---

## 14. Key Terminology & Glossary

| Term | Definition |
| :--- | :--- |
| **Calibration Rubric** | A fixed 8-row, 1–4 point scoring matrix used identically across all mock sessions. |
| **Timestamped Observation** | An interviewer note anchored to exact elapsed time (`[24:10]`) and a specific quote or diagram choice. |
| **Role Separation** | Keeping the interviewer strictly in-character (no lecturing) during the 45-minute design window. |
| **Self-Assessment First** | Having the candidate critique their own performance before the interviewer shares rubric scores. |
| **Probing Follow-Up** | A planned interviewer question testing 10x scale, node failure, or a changed consistency requirement. |
| **Hint Penalty** | Note-taking rule marking where a candidate required nudging to unblock, lowering that row's score. |
| **1-Change Loop** | Selecting exactly one lowest-scoring behavior to fix before repeating or advancing to the next mock. |
| **Reverse Mini-Mock** | A 15–20 minute shortened second round after swapping roles so both peers practice in one 90-minute block. |
| **Content vs. Delivery** | Distinguishing a wrong technical fact from a poorly structured explanation of a correct idea. |
| **Signal-to-Noise Ratio** | How clearly a candidate's verbalized architecture communicates seniority to a note-taking interviewer. |

---

## 15. Interview Follow-Up Questions (12 Q&As)

### Basic Conceptual Questions

<details>
<summary><strong>Q1: How do I get honest, actionable feedback from a friend? [BASIC]</strong></summary>

Send them the **8-row rubric** before the call and ask them to score each row `1–4` with **one timestamped example** and **three specific gaps**. Structure removes the social awkwardness of critiquing a friend.

</details>

<details>
<summary><strong>Q2: Should the mock interviewer give hints during the 45 minutes? [BASIC]</strong></summary>

Only when asked or when the candidate has been visibly stuck for $>2$ minutes—and **always write it down with a timestamp**. In real interviews, hints keep the conversation alive but reduce your score on Depth or Independence.

</details>

<details>
<summary><strong>Q3: What should the interviewer prepare before a peer mock? [BASIC]</strong></summary>

A 1-page sheet with: (1) the prompt, (2) consistent baseline numbers for clarifying questions (DAU, QPS, latency SLA), and (3) three probing follow-ups (scale 10x, failure mode, requirement flip).

</details>

<details>
<summary><strong>Q4: How many peer mocks are enough before real interviews? [BASIC]</strong></summary>

Most candidates see a decisive jump in fluency and rubric scores after **6 to 10 peer mocks**, provided they rotate partners, use the same 32-point rubric, and fix one weakness between each session.

</details>

### Scenario-Based Architecture Questions

<details>
<summary><strong>Q5: How is a peer mock different from timed solo practice? [SCENARIO]</strong></summary>

Solo practice trains pacing and speaking aloud, but you cannot surprise yourself. A peer interrupts your flow, asks *"why?"* on unstated assumptions, changes requirements mid-design, and catches unclear explanations that seem obvious inside your own head.

</details>

<details>
<summary><strong>Q6: My partner spent 10 minutes debating my database choice mid-mock and I ran out of time. How do we prevent that? [SCENARIO]</strong></summary>

Agree on the **60-second probe rule** before starting: the interviewer may challenge a choice for ~60 seconds to test your trade-off reasoning, then must accept your decision and let you advance. Debating belongs in the 15-minute debrief, not minute 20.

</details>

<details>
<summary><strong>Q7: Why should the candidate self-assess first at minute 50? [SCENARIO]</strong></summary>

Candidates usually spot 1–2 of their biggest gaps immediately once the timer stops. Letting them voice those first builds self-awareness, prevents defensiveness, and lets the interviewer confirm or calibrate (*"You noticed your estimation was rushed—here's how that affected minute 25..."*).

</details>

<details>
<summary><strong>Q8: What if my mock partner is more junior than me—is the mock still useful? [SCENARIO]</strong></summary>

Yes! Give them a prepared interviewer sheet with 3 probing questions, and treat **Communication** and **Clarity** as the primary test: if you can explain distributed locks or sharding clearly to a junior engineer, you will ace it with a Staff interviewer. Plus, interviewing them sharpens your own rubric instincts.

</details>

### Advanced & Tricky Interview Questions

<details>
<summary><strong>Q9: In a real interview, how do I recover if the interviewer seems unengaged or keeps interrupting? [TRICKY]</strong></summary>

Interruptions usually mean the interviewer wants to steer you toward a specific rubric area (e.g., skipping HLD to test Deep Dives). Pause immediately, summarize what they are asking, and pivot: *"Got it—let's zoom directly into the sharding key and hot-partition mitigation."*

</details>

<details>
<summary><strong>Q10: Why is a 24/32 with one "1" worse than a flat 22/32 across all rows? [TRICKY]</strong></summary>

Real hiring committees often enforce **minimum floor bars**: a `1` (Missing) in *Reliability & Security* or *Depth* can trigger an automatic **No Hire** veto even if your *Architecture* and *Communication* are `4/4`. Always fix any `1` row before polishing `3`s into `4`s.

</details>

<details>
<summary><strong>Q11: How do you separate a "content gap" from a "delivery gap" in a debrief? [TRICKY]</strong></summary>

Ask the candidate after the mock: *"Tell me in 30 seconds how Kafka partitions work."* If they explain it accurately now, it was a **delivery/pacing gap** under pressure. If they still cannot explain it, it is a **content gap** requiring a [Deep-Dive Drill](../09-deep-dive-drills/README.md).

</details>

<details>
<summary><strong>Q12: Where can I find calibrated peer mock partners if I don't have colleagues preparing? [TRICKY]</strong></summary>

Use engineering study cohorts, alumni Slack/Discord channels, or structured mock platforms—and filter partners with one rule: send them the 8-row rubric beforehand. Anyone willing to prepare a 1-page prompt and score a written rubric is a serious partner.

</details>

---

## 16. One-Page Master Cheat Sheet

```text
+-----------------------------------------------------------------------------+
|                    PEER MOCK INTERVIEWS MASTER CHEAT SHEET                  |
+-----------------------------------------------------------------------------+
| 1. 90M SPLIT  : 5m Setup | 45m Mock (no teaching!) | 15m Debrief |          |
|                 5m Break | 20m Swapped Mini-Mock                            |
| 2. 8-ROW BAR  : Reqs, Est, API/Data, Arch, Depth, Trade-offs, Rel/Sec, Comm |
|                 Score 1-4 each (Max 32). >=24 Hire | >=27 Strong | Fix 1s!  |
| 3. FEEDBACK   : Candidate self-assesses FIRST -> 2 Strengths (w/ timestamps)|
|                 -> 3 Gaps (row + minute) -> 1 Concrete Alt Phrasing         |
| 4. RECEIVING  : Zero defense -> Write it down -> Pick ONE fix -> Redo in 7d |
| 5. INTERVIEWER: Prep prompt + numbers + 3 probes; log timestamps; stay in   |
+-----------------------------------------------------------------------------+
```

| Topic | Remember |
| :--- | :--- |
| **Structure** | 5 prompt, 45 mock, 15 feedback, swap roles |
| **Rubric** | Requirements, estimation, API/data, architecture, depth, trade-offs, reliability/security, communication |
| **Feedback** | Strengths first, three specific gaps with moments, a concrete alternative |
| **Receive** | Do not defend; change one thing; redo the prompt |
| **Partners** | Rotate, swap roles |

---

## Further Reading

- Gayle Laakmann McDowell, *Cracking the Coding Interview*, chapter on behavioural and design interviews.
- [Communicating Design Decisions Clearly](../../21-interview-framework/14-communicating-design-decisions-clearly/README.md) in this course.

---

## Next

Continue with [Deep-Dive Drills: Go Three Levels Deep on Any Component](../09-deep-dive-drills/README.md).
