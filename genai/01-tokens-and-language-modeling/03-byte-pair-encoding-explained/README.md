# Module 03: Byte-Pair Encoding Explained

## Why this matters

Module 02 established the requirement: a tokenizer needs short-ish
sequences (like word-level) *and* graceful handling of anything unseen
(like character-level). **Byte-Pair Encoding (BPE) is the specific
algorithm that delivers both**, and it is what GPT, Llama, and most other
modern LLMs actually run.

The mechanism is short enough to hold in your head entirely, and once
you do, several things stop being mysterious: why common English words
are usually one token and rare words are several; why the vocabulary is
built once, offline, from a training corpus (not decided per-input); and
why module 00's `"Tokenization"` split precisely into `Token` + `ization`
rather than any other combination — it wasn't a rule someone wrote, it
fell out of frequency statistics over a huge corpus, which this module
shows you how to compute yourself.

## Concepts

### The core idea in one sentence

**Start with individual bytes. Repeatedly find the most frequent
adjacent pair, and merge it into a new single token. Stop after a fixed
number of merges.** That's the whole algorithm — training it is
literally that loop, run offline once over a huge corpus; using it is
replaying the same merges on new text.

### Walking one worked example by hand

Take a toy corpus that's just the word "low" appearing several times,
plus "lower" and "lowest" a few times each — small enough to trace
completely.

```
 STARTING VOCABULARY: every distinct byte in the corpus
 corpus (as byte sequences, </w> marks end-of-word):

   l o w </w>       x 5
   l o w e r </w>   x 2
   l o w e s t </w> x 2

 STEP 1: count every ADJACENT PAIR across the whole corpus
   (l,o): 9    (o,w): 9    (w,</w>): 5
   (w,e): 4    (e,r): 2    (r,</w>): 2
   (e,s): 2    (s,t): 2    (t,</w>): 2

   MOST FREQUENT: (l,o) and (o,w) are tied at 9 -- take (l,o) first

 MERGE 1: (l,o) -> "lo"
   lo w </w>       x 5
   lo w e r </w>   x 2
   lo w e s t </w> x 2
   vocabulary gains one new token: "lo"

 STEP 2: recount pairs with the NEW merged unit
   (lo,w): 9    (w,</w>): 5   (w,e): 4  ...

 MERGE 2: (lo,w) -> "low"      (now the most frequent, at 9)
   low </w>       x 5
   low e r </w>   x 2
   low e s t </w> x 2
   vocabulary gains: "low"

 ... repeat. On JUST these three words, merging eventually consumes
 each one entirely into a single token ("low</w>", "lower</w>",
 "lowest</w>") -- there's nothing else in this tiny corpus for a
 shared "er" or "est" piece to be reused ACROSS, so nothing stops
 the algorithm from continuing to merge within each word until it
 runs out of budget.

 a suffix only survives as its OWN reusable token when the corpus
 is diverse enough that stopping the merge there is more valuable
 than continuing -- e.g. if "faster" and "smallest" were ALSO in
 the corpus, "low"/"fast"/"small" would compete for merges with
 "er"/"est", and a large, real corpus has thousands of such
 competing words. Exercise 5 trains on exactly this kind of richer,
 repetitive corpus and shows a real shared root emerge.
```

Notice what happened: the algorithm never "decided" that "low" is a
meaningful English root. It simply merged whatever pair of adjacent
symbols was statistically most common, repeatedly, until it ran out of
merge budget. Meaningful sub-word units emerge as a *side effect* of
frequency — the same self-supervised-signal-from-raw-data pattern as
Word2Vec (track 00 module 03) and pretraining itself (track 00 module
07).

### Training vs. using a tokenizer — two different processes

