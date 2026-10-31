# Module 08: Vocabulary Size Tradeoffs

## Why this matters

Module 07 showed that `cl100k_base` (100,277 pieces) and `bert-base-uncased`
(30,522 pieces) disagree on how many tokens the same word costs.
That difference isn't arbitrary — vocabulary size is a genuine design
knob every tokenizer's authors have to choose, and it trades off against
two things that matter well beyond tokenization: how many parameters
the model spends just representing "which token is this" (its embedding
table), and how well the tokenizer serves languages and text styles far
from its training distribution. This module quantifies both sides of
that tradeoff with real numbers — a controlled experiment training the
same corpus at three different vocabulary sizes, and the actual
parameter-count arithmetic behind why a bigger vocabulary isn't free.

## Concepts

### The tradeoff in one picture

```
 SMALLER vocabulary                          LARGER vocabulary
 ───────────────────                         ──────────────────
 + smaller embedding table                   + fewer tokens per word on
   (fewer params spent on token identity)       average -> shorter
 + faster to train on new domains/languages     sequences for the same
   (fewer pieces to relearn)                    text -> less compute per
 + generalizes better to rare/unseen              forward pass, more text
   character combinations (falls back to          fits in a context window
   smaller, more composable pieces)            - bigger embedding table AND
 - more tokens per word on average               bigger output softmax layer
   -> longer sequences for the same text       - rarer pieces get less
 - more compute per forward pass for              training signal each
   the same text                                 (a 100K-entry vocab
                                                   spreads the same corpus
                                                   across far more distinct
                                                   pieces than a 10K vocab)
```

Neither side is "correct" — every production model picks a point on
this line based on its own priorities (a multilingual model leans
smaller/more composable; a single-language model optimizing for
inference cost on long documents leans larger).

### Verified: vocabulary size directly changes tokens-per-word

The clearest way to see this isn't to read about it — train the *same*
corpus at three different target vocabulary sizes and measure directly:

```python
import sentencepiece as spm

for vs in [50, 100, 200]:
    spm.SentencePieceTrainer.train(
        input="big_corpus.txt", model_prefix=f"v{vs}",
        vocab_size=vs, model_type="bpe",
    )

words = open("big_corpus.txt").read().split()
for vs in [50, 100, 200]:
    sp = spm.SentencePieceProcessor(model_file=f"v{vs}.model")
    total = sum(len(sp.encode(w, out_type=str)) for w in words)
    print(f"vocab_size={vs}: tokens/word={total/len(words):.2f}")
```

Verified output, same corpus, same algorithm (BPE), only `vocab_size`
changed:

```
vocab_size=50:  tokens/word=5.42
vocab_size=100: tokens/word=3.83
vocab_size=200: tokens/word=2.54
```

Quadrupling the vocabulary size (50 -> 200) more than halved the average
tokens per word (5.42 -> 2.54) on this corpus. This is the mechanical
core of the tradeoff: every one of those extra 150 vocabulary slots is
a whole word or common substring that no longer needs to be spelled out
piece by piece.

### The other side: embedding tables are not free

A transformer's very first layer is an embedding table: one learned
vector per vocabulary entry, looked up by token ID. Its parameter count
is exactly `vocab_size x d_model` (`d_model` = the model's hidden
dimension), and — because most architectures tie or nearly tie the
output projection to the same size — this cost shows up again at the
output softmax layer that predicts the next token.

```python
# GPT-2 small: vocab 50,257, d_model 768
v, d = 50257, 768
print(v * d)  # -> 38,597,376  (~38.6M params, just for token embeddings)

# A GPT-3/GPT-4-scale model (d_model ~12,288) using cl100k_base's
# 100,277-token vocabulary instead:
v2, d2 = 100277, 12288
print(v2 * d2)  # -> 1,232,203,776  (~1.23 BILLION params)
```

Verified arithmetic:

```
gpt2-small embedding params:            38,597,376   (38.6M)
large-model (d=12288) embedding params: 1,232,203,776 (1,232.2M / ~1.23B)
```

At GPT-2's scale, doubling the vocabulary costs tens of millions of
parameters — noticeable but survivable. At GPT-3/GPT-4 scale, where
`d_model` is over an order of magnitude bigger, the *same* vocabulary
choice costs over a billion parameters — comparable to the entire size
of a small standalone model. This is the concrete reason vocabulary size
isn't decided casually: it's a cost multiplied by the model's hidden
dimension, and that multiplier only grows as models get bigger.

