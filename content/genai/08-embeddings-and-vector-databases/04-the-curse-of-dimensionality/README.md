# Module 04: The Curse of Dimensionality

## Roadmap

You are in Track 08, **Embeddings & Vector Databases**. [Module 03](../03-cosine-similarity-and-distance-metrics/README.md) taught how to score two vectors. This module asks what happens to those scores when the vectors have hundreds or thousands of coordinates, and why embedding search works anyway. It builds on [Module 00](../00-what-an-embedding-is/README.md) (what an embedding is) and uses numpy only.

After this module you can:

- explain distance concentration, sparsity and hubness in plain words, and reproduce each with a seeded numpy experiment;
- explain why real embeddings still behave (low intrinsic dimension) and what that argument does and does not guarantee;
- estimate the intrinsic dimension of a set of vectors and read the result with the right amount of suspicion;
- judge a proposal to shorten embeddings (truncate or reduce dimensions) by measuring neighbour recall instead of guessing;
- say why exact search stops scaling and where [Module 13: Exact vs. Approximate Search](../13-exact-vs-approximate-search/README.md) picks up.

Why it matters: these effects are the reason similarity scores for good and bad matches sit close together, the reason the same few documents keep showing up in unrelated queries, and the reason a "just use fewer dimensions to save money" proposal can quietly cut recall.

## Concept

> [!key] In high dimensions every point looks about equally far from every other, a few "hub" points become everyone's neighbour, and volume hides in the corners. Embeddings stay usable because real data occupies a thin, low-dimensional surface inside the big space: what controls behaviour is the data's intrinsic dimension, not the number of coordinates.

## Explanation

### Distance concentration: nearest and farthest converge

Squared Euclidean distance is a sum of one small term per coordinate: `sum((x_i - y_i)^2)`. With `D` coordinates, the sum's typical size grows in proportion to `D`, but its random wobble grows only like `sqrt(D)`. So the *relative* wobble shrinks like `1/sqrt(D)`: every point ends up at nearly the same distance from the query. Block 1 shows the standard deviation of distances divided by their mean going from 0.44 at 2 dimensions to 0.012 at 2048, and the farthest point going from 83 times the nearest to 1.08 times.

> [!model] Flip D coins per pair of points and count heads. With 10 coins you routinely see anything from 2 to 8; with 10,000 coins you almost always see between 4,900 and 5,100. A distance is like that head count: it adds up so many small independent differences that all pairs land near the same total.

The classic statement is from Beyer, Goldstein, Ramakrishnan and Shaft (1999). Under broad conditions, if the spread of the distances shrinks relative to their mean as dimension grows, then for any `ε > 0` the probability that the farthest distance is within `(1 + ε)` of the nearest tends to 1. In their synthetic experiments the distinction between nearest and farthest "may blur with as few as 15 dimensions". The same paper insists this does not make high-dimensional search always meaningless: it identifies workloads where the effect does not occur, and it recommends checking that your workload gives a clear separation between nearest and farthest neighbours, for example by sampling queries. That is exactly the measurement in block 1, and the Project turns it into a tool.

Angles concentrate too. Two random directions in `D` dimensions have a cosine near zero with spread about `1/sqrt(D)` (the right-hand columns of block 1 match that formula). In 1,536 dimensions random directions differ in cosine by only about 0.03 (`1/sqrt(1536)`). Real embeddings are not random directions, but the lesson carries over: the gap between "relevant" and "irrelevant" scores can be small in absolute terms. Similarity thresholds copied from a tutorial are fragile; tune them on your own labelled queries.

### Volume and sparsity: the corners take over

Block 4 computes three facts, the first two with the exact volume formula for a ball:

- The ball inscribed in a unit cube holds 79% of the cube's volume in 2 dimensions, 0.25% in 10, and `2.5e-8` in 20. Almost all of a high-dimensional cube sits in its corners, far from the centre.
- A ball keeps `1 - 0.9^d` of its volume in the outer 10% of its radius: 65% at `d = 10`, essentially all of it at `d = 100`. Points are all near the surface.
- Cutting each axis into just 10 bins gives `10^d` cells. No dataset fills that, so high-dimensional data is always sparse, and collecting more of it cannot restore the density you had in 2 dimensions.

The practical reading: in a high-dimensional space "nearest" does not mean "close" in any absolute sense. k-NN works only because real data is not spread uniformly.

### Hubness: some points are everyone's neighbour

The k-occurrence `N_k(x)` counts how many other points have `x` among their `k` nearest neighbours. In a fair world every point would appear about `k` times. Radovanović, Nanopoulos and Ivanović ("Hubs in Space") showed that as dimensionality grows this distribution becomes strongly right-skewed: a few **hubs** appear in huge numbers of neighbour lists, and many **anti-hubs** appear in none. Block 5 reproduces it. For Gaussian data with 100 dimensions the biggest hub is among the 10 nearest neighbours of 286 other points (the fair share is 10), and 19% of points are nobody's neighbour at all. Exercise 4 shows the mechanism: hubs are the points nearest the centre of the data cloud, which are slightly closer to everything.

