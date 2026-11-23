# Module 06: Names, References and Mutability

> **Prerequisites:** [Module 05](../05-functions/README.md): functions, and what happens when you pass a list into one.  
> **Estimated Reading Time:** 25 minutes  
> **Who this is for:** Anyone who has been surprised by a list that changed when they did not expect it to. This is the most important lesson in the track.  
> **Interview relevance:** The single most-asked Python fundamentals topic: aliasing, `is` vs `==`, shallow vs deep copy.

> [!key]
> A variable is **not a box that holds a value**. It is a **name stuck onto an object**. `b = a` does not copy the object; it sticks a second name on the *same* object. Whether that matters depends on one thing: can the object be changed in place?

> [!note]
> Variables are names attached to objects; assignment never copies. Whether a change is visible through another name depends only on mutability.

> [!tip]
> Draw boxes and arrows on paper for every aliasing question: names on the left, objects on the right. It makes the answer obvious.

## What you will be able to do

- Draw what `b = a` does, and predict when a change through `b` shows up in `a`.
- Tell mutable types from immutable ones.
- Explain `is` versus `==`.
- Make a real copy, shallow or deep, and know which one you need.
- Explain what happens to a list you pass into a function.

## 1. Names and objects

Every value in Python is an **object** that lives somewhere in memory. A variable is a name that **points at** one object.

```python
a = [1, 2, 3]
b = a
print(a, b)
```

```text
[1, 2, 3] [1, 2, 3]
```

After `b = a` there is still only **one** list. It has two names:

```
     a ───┐
          ├──▶  [1, 2, 3]
     b ───┘
```

So a change made through either name is a change to the one list, and both names see it:

```python
a = [1, 2, 3]
b = a
b.append(4)
print(a)
print(b)
```

```text
[1, 2, 3, 4]
[1, 2, 3, 4]
```

You appended to `b`, and `a` changed too, because `a` and `b` are the same list. This is called **aliasing**, and it is the source of a huge share of beginner bugs.

## 2. Same object, or just equal?

Two operators ask two different questions:

- `==` asks: *do these have the same value?*
- `is` asks: *are these the very same object?*

```python
a = [1, 2, 3]
b = a
c = [1, 2, 3]

print(a == b, a is b)
print(a == c, a is c)
```

```text
True True
True False
```

`c` is a **separate** list that happens to hold the same items, so it is equal to `a` but is not `a`. Use `==` to compare values. Use `is` almost only for `None`, as in `if x is None:`.

> [!pitfall]
> **Do not use `is` to compare numbers or text.** It sometimes appears to work, because Python reuses some small objects behind the scenes, and then fails on other values or other machines. `==` always means what you want.

## 3. Mutable and immutable

An object is **mutable** if it can be changed after it is created, and **immutable** if it cannot.

| Immutable (cannot change) | Mutable (can change in place) |
|---------------------------|-------------------------------|
| `int`, `float`, `bool` | `list` |
| `str` | `dict` |
| `tuple` | `set` |
| `None`, `frozenset` | most objects you define yourself |

Aliasing only causes surprises with **mutable** objects. You cannot change an immutable object, so sharing it is harmless:

```python
x = 5
y = x
y = y + 1
print(x, y)
```

```text
5 6
```

`y + 1` does not change the number 5. It makes a *new* number, 6, and points `y` at it. `x` still points at 5:

```
 before:   x ──▶ 5          after y = y + 1:   x ──▶ 5
           y ──┘                               y ──▶ 6
```

Strings behave the same way. Every "change" makes a new string and moves the name:

```python
s = "abc"
t = s
s = s + "d"
print(s, t)
```

```text
abcd abc
```

The same operation on a **list** can go either way, and that is worth seeing, because `+=` is not always the same as `= ... +`:

```python
a = [1, 2]
b = a
a = a + [3]
print(a, b)

c = [1, 2]
d = c
c += [3]
print(c, d)
```

```text
[1, 2, 3] [1, 2]
[1, 2, 3] [1, 2, 3]
```

`a = a + [3]` builds a **new** list and points `a` at it, so `b` keeps the old one. `c += [3]` changes the existing list in place, so `d` sees it. Same-looking line, different result.

A tuple cannot change, but it can **contain** a mutable object, and that object can:

```python
t = ([1, 2], "fixed")
t[0].append(3)
print(t)
```

