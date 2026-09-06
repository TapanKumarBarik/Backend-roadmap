# Module 01: The Math You Actually Need: Vectors, Matrices, Dot Products

## Why this matters

Every module from here through module 17's PyTorch implementation
rests on exactly three operations: the dot product, matrix
multiplication (which is just many dot products at once), and cosine
similarity (a normalized dot product). That's genuinely the whole
mathematical toolkit — no calculus, no eigenvalues, nothing from a
"linear algebra for machine learning" textbook beyond these three
ideas. This module builds each one from a plain Python loop first, then
shows the vectorized equivalent, verifying at each step that they
compute the identical result — so when module 04 introduces Q, K, V as
matrix multiplications, there's no mystery left in what "matrix
multiplication" is actually doing underneath.

## Concepts

### The dot product: one number that measures alignment

A dot product takes two equal-length vectors and returns a single
number: multiply corresponding entries, sum the products.

```python
def dot_loop(a, b):
    total = 0.0
    for x, y in zip(a, b):
        total += x * y
    return total

a = [1.0, 2.0, 3.0]
b = [4.0, 5.0, 6.0]
print(dot_loop(a, b))
```

Verified output: `32.0` — matching `np.dot(a, b)` and `a @ b` exactly
(all three verified to agree in this module's exercises). That
agreement matters: `np.dot` and `@` aren't a different operation that
happens to look similar — they're the identical mathematical
definition, just computed without an explicit Python loop.

### What the dot product actually measures: alignment, not just "a number"

The dot product is large and positive when two vectors point in similar
directions, near zero when they're roughly perpendicular, and negative
when they point in opposing directions. This is the entire reason
attention (module 04 onward) uses dot products at all: a query vector
and a key vector with a large dot product are, in a precise geometric
sense, "aligned" — pointing the same way in the vector space the model
learned.

### Cosine similarity: alignment, with magnitude divided out

A raw dot product conflates two things: how aligned two vectors are,
and how *long* they are. Cosine similarity divides those apart:

```
 cosine_similarity(a, b) = dot(a, b) / (||a|| * ||b||)
```

Verified on three illustrative embedding-like vectors:

```python
import numpy as np

def cosine_sim(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

king  = np.array([0.9, 0.1, 0.8])
queen = np.array([0.85, 0.15, 0.75])   # similar direction to king
truck = np.array([0.1, 0.9, 0.05])     # different direction
king_scaled = king * 5                  # same direction, 5x the magnitude

print(cosine_sim(king, queen))         # 0.9988
print(cosine_sim(king, truck))         # 0.2008
print(cosine_sim(king, king_scaled))   # 1.0
```

Verified output confirms both properties directly: `king` and `queen`
(similar direction) score `0.9988`, close to the maximum of `1.0`;
`king` and `truck` (different direction) score only `0.2008`; and
`king` versus a version of itself scaled 5x longer scores *exactly*
`1.0` — magnitude is completely divided out, only direction matters.
This is why cosine similarity, not raw dot product, is the standard
similarity measure for comparing embeddings (previewed here; a full
treatment of embedding spaces is module 02) — it isolates "do these
mean similar things" from "which vector happens to be longer."

### Matrix multiplication is just many dot products, done together

A matrix multiplication `A @ B` computes, for every row of `A` and
every column of `B`, their dot product — arranged into a result grid.
Verified directly, computing it the explicit way and comparing to
NumPy's `@`:

```python
A = np.random.randn(4, 3)
B = np.random.randn(3, 5)

manual = np.zeros((4, 5))
for i in range(4):
    for j in range(5):
        manual[i, j] = np.dot(A[i, :], B[:, j])

print(np.allclose(manual, A @ B))
```

Verified output: `True`. `A @ B`'s entry at position `(i, j)` is
*exactly* `dot(A's row i, B's column j)` — nothing more exotic is
happening. When module 04 computes attention scores as `Q @ K.T`, it is
computing, for every query row and every key row, their dot product —
literally this same operation, at the scale of an entire sequence at
once.

### Why vectorized matrix multiplication matters for speed

The naive triple-nested-loop implementation of matrix multiplication
computes the exact same result as a vectorized `@`, but far slower —
verified directly on two 50x50 matrices:

```python
import time

def naive_matmul(A, B):
    n, k = A.shape
    _, m = B.shape
    C = np.zeros((n, m))
    for i in range(n):
        for j in range(m):
            s = 0.0
            for x in range(k):
                s += A[i, x] * B[x, j]
            C[i, j] = s
    return C

A2, B2 = np.random.randn(50, 50), np.random.randn(50, 50)
t0 = time.perf_counter(); naive_matmul(A2, B2); t_naive = time.perf_counter() - t0
t0 = time.perf_counter(); A2 @ B2; t_vec = time.perf_counter() - t0
print(t_naive, t_vec, t_naive / t_vec)
```

Verified output: **~363x faster** for the vectorized version on this
50x50 example (16.43ms vs. 0.045ms). This isn't a NumPy-specific quirk —
it's the same reason GPUs are the hardware of choice for transformers
at every scale: matrix multiplication is *the* operation transformers
spend nearly all their compute on (attention's `Q @ K.T` and
`weights @ V`, and every linear layer in the feed-forward network,
module 12), and GPUs are architected specifically to perform many
independent multiply-accumulate operations (exactly what a matmul
needs) in parallel.

## Reference

```
 Operation             Formula                        Where it's used later
 ─────────────────     ──────────────────────────     ────────────────────────
 Dot product            sum(a_i * b_i)                  Attention scores
                                                          (module 04, 06, 07)
 Cosine similarity       dot(a,b) / (|a| * |b|)           Comparing embeddings
                                                          (module 02); vector
                                                          search (later tracks)
 Matrix multiplication   [dot(row_i, col_j) for          Q@K.T, weights@V
                          all i, j]                       (module 04-07);
                                                          every linear layer
                                                          (module 12)
```

## Hands-on exercises

### Exercise 1 — verify the three dot-product implementations agree

Run `dot_loop`, `np.dot`, and `@` on several vector pairs of your own
choosing, including at least one pair with negative numbers, and
confirm all three always agree exactly.

### Exercise 2 — build your own small embedding-like vectors and test cosine similarity

Construct 4-5 short vectors (3-4 dimensions each) representing concepts
you choose (e.g., three related words and one unrelated one), compute
all pairwise cosine similarities, and confirm the related concepts
score higher than the unrelated one — a hands-on preview of how real
word/sentence embeddings (module 02) are compared in practice.

### Exercise 3 — reproduce the naive-vs-vectorized matmul timing

Run the exact `naive_matmul` vs. `@` comparison at a few different
matrix sizes (try 10x10, 50x50, 200x200) and observe how the speedup
ratio changes as size grows. Connect this to why a transformer's
compute cost is dominated almost entirely by matrix multiplications
run on hardware built to accelerate exactly this operation.

## Independent challenge

A teammate suggests replacing a model's attention computation
(`Q @ K.T`, module 06-07) with a hand-written Python loop "since it
computes the same thing and would be easier to debug line by line."
Using this module's verified timing result, write two or three
sentences on why this would be a serious mistake for anything beyond a
toy example, and what you'd suggest instead for genuinely wanting to
inspect the computation step by step.

<details><summary>Discussion</summary>

The naive loop computes the mathematically identical result (verified
above), but at a roughly 363x slowdown on a small 50x50 example — real
attention computations run at far larger scale (sequence length x
sequence length x hidden dimension, potentially thousands x thousands),
where the same ratio would make a request that should take
milliseconds take minutes or hours, and would leave GPU hardware almost
entirely unused since it's built specifically to accelerate vectorized
matrix operations, not Python-level loops. For genuinely wanting to
inspect the computation, the better approach is running the vectorized
version but on deliberately small, printable inputs (exactly the
pattern this module and the following ones use) rather than a
line-by-line loop over production-scale data.

</details>

## Common mistakes & troubleshooting

- **Confusing dot product with cosine similarity.** A raw dot product
  is affected by vector magnitude (verified: scaling a vector 5x
  changes its dot product with anything, but not its cosine similarity
  with itself, which stays exactly 1.0) — use cosine similarity when
  magnitude shouldn't matter, raw dot product when it should (attention
  scores, module 06, deliberately use the raw dot product, and module
  07 covers exactly why scaling still matters there).
