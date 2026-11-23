# Module 01: Strings and Text

> **Prerequisites:** [Module 00](../00-running-python-values-and-types/README.md): values, variables and f-strings.  
> **Estimated Reading Time:** 20 minutes  
> **Who this is for:** Anyone who has used strings before and wants the rules and the everyday methods back in their head.  
> **Interview relevance:** Strings come up in nearly every coding screen: slicing, immutability, `join`, Unicode.

> [!key]
> A string is an **ordered** sequence of characters that you **never change**. Ordered means every character has a position you can ask for. Never changed means every "change" makes a *new* string and leaves the old one alone.

> [!note]
> Strings are immutable ordered sequences; every method returns a new string, slices never raise, and `len` counts characters, not bytes.

> [!tip]
> When asked to build a string in a loop, answer "collect and `join`". It is the one-line answer that shows you understand immutability.

## What you will be able to do

- Pick out any character or piece of a string by its position.
- Clean up messy text with `strip`, `split`, `join` and `replace`.
- Format numbers and columns neatly with f-strings.
- Explain why `name.upper()` on its own line changes nothing.

## 1. Making strings

Single or double quotes make the same string. Use whichever lets you avoid escaping:

```python
a = "It's easy"
b = 'She said "hello"'
c = "A tab:\there, and a new line:\nthere"
print(a)
print(b)
print(c)
```

```text
It's easy
She said "hello"
A tab:	here, and a new line:
there
```

A backslash starts an **escape sequence**: `\n` is a new line, `\t` is a tab, `\\` is one backslash. For text with many backslashes, such as a Windows path, put an `r` in front to make a **raw string** where backslashes mean nothing special:

```python
print(r"C:\users\new_folder")
```

```text
C:\users\new_folder
```

Triple quotes make a string that can run over several lines:

```python
poem = """Roses are red,
Violets are blue."""
print(poem)
print(len(poem))
```

```text
Roses are red,
Violets are blue.
32
```

`len` counts characters, and that includes the new line between the two lines. Two more things work on strings: `+` joins them and `*` repeats them.

```python
print("ab" + "cd")
print("ab" * 3)
print("-" * 20)
print("py" in "python")
```

```text
abcd
ababab
--------------------
True
```

## 2. Positions: indexing and slicing

Each character has a position called an **index**, counted from 0 on the left, and also from -1 on the right:

```
  P    y    t    h    o    n
  0    1    2    3    4    5        counting from the left
 -6   -5   -4   -3   -2   -1        counting from the right
```

```python
word = "Python"
print(word[0])
print(word[5])
print(word[-1])
print(word[-2])
```

```text
P
n
n
o
```

A **slice** takes a piece. `word[start:stop]` gives the characters from `start` up to, but **not including**, `stop`:

```python
word = "Python"
print(word[0:2])
print(word[2:])
print(word[:3])
print(word[-3:])
print(word[::2])
print(word[::-1])
```

```text
Py
thon
Pyt
hon
Pto
nohtyP
```

Read these as: `[0:2]` is positions 0 and 1; `[2:]` is everything from 2 to the end; `[:3]` is everything before 3; `[-3:]` is the last three; `[::2]` is every second character; and `[::-1]` steps backwards, which reverses the string.

> [!model]
> Think of the numbers as pointing at the **gaps between** characters, not at the characters themselves. `word[0:2]` runs from the gap before `P` to the gap after `y`. That is why "stop is not included" and why `word[:2] + word[2:]` always gives back the whole word.

A slice that goes past the end is forgiven; a single index is not:

```python
# raises
word = "Python"
print(word[10])
```

```text
IndexError: string index out of range
```

```python
word = "Python"
print(word[2:100])
```

```text
thon
```

## 3. Strings never change

You cannot assign to a position:

```python
# raises
word = "Python"
word[0] = "J"
```

```text
TypeError: 'str' object does not support item assignment
```

To "change" a string you build a new one and, usually, give the same name to it:

```python
word = "Python"
word = "J" + word[1:]
print(word)
```

```text
Jython
```

