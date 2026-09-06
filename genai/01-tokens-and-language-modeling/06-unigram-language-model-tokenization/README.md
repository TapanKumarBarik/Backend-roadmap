# Module 06: Unigram Language Model Tokenization

## Why this matters

Modules 03-04 built BPE, which **grows** a vocabulary by repeatedly merging
the most useful pair. Module 05's WordPiece does the same, just scoring
merges differently. The Unigram Language Model algorithm — the third
tokenizer family in wide use, and the one SentencePiece defaults to for
models like Llama, T5, ALBERT, and XLNet — works in the **opposite
direction**. It starts from a huge set of candidate pieces and repeatedly
**prunes** the least useful ones down to a target vocabulary size.

That reversal isn't just an implementation detail. It unlocks something
BPE and WordPiece structurally cannot do: because every retained piece
carries an explicit probability, a word can be segmented in *more than
one way*, each with a computable likelihood. BPE always produces exactly
one segmentation for a given input, fixed by its merge order. Unigram LM
can produce several — and deliberately sampling among them, a technique
called **subword regularization**, is a real training trick with a real
paper behind it, verified in this module using the actual `sentencepiece`
library.

## Concepts

### Grow vs. prune: two opposite strategies

```
 BPE / WordPiece (modules 03-05):           Unigram LM (this module):

 start: 256 bytes / characters              start: ~huge seed vocabulary of
   │                                          all substrings that appear
   │ repeatedly MERGE the best pair          often enough in the corpus
   ▼                                                │
 256 + 1 pieces                                     │ repeatedly REMOVE the
   │                                                │ least useful piece
   │ ... N merges later ...                         ▼
   ▼                                          seed size - 1 pieces
 target vocab size                                  │
   (grows UP to target)                             │ ... prune down ...
                                                     ▼
                                              target vocab size
                                              (shrinks DOWN to target)
```

Both end up at the same kind of artifact — a fixed vocabulary of subword
pieces — but BPE's vocabulary is a record of *merge operations*, while
Unigram LM's vocabulary is a table of *pieces with probabilities*, and
that difference is what makes multiple segmentations possible at all.

### The unigram model: every piece has a probability

"Unigram" here means the same thing it means in classic n-gram language
modeling: each piece is scored **independently**, with no dependence on
its neighbors. The probability of a whole segmentation is just the
product of its pieces' individual probabilities:

```
 segmentation:        ▁low   er
 piece probabilities:  0.02  0.05
 sequence probability: 0.02 × 0.05 = 0.001
```

Training estimates a probability for every candidate piece such that,
across the whole training corpus, the most likely segmentation of each
word matches how that vocabulary would actually want to split it. The
real algorithm (Kudo, 2018) does this with the **EM algorithm**
(Expectation-Maximization) plus iterative pruning:

1. Build a large seed vocabulary — every substring above some frequency
   threshold, often hundreds of thousands of candidates.
2. **E-step**: for each word in the corpus, compute how each candidate
   piece would be used across all its possible segmentations.
3. **M-step**: re-estimate each piece's probability from those usage
   statistics.
4. Compute, for each piece, how much the corpus's total likelihood would
   *drop* if that piece were removed (its pieces would have to be
   re-segmented using smaller alternatives). Pieces whose removal barely
   hurts the likelihood are the "least useful" ones.
5. Prune the worst-scoring ~10-20% of pieces (single characters are
   protected from removal, so nothing is ever truly unrepresentable).
6. Repeat from step 2 until the vocabulary reaches the target size.

This module doesn't re-implement steps 1-5 from scratch — that's a
genuine EM-over-a-large-corpus algorithm, not a toy exercise — but every
number and behavior shown below comes from either (a) a real
`sentencepiece` unigram model trained in this module's exercises, or (b)
a small, fully-worked, hand-verified example of step 7 below: how a
*trained* model actually segments a word once its piece probabilities
are fixed.

### Segmenting with a trained model: Viterbi, not greedy

Once training is done, encoding a new word means finding the
segmentation with the **highest total probability** — equivalently, the
lowest total negative-log-probability, since probabilities multiply and
logs turn products into sums. Trying every possible split of a word is
exponential, so real implementations use a **Viterbi-style dynamic
program**: build up the best score for every prefix of the word,
left to right.

