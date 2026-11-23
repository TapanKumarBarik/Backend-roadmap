# Module 08: Capstone, an Expense Tracker

> **Prerequisites:** Modules [00](../00-running-python-values-and-types/README.md) to [07](../07-errors-files-and-modules/README.md). Everything below uses something you have already met.  
> **Estimated Reading Time:** 45 minutes  
> **Who this is for:** Anyone who has finished the track and wants to see the pieces working together in one small, real program.

> [!key]
> A program is a handful of small functions that each do one job, working on a plain data structure. Here the data is a **list of dictionaries**, one per expense, and the functions add to it, add it up, print it and save it. The last step shows the same program as a **class**, which is where the next topic begins.

## What you will be able to do

- Break a small problem into data and functions.
- Validate input and report mistakes without crashing.
- Group and total records, and print them as an aligned report.
- Save to a file and load it back.
- See how a set of functions that share one list becomes a class.

## 1. What we are building

An expense tracker. You give it expenses (a date, a category, a description and an amount) and it can total them, group them by category, print a report and remember them between runs.

Decisions made before writing any code, and the module each one comes from:

| Decision | Choice | From |
|----------|--------|------|
| One expense | A dictionary with `date`, `category`, `description`, `cents` | Module 03 |
| All expenses | A list of those dictionaries | Module 02 |
| Money | Whole **cents** as an `int`, never a float | Module 00 |
| Bad input | Raise `ValueError` with a clear message, and catch it where the data comes in | Module 07 |
| Saving | A JSON file | Module 07 |
| Layout | f-strings with widths | Module 01 |

Storing cents means `12.50` is saved as `1250`, and the arithmetic is exact. We turn it back into `12.50` only when we show it.

## 2. Step 1: the data and showing money

```python
expenses = [
    {"date": "2024-05-01", "category": "food", "description": "lunch", "cents": 1250},
    {"date": "2024-05-02", "category": "transport", "description": "metro card", "cents": 3000},
    {"date": "2024-05-03", "category": "food", "description": "groceries", "cents": 5499},
]


def money(cents):
    return f"{cents / 100:,.2f}"


for expense in expenses:
    print(expense["date"], expense["description"], money(expense["cents"]))
print(money(123456789))
```

```text
2024-05-01 lunch 12.50
2024-05-02 metro card 30.00
2024-05-03 groceries 54.99
1,234,567.89
```

`money` is used by almost everything else, which is a good sign: it is one tiny function with one job. If you later want a currency symbol, you change it in one place.

## 3. Step 2: adding expenses safely

Real input is messy: someone types `abc` for an amount, or a date that does not exist. We turn raw text into clean values in small functions that **raise** `ValueError` when the text is no good, and one function that puts an expense together.

```python
from datetime import date


def money(cents):
    return f"{cents / 100:,.2f}"


def parse_amount(text):
    """'12.50' becomes 1250 cents. Anything else raises ValueError."""
    try:
        amount = float(text)
    except ValueError:
        raise ValueError(f"not a number: {text!r}")
    if not 0 < amount < 1_000_000:
        raise ValueError("amount must be between 0 and 1,000,000")
    return round(amount * 100)


def parse_date(text):
    """Accepts YYYY-MM-DD only. Anything else raises ValueError."""
    try:
        if len(text) != 10:
            raise ValueError
        date.fromisoformat(text)
    except ValueError:
        raise ValueError(f"not a date (use YYYY-MM-DD): {text!r}")
    return text


def add_expense(expenses, date_text, category, description, amount_text):
    expense = {
        "date": parse_date(date_text),
        "category": category.strip().lower(),
        "description": description.strip(),
        "cents": parse_amount(amount_text),
    }
    expenses.append(expense)
    return expense


entries = [
    ("2024-05-01", "Food", " lunch ", "12.50"),
    ("2024-05-02", "transport", "metro", "abc"),
    ("2024-05-03", "food", "dinner", "-4"),
    ("2024-13-40", "food", "party", "20"),
    ("2024-05-04", "Fun", "cinema", "8.99"),
]

expenses = []
for entry in entries:
    try:
        added = add_expense(expenses, *entry)
    except ValueError as error:
        print("rejected:", error)
    else:
        print("added:", added["description"], money(added["cents"]))
print(len(expenses), "expenses kept")
```

```text
added: lunch 12.50
rejected: not a number: 'abc'
rejected: amount must be between 0 and 1,000,000
rejected: not a date (use YYYY-MM-DD): '2024-13-40'
added: cinema 8.99
2 expenses kept
```

Notice how the pieces cooperate:

- `parse_amount` and `parse_date` only **check and convert**. They do not know about lists or printing.
- `add_expense` builds the dictionary, cleaning the text with `strip()` and `lower()` (Module 01), so `"Food"` and `"food"` become the same category.
- The `for` loop is the only place that **catches** the error, because that is where the decision "what do we do about bad input?" belongs. A failed entry never reaches the list, because `add_expense` raised before the `append`.
- `*entry` spreads the five values of a tuple into the five parameters (Module 05).