This is the single most useful fact about strings, and it explains the most common beginner bug:

> [!pitfall]
> **A method returns a new string; it does not change the old one.** Writing `name.upper()` on a line by itself throws the result away.

```python
name = "asha"
name.upper()
print(name)
name = name.upper()
print(name)
```

```text
asha
ASHA
```

## 4. The methods you will actually use

A **method** is a function that belongs to a value, written `value.method()`. These are the ones worth knowing by heart:

| Method | What it does | Example | Result |
|--------|--------------|---------|--------|
| `lower()` / `upper()` | Change case | `"Hi".lower()` | `'hi'` |
| `title()` | Capitalise each word | `"ada lovelace".title()` | `'Ada Lovelace'` |
| `strip()` | Remove spaces at both ends | `"  hi  ".strip()` | `'hi'` |
| `split()` | Break into a list of words | `"a b  c".split()` | `['a', 'b', 'c']` |
| `split(",")` | Break at a separator | `"1,2,3".split(",")` | `['1', '2', '3']` |
| `",".join(list)` | Glue a list of strings together | `"-".join(["a", "b"])` | `'a-b'` |
| `replace(old, new)` | Replace every occurrence | `"aXbX".replace("X", "-")` | `'a-b-'` |
| `startswith(x)` / `endswith(x)` | Test the start or end | `"data.csv".endswith(".csv")` | `True` |
| `count(x)` | How many times | `"banana".count("a")` | `3` |
| `find(x)` | Position of the first match, or -1 | `"banana".find("n")` | `2` |

Try some of them:

```python
text = "  Hello, World  "
print(text.strip())
print(text.strip().lower())
print(text.strip().replace("World", "Python"))
print("banana".count("a"), "banana".find("n"), "banana".find("z"))
print("data.csv".endswith(".csv"), "data.csv".startswith("report"))
```

```text
Hello, World
hello, world
Hello, Python
3 2 -1
True False
```

Notice that methods can be **chained**: `text.strip().lower()` strips first, then lowers the result.

`split` and `join` are opposites, and together they solve a large share of text problems:

```python
date = "2024-05-17"
parts = date.split("-")
print(parts)
print("/".join(reversed(parts)))

sentence = "the quick  brown   fox"
print(sentence.split())
print(" ".join(sentence.split()))
```

```text
['2024', '05', '17']
17/05/2024
['the', 'quick', 'brown', 'fox']
the quick brown fox
```

`split()` with no argument splits on any run of whitespace and ignores extra spaces. That makes `" ".join(text.split())` the standard way to tidy spacing.

## 5. f-strings, properly

You met f-strings in Module 00. After the colon you can control **width**, **alignment** and **number format**:

```python
name = "Tea"
price = 2.5
print(f"[{name:<8}]")
print(f"[{name:>8}]")
print(f"[{name:^8}]")
print(f"{price:.2f}")
print(f"{7:03d}")
print(f"{1234567.891:,.2f}")
print(f"{0.256:.1%}")
```

```text
[Tea     ]
[     Tea]
[  Tea   ]
2.50
007
1,234,567.89
25.6%
```

`<`, `>` and `^` align left, right and centre inside the width you give. `.2f` is two decimals, `03d` pads a whole number with zeros to width 3, `,` adds thousands separators, and `%` multiplies by 100 and adds a percent sign. Together they make a neat table:

```python
rows = [("Tea", 2.5, 3), ("Coffee", 3.75, 2), ("Water", 1.0, 10)]
print(f"{'Item':<8}{'Price':>8}{'Qty':>5}")
for item, price, qty in rows:
    print(f"{item:<8}{price:>8.2f}{qty:>5}")
```

```text
Item       Price  Qty
Tea         2.50    3
Coffee      3.75    2
Water       1.00   10
```

(The `for` loop gets its own lesson, Module 04. For now read it as "do this once for each row".)

## 6. Building a string from many pieces

If you have a list of pieces, join them once instead of adding them one at a time:

```python
words = ["alpha", "beta", "gamma"]
print(", ".join(words))

# The slow-looking way, which also works:
result = ""
for word in words:
    result = result + word + " "
print(result.strip())
```

