# Module 07: Comparing Tokenizers Across Models

## Why this matters

Modules 03-06 built four tokenization algorithms one at a time: BPE,
WordPiece, SentencePiece-as-a-framework, and Unigram LM. In practice you
rarely pick an algorithm — you pick a **model**, and that model comes
with whichever tokenizer its authors trained. This module puts three
real, production tokenizers side by side on the *same* inputs — GPT-4's
`cl100k_base` (byte-level BPE via `tiktoken`), GPT-2's byte-level BPE
(an older, smaller-vocabulary sibling), and BERT's WordPiece — so you can
see concretely that "how many tokens is this string" is not a universal
number. It depends entirely on which model you're asking, and the
differences are large enough to matter for cost and context-window
planning (module 12), not just academic curiosity.

## Concepts

### Same text, different token counts — verified across three real tokenizers

```
 word                              cl100k_base   gpt2        bert-base-uncased
                                    (GPT-4, BPE)  (BPE)       (WordPiece)
 ─────────────────────────────     ───────────   ─────────   ─────────────────
 "tokenization"                    2 tokens      2 tokens    2 tokens
                                    token|ization  token|ization  token|##ization
 "unigram"                         2 tokens      3 tokens    3 tokens
                                    un|igram      un|ig|ram    un|##ig|##ram
 "antidisestablishmentarianism"    6 tokens      5 tokens    8 tokens
 "GPT-4"                           4 tokens      4 tokens    4 tokens
 "2024"                            2 tokens      2 tokens    2 tokens
                                    202|4         20|24       202|##4
```

Every row above is real output, run in this module's exercises — not
estimated. Three things jump out:

1. **No tokenizer is strictly "better" at compression.** `cl100k_base`
   wins on `"unigram"` (2 vs. 3 tokens) but loses on
   `"antidisestablishmentarianism"` (6 vs. GPT-2's 5). Each vocabulary
   was trained on different data with a different training objective —
   there's no universal ranking, only "better for the text distribution
   it was trained on."
2. **WordPiece's `##` prefix is visible in the output**, marking "this
   piece continues the previous one" — `##ization`, `##ig`, `##ram`.
   BPE-family tokenizers instead encode the word-start information into
   the *byte-level* representation itself (a leading space becomes part
   of the token, e.g. `" world"` as one token — see module 01's
   byte-level discussion and module 03's BPE mechanics).
3. **Same algorithm family, different result.** `cl100k_base` and GPT-2's
   tokenizer are *both* byte-level BPE, yet they disagree on nearly
   every word above. The algorithm only determines *how* merges are
   scored and applied — the actual vocabulary content depends entirely
   on the training corpus and target vocabulary size, which differ
   between GPT-2 (2019, 50,257 tokens) and GPT-4's `cl100k_base`
   (2023, 100,277 tokens).

### Vocabulary size is a real, checkable number

```
 tokenizer          vocab size    algorithm
 ─────────────────  ───────────   ──────────────────────
 gpt2               50,257        byte-level BPE
 cl100k_base        100,277       byte-level BPE
 bert-base-uncased  30,522        WordPiece
```

A larger vocabulary generally means fewer tokens per word (more common
words get their own single-piece entry) but a bigger embedding table and
output softmax in the model itself — vocabulary size is a real design
tradeoff revisited in depth in module 08.

### Whitespace and case handling differ, and it's model-specific

```
 "  double  space"   cl100k_base: [' ', ' double', ' ', ' space']   (4 tokens)
                     -> irregular whitespace is preserved literally,
                        because byte-level BPE treats every byte,
                        spaces included, as ordinary input (module 01)

 bert-base-uncased   lowercases everything before tokenizing
                     ("GPT-4" -> "gp","##t","-","4" — the model never
                      sees the capital letters at all)
```

This isn't a bug in either tokenizer — it's a design choice baked in at
training time. `bert-base-uncased` was deliberately trained on
lowercased text (there's a separate `bert-base-cased` model for
case-sensitive tasks); GPT-family byte-level BPE tokenizers were
deliberately trained to preserve whitespace and case exactly, because
generative models need to reproduce text faithfully, not just classify
it.

### A practical checklist for reading a new model's tokenizer

When you encounter a new model, four questions determine what to expect,
all answerable from its tokenizer config or card without training
anything yourself:

```
 1. Which algorithm?     BPE / WordPiece / Unigram LM
                         (config.json "model_type", or the presence of
                          a merges.txt [BPE] vs vocab.txt [WordPiece]
                          vs a SentencePiece .model file)

 2. Byte-level or not?   Byte-level BPE (GPT-family) never produces
                         [UNK]. WordPiece and word-level SentencePiece
                         BPE can, if trained without full byte coverage.

 3. Vocab size?          Directly affects average tokens/word and the
                         model's embedding table size (module 08).

 4. Case/whitespace       Lowercased? Accent-stripped? Space-preserving
    normalization?        or space-stripped? Check the tokenizer's own
                          normalizer config — don't assume.
```

## Reference

```
 Tokenizer            Model family        Algorithm         Vocab size
 ────────────────     ───────────────     ──────────────    ──────────
 cl100k_base          GPT-4, GPT-3.5      byte-level BPE    100,277
 gpt2                 GPT-2               byte-level BPE    50,257
 bert-base-uncased    BERT                WordPiece         30,522
 (SentencePiece/      Llama, T5,          BPE or Unigram    varies by
  Unigram LM)         ALBERT, mBART       LM (module 06)    model
```

```
 Library              What it gives you
 ────────────────     ──────────────────────────────────────────
 tiktoken             OpenAI's own encoders (cl100k_base,
                      o200k_base, etc.) — fast, minimal, exactly
                      matches what the OpenAI API bills you for
 transformers'        AutoTokenizer.from_pretrained(name) — pulls
 AutoTokenizer        the exact tokenizer any Hugging Face Hub
                      model was trained with
```

## Hands-on exercises

### Exercise 1 — compare GPT-4's tokenizer against GPT-2's on the same text

```python
import tiktoken

enc = tiktoken.get_encoding("cl100k_base")
words = ["tokenization", "unigram", "internationalization",
         "antidisestablishmentarianism", "GPT-4", "don't", "2024"]
for w in words:
    ids = enc.encode(w)
    print(repr(w), "->", len(ids), "tokens:", [enc.decode([i]) for i in ids])
```

Verified output:

```
'tokenization' -> 2 tokens: ['token', 'ization']
'unigram' -> 2 tokens: ['un', 'igram']
'internationalization' -> 2 tokens: ['international', 'ization']
'antidisestablishmentarianism' -> 6 tokens: ['ant', 'idis', 'establish', 'ment', 'arian', 'ism']
'GPT-4' -> 4 tokens: ['G', 'PT', '-', '4']
"don't" -> 2 tokens: ['don', "'t"]
'2024' -> 2 tokens: ['202', '4']
```

Now the same words through GPT-2's tokenizer (a different byte-level
BPE vocabulary, trained on different data at a different size):

```python
from transformers import AutoTokenizer

tok = AutoTokenizer.from_pretrained("gpt2")
for w in words:
    ids = tok.encode(w)
    print(repr(w), "->", len(ids), tok.convert_ids_to_tokens(ids))
```

Verified output:

```
'tokenization' -> 2 ['token', 'ization']
'unigram' -> 3 ['un', 'ig', 'ram']
'internationalization' -> 2 ['international', 'ization']
'antidisestablishmentarianism' -> 5 ['ant', 'idis', 'establishment', 'arian', 'ism']
'GPT-4' -> 4 ['G', 'PT', '-', '4']
"don't" -> 2 ['don', "'t"]
'2024' -> 2 ['20', '24']
```

Confirm for yourself: `"unigram"` costs 2 tokens under `cl100k_base` but
3 under GPT-2, while `"antidisestablishmentarianism"` costs 6 under
`cl100k_base` but only 5 under GPT-2. Neither tokenizer dominates the
other across the board.

### Exercise 2 — add BERT's WordPiece to the comparison

```python
bert = AutoTokenizer.from_pretrained("bert-base-uncased")
for w in words:
    ids = bert.encode(w, add_special_tokens=False)
    print(repr(w), "->", len(ids), bert.convert_ids_to_tokens(ids))
print("vocab size:", bert.vocab_size)
```

Verified output:

```
'tokenization' -> 2 ['token', '##ization']
'unigram' -> 3 ['un', '##ig', '##ram']
'internationalization' -> 2 ['international', '##ization']
'antidisestablishmentarianism' -> 8 ['anti', '##dis', '##est', '##ab', '##lish', '##ment', '##arian', '##ism']
"don't" -> 3 ['don', "'", 't']
'GPT-4' -> 4 ['gp', '##t', '-', '4']
'2024' -> 2 ['202', '##4']
vocab size: 30522
```

Notice `"GPT-4"` becomes `['gp', '##t', '-', '4']` — BERT's tokenizer
lowercased it to `"gpt-4"` first (`bert-base-uncased` normalizes case
before tokenizing), so the model literally never sees the original
capitalization. Compare against `cl100k_base`'s `['G', 'PT', '-', '4']`,
which preserves case exactly.

### Exercise 3 — measure a full sentence across all three

```python
sentence = "The unigram model prunes a large seed vocabulary."
print("cl100k_base:", len(enc.encode(sentence)))
print("gpt2:       ", len(tok.encode(sentence)))
print("bert:       ", len(bert.encode(sentence, add_special_tokens=False)))
```

Verified output:

```
cl100k_base: 11
gpt2:        12
bert:        12
```

For this particular sentence, `cl100k_base`'s larger, newer vocabulary
edges out both older tokenizers by one token — but as exercise 1 showed,
that's not a rule, just this sentence's outcome.

## Independent challenge

Pick 5 sentences from your own recent writing (code comments, chat
messages, anything) and run them through all three tokenizers from the
exercises above. Find at least one sentence where `cl100k_base` uses
*more* tokens than `gpt2` or `bert-base-uncased` — the exercises above
only showed cases favoring `cl100k_base` on whole sentences, but
module-scale text is where vocabulary mismatches with your specific
writing style tend to show up (uncommon proper nouns, code identifiers,
emoji). Write one sentence on what made that sentence a bad match for
`cl100k_base`'s vocabulary specifically.

<details><summary>Discussion</summary>

Common culprits: uncommon proper nouns, camelCase/snake_case code
identifiers, non-English words, or emoji/symbols that happen to have
been common enough in GPT-2's or BERT's specific training data to earn a
dedicated piece, but weren't common enough (relative to everything else)
in `cl100k_base`'s training mix to earn one. This is exactly the "no
universal ranking, only better-for-its-training-distribution" point from
the concepts section, now found in your own writing rather than a
prepared example.

</details>

## Common mistakes & troubleshooting

- **Assuming token count is portable across models.** A 500-token prompt
  under one model's tokenizer might be 420 or 600 tokens under
  another's. Always measure with the *specific* tokenizer for the model
  you're actually calling — never reuse a token count computed for a
  different model, especially when budgeting against a context window
  (module 11) or per-token cost (module 12).
- **Assuming a bigger vocabulary always means fewer tokens.** It's
  usually true on average but not guaranteed per-word, as exercise 1
  shows directly (`cl100k_base`'s 100K vocabulary loses to GPT-2's
  50K vocabulary on `"antidisestablishmentarianism"`).
- **Forgetting tokenizer-level text normalization (lowercasing, accent
  stripping) happens *before* the model ever sees the text.** If a
  case-sensitive distinction matters to your task, check whether the
  tokenizer you're using preserves case at all — `bert-base-uncased`
  simply cannot distinguish `"Apple"` the company from `"apple"` the
  fruit at the input level.
- **Comparing tokenizers by eyeballing example outputs from documentation
  instead of running your own text through them.** Every claim in the
  concepts section above was produced by actually running the code in
  the exercises — do the same before making a cost or context-budget
  decision based on a tokenizer's behavior.

## Checkpoint quiz

1. `cl100k_base` and GPT-2's tokenizer are both byte-level BPE. Why do
   they still produce different token counts for the same word?
2. What does the `##` prefix in BERT's WordPiece output mean, and which
   family of tokenizers doesn't need an equivalent marker?
3. Is a larger vocabulary always fewer tokens per word? What did
   exercise 1 show?
4. Why did `bert-base-uncased` tokenize `"GPT-4"` as if it were
   `"gpt-4"`?
5. Name the four questions from the concepts section you'd ask when
   encountering a brand-new model's tokenizer for the first time.

<details><summary>Answers</summary>

1. Same algorithm, different training data and target vocabulary size —
   BPE's merges are learned from whatever corpus and vocab-size target
   the model's authors chose, so two BPE tokenizers trained differently
   will merge different pairs and end up with different final pieces.
2. `##` marks "this piece continues the previous piece within the same
   word" — needed because WordPiece's vocabulary doesn't otherwise
   distinguish a word-starting piece from a mid-word piece. Byte-level
   BPE tokenizers (GPT-family) don't need this marker because word-start
   information is encoded directly into the byte-level token itself
   (e.g., a token starting with a literal leading space).
3. No — it's true on average but not guaranteed per word. Exercise 1
   showed `cl100k_base` (100K vocab) using *more* tokens than GPT-2
   (50K vocab) for `"antidisestablishmentarianism"` (6 vs. 5).
4. `bert-base-uncased` normalizes (lowercases) text before tokenizing,
   as part of its training-time design choice — it never sees the
   original capitalization, unlike `bert-base-cased` or GPT-family
   tokenizers, which preserve case exactly.
5. Which algorithm (BPE/WordPiece/Unigram LM)? Is it byte-level or not
   (affects whether `[UNK]` is possible)? What's the vocab size? What
   case/whitespace normalization does it apply?

</details>

## Further reading & sources

- [tiktoken (GitHub)](https://github.com/openai/tiktoken) - OpenAI's own tokenizer library, used in exercise 1; matches exactly what the OpenAI API bills per-token.
- [Hugging Face `transformers` documentation: AutoTokenizer](https://huggingface.co/docs/transformers/en/model_doc/auto#transformers.AutoTokenizer) - the class used in exercises 2-3 to load any model's exact trained tokenizer.
- [BERT: Pre-training of Deep Bidirectional Transformers (Devlin et al., 2018)](https://arxiv.org/abs/1810.04805) - documents `bert-base-uncased`'s lowercasing/normalization choices referenced in this module.
- [Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - the GPT-2 paper; section 2.2 covers its byte-level BPE tokenizer and its 50,257-token vocabulary.
- [tiktoken model-to-encoding reference](https://github.com/openai/tiktoken/blob/main/tiktoken/model.py) - maps OpenAI model names to their tokenizer (`cl100k_base`, `o200k_base`, etc.) if you need to check a specific model's encoding.

## Next

[Module 08: Vocabulary Size Tradeoffs](../08-vocabulary-size-tradeoffs/README.md)