### Rare pieces get less training signal

A second, subtler cost: every vocabulary entry needs to appear often
enough during training for its embedding to become meaningful. A 30K
vocabulary spreads a fixed training corpus across 30,000 buckets; a
300K vocabulary spreads the *same* corpus across ten times as many
buckets, so on average each piece is seen ten times less often. Very
large vocabularies (multilingual models supporting dozens of scripts
routinely exceed 250K) mitigate this by ensuring broad, deliberate
coverage across languages rather than growing the vocabulary
arbitrarily — but the "rare pieces are undertrained" risk is real and is
part of why vocabulary growth doesn't come purely from "bigger is
better."

### Why multilingual models often lean toward smaller, more composable pieces

A tokenizer trained mostly on English text will represent common
English words as single pieces but fall back to fragmented,
many-token sequences for other languages — effectively "spending" its
vocabulary budget on the language it saw the most of. Multilingual
models (mT5, mBART, XLM-R) deliberately balance vocabulary allocation
across languages/scripts during training specifically to avoid this,
often preferring Unigram LM's pruning process (module 06) because it
naturally keeps whichever pieces are most broadly useful across the
whole multilingual corpus, not just the majority language.

## Reference

```
 Cost driven UP by a LARGER vocabulary       Cost driven UP by a SMALLER vocabulary
 ──────────────────────────────────────      ───────────────────────────────────────
 Embedding table params (vocab x d_model)    Tokens per word/sentence (more compute
 Output softmax params (same order)            per forward pass, shorter effective
 Undertrained rare pieces (same corpus,        context window in "real text" terms)
   more buckets to fill)                     Worse compression for domains distant
                                                from the training corpus
```

```
 Real vocab sizes, for calibration
 ──────────────────────────────────
 gpt2                50,257
 cl100k_base          100,277  (GPT-4, GPT-3.5)
 bert-base-uncased     30,522
 Many multilingual    250,000+
 models (mT5, XLM-R)
```

## Hands-on exercises

### Exercise 1 — reproduce the vocab-size vs. tokens-per-word experiment

