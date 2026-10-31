# Module 03: What Attention Actually Computes

## Why this matters

Track 00 module 05 already covered attention as a soft, differentiable
dictionary lookup — score, normalize, blend — with a worked numeric
example and a real translation alignment matrix. Go there first if
that story isn't already solid; this module doesn't repeat it. **This
module proves one specific, easy-to-miss mathematical property of
attention that everything from module 09 onward depends on**: attention,
by itself, has absolutely no built-in notion of sequence order.
Shuffle the input tokens, and attention's output shuffles along with
them, in exactly the same way — verified directly below. This single
fact is *why* positional encoding (module 09-11) has to exist at all;
without it, "the cat sat" and "sat the cat" would be indistinguishable
to a pure attention layer.

## Concepts

### Permutation equivariance: attention doesn't know what "order" means

A function is **permutation equivariant** if permuting its input
permutes its output the same way — `f(permute(x)) == permute(f(x))`.
Verified directly, computing self-attention (module 05 covers the
mechanics in full; here it's just the object under test) on a
4-token sequence, then again on the same 4 tokens shuffled:

```python
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - np.max(x, axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

def self_attention(X, Wq, Wk, Wv):
    Q, K, V = X @ Wq, X @ Wk, X @ Wv
    scores = Q @ K.T / np.sqrt(Q.shape[-1])
    weights = softmax(scores, axis=-1)
    return weights @ V

np.random.seed(0)
d = 4
Wq, Wk, Wv = np.random.randn(d, d), np.random.randn(d, d), np.random.randn(d, d)
X = np.random.randn(4, d)   # 4 "token" vectors

out = self_attention(X, Wq, Wk, Wv)

perm = [2, 0, 3, 1]          # shuffle the token order
X_perm = X[perm]
out_perm = self_attention(X_perm, Wq, Wk, Wv)

print(np.allclose(out_perm, out[perm]))
```

Verified output: **`True`**. Running attention on the shuffled input
produces exactly the shuffled version of the original output — token 2's
result moved to wherever token 2 moved to, and nothing else changed.
Attention computed the *same relationships* regardless of which order
the tokens arrived in; it never used "position 0 comes before position
1" as information at all.

### Why this is surprising, given what attention "does"

It's tempting to think attention must be order-aware, since its output
for `"the cat sat"` obviously differs from `"sat the cat"` in a real
trained model. Verified above, that difference **cannot** come from the
attention operation itself — it has to come from somewhere else
entirely. That "somewhere else" is exactly what module 09-11 build:
positional encoding adds order information to each token's *input*
vector, before attention ever sees it, precisely because attention
itself is structurally blind to order. Once position is baked into the
input vectors, attention computing "the same relationships regardless
of order" is no longer a problem — the position is now just more
content each vector carries, and permuting the tokens permutes their
positional information right along with them, breaking the pattern the
model learned to associate with real sentence structure.

### Contrast: an RNN is not permutation equivariant

This is worth confirming directly, since it's the structural reason
recurrence never needed a separate positional-encoding mechanism at
all: an RNN processes position `i` using its state built from positions
`0..i-1`, so which token arrives at which step is baked into the very
computation, not added afterward. Shuffling an RNN's input sequence
doesn't just permute its output the same way — it produces a
genuinely different computation, since a shuffled sequence changes what
every subsequent hidden state was actually built from. Attention traded
this "order for free" property away in exchange for module 00's path-
length and parallelism advantages — positional encoding is the price
paid to get order back.

### Attention as a set operation, precisely

Given permutation equivariance, attention (without positional encoding)
technically operates on the input tokens as an unordered **set**, not a
sequence — it computes, for each token, a weighted combination of every
other token based purely on content-based similarity (module 01's dot
product), never on where anyone sits. This is a genuinely different
computational primitive from an RNN's inherently sequential one, and
it's the precise, provable version of "attention lets every position
look at every other position directly" (module 00) — direct, and
symmetric with respect to order, until position is explicitly
reintroduced.

## Reference

```
 Property                Attention (bare, no positional info)   RNN
 ─────────────────       ───────────────────────────────────   ─────────────
 Permutation              YES — verified: shuffling input        NO — order is
 equivariant               permutes output identically            baked into
                                                                    the recurrence
 Needs explicit            YES (module 09-11)                     NO (built in)
 positional encoding
 Operates on input as      a set (order-agnostic) until           an ordered
                            position is added                       sequence
```

## Hands-on exercises

### Exercise 1 — reproduce the permutation-equivariance proof

Run the exact code above with your own random seed, sequence length,
and permutation. Confirm `np.allclose(out_perm, out[perm])` always
returns `True`, no matter which permutation you choose.

### Exercise 2 — confirm the RNN contrast

Implement (or reuse from track 00 module 04) a tiny RNN cell, run it on
a short sequence, then run it again on a permuted version of the same
sequence. Confirm the permuted output is **not** simply the permuted
version of the original output — the RNN's actual computation changed,
not just the labeling of its outputs.

### Exercise 3 — watch positional encoding break the symmetry

Add a simple positional signal to each token vector before running
`self_attention` (even something as crude as adding the position index,
scaled down, to each vector — module 10-11 cover principled versions).
Re-run the permutation test from exercise 1 and confirm it now
**fails** — `out_perm` no longer equals `out[perm]`, because the
positional information moved with the tokens but the *content* it
represents ("I am at position 0") no longer matches where each token
actually ended up.

## Independent challenge

A colleague says "since attention lets every token attend to every
other token directly, word order must not matter much to transformer
models." Using this module's verified permutation-equivariance
property and its resolution (positional encoding), write two or three
sentences explaining why this claim gets the mechanism backwards.

<details><summary>Discussion</summary>

Word order matters enormously to real transformer models — but not
because of attention itself; it's because positional encoding
deliberately reintroduces order information before attention ever runs,
specifically *because* attention would otherwise be blind to it
(verified above). The claim inverts cause and effect: attention's
order-blindness is the very reason a whole mechanism (module 09-11) had
to be engineered to restore word-order sensitivity, not evidence that
word order doesn't matter to the resulting model.

</details>

## Common mistakes & troubleshooting

- **Assuming attention is inherently order-aware because trained models
  clearly are sensitive to word order.** Verified above: bare attention
  is provably permutation equivariant; order sensitivity in a real
  model comes entirely from positional encoding added beforehand.
- **Implementing a custom attention variant and forgetting positional
  encoding entirely**, then being confused why the model can't
  distinguish `"the cat sat"` from `"sat the cat"` — this module's
  proof is exactly why that confusion arises, and exactly why the fix
  is adding position information to the input, not changing attention
  itself.
- **Confusing attention's permutation equivariance with an RNN's
  behavior under the same test.** Verified in exercise 2: an RNN's
  output does not simply permute when its input is permuted — its
  actual internal computation changes, since sequential order is baked
  into the recurrence itself.

## Checkpoint quiz

1. What does "permutation equivariant" mean, and what did the verified
   experiment show about self-attention?
2. Why is bare attention's order-blindness surprising, given that
   trained transformer models clearly are sensitive to word order?
3. Does an RNN show the same permutation-equivariance property as
   attention? What's structurally different?
4. What mechanism resolves attention's order-blindness, and where does
   it act (before or after attention runs)?
5. In what precise sense can bare attention be described as operating
   on a "set" rather than a "sequence"?

<details><summary>Answers</summary>

1. A function is permutation equivariant if permuting its input
   permutes its output identically. Verified: shuffling self-attention's
   input tokens produced exactly the shuffled version of the original
   output (`np.allclose(out_perm, out[perm])` returned `True`).
2. Because the order-sensitivity real models show doesn't come from
   attention itself — it comes from positional encoding, added to each
   token's input vector before attention runs. Attention's own
   computation is provably order-blind; the model's overall
   order-sensitivity is added on top.
3. No — an RNN's output does not simply permute when its input is
   permuted; the actual computation changes, because each hidden state
   is built sequentially from whichever tokens came before it in the
   (now different) order. Order is structurally baked into recurrence,
   not add-on information.
4. Positional encoding (module 09-11), applied to each token's vector
   *before* attention ever processes it — it adds order as explicit
   content each vector carries, rather than changing how attention
   itself computes.
5. Attention computes, for each token, a weighted combination of every
   other token based purely on content-based similarity (dot products,
   module 01) — with no reference to which position anyone occupies —
   which is exactly the definition of operating on an unordered
   collection rather than a sequence, until positional information is
   explicitly reintroduced.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.5 introduces positional encoding specifically because "the model contains no recurrence and no convolution," directly acknowledging the permutation-equivariance property verified in this module.
- [Set Transformer: A Framework for Attention-based Permutation-Invariant Neural Networks (Lee et al., 2019)](https://arxiv.org/abs/1810.00825) - explicitly builds on attention's permutation-equivariant/invariant properties for genuinely unordered set data, where this module's "attention operates on a set" framing is the intended behavior rather than something to be undone.
- [Track 00, Module 04: RNNs/LSTMs and the Sequence Problem](../../00-genai-foundations/04-rnns-lstms-and-the-sequence-problem/README.md) - the contrast case for exercise 2: recurrence's inherently order-dependent computation.
- [Track 00, Module 05: The Attention Breakthrough](../../00-genai-foundations/05-the-attention-breakthrough/README.md) - the conceptual companion to this module: attention as soft lookup, the score/normalize/blend steps, and real alignment-matrix interpretation.

## Next

[Module 04: Queries, Keys and Values](../04-queries-keys-and-values/README.md)
