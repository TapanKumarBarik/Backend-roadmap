# Module 02: Why Not Characters, Why Not Words

## Why this matters

Module 01 established that text is really a stream of bytes. Module 03
will introduce BPE, the algorithm real tokenizers use to group those
bytes into tokens. Between the two sits an obvious question this module
answers properly: **why group them at all?** Why not just feed the model
individual characters, or go the other direction and use whole words?

This isn't a throat-clearing exercise — both of those simpler options
were tried, extensively, and both lose to sub-word tokenization for
specific, quantifiable reasons. Knowing those reasons is what makes BPE's
design in module 03 feel inevitable rather than arbitrary, and it's also
directly useful: you'll recognize "why not just split on spaces" as a
question with a real, measured answer the next time someone proposes it.

## Concepts

### Option 1: character-level tokenization

Every character (or, more precisely after module 01, every byte) is its
own token. Vocabulary size: maybe 256 (one per byte value).

```
 "unbelievable" character-level:

 u  n  b  e  l  i  e  v  a  b  l  e
 │  │  │  │  │  │  │  │  │  │  │  │
 12 SEPARATE TOKENS for one word

 PRO: tiny vocabulary (~256), never an unknown token
 CON: sequences become very long
```

Why this loses: track 02 will show that a transformer's attention cost
grows quadratically with sequence length (`O(n²)`). Character-level
tokenization inflates sequence length by roughly 4-5x versus word-level
for English — turning a 500-word document into a ~2,500-token sequence
instead of ~650. That's not a minor inefficiency; it's a massive,
avoidable multiplier on the single most expensive part of the whole
architecture.

