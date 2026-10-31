# Module 12: What "AI Engineer" Actually Means

## Why this matters

"AI Engineer" is a job title that barely existed before 2023 and is now
everywhere — attached to wildly different roles. Some postings want
someone who can fine-tune models on a GPU cluster; others want a backend
engineer who can call an API well. Both are called AI Engineer.

This module matters for two practical reasons:

1. **It tells you which parts of this curriculum you actually need
   deeply, and which you need only enough of to debug.** You do not need
   to be able to derive backpropagation to ship a good RAG system. You do
   need to know why retrieval missed.
2. **It calibrates what to build to demonstrate competence.** The gap
   between "I completed a course" and "I've shipped something that
   handles real inputs" is the entire hiring signal in this field right
   now, because there is no established credential.

If you're doing this curriculum to get better at your existing job rather
than change roles, this module is short — read the role boundaries and
move on to module 13.

## Concepts

### Three distinct roles that share the name

```
 ┌────────────────────────────────────────────────────────────────┐
 │  ML RESEARCHER / RESEARCH ENGINEER                             │
 │  builds and trains models from scratch                         │
 │  needs: maths, PyTorch internals, distributed training, papers │
 │  tracks: 02, 03, 04, 05 -- deeply                              │
 │  rare; usually a PhD-adjacent lab or frontier-model company     │
 ├────────────────────────────────────────────────────────────────┤
 │  ML / PLATFORM ENGINEER                                        │
 │  fine-tunes, serves, and operates models                       │
 │  needs: GPUs, serving stacks, quantization, MLOps              │
 │  tracks: 04, 05, 14 -- deeply; 06-09 -- working knowledge      │
 ├────────────────────────────────────────────────────────────────┤
 │  AI ENGINEER  ◄── what most postings mean, and what this       │
 │                   curriculum targets                            │
 │  builds PRODUCTS on top of existing models                     │
 │  needs: APIs, prompting, RAG, agents, evals, normal software   │
 │         engineering                                            │
 │  tracks: 06-13, 15 -- deeply; 01-05 -- enough to debug         │
 └────────────────────────────────────────────────────────────────┘
```

The third role is mostly **software engineering with a probabilistic
component**. The hard parts are not the model — they're the parts you
already recognize: system design, error handling, testing, cost control,
observability. What's new is that one component in the middle is
nondeterministic and occasionally confidently wrong, and everything
around it has to be designed for that.

### What the job actually involves day to day

Roughly, by time spent in a mature product team:

```
  data & retrieval work    ████████████████████  ~35%
    chunking, indexing, fixing why retrieval missed

  evaluation & iteration   ████████████          ~25%
    building evals, measuring changes, regression testing

  ordinary engineering     ██████████            ~20%
    APIs, queues, auth, deploys, on-call

  prompt work              ██████                ~12%
    less than outsiders expect; it's rarely the bottleneck

  model selection/tuning   ████                   ~8%
    picking models, cost/quality tradeoffs
```

The shape people find surprising: **prompting is a small slice.** Most
"the AI is wrong" bugs are retrieval bugs or evaluation gaps. This is
also why tracks 08, 09 and 15 are three of the longest tracks here.

### What transfers from normal engineering, and what doesn't

| Transfers directly | Genuinely new |
|---|---|
| API design, service boundaries | Nondeterministic components |
| Caching strategy | Token-based cost models |
| Observability and tracing | Evaluating free-form text output |
| Data pipelines | Semantic (not exact) retrieval |
| Cost/latency budgeting | Prompt injection as a threat model |
| Testing discipline | No exact-match assertions possible |
| Incident response | Failures that are silent and plausible |

If you're already a competent backend engineer, you're most of the way
there — which is exactly why this curriculum sits beside `backend/` and
`learn/` rather than replacing them. The right-hand column is the
delta, and it's what tracks 06-15 teach.

### The depth question: how much do you need to know?

A useful rule: **learn the layer below the one you work at, well enough
to debug it.**

```
 you work at        you must be able to reason about
 ─────────────────────────────────────────────────────────
 prompting     ──►  tokens, context windows, sampling
                    (tracks 01, 06)

 RAG           ──►  embeddings, similarity, chunking
                    (track 08) -- NOT how to train an
                    embedding model

 agents        ──►  tool schemas, the generation loop,
                    failure modes (tracks 08, 10)

 serving       ──►  the transformer, KV cache, GPU memory
                    (tracks 02, 05, 14)
```

