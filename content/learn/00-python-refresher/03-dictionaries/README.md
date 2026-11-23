# Module 03: Dictionaries

> **Prerequisites:** [Module 02](../02-lists-tuples-and-sets/README.md): lists, and the idea of a collection.  
> **Estimated Reading Time:** 25 minutes  
> **Who this is for:** Anyone who wants to look things up by name instead of by position, which is most of real programming.  
> **Interview relevance:** Dictionaries are the most-used structure in Python interviews: counting, grouping, caching, lookups.

> [!key]
> A **dictionary** stores **key → value** pairs and finds a value from its key almost instantly, however large it is. A list answers "what is at position 3?". A dictionary answers "what is the price of tea?".

> [!note]
> A dictionary is a hash table: average O(1) lookup, insertion-ordered, keys must be hashable; the traps are missing keys, shared default values and changing size while looping.

> [!tip]
> Almost every "count/group/dedupe" question is a dictionary (or `Counter`/`defaultdict`) question. Practise the pattern until you can type it without thinking.

## What you will be able to do

- Create a dictionary, read from it safely, and change it.
- Loop over keys, values or both.
- Count things and group things, the two jobs dictionaries do most.
- Model a record, and a list of records, and sort them.
- Say why a list cannot be a key.

## 1. Creating and reading

A dictionary is written in curly braces, each entry as `key: value`:

```python
prices = {"tea": 2.5, "coffee": 3.75, "water": 1.0}
print(prices)
print(prices["coffee"])
print(len(prices))
print("tea" in prices)
print("juice" in prices)
```

```text
{'tea': 2.5, 'coffee': 3.75, 'water': 1.0}
3.75
3
True
False
```

`in` checks the **keys**, not the values. Asking for a key that is not there is an error:

```python
# raises
prices = {"tea": 2.5, "coffee": 3.75}
print(prices["juice"])
```

```text
KeyError: 'juice'
```

`KeyError` is one of the errors you will meet most often. The safe way to read is `get`, which returns `None` (or a default you choose) instead of failing:

```python
prices = {"tea": 2.5, "coffee": 3.75}
print(prices.get("tea"))
print(prices.get("juice"))
print(prices.get("juice", 0))
```

```text
2.5
None
0
```

Use `prices["tea"]` when a missing key would be a bug and you want to hear about it. Use `prices.get("tea")` when a missing key is normal.

## 2. Changing a dictionary

Assigning to a key either adds it or replaces it, depending on whether it exists:

```python
stock = {"apples": 5}
stock["pears"] = 3
stock["apples"] = 8
print(stock)

stock.update({"plums": 10, "pears": 4})
print(stock)

removed = stock.pop("plums")
print(removed, stock)

del stock["apples"]
print(stock)
```

```text
{'apples': 8, 'pears': 3}
{'apples': 8, 'pears': 4, 'plums': 10}
10 {'apples': 8, 'pears': 4}
{'pears': 4}
```

Dictionaries remember the order in which keys were added, and that is guaranteed. But you still look things up by key, not by position.

## 3. Looping over a dictionary

Three views of the same data: `keys()`, `values()` and `items()`, the last giving `(key, value)` pairs that you can unpack straight away.

```python
prices = {"tea": 2.5, "coffee": 3.75, "water": 1.0}

for name in prices:
    print(name)

print(list(prices.values()))
print(sum(prices.values()))

for name, price in prices.items():
    print(f"{name:<8}{price:>6.2f}")
```

```text
tea
coffee
water
[2.5, 3.75, 1.0]
7.25
tea       2.50
coffee    3.75
water     1.00
```

Looping over a dictionary directly gives its **keys**. (The `for` loop gets its own lesson, Module 04.)

## 4. Counting things

Counting is the classic dictionary job: the keys are the things, the values are how many.

```python
text = "the cat and the hat and the bat"
counts = {}
for word in text.split():
    counts[word] = counts.get(word, 0) + 1
print(counts)
```

```text
{'the': 3, 'cat': 1, 'and': 2, 'hat': 1, 'bat': 1}
```

The key line is `counts.get(word, 0) + 1`: take the current count (0 if we have not seen the word), add one, store it. Python has a ready-made tool for exactly this in the `collections` module:

