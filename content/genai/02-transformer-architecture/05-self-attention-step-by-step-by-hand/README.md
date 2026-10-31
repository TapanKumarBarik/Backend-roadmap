# Module 05: Self-Attention Step by Step, By Hand

## Why this matters

Modules 01-04 built every individual piece: dot products, matrix
multiplication, embeddings, why Q/K/V need separate projections. This
module assembles all of them into one complete, fully worked
self-attention computation on a tiny 3-token example — every
intermediate matrix printed — and then verifies the entire by-hand
result against PyTorch's real, production `scaled_dot_product_attention`
function. If every number in this module matches, there is nothing left
mysterious about what a transformer's core operation actually computes;
modules 06-08 only add batching, masking, and multiple heads on top of
exactly this.

## Concepts

### The full pipeline, on one small example

Three tokens, `d_model = 4`:

```python
import numpy as np

np.random.seed(42)
X  = np.round(np.random.randn(3, 4), 2)
Wq = np.round(np.random.randn(4, 4), 2)
Wk = np.round(np.random.randn(4, 4), 2)
Wv = np.round(np.random.randn(4, 4), 2)

Q, K, V = X @ Wq, X @ Wk, X @ Wv
```

Verified `Q`, `K`, `V` (each row is one token's projected vector):

```
Q:
[[ 0.396 -0.981 -2.435 -0.428]
 [ 2.084  0.089 -0.17  -1.498]
 [-1.081  1.119  0.825 -0.024]]

K:
[[ 0.963 -1.012 -1.462  0.77 ]
 [ 1.042 -2.655 -2.244 -0.06 ]
 [-0.168  0.386  1.393 -1.479]]

V:
[[-2.506 -0.188  0.896  2.679]
 [-1.459  1.296  1.914  2.07 ]
 [ 1.587 -0.747 -0.24  -1.597]]
```

### Step 1 — raw scores: every query against every key

```python
scores = Q @ K.T
```

Verified output — a 3x3 matrix, entry `(i, j)` is query token `i`'s
raw dot product (module 01) against key token `j`:

```
[[ 4.604  8.508 -3.204]
 [ 1.011  2.405  1.664]
 [-3.398 -5.949  1.797]]
```

### Step 2 — scale by `sqrt(d_k)`

```python
d_k = Q.shape[-1]     # 4
scaled = scores / np.sqrt(d_k)
```

Verified output (module 07 covers exactly *why* this division is
necessary — previewed here as a step, not yet justified):

```
[[ 2.302  4.254 -1.602]
 [ 0.506  1.203  0.832]
 [-1.699 -2.974  0.899]]
```

### Step 3 — softmax, row by row

```python
def softmax(x, axis=-1):
    e = np.exp(x - np.max(x, axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

weights = softmax(scaled, axis=-1)
```

Verified output — every row sums to exactly `1.0` (module 15's softmax
treatment applies directly here, one row per query token):

```
[[0.124 0.873 0.003]
 [0.228 0.457 0.315]
 [0.068 0.019 0.913]]
row sums: [1. 1. 1.]
```

Read row 0: token 0 puts 87.3% of its attention weight on token 1, only
12.4% on token 0, and essentially none (0.3%) on token 2 — this is
exactly the kind of alignment pattern track 00 module 05's translation
example showed, just on synthetic numbers instead of real words.

### Step 4 — weighted sum of values

```python
output = weights @ V
```

Verified output — each row is a weighted blend of all three value
vectors, using that row's attention weights:

```
[[-1.5813  1.1064  1.7821  2.1362]
 [-0.7367  0.3136  1.0029  1.0518]
 [ 1.2507 -0.6701 -0.1218 -1.2369]]
```

This is self-attention's complete output: three tokens in, three
new vectors out, each one a content-aware blend of the *whole
sequence*, not just its own original embedding.

### Verified against PyTorch's real implementation

The entire hand-computed pipeline above is cross-checked against
`torch.nn.functional.scaled_dot_product_attention` — the actual,
optimized function real model code calls:

```python
import torch
import torch.nn.functional as F

Qt, Kt, Vt = torch.tensor(Q), torch.tensor(K), torch.tensor(V)
torch_out = F.scaled_dot_product_attention(
    Qt.unsqueeze(0), Kt.unsqueeze(0), Vt.unsqueeze(0)
).squeeze(0)
print(np.allclose(output, torch_out.numpy(), atol=1e-6))
```

Verified output: **`True`**. The by-hand result, computed four
explicit steps at a time with printable intermediate matrices, matches
PyTorch's real, production attention implementation to numerical
precision. There is no hidden extra step, no simplification lost along
the way — `scaled_dot_product_attention` is doing exactly steps 1-4
above, just faster and batched.

## Reference

```
 Step   Operation                    Shape (3 tokens, d_model=4)
 ────   ──────────────────────       ────────────────────────────
 0       Q = X@Wq, K = X@Wk,          Q, K, V: (3, 4) each
         V = X@Wv
 1       scores = Q @ K.T             (3, 3) — every query vs every key
 2       scaled = scores / sqrt(d_k)  (3, 3) — same shape, rescaled
 3       weights = softmax(scaled,     (3, 3) — each row sums to 1
         axis=-1)
 4       output = weights @ V          (3, 4) — back to token-vector shape
```

## Hands-on exercises

### Exercise 1 — reproduce the entire pipeline

Run every line of code above, in order, and confirm each intermediate
matrix matches what's printed here. Then verify the final
`torch.allclose` check returns `True`.

### Exercise 2 — trace one row by hand with a calculator

Pick row 0 of `scores` (`[4.604, 8.508, -3.204]`). By hand (or with a
plain calculator, not NumPy), divide each by `sqrt(4) = 2`, exponentiate
each result, sum them, and divide each exponentiated value by that sum.
Confirm you arrive at `[0.124, 0.873, 0.003]` — the exact weights row
verified above — connecting every number to an explicit arithmetic step
rather than a library call.

### Exercise 3 — change one input and predict the effect before running it

Before running any code, predict: if you increased `X`'s first token's
values so it becomes very different from the other two tokens, would
you expect its attention weights (row 0 of `weights`) to become more
concentrated on one token, or more spread out? Then actually modify `X`
and re-run the pipeline to check your prediction, and explain the
result using module 01's dot-product-as-alignment framing.

## Independent challenge

Extend this module's 3-token example to 6 tokens (larger `X`, `Wq`,
`Wk`, `Wv` matrices, same process), and identify, from the resulting
weights matrix, which pair of tokens attends most strongly to each
other. Then swap two rows of `X` (simulating two tokens changing
places) and re-run the full pipeline. Using module 03's
permutation-equivariance finding, predict what should happen to the
weights and output matrices before checking — and confirm your
prediction against the actual result.

