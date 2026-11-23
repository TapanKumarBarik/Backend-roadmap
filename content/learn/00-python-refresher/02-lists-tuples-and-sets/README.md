# Module 02: Lists, Tuples and Sets

> **Prerequisites:** [Module 01](../01-strings-and-text/README.md): indexing and slicing, which work the same way here.  
> **Estimated Reading Time:** 25 minutes  
> **Who this is for:** Anyone who wants the three everyday collections clear in their head, and a rule for choosing between them.  
> **Interview relevance:** Choosing a collection and knowing its costs is a standard interview question.

> [!key]
> A **list** is an ordered collection you can change. A **tuple** is an ordered collection you cannot change. A **set** is an unordered collection with no duplicates. Choosing between them is mostly one question: *does order matter, and will it change?*

> [!note]
> List, tuple and set differ in order, mutability and cost; the traps are `None` returns, shared references from `*`, and editing a list while looping.

> [!tip]
> Say the complexity out loud: append O(1), `in list` O(n), `in set` O(1). Interviewers listen for it.

## What you will be able to do

- Add, remove and change items in a list, and know which methods return a value and which do not.
- Sort a list, by default or by a rule you choose, without damaging the original.
- Write a short list comprehension.
- Unpack a tuple into separate names.
- Use a set to remove duplicates and to compare two groups.

## 1. Lists

A list holds any number of values in order, written in square brackets. The values can be of different types, though in practice a list usually holds one kind of thing.

```python
scores = [72, 85, 90, 66]
names = ["Asha", "Ravi", "Meena"]
mixed = [1, "two", 3.0, True]
empty = []
print(scores)
print(len(names))
print(mixed)
print(empty)
```

```text
[72, 85, 90, 66]
3
[1, 'two', 3.0, True]
[]
```

Indexing and slicing work exactly as they do for strings, because both are **sequences**:

```python
scores = [72, 85, 90, 66]
print(scores[0])
print(scores[-1])
print(scores[1:3])
print(scores[::-1])
print(90 in scores)
print(scores + [100])
print([0] * 4)
```

```text
72
66
[85, 90]
[66, 90, 85, 72]
True
[72, 85, 90, 66, 100]
[0, 0, 0, 0]
```

The big difference from a string: **a list can be changed in place**.

```python
scores = [72, 85, 90, 66]
scores[0] = 75
print(scores)
```

```text
[75, 85, 90, 66]
```

## 2. Changing a list

These are the methods you will use all the time:

| Method | What it does |
|--------|--------------|
| `append(x)` | Add one item at the end |
| `insert(i, x)` | Add an item at position `i` |
| `extend(items)` | Add every item of another collection at the end |
| `remove(x)` | Remove the first item equal to `x` |
| `pop()` / `pop(i)` | Remove and **return** the last item, or the item at `i` |
| `del items[i]` | Remove the item at `i` |
| `clear()` | Remove everything |

```python
tasks = ["write", "test"]
tasks.append("deploy")
print(tasks)
tasks.insert(0, "plan")
print(tasks)
tasks.extend(["review", "release"])
print(tasks)
tasks.remove("test")
print(tasks)
last = tasks.pop()
print(last, tasks)
del tasks[0]
print(tasks)
```

```text
['write', 'test', 'deploy']
['plan', 'write', 'test', 'deploy']
['plan', 'write', 'test', 'deploy', 'review', 'release']
['plan', 'write', 'deploy', 'review', 'release']
release ['plan', 'write', 'deploy', 'review']
['write', 'deploy', 'review']
```

Notice that none of the lines that change the list print a result of their own. They change the list and return nothing (`pop` is the exception: it hands back the item it removed).

> [!pitfall]
> **`append` adds one item. `extend` adds many.** Appending a list puts the whole list in as a single item:

```python
a = [1, 2, 3]
a.append([4, 5])
print(a)

b = [1, 2, 3]
b.extend([4, 5])
print(b)
```