In a retrieval system this looks like a handful of documents appearing in the results of many unrelated queries while other documents can never be found, whatever their relevance. The cheap diagnostic is to count how often each document lands in the top-k over a sample of real queries.

### Why real embeddings still work: intrinsic dimension

The way out is that real data does not fill the space. It lies on or near a lower-dimensional surface (a **manifold**) curved through the ambient space, and distances between points on that surface behave as if the space had the surface's dimension, called the **intrinsic dimension**. A sheet of paper crumpled in a room is 2-dimensional even though the room is 3-dimensional.

Block 2 builds data with 8 true degrees of freedom, laid into 8 to 2048 coordinates by a rotation that preserves distances. With no noise, its farthest/nearest ratio is 4.91 at every ambient size, while uniform data in the full space falls from 4.8 to 1.08. The protection is conditional, though: add a little noise to every coordinate and the ratio creeps down as `D` grows, because the noise adds roughly `2·D·σ²` to every squared distance regardless of how close two points are on the sheet. With `σ = 0.05` and 2048 coordinates the ratio is back to 1.17, almost as bad as full-dimensional data. Low intrinsic dimension helps in proportion to how small the off-surface noise is compared with the spacing of neighbouring points.

What evidence is there that *real* data is like this? For images, Pope et al. estimated the intrinsic dimension of common datasets and found it very low relative to the number of pixels, and Ansuini et al. found that in trained networks the intrinsic dimension of a layer's representation is orders of magnitude smaller than the number of units in it. I did not measure real text-embedding models for this module (there is no model or API key in the environment where the code was verified), so treat "text embeddings have low intrinsic dimension" as the standard explanation rather than something measured here. Block 3 gives you the tools to measure your own vectors.

Two ways to estimate intrinsic dimension are in block 3:

- **PCA count.** The number of principal components needed to explain 95% of the variance. It counts *linear* directions, so it over-counts a curved surface: a swiss roll (truly 2-D) needs 3.
- **TwoNN** (Facco et al.). Uses only each point's first and second nearest-neighbour distances, which lets it follow curved surfaces: it reports 1.9 for the swiss roll. It drifts upward when noise is comparable to neighbour spacing (10.4 for the noisy 8-D sheet) and it under-reads genuinely high-dimensional data (92 for a uniform 256-D set with only 2,000 points), because resolving a high intrinsic dimension needs far more samples. Use it as a gauge, not a measurement.

> [!pitfall] Intrinsic dimension is not "the right embedding size". Block 6 data has intrinsic dimension 10, yet keeping the first 256 of 512 coordinates still loses 13% of true neighbours, while 16 well-chosen directions lose none. How much information survives shortening depends on how the model spreads it across coordinates, not only on how few degrees of freedom exist.

### What this means for your decisions

- **Embedding dimension.** Storage and distance cost grow linearly with `D`: 1 million float32 vectors take 0.95 GiB at 256 dimensions and 11.44 GiB at 3072 (plain arithmetic, `N × D × 4` bytes, block 6). Decide with measurements on your data, not with the number alone.
- **Truncation.** Shortening vectors by dropping trailing coordinates is safe only when the model was trained for it. Matryoshka Representation Learning trains models whose leading coordinates carry the coarse information, and OpenAI's embeddings guide describes shortening an embedding's dimension and says to normalize the result afterwards (Module 03: a truncated vector is no longer unit length). For a model not trained that way, block 6 shows what to expect: dropping coordinates loses neighbours, and a projection fitted to your data (PCA) can keep them only when the data really is low-dimensional. Measure recall of the true neighbours before and after.
- **Thresholds and scores.** Scores bunch together; calibrate cutoffs on labelled queries, and prefer ranking (top-k) to absolute thresholds when you can.
- **Indexes.** Exact search compares the query with every vector, so cost grows with `N × D`. Classic space-partitioning indexes try to skip regions that are clearly farther than others, which is the property concentration erodes. Beyer et al. also found that many 1990s index proposals were never compared with a plain linear scan, and that their own reported numbers often showed the scan winning. The lesson that carries over is to measure any index against exact search on your own data. [Module 13](../13-exact-vs-approximate-search/README.md) covers how approximate indexes trade a little recall for speed and how to measure that trade.

## Code

Numpy and the standard library only. The blocks are cumulative: copy them into one file, in order, and run it. Outputs were produced with Python 3.13 and numpy 2.4.6 with every generator seeded. All data here is synthetic, which is the point: we control the true dimension.