```text
([1, 2, 3], 'fixed')
```

The tuple still points at the same list, which is what immutable means for a tuple. The list changed inside it.

## 4. Making a real copy

When you want a separate list to change freely, copy it. There are several ways, all giving the same result for a simple list:

```python
a = [1, 2, 3]
b = a.copy()
c = list(a)
d = a[:]

b.append(99)
print(a)
print(b, a is b, a == [1, 2, 3])
```

```text
[1, 2, 3]
[1, 2, 3, 99] False True
```

`a` is untouched. For dictionaries and sets, `.copy()` and `dict(d)` do the same job.

### Shallow versus deep

Those copies are **shallow**: they make a new outer list, but the items inside are the **same objects**. When the items are numbers or text that is fine. When they are lists or dictionaries, the copy and the original share them:

```python
original = [[1, 2], [3, 4]]
shallow = original.copy()
shallow[0].append(99)
print(original)
```

```text
[[1, 2, 99], [3, 4]]
```

You copied the list, and the inner list still changed in the original. The picture shows why:

```
 original ──▶ [  ●  ,  ●  ]
                 │     │
                 ▼     ▼
              [1, 2] [3, 4]        two inner lists, shared
                 ▲     ▲
                 │     │
 shallow  ──▶ [  ●  ,  ●  ]
```

The copy is a new outer list, but both outer lists point at the same two inner lists.

A **deep copy** copies everything all the way down. It lives in the `copy` module:

```python
import copy

original = [[1, 2], [3, 4]]
deep = copy.deepcopy(original)
deep[0].append(99)
print(original)
print(deep)
```

```text
[[1, 2], [3, 4]]
[[1, 2, 99], [3, 4]]
```

Rule of thumb: for a flat list of numbers or text, a shallow copy is enough. For nested data, such as a dictionary of lists or a list of records, use `copy.deepcopy`.

## 5. What happens when you pass something to a function

Calling a function does exactly what `b = a` does: it sticks a **new name** (the parameter) onto the **same object** you passed in. So a function that changes a mutable argument changes the caller's object:

```python
def add_bonus(scores):
    scores.append(100)

marks = [70, 80]
add_bonus(marks)
print(marks)
```

```text
[70, 80, 100]
```

But a function that **re-points** its parameter at something new does not reach back and move the caller's name:

```python
def reset(scores):
    scores = [0]
    return scores

marks = [70, 80]
reset(marks)
print(marks)
```

```text
[70, 80]
```

Inside `reset`, `scores = [0]` points the local name at a new list. The caller's `marks` still points at the old one. And with an immutable argument there is nothing to change in place at all:

```python
def add_one(n):
    n = n + 1
    return n

number = 5
add_one(number)
print(number)
```

```text
5
```

> [!interview]
> **"Is Python pass by value or pass by reference?"** Neither exactly. Python passes **object references by assignment**: the parameter becomes a new name for the very same object. If the object is mutable and the function changes it in place, the caller sees the change. If the function assigns the parameter to something new, only the local name moves. A good answer gives the list example above and says why an `int` argument can never be changed from inside.

This is also why you should be careful with functions that change their input. A function that returns a new value (like `sorted`) is easier to reason about than one that quietly rewrites its argument (like `list.sort`). When you must not change the input, copy first, or build a new list:

```python
def top_three(scores):
    return sorted(scores, reverse=True)[:3]

marks = [70, 95, 60, 88, 91]
print(top_three(marks))
print(marks)
```

```text
[95, 91, 88]
[70, 95, 60, 88, 91]
```

## 6. Why the earlier traps happen

With this in mind, three bugs from earlier lessons become obvious.

**`[[0] * 3] * 3` (Module 02).** `[0] * 3` makes one row. Multiplying by 3 puts **three names for that one row** in the grid:

```python
grid = [[0] * 3] * 3
print(grid[0] is grid[1])

fixed = [[0] * 3 for _ in range(3)]
print(fixed[0] is fixed[1])
```

```text
True
False
```

**The mutable default argument (Module 05).** The default `[]` is **one list**, created when the function is defined. Every call that uses the default is handed that same list, so each `append` changes it for everyone.

**Two names from one assignment.** `a = b = []` makes one list with two names, not two lists:

```python
a = b = []
a.append(1)
print(b)

c = []
d = []
c.append(1)
print(d)
```