`round(amount * 100)` turns `8.99` into `899`. Rounding matters here, because floats are approximations (Module 00) and cutting with `int` can lose a cent:

```python
print(4.35 * 100)
print(int(4.35 * 100))
print(round(4.35 * 100))
```

```text
434.99999999999994
434
435
```

`4.35 * 100` is a hair under 435, so `int` throws the fraction away and gives 434, one cent short. `round` gives the 435 you meant.

## 4. Step 3: totals, groups and the report

Now the useful part: answering questions about the expenses.

```python
def money(cents):
    return f"{cents / 100:,.2f}"


def total(expenses):
    return sum(e["cents"] for e in expenses)


def totals_by_category(expenses):
    totals = {}
    for e in expenses:
        totals[e["category"]] = totals.get(e["category"], 0) + e["cents"]
    return totals


def biggest(expenses):
    if not expenses:
        return None
    return max(expenses, key=lambda e: e["cents"])


def report(expenses):
    if not expenses:
        print("No expenses yet.")
        return
    print(f"{'Date':<12}{'Category':<12}{'Description':<16}{'Amount':>10}")
    print("-" * 50)
    for e in sorted(expenses, key=lambda e: e["date"]):
        print(f"{e['date']:<12}{e['category']:<12}{e['description']:<16}{money(e['cents']):>10}")
    print("-" * 50)
    print(f"{'Total':<40}{money(total(expenses)):>10}")
    print()
    grand_total = total(expenses)
    by_category = totals_by_category(expenses)
    for category, cents in sorted(by_category.items(), key=lambda pair: pair[1], reverse=True):
        print(f"{category:<12}{money(cents):>10}  {cents / grand_total:>6.1%}")


expenses = [
    {"date": "2024-05-03", "category": "food", "description": "groceries", "cents": 5499},
    {"date": "2024-05-01", "category": "food", "description": "lunch", "cents": 1250},
    {"date": "2024-05-02", "category": "transport", "description": "metro card", "cents": 3000},
    {"date": "2024-05-04", "category": "fun", "description": "cinema", "cents": 899},
]

report(expenses)
print()
top = biggest(expenses)
print("biggest:", top["description"], money(top["cents"]))
print(biggest([]))
```

```text
Date        Category    Description         Amount
--------------------------------------------------
2024-05-01  food        lunch                12.50
2024-05-02  transport   metro card           30.00
2024-05-03  food        groceries            54.99
2024-05-04  fun         cinema                8.99
--------------------------------------------------
Total                                       106.48

food             67.49   63.4%
transport        30.00   28.2%
fun               8.99    8.4%

biggest: groceries 54.99
None
```

Walk through the parts, because each is a lesson from earlier in the track:

- **`total`** is a generator inside `sum`, a one-line loop (Module 04).
- **`totals_by_category`** is the counting pattern from Module 03: `get(key, 0) + amount`.
- **`biggest`** uses `max` with a `key` function, like `sorted` in Module 02, and returns `None` for an empty list instead of crashing.
- **`report`** starts with a guard clause (`if not expenses: ... return`), then formats a table using widths and alignment from Module 01. It sorts the rows by date without changing the original list, and sorts the categories by amount, biggest first.

## 5. Step 4: remembering between runs

A program that forgets everything when it stops is not much of a tracker. Saving is a few lines of `json`:

```python
import json


def save(expenses, filename):
    with open(filename, "w", encoding="utf-8") as file:
        json.dump(expenses, file, indent=2)


def load(filename):
    try:
        with open(filename, encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        return []


print(load("demo.json"))

save([{"date": "2024-05-01", "category": "food", "description": "lunch", "cents": 1250}], "demo.json")
print(load("demo.json"))
```

```text
[]
[{'date': '2024-05-01', 'category': 'food', 'description': 'lunch', 'cents': 1250}]
```

`load` treats "no file yet" as "no expenses yet", which is what you want the very first time the program runs. Our data is already plain lists, dictionaries, text and integers, so JSON saves it with no conversion.

## 6. The complete program

Here is everything together as one program. It runs a scripted session (a real one would read from the keyboard or a web form): load what was saved; if nothing was saved yet, try six entries, two of them bad, and save the good ones; then print the report.

Press Run, and then press it **again**. The second time it says `loaded 4 saved expenses` and does not add anything: the program found the file the first run wrote. (In this page the file lives in your browser tab until you reload, so reloading starts fresh. On your own computer it would still be there tomorrow.)

<details>
<summary>Show the complete program</summary>

