# Module 00: Programming Basics — Python and C#

## Why this matters

Every module after this one shows you a design idea once and expects you
to read it in **two** languages at the same time. That only works if you
can already read a plain, non-OOP program in both — variables, an `if`,
a loop, a function — without translating in your head line by line. This
module is that on-ramp. It assumes **you have never written a line of code
before**, in either language. If you already know one of the two, skim
its tab and read the other one carefully instead of skipping ahead.

Python and C# were picked deliberately as a pair: they sit at opposite ends
of a spectrum that matters for design later. Python is **interpreted** and
**dynamically typed** — you don't declare a variable's type, and the
interpreter reads and runs your file top to bottom, line by line, right
when you run it. C# is **compiled** and **statically typed** — you declare
each variable's type, and a compiler (`dotnet build`) translates your whole
program to an intermediate form *before* anything runs, catching a whole
class of mistakes (like adding a number to a word) before your program ever
starts. Neither is "better" — they represent two real, common design
philosophies you will meet throughout your career, and seeing both from day
one means neither will feel like the "one true way" later.

## Setting up

{{tabs}}
{{tab Python}}
Install Python 3 from [python.org](https://www.python.org/downloads/) (or
via your OS package manager). Verify it worked:

```bash
python3 --version
```

Run a file:

```bash
python3 hello.py
```

Or start the interactive shell (great for quick experiments — type an
expression, see the result immediately):

