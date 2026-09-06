# Module 13: Tokenization Pitfalls and Failure Modes

## Why this matters

Every module in this track has built toward being able to answer a
practical question: when an LLM does something surprising — miscounts
letters, botches simple arithmetic, or behaves erratically on one
specific rare input — is that a reasoning failure, or a **tokenization**
failure wearing a reasoning failure's clothes? This module collects
four real, verified tokenization pitfalls that explain genuinely
famous LLM failure patterns, each demonstrated against a real
tokenizer rather than described secondhand: why LLMs are bad at
counting letters, why they're inconsistent at multi-digit arithmetic,
why leading whitespace and case silently change how a prompt is
processed, and what "glitch tokens" actually are.

## Concepts

### Why LLMs struggle to count letters in a word

The famous "how many r's are in strawberry" failure isn't a reasoning
bug — it's a direct, verifiable consequence of subword tokenization.
The model never sees individual letters at all; it sees whatever pieces
the tokenizer produced:

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
ids = enc.encode("strawberry")
print([enc.decode([i]) for i in ids])
```

Verified output:

```
['str', 'aw', 'berry']
```

The model receives three opaque token IDs — `str`, `aw`, `berry` — not
ten individual letters. Counting how many of those letters are `r`
requires the model to have implicitly learned the internal spelling of
each piece from training data (which it partially can, but unreliably),
rather than being able to simply iterate over characters the way code
counting letters would. This is a structural limitation of subword
tokenization itself, not a fixable prompting trick — it's the direct
reason character-level tasks (counting, reversing, spelling) are a
known weak spot for tokenized language models regardless of how capable
they are otherwise.

### Why multi-digit arithmetic is inconsistent

Module 01 covered byte-level encoding; this is where its consequences
for numbers become concrete. `cl100k_base` doesn't tokenize digits one
at a time — it groups them, but **not consistently by place value**:

```python
nums = ["123", "1234", "12345", "123456", "1234567", "99999999", "1000000"]
for n in nums:
    print(n, "->", [enc.decode([i]) for i in enc.encode(n)])
```

Verified output:

```
123      -> ['123']
1234     -> ['123', '4']
12345    -> ['123', '45']
123456   -> ['123', '456']
1234567  -> ['123', '456', '7']
99999999 -> ['999', '999', '99']
1000000  -> ['100', '000', '0']
```

And, more surprisingly, the **same four digits** get split at different
boundaries depending purely on what surrounds them in the same digit
run:

```python
for text in ["4567", "234567", "a4567"]:
    print(repr(text), "->", [enc.decode([i]) for i in enc.encode(text)])
```

Verified output:

```
'4567'   -> ['456', '7']
'234567' -> ['234', '567']
'a4567'  -> ['a', '456', '7']
```

`"4567"` splits as `456|7` on its own, but as `234|567` once two more
digits precede it in the same run — the digit `4` moves from the *end*
of one chunk to the *start* of another purely because of surrounding
context, with no relationship to place value (ones, tens, hundreds).
This is a real, mechanical reason multi-digit arithmetic is unreliable
for tokenized models: the model isn't reasoning over aligned digit
positions the way a calculator does — it's reasoning over whatever
inconsistent chunks the tokenizer happened to produce for that specific
number in that specific context.

### Why leading whitespace and case are not cosmetic

Module 07 already showed `bert-base-uncased` lowercasing input before
tokenizing. Here's the sharper version of that point, verified directly
against `cl100k_base`:

```python
words = ["hello", " hello", "Hello", "strawberry", " strawberry"]
for w in words:
    print(repr(w), "->", [enc.decode([i]) for i in enc.encode(w)])
```

Verified output:

```
'hello'       -> ['hello']
' hello'      -> [' hello']
'Hello'       -> ['Hello']
'strawberry'  -> ['str', 'aw', 'berry']
' strawberry' -> [' strawberry']
```

Four completely different token identities for what a person would
call "the same word": `hello`, ` hello` (leading space), and `Hello`
(different case) are each their own distinct, unrelated vocabulary
entries to the model — and note that ` strawberry` (with a leading
space) is a **single** token, while `strawberry` alone needs **three**.
Whether a word is preceded by a space in the training data determined
whether it earned its own dedicated vocabulary slot at all. A prompt
template that inconsistently adds or omits a leading space before
user-supplied text (a common bug in hand-built prompt-concatenation
code) can silently change which tokens the model actually receives,
with no visible difference in the printed string.

### Glitch tokens: real, documented anomalous vocabulary entries

Some tokens — verified below to genuinely exist in GPT-2/GPT-3's
`r50k_base` vocabulary — correspond to strings that appeared often
enough in the *tokenizer's* training corpus to earn a dedicated token,
but rarely or never appeared in the *model's* actual training data.
The result: the model has a token it was essentially never trained to
use meaningfully, and querying it directly can produce erratic,
off-distribution output (a phenomenon first publicly documented for
tokens including `" SolidGoldMagikarp"`, an artifact of a Reddit
username that was extremely frequent in a web-scrape corpus used to
train the tokenizer, but not the model itself).

```python
enc2 = tiktoken.get_encoding("r50k_base")
for w in [" SolidGoldMagikarp", " TheNitromeFan", " attRot"]:
    ids = enc2.encode(w)
    print(repr(w), "->", ids)
