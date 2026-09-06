# Module 01: Text Encoding — Bytes, Unicode and UTF-8

## Why this matters

Module 00 showed *what* a token is — a vocabulary entry, looked up by ID.
This module goes one level lower: **before any tokenizer can group
characters into tokens, "characters" themselves have to become numbers.**
That step is text encoding, and skipping it is why so many explanations
of tokenization feel like they start in the middle.

Getting this layer right pays off immediately in two very concrete ways:

- **It explains why emoji, Chinese, Hindi and Arabic tokenize so
  differently from English** — not because a tokenizer "likes" English
  more, but because of a specific, mechanical fact about how UTF-8
  represents those scripts, which you're about to see.
- **Modern tokenizers (BPE, module 03) operate on *bytes*, not
  characters.** That single design decision is why a GPT-family model can
  tokenize literally any input — including malformed text, raw binary, or
  a language nobody thought to add to the vocabulary — without ever
  crashing on an "unknown character." Understanding byte-level encoding
  is understanding *why that guarantee exists*.

## Concepts

### The problem: computers only store numbers

A computer's memory is bytes — integers from 0 to 255. Text is not a
native concept; it's an agreed-upon *mapping* from numbers to the
characters humans want to read. Every "text encoding" is one such
mapping.

```
 the letter "A" is not stored as a letter.
 it's stored as the number 65 (in ASCII/UTF-8), which some other
 program interprets and RENDERS as the shape "A" on your screen.

     text you see:        A
     bytes stored:        01000001   (65 in binary)
     meaning:              agreed upon by the ENCODING, not inherent
```

### ASCII: 128 characters, one byte, English only

The original encoding, from the 1960s: 7 bits, 128 possible values,
enough for unaccented English letters, digits and punctuation.

```
 'A' = 65     'a' = 97     '0' = 48     ' ' = 32     '!' = 33

 128 possible characters — fine for English.
 completely unable to represent: é, ñ, 中, 🎉, or literally
 any character outside basic English
```

The moment you need accented letters, other scripts, or symbols, ASCII
has nothing left to give — every one of its 128 slots is already spoken
for.

### Unicode: one number for every character that exists

Unicode solves this by assigning every character *ever likely to be
needed* — every script, every emoji, every symbol — a unique number
called a **code point**, written `U+XXXX` in hex.

```
 U+0041   'A'          (same as ASCII 65 — Unicode is backward compatible)
 U+00E9   'é'
 U+4E2D   '中'
 U+1F389  '🎉'

 Unicode currently defines over 149,000 code points.
 A code point is a NUMBER. It says nothing yet about how that
 number gets stored as bytes — that's a separate problem, solved next.
```

Unicode is a *catalogue*, not a storage format. Deciding how to turn a
code point into bytes on disk is the job of an **encoding** — and this is
where UTF-8 enters.

### UTF-8: variable-width, and why that's the clever part

UTF-8 encodes each Unicode code point as **1 to 4 bytes**, and the byte
count depends on which code point it is:

```
 CODE POINT RANGE          BYTES USED       WHO'S IN THIS RANGE

 U+0000 - U+007F                1           ASCII (English, digits,
                                             basic punctuation)
 U+0080 - U+07FF                2           Latin accents (é, ñ),
                                             Greek, Cyrillic, Hebrew,
                                             Arabic
 U+0800 - U+FFFF                3           Chinese, Japanese, Korean,
                                             most other scripts
 U+10000 - U+10FFFF              4           emoji, rare/historic scripts

    ┌────────────────────────────────────────────────────────────┐
    │  THIS TABLE IS THE ENTIRE REASON TOKENIZATION COST DIFFERS  │
    │  BY LANGUAGE. English text is 1 byte/character. Chinese     │
    │  text is 3 bytes/character — three times the raw data       │
    │  before a tokenizer has even started grouping bytes into    │
    │  tokens (module 03).                                       │
    └────────────────────────────────────────────────────────────┘
```

The clever part: UTF-8 was deliberately designed so that **plain ASCII
text is valid UTF-8, unchanged, byte for byte.** Every English document
ever written in ASCII already *is* a UTF-8 document. That backward
compatibility is why UTF-8 won over competing encodings and is now used
for the overwhelming majority of text on the internet.

### How the byte count is signaled: leading bits as a length prefix

A decoder reading a stream of bytes has to know, from the very first
byte, how many total bytes make up the current character:

```
 1-byte:  0xxxxxxx                                    (starts with 0)
 2-byte:  110xxxxx 10xxxxxx                           (starts with 110)
 3-byte:  1110xxxx 10xxxxxx 10xxxxxx                  (starts with 1110)
 4-byte:  11110xxx 10xxxxxx 10xxxxxx 10xxxxxx         (starts with 11110)

           every CONTINUATION byte starts with 10 ──┘

 'é' (U+00E9) encodes as:  11000011 10101001
                            ▲ "2-byte, here comes 1 more"
                                     ▲ "I'm a continuation byte"
```

This is what lets a decoder — or a tokenizer — process a byte stream
left to right and always know where one character ends and the next
begins, with no separate "lookup table of lengths" needed.

