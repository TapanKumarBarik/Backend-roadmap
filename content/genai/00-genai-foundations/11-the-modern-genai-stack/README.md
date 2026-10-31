# Module 11: The Modern GenAI Stack

## Why this matters

Module 10 ended with a list of limitations mapped to the tracks that
solve them. This module assembles those solutions into the **architecture
that essentially every production GenAI system converges on** — and shows
you where each remaining track of this curriculum plugs in.

Two reasons to do this now rather than discovering it piecemeal:

1. **You'll recognize the shape everywhere.** Once you've seen the
   layers, every "how we built our AI feature" blog post becomes legible
   — you'll be able to tell which layer they're actually talking about
   and which ones they skipped.
2. **It prevents the most common architectural mistake**: reaching for
   the most complex layer first. A depressing number of teams build a
   multi-agent system for a problem a single well-grounded prompt would
   solve. The stack has a *natural order of escalation*, and knowing it
   is worth more than knowing any individual framework.

## Concepts

### The stack, bottom to top

```
 ┌──────────────────────────────────────────────────────────────┐
 │  7. OBSERVABILITY & EVALUATION            track 15           │
 │     tracing, evals, guardrails, cost monitoring              │
 │     ── wraps EVERYTHING below; not a final step ──           │
 ├──────────────────────────────────────────────────────────────┤
 │  6. ORCHESTRATION            tracks 11, 12                   │
 │     LangChain / LangGraph, multi-agent coordination          │
 ├──────────────────────────────────────────────────────────────┤
 │  5. AGENTS & TOOLS           tracks 10, 13                   │
 │     ReAct loop, function calling, MCP servers                │
 ├──────────────────────────────────────────────────────────────┤
 │  4. RETRIEVAL                tracks 08, 09                   │
 │     embeddings, vector DB, chunking, reranking, RAG          │
 ├──────────────────────────────────────────────────────────────┤
 │  3. PROMPTING                track 07                        │
 │     templates, few-shot, structured outputs, injection       │
 ├──────────────────────────────────────────────────────────────┤
 │  2. MODEL ACCESS             track 06                        │
 │     OpenAI / Anthropic / open-weight APIs, routing           │
 ├──────────────────────────────────────────────────────────────┤
 │  1. THE MODEL                tracks 02, 03, 04, 05           │
 │     transformer, weights, fine-tuning, the GPU it runs on    │
 ├──────────────────────────────────────────────────────────────┤
 │  0. SERVING                  track 14                        │
 │     vLLM, batching, KV cache  (only if self-hosting)         │
 └──────────────────────────────────────────────────────────────┘
```

Most application engineers work at layers 3-6 and *consume* 0-2 as an
API. That's a legitimate and common position — but the reason this
curriculum spends tracks 02-05 below the API line is that debugging
layers 3-6 constantly requires knowing what's underneath. "Why did my
retrieval miss?" is an embeddings question. "Why is this so slow?" is a
decode-phase question.

### The escalation ladder — start at the bottom rung

This is the most practically valuable idea in the module. Given a
problem, escalate only when the simpler thing demonstrably fails:

```
 1. PROMPT IT                      cost: ~nothing    latency: 1 call
    └─ can a well-written prompt do it?
              │ no
              ▼
 2. PROMPT + STRUCTURED OUTPUT     cost: ~nothing    latency: 1 call
    └─ do you just need reliable JSON out?
              │ no -- it needs facts it doesn't have
              ▼
 3. RAG                            cost: + vector DB latency: 2 calls
    └─ can you retrieve the missing information?
              │ no -- it needs to ACT, or use live data
              ▼
 4. TOOLS / SINGLE AGENT           cost: + N calls   latency: N calls
    └─ give it functions to call
              │ no -- genuinely separable sub-problems
              ▼
 5. MULTI-AGENT                    cost: expensive   latency: slow
    └─ last resort. Real coordination overhead and
       a much larger failure surface.

 ┌──────────────────────────────────────────────────────────────┐
 │ RULE OF THUMB: most production systems live at rungs 1-4.    │
 │ If you're at rung 5 and haven't proven 1-4 insufficient,     │
 │ you have almost certainly over-engineered.                   │
 └──────────────────────────────────────────────────────────────┘
```

### What a real RAG request actually looks like

Making one path concrete, since "the stack" stays abstract otherwise:

```
 USER: "What's our refund window for enterprise customers?"
   │
   ▼
 ┌─ 1. GUARDRAIL (in) ──────────── track 15 ─┐
 │    injection check, PII scan               │
 └────────────────┬───────────────────────────┘
                  ▼
 ┌─ 2. EMBED THE QUERY ─────────── track 08 ─┐
 │    query text ──► [0.21, -0.88, ...]       │
 └────────────────┬───────────────────────────┘
                  ▼
 ┌─ 3. VECTOR SEARCH ───────────── track 08 ─┐
 │    top-20 nearest chunks from the DB       │
 └────────────────┬───────────────────────────┘
                  ▼
 ┌─ 4. RERANK ──────────────────── track 09 ─┐
 │    cross-encoder narrows 20 ──► 4          │
 │    (and ORDERS them -- lost in the middle, │
 │     module 10, is a real design constraint)│
 └────────────────┬───────────────────────────┘
                  ▼
 ┌─ 5. ASSEMBLE THE PROMPT ─────── track 07 ─┐
 │    system prompt + 4 chunks + question     │
 │    + "cite sources; say so if not covered" │
 └────────────────┬───────────────────────────┘
                  ▼
 ┌─ 6. MODEL CALL ──────────────── track 06 ─┐
 │    temperature low; this is extraction     │
 └────────────────┬───────────────────────────┘
                  ▼
 ┌─ 7. GUARDRAIL (out) ─────────── track 15 ─┐
 │    are the citations real? schema valid?   │
 └────────────────┬───────────────────────────┘
                  ▼
              response
   ── every step traced and costed (track 15) ──

 note step 4's ordering and step 5's refusal instruction:
 both exist BECAUSE of specific module 10 limitations
```

Seven steps, two model calls, and only one of them is "ask the LLM." That
ratio is typical, and it's why "just call the API" underestimates the
work by an order of magnitude.

### Build vs. buy at each layer

| Layer | Default choice | Build your own when |
|---|---|---|
| Serving | Use an API | You need data residency, heavy volume, or a custom model |
| Model | Frontier API | Privacy/cost demands open weights, or you have a real fine-tuning dataset |
| Model access | Provider SDK | You need multi-provider routing/failover |
| Prompting | Plain strings + templates | Almost never needs a framework |
| Retrieval | pgvector if you already run Postgres | Scale or feature needs justify a dedicated vector DB |
| Agents | Direct API tool-calling loop | Rarely — frameworks help mostly at multi-agent scale |
| Orchestration | Nothing, at first | You have genuine branching/cycles/persistence needs |
| Observability | Adopt on day one | — |

Two opinions worth stating plainly, because they'll save you time:
**start without a framework** (write the loop by hand, which is why
track 10 comes before track 11), and **add observability first, not
last** — you cannot debug a nondeterministic multi-step system from
stack traces.

### Where the money and the latency go

```
 A TYPICAL RAG REQUEST

 latency                          cost
 ────────────────                 ─────────────
 embed query      ~30ms           embedding    $0.00001
 vector search    ~20ms           vector DB    ~fixed monthly
 rerank          ~100ms           rerank       $0.0001
 LLM call     ~800-3000ms  ◄──    LLM call     $0.001-0.05  ◄──
 guardrails       ~50ms           guardrail    $0.0001

 the LLM call dominates BOTH.
 optimizations that matter, in order:
   1. send fewer tokens (better retrieval, not more)
   2. use a smaller model where quality allows
   3. cache aggressively -- identical prompts are common
   4. stream, so time-to-FIRST-token is what users feel
```

Note item 1: the instinct to "give the model more context to be safe" is
usually wrong on all three of cost, latency, and quality (lost in the
middle, module 10).

## Reference

| Layer | Track | Key technologies |
|---|---|---|
| Serving | 14 | vLLM, TGI, Ollama, TensorRT-LLM |
| Model / training | 02-05 | PyTorch, Transformers, LoRA, CUDA |
| Model access | 06 | OpenAI SDK, Anthropic SDK, Hugging Face |
| Prompting | 07 | Templates, JSON schema, structured outputs |
| Retrieval | 08-09 | pgvector, Chroma, Pinecone, Qdrant, rerankers |
| Agents & tools | 10, 13 | Function calling, ReAct, MCP |
| Orchestration | 11, 12 | LangChain, LangGraph, CrewAI, AutoGen |
| Observability | 15 | LangSmith, Langfuse, OpenTelemetry, RAGAS |

| Question | Layer to look at |
|---|---|
| "It doesn't know our data" | Retrieval |
| "The JSON is malformed" | Prompting (structured outputs) |
| "It can't check inventory" | Agents & tools |
| "It's too slow" | Serving / model choice / token count |
| "It's too expensive" | Token count, model size, caching |
| "It's wrong sometimes" | Observability first — measure before fixing |
| "I can't tell what it did" | Observability (tracing) |