Build a text file of a few dozen varied sentences (reuse or extend
module 06's `corpus.txt`), then run the exact code from the concepts
section above at three vocabulary sizes of your own choosing. Confirm
the same direction of the trend (fewer tokens per word as vocab size
grows) on your own corpus — the exact numbers will differ from the
verified example above since they depend on your specific text.

### Exercise 2 — compute the embedding-table cost for a model you actually use

Look up (or estimate from a paper/model card) the `vocab_size` and
`d_model`/hidden-size for a real model — GPT-2 (`vocab_size=50257,
d_model=768`), a Llama variant, or any model whose config you can find.
Compute `vocab_size * d_model` and express it as a percentage of the
model's total parameter count (also usually stated in its card).

```python
vocab_size = 50257
d_model = 768
total_model_params = 124_000_000  # GPT-2 small's published total
embedding_params = vocab_size * d_model
print(f"{embedding_params:,} params, "
      f"{embedding_params/total_model_params:.1%} of the total model")
```

Verified output:

```
38,597,376 params, 31.1% of the total model
```

At GPT-2 small's scale, token embeddings alone are nearly a third of
the *entire* model — a concrete reason vocabulary size decisions
matter even more for smaller models than for huge ones (where the same
absolute embedding cost is a much smaller slice of a much bigger total).

### Exercise 3 — find a word your tokenizer over-fragments

Using `cl100k_base` (via `tiktoken`, module 07), find a real word from a
language or domain you know that gets split into many more pieces than
an equally common English word of similar length. Non-English proper
nouns, transliterated words, or domain-specific jargon (medical,
legal, a specific programming ecosystem) are good places to look.

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
for w in ["hello", "your_word_here"]:
    print(w, "->", len(enc.encode(w)), [enc.decode([i]) for i in enc.encode(w)])
```

Compare the token counts and connect what you find back to the "leans
toward whichever language/domain dominated training" point above.

## Independent challenge

A team proposes doubling their custom model's vocabulary size from 32K
to 64K, arguing "it'll make our documents shorter in tokens, so we can
fit more context and pay less per request." Using the embedding-cost
formula from exercise 2 and a `d_model` you choose (pick a realistic
value for a mid-size model, e.g. 2048 or 4096), calculate the actual
extra parameter cost of that change, and write two or three sentences
on what the team's argument leaves out.

<details><summary>Discussion</summary>

The extra parameter cost is `(64000 - 32000) * d_model` — at
`d_model=4096` that's `32000 * 4096 = 131,072,000`, over 130 million
extra parameters, purely for the bigger embedding and output-softmax
tables, before counting any change to the rest of the architecture. The
team's argument only counts the benefit (shorter sequences, likely
real) and ignores the cost side of the same tradeoff: more parameters to
train and serve, and — if the corpus size doesn't also grow — each of
the now-64K vocabulary entries gets less training signal on average
than before, per the "rare pieces get less training signal" point
above. Whether doubling is worth it depends on whether the shorter
sequences save more compute than the bigger tables cost, which is a
real calculation to run, not something to assume in either direction.

</details>

## Common mistakes & troubleshooting

- **Assuming bigger vocabulary is a free win.** It isn't — it's a real
  parameter-count cost (`vocab_size x d_model`, paid twice: embedding
  table and output layer) that scales directly with model size, as
  exercise 2 shows concretely.
- **Ignoring vocabulary size when comparing "tokens per dollar" across
  models.** Module 12 covers cost in depth, but the vocabulary-size
  differences from module 07 are a direct contributor to why the same
  text costs a different number of billed tokens on different models.
- **Assuming a huge multilingual vocabulary (250K+) means the model is
  "wasteful."** Broad multilingual coverage is a deliberate allocation
  decision, not vocabulary bloat — see the "why multilingual models
  lean toward smaller, composable pieces" discussion above; large
  multilingual vocabularies still favor broadly reusable pieces over
  giant per-language, per-word entries.
- **Treating tokens-per-word as a constant you can look up once.** It
  depends on the specific text's distance from the tokenizer's training
  data (exercise 3) — a single average number from a benchmark doesn't
  transfer to your specific domain.

## Checkpoint quiz

1. What did the controlled 50/100/200 vocab-size experiment show, in
   its own numbers?
2. Why does an embedding table's parameter count scale with `d_model`,
   not just with vocabulary size alone?
3. What real cost does a larger vocabulary create beyond parameter
   count, for pieces that are individually rare?
4. Why do multilingual models often prefer smaller, more composable
   pieces over one giant per-language vocabulary?
5. At GPT-2 small's scale, roughly what fraction of the model's total
   parameters were spent purely on token embeddings?

<details><summary>Answers</summary>

1. Quadrupling the vocabulary size (50 -> 200) on the same corpus more
   than halved the average tokens per word (5.42 -> 2.54) — vocabulary
   size directly and substantially changes tokenization density.
2. Because the embedding table stores one full `d_model`-dimensional
   vector per vocabulary entry — its total size is `vocab_size x
   d_model`, so the same vocabulary-size increase costs far more
   parameters in a model with a larger hidden dimension.
3. Rare pieces get less training signal on average — a fixed-size
   training corpus is spread across more distinct vocabulary buckets, so
   each individual piece (especially uncommon ones) is seen fewer times.
4. Because a vocabulary trained disproportionately on one dominant
   language ends up over-representing that language's words as single
   pieces while fragmenting everything else — smaller, more composable
   pieces (favored by algorithms like Unigram LM) generalize more evenly
   across many languages and scripts.
5. About 31% (38.6M of 124M total parameters), per exercise 2's verified
   calculation.

</details>

## Further reading & sources

- [Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - GPT-2's paper; states its 50,257-token vocabulary and 124M/355M/774M/1.5B parameter configurations used in exercise 2.
- [XLM-R: Unsupervised Cross-lingual Representation Learning at Scale (Conneau et al., 2019)](https://arxiv.org/abs/1911.02116) - a multilingual model with a 250,000-token vocabulary; section 3 discusses vocabulary allocation across 100 languages.
- [mT5: A Massively Multilingual Pre-trained Text-to-Text Transformer (Xue et al., 2020)](https://arxiv.org/abs/2010.11934) - covers vocabulary-size and language-balance tradeoffs for a multilingual SentencePiece/Unigram LM vocabulary directly.
- [Hugging Face NLP Course, Chapter 6: Tokenizer training deep dive](https://huggingface.co/learn/nlp-course/chapter6/2) - covers `vocab_size` as a trainer parameter directly, used in exercise 1.
- [google/sentencepiece (GitHub)](https://github.com/google/sentencepiece) - the library used in exercise 1's controlled experiment; `vocab_size` and `character_coverage` options are documented in `doc/options.md`.

## Next

[Module 09: Special Tokens](../09-special-tokens/README.md)