```text
[1, 2, 3, [4, 5]]
[1, 2, 3, 4, 5]
```

Asking for something that is not there is an error:

```python
# raises
numbers = [10, 20, 30]
numbers.remove(99)
```

```text
ValueError: list.remove(x): x not in list
```

`numbers.index(99)` fails the same way when the item is missing. Check with `in` first when that can happen: `if 99 in numbers:`.

## 3. Sorting

There are two ways, and the difference matters.

- `items.sort()` sorts the list **in place** and returns `None`.
- `sorted(items)` returns a **new** sorted list and leaves the original alone.

```python
nums = [3, 1, 2]
new_list = sorted(nums)
print(new_list, nums)

nums.sort()
print(nums)

print(sorted(nums, reverse=True))
print(max(nums), min(nums), sum(nums))
```

```text
[1, 2, 3] [3, 1, 2]
[1, 2, 3]
[3, 2, 1]
3 1 6
```

> [!pitfall]
> **`x = x.sort()` throws your list away.** `sort()` returns `None`, so the list is replaced by `None`:

```python
nums = [3, 1, 2]
nums = nums.sort()
print(nums)
```

```text
None
```

To sort by something other than the items themselves, pass a `key`: a function that turns each item into the thing to compare. `len` sorts by length, `str.lower` ignores case:

```python
words = ["banana", "apple", "Cherry", "date"]
print(sorted(words))
print(sorted(words, key=str.lower))
print(sorted(words, key=len))
```

```text
['Cherry', 'apple', 'banana', 'date']
['apple', 'banana', 'Cherry', 'date']
['date', 'apple', 'banana', 'Cherry']
```

The first line puts `Cherry` before `apple` because capitals sort before lower-case letters (Module 01). `key=str.lower` compares the lower-cased words instead, so `Cherry` finds its natural place. `key=len` sorts by length, and for words of the same length (`banana` and `Cherry`) it keeps their original order.

## 4. A first look at comprehensions

A **list comprehension** builds a new list from an old one in a single line. Read `[x * x for x in numbers]` as "`x * x` for each `x` in `numbers`":

```python
numbers = [1, 2, 3, 4, 5, 6]
print([n * n for n in numbers])
print([n for n in numbers if n % 2 == 0])
print([w.upper() for w in ["a", "b", "c"]])
print([len(w) for w in ["alpha", "be", "gamma"]])
```

```text
[1, 4, 9, 16, 25, 36]
[2, 4, 6]
['A', 'B', 'C']
[5, 2, 5]
```

Add `if` at the end to keep only some items. Module 04 returns to this; for now it is enough to recognise the shape.

## 5. Unpacking

You can spread a collection across several names in one line, as long as the counts match:

```python
point = [3, 4]
x, y = point
print(x, y)

a, b = 1, 2
a, b = b, a
print(a, b)

first, *rest = [10, 20, 30, 40]
print(first, rest)

*start, last = [10, 20, 30, 40]
print(start, last)
```

```text
3 4
2 1
10 [20, 30, 40]
[10, 20, 30] 40
```

`a, b = b, a` swaps two values with no helper variable. A name with a `*` in front soaks up "everything else" as a list.

## 6. Tuples

A tuple is written with parentheses and behaves like a list that cannot be changed:

```python
point = (3, 4)
print(point[0], point[1])
print(len(point))
print(point + (5,))
```

```text
3 4
2
(3, 4, 5)
```

```python
# raises
point = (3, 4)
point[0] = 10
```

```text
TypeError: 'tuple' object does not support item assignment
```

Two small details trip people up. A tuple of one item needs a trailing comma, because `(5)` is just the number 5 in brackets. And the parentheses are optional: the comma is what makes a tuple.

```python
print(type((5)))
print(type((5,)))
day = "Mon", 9, True
print(day)
print(type(day))
```

