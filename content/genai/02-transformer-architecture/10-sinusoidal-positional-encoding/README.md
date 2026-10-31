# Module 10: Sinusoidal Positional Encoding

## Why this matters

Module 09 proved positional information has to be added before
attention runs, using a crude stand-in (random vectors added to each
token). This module builds the actual scheme the original Transformer
paper uses: fixed sine/cosine values at different frequencies, one pair
per pair of dimensions. It isn't an arbitrary choice of "some numbers
that vary by position" — it has a specific, provable mathematical
property (verified directly below) that makes *relative* position
learnable via a simple linear operation, which is exactly why sine and
cosine were chosen over, say, just using the raw position index.

## Concepts

### The formula

For position `pos` and dimension pair index `i` (dimensions come in
pairs: one sine, one cosine, at the same frequency):

```
 PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
 PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))
```

Each pair of dimensions oscillates at a different frequency — low
dimension indices oscillate fast (high frequency), high dimension
indices oscillate slowly (low frequency, since the divisor
`10000^(2i/d_model)` grows with `i`).

### Verified: computing real values

```python
import numpy as np

def sinusoidal_pe(max_len, d_model):
    pe = np.zeros((max_len, d_model))
    position = np.arange(max_len)[:, None]
    div_term = 10000 ** (np.arange(0, d_model, 2) / d_model)
    pe[:, 0::2] = np.sin(position / div_term)
    pe[:, 1::2] = np.cos(position / div_term)
    return pe

pe = sinusoidal_pe(50, 8)
print(pe[0])
print(pe[1])
print(pe[10])
```

Verified output:

```
PE(0):  [0.    1.    0.    1.    0.    1.    0.    1.   ]
PE(1):  [0.841 0.54  0.1   0.995 0.01  1.    0.001 1.   ]
PE(10): [-0.544 -0.839  0.841  0.54  0.1   0.995  0.01  1.  ]
```

Position 0 gives a clean, all-zeros-and-ones pattern (`sin(0)=0`,
`cos(0)=1` at every frequency) — a useful sanity check that the formula
is implemented correctly. Every value stays within `[-1, 1]` (verified:
min `-0.9999...`, max `1.0` across the whole 50-position table) —
bounded, unlike raw position indices which grow without limit, a real
practical advantage for combining with token embeddings whose values
are typically also small.

### Verified: every position gets a unique encoding

```python
print(len(np.unique(pe, axis=0)), "unique rows out of", pe.shape[0])
```

Verified output: **`50` unique rows out of `50`** — no two positions
(across the 50 tested) share an identical encoding. This is a necessary
property for the encoding to actually distinguish positions at all —
module 09 verified what goes wrong when *no* positional information
distinguishes tokens; this confirms the sinusoidal scheme actually does.

### The real reason sine/cosine were chosen: relative position becomes a fixed linear transformation

This is the property worth verifying carefully, because it's the actual
mathematical justification behind the specific choice of sine/cosine
(not just "some varying function"). The paper's claim: for any fixed
offset `k`, there exists a linear transformation that maps `PE(pos)` to
`PE(pos + k)`, **the same transformation regardless of what `pos` is**.
Verified directly, for one frequency pair and offset `k=5`, using the
standard 2D rotation matrix at that frequency's angle:

```python
k = 5
freq = 1 / (10000 ** (0 / 8))     # frequency for the first (dims 0,1) pair
theta = k * freq
rot = np.array([[np.cos(theta), np.sin(theta)],
                [-np.sin(theta), np.cos(theta)]])

for pos in [0, 3, 7, 12, 20]:
    actual = pe[pos + k, 0:2]
    predicted = rot @ pe[pos, 0:2]
    print(pos, actual, predicted, np.allclose(actual, predicted))
```

Verified output — the **same** rotation matrix `rot` (computed once,
using only `k`, never `pos`) correctly predicts `PE(pos+5)` from
`PE(pos)` at every position tested:

```
pos=0   actual=[-0.9589  0.2837]  predicted=[-0.9589  0.2837]  match=True
pos=3   actual=[ 0.9894 -0.1455]  predicted=[ 0.9894 -0.1455]  match=True
pos=7   actual=[-0.5366  0.8439]  predicted=[-0.5366  0.8439]  match=True
pos=12  actual=[-0.9614 -0.2752]  predicted=[-0.9614 -0.2752]  match=True
pos=20  actual=[-0.1324  0.9912]  predicted=[-0.1324  0.9912]  match=True
```

This is the real payoff: a model can, in principle, learn a single
linear operation that shifts a positional encoding by any fixed
relative offset `k` — meaning relative-position reasoning ("the token 3
positions back") is expressible as ordinary matrix multiplication
(module 01), not something the model has to reconstruct from raw
absolute position numbers. This is exactly the mathematical property
the original paper cites as its reason for choosing sine/cosine over
alternatives, verified here rather than taken on faith.

### Why not just use the raw position index?

The naive alternative — using the plain integer `0, 1, 2, ...` as an
extra feature — has two real problems sinusoidal encoding avoids:
raw integers grow unboundedly (position 10,000 would dominate a token
embedding whose values sit near `[-1, 1]`, an issue verified as
avoided above), and there's no natural linear relationship between
"position 5" and "position 10" the way there is between `PE(5)` and
`PE(10)` (verified above via the fixed rotation) — a raw integer
feature would force the model to learn the notion of relative offset
from scratch, with no structural head start.

## Reference

```
 Property                              Verified
 ───────────────────────────────       ─────────────────────────────────
 Bounded values                         min ≈ -1.0, max = 1.0 across all
                                         positions tested
 Unique per position                    50/50 unique rows (50-position
                                         test table)
 Relative offset = fixed linear         A single rotation matrix
 transformation, independent of         (depending only on k, not pos)
 absolute position                      correctly maps PE(pos) to
                                         PE(pos+k) at every pos tested
```

```
 PE(pos, 2i)   = sin(pos / 10000^(2i/d_model))
 PE(pos, 2i+1) = cos(pos / 10000^(2i/d_model))

 low i  -> high frequency (oscillates fast across positions)
 high i -> low frequency (oscillates slowly across positions)
```

## Hands-on exercises

### Exercise 1 — reproduce the full sinusoidal table

Compute `sinusoidal_pe(max_len, d_model)` for your own choice of
`max_len` and `d_model` (try a larger `d_model`, like 64, closer to real
model dimensions), and confirm all rows are unique and all values fall
within `[-1, 1]`.

### Exercise 2 — reproduce the fixed-rotation verification at a different frequency and offset

Repeat the rotation-matrix check above using a *different* dimension
pair (e.g., dims 2-3 instead of 0-1, which oscillate at a different
frequency) and a different offset `k`. Confirm the same property holds:
a single rotation matrix (computed from that frequency and `k`)
correctly predicts `PE(pos+k)` from `PE(pos)` across several different
`pos` values.

### Exercise 3 — visualize the frequency spectrum

Plot (or tabulate) `PE(pos, dim)` as a function of `pos`, for several
fixed dimension indices spanning low to high `i`. Confirm the lower
dimension indices oscillate visibly faster (more full cycles across
the same position range) than the higher ones — connecting the formula
directly to the "different dimensions encode position at different
resolutions" intuition.

## Independent challenge

A teammate suggests replacing sinusoidal positional encoding with a
simple linear ramp (`position / max_len`, one single number appended to
each token's embedding) to save space, arguing "it still tells the
model the position, and it's simpler." Using this module's verified
fixed-rotation property, write two or three sentences on what specific
capability this simplification would lose.

<details><summary>Discussion</summary>

A single linear ramp value does encode absolute position, but it loses
the fixed-linear-relative-offset property verified above — there's no
single transformation that maps "ramp value at position p" to "ramp
value at position p+k" independent of p in the same useful way rotation
does for sinusoidal encoding (a ramp's relationship between two
positions depends on where those positions are relative to `max_len`,
not just their fixed offset `k`). The model would have to learn
relative-position reasoning largely from scratch rather than getting a
structural head start from the encoding's own mathematical properties —
a real capability loss, even though the ramp technically still varies
by position.

</details>

## Common mistakes & troubleshooting

- **Assuming sinusoidal encoding was chosen arbitrarily, "because it
  varies smoothly."** Verified above: the specific choice of sine and
  cosine pairs enables relative position to be expressed as a fixed
  linear transformation, a concrete mathematical property, not merely
  smoothness.
- **Forgetting positional encoding values must stay bounded to combine
  sensibly with token embeddings.** Verified above (values in `[-1,
  1]`) — an unbounded scheme (like a raw position integer) would risk
  swamping token-embedding information at large positions.
- **Testing uniqueness or the rotation property at only one position
  or frequency and assuming it generalizes.** This module's
  verification deliberately checked multiple positions and (in exercise
  2) multiple frequencies — a property that holds at one arbitrary
  point is not yet a verified general property.

## Checkpoint quiz

1. What are the two formulas defining sinusoidal positional encoding,
   and what varies across dimension pairs?
2. What did the verified uniqueness check confirm, and why does that
   matter given module 09's findings?
3. What specific mathematical property did the rotation-matrix
   verification confirm, and why is it the real justification for
   choosing sine/cosine specifically?
4. What real problem does a raw, unbounded position integer have that
   sinusoidal encoding avoids?
5. Why would a simple linear ramp value lose real capability compared
   to sinusoidal encoding, even though it does encode absolute position?

<details><summary>Answers</summary>

1. `PE(pos, 2i) = sin(pos / 10000^(2i/d_model))` and `PE(pos, 2i+1) =
   cos(pos / 10000^(2i/d_model))`. Across dimension pairs, the
   frequency changes — low `i` gives high frequency (fast oscillation),
   high `i` gives low frequency (slow oscillation).
2. That every position (50/50 tested) gets a distinct encoding — this
   matters because module 09 showed that without any positional
   distinction at all, different word orderings become
   indistinguishable to attention; uniqueness confirms the sinusoidal
   scheme actually provides the distinguishing information module 09
   showed is necessary.
3. That for any fixed offset `k`, a single rotation matrix (dependent
   only on `k` and the frequency, never on the absolute position)
   correctly maps `PE(pos)` to `PE(pos+k)` at every tested position —
   verified directly across 5 different starting positions with an
   identical rotation matrix. This is the actual reason sine/cosine was
   chosen: it lets relative position be expressed as ordinary linear
   algebra, not something the model must reconstruct from scratch.
4. It grows unboundedly, risking swamping token-embedding values (which
   stay small) at large positions — sinusoidal encoding stays bounded
   in `[-1, 1]` regardless of how large the position number is,
   verified directly above.
5. Because it lacks the fixed-linear-relative-offset property — there's
   no single transformation mapping "ramp value at position p" to
   "ramp value at position p+k" independent of where p sits relative to
   the sequence length, unlike sinusoidal encoding's verified rotation
   property. The model would need to learn relative-position reasoning
   largely from scratch rather than getting a structural head start.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.5 defines the sinusoidal formula and states the relative-position linear-transformation property this module verifies numerically.
- [The Annotated Transformer (Harvard NLP)](https://nlp.seas.harvard.edu/annotated-transformer/) - a widely-used, line-by-line implementation of sinusoidal positional encoding matching this module's `sinusoidal_pe` function.
- [Transformer Architecture: The Positional Encoding (Amirhossein Kazemnejad's blog)](https://kazemnejad.com/blog/transformer_architecture_positional_encoding/) - a detailed, visual derivation of the rotation-matrix property verified in this module.
- [Track 02, Module 09: Why Positional Information Is Needed](../09-why-positional-information-is-needed/README.md) - the problem this module's scheme solves, verified there with a crude stand-in positional signal.
- [Track 02, Module 11: Rotary Position Embeddings (RoPE)](../11-rotary-position-embeddings/README.md) - the modern successor to sinusoidal encoding, which applies this module's rotation idea directly to Q and K rather than adding a fixed vector to the input.

## Next

[Module 11: Rotary Position Embeddings (RoPE)](../11-rotary-position-embeddings/README.md)
