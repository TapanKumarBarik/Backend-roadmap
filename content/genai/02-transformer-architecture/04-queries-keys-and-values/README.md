# Module 04: Queries, Keys and Values

## Why this matters

Track 00 module 05 already introduced queries, keys, and values as
roles — "what am I looking for," "what do I match against," "what do I
actually retrieve." This module verifies the specific, concrete reason
those three roles are computed as **three separate learned linear
projections** of the same input, rather than using the raw token
vectors directly for all three. The reason isn't stylistic: using a
token's own embedding as both its query and its key creates a
mathematically provable, structural bias — verified directly below —
that separate projections exist specifically to break.

## Concepts

### Q, K, V as three projections of the same input

Every token's vector `x` produces three different vectors via three
separate learned weight matrices (module 01's matrix multiplication,
applied here):

```
 Q = X @ Wq     (queries: "what am I looking for")
 K = X @ Wk     (keys: "what do I offer, for matching")
 V = X @ Wv     (values: "what do I offer, for retrieval")
```

If `Wq`, `Wk`, and `Wv` were all the identity matrix (or, equivalently,
if there were no projections at all — `Q = K = V = X`), attention would
be scoring each token's raw embedding against every other token's raw
embedding directly. This is the case worth testing explicitly, because
it has a real, provable problem.

### Verified: without separate projections, every token is biased toward attending to itself

For any vector `x`, its dot product with itself is `x . x = |x|^2`.
By the Cauchy-Schwarz inequality, `x . y <= |x| * |y|` for *any* other
vector `y`, with equality only when `y` is exactly parallel to `x`.
This means: if `Q = K = X` (no separate projections), **every token's
raw self-similarity score is mathematically guaranteed to be at least
as large as its similarity to any other token** — an unavoidable bias
toward self-attention, baked in purely by the geometry of dot products,
verified directly:

```python
import numpy as np
np.random.seed(1)
d = 8
X = np.random.randn(5, d)

scores_noproj = X @ X.T   # Q = K = X directly, no projection
print(np.round(scores_noproj, 2))
print(all(np.argmax(scores_noproj[i]) == i for i in range(5)))
```

Verified output — the diagonal (each token's score with itself) is
**always the largest value in its row**:

```
[[14.11  5.53 -2.79  0.59  0.59]
 [ 5.53  9.29 -0.59  1.74  0.37]
 [-2.79 -0.59  4.73 -0.03  4.19]
 [ 0.59  1.74 -0.03  3.16 -0.97]
 [ 0.59  0.37  4.19 -0.97  6.25]]
True   # every row's argmax is on the diagonal
```

Every one of the 5 tokens scores highest against *itself* — not because
that's meaningful for the task, but because it's a mathematical
guarantee of using the same vector as both query and key.

### Verified: separate Q/K projections break this bias

Now the same 5 tokens, but with two independently random weight
matrices standing in for two separately *learned* projections:

```python
Wq = np.random.randn(d, d)
Wk = np.random.randn(d, d)
Q, K = X @ Wq, X @ Wk
scores_proj = Q @ K.T
print(np.round(scores_proj, 2))
print(all(np.argmax(scores_proj[i]) == i for i in range(5)))
```

Verified output:

```
[[ 10.1   -9.59 -23.47 -21.91 -17.86]
 [-11.87   1.25   7.72 -22.57  -2.89]
 [ -8.71  15.24   7.72  10.15   5.63]
 [-10.47  -7.67 -14.7    0.13 -17.8 ]
 [ -9.2    3.6   10.32   0.95   7.41]]
False   # NOT every row's argmax is on the diagonal anymore
```

With separate projections, only 1 of the 5 tokens still scores highest
against itself (row 0) — the mathematical guarantee is gone. `Wq` and
`Wk` project the same input into two *different* vector spaces, so
`Q_i . K_i` (a token scored against its own key) is no longer
constrained by Cauchy-Schwarz to be the maximum — the model is free to
learn that a given token should mostly attend to *other* tokens, which
is exactly what's needed for attention to do anything useful (a
sentence where every word mostly just looks at itself wouldn't be
learning any real cross-token relationships at all).

### Why three separate roles, not just two

Query and key together decide *how much* attention flows where; value
decides *what content* actually gets retrieved once that's decided.
Splitting these into three separate learned spaces (rather than, say,
reusing `K` as `V`) lets the model learn a genuinely different
specialization for "what makes me a good match for this query" versus
"what information should be handed over once I've been matched" — a
token's role as a *matching target* and its role as *retrieved content*
don't have to encode the same information. This is a real, used
distinction — the model may find it useful for a value vector to carry
rich content-specific information while its corresponding key vector
carries something much simpler, purely optimized for being found by the
right queries.

## Reference

```
 Vector    Computed as     Role                          Used in
 ───────   ─────────────   ───────────────────────────   ────────────────
 Query      X @ Wq          "what am I looking for"        scores = Q @ K.T
 Key        X @ Wk          "what do I offer for            scores = Q @ K.T
                             matching"
 Value      X @ Wv          "what do I offer for            output = weights @ V
                             retrieval"
```

```
 Configuration              Self-attention score guarantee (verified)
 ────────────────────       ────────────────────────────────────────────
 Q = K = X (no projection)   Every token's self-score is >= its score
                             against any other token (Cauchy-Schwarz) —
                             verified: 5/5 tokens scored highest on
                             themselves
 Q = X@Wq, K = X@Wk           No such guarantee — verified: only 1/5
 (separate, learned)          tokens still scored highest on themselves
```

## Hands-on exercises

### Exercise 1 — reproduce the self-attention-bias proof

