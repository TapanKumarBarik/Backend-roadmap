# Module 05: Functions

> **Prerequisites:** [Module 04](../04-decisions-and-loops/README.md): loops and decisions, which most function bodies contain.  
> **Estimated Reading Time:** 25 minutes  
> **Who this is for:** Anyone who wants to write functions confidently, and understand the few rules that surprise people.  
> **Interview relevance:** Mutable defaults, scope and closures are among the most frequently asked Python questions.

> [!key]
> A function is a named piece of code you can run as many times as you like. It takes **inputs** (parameters), does some work, and hands back **one result** with `return`. If it never reaches a `return`, the result is `None`.

> [!note]
> A function is an object with its own scope; defaults are evaluated once, assignment makes a name local, and closures capture variables, not values.

> [!tip]
> If the interviewer shows `def f(x, items=[])`, name the bug ("defaults are evaluated once") before you fix it.

## What you will be able to do

- Write a function with parameters, defaults and a return value.
- Call it with positional and keyword arguments.
- Explain the difference between *printing* a value and *returning* it.
- Use `*args` and `**kwargs`.
- Explain local and global names.
- Pass a function to another function.
- Avoid the mutable default argument bug.

## 1. Defining and calling

```python
def greet(name):
    return "Hello, " + name + "!"

message = greet("Asha")
print(message)
print(greet("Ravi"))
```

```text
Hello, Asha!
Hello, Ravi!
```

`def` starts the definition, `greet` is the function's name, and `name` is a **parameter**: a blank to be filled in each time. The indented block is the **body**. When you call `greet("Asha")`, the value `"Asha"` (the **argument**) fills in `name`, the body runs, and `return` sends the answer back to the place of the call.

A function can take any number of parameters, including none:

```python
def area(width, height):
    return width * height

def say_hello():
    return "hello"

print(area(3, 4))
print(say_hello())
```

```text
12
hello
```

Good functions do **one** thing and have a name that says what. `area` is clear. `do_stuff` is not. A short comment on the first line, a **docstring**, says what a function is for:

```python
def celsius_to_fahrenheit(celsius):
    """Convert a temperature from Celsius to Fahrenheit."""
    return celsius * 9 / 5 + 32

print(celsius_to_fahrenheit(100))
print(celsius_to_fahrenheit(-40))
```

```text
212.0
-40.0
```

### `return` is not `print`

This is the confusion that costs beginners the most time. `print` **shows** a value on the screen. `return` **gives** the value back to the code that called the function, which can then use it.

```python
def add_printing(a, b):
    print(a + b)

def add_returning(a, b):
    return a + b

x = add_printing(2, 3)
y = add_returning(2, 3)
print("x is", x)
print("y is", y)
print(add_returning(2, 3) * 10)
```

```text
5
x is None
y is 5
50
```

`add_printing` shows 5 but gives back nothing, so `x` is `None` and you cannot calculate with it. A function that finishes without reaching a `return` returns `None`. As a rule, **functions should return values and let the caller decide whether to print them.**

A function stops the moment it reaches `return`. It can have several of them, which is a good way to handle special cases early:

```python
def grade(score):
    if score >= 90:
        return "A"
    if score >= 75:
        return "B"
    if score >= 50:
        return "C"
    return "F"

print(grade(95), grade(80), grade(50), grade(10))
```

```text
A B C F
```

To give back more than one thing, return them together. Python packs them into a tuple (Module 02), and the caller can unpack it:

```python
def stats(numbers):
    return min(numbers), max(numbers), sum(numbers) / len(numbers)

low, high, average = stats([4, 8, 6])
print(low, high, average)
```

```text
4 8 6.0
```

## 2. Defaults and keyword arguments

A parameter can have a **default**, used when the caller does not supply one:

```python
def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

print(greet("Asha"))
print(greet("Asha", "Namaste"))
print(greet("Asha", greeting="Welcome"))
print(greet(greeting="Hi", name="Ravi"))
```

```text
Hello, Asha!
Namaste, Asha!
Welcome, Asha!
Hi, Ravi!
```

The last two calls use **keyword arguments**: you name the parameter, and then the order does not matter. Keywords make calls readable when there are several arguments (`make_user("Asha", admin=True)` says more than `make_user("Asha", True)`). Parameters with defaults must come after the ones without.

