# GenAI System Design Mock Interview: What Interviewers Look For

> **Prerequisites:** [Previous lesson: Deep-Dive Drills: Go Three Levels Deep on Any Component](../09-deep-dive-drills/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates preparing for AI and GenAI system design rounds, where the usual framework is applied to model-backed systems.

> [!NOTE]
> **In one line:** A GenAI design interview is **the normal 9-step framework with a model in the middle**, and interviewers look for control, evaluation and cost awareness.

> [!TIP]
> **The Golden Rule:** Treat the model as a slow, expensive, probabilistic dependency. Show how you evaluate it, bound it, secure it and pay for it.

---

## 1. What interviewers look for

| Signal | What it sounds like |
| :--- | :--- |
| Problem framing | Clarifies the task, users, quality bar, latency and privacy constraints before architecture |
| Retrieval and data | Chooses chunking, hybrid retrieval, permissions and freshness deliberately |
| Evaluation | Offline test set, metrics for retrieval and generation, online monitoring |
| Safety | Prompt-injection defences, PII handling, guardrails, refusal behaviour |
| Cost and latency | Token estimates, caching, routing, streaming, batching |
| Reliability | Fallback models, timeouts, degradation when the model is down |
| Judgment | Knows when not to use an LLM (rules or search may be enough) |

---

## 2. A 45-minute plan

1. **Clarify (5)**: task, users, data sources, who may see what, accuracy needs, latency, scale, languages.
2. **Estimate (5)**: requests per second, tokens per request, daily cost, vector storage.
3. **Architecture (10)**: gateway, retrieval, orchestration, model, guardrails, observability. Draw the request path.
4. **Deep dives (15)**: pick two from retrieval quality, permissions, evaluation, agent loop, cost control.
5. **Failure and safety (5)**: model outage, bad output, injection, data leakage.
6. **Summary (5)**: top trade-offs and a rollout plan (shadow, canary, A/B).

---

## 3. Prompts to practise

- Design an enterprise knowledge assistant with citations and permissions ([lesson 35](../../22-interview-design-problems/35-design-a-rag-knowledge-assistant/README.md)).
- Design an AI agent platform that calls tools safely ([lesson 36](../../22-interview-design-problems/36-design-an-enterprise-ai-agent-platform/README.md)).
- Design a customer-support copilot that drafts replies from tickets and a help centre.
- Design a code-review assistant that comments on pull requests.
- Design semantic search over product images and descriptions.
- Design a document-extraction pipeline that turns invoices into structured data with human review.

---

## 4. Typical follow-up questions

- *'How do you know the answers are good?'* Evaluation set, faithfulness checks, user feedback, and regression runs on every change.
- *'What if the model provider has an outage?'* Timeouts, retry budget, fallback to another model or a cached or search-only answer.
- *'A user pastes a malicious document.'* Treat content as data, no tool access from retrieved text, output validation.
- *'The bill doubled.'* Token budgets per tenant, caching, shorter context, routing easy requests to a smaller model.
- *'Can it leak another team's data?'* Permission filter in retrieval, per-tenant isolation, audit logs.
- *'When would you not use an LLM?'* When a deterministic rule, a lookup or classic search meets the need more cheaply and predictably.

---

## Choosing a model tier by difficulty

A simple router sends easy requests to a cheap model and hard ones to a stronger one, a standard cost lever.

```python
PRICES = {"small": 0.5, "large": 5.0}  # illustrative USD per million input tokens

def route(request):
    hard = request["needs_reasoning"] or request["tokens"] > 3000
    return "large" if hard else "small"

traffic = [
    {"tokens": 500, "needs_reasoning": False},
    {"tokens": 800, "needs_reasoning": False},
    {"tokens": 4000, "needs_reasoning": False},
    {"tokens": 600, "needs_reasoning": True},
] * 250

all_large = sum(r["tokens"] for r in traffic) * PRICES["large"] / 1e6
routed = sum(r["tokens"] * PRICES[route(r)] for r in traffic) / 1e6
print(f"all large: ${all_large:.2f}   routed: ${routed:.2f}")
```

Output (produced by running this exact code):

```text
all large: $7.38   routed: $5.91
```

Routing the easy half of the traffic to the small model cuts the bill by about a fifth in this illustration (the share of easy traffic sets the saving); always label such prices as assumptions.

---

## Common Mistakes

- Jumping to an LLM without asking whether a simpler method works.
- No evaluation plan.
- Ignoring permissions and injection.
- No token or cost estimate.
- No fallback when the model is unavailable.

---

## Practice Questions

<details>
<summary><strong>Q1: How is a GenAI interview different?</strong></summary>

The framework is the same, but you must also cover evaluation, safety, token cost and the model's non-determinism.

</details>

<details>
<summary><strong>Q2: What do you draw first?</strong></summary>

The request path: gateway, retrieval, prompt assembly, model, guardrails and logging, with where each failure is handled.

</details>

<details>
<summary><strong>Q3: How do you show cost awareness?</strong></summary>

Estimate tokens per request and per day, name the levers (caching, routing, shorter prompts) and set budgets.

</details>

<details>
<summary><strong>Q4: How do you handle the model being wrong?</strong></summary>

Ground answers in retrieved sources with citations, validate structured output, give an 'I don't know' path, and add human review for high-stakes cases.

</details>

<details>
<summary><strong>Q5: How do you roll out a model change safely?</strong></summary>

Offline evaluation first, then shadow traffic, a canary, and an A/B test with guardrail metrics, with quick rollback.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Framework | Same 9 steps, model in the middle |
| Signals | Framing, retrieval, evaluation, safety, cost, reliability, judgment |
| Plan | 5 clarify, 5 estimate, 10 architecture, 15 deep dives, 5 failures, 5 summary |
| Follow-ups | Quality, outage, injection, cost, leakage, when not to use an LLM |
| Rollout | Offline eval, shadow, canary, A/B |

---

## Further Reading

- Chip Huyen, *Designing Machine Learning Systems* and *AI Engineering*.
- [Revise GenAI System Design](../05-revise-genai-system-design/README.md) in this track.

---

## Next

Continue with [Behavioral Architecture Stories: STAR Answers for Design Decisions](../11-behavioral-architecture-stories/README.md).