<details><summary>Discussion</summary>

Per module 03's verified permutation-equivariance property, swapping
two rows of `X` should produce a weights matrix and output that are
exactly the row/column-permuted version of the original — the same
relationships computed, just relabeled to match the new token order.
Confirming this directly on your own 6-token example (rather than the
abstract proof in module 03) is a good check that the full step-by-step
pipeline built here behaves consistently with that earlier, more
general result.

</details>

## Common mistakes & troubleshooting

- **Forgetting to scale by `sqrt(d_k)` before softmax.** Verified above
  as step 2 — skipping it doesn't break the shapes or crash anything,
  but produces a different (and, per module 07, often badly-behaved)
  weights matrix. Module 07 covers precisely why this scaling step
  matters.
- **Applying softmax along the wrong axis.** Weights must sum to 1
  **per query row** (`axis=-1` in this module's code) — applying it
  along the wrong axis silently produces a matrix that looks
  superficially similar but doesn't represent valid per-token attention
  distributions.
- **Assuming a hand-computed small example doesn't generalize to real
  library code.** Verified directly above: the four explicit steps
  match PyTorch's actual `scaled_dot_product_attention` exactly — real
  implementations aren't doing anything conceptually different, just
  batched and optimized.

## Checkpoint quiz

1. List the four steps of the self-attention pipeline verified in this
   module, in order.
2. What must be true of every row of the `weights` matrix after
   softmax, and why?
3. What did the verified `torch.allclose` check confirm about the
   relationship between this module's by-hand computation and
   PyTorch's real implementation?
4. In the verified example, which token did token 0 attend to most
   strongly, and what fraction of its attention weight went there?
5. What shape does the final `output` matrix have, relative to the
   original input `X`? Why does that shape match matter?

<details><summary>Answers</summary>

1. (1) Compute raw scores as `Q @ K.T`; (2) scale by dividing by
   `sqrt(d_k)`; (3) apply softmax per row to get normalized attention
   weights; (4) compute the weighted sum of value vectors as
   `weights @ V`.
2. Each row must sum to exactly `1.0` — verified directly (`row sums:
   [1. 1. 1.]`) — because each row represents one query token's
   probability distribution over which other tokens to draw
   information from, and a valid probability distribution must sum to 1.
3. That the by-hand, step-by-step computation is not a simplified
   approximation — it matches PyTorch's actual, production
   `scaled_dot_product_attention` function to numerical precision
   (`atol=1e-6`), confirming the four explicit steps are exactly what
   the real, optimized implementation computes underneath.
4. Token 1, with 87.3% of its attention weight — verified directly in
   the `weights` matrix's first row (`[0.124, 0.873, 0.003]`).
5. The same shape as the input `X` — `(3, 4)`, three tokens each with a
   `d_model`-length vector. This matters because it means
   self-attention's output can be fed into further processing (module
   12's feed-forward network, or another stacked attention layer,
   module 16) exactly like any other token-vector sequence — attention
   transforms token representations without changing their shape or
   count.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.2.1's scaled dot-product attention formula is exactly the four steps verified by hand in this module.
- [PyTorch documentation: torch.nn.functional.scaled_dot_product_attention](https://pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html) - the real, production implementation this module's hand-computed result is verified against.
- [The Illustrated Transformer (Jay Alammar)](https://jalammar.github.io/illustrated-transformer/) - a widely-used visual walkthrough of the same four-step pipeline, useful alongside this module's printed numeric matrices.
- [Track 02, Module 04: Queries, Keys and Values](../04-queries-keys-and-values/README.md) - covers why Q, K, V need separate learned projections, the mechanism this module assembles into a full pipeline.
- [Track 02, Module 01: The Math You Actually Need](../01-the-math-you-actually-need-vectors-matrices-dot-products/README.md) - the dot-product and matrix-multiplication building blocks every step of this module's pipeline is built from.

## Next

[Module 06: Scaled Dot-Product Attention](../06-scaled-dot-product-attention/README.md)
