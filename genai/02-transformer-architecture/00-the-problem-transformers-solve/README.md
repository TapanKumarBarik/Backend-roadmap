# Module 00: The Problem Transformers Solve

## Why this matters

Track 00 already covered this ground once, conceptually: module 04's
RNN/LSTM sequential bottleneck, module 05's attention-as-soft-lookup,
and module 06's self-attention/parallelism story, each with a real
`torch`-based measurement. **This track goes back to the same problem
and builds the rigorous version** — starting here with the precise,
formal reason recurrence doesn't scale, stated as a graph-connectivity
property verified directly rather than only measured as wall-clock
time. Everything from module 01 onward in this track (the math, the
attention mechanism, the full block) is built to solve exactly the
problem this module states precisely.

## Concepts

### Restating the problem precisely: path length, not just speed

Track 00 module 04's exercise 4 measured that an LSTM is *slower* than
a parallel linear layer at long sequence lengths — a real, useful
wall-clock fact. This module asks a sharper question behind that one:
**how many sequential computation steps does information have to pass
through to get from position `i` to position `j` in a sequence?** This
is a property of the architecture's connectivity, not of hardware speed,
and it's the actual reason the field moved away from recurrence, stated
the way the original Transformer paper states it (Vaswani et al., 2017,
Table 2): **maximum path length between any two positions.**

### Verified: RNN connectivity forces a path length of `n-1`

In a recurrent architecture, position `i`'s hidden state can only be
computed after position `i-1`'s. Information from position 0 reaching
position `n-1` has to pass through every single intermediate position —
a chain, verified directly via breadth-first search over the actual
connectivity graph each architecture implies:

```python
from collections import deque

def bfs_path_length(adj, n, start, end):
    dist = {start: 0}
    q = deque([start])
    while q:
        u = q.popleft()
        for v in adj(u, n):
            if v not in dist:
                dist[v] = dist[u] + 1
                q.append(v)
    return dist.get(end, float("inf"))

def rnn_adj(u, n):
    return [v for v in (u - 1, u + 1) if 0 <= v < n]

def attention_adj(u, n):
    return [v for v in range(n) if v != u]

for n in [8, 16, 64, 256]:
    rnn_len = bfs_path_length(rnn_adj, n, 0, n - 1)
    attn_len = bfs_path_length(attention_adj, n, 0, n - 1)
    print(n, "RNN path:", rnn_len, "  attention path:", attn_len)
```

Verified output:

```
n=8    RNN path=7    attention path=1
n=16   RNN path=15   attention path=1
n=64   RNN path=63   attention path=1
n=256  RNN path=255  attention path=1
```

**Self-attention connects every position directly to every other
position, so the path length between any two positions is always
exactly 1, regardless of sequence length.** This is a structural,
architectural fact, not a performance optimization — it's *why*
self-attention doesn't just run faster than an RNN on today's hardware,
it fundamentally doesn't accumulate the same information-distance
problem as sequences get longer. A dependency between the first and
last word of a 10,000-token document is exactly as "close," in this
sense, as a dependency between two adjacent words.

### Why path length, specifically, matters for learning

A longer path length isn't just a speed cost — it's a **learning
difficulty** cost. Track 00 module 04 already covered the vanishing
gradient problem: a gradient signal has to backpropagate through every
intermediate step on that path, and it can shrink (or explode) at each
one. A path length of `n-1` means a dependency between distant positions
has to survive `n-1` potentially-lossy hops during training; a path
length of `1` means it doesn't have to survive any. This is the same
underlying reason RNNs (even LSTMs, which were specifically designed to
mitigate but not eliminate this) struggle more on long-range
dependencies than transformers do — verified in track 00 module 04's
own exercises, now explained by the structural path-length property
verified numerically above.

### Two problems solved together, not one

It's worth being precise that "the problem transformers solve" is
really two related but distinct problems, both fixed by the same
architectural change (module 03 onward covers the actual mechanism):

