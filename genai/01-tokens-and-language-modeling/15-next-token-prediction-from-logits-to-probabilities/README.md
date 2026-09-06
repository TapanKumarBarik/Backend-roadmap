# Module 15: Next-Token Prediction: From Logits to Probabilities

## Why this matters

Track 00, module 08 already walked through the autoregressive
generation loop end to end — logits, softmax, temperature, top-k/top-p,
stopping conditions — with real, runnable `torch` code, and that module
is the place to go for the applied mechanics of tuning generation
parameters. **This module goes one level deeper on one specific step
in that loop: the softmax function itself** — why it's defined the way
it is, a real numerical failure mode in the naive implementation that
production code must guard against, and the information-theoretic tools
(entropy, perplexity) for actually *measuring* how confident a model's
next-token prediction is, rather than just eyeballing a probability bar
chart. If track 00/module 08 is "how to drive," this module is "why the
engine is built this way."

## Concepts

### Softmax, derived, not just invoked

A model's final layer produces one raw, unbounded real number per
vocabulary entry — a **logit**. Softmax turns a vector of logits into a
valid probability distribution (all values in `[0,1]`, summing to `1`)
via:

```
 softmax(x)_i = exp(x_i) / sum_j exp(x_j)
```

Two properties fall directly out of this formula, both worth noticing
explicitly: exponentiating means the *largest* logit always maps to the
*largest* probability (softmax never reorders), and it means small
differences in logits can produce large differences in probability,
because `exp` grows fast — this is *why* a model can be extremely
"confident" (one token capturing 99%+ probability) even when its logits
aren't dramatically different from the runner-up.

### A real numerical failure: naive softmax overflows

Transformer logits for a large vocabulary commonly range into the tens
or hundreds. Implementing the formula exactly as written breaks in
practice:

```python
import numpy as np

def softmax_naive(logits):
    exps = np.exp(logits)
    return exps / exps.sum()

logits = np.array([1000.0, 1001.0, 999.0])
print(softmax_naive(logits))
```

Verified output:

```
RuntimeWarning: overflow encountered in exp
RuntimeWarning: invalid value encountered in divide
[nan nan nan]
```

`exp(1000)` overflows a 64-bit float entirely, and the result is silent
garbage (`nan`) rather than a clear crash. The standard, universally-used
fix subtracts the maximum logit from every logit *before* exponentiating
— mathematically a no-op (it cancels out in the division), but numerically
essential:

```python
def softmax_stable(logits):
    shifted = logits - np.max(logits)
    exps = np.exp(shifted)
    return exps / exps.sum()

print(softmax_stable(logits))
```

Verified output:

```
[0.24472847 0.66524096 0.09003057]   (sums to 1.0)
```

Both functions agree exactly on small, safe logit values — verified
separately on `[2.0, 1.0, 0.1]`, both returned
`[0.659, 0.242, 0.099]` — confirming the shift is purely a stability
fix, not a different function. Every production ML framework's softmax
implementation (`torch.softmax`, `scipy.special.softmax`, etc.) does
this subtraction internally; this is why track 00's `torch.softmax`
calls never need to worry about the overflow shown above, but it's
worth knowing it's happening under the hood, and worth remembering if
you ever hand-implement softmax for a custom sampling technique.

### Entropy: measuring how confident a prediction actually is

A probability distribution's **entropy** (in bits, using log base 2)
quantifies how spread out or concentrated it is — independent of which
specific tokens are involved:

```
 entropy(p) = - sum_i  p_i * log2(p_i)
```

Verified on three illustrative next-token distributions:

```python
def entropy(probs):
    probs = np.array(probs)
    probs = probs[probs > 0]
    return -np.sum(probs * np.log2(probs))

sharp  = [0.97, 0.01, 0.01, 0.01]   # model is very confident
flat   = [0.25, 0.25, 0.25, 0.25]   # model has no idea
medium = [0.5, 0.3, 0.15, 0.05]

for name, p in [("sharp", sharp), ("flat", flat), ("medium", medium)]:
    print(name, entropy(p), "bits")
```

Verified output:

```
sharp  0.242 bits
flat   2.0 bits
medium 1.648 bits
```

