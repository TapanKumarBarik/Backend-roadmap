# Module 04: Decisions and Loops

> **Prerequisites:** [Module 03](../03-dictionaries/README.md): lists and dictionaries, which most loops walk through.  
> **Estimated Reading Time:** 25 minutes  
> **Who this is for:** Anyone who wants the control flow of Python clear: choosing between actions and repeating them.

> [!key]
> `if` chooses whether to run some code. `for` runs it once for each item in a collection. `while` runs it again and again until a condition stops being true. In Python the **indentation** is the structure: the lines pushed in under a colon are the lines that belong to it.

## What you will be able to do

- Write `if`, `elif` and `else` and predict which branch runs.
- Say which values Python treats as false.
- Loop over lists, strings, dictionaries and ranges, with positions when you need them.
- Use `break` and `continue`, and know when a `while` loop is the right choice.
- Spot the two classic loop bugs: off-by-one and changing a list while looping over it.

## 1. Making decisions

```python
temperature = 31

if temperature > 35:
    print("Too hot")
elif temperature > 25:
    print("Warm")
elif temperature > 15:
    print("Pleasant")
else:
    print("Cold")
```

```text
Warm
```

Python checks the conditions from the top and runs the **first** branch whose condition is true, then skips the rest. `else` is the "nothing above matched" branch. Notice the colons at the end of each condition and the four spaces of indentation under each one: both are required.

Conditions come from the comparison and logic operators of Module 00, plus `in` from Modules 01 to 03:

```python
age = 30
country = "IN"

print(18 <= age < 65)
print(age > 40 or country == "IN")
print(country in ["IN", "US", "UK"])
print(not (age < 18))
```

```text
True
True
True
True
```

`18 <= age < 65` is Python's way of writing "between", and it reads just as you would say it.

### What counts as true

An `if` does not need a `True` or `False`. Any value can be tested, and these are all treated as **false**: `0`, `0.0`, `""` (empty text), `[]`, `()`, `{}`, `set()` and `None`. Everything else is true.

```python
for value in [0, 1, "", "hi", [], [0], None]:
    print(repr(value), "->", bool(value))
```

```text
0 -> False
1 -> True
'' -> False
'hi' -> True
[] -> False
[0] -> True
None -> False
```

That is why this is the normal way to test for emptiness:

```python
items = []

if items:
    print("there is something to do")
else:
    print("nothing to do")
```

```text
nothing to do
```

Write `if items:` rather than `if len(items) > 0:` and `if not items:` rather than `if items == []:`. (And never `if flag == True:`; just write `if flag:`.)

### A one-line choice

When you only need to choose between two **values**, a conditional expression is shorter than a full `if`:

```python
age = 17
label = "adult" if age >= 18 else "minor"
print(label)
```

```text
minor
```

## 2. Repeating with `for`

A `for` loop takes each item of a collection in turn and runs its block once per item:

```python
for fruit in ["apple", "banana", "cherry"]:
    print("I like", fruit)
```

```text
I like apple
I like banana
I like cherry
```

`fruit` is just a name for "the current item", and you choose it. Anything you can index in a sequence you can also loop over: lists, strings, tuples, the keys of a dictionary, and the lines of a file.

```python
for letter in "cab":
    print(letter)

prices = {"tea": 2.5, "coffee": 3.75}
for name, price in prices.items():
    print(name, price)
```

```text
c
a
b
tea 2.5
coffee 3.75
```

### Counting with `range`

`range(n)` produces the numbers 0 up to, but **not including**, `n`. With two numbers it is `range(start, stop)`, and a third is the step:

```python
print(list(range(5)))
print(list(range(2, 6)))
print(list(range(0, 10, 3)))
print(list(range(5, 0, -1)))
```

```text
[0, 1, 2, 3, 4]
[2, 3, 4, 5]
[0, 3, 6, 9]
[5, 4, 3, 2, 1]
```

Use it when you need to do something a certain number of times:

```python
for i in range(3):
    print("Attempt", i + 1)
```

```text
Attempt 1
Attempt 2
Attempt 3
```

