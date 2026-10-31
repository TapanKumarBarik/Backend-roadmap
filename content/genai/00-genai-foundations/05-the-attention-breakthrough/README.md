# Module 05: The Attention Breakthrough

## Why this matters

Module 04 ended with two walls that killed recurrence. Attention is the
fix for the first one, and it arrived (Bahdanau et al., 2014) three years
before anyone thought to throw away the RNN entirely.

The idea is almost embarrassingly simple once stated: **instead of
forcing the decoder to work from one squeezed summary vector, let it look
back at every input position and decide, at each output step, which
positions matter right now.** No more bottleneck. Translation quality on
long sentences stopped degrading essentially overnight.

Two reasons this module earns its place rather than being a historical
footnote:

1. **Attention is the entire content of the transformer.** Track 02 is
   mostly "attention, done more times, in parallel, with extra plumbing."
   If you understand the weighted-average-over-positions idea here, that
   track becomes mechanical rather than mysterious.
2. **Attention weights are the closest thing to interpretability these
   models offer.** When you debug why a model answered from the wrong
   part of a long document (a constant occupation in track 09's RAG
   work), attention is the vocabulary you'll reason in.

## Concepts

### The problem restated in one picture

```
WITHOUT ATTENTION (module 04)          WITH ATTENTION (this module)

 h₁  h₂  h₃  h₄  h₅                     h₁  h₂  h₃  h₄  h₅
  │   │   │   │   │                      │   │   │   │   │
  └───┴───┴───┴───┤                      └───┴───┴───┴───┘
                  ▼                          ╲  ╲ │ ╱  ╱
            ┌──────────┐                      ╲  ╲│╱  ╱   decoder looks
            │  ONE     │                       ╲ ╱│╲ ╱    at ALL of them,
            │  vector  │  ◄─ bottleneck         ╲╱ │ ╲╱     weighted
            └────┬─────┘                         ▼ ▼ ▼
                 ▼                            ┌─────────┐
             decoder                          │ decoder │
                                              └─────────┘
   everything must survive             nothing is discarded; the
   the squeeze                         decoder re-weights per step
```

### Attention as a soft, differentiable lookup

The cleanest way to think about attention is as a **dictionary lookup
where you retrieve a blend of every entry rather than exactly one.**

A Python dict does a hard lookup: `d["cat"]` returns exactly one value,
and the key must match exactly. Attention does a *soft* lookup: it
compares your query against every key, converts those comparison scores
into weights that sum to 1, and returns the weighted average of all
values.

```
 hard lookup (dict)              soft lookup (attention)

 query: "cat"                    query: some vector q
   │                               │
   ▼  exact match                  ▼  score against EVERY key
 ┌──────────────┐               ┌────────────────────────────┐
 │ cat  → v_cat │ ──► v_cat     │ k₁ · q = 2.1  ──► w₁ = 0.62 │
 │ dog  → v_dog │               │ k₂ · q = 0.4  ──► w₂ = 0.11 │
 │ car  → v_car │               │ k₃ · q = 1.3  ──► w₃ = 0.27 │
 └──────────────┘               └────────────────────────────┘
                                              │ softmax → sums to 1.0
   one value, or KeyError                     ▼
                                 output = 0.62·v₁ + 0.11·v₂ + 0.27·v₃
                                          a BLEND of all values
```

That "blend" property is what makes attention trainable: a hard lookup
isn't differentiable (you can't take a gradient through "pick index 3"),
but a weighted average is. The model can learn, by gradient descent, to
push the weights toward the positions that matter.

### The three steps, concretely

Every attention mechanism — including every one in track 02 — is these
three steps:

```
 STEP 1: SCORE       how well does the query match each key?
                     scoreᵢ = q · kᵢ          (a dot product)

 STEP 2: NORMALIZE   turn raw scores into weights that sum to 1
                     w = softmax(scores)

 STEP 3: BLEND       weighted average of the values
                     output = Σ wᵢ · vᵢ
```