Lower entropy means the distribution is concentrated on one or a few
tokens (the model is "sure"); the maximum possible entropy for 4 equally
likely options is exactly `log2(4) = 2.0` bits, matching the fully flat
case verified above exactly. Entropy gives you a single number to
compare "how confident was the model here vs. there" — useful for
things like flagging low-confidence generations for review, or
understanding why a specific sampling setting (module 16) behaves
differently on a sharp-distribution token (e.g., after "The capital of
France is") versus a genuinely open-ended one (e.g., after "My favorite
color is").

### Perplexity: entropy, exponentiated back into a token count

Perplexity is entropy re-expressed in a more intuitive unit — roughly,
"how many roughly-equally-likely options does this feel like":

```
 perplexity(p) = 2 ^ entropy(p)     (using log base 2 entropy)
```

Verified on the same three distributions:

```python
for name, p in [("sharp", sharp), ("flat", flat), ("medium", medium)]:
    print(name, 2 ** entropy(p))
```

Verified output:

```
sharp  1.18
flat   4.0
medium 3.13
```

The `flat` distribution's perplexity of exactly `4.0` matches its 4
genuinely equally-likely options — perplexity has a direct, checkable
interpretation ("this next-token choice feels about as uncertain as
choosing uniformly among ~4 options") rather than being an abstract
score. This is also the same metric (computed over an entire model,
across a whole evaluation set rather than one token) commonly reported
to compare language models' overall predictive quality — a lower average
perplexity means the model is, on average, less "surprised" by real
text, which is a genuinely different (and older, simpler) evaluation
signal than the benchmark-style evaluations covered in track 00.

## Reference

```
 Concept          Formula                          What it captures
 ─────────────    ───────────────────────────────  ─────────────────────
 Logit             raw model output, unbounded       relative preference,
                                                       before normalization
 Softmax           exp(x_i) / sum_j exp(x_j)         valid probability
                                                       distribution
 Numerically       exp(x_i - max(x)) / sum_j          same result, avoids
 stable softmax    exp(x_j - max(x))                  overflow on large
                                                       logits
 Entropy           -sum_i p_i * log2(p_i)             how spread out /
                                                       concentrated a
                                                       distribution is
 Perplexity        2 ^ entropy                        entropy re-expressed
                                                       as an effective
                                                       "number of options"
```

```
 Where to go for applied generation-loop mechanics (NOT re-covered
 here — see track 00, module 08 instead):
 ─────────────────────────────────────────────────────────────────
 Temperature, top-k, top-p          Track 00, module 08
 The full autoregressive loop       Track 00, module 08
 Greedy decoding, streaming, stop   Track 00, module 08 / module 16
   conditions                       (this track) for hand-implemented
                                     sampling mechanics
```

## Hands-on exercises

### Exercise 1 — reproduce the overflow, then fix it

Run `softmax_naive` and `softmax_stable` on the exact logits above, and
confirm the `nan` output and the working, correct output respectively.
Then test both functions on identical small, safe logits and confirm
they agree exactly — the fix changes numerical behavior at extreme
values, not the function's actual output.

### Exercise 2 — compute entropy for a real vocabulary-sized distribution

Take any softmax output from track 00 module 08's exercises (or
generate a random logits vector of size 50, run it through
`softmax_stable`), compute its entropy, and compare it to the maximum
possible entropy for that vocabulary size (`log2(vocab_size)`). Express
the result as a percentage of the maximum — this gives a normalized
"how confident, relative to total uncertainty" score usable across
vocabularies of different sizes.

### Exercise 3 — connect entropy to a real generation choice

Using track 00 module 08's `my_generate` function (or your own simple
version), compute the entropy of the probability distribution at each
generation step for a prompt like `"The capital of France is"` versus
`"My favorite thing about weekends is"`. Confirm the first prompt
produces a noticeably lower-entropy distribution at the position right
before the expected completion (`"Paris"`) than the second, more
open-ended prompt does at its corresponding position.

## Independent challenge

A monitoring system for a production LLM feature wants to flag
"low-confidence" generations for human review, without access to the
actual generated text's correctness (which isn't knowable in real
time). Using this module's entropy/perplexity tools, design a simple
rule (in a sentence or two, no need to implement it fully) for deciding
which generated tokens are worth flagging, and identify one real
limitation of using entropy alone for this purpose.

<details><summary>Discussion</summary>

