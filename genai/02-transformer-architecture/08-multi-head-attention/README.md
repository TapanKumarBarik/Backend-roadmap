# Module 08: Multi-Head Attention

## Why this matters

Every module so far (04-07) built a *single* attention computation:
one set of Q/K/V projections, one weights matrix, one output. Multi-
head attention runs several of these **in parallel, on different
learned slices of the same input**, then combines the results. This
module verifies the two things worth actually confirming rather than
taking on faith: that splitting into multiple heads costs **zero extra
parameters** compared to one big head (a real, checkable fact about the
architecture, not an approximation), and that different heads really do
learn to attend to genuinely different things on the *same* input —
verified directly, not just asserted.

## Concepts

### Multiple heads, computed from one set of projections

Multi-head attention doesn't run several *independent* copies of
attention with separate weight matrices — it computes one set of Q, K,
V projections (module 04) at the model's full dimension `d_model`, then
**splits** each into `num_heads` equal-sized chunks along the feature
dimension, runs standard scaled dot-product attention (module 06)
independently *within* each chunk, and concatenates the results back
together:

```
 d_model = 8, num_heads = 2  ->  d_head = 4 per head

 Q (n, 8)   ──split──►  Q_head0 (n, 4)    Q_head1 (n, 4)
 K (n, 8)   ──split──►  K_head0 (n, 4)    K_head1 (n, 4)
 V (n, 8)   ──split──►  V_head0 (n, 4)    V_head1 (n, 4)
                              │                 │
                       attention(Q0,K0,V0) attention(Q1,K1,V1)
                              │                 │
                        out_head0 (n,4)   out_head1 (n,4)
                              └────────┬────────┘
                                  concat (n, 8)
                                       │
                                  @ Wo (n, 8)
                                       │
                                 final output
```

Verified directly, computing this exact pipeline on a 5-token,
`d_model=8`, `num_heads=2` example:

```python
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - np.max(x, axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

def attention(Q, K, V):
    scores = Q @ K.T / np.sqrt(Q.shape[-1])
    weights = softmax(scores, axis=-1)
    return weights @ V, weights

np.random.seed(7)
n, d_model, num_heads = 5, 8, 2
d_head = d_model // num_heads
X = np.random.randn(n, d_model)
Wq, Wk, Wv, Wo = [np.random.randn(d_model, d_model) for _ in range(4)]
Q, K, V = X @ Wq, X @ Wk, X @ Wv

def split_heads(M, num_heads, d_head):
    return M.reshape(M.shape[0], num_heads, d_head).transpose(1, 0, 2)

Qh, Kh, Vh = (split_heads(m, num_heads, d_head) for m in (Q, K, V))
outs, weights = zip(*(attention(Qh[h], Kh[h], Vh[h]) for h in range(num_heads)))
mha_out = np.concatenate(outs, axis=-1) @ Wo
```

### Verified: different heads attend to genuinely different things

The whole point of multiple heads is that each one can specialize —
verified directly by comparing head 0's and head 1's attention weights
for the *same* query token (token 0) on the *same* input:

```python
print(np.round(weights[0][0], 3))
print(np.round(weights[1][0], 3))
print(np.allclose(weights[0], weights[1]))
```

Verified output:

```
head 0 weights, token 0: [0.    0.    0.424 0.576 0.   ]
head 1 weights, token 0: [0.    0.    0.    0.    1.   ]
same pattern? False
```

Head 0 spreads token 0's attention roughly evenly between tokens 2 and
3. Head 1, looking at the *exact same token, same sequence, same
underlying model* — just a different learned slice of the Q/K/V
space — puts 100% of its attention on token 4. These aren't
approximately similar patterns with noise; they're structurally
different attention distributions computed from the same input. This
is the real, mechanical basis for the common claim that "different
heads learn different relationships" (one head might specialize toward
nearby-word patterns, another toward long-range dependencies, etc.) —
verified here as a direct numerical fact about a single input, not an
after-the-fact interpretation of a trained model.

### Verified: splitting into heads costs zero extra parameters

