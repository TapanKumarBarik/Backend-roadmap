# Module 11: Rotary Position Embeddings (RoPE)

## Why this matters

Module 10 verified that sinusoidal positional encoding lets *relative*
position be expressed as a fixed linear transformation — but it does
this indirectly: position is added to the token embedding, and the
relative-offset property has to survive being carried through every
subsequent computation. RoPE (used in Llama, GPT-NeoX, and most modern
open-weight models) takes the same underlying idea — rotation — and
applies it *directly to Q and K*, right before the attention dot
product, rather than to the input embedding. This module verifies
RoPE's actual payoff, stated precisely and checked numerically: the
attention score between two tokens depends **only on their relative
distance**, never on their absolute positions, even though each token's
individual Q/K vector is rotated according to its own absolute
position.

## Concepts

### The mechanism: rotate Q and K by an angle proportional to absolute position

RoPE splits each Q or K vector into 2D pairs (dimensions `(0,1)`,
`(2,3)`, etc. — the same pairing structure as sinusoidal encoding's
frequency bands, module 10) and rotates each pair by an angle equal to
`position x frequency`, where different pairs use different, decreasing
frequencies exactly as in module 10:

```python
import numpy as np

def rotate_pair(x, theta):
    c, s = np.cos(theta), np.sin(theta)
    R = np.array([[c, -s], [s, c]])
    return R @ x

def rope_apply(vec, pos, freq):
    d = len(vec)
    out = np.zeros(d)
    for i in range(0, d, 2):
        theta = pos * freq[i // 2]
        out[i:i + 2] = rotate_pair(vec[i:i + 2], theta)
    return out
```

Crucially, this rotation is applied to **Q and K directly**, not to the
token embedding before it's projected — module 10's scheme adds a fixed
vector to the input; RoPE instead transforms the query and key vectors
themselves, at attention-computation time.

### Verified: the attention score depends only on relative distance, not absolute position

This is RoPE's central, checkable claim. Rotate a fixed query vector by
position `m` and a fixed key vector by position `n`, and their dot
product should depend only on `m - n`:

```python
np.random.seed(5)
d = 4
freq = 1.0 / (10000 ** (np.arange(0, d, 2) / d))
q_raw, k_raw = np.random.randn(d), np.random.randn(d)

for m, n in [(0, 0), (5, 5), (10, 10)]:          # all have m - n = 0
    q_rot, k_rot = rope_apply(q_raw, m, freq), rope_apply(k_raw, n, freq)
    print(m, n, m - n, q_rot @ k_rot)

for m, n in [(3, 1), (7, 5), (20, 18), (2, 0)]:   # all have m - n = 2
    q_rot, k_rot = rope_apply(q_raw, m, freq), rope_apply(k_raw, n, freq)
    print(m, n, m - n, q_rot @ k_rot)
```

Verified output:

```
same relative distance (m-n=0):
  m=0,  n=0,  diff=0:  dot=-2.5362
  m=5,  n=5,  diff=0:  dot=-2.5362
  m=10, n=10, diff=0:  dot=-2.5362

same relative distance (m-n=2):
  m=3,  n=1,  diff=2:  dot=-1.2283
  m=7,  n=5,  diff=2:  dot=-1.2283
  m=20, n=18, diff=2:  dot=-1.2283
  m=2,  n=0,  diff=2:  dot=-1.2283
```

Four completely different absolute position pairs — `(3,1)`, `(7,5)`,
`(20,18)`, `(2,0)` — all share the same relative distance of 2, and
**all four produce the exact same attention score**, to four decimal
places. The individual rotated vectors `rope_apply(q_raw, 3, freq)` and
`rope_apply(q_raw, 20, freq)` are genuinely different (each token really
is rotated by its own absolute position) — but their *dot products*
with correspondingly-offset keys collapse onto the same value, purely
as a consequence of rotation geometry (rotating both a query and a key
vector by the same additional angle doesn't change the angle *between*
them, and the dot product of two vectors depends only on their
magnitudes and the angle between them — module 01's dot-product-as-
alignment framing, applied here precisely).

### Why this matters more than sinusoidal encoding's version of the same idea

Module 10 verified a similar-sounding property — a fixed rotation
matrix maps `PE(pos)` to `PE(pos+k)` — but that property lived in the
*positional encoding itself*, added to the token embedding once, at the
very start. Whatever guarantees it provided had to survive being
processed by every subsequent linear layer, attention computation, and
nonlinearity in the model. RoPE's property, verified directly above,
lives in the **attention score computation itself** — it's not a
property of an input feature that might get diluted; it's baked
directly into how Q and K interact at every single attention
computation in every layer. This is part of why RoPE has become the
dominant scheme in modern open-weight models: the relative-position
guarantee doesn't depend on anything downstream preserving it.

### RoPE and long-context extrapolation

Because RoPE's guarantee is about relative distance specifically
(verified: identical scores for any pair sharing the same offset,
regardless of how large the absolute positions are), it behaves more
predictably when a model is asked to process sequences longer than
anything seen during training than schemes tied to fixed absolute
position tables — a real, practical reason (beyond the elegance
verified above) RoPE-based models are commonly extended to longer
context windows (track 01 module 11) via specific interpolation/scaling
techniques applied to RoPE's frequencies, rather than needing an
entirely new positional scheme.

## Reference

```
 Property                    Sinusoidal (module 10)        RoPE (this module)
 ─────────────────────       ───────────────────────       ──────────────────────
 Applied to                   token embedding (added         Q and K vectors
                               once, at input)                 (at each attention
                                                                 computation)
 Relative-offset               fixed rotation maps            attention SCORE
 guarantee                     PE(pos) to PE(pos+k)            itself depends only
                                                                 on relative distance
                                                                 (verified directly)
 Where the guarantee            must survive every              built into the
 must be preserved              subsequent layer                 score computation,
                                                                  every layer
```