### 1. Distance concentration in uniform random data

For each dimension, 1,000 uniform points and 100 fresh queries. `max/min` is the average ratio of a query's farthest to nearest distance; `std/mean` is the relative spread of its distances. The right-hand columns compare the spread of the cosine of random Gaussian pairs with `1/sqrt(D)`.

```python
import math
import numpy as np

def sq_dists(Q, X):
    """All squared Euclidean distances, shape (len(Q), len(X)), via the dot-product expansion."""
    d2 = (Q**2).sum(1)[:, None] + (X**2).sum(1)[None, :] - 2 * Q @ X.T
    return np.maximum(d2, 0)          # float64 here, so cancellation noise is negligible

def spread(X, Q):
    """Per query: farthest/nearest distance ratio, and (std of distances)/(mean distance)."""
    d = np.sqrt(sq_dists(Q, X))
    ratio = d.max(1) / d.min(1)
    cv = d.std(1) / d.mean(1)
    return ratio.mean(), cv.mean()

rng = np.random.default_rng(0)
N, NQ = 1000, 100
print(f"{'D':>5} {'max/min':>9} {'std/mean':>9} | random-pair cosine std {'(1/sqrt(D))':>12}")
for D in (2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048):
    X, Q = rng.random((N, D)), rng.random((NQ, D))                    # uniform in the unit cube
    ratio, cv = spread(X, Q)
    G = rng.standard_normal((2000, D)); H = rng.standard_normal((2000, D))
    cos = (G * H).sum(1) / (np.linalg.norm(G, axis=1) * np.linalg.norm(H, axis=1))
    print(f"{D:>5} {ratio:>9.2f} {cv:>9.3f} | {cos.std():>22.3f} {1/math.sqrt(D):>12.3f}")
```

Output:

```
    D   max/min  std/mean | random-pair cosine std  (1/sqrt(D))
    2     83.08     0.444 |                  0.711        0.707
    4     13.54     0.299 |                  0.492        0.500
    8      4.85     0.203 |                  0.351        0.354
   16      2.76     0.140 |                  0.250        0.250
   32      1.94     0.098 |                  0.175        0.177
   64      1.58     0.069 |                  0.127        0.125
  128      1.37     0.048 |                  0.087        0.088
  256      1.25     0.034 |                  0.062        0.062
  512      1.17     0.024 |                  0.044        0.044
 1024      1.12     0.017 |                  0.031        0.031
 2048      1.08     0.012 |                  0.022        0.022
```

### 2. The same measurement on low-dimensional data

Eight-dimensional latent points, laid into `D` coordinates by an orthonormal matrix (so distances are preserved exactly), then optionally blurred with per-coordinate noise. The same latent points are reused for every `D`.

```python
# Data that lives on a K-dimensional flat sheet inside D dimensions: latent z in K dims, mapped by a
# random orthonormal D x K matrix W (so, with no noise, all distances are preserved exactly).
K = 8
rng = np.random.default_rng(1)
Zx, Zq = rng.random((N, K)), rng.random((NQ, K))                      # the SAME latent points for every D

def embed(Z, D, sigma, seed):
    r = np.random.default_rng(seed)
    W, _ = np.linalg.qr(np.random.default_rng(99).standard_normal((D, K)))   # D x K, orthonormal columns
    return Z @ W.T + sigma * r.standard_normal((len(Z), D))                  # sigma = per-coordinate noise

print(f"intrinsic dimension K={K}; uniform full-D data for comparison")
print(f"{'D':>5} {'uniform':>9} | {'sigma=0':>9} {'sigma=0.01':>11} {'sigma=0.05':>11}   (mean max/min distance ratio)")
for D in (8, 16, 32, 64, 128, 256, 512, 1024, 2048):
    uni = spread(rng.random((N, D)), rng.random((NQ, D)))[0]
    cols = [spread(embed(Zx, D, s, 10), embed(Zq, D, s, 11))[0] for s in (0.0, 0.01, 0.05)]
    print(f"{D:>5} {uni:>9.2f} | {cols[0]:>9.2f} {cols[1]:>11.2f} {cols[2]:>11.2f}")
```

Output:

```
intrinsic dimension K=8; uniform full-D data for comparison
    D   uniform |   sigma=0  sigma=0.01  sigma=0.05   (mean max/min distance ratio)
    8      4.82 |      4.91        4.89        4.89
   16      2.66 |      4.91        4.90        4.32
   32      1.97 |      4.91        4.79        3.58
   64      1.59 |      4.91        4.69        2.95
  128      1.37 |      4.91        4.48        2.33
  256      1.25 |      4.91        4.15        1.85
  512      1.17 |      4.91        3.69        1.51
 1024      1.12 |      4.91        3.13        1.30
 2048      1.08 |      4.91        2.53        1.17
```