```python
from collections import Counter

text = "the cat and the hat and the bat"
counts = Counter(text.split())
print(counts["the"])
print(counts["dog"])
print(counts.most_common(2))
```

```text
3
0
[('the', 3), ('and', 2)]
```

A `Counter` is a dictionary that returns 0 for a missing key instead of failing, and `most_common(n)` gives the `n` biggest as a list of pairs.

## 5. Grouping things

Grouping is counting's sibling: each key holds a **list** of the items that belong to it.

```python
words = ["apple", "avocado", "banana", "blueberry", "cherry"]
groups = {}
for word in words:
    first = word[0]
    if first not in groups:
        groups[first] = []
    groups[first].append(word)
print(groups)
```

```text
{'a': ['apple', 'avocado'], 'b': ['banana', 'blueberry'], 'c': ['cherry']}
```

The `if first not in groups` check makes a fresh empty list the first time a letter appears. `defaultdict` does that step for you:

```python
from collections import defaultdict

words = ["apple", "avocado", "banana", "blueberry", "cherry"]
groups = defaultdict(list)
for word in words:
    groups[word[0]].append(word)
print(dict(groups))
```

```text
{'a': ['apple', 'avocado'], 'b': ['banana', 'blueberry'], 'c': ['cherry']}
```

`defaultdict(list)` says "when a key is missing, start it as an empty list". There is a counting version too: `defaultdict(int)` starts missing keys at 0.

## 6. Records and lists of records

A dictionary is a natural way to describe one thing with several named facts, and a list of dictionaries describes many of them. Data from web APIs and databases looks like this all the time.

```python
person = {"name": "Asha", "age": 30, "skills": ["python", "sql"]}
print(person["name"])
print(person["skills"][0])
person["age"] = 31
print(person)
```

```text
Asha
python
{'name': 'Asha', 'age': 31, 'skills': ['python', 'sql']}
```

Square brackets chain: `person["skills"][0]` first gets the list, then its first item.

```python
people = [
    {"name": "Asha", "age": 30},
    {"name": "Ravi", "age": 24},
    {"name": "Meena", "age": 35},
]

print([p["name"] for p in people])

youngest_first = sorted(people, key=lambda p: p["age"])
print([p["name"] for p in youngest_first])

over_25 = [p["name"] for p in people if p["age"] > 25]
print(over_25)
```

```text
['Asha', 'Ravi', 'Meena']
['Ravi', 'Asha', 'Meena']
['Asha', 'Meena']
```

`lambda p: p["age"]` is a tiny nameless function that takes a person and returns their age; `sorted` calls it on each person to decide the order. Functions are Module 05, and you can treat the `lambda` as "sort by this".

## 7. Building one dictionary from another

A **dictionary comprehension** is the list comprehension from Module 02 with `key: value`:

```python
names = ["tea", "coffee", "water"]
print({name: len(name) for name in names})

prices = {"tea": 2.5, "coffee": 3.75}
print({name: price * 2 for name, price in prices.items()})

codes = {"IN": "India", "FR": "France"}
print({country: code for code, country in codes.items()})
```

```text
{'tea': 3, 'coffee': 6, 'water': 5}
{'tea': 5.0, 'coffee': 7.5}
{'India': 'IN', 'France': 'FR'}
```

The last line swaps keys and values. That only works when the values are unique and can be used as keys.

To combine two dictionaries, use `|` (the right side wins when both have a key):

```python
defaults = {"theme": "light", "language": "en"}
mine = {"theme": "dark"}
print(defaults | mine)
```

```text
{'theme': 'dark', 'language': 'en'}
```

## 8. What can be a key

Keys must be **hashable**, which in practice means they cannot be changed after they are created: strings, numbers and tuples (of hashable things) are fine. Lists, sets and dictionaries are not.

```python
grid = {(0, 0): "start", (2, 3): "goal"}
print(grid[(2, 3)])
```

```text
goal
```

```python
# raises
print(hash([1, 2]))
```

```text
TypeError: unhashable type: 'list'
```

`hash` is the function a dictionary uses to work out where to file a key, and a list refuses to have one. Writing `{[1, 2]: "x"}` fails for exactly that reason (newer Pythons word the message a little differently). A dictionary files each key by a number worked out from its contents. If a key could change, it would end up in the wrong place and could never be found again. A tuple of coordinates makes a good key for a grid, a map or a game board.

