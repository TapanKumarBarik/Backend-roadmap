# Module 07: Errors, Files and Modules

> **Prerequisites:** [Module 06](../06-names-references-and-mutability/README.md): names and objects, and [Module 05](../05-functions/README.md): functions.  
> **Estimated Reading Time:** 30 minutes  
> **Who this is for:** Anyone who wants to read error messages calmly, handle problems on purpose, and have programs that read and write real files.  
> **Interview relevance:** Interviewers ask about exceptions, context managers and the import system to judge production habits.

> [!key]
> An **error** is Python telling you exactly what went wrong and where. Read it, from the bottom up. When you *expect* something to go wrong, such as a missing file or text that is not a number, **catch** that one error and carry on. When something is not your function's job to fix, **raise** an error so the caller knows.

> [!note]
> Catch narrow exceptions, clean up with `with`, chain errors with `raise ... from`, and remember that imports run a module once.

> [!tip]
> Never write `except: pass` in an interview answer. If you must catch broadly, log it and say why.

## What you will be able to do

- Read a traceback and find the line to fix.
- Handle an expected error with `try` and `except`, and raise your own.
- Read and write text files safely with `with open(...)`, and with `pathlib`.
- Save and load data as JSON.
- Use `import`, and explain `if __name__ == "__main__":`.

## 1. Reading an error

When Python cannot continue, it stops and reports what happened. Here is a small program with a bug: it averages an empty list.

```python
# raises
def average(numbers):
    return total(numbers) / len(numbers)


def total(numbers):
    result = 0
    for n in numbers:
        result = result + n
    return result


scores = []
print(average(scores))
```

```text
ZeroDivisionError: division by zero
```

The Run button shows you the last line of the error. If you save the code as `report.py` and run `python report.py` in a terminal, you see the whole story:

```console
Traceback (most recent call last):
  File "report.py", line 13, in <module>
    print(average(scores))
          ~~~~~~~^^^^^^^^
  File "report.py", line 2, in average
    return total(numbers) / len(numbers)
           ~~~~~~~~~~~~~~~^~~~~~~~~~~~~~
ZeroDivisionError: division by zero
```

(That is a real trace from Python 3.13. Your line numbers and file names will differ, and the `~~~^^^` marks that underline the exact spot appear from Python 3.11 on.)

**Read a traceback from the bottom up:**

1. **The last line** is the error: its *type* (`ZeroDivisionError`) and its *message* (`division by zero`). That tells you *what* went wrong.
2. **The line above it** is *where*: file, line number and the code that was running. Here it is line 2, inside `average`: dividing by `len(numbers)`, which is 0.
3. **The lines further up** are *how you got there*: line 13 called `average`, which ran line 2. Each pair is one function that was waiting for the next.

The fix here is not in `average` at all. It was called with an empty list, which is the caller's decision. We will fix it at the end of the next section.

### The errors you will meet most

| Error | Usual cause |
|-------|-------------|
| `SyntaxError` | Python cannot read the code: a missing colon, bracket or quote. Nothing runs at all. |
| `NameError` | You used a name that does not exist: a typo, or a variable used before it was set. |
| `TypeError` | The wrong kind of value: `"a" + 1`, or calling something that is not a function. |
| `ValueError` | Right kind of value, wrong content: `int("abc")`. |
| `IndexError` | A list position that does not exist: `items[10]` on a 3-item list. |
| `KeyError` | A dictionary key that is not there. |
| `AttributeError` | The value has no such method or field: `None.upper()`. |
| `ZeroDivisionError` | Dividing by zero. |
| `FileNotFoundError` | The file or folder does not exist. |

Two you may not have met yet:

```python
# raises
number = int("abc")
```

```text
ValueError: invalid literal for int() with base 10: 'abc'
```

```python
# raises
middle_name = None
print(middle_name.upper())
```

```text
AttributeError: 'NoneType' object has no attribute 'upper'
```

