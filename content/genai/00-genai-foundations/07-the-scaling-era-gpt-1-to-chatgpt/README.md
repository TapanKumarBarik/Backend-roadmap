# Module 07: The Scaling Era — GPT-1 to ChatGPT

## Why this matters

Module 06 ended on a claim worth taking seriously: from 2018 to today,
the *architecture* barely changed. GPT-1 and GPT-4 are recognizably the
same design. What changed was **scale** — more parameters, more data,
more compute — plus one crucial non-scaling ingredient added at the very
end (alignment).

This module is the story of what scale bought, and it matters practically
for three reasons:

1. **It explains why prompting works at all.** "Few-shot prompting" —
   showing a model three examples in the prompt and having it generalize
   — was not designed. It *appeared* at GPT-3 scale and surprised the
   people who built it. Track 07's entire subject is a capability nobody
   engineered.
2. **It tells you what scaling will and won't fix.** A capability that
   emerged from scale may improve with a bigger model; a limitation
   that's structural (hallucination, knowledge cutoff) will not. Knowing
   which is which stops you from waiting for a model release to solve an
   architectural problem.
3. **ChatGPT was not a new model.** It was GPT-3.5 plus RLHF plus a chat
   UI. The lesson — that alignment and interface can matter more than raw
   capability — is the reason track 04 exists and why your product work
   in tracks 07-15 is not "just wrapping an API."

## Concepts

### The scale curve

```
 PARAMETERS (log scale)

 GPT-1   2018   117M   ▌
 BERT    2018   340M   ▌▌
 GPT-2   2019   1.5B   ▌▌▌▌
 GPT-3   2020   175B   ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌
 GPT-4   2023   undisclosed (widely believed >1T, likely MoE)

         └────────── ~1500x in two years ──────────┘

 TRAINING DATA
 GPT-1     ~5 GB    (BookCorpus, ~7000 books)
 GPT-2    ~40 GB    (WebText, outbound Reddit links)
 GPT-3   ~570 GB    (filtered Common Crawl + books + Wikipedia)
                     ~300 billion tokens
```

### GPT-1 (2018): pretrain once, fine-tune per task

The contribution was the **recipe**, not the size. Before it, each NLP
task got its own model trained on its own labeled dataset.

```
 OLD WAY                          GPT-1's WAY

 sentiment  ──► model A           ┌──────────────────────┐
 QA         ──► model B           │  PRETRAIN ONCE on    │
 NER        ──► model C           │  raw unlabeled text  │
 summarize  ──► model D           │  (self-supervised)   │
                                  └──────────┬───────────┘
 each needs its own                          │
 labeled dataset                 ┌───────────┼───────────┐
                                 ▼           ▼           ▼
                            fine-tune   fine-tune   fine-tune
                            sentiment      QA        summarize
                            (small labeled set each)
```