```
 TRAINING (done ONCE, offline, by whoever builds the model)
 ─────────────────────────────────────────────────────────
   huge text corpus
        │
        ▼
   run the merge loop above, tens of thousands of times
        │
        ▼
   an ORDERED LIST of merge rules, e.g.:
     1. (l, o) -> lo
     2. (lo, w) -> low
     3. (e, r) -> er
     ...
     50,000. (whatever the vocab-size budget allows)
        │
        ▼
   this list + the resulting vocabulary IS the tokenizer

 USING IT (every time ANY text gets tokenized, forever after)
 ─────────────────────────────────────────────────────────
   new text -> raw bytes -> APPLY the merge rules IN ORDER
   (merge 1's pair first, wherever it appears, then merge 2's, ...)
        │
        ▼
   final token sequence

   THE MERGE RULES NEVER CHANGE AFTER TRAINING. Encoding new
   text is just replaying a fixed, ordered recipe -- which is
   why it's fast and deterministic.
```

This explains something that trips people up: **the tokenizer is frozen
independently of the model it feeds.** GPT-4 and GPT-4o use *different*
tokenizers (`cl100k_base` vs. `o200k_base`, module 00) trained separately,
each time the merge-rule list was rebuilt from a fresh corpus and
vocab-size budget.

### Why the merge order matters at encoding time

Encoding new text isn't "find any applicable merge" — it's **apply the
learned merges in the exact order they were learned**, because later
merges were only discovered after earlier ones already existed.

Using the 8 merges this section's worked example actually produces
(reproduced in exercise 3), here's every one of them applied, in order,
to a word that was never in the training corpus at all — "lowering":

```
 start:      l  o  w  e  r  i  n  g  </w>
 apply #1:  lo  w  e  r  i  n  g  </w>       (l,o) -> lo
 apply #2:  low e  r  i  n  g  </w>          (lo,w) -> low
 apply #3:  low e  r  i  n  g  </w>          (low,</w>) -> no match here,
                                              nothing changes this step
 apply #4:  lowe r  i  n  g  </w>            (low,e) -> lowe
 apply #5:  lower i  n  g  </w>              (lowe,r) -> lower
 apply #6-8: no further matches; sequence is already stable

 final:     lower  i  n  g  </w>     -- 4 tokens
```

Two things worth noticing. First, several of the 8 rules (numbers 3, 6,
7 and 8) simply don't match anywhere in this particular word and are
skipped — that's normal; a real vocabulary has tens of thousands of
rules and most don't apply to any given input. Second, and more
important: this
result is a direct, if slightly awkward, consequence of training on a
corpus of only 3 words. "lower" happened to be one of them, so it
merged whole; "ing" had nothing to merge with because nothing in this
toy corpus ever needed to represent it. A production tokenizer, trained
on a vastly larger and more varied corpus, would very likely also merge
common suffixes like "ing" into their own reusable token — but you can
only see that by training on a corpus where "ing" actually appears
often, which is exactly what exercise 5 does next.

If you applied these same 8 merges in the wrong order, or skipped ahead,
you could produce a different, invalid tokenization — real BPE
implementations (including `tiktoken`) apply merges greedily in rank
order for exactly this reason. Exercise 4 has you prove it.

### Vocabulary size as the one real knob

The number of merges performed is a **hyperparameter chosen before
training**, and it's the single biggest design decision in building a
tokenizer — module 08 covers the full tradeoff, but the shape is
visible already:

```
 FEW MERGES  ──────────────────────────────►  MANY MERGES
 (small vocab, e.g. 5,000)                    (large vocab, e.g. 100,000)

 sequences LONGER                              sequences SHORTER
 (less merged, closer to byte-level)            (more merged, closer to
                                                  word-level)
 vocabulary SMALLER                             vocabulary LARGER
 (smaller embedding table)                     (bigger embedding table,
                                                  more memory)
 fewer merge rules to store                    more merge rules,
                                                 slower to encode
```

Real tokenizers land in the tens of thousands (GPT-2: ~50K, GPT-4-era:
~100K) — a deliberately chosen middle point, not a mathematically
"correct" number.

