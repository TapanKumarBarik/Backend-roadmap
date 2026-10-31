# Module 10: Limitations — Hallucination, Knowledge Cutoff, Reasoning

## Why this matters

Module 09 was the optimistic half. This is the other half, and it's the
more valuable one — because **every architectural decision in tracks
09-15 exists to work around something in this module.**

The framing that matters: these are not bugs awaiting a patch. Most are
direct consequences of how the system works, which you now understand
well enough to see for yourself:

- The model samples from a probability distribution (module 08) → it will
  always produce *something*, and "something" that is fluent is not
  therefore true.
- The weights are frozen at training time → there is no mechanism by
  which it could know today's date.
- It reads tokens, not characters (track 01) → it cannot count letters.

Knowing which limitations are structural saves you from two expensive
mistakes: waiting for a model upgrade to fix an architectural problem,
and writing ever-more-elaborate prompts against a wall.

## Concepts

### Hallucination: why it's structural

The model has exactly one operation: produce a probability distribution
over the next token and sample from it. It has **no separate mechanism
for "I don't know."**

```
 prompt: "The 1987 Nobel Prize in Physics was awarded to"

 the model MUST output a distribution over the vocabulary.
 there is no "abstain" token that means "I lack this fact."

 ┌──────────────────────────────────────────────────────┐
 │  a plausible NAME is the highest-probability          │
 │  continuation of this sentence shape --               │
 │  whether or not the model stored the real answer      │
 └──────────────────────────────────────────────────────┘
                        │
                        ▼
   fluent, grammatical, correctly-shaped, confident
                        │
                        ▼
              ... and possibly fabricated

 THE ASYMMETRY THAT MAKES IT DANGEROUS:

  correctness  ──►  learned from data, patchy, no self-awareness
  fluency      ──►  learned from data, near-perfect, always on

  the second is NOT evidence of the first, but humans read it
  as if it were (the ELIZA effect, module 02)
```

Refusal behaviour ("I don't have that information") is trained *in*
afterwards via alignment (module 07, track 04). It's a learned habit
layered on top, not a capability the base mechanism possesses — which is
why it's imperfect and why it can be prompted away.