The second is the most common error in everyday Python: something you expected to be text is `None`, usually because a function returned nothing (Module 05) or a lookup found nothing.

## 2. Handling errors with `try` and `except`

Sometimes you *expect* a problem: the user types words where a number belongs. Put the risky line in a `try` block, and say what to do for that error in `except`:

```python
text = "abc"

try:
    number = int(text)
    print("parsed", number)
except ValueError:
    print("not a number:", text)

print("the program carries on")
```

```text
not a number: abc
the program carries on
```

If nothing goes wrong, the `except` block is skipped. If a `ValueError` happens, Python jumps straight to `except`, and then the program continues after the whole block. Here is the same idea as a reusable function:

```python
def parse_age(text):
    try:
        age = int(text)
    except ValueError:
        return None
    if age < 0:
        return None
    return age


print(parse_age("42"))
print(parse_age("abc"))
print(parse_age("-5"))
```

```text
42
None
None
```

You can handle several errors differently, and keep the error itself with `as`:

```python
def divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return "cannot divide by zero"
    except TypeError as error:
        return f"bad input: {error}"


print(divide(10, 4))
print(divide(10, 0))
print(divide("10", 2))
```

```text
2.5
cannot divide by zero
bad input: unsupported operand type(s) for /: 'str' and 'int'
```

Two more clauses complete the picture. `else` runs only if **no** error happened, and `finally` runs **no matter what**, which makes it the place for tidy-up:

```python
def read_number(text):
    try:
        value = int(text)
    except ValueError:
        print("invalid")
    else:
        print("valid:", value)
    finally:
        print("done with", repr(text))


read_number("7")
read_number("x")
```

```text
valid: 7
done with '7'
invalid
done with 'x'
```

We can now fix the empty-list average from the start of the lesson by deciding what "no scores" should mean:

```python
def average(numbers):
    if not numbers:
        return None
    return sum(numbers) / len(numbers)


print(average([70, 80, 90]))
print(average([]))
```

```text
80.0
None
```

> [!tip]
> Prefer checking in advance when that is simple (`if not numbers`), and use `try` when the check would be as hard as the operation itself, such as "is this text a valid number?". Python programmers say *"easier to ask forgiveness than permission"* for the second style.

## 3. Raising your own errors

When *your* function is given something it cannot work with, do not return a magic value like `-1` that the caller might not check. **Raise** an error:

```python
def withdraw(balance, amount):
    if amount <= 0:
        raise ValueError("amount must be positive")
    if amount > balance:
        raise ValueError(f"cannot withdraw {amount}; balance is {balance}")
    return balance - amount


print(withdraw(100, 30))

try:
    withdraw(100, 500)
except ValueError as error:
    print("Error:", error)
```

```text
70
Error: cannot withdraw 500; balance is 100
```

Python's built-in error types cover most cases (`ValueError` for a bad value, `TypeError` for a bad kind of value). When you want callers to catch *your* situation specifically, make a new error type. It is one short line, using `class`, which is the topic of the next stage of this guide:

```python
class InsufficientFunds(Exception):
    pass


def withdraw(balance, amount):
    if amount > balance:
        raise InsufficientFunds(f"need {amount - balance} more")
    return balance - amount


try:
    withdraw(50, 80)
except InsufficientFunds as error:
    print("Declined:", error)
```

```text
Declined: need 30 more
```

> [!pitfall]
> **A bare `except:` or `except Exception: pass` hides bugs.** It catches every error, including the ones you did not expect, and says nothing. Catch the **specific** error you planned for, keep the `try` block as small as possible, and never silently swallow the rest.

## 4. Files

Programs remember things by reading and writing files. The safe way is a `with` block, which closes the file for you even if something goes wrong:

```python
with open("notes.txt", "w", encoding="utf-8") as file:
    file.write("first line\n")
    file.write("second line\n")

with open("notes.txt", encoding="utf-8") as file:
    content = file.read()

print(content)
print(len(content))
```