With no noise the ratio is constant at 4.91, because the geometry is the same 8-dimensional geometry however large the room is.

### 3. Estimating intrinsic dimension: PCA versus TwoNN

```python
def pca_dims(X, frac=0.95):
    """How many principal components are needed to explain `frac` of the variance."""
    s = np.linalg.svd(X - X.mean(0), compute_uv=False) ** 2
    return int(np.searchsorted(np.cumsum(s) / s.sum(), frac) + 1)

def two_nn(X):
    """TwoNN intrinsic-dimension estimate (Facco et al. 2017): uses only each point's two nearest neighbours.
    With mu = r2/r1, the maximum-likelihood estimate is  d = N / sum(log mu)."""
    d2 = sq_dists(X, X)
    np.fill_diagonal(d2, np.inf)
    two = np.sqrt(np.sort(d2, axis=1)[:, :2])
    mu = two[:, 1] / two[:, 0]
    return len(X) / np.log(mu).sum()

rng = np.random.default_rng(2)
n, D = 2000, 256
W3, _ = np.linalg.qr(rng.standard_normal((D, 3)))             # a 3-D "room" inside D dimensions
t = 1.5 * np.pi * (1 + 2 * rng.random(n)); h = 20 * rng.random(n)
roll = np.stack([t * np.cos(t), h, t * np.sin(t)], axis=1) @ W3.T   # swiss roll: curved sheet, truly 2-D
sets = {
    "uniform, 8-D":                           rng.random((n, 8)),
    "uniform, 256-D":                         rng.random((n, D)),
    "8-D sheet inside 256-D, noise 0.01":     embed(rng.random((n, K)), D, 0.01, 5),
    "swiss roll (2-D, curved) inside 256-D":  roll,
}
print(f"{'dataset':<40} {'ambient':>7} {'PCA(95%)':>9} {'TwoNN':>7}")
for name, X in sets.items():
    print(f"{name:<40} {X.shape[1]:>7} {pca_dims(X):>9} {two_nn(X):>7.1f}")
```

Output:

```
dataset                                  ambient  PCA(95%)   TwoNN
uniform, 8-D                                   8         8     7.1
uniform, 256-D                               256       230    92.3
8-D sheet inside 256-D, noise 0.01           256         8    10.4
swiss roll (2-D, curved) inside 256-D        256         3     1.9
```

### 4. Volume and sparsity

```python
def ball_volume(d, r):
    """Volume of a d-dimensional ball of radius r (log-space to avoid overflow)."""
    return math.exp((d / 2) * math.log(math.pi) - math.lgamma(d / 2 + 1) + d * math.log(r))

rng = np.random.default_rng(3)
print(f"{'d':>4} {'ball in cube':>13} {'(simulated)':>12} {'outer 10% shell':>16} {'10-bin cells':>13}")
for d in (2, 3, 5, 10, 20, 50, 100):
    exact = ball_volume(d, 0.5)                                   # inscribed ball vs the unit cube's volume 1
    pts = rng.random((200_000, d))
    sim = (((pts - 0.5) ** 2).sum(1) <= 0.25).mean() if d <= 10 else float("nan")
    shell = 1 - 0.9**d                                            # share of a ball's volume in its outer 10% of radius
    print(f"{d:>4} {exact:>13.2e} {sim:>12.2e} {shell:>16.4f} {10.0**d:>13.0e}")
```

Output:

```
   d  ball in cube  (simulated)  outer 10% shell  10-bin cells
   2      7.85e-01     7.86e-01           0.1900         1e+02
   3      5.24e-01     5.24e-01           0.2710         1e+03
   5      1.64e-01     1.65e-01           0.4095         1e+05
  10      2.49e-03     2.31e-03           0.6513         1e+10
  20      2.46e-08          nan           0.8784         1e+20
  50      1.54e-28          nan           0.9948         1e+50
 100      1.87e-70          nan           1.0000        1e+100
```

The simulation column (random points counted inside the ball) agrees with the exact formula where it can resolve the answer, and runs out of resolution beyond `d = 10`.

### 5. Hubness

`N_10` is how many other points list a point among their 10 nearest neighbours. Skew near 0 means an even spread; large positive skew means a few hubs dominate. This is a single seed, and the skew at `d = 500` is lower than at `d = 100`, a reminder that these are finite-sample measurements.