```
 word: "lower"      toy vocab (log-probabilities):
                      low    -2.30   lower  -2.81
                      er     -2.12   l  -3.91  o -3.91  w -3.91
                      e      -3.00   e -3.00  r -3.51

 best_score[0] = 0                              (empty prefix)
 best_score[1] = best_score[0] + score("l")      = -3.91
 best_score[2] = best_score[0] + score("lo")?    no such piece -> skip
                 best_score[1] + score("o")      = -7.82
 best_score[3] = best_score[0] + score("low")    = -2.30   <- best so far
                 ...
 best_score[5] = best_score[0] + score("lower")  = -2.81   <- WINS
                 best_score[3] + score("er")      = -2.30-2.12 = -4.42
                 (many other partial paths, all worse)

 final segmentation, read back via backpointers: ["lower"]
```

This module's exercise 1 implements exactly this DP in pure Python
against a small hand-built vocabulary and confirms it agrees with
brute-force enumeration of every possible split.

### Why multiple segmentations exist — and why that's a feature

Because pieces carry explicit probabilities rather than a fixed merge
order, a trained Unigram LM model can report not just the single best
segmentation but an **n-best list**, and can even **sample** from the
distribution of plausible segmentations weighted by their probability.
This is verified directly against the real library below: the same word
`"lowering"` comes back as `['▁lower', 'ing']` most often, but
occasionally as `['▁lower', 'i', 'n', 'g']` — a different, still-valid
segmentation of the same characters.

Training a model on top of *randomly sampled* segmentations instead of
always the single best one is called **subword regularization** (Kudo,
2018) — it's a data-augmentation trick: the same input string turns into
slightly different token sequences on different training passes, which
makes the downstream model more robust to segmentation noise at
inference time. This is a genuinely different capability from BPE, whose
merge order is deterministic and produces exactly one segmentation, full
stop.

### Where you'll actually meet this

SentencePiece defaults to `model_type=unigram` (BPE is also available as
`model_type=bpe` within the same library — module 05 covered
SentencePiece the *framework*, this module covers Unigram LM the
*algorithm* it most often runs). Models trained with SentencePiece's
unigram mode include Llama, ALBERT, XLNet, T5, and mBART. If a model
card says "SentencePiece" without saying which underlying algorithm,
check the tokenizer config's `model_type` field — don't assume BPE.

## Reference

```
 Concept                 What it means here
 ─────────────────────── ───────────────────────────────────────────
 Seed vocabulary          Large initial set of candidate pieces before
                          any pruning — often all frequent substrings
 Piece probability        log P(piece), estimated via EM over the
                          training corpus
 E-step                   Estimate how each piece is used across all
                          segmentations of the corpus
 M-step                   Re-estimate piece probabilities from usage
 Pruning                  Remove the pieces whose removal hurts overall
                          corpus likelihood the least
 Viterbi segmentation     DP that finds the single highest-probability
                          segmentation of a word in linear-ish time
 n-best segmentation      The top-K highest-probability segmentations,
                          not just the single best
 Subword regularization   Training on segmentations *sampled* from the
                          probability distribution, not always the best
 sp.encode()              Best (Viterbi) segmentation
 sp.nbest_encode_as_pieces() Top-K segmentations, ranked
 sp.encode(enable_sampling=True, alpha=...) Sampled segmentation
```

## Hands-on exercises

### Exercise 1 — implement Viterbi segmentation from scratch

Verified output included below the code — run it yourself first.

```python
import math

# Toy vocabulary: piece -> log-probability (illustrative, self-consistent)
vocab = {
    "low": math.log(0.10),
    "er": math.log(0.12),
    "lower": math.log(0.06),
    "l": math.log(0.02), "o": math.log(0.02), "w": math.log(0.02),
    "e": math.log(0.05), "r": math.log(0.03),
}

def viterbi_segment(word, vocab):
    n = len(word)
    best_score = [float("-inf")] * (n + 1)
    best_score[0] = 0.0
    back = [None] * (n + 1)
    for end in range(1, n + 1):
        for start in range(end):
            piece = word[start:end]
            if piece in vocab:
                score = best_score[start] + vocab[piece]
                if score > best_score[end]:
                    best_score[end] = score
                    back[end] = start
    pieces, pos = [], n
    while pos > 0:
        start = back[pos]
        pieces.append(word[start:pos])
        pos = start
    pieces.reverse()
    return pieces, best_score[n]

print(viterbi_segment("lower", vocab))
```

Verified output:

```
(['lower'], -2.8134107167600364)
```

Now brute-force every possible segmentation of `"lower"` using this
vocabulary and confirm `["lower"]` really is the highest-scoring one —
don't just trust the DP:

