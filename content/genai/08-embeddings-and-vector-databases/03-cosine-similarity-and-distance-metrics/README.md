# Module 03: Cosine Similarity and Distance Metrics

## Roadmap

You are in Track 08, **Embeddings & Vector Databases**. [Module 00](../00-what-an-embedding-is/README.md) showed what an embedding is, [Module 01](../01-from-word2vec-to-sentence-embeddings/README.md) traced how they became sentence-level, and [Module 02](../02-embedding-models-compared/README.md) compared the models that produce them. This module is about the next step: once you hold two vectors, how is "similar" turned into a single number, and which number should you ask for?

After this module you can:

- compute dot product, cosine similarity, Euclidean (L2) and Manhattan (L1) distance by hand and in numpy, and say what each one keeps and what it ignores;
- state the two identities that hold for unit-length vectors and check them numerically;
- read "inner product", "cosine" or "L2" in a vector database's settings and predict whether your data will be ranked the way you think;
- decide whether to normalize, and pick a metric by checking how the embedding model was trained;
- write a vectorised exact top-k search and prove it matches a slow reference.

Why it matters: a wrong metric never raises an error. It quietly returns slightly worse neighbours, and you end up blaming the model or the chunking. Every database module later in this track ([pgvector](../10-pgvector-and-postgres/README.md), [Chroma](../11-chroma-and-local-development/README.md), [Qdrant](../12-pinecone-weaviate-and-qdrant/README.md)) asks you to choose a metric when you create the collection or index, and changing it later usually means rebuilding.

## Concept

> [!key] Every metric answers a different question about two vectors: cosine asks "do they point the same way?", dot product asks "same way, and how strongly?", and L2 / L1 ask "how far apart are their tips?". For unit-length vectors the first three are the same question in different units, so normalize once and the choice stops mattering; for anything else, use the metric the model was trained with.

## Explanation

### The four measures, in words and formulas

Treat each embedding as an arrow from the origin. Then:

| Measure | Formula | Better means | Sensitive to arrow length? |
| --- | --- | --- | --- |
| Dot product | `sum(a_i * b_i)` which equals `‖a‖ ‖b‖ cos θ` | larger | yes |
| Cosine similarity | `(a · b) / (‖a‖ ‖b‖)`, which equals `cos θ`, always in `[-1, 1]` | larger | no |
| Euclidean (L2) distance | `sqrt(sum((a_i - b_i)^2))` | smaller | yes |
| Manhattan (L1) distance | `sum(abs(a_i - b_i))` | smaller | yes |

Here `‖a‖` is the length of `a` (its L2 norm) and `θ` is the angle between the arrows. The scikit-learn guide describes cosine similarity as exactly "the L2-normalized dot product": divide each vector by its length, which puts it on the unit sphere, then take the dot product.