That "pretrain on raw text" step is only possible because next-token
prediction needs **no labels** — the text is its own supervision (module
03's self-supervised trick, at scale). Suddenly the entire internet
becomes training data.

### GPT-2 (2019): tasks without fine-tuning

GPT-2 scaled 13x and found something unexpected: it could do tasks
**zero-shot** — with no fine-tuning at all — just by being asked in the
right format. Append `"TL;DR:"` to an article and it summarizes.

The interpretation: if your training corpus is large and diverse enough,
it *already contains* examples of summarization, translation, and
question-answering as ordinary text. Learning to predict that text well
means learning to do those tasks.

GPT-2 is also the first major "we're not releasing the weights over
misuse concerns" moment — staged release, later fully published. Worth
knowing as the origin of the open-vs-closed weights debate you'll meet in
track 06.

### GPT-3 (2020): in-context learning emerges

100x bigger again, and the headline result was **few-shot / in-context
learning**: put examples in the prompt and the model generalizes from
them, with *no weight updates at all*.

```
 THE PROMPT                          WHAT'S HAPPENING

 Translate English to French:        ┌─────────────────────────┐
                                     │ no gradients            │
 sea otter    => loutre de mer       │ no fine-tuning          │
 cheese       => fromage             │ no weight change        │
 peppermint   => menthe poivree      │                         │
 plush toy    =>  ◄── model fills    │ the model INFERS the    │
                                     │ task from the pattern   │
                                     │ and continues it        │
                                     └─────────────────────────┘

 This is still just next-token prediction. Nothing else is
 happening. That is what makes it strange.
```

This deserves a beat: **nobody built this feature.** It is a side effect
of predicting text well at sufficient scale, and it is the foundation of
essentially all prompt engineering (track 07). The mechanism is still
actively researched.

### Emergent abilities — and the honest caveat

Some capabilities appear to switch on abruptly past a scale threshold
rather than improving smoothly.

```
 accuracy
   │                          ╭──────────  large model
   │                         ╱
   │                        ╱   ◄── "emergence": near-chance,
   │                       ╱         then suddenly not
   │   ────────────────╯
   │   small models: no better than random
   └────────────────────────────────────► scale
```

The important counterpoint, which you should hold alongside the claim:
[Schaeffer et al. (2023)](https://arxiv.org/abs/2304.15004) argue much
apparent emergence is an artifact of **discontinuous metrics**. Score a
multi-step arithmetic task as exact-match and you get a sharp jump; score
it on per-digit accuracy and the same runs show smooth improvement. The
capability was growing all along; the ruler was binary.

Practical upshot: be skeptical of "the next model will suddenly do X."
Sometimes true, often a measurement artifact.

### ChatGPT (2022): alignment, not capability

The base GPT-3 was capable but hard to use — it continued text rather
than following instructions, and would happily produce unhelpful or
harmful completions. **InstructGPT** applied RLHF (track 04) and the
result was dramatically more useful *without being fundamentally more
capable*.

```
 BASE MODEL (GPT-3)                 ALIGNED MODEL (InstructGPT/ChatGPT)

 prompt: "Explain the moon          prompt: "Explain the moon
          landing to a 6 year old"           landing to a 6 year old"

 output: "Explain the theory of     output: "People went to the moon
          gravity to a 6 year old.           in a big rocket! They
          Explain the big bang to            walked on it and brought
          a 6 year old..."                   back some rocks..."

 it CONTINUES the pattern           it FOLLOWS the instruction
 (correctly! that IS what           
  next-token prediction does)       same underlying capability,
                                    different objective
```

InstructGPT with **1.3B parameters was preferred by human raters over the
175B base GPT-3** — a 100x smaller model, better received, purely from
alignment. That result reframes the whole field: raw scale is not the
only axis, and it's why track 04 spends five modules on fine-tuning and
alignment.

Then ChatGPT wrapped it in a chat interface with conversation memory, and
reached 100 million users in two months. The interface was a genuine part
of the breakthrough, not a footnote.

### What scale did and didn't fix

| Improved with scale | Did NOT go away |
|---|---|
| Fluency and coherence | Hallucination (structural — module 00) |
| Few-shot / in-context learning | Knowledge cutoff (fixed data snapshot) |
| Reasoning on many benchmarks | No access to private/live data |
| Multilingual ability | Tokenization artifacts (track 01) |
| Code generation | `O(n²)` context cost (module 05) |
| Instruction following (via RLHF) | Sensitivity to prompt phrasing |

The right-hand column is the reason the rest of this curriculum exists.
RAG (track 09) exists because of the knowledge cutoff and private data.
Agents and MCP (tracks 10, 13) exist because models can't act on the
world. Evaluation and guardrails (track 15) exist because hallucination
didn't go away and won't.

## Reference

| Term | Means |
|---|---|
| Pretraining | Self-supervised next-token training on huge raw text |
| Fine-tuning | Further training on a smaller labeled/curated dataset |
| Zero-shot | Task performed from instruction alone, no examples |
| Few-shot / in-context learning | Task inferred from examples in the prompt, no weight updates |
| Emergent ability | Capability appearing abruptly past a scale threshold (contested) |
| RLHF | Reinforcement Learning from Human Feedback (track 04) |
| InstructGPT | The RLHF-aligned GPT-3 that became ChatGPT's basis |
| Alignment | Making a model follow intent, distinct from making it capable |
| Knowledge cutoff | The date after which the model has no training data |
| Scaling laws | Predictable loss-vs-scale relationships (track 04) |

| Task | Code |
|---|---|
| Load different model sizes | `AutoModel.from_pretrained("gpt2-medium")` |
| Compare parameter counts | `sum(p.numel() for p in model.parameters())` |
| Generate with a base model | `model.generate(**ids, max_new_tokens=40)` |
| Few-shot prompt | Put labeled examples in the prompt string itself |
| Check a model's knowledge cutoff | Ask it; then verify against a known recent event |

## Hands-on exercises

Install once: `pip install torch transformers`

### 1. Measure the scale curve yourself

```python
from transformers import AutoConfig

for name in ["gpt2", "gpt2-medium", "gpt2-large", "gpt2-xl"]:
    c = AutoConfig.from_pretrained(name)
    # rough parameter estimate from the config alone
    approx = 12 * c.n_layer * c.n_embd**2 + c.vocab_size * c.n_embd
    print(f"{name:12s} layers={c.n_layer:3d} d={c.n_embd:5d} "
          f"heads={c.n_head:3d}  ~{approx/1e6:7.0f}M params")
```

Note what grows and what doesn't. Then answer: GPT-3 has 96 layers and
d=12288 — plug those in and compare to the 175B figure. Is the estimate
in the right ballpark?

### 2. Watch few-shot learning work on a small model

```python
from transformers import pipeline

gen = pipeline("text-generation", model="gpt2-medium")

zero_shot = "Translate to French: cheese =>"
few_shot = """sea otter => loutre de mer
cheese => fromage
peppermint => menthe poivree
plush toy =>"""

for label, prompt in [("ZERO-SHOT", zero_shot), ("FEW-SHOT", few_shot)]:
    out = gen(prompt, max_new_tokens=8, do_sample=False,
              pad_token_id=50256)[0]["generated_text"]
    print(f"--- {label} ---\n{out}\n")
```

GPT-2-medium is far below the scale where this works reliably, so expect
mediocre output — that's the lesson. Then run the same two prompts
against a current frontier model (ChatGPT/Claude free tier is fine) and
compare. Write one paragraph on what the difference demonstrates about
scale, and note that the prompt was identical in both cases.

### 3. Verify the knowledge cutoff is real

Ask any chat LLM: "What is today's date?" and "Describe a major world
event from the last two months."

Record the answer and check it. Then write down: (a) what the model said
its cutoff was, (b) whether it correctly refused or hedged on recent
events, (c) whether any answer was confidently wrong.

This exercise is the entire motivation for track 09 (RAG) in three
minutes of work — you're establishing the problem RAG exists to solve.

### 4. Reproduce the base-vs-aligned difference

```python
from transformers import pipeline

base = pipeline("text-generation", model="gpt2-large")
prompt = "Explain the moon landing to a 6 year old in a few sentences."

out = base(prompt, max_new_tokens=60, do_sample=True, temperature=0.7,
           pad_token_id=50256)[0]["generated_text"]
print("BASE MODEL (no RLHF):\n", out)
```

GPT-2 is a *base* model — no instruction tuning, no RLHF. Observe whether
it follows the instruction or merely continues the text pattern. Then
give the identical prompt to ChatGPT/Claude and put the two outputs side
by side.

State clearly: is the difference you're seeing capability, or alignment?
Cite the InstructGPT result from the concepts section in your answer.

<details><summary>Answer</summary>

It's alignment, not capability. GPT-2-large frequently continues the
*pattern* of the prompt — generating more instruction-like sentences —
rather than obeying it, because pattern continuation is precisely what
next-token pretraining optimizes for. It is doing its job correctly.

The aligned model does the same underlying next-token prediction, but has
been further trained (SFT + RLHF, track 04) so that "helpful response to
the instruction" is the high-probability continuation. The InstructGPT
result — a 1.3B aligned model preferred over the 175B base — is the
cleanest evidence that these are separate axes.
</details>

### 5. Probe for the emergence artifact

```python
# A task scored two ways: strict exact-match vs. partial credit.
def strict(pred, truth):
    return float(pred == truth)

def partial(pred, truth):        # per-digit credit
    pred, truth = str(pred), str(truth)
    pred = pred.rjust(len(truth))[-len(truth):]
    return sum(a == b for a, b in zip(pred, truth)) / len(truth)

# imagine three model sizes producing these answers for 1234 + 5678 = 6912
answers = {"small": "1000", "medium": "6000", "large": "6912"}
for size, ans in answers.items():
    print(f"{size:7s} answer={ans:5s} "
          f"strict={strict(ans,'6912'):.2f}  partial={partial(ans,'6912'):.2f}")
```

Compare the two columns across sizes. Explain in one sentence how the
same underlying progress can look like a sudden jump or a smooth curve
purely depending on the metric — and why that should make you cautious
about emergence claims.

### 6. Sort capabilities from limitations

For each of the following, decide: will a bigger model plausibly fix
this, or is it structural?

1. The model doesn't know your company's internal pricing.
2. The model writes fluent but subtly wrong SQL.
3. The model can't tell you today's stock price.
4. The model miscounts the letters in "strawberry".
5. The model's answer changes when you rephrase the question.
6. The model can't send an email.

<details><summary>Answer</summary>

**Structural — scale will not fix:** (1) private data was never in
training — needs RAG, track 09. (3) live data, same reason plus
recency — needs tools, track 10. (4) tokenization artifact — the model
never sees letters, track 01. (6) no ability to act on the world — needs
tool calling / MCP, tracks 10 and 13.

**Plausibly improves with scale:** (2) code correctness has improved
substantially with scale, though it never reaches guaranteed
correctness — which is why track 15's evaluation exists. (5) prompt
sensitivity has decreased with scale and alignment but remains real.

The general rule: if the missing thing is *information the model never
had* or *an action it structurally cannot take*, scale is the wrong
lever. Reach for retrieval or tools instead.
</details>

## Independent challenge

Build a **capability-vs-scale report** using the four GPT-2 sizes
(`gpt2`, `gpt2-medium`, `gpt2-large`, `gpt2-xl` — all free, all run on
CPU, largest is ~6GB).

Design five prompts spanning difficulty: simple completion, factual
recall, a 3-shot pattern, simple arithmetic, and instruction-following.
Run every prompt against every model size with `do_sample=False` for
reproducibility. Score each output yourself on a 0-2 scale.

Deliverable: a 4×5 table plus two paragraphs — which capabilities improve
smoothly across sizes, which stay flat, and whether anything looks
"emergent." Then connect your findings to exercise 5: for anything that
looked like a jump, would a more granular metric have shown a smooth
curve?

## Common mistakes & troubleshooting

- **Believing scale fixes everything.** The right-hand column of the
  concepts table is why tracks 09-15 exist. Diagnose whether a problem is
  missing-information, missing-action, or missing-capability before
  reaching for a bigger model.
- **Confusing capability with alignment.** A base model that ignores your
  instruction is not less intelligent; it's differently optimized
  (exercise 4).
- **Taking emergence claims at face value.** Check whether the metric is
  discontinuous before concluding a capability "switched on."
- **Assuming few-shot examples are training.** No weights change. The
  examples occupy context (and cost tokens, track 01) and influence one
  forward pass only.
- **Testing prompting techniques on tiny models and concluding they don't
  work.** Most in-context learning behaviour requires scale; GPT-2 is not
  a fair test bed for track 07's techniques.
- **Forgetting the knowledge cutoff when evaluating.** A "wrong" answer
  about recent events is expected behaviour, not a model defect.

## Checkpoint quiz

1. What was GPT-1's actual contribution, given it wasn't size?
2. Why can pretraining use the entire internet while fine-tuning cannot?
3. What is in-context learning, and what makes it surprising?
4. What's the strongest argument *against* emergent abilities being real?
5. What did ChatGPT add to GPT-3.5, and what does the InstructGPT result
   show?
6. Name three limitations that scale did not remove, and the track that
   addresses each.

<details><summary>Answers</summary>

1. The pretrain-then-fine-tune recipe: pretrain once on raw unlabeled
   text, then adapt cheaply to many tasks — replacing one bespoke model
   per task.
2. Pretraining is self-supervised — the next token *is* the label, so any
   raw text works. Fine-tuning needs curated examples of the target
   behaviour, which must be produced by humans and is therefore scarce.
3. Inferring a task from examples placed in the prompt, with no weight
   updates. It's surprising because nobody designed it — it appeared as a
   side effect of scaling next-token prediction, and it's the foundation
   of prompt engineering.
4. That apparent emergence is often an artifact of discontinuous metrics
   (exact-match); measured with a granular metric, the same runs show
   smooth improvement (Schaeffer et al., 2023).
5. RLHF alignment plus a chat interface. InstructGPT showed a 1.3B
   aligned model beating the 175B base model in human preference —
   alignment and capability are separate axes, and alignment can be worth
   more than 100x scale.
6. Hallucination (track 15), knowledge cutoff and no private-data access
   (track 09, RAG), inability to act on the world (tracks 10 and 13,
   agents/MCP). Also acceptable: tokenization artifacts (track 01),
   `O(n²)` context cost (tracks 05/14).
</details>

## Further reading & sources

- [Improving Language Understanding by Generative Pre-Training (GPT-1, Radford et al., 2018)](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) - the pretrain-then-fine-tune recipe that started the line.
- [Language Models are Unsupervised Multitask Learners (GPT-2, Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - the zero-shot result and the argument that a diverse enough corpus already contains every task.
- [Language Models are Few-Shot Learners (GPT-3, Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - in-context learning, the paper that changed what "using a model" means. Section 3 is the capability survey.
- [Training language models to follow instructions with human feedback (InstructGPT, Ouyang et al., 2022)](https://arxiv.org/abs/2203.02155) - the alignment work behind ChatGPT, and the source of the 1.3B-beats-175B result.
- [Emergent Abilities of Large Language Models (Wei et al., 2022)](https://arxiv.org/abs/2206.07682) - the emergence claim, with the capability curves.
- [Are Emergent Abilities of Large Language Models a Mirage? (Schaeffer et al., 2023)](https://arxiv.org/abs/2304.15004) - the rebuttal from exercise 5; read both papers together or neither.
- [Scaling Laws for Neural Language Models (Kaplan et al., 2020)](https://arxiv.org/abs/2001.08361) - the predictable loss-vs-scale relationships that made these bets fundable; covered properly in track 04.
- [State of GPT (Andrej Karpathy, Microsoft Build 2023)](https://www.youtube.com/watch?v=bZQun8Y4L2A) - the clearest public walkthrough of the full pretraining to SFT to RLHF pipeline, by someone who was inside it.
- [On the Opportunities and Risks of Foundation Models (Stanford CRFM, 2021)](https://arxiv.org/abs/2108.07258) - the survey that named the "foundation model" paradigm this module describes.

## Next

[Module 08: How LLMs Actually Generate Text](../08-how-llms-actually-generate-text/README.md)
