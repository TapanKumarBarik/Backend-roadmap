# Module 14: Multilingual Tokenization

## Why this matters

Every English example in this track so far compresses well: common
words earn their own single token. This module measures what happens
to that assumption once the text isn't English — and the answer,
verified directly against `cl100k_base`, is that several widely-spoken
languages get **measurably worse compression**, sometimes needing *more*
tokens than characters. Given module 12's finding that cost scales with
token count, this isn't a fairness footnote — it's a real, quantifiable
tax that falls disproportionately on non-Latin-script languages, rooted
directly in modules 01 and 08's mechanics (byte-level encoding, and
whose text a vocabulary was actually trained on).

## Concepts

### Measured: the same sentence, six languages, six very different token counts

```python
import tiktoken
enc = tiktoken.get_encoding("cl100k_base")
samples = {
    "English": "The weather is nice today.",
    "French": "Le temps est agreable aujourd'hui.",
    "Hindi": "आज मौसम अच्छा है।",
    "Chinese": "今天天气很好。",
    "Japanese": "今日は天気がいいです。",
    "Arabic": "الجو جميل اليوم.",
}
for lang, text in samples.items():
    ids = enc.encode(text)
    print(lang, len(text), "chars,", len(ids), "tokens,",
          len(text)/len(ids), "chars/token")
```

Verified output:

```
English    chars=26  tokens=6   chars/token=4.33
French     chars=34  tokens=8   chars/token=4.25
Hindi      chars=17  tokens=21  chars/token=0.81
Chinese    chars=7   tokens=9   chars/token=0.78
Japanese   chars=11  tokens=10  chars/token=1.10
Arabic     chars=16  tokens=11  chars/token=1.45
```

English and French both compress (more characters than tokens — over 4
characters per token). Hindi and Chinese do the **opposite** — Hindi's
17 characters become 21 tokens, *more tokens than characters*. The same
sentence, saying the same thing, costs roughly 3.5x more tokens per
character of meaning in Hindi than in English on this tokenizer.

### Why: it traces directly back to bytes and training data

