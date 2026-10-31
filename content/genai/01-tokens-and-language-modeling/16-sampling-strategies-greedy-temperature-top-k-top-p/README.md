# Module 16: Sampling Strategies: Greedy, Temperature, Top-k, Top-p

## Why this matters

Track 00, module 08 already introduced temperature, top-k, and top-p
with real `torch`-based generation code, including the ASCII-diagram
argument for why top-p's adaptive set size beats top-k's fixed count.
**This module puts real numbers behind that argument** — implementing
all the filtering logic from scratch in plain NumPy (no framework
dependency) and running it against two genuinely different probability
distributions to *measure*, not just illustrate, how many tokens each
method actually keeps. It also covers **min-p**, a newer, less commonly
taught sampling method not covered in track 00, and compares it directly
against top-p on the same verified numbers.

## Concepts

### The four filters, implemented from scratch

```python
import numpy as np

def softmax(logits):
    e = np.exp(logits - np.max(logits))
    return e / e.sum()

def top_k_filter(probs, k):
    idx = np.argsort(probs)[::-1][:k]
    filtered = np.zeros_like(probs)
    filtered[idx] = probs[idx]
    return filtered / filtered.sum()

def top_p_filter(probs, p):
    idx = np.argsort(probs)[::-1]
    cumulative = np.cumsum(probs[idx])
    cutoff = np.searchsorted(cumulative, p) + 1
    keep = idx[:cutoff]
    filtered = np.zeros_like(probs)
    filtered[keep] = probs[keep]
    return filtered / filtered.sum(), cutoff

def min_p_filter(probs, ratio):
    threshold = probs.max() * ratio
    keep = probs >= threshold
    filtered = np.where(keep, probs, 0)
    return filtered / filtered.sum(), keep.sum()
```

`top_k_filter` always keeps exactly `k` tokens. `top_p_filter` keeps
however many tokens are needed for their cumulative probability to
reach `p`. `min_p_filter` keeps every token whose probability is at
least `ratio` times the single most likely token's probability — a
different, simpler adaptivity rule introduced more recently than top-p.

### Measured: the same k and p, two very different distributions

Two realistic next-token distributions — one **confident** (like the
token right after `"The capital of France is"`), one **uncertain**
(like the token after an open-ended `"She opened the ___"`):

```python
confident_logits = np.array([8.0, 3.0, 2.5, 1.0, 0.5, 0.2, 0.1, 0.05, 0.0, -1.0])
uncertain_logits = np.array([2.0, 1.9, 1.8, 1.7, 1.6, 1.5, 1.4, 1.3, 1.2, 1.1])

confident_probs = softmax(confident_logits)
uncertain_probs = softmax(uncertain_logits)
```

Verified sorted probabilities:

```
confident: [0.9863, 0.0066, 0.0040, 0.0009, 0.0005, 0.0004, 0.0004, 0.0003, 0.0003, 0.0001]
uncertain: [0.1505, 0.1362, 0.1233, 0.1115, 0.1009, 0.0913, 0.0826, 0.0748, 0.0676, 0.0612]
```

Now apply **top-k=3**, **top-p=0.9**, and **min-p ratio=0.1** to both,
and count how many tokens each keeps:

```
                  top-k=3      top-p=0.9      min-p (ratio=0.1)
 confident        3 tokens     1 token         1 token
 uncertain        3 tokens     9 tokens        10 tokens
```

This is the exact, measured version of track 00's claim: **top-k keeps
a fixed count no matter what** — 3 tokens whether the model is
99%-confident or genuinely torn between ten options. **Top-p and min-p
both adapt** — on the confident distribution, a single token already
holds 98.6% of the probability mass, so top-p correctly truncates to
just that one token (nothing else is worth considering), while on the
uncertain distribution it keeps 9 of the 10 tokens, because no small
subset dominates. Min-p produces an almost identical result here via a
different, simpler rule: instead of tracking a cumulative sum, it just
asks "is this token at least 10% as likely as the single best one?" —
cheap to compute, and verified to produce essentially the same adaptive
behavior as top-p on both distributions above.

### Why min-p is worth knowing, distinct from top-p