```python
def k_occurrence(X, k=10):
    """N_k[i] = how many points have point i among their k nearest neighbours."""
    d2 = sq_dists(X, X)
    np.fill_diagonal(d2, np.inf)
    nn = np.argpartition(d2, k, axis=1)[:, :k]
    return np.bincount(nn.ravel(), minlength=len(X))

def skew(a):
    a = a - a.mean()
    return (a**3).mean() / (a**2).mean() ** 1.5

rng = np.random.default_rng(4)
n = 2000
sets = {f"iid Gaussian, d={d}": rng.standard_normal((n, d)) for d in (3, 20, 100, 500)}
sets["8-D sheet inside 500-D, noise 0.01"] = embed(rng.standard_normal((n, K)), 500, 0.01, 6)
print(f"{'dataset':<38} {'skew(N_10)':>10} {'max N_10':>9} {'never a neighbour':>18}")
for name, X in sets.items():
    nk = k_occurrence(X)
    print(f"{name:<38} {skew(nk):>10.2f} {nk.max():>9} {(nk == 0).mean():>17.1%}")
print("(a perfectly even world would give every point N_10 = 10)")
```

Output:

```
dataset                                skew(N_10)  max N_10  never a neighbour
iid Gaussian, d=3                           -0.43        19              0.2%
iid Gaussian, d=20                           2.50        94              8.7%
iid Gaussian, d=100                          5.89       286             19.1%
iid Gaussian, d=500                          4.46       257             27.1%
8-D sheet inside 500-D, noise 0.01           0.35        27              2.0%
(a perfectly even world would give every point N_10 = 10)
```

### 6. Shortening vectors: what survives

The ground truth is the exact 10 nearest neighbours in the full 512 dimensions. Each row asks how many of them are still found after shortening the vectors to `m` numbers, by keeping the first `m` coordinates or by projecting onto the top `m` principal directions fitted on the data.

```python
def knn_ids(Xs, Qs, k=10):
    return np.argsort(sq_dists(Qs, Xs), axis=1)[:, :k]

def recall(truth, approx, k=10):
    return np.mean([len(set(a) & set(t)) / k for a, t in zip(approx, truth)])

def truncation_recall(X, Q, dims, k=10):
    """Recall@k of true neighbours when each vector is shortened two ways:
    (a) keep the first m coordinates, (b) keep the m top principal-component directions."""
    truth = knn_ids(X, Q, k)
    mu = X.mean(0)
    Vt = np.linalg.svd(X - mu, full_matrices=False)[2]            # rows = principal directions
    rows = []
    for m in dims:
        first_m = recall(truth, knn_ids(X[:, :m], Q[:, :m], k), k)
        P = Vt[:m].T
        top_pc = recall(truth, knn_ids((X - mu) @ P, (Q - mu) @ P, k), k)
        rows.append((m, first_m, top_pc))
    return rows

rng = np.random.default_rng(5)
D, n, nq, KK = 512, 2000, 100, 10
W, _ = np.linalg.qr(rng.standard_normal((D, KK)))
def sheet(num):                                                    # a 10-D sheet inside 512-D, small noise
    return rng.standard_normal((num, KK)) @ W.T + 0.01 * rng.standard_normal((num, D))
datasets = {"full-rank Gaussian, 512-D": (rng.standard_normal((n, D)), rng.standard_normal((nq, D))),
            "10-D sheet inside 512-D":   (sheet(n), sheet(nq))}

dims = (8, 16, 32, 64, 128, 256)
print("recall@10 of the true 10 nearest neighbours after shortening 512-D vectors to m numbers")
for name, (X, Q) in datasets.items():
    print(f"\n{name}\n{'m':>5} {'first m coords':>15} {'top-m PCA dirs':>15}")
    for m, first_m, top_pc in truncation_recall(X, Q, dims):
        print(f"{m:>5} {first_m:>15.2f} {top_pc:>15.2f}")

print("\nstorage for 1,000,000 float32 vectors (arithmetic: N * D * 4 bytes):")
for d in (256, 768, 1536, 3072):
    print(f"  D={d:>4}: {1_000_000 * d * 4 / 2**30:5.2f} GiB")
```

Output:

```
recall@10 of the true 10 nearest neighbours after shortening 512-D vectors to m numbers

full-rank Gaussian, 512-D
    m  first m coords  top-m PCA dirs
    8            0.00            0.01
   16            0.01            0.02
   32            0.03            0.04
   64            0.04            0.09
  128            0.10            0.18
  256            0.23            0.41

10-D sheet inside 512-D
    m  first m coords  top-m PCA dirs
    8            0.23            0.42
   16            0.41            1.00
   32            0.59            1.00
   64            0.71            1.00
  128            0.77            1.00
  256            0.87            1.00

storage for 1,000,000 float32 vectors (arithmetic: N * D * 4 bytes):
  D= 256:  0.95 GiB
  D= 768:  2.86 GiB
  D=1536:  5.72 GiB
  D=3072: 11.44 GiB
```

