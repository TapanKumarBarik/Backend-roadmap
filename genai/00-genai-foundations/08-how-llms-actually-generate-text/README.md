# Module 08: How LLMs Actually Generate Text

## Why this matters

Everything so far has been *how the model was built*. This module is
**what happens when you press enter** — the loop that runs every single
time you call an API, and the three or four parameters that control it.

This is the highest-leverage module in track 00, because these parameters
are the ones you will actually tune in production and the ones most
commonly misunderstood:

- **`temperature` is not a "creativity" dial.** It's a division applied
  to the logits before softmax. Knowing that tells you exactly why
  `temperature=0` doesn't guarantee identical outputs, and why cranking
  it to 2.0 produces word salad rather than brilliance.
- **Streaming isn't a UI trick.** Tokens genuinely arrive one at a time
  because the model genuinely computes them one at a time. That's also
  why the *first* token is slow and the rest are fast (track 14's prefill
  vs. decode).
- **Cost and latency are per-token, in both directions.** Understanding
  the loop is understanding your bill.

Get this module right and half of track 07 (prompting) and track 14
(serving) become obvious rather than mysterious.

## Concepts

### The autoregressive loop

```
 prompt: "The capital of France is"
     │
     ▼
 ┌─────────────────────────────────────────────────────┐
 │  1. tokenize            [464, 3139, 286, 4881, 318] │
 │  2. forward pass through all N layers               │
 │  3. take the LAST position's output vector          │
 │  4. project to vocabulary -> LOGITS (raw scores)    │
 │  5. logits -> probabilities (softmax)               │
 │  6. SAMPLE one token                                │
 │  7. append it to the input                          │
 └───────────────────────┬─────────────────────────────┘
                         │
        ┌────────────────┘
        │  repeat with "The capital of France is Paris"
        │  and again, and again...
        ▼
   stop when: an end-of-sequence token is sampled,
              max_tokens is reached, or a stop string appears

  N tokens out = N full forward passes. This is why output
  tokens cost more than input tokens on most APIs.
```

The model is **stateless** between calls. It does not "remember" your
conversation — the entire history is re-sent and re-processed every turn.
That's the whole mechanism behind chat memory, and the reason a long
conversation gets progressively slower and more expensive.

### Logits: the raw output before anything is decided

The model's actual output is a vector of **logits** — one unnormalized
real number per vocabulary token. Not probabilities yet.

```
 token        logit      after softmax
 ─────────────────────────────────────
 " Paris"      8.2   ──►    0.87
 " located"    5.1   ──►    0.04
 " a"          4.8   ──►    0.03
 " Lyon"       3.2   ──►    0.01
 " banana"    -4.7   ──►    0.0000002
 ... 50,000 more                        sums to 1.0
```

Everything you can control about generation is a transformation applied
between "logits" and "pick one."

### Temperature: dividing the logits

```
 logits / temperature, THEN softmax

  T = 0.1  (cold)         T = 1.0  (raw)         T = 2.0  (hot)
  ──────────────          ──────────────         ──────────────
  Paris    0.999          Paris    0.87          Paris    0.45
  located  0.001          located  0.04          located  0.16
  a        0.000          a        0.03          a        0.14
  Lyon     0.000          Lyon     0.01          Lyon     0.10
  banana   0.000          banana   ~0            banana   0.02  ◄─ !

  ██████████████▏         ███████████▏           █████▏
  near-deterministic      the model's true       flattened; nonsense
  always the top token    distribution           becomes reachable
```

Low temperature **sharpens** the distribution (the rich get richer). High
temperature **flattens** it, giving unlikely tokens a real chance. It
does not add creativity — it adds *randomness*, and at high enough values
that randomness is indistinguishable from noise.

`temperature=0` means "always take the argmax" (greedy decoding).

### Top-k and top-p: truncating before sampling

Temperature reshapes the whole distribution. Truncation methods instead
**delete** the tail entirely, which is usually what you actually want —
you'd like variety among *plausible* tokens, not a 2% chance of "banana."

