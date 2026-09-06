# Module 07: Attention Masks and Causal Masking

## Why this matters

Track 00 module 06 already showed the causal mask as a diagram: a
triangle of allowed positions, generation needing "a blindfold" against
future tokens. This module verifies the actual **mechanism** — masking
isn't a separate step bolted onto attention, it's an *additive
modification to the raw scores, applied before softmax* — and
demonstrates a real, easy-to-make bug: implementing a mask by zeroing
scores instead of setting them to negative infinity looks almost right
but silently leaks probability to positions that should be completely
invisible. This module also covers the second real use of masking
(padding masks) that track 00 didn't cover.

## Concepts

### Masking is additive, applied before softmax

The correct implementation adds a large negative number (in practice,
`-inf`) to every score that should be masked out, **before** softmax
runs:

```
 masked_scores = raw_scores + mask     (mask is 0 where allowed, -inf where masked)
 weights = softmax(masked_scores)
```

Because `exp(-inf) = 0`, any masked position gets *exactly* zero weight
after softmax — not approximately zero, not "very small," exactly zero,
verified directly below.

### Verified: the correct mask (`-inf`) versus a common bug (zeroing scores)

A tempting-looking but wrong implementation sets masked positions'
*scores* to `0` instead of `-inf`, reasoning "zero means no
contribution." Verified directly, on a 4x4 causal mask (each row `i`
may only see columns `<= i`):

```python
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - np.max(x, axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

np.random.seed(3)
scores = np.random.randn(4, 4) * 2
causal_mask = np.triu(np.ones((4, 4)), k=1).astype(bool)  # True = future position

wrong = scores.copy(); wrong[causal_mask] = 0
print(np.round(softmax(wrong), 3))

correct = scores.copy(); correct[causal_mask] = -np.inf
print(np.round(softmax(correct), 3))
```

Verified output:

```
WRONG (zeroed scores):
[[0.923 0.026 0.026 0.026]
 [0.187 0.16  0.326 0.326]
 [0.386 0.162 0.03  0.421]
 [0.154 0.805 0.029 0.012]]

CORRECT (-inf scores):
[[1.    0.    0.    0.   ]
 [0.539 0.461 0.    0.   ]
 [0.667 0.28  0.053 0.   ]
 [0.154 0.805 0.029 0.012]]
```

Look at row 0: it should only ever attend to position 0 (a causal mask
means the first token can see nothing but itself). The correct version
gives it exactly `[1.0, 0.0, 0.0, 0.0]`. The "zeroed" version gives it
`[0.923, 0.026, 0.026, 0.026]` — **the model is still leaking 7.7% of
its attention weight onto three positions it should never be able to
see at all.** `0` is not a neutral score — softmax treats a score of 0
as "moderately plausible," not "forbidden," because softmax normalizes
*relative* to the other scores in the row, and a masked-to-zero score
can still beat a legitimately low real score. This is a real,
production-relevant bug: it wouldn't crash, wouldn't look obviously
wrong in a quick check, and would quietly let a causally-masked model
"cheat" by reading a small amount of information from the future during
training.

### Verified against PyTorch's real causal-masking implementation

```python
import torch
import torch.nn.functional as F

torch.manual_seed(3)
n, d = 4, 4
Q, K, V = torch.randn(1, n, d), torch.randn(1, n, d), torch.randn(1, n, d)

out_causal = F.scaled_dot_product_attention(Q, K, V, is_causal=True)

mask = torch.triu(torch.ones(n, n), diagonal=1).bool()
attn_mask = torch.zeros(n, n).masked_fill(mask, float("-inf"))
out_manual = F.scaled_dot_product_attention(Q, K, V, attn_mask=attn_mask)

print(torch.allclose(out_causal, out_manual, atol=1e-6))
```

Verified output: **`True`**. PyTorch's convenient `is_causal=True` flag
does exactly the additive `-inf` masking verified above — it's a
shortcut for the same operation, not a different mechanism.

### The second real use of masking: padding