```python
def all_segmentations(word, vocab, memo=None):
    if memo is None:
        memo = {}
    if word in memo:
        return memo[word]
    if word == "":
        return [([], 0.0)]
    results = []
    for end in range(1, len(word) + 1):
        piece = word[:end]
        if piece in vocab:
            for rest, score in all_segmentations(word[end:], vocab, memo):
                results.append(([piece] + rest, vocab[piece] + score))
    memo[word] = results
    return results

segs = all_segmentations("lower", vocab)
segs.sort(key=lambda x: -x[1])
for pieces, score in segs:
    print(pieces, round(score, 3))
```

Verified output (highest-scoring first):

```
['lower'] -2.813
['low', 'er'] -4.423
['low', 'e', 'r'] -8.805
['l', 'o', 'w', 'er'] -13.856
['l', 'o', 'w', 'e', 'r'] -18.238
```

`["lower"]` wins, confirming the DP found the true optimum — and notice
that four *other* valid segmentations exist, each with a computable
probability. That's the property BPE cannot express.

### Exercise 2 — train a real Unigram LM model and inspect its pieces

```python
import sentencepiece as spm

# corpus.txt: any plain-text file, one sentence per line (real training
# corpora are millions of lines; a few dozen is enough to see the shape
# of the algorithm)
spm.SentencePieceTrainer.train(
    input="corpus.txt", model_prefix="uni", vocab_size=60, model_type="unigram"
)

sp = spm.SentencePieceProcessor(model_file="uni.model")
for i in range(sp.get_piece_size()):
    print(i, repr(sp.id_to_piece(i)), round(sp.get_score(i), 3))
```

Verified output (trained on a small corpus mixing English words with
repeated morphological variants like `lower`/`lowering`/`lowered`):

```
0 '<unk>' 0.0
1 '<s>' 0.0
2 '</s>' 0.0
3 '▁' -1.778
4 's' -2.617
5 'e' -3.203
...
10 '▁the' -3.599
12 '▁lower' -3.909
18 'ing' -4.115
20 '▁piece' -4.358
21 '▁quick' -4.358
26 '▁unigram' -4.692
34 '▁low' -5.191
35 'ization' -5.192
```

Notice two things a BPE vocabulary would never show you: (1) every piece
has an explicit probability (`get_score`), not just a merge rank, and
(2) whole common words survive as single pieces (`▁the`, `▁lower`,
`▁quick`, `▁unigram`) right alongside single characters — the pruning
process kept whatever pieces were most useful for reconstructing the
corpus's actual likelihood, not whatever happened to merge first.

### Exercise 3 — n-best segmentations and subword regularization

```python
sp = spm.SentencePieceProcessor(model_file="uni.model")
word = "lowering"

print("best:", sp.encode(word, out_type=str))
print("n-best:")
for seq in sp.nbest_encode_as_pieces(word, 5):
    print(" ", seq)

print("sampled (5 draws):")
for _ in range(5):
    print(" ", sp.encode(word, out_type=str, enable_sampling=True,
                          alpha=0.1, nbest_size=-1))
```

Verified output:

```
best: ['▁lower', 'ing']
n-best:
  ['▁lower', 'ing']
  ['▁low', 'e', 'r', 'ing']
  ['▁lower', 'i', 'n', 'g']
  ['▁low', 'e', 'r', 'i', 'n', 'g']
  ['▁', 'l', 'o', 'w', 'e', 'r', 'ing']
sampled (5 draws):
  ['▁lower', 'ing']
  ['▁lower', 'i', 'n', 'g']
  ['▁lower', 'i', 'n', 'g']
  ['▁lower', 'ing']
  ['▁lower', 'ing']
```

The best segmentation is stable, but sampling genuinely varies —
`['▁lower', 'i', 'n', 'g']` shows up alongside the top pick. Compare
this to module 04's BPE `encode()`: given fixed merge rules, it returns
exactly one segmentation for a given input, every single time. There is
no BPE equivalent of `enable_sampling=True`.

## Independent challenge

A teammate on your team argues: "subword regularization is pointless —
if the best segmentation is always the highest-probability one, why
would training on a *worse* one ever help?" Using `nbest_encode_as_pieces`
on 3-4 different words from exercise 3's model, look at how close the
n-best scores are to the best score for words the model has seen
variants of (like `lowering`) versus words built from rare, unseen
character combinations. Write two or three sentences connecting what you
observe to why sampling near-tied segmentations during training might
make the downstream model robust to whichever way real users' text
happens to get segmented at inference time.

<details><summary>Discussion</summary>

For words close to training data (like `lowering`, close to the trained
`lower`/`lowering`/`lowered` variants), the top few segmentations tend to
have similar scores — the model is genuinely unsure between a couple of
"reasonable" ways to split it. For unfamiliar character combinations,
scores usually drop off much faster after the single best segmentation,
because there's only one sensible way to represent it with the available
pieces. Subword regularization exploits exactly the close-call case:
when several segmentations are nearly equally plausible, training on a
mix of them (rather than always the same one) means the downstream model
sees more than one way each word can appear as tokens, so it doesn't
overfit to one arbitrary tokenization choice.