- **Assuming vectorized and loop-based implementations could give
  subtly different numeric results.** Verified above: `np.allclose`
  confirms they match exactly (modulo ordinary floating-point
  precision) — the vectorized version is a faster way to compute the
  identical mathematical operation, not an approximation of it.
- **Underestimating how much of a transformer's total compute is
  "just" matrix multiplication.** It's effectively all of it — the
  practical consequence is that hardware choice (GPU vs. CPU) and
  library choice (vectorized vs. naive loops) matter enormously, as
  verified by the ~363x gap above.

## Checkpoint quiz

1. What does the dot product compute, geometrically?
2. What does cosine similarity add on top of a raw dot product, and
   what did the verified `king`/`king_scaled` example show?
3. Is matrix multiplication a fundamentally different operation from
   the dot product, or built from it? What did the verified `manual`
   vs. `A @ B` comparison confirm?
4. Why was the vectorized matrix multiplication roughly 363x faster
   than the naive triple-loop version on the verified example, and why
   does that matter for real transformer workloads?
5. Why do attention scores (module 06) use raw dot products rather
   than cosine similarity?

<details><summary>Answers</summary>

1. How aligned two vectors are — large and positive for similar
   directions, near zero for roughly perpendicular vectors, negative
   for opposing directions.
2. It divides out vector magnitude, isolating pure directional
   alignment. Verified: `king` and a version of itself scaled 5x longer
   scored a cosine similarity of exactly `1.0` (same direction fully
   preserved), even though their raw dot product would differ
   substantially due to the magnitude change.