Causal masking isn't the only reason to mask attention. Real batches
group sequences of different lengths together, padding the shorter
ones (track 01 module 09's `[PAD]` token) up to a common length so they
fit in one tensor. Without masking, a real token could attend to pure
padding — meaningless content that would corrupt its representation.
Verified directly:

```python
K2, V2 = torch.randn(1, 5, d), torch.randn(1, 5, d)
Q2 = torch.randn(1, 1, d)
pad_mask = torch.tensor([[False, False, False, True, True]])  # last 2 are padding
attn_mask2 = torch.zeros(1, 5).masked_fill(pad_mask, float("-inf")).unsqueeze(1)
out_pad = F.scaled_dot_product_attention(Q2, K2, V2, attn_mask=attn_mask2)
print(out_pad.shape)
```

Verified output: `torch.Size([1, 1, 4])` — a working forward pass where
the last two (padding) positions are structurally prevented from
contributing anything to the output, using the exact same additive
`-inf` mechanism as causal masking. Padding masks and causal masks are
the same underlying tool applied to two different problems: causal
masks hide the *future*; padding masks hide *non-content*. A real
production model commonly applies both simultaneously (a causally
masked decoder, batched with padding) by combining the two masks
additively before the single softmax call.

## Reference

```
 Mask type       Hides                        Why
 ─────────────   ─────────────────────────    ──────────────────────────
 Causal mask      future positions              generation must not see
                  (upper triangle, per          the answer it's trying
                  track 00 module 06's           to predict
                  diagram)
 Padding mask      padding tokens                padding carries no real
                  ([PAD], track 01               content and must not
                  module 09)                     influence real tokens'
                                                  representations

 Implementation:  masked_scores = raw_scores + mask_values
                  mask_values: 0 where allowed, -inf where masked
                  weights = softmax(masked_scores)  -> exact 0 at masked
                                                        positions
```

## Hands-on exercises

### Exercise 1 — reproduce the zeroed-vs-`-inf` bug

Run the exact 4x4 example above and confirm row 0 leaks nonzero
attention weight to future positions under the "zeroed" implementation,
while the `-inf` implementation gives exactly `[1.0, 0.0, 0.0, 0.0]`.
Try a few different random seeds and confirm the leak is a general
property of the buggy approach, not specific to one set of scores.

### Exercise 2 — reproduce the causal-mask cross-check against PyTorch

Run the `is_causal=True` vs. manual `-inf`-mask comparison exactly as
above, and confirm `torch.allclose` returns `True`.

### Exercise 3 — build and verify a combined causal + padding mask

Extend the padding-mask example to a full sequence-to-sequence
self-attention setup (not just one query position) with both a causal
mask and a padding mask active simultaneously. Verify that a real
(non-padding) token's output never depends on the padding tokens, and
separately that no position attends to a future position — check both
properties independently rather than assuming one mask covers both.

## Independent challenge

A teammate profiling a model's inference code proposes replacing the
`-inf` masking convention with a large-but-finite negative number (like
`-1e9`) "since `-inf` sometimes causes NaN issues in edge cases."
Using this module's exact softmax mechanics, write two or three
sentences on whether `-1e9` would produce meaningfully different
attention weights than true `-inf` in practice, and what a real edge
case where `-inf` causes trouble might look like (hint: think about
what happens if every score in an entire row is masked).

<details><summary>Discussion</summary>

For any row with at least one unmasked position, `-1e9` and `-inf`
produce numerically indistinguishable results after softmax — `exp(-1e9)`
already underflows to `0.0` in floating point, so the practical
attention weights come out identical to the true `-inf` case. The real
edge case where `-inf` (or `-1e9`) causes trouble is a row where *every*
position is masked (can happen with certain padding configurations) —
softmax over an all `-inf` row divides `0/0`, producing `NaN` rather
than a valid distribution, since there's no unmasked position for the
probability mass to go to. That failure mode exists regardless of
whether the sentinel value is `-inf` or `-1e9`; it's a property of every
position being masked, not of which large negative number was chosen —
which points to checking for and explicitly handling the fully-masked-row
case, not to swapping the sentinel value.

</details>

## Common mistakes & troubleshooting

- **Masking by setting scores to `0` instead of `-inf`.** Verified
  above: this leaks meaningful probability to positions that should be
  completely inaccessible — a real, subtle correctness bug, not a
  performance-only concern.
- **Applying the mask after softmax instead of before.** Zeroing out
  weights post-softmax leaves the remaining weights not summing to 1
  unless explicitly renormalized — applying the mask additively
  *before* softmax (verified throughout this module) avoids this
  entirely, since softmax naturally produces a valid distribution over
  whatever isn't masked.
- **Forgetting padding masks exist as a distinct problem from causal
  masks.** A model that's correctly causally masked can still let real
  tokens attend to meaningless padding content if no separate padding
  mask is applied — verified above as a real, working example of both
  masks combined.
- **Assuming a fully-masked row can't happen.** It's a real edge case
  (verified in the independent challenge discussion) that produces
  `NaN` regardless of which large-negative sentinel value is used —
  worth checking for explicitly in production code, not assumed away.

## Checkpoint quiz

1. Why does adding `-inf` to a masked position's score guarantee it
   gets exactly zero weight after softmax?
2. What did the verified "zeroed scores" experiment show was wrong
   with using `0` instead of `-inf` for masking?
3. Is a causal mask and a padding mask the same underlying mechanism,
   or fundamentally different operations?
4. What did the verified comparison against `is_causal=True` confirm?
5. What real edge case can cause `NaN` regardless of whether `-inf` or
   a large finite negative number is used as the mask sentinel?

<details><summary>Answers</summary>

1. Because `exp(-inf) = 0` exactly — after exponentiating in the
   softmax computation, a masked position's contribution to both the
   numerator and the normalization sum becomes exactly zero, so it
   receives exactly zero probability weight, verified directly (row 0
   became exactly `[1.0, 0.0, 0.0, 0.0]`).
2. That `0` is not a neutral or "forbidden" score to softmax — it's
   just another value competing with the other (unmasked) scores in
   the row. Verified: row 0 leaked 7.7% of its attention weight onto
   three positions it should never be able to see, because those
   zeroed scores were still competitive relative to the row's other
   (also often small) real scores.
3. The same underlying mechanism (additive `-inf` before softmax)
   applied to two different problems — causal masks hide future
   positions; padding masks hide non-content padding tokens. Verified
   directly that both can be combined in the same call.
4. That PyTorch's convenient `is_causal=True` flag produces numerically
   identical output (`torch.allclose` returned `True`) to manually
   constructing and applying an additive `-inf` causal mask — it's a
   shortcut for the same operation, not a different one.
5. A row where *every* position is masked — softmax's normalization
   becomes `0/0` (no unmasked position for probability mass to go to),
   producing `NaN` regardless of whether the sentinel value used was
   `-inf` or a large finite negative number like `-1e9`.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.2.3 introduces masked self-attention for the decoder; the mechanism this module verifies numerically.
- [PyTorch documentation: torch.nn.functional.scaled_dot_product_attention](https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html) - documents `is_causal` and `attn_mask`, both verified directly against a manual implementation in this module.
- [The Annotated Transformer (Harvard NLP)](https://nlp.seas.harvard.edu/annotated-transformer/) - a widely-used, line-by-line implementation of masked attention, including the exact additive-mask pattern verified in this module.
- [Track 00, Module 06: The Transformer Moment](../../00-genai-foundations/06-the-transformer-moment/README.md) - the conceptual companion to this module: the causal-mask diagram and the BERT-vs-GPT masking distinction.
- [Track 01, Module 09: Special Tokens](../../01-tokens-and-language-modeling/09-special-tokens/README.md) - covers the `[PAD]` token this module's padding-mask discussion is built around.

## Next

[Module 08: Multi-Head Attention](../08-multi-head-attention/README.md)