```
 TOP-K (k=3): keep the 3 highest, renormalize

   Paris 0.87 ┐
   located 0.04├─ keep         a 0.03, Lyon 0.01, ... ──► DELETED
   a     0.03 ┘

 TOP-P / NUCLEUS (p=0.9): keep the smallest set summing to 0.9

   Paris   0.87  ── running total 0.87
   located 0.04  ── running total 0.91  ◄── crossed 0.9, STOP
   ─────────────────────────────────────
   everything below is deleted

   the crucial difference: the SET SIZE ADAPTS
   ┌──────────────────────────────────────────────────┐
   │ confident step ("capital of France is") -> keeps  │
   │   maybe 2 tokens                                 │
   │ uncertain step ("she opened the ___") -> keeps    │
   │   maybe 40 tokens                                │
   └──────────────────────────────────────────────────┘
   top-k can't do this: k=3 is 3 tokens whether the
   model is certain or has no idea
```

Top-p (nucleus sampling) is the modern default for exactly that adaptive
property. Most APIs let you set temperature and top-p together;
**changing both at once makes results hard to reason about** — the usual
advice is to tune one and leave the other at its default.

### Why `temperature=0` still isn't fully deterministic

A frequent and legitimate source of confusion. Greedy decoding is
deterministic *in principle*, but in practice:

- Floating-point addition isn't associative, and GPU kernels sum in
  nondeterministic order depending on batching. Two logits that tie to
  within 1e-7 can swap places between runs.
- Providers batch your request with others; batch composition changes
  numerics.
- Mixture-of-Experts models (track 03) route tokens to experts in a way
  that can depend on batch contents.
- The provider may silently update the model behind the same name.

Practical implication for track 15: **never write a test that asserts an
exact LLM output string.** Assert on structure, schema, or a semantic
check instead.

### Stopping, and the two phases of a request

```
 PREFILL                          DECODE
 ─────────                        ──────
 process the entire prompt        generate tokens one at a time
 in ONE parallel pass             each needs a full forward pass

 [464, 3139, 286, 4881, 318]      ──► " Paris"  ──► " ,"  ──► " the"
  ▼    ▼    ▼    ▼    ▼               (one pass each, serial)
 all at once, GPU saturated

 cost: scales with prompt length   cost: scales with output length
 latency: "time to first token"    latency: "tokens per second"
```

This split is why a long prompt costs you once but a long *output* costs
you per token, and why the two are priced differently. Track 14 is
essentially a whole track about optimizing the decode phase.

## Reference

| Term | Means |
|---|---|
| Autoregressive | Each output token becomes part of the next input |
| Logits | Raw unnormalized scores, one per vocabulary token |
| Softmax | Converts logits to probabilities summing to 1 |
| Greedy decoding | Always take the highest-probability token (`temperature=0`) |
| Temperature | Divides logits before softmax; <1 sharpens, >1 flattens |
| Top-k | Keep only the k highest-probability tokens |
| Top-p / nucleus | Keep the smallest set whose probabilities sum to p |
| EOS token | End-of-sequence; signals the model is done |
| Stop sequence | A string that halts generation when produced |
| Prefill | The single parallel pass over the prompt |
| Decode | The serial per-token generation phase |
| Beam search | Track multiple candidate sequences; rare for chat LLMs |

| Task | Code |
|---|---|
| Get raw logits | `model(**ids).logits[0, -1]` |
| Logits to probabilities | `torch.softmax(logits, dim=-1)` |
| Apply temperature | `torch.softmax(logits / temp, dim=-1)` |
| Greedy pick | `torch.argmax(logits)` |
| Sample | `torch.multinomial(probs, num_samples=1)` |
| Top-k filter | `torch.topk(logits, k)` |
| Generate (HF) | `model.generate(**ids, temperature=0.7, top_p=0.9)` |
| Generate (OpenAI) | `client.chat.completions.create(..., temperature=0.7)` |

