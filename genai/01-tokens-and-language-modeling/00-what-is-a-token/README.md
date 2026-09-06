# Module 00: What Is a Token

## Why this matters

Every weird, specific behavior you've noticed in a chat model traces back
to one fact: **the model never sees words — it sees tokens**, and a token
is not "a word." It's a chunk of text (sometimes a whole word, sometimes
a word-piece, sometimes a single character or byte) drawn from a fixed
vocabulary the model learned during training.

This single fact explains things that otherwise look like bugs:

- **Why GPT-family models are famously bad at "count the letters in
  'strawberry'."** The model never sees the letters `s-t-r-a-w-b-e-r-r-y`
  — it sees a small number of opaque token IDs. Asking it to count letters
  is like asking someone to count the pixels in a word they only ever
  saw as a single icon.
- **Why API pricing is "per token," not "per word" or "per character,"**
  and why the same sentence in Chinese, Hindi, or Arabic can cost
  noticeably more tokens than the English equivalent — different
  tokenizers were trained on English-majority corpora, so non-Latin
  scripts often split into more, smaller tokens.
- **Why "context window" is measured in tokens** (e.g. "128K context"),
  and why a document that looks short on screen can silently blow past a
  limit once code, whitespace, or an unusual language inflates its token
  count.

Track 02 (transformers) will show *why* the architecture operates on
discrete tokens rather than raw characters or continuous audio directly.
For now: get comfortable actually looking at tokens, not just reading
about them.

## Concepts

### A token is a vocabulary entry, not a linguistic unit

A tokenizer is built from a fixed **vocabulary** — a lookup table mapping
text chunks to integer IDs, typically 30,000-100,000+ entries, learned
once from a training corpus (module 03 covers exactly how that vocabulary
gets built). At inference time, tokenizing is just: split the input text
into the longest sequence of vocabulary-recognized chunks, and replace
each with its integer ID.

```
   "Tokenization is the first step"
                  │
                  ▼  split on vocabulary entries
   ┌────────┬──────────┬─────┬──────┬────────┬───────┐
   │ Token  │ ization  │ is  │ the  │ first  │ step  │
   └────────┴──────────┴─────┴──────┴────────┴───────┘
        │        │        │      │       │        │
        ▼        ▼        ▼      ▼       ▼        ▼
   ┌────────┬──────────┬─────┬──────┬────────┬───────┐
   │ 12904  │  2065    │ 374 │ 279  │ 1176   │ 3094  │
   └────────┴──────────┴─────┴──────┴────────┴───────┘
        the model sees ONLY these integers

   NOT one-per-word:  "Tokenization" → 2 tokens
   NOT one-per-char:  "step"         → 1 token
   note the leading spaces: " is" is ONE token, not " " + "is"
```

```python
import tiktoken

# cl100k_base is the tokenizer used by GPT-3.5/GPT-4-era models;
# o200k_base is used by GPT-4o and newer.
enc = tiktoken.get_encoding("cl100k_base")

text = "Tokenization is the first step of every LLM pipeline."
ids = enc.encode(text)
print(ids)
# [12904, 2065, 374, 279, 1176, 3094, 315, 1475, 445, 11237, 15660, 13]

print(len(ids), "tokens for", len(text), "characters")
# 12 tokens for 55 characters -- NOT one token per word (13 words) and
# NOT one token per character (55 chars). Somewhere in between.

for tid in ids:
    print(tid, repr(enc.decode([tid])))
# 12904 'Token'
# 2065  'ization'
# 374   ' is'
# 279   ' the'
# 1176  ' first'
# ...
```

Notice `"Tokenization"` split into `Token` + `ization` — a whole common
word (`the`, `is`, `first`) usually gets exactly one token (with a leading
space folded in — more on that below), while a rarer or compound word
splits into pieces. That splitting behavior is the entire subject of
module 01.

### Tokens, not characters, not words — and the leading-space quirk

Run the exercise above on `" is"` vs `"is"` and you'll get **different
token IDs** — most BPE-based tokenizers (including `cl100k_base`) fold the
preceding space into the token itself, because "a space followed by a
word" is an extremely common pattern worth its own vocabulary entry. This
is a frequent source of confusion when programmatically comparing or
concatenating token sequences — `"Hello" + " world"` does not tokenize the
same as `"Hello world"` tokenized as one string, because how the pieces
get glued back together changes which vocabulary entries match.

### A rough rule of thumb, and why it's only a rough one

For English text, a common approximation is **~4 characters per token**,
or **~0.75 tokens per word**. This is genuinely just a heuristic for quick
mental estimates — it breaks down for:

- **Code**, where punctuation-dense syntax (`{`, `()`, `->`, indentation)
  tokenizes very differently from prose.
- **Non-English text**, especially non-Latin scripts, which the dominant
  tokenizers (trained on English-heavy corpora) split far less
  efficiently — a Hindi or Japanese sentence often costs 2-3x more tokens
  than an English sentence saying the same thing. This is a real,
  measurable cost and latency disadvantage for non-English-first
  products, not a minor curiosity.
