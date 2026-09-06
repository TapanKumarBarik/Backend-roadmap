# Module 04: Building a BPE Tokenizer From Scratch

## Why this matters

Module 03 traced BPE by hand on three words. This module builds the real
thing: a working `train()` / `encode()` / `decode()` implementation that
operates on raw UTF-8 bytes (module 01) — the same shape as `tiktoken`,
just without its speed optimizations — and round-trips *any* text
correctly, including languages and emoji it never saw during training.

There is one specific, easy-to-miss bug this module is built around,
because it's the single most common mistake when people implement BPE
for the first time: **encoding must apply merges in the order they were
*learned* during training, never by which pair happens to be most
frequent in the specific text you're encoding right now.** These sound
like they'd usually give the same answer — and on plain text, they often
do — but they can silently diverge, and you're about to construct the
exact input that makes them diverge and see it happen.

## Concepts

### From word-tuples to one continuous byte stream

Module 03's toy version tokenized each word as a separate tuple with a
`</w>` boundary marker. A real tokenizer is simpler in one way and
subtler in another: it treats the **entire input as one flat sequence of
byte values (0-255)** — no per-word structure at all.

```
 module 03's toy version:            a real byte-level tokenizer:

 ("l","o","w","</w>")                text.encode("utf-8")
 ("l","o","w","e","r","</w>")        -> [108, 111, 119, 32, 108, 111,
                                          119, 101, 114, ...]
 ─────────────────────               ────────────────────────────────
 words kept separate,                ONE list of integers, spaces and
 boundary marked explicitly          punctuation are just bytes too --
                                      nothing structurally marks a
                                      "word boundary"; merges can and do
                                      span across whitespace in some
                                      implementations (real ones add a
                                      regex pre-split step to prevent
                                      unwanted merges across word
                                      boundaries -- module 03's `</w>`
                                      was a simplified stand-in for
                                      that; skipped here to keep the
                                      core algorithm visible)
```

Skipping the boundary-marking complexity is deliberate: it lets this
module focus entirely on the part that's easy to get subtly wrong —
encoding — without the extra machinery real production tokenizers layer
on top (covered where it matters in modules 05-06).

### Training: identical to module 03, just over bytes

```
 train(text, num_merges):
   ids = list(text.encode("utf-8"))          # start: one token per BYTE
   vocab = {i: bytes([i]) for i in range(256)}   # base alphabet: 256 bytes
   merges = {}                                # (pair) -> new_id, IN LEARN ORDER

   repeat num_merges times:
     count every adjacent pair in ids
     pick the MOST FREQUENT pair
     assign it the next available id (256, 257, 258, ...)
     replace every occurrence in ids with that new id
     record merges[pair] = new_id, in the order discovered
```

Nothing new here versus module 03 — only the starting alphabet changed,
from characters to bytes.

### Encoding: the part that has to use rank, not local frequency

This is the step people get wrong. The training loop above picked merges
by **global frequency across the whole training corpus.** But when
you're encoding a brand-new, possibly very short piece of text, that
text's own local pair frequencies have **nothing to do with** which
merge should apply first — what matters is which merge was learned
*earliest* during training, because `merges` is an *ordered* recipe
(module 03), and the tokenizer must replay it in that order.

```
 CORRECT encode():
   ids = list(text.encode("utf-8"))
   while at least 2 tokens remain:
     find every adjacent pair currently present
     of those, pick the one with the LOWEST merge rank
       (i.e. the one that was LEARNED FIRST during training --
        merges dict maps pair -> its assigned id, and lower ids
        were assigned earlier, so this is just "smallest id")
     if NONE of the present pairs are in merges: stop, done
     apply that one merge, then re-scan

 BUGGY encode() -- the mistake:
   ids = list(text.encode("utf-8"))
   while there are mergeable pairs present:
     find every adjacent pair currently present
     of the ones that ARE valid merges, pick whichever is
       MOST FREQUENT IN THIS TEXT right now
     apply it, then re-scan

   this LOOKS reasonable and often gives the same answer --
   but it is measuring the WRONG frequency (local, not training-
   time-global), and it can silently produce a different,
   non-canonical tokenization. Exercise 6 constructs the exact
   case where this happens and shows you the divergence.
```