## Hands-on exercises

Install once: `pip install torch transformers`

### 1. See the raw logits

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

tok = AutoTokenizer.from_pretrained("gpt2")
model = AutoModelForCausalLM.from_pretrained("gpt2")

ids = tok("The capital of France is", return_tensors="pt")
logits = model(**ids).logits[0, -1]          # last position only

print("logit vector shape:", logits.shape)   # one score per vocab token
probs = torch.softmax(logits, dim=-1)

top = torch.topk(probs, 8)
for p, i in zip(top.values, top.indices):
    print(f"  {p.item():.4f}  {tok.decode([i])!r}")
print("\nprobabilities sum to:", probs.sum().item())
```

Confirm the sum is 1.0. Note the shape — the model produces a score for
*every* token in the vocabulary on every single step.

### 2. Watch temperature reshape the distribution

```python
import torch

def show(logits, tok, temp, k=6):
    probs = torch.softmax(logits / temp, dim=-1)
    top = torch.topk(probs, k)
    bar = lambda p: "█" * int(p * 40)
    print(f"\n--- temperature = {temp} ---")
    for p, i in zip(top.values, top.indices):
        print(f"  {p.item():.4f} {bar(p.item()):<40} {tok.decode([i])!r}")

for t in [0.1, 0.5, 1.0, 1.5, 2.0]:
    show(logits, tok, t)
```

Watch the bars flatten as temperature rises. Answer: at which temperature
does the top token stop being an overwhelming favourite, and what does
that imply for a task where you need a *correct* answer rather than a
varied one?

### 3. Implement the generation loop yourself

No `generate()` — write the loop from the diagram.

```python
import torch

def my_generate(prompt, max_new_tokens=25, temperature=1.0, top_k=None, seed=0):
    torch.manual_seed(seed)
    ids = tok(prompt, return_tensors="pt")["input_ids"]

    for _ in range(max_new_tokens):
        logits = model(ids).logits[0, -1]           # 1-4: forward + logits

        if temperature == 0:                        # greedy
            nxt = torch.argmax(logits).view(1, 1)
        else:
            logits = logits / temperature
            if top_k:                               # truncate the tail
                kth = torch.topk(logits, top_k).values[-1]
                logits[logits < kth] = -float("inf")
            probs = torch.softmax(logits, dim=-1)   # 5: normalize
            nxt = torch.multinomial(probs, 1).view(1, 1)   # 6: sample

        ids = torch.cat([ids, nxt], dim=1)          # 7: append
        if nxt.item() == tok.eos_token_id:
            break
    return tok.decode(ids[0])

print(my_generate("The capital of France is", temperature=0))
print(my_generate("Once upon a time", temperature=0.8, top_k=50))
```

This is genuinely the whole algorithm. Run the greedy version twice and
confirm it's identical; run the sampled version with different seeds and
confirm it isn't.

### 4. Prove greedy decoding degenerates

```python
print(my_generate("The best way to learn programming is",
                  max_new_tokens=60, temperature=0))
```

Greedy decoding very often falls into a repetition loop. Explain why, in
terms of the autoregressive loop: what happens once the model emits a
phrase that makes the same phrase the most likely continuation?

<details><summary>Answer</summary>

Greedy decoding creates a feedback loop. Each generated token is appended
and becomes context for the next step, so if the model emits a phrase
whose most-likely continuation is that same phrase, it will deterministically
emit it again — and now the context contains two copies, making a third
even more likely. There is no randomness to escape the cycle.

This is exactly why sampling exists. It's also why production APIs expose
`frequency_penalty` / `presence_penalty` (which subtract from the logits
of already-used tokens) and why `temperature=0` is right for extraction
and classification but wrong for anything long-form.
</details>

### 5. Compare top-k against top-p on confident vs. uncertain steps

```python
import torch