- **Numbers**, which some tokenizers split digit-by-digit or in small
  groups specifically so arithmetic reasoning has a chance of working
  token-by-token.

Always measure, don't estimate, when a real budget (context window, API
cost) is on the line — which is exactly what the exercises below do.

### Special tokens

Beyond text-derived vocabulary entries, every model reserves a handful of
**special tokens** that never appear in ordinary text but carry structural
meaning the model was trained to respect — e.g. an end-of-sequence marker,
a beginning-of-text marker, or (for chat-tuned models) markers delimiting
where a system/user/assistant turn starts and ends. You don't typically
construct these by hand — the chat-completion API layer inserts them for
you — but they count toward your token budget just like any other token,
and library functions like `tiktoken`'s `encode` will refuse to encode
literal special-token-looking text by default (a deliberate safety
guard against a user's message accidentally forging a fake system turn).

## Reference

| Term | Means |
|---|---|
| Token | One vocabulary entry — a chunk of text mapped to an integer ID |
| Vocabulary | The fixed set of all tokens a specific tokenizer recognizes |
| Tokenizer | The algorithm/lookup table that converts text ↔ token IDs |
| `tiktoken` | OpenAI's open-source tokenizer library, usable offline without an API key |
| `cl100k_base` | The tokenizer encoding used by GPT-3.5-turbo/GPT-4-era models |
| `o200k_base` | The tokenizer encoding used by GPT-4o and newer models |
| Special token | A reserved token (e.g. end-of-sequence) with structural rather than linguistic meaning |

| Task | Code |
|---|---|
| Load a tokenizer | `enc = tiktoken.get_encoding("cl100k_base")` |
| Load the tokenizer for a specific model | `enc = tiktoken.encoding_for_model("gpt-4o")` |
| Text → token IDs | `enc.encode(text)` |
| Token IDs → text | `enc.decode(ids)` |
| Count tokens without decoding | `len(enc.encode(text))` |
| Inspect one token's text | `enc.decode([single_id])` |

## Hands-on exercises

Install once: `pip install tiktoken`

### 1. Encode, decode, and look at the pieces

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")

text = "The quick brown fox jumps over the lazy dog."
ids = enc.encode(text)
print(f"{len(text)} chars -> {len(ids)} tokens")
for tid in ids:
    print(f"  {tid:6d}  {enc.decode([tid])!r}")
```

Run it. Which words got split into more than one piece, if any? (This
sentence is famously "pangram-simple" English — expect mostly whole-word
tokens. You'll get a very different picture in exercise 3.)

### 2. Prove the leading-space quirk

```python
a = enc.encode("Hello world")
b = enc.encode("Hello") + enc.encode(" world")
c = enc.encode("Hello") + enc.encode("world")
print(a)
print(b)
print(c)
print("a == b:", a == b, "  a == c:", a == c)
```

Before running it, predict which pair (if any) will be equal. Then run it
and reconcile any surprise with the "leading-space quirk" concept above.

### 3. English vs. code vs. another language — measure, don't guess

```python
samples = {
    "english": "The weather today is sunny with a light breeze.",
    "python_code": "def add(a: int, b: int) -> int:\n    return a + b",
    "hindi": "आज मौसम धूप वाला और हल्की हवा के साथ है।",
}
for label, s in samples.items():
    ids = enc.encode(s)
    print(f"{label:12s}  {len(s):3d} chars  {len(ids):3d} tokens  "
          f"{len(s)/len(ids):.2f} chars/token")
```

Run it (swap in a real sentence in whatever second language you speak, if
not Hindi). Which sample has the worst chars-per-token ratio? Write one
sentence connecting that result to the "non-English cost disadvantage"
point in the concepts section.

### 4. Build a token-budget checker

Write a function `fits_in_budget(text: str, max_tokens: int, encoding: str = "cl100k_base") -> bool`
that returns whether `text` tokenizes to `max_tokens` or fewer. Then use
it to check whether three paragraphs of your choice (paste in any real
text — an email, a README section, a news snippet) fit inside a
1,000-token budget. This is the exact check a RAG pipeline (track 09) runs
before stuffing a retrieved chunk into a prompt.

<details><summary>Reference solution</summary>

```python
import tiktoken

def fits_in_budget(text: str, max_tokens: int, encoding: str = "cl100k_base") -> bool:
    enc = tiktoken.get_encoding(encoding)
    return len(enc.encode(text)) <= max_tokens
```
</details>

### 5. Diagnose and fix: silent truncation

```python
# BUG: this "trims a string to N tokens" function is wrong.
def trim_to_tokens(text: str, max_tokens: int) -> str:
    enc = tiktoken.get_encoding("cl100k_base")
    words = text.split()
    return " ".join(words[:max_tokens])   # <-- bug is here
```

Explain in one sentence why counting `words` and limiting by `max_tokens`
is wrong, then fix it so it actually truncates by token count (hint: slice
the *token ID list*, then decode).

<details><summary>Answer</summary>

Words and tokens are different units — a 50-word string is not
necessarily 50 tokens (per this module, usually more). The fix must
`encode`, slice the ID list to `max_tokens`, then `decode`:

```python
def trim_to_tokens(text: str, max_tokens: int) -> str:
    enc = tiktoken.get_encoding("cl100k_base")
    ids = enc.encode(text)
    return enc.decode(ids[:max_tokens])
```
</details>

## Independent challenge

Build a small CLI tool, `token_cost.py`, that takes a file path and a
price-per-1000-tokens as arguments, and prints: total character count,
total token count (using `cl100k_base`), and the estimated dollar cost.
No starter code — you have everything needed from the reference table and
exercises above. Test it against a real file in this repo (try a
`README.md` from `backend/` or `learn/`) and sanity-check the result
against the ~4-chars-per-token rule of thumb — if it's wildly off, you've
likely got a units bug (bytes vs. characters vs. tokens).

## Common mistakes & troubleshooting

- **Estimating tokens by splitting on whitespace.** `text.split()` counts
  words, not tokens, and the gap between the two is exactly what exercise
  5 makes you fix. Any real budget check must call `encode()`.
- **Assuming one tokenizer works for every model.** `cl100k_base` and
  `o200k_base` are *different* vocabularies — encoding with the wrong one
  gives you a plausible-looking but wrong token count. Use
  `tiktoken.encoding_for_model("gpt-4o")` when you know the target model,
  rather than hardcoding an encoding name.
- **Forgetting special tokens exist and consume budget.** A chat
  completion's real token count includes structural tokens the API layer
  adds around your messages — `tiktoken` alone, run only on your raw
  message text, will slightly undercount versus what the API actually
  bills. For an exact count against a specific chat API, use the
  provider's own token-counting guidance for that endpoint rather than a
  bare `encode()` call.
- **Assuming non-English text costs the same.** It measurably doesn't
  (exercise 3) — this has real product implications (latency, cost) for
  non-English-first applications that are easy to miss if you only ever
  test with English strings.

## Checkpoint quiz

1. Why can't GPT-family models reliably count the letters in a word?
2. Why is `enc.encode("Hello world")` not necessarily equal to
   `enc.encode("Hello") + enc.encode(" world")`? (Trick question — check
   your exercise 2 result before answering.)
3. Name one concrete reason a non-English sentence often costs more
   tokens than its English translation.
4. What's wrong with estimating token count by counting words?
5. Why do special tokens matter for a token *budget*, even though you
   don't type them yourself?

<details><summary>Answers</summary>

1. The model only ever sees token IDs, not individual characters — a word
   is usually one or a few opaque tokens, so the letters composing it
   aren't directly visible to the model to count.
2. Trick: they usually ARE equal in this specific case, because
   `" world"` (with leading space) is itself a valid single vocabulary
   token that both forms produce identically — the quirk shows up when
   you compare against `encode("Hello") + encode("world")` (no leading
   space), which is NOT the same, since `"world"` without a leading space
   is a different vocabulary entry.
3. The dominant tokenizers were trained on English-majority corpora, so
   non-Latin scripts (or generally underrepresented languages) split into
   more, smaller tokens per equivalent meaning.
4. Words and tokens are different units — many common words are one
   token, but longer/rarer/compound words split into multiple tokens, so
   a word count systematically undercounts real token usage.
5. The API silently adds structural tokens around your raw message
   content (turn boundaries, etc.), which count toward context-window and
   billing limits even though you never typed them — a raw `encode()`
   on your own text alone will undercount the real total.
</details>

## Further reading & sources

- [Tiktokenizer](https://tiktokenizer.vercel.app/) - paste any text and see it split into tokens, per model, colour-coded. Keep this open for the whole track; it makes every concept here immediate.
- [OpenAI: What are tokens and how to count them](https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them) - the official explanation, including the ~4-characters-per-token rule of thumb and its caveats.
- [tiktoken (GitHub)](https://github.com/openai/tiktoken) - the library used in every exercise here; the README documents which encoding belongs to which model.
- [How to count tokens with tiktoken (OpenAI Cookbook)](https://cookbook.openai.com/examples/how_to_count_tokens_with_tiktoken) - the authoritative recipe for counting chat-completion tokens *including* the structural tokens a bare `encode()` misses, which is the exact undercounting trap in this module's common mistakes.
- [Let's build the GPT Tokenizer (Andrej Karpathy, 2hr)](https://www.youtube.com/watch?v=zduSFxRajkE) - builds a tokenizer from scratch and demonstrates every failure mode in this module, including why LLMs can't spell or do arithmetic reliably. The best single resource on tokenization that exists.
- [Language Model Tokenizers Introduce Unfairness Between Languages (Petrov et al., 2023)](https://arxiv.org/abs/2305.15425) - measures the non-English token-cost penalty from exercise 3 across language families; the disparity is larger than most people expect.
- [Hugging Face: Summary of the tokenizers](https://huggingface.co/docs/transformers/tokenizer_summary) - compares BPE, WordPiece and SentencePiece; the natural next read before modules 03-06.

## Next

[Module 01: Text Encoding — Bytes, Unicode and UTF-8](../01-text-encoding-bytes-unicode-and-utf-8/README.md)