### Decoding: the easy direction

Decoding just reverses the vocabulary lookup and concatenates bytes:

```
 decode(ids, vocab):
   raw_bytes = concatenate vocab[id] for every id in ids
   return raw_bytes.decode("utf-8")
```

One practical wrinkle: if `ids` were sliced or truncated mid-stream
(module 00's truncation exercise), the resulting bytes might not be
valid UTF-8 at the cut point (module 01 exercise 5). Real
implementations decode with `errors="replace"` rather than raising, so a
truncated token stream degrades to one replacement character instead of
crashing outright.

## Reference

| Task | Code |
|---|---|
| Count adjacent pairs | `Counter(zip(ids, ids[1:]))` |
| Apply one merge across a sequence | replace every occurrence of the pair with the new id |
| Train | repeat: count pairs, merge the most frequent, record the rule |
| Encode | repeatedly merge the **lowest-rank** present pair, until none remain |
| Decode | look up each id's bytes, concatenate, UTF-8 decode |
| A real byte-level BPE reference | [`minbpe`](https://github.com/karpathy/minbpe) (Karpathy) |

## Hands-on exercises

Standard library only.

### 1. The training loop, over real bytes this time

```python
from collections import Counter

def get_stats(ids):
    return Counter(zip(ids, ids[1:]))

def merge(ids, pair, new_id):
    out, i = [], 0
    while i < len(ids):
        if i < len(ids) - 1 and (ids[i], ids[i+1]) == pair:
            out.append(new_id); i += 2
        else:
            out.append(ids[i]); i += 1
    return out

def train(text, num_merges):
    ids = list(text.encode("utf-8"))
    vocab = {i: bytes([i]) for i in range(256)}
    merges = {}
    for i in range(num_merges):
        stats = get_stats(ids)
        if not stats:
            break
        pair = max(stats, key=stats.get)
        new_id = 256 + i
        ids = merge(ids, pair, new_id)
        merges[pair] = new_id
        vocab[new_id] = vocab[pair[0]] + vocab[pair[1]]
    return merges, vocab

corpus = ("the quick brown fox jumps over the lazy dog. "
          "the dog barks. the fox runs. " * 30)
merges, vocab = train(corpus, num_merges=40)
print(f"{len(merges)} merges learned, vocab size {len(vocab)}")
print("first 5 merges:", list(merges.items())[:5])
```

### 2. Implement `encode`, correctly

```python
def encode(text, merges):
    ids = list(text.encode("utf-8"))
    while len(ids) >= 2:
        stats = get_stats(ids)
        # among pairs PRESENT right now, pick the one with the lowest
        # merge rank -- pairs not in `merges` get +inf and are never chosen
        pair = min(stats, key=lambda p: merges.get(p, float("inf")))
        if pair not in merges:
            break
        ids = merge(ids, pair, merges[pair])
    return ids

print(encode("the quick fox", merges))
```

### 3. Implement `decode`, and round-trip everything

```python
def decode(ids, vocab):
    b = b"".join(vocab[i] for i in ids)
    return b.decode("utf-8", errors="replace")

tests = ["the quick fox", "a completely novel sentence with new words",
         "", "xyz123!@#", "中文 \U0001F389"]   # last one: never in training corpus
for t in tests:
    ids = encode(t, merges)
    back = decode(ids, vocab)
    print(f"{'OK ' if back == t else 'FAIL'}  {t!r:45s} -> {len(ids):3d} tokens -> {back!r}")
```

Every line should print `OK`, **including the Chinese/emoji line that
never appeared in training.** That's byte-level BPE's core guarantee
(module 02) proven on your own code: no training example ever taught
this tokenizer about Chinese or emoji, yet it encodes and perfectly
reconstructs them, by falling back to individual UTF-8 bytes wherever no
learned merge applies.

### 4. Compress a real file and measure the ratio

```python
# Point this at any real local text file -- a README from this repo,
# a source file, anything with a few thousand characters.
with open("path/to/some_real_file.md", "r", encoding="utf-8") as f:
    source = f.read()

merges2, vocab2 = train(source, num_merges=200)
ids = encode(source, merges2)
print(f"{len(source)} chars -> {len(source.encode('utf-8'))} bytes -> {len(ids)} tokens")
print(f"compression ratio: {len(source.encode('utf-8')) / len(ids):.2f} bytes/token")
```

Compare this ratio against `tiktoken`'s real `cl100k_base` on the same
text (module 00). Yours will be worse — it's trained on one small file
with only 200 merges, versus a production vocabulary trained on
trillions of tokens with ~100,000 merges — but the *mechanism* is
identical.

### 5. Diagnose and fix: the rank-vs-frequency bug, constructed exactly

This reproduces the divergence described in the concepts section, with
hand-picked merge rules so the bug is guaranteed to appear rather than
merely possible:

```python
# Two merge rules that OVERLAP on the byte for 'b' (98) -- only one can
# apply to any single "a b c", so which one gets picked determines the
# final result. Rank 0 was learned FIRST and must win.
merges_demo = {(97, 98): 256, (98, 99): 257}   # (a,b)->256 first, (b,c)->257 second

def encode_buggy(text_ids, merges):
    ids = list(text_ids)
    while True:
        stats = get_stats(ids)
        candidates = {p: c for p, c in stats.items() if p in merges}
        if not candidates:
            break
        pair = max(candidates, key=candidates.get)   # BUG: local frequency, not rank
        ids = merge(ids, pair, merges[pair])
    return ids

def encode_correct_ids(text_ids, merges):
    ids = list(text_ids)
    while len(ids) >= 2:
        stats = get_stats(ids)
        pair = min(stats, key=lambda p: merges.get(p, float("inf")))
        if pair not in merges:
            break
        ids = merge(ids, pair, merges[pair])
    return ids

# "a b c . b c . b c" -- (b,c) appears 3 times, (a,b) only once, but
# (a,b) has the LOWER rank and must be tried first wherever it applies.
raw = [97, 98, 99, 46, 98, 99, 46, 98, 99]

correct = encode_correct_ids(raw, merges_demo)
buggy = encode_buggy(raw, merges_demo)
print("correct (uses rank):     ", correct)
print("buggy   (uses frequency):", buggy)
print("same result?", correct == buggy)
```

Run it. You should get **different token sequences** — this is verified,
not hypothetical. Explain in your own words, using this exact example,
why the buggy version is wrong even though "pick the most frequent
mergeable pair" sounds like a reasonable strategy at first glance.

<details><summary>Answer</summary>

The two merge rules overlap: `(a,b)` and `(b,c)` share byte `b`, so in
the sequence `a b c`, applying one makes the other impossible to apply
at that position. Training established that `(a,b)` was more valuable
*globally, across the whole training corpus* — that's what rank 0 means
— but this particular 9-byte test input happens to contain `(b,c)` three
times and `(a,b)` only once. The buggy encoder, measuring frequency
*within this one input*, picks `(b,c)` first because it looks more
frequent right here — completely ignoring that the tokenizer's training
already decided `(a,b)` takes priority whenever both are available.

The result is two different, non-canonical tokenizations of the same
input depending on which strategy you used — and only one of them
matches what the *rest of the model* was actually trained to expect,
since the model's embedding table and every downstream computation was
built assuming the canonical, rank-based tokenization. A model fed
tokens from the buggy path would be seeing token sequences it never
learned to interpret.
</details>

## Independent challenge

Extend your `train`/`encode`/`decode` implementation with a **save/load**
feature: serialize `merges` and `vocab` to a JSON file (you'll need to
convert the `bytes` values and tuple keys to JSON-friendly forms) and
reload them. Then:

1. Train on a real corpus of at least 50KB (concatenate several files
   from this repo, or use any public text).
2. Save the tokenizer, reload it in a fresh Python process, and confirm
   `encode`/`decode` still round-trip correctly — proving the save
   format actually captured everything needed.
3. Measure and report: vocabulary size vs. average tokens-per-word, at
   three different `num_merges` budgets (e.g. 100, 500, 2000). This is
   module 08's vocabulary-size tradeoff, measured with code you wrote
   yourself rather than taken on faith.

## Common mistakes & troubleshooting

- **Encoding by local frequency instead of training rank.** The exact bug
  this module is built around (exercise 5) — it can silently produce a
  non-canonical tokenization whenever two learned merges overlap.
- **Forgetting merges can overlap.** Two merge rules sharing a byte only
  cause visible divergence when both are candidates at the same position
  — which is exactly why the bug is easy to miss on typical text (module
  03's search across ordinary sentences found no divergence at all) and
  only shows up on specific inputs.
- **Training and encoding with mismatched merge lists.** If you retrain
  (getting new ranks) but encode with an old saved `merges` dict, results
  are silently wrong — always version or hash-check a saved tokenizer
  against the model it's paired with.
- **Assuming decode always succeeds.** A token stream cut at the wrong
  point can produce invalid UTF-8 bytes; decode defensively
  (`errors="replace"`), never assuming success.
- **Re-scanning pair counts from scratch after every single merge.** This
  module's implementation does exactly that for clarity, and it's
  correct — but it's `O(n)` work per merge, `O(n · num_merges)` overall.
  Production implementations use a priority queue updated incrementally;
  worth knowing this is a real optimization, not a correctness fix.

## Checkpoint quiz

1. What's the one structural difference between module 03's toy version
   and this module's real byte-level version?
2. State, precisely, what `encode()` must select at each step — not
   "the most frequent pair," but the correct rule.
3. Under what specific condition do the correct and buggy encoders in
   exercise 5 actually produce different output?
4. Why does `decode()` use `errors="replace"` rather than a strict
   decode?
5. Why can a byte-level tokenizer correctly round-trip a language it
   never saw during training?

<details><summary>Answers</summary>

1. Module 03 tokenized each word separately with an explicit `</w>`
   boundary marker; this module treats the entire input as one flat byte
   sequence with no word-boundary structure at all.
2. Among the pairs currently present in the sequence, select the one
   with the lowest merge rank — i.e., the pair that was learned earliest
   during training — never the pair that happens to be most frequent in
   the specific text being encoded right now.
3. When two learned merge rules overlap (share a symbol), so that only
   one of them can apply at a given position, and the higher-rank
   (later-learned) pair happens to be locally more frequent in the
   specific input than the lower-rank pair that should take priority.
4. Because a token sequence that's been sliced or truncated mid-stream
   can produce bytes that aren't valid UTF-8 at the cut point; replacing
   invalid bytes degrades gracefully instead of raising and crashing.
5. Because the starting alphabet is the full set of 256 byte values
   (module 01) — any input, in any script, is already representable at
   worst as one token per byte, with no learned merge required to
   represent it at all.
</details>

## Further reading & sources

- [minbpe (Karpathy, GitHub)](https://github.com/karpathy/minbpe) - a clean, from-scratch reference implementation extremely close to this module's; compare your code against `basic.py` directly.
- [Let's build the GPT Tokenizer (Karpathy, 2hr video)](https://www.youtube.com/watch?v=zduSFxRajkE) - builds exactly this implementation on camera, including the rank-based encoding subtlety this module is built around.
- [tiktoken (GitHub)](https://github.com/openai/tiktoken) - the production, Rust-accelerated version of the same algorithm; its `_educational.py` file is a deliberately slow, readable pure-Python reference implementation from the maintainers themselves.
- [Hugging Face `tokenizers`: BPE](https://huggingface.co/docs/tokenizers/api/models#tokenizers.models.BPE) - the production library's BPE implementation, if you want to compare a battle-tested version against your own.
- [GPT-2 encoder.py (OpenAI, original release)](https://github.com/openai/gpt2/blob/master/src/encoder.py) - the original production implementation this module's exercises are modeled after, including the byte-to-printable-unicode remapping trick skipped here for clarity.

## Next

[Module 05: WordPiece and SentencePiece](../05-wordpiece-and-sentencepiece/README.md)