You don't need to implement backpropagation. You do need to know why
`temperature=0` isn't reproducible, why your 400-page document can't go
in the prompt, and why the retrieved chunk was wrong. Tracks 01-05 exist
in this curriculum for exactly that reason — not to make you a
researcher.

### What actually demonstrates competence

There is no certification in this field that anyone respects yet. The
signal is shipped work, and specifically work that shows you handled the
*unglamorous* parts:

```
 WEAK SIGNAL                     STRONG SIGNAL
 ────────────────────────────────────────────────────────────
 "built a chatbot with           "built a RAG system; here's the
  LangChain"                      eval set, the retrieval
                                  accuracy before/after
                                  reranking, and the cost per
                                  query"

 a demo that works on            a system with a documented
 the happy path                  failure mode and how it's
                                 detected

 a prompt that got a good        a prompt with a versioned
 answer once                     regression suite

 "I know RAG"                    "here's why we chose 400-token
                                  chunks with 50-token overlap
                                  for this corpus"
```

The pattern: **measurement beats demos.** Anyone can produce a working
demo now — the model does the impressive part. What's scarce is someone
who can tell you how often it's wrong and what they did about it. That's
also why this curriculum's independent challenges keep asking for a
write-up with numbers rather than a running script.

## Reference

| Role | Core skills | Tracks to prioritize |
|---|---|---|
| AI Engineer (product) | APIs, RAG, agents, evals | 06-13, 15 |
| ML/Platform Engineer | Fine-tuning, serving, GPUs | 04, 05, 14 |
| ML Researcher | Architecture, training, maths | 02, 03, 04 |
| Backend eng. adding AI | Everything above the API line | 06, 07, 09, 15 |
| Data eng. adding AI | Ingestion, chunking, indexing | 08, 09 |

| If your job is | Learn deeply | Learn enough to debug |
|---|---|---|
| Building features on APIs | 06-11, 15 | 01, 02, 08 |
| Running models in-house | 05, 14, 04 | 02, 03 |
| Owning a RAG pipeline | 08, 09, 15 | 01, 07 |
| Building agent systems | 10, 11, 12, 13 | 06, 07, 15 |

## Hands-on exercises

### 1. Decode real job postings

Find five current "AI Engineer" postings. For each, classify which of the
three roles it actually describes, using the responsibilities section
rather than the title. Record the tell-tale phrases:

- "fine-tune", "training runs", "CUDA", "distributed" → ML/platform
- "RAG", "prompt", "LLM APIs", "agents", "evals" → AI engineer
- "novel architectures", "publications", "research" → researcher

Then note which tracks in this curriculum each posting maps to. You
should find most postings are the third box in the diagram — which tells
you where to spend your time.

### 2. Audit your own gap

Score yourself 1-5 on each, honestly:

- Calling LLM APIs and handling failures/retries
- Prompt design and structured outputs
- Embeddings and vector search
- Building and running evaluations
- Agent/tool-calling loops
- Cost and latency optimization
- Normal backend engineering

Now weight them: the last one is worth more than people assume, and
"building and running evaluations" is the most commonly missing and most
differentiating. Write your three lowest scores and the track that
addresses each.

### 3. Rewrite a weak claim into a strong one

Take these and rewrite each as a strong signal — inventing plausible
specifics you *would* have if you'd built it properly:

1. "Built a document Q&A bot."
2. "Used LangChain to make an agent."
3. "Improved our prompt."

<details><summary>Answer</summary>

The pattern is: state the decision, the measurement, and the tradeoff.

1. "Built document Q&A over 12k internal pages. Hybrid BM25 + vector
   retrieval; reranking lifted top-3 accuracy from 61% to 84% on a
   150-question eval set I labelled. p95 latency 1.8s at $0.004/query."
2. "Built a tool-calling agent (3 tools, hand-rolled ReAct loop — no
   framework) with a 6-step cap and per-run cost ceiling. Logged 400
   runs; 7% hit the step cap, which traced to one ambiguous tool
   description that I rewrote."
3. "Versioned the summarization prompt with a 60-example regression
   suite. The new version improved judged quality 3.4→4.1/5 and cut
   output tokens 30%, so cost fell 22% at equal volume."

Note that every strong version contains a number that could be wrong —
that's what makes it credible.
</details>

### 4. Map the curriculum to your goal

Write one sentence stating your goal (change roles / do your current job
better / build a specific product). Then mark each of the 17 tracks
**deep**, **working knowledge**, or **skim**, and justify the three you
marked skim.

Keep this. Re-read it when you're tempted to go down a rabbit hole four
tracks away from what you need.