For full-rank data neither method helps much until `m` is a large fraction of 512. For data on a 10-dimensional sheet, a few principal directions recover every neighbour while arbitrary leading coordinates do not. Real models sit somewhere between these synthetic extremes, which is why you measure.

## Visual diagram

```
  Distance from one query to 1,000 uniform random points, divided by the average
  distance (drawn from one seeded run of block 1's setup, a single query)

   D = 2                       D = 32                      D = 1024
                  █                       █▇                          ▆█
         ▁   ▆ ▆ ▇█▂▂                     ██                          ██
         █▆▄▃█▇█▇████▂                   ▃██▃                         ██
      ▂▄▅█████████████▄▂                 ████                         ██
   ▅▆███████████████████▅▂             ▁▅████▅▁                       ██
   └───────────┴──────────┘    └───────────┴──────────┘    └───────────┴──────────┘
   0           1          2    0           1          2    0           1          2
   farthest/nearest = 135.6    farthest/nearest = 2.1      farthest/nearest = 1.1

   wide: some points sit       a hump: nearest and         a spike: every point is
   almost on the query,        farthest differ by          within a few percent of
   others are far away         about 2x                    the same distance


  Why low intrinsic dimension rescues search (block 2)

   ambient space: D = 512 coordinates
   ┌───────────────────────────────────────────────┐
   │                                               │
   │     real data lives on a thin curved sheet    │
   │          ╱╲╱╲╱╲                               │
   │        ╱╲╱╲╱╲╱╲      only K = 10 true        │
   │          ╲╱╲╱╲╱       degrees of freedom      │
   │                       (plus a little noise)   │
   │                                               │
   └───────────────────────────────────────────────┘

   distances between points on the sheet behave like a K-dimensional world,
   as long as   noise thickness  <<  spacing between neighbouring points
   (block 2: sigma = 0.05 at D = 2048 already fills in the gaps, ratio -> 1.17)
```

## Practice

### 1. Does the distribution matter?

Block 1 used uniform data. Repeat the max/min measurement with Gaussian data at `D = 8, 64, 512`. Do the two distributions behave differently?

<details><summary>Answer</summary>

Not in any way that matters here: both concentrate at almost the same rate. The effect comes from adding up many independent coordinate differences, not from the shape of the distribution (Beyer et al. show it under much broader conditions than independent identical coordinates).

```python
rng = np.random.default_rng(6)
print(f"{'D':>5} {'uniform max/min':>16} {'Gaussian max/min':>17}")
for D in (8, 64, 512):
    u = spread(rng.random((N, D)), rng.random((NQ, D)))[0]
    g = spread(rng.standard_normal((N, D)), rng.standard_normal((NQ, D)))[0]
    print(f"{D:>5} {u:>16.2f} {g:>17.2f}")
```

Output:

```
    D  uniform max/min  Gaussian max/min
    8             4.96              5.06
   64             1.57              1.65
  512             1.17              1.19
```

</details>

### 2. Can more data fix it?

Hold `D = 256` and grow the number of points from 100 to 10,000. Does the farthest/nearest ratio recover?

<details><summary>Answer</summary>

Only very slowly. More points means the nearest one gets a bit nearer and the farthest a bit farther, so the ratio creeps up (from 1.18 to 1.30 while the data grows 100 times), but it stays close to 1, nowhere near the 83 of a 2-dimensional set. Adding data does not restore the contrast of a low-dimensional space.

```python
rng = np.random.default_rng(7)
print(f"{'N points':>9} {'max/min at D=256':>17}")
for n_points in (100, 1_000, 10_000):
    print(f"{n_points:>9} {spread(rng.random((n_points, 256)), rng.random((50, 256)))[0]:>17.2f}")
```

Output:

```
 N points  max/min at D=256
      100              1.18
     1000              1.25
    10000              1.30
```

</details>

### 3. Noise and the TwoNN estimate

Take 2,000 points with 5 true degrees of freedom, embedded in 100 coordinates, and sweep the per-coordinate noise. What does TwoNN report, and why?

<details><summary>Answer</summary>

```python
rng = np.random.default_rng(8)
Z = rng.random((2000, 5))                                   # a 5-D latent space
print(f"{'noise sigma':>11} {'TwoNN estimate (true intrinsic dim = 5)':>40}")
for sigma in (0.0, 0.01, 0.1, 0.5):
    W5, _ = np.linalg.qr(np.random.default_rng(1).standard_normal((100, 5)))
    X = Z @ W5.T + sigma * rng.standard_normal((2000, 100))
    print(f"{sigma:>11} {two_nn(X):>40.1f}")
```

Output:

```
noise sigma  TwoNN estimate (true intrinsic dim = 5)
        0.0                                      4.8
       0.01                                      8.6
        0.1                                     44.6
        0.5                                     49.0
```

