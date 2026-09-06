# Module 05: WordPiece and SentencePiece

## Why this matters

Modules 03-04 built BPE — GPT's tokenization algorithm — and it's tempting
to assume every tokenizer works the same way. It doesn't. **BERT uses
WordPiece, which merges by a different scoring rule than raw frequency.
Llama, T5, and many multilingual models use SentencePiece, which solves
a problem BPE and WordPiece both quietly assume away: that you can find
word boundaries by splitting on whitespace.**

That assumption is fine for English. It's simply false for Chinese,
Japanese, and Thai, which don't use spaces between words at all. This
module covers both algorithms concretely enough that you'll recognize
which one a model card is describing, and — because everything here is
run and verified rather than described secondhand — you'll see two real,
non-obvious behaviors: WordPiece can fail an *entire word* to `[UNK]`
even though byte-level BPE never can, and the common claim that
SentencePiece is "fully lossless" is true only up to a normalization
step that quietly collapses whitespace by default.

## Concepts

### WordPiece: a different question at merge time

BPE (module 03) merges the pair with the highest raw **frequency**.
WordPiece — introduced for Google's neural machine translation system
and later used to train BERT — merges the pair that maximizes a
**likelihood ratio** instead:

```
 BPE's question:        "which adjacent pair appears most often?"
                        score(pair) = count(pair)

 WordPiece's question:  "which pair appears together far MORE often
                         than you'd expect from how common its two
                         pieces are individually?"
                        score(pair) = count(pair) / (count(left) * count(right))
```

Why this produces different answers, with numbers:

```
 pair A: ("t","h")   count(pair)=100   count("t")=1000  count("h")=1000
         BPE score:        100
         WordPiece score:  100 / (1000*1000) = 0.0001

 pair B: ("z","q")   count(pair)=20    count("z")=20    count("q")=20
         BPE score:        20
         WordPiece score:  20 / (20*20) = 0.05

 BPE picks A (100 > 20) -- purely "which happens more often."
 WordPiece picks B (0.05 > 0.0001) -- "z" and "q" are individually
 RARE but ALWAYS appear together, which is stronger evidence they
 form a genuine unit than "t" and "h" being individually common
 letters that also happen to co-occur a lot.
```

Both are legitimate, verified strategies used in production models —
neither is "more correct." WordPiece's ratio tends to avoid merging
common-but-coincidental pairs (like "t" next to "h" in English, which
happens constantly without "th" always being one meaningful unit) in
favor of pairs that are distinctively, reliably a pair.

### The `##` convention and a genuinely different tokenization algorithm

WordPiece marks any piece that continues a word (rather than starting
one) with `##`, and — this is the part that actually differs from
BPE, not just cosmetically — **it tokenizes new text with greedy
longest-match-first, not by replaying merge history**:

```
 WordPiece encoding "unbelievable" (greedy longest-match-first):

   start at position 0. find the LONGEST prefix that's in the vocab.
   say "un" matches. take it, advance.
   from the new position, find the longest prefix STARTING WITH "##"
   say "##believ" matches. take it, advance.
   repeat until the word is fully consumed
   OR until no valid continuation piece can be found ANYWHERE
      --> if that happens, the ENTIRE WORD becomes [UNK],
          not just the unmatched remainder
```

That last line is the important, easy-to-miss consequence, and exercise
2 reproduces it on a real trained tokenizer: **WordPiece has no
guaranteed fallback the way byte-level BPE does.** BPE's base alphabet is
all 256 byte values (module 01), so it can never run out of smaller
pieces to fall back to. WordPiece's base alphabet is characters that
*survived training* as either standalone or `##`-prefixed tokens — and a
character that only ever appeared as part of larger merged words might
have no standalone `##`-prefixed entry in the final vocabulary at all.
Hit that gap partway through a word, and the whole word — not just the
unmatched tail — becomes `[UNK]`.

### SentencePiece: the problem isn't the merge rule, it's the input

BPE and WordPiece both share a hidden assumption: *something already
split the raw text into words before tokenization starts* — normally, a
pre-tokenizer that splits on whitespace and punctuation. That's a
reasonable assumption for English. It is **not** a reasonable assumption
for Chinese, Japanese, or Thai, none of which reliably use spaces
between words.

```
 ENGLISH:  "the quick fox"
           pre-tokenizer splits on spaces -> ["the", "quick", "fox"]
           BPE/WordPiece then tokenizes EACH WORD separately
           -- this works because spaces genuinely mark word boundaries

 CHINESE:  "我爱学习"  (roughly: "I love studying")
           NO SPACES AT ALL between what a human would call "words"
           a whitespace pre-tokenizer sees this as ONE "word" --
           BPE/WordPiece can still tokenize it (byte-level BPE always
           can, module 02), but the WHOLE SENTENCE is now one
           pre-tokenized chunk instead of being split into meaningful
           units first, which changes what the merge algorithm sees
```