```text
[1]
[]
```

## Common mistakes

> [!pitfall]
> **Assuming `b = a` copies.** It never does. If you want a separate copy, ask for one with `.copy()`, `list(...)`, a slice or `copy.deepcopy`.

> [!pitfall]
> **Using a shallow copy on nested data.** The outer list is new but the inner lists are shared. If your data contains lists inside lists, or dictionaries holding lists, use `copy.deepcopy`.

> [!pitfall]
> **Changing a collection while looping over it, or while another name still points at it.** If something else holds the same list, your "private" change is public.

> [!pitfall]
> **Treating `is` as a stronger `==`.** They ask different questions. Use `==` for values and `is None` for the absence of a value.

## Practice

### 1. Predict

Without running it, what does each pair of lines print? Then run it.

```python
a = [1, 2]
b = a
a = a + [3]
print(b)

x = [1, 2]
y = x
x.append(3)
print(y)

p = "hi"
q = p
p += "!"
print(q)
```

<details>
<summary>Answer</summary>

```text
[1, 2]
[1, 2, 3]
hi
```

`a = a + [3]` makes a new list, so `b` keeps `[1, 2]`. `x.append(3)` changes the shared list, so `y` sees `[1, 2, 3]`. Strings cannot change, so `p += "!"` makes a new string and `q` stays `"hi"`.

</details>

### 2. Fix the shared settings

Every user is meant to start with their own copy of the default settings. This code has a bug. Fix it so changing one user's settings does not change the other's.

```python
defaults = {"theme": "light", "tags": ["new"]}

asha = defaults.copy()
ravi = defaults.copy()
asha["tags"].append("admin")
print(ravi["tags"])
```

<details>
<summary>Answer</summary>

```python
import copy

defaults = {"theme": "light", "tags": ["new"]}

asha = copy.deepcopy(defaults)
ravi = copy.deepcopy(defaults)
asha["tags"].append("admin")
print(ravi["tags"])
print(asha["tags"])
```

```text
['new']
['new', 'admin']
```

`.copy()` is shallow, so both users shared one `tags` list. `deepcopy` gives each user their own.

</details>

### 3. A function that must not change its input

Write `without_first(items)` that returns the list without its first item, and leaves the original list alone.

<details>
<summary>Answer</summary>

```python
def without_first(items):
    return items[1:]

data = [10, 20, 30]
print(without_first(data))
print(data)
```

```text
[20, 30]
[10, 20, 30]
```

A slice always makes a new list, so the original is untouched. A version that called `items.pop(0)` would have removed the item from the caller's list as well.

</details>

### 4. Spot the alias

How many different lists does this code create? How many names point at them?

```python
a = [1]
b = a
c = [1]
d = [a, b, c]
d[0].append(2)
print(a, b, c)
```

<details>
<summary>Answer</summary>

```python
a = [1]
b = a
c = [1]
d = [a, b, c]
d[0].append(2)
print(a, b, c)
print(d)
```

```text
[1, 2] [1, 2] [1]
[[1, 2], [1, 2], [1]]
```

Three: the list `a` and `b` share, the separate list `c`, and the outer list `d`. Appending through `d[0]` changes the list that `a` and `b` name, but not `c`.

</details>

## Edge cases interviewers poke at

> [!pitfall]
> **`+=` is not always the same as `= ... +`, `==` is not `is`, and a "copy" is often only one level deep.** Every one of these is a favourite interview question because it tests whether you picture names and objects correctly.

```python
a = [1, 2]
b = a
a += [3]            # changes the object in place
print(b)

a = [1, 2]
b = a
a = a + [3]         # builds a NEW list and rebinds a
print(b)

n = 10
m = n
n += 1              # ints are immutable: n is rebound to a new int
print(m, n)
```

```text
[1, 2, 3]
[1, 2]
10 11
```

```python
x = [1, 2]
y = [1, 2]
print(x == y, x is y, id(x) == id(y))
z = x
print(x is z)
print(None is None, [] is [])
```

```text
True False False
True
True False
```

> [!tip]
> Use `is` only to compare with `None` (and other singletons). For small integers and short strings Python may reuse objects, so `is` can seem to work for them. That is an implementation detail, never something to rely on.

Copying one level versus all levels:

```python
import copy

original = [[1, 2], [3]]
alias = original
shallow = original.copy()
deep = copy.deepcopy(original)

original[0].append(99)
print("alias  ", alias)
print("shallow", shallow)
print("deep   ", deep)
```

```text
alias   [[1, 2, 99], [3]]
shallow [[1, 2, 99], [3]]
deep    [[1, 2], [3]]
```

`[:]`, `list(x)`, `x.copy()` and `copy.copy(x)` are all **shallow**: the outer container is new, the inner objects are shared. Only `deepcopy` copies them too (at a cost, and it copes with cycles).

A function sees changes to a mutable argument, but not a rebinding:

```python
def mutate(items):
    items.append("added")      # visible to the caller

def rebind(items):
    items = ["new list"]       # only the local name moves

data = ["x"]
mutate(data)
rebind(data)
print(data)
```

```text
['x', 'added']
```

## Mini interview Q&A

<details>
<summary><strong>1. What does <code>b = a</code> do? [BASIC]</strong></summary>

It sticks a second **name** on the same object; nothing is copied. If the object is mutable and you change it through either name, both names see the change. If it is immutable (`int`, `str`, `tuple`), "changing" it rebinds one name to a new object, so the other is unaffected.

</details>

<details>
<summary><strong>2. <code>is</code> vs <code>==</code>? [BASIC]</strong></summary>

`==` asks "do these have equal value?" (calls `__eq__`); `is` asks "is it literally the same object?" (compares identity, like `id(a) == id(b)`). Use `is None`, `is not None`, and `==` for everything else.

</details>

<details>
<summary><strong>3. Shallow copy vs deep copy? [TRICKY]</strong></summary>

A shallow copy makes a new container holding **the same inner objects**; a deep copy recursively copies the inner objects too. With a list of numbers they behave the same; with a list of lists, a shallow copy still shares the inner lists, so changing one is visible in both.

</details>

<details>
<summary><strong>4. Why can a tuple "change"? [TRICKY]</strong></summary>

A tuple's **references** cannot change, but if one of them points to a mutable object (like a list), that object can. `t = ([1], 2); t[0].append(3)` works. The tuple is immutable; the list inside it is not.

</details>

<details>
<summary><strong>5. How would you avoid shared-state bugs in function arguments? [SCENARIO]</strong></summary>

Do not mutate arguments unless that is the documented purpose; return a new value instead (`return [*items, new]`). Copy defensively at boundaries when you store an argument (`self.items = list(items)`). Never use a mutable default value.

</details>

## Cheat sheet

```text
Variable       a NAME stuck on an object (not a box holding a value)
b = a          second name, SAME object, no copy
==  vs  is     equal value    vs    same object (use `is` for None only)
Mutable        list dict set (most classes)   -> change in place, visible via every name
Immutable      int float str tuple frozenset bytes -> "changes" rebind the name
+=             list: in place (extends)   int/str/tuple: rebinds to a new object
Copy           x[:]  list(x)  x.copy()  copy.copy(x)  -> shallow
               copy.deepcopy(x) -> everything (costly)
Functions      get the reference: mutation visible, rebinding not
Debug          id(x)   x is y   print both names after a change
```

## Check yourself

> [!check]
> - I can draw names and objects for `b = a`
> - I can say what `is` asks and what `==` asks
> - I can list three mutable and three immutable types
> - I can explain why `c += [3]` and `c = c + [3]` can behave differently on a shared list
> - I know when a shallow copy is enough and when I need `deepcopy`
> - I can answer "pass by value or reference?" with an example

## Further reading and sources

- [Python Data Model: Objects, values and types](https://docs.python.org/3/reference/datamodel.html#objects-values-and-types) - the language reference on identity, mutability and what `is` means.
- [copy: shallow and deep copy operations](https://docs.python.org/3/library/copy.html) - the official explanation of the two kinds of copy.
- [Programming FAQ: how do I write a function with output parameters?](https://docs.python.org/3/faq/programming.html#how-do-i-write-a-function-with-output-parameters-call-by-reference) - why Python is neither pass-by-value nor pass-by-reference.
- [The Python Tutorial: Python scopes and namespaces](https://docs.python.org/3/tutorial/classes.html#python-scopes-and-namespaces) - how names are bound to objects.

## Next

Next: [Errors, files and modules](../07-errors-files-and-modules/README.md).