```

Verified output — each really is a single, dedicated token:

```
' SolidGoldMagikarp' -> [43453]
' TheNitromeFan'      -> [42090]
' attRot'             -> [35207]
```

This is a real illustration of a broader point: a tokenizer's training
corpus and a model's training corpus are not guaranteed to be the same
corpus (or even close), and a mismatch between the two can leave
"orphan" tokens in the vocabulary that the model itself never learned
to use — a genuine, historically documented failure mode, not a
one-off curiosity. Newer encodings like `cl100k_base` were built with
this specific problem in mind and are far less prone to it, but the
underlying risk (tokenizer corpus != model corpus) doesn't disappear
just because a specific instance was patched.

## Reference

```
 Pitfall                     Root cause                    Symptom
 ─────────────────────       ───────────────────────       ─────────────────────
 Letter-counting failures     Subword pieces hide            "How many r's in
                              individual character            strawberry" wrong
                              identity from the model
 Arithmetic inconsistency     Digit grouping isn't            Simple addition/
                              place-value-aligned and         subtraction errors
                              shifts with context             on multi-digit
                                                               numbers
 Leading-space/case           Different token IDs for         Prompt template bugs
 sensitivity                  "word", " word", "Word" —       silently changing
                              not variants of one token       model input
 Glitch tokens                Tokenizer corpus != model        Erratic output when
                              training corpus; some            a rare/orphan token
                              tokens are essentially           is directly queried
                              untrained
```

## Hands-on exercises

### Exercise 1 — find a word where letter-counting would fail

Pick 5 words of varying length, tokenize each with `cl100k_base`, and
for each one check whether any single token contains more than one
occurrence of the same letter split across a boundary you wouldn't
expect (e.g., a word split so that all three "s" letters land in
different tokens). Connect what you find to why a model might
undercount or overcount a specific letter in that specific word.

### Exercise 2 — reproduce the digit-chunking inconsistency

Run the exact code from the concepts section on numbers you choose
yourself — try a phone number, a year, a large dollar amount — and
confirm the chunk boundaries are not aligned to place value (ones,
tens, hundreds, thousands). Then try encoding the same number as part
of a sentence (e.g., `"The total was 123456 dollars"`) and confirm the
surrounding words don't change the digit-chunking pattern, only other
digits do.

### Exercise 3 — build a prompt-template whitespace bug, then fix it

Write a small function that builds a prompt via naive string
concatenation, in a way that inconsistently adds a leading space:

```python
def build_prompt_buggy(instruction, user_input):
    return f"{instruction}:{user_input}"   # no space after the colon

def build_prompt_fixed(instruction, user_input):
    return f"{instruction}: {user_input}"  # deliberate space

for build in (build_prompt_buggy, build_prompt_fixed):
    prompt = build("Translate to French", "hello")
    ids = enc.encode(prompt)
    print(build.__name__, "->", [enc.decode([i]) for i in ids])