```text
<class 'int'>
<class 'tuple'>
('Mon', 9, True)
<class 'tuple'>
```

Why use something you cannot change? Because it states your intent: *this group of values belongs together and will not be edited*. A point `(x, y)`, a date `(year, month, day)` or a row from a database are tuples in spirit. A function that wants to return several values returns a tuple, and the caller unpacks it:

```python
def min_and_max(values):
    return min(values), max(values)

low, high = min_and_max([4, 9, 2, 7])
print(low, high)
print(min_and_max([4, 9, 2, 7]))
```

```text
2 9
(2, 9)
```

(Functions are Module 05; the point here is that `return a, b` gives back one tuple.)

## 7. Sets

A set holds values with **no duplicates** and **no order**. It is written with curly braces:

```python
tags = {"python", "web", "python", "api", "web"}
print(len(tags))
print(sorted(tags))
print("api" in tags)
```

```text
3
['api', 'python', 'web']
True
```

Five items became three, because `python` and `web` each appeared twice. We printed `sorted(tags)` because a set has no order, so there is no promise about the order it would print in.

Because a set cannot repeat anything, the quickest way to remove duplicates from a list is to pass it through one:

```python
numbers = [3, 1, 3, 2, 1, 3]
print(sorted(set(numbers)))
print(len(numbers), len(set(numbers)))
```

```text
[1, 2, 3]
6 3
```

The order is lost, though. If order matters, keep the first appearance of each item (see the exercises).

Sets also answer the questions you ask about two groups:

```python
python_people = {"Asha", "Ravi", "Meena"}
sql_people = {"Ravi", "Meena", "Dev"}

print(sorted(python_people & sql_people))
print(sorted(python_people | sql_people))
print(sorted(python_people - sql_people))
print(sorted(python_people ^ sql_people))
```

```text
['Meena', 'Ravi']
['Asha', 'Dev', 'Meena', 'Ravi']
['Asha']
['Asha', 'Dev']
```

| Operator | Meaning |
|----------|---------|
| `a & b` | In both (intersection) |
| `a \| b` | In either (union) |
| `a - b` | In `a` but not in `b` (difference) |
| `a ^ b` | In exactly one of them |

Two more facts. You cannot index a set, because there is no position to ask for. And an empty set is written `set()`, not `{}`, because `{}` is already an empty dictionary (next lesson):

```python
# raises
tags = {"a", "b"}
print(tags[0])
```

```text
TypeError: 'set' object is not subscriptable
```

```python
print(type({}))
print(type(set()))
```

```text
<class 'dict'>
<class 'set'>
```

Finally, checking `x in some_set` is very fast even for a million items, while `x in some_list` has to look at the items one by one. When you only need to ask "is this one of them?", a set is the right tool.

## 8. Choosing between them

| You need | Use |
|----------|-----|
| A sequence you will add to, remove from or reorder | **list** |
| A small fixed group of values that belong together | **tuple** |
| "Is this in the group?" or "remove duplicates" | **set** |
| Items that must be unique *and* in order | a list, checking `in` as you add |

## Common mistakes

> [!pitfall]
> **Repeating a list of lists with `*`.** This looks right and is wrong. All three rows are the **same** list:

```python
grid = [[0] * 3] * 3
grid[0][0] = 1
print(grid)
```

```text
[[1, 0, 0], [1, 0, 0], [1, 0, 0]]
```

You changed one cell and a whole column changed. `[0] * 3` made one row, and the outer `* 3` put three references to that one row in the grid. Build separate rows instead: `[[0] * 3 for _ in range(3)]`. Module 06 explains why.

> [!pitfall]
> **Removing items from a list while looping over it.** The loop skips items because the positions shift under it. Build a new list instead, with a comprehension and an `if`.

> [!pitfall]
> **Sorting mixed types.** `sorted([3, "a", 1])` is a `TypeError`, since Python will not guess whether `"a"` comes before or after `3`.

