# Module 02: Embeddings as Lookup Tables

## Why this matters

Track 00 module 03 already told the Word2Vec story — why embeddings
exist, the distributional hypothesis, the famous vector-arithmetic
result. That's the *conceptual* case for embeddings. **This module is
the mechanical one**: what an embedding actually *is* inside a running
transformer, as a literal, indexable matrix — and, using module 01's
matrix-multiplication machinery, a verified proof that "look up row 7"
and "multiply by a one-hot vector" are the exact same operation. This
is the last piece connecting track 01's tokenizer (which outputs
integer IDs) to the first real computation inside the model.

## Concepts

### An embedding table is a matrix, indexed by row

A model's embedding table has one row per vocabulary entry, and each
row is a vector of length `d_model` (the model's hidden dimension —
module 01's dot products and matrix multiplications operate on vectors
of exactly this length throughout the rest of this track). "Embedding a
token" means: take its integer ID (from track 01's tokenizer) and
return that row.

```
 token ID (from tokenizer)     embedding table (vocab_size x d_model)
        3        ────────►    ┌───────────────────────────┐
                               │ row 0: [ ... ]            │
                               │ row 1: [ ... ]            │
                               │ row 2: [ ... ]            │
                               │ row 3: [ 0.12, 1.24, ...] │◄── returned
                               │ row 4: [ ... ]            │
                               │  ...                      │
                               └───────────────────────────┘
```

Verified directly with a real `nn.Embedding` layer:

```python
import torch
import torch.nn as nn

torch.manual_seed(0)
emb = nn.Embedding(num_embeddings=10, embedding_dim=4)
token_ids = torch.tensor([3, 7, 1])
print(emb(token_ids))
```

Verified output:

```
tensor([[ 0.1198,  1.2377,  1.1168, -0.2473],
        [-0.1740, -0.6787,  0.9383,  0.4889],
        [ 0.8487,  0.6920, -0.3160, -2.1152]])
```

Three token IDs in, three 4-dimensional vectors out — one row of the
table per input ID, in order.

### Proof: embedding lookup is one-hot matrix multiplication