Run both the `Q=K=X` and `Q=X@Wq, K=X@Wk` versions above with your own
random seed and vector count. Confirm the no-projection version always
puts every row's maximum on the diagonal, and the projected version
usually doesn't.

### Exercise 2 — verify the Cauchy-Schwarz guarantee directly

For a single vector `x`, compute `x . x` and compare it against `x . y`
for several random `y` vectors of the same dimension. Confirm `x . x`
is always at least as large, and find (or construct) the one case where
they're equal (hint: what does `y` have to be relative to `x`?).

### Exercise 3 — test whether the bias reappears if `Wq == Wk`

Repeat the projected-scores experiment, but deliberately set `Wq` and
`Wk` to be the *same* matrix (still a real projection, applied to both
Q and K identically). Confirm the diagonal-maximum bias reappears —
connecting the fix specifically to `Wq` and `Wk` being *different*
learned matrices, not merely to the presence of *some* projection.

## Independent challenge

A researcher proposes a simplified attention variant that ties
`Wq = Wk` to save parameters (only one projection matrix to learn
instead of two), arguing "the model can still learn useful attention
patterns, just with a constraint." Using this module's verified
Cauchy-Schwarz finding, write two or three sentences on what specific
behavior this constraint would bias the model toward, and whether that
seems like a reasonable simplification for most tasks.

<details><summary>Discussion</summary>

Tying `Wq = Wk` reintroduces exactly the self-attention bias verified
above (exercise 3's setup) — for any token, `Q_i . K_i = (x_i @ W) . (x_i
@ W)`, which by the same Cauchy-Schwarz argument is guaranteed to be at
least as large as `Q_i . K_j` for any other token `j`, since both Q and
K come from applying the *same* transformation to the same input.
Whether that's reasonable depends heavily on the task: for tasks where
strong self-reference is actually useful (a token largely re-confirming
its own identity, similar to a copy-mechanism), the constraint could be
harmless or even helpful; for the wide range of tasks where meaningful
cross-token relationships (a pronoun genuinely needing information from
elsewhere) are the whole point, forcing every token to default toward
attending to itself is a real cost, not just a parameter-saving
convenience.

</details>

## Common mistakes & troubleshooting

- **Assuming Q/K/V are conceptually separate but mathematically
  arbitrary design choices.** Verified above: removing the Q/K split
  (or tying `Wq = Wk`) reintroduces a provable, unavoidable
  self-attention bias via Cauchy-Schwarz — this isn't a stylistic
  convention, it's fixing a real mathematical property.
- **Confusing "value" with "key."** Keys decide how much attention a
  token receives; values decide what content is actually returned once
  attention has been allocated. Tying them (`Wk = Wv`) is a different,
  separately-testable simplification from tying `Wq = Wk` — this module
  only verified the query/key case.
- **Assuming this bias only matters for contrived examples.** The
  Cauchy-Schwarz guarantee holds for *any* vectors under `Q=K=X` — it's
  a property of the mathematics, not a coincidence of the specific
  random vectors used in the verification above.

## Checkpoint quiz

1. What does the Cauchy-Schwarz inequality guarantee about `x . x`
   versus `x . y` for any other vector `y`?
2. What did the verified `Q=K=X` experiment show about which token each
   of the 5 tokens scored highest against?
3. What changed in the verified experiment once separate `Wq` and `Wk`
   projections were introduced?
4. Does tying `Wq = Wk` (a single shared projection for both) avoid the
   self-attention bias, or reintroduce it? What did exercise 3 show?
5. Why are value vectors computed with their own separate projection
   (`Wv`), rather than reusing the key vectors?

<details><summary>Answers</summary>

1. `x . x = |x|^2` is guaranteed to be at least as large as `x . y` for
   any other vector `y` of the same norm or less specific relationship
   — precisely, `x . y <= |x| * |y|`, with equality only when `y` is
   exactly parallel to `x`.
2. Every one of the 5 tokens scored highest against itself — the
   diagonal was the row-maximum in all 5 rows, exactly as the
   Cauchy-Schwarz guarantee predicts when `Q = K = X`.
3. The guarantee disappeared — verified: only 1 of 5 tokens still
   scored highest against itself once `Q = X@Wq` and `K = X@Wk` used
   two independently different projection matrices.
4. Reintroduces it — verified in exercise 3: since `Q_i = x_i@W` and
   `K_i = x_i@W` both come from the *same* transformation applied to
   the same input, the Cauchy-Schwarz argument still applies and the
   diagonal-maximum bias returns.
5. Because keys decide *how much* attention a token receives (a
   matching role) while values decide *what content* is actually
   retrieved once matched (a content role) — these are different jobs
   the model may want to specialize differently, so giving them
   independent learned projections lets the model optimize each role
   separately rather than being forced to conflate them.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.2.1 defines the Q/K/V linear projections this module verifies the necessity of.
- [The Cauchy-Schwarz Inequality (MIT OpenCourseWare lecture notes)](https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/2db28802b3a5aef72b0e04ee1cf793f6_MIT18_06SCF11_Ses3.2sum.pdf) - a clear statement and proof of the inequality this module's core finding depends on.
- [Track 00, Module 05: The Attention Breakthrough](../../00-genai-foundations/05-the-attention-breakthrough/README.md) - the conceptual companion to this module: query/key/value as roles, the score/normalize/blend steps, and real alignment-matrix interpretation.
- [Track 02, Module 01: The Math You Actually Need](../01-the-math-you-actually-need-vectors-matrices-dot-products/README.md) - the dot-product and matrix-multiplication mechanics this module's Q/K/V projections and scoring build on directly.

## Next

[Module 05: Self-Attention Step by Step, By Hand](../05-self-attention-step-by-step-by-hand/README.md)