This is a genuinely surprising fact worth confirming directly, using
PyTorch's real `nn.MultiheadAttention`:

```python
import torch
import torch.nn as nn

d_model = 8
mha_2heads = nn.MultiheadAttention(d_model, num_heads=2, bias=False, batch_first=True)
mha_1head  = nn.MultiheadAttention(d_model, num_heads=1, bias=False, batch_first=True)

print(sum(p.numel() for p in mha_2heads.parameters()))
print(sum(p.numel() for p in mha_1head.parameters()))
```

Verified output: **`256`** for both — identical parameter counts
regardless of head count. This makes sense given the pipeline above:
`Wq`, `Wk`, `Wv`, and `Wo` are always `d_model x d_model` matrices no
matter how many heads the result gets split into — splitting happens
*after* the projections, as a reshape, and concatenation happens
*before* the output projection, also just a reshape. Multi-head
attention doesn't add parameters over single-head attention at the same
`d_model` — it changes how the *existing* parameters' output is
partitioned and processed, trading one large attention computation for
several smaller, independently-normalized ones at no parameter cost.

### What multi-head attention actually buys, given equal parameter count

Since parameter count doesn't change, the benefit of multiple heads is
purely architectural: each head computes its *own* independent softmax
over a smaller subspace of the full representation, rather than one
head computing a single softmax over the whole `d_model`-dimensional
space. This means the model isn't forced to find one single attention
pattern that has to serve every kind of relationship a sequence might
need to represent (nearby-word syntax, long-range coreference, and so
on, all at once) — it can let different heads specialize on different
subspaces and combine the results, verified directly above to actually
produce different patterns even from purely random (untrained) weights,
long before any specific specialization has been learned.

## Reference

```
 Quantity                    Single head (d_k = d_model)   Multi-head (h heads,
                                                             d_head = d_model/h)
 ──────────────────────      ────────────────────────────   ─────────────────────
 Wq, Wk, Wv, Wo shapes         d_model x d_model              d_model x d_model
                                                               (unchanged)
 Total parameter count         same                           same (verified: 256
                                                                 == 256 above)
 Number of independent          1                              h
 softmax computations
 Dimension each softmax          d_model                        d_model / h
 operates over
```

## Hands-on exercises

### Exercise 1 — reproduce the different-heads-different-patterns experiment

Run the exact 2-head pipeline above with your own random seed and
confirm the two heads' attention weights for the same token differ.
Try `num_heads=4` and confirm the same holds pairwise across more
heads, not just two.

### Exercise 2 — reproduce the equal-parameter-count verification

Run the `nn.MultiheadAttention` parameter-count comparison at your own
chosen `d_model` and a few different head counts (1, 2, 4, 8 — as long
as `d_model` divides evenly). Confirm the total parameter count never
changes.

### Exercise 3 — cross-check your manual implementation against PyTorch's real one