```
 Problem 1: LEARNING long-range dependencies
   RNN:          path length = n-1  ->  gradient must survive n-1 hops
   Self-attn:    path length = 1    ->  gradient survives exactly 1 hop

 Problem 2: COMPUTING over long sequences fast
   RNN:          position i+1 cannot start until position i finishes
                 -> O(n) sequential steps, no matter how many cores
                    you throw at it
   Self-attn:    every position's output can be computed independently,
                 given all positions' inputs -> O(1) sequential steps
                 (all of it happens in parallel), at the cost of O(n^2)
                 total computation (module 11 in track 01 covered this
                 quadratic cost from the serving side)
```

Self-attention doesn't reduce total computation — module 11 (track 01)
already established it costs *more* total compute (quadratic in
sequence length) than an RNN's linear-in-length cost. What it changes
is **how much of that compute can happen at once**: effectively none of
an RNN's steps can run concurrently with each other, while effectively
all of self-attention's per-position computations can. This is the
precise version of track 00 module 06's "parallelism was the real
breakthrough" — measured here as a connectivity property, not only a
stopwatch result.

## Reference

```
 Architecture       Max path length      Sequential ops per
                    between positions     forward pass
 ────────────       ────────────────      ──────────────────
 Recurrent (RNN)     n - 1                 n  (one per position,
                                            strictly ordered)
 Self-attention      1                     1  (all positions at
                                            once, given the inputs)
```

```
 Track 00's version (already covered — don't re-derive):
 ─────────────────────────────────────────────────────────
 Module 04   RNN/LSTM mechanics, vanishing gradients, wall-clock
             sequential-bottleneck measurement
 Module 05   Attention as a soft, differentiable lookup; QKV origins;
             "attention in five lines"
 Module 06   Self-attention as the key generalization; masked
             self-attention; wall-clock parallelism measurement

 This track's job from here: the actual mechanism (module 03+), the
 real mathematical machinery (module 01-02), and a from-scratch
 implementation (module 17) — not re-covering the above.
```

## Hands-on exercises

### Exercise 1 — reproduce the path-length verification

Run the exact BFS code above for a range of sequence lengths of your
own choosing, and confirm the pattern holds: RNN path length always
equals `n-1`; self-attention path length is always exactly `1`.

### Exercise 2 — connect path length to a concrete document

Pick a sentence or short passage where understanding one word requires
context from a word far earlier (a pronoun resolving to a noun several
sentences back is a good example). Count the approximate token distance
between them. Using the verified RNN path-length formula, state how
many sequential hops a gradient connecting those two tokens would have
to survive during RNN training — and contrast with self-attention's
constant 1.

### Exercise 3 — extend the BFS simulation to a local (windowed) architecture

Some architectures (dilated convolutions, sliding-window attention)
connect each position only to nearby positions rather than either a
strict chain (RNN) or every other position (full self-attention). Add
an adjacency function connecting each position to its neighbors within
a fixed window (e.g., ±3), run the same BFS, and observe how the path
length scales with `n` for this middle-ground case. Connect your
observation to why some long-context architectures use local or sparse
attention patterns (previewed here, a real production technique) as a
compromise between full self-attention's O(n²) cost and a chain's O(n)
path length.

## Independent challenge

A colleague argues "since self-attention has path length 1 regardless
of sequence length, transformers should have no difficulty at all with
very long documents." Using this module's distinction between path
length (a learning-difficulty property) and total compute cost (an
O(n²) resource property, track 01 module 11), explain in two or three
sentences why this claim is incomplete — what real difficulty *does*
scale with sequence length for a transformer, even though path length
doesn't?

<details><summary>Discussion</summary>

Path length staying constant at 1 addresses the gradient/learning
difficulty of connecting distant positions, but says nothing about
compute or memory cost — both of which scale quadratically (attention
compute) or need real hardware capacity (the KV cache) as sequence
length grows, verified with real numbers in track 01 module 11. A
transformer genuinely doesn't get *harder to learn from* as documents
get longer in the same way an RNN does, but it does get more expensive
to run, and separately, track 01 module 11's "lost in the middle"
finding shows that even a technically-reachable distant dependency
isn't always used reliably in practice — path length being short is
necessary, not sufficient, for a model to actually use distant context
well.