### Why this matters for tokenizers specifically

A byte-level tokenizer (what GPT-family models actually use, module 03)
works over these raw UTF-8 bytes, not over "characters" as a linguistic
concept. Two direct consequences:

- **There is no such thing as an "unknown character."** Any input,
  however exotic, is already just a sequence of bytes 0-255. The
  tokenizer always has *something* valid to output — worst case, one
  token per byte.
- **A single character can span multiple tokens**, and a single token can
  span only *part* of a multi-byte character if the tokenizer's learned
  vocabulary happens to split there — which is exactly the source of
  "broken emoji" bugs you'll reproduce in the exercises.

## Reference

| Term | Means |
|---|---|
| Byte | A number 0-255; the unit computer memory actually stores |
| Code point | Unicode's unique number for one character, written `U+XXXX` |
| Encoding | The rule for turning a code point into bytes |
| ASCII | 128-character, 1-byte encoding; English-only |
| Unicode | The catalogue of all defined characters (not an encoding itself) |
| UTF-8 | Variable-width (1-4 byte) encoding of Unicode; ASCII-compatible |
| Continuation byte | A UTF-8 byte starting `10`, continuing a multi-byte character |
| Byte-level tokenizer | Operates on raw UTF-8 bytes, never fails on unknown input |

| Task | Code (Python) |
|---|---|
| Character to code point | `ord('é')` → `233` |
| Code point to character | `chr(233)` → `'é'` |
| String to UTF-8 bytes | `'é'.encode('utf-8')` → `b'\xc3\xa9'` |
| Bytes back to string | `b'\xc3\xa9'.decode('utf-8')` → `'é'` |
| Byte length of a string | `len('中'.encode('utf-8'))` → `3` |
| Show a code point in hex | `hex(ord('中'))` → `'0x4e2d'` |

## Hands-on exercises

Standard library only.

### 1. See the code point behind every character

```python
for ch in "Aé中🎉":
    print(f"{ch!r:6s} code point U+{ord(ch):04X}   byte length: {len(ch.encode('utf-8'))}")
```

Confirm the byte-length column matches the range table above. Which
character needs the most bytes, and why?

### 2. Watch UTF-8's length prefix in the raw bytes

```python
for ch in "Aé中🎉":
    b = ch.encode('utf-8')
    bits = ' '.join(f'{byte:08b}' for byte in b)
    print(f"{ch!r:6s} {b}  ->  {bits}")
```

For each multi-byte result, check the first byte's leading bits against
the table (`110`, `1110`, or `11110`) and confirm every following byte
starts with `10`. This is the mechanism a decoder uses to find character
boundaries — you're reading it directly.

### 3. Prove ASCII is valid UTF-8 unchanged

```python
ascii_text = "Hello, World! 123"
as_ascii = ascii_text.encode('ascii')
as_utf8 = ascii_text.encode('utf-8')
print(as_ascii == as_utf8)          # True
print(as_ascii)
```

Confirm they're byte-for-byte identical. Write one sentence on why this
property was essential for UTF-8's adoption — think about the millions
of existing ASCII documents in 1993 when UTF-8 was introduced.

### 4. Measure the real cost of non-English text

```python
samples = {
    "english": "The weather today is sunny.",
    "french":  "Le temps aujourd'hui est ensoleillé.",
    "chinese": "今天天气晴朗。",
    "hindi":   "आज मौसम धूप वाला है।",
    "emoji":   "😀🎉🚀🌍💡",
}
for label, s in samples.items():
    chars = len(s)
    utf8_bytes = len(s.encode('utf-8'))
    print(f"{label:9s} {chars:3d} chars  {utf8_bytes:3d} UTF-8 bytes  "
          f"{utf8_bytes/chars:.2f} bytes/char")
```

Rank the samples by bytes-per-character. This ratio is the *raw input*
to module 00's chars-per-token measurement — tokenization cost for
non-English text starts being worse right here, before a tokenizer has
even run.

### 5. Break a multi-byte character on purpose

```python
text = "café 中文 🎉"
b = text.encode('utf-8')

print("full text decodes fine:", b.decode('utf-8'))

# now slice the bytes at an arbitrary point, cutting a character in half
broken = b[:6]
print("raw bytes:", broken)
try:
    print(broken.decode('utf-8'))
except UnicodeDecodeError as e:
    print("UnicodeDecodeError:", e)
```

Adjust the slice index until you reproduce the error, then find a nearby
index that decodes cleanly. Write one sentence connecting this to why a
tokenizer that truncates text to a fixed number of *tokens* (module 00
exercise 5) can still occasionally produce a string with a broken
trailing character — the truncation point can land inside a multi-byte
sequence's byte-level token.

### 6. Diagnose and fix: mojibake

A teammate opens a file and sees `café` rendered as `cafÃ©`. They ask what
happened.

<details><summary>Answer</summary>

The file's bytes are valid UTF-8, but it was *decoded* using the wrong
encoding — commonly Latin-1 (ISO-8859-1), which maps every byte 0-255 to
some single character, so it never raises an error, it just produces the
wrong characters silently. `é` in UTF-8 is the two bytes `0xC3 0xA9`;
decoded one-byte-at-a-time as Latin-1, `0xC3` renders as `Ã` and `0xA9`
renders as `©`.