## Common mistakes

> [!pitfall]
> **Reading a missing key with brackets.** `counts[word] += 1` fails with a `KeyError` the first time a word appears, because there is nothing to add to yet. Use `counts.get(word, 0) + 1`, a `Counter`, or a `defaultdict(int)`.

> [!pitfall]
> **Changing a dictionary while looping over it.** Adding or removing keys during a loop raises `RuntimeError: dictionary changed size during iteration`. Loop over a copy of the keys, `list(d)`, or build a new dictionary.

> [!pitfall]
> **Writing `{}` and expecting a set.** An empty `{}` is an empty dictionary. An empty set is `set()`.

> [!pitfall]
> **Looking something up by its value.** Dictionaries are built to go from key to value. To go the other way you have to check every entry, which is slow on a big dictionary. If you need both directions, keep a second, reversed dictionary.

## Practice

### 1. Word frequency

Count how often each word appears in `"to be or not to be"`, and print the words with a count of more than one.

<details>
<summary>Answer</summary>

```python
text = "to be or not to be"
counts = {}
for word in text.split():
    counts[word] = counts.get(word, 0) + 1

repeated = {word: n for word, n in counts.items() if n > 1}
print(counts)
print(repeated)
```

```text
{'to': 2, 'be': 2, 'or': 1, 'not': 1}
{'to': 2, 'be': 2}
```

</details>

### 2. Group by length

Group `["a", "to", "be", "the", "cat", "is"]` by word length, giving a dictionary from length to a list of words.

<details>
<summary>Answer</summary>

```python
from collections import defaultdict

words = ["a", "to", "be", "the", "cat", "is"]
by_length = defaultdict(list)
for word in words:
    by_length[len(word)].append(word)
print(dict(by_length))
```

```text
{1: ['a'], 2: ['to', 'be', 'is'], 3: ['the', 'cat']}
```

The keys here are numbers, not strings: any hashable value works.

</details>

### 3. Merge two shopping lists

Add up the quantities from two shopping lists, where an item on both lists has its quantities added.

<details>
<summary>Answer</summary>

```python
first = {"milk": 1, "eggs": 12, "bread": 1}
second = {"eggs": 6, "tea": 1, "milk": 2}

total = dict(first)
for item, quantity in second.items():
    total[item] = total.get(item, 0) + quantity
print(total)
```

```text
{'milk': 3, 'eggs': 18, 'bread': 1, 'tea': 1}
```

`dict(first)` makes a copy, so `first` is not changed. (Copies are the subject of Module 06.)

</details>

### 4. First non-repeating character

Find the first character in `"swiss"` that appears only once.

<details>
<summary>Answer</summary>

```python
word = "swiss"
counts = {}
for letter in word:
    counts[letter] = counts.get(letter, 0) + 1

answer = None
for letter in word:
    if counts[letter] == 1:
        answer = letter
        break
print(answer)
```

```text
w
```

Count every letter first, then walk the word in order and stop at the first letter whose count is 1. (`break` ends the loop early; it is part of Module 04.)

</details>

## Edge cases interviewers poke at

> [!pitfall]
> **Reading a missing key raises, `defaultdict` *creates* keys when you merely look, `fromkeys` shares one value, and you cannot change a dictionary's size while looping over it.**

```python
prices = {"tea": 2.5}
print(prices.get("coffee"), prices.get("coffee", 0), "coffee" in prices)

from collections import defaultdict
seen = defaultdict(list)
seen["a"]            # just looking...
print(dict(seen))    # ...created the key

shared = dict.fromkeys(["x", "y"], [])
shared["x"].append(1)
print(shared)
fresh = {k: [] for k in ["x", "y"]}
fresh["x"].append(1)
print(fresh)
```

```text
None 0 False
{'a': []}
{'x': [1], 'y': [1]}
{'x': [1], 'y': []}
```

```python
# raises
d = {"a": 1, "b": 2}
for key in d:
    if d[key] == 1:
        del d[key]
```

```text
RuntimeError: dictionary changed size during iteration
```

Safe ways to remove while looping: loop over a **copy of the keys** or build a new dictionary.

```python
d = {"a": 1, "b": 2, "c": 1}
for key in list(d):
    if d[key] == 1:
        del d[key]
print(d)

e = {"a": 1, "b": 2, "c": 1}
print({k: v for k, v in e.items() if v != 1})
```