```text
alpha, beta, gamma
alpha beta gamma
```

Both work. `join` is clearer and does not build a brand-new string on every step, so it is the habit to form.

## 7. Characters are numbers underneath

Every character has a numeric code. `ord` gives the code and `chr` goes back:

```python
print(ord("A"), ord("a"), chr(97))
print("apple" < "banana")
print("Zebra" < "apple")
print("Zebra".lower() < "apple".lower())
```

```text
65 97 a
True
True
False
```

Strings compare by those codes, character by character. Every capital letter has a smaller code than every lower-case letter, so `"Zebra"` sorts *before* `"apple"`. When you compare text from people, lower-case both sides first.

## Common mistakes

> [!pitfall]
> **Forgetting the stop is excluded.** `word[0:2]` is two characters, not three. If a slice is one character short, add one to the stop.

> [!pitfall]
> **Comparing text with `is`.** Use `==` for text (and numbers). `is` asks whether two names point at the very same object, which is a different question you will meet in Module 06.

> [!pitfall]
> **Thinking `input()` gives a number.** It always returns text, so `age = input()` followed by `age + 1` fails. Convert first: `age = int(input())`.

## Practice

### 1. Tidy a name

Turn `"  mARY   jane watson "` into `"Mary Jane Watson"`.

<details>
<summary>Answer</summary>

```python
raw = "  mARY   jane watson "
print(" ".join(raw.split()).title())
```

```text
Mary Jane Watson
```

`split()` drops the extra spaces, `join` puts back one space between words, and `title()` capitalises each word.

</details>

### 2. Palindrome

A palindrome reads the same forwards and backwards. Write code that decides whether `"A man a plan a canal Panama"` is one, ignoring case and spaces.

<details>
<summary>Answer</summary>

```python
sentence = "A man a plan a canal Panama"
letters = sentence.replace(" ", "").lower()
print(letters == letters[::-1])
```

```text
True
```

Remove the spaces, lower-case everything, and compare the text with its own reverse (`[::-1]`).

</details>

### 3. Count the vowels

How many vowels (`aeiou`) are in `"Programming is fun"`?

<details>
<summary>Answer</summary>

```python
text = "Programming is fun".lower()
total = 0
for vowel in "aeiou":
    total = total + text.count(vowel)
print(total)
```

```text
5
```

Count each vowel with `count` and add them up. (Loops are Module 04; you can also solve this with `sum(...)` once you know comprehensions.)

</details>

### 4. Mask a card number

Show only the last four digits of `"1234567812345678"`, with `*` for the rest.

<details>
<summary>Answer</summary>

```python
card = "1234567812345678"
print("*" * (len(card) - 4) + card[-4:])
```

```text
************5678
```

</details>

## Edge cases interviewers poke at

> [!pitfall]
> **`len` counts characters, not bytes; slices never raise; `split()` and `split(" ")` are different; `strip("ab")` strips a *set* of characters.** Each of these has caught experienced programmers.

```python
s = "héllo 🙂"
print(len(s), len(s.encode("utf-8")))
print("  a  b ".split(), "  a  b ".split(" "))
print("xxhixx".strip("x"), "abcba".lstrip("ba"))
print(repr("abc"[5:]), repr("abc"[-10:2]))
```

```text
7 11
['a', 'b'] ['', '', 'a', '', 'b', '']
hi cba
'' 'ab'
```

- `len` is the number of **characters** (code points); the UTF-8 encoding is longer because accents and emoji need several bytes. This matters for file sizes, network limits and database columns.
- `split()` with no argument splits on any run of whitespace and drops empties; `split(" ")` keeps an empty string for every extra space.
- `strip`, `lstrip` and `rstrip` take a **set of characters** to remove, not a prefix. Use `removeprefix`/`removesuffix` (3.9+) to cut an exact piece.
- Out-of-range *slices* quietly give a shorter result; an out-of-range *index* raises `IndexError`.

Strings are immutable, so "changing" one always builds a new one:

```python
# raises
word = "cat"
word[0] = "b"
```

```text
TypeError: 'str' object does not support item assignment
```

```python
word = "cat"
shout = word.upper()
print(word, shout)
print("b" + word[1:])
print("a" < "B", "a" < "b", sorted(["b", "A", "a"]))
print(sorted(["b", "A", "a"], key=str.lower))
```

```text
cat CAT
bat
False True ['A', 'a', 'b']
['A', 'a', 'b']
```

> [!tip]
> Comparison is by code point, so every capital letter sorts before every lowercase one. For human-friendly ordering use `key=str.lower` (or `str.casefold` for international text).

## Mini interview Q&A

<details>
<summary><strong>1. Are strings mutable? What does that imply? [BASIC]</strong></summary>

No. Every "modification" (`upper`, `replace`, `+`) returns a **new** string. They are therefore hashable (usable as dict keys) and safe to share, but building a big string with `+=` in a loop copies repeatedly. Collect the pieces in a list and `"".join(pieces)` once.

</details>

<details>
<summary><strong>2. How do slices work, and what does <code>s[::-1]</code> do? [BASIC]</strong></summary>

`s[start:stop:step]`: `start` is included, `stop` is excluded, both default to the ends, and negative numbers count from the end. `s[::-1]` is a step of -1 over the whole string, so it reverses it (as a copy).

</details>

<details>
<summary><strong>3. f-string, <code>format()</code> or <code>%</code>? [BASIC]</strong></summary>

f-strings: clearest and fastest, and they accept expressions and format specs (`{x:.2f}`, `{n:,}`). `str.format` helps when the template is stored separately from the values. `%` is legacy. For logging, pass arguments to the logger instead of pre-formatting.

</details>

<details>
<summary><strong>4. How do you check whether a string is a palindrome ignoring case and punctuation? [SCENARIO]</strong></summary>

Normalise first, then compare with the reverse: `clean = "".join(c.lower() for c in s if c.isalnum())` and `clean == clean[::-1]`. Mention the cost: O(n) time and O(n) extra space; a two-pointer loop avoids the copy.

</details>

<details>
<summary><strong>5. What is the difference between <code>str</code> and <code>bytes</code>? [TRICKY]</strong></summary>

`str` is text (Unicode code points); `bytes` is raw 8-bit data. Convert with `.encode("utf-8")` and `.decode("utf-8")`. Always pass an explicit encoding when opening text files, because the default depends on the machine.

</details>

## Cheat sheet

```text
Index / slice   s[0] s[-1] s[a:b] s[::2] s[::-1]      slices never raise, indexes do
Immutable       every method returns a NEW string      join pieces: "".join(list)
Everyday        upper lower strip split join replace find startswith endswith in
Exact cuts      removeprefix / removesuffix            strip(chars) removes a SET of chars
split()         any whitespace run, no empties         split(" ") keeps empties
f-string        f"{x:.2f}" f"{n:,}" f"{x!r}" f"{a+b}" f"{name:>10}"
Unicode         len = characters, not bytes            .encode("utf-8") / .decode("utf-8")
Sort text       sorted(words, key=str.lower)           capitals sort before lowercase
```

## Check yourself

> [!check]
> - I can say which character `word[-1]` and which piece `word[1:3]` give
> - I can explain why `name.upper()` alone does not change `name`
> - I can turn `"a, b, c"` into a list and back into a string
> - I can format a price with two decimals and a right-aligned column
> - I know that strings are compared by character code, so case matters

## Further reading and sources

- [The Python Tutorial: Text](https://docs.python.org/3/tutorial/introduction.html#text) - strings, indexing and slicing from the language's own tutorial.
- [Text Sequence Type: string methods](https://docs.python.org/3/library/stdtypes.html#string-methods) - every string method, with exact behaviour.
- [Format specification mini-language](https://docs.python.org/3/library/string.html#format-specification-mini-language) - the full list of what can follow the colon in an f-string.

## Next

Next: [Lists, tuples and sets](../02-lists-tuples-and-sets/README.md).