Without noise the estimate is close to 5. Even at `sigma = 0.01` it reads 8.6, because 100 coordinates of noise add a distance of about `0.14` between any two points, which is of the same order as the typical spacing between neighbours in a 5-dimensional set of 2,000 points. At `0.1` and above the noise dominates the neighbour structure and the data looks high-dimensional. Intrinsic dimension is a statement about the scale at which you look, and neighbour search looks at the neighbour scale.

</details>

### 4. Where do the hubs sit?

For the Gaussian data with `d = 100` from block 5, compute the correlation between `N_10` and each point's distance from the centre of the data, and compare the 20 biggest hubs with the 20 least-popular points.

<details><summary>Answer</summary>

```python
rng = np.random.default_rng(4)                               # same data as the hubness block (d=100 row)
X = {d: rng.standard_normal((2000, d)) for d in (3, 20, 100)}[100]
nk = k_occurrence(X)
dist_to_centre = np.linalg.norm(X - X.mean(0), axis=1)
print("correlation(N_10, distance to the data centre): %.2f" % np.corrcoef(nk, dist_to_centre)[0, 1])
hubs = np.argsort(-nk)[:20]; others = np.argsort(nk)[:20]
print("mean distance to centre, 20 biggest hubs: %.2f | 20 least-popular points: %.2f"
      % (dist_to_centre[hubs].mean(), dist_to_centre[others].mean()))
```

Output:

```
correlation(N_10, distance to the data centre): -0.67
mean distance to centre, 20 biggest hubs: 8.12 | 20 least-popular points: 10.93
```

The correlation is strongly negative: the closer a point is to the centre of the cloud, the more often it is someone's neighbour. Hubs are the central points that are slightly closer to everyone, and in high dimensions "slightly closer" is enough to win the nearest-neighbour race over and over.

</details>

### Checkpoint quiz

1. In block 1, going from `D = 256` to `D = 1024` took `std/mean` from 0.034 to 0.017. How many times more dimensions are needed to halve it, and why?
2. An 8-dimensional sheet is rotated into 8 coordinates, and into 2,048 coordinates, without noise. How do their farthest/nearest ratios compare?
3. Why does PCA (95% variance) report 3 dimensions for a swiss roll that truly has 2?
4. A colleague shortens 1,536-dimensional embeddings to their first 256 coordinates to save storage. What do you measure before agreeing, and what must you do to the shortened vectors if you search with cosine?
5. In a sample of 10,000 real queries, 20% of your documents never appear in any top 10. Name the phenomenon and one possible cause besides it.

<details><summary>Answers</summary>

1. Four times as many. The relative spread falls like `1/sqrt(D)`, so halving it needs `D` multiplied by 4 (256 to 1024 did exactly that).
2. They are identical (4.91 in block 2). A distance-preserving rotation does not change any distance, so the extra coordinates add nothing.
3. PCA only finds straight directions of variance. A rolled sheet curves through 3 dimensions, so the straight-line count is 3; TwoNN, which looks only at local neighbour distances, reports about 1.9.
4. Compare the true top-k neighbours from the full vectors with those from the shortened vectors on your own queries (recall@k), and check that the model was trained to tolerate truncation. Re-normalize the shortened vectors to unit length, since truncation changes their length (Module 03).
5. Anti-hubs (a hubness effect). Other causes include poor chunking, documents that are near-duplicates of better matches, or a mismatch between how queries and documents are embedded. The way to tell them apart is to inspect the never-retrieved documents.

</details>

> [!check]
> - I can explain why nearest and farthest distances converge as dimension grows.
> - I can say what the max/min and std/mean measurements show and reproduce them.
> - I can describe hubs and anti-hubs and how to detect them in a retrieval system.
> - I can explain intrinsic dimension and why real embeddings still work, including when the argument fails (noise).
> - I can decide whether shortening embeddings is acceptable by measuring neighbour recall.

## Project

Write a `dimension_report(vectors)` function (numpy only) that takes an array of embeddings and prints a one-page diagnosis: number of vectors and dimension; how many principal components explain 90, 95 and 99% of the variance; a TwoNN intrinsic-dimension estimate; the farthest/nearest ratio and `std/mean` of distances measured on a sample of held-out queries; the hubness skew and the share of vectors that are never anyone's top-10 neighbour; and a recall curve for truncating to several sizes (first-m coordinates and top-m PCA directions), using exact search on the full vectors as ground truth. Finish with a short plain-language verdict ("neighbours are well separated", "hubness is high", "shortening to about X keeps Y% of neighbours"). Validate it on three synthetic datasets you construct (uniform full-dimensional, a low-dimensional sheet with little noise, the same sheet with heavy noise) and check that the verdicts match what you built. No code is given; decide how you sample queries and keep the memory use bounded.

## Interview questions