There's also a formal result worth knowing: hallucination is
[provably inevitable](https://arxiv.org/abs/2401.11817) for any
computable LLM on certain classes of questions. This is not a temporary
engineering shortfall.

### Knowledge cutoff and the frozen-weights problem

```
    training data collected            model frozen        you, now
 ────────────────────────────────────────┬──────────────────────┬───►
                                         │                      │
                                    CUTOFF DATE            everything
                                                           after is
  the model knows:                                         INVISIBLE
   ✓ public text up to the cutoff
   ✗ anything after it
   ✗ your private documents (never in training)
   ✗ live data (prices, weather, inventory)
   ✗ what happened in this conversation yesterday

  no amount of scale fixes any of the ✗ rows -- they are
  about ACCESS, not capability
```

The failure mode is worse than ignorance: near the cutoff the model has
*partial* information, so it answers with outdated facts confidently
rather than declining.

**The fixes are architectural, not model-side:** retrieval for private
and recent documents (track 09), tool calls for live data (track 10),
MCP for standardized access to both (track 13).

### Reasoning: real, but shallower than it looks

LLMs solve genuinely difficult reasoning problems and fail on trivially
simple ones. The pattern is that they're strong where the reasoning
*resembles patterns in training data* and weak where it requires holding
a novel multi-step state.

Well-documented failure classes:

```
 1. ARITHMETIC on unfamiliar numbers
    "What is 3,847 x 2,913?"  -- fluent, wrong
    root cause: tokenization (numbers split oddly) + no calculator
    fix: give it a calculator (tool use, track 10)

 2. COUNTING and character-level work
    "How many r's in strawberry?"
    root cause: it sees tokens, never letters (track 01)
    fix: code execution, not prompting

 3. THE REVERSAL CURSE
    trained on "A is B" does NOT reliably give "B is A"
    "Who is Tom Cruise's mother?"        ✓ answered
    "Who is Mary Lee Pfeiffer's son?"    ✗ often fails
    root cause: it learned a directional token association,
                not a symmetric fact

 4. LOST IN THE MIDDLE
    accuracy on long contexts:
      ████████░░░░░░░░░░░░░░░░████████
      start        middle         end
      high           LOW           high
    information buried mid-context is measurably less used
    -- critical for RAG design (track 09)

 5. SELF-ASSESSMENT
    "How confident are you?" produces a fluent number that is
    only loosely related to actual correctness
```

**Reasoning models** (o1/o3-style, track 06) attack this by generating
long internal chains of thought before answering — spending inference
compute on deliberation. This measurably helps on maths and code. It does
not make the model's knowledge less frozen, and it does not eliminate
hallucination; it also costs far more per query.

### Nondeterminism and prompt sensitivity

Two practical limitations you'll hit within a day of building anything:

- Identical inputs can produce different outputs, even at
  `temperature=0` (module 08).
- Semantically identical prompts phrased differently produce materially
  different results. "Summarize this" vs. "Give me a summary" can differ
  in quality.

Both mean the usual software assumption — same input, same output — does
not hold. Track 15 exists because testing this class of system needs
different tools.

### The map from limitation to solution

```
 LIMITATION                      WHERE IT'S ADDRESSED
 ─────────────────────────────────────────────────────────
 no private data          ──►    RAG (track 09)
 knowledge cutoff         ──►    RAG + tools (tracks 09, 10)
 no live data             ──►    tool calling (track 10)
 can't act on the world   ──►    agents + MCP (tracks 10, 13)
 arithmetic / counting    ──►    code execution tools (track 10)
 hallucination            ──►    grounding, citations, evals (15)
 lost in the middle       ──►    chunking + reranking (tracks 08, 09)
 prompt sensitivity       ──►    prompt eval + versioning (07, 15)
 nondeterminism           ──►    structural assertions (track 15)
 O(n^2) context cost      ──►    serving optimizations (tracks 05, 14)

 EVERY REMAINING TRACK IS ON THIS LIST.
 That is the actual structure of this curriculum.
```

## Reference

| Term | Means |
|---|---|
| Hallucination | Fluent, confident, fabricated output |
| Intrinsic hallucination | Contradicts the source text provided |
| Extrinsic hallucination | Unverifiable against any provided source |
| Knowledge cutoff | Date after which the model has no training data |
| Reversal curse | "A is B" learned without "B is A" |
| Lost in the middle | Reduced use of information in mid-context positions |
| Calibration | Whether stated confidence matches actual accuracy |
| Grounding | Constraining answers to supplied source material |
| Reasoning model | Spends inference compute on chain-of-thought before answering |
| Prompt sensitivity | Output varying materially with paraphrased input |

| Failure | Correct fix |
|---|---|
| Wrong facts about your business | RAG (track 09) |
| Outdated facts | RAG or tools |
| Bad arithmetic | Code execution tool |
| Miscounting characters | Code execution tool |
| Made-up citations | Require quotes from supplied sources + verify |
| Flaky test assertions | Structural/semantic assertions (track 15) |

## Hands-on exercises

These reproduce each limitation firsthand. Use any chat model.

### 1. Induce a hallucination deliberately

Ask for something specific-sounding that almost certainly doesn't exist:

> "Summarize the key findings of the 2019 Henderson-Kowalski study on
> caffeine and short-term memory in software developers."

Record whether the model invents an abstract, authors, methodology, and
sample size — or correctly says it can't find such a study. Try it on two
different models.

Then try again with: *"Only answer if you are certain this study exists;
otherwise say you don't know."* Note whether that helps, and by how much.
Write one sentence on why prompting alone can't fully solve this.

### 2. Prove the reversal curse

```
Ask, in separate fresh conversations:
  A) "Who is [a well-known person]'s mother?"
  B) "Who is [the mother's name, from A]'s son?"
```

Pick someone famous whose parent is not themselves famous. The forward
direction usually works; the reverse often fails. Explain what this
reveals about whether the model stores *facts* or *directional token
associations*.

### 3. Measure lost-in-the-middle

```python
# Build a long context with one fact hidden at varying depths.
filler = "The weather in the region was mild and unremarkable. " * 60
secret = "The internal project codename is ORANGE-FALCON-7. "

for pos, label in [(0.0, "start"), (0.5, "middle"), (1.0, "end")]:
    parts = filler.split(". ")
    idx = int(len(parts) * pos)
    ctx = ". ".join(parts[:idx] + [secret] + parts[idx:])
    prompt = f"{ctx}\n\nWhat is the internal project codename?"
    print(f"--- fact at {label} ({len(prompt)} chars) ---")
    print(prompt[:120], "...\n")
    # send `prompt` to your model and record whether it answers correctly
```

Run each position 3 times and tabulate accuracy. Then state the direct
implication for how you'd order retrieved chunks in a RAG prompt
(track 09) — this is not a theoretical concern, it changes real designs.

### 4. Break arithmetic, then fix it with a tool

```python
import random
random.seed(0)
problems = [(random.randint(1000, 9999), random.randint(1000, 9999))
            for _ in range(5)]

for a, b in problems:
    print(f"What is {a} x {b}?   (true answer: {a*b})")
```

Ask the model each one. Record its accuracy. Then ask it to "write and
run Python to compute this" — or just note that `a*b` in Python is exact
and free.

Write one sentence on why this failure is a *tokenization and
architecture* problem rather than an intelligence problem, referencing
track 01.

### 5. Test calibration

Ask 10 factual questions where you know the answers — 5 easy, 5 genuinely
obscure. After each, ask the model to rate its confidence 0-100%.

Tabulate stated confidence against actual correctness. Well-calibrated
would mean 70%-confidence answers are right about 70% of the time.
Report what you find, and state the implication for building a system
that routes low-confidence answers to a human.

### 6. Measure prompt sensitivity

Ask the same question five ways:

```
1. "Summarize this text."
2. "Give me a summary of this text."
3. "TL;DR:"
4. "What are the key points?"
5. "Provide a concise summary of the following."
```

Same input text each time, `temperature=0`. Compare length, structure and
content. Write one sentence on what this means for a prompt you'd deploy
to production without testing alternatives.

### 7. Diagnose and fix: five bug reports

For each, say whether a bigger/newer model would fix it, and if not,
which track's technique is required:

1. "It doesn't know we renamed our product last month."
2. "It gave a customer a made-up discount code."
3. "It said our API has an endpoint that doesn't exist."
4. "It calculated the invoice total wrong."
5. "It gave a different answer to the same question in two tests."
6. "It ignored the important document we pasted at position 40 of 80."

<details><summary>Answer</summary>

1. **No** — after the cutoff, and internal anyway. RAG (track 09).
2. **No** — hallucination filling an expected slot. Ground it in real
   codes from a database, plus output validation (tracks 09, 15).
3. **No** — same class as 2, about your API. RAG over real API docs, plus
   verification against the actual schema.
4. **No** — arithmetic. Compute it in code, never generate it (track 10
   tool use). This should not go through the model at all.
5. **No** — nondeterminism is inherent (module 08). Fix the *test*:
   structural or semantic assertions (track 15).
6. **No** — lost in the middle. Rerank so the important chunk is near the
   start or end, and cut context length (tracks 08, 09).

The pattern: none are fixed by scale. All six need architecture around
the model. That's the module's whole thesis, and it's why the curriculum
continues past track 08.
</details>

## Independent challenge

Build a **limitation test suite** for a model you plan to use — a script
of 20 probes, roughly 3 per limitation in this module (hallucination,
cutoff, reversal, lost-in-middle, arithmetic, calibration, prompt
sensitivity), each with a known correct answer or an expected refusal.

Run it against two different models (a frontier one and a smaller/cheaper
one). Produce a comparison table of pass rates per limitation category.

Then write the recommendation you'd give a team: which model, for which
task types, with which guardrails required. Re-run this suite whenever
you change models — it's the beginning of the eval harness track 15
builds properly, and having it early is the difference between noticing a
regression and shipping one.

## Common mistakes & troubleshooting

- **Trying to prompt away hallucination.** "Don't make things up" reduces
  it and cannot eliminate it — there is no internal fact-check to
  invoke. Ground the model in supplied sources instead.
- **Assuming the next model release fixes structural limits.** Missing
  *information* and missing *actions* are not capability problems.
- **Trusting stated confidence.** It's generated text, not a calibrated
  probability (exercise 5).
- **Putting the most important context in the middle of a long prompt.**
  Measurably the worst position (exercise 3).
- **Letting the model do arithmetic.** Use a tool. Always. There's no
  upside to generated maths.
- **Writing exact-match tests against model output.** Guaranteed flake
  (module 08 exercise 7).
- **Assuming a long context window means you should fill it.** Longer
  contexts cost more, run slower, and dilute attention. Retrieve less,
  better.

## Checkpoint quiz

1. Why is hallucination structural rather than a fixable bug?
2. What's the difference between intrinsic and extrinsic hallucination?
3. Why can't scale fix the knowledge cutoff?
4. What is the reversal curse, and what does it suggest about how facts
   are stored?
5. What is "lost in the middle," and how should it change a RAG prompt?
6. Why is an LLM bad at counting letters in a word?
7. Name three limitations and the track that addresses each.
8. Why is a model's stated confidence unreliable?

<details><summary>Answers</summary>

1. The model's only operation is producing and sampling from a
   distribution over next tokens — it has no abstain mechanism and no
   internal check distinguishing a stored fact from a plausible
   continuation. Fluency and correctness are learned separately, and the
   first is far more reliable than the second.
2. Intrinsic contradicts source material provided in the prompt;
   extrinsic is unverifiable against any provided source (usually a
   fabricated external fact).
3. The cutoff is about *access to information*, not capability. Weights
   are frozen at training time; no amount of scale gives a model data
   that postdates it or was never public.
4. Training on "A is B" doesn't reliably produce "B is A." It suggests
   the model learns directional token associations rather than symmetric
   relational facts.
5. Measurably reduced use of information positioned in the middle of a
   long context. In RAG, put the most relevant retrieved chunks at the
   start or end, and keep total context shorter rather than longer.
6. It never sees letters — text is tokenized into word-pieces before the
   model sees anything, so individual characters aren't in its input
   (track 01).
7. Any three from the map: private data → RAG (09); live data → tools
   (10); acting on the world → agents/MCP (10, 13); arithmetic → code
   tools (10); hallucination → evals/guardrails (15); nondeterminism →
   structural assertions (15).
8. It's generated text produced by the same next-token process as the
   answer, not a computed probability, so it is only loosely correlated
   with actual correctness.
</details>

## Further reading & sources

- [Survey of Hallucination in Natural Language Generation (Ji et al., 2022)](https://arxiv.org/abs/2202.03629) - the standard reference, and the source of the intrinsic/extrinsic taxonomy used here.
- [Hallucination is Inevitable: An Innate Limitation of Large Language Models (Xu et al., 2024)](https://arxiv.org/abs/2401.11817) - the formal argument that no computable LLM can eliminate hallucination; read it before promising a stakeholder a fix.
- [Lost in the Middle: How Language Models Use Long Contexts (Liu et al., 2023)](https://arxiv.org/abs/2307.03172) - the paper behind exercise 3, with the U-shaped accuracy curves. Required reading before designing a RAG prompt.
- [The Reversal Curse: LLMs trained on "A is B" fail to learn "B is A" (Berglund et al., 2023)](https://arxiv.org/abs/2309.12288) - exercise 2's source, including the Tom Cruise example.
- [Language Models (Mostly) Know What They Know (Kadavath et al., Anthropic, 2022)](https://arxiv.org/abs/2207.05221) - the more optimistic side of the calibration question in exercise 5; worth reading against your own results.
- [Faith and Fate: Limits of Transformers on Compositionality (Dziri et al., 2023)](https://arxiv.org/abs/2305.18654) - a careful account of why multi-step reasoning degrades, including the multiplication failures from exercise 4.
- [GPT-4 Technical Report (OpenAI, 2023)](https://arxiv.org/abs/2303.08774) - section 2 on limitations is unusually candid about hallucination and calibration, including how RLHF *worsened* calibration.
- [Anthropic: Reduce hallucinations](https://docs.anthropic.com/en/docs/test-and-evaluate/strengthen-guardrails/reduce-hallucinations) - the practical mitigation checklist, and a preview of track 15's techniques.

## Next

[Module 11: The Modern GenAI Stack](../11-the-modern-genai-stack/README.md)
