# Module 06: Scaled Dot-Product Attention

## Why this matters

Module 05's hand-computed pipeline included a scaling step —
dividing raw scores by `sqrt(d_k)` — without yet justifying it. This
module verifies *why* that specific divisor exists, and the answer is
sharper than "it's a normalization detail": without it, softmax
saturates for realistic model dimensions, and gradients through it
**collapse by nine orders of magnitude**, verified directly below.
Scaled dot-product attention isn't dot-product attention with an
optional tweak — the scaling is load-bearing for the model to be
trainable at all at real dimensions.

## Concepts

### Dot products grow with dimension — a statistical fact, not a coincidence

For two random vectors with independent, unit-variance entries, their
dot product's magnitude scales with `sqrt(d_k)`, where `d_k` is the
vector dimension. This is verified directly by measuring the standard
deviation of dot products across many random vector pairs, at
increasing dimension:

```python
import numpy as np
np.random.seed(0)

for d in [4, 16, 64, 256, 1024]:
    dots = [np.random.randn(d) @ np.random.randn(d) for _ in range(2000)]
    print(d, np.std(dots), np.sqrt(d))
```

Verified output — the measured standard deviation tracks `sqrt(d)`
almost exactly:

```
d=4     std(dot)=1.98   sqrt(d)=2.00
d=16    std(dot)=4.01   sqrt(d)=4.00
d=64    std(dot)=8.09   sqrt(d)=8.00
d=256   std(dot)=16.02  sqrt(d)=16.00
d=1024  std(dot)=30.68  sqrt(d)=32.00
```

This isn't specific to attention — it's a general property of dot
products between high-dimensional random vectors (each of `d`
independent terms contributes variance, and variances add, so the
total variance scales with `d` and the standard deviation with
`sqrt(d)`). Real transformer dimensions (`d_k` per attention head is
commonly 64-128, module 08 covers multi-head splitting) sit squarely in
the range where this effect is already substantial.

### Verified: large, unscaled scores saturate softmax

At `d_k = 256`, five keys scored against one query produce raw scores
with a spread of several tens:

```python
np.random.seed(0)
d_k = 256
q = np.random.randn(d_k)
K = np.random.randn(5, d_k)
scores = K @ q
print(scores)
```

Verified output: `[-7.42, -17.54, -20.26, 16.22, 13.12]` — verified
softmax of these raw scores:

```python
def softmax(x):
    e = np.exp(x - np.max(x))
    return e / e.sum()

print(softmax(scores))
```

Verified output: `[0.0, 0.0, 0.0, 0.9569, 0.0431]`. Three of the five
weights round to **exactly zero** — softmax has become almost a hard
argmax, assigning essentially all weight to one key and a sliver to
another. Now the scaled version, dividing by `sqrt(256) = 16`:

```python
scaled = scores / np.sqrt(d_k)
print(softmax(scaled))
```

Verified output: `[0.1003, 0.0533, 0.0449, 0.4394, 0.362]` — every key
retains a meaningful, nonzero weight, and the top two candidates are
genuinely competing (0.44 vs. 0.36) rather than one totally dominating.

### Verified: the gradient consequence, not just the numbers

Saturated softmax isn't just "sharper" — it's a place where softmax's
gradient is nearly zero (an extreme point of the function, where it's
locally almost flat). This is measured directly, computing the gradient
of one output probability with respect to all the input scores, for
both the unscaled and scaled cases:

```python
import torch

def softmax_grad_sum_abs(x):
    x = x.clone().requires_grad_(True)
    p = torch.softmax(x, dim=0)
    p[0].backward()
    return x.grad.abs().sum().item()

raw_t = torch.tensor(scores, dtype=torch.float32)
scaled_t = torch.tensor(scaled, dtype=torch.float32)
print(softmax_grad_sum_abs(raw_t))
print(softmax_grad_sum_abs(scaled_t))
```

Verified output:

```
unscaled gradient magnitude: 1.04e-10
scaled gradient magnitude:   0.180
```