```python
import json
from datetime import date


# ---- showing money -------------------------------------------------------
def money(cents):
    return f"{cents / 100:,.2f}"


# ---- turning text into clean values --------------------------------------
def parse_amount(text):
    try:
        amount = float(text)
    except ValueError:
        raise ValueError(f"not a number: {text!r}")
    if not 0 < amount < 1_000_000:
        raise ValueError("amount must be between 0 and 1,000,000")
    return round(amount * 100)


def parse_date(text):
    try:
        if len(text) != 10:
            raise ValueError
        date.fromisoformat(text)
    except ValueError:
        raise ValueError(f"not a date (use YYYY-MM-DD): {text!r}")
    return text


def add_expense(expenses, date_text, category, description, amount_text):
    expense = {
        "date": parse_date(date_text),
        "category": category.strip().lower(),
        "description": description.strip(),
        "cents": parse_amount(amount_text),
    }
    expenses.append(expense)
    return expense


# ---- answering questions -------------------------------------------------
def total(expenses):
    return sum(e["cents"] for e in expenses)


def totals_by_category(expenses):
    totals = {}
    for e in expenses:
        totals[e["category"]] = totals.get(e["category"], 0) + e["cents"]
    return totals


def report(expenses):
    if not expenses:
        print("No expenses yet.")
        return
    print(f"{'Date':<12}{'Category':<12}{'Description':<16}{'Amount':>10}")
    print("-" * 50)
    for e in sorted(expenses, key=lambda e: e["date"]):
        print(f"{e['date']:<12}{e['category']:<12}{e['description']:<16}{money(e['cents']):>10}")
    print("-" * 50)
    grand_total = total(expenses)
    print(f"{'Total':<40}{money(grand_total):>10}")
    print()
    for category, cents in sorted(totals_by_category(expenses).items(), key=lambda pair: pair[1], reverse=True):
        print(f"{category:<12}{money(cents):>10}  {cents / grand_total:>6.1%}")


# ---- remembering ---------------------------------------------------------
def save(expenses, filename):
    with open(filename, "w", encoding="utf-8") as file:
        json.dump(expenses, file, indent=2)


def load(filename):
    try:
        with open(filename, encoding="utf-8") as file:
            return json.load(file)
    except FileNotFoundError:
        return []


# ---- putting it together -------------------------------------------------
def main():
    filename = "expenses.json"
    expenses = load(filename)
    print(f"loaded {len(expenses)} saved expenses")

    if not expenses:
        entries = [
            ("2024-05-01", "Food", "lunch", "12.50"),
            ("2024-05-02", "transport", "metro card", "30"),
            ("2024-05-03", "food", "groceries", "54.99"),
            ("2024-05-04", "fun", "cinema", "eight"),
            ("2024-05-31", "fun", "concert", "89.99"),
            ("2024-02-30", "fun", "party", "20"),
        ]
        for entry in entries:
            try:
                added = add_expense(expenses, *entry)
            except ValueError as error:
                print("rejected:", error)
            else:
                print("added:", added["description"], money(added["cents"]))
        save(expenses, filename)

    print()
    report(expenses)


if __name__ == "__main__":
    main()
```

```text
loaded 0 saved expenses
added: lunch 12.50
added: metro card 30.00
added: groceries 54.99
rejected: not a number: 'eight'
added: concert 89.99
rejected: not a date (use YYYY-MM-DD): '2024-02-30'

Date        Category    Description         Amount
--------------------------------------------------
2024-05-01  food        lunch                12.50
2024-05-02  transport   metro card           30.00
2024-05-03  food        groceries            54.99
2024-05-31  fun         concert              89.99
--------------------------------------------------
Total                                       187.48

fun              89.99   48.0%
food             67.49   36.0%
transport        30.00   16.0%
```

</details>

Everything in it is something you have already met. The only new idea is the **shape**: small functions, each doing one thing, each testable on its own, with `main` as the only function that knows the order of events.

## 7. A preview: the same program as a class

Look at the functions above. Almost every one starts with the same parameter, `expenses`. That is a hint: the list and the functions that work on it belong together. A **class** bundles them:

```python
class ExpenseTracker:
    def __init__(self):
        self.expenses = []

    def add(self, date_text, category, description, cents):
        self.expenses.append(
            {"date": date_text, "category": category, "description": description, "cents": cents}
        )

    def total(self):
        return sum(e["cents"] for e in self.expenses)

    def by_category(self):
        totals = {}
        for e in self.expenses:
            totals[e["category"]] = totals.get(e["category"], 0) + e["cents"]
        return totals


tracker = ExpenseTracker()
tracker.add("2024-05-01", "food", "lunch", 1250)
tracker.add("2024-05-02", "transport", "metro card", 3000)
tracker.add("2024-05-03", "food", "groceries", 5499)

print(tracker.total())
print(tracker.by_category())
```

```text
9749
{'food': 6749, 'transport': 3000}
```