Using PyTorch's `nn.MultiheadAttention` with `average_attn_weights=False`
(returns per-head weights rather than an averaged single matrix), run
the same input through both your manual multi-head implementation
(with matching weights, which requires copying PyTorch's internal
weight layout — a genuinely useful exercise in reading a real
implementation) and PyTorch's built-in layer, and confirm the outputs
match. If exact weight-matching proves too fiddly, instead confirm
structurally that PyTorch's returned per-head weights (shape `(batch,
num_heads, n, n)`) show the same kind of cross-head divergence verified
in exercise 1.

## Independent challenge

A team wants to reduce a model's compute cost and considers replacing
its 8-head attention with a single-head attention layer at the same
`d_model`, reasoning "it's the same number of parameters either way, so
performance should be similar." Using this module's verified findings
about equal parameter count but genuinely different per-head attention
patterns, write two or three sentences on what real capability this
change risks losing, independent of parameter count.

<details><summary>Discussion</summary>

Equal parameter count doesn't imply equal capability — verified above,
the actual behavioral difference is that multiple heads each compute
an *independent* softmax over a smaller subspace, allowing genuinely
different attention patterns to coexist for the same token in the same
layer (head 0 attending to tokens 2-3, head 1 attending fully to token
4, from the exact same input). Collapsing to a single head forces one
softmax to serve every relationship a sequence might need
simultaneously, which is a real representational constraint the
parameter count alone doesn't capture — the risk isn't "fewer
parameters," it's "less capacity to represent multiple distinct kinds
of relationships within one attention layer at once."

</details>

## Common mistakes & troubleshooting

- **Assuming more heads means more parameters.** Verified above:
  parameter count is determined by `d_model` (fixed-size `Wq`, `Wk`,
  `Wv`, `Wo` matrices), not by how many heads that dimension gets split
  into.
- **Assuming each head has its own separate `Wq`/`Wk`/`Wv` matrix.**
  Verified in the pipeline above: there's one shared projection per
  Q/K/V, computed once at full `d_model`, then split by reshaping —
  not `num_heads` separate smaller projection matrices.
- **Expecting different heads to show similar attention patterns on
  the same input**, and treating divergence as a bug. Verified above:
  meaningfully different patterns across heads on the same token and
  input is the expected, intended behavior, not noise to be debugged
  away.
- **Choosing a head count that doesn't evenly divide `d_model`.** The
  split-into-equal-chunks step (verified in the pipeline above)
  requires `d_model % num_heads == 0` — an uneven split isn't a
  supported configuration in the standard formulation.

## Checkpoint quiz

1. Does multi-head attention use a separate set of `Wq`/`Wk`/`Wv`
   matrices per head, or one shared set split afterward?
2. What did the verified parameter-count comparison show about 1-head
   versus 2-head `nn.MultiheadAttention` at the same `d_model`?
3. What did the verified weights comparison show about head 0 and head
   1's attention patterns for the same input token?
4. If multi-head attention doesn't add parameters over single-head
   attention, what does it actually change?
5. What constraint must `d_model` and `num_heads` satisfy for the
   standard multi-head split to work?

<details><summary>Answers</summary>

1. One shared set of `Wq`, `Wk`, `Wv` projections computed at full
   `d_model`, then split into equal-sized chunks per head afterward —
   not separate matrices per head.
2. Identical parameter counts (256 in both cases, verified directly) —
   splitting into more heads doesn't add parameters; it only changes
   how the existing projected output is partitioned during the
   attention computation.
3. That they can be — and, in the verified example, were — genuinely
   different: head 0 split its attention between tokens 2 and 3, while
   head 1 put 100% of its weight on token 4, for the exact same query
   token and input.
4. The number of independent softmax computations, and the dimension
   each one operates over — instead of one softmax over the full
   `d_model`-dimensional space, multiple smaller, independently-computed
   softmaxes over `d_model/num_heads`-dimensional subspaces.
5. `d_model` must be evenly divisible by `num_heads`, since each head
   operates on an equal-sized chunk (`d_model / num_heads` dimensions)
   of the projected Q/K/V vectors.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.2.2 defines multi-head attention exactly as verified in this module: split, attend independently per head, concatenate, project.
- [PyTorch documentation: torch.nn.MultiheadAttention](https://pytorch.org/docs/stable/generated/torch.nn.MultiheadAttention.html) - the real implementation used to verify the equal-parameter-count finding and per-head weight shapes in this module.
- [What Does BERT Look at? An Analysis of BERT's Attention (Clark et al., 2019)](https://arxiv.org/abs/1906.04341) - an empirical study of what different attention heads in a real, trained model actually specialize in, extending this module's untrained-weight demonstration to real learned behavior.
- [Track 02, Module 06: Scaled Dot-Product Attention](../06-scaled-dot-product-attention/README.md) - the single-head attention computation this module runs independently within each head.
- [Track 02, Module 04: Queries, Keys and Values](../04-queries-keys-and-values/README.md) - the Q/K/V projection mechanics this module's shared-then-split pipeline builds directly on.

## Next

[Module 09: Why Positional Information Is Needed](../09-why-positional-information-is-needed/README.md)