This is the mechanical fact worth verifying directly, tying module 01's
matmul directly to this module's embedding lookup: converting a token
ID to a **one-hot vector** (all zeros, a single 1 at the ID's position)
and multiplying it by the embedding matrix produces *exactly* the same
result as the lookup:

```python
one_hot = torch.nn.functional.one_hot(token_ids, num_classes=10).float()
via_matmul = one_hot @ emb.weight
print(torch.allclose(emb(token_ids), via_matmul))
```

Verified output: `True` — matching to floating-point precision. This
means "embedding lookup" isn't a conceptually separate operation from
the matrix multiplications the rest of this track builds on — it's a
**special case** of one, specifically optimized (real frameworks use an
actual indexing operation rather than materializing a giant, mostly-zero
one-hot vector and multiplying) because computing a full matrix
multiplication against a mostly-zero vector would waste enormous amounts
of compute for no benefit. The mathematical result is identical either
way; only the efficient implementation differs.

### The embedding table's parameter count, made concrete

The table's total parameter count is `vocab_size x d_model` — verified
directly:

```python
print(emb.weight.shape, emb.weight.numel())
```

Verified output: `torch.Size([10, 4])`, `40` parameters (`10 * 4`).
This is the exact quantity track 01 module 08 computed at real-model
scale (GPT-2's ~38.6M-parameter embedding table, a GPT-4-scale model's
~1.23 billion) — this module shows the literal matrix those numbers
describe, at a size small enough to print in full.

### The table is learned, not fixed — and that's the connection back to Word2Vec

Track 00 module 03 covered Word2Vec training a standalone embedding
space by predicting context words. A transformer's embedding table
works differently in one important way: it isn't trained as a separate
step at all — it's simply one more set of parameters, initialized
randomly (as seen above — `nn.Embedding`'s default initialization is
random, not meaningful yet) and updated by the exact same
backpropagation process that trains every other weight in the model,
jointly, as the whole model learns its task. There's no separate
"embedding training phase" for a transformer the way there was for
Word2Vec — the embedding table starts as noise and becomes meaningful
purely as a byproduct of training the full model end to end.

### Weight tying: the same table, used twice

Many transformer implementations reuse the *same* embedding matrix for
two purposes: converting input token IDs to vectors (this module), and
— transposed — converting the model's final hidden state back into a
score per vocabulary entry (the output logits, track 01 module 15).
This is called **weight tying**, and it's a direct, practical
application of this module's core fact: since embedding lookup is
matrix multiplication by a one-hot vector, its transpose is naturally
usable to project a hidden vector back into "one score per vocabulary
entry" space — the same matrix, read in the other direction. This
roughly halves the embedding-related parameter count track 01 module 08
computed, since the input and output projections no longer need
separate matrices.

## Reference

```
 Concept                  What it means
 ───────────────────      ──────────────────────────────────────────
 Embedding table           A vocab_size x d_model matrix; row i is the
                           learned vector for vocabulary entry i
 Embedding lookup          emb(token_id) -> returns row token_id
 One-hot equivalence        Verified: one_hot(id) @ table ==
                            emb(id), exactly — lookup is a special
                            case of matrix multiplication
 Parameter count            vocab_size * d_model (track 01 module 08's
                            embedding-cost formula, now shown as a
                            literal matrix)
 Weight tying               Reusing the same table (transposed) for
                            both input embedding and output projection
```

## Hands-on exercises

### Exercise 1 — verify the one-hot equivalence yourself

Run the exact `nn.Embedding` vs. one-hot-matmul comparison above with
your own vocabulary size, embedding dimension, and token IDs. Confirm
`torch.allclose` returns `True` every time.

### Exercise 2 — measure the compute cost of the naive one-hot approach

Time `emb(token_ids)` versus the one-hot-matmul approach for a
realistic vocabulary size (try `vocab_size=50000`, matching module 07's
GPT-2 comparison) and a batch of a few hundred token IDs. Confirm the
direct lookup is meaningfully faster, and connect this to why no
production framework actually materializes a one-hot vector for
real embedding lookups, despite the two being mathematically identical.

### Exercise 3 — watch an embedding table start as noise and become structured

Train a tiny model (a simple next-character predictor is enough) with
its own `nn.Embedding` layer on a small amount of text, and before vs.
after training, compute cosine similarity (module 01) between the
embeddings of two characters that behave similarly in your training
text (e.g., two vowels) versus two that don't. Confirm the untrained
embeddings show no particular pattern, while post-training embeddings
show measurably higher similarity between characters that play similar
roles in the text — a small, direct demonstration of "the table starts
as noise and becomes meaningful purely through training."

## Independent challenge

A teammate proposes manually initializing a new model's embedding
table using pretrained Word2Vec vectors (track 00 module 03) instead of
random initialization, arguing it'll give the model "a head start."
Using this module's "the table is learned jointly with the rest of the
model" point, write two or three sentences on what could go right and
what could go wrong with this idea — specifically, whether Word2Vec's
embedding space and the transformer's own eventual embedding space are
guaranteed to represent tokens compatibly.

<details><summary>Discussion</summary>

It could genuinely help convergence speed, since the initial embedding
values would already encode some real distributional structure instead
of pure noise — a real, sometimes-used technique. What could go wrong:
Word2Vec's embedding space was trained with a completely different
objective (predicting nearby context words) than whatever the
transformer is being trained for, and there's no guarantee the two
objectives want token relationships arranged the same way in vector
space — the transformer's training process will keep updating the
embedding table regardless, potentially fighting against the
pretrained initialization if the two objectives disagree, or
converging to something Word2Vec's space didn't anticipate. It's a
head start, not a guarantee, and the model is free to move the
embeddings anywhere useful during its own training.

</details>

## Common mistakes & troubleshooting

- **Treating embedding lookup and matrix multiplication as unrelated
  operations.** Verified above: they're mathematically identical
  (lookup is multiplication by a one-hot vector) — frameworks just
  implement lookup more efficiently, never differently in outcome.
- **Assuming a transformer's embedding table needs separate,
  Word2Vec-style pretraining.** It doesn't — it's trained jointly with
  every other parameter via ordinary backpropagation on the model's
  actual task, starting from random noise.
- **Forgetting weight tying exists when counting a model's total
  unique parameters.** If input and output projections share the same
  matrix, track 01 module 08's embedding-cost formula shouldn't be
  counted twice for a model that ties its weights — check a specific
  model's architecture before assuming.
- **Materializing a one-hot vector for a real embedding lookup**,
  rather than using the framework's actual indexing-based
  implementation — mathematically fine, but verified to be
  meaningfully slower and wasteful at real vocabulary sizes.

## Checkpoint quiz

1. What does an embedding table's shape (`vocab_size x d_model`)
   represent concretely?
2. What did the verified one-hot-matmul experiment prove about the
   relationship between embedding lookup and matrix multiplication?
3. Is a transformer's embedding table trained the same way Word2Vec's
   was (module 03), as a separate step? What's actually different?
4. What is weight tying, and what does it reuse?
5. Why might initializing a transformer's embedding table with
   pretrained Word2Vec vectors not be a risk-free improvement?

<details><summary>Answers</summary>

1. One row per vocabulary entry, each row a `d_model`-dimensional
   learned vector — the table's total size is exactly `vocab_size *
   d_model` parameters, the same quantity computed at real-model scale
   in track 01 module 08.
2. That embedding lookup is mathematically identical to multiplying a
   one-hot vector by the embedding matrix — verified via
   `torch.allclose` returning `True` — meaning lookup is a specially
   optimized special case of matrix multiplication, not a conceptually
   separate operation.
3. No — a transformer's embedding table is trained jointly with every
   other parameter in the model via ordinary backpropagation on the
   model's actual task, starting from random initialization. Word2Vec,
   by contrast, was trained as its own standalone step with its own
   context-prediction objective.
4. Reusing the same embedding matrix (transposed) for both the input
   token-to-vector lookup and the output hidden-state-to-vocabulary-score
   projection — a direct application of the one-hot equivalence, since
   the matrix works in either direction.
5. Because Word2Vec's embedding space was optimized for a different
   objective (context-word prediction) than whatever task the
   transformer is being trained for — there's no guarantee the two
   objectives want tokens arranged the same way in vector space, and
   the transformer's own training will keep moving the embeddings
   regardless.

</details>

## Further reading & sources

- [PyTorch documentation: torch.nn.Embedding](https://pytorch.org/docs/stable/generated/torch.nn.Embedding.html) - the real embedding-layer implementation used throughout this module's verification code.
- [Efficient Estimation of Word Representations in Vector Space (Mikolov et al., 2013)](https://arxiv.org/abs/1301.3781) - the Word2Vec paper, covered conceptually in track 00 module 03; this module's contrast (separately-trained vs. jointly-trained embeddings) refers directly to it.
- [Using the Output Embedding to Improve Language Models (Press & Wolf, 2016)](https://arxiv.org/abs/1608.05859) - the paper establishing weight tying as a standard technique, directly relevant to this module's discussion of sharing the embedding matrix between input and output.
- [Track 00, Module 03: Word2Vec and the Embedding Revolution](../../00-genai-foundations/03-word2vec-and-the-embedding-revolution/README.md) - the conceptual companion to this module: the distributional hypothesis, Word2Vec's training objective, and the famous vector-arithmetic result.
- [Track 01, Module 08: Vocabulary Size Tradeoffs](../../01-tokens-and-language-modeling/08-vocabulary-size-tradeoffs/README.md) - computes the real embedding-table parameter costs (GPT-2's ~38.6M, GPT-4-scale's ~1.23B) that this module shows as a literal, printable matrix.

## Next

[Module 03: What Attention Actually Computes](../03-what-attention-actually-computes/README.md)