```text
{'b': 2}
{'b': 2}
```

Keys must be hashable, and equal keys collapse into one (`1`, `1.0` and `True` are all "the same" key):

```python
print({1: "int", 1.0: "float", True: "bool"})
print({(1, 2): "tuple key works"})
```

```text
{1: 'bool'}
{(1, 2): 'tuple key works'}
```

```python
# raises
{[1, 2]: "list key"}
```

```text
TypeError: unhashable type: 'list'
```

```python
original = {"tags": ["a"], "n": 1}
shallow = original.copy()
shallow["tags"].append("b")
shallow["n"] = 2
print(original)
```

```text
{'tags': ['a', 'b'], 'n': 1}
```

> [!tip]
> `.copy()` is **shallow**: the new dictionary shares the inner list. Use `copy.deepcopy` when values are themselves mutable and you need independence (see Module 06).

## Mini interview Q&A

<details>
<summary><strong>1. How does a dictionary find a value so fast? [BASIC]</strong></summary>

It is a **hash table**: Python computes `hash(key)`, uses it to jump to a slot, and compares keys there. Average lookup, insert and delete are O(1) regardless of size. That is why keys must be hashable and why a dictionary beats a list scan for lookups.

</details>

<details>
<summary><strong>2. Are dictionaries ordered? [TRICKY]</strong></summary>

Yes: since Python 3.7 they preserve **insertion order** (guaranteed by the language). Updating an existing key keeps its position; deleting and re-adding moves it to the end. Equality ignores order: `{"a": 1, "b": 2} == {"b": 2, "a": 1}`.

</details>

<details>
<summary><strong>3. <code>d[key]</code>, <code>d.get(key)</code> or <code>try/except KeyError</code>? [BASIC]</strong></summary>

`d[key]` when the key must exist (a `KeyError` is a bug signal). `d.get(key, default)` when absence is normal. `try/except KeyError` when the common path has the key and you want to avoid two lookups, or need to run other code on a miss.

</details>

<details>
<summary><strong>4. Count the words in a text. Then find the top three. [SCENARIO]</strong></summary>

`from collections import Counter; counts = Counter(text.split()); counts.most_common(3)`. Without the library: `counts[w] = counts.get(w, 0) + 1` in a loop, then `sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:3]`.

</details>

<details>
<summary><strong>5. How do you merge two dictionaries? [BASIC]</strong></summary>

`merged = a | b` (3.9+) or `{**a, **b}`. If a key appears in both, the **right-hand** value wins. `a.update(b)` does the same but changes `a` in place.

</details>

## Cheat sheet

```text
Create     {"a": 1}  dict(a=1)  {k: v for ...}  dict(zip(keys, values))
Read       d[k] (KeyError)   d.get(k, default)   k in d   d.items() / keys() / values()
Change     d[k] = v   d.update(other)   d.pop(k, None)   del d[k]   d.setdefault(k, [])
Merge      a | b   {**a, **b}  (right side wins)
Count      collections.Counter(items).most_common(n)       Group  defaultdict(list)
Keys       hashable only: str, int, float, bool, tuple of hashables   (1 == 1.0 == True)
Order      insertion order (3.7+), equality ignores order
Traps      change size while looping -> loop over list(d) | .copy() is shallow
           fromkeys(keys, []) shares one list | defaultdict creates on read
```

## Check yourself

> [!check]
> - I can explain the difference between `d["x"]` and `d.get("x")`
> - I can add, change and remove a key
> - I can loop over a dictionary's keys, values and items
> - I can count items with `get`, or with `Counter`
> - I can group items into lists with a dictionary
> - I can say why a list cannot be a dictionary key and a tuple can

## Further reading and sources

- [The Python Tutorial: Dictionaries](https://docs.python.org/3/tutorial/datastructures.html#dictionaries) - the language's own introduction.
- [Built-in Types: Mapping Types, dict](https://docs.python.org/3/library/stdtypes.html#mapping-types-dict) - every dictionary method and operator.
- [collections: Counter and defaultdict](https://docs.python.org/3/library/collections.html) - the two helpers used in this lesson.

## Next

Next: [Decisions and loops](../04-decisions-and-loops/README.md).