```text
first line
second line

23
```

`open(name, mode)` takes a **mode**:

| Mode | Meaning |
|------|---------|
| `"r"` | Read (the default). The file must exist. |
| `"w"` | Write. **Creates the file, or erases it if it exists.** |
| `"a"` | Append. Adds to the end and keeps what is there. |

Always pass `encoding="utf-8"` for text so the file reads the same on every computer.

You can read a file one line at a time by looping over it, which works for files too big to fit in memory:

```python
with open("scores.txt", "w", encoding="utf-8") as file:
    file.write("Asha,72\nRavi,85\nMeena,90\n")

total = 0
with open("scores.txt", encoding="utf-8") as file:
    for line in file:
        name, score = line.strip().split(",")
        total += int(score)
        print(name, score)
print("total", total)
```

```text
Asha 72
Ravi 85
Meena 90
total 247
```

Each line still ends in `"\n"`, so `strip()` removes it before `split(",")` breaks the line at the comma. Reading a file that does not exist raises `FileNotFoundError`, which is a good moment for `try`:

```python
try:
    with open("missing_file_xyz.txt", encoding="utf-8") as file:
        data = file.read()
except FileNotFoundError:
    data = ""
    print("no file yet, starting empty")

print(repr(data))
```

```text
no file yet, starting empty
''
```

### Paths with `pathlib`

For folders, file names and checking whether something exists, use `pathlib`. A `Path` object joins parts with `/`, and works the same on Windows, Mac and Linux:

```python
from pathlib import Path

folder = Path("reports")
folder.mkdir(exist_ok=True)

path = folder / "today.txt"
path.write_text("all good\n", encoding="utf-8")

print(path.exists(), path.name, path.suffix)
print(path.read_text(encoding="utf-8").strip())
print([p.name for p in folder.iterdir()])
```

```text
True today.txt .txt
all good
['today.txt']
```

> [!note]
> In the Run button of this page, files live in a small temporary area inside your browser tab and disappear when you reload. On your own computer they are real files next to your program.

## 5. JSON: saving structured data

Lists, dictionaries, text, numbers, `True`/`False` and `None` can all be written as **JSON**, the text format that web APIs, configuration files and many databases use. The `json` module converts back and forth:

```python
import json

data = {"name": "Asha", "skills": ["python", "sql"], "active": True, "manager": None}

text = json.dumps(data)
print(text)
print(json.dumps(data, indent=2))

back = json.loads(text)
print(back == data, back["skills"][0])
```

```text
{"name": "Asha", "skills": ["python", "sql"], "active": true, "manager": null}
{
  "name": "Asha",
  "skills": [
    "python",
    "sql"
  ],
  "active": true,
  "manager": null
}
True python
```

`dumps` turns Python into a JSON **string** (the "s" is for string); `loads` turns a JSON string back. Notice `True` became `true` and `None` became `null`: JSON has its own spelling. To work with a file instead of a string, use `dump` and `load`:

```python
import json

settings = {"theme": "dark", "font_size": 14}

with open("settings.json", "w", encoding="utf-8") as file:
    json.dump(settings, file, indent=2)

with open("settings.json", encoding="utf-8") as file:
    loaded = json.load(file)

print(loaded)
print(loaded == settings)
```

```text
{'theme': 'dark', 'font_size': 14}
True
```

JSON has no tuples, and its keys are always text, so a round trip can change your data slightly:

```python
import json

print(json.dumps({"point": (3, 4), 1: "one"}))
print(json.loads('{"point": [3, 4]}'))
```

```text
{"point": [3, 4], "1": "one"}
{'point': [3, 4]}
```

## 6. Modules and `import`

A **module** is a Python file you can reuse. Python ships with a large **standard library**, a set of ready-made modules, and `import` brings one in:

```python
import math
from math import sqrt

print(math.sqrt(16), sqrt(2), math.pi)
print(math.floor(3.7), math.ceil(3.2))
```

```text
4.0 1.4142135623730951 3.141592653589793
3 4
```

`import math` gives you the module, and you write `math.sqrt`. `from math import sqrt` brings one name across, so you write just `sqrt`. You can rename with `as` (`import datetime as dt`).

| Module | What it is for |
|--------|----------------|
| `math` | Square roots, rounding, `pi`, logarithms |
| `random` | Random numbers and choices |
| `datetime` | Dates, times and the difference between them |
| `collections` | `Counter`, `defaultdict` (Module 03) |
| `json` | Reading and writing JSON |
| `pathlib` | Files and folders |
| `re` | Pattern matching in text (regular expressions) |
| `csv` | Spreadsheet-style files |
| `sys`, `os` | The Python and the operating system you are running on |

```python
import random

random.seed(7)
print(random.randint(1, 6), random.randint(1, 6), random.randint(1, 6))
print(random.choice(["red", "green", "blue"]))
```

```text
3 2 4
blue
```

`random.seed(7)` makes the "random" numbers repeatable, which is useful for tests and for lessons. Without it you would get different numbers each run.

Dates are a place where a module saves real pain:

```python
from datetime import date, timedelta

start = date(2024, 2, 28)
print(start + timedelta(days=2))
print((date(2024, 12, 25) - date(2024, 11, 1)).days)
print(start.strftime("%d %B %Y"), start.weekday())
```

```text
2024-03-01
54
28 February 2024 2
```

Adding two days to 28 February gave 1 March, because 2024 is a leap year. The module knows. `weekday()` counts Monday as 0, so 2 is a Wednesday.

### Your own modules

Any `.py` file is a module. Put a function in `shapes.py`:

```python
def circle_area(radius):
    return 3.14159 * radius ** 2


if __name__ == "__main__":
    print("running shapes.py directly")
    print(circle_area(2))
```

```text
running shapes.py directly
12.56636
```

From another file in the same folder you could now write `import shapes` and call `shapes.circle_area(5)`. The last block is the important idiom. Python sets a special name `__name__` in every file. When you **run** the file (`python shapes.py`), `__name__` is `"__main__"` and the block runs. When another file **imports** it, `__name__` is `"shapes"` and the block is skipped. So the file can both offer functions to others and do something when run on its own.

Third-party packages (`requests`, `pandas` and so on) are installed with `pip install`, usually inside a **virtual environment**, a private folder of packages for one project. That is how real projects keep their dependencies from clashing, and it is outside what the Run button can show.

## Common mistakes

> [!pitfall]
> **Naming your file after a standard module.** A file called `random.py` or `json.py` in your folder hides the real one, and `import random` loads *your* file. Pick a different name.

> [!pitfall]
> **Opening with `"w"` to add to a file.** `"w"` erases what was there. To add to the end, use `"a"`.

> [!pitfall]
> **Catching too much.** A `try` block around fifty lines with `except Exception` turns every bug into a quiet mystery. Wrap only the line that can fail, and name the error you expect.

> [!pitfall]
> **Reading a whole huge file with `read()`.** It loads everything into memory. For big files loop over the lines instead.

## Practice

### 1. A forgiving number reader

Write `to_int(text, default=0)` that returns the integer in `text`, or `default` if it is not a whole number.

<details>
<summary>Answer</summary>

```python
def to_int(text, default=0):
    try:
        return int(text)
    except ValueError:
        return default


print(to_int("42"), to_int("abc"), to_int("2.5"), to_int("", default=-1))
```

```text
42 0 0 -1
```

`int("2.5")` is also a `ValueError`, because `int` does not accept a decimal point in text.

</details>

### 2. Add up what you can

Add up the whole numbers in `["10", "x", "5", "", "2.5", "7"]` and list what you skipped.