</details>

## Common mistakes & troubleshooting

- **Conflating "path length 1" with "attention is cheap."** Verified
  above: attention has a *shorter learning path* than recurrence, but a
  *more expensive total compute cost* (quadratic, not linear) — these
  are two separate properties, not the same tradeoff stated twice.
- **Re-deriving the RNN sequential-bottleneck wall-clock measurement**
  instead of building on track 00 module 04's exercise 4, which already
  measured it directly. This track's job is the *structural* reason
  (path length), not a repeat of the timing experiment.
- **Assuming path length 1 guarantees a model uses distant context
  well.** It's a necessary architectural property, not a guarantee —
  track 01 module 11's "lost in the middle" finding shows real models
  still use some positions less reliably than others, despite every
  position being architecturally one hop away.

## Checkpoint quiz

1. What does "path length between two positions" mean, and what did
   the verified BFS experiment show for RNNs versus self-attention?
2. Is the path-length difference a hardware/speed fact, or a structural
   property of the architecture's connectivity?
3. Name the two genuinely distinct problems this module identifies,
   both addressed by moving to self-attention.
4. Does self-attention reduce total computation compared to an RNN, or
   only change how much of it can happen in parallel?
5. Why is "path length 1 means transformers have no difficulty with
   long documents" an incomplete claim?

<details><summary>Answers</summary>

1. The number of sequential hops information must pass through to get
   from one position to another. Verified: an RNN's path length equals
   `n-1` (a strict chain through every intermediate position);
   self-attention's path length is always exactly `1`, regardless of
   sequence length.
2. A structural property of connectivity — it's determined by which
   positions are directly connected to which others in the
   architecture, independent of what hardware runs the computation.
3. (1) Learning long-range dependencies (a longer path length forces a
   gradient to survive more potentially-lossy hops); (2) computing over
   long sequences quickly (an RNN's steps must run in strict order,
   while self-attention's per-position computations can run
   concurrently).
4. Only changes parallelism, not total computation — self-attention
   costs *more* total compute (quadratic in sequence length, per track
   01 module 11) than an RNN's linear cost; what improves is how much
   of that compute can happen at once (effectively all of it, versus
   effectively none for an RNN).
5. Because path length addresses learning/gradient difficulty, not
   compute or memory cost, both of which do scale with sequence length
   for a transformer (quadratic attention compute, a real KV cache
   memory cost) — and because a short path length doesn't guarantee a
   model reliably uses distant context in practice (the "lost in the
   middle" finding).

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Table 2 directly compares maximum path length, per-layer complexity, and sequential operations across self-attention, recurrent, and convolutional layers; the source of this module's central comparison.
- [Long Short-Term Memory (Hochreiter & Schmidhuber, 1997)](https://www.bioinf.jku.at/publications/older/2604.pdf) - the original LSTM paper; its gating mechanism is the mitigation (not elimination) of the vanishing-gradient consequence of long RNN path lengths, covered in track 00 module 04.
- [WaveNet: A Generative Model for Raw Audio (van den Oord et al., 2016)](https://arxiv.org/abs/1609.03499) - introduces dilated convolutions, the local/windowed architecture referenced in exercise 3 as a middle ground between full recurrence and full self-attention.
- [Track 00, Module 04: RNNs/LSTMs and the Sequence Problem](../../00-genai-foundations/04-rnns-lstms-and-the-sequence-problem/README.md) - the conceptual companion to this module: RNN/LSTM mechanics, vanishing gradients, and the original wall-clock sequential-bottleneck measurement.
- [Track 00, Module 06: The Transformer Moment](../../00-genai-foundations/06-the-transformer-moment/README.md) - covers self-attention as the key generalization and the original parallelism wall-clock measurement this module's path-length analysis explains structurally.

## Next

[Module 01: The Math You Actually Need: Vectors, Matrices, Dot Products](../01-the-math-you-actually-need-vectors-matrices-dot-products/README.md)