Worked on real numbers:

```
 scores        [ 2.1 ,  0.4 ,  1.3 ]
                  │       │      │
                  ▼  softmax (exponentiate, then divide by the sum)
 e^score       [ 8.17,  1.49,  3.67]     sum = 13.33
 weights       [ 0.61,  0.11,  0.28]     sum = 1.00  ◄── always
                  │       │      │
                  ▼       ▼      ▼
 output = 0.61·v₁ + 0.11·v₂ + 0.28·v₃
```

Softmax is doing real work here: it's monotonic (bigger score → bigger
weight), it forces everything positive, and it normalizes to a valid
probability distribution. It also **exaggerates differences** — a score
gap of 2.1 vs 1.3 (a factor of 1.6) becomes a weight gap of 0.61 vs 0.28
(a factor of 2.2). Attention is sharper than the raw scores suggest.

### Where queries, keys and values come from

In Bahdanau-style attention on a translation model:

- **Query** — the decoder's current state. "I'm about to emit the third
  English word; what do I need?"
- **Keys** — one per input position, used for matching.
- **Values** — also one per input position, holding the content to
  actually retrieve.

In the original formulation keys and values were the same encoder hidden
states. Splitting them into separate learned projections is a
transformer-era refinement (track 02 module 05) — the separation lets the
model use different information for *matching* than for *retrieving*.

### Attention weights are a soft alignment

Because the weights sum to 1 per output step, you can lay them out as a
matrix and read which input positions each output word drew from. For
translation this recovers word alignment **without ever being taught
alignment** — it falls out of training on translation alone.

```
                    INPUT (French)
              le   chat   noir  s'est  assis
            ┌─────┬─────┬──────┬─────┬──────┐
      the   │ .81 │ .06 │ .04  │ .05 │ .04  │
            ├─────┼─────┼──────┼─────┼──────┤
O   black   │ .04 │ .09 │ .79  │ .04 │ .04  │  ◄── "black" attends to
U           ├─────┼─────┼──────┼─────┼──────┤      "noir", position 3,
T     cat   │ .05 │ .82 │ .06  │ .03 │ .04  │      even though English
P           ├─────┼─────┼──────┼─────┼──────┤      puts it before "cat"
U     sat   │ .03 │ .04 │ .04  │ .38 │ .51  │
T           └─────┴─────┴──────┴─────┴──────┘
              each ROW sums to 1.0

   note the CROSSING: French "chat noir" → English "black cat".
   A fixed window could not do this; attention reorders freely.
```

Two honest caveats, because attention-as-explanation is over-claimed:

- High attention weight means "this position influenced the output,"
  which is **not** the same as "this is the reason for the output."
  There's a real research literature arguing attention is not
  straightforwardly an explanation.
- In a deep multi-head transformer there are dozens of attention matrices
  per layer, most of which are not human-interpretable. The clean
  alignment picture above is the best case, not the typical one.

### The cost nobody mentions at first

Attention compares every query against every key. For a sequence of
length `n`, that's `n²` comparisons.

```
   n = 100      →      10,000 scores
   n = 1,000    →   1,000,000 scores
   n = 10,000   → 100,000,000 scores
   n = 100,000  →      10^10  scores      ◄── quadratic bites hard
```

This `O(n²)` scaling is *the* reason long context windows are expensive
and hard-won, why FlashAttention exists (track 05), and why serving costs
scale the way they do (track 14). Every "1M token context" announcement
is fundamentally an announcement about beating this curve.

## Reference

| Term | Means |
|---|---|
| Attention | Weighted average over positions, with learned weights |
| Query (q) | What the current step is looking for |
| Key (k) | What each position offers for matching |
| Value (v) | What each position contributes if selected |
| Alignment score | Raw similarity between a query and one key |
| Softmax | Turns scores into positive weights summing to 1 |
| Attention weights | The normalized scores; a soft alignment |
| Context vector | The blended output of the weighted sum |
| Cross-attention | Query from decoder, keys/values from encoder |
| Self-attention | Query, keys and values all from the same sequence (track 02) |
| O(n²) | Attention's cost: every position scored against every other |