3. Built from it — matrix multiplication's entry at position `(i, j)`
   is exactly the dot product of the first matrix's row `i` and the
   second matrix's column `j`. Verified: a manually-computed
   dot-product-by-dot-product matrix exactly matched `A @ B` via
   `np.allclose`.
4. Vectorized matrix multiplication uses optimized, often
   hardware-accelerated routines instead of Python-level loops with
   per-element overhead. This matters because nearly all of a
   transformer's compute (attention scores, weighted value sums, every
   feed-forward layer) is matrix multiplication — the same speedup
   verified here at small scale is why GPUs (built to parallelize
   exactly this operation) are essential at real model scale.
5. Because attention deliberately wants magnitude to matter as part of
   the score (module 07 covers this precisely, including why the
   result is then divided by a scaling factor) — cosine similarity
   would throw away information the attention mechanism is designed to
   use.

</details>

## Further reading & sources

- [3Blue1Brown: Essence of Linear Algebra (video series)](https://www.3blue1brown.com/topics/linear-algebra) - an intuitive, visual treatment of vectors, dot products, and matrix multiplication, covering the same core ideas this module verifies numerically.
- [NumPy documentation: numpy.dot](https://numpy.org/doc/stable/reference/generated/numpy.dot.html) - the vectorized dot-product/matrix-multiplication implementation used throughout this module's verification code.
- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.2.1 defines scaled dot-product attention directly in terms of the matrix multiplications this module builds up from first principles.
- [Efficient Estimation of Word Representations in Vector Space (Mikolov et al., 2013)](https://arxiv.org/abs/1301.3781) - the Word2Vec paper (also cited in track 00 module 03); its famous "king - man + woman = queen" result is a direct, historical application of the cosine-similarity reasoning verified in this module.

## Next

[Module 02: Embeddings as Lookup Tables](../02-embeddings-as-lookup-tables/README.md)