## 3. A variable number of arguments

`*args` collects any number of extra positional arguments into a **tuple**, and `**kwargs` collects extra keyword arguments into a **dictionary**:

```python
def total(*numbers):
    print(numbers)
    return sum(numbers)

print(total(1, 2, 3))
print(total())
```

```text
(1, 2, 3)
6
()
0
```

```python
def show(**options):
    print(options)

show(theme="dark", size=12)
```

```text
{'theme': 'dark', 'size': 12}
```

The names `args` and `kwargs` are only a convention; the `*` and `**` are what matter. The same stars work the other way round, to **spread** a collection into arguments when calling:

```python
def area(width, height):
    return width * height

size = (3, 4)
print(area(*size))

settings = {"width": 5, "height": 6}
print(area(**settings))
```

```text
12
30
```

## 4. Where names live: scope

Names made inside a function are **local**: they exist only while the function runs, and the outside world cannot see them.

`result` below lives only inside `make_total`. Asking for it from outside is an error:

```python
# raises
def make_total():
    result = 10
    return result

make_total()
print(result)
```

```text
NameError: name 'result' is not defined
```

A function **can read** a name from outside. But the moment it assigns to a name, Python treats that name as local for the whole function:

```python
rate = 0.2

def price_with_tax(price):
    return price + price * rate

print(price_with_tax(100))
```

```text
120.0
```

```python
# raises
count = 0

def increment():
    count = count + 1
    return count

increment()
```

```text
UnboundLocalError: cannot access local variable 'count' where it is not associated with a value
```

`count = count + 1` makes `count` local to `increment`, and then tries to read it before it has a value. Beginners fix this with the `global` keyword, which works but makes code hard to follow. The better habit is to **pass values in and return values out**:

```python
def increment(count):
    return count + 1

count = 0
count = increment(count)
count = increment(count)
print(count)
```

```text
2
```

## 5. Functions are values

In Python a function is a value like any other. You can store it in a variable, put it in a list or dictionary, and pass it to another function.

```python
def double(x):
    return x * 2

def apply_twice(function, value):
    return function(function(value))

print(apply_twice(double, 5))
print(type(double))
```

```text
20
<class 'function'>
```

`double` (no parentheses) is the function itself; `double(5)` is the result of calling it. Passing functions around is how `sorted(..., key=len)` worked in Module 02. A dictionary of functions can replace a long chain of `if` statements:

```python
def add(a, b):
    return a + b

def subtract(a, b):
    return a - b

operations = {"add": add, "subtract": subtract, "power": lambda a, b: a ** b}

for name in ["add", "subtract", "power"]:
    print(name, operations[name](2, 5))
```

```text
add 7
subtract -3
power 32
```

A `lambda` is a small nameless function written in one line: `lambda a, b: a ** b` means "given `a` and `b`, return `a ** b`". It is handy for short rules passed to `sorted`, `max` and `min`:

```python
words = ["pear", "fig", "banana"]
print(max(words, key=len))
print(sorted(words, key=lambda w: w[-1]))
```

```text
banana
['banana', 'fig', 'pear']
```

## 6. A function that calls itself

A function may call itself, called **recursion**, which suits problems made of smaller copies of themselves. It needs a **base case** that stops the chain:

```python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print(factorial(5))
print(factorial(1))
```

```text
120
1
```

`factorial(5)` is `5 * factorial(4)`, which is `5 * 4 * factorial(3)`, and so on down to `factorial(1)`, which returns 1 without calling again. Without the `if n <= 1` line the function would call itself until Python gave up with a `RecursionError`. For simple repetition a loop is usually clearer; recursion earns its place with nested data such as folders inside folders.

## Common mistakes

> [!pitfall]
> **The mutable default argument.** A default value is created **once**, when the function is defined, not each time it is called. If the default is a list or dictionary, every call shares the same one:

```python
def add_item(item, items=[]):
    items.append(item)
    return items

print(add_item("a"))
print(add_item("b"))
print(add_item("c"))
```

```text
['a']
['a', 'b']
['a', 'b', 'c']
```

You expected `['b']` on the second call, and got the list from the first as well. The standard fix is to use `None` as the default and build a fresh list inside:

```python
def add_item(item, items=None):
    if items is None:
        items = []
    items.append(item)
    return items

print(add_item("a"))
print(add_item("b"))
```