| Task | Code (NumPy) |
|---|---|
| Dot-product scores | `scores = keys @ query` |
| Stable softmax | `e = np.exp(s - s.max()); e / e.sum()` |
| Weighted blend | `output = weights @ values` |
| Full attention | `softmax(K @ q) @ V` |
| Scaled version | `softmax((K @ q) / np.sqrt(d)) @ V` |

## Hands-on exercises

Install once: `pip install numpy` (torch optional for exercise 6).

### 1. Implement softmax, and see why the max is subtracted

```python
import numpy as np

def softmax_naive(s):
    e = np.exp(s)
    return e / e.sum()

def softmax(s):
    e = np.exp(s - np.max(s))      # shift: mathematically identical
    return e / e.sum()

small = np.array([2.1, 0.4, 1.3])
print("naive :", softmax_naive(small).round(3))
print("stable:", softmax(small).round(3))          # same answer

big = np.array([1000.0, 999.0, 998.0])
print("naive on big :", softmax_naive(big))        # nan -- overflow
print("stable on big:", softmax(big).round(3))     # fine
```

Run it. Explain in one sentence why subtracting the max changes nothing
mathematically but everything numerically. (This is the same class of
issue as log-probabilities in module 01 — the field is full of it.)

### 2. Attention in five lines

```python
import numpy as np

def attention(query, keys, values):
    scores = keys @ query                       # 1. score
    weights = np.exp(scores - scores.max())
    weights = weights / weights.sum()           # 2. normalize
    return weights @ values, weights            # 3. blend

keys = np.array([[1.0, 0.0],      # position 0
                 [0.0, 1.0],      # position 1
                 [0.7, 0.7]])     # position 2
values = np.array([[10.0, 0.0],
                   [0.0, 10.0],
                   [5.0,  5.0]])

for q, label in [(np.array([1.0, 0.0]), "looks like key 0"),
                 (np.array([0.0, 1.0]), "looks like key 1"),
                 (np.array([0.7, 0.7]), "between them")]:
    out, w = attention(q, keys, values)
    print(f"{label:18s} weights={w.round(3)}  output={out.round(2)}")
```

Confirm that a query resembling key 0 pulls the output toward value 0.
Then answer: what would the weights be if all three scores were equal,
and what does the output become in that case?

<details><summary>Answer</summary>

Equal scores give equal weights `[0.333, 0.333, 0.333]`, and the output
is the plain unweighted mean of all values. This is the "attending to
nothing in particular" state — worth recognizing, because an attention
head whose weights are near-uniform across a long sequence is
contributing almost no positional selectivity, and near-uniform weights
over thousands of positions is one signature of the long-context dilution
problem in track 09.
</details>

### 3. Watch the bottleneck disappear

Compare a fixed summary against attention as sequence length grows.

```python
import numpy as np
rng = np.random.default_rng(0)

def mean_pool(values):                 # the module-04 bottleneck
    return values.mean(axis=0)

def attend(query, keys, values):
    s = keys @ query
    w = np.exp(s - s.max()); w /= w.sum()
    return w @ values

for n in [5, 25, 200]:
    keys = rng.normal(size=(n, 8))
    values = rng.normal(size=(n, 8))
    target = 3                          # the position we actually want
    query = keys[target]                # a query that matches it

    pooled = mean_pool(values)
    attended = attend(query, keys, values)
    want = values[target]

    print(f"n={n:4d}  mean-pool err={np.abs(pooled-want).mean():.3f}"
          f"   attention err={np.abs(attended-want).mean():.3f}")
```

Mean-pooling's error stays high and roughly constant regardless of `n` —
it has thrown the specific information away. Attention stays low. Write a
sentence connecting this to the seq2seq translation-quality collapse from
module 04.