SentencePiece's actual fix is to **not pre-tokenize on whitespace at
all.** It treats the raw input — spaces included — as one plain stream
of characters, and represents a space as an ordinary character in that
stream: the `▁` symbol (U+2581, a visible placeholder for a literal
space).

```
 "tokenization is fascinating"
        │
        ▼  SentencePiece treats this as ONE stream, no pre-split:
   ▁tokeniz a t i o n ▁ i s ▁ f a s c i n a t ing
        ▲                  ▲          ▲
        │                  │          │
   "▁" marks "a space      note "▁" can appear as its OWN
   preceded this piece"    token too, when nothing merged it
                          into a neighboring word-start piece
```

Because the space is just another character in the stream rather than a
boundary that pre-tokenization enforces, the exact same underlying
algorithm — BPE or, more commonly, a different technique called
**Unigram language model tokenization** (module 06) — can be applied
uniformly to English, Chinese, or anything else, with no
language-specific whitespace assumption baked in anywhere.

### The "lossless" claim, and the nuance verified below

SentencePiece is frequently described as fully reversible: because
spaces are literal characters in the stream (via `▁`) rather than
discarded during pre-tokenization, `decode(encode(text))` should recover
`text` exactly, unlike a whitespace-splitting pre-tokenizer, which
discards information about *how many* spaces were between two words.

This is **true relative to SentencePiece's own default text
normalization** — and false relative to your original raw input,
because that default normalization (NFKC normalization, collapsing
repeated whitespace) runs *before* encoding, and there is no way to
recover what it discarded. Exercise 4 reproduces this precisely: normal
single-spaced text round-trips perfectly; text with irregular spacing
does not, because the extra spaces were normalized away before the
model ever saw them.

## Reference

| Term | Means |
|---|---|
| WordPiece | Sub-word tokenization scoring merges by likelihood ratio, not raw frequency |
| `##` prefix | WordPiece's marker for a piece that continues a word |
| Greedy longest-match-first | WordPiece's encoding strategy — not merge replay like BPE |
| Whole-word `[UNK]` | WordPiece's failure mode when no continuation piece matches partway through a word |
| SentencePiece | A tokenization *framework* that skips whitespace pre-tokenization entirely |
| `▁` (U+2581) | SentencePiece's literal marker for a space in the token stream |
| Unigram LM tokenization | The probabilistic alternative to BPE-style merging, often paired with SentencePiece (module 06) |

| Task | Code |
|---|---|
| Train WordPiece | `tokenizers.trainers.WordPieceTrainer(vocab_size=...)` |
| Train SentencePiece | `sentencepiece.SentencePieceTrainer.train(input=..., model_type="unigram")` |
| Load a trained SentencePiece model | `sentencepiece.SentencePieceProcessor(model_file=...)` |
| Encode to piece strings | `sp.encode(text, out_type=str)` |
| Encode to ids | `sp.encode(text, out_type=int)` |
| Decode ids back to text | `sp.decode(ids)` |

## Hands-on exercises

Install once: `pip install tokenizers sentencepiece`

### 1. Train real WordPiece and BPE on the same corpus, side by side

```python
from tokenizers import Tokenizer
from tokenizers.models import WordPiece, BPE
from tokenizers.trainers import WordPieceTrainer, BpeTrainer
from tokenizers.pre_tokenizers import Whitespace

corpus = [
    "the quick brown fox jumps over the lazy dog",
    "tokenization tokenizer tokenized tokenizing tokens",
    "lower lowest lowered lowering slower slowest",
    "the dog runs the fox runs the dog barks",
] * 30

wp = Tokenizer(WordPiece(unk_token="[UNK]"))
wp.pre_tokenizer = Whitespace()
wp.train_from_iterator(corpus, WordPieceTrainer(vocab_size=120, special_tokens=["[UNK]"]))

bpe = Tokenizer(BPE(unk_token="[UNK]"))
bpe.pre_tokenizer = Whitespace()
bpe.train_from_iterator(corpus, BpeTrainer(vocab_size=120, special_tokens=["[UNK]"]))

for w in ["tokenization", "lowering"]:
    print("WordPiece:", w, "->", wp.encode(w).tokens)
    print("BPE:      ", w, "->", bpe.encode(w).tokens)
```

Confirm `##`-prefixed pieces appear in the WordPiece output but never in
the BPE output.

### 2. Reproduce WordPiece's whole-word `[UNK]` failure

```python
word = "unbelievable"    # never appeared in the training corpus above
print("WordPiece:", wp.encode(word).tokens)
print("BPE:      ", bpe.encode(word).tokens)
```