> [!interview] Nearest-neighbour search is said to "break" in high dimensions, yet you routinely search 1,000-plus-dimensional embeddings successfully. Reconcile the two.

<details><summary>What a strong answer covers</summary>

- States the concentration result: when distances' relative spread shrinks with dimension, nearest and farthest become indistinguishable (Beyer et al.), for roughly independent coordinates.
- Explains that real embeddings are not uniform in the ambient space: they lie near a low-dimensional manifold, so neighbour structure behaves like the intrinsic dimension.
- Gives the caveat: off-manifold noise at the scale of neighbour spacing brings the problem back, and a model's quality is what keeps the structure clean.
- Says how to check on real data: sample queries and measure separation between nearest and farthest (and between relevant and irrelevant) rather than assuming.

</details>

> [!interview] A teammate proposes cutting embedding dimension from 3072 to 256 to reduce vector database cost. How do you evaluate it?

<details><summary>What a strong answer covers</summary>

- Quantifies the saving (storage and compute scale linearly in D) and asks what the retrieval-quality budget is.
- Notes truncation is only appropriate for models trained for it (Matryoshka-style) or documented by the provider; otherwise consider a fitted projection (PCA) or a smaller model.
- Evaluates recall of true neighbours (exact search on full vectors as reference) and end-task metrics on real queries, at several sizes.
- Remembers to re-normalize shortened vectors before cosine or inner-product search.

</details>

> [!interview] What is hubness, and how would you notice it in a RAG system?

<details><summary>What a strong answer covers</summary>

- Defines hubs (documents appearing in many queries' top-k) and anti-hubs (never retrieved) and the skewed k-occurrence distribution that appears as dimension rises.
- Notes the mechanism: points near the data centre are slightly closer to everything.
- Detection: log retrieved document ids over a query sample and look at the distribution; check what share of the corpus never appears; inspect top hubs for generic or boilerplate text.
- Response options: fix chunking and boilerplate, rerank, evaluate on labelled queries; acknowledges that it is a property of the space, not a bug in the database.

</details>

## Common mistakes & troubleshooting

- **Cosine scores for good and bad matches are almost the same.** Expected in high dimensions: random pairs sit near zero with spread about `1/sqrt(D)`, and related texts are only modestly higher. Look at ranks rather than absolute values, and tune any threshold on labelled queries.
- **The same few chunks appear in answers to unrelated questions.** Likely hubs, often boilerplate (headers, disclaimers, tables of contents). Count top-k appearances over a query sample, and consider removing or re-chunking those documents.
- **Recall dropped after shortening vectors.** Either the model was not trained for truncation, or the shortened vectors were not re-normalized, or both. Compare with exact search on the full vectors, and re-check norms with the Module 03 code.
- **Intrinsic-dimension estimate looks wrong.** Noise inflates it and small samples deflate it (block 3). Estimate on a few thousand vectors, compare several noise-robust methods, and never use one number as a design rule.

## Further reading & sources

- [When Is "Nearest Neighbor" Meaningful? (Beyer, Goldstein, Ramakrishnan, Shaft, ICDT 1999)](https://link.springer.com/chapter/10.1007/3-540-49257-7_15) - the original distance-concentration result, its conditions, and the advice to check separation on sampled queries; my statements about the theorem and the "as few as 15 dimensions" experiments come from this paper.
- [Hubs in Space: Popular Nearest Neighbors in High-Dimensional Data (Radovanović, Nanopoulos, Ivanović, JMLR 2010)](https://jmlr.org/papers/v11/radovanovic10a.html) - defines k-occurrence, hubs and anti-hubs, and analyses their origin and effect on machine-learning tasks.
- [Estimating the intrinsic dimension of datasets by a minimal neighborhood information (Facco et al.)](https://arxiv.org/abs/1803.06992) - the TwoNN estimator implemented in block 3, designed for curved and non-uniform data.
- [The Intrinsic Dimension of Images and Its Impact on Learning (Pope et al.)](https://arxiv.org/abs/2104.08894) - estimates intrinsic dimension of common image datasets and finds it low relative to the pixel count.
- [Intrinsic dimension of data representations in deep neural networks (Ansuini et al.)](https://arxiv.org/abs/1905.12784) - finds that the intrinsic dimension of trained-network representations is orders of magnitude smaller than the layer width.
- [Matryoshka Representation Learning (Kusupati et al.)](https://arxiv.org/abs/2205.13147) - a training method that makes the leading coordinates of an embedding usable on their own, the safe case for truncation.
- [Vector embeddings | OpenAI API](https://developers.openai.com/api/docs/guides/embeddings) - documents shortening embedding dimensions and the instruction to normalize after changing the dimension manually.

## Next

[Module 05: Generating Embeddings at Scale](../05-generating-embeddings-at-scale/README.md)