```

Run this and confirm the two versions tokenize the word `"hello"`
differently at the point where the instruction and input meet — even
though the raw text differs only by one space character.

## Independent challenge

You're debugging a customer-facing chatbot that occasionally responds
to certain rare last names or product codes with bizarre, off-topic
text — otherwise it behaves normally. Using this module's "glitch
tokens" discussion, write two or three sentences on what you'd check
first (before assuming it's a reasoning/hallucination bug), and how
you'd verify whether a specific input string corresponds to an
unusually rare or under-trained token using the tools from this
module's exercises.

<details><summary>Discussion</summary>

The first check is tokenizing the exact problematic input and looking
at whether it collapses into one specific, unusual token (or a small
number of them) rather than being spelled out across several ordinary
pieces — a single rare token id is the signature of the glitch-token
pattern from the concepts section. From there, checking whether that
specific token appears disproportionately rarely in general text (hard
to check directly without training-data access, but proxy evidence —
e.g. it being an unusual proper noun, code, or artifact string, similar
in shape to the verified `r50k_base` examples above) supports the
hypothesis. This is a genuinely different root cause from a reasoning
failure, and the fix (if confirmed) is usually to avoid feeding that
specific string directly to the model, or normalize/expand it before
tokenization, rather than trying to prompt-engineer around a
model behavior that was never reliably trained in the first place.

</details>

## Common mistakes & troubleshooting

- **Treating letter-counting or arithmetic failures as pure reasoning
  bugs**, and trying to fix them with prompting alone, without
  recognizing the underlying limitation is structural (the model
  literally doesn't see individual characters or place-value-aligned
  digits). Chain-of-thought prompting can help partially by forcing
  the model to externalize intermediate steps, but doesn't remove the
  root cause.
- **Assuming a leading space is cosmetic in a prompt template.**
  Verified above: it changes the actual token IDs the model receives,
  not just how the text looks when printed.
- **Assuming every tokenizer has the same glitch-token risk.** Newer
  encodings (like `cl100k_base`) were built with awareness of this
  specific failure mode and are considerably more robust to it than
  older ones (`r50k_base`) — but the underlying risk (tokenizer corpus
  diverging from model training corpus) isn't eliminated by any single
  encoding, just reduced.
- **Debugging erratic output on a specific rare input by only
  adjusting the prompt**, without first checking whether that specific
  input tokenizes into an unusual, isolated token — the glitch-token
  pattern is a tokenizer-level phenomenon, and no amount of prompt
  rewording around it addresses the root cause if the input itself is
  the trigger.

## Checkpoint quiz

1. Why can't a model reliably count how many times a specific letter
   appears in a word, even though it's a "simple" task for code?
2. What did the verified digit-chunking experiment show about how
   `"4567"` tokenizes on its own versus as part of `"234567"`?
3. Are `"hello"`, `" hello"`, and `"Hello"` different surface forms of
   the same token, or genuinely different tokens? What did the
   verified output show?
4. What is a "glitch token," and what real historical example did this
   module verify?
5. Why is inconsistent leading-whitespace handling in a hand-built
   prompt template a real bug, not a cosmetic issue?

<details><summary>Answers</summary>

1. Because the model never sees individual characters — it sees
   whatever subword pieces the tokenizer produced (verified:
   `"strawberry"` becomes `['str', 'aw', 'berry']`, not ten separate
   letters), so counting a specific letter requires implicitly
   recovering spelling information the model only partially and
   unreliably learned during training.
2. `"4567"` on its own splits as `['456', '7']`, but as part of
   `"234567"` it splits as `['234', '567']` — the same four digits get
   different chunk boundaries purely from surrounding context, with no
   relationship to place value (ones/tens/hundreds/thousands).
3. Genuinely different, unrelated tokens — verified: all four (`hello`,
   ` hello`, `Hello`, and even ` strawberry` vs. `strawberry`) have
   distinct token identities, with no inherent relationship the model
   is guaranteed to represent as "the same word, different form."
4. A vocabulary entry that appeared often enough in the *tokenizer's*
   training corpus to earn a dedicated token, but rarely or never
   appeared in the *model's* actual training data — leaving the model
   essentially untrained on that specific token and prone to erratic
   output if it's queried directly. Verified real examples:
   `" SolidGoldMagikarp"`, `" TheNitromeFan"`, and `" attRot"`, each
   confirmed as single dedicated tokens in GPT-2/GPT-3's `r50k_base`
   vocabulary.
5. Because a leading space changes the actual token ID(s) the model
   receives (verified: `"hello"` is 1 token, `" hello"` is a different
   single token) — a template that inconsistently adds or omits it can
   silently change what the model is actually processing, with no
   visible difference in the printed prompt string.

</details>

## Further reading & sources

- [SolidGoldMagikarp (plus, prompt generation) - LessWrong](https://www.lesswrong.com/posts/aPeJE8bSo6rAFoLqg/solidgoldmagikarp-plus-prompt-generation) - the original public investigation into glitch tokens, source of the real examples verified in this module.
- [tiktoken (GitHub)](https://github.com/openai/tiktoken) - used throughout this module's exercises; `r50k_base` and `cl100k_base` encodings both used to compare glitch-token behavior across tokenizer generations.
- [Language Models are Few-Shot Learners (Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - the GPT-3 paper; section 3.9.2 documents the model's known weaknesses on arithmetic, directly connected to this module's digit-chunking finding.
- [Guiding Language Models to Reason with Chain-of-Thought (Wei et al., 2022)](https://arxiv.org/abs/2201.11903) - the widely-cited technique for partially mitigating (not eliminating) tokenization-rooted reasoning weaknesses like multi-step arithmetic.
- [OpenAI Cookbook: How to count tokens with tiktoken](https://cookbook.openai.com/examples/how_to_count_tokens_with_tiktoken) - practical reference for the exact tokenization behaviors verified throughout this module.

## Next

[Module 14: Multilingual Tokenization](../14-multilingual-tokenization/README.md)