### 4. Build and read an alignment matrix

```python
import numpy as np

def attention_matrix(queries, keys):
    s = queries @ keys.T
    e = np.exp(s - s.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)

src = ["le", "chat", "noir"]
tgt = ["the", "black", "cat"]

# hand-built vectors so the alignment is legible
k = np.array([[1,0,0], [0,1,0], [0,0,1]], dtype=float)   # le, chat, noir
q = np.array([[1,0,0], [0,0,1], [0,1,0]], dtype=float)   # the, black, cat

A = attention_matrix(q * 3, k)     # x3 sharpens the softmax
print("        " + "  ".join(f"{w:>6}" for w in src))
for i, word in enumerate(tgt):
    print(f"{word:>7} " + "  ".join(f"{v:6.2f}" for v in A[i]))
print("\nrow sums:", A.sum(axis=1).round(3))
```

Confirm every row sums to 1. Identify the crossing (which target word
attends to a source position out of order) and state why a fixed-size
sliding window could not produce this.

### 5. Feel the quadratic cost

```python
import numpy as np, time

for n in [128, 512, 2048, 8192]:
    K = np.random.rand(n, 64).astype(np.float32)
    Q = np.random.rand(n, 64).astype(np.float32)
    t0 = time.perf_counter()
    S = Q @ K.T                      # the n x n score matrix
    dt = time.perf_counter() - t0
    print(f"n={n:5d}  score matrix={S.shape}  "
          f"{S.nbytes/1e6:8.1f} MB  {dt*1000:7.1f} ms")
```

Note the memory column especially — it's the score *matrix* that hurts,
not just the compute. Extrapolate to `n = 128_000` (a modern context
window) and report the MB. Then explain why this single number motivates
FlashAttention (track 05) and the serving techniques in track 14.

<details><summary>Answer</summary>

At `n = 128,000` the score matrix is 128,000² = 1.64×10¹⁰ entries. At 4
bytes per float32 that's about **65,500 MB — roughly 65 GB**, for one
attention head, in one layer, for one sequence. No GPU holds that.

This is why naive attention is never used at long context.
FlashAttention's core insight is to never materialize the full matrix —
it computes attention in tiles that fit in fast on-chip memory,
recomputing rather than storing. Track 05 covers the mechanism; track 14
covers what it means for serving cost.
</details>

### 6. Diagnose and fix: attention that ignores position

A colleague implements attention over a sentence and is confused that
their model treats `"dog bites man"` and `"man bites dog"` identically —
the exact failure from module 03 exercise 7, resurfacing.

Explain why plain attention, by itself, is order-blind, and name what has
to be added.

<details><summary>Answer</summary>

Attention computes a weighted *sum* over positions. Addition is
commutative, so permuting the inputs permutes which weight lands on which
value but produces the same set of terms — the mechanism has no inherent
notion of "position 1 comes before position 2." Attention treats its
input as a **set**, not a sequence.

The fix is **positional encoding**: inject position information into the
vectors themselves before attention sees them, so that a token's
representation differs depending on where it sits. Track 02 modules 09-11
cover sinusoidal encodings and RoPE. This is not a footnote — it's a
mandatory component, and it exists solely because of this property.
</details>

## Independent challenge

Implement **attention-augmented sequence copying** and prove it beats a
bottleneck baseline.