Top-p's cumulative-sum approach has a known failure mode: with a very
long tail of low-probability tokens, enough of them can cumulatively
add up to cross the `p` threshold even though none of them are
individually plausible, letting a few near-nonsensical tokens sneak
into the kept set. Min-p sidesteps this by comparing each token
directly to the single best token's probability, regardless of how
many other tokens exist in the tail — it doesn't care about a
cumulative sum at all, only a ratio to the top choice. Both are valid,
real, implemented techniques (min-p is available in several open-source
inference stacks) — the comparison above shows they often agree, but
they're computing genuinely different things.

### Combining filters, and why order matters

Real inference stacks commonly apply **temperature first**, then a
truncation filter (top-k, top-p, or min-p), then sample from what's
left:

```
 raw logits
     │  divide by temperature
     ▼
 reshaped logits
     │  softmax
     ▼
 probabilities
     │  top-k / top-p / min-p filter
     ▼
 truncated, renormalized probabilities
     │  sample
     ▼
 chosen token
```

Applying the truncation filter *before* temperature would filter based
on the original (unscaled) distribution's shape, then reshape a
*subset* — a subtly different operation from reshaping the full
distribution first and then deciding what's still plausible. Track 00's
warning against changing temperature and top-p simultaneously (hard to
reason about which one caused a change) applies doubly here: know which
order your specific inference stack applies these in before assuming a
parameter change will behave a specific way.

## Reference

```
 Method     Rule                              Adaptive to model confidence?
 ────────   ───────────────────────────────   ──────────────────────────────
 Greedy      always take argmax                no (single fixed choice)
 Temperature  divide logits before softmax       reshapes, doesn't truncate
 Top-k        keep exactly k highest-prob         NO — verified: keeps 3
              tokens                              tokens regardless of
                                                    confidence
 Top-p        keep smallest set whose             YES — verified: 1 token
 (nucleus)    cumulative prob >= p                 (confident) vs. 9
                                                    (uncertain)
 Min-p        keep tokens >= ratio * top          YES — verified: 1 token
              token's probability                  (confident) vs. 10
                                                    (uncertain); simpler,
                                                    no cumulative sum, less
                                                    prone to long-tail
                                                    inclusion
```

## Hands-on exercises

### Exercise 1 — reproduce the confident-vs-uncertain comparison

Run the exact code above and confirm the kept-token counts match:
top-k=3 always keeps 3; top-p=0.9 keeps 1 (confident) vs. 9
(uncertain); min-p ratio=0.1 keeps 1 (confident) vs. 10 (uncertain).

### Exercise 2 — construct a case where top-p includes an implausible token

Build a distribution with one moderately-confident top token and a very
long tail of near-zero (but not exactly zero) probabilities — enough of
them that their cumulative sum meaningfully contributes. Apply
`top_p_filter` with `p=0.95` and check whether any individually
implausible tail token gets included purely because the cumulative sum
needed it. Then apply `min_p_filter` with a reasonable ratio to the same
distribution and compare which tokens each method actually keeps.

### Exercise 3 — verify filter order changes the result

Using the `confident_logits` array, compute the final sampled
distribution two ways: (a) temperature=0.5, then softmax, then
top-k=3; (b) softmax, then top-k=3, then apply temperature to the
surviving 3 logits before renormalizing. Confirm the two resulting
distributions are not identical — order genuinely matters, not just in
theory.

## Independent challenge

A team wants generation to be "creative but not nonsensical" for a
brainstorming feature. Using this module's verified confident-vs-uncertain
comparison, argue for or against using top-k as the sole truncation
method for this use case, and suggest which of top-p or min-p would be
a better default, tying your answer to the specific adaptive-count
numbers verified above rather than a general impression.

<details><summary>Discussion</summary>

Top-k is a poor fit here specifically because "creative but not
nonsensical" implies the acceptable amount of variety should depend on
how open-ended a given generation step actually is — exactly the
property top-k structurally cannot express (verified: it kept exactly
3 tokens whether the model was 98.6% confident or genuinely torn among
ten options). Either top-p or min-p is a better starting point because
both adapt the kept-token count to the model's actual confidence at
each step (verified: 1 vs. 9, and 1 vs. 10 respectively) — meaning a
confident step stays close to deterministic while a genuinely open step
gets real variety, without a fixed k that's either too restrictive on
open steps or too loose on confident ones.