> [!model] Cosine compares compass headings and ignores how far each traveller walked. Dot product compares headings but also rewards the traveller who walked farther. L2 is the straight-line gap between where the two travellers ended up. L1 is the same gap measured along the grid streets of a city (a taxi's distance).

The first code block makes this concrete with a query `q = (3, 4)` and a copy of it that is twice as long. Same direction, different length, and the metrics disagree about whether that copy is "close".

### The two identities for unit-length vectors

Expand the squared L2 distance by multiplying out `(a - b) · (a - b)`:

`‖a - b‖² = ‖a‖² + ‖b‖² - 2 a·b`

This is true for **any** two vectors. Now suppose both have length 1. Then `‖a‖ = ‖b‖ = 1`, so the denominator of cosine is 1 and:

- **cosine = dot**, because `a·b / (1 · 1) = a·b`
- **L2² = 2 - 2·cos**, because `1 + 1 - 2 a·b = 2 - 2 cos θ`

Geometrically: two unit arrows and the chord between their tips form an isosceles triangle, and the chord's length is fixed by the angle alone.

The practical consequence is about *rankings*, not scores. `2 - 2·cos` goes down as cosine goes up, so sorting by cosine descending, by dot descending, and by L2 ascending returns the same documents in the same order. The scores themselves are different numbers: a cosine of 0.8 is an L2 distance of about 0.63 (`sqrt(0.4)`), so a threshold tuned for one metric does not transfer to another.

One more consequence: if the stored documents are unit length, the query's length does not matter for ranking. It multiplies every dot product by the same constant, and `L2² = ‖q‖² + 1 - 2 q·d` still falls as the dot product rises. Normalize queries anyway, so scores stay comparable with thresholds.

L1 gets **no** such identity. It is not a function of the angle, so even on unit vectors it can rank differently (block 6 shows cosine and L1 sharing only 5 of their top 10 on unit-length vectors).

> [!pitfall] The identities describe the vectors you actually store. If the database holds float16 copies, or you truncated vectors to their first few dimensions (Module 04 covers when that is safe), they are no longer exactly unit length and the ranking can drift. Check norms; do not assume.

> [!pitfall] `‖a‖² + ‖b‖² - 2 a·b` is also how libraries compute L2 fast with one matrix multiply, and it has a numerical trap. scikit-learn's [`euclidean_distances` documentation](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.pairwise.euclidean_distances.html) warns that the formula "potentially suffers from catastrophic cancellation": for near-duplicate vectors far from the origin you subtract two huge, nearly equal numbers and lose every useful digit. The fourth code block shows a case where float32 returns 0 for a true squared distance of 0.036.

### Normalization: what it does and what it costs

L2 normalization divides a vector by its own length. Afterwards it has length 1 and carries only direction. Do it **once at ingest** (and once per query) rather than inside every comparison; then cosine and dot product are the same computation, and the database can use its cheapest metric. Costs and traps:

- **Magnitude is gone.** If you store only the normalized vector, nothing can recover it. If length might matter (next section), keep the raw vector too.
- **A zero vector has no direction.** Dividing by zero gives `nan`; guard it with a tiny `eps` and treat all-zero vectors as a data bug (an empty input, a failed embedding). pgvector's README notes that zero vectors are not indexed for cosine distance.
- **Many models already do it.** OpenAI's embeddings guide says its embeddings are normalized to length 1. For `sentence-transformers` models, a final `Normalize` module in the model's `modules.json` means the model normalizes for you. Normalizing again is harmless but wasteful; the SBERT docs say that for such models the `dot` metric is the sensible choice over `cosine`, since `cosine` renormalizes needlessly.

### Magnitude: nuisance or signal?

Whether you should throw length away depends on what length *means* in your vectors.

- **Nuisance.** In term-count vectors a document repeated ten times is ten times longer but no more relevant. Dot product and L2 reward or punish the repetition; cosine ignores it (block 3).
- **Signal.** In some learned vectors, length encodes something real, such as how strongly a user prefers an item. Chroma's documentation describes its inner-product setting as one that "focuses on vector alignment and magnitude", used for recommendation-style data. The Sentence-Transformers pretrained-models page lists a family of retrieval models "tuned to be used with the dot-product similarity score" next to a family that "produce normalized vectors of length 1". For the first family the vector length may carry information, so normalizing it away could discard something the model learned; read the model card before you normalize.
- **Unclear.** Steck, Ekanadham and Kallus (see Further reading) show that for some learned embeddings cosine similarity can be arbitrary rather than meaningful, and that it sometimes works better and sometimes worse than the unnormalized dot product. The honest summary: cosine is the safe default for text embeddings from models trained for it, not a law of nature.

### What your vector database means by "inner product", "cosine" and "L2"

The database setting decides the arithmetic. Three things trip people up.

**1. The metric is set up front.** In pgvector you create one index per distance function (`vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`, `vector_l1_ops`), and a query only benefits from an index when its `ORDER BY` uses the matching operator. Chroma sets `space` per collection; Qdrant sets a distance per collection.

**2. Names are shared, conventions are not.** Everything is written so that ascending order means "most similar first", which changes what the numbers look like:

| System | Setting | What it orders by (smaller is better) |
| --- | --- | --- |
| pgvector | `<->` | L2 distance |
| pgvector | `<#>` | **negative** inner product (Postgres index scans only go ascending) |
| pgvector | `<=>` | cosine distance, `1 - cosine similarity` |
| pgvector | `<+>` | L1 (taxicab) distance |
| Chroma | `l2` (the default) | **squared** L2 |
| Chroma | `ip` | `1 - inner product` |
| Chroma | `cosine` | `1 - cosine similarity` |

Qdrant offers `Dot`, `Cosine`, `Euclid` and `Manhattan`, and its docs say cosine is implemented as a dot product over normalized vectors, with vectors "automatically normalized during upload". So in a `Cosine` collection vector lengths cannot influence scores.

**3. Inner product on unnormalized data is not cosine.** If a database says "inner product" and your vectors are not unit length, long vectors win. If it says "L2" (Chroma's default) on unnormalized data, the nearest neighbour is the one whose tip is closest, which can be a short vector pointing the wrong way. Block 6 shows the effect: on unit-length vectors six of the seven settings return the identical top 10; on varied-length vectors they split into three rankings (L2, inner product, cosine) plus L1.

The pgvector README recommends inner product for best performance when vectors are normalized to length 1, which follows directly from the identities above.

### Which metric should you pick?

1. **Match the training.** An embedding model is trained so that a particular similarity gives good neighbours. Find out which one:
   - Provider docs: OpenAI's guide recommends cosine similarity and states its embeddings are unit length.
   - Model card or model-family page: the Sentence-Transformers pretrained-models page separates models "tuned to be used with the dot-product similarity score" from models that "produce normalized vectors of length 1", which work with dot, cosine or Euclidean. Model names in that family say it too (`...-dot-...`, `...-cos-...`).
   - Files in the repository: for a `sentence-transformers` model, `modules.json` lists the pipeline (a `Normalize` stage means unit-length output; I checked `all-MiniLM-L6-v2` in October 2026 and it has one), and `config_sentence_transformers.json` may carry a `similarity_fn_name` entry (documented on the [SBERT "Semantic Textual Similarity" page](https://www.sbert.net/docs/sentence_transformer/usage/semantic_textual_similarity.html)).
   - Measure it: compute the norms of a few thousand of your embeddings (block 4). All 1.0 means normalized.
   - Still unsure: score each metric on a small set of queries with known-good answers (the Project does exactly this).
2. **If vectors are unit length**, cosine, dot and L2 give the same ranking. Use the database's inner-product setting for speed.
3. **If the model was trained for cosine but emits raw vectors**, normalize at ingest, then use dot or cosine.
4. **If the model was trained for dot product and lengths vary**, use inner product on the raw vectors and do not normalize.
5. **L2 on raw vectors** is right only when the model was trained with a Euclidean objective. **L1** is rarely a model's default; use it when documentation says to.

When vectors are normalized, the choice among the first three barely matters (OpenAI's guide says the choice of distance function "typically doesn't matter much" for its unit-length embeddings). It matters when they are not.

### Fast exact top-k in numpy

Brute-force exact search is one matrix-vector product followed by a selection. `X @ q` scores all `N` documents at once. To keep the best `k`, a full `argsort` costs `O(N log N)`; `np.argpartition` finds the `k` best in `O(N)` and returns them in arbitrary order, so you sort only those `k`. Two details: `argpartition` finds the *smallest*, so negate similarity scores (passing `k - 1` as the pivot index puts the `k` smallest first); and for many queries the score matrix is `num_queries × N` floats, so process queries in chunks. Exact search scales linearly with `N`, which is why Module 13 introduces approximate indexes.

## Code

Everything below uses numpy only. The blocks are cumulative: copy them into one file, in order, and run it. Outputs were produced with Python 3.13 and numpy 2.4.6 and every random generator is seeded; only the millisecond timings vary between machines.

### 1. The four measures on a tiny example

> [!example] The query is `q = (3, 4)`. Document `a` is the same arrow doubled, `b` points in a slightly different direction at the same length as `q`, and `c` points exactly backwards. Cosine and dot product put `a` first; L2 puts `b` first, because `a`'s tip is 5 units from `q`'s tip even though it lies on the very same ray.

```python
import numpy as np

def dot(a, b):    return float(np.dot(a, b))
def cosine(a, b): return dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))
def l2(a, b):     return float(np.linalg.norm(a - b))
def l1(a, b):     return float(np.abs(a - b).sum())

q = np.array([3.0, 4.0])             # the query, length 5
docs = {
    "a (q, doubled)":   np.array([6.0, 8.0]),    # same direction, twice as long
    "b (near q)":       np.array([4.0, 3.0]),    # slightly different direction, same length as q
    "c (q, reversed)":  np.array([-3.0, -4.0]),  # opposite direction
}
print(f"{'doc':<18}{'dot':>8}{'cosine':>9}{'L2':>8}{'L1':>8}")
for name, v in docs.items():
    print(f"{name:<18}{dot(q, v):>8.2f}{cosine(q, v):>9.3f}{l2(q, v):>8.3f}{l1(q, v):>8.2f}")
```

Output:

```
doc                    dot   cosine      L2      L1
a (q, doubled)       50.00    1.000   5.000    7.00
b (near q)           24.00    0.960   1.414    2.00
c (q, reversed)     -25.00   -1.000  10.000   14.00
```

### 2. The identities, checked over 10,000 random pairs

The pairs are built so their cosines cover the whole range from -1 to 1, not just the near-zero values that two random 384-dimensional vectors usually give. float64 agrees to about 1e-15; float32 to about 1e-7 to 1e-6, which is float32's own rounding. The last three lines show the identities failing on vectors of different lengths, so the unit-length condition is doing real work.

```python
rng = np.random.default_rng(0)
N, D = 10_000, 384

def unit(X):
    return X / np.linalg.norm(X, axis=1, keepdims=True)

# Pairs of unit vectors whose cosines span the whole range -1..1
A = unit(rng.standard_normal((N, D)))
w = rng.uniform(-1, 1, size=(N, 1))
B = unit(w * A + (1 - np.abs(w)) * unit(rng.standard_normal((N, D))))

def pair_stats(A, B):
    dot_ab = np.einsum("ij,ij->i", A, B)
    cos_ab = dot_ab / (np.linalg.norm(A, axis=1) * np.linalg.norm(B, axis=1))
    l2sq   = ((A - B) ** 2).sum(axis=1)
    return dot_ab, cos_ab, l2sq

for dtype in (np.float64, np.float32):
    a, b = A.astype(dtype), B.astype(dtype)
    dot_ab, cos_ab, l2sq = pair_stats(a, b)
    print(f"{np.dtype(dtype).name}: cosine range [{cos_ab.min():+.3f}, {cos_ab.max():+.3f}]")
    print(f"  max |cosine - dot|         = {np.abs(cos_ab - dot_ab).max():.2e}")
    print(f"  max |L2^2 - (2 - 2*cos)|   = {np.abs(l2sq - (2 - 2 * cos_ab)).max():.2e}")

# The general identity, true for ANY vectors: |a-b|^2 = |a|^2 + |b|^2 - 2 a.b
scale = rng.uniform(0.1, 100, size=(N, 1))
P, Q = A * scale, B * rng.uniform(0.1, 100, size=(N, 1))
dot_pq, cos_pq, l2sq_pq = pair_stats(P, Q)
general = (P**2).sum(1) + (Q**2).sum(1) - 2 * dot_pq
print("non-unit vectors (lengths 0.1..100):")
print(f"  max relative gap, general identity   = {np.max(np.abs(l2sq_pq - general) / l2sq_pq):.2e}")
print(f"  max |cosine - dot|  (should now fail) = {np.abs(cos_pq - dot_pq).max():.2e}")
print(f"  max |L2^2 - (2-2cos)| (should fail)   = {np.abs(l2sq_pq - (2 - 2 * cos_pq)).max():.2e}")
```

Output:

```
float64: cosine range [-1.000, +1.000]
  max |cosine - dot|         = 3.33e-16
  max |L2^2 - (2 - 2*cos)|   = 2.66e-15
float32: cosine range [-1.000, +1.000]
  max |cosine - dot|         = 1.19e-07
  max |L2^2 - (2 - 2*cos)|   = 9.54e-07
non-unit vectors (lengths 0.1..100):
  max relative gap, general identity   = 8.91e-12
  max |cosine - dot|  (should now fail) = 9.61e+03
  max |L2^2 - (2-2cos)| (should fail)   = 3.85e+04
```

### 3. Magnitude as nuisance and as signal

```python
# Magnitude as a NUISANCE: term-count vectors. Repeating a document 10x makes it 10x longer, not 10x more relevant.
from collections import Counter

vocab = ["vector", "database", "index", "search", "cat", "dog"]
def bow(text):
    counts = Counter(text.split())
    return np.array([counts[w] for w in vocab], dtype=float)

short    = bow("vector database index search")
repeated = bow(" ".join(["vector database index search"] * 10))   # same content, ten times over
off_topic = bow("cat dog cat dog")
bow_query = bow("vector search")

print(f"{'doc':<12}{'dot':>7}{'cosine':>9}{'L2':>8}")
for name, v in (("short", short), ("repeated", repeated), ("off-topic", off_topic)):
    print(f"{name:<12}{dot(bow_query, v):>7.1f}{cosine(bow_query, v):>9.3f}{l2(bow_query, v):>8.2f}")

# Magnitude as a SIGNAL: a recommender-style vector where length means "how strongly".
# (Constructed by hand to show the mechanism - not a claim about any particular model.)
user    = np.array([1.0, 0.0])
niche   = np.array([1.0, 0.0])      # points the right way, weak preference strength
popular = np.array([3.0, 0.0])      # points the same way, 3x the strength
print("\nsignal case:  dot ->", dot(user, niche), "vs", dot(user, popular),
      "|  cosine ->", cosine(user, niche), "vs", cosine(user, popular))
```

Output:

```
doc             dot   cosine      L2
short           2.0    0.707    1.41
repeated       20.0    0.707   19.03
off-topic       0.0    0.000    3.16

signal case:  dot -> 1.0 vs 3.0 |  cosine -> 1.0 vs 1.0
```

The `repeated` document has the same cosine as `short` (0.707) but ten times the dot product and a far larger L2. In the constructed signal case, cosine cannot tell a weak preference from a strong one, while dot product can.

### 4. Normalizing safely, checking norms, and the cancellation trap

```python
def l2_normalize(X, eps=1e-12):
    """Row-wise unit length. All-zero rows stay all-zero instead of becoming NaN."""
    n = np.linalg.norm(X, axis=-1, keepdims=True)
    return X / np.maximum(n, eps)

def describe_norms(X, name):
    n = np.linalg.norm(X, axis=1)
    print(f"{name:<22} norms: min={n.min():.4f} max={n.max():.4f}  "
          f"{'-> unit length' if np.allclose(n, 1, atol=1e-3) else '-> NOT unit length'}")

rng = np.random.default_rng(2)
raw = rng.standard_normal((1000, 384)).astype(np.float32) * 0.2
describe_norms(raw, "raw model output")
describe_norms(l2_normalize(raw), "after l2_normalize")

zero = np.zeros((1, 4))
with np.errstate(invalid="ignore"):   # silence numpy's 0/0 warning for the demo
    print("naive divide on a zero vector :", zero / np.linalg.norm(zero, axis=1, keepdims=True))
print("l2_normalize on a zero vector :", l2_normalize(zero))

# Why L2^2 = |a|^2 + |b|^2 - 2a.b is not free: subtracting nearly-equal big numbers loses digits.
a = (rng.standard_normal(384) * 100).astype(np.float32)     # a vector far from the origin
b = a + (rng.standard_normal(384) * 0.01).astype(np.float32) # a near-duplicate of it
exact     = float(((a.astype(np.float64) - b.astype(np.float64)) ** 2).sum())
expansion = float(np.dot(a, a) + np.dot(b, b) - 2 * np.dot(a, b))   # float32 arithmetic
print(f"\nnear-duplicates, true squared L2 = {exact:.4f}")
print(f"float32 dot-product expansion     = {expansion:.4f}")
```

Output:

```
raw model output       norms: min=3.4206 max=4.3866  -> NOT unit length
after l2_normalize     norms: min=1.0000 max=1.0000  -> unit length
naive divide on a zero vector : [[nan nan nan nan]]
l2_normalize on a zero vector : [[0. 0. 0. 0.]]

near-duplicates, true squared L2 = 0.0358
float32 dot-product expansion     = 0.0000
```

### 5. Exact top-k search, verified against a slow loop

`topk_loop` is the reference: it scores every row in a Python loop and sorts everything. The vectorised versions must return exactly the same indices. On 50,000 vectors of 384 dimensions (float32) the matrix product dominates the cost, so `argpartition` only shaves a little off; the selection-only test at the bottom isolates the step it actually speeds up.

```python
import time

def topk_loop(q, X, k):
    """Slow reference: score every row in a Python loop, sort everything. Ties break by lower index."""
    scored = [(float(np.dot(q, x)), i) for i, x in enumerate(X)]
    scored.sort(key=lambda t: (-t[0], t[1]))
    return [i for _, i in scored[:k]]

def select_topk(scores, k):
    """Indices of the k largest scores, best first. O(N) selection, then sort only the k winners."""
    part = np.argpartition(-scores, k - 1)[:k]       # the k largest, in arbitrary order
    return part[np.argsort(-scores[part])]           # order just those k

def topk_fast(q, X, k):
    return select_topk(X @ q, k)                     # one matrix-vector product, then select

def topk_fast_batch(Q, X, k):
    """Many queries at once: scores is (num_queries, N). Chunk Q if that matrix gets too big."""
    S = Q @ X.T
    part = np.argpartition(-S, k - 1, axis=1)[:, :k]
    order = np.argsort(-np.take_along_axis(S, part, axis=1), axis=1)
    return np.take_along_axis(part, order, axis=1)

rng = np.random.default_rng(3)
X = l2_normalize(rng.standard_normal((50_000, 384)).astype(np.float32))
Q = l2_normalize(rng.standard_normal((20, 384)).astype(np.float32))
K = 10

# Correctness: the fast paths must return exactly what the slow loop returns.
slow = [topk_loop(q, X, K) for q in Q[:5]]
fast = [topk_fast(q, X, K).tolist() for q in Q[:5]]
batch = topk_fast_batch(Q, X, K)
print("loop == argpartition (5 queries):", slow == fast)
print("loop == batched version (5 queries):", slow == [batch[i].tolist() for i in range(5)])
print("argpartition == full argsort (all 20):",
      all((np.argsort(-(X @ q))[:K] == batch[i]).all() for i, q in enumerate(Q)))

def timeit(fn, repeat=3):
    best = float("inf")
    for _ in range(repeat):
        t0 = time.perf_counter(); fn(); best = min(best, time.perf_counter() - t0)
    return best * 1000

q = Q[0]
print(f"N={len(X):,} D={X.shape[1]}  (milliseconds, best of 3; your machine will differ)")
print(f"  python loop        : {timeit(lambda: topk_loop(q, X, K), repeat=1):9.1f} ms")
print(f"  full argsort       : {timeit(lambda: np.argsort(-(X @ q))[:K]):9.1f} ms")
print(f"  argpartition       : {timeit(lambda: topk_fast(q, X, K)):9.1f} ms")

# The selection step on its own (scores already computed): O(N log N) sort vs O(N) partition.
scores = rng.random(2_000_000).astype(np.float32)
print(f"selection only, N={len(scores):,}:")
print(f"  argsort then slice : {timeit(lambda: np.argsort(-scores)[:K]):9.1f} ms")
print(f"  argpartition + k   : {timeit(lambda: select_topk(scores, K)):9.1f} ms")
```

Output:

```
loop == argpartition (5 queries): True
loop == batched version (5 queries): True
argpartition == full argsort (all 20): True
N=50,000 D=384  (milliseconds, best of 3; your machine will differ)
  python loop        :      51.3 ms
  full argsort       :       2.5 ms
  argpartition       :       1.7 ms
selection only, N=2,000,000:
  argsort then slice :      57.4 ms
  argpartition + k   :      11.9 ms
```

### 6. Does the metric change which documents come back?

A synthetic set of 5,000 vectors whose lengths vary by roughly 80x (exaggerated on purpose; real models usually vary far less, or not at all). The functions emulate the documented formulas from the table above; they were **not** run against real pgvector or Chroma instances. Each group printed is a set of settings that return an identical top 10 in an identical order.

```python
# A synthetic set whose vector lengths vary ~80x (exaggerated on purpose), and a query near a shared "topic".
rng = np.random.default_rng(1)
N, D = 5_000, 64
topic = unit(rng.standard_normal((1, D)))
dirs  = unit(0.5 * topic + rng.standard_normal((N, D)) / np.sqrt(D))
norms = rng.lognormal(mean=0.0, sigma=0.6, size=(N, 1))
query = unit(0.5 * topic + rng.standard_normal((1, D)) / np.sqrt(D))[0]
print("vector lengths in the varied set: min %.2f  max %.2f" % (norms.min(), norms.max()))

# What each database setting orders by (ascending = best first), written from the documented formulas.
# Emulated from the pgvector README and Chroma docs; NOT run against the real databases.
cos_dist = lambda X, q: 1 - (X @ q) / (np.linalg.norm(X, axis=1) * np.linalg.norm(q))
db_scores = {
    "pgvector <->  L2 distance":          lambda X, q: np.linalg.norm(X - q, axis=1),
    "pgvector <#>  negative inner prod.": lambda X, q: -(X @ q),
    "pgvector <=>  cosine distance":      cos_dist,
    "pgvector <+>  L1 distance":          lambda X, q: np.abs(X - q).sum(axis=1),
    "Chroma l2     squared L2":           lambda X, q: ((X - q) ** 2).sum(axis=1),
    "Chroma ip     1 - inner product":    lambda X, q: 1 - (X @ q),
    "Chroma cosine 1 - cosine":           cos_dist,
}

def families(X, q, k=10):
    groups = {}
    for name, fn in db_scores.items():
        groups.setdefault(tuple(np.argsort(fn(X, q))[:k]), []).append(name)
    return list(groups.values())

for label, X in (("unit-length vectors", dirs), ("vectors of varied length", dirs * norms)):
    print(f"--- {label}: which settings return the same top-10, in the same order? ---")
    for i, group in enumerate(families(X, query), 1):
        print(f"  ranking {i}: " + "; ".join(group))

by_cos = set(np.argsort(cos_dist(dirs, query))[:10])
by_l1  = set(np.argsort(db_scores["pgvector <+>  L1 distance"](dirs, query))[:10])
print("unit-length vectors, top-10 shared by cosine and L1:", len(by_cos & by_l1), "of 10")
```

Output:

```
vector lengths in the varied set: min 0.10  max 8.09
--- unit-length vectors: which settings return the same top-10, in the same order? ---
  ranking 1: pgvector <->  L2 distance; pgvector <#>  negative inner prod.; pgvector <=>  cosine distance; Chroma l2     squared L2; Chroma ip     1 - inner product; Chroma cosine 1 - cosine
  ranking 2: pgvector <+>  L1 distance
--- vectors of varied length: which settings return the same top-10, in the same order? ---
  ranking 1: pgvector <->  L2 distance; Chroma l2     squared L2
  ranking 2: pgvector <#>  negative inner prod.; Chroma ip     1 - inner product
  ranking 3: pgvector <=>  cosine distance; Chroma cosine 1 - cosine
  ranking 4: pgvector <+>  L1 distance
unit-length vectors, top-10 shared by cosine and L1: 5 of 10
```

## Visual diagram

```
  Two unit vectors a, b and the chord between their tips

       a ●────────────────────● b          chord = ‖a - b‖  = the L2 distance
          ╲                  ╱
           ╲                ╱              ‖a - b‖² = 1 + 1 - 2·cos θ
            ╲      θ       ╱                        = 2 - 2·cos θ
             ╲            ╱
              ╲          ╱                 a·b = cos θ     (lengths are 1)
               ╲        ╱
                ╲      ╱                   so ranking by dot desc, cosine desc
                 ╲    ╱                    and L2 asc is the SAME ranking
                  ╲  ╱
                   ╲╱
                   ● origin


  Which metric?

   read the model card / provider docs
        │
        ├── "vectors are normalized to length 1" ─► cosine = dot = L2 ranking
        │                                           use DB inner product (fastest)
        │
        ├── "trained for cosine", output not normalized ─► normalize once at ingest,
        │                                                  then dot / cosine
        │
        ├── "trained for dot product", lengths vary ─────► inner product on RAW vectors
        │                                                  (do not normalize)
        │
        └── not stated ─► print the norms ─► all ≈ 1? ─► treat as normalized
                                      │
                                      └─ not ≈ 1 ─► score each metric on a few
                                                    labelled queries and pick
```

## Practice

### 1. Rank by hand, then by code

The query is `q = (1, 2, 2)`. The documents are `u = (2, 4, 4)`, `v = (2, 2, 1)` and `w = (0, 3, 0)`. Rank the documents by dot product, by cosine, and by L2, best first. Which metric disagrees with the others, and why? Check with code.

<details><summary>Answer</summary>

By dot product: `u` (18), `v` (8), `w` (6). By cosine: `u` (1.000), `v` (0.889), `w` (0.667). By L2: `v` (1.414), `w` (2.449), `u` (3.000). L2 is the odd one out: `u` is the query doubled, so it points in exactly the same direction, but its tip is 3 units from the query's tip, which makes it the *farthest* document. Dot and cosine happen to agree on this data; they would split if `w` were much longer, since dot product rewards length.

```python
q = np.array([1.0, 2.0, 2.0])
docs3 = {"u": np.array([2.0, 4.0, 4.0]), "v": np.array([2.0, 2.0, 1.0]), "w": np.array([0.0, 3.0, 0.0])}
for name, v in docs3.items():
    print(name, "dot", dot(q, v), "| cosine %.3f" % cosine(q, v), "| L2 %.3f" % l2(q, v))
```

Output:

```
u dot 18.0 | cosine 1.000 | L2 3.000
v dot 8.0 | cosine 0.889 | L2 1.414
w dot 6.0 | cosine 0.667 | L2 2.449
```

</details>

### 2. Generalize the identity

Unit length is a special case. Show that if both vectors have the same length `r`, then `‖a - b‖² = 2r²(1 - cos θ)`. What does that say about ranking when the query and every document share one length that is not 1?

<details><summary>Answer</summary>

Start from `‖a - b‖² = ‖a‖² + ‖b‖² - 2 a·b = 2r² - 2 a·b`. When both lengths are `r`, `a·b = r² cos θ`, so the total is `2r² - 2r² cos θ = 2r²(1 - cos θ)`. With `r = 1` this is the unit-length identity. So if the query and every document share one length `r`, L2 is still a decreasing function of cosine and the rankings agree even though the vectors are not unit length: equal length, not length 1, is what matters.

</details>

### 3. How often does the wrong metric change real results?

Using the varied-length vectors from block 6, generate 200 queries. For each, compare the top 10 under dot product with the top 10 under cosine. How many queries change, and what is the average overlap?

<details><summary>Answer</summary>

```python
rng3 = np.random.default_rng(4)
queries = unit(0.5 * topic + rng3.standard_normal((200, 64)) / np.sqrt(64))
raw = dirs * norms                               # the varied-length vectors from the earlier experiment
doc_len = np.linalg.norm(raw, axis=1)
changed, overlaps = 0, []
for qv in queries:
    by_dot = set(select_topk(raw @ qv, 10))
    by_cos = set(select_topk((raw @ qv) / doc_len, 10))
    overlaps.append(len(by_dot & by_cos))
    changed += by_dot != by_cos
print(f"queries whose top-10 changes: {changed} of 200; mean overlap {np.mean(overlaps):.2f} / 10")
```

Output: `queries whose top-10 changes: 200 of 200; mean overlap 0.38 / 10`

Every one of the 200 queries returns a different top 10, and on average only about 0.4 of the ten documents are shared. This is the harm of pointing an inner-product index at unnormalized vectors from a cosine-trained model: it fails on every query, not on the occasional one, yet nothing raises an error. The size of the effect depends on how much the lengths vary.

</details>

### 4. Find the bug

A teammate writes `np.argpartition(scores, 10)[:10]` to get the top 10 similarity scores. What does it return, and how do you prove it with code? Fix it.

<details><summary>Answer</summary>

`argpartition` puts the *smallest* values first, so on similarity scores this returns the ten worst documents. Negate the scores to get the largest. (Either `k` or `k - 1` works as the pivot for taking the first `k` entries; `k - 1` is the smallest that does.)

```python
scores = rng3.random(1000)                       # pretend these are similarity scores (higher = better)
buggy = np.argpartition(scores, 10)[:10]         # forgot the minus sign
fixed = np.argpartition(-scores, 10 - 1)[:10]
print("buggy picks: best score %.3f (median score of all docs %.3f)" % (scores[buggy].max(), np.median(scores)))
print("fixed picks: worst score %.3f (10th-highest score overall %.3f)" % (scores[fixed].min(), np.sort(scores)[-10]))
```

Output:

```
buggy picks: best score 0.014 (median score of all docs 0.520)
fixed picks: worst score 0.989 (10th-highest score overall 0.989)
```

</details>

### Checkpoint quiz

1. Two unit vectors have cosine similarity 0.8. What is their L2 distance?
2. pgvector's `<#>` operator returns the *negative* inner product. Why?
3. A Chroma collection is created with default settings and filled with raw (unnormalized) vectors from a cosine-trained model. Which setting is it using, and is it the one the model expects?
4. After `np.argpartition(-scores, k - 1)[:k]`, why must you still sort the result?
5. A document is doubled by pasting its text twice, and its term-count vector doubles. Which of dot product, cosine and L2 change?

<details><summary>Answers</summary>

1. `sqrt(2 - 2 × 0.8) = sqrt(0.4) ≈ 0.632`. This uses `L2² = 2 - 2·cos`, valid for unit-length vectors.
2. Postgres only supports ascending-order index scans on operators, so the operator returns the inner product with its sign flipped; the best match (largest inner product) then has the smallest value. Multiply by -1 to display the real inner product.
3. Chroma's default `space` is `l2` (squared L2). On raw vectors it is not the cosine ranking the model expects; it only matches if the vectors happen to be unit length. Normalize the vectors or set `space` to `cosine`.
4. `argpartition` only guarantees which `k` indices are the best, not their order. Sort those `k` by score to get a ranked result.
5. Dot product doubles and L2 changes; cosine does not change, since the direction is unchanged.

</details>

> [!check]
> - I can explain what dot product, cosine, L2 and L1 each keep and ignore.
> - I can derive `L2² = 2 - 2·cos` for unit vectors and say why it implies identical rankings.
> - I can explain why L1 does not follow the same identity.
> - I can tell whether my embeddings are normalized by measuring their norms.
> - I can say what `<->`, `<#>`, `<=>` and Chroma's `l2`, `ip`, `cosine` order by.
> - I can write `argpartition`-based top-k and verify it against a loop.

## Project

Build a small exact vector index as a single Python module with a test file, numpy only. It should support at least the four metrics (`dot`, `cosine`, `l2`, `l1`) behind one `search(queries, k)` call that returns ids and scores in one consistent convention (state which and document it). Add a `diagnose(vectors)` function that reports norm statistics, the number of zero and duplicate vectors, and a recommended metric with a one-line reason. Then write tests that (a) prove the unit-length identities over random pairs, (b) fail loudly if someone configures `dot` on vectors whose lengths vary a lot, (c) check the vectorised top-k against a slow loop, and (d) show L1 disagrees with the other three even on unit vectors. Finish with an evaluation: create a synthetic corpus with known relevant documents, score each metric by recall at 10, and write two sentences on what your numbers do and do not show about real embedding models. No code is given; design the API yourself.

## Interview questions

> [!interview] You migrate a RAG service from one vector database to another. Search quality drops, and the long documents now dominate the results. Nothing errors. What do you check first?

<details><summary>What a strong answer covers</summary>

- Suspects a metric mismatch: the new database defaults to inner product (or Chroma-style squared L2) while the old one used cosine, on vectors that are not unit length.
- Names the mechanism: dot product scales with vector length, so long (large-norm) vectors win; cosine divides it out.
- Checks the norms of stored vectors, the index's operator class / `space` / distance setting, and the query-time operator; confirms query and document vectors went through the same normalization.
- Fix: normalize at ingest and query time (then inner product equals cosine), or set the database's cosine metric; re-run a labelled query set to confirm.
- Notes that thresholds tuned on cosine scores do not carry over to other metrics.

</details>

> [!interview] Explain why cosine similarity, dot product and Euclidean distance give the same ranking for normalized vectors. Does it hold for Manhattan distance?

<details><summary>What a strong answer covers</summary>

- Expands `‖a - b‖² = ‖a‖² + ‖b‖² - 2 a·b`; with unit lengths this is `2 - 2 a·b`, and `a·b` is the cosine, so L2 is a decreasing function of cosine and dot.
- Stresses that the *ranking* is identical while the *values* differ, so thresholds do not transfer.
- States that L1 has no such identity because it is not a function of the angle, and that it can rank differently (give a number or example).
- Mentions the practical use: normalize once, then use the cheapest metric (inner product).

</details>

> [!interview] A new embedding model arrives. How do you decide which distance metric your index should use?

<details><summary>What a strong answer covers</summary>

- Start from how the model was trained: the model card or provider docs, naming conventions such as `-dot-` / `-cos-`, whether the output pipeline includes a normalization step.
- Measure rather than assume: compute norms of real outputs to see whether they are unit length.
- If normalized, cosine, dot and L2 agree, so pick inner product for speed. If trained for dot with varied lengths, use inner product on raw vectors and do not normalize. If trained for cosine but not normalized, normalize at ingest.
- If documentation is silent, evaluate the options on a small labelled query set and choose by recall, since the metric affects ranking only when norms vary.
- Remembers that the metric is usually fixed when the index is built, so decide before loading data.

</details>

## Common mistakes & troubleshooting

- **Long documents dominate, scores exceed 1.** Inner product (or a dot-product score) on unnormalized vectors. Normalize at ingest, or use cosine. Block 6 and Exercise 3 show how large the effect can be.
- **Best results appear last.** You sorted a distance as if it were a similarity, or the reverse. Remember that `<#>` is a negative inner product and Chroma's `ip` and `cosine` are `1 - similarity`. Decide on one convention (the code above makes everything "higher is better") and convert at the edge.
- **`nan` in scores.** A zero vector was normalized or fed to cosine. Find the empty or failed input upstream; use an `eps` guard so the failure is visible instead of poisoning the sort.
- **The index is ignored and queries are slow.** The query's operator does not match the operator class the index was built with (pgvector requires an index per distance function). Rebuild with the right operator class or change the query.
- **A similarity threshold stops working after a migration.** Cosine 0.8, L2 0.63 and inner product 0.8 are the same relationship only for unit vectors, and each database transforms scores differently. Re-tune thresholds on the new setup.
- **Different models mixed in one index.** Vectors from two models are not comparable even if their dimensions match. Keep a model identifier with every stored vector (Module 05 stores one in the cache key).

## Further reading & sources

- [GitHub - pgvector/pgvector: Open-source vector similarity search for Postgres](https://github.com/pgvector/pgvector) - the README is the source for the `<->`, `<#>`, `<=>`, `<+>` operators, the per-metric index operator classes, and the advice to use inner product on unit-length vectors.
- [Vector embeddings | OpenAI API](https://developers.openai.com/api/docs/guides/embeddings) - the "Which distance function should I use?" answer: recommends cosine similarity and says OpenAI embeddings are normalized to length 1, so cosine can be computed as a plain dot product and cosine and Euclidean distance rank identically.
- [Pretrained Models - Sentence Transformers documentation](https://www.sbert.net/docs/sentence_transformer/pretrained_models.html) - lists retrieval models "tuned to be used with the dot-product similarity score" separately from models that output normalized vectors; the model for how to read a model card.
- [Configure Collections - Chroma Docs](https://docs.trychroma.com/docs/collections/configure) - documents `l2` (squared, the default), `ip` and `cosine` and their formulas, the source for the table of ordering conventions.
- [Collections - Qdrant](https://qdrant.tech/documentation/manage-data/collections/) - documents the `Dot`, `Cosine`, `Euclid` and `Manhattan` distances and that cosine is implemented as a dot product over vectors normalized at upload.
- [8.8. Pairwise metrics, Affinities and Kernels - scikit-learn](https://scikit-learn.org/stable/modules/metrics.html) - reference definitions for cosine similarity, Euclidean and Manhattan distances, including cosine as the L2-normalized dot product.
- [numpy.argpartition - NumPy Manual](https://numpy.org/doc/stable/reference/generated/numpy.argpartition.html) - the exact semantics of the partial-sort function behind the top-k implementation.
- [Is Cosine-Similarity of Embeddings Really About Similarity? (Steck, Ekanadham, Kallus)](https://arxiv.org/abs/2403.05440) - shows analytically that cosine similarity of learned embeddings can be arbitrary for some models, the caution behind "match the training".

## Next

[Module 04: The Curse of Dimensionality](../04-the-curse-of-dimensionality/README.md)