You should see WordPiece produce a single `['[UNK]']` for the *entire*
word, while BPE falls back to individual characters and still
represents it. Now inspect *why*:

```python
vocab = wp.get_vocab()
for ch in "unbelievable":
    print(f"{ch!r}: standalone={ch in vocab}  continuation(##{ch})={'##'+ch in vocab}")
```

Find the first character in the word whose `##`-prefixed continuation
form is missing from the vocabulary — that's the exact point WordPiece's
greedy scan dies, taking the whole word down with it.

### 3. Compute the WordPiece scoring formula by hand

Given these made-up counts:

```python
def bpe_score(count_pair, count_left, count_right):
    return count_pair

def wordpiece_score(count_pair, count_left, count_right):
    return count_pair / (count_left * count_right)

pair_A = dict(count_pair=100, count_left=1000, count_right=1000)   # "t","h"
pair_B = dict(count_pair=20,  count_left=20,   count_right=20)     # "z","q"

print("BPE would merge:      ",
      "A" if bpe_score(**pair_A) > bpe_score(**pair_B) else "B")
print("WordPiece would merge:",
      "A" if wordpiece_score(**pair_A) > wordpiece_score(**pair_B) else "B")
```

Confirm the two algorithms choose differently on this input, and explain
in one sentence *why* — referring to what "individually rare but always
together" means as evidence of a real unit.

### 4. Train SentencePiece and test the "lossless" claim directly

```python
import sentencepiece as spm
import tempfile, os

corpus_text = ("""the quick brown fox jumps over the lazy dog
tokenization tokenizer tokenized tokenizing tokens
lower lowest lowered lowering slower slowest
the dog runs the fox runs the dog barks
""" * 50)

with tempfile.TemporaryDirectory() as d:
    path = os.path.join(d, "corpus.txt")
    open(path, "w", encoding="utf-8").write(corpus_text)
    prefix = os.path.join(d, "sp")
    spm.SentencePieceTrainer.train(
        input=path, model_prefix=prefix, vocab_size=48, model_type="unigram")
    sp = spm.SentencePieceProcessor(model_file=prefix + ".model")

    for text in ["tokenization is fascinating", "  double  spaced   text"]:
        ids = sp.encode(text, out_type=int)
        pieces = sp.encode(text, out_type=str)
        back = sp.decode(ids)
        print(f"{text!r}")
        print(f"  pieces: {pieces}")
        print(f"  round-trips exactly? {back == text}   decoded: {back!r}")
```

Run it. The single-spaced sentence round-trips exactly; the irregularly
spaced one does **not** — confirm this yourself rather than taking the
module's word for it. Explain in one sentence what happened to the extra
spaces, and at which stage (hint: it's not the tokenizer's merge
algorithm — it's a preprocessing step that runs before encoding even
starts).

### 5. Diagnose and fix: "just use SentencePiece, it's lossless"

A teammate is building a code-formatting tool that must preserve exact
whitespace (indentation, blank lines) and proposes SentencePiece because
"it's fully reversible, unlike BPE." Given exercise 4's result, what's
wrong with that plan, and what would you actually need to check before
trusting it for this use case?

<details><summary>Answer</summary>

SentencePiece's reversibility is real relative to its own default
*normalized* input, not the original raw text — its default
normalization rule (`nmt_nfkc`) collapses repeated whitespace before
encoding ever sees it, exactly as exercise 4 demonstrated. For a
code-formatting tool, where two spaces of indentation and four spaces
are semantically different, this default would silently corrupt the
input.

Before trusting it: check what normalization rule the specific
tokenizer was trained with (`sp.encode` behavior depends on the model
file, not just the library), and if you need byte-exact preservation,
either train with `normalization_rule_name="identity"` (SentencePiece
does support disabling normalization) or don't rely on tokenizer-level
reversibility at all — keep the original text alongside the token
stream and only use tokenization for what the model needs to see, never
as your source of truth for the exact original bytes.
</details>

## Independent challenge

Train all three tokenizers you now have working code for — BPE,
WordPiece, and SentencePiece — on the identical corpus (use something
larger and more realistic than the toy one above; a few pages of mixed
prose and code works well) at the same vocabulary size. For each,
report:

1. Total token count on a shared held-out test sentence.
2. Whether any word in your test sentence produced an `[UNK]` (WordPiece)
   or fell back to fragments (BPE/SentencePiece).
3. What each tokenizer does with a string containing no spaces at all —
   construct one by removing all spaces from a sentence (a crude stand-in
   for a language like Chinese) and compare all three token counts and
   outputs.

Write a short paragraph on which tokenizer you'd choose for a
multilingual product covering English and at least one space-free
script, and why — grounded in what you actually observed in step 3, not
in the general reputation of either algorithm.