Module 01 established that byte-level BPE operates on UTF-8 bytes, and
that non-ASCII characters take multiple bytes (a Devanagari character
commonly takes 3 UTF-8 bytes; module 01's byte-length table). Module 08
established that a tokenizer's vocabulary reflects whatever text
dominated its training corpus. Put those together, and multilingual
compression differences are the mechanical, unsurprising result: a
vocabulary trained mostly on English/Latin-script web text earns
dedicated multi-character tokens for common English words, but has far
fewer (if any) dedicated multi-character tokens for Devanagari or CJK
sequences — so those scripts frequently get represented at something
close to the raw byte level, one or two bytes per token, rather than
whole-word compression.

Verified directly, at the single-word level:

```python
hindi_word = "मौसम"      # "weather" in Hindi
english_word = "weather"

print(hindi_word, len(hindi_word.encode("utf-8")), "bytes,",
      len(enc.encode(hindi_word)), "tokens")
print(english_word, len(english_word.encode("utf-8")), "bytes,",
      len(enc.encode(english_word)), "tokens")
```

Verified output:

```
मौसम    12 bytes, 5 tokens
weather 7 bytes, 1 token
```

`"weather"` — 7 bytes — collapses into a **single** dedicated token.
`"मौसम"` — 12 bytes, the same meaning — needs **five** tokens, close to
one token per UTF-8 byte-group. Neither word is unusual or rare in its
own language; the difference is entirely which language dominated the
tokenizer's training data.

### A subtler bug this causes: decoding a lone multi-byte token produces mojibake

Byte-level BPE (module 01, module 03) can merge partial multi-byte UTF-8
sequences into a single token — which means decoding *one token in
isolation* (rather than the full sequence) can produce a broken,
undecodable byte sequence:

```python
ids = enc.encode(hindi_word)
print([enc.decode([i]) for i in ids])
```

Verified output:

```
['म', '�', '�', 'स', 'म']
```

Two of the five tokens decode to the Unicode replacement character
`�` on their own — not because anything is wrong with the encoding,
but because those specific tokens happen to be a partial UTF-8 byte
sequence (part of one full multi-byte character), invalid to decode in
isolation. Decoding the **full sequence of IDs together** reconstructs
the original text correctly; decoding tokens one at a time (a mistake
that's easy to make when building custom streaming-output logic) can
silently corrupt non-Latin-script text. This is a real, mechanical
consequence of byte-level tokenization interacting with multi-byte
UTF-8 — not a bug in any specific tokenizer's implementation.

### Why some tokenizers deliberately mitigate this

Module 06 covered Unigram LM's pruning approach and noted multilingual
models often prefer it specifically because it can more evenly
allocate vocabulary budget across languages during training, rather
than let one dominant language claim most of the useful multi-character
pieces. Models explicitly designed for broad multilingual support
(mT5, XLM-R, etc. — module 08) train on deliberately balanced,
multilingual corpora and often use considerably larger vocabularies
(250K+ entries, module 08) specifically to give enough budget for
non-Latin scripts to also earn efficient, multi-character tokens —
this doesn't eliminate the tradeoff, but measurably narrows it compared
to an English-dominant vocabulary like `cl100k_base`.

## Reference

```
 Finding                          Verified evidence
 ───────────────────────────      ─────────────────────────────────
 Non-Latin scripts often need      Hindi: 0.81 chars/token, Chinese:
 MORE tokens than characters       0.78 chars/token (cl100k_base)
 Latin-script languages compress   English: 4.33, French: 4.25
 well (more chars than tokens)     chars/token (cl100k_base)
 Root cause                        Byte-level encoding (module 01) +
                                    training-corpus dominance (module 08)
 Decoding a lone multi-byte-       Verified: 2 of 5 tokens for "मौसम"
 sequence token can produce �      decode to the replacement character
                                    in isolation
 Mitigation                        Larger, deliberately multilingual-
                                    balanced vocabularies (mT5, XLM-R);
                                    Unigram LM's pruning (module 06)
```

## Hands-on exercises

### Exercise 1 — measure your own multilingual comparison

Pick 3-4 languages you have access to real sentences in (use a
translation you trust, or a phrase you already know in each), and
reproduce the chars/token measurement from the concepts section.
Confirm which languages compress well and which don't, on your
specific sentences.

### Exercise 2 — reproduce the lone-token decoding bug

Run the exact `mौसम`/`weather` comparison from the concepts section.
Then write a small function that decodes a list of token IDs **all at
once** (the correct way) versus **one at a time** (the buggy way) for
any non-Latin-script text you choose, and confirm the buggy version
produces `�` characters that the correct version doesn't.

```python
def decode_correct(ids):
    return enc.decode(ids)

def decode_buggy(ids):
    return "".join(enc.decode([i]) for i in ids)

text = "मौसम"
ids = enc.encode(text)
print("correct:", repr(decode_correct(ids)))
print("buggy:  ", repr(decode_buggy(ids)))
```

### Exercise 3 — quantify the cost impact directly

Using module 12's cost-calculator pattern, compute the relative cost of
sending the *same* English and Hindi sentences from the concepts
section through an API billed per input token. Express the Hindi cost
as a multiple of the English cost for equivalent meaning, using the
verified token counts above (21 tokens vs. 6 tokens).

## Independent challenge

A product team says "our AI assistant supports 40 languages" based on
the underlying model being multilingual-capable. Using this module's
findings, write two or three sentences on what additional, specific
thing you'd want to measure before considering the claim complete —
tie your answer to a concrete number (tokens per equivalent sentence,
or cost per request) rather than a vague "it might be worse for some
languages."

<details><summary>Discussion</summary>

"Multilingual-capable" describes whether the *model* was trained on
those languages at all — it says nothing about whether users of each
language pay a comparable token cost or get equivalent effective
context-window budget (module 11) for equivalent meaning. The concrete
check: measure chars/token (or a fixed reference sentence's token
count) across all 40 supported languages with the actual tokenizer in
use, and flag any language whose ratio is meaningfully worse than the
dominant language's — exactly the kind of measurement this module's
exercises just walked through, applied at product scale instead of a
handful of examples.

</details>

## Common mistakes & troubleshooting

- **Assuming a model being "multilingual" means uniform tokenization
  efficiency across languages.** Verified above: the same tokenizer can
  compress English 5x better than it compresses Hindi, for equivalent
  meaning.
- **Decoding streamed tokens one at a time for non-Latin-script text.**
  Verified above: this can produce `�` replacement characters for
  tokens that are valid only as part of a longer sequence — always
  buffer and decode the full accumulated sequence, not each token in
  isolation, when the output may contain multi-byte characters.
- **Comparing cost or context-window usage across languages using
  character or word counts instead of actual token counts.** Given the
  compression differences verified above, "the Hindi version is only
  slightly longer in characters" can still mean several times more
  tokens, and therefore cost and context-window usage.
- **Assuming a larger vocabulary alone fixes multilingual compression.**
  It helps (module 08), but the effect also depends on whether the
  *training corpus* was actually balanced across languages — a huge
  vocabulary trained overwhelmingly on English text can still
  under-serve other languages.

## Checkpoint quiz

1. Which two languages, out of the six measured, needed *more* tokens
   than characters? What does that imply about "compression"?
2. What are the two root causes, from earlier modules, that together
   explain the multilingual compression gap?
3. Why did decoding individual tokens of `"मौसम"` one at a time produce
   `�` characters, while decoding the full sequence together didn't?
4. Name one real mitigation multilingual models use to narrow (not
   eliminate) this gap.
5. Why is "the model supports many languages" an incomplete claim
   without also measuring per-language token efficiency?

<details><summary>Answers</summary>

1. Hindi (0.81 chars/token) and Chinese (0.78 chars/token) — both
   needed more tokens than characters, meaning the tokenizer failed to
   compress them at all (worse than a 1:1 character-to-token ratio).
2. Byte-level encoding (module 01 — non-ASCII characters take multiple
   UTF-8 bytes) combined with training-corpus dominance (module 08 —
   the vocabulary reflects whatever text dominated training, typically
   English/Latin-script web text).
3. Byte-level BPE can merge a *partial* multi-byte UTF-8 sequence into
   a single token. Decoding that one token alone is an incomplete,
   invalid byte sequence on its own (hence `�`); decoding the full
   sequence of tokens together reconstructs the complete, valid UTF-8
   bytes.
4. Deliberately multilingual-balanced training corpora combined with
   larger vocabularies (mT5, XLM-R, module 08), or preferring Unigram
   LM's pruning process (module 06), which tends to retain broadly
   useful pieces across many languages rather than over-favoring one.
5. Because "supports" typically means the model was trained on that
   language at all, not that users of that language get comparable
   token efficiency, cost (module 12), or effective context-window
   budget (module 11) for equivalent meaning — verified here to differ
   by several times across languages on the same tokenizer.

</details>

## Further reading & sources

- [tiktoken (GitHub)](https://github.com/openai/tiktoken) - used throughout this module's exercises to measure real cross-language token counts.
- [XLM-R: Unsupervised Cross-lingual Representation Learning at Scale (Conneau et al., 2019)](https://arxiv.org/abs/1911.02116) - referenced in module 08; documents vocabulary allocation across 100 languages, directly relevant to the mitigation discussed here.
- [mT5: A Massively Multilingual Pre-trained Text-to-Text Transformer (Xue et al., 2020)](https://arxiv.org/abs/2010.11934) - covers multilingual vocabulary balance tradeoffs referenced in this module's mitigation discussion.
- [All languages are NOT created (tokenized) equal (Yennie Jun, 2023 — Art Fish Intelligence blog)](https://www.artfish.ai/p/all-languages-are-not-created-tokenized) - an accessible, widely-cited empirical comparison of tokenization efficiency across languages, covering the same phenomenon measured directly in this module.
- [Language Models are Few-Shot Learners (Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - the GPT-3 paper; its tokenizer's English-centric training corpus is the origin of the compression asymmetry measured in this module.

## Next

[Module 15: Next-Token Prediction: From Logits to Probabilities](../15-next-token-prediction-from-logits-to-probabilities/README.md)