### Why byte-level BPE specifically (tying back to modules 01-02)

The starting alphabet in production tokenizers is **UTF-8 bytes** (module
01), not Unicode characters. This single choice is what gives GPT-family
tokenizers their "never fails on any input" guarantee from module 02:
since the starting vocabulary already covers all 256 possible byte
values, the worst case for any input — however bizarre, however many
languages mixed together, even literal binary data — is that it falls
back to one token per byte. There is no tier below that to fail into.

## Reference

| Term | Means |
|---|---|
| BPE (Byte-Pair Encoding) | Iteratively merge the most frequent adjacent symbol pair |
| Merge rule | A learned `(pair) -> new_token` instruction, one per training iteration |
| Merge order | The sequence merges were learned in; encoding must replay it in that order |
| Vocabulary size | The number of merges performed (plus the base alphabet); the main tokenizer hyperparameter |
| Byte-level BPE | BPE starting from UTF-8 bytes rather than characters — guarantees full input coverage |
| `</w>` | A common convention marking word boundaries so merges don't cross them incorrectly |

| Task | Code |
|---|---|
| Count adjacent pairs in a corpus | `Counter(zip(seq, seq[1:]))` |
| Merge the most frequent pair | replace every occurrence of that pair with one new symbol |
| Real BPE training | `tokenizers` library (Hugging Face), `BpeTrainer` |
| Inspect `tiktoken`'s actual merges | not exposed directly — trained offline by OpenAI |

## Hands-on exercises

Standard library only for exercises 1-4; `pip install tokenizers` for 5.

### 1. Implement the merge-counting step

```python
from collections import Counter

corpus = ["low", "low", "low", "low", "low", "lower", "lower", "lowest", "lowest"]
# represent each word as a tuple of characters, for easy pair-merging
words = [tuple(w) + ("</w>",) for w in corpus]

def get_pair_counts(words):
    counts = Counter()
    for word in words:
        for pair in zip(word, word[1:]):
            counts[pair] += 1
    return counts

counts = get_pair_counts(words)
for pair, n in counts.most_common(5):
    print(pair, n)
```

Confirm `('l', 'o')` and `('o', 'w')` are tied at the top, matching the
worked example.

### 2. Implement one merge step

```python
def merge_pair(words, pair):
    merged = "".join(pair)
    new_words = []
    for word in words:
        new_word, i = [], 0
        while i < len(word):
            if i < len(word) - 1 and (word[i], word[i+1]) == pair:
                new_word.append(merged)
                i += 2
            else:
                new_word.append(word[i])
                i += 1
        new_words.append(tuple(new_word))
    return new_words

words = merge_pair(words, ('l', 'o'))
print(words[:3])
```

Confirm every word starting with "l", "o" now starts with the single
symbol `"lo"`.

### 3. Run the full training loop

```python
def train_bpe(corpus, num_merges):
    words = [tuple(w) + ("</w>",) for w in corpus]
    merges = []
    for _ in range(num_merges):
        counts = get_pair_counts(words)
        if not counts:
            break
        best = counts.most_common(1)[0][0]
        words = merge_pair(words, best)
        merges.append(best)
    return merges, words

merges, _ = train_bpe(corpus, num_merges=8)
for i, m in enumerate(merges, 1):
    print(f"merge {i}: {m}")

print("\nfinal tokenization of each distinct word:")
for w in sorted(set(corpus)):
    seq = tuple(w) + ("</w>",)
    for m in merges:                       # replay every learned merge, in order
        seq = merge_pair([seq], m)[0]
    print(f"  {w:8s} -> {seq}")
```

Run it end to end. You should get exactly this (verified output):