<details>
<summary>Answer</summary>

```python
items = ["10", "x", "5", "", "2.5", "7"]
total = 0
skipped = []
for item in items:
    try:
        total += int(item)
    except ValueError:
        skipped.append(item)
print(total)
print(skipped)
```

```text
22
['x', '', '2.5']
```

</details>

### 3. Count lines and words

Write three lines to a file, then read it back and report how many lines and words it holds.

<details>
<summary>Answer</summary>

```python
lines_to_write = ["the quick brown fox", "jumps over", "the lazy dog"]
with open("story.txt", "w", encoding="utf-8") as file:
    for line in lines_to_write:
        file.write(line + "\n")

line_count = 0
word_count = 0
with open("story.txt", encoding="utf-8") as file:
    for line in file:
        line_count += 1
        word_count += len(line.split())
print(line_count, word_count)
```

```text
3 9
```

</details>

### 4. Save and reload a to-do list

Save `[{"task": "write", "done": True}, {"task": "test", "done": False}]` as JSON, load it back, and print the tasks that are not done.

<details>
<summary>Answer</summary>

```python
import json

todos = [{"task": "write", "done": True}, {"task": "test", "done": False}]

with open("todos.json", "w", encoding="utf-8") as file:
    json.dump(todos, file)

with open("todos.json", encoding="utf-8") as file:
    loaded = json.load(file)

print([item["task"] for item in loaded if not item["done"]])
```

```text
['test']
```

</details>

## Edge cases interviewers poke at

> [!pitfall]
> **Catch the narrowest error you can handle, in the right order; `finally` always runs (even over a `return`); JSON quietly changes tuples and integer keys; and open files with `with` and an explicit encoding.**

```python
def parse_age(text):
    try:
        age = int(text)
    except ValueError:
        print(f"{text!r} is not a number")
        return None
    else:
        print("parsed fine")       # runs only when no exception happened
        return age
    finally:
        print("finally always runs")

print(parse_age("42"))
print(parse_age("abc"))
```

```text
parsed fine
finally always runs
42
'abc' is not a number
finally always runs
None
```

- Put only the code that can fail inside `try`; use `else` for what should happen on success, so a bug there is not hidden by the `except`.
- Order `except` clauses from most specific to most general, because the first match wins.
- A bare `except:` or `except Exception: pass` hides real bugs, including typos. Catch what you can handle, and let everything else crash loudly.

```python
try:
    {}["missing"]
except LookupError as e:                 # parent of KeyError and IndexError
    print("caught", type(e).__name__)


def read_config(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError as e:
        raise RuntimeError(f"config {path!r} is required") from e

try:
    read_config("definitely-missing.cfg")
except RuntimeError as e:
    print(e, "| caused by", type(e.__cause__).__name__)
```

```text
caught KeyError
config 'definitely-missing.cfg' is required | caused by FileNotFoundError
```

`raise ... from e` keeps the original error attached, so the traceback tells the whole story.

Files and JSON with a temporary directory (nothing is left behind):

```python
import json
import tempfile
from pathlib import Path

with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / "data.json"
    original = {"point": (1, 2), 1: "one"}
    path.write_text(json.dumps(original), encoding="utf-8")
    loaded = json.loads(path.read_text(encoding="utf-8"))
    print(loaded)
    print(loaded == original)
```

```text
{'point': [1, 2], '1': 'one'}
False
```

JSON has no tuples and only text keys, so the tuple came back as a list and `1` as `"1"`. If you need exact types, convert explicitly on load.

```python
import io

with io.StringIO("line one\nline two\n") as f:     # stands in for a file
    for line in f:                                  # lazy: one line at a time
        print(repr(line.rstrip("\n")))
print(f.closed)
```

```text
'line one'
'line two'
True
```

> [!tip]
> `with` closes the file even if an exception happens inside the block. Iterate over the file object instead of calling `read()` when the file might be large.