The list became `self.expenses`, something the object **remembers**. The functions became **methods**, and the `expenses` parameter became `self`. `tracker.total()` reads better than `total(expenses)`, and you can have several trackers at once, each with its own list. That is the whole beginning of object-oriented programming, and it is exactly where the next guide picks up: attributes, methods, `__init__`, and exercises such as the movie-ticket booking class.

## Exercises

These extend the tracker. Try each before opening the answer. Each answer is complete on its own.

### 1. Spending by month

Write `totals_by_month(expenses)` returning a dictionary such as `{"2024-05": 9649}`. (Hint: the first seven characters of the date are the year and month.)

<details>
<summary>Answer</summary>

```python
def totals_by_month(expenses):
    totals = {}
    for e in expenses:
        month = e["date"][:7]
        totals[month] = totals.get(month, 0) + e["cents"]
    return totals


expenses = [
    {"date": "2024-05-01", "category": "food", "description": "lunch", "cents": 1250},
    {"date": "2024-05-20", "category": "fun", "description": "cinema", "cents": 899},
    {"date": "2024-06-02", "category": "food", "description": "groceries", "cents": 5499},
]
print(totals_by_month(expenses))
```

```text
{'2024-05': 2149, '2024-06': 5499}
```

The same counting pattern as categories, with a different key: slicing the date text (Module 01).

</details>

### 2. Budget alerts

Given a dictionary of budgets per category in cents, such as `{"food": 6000, "fun": 1000}`, write `over_budget(expenses, budgets)` that returns the categories that have gone over, with how much over.

<details>
<summary>Answer</summary>

```python
def over_budget(expenses, budgets):
    spent = {}
    for e in expenses:
        spent[e["category"]] = spent.get(e["category"], 0) + e["cents"]

    alerts = {}
    for category, limit in budgets.items():
        if spent.get(category, 0) > limit:
            alerts[category] = spent[category] - limit
    return alerts


expenses = [
    {"date": "2024-05-01", "category": "food", "description": "lunch", "cents": 1250},
    {"date": "2024-05-03", "category": "food", "description": "groceries", "cents": 5499},
    {"date": "2024-05-04", "category": "fun", "description": "cinema", "cents": 899},
]
print(over_budget(expenses, {"food": 6000, "fun": 1000, "transport": 500}))
```

```text
{'food': 749}
```

Food is 6749 against a limit of 6000, so it is 749 over. Fun is under, and transport has no spending at all (`spent.get(category, 0)`).

</details>

### 3. Deleting an expense

Write `delete_expense(expenses, index)` that removes and returns the expense at that position, and raises a `ValueError` with a clear message when there is no such position.

<details>
<summary>Answer</summary>

```python
def delete_expense(expenses, index):
    if not 0 <= index < len(expenses):
        raise ValueError(f"no expense at position {index}; there are {len(expenses)}")
    return expenses.pop(index)


expenses = [
    {"date": "2024-05-01", "category": "food", "description": "lunch", "cents": 1250},
    {"date": "2024-05-02", "category": "fun", "description": "cinema", "cents": 899},
]

print(delete_expense(expenses, 0)["description"])
print(len(expenses))
try:
    delete_expense(expenses, 5)
except ValueError as error:
    print("rejected:", error)
```

```text
lunch
1
rejected: no expense at position 5; there are 1
```

We check the position ourselves so the caller gets a message that makes sense for this program, instead of a bare `IndexError`.

</details>

## Where to go from here

- **Go deeper on what you just saw:** [Classes and objects](../../../lld/01-classes-objects-and-oop-building-blocks/README.md) and the [object-oriented programming guide](/topics/oop-python/) turn the class preview above into a full topic, with coding exercises.
- **Practice:** the [Practice](/practice/) section has Python problems that run in the browser.

## Check yourself

> [!check]
> - I can say why money is stored as whole cents
> - I can explain why `parse_amount` raises an error and the loop is where it is caught
> - I can total and group records with a loop and a dictionary
> - I can print an aligned table with f-string widths
> - I can save a list of dictionaries to a file and load it back
> - I can explain why a list and the functions that work on it are a candidate for a class

## Further reading and sources

- [The Python Tutorial: Classes](https://docs.python.org/3/tutorial/classes.html) - the official introduction to the next step.
- [datetime: date.fromisoformat](https://docs.python.org/3/library/datetime.html#datetime.date.fromisoformat) - the date check used in `parse_date`.
- [json: encoder and decoder](https://docs.python.org/3/library/json.html) - everything `save` and `load` rely on.
- [PEP 8: the style guide for Python code](https://peps.python.org/pep-0008/) - naming and layout conventions the functions above follow.

## Next

This is the last lesson of the track. Continue with [Classes and objects](../../../lld/01-classes-objects-and-oop-building-blocks/README.md).