def keep_counts(prompt, p=0.9, k=50):
    ids = tok(prompt, return_tensors="pt")
    probs = torch.softmax(model(**ids).logits[0, -1], dim=-1)
    srt, _ = torch.sort(probs, descending=True)
    n_p = int((torch.cumsum(srt, 0) < p).sum().item()) + 1
    return n_p, k

for prompt in ["The capital of France is",
               "2 + 2 =",
               "She opened the door and saw",
               "My favourite colour is"]:
    n_p, n_k = keep_counts(prompt)
    print(f"top-p keeps {n_p:5d} | top-k keeps {n_k:5d} | {prompt!r}")
```

The top-p column varies with the model's certainty; the top-k column
never does. Write one sentence on why that adaptivity is the reason
nucleus sampling became the default.

### 6. Confirm the model is stateless

```python
a = my_generate("Q: What is 2+2?\nA:", max_new_tokens=10, temperature=0)
print(a)

# a "conversation" is just a longer string -- nothing is remembered
convo = "Q: What is 2+2?\nA: 4\nQ: What did I just ask?\nA:"
print(my_generate(convo, max_new_tokens=15, temperature=0))
```

Nothing persisted between the two calls except the text you re-sent.
Answer: if a chat app has a 50-turn conversation, what exactly gets sent
on turn 50, and what does that mean for cost and latency? Connect your
answer to the context window from track 01.

### 7. Diagnose and fix: the flaky test

A colleague writes this test and it fails intermittently in CI:

```python
def test_summary():
    out = call_llm("Summarize: The cat sat on the mat.", temperature=0)
    assert out == "A cat is sitting on a mat."
```

They insist `temperature=0` makes it deterministic. Explain why the test
is unsound and rewrite the assertion.

<details><summary>Answer</summary>

`temperature=0` selects the argmax, which is deterministic *in exact
arithmetic* but not in practice: GPU floating-point reductions sum in
nondeterministic order, provider-side batching changes the numerics,
MoE routing can depend on batch composition, and the provider may update
the model behind an unchanged name. Near-tied logits can therefore swap.

Even if it were bit-stable, asserting an exact string tests the model's
phrasing rather than the behaviour you care about. Assert on properties:

```python
def test_summary():
    out = call_llm("Summarize: The cat sat on the mat.", temperature=0)
    assert 0 < len(out) < 200
    assert "cat" in out.lower()
    assert "mat" in out.lower()