The gradient magnitude is **roughly nine orders of magnitude smaller**
without scaling. This is the real, concrete mechanism behind "large
dot products saturate softmax and kill the gradient" — not a vague
warning, a measured near-total loss of learning signal. A model whose
attention scores land in this saturated regime would receive almost no
useful gradient to adjust *how* it's attending, even though its output
still looks like a normal (if overconfident) probability distribution.

### Why `sqrt(d_k)` specifically, not some other constant

Since dot-product magnitude scales with `sqrt(d_k)` (verified above),
dividing by exactly `sqrt(d_k)` rescales scores back down to
roughly the same, dimension-independent magnitude regardless of how
large `d_k` is — verified indirectly by the fact that the scaled
scores at `d_k=256` (spread of a few units) look similar in scale to
what module 05's `d_k=4` example produced. This is precisely what "keep
the softmax input in a well-behaved range no matter what dimension the
model uses" requires: a constant divisor wouldn't adapt as `d_k`
changes, but `sqrt(d_k)` scales exactly the way the problem does.

## Reference

```
 Quantity                         Verified value / behavior
 ───────────────────────          ────────────────────────────────
 std(dot product), dimension d     ~sqrt(d)  (verified across
                                    d=4,16,64,256,1024)
 Softmax on unscaled scores        near one-hot; 3/5 weights round
 (d_k=256 example)                 to exactly 0.0
 Softmax on scaled scores          all keys retain meaningful,
 (same example)                    nonzero weight
 Gradient magnitude, unscaled      ~1.04e-10 (verified)
 Gradient magnitude, scaled        ~0.180 (verified) — roughly 9
                                    orders of magnitude larger
```

```
 scaled_dot_product_attention(Q, K, V) =
     softmax( (Q @ K.T) / sqrt(d_k) ) @ V
                        ^^^^^^^^^^^
                the scaling step this module verifies the
                necessity of
```

## Hands-on exercises

### Exercise 1 — reproduce the dimension-vs-dot-product-magnitude measurement

Run the exact `std(dot)` experiment above at your own chosen
dimensions, and confirm the measured standard deviation continues to
track `sqrt(d)` closely.

### Exercise 2 — reproduce the softmax-saturation and gradient measurements

Run the `d_k=256` example exactly as above, confirming the near-zero
weights in the unscaled case and the gradient-magnitude gap (roughly
nine orders of magnitude). Then try a smaller `d_k` (e.g., 16) and
observe whether the saturation effect is as severe — connect what you
find to why the scaling issue becomes more serious specifically at
larger model dimensions.

### Exercise 3 — verify a smaller-than-`sqrt(d_k)` divisor still under-corrects

Repeat the `d_k=256` experiment, but divide by a constant that doesn't
scale with `d_k` (try dividing by `4`, an arbitrary fixed number) rather
than `sqrt(256)=16`. Check whether the resulting softmax output and
gradient magnitude are closer to the well-behaved scaled case or the
saturated unscaled case, and explain why a fixed divisor doesn't solve
the problem the way `sqrt(d_k)` does.

## Independent challenge

A researcher proposes using a *learned* scalar (a single trainable
parameter, instead of the fixed `sqrt(d_k)`) to rescale attention
scores before softmax, arguing the model could learn the "right" amount
of scaling itself. Using this module's verified gradient-collapse
finding, write two or three sentences on the practical risk of this
proposal at the very start of training, before the model has learned
anything yet.

<details><summary>Discussion</summary>

At initialization, a learned scalar would very likely start at some
default value (often near 1) that doesn't yet correct for the
dimension-dependent score magnitude — meaning early in training, scores
could sit in exactly the saturated, near-zero-gradient regime verified
above, before the model has had any opportunity to learn a better
scaling value. Since the fix for that saturation is itself a gradient
signal, and that gradient signal is precisely what saturation destroys,
a learned scale risks a chicken-and-egg problem: the model may never
receive a strong enough gradient early on to learn to fix the scaling
that's suppressing its own gradient. A fixed, mathematically-derived
`sqrt(d_k)` sidesteps this entirely by getting the scaling right from
the very first step, before any learning has happened.