```text
['a']
['b']
```

> [!pitfall]
> **Forgetting the parentheses.** `greet` is the function; `greet("Asha")` calls it. Writing `result = greet` gives you the function itself, not an answer.

> [!pitfall]
> **Forgetting `return`.** The function runs, the work is done, and the caller receives `None`. If a result "disappears" or you get `None` where you expected a value, look for the missing `return`.

> [!pitfall]
> **Doing too much.** A function that reads input, calculates, formats and prints is hard to test or reuse. Split it: one function calculates and returns, another prints.

## Practice

### 1. Clamp

Write `clamp(value, low, high)` that returns `low` if `value` is below it, `high` if above it, and `value` otherwise.

<details>
<summary>Answer</summary>

```python
def clamp(value, low, high):
    if value < low:
        return low
    if value > high:
        return high
    return value

print(clamp(5, 0, 10), clamp(-3, 0, 10), clamp(42, 0, 10))
print(max(0, min(-3, 10)))
```

```text
5 0 10
0
```

The last line shows the same idea as one expression.

</details>

### 2. Average that copes with nothing

Write `average(*numbers)` that returns the average, or `None` when given no numbers.

<details>
<summary>Answer</summary>

```python
def average(*numbers):
    if not numbers:
        return None
    return sum(numbers) / len(numbers)

print(average(4, 8, 6))
print(average())
```

```text
6.0
None
```

An empty tuple is false (Module 04), so `if not numbers` catches the no-argument call before it divides by zero.

</details>

### 3. Apply to every item

Write `apply_to_all(function, items)` that returns a new list with `function` applied to each item. Use it to square some numbers and to upper-case some words.

<details>
<summary>Answer</summary>

```python
def apply_to_all(function, items):
    return [function(item) for item in items]

print(apply_to_all(lambda n: n * n, [1, 2, 3, 4]))
print(apply_to_all(str.upper, ["a", "b"]))
```

```text
[1, 4, 9, 16]
['A', 'B']
```

Python already has this built in as `map`, but writing it once shows how simple the idea is.

</details>

### 4. Find the bug

This function should return the total price including tax, but the caller gets `None`. Fix it.

```python
def total_with_tax(price, rate):
    total = price + price * rate
    print(total)

result = total_with_tax(100, 0.2)
print(result)
```

<details>
<summary>Answer</summary>

```python
def total_with_tax(price, rate):
    total = price + price * rate
    return total

result = total_with_tax(100, 0.2)
print(result)
```

```text
120.0
```

The function printed the value but never returned it. Replacing `print(total)` with `return total` gives the caller something to use.

</details>

## Edge cases interviewers poke at

> [!pitfall]
> **A default value is built once, a function without `return` gives `None`, assigning to a name makes it local for the whole function, and closures in loops all see the *last* value.**

```python
def add_item(item, bucket=[]):
    bucket.append(item)
    return bucket

print(add_item("a"))
print(add_item("b"))          # surprise: the same list again


def add_item_safe(item, bucket=None):
    if bucket is None:
        bucket = []
    bucket.append(item)
    return bucket

print(add_item_safe("a"))
print(add_item_safe("b"))
```

```text
['a']
['a', 'b']
['a']
['b']
```

The default `[]` is created **once**, when `def` runs, and shared by every call that does not pass its own. The fix is `None` plus a fresh list inside.

```python
def shout(text):
    text.upper()              # forgot to return it

print(shout("hi"))
```

```text
None
```

```python
# raises
counter = 0

def bump():
    counter += 1              # makes `counter` local, then reads it before it exists

bump()
```

```text
UnboundLocalError: cannot access local variable 'counter' where it is not associated with a value
```

```python
counter = 0

def bump():
    global counter            # allowed, but prefer returning a value instead
    counter += 1

bump()
print(counter)

funcs = [lambda: n for n in range(3)]
print([f() for f in funcs])
funcs = [lambda n=n: n for n in range(3)]
print([f() for f in funcs])
```

```text
1
[2, 2, 2]
[0, 1, 2]
```

> [!tip]
> Closures remember the **variable**, not its value at the time. Pass the value in as a default argument (`n=n`) or use `functools.partial` to freeze it.

Keyword-only parameters (after `*`) and positional-only parameters (before `/`) make call sites clearer and APIs safer to change:

```python
def connect(host, *, timeout=5, retries=3):
    return f"{host} timeout={timeout} retries={retries}"

print(connect("db", timeout=10))

def power(base, exp, /):
    return base ** exp

print(power(2, 5))
```

```text
db timeout=10 retries=3
32
```

```python
# raises
def connect(host, *, timeout=5, retries=3):
    return f"{host} timeout={timeout} retries={retries}"

connect("db", 10)
```

```text
TypeError: connect() takes 1 positional argument but 2 were given
```

Python does not optimise recursion, so very deep recursion fails:

```python
import sys

def depth(n):
    return 0 if n == 0 else 1 + depth(n - 1)

print(sys.getrecursionlimit())
print(depth(500))
```

```text
1000
500
```

```python
# raises
def depth(n):
    return 0 if n == 0 else 1 + depth(n - 1)

depth(5000)
```

```text
RecursionError: maximum recursion depth exceeded
```

## Mini interview Q&A

<details>
<summary><strong>1. Why is a mutable default argument dangerous? [TRICKY]</strong></summary>

Defaults are evaluated **once at definition time**, so a default list or dict is one shared object across calls and keeps its changes. Use `None` as the default and create the object inside the function.

</details>

<details>
<summary><strong>2. What do <code>*args</code> and <code>**kwargs</code> do? [BASIC]</strong></summary>

In a definition they **collect** extra positional arguments into a tuple and extra keyword arguments into a dictionary. In a call they **unpack**: `f(*items, **options)`. They let wrappers and decorators forward arguments without knowing them.

</details>

<details>
<summary><strong>3. Explain Python's scope rules (LEGB). [BASIC]</strong></summary>

A name is looked up in the **L**ocal scope, then any **E**nclosing function, then **G**lobal (module), then **B**uilt-ins. Assigning to a name inside a function makes it local for that whole function, so use `global` or `nonlocal` deliberately, or better, pass values in and return results.

</details>

<details>
<summary><strong>4. Does Python pass by value or by reference? [TRICKY]</strong></summary>

Neither exactly: it passes **a reference to the object, by value** ("pass by assignment"). Rebinding the parameter inside the function does not affect the caller; changing a mutable object that was passed in does. Module 06 draws this out.

</details>

<details>
<summary><strong>5. What does it mean that functions are first-class? [BASIC]</strong></summary>

Functions are objects: you can store them in variables and data structures, pass them to other functions (`sorted(words, key=len)`), and return them. This is the basis for callbacks, decorators and closures.

</details>

## Cheat sheet

```text
def f(a, b=1, *args, key, **kwargs):      return value  (no return -> None)
Defaults        evaluated ONCE -> use None for lists/dicts/sets
Markers         def f(a, /, b, *, c)      a positional-only, c keyword-only
*args / **kwargs   collect in a def, unpack in a call:  f(*xs, **opts)
Scope           LEGB: Local -> Enclosing -> Global -> Built-in
                assigning makes a name local; global / nonlocal rebind outer names
Closures        capture the VARIABLE (late binding) -> lambda n=n: n
Arguments       passed by object reference: rebinding is invisible, mutation is visible
Functions       are values: sorted(xs, key=len)  map/filter  callbacks  decorators
Recursion       needs a base case; depth limit ~1000, no tail-call optimisation
```

## Check yourself

> [!check]
> - I can explain the difference between a parameter and an argument
> - I can explain why a function that only prints returns `None`
> - I can call a function with keyword arguments in a different order
> - I know what `*args` and `**kwargs` collect
> - I can say why `count = count + 1` fails inside a function
> - I can explain the mutable default argument bug, and the fix

## Further reading and sources

- [The Python Tutorial: Defining Functions](https://docs.python.org/3/tutorial/controlflow.html#defining-functions) - parameters, defaults, `*args`, `**kwargs` and lambdas from the language's own tutorial.
- [Python scopes and namespaces](https://docs.python.org/3/tutorial/classes.html#python-scopes-and-namespaces) - the full rules for local, enclosing and global names.
- [Programming FAQ: default argument values](https://docs.python.org/3/faq/programming.html#why-are-default-values-shared-between-objects) - the official explanation of the mutable default surprise.

## Next

Next: [Names, references and mutability](../06-names-references-and-mutability/README.md).