</details>

## Common mistakes & troubleshooting

- **Assuming "SentencePiece" means Unigram LM.** SentencePiece is a
  framework that supports both `model_type=bpe` and `model_type=unigram`
  (module 05). Check the actual config — Llama's tokenizer, for example,
  is SentencePiece running BPE, not Unigram LM. Don't infer the
  algorithm from the library name.
- **Confusing "unigram" the tokenization algorithm with "unigram model"
  the classic bag-of-words language model.** They share the
  independence assumption (each unit scored without conditioning on
  neighbors) but solve different problems — one segments text into
  pieces, the other predicts word sequences. Context disambiguates
  which one a source means.
- **Expecting `sp.encode()` to be non-deterministic by default.** It
  isn't — plain `encode()` always returns the single best (Viterbi)
  segmentation. Sampling only happens when you explicitly pass
  `enable_sampling=True`.
- **Forgetting single characters are protected from pruning.** This is
  why Unigram LM models, like byte-level BPE, still have a fallback for
  unseen combinations — pruning never removes every way to represent a
  character, so there's no WordPiece-style whole-word `[UNK]` failure
  mode (module 05) here either.

## Checkpoint quiz

1. BPE and WordPiece grow their vocabulary by merging. What does Unigram
   LM do instead?
2. Why can Unigram LM represent multiple valid segmentations for the
   same word, when BPE cannot?
3. What algorithm finds the single best segmentation efficiently, and
   why not just try every possible split?
4. What is subword regularization, and what problem is it meant to help
   with?
5. Is "SentencePiece" a synonym for "Unigram LM"? Why or why not?
6. What protects Unigram LM models from ever needing a whole-word
   `[UNK]`, the way trained WordPiece models sometimes do?

<details><summary>Answers</summary>

1. It starts from a large seed vocabulary of candidate pieces and
   repeatedly *prunes* the least useful ones down to the target
   vocabulary size — the opposite direction from merging.
2. Every retained piece carries an explicit, independently-estimated
   probability. A segmentation's score is just the product of its
   pieces' probabilities, so multiple segmentations of the same word
   each have a well-defined score — there's no single fixed merge order
   forcing one specific outcome, unlike BPE.
3. A Viterbi-style dynamic program: build up the best score for every
   prefix of the word left to right, reusing subproblem results, rather
   than enumerating every split (which grows exponentially with word
   length).
4. Training on segmentations *sampled* from the model's probability
   distribution over valid segmentations, rather than always using the
   single best one — intended to make the downstream model more robust
   to segmentation variation at inference time.
5. No — SentencePiece is a framework/library that supports multiple
   underlying algorithms, including both `model_type=bpe` and
   `model_type=unigram`. "SentencePiece" describes the framework layer
   (module 05); "Unigram LM" describes one specific algorithm it can run.
6. Single characters are protected from pruning, so there's always some
   valid (if maximally fragmented) way to represent any input — the same
   reason byte-level BPE never fully fails, and the reason trained
   WordPiece's whole-word `[UNK]` failure mode (module 05) doesn't
   apply here.

</details>

## Further reading & sources

- [Subword Regularization: Improving Neural Network Translation Models with Multiple Subword Candidates (Kudo, 2018)](https://arxiv.org/abs/1804.10959) - the original Unigram LM and subword-regularization paper; describes the EM training and pruning loop this module summarizes.
- [SentencePiece: A simple and language independent subword tokenizer (Kudo & Richardson, 2018)](https://arxiv.org/abs/1808.06226) - the framework paper referenced in module 05, which implements Unigram LM as one of its two model types.
- [Hugging Face NLP Course, Chapter 6: Unigram tokenization](https://huggingface.co/learn/nlp-course/chapter6/7) - a from-scratch walkthrough of the EM training loop, including the loss-based pruning step this module doesn't reimplement.
- [google/sentencepiece (GitHub)](https://github.com/google/sentencepiece) - the reference implementation used in every exercise here; see `doc/options.md` for `nbest_size`, `alpha`, and sampling parameters.
- [T5: Exploring the Limits of Transfer Learning (Raffel et al., 2020)](https://arxiv.org/abs/1910.10683) - one of several widely-used models trained with SentencePiece's Unigram LM mode; section 2 references its tokenizer choice.

## Next

[Module 07: Comparing Tokenizers Across Models](../07-comparing-tokenizers-across-models/README.md)