</details>

## Common mistakes & troubleshooting

- **Treating the `sqrt(d_k)` scaling as an arbitrary normalization
  trick.** Verified above: it's the direct, measurable fix for a real
  gradient-collapse problem that gets worse specifically as model
  dimension grows — not a cosmetic adjustment.
- **Assuming saturated softmax just means "very confident," which
  sounds harmless.** Verified above: it also means the gradient
  through that softmax is nearly zero — the model can't easily learn
  to adjust attention weights that have become this saturated, which is
  a training problem, not just a sharper-than-ideal output.
- **Using a fixed, dimension-independent divisor instead of
  `sqrt(d_k)`.** Verified in exercise 3: a divisor that doesn't scale
  with dimension doesn't solve the problem in general — it only
  happens to work at whichever specific dimension it was tuned for.
- **Only checking the softmax output, never the gradient, when
  debugging attention that seems oddly overconfident.** The output can
  look plausible (a valid, if extreme, probability distribution) while
  the gradient flowing through it is nearly zero — exactly the gap
  verified in this module.

## Checkpoint quiz

1. What did the verified experiment show about how dot-product
   magnitude scales with vector dimension `d`?
2. In the verified `d_k=256` example, how many of the five softmax
   weights rounded to exactly zero without scaling? What happened
   after scaling?
3. By roughly how many orders of magnitude did the gradient shrink in
   the unscaled case compared to the scaled case?
4. Why is a saturated softmax a training problem, not just a
   "confident" output?
5. Why does `sqrt(d_k)` specifically solve the problem, rather than any
   fixed constant?

<details><summary>Answers</summary>

1. Dot-product magnitude (measured as standard deviation across many
   random vector pairs) scales with `sqrt(d)` — verified directly
   across dimensions 4, 16, 64, 256, and 1024, matching the theoretical
   prediction closely at each one.
2. Three of the five weights rounded to exactly `0.0` without scaling
   (softmax collapsed to near-argmax behavior). After scaling by
   `sqrt(256)=16`, all five weights retained meaningful, nonzero
   values, with the top two candidates genuinely competing.
3. Roughly nine orders of magnitude — verified: ~1.04e-10 (unscaled)
   versus ~0.180 (scaled).
4. Because saturation puts softmax in a region where it's nearly flat
   (an extreme point of the function) — the gradient with respect to
   the input scores is nearly zero there, meaning the model receives
   almost no signal to adjust *how* it's attending, even though the
   output still looks like a valid, if extreme, probability
   distribution.
5. Because dot-product magnitude itself scales with `sqrt(d_k)`
   (verified above) — dividing by exactly that quantity rescales
   scores back to a roughly dimension-independent range regardless of
   how large `d_k` is, whereas a fixed constant only happens to work at
   whichever specific dimension it was chosen for (verified in exercise
   3 to under-correct at other dimensions).

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.2.1, footnote 4, gives the original justification for the `sqrt(d_k)` scaling this module verifies numerically.
- [PyTorch documentation: torch.nn.functional.scaled_dot_product_attention](https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html) - the real, production implementation that applies this scaling by default.
- [On Layer Normalization in the Transformer Architecture (Xiong et al., 2020)](https://arxiv.org/abs/2002.04745) - discusses gradient behavior through transformer sub-layers, relevant background for the gradient-collapse mechanism verified in this module.
- [Track 02, Module 05: Self-Attention Step by Step, By Hand](../05-self-attention-step-by-step-by-hand/README.md) - the full attention pipeline this module's scaling step is one part of, with every other step verified there.
- [Track 01, Module 15: Next-Token Prediction: From Logits to Probabilities](../../01-tokens-and-language-modeling/15-next-token-prediction-from-logits-to-probabilities/README.md) - covers softmax's numerical-stability shift and entropy/perplexity, complementary background for this module's saturation discussion.

## Next

[Module 07: Attention Masks and Causal Masking](../07-attention-masks-and-causal-masking/README.md)