## Hands-on exercises

### 1. Locate the layer

For each symptom, name the layer and the track:

1. Responses cite documents that don't exist.
2. The model returns prose when you need JSON.
3. Answers are stale by six months.
4. p95 latency is 8 seconds.
5. Monthly bill tripled with no traffic change.
6. It answers general questions well but can't book a meeting.
7. Nobody can explain why one specific answer was wrong.

<details><summary>Answer</summary>

1. Retrieval + observability — grounding failed and nothing verified the
   citations (tracks 09, 15).
2. Prompting — structured outputs (track 07).
3. Retrieval — stale index or no re-indexing pipeline (track 09).
4. Serving/model choice/token count (tracks 14, 06) — measure first.
5. Token count, model choice, or a missing cache (tracks 06, 07). A
   common real cause: someone increased retrieved chunks "to be safe."
6. Agents & tools — it needs an action, not information (tracks 10, 13).
7. Observability — you can't debug what you didn't trace (track 15). This
   one is a *process* failure; the fix is instrumenting before you need
   it.
</details>

### 2. Walk the escalation ladder on real requirements

For each, name the lowest rung that would work, and justify:

1. "Rewrite support emails to be more polite."
2. "Answer questions about our 400-page employee handbook."
3. "Tell customers whether their order has shipped."
4. "Summarize this meeting transcript into action items with owners."
5. "Research a competitor, write a report, and have someone fact-check
   it before publishing."

<details><summary>Answer</summary>

1. **Rung 1** — pure transformation, everything needed is in the prompt.
2. **Rung 3 (RAG)** — 400 pages won't fit usefully in context, and
   stuffing it would be expensive and hit lost-in-the-middle. Retrieve
   the relevant sections.
3. **Rung 4 (tools)** — live data in an order system. No amount of
   retrieval over documents answers it; it needs an API call.
4. **Rung 1-2** — transformation plus structured output. The transcript
   is supplied; you want reliable JSON with owner fields.
5. **Rung 4, possibly 5.** Research needs tools (search), report writing
   is generation, fact-checking is verification. A single agent with a
   search tool plus a separate verification *pass* usually suffices —
   reach for genuine multi-agent only if those roles need independent
   state and long-running coordination. Note that "have someone
   fact-check" may well mean a human, which is rung 4 plus
   human-in-the-loop, not rung 5.
</details>

### 3. Cost-model a system before building it

```python
# Rough monthly cost model. Adjust prices to current rates.
requests_per_day = 5_000
prompt_tokens = 2_000        # system + 4 retrieved chunks + question
output_tokens = 300

price_in = 0.15 / 1_000_000   # $ per input token  (small model)
price_out = 0.60 / 1_000_000  # $ per output token

daily = requests_per_day * (prompt_tokens * price_in + output_tokens * price_out)
print(f"model cost:  ${daily:,.2f}/day   ${daily*30:,.2f}/month")

# now the "just add more context to be safe" version
for chunks in [4, 8, 16]:
    pt = 500 + chunks * 375
    d = requests_per_day * (pt * price_in + output_tokens * price_out)
    print(f"  {chunks:2d} chunks -> {pt:5d} prompt tokens -> ${d*30:,.2f}/month")
```

Run it. Then re-run with a frontier model's pricing (roughly 20-30x
higher). Write two sentences: which lever moves cost most, and why
"retrieve better, not more" is a cost argument as well as a quality one.

### 4. Reverse-engineer a real system

Pick a GenAI product you use — an IDE assistant, a customer-support bot,
a doc search tool. Write down which layers it must have, with evidence
from its observable behaviour:

- Does it cite sources? → retrieval layer
- Can it take actions? → tools layer
- Does it know about your files/data? → retrieval or tools
- Does it stream? → serving-level detail
- Does it ever say "I don't know"? → guardrails or good grounding

Produce a labeled diagram of your best guess at its architecture. Note
explicitly which parts you inferred versus which you can actually
observe — that distinction is the skill.

### 5. Design one system, three ways

Requirement: *"Employees can ask questions about internal engineering
docs and get cited answers."*

Write three one-paragraph architectures — a minimum viable version, a
production version, and an over-engineered version. For the third, name
specifically what each unnecessary component costs (money, latency,
failure modes, on-call burden).

The over-engineered one is the important exercise. Being able to
articulate what complexity *costs* is what lets you push back on it.

## Independent challenge

Produce an **architecture decision record (ADR)** for a real GenAI
feature you'd plausibly build.

