# Module 09: Why Positional Information Is Needed

## Why this matters

Module 03 proved, on abstract random vectors, that bare self-attention
is permutation equivariant. Track 00 module 06 confirmed order matters
in a real trained model (GPT-2 gives "dog bites man" and "man bites
dog" different hidden states — unlike averaged Word2Vec vectors, which
score a meaningless 1.0 similarity for both). **This module connects
those two results directly**: it runs module 03's exact proof on the
literal words `"dog"`, `"bites"`, `"man"`, showing that without
positional information, `"dog bites man"` and `"man bites dog"` produce
*identical* per-word representations (not just similar — identical, up
to which row they land in), and that adding positional information is
what breaks that identity. This is the precise mechanical reason track
00's real-model check came out different, not just an empirical
observation about GPT-2.

## Concepts

### The concrete case: two sentences, same words, different meaning

`"dog bites man"` and `"man bites dog"` use exactly the same three
words — only their order differs, and that order is the entire
difference in meaning. This is exactly the scenario module 03's
permutation-equivariance proof predicts a problem for.

### Verified: without positional information, "man" gets an identical representation in both sentences

Using toy word vectors and the same self-attention computation from
modules 05-08 (no positional information added):

```python
import numpy as np

def softmax(x, axis=-1):
    e = np.exp(x - np.max(x, axis=axis, keepdims=True))
    return e / e.sum(axis=axis, keepdims=True)

def self_attention(X, Wq, Wk, Wv):
    Q, K, V = X @ Wq, X @ Wk, X @ Wv
    scores = Q @ K.T / np.sqrt(Q.shape[-1])
    return softmax(scores, axis=-1) @ V

np.random.seed(2)
d = 6
vocab = {"dog": np.random.randn(d), "bites": np.random.randn(d), "man": np.random.randn(d)}
Wq, Wk, Wv = (np.random.randn(d, d) for _ in range(3))

X1 = np.array([vocab[w] for w in ["dog", "bites", "man"]])
X2 = np.array([vocab[w] for w in ["man", "bites", "dog"]])

out1, out2 = self_attention(X1, Wq, Wk, Wv), self_attention(X2, Wq, Wk, Wv)

print(np.allclose(out1[2], out2[0]))   # "man"'s representation, both sentences
```

Verified output: **`True`**. `"man"`'s computed representation in
`"dog bites man"` (row 2) is **exactly identical** — not approximately,
exactly, to floating-point precision — to `"man"`'s representation in
`"man bites dog"` (row 0). Bare self-attention genuinely cannot tell
these two sentences apart at the level of individual word
representations: it computed the same relationships regardless of
which sentence "man" appeared in, because — per module 03's proof — it
never used word order as information at all.

### Verified: adding positional information breaks the identity

Now the identical experiment, but adding a (deliberately simple, for
illustration — modules 10-11 cover the real, principled schemes) fixed
positional vector to each token based on its position before running
attention:

```python
pos = np.random.randn(3, d) * 0.5   # a stand-in positional signal
X1_pos, X2_pos = X1 + pos, X2 + pos

out1p, out2p = self_attention(X1_pos, Wq, Wk, Wv), self_attention(X2_pos, Wq, Wk, Wv)
print(np.allclose(out1p[2], out2p[0]))                     # "man" at position 2 vs position 0
print(np.allclose(out1p.mean(axis=0), out2p.mean(axis=0))) # whole-sentence average
```

Verified output: **`False`** for both checks. Once positional
information is part of each token's input vector, `"man"`'s
representation genuinely differs depending on whether it appeared at
position 0 or position 2 — and the two sentences' overall
representations (averaged across all three words, a crude stand-in for
"what a classifier reading this sentence would see") are now
meaningfully different too, rather than identical.

### Connecting this to track 00's real-model observation

Track 00 module 06's exercise ran real GPT-2 on `"dog bites man"` versus
`"man bites dog"` and found the model's hidden states differ — in sharp
contrast to averaged Word2Vec vectors, which score these two sentences
as identical (cosine similarity 1.0, since averaging discards order
entirely). This module's verified toy experiment is the *mechanism*
behind that empirical result: GPT-2, like every transformer, adds
positional information to its token embeddings before any attention
layer runs (module 10-11 cover exactly how) — without that step, GPT-2
would show the same kind of order-blindness verified above, no matter
how large or well-trained the rest of the model was.

## Reference

```
 Configuration                          "man"'s representation, sentence 1
                                         vs. sentence 2 (verified)
 ─────────────────────────────────       ───────────────────────────────────
 No positional information                Identical (np.allclose = True)
 (bare self-attention, module 03)          — order carries no information
 With positional information               Different (np.allclose = False)
 added before attention                    — order is now part of the
                                            computation
```

```
 Track 00 module 06's real-model check       This module's mechanism
 ──────────────────────────────────────      ───────────────────────────
 GPT-2 gives "dog bites man" and "man          The reason: positional info
 bites dog" DIFFERENT hidden states            is added before attention;
 (verified with real cosine similarity)          without it (verified here),
                                                  the representations would
                                                  be provably identical
```

## Hands-on exercises

### Exercise 1 — reproduce both verifications

Run the no-positional-information and with-positional-information
versions above exactly as written, and confirm the `True`/`False`
results match. Try your own three-word vocabulary and sentence pair
(keeping the same three words, different order) and confirm the
pattern holds generally, not just for "dog/bites/man."