```
merge 1: ('l', 'o')
merge 2: ('lo', 'w')
merge 3: ('low', '</w>')
merge 4: ('low', 'e')
merge 5: ('lowe', 'r')
merge 6: ('lower', '</w>')
merge 7: ('lowe', 's')
merge 8: ('lowes', 't')

final tokenization of each distinct word:
  low      -> ('low</w>',)
  lower    -> ('lower</w>',)
  lowest   -> ('lowest', '</w>')
```

Notice all three words end up fully merged into one token each, with no
shared piece between them — on a 3-word corpus there's nothing else for
a common "low" or suffix to be *reused across*, so nothing stops merging
short of consuming each whole word. A separately reusable root (module
00's `Token` + `ization` split) only emerges from a corpus diverse
enough that several different words compete for the same merges —
exactly what exercise 5's richer corpus demonstrates next.

### 4. Prove merge order matters

```python
# apply the SAME two merges in each order, on a word neither training
# example has seen, and compare results
word = list("lowered") + ["</w>"]

def apply_merges(word, merge_list):
    seq = tuple(word)
    for m in merge_list:
        seq = merge_pair([seq], m)[0]
    return seq

forward = apply_merges(word, merges)                 # correct: as-trained order
reversed_order = apply_merges(word, list(reversed(merges)))  # wrong: reversed

print("correct order:  ", forward)
print("reversed order: ", reversed_order)
```

Confirm the two differ. Explain in one sentence why a real tokenizer
implementation must store and replay merges in their learned rank order,
not apply them in some other sequence.

### 5. Train a real tokenizer and inspect its actual merges

```python
from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.trainers import BpeTrainer
from tokenizers.pre_tokenizers import Whitespace

tokenizer = Tokenizer(BPE(unk_token="<unk>"))
tokenizer.pre_tokenizer = Whitespace()
trainer = BpeTrainer(vocab_size=300, special_tokens=["<unk>"])

# any real text file works; a chunk of this repo's own README is fine
text_lines = [
    "the quick brown fox jumps over the lazy dog",
    "tokenization tokenizer tokenized tokenizing tokens",
    "lower lowest lowered lowering slower slowest",
] * 20

tokenizer.train_from_iterator(text_lines, trainer)

encoded = tokenizer.encode("tokenization is fascinating")
print("tokens:", encoded.tokens)
print("vocab size reached:", tokenizer.get_vocab_size())
```

Run it and look at how "tokenization", "tokenizer" etc. get split — they
share a training corpus with heavy repetition of the "token-" root, so
you should see it emerge as a reusable piece, exactly as module 00
predicted for a real production tokenizer trained on a vastly larger
corpus.

## Independent challenge

Train your from-scratch BPE implementation (exercises 1-3) on a real,
larger corpus — a few paragraphs of English prose, several hundred words
minimum — for 50-100 merges. Then:

1. Print the first 15 and last 15 merges learned. Are the early ones
   more "obviously linguistic" (common letter pairs) than the late ones?
2. Tokenize five words that appeared frequently in your corpus and five
   that appeared exactly once. Compare average token count per word
   between the two groups.
3. Tokenize one word that never appeared in your corpus at all (invent
   one, or use a technical term unlikely to be present). Confirm it still
   produces *some* valid tokenization rather than failing — connect this
   to module 02's OOV discussion.

Write a short paragraph on what you observe about the relationship
between a word's training-corpus frequency and how many tokens it costs
at inference time.

## Common mistakes & troubleshooting

- **Assuming merges can be applied in any order.** They must replay in
  exactly the order they were learned (exercise 4) — later merges depend
  on earlier ones having already happened.
- **Confusing training and inference.** Training (building the merge
  list) happens once, offline, over a huge corpus. Using the tokenizer
  (applying the frozen merge list) happens on every single input,
  forever after, with no further learning.
- **Expecting BPE merges to align with linguistic morphemes.** They
  often do (module 00's `Token`+`ization`) but only because frequent
  linguistic units are, unsurprisingly, frequent — the algorithm has no
  concept of "prefix" or "suffix," only adjacency frequency.
- **Thinking a bigger vocabulary is free.** Every additional merge is one
  more row in the model's embedding table and output projection — a real
  memory and compute cost, covered fully in module 08.
- **Forgetting the base alphabet is bytes, not characters.** This is what
  makes byte-level BPE's "never fails" guarantee possible (module 01)
  — a character-based BPE would still need an `<UNK>` fallback for
  scripts or symbols outside its training data.

## Checkpoint quiz

1. State the BPE algorithm in one sentence.
2. What's the difference between training a tokenizer and using one?
3. Why must merges be applied in their learned order at encoding time,
   not any order?
4. What is vocabulary size actually a count of, in BPE?
5. Why does starting from bytes rather than characters matter for
   handling unseen input?
6. In this module's worked example, "low", "lower" and "lowest" each
   collapsed into one single token rather than sharing a reusable suffix
   piece. Why, and what would it take for a suffix like "er" to survive
   as its own token instead?

<details><summary>Answers</summary>

1. Start from individual symbols (bytes), and repeatedly merge the most
   frequent adjacent pair into a new single token, for a fixed number of
   iterations.
2. Training builds the ordered list of merge rules once, offline, from a
   large corpus. Using the tokenizer means applying that same frozen,
   ordered rule list to new text — no further learning happens at this
   stage.
3. Later merges were only discovered because earlier merges had already
   changed the symbol sequence; applying them out of order can produce a
   different (and not the model's expected) tokenization.
4. The number of merge operations performed during training (plus the
   size of the starting alphabet) — it directly sets how many entries the
   final vocabulary has.
5. Starting from bytes means the base alphabet already covers all 256
   possible values, so any input — any language, symbol, or malformed
   data — has at minimum a one-token-per-byte fallback; there is no
   input that falls outside representability.
6. With only 3 distinct words in the corpus, there was nothing else for
   a shared "er" or "est" piece to be reused *across* — each merge just
   kept combining within its own word until the merge budget ran out, so
   the algorithm fully consumed each word instead of stopping at a
   shared suffix. A suffix survives as its own token only when the
   corpus is diverse enough that competing words (e.g. "faster",
   "smallest") make merging the whole word less valuable than merging a
   piece reused across many of them — which is exactly what a real,
   large training corpus provides and this toy one didn't. The algorithm
   only ever tracks adjacency frequency, but frequent linguistic patterns
   symbol pairs.
</details>

## Further reading & sources

- [Neural Machine Translation of Rare Words with Subword Units (Sennrich et al., 2016)](https://arxiv.org/abs/1508.07909) - the paper that introduced BPE to NLP; the algorithm description in section 3.2 is the source for this module's worked example.
- [A New Algorithm for Data Compression (Gage, 1994)](http://www.pennelynn.com/Documents/CUJ/HTML/94HTML/19940045.HTM) - the original Byte-Pair Encoding paper, from data compression rather than NLP — worth reading to see the idea in its unrelated original context.
- [Let's build the GPT Tokenizer (Andrej Karpathy, 2hr)](https://www.youtube.com/watch?v=zduSFxRajkE) - builds byte-level BPE from scratch on camera, in more depth than this module's exercises; the single best resource for this specific topic.
- [Hugging Face `tokenizers` library documentation](https://huggingface.co/docs/tokenizers/index) - the library used in exercise 5; also documents WordPiece and Unigram training (modules 05-06) with the same API shape.
- [GPT-2: Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - section 2.2 specifically describes byte-level BPE as GPT-2's tokenization approach and why byte-level (not Unicode-level) was chosen.
- [minbpe (Karpathy's minimal BPE implementation, GitHub)](https://github.com/karpathy/minbpe) - a clean, readable, from-scratch reference implementation to compare against your own exercises.

## Next

[Module 04: Building a BPE Tokenizer From Scratch](../04-building-a-bpe-tokenizer-from-scratch/README.md)