Imports run a module **once**; `if __name__ == "__main__":` keeps demo code from running when the file is imported:

```python
import math
import math as m
from math import sqrt

print(math is m, sqrt(16), __name__)
```

```text
True 4.0 __main__
```

## Mini interview Q&A

<details>
<summary><strong>1. How do <code>try</code>, <code>except</code>, <code>else</code> and <code>finally</code> fit together? [BASIC]</strong></summary>

`try` holds the risky code; `except` handles a matching error; `else` runs only if nothing was raised; `finally` always runs, for cleanup. Prefer `with` for cleanup of files and locks, since it does the same job with less code.

</details>

<details>
<summary><strong>2. Why not write <code>except Exception: pass</code>? [BASIC]</strong></summary>

It swallows every error, including programming mistakes (`NameError`, `TypeError`), so failures turn into silent wrong behaviour. Catch specific exceptions, log or re-raise anything you cannot handle, and let the rest surface.

</details>

<details>
<summary><strong>3. When should a function raise instead of returning an error value? [SCENARIO]</strong></summary>

When it cannot do its job and the caller is in the best position to decide what to do. Returning `None` or `-1` is easy to ignore; an exception cannot be ignored by accident. Use a custom exception class when callers need to tell your failures apart.

</details>

<details>
<summary><strong>4. What does <code>with open(...) as f</code> do? [BASIC]</strong></summary>

It is a **context manager**: the file is opened on entering the block and closed on leaving it, whether normally or through an exception. Always pass `encoding="utf-8"` for text so behaviour does not depend on the machine.

</details>

<details>
<summary><strong>5. What happens when you import a module twice? [TRICKY]</strong></summary>

Nothing the second time: Python caches the module in `sys.modules`, so the file runs **once** per program and every `import` shares that one module object. That is why top-level code in a module should be definitions, not actions, and why scripts use `if __name__ == "__main__":`.

</details>

## Cheat sheet

```text
Traceback       read from the BOTTOM: error type + message, then the line in YOUR code
try / except E as e / else / finally      specific first; else = success path; finally = cleanup
Never           bare except:   except Exception: pass
raise ValueError("why")       raise NewError(...) from e      custom: class MyError(Exception)
Files           with open(path, encoding="utf-8") as f:      "r" "w" "a"      for line in f
                pathlib.Path(p).read_text(encoding="utf-8") / write_text(...)
JSON            json.dumps / loads / dump / load   -> tuples become lists, keys become strings
Imports         import x | import x as y | from x import name      run ONCE (sys.modules)
Scripts         if __name__ == "__main__":  main()
```

## Check yourself

> [!check]
> - I can read a traceback from the bottom up and name the line to look at
> - I can write `try`/`except` for one specific error, and explain what `else` and `finally` do
> - I know why a bare `except:` is a bad habit
> - I can raise a `ValueError` with a useful message
> - I can open a file with `with`, and I know the difference between `"w"` and `"a"`
> - I can turn a dictionary into JSON and back
> - I can explain what `if __name__ == "__main__":` is for

## Further reading and sources

- [The Python Tutorial: Errors and Exceptions](https://docs.python.org/3/tutorial/errors.html) - `try`, `except`, `else`, `finally`, `raise` and your own error types.
- [The Python Tutorial: Reading and Writing Files](https://docs.python.org/3/tutorial/inputoutput.html#reading-and-writing-files) - modes, `with`, and `json`.
- [The Python Tutorial: Modules](https://docs.python.org/3/tutorial/modules.html) - `import`, how Python finds a module, and `__name__`.
- [Built-in Exceptions](https://docs.python.org/3/library/exceptions.html) - the full list of error types and what each one means.
- [pathlib: object-oriented filesystem paths](https://docs.python.org/3/library/pathlib.html) - everything a `Path` can do.

## Next

Next: [Capstone: an expense tracker](../08-capstone-expense-tracker/README.md).