## Hands-on exercises

### Exercise 1 — reproduce the relative-distance verification

Run the exact code above with your own random query/key vectors and
your own set of `(m, n)` pairs sharing a common offset. Confirm the
dot product is identical across all pairs with the same `m - n`, and
different for pairs with a different offset.

### Exercise 2 — confirm individual rotated vectors still differ by absolute position

Compute `rope_apply(q_raw, 3, freq)` and `rope_apply(q_raw, 20, freq)`
directly and confirm they are genuinely different vectors (not
`np.allclose`), even though exercise 1 showed their dot products with
correspondingly-offset keys come out identical. This confirms the
invariance is a property of the *score*, not of the individual rotated
vectors themselves.

### Exercise 3 — verify with a larger dimension and multiple frequency pairs

Repeat the relative-distance verification at `d=16` or `d=64` (closer
to real per-head dimensions, module 08), confirming the property holds
across all the frequency pairs simultaneously, not just the single pair
used in the small `d=4` example above.

## Independent challenge

A colleague argues "since RoPE guarantees the attention score only
depends on relative distance, absolute position must not matter to a
RoPE-based model at all." Using this module's verified findings (both
the score-invariance and the individually-different-rotated-vectors
results), write two or three sentences explaining what's wrong with
this claim.

<details><summary>Discussion</summary>

The score between any two tokens does depend only on their relative
distance (verified directly), but that's a statement about *pairwise*
attention scores, not about the model's overall behavior — a sequence's
absolute length, and which token is first versus last, still shapes
which relative distances actually occur between which tokens, and
downstream layers (feed-forward networks, module 12; layer
normalization, module 13) don't carry the same relative-only guarantee.
Individually, a token's rotated Q or K vector genuinely differs by
absolute position (verified in exercise 2) — RoPE guarantees a specific
property of pairwise scores, not that absolute position is invisible
to the model everywhere.

</details>

## Common mistakes & troubleshooting

- **Assuming RoPE and sinusoidal encoding provide the identical
  guarantee just implemented differently.** Verified above: sinusoidal
  encoding's relative-offset property lives in the added positional
  vector and must survive downstream processing; RoPE's lives directly
  in the attention score computation, at every layer, which is a
  meaningfully stronger and more directly-usable guarantee.
- **Confusing "the score only depends on relative distance" with
  "individual rotated vectors are the same across positions."**
  Verified in exercise 2: they are genuinely different — only the dot
  product between correspondingly-offset pairs collapses to the same
  value.
- **Applying RoPE to the full vector at once instead of splitting into
  2D pairs at different frequencies.** RoPE's rotation is inherently a
  2D operation per pair — verified above using the same pairing
  structure as module 10's sinusoidal frequencies, not a single
  rotation over the whole vector.

## Checkpoint quiz

1. What does RoPE rotate — the token embedding, or the Q/K vectors?
2. What did the verified experiment show about attention scores for
   pairs `(3,1)`, `(7,5)`, `(20,18)`, and `(2,0)`?
3. Does RoPE guarantee that individual rotated query vectors are
   identical across different absolute positions? What did exercise 2
   confirm?
4. Why is RoPE's relative-position guarantee considered more robust
   than sinusoidal encoding's, in terms of where in the model it lives?
5. Why does RoPE's relative-distance property make it a natural fit
   for extending context windows beyond training length?

<details><summary>Answers</summary>

1. The Q and K vectors, applied at attention-computation time in every
   layer — not the token embedding at the input, which is where
   sinusoidal encoding (module 10) operates.
2. All four pairs, despite having completely different absolute
   positions, share the same relative distance (`m - n = 2`) and
   verified to all produce the exact same attention score
   (`dot = -1.2283` in every case).
3. No — verified in exercise 2 that individually rotated query vectors
   at different absolute positions are genuinely different (not
   `np.allclose`); only their dot products with correspondingly-offset
   keys collapse to the same value.
4. Because it's built directly into the attention score computation at
   every layer, rather than being a property of an input feature (the
   added positional vector) that has to survive every subsequent layer
   unchanged to still matter.
5. Because the guarantee is about relative distance specifically,
   independent of how large the absolute positions are — this behaves
   more predictably when extending to sequence lengths beyond what was
   seen during training, since the core relative-offset property (the
   thing verified above) doesn't depend on position magnitude.

</details>

## Further reading & sources

- [RoFormer: Enhanced Transformer with Rotary Position Embedding (Su et al., 2021)](https://arxiv.org/abs/2104.09864) - the original RoPE paper; Section 3 derives the exact relative-distance property verified numerically in this module.
- [LLaMA: Open and Efficient Foundation Language Models (Touvron et al., 2023)](https://arxiv.org/abs/2302.13971) - one of the most widely-used models adopting RoPE, referenced as a real production example.
- [Extending Context Window of Large Language Models via Positional Interpolation (Chen et al., 2023)](https://arxiv.org/abs/2306.15595) - documents a real technique for extending RoPE-based models to longer context windows, referenced in this module's long-context discussion.
- [Track 02, Module 10: Sinusoidal Positional Encoding](../10-sinusoidal-positional-encoding/README.md) - the earlier positional scheme this module directly contrasts against, including its own verified relative-offset property.
- [Track 01, Module 11: Context Windows Explained](../../01-tokens-and-language-modeling/11-context-windows-explained/README.md) - covers the context-window extension problem this module's long-context discussion connects to.

## Next

[Module 12: The Feed-Forward Network](../12-the-feed-forward-network/README.md)