There's a second cost, more subtle: **the model has to do more work per
unit of meaning.** Predicting "u", then "n", then "b"... to spell
"unbelievable" spends many forward passes rediscovering a pattern (this
word's spelling) that a coarser unit could have captured in one step.

### Option 2: word-level tokenization

Split on whitespace and punctuation. One token per word.

```
 "unbelievable" word-level:  [unbelievable]     -- 1 token

 PRO: short sequences, each token carries real meaning
 CON: the vocabulary problem, below
```

This sounds strictly better until you meet the **out-of-vocabulary (OOV)
problem**. A word-level vocabulary is necessarily finite — you fix it at
training time, typically tens of thousands of entries. Any word not in
that set has no representation at all.

```
 vocabulary built from training data:
   the, cat, sat, run, running, walk, ...

 NEW WORD AT INFERENCE TIME:  "COVID-19"
   (didn't exist when a pre-2019 vocabulary was built)

     ┌───────────────────────────────────────┐
     │ WORD-LEVEL: no slot for it. Replaced   │
     │ with a single generic <UNK> token --   │
     │ ALL information about the word is LOST │
     └───────────────────────────────────────┘

 also unrepresentable this way: typos, made-up brand
 names, rare technical jargon, most non-English words,
 and anything coined after the vocabulary was frozen
```

The `<UNK>` (unknown) token is the crux of the failure. Once a word maps
to `<UNK>`, the model has literally no signal left about what that word
was — "COVID-19", "asdfghjkl", and "Kubernetes" (if none were in the
training vocabulary) become indistinguishable. This is not a rare edge
case; language constantly mints new words, and a word-level model goes
stale the day a term it never saw becomes common.

### The word-level vocabulary size problem, independent of OOV

Even ignoring `<UNK>`, word-level vocabularies are large and inefficient
in a specific way: English morphology means related words are separate,
unrelated-looking vocabulary slots.

```
 run, runs, running, ran, runner, runners, reruns, ...

 word-level: 7+ SEPARATE, unrelated vocabulary entries,
             each needing its own learned embedding,
             with NO shared representation between them

 (a sub-word tokenizer, module 03, would likely represent
  most of these as "run" + a small, REUSED suffix piece —
  one shared root, several cheap variations)
```

A word-level vocabulary large enough to cover a language's real
productivity (compounding, inflection, technical terminology) balloons
into the hundreds of thousands of entries — each one an extra row in the
model's embedding table and output layer, at real memory and compute
cost, for morphological variants that could have shared structure.

### The gap that sub-word tokenization fills

```
                    sequence length        vocabulary /
                    (cost: quadratic         OOV handling
                     attention, O(n^2))
                    ─────────────────      ─────────────────
 character-level     ✗ very long            ✓ perfect (~256
                        (12 tokens for          tokens, never
                        "unbelievable")         unknown)

 word-level           ✓ short                 ✗ broken on any
                        (1 token)                unseen word

 SUB-WORD (BPE)       between the two         between the two —
 (module 03)          — reuses common          common words are
                       long tokens for          1 token, RARE/NEW
                       frequent words           words gracefully
                                               split into known
                                               pieces, never <UNK>
```

The actual result, previewed from module 00: `"Tokenization"` split into
`Token` + `ization` — a real, frequent word (`Token`) stayed as one
token, and a productive suffix (`ization`, which also appears in
"organization", "realization", ...) became a *reusable* second token
instead of forcing the whole compound word into a brand-new vocabulary
slot or destroying it as `<UNK>`.

Crucially, this also solves the OOV problem outright: **because the
vocabulary includes individual bytes as a fallback (module 01), a
sub-word tokenizer can always fall back to spelling out any truly novel
string byte by byte.** There is no `<UNK>` token in a modern GPT-family
tokenizer, because there's no input it's structurally unable to
represent — only inputs it represents *less efficiently* than common
English text.

## Reference

| Approach | Vocabulary size | Sequence length | Handles unseen words |
|---|---|---|---|
| Character/byte-level | ~256 | Very long (~4-5x word count) | Perfectly — always representable |
| Word-level | 30,000-100,000s | Short | Broken — `<UNK>`, information lost |
| Sub-word (BPE, module 03) | 30,000-100,000+ | Moderate | Gracefully — falls back to smaller pieces or bytes |

| Term | Means |
|---|---|
| Out-of-vocabulary (OOV) | A word with no entry in a fixed vocabulary |
| `<UNK>` | The generic placeholder a word-level model substitutes for OOV input |
| Sub-word tokenization | Splitting text into pieces smaller than a word but larger than a character |
| Morphology | How words are built from roots, prefixes and suffixes |

## Hands-on exercises

Standard library only.

### 1. Measure the sequence-length gap yourself

```python
text = "Tokenization strategies fundamentally determine how efficiently a transformer processes language."

char_tokens = list(text.replace(" ", ""))   # rough character-level, ignoring spaces
word_tokens = text.split()

print(f"characters: {len(char_tokens)} tokens")
print(f"words:      {len(word_tokens)} tokens")
print(f"ratio:      {len(char_tokens)/len(word_tokens):.1f}x longer at character level")
```

Confirm the ratio is in the 4-6x range this module claims. Then connect
it to the `O(n²)` attention cost from track 02 module 05: if sequence
length goes up 5x, by what factor does attention's compute cost grow?

### 2. Build a tiny word-level tokenizer and break it

```python
vocab = {"the": 0, "cat": 1, "sat": 2, "on": 3, "mat": 4, "<UNK>": 5}

def tokenize(text, vocab):
    return [vocab.get(w, vocab["<UNK>"]) for w in text.lower().split()]

print(tokenize("the cat sat on the mat", vocab))          # all known
print(tokenize("the cat sat on the rug", vocab))           # "rug" is new
print(tokenize("the dog ran across the yard", vocab))      # mostly new
```

Look at the second and third outputs. Multiple *completely different*
unknown words all produce the identical `<UNK>` ID. Write one sentence on
what information is destroyed by this collision, and why a model
downstream cannot recover it.

### 3. Quantify morphological waste

```python
family = ["run", "runs", "running", "ran", "runner", "runners", "rerun", "reruns"]
print(f"{len(family)} distinct words, ALL sharing the root 'run'")
print(f"word-level: {len(family)} separate vocabulary slots, "
      f"{len(family)} separate embeddings to learn")

# a plausible sub-word split (illustrative, not real BPE output yet)
subword_guess = {
    "run": ["run"], "runs": ["run", "s"], "running": ["run", "ning"],
    "ran": ["ran"], "runner": ["run", "ner"], "runners": ["run", "ner", "s"],
    "rerun": ["re", "run"], "reruns": ["re", "run", "s"],
}
pieces = set()
for toks in subword_guess.values():
    pieces.update(toks)
print(f"sub-word: only {len(pieces)} distinct pieces needed: {sorted(pieces)}")
```

State in one sentence why fewer distinct pieces, reused across many
words, is a genuine efficiency win — not just a smaller number, but what
it means for how much the model has to *learn* about each piece.

### 4. Find real out-of-vocabulary casualties

Pick five words that plausibly didn't exist, or weren't common, before
2020 — brand names, slang, technical terms, or invented product names.
Using the toy `tokenize()` function from exercise 2 (extend `vocab` with
~30 common English words of your choice, but deliberately omit your five
test words), confirm all five collapse to the same `<UNK>` ID.

Then look up how a real BPE tokenizer (`tiktoken`, from module 00)
handles the same five words, and report what you find. This is the
concrete payoff of "no `<UNK>` token" — write one sentence on the
difference.

### 5. Diagnose and fix: a translation system stuck in 2018

A team maintains a word-level machine translation system. Every few
months, translation quality visibly degrades on customer text, and the
fix has always been "retrain with an updated vocabulary." They ask why
this keeps happening and whether it's avoidable.

<details><summary>Answer</summary>

A word-level vocabulary is frozen at training time. Language doesn't
freeze — new product names, slang, technical terms and borrowed foreign
words enter customer text continuously, and every one of them becomes
`<UNK>` the moment it appears, with all its information destroyed before
translation even starts. "Retrain periodically" is a real but expensive
and always-lagging patch on a structural limitation, not a fix.

The avoidable part: a sub-word tokenizer (module 03) degrades gracefully
instead of catastrophically. A brand-new word isn't in the vocabulary as
a *whole word*, but it can almost always be spelled from known sub-word
pieces or, worst case, individual bytes (module 01) — never collapsing
to a single meaningless placeholder. Migrating the vocabulary layer to a
sub-word tokenizer removes the recurring retrain-for-vocabulary cycle
entirely; the model still benefits from further training, but not merely
to patch missing words.
</details>

## Independent challenge

Take a real corpus (a few pages of any text — code, prose, or a mix) and
build both a character-level and a naive word-level tokenizer over it
(using Python's `str.split()` is fine for the word-level one). For each:

1. Report total token count and vocabulary size.
2. Simulate the OOV problem: hold out 20% of the text as a "test set" not
   seen when building the word-level vocabulary, then measure what
   fraction of test-set words are OOV.
3. Compute the sequence-length ratio between the two approaches on the
   same text.

Write a short paragraph stating, in your own words and using your own
numbers, why sub-word tokenization exists as a compromise between them —
you should be able to derive module 03's motivation entirely from your
own measurements.

## Common mistakes & troubleshooting

- **Assuming "split on whitespace" is a reasonable tokenizer.** It breaks
  on any word not seen during vocabulary construction, silently and
  totally (exercise 2).
- **Underestimating the sequence-length cost of character-level
  tokenization.** It's not a minor inefficiency — combined with `O(n²)`
  attention, a 5x longer sequence can mean a ~25x higher attention cost.
- **Believing a bigger word-level vocabulary solves OOV.** It only delays
  it — language keeps producing new words faster than any fixed list can
  be updated (exercise 5).
- **Not recognizing morphological waste.** Treating "run", "runs" and
  "running" as three unrelated vocabulary slots wastes both vocabulary
  space and the model's ability to share what it learns about "run"
  across all its forms.

## Checkpoint quiz

1. Name the two costs of character-level tokenization.
2. What is the out-of-vocabulary problem, and why is `<UNK>` a
   destructive fix rather than a real one?
3. Why does a word-level vocabulary grow so large for a morphologically
   rich language, even ignoring OOV entirely?
4. Why can a sub-word tokenizer never produce an `<UNK>` token?
5. In one sentence, state where sub-word tokenization sits between the
   character-level and word-level extremes.

<details><summary>Answers</summary>

1. Sequence length inflates roughly 4-5x, which multiplies badly against
   attention's `O(n²)` cost; and the model spends capacity rediscovering
   spelling patterns rather than working at the level where meaning
   lives.
2. A fixed word-level vocabulary has no slot for any word it wasn't built
   with; such words are replaced by a single generic `<UNK>` token. It's
   destructive because many different unknown words all collapse to the
   identical ID, so all information distinguishing them is lost.
3. Morphological variants (run/runs/running/ran/runner...) each need
   their own vocabulary slot and embedding, even though they share an
   obvious root — nothing is reused between related word forms.
4. Because its vocabulary includes individual bytes as an ultimate
   fallback (module 01) — any string, however novel, can always be
   spelled out byte by byte if no larger known piece matches.
5. It's a middle ground: sequences are shorter than character-level
   (common words stay as one or few tokens) while still handling unseen
   words gracefully like character-level does, by falling back to
   smaller known pieces instead of a fixed word list.
</details>

## Further reading & sources

- [Neural Machine Translation of Rare Words with Subword Units (Sennrich et al., 2016)](https://arxiv.org/abs/1508.07909) - the paper that brought byte-pair encoding into NLP specifically to solve the OOV problem this module describes; read before module 03.
- [Hugging Face: Summary of the tokenizers](https://huggingface.co/docs/transformers/tokenizer_summary) - a clear side-by-side of word-level, character-level and sub-word approaches with the same tradeoffs framed slightly differently.
- [Google's Neural Machine Translation System (Wu et al., 2016)](https://arxiv.org/abs/1609.08144) - section 4 documents Google Translate's own move away from word-level vocabularies for exactly the OOV reasons in this module, at production scale.
- [Character-Level Language Modeling with Deeper Self-Attention (Al-Rfou et al., 2018)](https://arxiv.org/abs/1808.04444) - a serious attempt at pure character-level transformer language modeling; useful for seeing the sequence-length cost taken to its logical extreme.
- [tiktoken (GitHub)](https://github.com/openai/tiktoken) - confirms hands-on in exercise 4 that a real production tokenizer never emits an `<UNK>`-equivalent.

## Next

[Module 03: Byte-Pair Encoding Explained](../03-byte-pair-encoding-explained/README.md)
