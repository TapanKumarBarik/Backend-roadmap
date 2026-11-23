# Module 00: Running Python, Values and Types

> **Prerequisites:** None. If you have written code in any language, this will feel familiar.  
> **Estimated Reading Time:** 20 minutes  
> **Who this is for:** Anyone who wants Python fresh in their head before moving on to classes and larger programs.

> [!key]
> A Python program is a list of instructions run from top to bottom. Each one either **gives a name to a value** (`age = 30`) or **does something with values** (`print(age + 1)`). Almost everything in this track is a variation on those two moves.

## What you will be able to do

- Run Python three different ways.
- Create variables and say what type of value each one holds.
- Do arithmetic without surprises, including the famous `0.1 + 0.2`.
- Put values into text with f-strings.
- Use `True`, `False` and `None` correctly.

## 1. Three ways to run Python

| Where | How | When to use it |
|-------|-----|----------------|
| **In this page** | Press **Run** under any example. | Learning. Nothing to install, and you can edit the code and run it again. |
| **The interactive prompt** | Type `python` in a terminal. You get a `>>>` prompt; type a line and press Enter to see the result at once. | Trying a small idea without making a file. |
| **A file** | Save code as `hello.py`, then run `python hello.py` in a terminal. | Real programs. This is how every program you ship is run. |

The first program everyone writes:

```python
print("Hello, world")
```

```text
Hello, world
```

`print` is a **function**: you give it something in parentheses and it does something with it. Here it writes the text to the screen. The quotes tell Python that `Hello, world` is text and not an instruction.

> [!tip]
> Every example in this track is a complete program. Press Run, then change a number or a word and press Run again. Changing things and watching what happens teaches faster than reading.

## 2. Values and names

A **value** is a piece of data: the number `30`, the text `"Asha"`. A **variable** is a name you give to a value so you can use it later.

```python
name = "Asha"
age = 30
print(name)
print(age + 1)
```

```text
Asha
31
```

The `=` here does **not** mean "equals". It means "give this name to this value". Read `age = 30` as "let `age` be 30". You can give a name a new value any time:

```python
score = 10
score = score + 5
print(score)
```

```text
15
```

The right side is worked out first (10 + 5 = 15), and then the name `score` is pointed at the result.