### Getting positions: `enumerate`

Sometimes you want each item *and* its position. Do not count by hand; use `enumerate`:

```python
tasks = ["write", "test", "deploy"]
for position, task in enumerate(tasks, start=1):
    print(f"{position}. {task}")
```

```text
1. write
2. test
3. deploy
```

### Walking two lists together: `zip`

```python
names = ["Asha", "Ravi", "Meena"]
scores = [72, 85, 90]
for name, score in zip(names, scores):
    print(name, score)
```

```text
Asha 72
Ravi 85
Meena 90
```

`zip` pairs the first with the first, the second with the second, and stops at the shorter list.

### The accumulator pattern

Most loops build up an answer: start with a value before the loop, update it inside, use it after.

```python
numbers = [4, 9, 2, 7]

total = 0
for n in numbers:
    total = total + n
print(total)

biggest = numbers[0]
for n in numbers:
    if n > biggest:
        biggest = n
print(biggest)

evens = []
for n in numbers:
    if n % 2 == 0:
        evens.append(n)
print(evens)
```

```text
22
9
[4, 2]
```

You will write this shape hundreds of times: set up, loop, update, use. The built-ins `sum(numbers)` and `max(numbers)` do the first two for you, and a comprehension does the third in one line: `[n for n in numbers if n % 2 == 0]`.

## 3. Repeating with `while`

A `while` loop keeps going as long as its condition is true. Use it when you do **not** know in advance how many times, only when to stop.

```python
balance = 100
years = 0
while balance < 200:
    balance = balance * 1.07
    years = years + 1
print(years, round(balance, 2))
```

```text
11 210.49
```

How many years does it take 100 to double at 7% a year? You cannot tell without running it, which is exactly the case for `while`. Whatever the condition tests **must change inside the loop**, or the loop never ends.

### `break` and `continue`

`break` leaves the loop at once. `continue` skips the rest of this round and moves to the next item.

```python
for n in [3, 8, 5, 12, 7]:
    if n % 2 == 1:
        continue
    print("first even number:", n)
    break
```

```text
first even number: 8
```

Odd numbers are skipped with `continue`, and the first even one is printed and ends the loop with `break`. A common shape is a loop that is allowed to run forever and stops from inside:

```python
attempts = 0
while True:
    attempts = attempts + 1
    if attempts * attempts > 50:
        break
print(attempts)
```

```text
8
```

## 4. Loops inside loops

A loop body can hold another loop. The inner one runs completely for every step of the outer one:

```python
for row in range(1, 4):
    line = ""
    for col in range(1, 4):
        line = line + f"{row * col:>3}"
    print(line)
```

```text
  1  2  3
  2  4  6
  3  6  9
```

## 5. Comprehensions, `any` and `all`

You met the list comprehension in Module 02. Its general shape is `[what for item in collection if condition]`, and it is the same loop written as one expression:

```python
numbers = [4, 9, 2, 7]
print([n * 2 for n in numbers])
print([n for n in numbers if n > 3])
print(sum(n for n in numbers if n % 2 == 0))
print(len([w for w in "banana split".split() if "a" in w]))
```

```text
[8, 18, 4, 14]
[4, 9, 7]
6
1
```

Two built-ins answer "is any of them?" and "are all of them?" without a hand-written loop:

```python
scores = [72, 85, 90, 66]
print(any(s >= 90 for s in scores))
print(all(s >= 50 for s in scores))
print(all(s >= 70 for s in scores))
```

```text
True
True
False
```

Reach for a comprehension when you are building a list from a list. Use a plain loop when the body does several things, because three lines of loop are easier to read than one overstuffed expression.

## Common mistakes

> [!pitfall]
> **Off by one with `range`.** `range(5)` is 0, 1, 2, 3, 4: five numbers, and **not** 5. If you want 1 to 5, write `range(1, 6)`.

```python
print(list(range(1, 5)))
print(list(range(1, 6)))
```

```text
[1, 2, 3, 4]
[1, 2, 3, 4, 5]
```