```python
correct = "café"
utf8_bytes = correct.encode('utf-8')
mojibake = utf8_bytes.decode('latin-1')
print(mojibake)   # cafÃ©
```

This is called **mojibake**, and the fix is always to decode with the
encoding the bytes were actually written in — usually UTF-8 today, but
worth confirming rather than assuming, especially with older files.
</details>

## Independent challenge

Write a small `encoding_report.py` that takes a text file path, and
reports: total characters, total UTF-8 bytes, bytes-per-character ratio,
and a breakdown of how many characters fall into each of the four UTF-8
byte-length categories from this module's table.

Run it against a real multilingual document (mix English with a
non-Latin script paragraph — Wikipedia articles in different languages
work well). Then write two sentences: which category dominated, and what
that predicts about this document's eventual token count once you reach
module 03's tokenizer.

## Common mistakes & troubleshooting

- **Confusing "character" with "byte."** `len(text)` counts characters;
  `len(text.encode('utf-8'))` counts bytes. They're equal only for pure
  ASCII text.
- **Assuming all text is ASCII-range.** Slicing strings, truncating by a
  byte count, or fixed-width buffers all break the moment non-Latin text
  or emoji appears (exercise 5).
- **Decoding with the wrong encoding.** Produces mojibake silently rather
  than an error, because most single-byte encodings accept any byte value
  (exercise 6).
- **Thinking Unicode and UTF-8 are the same thing.** Unicode is the
  catalogue of code points; UTF-8 is one specific way (among several —
  UTF-16, UTF-32 exist too) of turning those code points into bytes.
- **Assuming tokenization cost is language-neutral.** It starts being
  unequal at the byte-encoding layer, before any tokenizer vocabulary is
  even involved (exercise 4).

## Checkpoint quiz

1. What is a code point, and how is it different from an encoding?
2. Why is a Chinese character typically 3 bytes in UTF-8 while an English
   letter is 1?
3. What property of UTF-8 made it backward-compatible with ASCII?
4. How does a decoder know how many bytes make up the current character,
   reading left to right?
5. Why can a byte-level tokenizer never fail on "unknown" input?
6. What causes mojibake, and why does it happen silently rather than
   raising an error?

<details><summary>Answers</summary>

1. A code point is Unicode's unique number identifying a character
   (`U+XXXX`). An encoding is the separate rule for turning that number
   into actual stored bytes — the same code point can be encoded
   differently by UTF-8 vs. UTF-16 vs. UTF-32.
2. UTF-8 is variable-width: code points in the Basic Latin range
   (English, digits) need only 1 byte, while most CJK characters sit in a
   higher code point range that requires 3 bytes to represent.
3. Every ASCII byte (0-127) is a valid single UTF-8 byte with an
   identical meaning — so any pre-existing ASCII document is already
   valid UTF-8, unchanged.
4. The leading bits of the first byte encode the total length (`0`,
   `110`, `1110`, or `11110` for 1/2/3/4 bytes), and every continuation
   byte starts with `10` — no external length table is needed.
5. Because it operates on raw bytes (0-255), and every possible input is
   already just some sequence of bytes — there's no character that falls
   outside that range for it to fail on.
6. Bytes correctly encoded in one encoding (usually UTF-8) get decoded
   using a different one (often Latin-1). It's silent because most
   single-byte encodings map every possible byte value to *some*
   character, so no error is raised — the wrong characters are simply
   displayed.
</details>

## Further reading & sources

- [UTF-8 Everywhere](https://utf8everywhere.org/) - the manifesto-style deep dive into why UTF-8 won, with excellent diagrams of the byte-length encoding scheme.
- [The Unicode Standard](https://www.unicode.org/standard/standard.html) - the official specification; the code charts linked from here are the authoritative source for any character's code point.
- [Joel on Software: The Absolute Minimum Every Software Developer Must Know About Unicode](https://www.joelonsoftware.com/2003/10/08/the-absolute-minimum-every-software-developer-absolutely-positively-must-know-about-unicode-and-character-sets-no-excuses/) - old (2003) but still the most-cited plain-language explanation of encodings, and the origin of "mojibake" entering common developer vocabulary.
- [RFC 3629: UTF-8, a transformation format of ISO 10646](https://www.rfc-editor.org/rfc/rfc3629) - the actual specification, if you want the byte-pattern table in its original normative form.
- [Python docs: Unicode HOWTO](https://docs.python.org/3/howto/unicode.html) - the practical reference for `.encode()`/`.decode()` and common pitfalls, directly relevant to every exercise here.
- [Language Model Tokenizers Introduce Unfairness Between Languages (Petrov et al., 2023)](https://arxiv.org/abs/2305.15425) - measures exactly the byte-cost disparity from exercise 4 across real language families, downstream in actual token counts.

## Next

[Module 02: Why Not Characters, Why Not Words](../02-why-not-characters-why-not-words/README.md)