```bash
python3
>>> 2 + 2
4
>>> exit()
```
{{tab C#}}
Install the [.NET SDK](https://dotnet.microsoft.com/download). Verify it
worked:

```bash
dotnet --version
```

Create and run a new console project (this scaffolds a folder with a
`.csproj` project file and a `Program.cs`):

```bash
dotnet new console -o HelloApp
cd HelloApp
dotnet run
```

Unlike Python, there's no interactive one-liner shell in everyday use —
C# programs are always built as a project. (`dotnet-script` and C#
"scripting" exist but aren't the mainstream workflow — you won't need them
here.)
{{/tabs}}

## Concepts

### Hello, World — and how each language actually runs your code

{{tabs}}
{{tab Python}}
```python
# hello.py
print("Hello, World!")
```

Run it: `python3 hello.py`. The Python **interpreter** reads this file top
to bottom and executes each line immediately — there is no separate
"build" step. This is why Python is fast to experiment with (edit, run,
repeat) but any typo only surfaces *when that line actually runs*, not
before.
{{tab C#}}
```csharp
// Program.cs
Console.WriteLine("Hello, World!");
```

Run it: `dotnet run` (from inside the project folder). Behind the scenes,
`dotnet run` first **compiles** your `.cs` files into an intermediate
form, checking every line for type errors across the *whole* program, and
only then executes it. A typo that produces a type error is caught before
a single line runs — even in code paths that would rarely execute. (Older
C# always required a `class Program { static void Main(string[] args)
{ ... } }` wrapper around this; modern C# — what you see above — allows
"top-level statements" for a single entry-point file, which is what
you'll see used throughout this track for brevity.)
{{/tabs}}

### Comments

{{tabs}}
{{tab Python}}
```python
# a single-line comment

"""
a multi-line string, often used
as a comment or docstring
"""
```
{{tab C#}}
```csharp
// a single-line comment

/*
  a multi-line comment
*/
```
{{/tabs}}

### Variables and data types

Python variables are **dynamically typed**: a name is just a label you
attach to a value, and it can point at a different *type* of value later.
C# variables are **statically typed**: you declare a type once, and the
compiler enforces that the variable can only ever hold that type.

{{tabs}}
{{tab Python}}
```python
age = 30            # int
price = 19.99        # float
name = "Ada"         # str
is_active = True     # bool

age = "thirty"       # legal! age now refers to a str. Python doesn't stop you.
```

Check a value's type at any time with `type(...)`:

```python
>>> type(age)
<class 'str'>
```
{{tab C#}}
```csharp
int age = 30;
double price = 19.99;
string name = "Ada";
bool isActive = true;

age = "thirty";      // COMPILE ERROR: cannot convert 'string' to 'int'
```

C# also has `var`, which *infers* the type from the right-hand side at
compile time — it is **not** the same as Python's dynamic typing, because
once inferred, the type is fixed forever for that variable:

```csharp
var count = 5;       // compiler infers 'int' — count is permanently an int
count = "five";      // still a COMPILE ERROR
```
{{/tabs}}

The core data types you'll use constantly, side by side:

| Concept | Python | C# |
|---|---|---|
| Whole number | `int` (arbitrary precision) | `int` (32-bit), `long` (64-bit) |
| Decimal number | `float` (64-bit) | `double` (64-bit), `float` (32-bit) |
| Text | `str` | `string` |
| True/false | `bool` (`True`/`False`) | `bool` (`true`/`false`) |
| Nothing/absence | `None` | `null` |
| Ordered list | `list` | `List<T>` (or `T[]` array) |
| Key→value map | `dict` | `Dictionary<TKey, TValue>` |

Note the capitalization: Python's `True`/`False`/`None` are capitalized;
C#'s `true`/`false`/`null` are lowercase. This trips people up constantly
when switching between the two mid-session.

### Operators

{{tabs}}
{{tab Python}}
```python
7 + 3    # 10   addition
7 - 3    # 4    subtraction
7 * 3    # 21   multiplication
7 / 3    # 2.333...  true division — ALWAYS returns a float
7 // 3   # 2    floor division — discards the remainder
7 % 3    # 1    modulo (remainder)
7 ** 2   # 49   exponentiation

5 == 5   # True   equality
5 != 3   # True   inequality
5 > 3 and 2 < 4   # True   logical AND
5 > 3 or 2 > 4    # True   logical OR
not True          # False  logical NOT
```
{{tab C#}}
```csharp
7 + 3;   // 10   addition
7 - 3;   // 4    subtraction
7 * 3;   // 21   multiplication
7 / 3;   // 2    int / int = int — TRUNCATES, does not round
7.0 / 3; // 2.333...  at least one operand must be a decimal type
7 % 3;   // 1    modulo (remainder)
Math.Pow(7, 2);  // 49   exponentiation — no ** operator in C#

5 == 5;             // true   equality
5 != 3;             // true   inequality
5 > 3 && 2 < 4;     // true   logical AND
5 > 3 || 2 > 4;     // true   logical OR
!true;              // false  logical NOT
```

**The single most common cross-language bug for people learning both at
once:** `7 / 3` is `2.333...` in Python but `2` in C#, because C#'s `/`
between two `int`s performs integer division and truncates — it looks
identical to Python's `//`, not Python's `/`. Always check your operand
types in C#.
{{/tabs}}

### Control flow: `if` / `else`

{{tabs}}
{{tab Python}}
```python
age = 20

if age < 13:
    print("child")
elif age < 20:
    print("teenager")
else:
    print("adult")
```

Python has no braces `{}` and no `elif`-less alternative spelling —
**indentation itself defines the block**. Four spaces is the near-universal
convention. Mixing tabs and spaces is a real, common source of errors.
{{tab C#}}
```csharp
int age = 20;

if (age < 13) {
    Console.WriteLine("child");
} else if (age < 20) {
    Console.WriteLine("teenager");
} else {
    Console.WriteLine("adult");
}
```

C# uses parentheses `()` around the condition and braces `{}` around the
block. Indentation is purely cosmetic (for humans) — the braces are what
the compiler actually reads. You *can* omit the braces for a single
statement, but leaving them on is the near-universal convention because
omitting them is a classic source of bugs when a line is added later.
{{/tabs}}

### Control flow: loops

{{tabs}}
{{tab Python}}
```python
# for loop over a range
for i in range(5):
    print(i)          # 0 1 2 3 4

# for loop over a collection directly
fruits = ["apple", "banana", "cherry"]
for fruit in fruits:
    print(fruit)

# while loop
count = 0
while count < 3:
    print(count)
    count += 1        # no ++ operator in Python
```
{{tab C#}}
```csharp
// classic counting for loop
for (int i = 0; i < 5; i++) {
    Console.WriteLine(i);          // 0 1 2 3 4
}

// foreach loop over a collection directly
var fruits = new List<string> { "apple", "banana", "cherry" };
foreach (var fruit in fruits) {
    Console.WriteLine(fruit);
}

// while loop
int count = 0;
while (count < 3) {
    Console.WriteLine(count);
    count++;
}
```
{{/tabs}}

### Functions

{{tabs}}
{{tab Python}}
```python
def greet(name, greeting="Hello"):   # "Hello" is a default parameter value
    return f"{greeting}, {name}!"

print(greet("Ada"))                  # Hello, Ada!
print(greet("Ada", "Hi"))            # Hi, Ada!
```

`def` declares a function. No return type is declared — Python figures it
out at runtime. `f"{greeting}, {name}!"` is an **f-string**, Python's way
of embedding variables directly inside a string.
{{tab C#}}
```csharp
static string Greet(string name, string greeting = "Hello") {
    return $"{greeting}, {name}!";
}

Console.WriteLine(Greet("Ada"));          // Hello, Ada!
Console.WriteLine(Greet("Ada", "Hi"));    // Hi, Ada!
```

The return type (`string`) is declared right before the function name —
the compiler enforces that every code path actually returns a `string`.
`$"{greeting}, {name}!"` is C#'s equivalent of an f-string, called
**string interpolation**.
{{/tabs}}

### Basic input/output

{{tabs}}
{{tab Python}}
```python
name = input("What's your name? ")
print(f"Nice to meet you, {name}!")
```

`input(...)` always returns a `str` — convert it yourself if you need a
number: `age = int(input("Age? "))`.
{{tab C#}}
```csharp
Console.Write("What's your name? ");
string name = Console.ReadLine();
Console.WriteLine($"Nice to meet you, {name}!");
```

`Console.ReadLine()` always returns a `string` — convert it yourself:
`int age = int.Parse(Console.ReadLine());`.
{{/tabs}}

## Hands-on exercises

Do every exercise in **both** languages before moving on — that's the
entire point of this module.

### 1. Hello, you

Print a greeting that includes your name using a variable, not a literal
string typed twice.

### 2. Type check

Declare one variable of each of the four basic types (whole number,
decimal, text, true/false) and print each one alongside its type
(`type(x)` in Python, `x.GetType()` in C#).

### 3. Simple calculator

Take two numbers and print the result of `+`, `-`, `*`, `/`, and `%` on
them. In C#, deliberately try it first with two `int`s and observe the
truncated division, then fix it by using `double`.

### 4. FizzBuzz

For numbers 1 to 20: print "Fizz" if divisible by 3, "Buzz" if divisible
by 5, "FizzBuzz" if divisible by both, otherwise print the number itself.
This is a loop + `if`/`elif` exercise — nothing more, but it's a
near-universal warm-up for a reason: it catches sloppy conditionals fast.

### 5. Temperature converter

Write a function `celsius_to_fahrenheit(c)` / `CelsiusToFahrenheit(double
c)` that returns `c * 9/5 + 32`. Call it with a few values and print the
results. (In C#, watch out for the same integer-division trap from
exercise 3 if you write the formula with `int`s.)

### 6. Read and respond

Prompt the user for their name and age (as text input), convert the age to
a number, and print whether they're a "child", "teenager", or "adult"
using the `if`/`elif`/`else` structure from the Concepts section.

## Independent challenge

No code given.

**Task:** Build a number-guessing game, in both languages. The program
picks a random number between 1 and 100 (Python: `random.randint(1,
100)`; C#: `new Random().Next(1, 101)`), then repeatedly asks the user to
guess, printing "too high" or "too low" after each wrong guess, until they
get it right — then print how many guesses it took. You'll need a loop
that keeps running until a condition is met (hint: `while True:` /
`while (true) { ... break; }` with a `break` when they guess correctly is
one valid approach — look up how `break` works in each language if you
haven't seen it yet).

<details>
<summary>Hint</summary>

Structure: pick the number once, before the loop. Inside the loop: read a
guess, compare it to the target, print the appropriate message, and
increment a guess counter. Exit the loop (`break`, or a `while` condition
that checks a "found it" flag) only once the guess equals the target.

</details>

## Common mistakes & troubleshooting

- **Mixing tabs and spaces in Python.** Python cares about indentation as
  syntax, and mixing tab characters with space characters can produce an
  `IndentationError` that looks like it shouldn't happen. Configure your
  editor to insert spaces for Tab.
- **Forgetting braces/semicolons in C#.** Every statement ends in `;`;
  every block is wrapped in `{}`. The compiler's error messages point at
  the *next* line sometimes, which is confusing at first — if a
  single-character error mentions a line that looks fine, check the line
  *before* it.
- **`int / int` truncating in C#.** Covered above — the #1 cross-language
  gotcha. If you want a fractional result, make sure at least one operand
  is a `double`/`float`.
- **Confusing `=` and `==`.** `=` assigns; `==` compares. Both languages
  make this mistake possible in an `if`, though C# at least refuses to
  compile `if (x = 5)` for a `bool` variable `x` in most cases, while
  Python's `if x = 5:` is a straight-up `SyntaxError` (Python doesn't
  allow assignment inside an `if` at all, on purpose).
- **Assuming `var` in C# means "no type."** It means "let the compiler
  figure out the type once, right now" — the variable is still locked to
  that one type forever after. It is not Python-style dynamic typing.
- **Forgetting `input()`/`Console.ReadLine()` returns text.** Both
  languages hand you a string from user input; you must explicitly
  convert it before doing math with it.

## Checkpoint quiz

Write your answer before expanding it.

1. Is Python interpreted or compiled? Is C# interpreted or compiled? What
   practical difference does that make for when a type error is caught?
2. What does `age = "thirty"` do if `age` was previously an `int` in
   Python? What happens if you try the same thing in C#?
3. What does `7 / 3` evaluate to in Python? What does it evaluate to in
   C#, and why?
4. In C#, what's the difference between declaring a variable with `var`
   and Python's dynamic typing?
5. What character(s) define a code block in Python? In C#?
6. Name one thing `input()`/`Console.ReadLine()` always returns, in both
   languages, regardless of what the user typed.

<details>
<summary>Answers</summary>

1. Python is interpreted (runs line by line as it reads the file); C# is
   compiled (the whole program is translated and type-checked before
   anything runs). Practically: a type error in a rarely-run branch can
   surface at runtime in Python, but is caught by the compiler in C#
   before the program ever starts.
2. In Python, it's legal — `age` now refers to a `str`, no error. In C#,
   it's a compile error — `age` was declared `int` and can never hold a
   `string`.
3. Python: `2.333...` (true division). C#: `2` (integer division
   truncates when both operands are `int`).
4. `var` infers the type once at compile time and locks it — you cannot
   later assign a different type to that variable. Python's dynamic
   typing allows the same variable name to refer to different types at
   different times, with no such lock.
5. Python: indentation (whitespace) defines blocks. C#: curly braces `{}`.
6. A string (`str`/`string`) — always text, never a number, regardless of
   what was typed.

</details>

## Interview questions

These are the "warm-up" language questions an interviewer may ask before
getting into design — mostly to confirm you actually understand what
you're writing, not to trip you up.

1. **"Is Python statically or dynamically typed? What about C#?"**
   Python is dynamically typed (types are checked at runtime, and a
   variable name can rebind to any type). C# is statically typed (types
   are declared and checked at compile time).
2. **"What happens if you divide two integers in C#? How is that
   different from Python?"**
   C#'s `/` between two `int`s performs integer division and truncates
   the result (`7 / 3` → `2`). Python's `/` always performs true (float)
   division regardless of operand types (`7 / 3` → `2.333...`); Python's
   separate `//` operator gives floor division if you want the truncated
   result.
3. **"What's the practical benefit of a compiled, statically typed
   language over an interpreted, dynamically typed one, and vice versa?"**
   Static/compiled (C#) catches a class of errors before the program
   runs and documents intent via declared types, at the cost of more
   upfront ceremony. Dynamic/interpreted (Python) is faster to write and
   experiment with, at the cost of some errors only surfacing when that
   exact code path executes.

## Further reading & sources

- [The Python Tutorial](https://docs.python.org/3/tutorial/) - the official, from-scratch introduction to the language.
- [Microsoft Learn: C# tour](https://learn.microsoft.com/en-us/dotnet/csharp/tour-of-csharp/) - the official from-scratch tour of C# syntax.
- [Python: built-in types](https://docs.python.org/3/library/stdtypes.html) - authoritative reference for `int`, `str`, `list`, `dict`, etc.
- [C# built-in types reference](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/built-in-types) - authoritative reference for `int`, `double`, `string`, etc.

## Next

[01-classes-objects-and-oop-building-blocks](../01-classes-objects-and-oop-building-blocks/README.md)
— now that you can write a plain program in both languages, we introduce
classes, objects, constructors, and access modifiers: the actual building
blocks every design pattern in this track will be made of.