> [!pitfall]
> **Removing items from a list while looping over it.** The loop walks by position, and every removal shifts the items after it one place to the left, so the loop skips the one that slid into the gap:

```python
numbers = [2, 4, 6, 1]
for n in numbers:
    if n % 2 == 0:
        numbers.remove(n)
print(numbers)
```

```text
[4, 1]
```

It should have left only `[1]`. Build a new list instead: `numbers = [n for n in numbers if n % 2 != 0]`.

> [!pitfall]
> **A `while` loop that never changes its condition.** `while balance < 200:` with nothing inside that changes `balance` runs until you stop the program. Before running a new `while` loop, ask: *what inside it moves the condition towards false?*

> [!pitfall]
> **Using `=` in a condition.** `if age = 30:` is a syntax error. You want `==`. (Module 00 has the difference.)

## Practice

### 1. FizzBuzz

For the numbers 1 to 15: print `Fizz` for multiples of 3, `Buzz` for multiples of 5, `FizzBuzz` for both, otherwise the number. Show the result on one line.

<details>
<summary>Answer</summary>

```python
results = []
for n in range(1, 16):
    if n % 15 == 0:
        results.append("FizzBuzz")
    elif n % 3 == 0:
        results.append("Fizz")
    elif n % 5 == 0:
        results.append("Buzz")
    else:
        results.append(str(n))
print(" ".join(results))
```

```text
1 2 Fizz 4 Buzz Fizz 7 8 Fizz Buzz 11 Fizz 13 14 FizzBuzz
```

The multiple-of-both test has to come **first**. If `n % 3 == 0` came first, 15 would print `Fizz` and never reach the `FizzBuzz` branch.

</details>

### 2. Sum of the even numbers

Add up the even numbers from 1 to 100.

<details>
<summary>Answer</summary>

```python
total = 0
for n in range(1, 101):
    if n % 2 == 0:
        total += n
print(total)
print(sum(range(2, 101, 2)))
```

```text
2550
2550
```

`total += n` is shorthand for `total = total + n`. The second line gets there directly by stepping `range` by 2.

</details>

### 3. The first ten Fibonacci numbers

Each number is the sum of the two before it, starting 1, 1.

<details>
<summary>Answer</summary>

```python
a, b = 1, 1
sequence = []
for _ in range(10):
    sequence.append(a)
    a, b = b, a + b
print(sequence)
```

```text
[1, 1, 2, 3, 5, 8, 13, 21, 34, 55]
```

`_` is the usual name for a loop variable you do not use. `a, b = b, a + b` moves both numbers along at once (the swap from Module 02).

</details>

### 4. Primes below 30

A prime is greater than 1 and divisible only by 1 and itself.

<details>
<summary>Answer</summary>

```python
primes = []
for n in range(2, 30):
    is_prime = True
    for d in range(2, n):
        if n % d == 0:
            is_prime = False
            break
    if is_prime:
        primes.append(n)
print(primes)
```

```text
[2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
```

For each `n`, try every divisor `d` from 2 up to `n - 1`. One exact division is enough to rule `n` out, so `break` stops looking. It is not the fastest method, but it is the clearest one.

</details>

## Check yourself

> [!check]
> - I can predict which branch of an `if`/`elif`/`else` runs
> - I can list the values Python treats as false
> - I can choose between `for` and `while`, and say why
> - I can use `enumerate` and `zip` instead of counting by hand
> - I know what `range(1, 6)` produces, and why it is not `range(1, 5)`
> - I can explain why removing from a list inside a loop over it goes wrong

## Further reading and sources

- [The Python Tutorial: More Control Flow Tools](https://docs.python.org/3/tutorial/controlflow.html) - `if`, `for`, `range`, `break` and `continue` from the language's own tutorial.
- [Built-in Functions](https://docs.python.org/3/library/functions.html) - `enumerate`, `zip`, `range`, `any`, `all`, `sum`, `min` and `max`.
- [Truth Value Testing](https://docs.python.org/3/library/stdtypes.html#truth-value-testing) - the exact list of what counts as false.

## Next

Next: [Functions](../05-functions/README.md).