A reasonable rule: flag a generation if the entropy of one or more of
its per-token distributions exceeds some threshold (e.g., a
normalized-entropy score from exercise 2 above some cutoff), since
that indicates the model itself was genuinely uncertain at that point,
rather than confidently wrong. The real limitation: entropy measures
uncertainty, not correctness — a model can be confidently *wrong*
(low entropy, but the high-probability token is still factually
incorrect, connecting to track 00's hallucination discussion), and
entropy alone can't distinguish that case from a confidently correct
one. It's a useful, cheap signal for "the model itself wasn't sure,"
not a substitute for actually checking correctness.

</details>

## Common mistakes & troubleshooting

- **Implementing softmax exactly as the textbook formula reads**,
  without the max-subtraction stability trick — verified above to
  silently produce `nan` on realistic transformer-scale logits. Always
  use a framework's built-in softmax (which already does this) rather
  than hand-rolling it, unless there's a specific reason to implement
  it yourself — and if you do, include the stability fix.
- **Treating entropy as a correctness signal.** It measures how spread
  out a probability distribution is, not whether the highest-probability
  token is actually right — see the independent challenge discussion.
- **Confusing per-token entropy/perplexity (this module) with
  whole-model, whole-dataset perplexity** (a common language-model
  evaluation metric, computed as an average over many tokens/examples)
  — related by the same formula, but used at a very different scale
  and for a different purpose.
- **Re-deriving temperature/top-k/top-p from scratch here** instead of
  using track 00 module 08's already-verified treatment — this module
  deliberately doesn't repeat that content; go there for the applied
  generation-parameter mechanics.

## Checkpoint quiz

1. What does softmax guarantee about the relationship between the
   largest input logit and the largest output probability?
2. What specifically breaks in the naive softmax implementation on
   realistic transformer-scale logits, and what's the standard fix?
3. What does an entropy of `0` bits mean for a probability
   distribution? What about the maximum possible entropy for a
   4-option distribution?
4. What does perplexity add on top of entropy, and why is `4.0` a
   meaningful, checkable perplexity value for a uniform 4-option
   distribution?
5. Why doesn't low entropy on a generated token guarantee the token is
   correct?

<details><summary>Answers</summary>

1. Softmax never reorders — the largest input logit always maps to the
   largest output probability, since exponentiation is a strictly
   increasing function.
2. Exponentiating large logits (verified: `exp(1000)`) overflows and
   produces `nan` throughout the output. The standard fix subtracts the
   maximum logit from every logit before exponentiating — mathematically
   a no-op (it cancels in the normalization) but numerically necessary;
   both versions were verified to agree exactly on small, safe inputs.
3. Entropy of 0 means the distribution places all probability on a
   single token — total certainty. The maximum entropy for a 4-option
   distribution is `log2(4) = 2.0` bits, achieved exactly by the
   uniform (fully flat) distribution, verified directly above.
4. Perplexity re-expresses entropy (`2^entropy`) as an intuitive
   "effective number of equally-likely options." `4.0` is meaningful
   because a genuinely uniform distribution over 4 options verified to
   produce exactly perplexity 4.0 — the metric's interpretation is
   directly checkable, not just an abstract score.
5. Entropy measures how concentrated the model's probability
   distribution is, not whether the highest-probability token is
   factually correct — a model can be confidently wrong (low entropy,
   incorrect top token), which entropy alone cannot detect.

</details>

## Further reading & sources

- [The Softmax function and its derivative (Eli Bendersky)](https://eli.thegreenplace.net/2016/the-softmax-function-and-its-derivative/) - a clear derivation of softmax and the numerical-stability shift verified in this module.
- [PyTorch documentation: torch.nn.functional.softmax](https://pytorch.org/docs/stable/generated/torch.nn.functional.softmax.html) - the production implementation referenced in track 00 module 08's exercises; internally applies the same stability shift verified by hand here.
- [A Mathematical Theory of Communication (Shannon, 1948)](https://people.math.harvard.edu/~ctm/home/text/others/shannon/entropy/entropy.pdf) - the foundational paper defining entropy, the basis for this module's entropy/perplexity treatment.
- [Perplexity - Hugging Face documentation](https://huggingface.co/docs/transformers/en/perplexity) - documents whole-model perplexity as a language-model evaluation metric, the larger-scale relative of this module's per-token treatment.
- [Track 00, Module 08: How LLMs Actually Generate Text](../../00-genai-foundations/08-how-llms-actually-generate-text/README.md) - the applied companion to this module: temperature, top-k, top-p, the full autoregressive loop, and stopping conditions.

## Next

[Module 16: Sampling Strategies: Greedy, Temperature, Top-k, Top-p](../16-sampling-strategies-greedy-temperature-top-k-top-p/README.md)