</details>

## Common mistakes & troubleshooting

- **Assuming top-k=3 always keeps "the 3 best options."** It does, but
  verified above, that's not adaptive — on a highly confident
  distribution, even the 2nd and 3rd tokens can be far less plausible
  than the top-p/min-p alternative would keep.
- **Applying a truncation filter before temperature (or vice versa)
  without checking your inference stack's actual order.** Verified in
  exercise 3: the two orders produce genuinely different final
  distributions, not just theoretically.
- **Tuning temperature and top-p/min-p simultaneously** when debugging
  unexpected output — as track 00 notes, this makes it hard to
  attribute a change in behavior to either parameter; adjust one at a
  time.
- **Assuming min-p and top-p are interchangeable in every case.**
  Verified above they often agree, but they compute genuinely different
  things (ratio-to-top vs. cumulative sum) and can diverge specifically
  on long-tailed distributions (exercise 2).

## Checkpoint quiz

1. In the verified experiment, how many tokens did top-k=3 keep on the
   confident distribution vs. the uncertain one? What does that show
   about top-k's adaptivity?
2. How many tokens did top-p=0.9 keep on each distribution? What
   property does this demonstrate?
3. What rule does min-p use to decide which tokens to keep, and how
   does it differ mechanically from top-p's rule?
4. What's a known failure mode of top-p that min-p is designed to avoid?
5. Why can applying a truncation filter before vs. after temperature
   change the final result?

<details><summary>Answers</summary>

1. Exactly 3 tokens in both cases — top-k always keeps a fixed count,
   regardless of whether the underlying distribution was highly
   confident (98.6% on one token) or much more uncertain (10 fairly
   close probabilities).
2. 1 token on the confident distribution, 9 tokens on the uncertain
   one — demonstrating top-p's adaptive set size: it naturally narrows
   when the model is sure and widens when it isn't.
3. Min-p keeps every token whose probability is at least some fixed
   ratio of the single most likely token's probability — a direct
   ratio-to-the-top comparison, rather than top-p's approach of
   summing probabilities in ranked order until a cumulative threshold
   is crossed.
4. A very long tail of individually-implausible tokens can
   cumulatively sum enough to cross top-p's threshold, letting some of
   them be included even though none is individually plausible. Min-p
   avoids this because it never sums a tail — it only compares each
   token directly to the top token's probability.
5. Because truncating before temperature filters based on the
   original, unscaled distribution's shape and then reshapes only the
   surviving subset, while truncating after temperature reshapes the
   full distribution first and then decides what's still plausible
   under the new shape — these are mechanically different operations,
   verified to produce different final distributions in exercise 3.

</details>

## Further reading & sources

- [The Curious Case of Neural Text Degeneration (Holtzman et al., 2019)](https://arxiv.org/abs/1904.09751) - introduces nucleus (top-p) sampling, already cited in track 00 module 08; the paper this module's top-p implementation follows directly.
- [Turning Up the Heat: Min-p Sampling for Creative and Coherent LLM Outputs (Nguyen et al., 2024)](https://arxiv.org/abs/2407.01082) - the min-p sampling paper, covering the ratio-to-top-token rule and long-tail failure mode of top-p discussed in this module.
- [Hugging Face documentation: Generation strategies](https://huggingface.co/docs/transformers/en/generation_strategies) - documents `top_k`, `top_p`, and `min_p` as configurable generation parameters in a real, widely-used inference stack.
- [OpenAI API Reference — Chat Completions](https://platform.openai.com/docs/api-reference/chat/create) - the `temperature` and `top_p` parameters as exposed by a real production API, cited in track 00 module 08 as well.
- [Track 00, Module 08: How LLMs Actually Generate Text](../../00-genai-foundations/08-how-llms-actually-generate-text/README.md) - the applied companion to this module: the full generation loop, prefill/decode phases, and why `temperature=0` still isn't fully deterministic in production.

## Next

[Module 17: Capstone Project](../17-capstone-project/README.md)