Structure: the problem; where the task sits on module 09's reliability
gradient; which module 10 limitations apply; your chosen rung on the
escalation ladder *with the justification for why the rung below is
insufficient*; a layer-by-layer stack diagram; a cost model at expected
volume; the top three failure modes and detection for each; and what you
would measure to know it's working.

Keep it under two pages. If you can't justify the rung below being
insufficient, you've found your real architecture — build that instead.

## Common mistakes & troubleshooting

- **Starting at rung 5.** Multi-agent for a prompt-shaped problem is the
  signature GenAI over-engineering failure. Escalate on evidence.
- **Adding a framework before you have a problem it solves.** Write the
  loop by hand first — you'll understand the abstraction when you meet
  it, and you may not need it.
- **Leaving observability for later.** Nondeterministic multi-step
  systems cannot be debugged retroactively without traces. Day one.
- **Optimizing the wrong thing.** The LLM call dominates cost and
  latency; shaving 20ms off vector search while sending 8,000 unnecessary
  prompt tokens is backwards.
- **"More context is safer."** More cost, more latency, and measurably
  worse recall of mid-context information (module 10).
- **Treating retrieval as a solved commodity.** Most "the LLM is wrong"
  bugs are retrieval bugs. Tracks 08-09 are two full tracks for a reason.
- **Skipping the build-vs-buy question at every layer.** Self-hosting a
  vector DB or a model has real operational cost; pay it deliberately.

## Checkpoint quiz

1. Name the stack layers from serving to observability.
2. Why does observability wrap the whole stack rather than sitting on
   top of it?
3. State the escalation ladder's five rungs.
4. Which layer would you investigate for: stale answers, malformed JSON,
   inability to act?
5. In a typical RAG request, which step dominates cost and latency, and
   what are the top two optimizations?
6. Why does this curriculum teach agents (track 10) before frameworks
   (track 11)?
7. Why is "add more context to be safe" usually wrong on three separate
   counts?

<details><summary>Answers</summary>

1. Serving, model, model access, prompting, retrieval, agents & tools,
   orchestration, observability.
2. Because every layer needs tracing, evaluation, and cost measurement —
   a failure can originate anywhere, and in a nondeterministic multi-step
   system you cannot reconstruct what happened without instrumentation
   that was already running.
3. Prompt → prompt with structured output → RAG → tools/single agent →
   multi-agent.
4. Stale answers: retrieval (index freshness). Malformed JSON: prompting
   (structured outputs). Inability to act: agents & tools.
5. The LLM call, on both. Top optimizations: send fewer tokens (better
   retrieval rather than more), and use a smaller model where quality
   allows; then caching and streaming.
6. So the framework's abstractions are recognizable as things you already
   built by hand, rather than magic — and so you can judge whether you
   need the framework at all.
7. It costs more (tokens are billed), it's slower (more prefill, and
   `O(n²)` attention), and it's often *less* accurate because information
   in the middle of a long context is used less reliably (module 10).
</details>

## Further reading & sources

- [Emerging Architectures for LLM Applications (a16z, 2023)](https://a16z.com/emerging-architectures-for-llm-applications/) - the reference stack diagram this module's layering follows, with the vendor landscape at each layer.
- [What We Learned from a Year of Building with LLMs (O'Reilly, 2024)](https://www.oreilly.com/radar/what-we-learned-from-a-year-of-building-with-llms-part-i/) - hard-won practical lessons from practitioners; the tactical section maps almost one-to-one onto this module's common mistakes.
- [Building Effective Agents (Anthropic, 2024)](https://www.anthropic.com/research/building-effective-agents) - the clearest published statement of the escalation-ladder principle: start simple, add complexity only when it demonstrably improves outcomes. Read before track 10.
- [Your AI Product Needs Evals (Hamel Husain)](https://hamel.dev/blog/posts/evals/) - the argument for observability-and-evaluation-first, with concrete practice; the case for why layer 7 is not a final step.
- [OpenAI: Production best practices](https://platform.openai.com/docs/guides/production-best-practices) - latency, cost, caching and rate-limit guidance from the provider side.
- [Applied LLMs: what worked and what didn't](https://applied-llms.org/) - a practitioner-written companion to the O'Reilly piece, organized by operational, tactical and strategic concerns.
- [Anthropic: Model Context Protocol introduction](https://modelcontextprotocol.io/introduction) - where the tools layer is heading, and the subject of track 13.
- [LangChain: conceptual guide](https://python.langchain.com/docs/concepts/) - useful as a map of the orchestration layer's vocabulary, even if you decide not to adopt the framework.

## Next

[Module 12: What "AI Engineer" Actually Means](../12-what-ai-engineer-actually-means/README.md)
