# Revise GenAI System Design: RAG, Evaluation, Guardrails and Cost

> **Prerequisites:** [Previous lesson: Revise Reliability and Security Patterns: Breakers, DR, RTO/RPO, OAuth](../04-revise-reliability-and-security-patterns/README.md).
> **Estimated Reading Time:** 12–15 minutes
> **Target Audience:** Candidates revising the GenAI patterns interviewers now ask about: RAG, evaluation, guardrails, cost and agents.

> [!NOTE]
> **In one line:** A GenAI system is an ordinary distributed system with a **slow, expensive and non-deterministic component** in the middle, so most of the design is controlling it.

> [!TIP]
> **The Golden Rule:** Measure quality with an evaluation set before you change anything, put permissions in retrieval not the prompt, and bound cost and latency with budgets and caches.

---

## 1. The architecture to draw

1. **Gateway**: auth, rate limits, per-tenant budgets, routing and fallbacks across models and providers.
2. **Orchestration**: build the prompt, call retrieval and tools, call the model, parse and validate the output.
3. **Retrieval (RAG)**: chunk and embed documents, hybrid search (keyword plus vector), re-rank, filter by permissions.
4. **Model layer**: hosted API or self-hosted inference with batching, KV-cache and quantisation.
5. **Guardrails**: input and output checks (PII, safety, prompt injection, schema validation).
6. **Observability and evaluation**: traces of every step, token and cost metrics, an offline evaluation suite, online feedback.

---

## 2. RAG decisions

| Decision | Options | Guidance |
| :--- | :--- | :--- |
| Chunking | Fixed size, structure-aware | Respect headings; 300 to 800 tokens with overlap; tune on an eval set |
| Retrieval | Vector, keyword, hybrid | Hybrid plus a re-ranker; keyword for names and codes |
| Permissions | Prompt rule or index filter | Filter in the retrieval query so forbidden text never reaches the model |
| Freshness | Re-index on change | Incremental sync with change tokens |
| Grounding | Cite sources, say unknown | Require citations, check support, threshold on relevance |

RAG versus fine-tuning: RAG injects fresh, private knowledge at request time and keeps access control simple; fine-tuning changes style and skills, not facts you must keep current.

---

## 3. Latency, cost and capacity

- **Two phases of latency**: *prefill* (processing the prompt, parallel, compute bound) and *decode* (generating tokens one by one, memory-bandwidth bound). Time to first token depends on prompt length; total time grows with output length. Stream tokens.
- **Cost** is roughly input tokens times input price plus output tokens times output price. Output is usually priced several times higher than input.
- **Levers**: shorter prompts and fewer chunks, prompt caching of static prefixes, response caching for repeated questions, a smaller model for easy requests (routing), batching, and limiting output length.
- **KV-cache** memory per token times context length times concurrent requests often limits throughput, not compute.

---

## 4. Evaluation, safety and agents

- **Evaluation**: a labelled set of real questions; measure retrieval (recall at k) and generation (faithfulness, relevance, format) separately; use LLM-as-judge with human spot checks; run it on every prompt, model or index change; monitor online.
- **Guardrails**: treat retrieved and tool text as untrusted data (prompt injection); validate structured output against a schema; redact PII; refuse out-of-policy requests.
- **Agents**: a loop of model decides, tool runs, result returns. Control with step and token budgets, scoped credentials, a tool gateway with policy, human approval for risky actions, and a full trace for replay.

---

## Estimating the cost of a request

Token arithmetic is the most common GenAI estimate in interviews; this makes it explicit and shows what caching a static prefix saves.

```python
def cost(input_tokens, output_tokens, in_price=3.0, out_price=15.0, cached_tokens=0, cached_price=0.3):
    # prices are USD per million tokens
    fresh = input_tokens - cached_tokens
    return (fresh * in_price + cached_tokens * cached_price + output_tokens * out_price) / 1e6

plain = cost(6000, 400)
cached = cost(6000, 400, cached_tokens=4000)
print(f"plain:  ${plain:.4f} per request")
print(f"cached: ${cached:.4f} per request")
print(f"per million requests: ${plain * 1e6:,.0f} vs ${cached * 1e6:,.0f}")
```

Output (produced by running this exact code):

```text
plain:  $0.0240 per request
cached: $0.0132 per request
per million requests: $24,000 vs $13,200
```

Caching a 4,000 token static prefix cuts the input cost sharply, which at a million requests saves thousands of dollars; the prices shown are illustrative, so always say that you assumed them.

---

## Common Mistakes

- Hiding restricted data with a prompt instruction instead of filtering at retrieval.
- No evaluation set, so every change is judged by feel.
- Ignoring output-token price and latency.
- Stuffing the context with many marginal chunks.
- Giving agents broad credentials with no budgets.

---

## Practice Questions

<details>
<summary><strong>Q1: RAG or fine-tuning for company knowledge?</strong></summary>

RAG: knowledge changes, must be permissioned and cited, and retrieval is cheaper to update than retraining. Fine-tune for style or task skills.

</details>

<details>
<summary><strong>Q2: How do you reduce LLM cost?</strong></summary>

Shorter prompts, fewer and better chunks, prompt and response caching, model routing, and limiting output length.

</details>

<details>
<summary><strong>Q3: How do you evaluate a RAG system?</strong></summary>

A labelled question set; measure retrieval recall and answer faithfulness separately, then run it for every change.

</details>

<details>
<summary><strong>Q4: What is prompt injection and the defence?</strong></summary>

Untrusted text (documents, web pages, tool output) containing instructions that hijack the model. Treat it as data, use least-privilege tools, require approval for risky actions and filter outputs.

</details>

<details>
<summary><strong>Q5: Why is decode slower than prefill?</strong></summary>

Decode generates one token at a time and is limited by memory bandwidth reading the weights and KV-cache, while prefill processes many tokens in parallel.

</details>

<details>
<summary><strong>Q6: How do you keep an agent from running away?</strong></summary>

Step, token, time and cost budgets, loop detection, a kill switch and approvals for destructive actions.

</details>

---

## One-Page Cheat Sheet

| Topic | Remember |
| :--- | :--- |
| Pipeline | Gateway, orchestration, retrieval, model, guardrails, observability |
| RAG | Structure-aware chunks, hybrid search, re-rank, ACL filter, citations |
| Latency | Prefill versus decode; stream; prompt length drives TTFT |
| Cost | Input x price + output x price; cache, route, shorten |
| Evaluation | Labelled set, retrieval and generation separately |
| Safety | Injection defences, schema validation, PII redaction, budgets |

---

## Further Reading

- Anthropic, *Building effective agents* and the prompt caching documentation.
- Chip Huyen, *AI Engineering* (O'Reilly, 2025), chapters on RAG, evaluation and inference optimisation.

---

## Next

Continue with [Build a Trade-off Library for System Design Interviews](../06-build-a-trade-off-library-for-system-design-interviews/README.md).