### Exercise 2 — reproduce track 00's real-model check yourself

Run track 00 module 06's exercise 2 code (GPT-2's cosine similarity
on "dog bites man" vs. "man bites dog") if you haven't already, and
connect the (non-1.0) similarity you observe to this module's verified
mechanism — GPT-2's built-in positional encoding is exactly what this
module's toy `pos` vector stands in for.

### Exercise 3 — test whether the effect is sensitive to how big the positional signal is

Repeat this module's second experiment, but scale the `pos` vectors
down substantially (e.g., multiply by `0.001` instead of `0.5`). Check
whether `np.allclose` still reports `False`, and if the two sentences'
representations become numerically very close (even if not exactly
equal). Connect what you find to why the *magnitude* of a positional
encoding scheme relative to the token embeddings themselves (previewed
here, addressed directly in module 10-11) is a real design
consideration, not an afterthought.

## Independent challenge

A researcher argues "attention already looks at the whole sequence, so
it must already know about order implicitly — positional encoding is
just a minor refinement." Using this module's verified `np.allclose`
results, write two or three sentences explaining precisely why this
claim is backwards, citing the specific verified fact that
contradicts it.

<details><summary>Discussion</summary>

The claim gets the mechanism exactly backwards: verified directly
above, bare self-attention gives `"man"` in `"dog bites man"` and
`"man"` in `"man bites dog"` an *exactly identical* representation
(`np.allclose` returned `True`) — meaning attention, by itself, doesn't
just fail to fully exploit order information, it has provably zero
access to it at all. "Looking at the whole sequence" (module 00's
path-length property) is a statement about which tokens can influence
each other, not about whether the model can tell what order they
arrived in — those are separate properties, and this module's verified
`True` result for the no-position case is direct evidence that seeing
everything and knowing the order of everything are not the same
thing.

</details>

## Common mistakes & troubleshooting

- **Assuming "attention sees the whole sequence" implies it already
  knows word order.** Verified above: it provably doesn't, until
  positional information is explicitly added — these are separate
  properties (module 00's path-length vs. this module's order-blindness).
- **Treating positional encoding as a minor implementation detail.**
  Verified above: without it, two sentences that mean opposite things
  (`"dog bites man"` vs. `"man bites dog"`) produce mathematically
  identical per-word representations — this is a correctness-critical
  component, not a refinement.
- **Confusing this module's toy positional vector with a real
  positional encoding scheme.** The `pos = np.random.randn(...) * 0.5`
  used here is a deliberately crude stand-in to demonstrate the effect
  exists at all — modules 10 (sinusoidal) and 11 (RoPE) cover the real,
  principled schemes actually used in production models.

## Checkpoint quiz

1. What did the verified no-positional-information experiment show
   about `"man"`'s representation in `"dog bites man"` versus `"man
   bites dog"`?
2. What changed once positional information was added to the same
   experiment?
3. How does this module's verified result explain track 00 module 06's
   real-GPT-2 finding that the two sentences produce different hidden
   states?
4. Why is "attention sees the whole sequence, so it must know about
   order" an incorrect inference?
5. What did exercise 3 suggest about the magnitude of a positional
   signal relative to the token embeddings?

<details><summary>Answers</summary>

1. That the representations were **exactly** identical
   (`np.allclose` returned `True`) — bare self-attention computed the
   same result for `"man"` regardless of which sentence, and therefore
   which position, it appeared in.
2. The identity broke — `np.allclose` returned `False` for both the
   individual-word check and the whole-sentence-average check, meaning
   the two sentences' representations became genuinely different once
   position was part of each token's input.
3. GPT-2 (like every transformer) adds positional information to token
   embeddings before any attention layer runs; this module's verified
   toy experiment shows that step is precisely what causes the two
   sentences to be distinguishable at all — without it, even GPT-2
   would show the same provable order-blindness.
4. Because "seeing the whole sequence" (a path-length/connectivity
   property, module 00) and "knowing what order the sequence arrived
   in" are separate properties — verified directly: bare attention
   sees every token but still produces identical output for both
   sentence orderings, proving it has no access to order information at
   all, regardless of what it can see.
5. That the effect exists at multiple positional-signal magnitudes but
   can produce results that are technically different yet numerically
   very close if the signal is made small enough relative to the token
   embeddings — a real design tradeoff in how strongly positional
   information should compete with content information, addressed
   directly in modules 10-11's principled schemes.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.5 states directly that positional encoding exists "since our model contains no recurrence and no convolution" — the same order-blindness this module verifies numerically.
- [Track 02, Module 03: What Attention Actually Computes](../03-what-attention-actually-computes/README.md) - the abstract permutation-equivariance proof this module applies to a concrete sentence-order example.
- [Track 00, Module 06: The Transformer Moment](../../00-genai-foundations/06-the-transformer-moment/README.md) - exercise 2 runs the real GPT-2 "dog bites man" vs. "man bites dog" check this module explains the mechanism behind.
- [Track 00, Module 03: Word2Vec and the Embedding Revolution](../../00-genai-foundations/03-word2vec-and-the-embedding-revolution/README.md) - exercise 7 (referenced by track 00 module 06) shows averaged Word2Vec vectors score these two sentences as identical (cosine similarity 1.0) — the same order-blindness this module demonstrates for bare attention, in a different embedding scheme.

## Next

[Module 10: Sinusoidal Positional Encoding](../10-sinusoidal-positional-encoding/README.md)