The task: given a random sequence of vectors and an index, output the
vector at that index. Build two models — one that must compress the whole
sequence into a single fixed vector before answering, and one that may
attend over all positions. Train both (PyTorch, or hand-rolled NumPy
gradients if you're ambitious) at sequence lengths 5, 20, 100.

Deliverable: a plot or table of accuracy vs. sequence length for both
models, plus a paragraph explaining the shape of each curve using this
module's vocabulary. You should be able to predict the result before you
run it — that's the point.

## Common mistakes & troubleshooting

- **Using unstable softmax.** `np.exp` on large scores overflows to `inf`
  and then `nan`. Always subtract the max (exercise 1).
- **Forgetting attention is order-blind.** Positional information is a
  separate, mandatory ingredient (exercise 6).
- **Reading attention weights as explanation.** They show influence, not
  reasons. Useful for debugging, not proof of a model's logic.
- **Normalizing along the wrong axis.** For a `(queries × keys)` matrix,
  softmax must run across *keys* so each query's weights sum to 1.
  Getting this backwards produces a model that trains but never learns
  properly — a silent bug worth checking with `A.sum(axis=1)`.
- **Ignoring the `O(n²)` memory cost until it's a production incident.**
  It's the dominant constraint on context length; budget for it early.

## Checkpoint quiz

1. What problem from module 04 does attention solve, and which one does
   it leave untouched?
2. Name the three steps of any attention mechanism.
3. Why must attention be a *soft* (weighted) lookup rather than a hard
   selection?
4. What do query, key and value each represent?
5. Why does softmax subtract the max before exponentiating?
6. Why is attention order-blind, and what fixes it?
7. How does attention's cost scale with sequence length, and why does
   that matter commercially?

<details><summary>Answers</summary>

1. It solves the fixed-size bottleneck — the decoder can consult all
   encoder states instead of one squeezed vector. It does *not* solve the
   parallelism problem; a recurrent encoder with attention bolted on is
   still sequential. Dropping recurrence entirely (module 06) is what
   solves that.
2. Score (compare query to each key), normalize (softmax to weights
   summing to 1), blend (weighted sum of values).
3. A hard selection isn't differentiable — you can't backpropagate
   through "pick index 3." A weighted average is smooth, so the model can
   learn where to look by gradient descent.
4. Query: what the current step needs. Key: what each position offers for
   matching. Value: what each position contributes to the output if
   selected.
5. For numerical stability — `exp` of a large score overflows to `inf`.
   Subtracting the max leaves the result mathematically identical because
   the constant cancels in the ratio.
6. It computes a weighted sum, and addition is commutative, so it treats
   input as a set. Positional encoding (track 02) injects order into the
   vectors before attention sees them.
7. `O(n²)` — every position is scored against every other, in both
   compute and memory. It's the reason long context windows are expensive
   and the thing every long-context breakthrough is really about.
</details>

## Further reading & sources

- [Neural Machine Translation by Jointly Learning to Align and Translate (Bahdanau et al., 2014)](https://arxiv.org/abs/1409.0473) - the paper that introduced attention, three years before the transformer; the alignment matrices in section 6 are the real version of this module's diagram.
- [Effective Approaches to Attention-based Neural Machine Translation (Luong et al., 2015)](https://arxiv.org/abs/1508.04025) - the follow-up that simplified scoring to a plain dot product, which is what the transformer inherited.
- [Visualizing A Neural Machine Translation Model (Jay Alammar)](https://jalammar.github.io/visualizing-neural-machine-translation-mechanics-of-seq2seq-models-with-attention/) - animated, step-by-step attention over a translation. The best visual companion to this module.
- [Attention and Augmented Recurrent Neural Networks (Distill, 2016)](https://distill.pub/2016/augmented-rnns/) - interactive explanations of attention with live diagrams; Distill's rendering quality is still unmatched.
- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - where this leads next; skim section 3.2 now to see the same three steps written as `softmax(QK^T/sqrt(d))V`.
- [Attention is not Explanation (Jain & Wallace, 2019)](https://arxiv.org/abs/1902.10186) - the case against reading attention weights as reasons, and the counterpoint [Attention is not not Explanation (Wiegreffe & Pinter, 2019)](https://arxiv.org/abs/1908.04626). Read both before you trust an attention heatmap.
- [FlashAttention (Dao et al., 2022)](https://arxiv.org/abs/2205.14135) - how the `O(n²)` memory cost from exercise 5 is actually beaten in practice; covered properly in track 05.

## Next

[Module 06: The Transformer Moment (2017)](../06-the-transformer-moment/README.md)