```

Track 15 covers the full toolkit — structural validation, schema
conformance, and LLM-as-judge for semantic equivalence.
</details>

## Independent challenge

Build a **decoding parameter explorer**: a script that takes one prompt
and generates output across a grid of settings — temperature in
`[0, 0.3, 0.7, 1.0, 1.5]` crossed with top-p in `[0.5, 0.9, 1.0]` — using
a fixed seed per cell so results are comparable.

Then produce a short report:

1. The grid of outputs, trimmed to ~15 tokens each.
2. A measure of diversity per cell — run each 5 times with different
   seeds and count distinct outputs.
3. Your recommended settings for three real tasks: extracting a date from
   an email, writing marketing copy, and generating a JSON API response.
   Justify each choice from what you observed, not from folklore.

That third item is the actual deliverable — those three tasks want
genuinely different settings, and knowing why is the point of this
module.

## Common mistakes & troubleshooting

- **Treating temperature as a creativity knob.** It scales logits before
  softmax. High temperature buys randomness, and past ~1.2 that mostly
  means incoherence.
- **Setting temperature and top-p aggressively at the same time.** Their
  effects compound confusingly. Tune one; leave the other at default.
- **Assuming `temperature=0` is reproducible.** It usually is, not always
  (exercise 7). Never assert exact output strings in tests.
- **Using greedy decoding for long-form text.** It degenerates into
  repetition loops (exercise 4).
- **Forgetting the model is stateless.** Every turn re-sends the whole
  conversation. Long chats get slower and more expensive, and eventually
  hit the context window.
- **Expecting output tokens and input tokens to cost the same.** Output
  requires one full forward pass each (decode); input is processed in one
  parallel pass (prefill). Providers price them differently for this
  reason.
- **Forgetting to set stop sequences.** Without them a model may keep
  going past the useful answer, costing tokens and requiring
  post-processing.

## Checkpoint quiz

1. Describe the autoregressive loop in five steps.
2. What are logits, and where do they sit relative to softmax?
3. Mathematically, what does temperature do?
4. What is the key advantage of top-p over top-k?
5. Give two reasons `temperature=0` might not produce identical output
   across runs.
6. Why does greedy decoding produce repetition loops?
7. What's the difference between prefill and decode, and why does it
   affect pricing?
8. What does "the model is stateless" mean for a 50-turn chat?

<details><summary>Answers</summary>

1. Tokenize the input; forward pass; take the last position's logits;
   convert to probabilities and sample one token; append it and repeat
   until EOS, max tokens, or a stop sequence.
2. Raw unnormalized scores, one per vocabulary token — the model's direct
   output, *before* softmax turns them into probabilities.
3. Divides the logits before softmax. Below 1 sharpens the distribution
   toward the top token; above 1 flattens it toward uniform.
4. Top-p adapts its cut-off to the model's certainty — keeping few tokens
   when confident and many when uncertain — whereas top-k keeps a fixed
   count regardless.
5. Any two of: nondeterministic GPU floating-point reduction order,
   provider-side request batching changing numerics, MoE expert routing
   depending on batch composition, or the provider updating the model
   behind the same name.
6. Each emitted token becomes context for the next step, so a phrase that
   makes itself more likely creates a deterministic feedback loop with no
   randomness available to break out.
7. Prefill processes the whole prompt in one parallel pass; decode
   generates output tokens one at a time, each needing a full forward
   pass. Output tokens therefore cost more compute per token, which is
   why APIs price input and output separately.
8. Nothing is remembered server-side — the entire conversation history is
   re-sent and re-processed on every turn, so cost and latency grow with
   conversation length until the context window is exhausted.
</details>

## Further reading & sources

- [The Curious Case of Neural Text Degeneration (Holtzman et al., 2019)](https://arxiv.org/abs/1904.09751) - the paper that introduced nucleus (top-p) sampling and documented the greedy-decoding repetition loops from exercise 4. Directly explains this module's core tradeoff.
- [How to generate text: using different decoding methods (Hugging Face)](https://huggingface.co/blog/how-to-generate) - the practical companion, with runnable examples of greedy, beam, top-k and top-p side by side.
- [OpenAI API Reference — Chat Completions](https://platform.openai.com/docs/api-reference/chat/create) - the authoritative parameter list: `temperature`, `top_p`, `stop`, `frequency_penalty`, `presence_penalty`, `logprobs`.
- [OpenAI: How to make outputs consistent (Cookbook)](https://cookbook.openai.com/examples/reproducible_outputs_with_the_seed_parameter) - the `seed` parameter and `system_fingerprint`, and an honest account of why "deterministic" is best-effort — exercise 7's subject, from the provider.
- [Hugging Face: Text generation strategies](https://huggingface.co/docs/transformers/generation_strategies) - every decoding strategy the library supports, including contrastive search and speculative decoding (track 14).
- [Transformer Explainer (Georgia Tech)](https://poloclub.github.io/transformer-explainer/) - has a live temperature slider showing the probability distribution reshape in real time; the interactive version of exercise 2.
- [Anthropic: Prompt engineering overview](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview) - where these parameters meet real prompting practice, and the natural bridge into track 07.
- [Speech and Language Processing, Ch. 10 (Jurafsky & Martin)](https://web.stanford.edu/~jurafsky/slp3/10.pdf) - the textbook treatment of decoding algorithms including beam search, free and rigorous.

## Next

[Module 09: What LLMs Are Genuinely Good At](../09-what-llms-are-genuinely-good-at/README.md)
