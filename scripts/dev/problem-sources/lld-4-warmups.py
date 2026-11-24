PROBLEMS = [
P(
    slug='lld-money-value-object', title='Money as a Value Object', topic='lld-oop-warmups', difficulty='intermediate',
    module='lld/03-generics-exceptions-and-value-objects/README.md',
    description='Build an immutable Money class with equality, hashing, arithmetic, ordering and a fair way to split an amount.',
    statement=r'''Write a class `Money` that holds an amount in **whole cents** and a currency. It is a **value object**: two `Money` with the same cents and currency are interchangeable.

**Creating one:** `Money(cents, currency)`.

- `cents` must be an `int` (not a `bool`, not a float): otherwise `ValueError("Cents must be a whole number")`. It may be negative.
- `currency` must be a string of exactly three upper-case ASCII letters (`"USD"`): otherwise `ValueError("Bad currency")`.
- Read them as `money.cents` and `money.currency`.
- A `Money` is **immutable**: assigning to any attribute (including `cents`) raises `AttributeError`.

**Equality and hashing.** Equal when cents and currency are equal. The same objects must work as set members and dictionary keys. Comparing with something that is not a `Money` (`money == 1050`) is simply `False`, not an error.

**Arithmetic** (every result is a new `Money`)

- `a + b` and `a - b` need the same currency: otherwise `ValueError("Currency mismatch")`.
- `a * n` and `n * a` for an `int` `n`.
- `-a`.
- `<`, `<=`, `>`, `>=` between two `Money` of the same currency (otherwise the same `ValueError`), so `sorted(...)` works.
- `Money.zero(currency)` is a class method returning `Money(0, currency)`, so `sum(list_of_money, Money.zero("USD"))` works.

**Splitting.** `money.allocate(parts)` returns a list of `parts` `Money` that add up to **exactly** the original: every part gets `abs(cents) // parts` cents (with the original's sign) and the leftover cents are handed out **one each to the first parts**. So `Money(100, "USD").allocate(3)` is `[34, 33, 33]` cents, and `Money(-100, "USD").allocate(3)` is `[-34, -33, -33]`. `parts` below 1 raises `ValueError("Parts must be at least 1")`.

**Printing.** `str(Money(1050, "USD"))` is `"USD 10.50"` and `str(Money(-5, "EUR"))` is `"EUR -0.05"`. `repr` is `"Money(1050, 'USD')"`.

**Example**

```
price = Money(1999, "USD")
price * 3                   # Money(5997, 'USD')
Money(100, "USD").allocate(3)   # [Money(34, 'USD'), Money(33, 'USD'), Money(33, 'USD')]
```''',
    starter=r'''class Money:
    def __init__(self, cents, currency):
        """Validate both and keep them; a Money never changes afterwards."""
        ...

    @classmethod
    def zero(cls, currency):
        ...

    @property
    def cents(self):
        ...

    @property
    def currency(self):
        ...

    def allocate(self, parts):
        """Split into `parts` amounts that add up exactly; leftover cents go one each to the first parts."""
        ...

    # also: __eq__, __hash__, __add__, __sub__, __mul__, __rmul__, __neg__,
    # __lt__, __le__, __gt__, __ge__, __str__, __repr__ and immutability''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
usd = Money(1050, "USD")
assert (usd.cents, usd.currency) == (1050, "USD")
assert usd == Money(1050, "USD")
assert usd != Money(1050, "EUR")
assert usd != Money(1051, "USD")
assert (usd == 1050, usd == "USD 10.50", usd == None) == (False, False, False)
assert hash(usd) == hash(Money(1050, "USD"))
assert len({Money(5, "USD"), Money(5, "USD"), Money(5, "EUR")}) == 2
assert {Money(5, "USD"): "five"}[Money(5, "USD")] == "five"
assert Money(100, "USD") + Money(250, "USD") == Money(350, "USD")
assert Money(100, "USD") - Money(250, "USD") == Money(-150, "USD")
assert Money(125, "USD") * 3 == Money(375, "USD")
assert 3 * Money(125, "USD") == Money(375, "USD")
assert -Money(5, "USD") == Money(-5, "USD")
assert error_of(lambda: Money(1, "USD") + Money(1, "EUR")) == "ValueError: Currency mismatch"
assert error_of(lambda: Money(1, "USD") - Money(1, "EUR")) == "ValueError: Currency mismatch"
assert error_of(lambda: Money(1, "USD") < Money(1, "EUR")) == "ValueError: Currency mismatch"
assert (Money(1, "USD") < Money(2, "USD"), Money(2, "USD") <= Money(2, "USD"), Money(3, "USD") > Money(2, "USD"), Money(1, "USD") >= Money(2, "USD")) == (True, True, True, False)
assert sorted([Money(30, "USD"), Money(-5, "USD"), Money(10, "USD")]) == [Money(-5, "USD"), Money(10, "USD"), Money(30, "USD")]
assert sum([Money(1, "USD"), Money(2, "USD"), Money(3, "USD")], Money.zero("USD")) == Money(6, "USD")
assert Money.zero("EUR") == Money(0, "EUR")
def blocked(action, *args):
    try:
        action(*args)
    except AttributeError:
        return True
    return False
assert blocked(setattr, usd, "cents", 5)
assert blocked(setattr, usd, "_cents", 5)
assert blocked(setattr, usd, "extra", 5)
assert blocked(delattr, usd, "cents")
assert usd.cents == 1050
assert error_of(Money, 1.5, "USD") == "ValueError: Cents must be a whole number"
assert error_of(Money, True, "USD") == "ValueError: Cents must be a whole number"
assert error_of(Money, 5, "usd") == "ValueError: Bad currency"
assert error_of(Money, 5, "US") == "ValueError: Bad currency"
assert error_of(Money, 5, 5) == "ValueError: Bad currency"
assert Money(100, "USD").allocate(3) == [Money(34, "USD"), Money(33, "USD"), Money(33, "USD")]
assert Money(100, "USD").allocate(1) == [Money(100, "USD")]
assert [m.cents for m in Money(5, "USD").allocate(10)] == [1, 1, 1, 1, 1, 0, 0, 0, 0, 0]
assert Money(-100, "USD").allocate(3) == [Money(-34, "USD"), Money(-33, "USD"), Money(-33, "USD")]
assert sum(Money(1001, "EUR").allocate(7), Money.zero("EUR")) == Money(1001, "EUR")
assert error_of(Money(5, "USD").allocate, 0) == "ValueError: Parts must be at least 1"
assert str(Money(1050, "USD")) == "USD 10.50"
assert str(Money(-5, "EUR")) == "EUR -0.05"
assert str(Money(0, "USD")) == "USD 0.00"
assert repr(Money(1050, "USD")) == "Money(1050, 'USD')"''',
    solution=r'''class Money:
    __slots__ = ("_cents", "_currency")

    def __init__(self, cents, currency):
        if not isinstance(cents, int) or isinstance(cents, bool):
            raise ValueError("Cents must be a whole number")
        if not (isinstance(currency, str) and len(currency) == 3 and currency.isascii() and currency.isalpha() and currency.isupper()):
            raise ValueError("Bad currency")
        object.__setattr__(self, "_cents", cents)
        object.__setattr__(self, "_currency", currency)

    @classmethod
    def zero(cls, currency):
        return cls(0, currency)

    @property
    def cents(self):
        return self._cents

    @property
    def currency(self):
        return self._currency

    def __setattr__(self, name, value):
        raise AttributeError("Money is immutable")

    def __delattr__(self, name):
        raise AttributeError("Money is immutable")

    def __eq__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return (self._cents, self._currency) == (other._cents, other._currency)

    def __hash__(self):
        return hash((self._cents, self._currency))

    def _check(self, other):
        if self._currency != other._currency:
            raise ValueError("Currency mismatch")

    def __add__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        self._check(other)
        return Money(self._cents + other._cents, self._currency)

    def __sub__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        self._check(other)
        return Money(self._cents - other._cents, self._currency)

    def __mul__(self, n):
        if not isinstance(n, int) or isinstance(n, bool):
            return NotImplemented
        return Money(self._cents * n, self._currency)

    __rmul__ = __mul__

    def __neg__(self):
        return Money(-self._cents, self._currency)

    def __lt__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        self._check(other)
        return self._cents < other._cents

    def __le__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        self._check(other)
        return self._cents <= other._cents

    def __gt__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        self._check(other)
        return self._cents > other._cents

    def __ge__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        self._check(other)
        return self._cents >= other._cents

    def allocate(self, parts):
        if parts < 1:
            raise ValueError("Parts must be at least 1")
        sign = -1 if self._cents < 0 else 1
        base, extra = divmod(abs(self._cents), parts)
        return [Money(sign * (base + (1 if i < extra else 0)), self._currency) for i in range(parts)]

    def __str__(self):
        sign = "-" if self._cents < 0 else ""
        whole, fraction = divmod(abs(self._cents), 100)
        return f"{self._currency} {sign}{whole}.{fraction:02d}"

    def __repr__(self):
        return f"Money({self._cents}, {self._currency!r})"''',
    hints=[
        r'''A value object is defined by its contents, not its identity. Store the two fields, make them read-only, and write `__eq__` and `__hash__` **together**: if two objects are equal their hashes must be equal, or sets and dictionaries break.''',
        r'''Keep money as integer cents so `0.1 + 0.2` can never happen. For `+`, `-` and ordering, check the currency first and raise `ValueError("Currency mismatch")`; return `NotImplemented` (not an error) when the other side is not a `Money`, so Python can try the other operand.''',
        r'''To split fairly, divide `abs(cents)` with `divmod(cents, parts)`: every part gets the quotient, and the first `remainder` parts get one more cent. Put the sign back at the end so negative amounts also add up exactly.''',
    ],
    explanation=r'''**The idea.** A **value object** is a small immutable object whose identity *is* its contents: `Money(100, "USD")` is the same thing as another `Money(100, "USD")`. Dates, points, colours and versions are value objects too. Making them immutable removes a whole class of bugs: nothing can change the price you stored in a dictionary.

```mermaid
classDiagram
    class Money {
        +cents int
        +currency str
        +allocate() list
        +zero()$ Money
    }
    Money ..> Money : + - * -x return new
```

**The three-way rule.** If you define `__eq__` you must define `__hash__` consistently; Python sets `__hash__` to `None` when you only write `__eq__`, so the object silently stops being usable as a dictionary key. Equal objects must hash equal: here both use `(cents, currency)`.

**Return `NotImplemented`, do not raise.** For `Money(1) + 5`, returning `NotImplemented` lets Python try `int.__radd__` and then raise a clean `TypeError`. Raising from inside `__add__` would stop that handshake. Raise a real error only for a case that is wrong *between two Money*: a currency mismatch.

**Why cents.** Floating-point amounts cannot represent most decimals exactly. Money is the textbook case for integers.

**The allocation puzzle.** Splitting `1.00` three ways cannot give three equal amounts; one cent has to go somewhere. Handing the leftover cents to the first parts guarantees `sum(parts) == original`, the invariant that matters: money is never created or lost. This is Fowler's *Money* pattern.

**Complexity.** All operations are O(1) except `allocate`, which is O(parts).

**Going further.** Real systems also carry a rounding mode and sometimes a currency's number of decimal places (JPY has none). Where would that information live?''',
),

P(
    slug='lld-version-number', title='Comparable Version Numbers', topic='lld-oop-warmups', difficulty='intermediate',
    module='lld/03-generics-exceptions-and-value-objects/README.md',
    description='Build a Version value object that sorts numerically, treats 1.0 and 1.0.0 as equal and bumps without mutating.',
    statement=r'''Write a class `Version` for dotted version numbers such as `"1.10.2"`.

**Creating one:** `Version(text)`. The text must be one or more non-negative whole numbers separated by single dots (`"2"`, `"1.10"`, `"1.2.3.4"`); anything else (`""`, `"1..2"`, `"a.b"`, `"1.-2"`, `" 1.2"`) raises `ValueError("Bad version")`.

**Rules**

- Versions are compared **number by number**, not as text: `"1.10"` is greater than `"1.9"`.
- A missing part counts as `0`, so `Version("1.0") == Version("1.0.0")`, and equal versions have **equal hashes**.
- `==`, `!=`, `<`, `<=`, `>`, `>=` and `hash` work, so `sorted(...)`, `max(...)` and sets work. Comparing with something that is not a `Version` is `False` for `==` (and `TypeError` for `<` is fine).
- `str(version)` gives back the text it was created from, unchanged (`"1.0"` stays `"1.0"`).
- `bump(part)` returns a **new** `Version` and never changes the original. `part` is `"major"`, `"minor"` or `"patch"` (anything else raises `ValueError("Bad part")`). Missing parts count as 0. Bumping resets the parts after it:
  - `"1.2.3"` bump `"major"` gives `"2.0.0"`, bump `"minor"` gives `"1.3.0"`, bump `"patch"` gives `"1.2.4"`;
  - `"1"` bump `"minor"` gives `"1.1.0"`.

**Example**

```
sorted(Version(v) for v in ["1.9", "1.10", "1.2.1", "1.2", "2"])
# 1.2, 1.2.1, 1.9, 1.10, 2
Version("1.0") == Version("1.0.0")    # True
```''',
    starter=r'''class Version:
    def __init__(self, text):
        """Parse the text, or raise ValueError("Bad version")."""
        ...

    def bump(self, part):
        """A new Version with `part` ("major", "minor" or "patch") increased and the later parts reset."""
        ...

    # also: __eq__, __hash__, __lt__, __le__, __gt__, __ge__, __str__''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def v(text):
    return Version(text)
assert str(v("1.10.2")) == "1.10.2"
assert str(v("1.0")) == "1.0"
assert v("1.10") > v("1.9")
assert v("1.9") < v("1.10")
assert v("2") > v("1.99.99")
assert v("1.0") == v("1.0.0")
assert v("1.0.0.0") == v("1")
assert v("1.0.1") > v("1")
assert v("1.2") < v("1.2.1")
assert v("1.2") != v("1.3")
assert (v("1.2") <= v("1.2.0"), v("1.2") >= v("1.2.0"), v("1.2") <= v("1.3"), v("1.4") >= v("1.3")) == (True, True, True, True)
assert hash(v("1.0")) == hash(v("1.0.0"))
assert len({v("1.0"), v("1.0.0"), v("1.0.0.0"), v("1.1")}) == 2
assert [str(x) for x in sorted(v(t) for t in ["1.9", "1.10", "1.2.1", "1.2", "2"])] == ["1.2", "1.2.1", "1.9", "1.10", "2"]
assert str(max(v("0.9"), v("0.10"), v("0.8"))) == "0.10"
assert (v("1") == "1", v("1") == 1) == (False, False)
for bad in ["", "1..2", "a.b", "1.-2", " 1.2", "1.2 ", "1.", ".1", "1.2.x", "1,2"]:
    assert error_of(Version, bad) == "ValueError: Bad version"
assert str(v("1.2.3").bump("major")) == "2.0.0"
assert str(v("1.2.3").bump("minor")) == "1.3.0"
assert str(v("1.2.3").bump("patch")) == "1.2.4"
assert str(v("1").bump("minor")) == "1.1.0"
assert str(v("1.2").bump("patch")) == "1.2.1"
assert str(v("9.9.9").bump("major")) == "10.0.0"
original = v("1.2.3")
original.bump("patch")
assert str(original) == "1.2.3"
assert error_of(original.bump, "build") == "ValueError: Bad part"
assert v("1.5").bump("minor") == v("1.6.0")''',
    solution=r'''import re


class Version:
    def __init__(self, text):
        if not isinstance(text, str) or not re.fullmatch(r"[0-9]+(\.[0-9]+)*", text):
            raise ValueError("Bad version")
        self._text = text
        self._parts = tuple(int(piece) for piece in text.split("."))
        trimmed = list(self._parts)
        while trimmed and trimmed[-1] == 0:
            trimmed.pop()
        self._key = tuple(trimmed)

    def __str__(self):
        return self._text

    def __repr__(self):
        return f"Version({self._text!r})"

    def __eq__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self._key == other._key

    def __hash__(self):
        return hash(self._key)

    def __lt__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self._key < other._key

    def __le__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self._key <= other._key

    def __gt__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self._key > other._key

    def __ge__(self, other):
        if not isinstance(other, Version):
            return NotImplemented
        return self._key >= other._key

    def bump(self, part):
        if part not in ("major", "minor", "patch"):
            raise ValueError("Bad part")
        major, minor, patch = (list(self._parts) + [0, 0, 0])[:3]
        if part == "major":
            return Version(f"{major + 1}.0.0")
        if part == "minor":
            return Version(f"{major}.{minor + 1}.0")
        return Version(f"{major}.{minor}.{patch + 1}")''',
    hints=[
        r'''Split the text on dots and turn each piece into an `int`. Validate with one regular expression (`[0-9]+(\.[0-9]+)*`, matched against the **whole** text) instead of checking character by character.''',
        r'''To make `1.0 == 1.0.0` and still order everything correctly, compare a **normalised** tuple: the parts with trailing zeros removed. Python already compares tuples element by element, and a shorter prefix sorts first. Hash that same tuple so equal versions hash equal.''',
        r'''`bump` builds a new `Version` from the first three parts (padded with zeros); it never touches `self`. Reset everything after the bumped part.''',
    ],
    explanation=r'''**The idea.** This is the same value-object discipline as `Money`, with a more interesting **equality**: `1.0` and `1.0.0` are the same version. The trick is to compare a *canonical form*, here the integer parts with trailing zeros stripped, and to use that one form for `==`, ordering and `hash`. When all three read the same field, they cannot disagree.

**Why not compare strings?** `"1.10" < "1.9"` is `True` as text (the character `1` comes before `9`). Version numbers are lists of numbers that happen to be written with dots, so parse them once, in the constructor.

**Tuples do the work.** Python compares tuples lexicographically, and a tuple that is a prefix of another is smaller. After stripping trailing zeros, `(1,)` vs `(1, 0, 1)` orders as `1 < 1.0.1`, which is right, with no special cases.

**Immutability, again.** `bump` returns a new object. Code that held the old `Version` (a lock file, a cache key) keeps seeing the old value. If `bump` mutated in place it would be a bug that only appears under load.

**Mistakes the tests catch:** string comparison; `__eq__` without a matching `__hash__` (a set then keeps both `1.0` and `1.0.0`); a regular expression that matches *part* of the text (`" 1.2"`, `"1."`); `bump("minor")` that forgets to reset the patch.

**Going further.** Real versions have pre-release tags (`1.0.0-rc.1` sorts before `1.0.0`) and build metadata. Where would you add the tag to the canonical key?''',
),

P(
    slug='lld-employee-payroll', title='Payroll with Employee Types', topic='lld-oop-warmups', difficulty='intermediate',
    module='lld/01-classes-objects-and-oop-building-blocks/README.md',
    description='Model employee types behind one abstract base so Payroll works with types it has never heard of (polymorphism).',
    statement=r'''Write an abstract base class `Employee`, three concrete types, and a `Payroll` that totals them. Money is whole **cents**.

**`Employee(name)`** is abstract: creating an `Employee` directly raises `TypeError`. It has

- `name`,
- an abstract method `monthly_pay()` that every type must supply,
- `describe()`, already written in the base class: it returns `"<name>: <monthly_pay>"`, for example `"Asha: 500000"`.

**The three types**

| Class | Created with | `monthly_pay()` |
|---|---|---|
| `Salaried` | `Salaried(name, annual_cents)` | `annual_cents // 12` |
| `Hourly` | `Hourly(name, rate_cents, hours)` | `rate_cents * hours` for the first 160 hours; each hour **above 160** is paid at one and a half times the rate: the overtime pay is `overtime_hours * rate_cents * 3 // 2` (one whole-number calculation) |
| `Commissioned` | `Commissioned(name, base_cents, sales_cents, percent)` | `base_cents + sales_cents * percent // 100` |

**`Payroll(employees=())`**

- `add(employee)` adds one. Anything that is not an `Employee` raises `TypeError("Not an employee")`.
- `total()` is the sum of every `monthly_pay()`.
- `report()` is a list of `(name, pay)` tuples, **highest pay first**, ties broken by name (A to Z).
- `highest()` returns the employee object with the highest pay (ties: the name that comes first); `None` for an empty payroll.
- Two payrolls never share their employees.

**Your `Payroll` is tested with employee types you have never seen.** The tests subclass `Employee` with their own `monthly_pay()` and add them. `Payroll` must work with any `Employee`, not just your three.

**Example**

```
payroll = Payroll([Salaried("Asha", 6000000), Hourly("Ben", 2000, 170)])
payroll.total()        # 500000 + (2000*160 + 10*2000*3//2) = 500000 + 350000
```''',
    starter=r'''from abc import ABC, abstractmethod


class Employee(ABC):
    def __init__(self, name):
        ...

    @abstractmethod
    def monthly_pay(self):
        """What this employee is paid for one month, in cents."""

    def describe(self):
        """"<name>: <monthly_pay>"."""
        ...


class Salaried(Employee):
    def __init__(self, name, annual_cents):
        ...

    def monthly_pay(self):
        ...


class Hourly(Employee):
    def __init__(self, name, rate_cents, hours):
        ...

    def monthly_pay(self):
        ...


class Commissioned(Employee):
    def __init__(self, name, base_cents, sales_cents, percent):
        ...

    def monthly_pay(self):
        ...


class Payroll:
    def __init__(self, employees=()):
        ...

    def add(self, employee):
        ...

    def total(self):
        ...

    def report(self):
        ...

    def highest(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
assert (error_of(Employee, "x") or "").startswith("TypeError")
asha = Salaried("Asha", 6000000)
assert asha.monthly_pay() == 500000
assert asha.describe() == "Asha: 500000"
assert asha.name == "Asha"
assert Salaried("Odd", 1000001).monthly_pay() == 83333
assert Hourly("Ben", 2000, 100).monthly_pay() == 200000
assert Hourly("Ben", 2000, 160).monthly_pay() == 320000
assert Hourly("Ben", 2000, 170).monthly_pay() == 350000
assert Hourly("Odd", 1001, 161).monthly_pay() == 160160 + 1501
assert Hourly("Odd2", 1001, 162).monthly_pay() == 160160 + 3003
assert Hourly("Zero", 2000, 0).monthly_pay() == 0
assert Commissioned("Cy", 300000, 1000000, 5).monthly_pay() == 350000
assert Commissioned("Cy", 300000, 999, 5).monthly_pay() == 300049
payroll = Payroll([asha, Hourly("Ben", 2000, 170)])
payroll.add(Commissioned("Cy", 300000, 1000000, 5))
assert payroll.total() == 500000 + 350000 + 350000
assert payroll.report() == [("Asha", 500000), ("Ben", 350000), ("Cy", 350000)]
assert payroll.highest() is asha
assert error_of(payroll.add, "Dana") == "TypeError: Not an employee"
assert error_of(payroll.add, None) == "TypeError: Not an employee"
assert len(payroll.report()) == 3
empty = Payroll()
assert (empty.total(), empty.report(), empty.highest()) == (0, [], None)
other = Payroll()
other.add(Salaried("Eve", 1200))
assert Payroll().total() == 0
assert len(payroll.report()) == 3
class Intern(Employee):
    def monthly_pay(self):
        return 100000
ivy = Intern("Ivy")
assert ivy.describe() == "Ivy: 100000"
mixed = Payroll([asha, ivy])
assert mixed.total() == 600000
assert mixed.report() == [("Asha", 500000), ("Ivy", 100000)]
class Contractor(Employee):
    def __init__(self, name, days):
        super().__init__(name)
        self.days = days
    def monthly_pay(self):
        return self.days * 50000
bob = Contractor("Bob", 12)
mixed.add(bob)
assert mixed.highest() is bob
assert mixed.total() == 500000 + 100000 + 600000
tie = Payroll([Intern("Zed"), Intern("Abe")])
assert tie.report() == [("Abe", 100000), ("Zed", 100000)]
assert tie.highest().name == "Abe"''',
    solution=r'''from abc import ABC, abstractmethod


class Employee(ABC):
    def __init__(self, name):
        self.name = name

    @abstractmethod
    def monthly_pay(self):
        """What this employee is paid for one month, in cents."""

    def describe(self):
        return f"{self.name}: {self.monthly_pay()}"


class Salaried(Employee):
    def __init__(self, name, annual_cents):
        super().__init__(name)
        self.annual_cents = annual_cents

    def monthly_pay(self):
        return self.annual_cents // 12


class Hourly(Employee):
    REGULAR_HOURS = 160

    def __init__(self, name, rate_cents, hours):
        super().__init__(name)
        self.rate_cents = rate_cents
        self.hours = hours

    def monthly_pay(self):
        regular = min(self.hours, self.REGULAR_HOURS)
        overtime = max(0, self.hours - self.REGULAR_HOURS)
        return regular * self.rate_cents + overtime * self.rate_cents * 3 // 2


class Commissioned(Employee):
    def __init__(self, name, base_cents, sales_cents, percent):
        super().__init__(name)
        self.base_cents = base_cents
        self.sales_cents = sales_cents
        self.percent = percent

    def monthly_pay(self):
        return self.base_cents + self.sales_cents * self.percent // 100


class Payroll:
    def __init__(self, employees=()):
        self._employees = []
        for employee in employees:
            self.add(employee)

    def add(self, employee):
        if not isinstance(employee, Employee):
            raise TypeError("Not an employee")
        self._employees.append(employee)

    def total(self):
        return sum(employee.monthly_pay() for employee in self._employees)

    def report(self):
        rows = [(employee.name, employee.monthly_pay()) for employee in self._employees]
        return sorted(rows, key=lambda row: (-row[1], row[0]))

    def highest(self):
        if not self._employees:
            return None
        return min(self._employees, key=lambda employee: (-employee.monthly_pay(), employee.name))''',
    hints=[
        r'''Make `Employee` an abstract base class (`ABC`) with `monthly_pay` marked `@abstractmethod`. Python then refuses to create an `Employee` directly, and refuses a subclass that forgot to implement it.''',
        r'''`describe()` lives in the base class and calls `self.monthly_pay()`: each subclass fills in the one step that differs. A subclass you have never seen gets `describe()` for free. (That is the Template Method pattern.)''',
        r'''`Payroll` must only ever call the **interface** (`name`, `monthly_pay()`). The moment it asks `isinstance(e, Hourly)` a new employee type breaks it. Checking for the base class `Employee` when adding is fine: that *is* the interface.''',
    ],
    explanation=r'''**The idea.** This is **polymorphism**: code that works on a base type and does the right thing for every subtype. `Payroll.total()` calls `monthly_pay()` and never asks what kind of employee it has; each class knows its own rule.

```mermaid
classDiagram
    class Employee {
        <<abstract>>
        +name
        +monthly_pay()*
        +describe()
    }
    Employee <|-- Salaried
    Employee <|-- Hourly
    Employee <|-- Commissioned
    Employee <|-- YourNextType
    Payroll o-- Employee
```

**The extension test.** The tests define `Intern` and `Contractor`, types written long after `Payroll`. They pass only if `Payroll` depends on the abstraction. The wrong design has `if isinstance(e, Hourly): ... elif isinstance(e, Salaried): ...` inside `Payroll`: a new employee type then edits `Payroll`, the **Open/Closed principle** violation this exercise is built to show.

**Abstract classes make mistakes loud.** With `ABC` and `@abstractmethod`, forgetting `monthly_pay` fails when you create the object (`TypeError`), not later in the middle of a payroll run.

**Template Method for free.** `describe()` is written once in the base class around a hook (`monthly_pay`). Every subclass, including the tests' `Intern`, inherits it.

**Money detail.** Overtime is computed as a single integer expression (`overtime * rate * 3 // 2`) rather than per hour so rounding happens once; per-hour rounding would pay a different, wrong amount.

**Complexity.** `total` and `report` are O(n) and O(n log n).

**Going further.** What if the pay rules depend on the month (leap-year hours, bonus months)? The employee would need a context argument: `monthly_pay(period)`. Changing an abstract method's signature touches every subclass; that is the real cost of an interface.''',
),

P(
    slug='lld-inventory-reservations', title='Inventory with Reservations', topic='lld-oop-warmups', difficulty='intermediate',
    module='lld/11-requirements-to-class-diagrams/README.md',
    description='Model stock, holds and commits so that nothing is ever oversold and a failed multi-item reservation changes nothing.',
    statement=r'''Write a class `Inventory` that tracks stock and lets orders **hold** items before they are shipped.

**Creating one:** `Inventory(stock)` where `stock` maps an item name to how many are on the shelf, e.g. `{"pen": 10, "ink": 3}`. Keep your own copy.

**Terms.** *Stock* is what is physically on the shelf. A *reservation* holds some of it for an order. *Available* is stock minus everything reserved.

**Methods**

- `stock(item)` and `available(item)` return those numbers. An unknown item raises `ValueError("Unknown item")`.
- `reserve(order_id, items)` holds `items` (a dict of item name to quantity) for the order, **all or nothing**. Checks, in this order, each raising `ValueError` with exactly this message and changing **nothing**:
  1. `"Already reserved"`: the order already has an active reservation;
  2. `"Order already committed"`: the order was committed before;
  3. `"Nothing to reserve"`: `items` is empty;
  4. `"Bad quantity"`: any quantity is not a whole number of 1 or more;
  5. `"Unknown item"`: any item is not in the stock;
  6. `"Insufficient stock"`: for any item the available number is less than asked.
- `release(order_id)` drops the order's reservation and returns `True`; `False` if there was none. The order may reserve again afterwards.
- `commit(order_id)` ships the order: its quantities leave the stock for good and the reservation ends. Returns `True`, or `False` if the order has no reservation. A committed order cannot reserve again.

**Example**

```
inv = Inventory({"pen": 10, "ink": 3})
inv.reserve("o1", {"pen": 4, "ink": 1})
inv.available("pen")        # 6      stock("pen") is still 10
inv.commit("o1")            # True
inv.stock("pen")            # 6      available("pen") is 6
```''',
    starter=r'''class Inventory:
    def __init__(self, stock):
        """Keep your own copy of `stock`."""
        ...

    def stock(self, item):
        ...

    def available(self, item):
        ...

    def reserve(self, order_id, items):
        """Hold the items for the order, all or nothing; raise ValueError (and change nothing) otherwise."""
        ...

    def release(self, order_id):
        ...

    def commit(self, order_id):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
shelf = {"pen": 10, "ink": 3, "pad": 0}
inv = Inventory(shelf)
assert (inv.stock("pen"), inv.available("pen")) == (10, 10)
assert error_of(inv.stock, "cup") == "ValueError: Unknown item"
assert error_of(inv.available, "cup") == "ValueError: Unknown item"
inv.reserve("o1", {"pen": 4, "ink": 1})
assert (inv.stock("pen"), inv.available("pen"), inv.available("ink")) == (10, 6, 2)
assert error_of(inv.reserve, "o1", {"pen": 1}) == "ValueError: Already reserved"
assert error_of(inv.reserve, "o2", {}) == "ValueError: Nothing to reserve"
assert error_of(inv.reserve, "o2", {"pen": 0}) == "ValueError: Bad quantity"
assert error_of(inv.reserve, "o2", {"pen": -1}) == "ValueError: Bad quantity"
assert error_of(inv.reserve, "o2", {"pen": 1.5}) == "ValueError: Bad quantity"
assert error_of(inv.reserve, "o2", {"pen": 1, "cup": 1}) == "ValueError: Unknown item"
assert error_of(inv.reserve, "o2", {"pen": 2, "ink": 99}) == "ValueError: Insufficient stock"
assert (inv.available("pen"), inv.available("ink")) == (6, 2)
assert error_of(inv.reserve, "o2", {"pad": 1}) == "ValueError: Insufficient stock"
inv.reserve("o2", {"pen": 6})
assert inv.available("pen") == 0
assert error_of(inv.reserve, "o3", {"pen": 1}) == "ValueError: Insufficient stock"
assert inv.release("o2") is True
assert inv.available("pen") == 6
assert inv.release("o2") is False
assert inv.release("nope") is False
inv.reserve("o2", {"pen": 1})
assert inv.available("pen") == 5
assert inv.commit("o1") is True
assert (inv.stock("pen"), inv.available("pen"), inv.stock("ink"), inv.available("ink")) == (6, 5, 2, 2)
assert inv.commit("o1") is False
assert error_of(inv.reserve, "o1", {"pen": 1}) == "ValueError: Order already committed"
assert inv.commit("ghost") is False
assert inv.release("o2") is True
assert (inv.stock("pen"), inv.available("pen")) == (6, 6)
assert shelf == {"pen": 10, "ink": 3, "pad": 0}
second = Inventory(shelf)
assert second.available("pen") == 10
second.reserve("x", {"pen": 10})
assert second.commit("x") is True
assert (second.stock("pen"), Inventory(shelf).stock("pen")) == (0, 10)
tight = Inventory({"a": 5, "b": 5})
tight.reserve("t1", {"a": 5, "b": 1})
assert error_of(tight.reserve, "t2", {"b": 4, "a": 1}) == "ValueError: Insufficient stock"
assert (tight.available("a"), tight.available("b")) == (0, 4)
tight.reserve("t2", {"b": 4})
assert tight.available("b") == 0
tight.commit("t1")
tight.commit("t2")
assert (tight.stock("a"), tight.stock("b"), tight.available("a"), tight.available("b")) == (0, 0, 0, 0)''',
    solution=r'''class Inventory:
    def __init__(self, stock):
        self._stock = dict(stock)
        self._held = {}
        self._done = set()

    def _known(self, item):
        if item not in self._stock:
            raise ValueError("Unknown item")

    def stock(self, item):
        self._known(item)
        return self._stock[item]

    def available(self, item):
        self._known(item)
        reserved = sum(items.get(item, 0) for items in self._held.values())
        return self._stock[item] - reserved

    def reserve(self, order_id, items):
        if order_id in self._held:
            raise ValueError("Already reserved")
        if order_id in self._done:
            raise ValueError("Order already committed")
        if not items:
            raise ValueError("Nothing to reserve")
        for quantity in items.values():
            if not isinstance(quantity, int) or isinstance(quantity, bool) or quantity < 1:
                raise ValueError("Bad quantity")
        for item in items:
            self._known(item)
        for item, quantity in items.items():
            if self.available(item) < quantity:
                raise ValueError("Insufficient stock")
        self._held[order_id] = dict(items)

    def release(self, order_id):
        return self._held.pop(order_id, None) is not None

    def commit(self, order_id):
        items = self._held.pop(order_id, None)
        if items is None:
            return False
        for item, quantity in items.items():
            self._stock[item] -= quantity
        self._done.add(order_id)
        return True''',
    hints=[
        r'''Store only two things: the physical stock, and the reservations (order id to items). **Available** is never stored: work it out as stock minus the sum of what the reservations hold, so it can never disagree with them.''',
        r'''All-or-nothing means: run every check first, in the order the statement gives, and only then write the reservation. If you loop over the items and hold them one at a time you will leave half an order held when the third item fails.''',
        r'''`commit` moves the quantities out of the stock and removes the reservation in one step; remember that the order id is then finished for good (keep a set of committed ids).''',
    ],
    explanation=r'''**The idea.** The interesting rule in inventory code is an *invariant*: **available = stock − reserved, and it is never negative.** The safest way to keep an invariant is not to store the derived number at all. `available` is computed on demand from the two facts you do store, so no code path can forget to update it.

```mermaid
stateDiagram-v2
    [*] --> Free
    Free --> Held: reserve (all or nothing)
    Held --> Free: release
    Held --> Shipped: commit (stock goes down)
    Shipped --> [*]
```

**All or nothing.** A multi-item reservation is a tiny *transaction*. The clean way to get atomicity without a database is to **validate everything first and change state last**: every check runs before the first write, so a failure at the last item leaves the first items untouched. The test with `{"pen": 2, "ink": 99}` checks exactly that.

**Copy what you are given.** The constructor copies `stock`; otherwise committing an order would edit the caller's dictionary and a second `Inventory` built from it would start short.

**Order of checks is part of the contract.** "Already reserved" before "Order already committed" before the item checks: callers can rely on which error they get when several apply.

**Concurrency, honestly.** Two threads reserving the last pen would both pass `available >= quantity`. This version is correct for one thread; a real one needs a lock around check-and-write (or a database constraint). The check-then-act race is the classic bug, and a good thing to say out loud.

**Complexity.** `available` is O(reservations); with a per-item running total it would be O(1) at the cost of keeping that total consistent.

**Going further.** Reservations that expire after ten minutes are what real shops use. What would you have to add, and which existing method becomes responsible for noticing an expired hold?''',
),
]