## Practice

### 1. Second largest

Find the second-largest value in `[7, 3, 9, 1, 9, 5]`, where a repeated largest value counts once.

<details>
<summary>Answer</summary>

```python
values = [7, 3, 9, 1, 9, 5]
ordered = sorted(set(values), reverse=True)
print(ordered[1])
```

```text
7
```

`set` removes the repeated 9, `sorted(..., reverse=True)` puts the biggest first, and index 1 is the second.

</details>

### 2. Remove duplicates, keep the order

Remove the duplicates from `["b", "a", "b", "c", "a"]` but keep each item's first position.

<details>
<summary>Answer</summary>

```python
items = ["b", "a", "b", "c", "a"]
seen = set()
result = []
for item in items:
    if item not in seen:
        seen.add(item)
        result.append(item)
print(result)
```

```text
['b', 'a', 'c']
```

The set `seen` answers "have I met this already?" quickly, and the list `result` keeps the order. (The `for` loop is Module 04: read it as "for each item".)

</details>

### 3. Common and unique

Two students list their favourite subjects. Print the subjects they share and the ones only the first has.

<details>
<summary>Answer</summary>

```python
first = {"maths", "physics", "art", "music"}
second = {"music", "history", "maths"}
print(sorted(first & second))
print(sorted(first - second))
```

```text
['maths', 'music']
['art', 'physics']
```

</details>

### 4. Rotate a list

Move the first item of `[1, 2, 3, 4, 5]` to the end, giving `[2, 3, 4, 5, 1]`.

<details>
<summary>Answer</summary>

```python
items = [1, 2, 3, 4, 5]
print(items[1:] + items[:1])
```

```text
[2, 3, 4, 5, 1]
```

Slice from 1 to the end, then add the slice before position 1.

</details>

## Edge cases interviewers poke at

> [!pitfall]
> **Methods that change a list return `None`, `*` copies references not objects, and a one-item tuple needs a comma.** Add "removing while looping" and you have the four classic list traps.

```python
nums = [3, 1, 2]
print(nums.sort(), nums)
print(sorted([3, 1, 2]), type((1)), type((1,)))

grid = [[0] * 2] * 2
grid[0][0] = 9
print(grid)
good = [[0] * 2 for _ in range(2)]
good[0][0] = 9
print(good)
```

```text
None [1, 2, 3]
[1, 2, 3] <class 'int'> <class 'tuple'>
[[9, 0], [9, 0]]
[[9, 0], [0, 0]]
```

- `list.sort()`, `append`, `extend`, `remove` and `reverse` change the list and return `None`. `x = x.sort()` therefore destroys your list.
- `[[0] * 2] * 2` makes **two references to one inner list**. Build rows with a comprehension so each row is a separate list.
- `(1)` is just `1` in brackets; the comma makes the tuple.

Removing items while looping over the same list skips elements, because the positions shift under the loop (below, the second `2` is never looked at):

```python
nums = [1, 2, 2, 3, 4]
for n in nums:
    if n % 2 == 0:
        nums.remove(n)
print(nums)

nums = [1, 2, 2, 3, 4]
print([n for n in nums if n % 2 != 0])
```

```text
[1, 2, 3]
[1, 3]
```

`append` adds one item, `extend` adds each item of an iterable, and `+=` on a list extends **in place** (so it is visible through every name for that list):

```python
a = [1, 2]
a.append([3, 4])
b = [1, 2]
b.extend([3, 4])
print(a, b)

x = [1]
y = x
y += [2]
print(x)
z = x
z = z + [3]
print(x, z)
```

```text
[1, 2, [3, 4]] [1, 2, 3, 4]
[1, 2]
[1, 2] [1, 2, 3]
```

A tuple is immutable, but if it *contains* a mutable object, that object can still change. Only hashable things can go in a set:

```python
t = ([1], 2)
t[0].append(99)
print(t)

print({1, 2, 2, 3}, {1, 2} | {2, 3}, {1, 2} & {2, 3}, {1, 2} - {2, 3})
```

```text
([1, 99], 2)
{1, 2, 3} {1, 2, 3} {2} {1}
```

```python
# raises
{[1, 2], 3}
```

```text
TypeError: unhashable type: 'list'
```

## Mini interview Q&A

<details>
<summary><strong>1. List vs tuple: when do you use which? [BASIC]</strong></summary>

A list is a growable, changeable sequence of similar items. A tuple is a fixed-shape record, such as `(lat, lon)` or a function returning several values. Tuples are immutable, so they can be dictionary keys and set members (if their items are hashable), and signal "this does not change".

</details>

<details>
<summary><strong>2. What is the cost of common list operations? [TRICKY]</strong></summary>

Index and `append` are O(1) (append amortised); `insert(0, x)`, `pop(0)`, `remove`, `x in lst` and slicing are O(n); `sort` is O(n log n). If you need a fast front-pop use `collections.deque`; for fast membership use a `set`.

</details>

<details>
<summary><strong>3. How do you remove duplicates and keep the order? [SCENARIO]</strong></summary>

`list(dict.fromkeys(items))`. Dictionaries remember insertion order, and keys are unique. `list(set(items))` also removes duplicates but loses the order.

</details>

<details>
<summary><strong>4. <code>sort()</code> vs <code>sorted()</code>? [BASIC]</strong></summary>

`sort()` changes the list in place and returns `None`; `sorted()` accepts any iterable and returns a new list. Both are stable (equal items keep their original order) and accept `key=` and `reverse=`.

</details>

<details>
<summary><strong>5. Why is <code>x in a_set</code> faster than <code>x in a_list</code>? [BASIC]</strong></summary>

A set uses a hash table, so membership is O(1) on average, while a list scans every element, O(n). The price: set items must be hashable and have no order.

</details>

## Cheat sheet

```text
list    [1, 2, 3]   ordered, mutable      append extend insert pop remove sort reverse
tuple   (1, 2) / (1,)  ordered, immutable   records, dict keys, multiple returns
set     {1, 2}   unordered, unique         | union  & intersection  - difference  ^ symmetric
None    sort() append() extend() remove() reverse() all return None
Copy    [x] * n repeats REFERENCES          [[0]*c for _ in range(r)] for grids
Loops   never remove from the list you are iterating -> build a new list
Costs   index/append O(1) | insert(0) pop(0) in O(n) | sort O(n log n) | set in O(1)
Unpack  a, b = b, a     first, *rest = items     for i, x in enumerate(items, 1)
```

## Check yourself

> [!check]
> - I can say which list methods change the list and which return something
> - I know the difference between `sort()` and `sorted()`, and why `x = x.sort()` is a bug
> - I can turn `["a", "b"]` into `["A", "B"]` with a comprehension
> - I can unpack `(3, 4)` into `x` and `y`, and explain why `(5)` is not a tuple
> - I can remove duplicates, and compare two groups with `&`, `|` and `-`
> - I can say when I would pick a tuple or a set instead of a list

## Further reading and sources

- [The Python Tutorial: More on Lists](https://docs.python.org/3/tutorial/datastructures.html#more-on-lists) - every list method, with the language's own examples.
- [The Python Tutorial: Tuples and Sequences, Sets](https://docs.python.org/3/tutorial/datastructures.html#tuples-and-sequences) - tuples, packing and unpacking, and sets.
- [Built-in Types: sequence and set types](https://docs.python.org/3/library/stdtypes.html#sequence-types-list-tuple-range) - the complete reference for lists, tuples and sets.
- [Sorting HOW TO](https://docs.python.org/3/howto/sorting.html) - `sort`, `sorted` and `key` functions in depth.

## Next

Next: [Dictionaries](../03-dictionaries/README.md).