## Independent challenge

Write the **portfolio project brief** you'll build by the end of this
curriculum — not the code, the brief.

It must include: the real problem and who has it; where it sits on module
09's reliability gradient; which module 10 limitations apply; the
escalation rung from module 11 and why the one below is insufficient; how
you'll evaluate it (the eval set, and how you'll build it); the three
metrics you'll report; and the failure mode you most expect.

Constraint: it must be something with **real, messy inputs** — not a
curated demo dataset. The whole signal is in how a system behaves on
input you didn't choose.

Revisit this brief at the end of each track and update it as you learn
what's actually possible. By track 15 you'll have both the skills and a
specified project; build it then.

## Common mistakes & troubleshooting

- **Trying to learn everything to research depth.** You'd never ship. Use
  the layer-below rule.
- **Skipping tracks 01-05 as "just theory."** They're the debugging
  vocabulary for everything above. You need them at working depth, not
  research depth.
- **Over-indexing on frameworks.** "Knows LangChain" is not a skill;
  "can build and measure a retrieval pipeline" is. Frameworks change
  yearly; the fundamentals here don't.
- **Building demos instead of measured systems.** The demo is the easy
  part now. Bring numbers.
- **Neglecting ordinary software engineering.** The most common failure
  in production GenAI systems is bad engineering around a fine model —
  no retries, no timeouts, no cost ceiling, no tracing.
- **Waiting to feel ready.** The field is ~3 years old at product level;
  nobody has ten years of experience. Shipping something measured puts
  you ahead of most.

## Checkpoint quiz

1. Name the three roles that share the "AI Engineer" title and the core
   distinction between them.
2. Which consumes more of an AI engineer's time: prompt work or
   retrieval/data work?
3. State the "layer below" rule for how deep to learn.
4. Name three things that transfer directly from backend engineering, and
   three that are genuinely new.
5. What distinguishes a weak portfolio claim from a strong one?
6. Why does this curriculum include tracks 02-05 if most AI engineers
   never train a model?

<details><summary>Answers</summary>

1. ML researcher (builds/trains novel models), ML/platform engineer
   (fine-tunes, serves and operates models), and AI engineer (builds
   products on top of existing models). The distinction is whether you
   create the model, operate it, or consume it.
2. Retrieval and data work — roughly 35% versus about 12% for prompting.
   Most "the AI is wrong" bugs are retrieval bugs.
3. Learn the layer directly below the one you work at well enough to
   debug it — not well enough to build it from scratch.
4. Transfers: API design, caching, observability, data pipelines, testing
   discipline, cost budgeting, incident response. New: nondeterministic
   components, token-based cost models, evaluating free-form text,
   semantic retrieval, prompt injection, silent plausible failures.
5. Measurement. A strong claim states a decision, a number, and a
   tradeoff; a weak one names a technology.
6. Because they are the debugging vocabulary for the layers above —
   knowing why retrieval missed, why output isn't reproducible, or why
   context is expensive all requires understanding tokens, attention and
   embeddings, even if you never run a training job.
</details>

## Further reading & sources

- [The Rise of the AI Engineer (Swyx, 2023)](https://www.latent.space/p/ai-engineer) - the essay that named the role and drew the boundary between it and ML engineering; still the clearest statement of what the job is.
- [What We Learned from a Year of Building with LLMs — Part II: Operational](https://www.oreilly.com/radar/what-we-learned-from-a-year-of-building-with-llms-part-ii/) - the day-to-day reality of the role from practitioners, including where the time actually goes.
- [Your AI Product Needs Evals (Hamel Husain)](https://hamel.dev/blog/posts/evals/) - makes the case that evaluation skill is the differentiating competence in this field; the single most useful thing to be good at.
- [AI Engineering (Chip Huyen, 2025)](https://www.oreilly.com/library/view/ai-engineering/9781098166298/) - the current book-length treatment of exactly this role; the closest thing to a textbook for the AI-engineer path.
- [Machine Learning Systems Design interview guide (Chip Huyen)](https://huyenchip.com/machine-learning-systems-design/toc.html) - free, and the best preparation for the system-design half of these interviews.
- [Anthropic: Building effective agents](https://www.anthropic.com/research/building-effective-agents) - notable for how much of it is engineering judgment rather than model knowledge, which is the point of this module.
- [Latent Space podcast](https://www.latent.space/podcast) - practitioner interviews; useful for calibrating what teams are actually building versus what's announced.

## Next

[Module 13: Setting Up Your Environment](../13-setting-up-your-environment/README.md)