**Rules for names:** letters, digits and underscores, never starting with a digit, and case matters (`Score` and `score` are different names). The convention, from [PEP 8](https://peps.python.org/pep-0008/), is `lower_case_with_underscores`, such as `total_price`. Pick names that say what the value is.

## 3. The types you will use every day

Every value has a **type**, which says what kind of thing it is and what you can do with it. The built-in function `type` tells you:

```python
print(type(42))
print(type(3.14))
print(type("hello"))
print(type(True))
print(type(None))
```

```text
<class 'int'>
<class 'float'>
<class 'str'>
<class 'bool'>
<class 'NoneType'>
```

| Type | Name | Example | Used for |
|------|------|---------|----------|
| `int` | integer | `42`, `-7`, `1_000_000` | Whole numbers of any size |
| `float` | floating-point | `3.14`, `2.0`, `1e-6` | Numbers with a fractional part |
| `str` | string | `"hello"`, `'hi'` | Text |
| `bool` | boolean | `True`, `False` | Yes or no answers |
| `NoneType` | none | `None` | "There is no value here" |

Python works out the type from the value, so you never declare it. A name is not tied to one type: `x = 5` and then `x = "five"` is allowed (though changing the type of a name makes code harder to read).

## 4. Numbers

Python is a good calculator:

```python
print(7 + 2)
print(7 - 2)
print(7 * 2)
print(7 / 2)
print(7 // 2)
print(7 % 2)
print(2 ** 10)
```

```text
9
5
14
3.5
3
1
1024
```

Two of these deserve a moment:

- **`/` always gives a float**, even when the answer is whole: `8 / 2` is `4.0`, not `4`.
- **`//` is floor division**: it divides and throws away the fraction. **`%` is the remainder** that was thrown away. Together they split a number into whole parts and what is left over: `7 // 2` is 3 and `7 % 2` is 1, because 7 is 3 twos with 1 left.

That pair is more useful than it looks. This turns a number of seconds into minutes and seconds:

```python
total_seconds = 135
minutes = total_seconds // 60
seconds = total_seconds % 60
print(minutes, "minutes and", seconds, "seconds")
```

```text
2 minutes and 15 seconds
```

### Floats are approximations

Computers store floats in binary, and most decimal fractions cannot be written exactly in binary, just as 1/3 cannot be written exactly in decimal. So:

```python
print(0.1 + 0.2)
print(0.1 + 0.2 == 0.3)
print(round(0.1 + 0.2, 2))
```

```text
0.30000000000000004
False
0.3
```

This is not a Python bug. Every language that uses standard floats does the same. Two habits keep you safe: **never compare floats with `==`** (compare whether they are close, or round first), and **never use floats for money**. Store whole cents as an `int`, or use the `decimal` module.

### Converting between types

```python
print(int("42") + 1)
print(float("3.5") * 2)
print(str(42) + "!")
print(int(3.9))
print(round(3.14159, 2))
```

```text
43
7.0
42!
3
3.14
```

`int(3.9)` is 3: converting to `int` cuts the fraction off, it does not round. A few other helpful built-ins: `abs(-5)` is 5, `max(3, 9, 4)` is 9, `min(3, 9, 4)` is 3.

## 5. Text, and putting values into it

Text goes in quotes, single or double (they are the same; pick one and be consistent). To build a sentence out of values, use an **f-string**: put an `f` before the opening quote and write values inside curly braces.

```python
name = "Asha"
age = 30
price = 19.987
print(f"{name} is {age} years old")
print(f"The price is {price:.2f}")
print(f"Population: {8_100_000_000:,}")
print(f"{age + 1} next year")
```

```text
Asha is 30 years old
The price is 19.99
Population: 8,100,000,000
31 next year
```

Whatever is inside `{}` is worked out first, so you can put calculations there. After a colon you can say how to show the value: `.2f` means "two digits after the decimal point" and `,` adds thousands separators. You will meet more of these in the next lesson.

## 6. True, False and None

A comparison produces a `bool`:

```python
age = 30
print(age > 18)
print(age == 30)
print(age != 30)
print(age > 18 and age < 65)
print(not age > 18)
```

```text
True
True
False
True
False
```

`==` asks "are these equal?", `!=` asks "are these different?". Combine yes/no answers with `and` (both must be true), `or` (at least one) and `not` (flip it).

`None` is Python's way of saying "nothing here". It is what you get when something has no answer, such as a function that never returns anything. Test for it with `is None`:

```python
middle_name = None
print(middle_name is None)
print(middle_name is not None)
```

```text
True
False
```

## 7. Comments

Everything after a `#` on a line is ignored by Python. Use comments to say **why**, not to repeat **what** the code already says.

```python
# Prices are stored in cents to avoid float rounding.
price_in_cents = 1999
print(price_in_cents / 100)
```

```text
19.99
```

## Common mistakes

> [!pitfall]
> **Using `=` where you meant `==`.** `age = 30` gives `age` a value. `age == 30` asks a question. Python will stop you if you write `if age = 30:`, but it will not stop you from writing `age = 30` where you wanted the comparison in an `and` or in a return.

> [!pitfall]
> **Adding text and a number.** Python will not guess what you meant:

```python
# raises
print("Total: " + 5)
```

```text
TypeError: can only concatenate str (not "int") to str
```

Use an f-string instead, `f"Total: {5}"`, or convert first with `str(5)`.

> [!pitfall]
> **Using a built-in name as your own variable.** Names such as `list`, `str`, `max`, `sum` and `type` are built in. If you write `list = [1, 2, 3]`, you have hidden Python's `list` for the rest of the program:

```python
# raises
list = [1, 2, 3]
print(list("abc"))
```

```text
TypeError: 'list' object is not callable
```

If you ever see "object is not callable" on a name you did not expect, look for a variable that has the same name as a built-in.

> [!pitfall]
> **Rounding halves.** Python rounds exact halves to the nearest *even* number, so `round(2.5)` is 2 and `round(3.5)` is 4. This is deliberate (it avoids always rounding up) but surprising the first time.

```python
print(round(2.5), round(3.5), round(4.5))
```

```text
2 4 4
```

## Practice

Try each one before you open the answer.

### 1. Fahrenheit to Celsius

Convert 100 degrees Fahrenheit to Celsius with the formula `(F - 32) * 5 / 9`, and print it with one digit after the decimal point.

<details>
<summary>Answer</summary>

```python
fahrenheit = 100
celsius = (fahrenheit - 32) * 5 / 9
print(f"{fahrenheit} F is {celsius:.1f} C")
```

```text
100 F is 37.8 C
```

</details>

### 2. Seconds to hours, minutes and seconds

Turn 4000 seconds into "1h 6m 40s". Use `//` and `%`.

<details>
<summary>Answer</summary>

```python
total = 4000
hours = total // 3600
minutes = (total % 3600) // 60
seconds = total % 60
print(f"{hours}h {minutes}m {seconds}s")
```

```text
1h 6m 40s
```

Take the whole hours first, then work with what is left over: `total % 3600` is the seconds after the hours, and dividing that by 60 gives whole minutes.

</details>

### 3. Predict, then run

What do these print? Write down your guess for each line first.

```python
print(10 / 4)
print(10 // 4)
print(10 % 4)
print(2 ** 3 ** 2)
print("5" * 3)
```

<details>
<summary>Answer</summary>

```text
2.5
2
2
512
555
```

`10 / 4` is 2.5 and `10 // 4` is 2. `2 ** 3 ** 2` is `2 ** 9`, because `**` works right to left. And `"5" * 3` repeats the text three times, which is a different thing from multiplying numbers.

</details>

## Check yourself

> [!check]
> - I can explain what `age = 30` does, and that it is not an equals sign
> - I can say what `type(3.0)` and `type("3")` are
> - I can explain the difference between `/`, `//` and `%`
> - I know why `0.1 + 0.2 == 0.3` is `False`, and what to do instead
> - I can put a value into a sentence with an f-string
> - I can test whether something is `None`

## Further reading and sources

- [The Python Tutorial: An Informal Introduction to Python](https://docs.python.org/3/tutorial/introduction.html) - numbers, text and lists, introduced gently, by the language's own documentation.
- [Built-in Types](https://docs.python.org/3/library/stdtypes.html) - the complete reference for `int`, `float`, `str`, `bool` and `None`.
- [Format specification mini-language](https://docs.python.org/3/library/string.html#format-specification-mini-language) - everything that can follow the colon in an f-string, such as `.2f` and `,`.
- [PEP 8: the style guide for Python code](https://peps.python.org/pep-0008/) - the naming and layout conventions most Python code follows.

## Next

Next: [Strings and text](../01-strings-and-text/README.md).