## Common mistakes & troubleshooting

- **Assuming all sub-word tokenizers work like BPE.** WordPiece's
  encoding algorithm (greedy longest-match) and failure mode (whole-word
  `[UNK]`) are genuinely different mechanisms, not a relabeling of BPE.
- **Trusting "SentencePiece is lossless" without checking the
  normalization settings.** True by default only relative to its own
  normalized input (exercise 4); a use case needing byte-exact
  round-trips must verify this explicitly.
- **Assuming WordPiece always has a character-level fallback.** Unlike
  byte-level BPE, a WordPiece vocabulary can lack a needed `##`
  continuation piece entirely, failing the whole word (exercise 2).
- **Treating "no spaces" scripts the same as English.** A
  whitespace-based pre-tokenizer (the default for BPE/WordPiece in most
  libraries) does nothing useful on Chinese/Japanese/Thai text — this is
  SentencePiece's actual reason for existing, not a marginal feature.
- **Confusing SentencePiece with a merge algorithm.** It's a
  preprocessing/framework choice (no whitespace pre-tokenization) that
  can run either BPE or Unigram LM (module 06) underneath — "SentencePiece"
  and "BPE" are not mutually exclusive terms.

## Checkpoint quiz

1. State the scoring formula difference between BPE and WordPiece.
2. Why can WordPiece fail an entire word to `[UNK]`, when byte-level BPE
   never can?
3. What problem does SentencePiece actually solve, and for which
   languages does it matter most?
4. What does the `▁` symbol represent?
5. Is SentencePiece's "lossless" reputation true unconditionally? What's
   the actual caveat?
6. Is SentencePiece a merge algorithm, competing with BPE? Why or why
   not?

<details><summary>Answers</summary>

1. BPE merges the pair with the highest raw frequency; WordPiece merges
   the pair maximizing `count(pair) / (count(left) * count(right))` — a
   likelihood ratio favoring pairs whose parts are individually rare but
   reliably co-occur.
2. WordPiece's greedy longest-match-first encoding requires a valid
   `##`-prefixed continuation piece at every step after the first; if
   none exists in the vocabulary at some point in the word, the entire
   word becomes `[UNK]`. Byte-level BPE's base alphabet is all 256 byte
   values, so it always has a smaller valid piece to fall back to and
   can never hit this dead end.
3. It removes the assumption that whitespace marks word boundaries,
   which BPE and WordPiece's typical whitespace pre-tokenizers both
   depend on. It matters most for languages without spaces between
   words — Chinese, Japanese, Thai — where that assumption is simply
   false.
4. A literal space character in the token stream — SentencePiece treats
   spaces as ordinary characters to be tokenized, rather than boundaries
   consumed and discarded by pre-tokenization.
5. No — it's true relative to SentencePiece's own default text
   normalization, which by default collapses repeated whitespace before
   encoding. Text with irregular spacing does not round-trip to its
   original raw form, only to the normalized version.
6. No — it's a preprocessing/framework choice (skip whitespace
   pre-tokenization, treat spaces as literal characters) that can run
   either BPE-style merging or Unigram LM tokenization (module 06)
   underneath. The terms describe different layers of the system.
</details>

## Further reading & sources

- [Japanese and Korean Voice Search (Schuster & Nakajima, 2012)](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/37842.pdf) - the original WordPiece paper; the likelihood-ratio scoring formula is described in section 2.2.
- [BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805) - the model that made WordPiece widely known; appendix A.2 covers its tokenizer specifically.
- [SentencePiece: A simple and language independent subword tokenizer (Kudo & Richardson, 2018)](https://arxiv.org/abs/1808.06226) - the SentencePiece paper, explicit about the whitespace-independence motivation this module is built around.
- [Hugging Face NLP Course, Chapter 6: WordPiece tokenization](https://huggingface.co/learn/nlp-course/chapter6/6) - documents the exact scoring formula this module uses, with a from-scratch Python implementation to compare against your own.
- [Hugging Face NLP Course, Chapter 6: Building a tokenizer, block by block](https://huggingface.co/learn/nlp-course/chapter6/8) - covers the `tokenizers` library API used in the exercises here, including WordPiece and Unigram model training.
- [google/sentencepiece (GitHub)](https://github.com/google/sentencepiece) - the reference implementation used in exercise 4; its README documents the normalization rules referenced in exercise 5.
- [Subword Regularization (Kudo, 2018)](https://arxiv.org/abs/1804.10959) - introduces the Unigram LM algorithm SentencePiece most commonly pairs with, previewed here and covered fully in module 06.

## Next

[Module 06: Unigram Language Model Tokenization](../06-unigram-language-model-tokenization/README.md)
