OUT = r'''import io
import contextlib
def out(action, *args):
    """The lines a call prints."""
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        action(*args)
    return buffer.getvalue().splitlines()
def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
'''
MODULE = 'lld/01-classes-objects-and-oop-building-blocks/README.md'

PROBLEMS = [
P(
    slug='oop-discount-polymorphism', title='Discounts and Polymorphism', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='A shop applies a list of different discounts to a price; one function works for every kind, even new ones.',
    statement=r'''Create a class `Discount` whose `apply(price)` returns the price **unchanged**. Prices are whole numbers (rupees).

Create two subclasses that **override** `apply`:

- `PercentDiscount(percent)` takes `percent` off: `price - price * percent // 100`. A percent outside 0 to 100 is `ValueError("Percent must be between 0 and 100")`.
- `FlatDiscount(amount)` takes a fixed `amount` off but never goes below 0: `max(0, price - amount)`. A negative amount is `ValueError("Amount cannot be negative")`.

Write `final_price(price, discounts)` that applies the discounts **in the order given** (each one to the result of the previous) and returns the final price. It must not check what kind of discount each one is.

**Example:** `final_price(1000, [PercentDiscount(10), FlatDiscount(50)])` is `850`.''',
    starter=r'''class Discount:
    def apply(self, price):
        ...


class PercentDiscount(Discount):
    ...


def final_price(price, discounts):
    ...''',
    tests=OUT + r'''assert Discount().apply(500) == 500
p = PercentDiscount(10)
f = FlatDiscount(50)
assert isinstance(p, Discount) and isinstance(f, Discount)
assert p.apply(1000) == 900 and p.apply(99) == 90 and PercentDiscount(0).apply(80) == 80 and PercentDiscount(100).apply(80) == 0
assert f.apply(1000) == 950 and f.apply(30) == 0 and FlatDiscount(0).apply(30) == 30
assert error_of(PercentDiscount, -1) == "ValueError: Percent must be between 0 and 100" and error_of(PercentDiscount, 101) == "ValueError: Percent must be between 0 and 100"
assert error_of(FlatDiscount, -5) == "ValueError: Amount cannot be negative"
assert final_price(1000, [p, f]) == 850 and final_price(1000, [f, p]) == 855
assert final_price(1000, []) == 1000 and final_price(200, [FlatDiscount(500), PercentDiscount(50)]) == 0
class Festival(Discount):
    def apply(self, price):
        return price - 7
assert final_price(100, [Festival(), PercentDiscount(50)]) == 47 and final_price(100, [Discount(), Festival()]) == 93
assert final_price(1000, [PercentDiscount(10), PercentDiscount(10)]) == 810''',
    solution=r'''class Discount:
    def apply(self, price):
        return price


class PercentDiscount(Discount):
    def __init__(self, percent):
        if not 0 <= percent <= 100:
            raise ValueError("Percent must be between 0 and 100")
        self.percent = percent

    def apply(self, price):
        return price - price * self.percent // 100


class FlatDiscount(Discount):
    def __init__(self, amount):
        if amount < 0:
            raise ValueError("Amount cannot be negative")
        self.amount = amount

    def apply(self, price):
        return max(0, price - self.amount)


def final_price(price, discounts):
    for discount in discounts:
        price = discount.apply(price)
    return price''',
    hints=[
        r'''Each subclass keeps its own setting (`percent`, `amount`) in `__init__` and overrides only `apply`.''',
        r'''`final_price` is a loop that feeds the price through every discount: `price = discount.apply(price)`.''',
        r'''The tests define a new `Festival` discount that your function has never seen. If `final_price` works for it without any change, you have used polymorphism correctly.''',
    ],
    explanation=r'''**Run-time polymorphism for beginners.** `discount.apply(price)` looks the same for every discount, but each class does its own sum. The *caller* (`final_price`) knows nothing about percentages or flat amounts.

**Open for extension.** Adding "Buy one get one free" means writing one new class. Nothing that already works is edited: no `if kind == ...` anywhere.

**Order matters.** `final_price(1000, [10%, 50 off])` is 850 but the other way round is 855, because each discount applies to the result of the previous one. Say that out loud in a real shop.''',
),
P(
    slug='oop-money-operators', title='Money With Operators', topic='oop-and-classes', difficulty='intermediate', module=MODULE,
    description='Operator overloading: make + - * == < and str() work on a Money class, including sum().',
    statement=r'''Create a class `Money` that stores whole **cents**: `Money(cents)`. `cents` must be an `int` of 0 or more (not a `bool`), otherwise `ValueError("Cents must be a non-negative integer")`. The attribute is `cents`.

Make it behave like a number by writing these **special methods**:

- `Money + Money` gives a new `Money`; `sum([m1, m2, m3])` must work too (`sum` starts from the integer `0`).
- `Money - Money` gives a new `Money`; if the result would be negative raise `ValueError("Result would be negative")`.
- `Money * n` and `n * Money` with an `int` of 0 or more give a new `Money`.
- `==`, `<`, `<=`, `>`, `>=` compare the cents. Equal amounts have the same `hash`. Comparing with a plain number is not equal.
- `str(money)` is `"$<dollars>.<cents with 2 digits>"`, for example `"$12.50"` and `"$0.05"`; `repr(money)` is `Money(1250)`.

Anything unsupported (`Money + 5`, `Money * 1.5`, `Money < 5`) must raise `TypeError`: return `NotImplemented` from your method and Python does the rest.''',
    starter=r'''class Money:
    def __init__(self, cents):
        ...

    # __add__, __radd__, __sub__, __mul__, __rmul__, __eq__, __lt__, __hash__, __str__, __repr__''',
    tests=OUT + r'''def kind_of(action):
    try:
        action()
    except Exception as error:
        return type(error).__name__
    return None
a, b = Money(1250), Money(300)
assert a.cents == 1250 and str(a) == "$12.50" and str(Money(5)) == "$0.05" and str(Money(0)) == "$0.00" and str(Money(100)) == "$1.00" and repr(a) == "Money(1250)"
for bad in (-1, 1.5, True, "5", None):
    assert error_of(Money, bad) == "ValueError: Cents must be a non-negative integer"
assert (a + b).cents == 1550 and isinstance(a + b, Money) and a.cents == 1250
assert (a - b).cents == 950 and (a - a).cents == 0 and error_of(lambda: b - a) == "ValueError: Result would be negative"
assert (a * 2).cents == 2500 and (3 * b).cents == 900 and (a * 0).cents == 0
assert sum([Money(100), Money(250), Money(5)]).cents == 355 and sum([]) == 0
assert a == Money(1250) and a != b and not (a == 1250) and a != 1250
assert b < a and a > b and b <= b and a >= a and not a < b and sorted([a, b, Money(1)]) == [Money(1), b, a] and max(a, b) is a
assert hash(Money(7)) == hash(Money(7)) and len({Money(7), Money(7), Money(8)}) == 2 and {Money(5): "x"}[Money(5)] == "x"
assert kind_of(lambda: a + 5) == "TypeError" and kind_of(lambda: 5 + a) == "TypeError" and kind_of(lambda: a * 1.5) == "TypeError" and kind_of(lambda: a * -1) == "TypeError" and kind_of(lambda: a < 5) == "TypeError" and kind_of(lambda: a - 1) == "TypeError"
assert kind_of(lambda: a * True) == "TypeError"''',
    solution=r'''from functools import total_ordering


@total_ordering
class Money:
    def __init__(self, cents):
        if type(cents) is not int or cents < 0:
            raise ValueError("Cents must be a non-negative integer")
        self.cents = cents

    def __add__(self, other):
        if isinstance(other, Money):
            return Money(self.cents + other.cents)
        return NotImplemented

    def __radd__(self, other):
        if type(other) is int and other == 0:
            return self
        return NotImplemented

    def __sub__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        if other.cents > self.cents:
            raise ValueError("Result would be negative")
        return Money(self.cents - other.cents)

    def __mul__(self, times):
        if type(times) is int and times >= 0:
            return Money(self.cents * times)
        return NotImplemented

    __rmul__ = __mul__

    def __eq__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return self.cents == other.cents

    def __lt__(self, other):
        if not isinstance(other, Money):
            return NotImplemented
        return self.cents < other.cents

    def __hash__(self):
        return hash(self.cents)

    def __str__(self):
        return f"${self.cents // 100}.{self.cents % 100:02d}"

    def __repr__(self):
        return f"Money({self.cents})"''',
    hints=[
        r'''`a + b` is Python's shorthand for `a.__add__(b)`. Return a **new** `Money`; do not change either operand.''',
        r'''When the other side is not a `Money`, `return NotImplemented` (not `raise`). Python then tries the other operand and finally raises `TypeError` for you. `sum()` starts with `0 + money`, which is why `__radd__` exists.''',
        r'''`functools.total_ordering` fills in `<=`, `>` and `>=` once you write `__eq__` and `__lt__`. Objects that are equal must have equal hashes, so base `__hash__` on `cents`.''',
    ],
    explanation=r'''**Operator overloading is compile-time-style polymorphism done with special methods.** In C++ and C# it is a language feature; in Python the operators *are* method calls (`a + b` calls `a.__add__(b)`), so `Money` can define them. It is "the same operator, different behaviour per type".

**Why `NotImplemented`.** `Money + 5` should not be Money's decision to reject: returning `NotImplemented` lets Python try `int.__radd__`, and only then raise `TypeError`. That also makes `5 + money` and `sum()` work through `__radd__`.

**Money is a value object.** Whole cents in an `int`, never a float (`0.1 + 0.2` is not `0.3`), operations return *new* objects, and equal amounts compare and hash equal.''',
),
P(
    slug='oop-wallet-encapsulation', title='Encapsulated Wallet', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='Encapsulation: hide the balance behind a read-only property, validate the owner in a setter and refuse bad amounts.',
    statement=r'''Create a class `Wallet` with `Wallet(owner, balance=0)`.

- `owner` is a **property** with a setter. The owner must be a non-blank string, otherwise `ValueError("Owner required")`; it is stored stripped of surrounding spaces. The constructor uses the same rule.
- `balance` is a **read-only property**: reading works, but `wallet.balance = 5` must fail with `AttributeError`. A starting balance that is not an `int` of 0 or more (not a `bool`) is `ValueError("Balance cannot be negative")` (check the owner first).
- `deposit(amount)` adds money; `spend(amount)` takes money out. For both, `amount` must be an `int` above 0 (not a `bool`), otherwise `ValueError("Amount must be positive")`. `spend` of more than the balance is `ValueError("Insufficient balance")` and changes nothing.

The only way to change the balance from outside is `deposit` and `spend`.''',
    starter=r'''class Wallet:
    def __init__(self, owner, balance=0):
        ...''',
    tests=OUT + r'''w = Wallet(" Asha ", 100)
assert w.owner == "Asha" and w.balance == 100 and Wallet("B").balance == 0
for bad in ("", "  ", None, 5):
    assert error_of(Wallet, bad) == "ValueError: Owner required"
for bad in (-1, 1.5, True, None):
    assert error_of(Wallet, "A", bad) == "ValueError: Balance cannot be negative"
assert error_of(Wallet, "", -1) == "ValueError: Owner required"
assert error_of(setattr, w, "balance", 5) is not None and error_of(setattr, w, "balance", 5).startswith("AttributeError") and w.balance == 100
w.owner = "  Ben "
assert w.owner == "Ben" and error_of(setattr, w, "owner", " ") == "ValueError: Owner required" and w.owner == "Ben"
assert w.deposit(50) is None and w.balance == 150 and w.spend(20) is None and w.balance == 130
for bad in (0, -5, 1.5, True, "5", None):
    assert error_of(w.deposit, bad) == "ValueError: Amount must be positive" and error_of(w.spend, bad) == "ValueError: Amount must be positive"
assert error_of(w.spend, 131) == "ValueError: Insufficient balance" and w.balance == 130
w.spend(130)
assert w.balance == 0 and error_of(w.spend, 1) == "ValueError: Insufficient balance"
assert isinstance(Wallet.balance, property) and isinstance(Wallet.owner, property) and Wallet.balance.fset is None and Wallet.owner.fset is not None
other = Wallet("Z", 10)
other.deposit(5)
assert w.balance == 0 and other.balance == 15''',
    solution=r'''class Wallet:
    def __init__(self, owner, balance=0):
        self.owner = owner
        if type(balance) is not int or balance < 0:
            raise ValueError("Balance cannot be negative")
        self._balance = balance

    @property
    def owner(self):
        return self._owner

    @owner.setter
    def owner(self, value):
        if not isinstance(value, str) or not value.strip():
            raise ValueError("Owner required")
        self._owner = value.strip()

    @property
    def balance(self):
        return self._balance

    @staticmethod
    def _check(amount):
        if type(amount) is not int or amount < 1:
            raise ValueError("Amount must be positive")

    def deposit(self, amount):
        self._check(amount)
        self._balance += amount

    def spend(self, amount):
        self._check(amount)
        if amount > self._balance:
            raise ValueError("Insufficient balance")
        self._balance -= amount''',
    hints=[
        r'''Store the real value in `self._balance` (a leading underscore means "internal, please do not touch"). `@property def balance(self)` returns it and has **no** setter, so assigning to `wallet.balance` raises `AttributeError`.''',
        r'''A setter is a method decorated with `@owner.setter`. In `__init__` write `self.owner = owner` (not `self._owner = ...`) so the same validation runs when the object is created.''',
        r'''Put the amount check in one small helper and call it from both `deposit` and `spend`.''',
    ],
    explanation=r'''**Encapsulation** = keep the data private and let only the class's own methods change it, so the rules (no negative balance) cannot be bypassed. Python has no `private` keyword; the convention is a leading underscore, and **properties** give you read-only or validated access.

**Property versus plain attribute.** From outside `wallet.balance` looks like an attribute, but it is a method call, so it can be read-only. If you later need to calculate the balance from a list of transactions, callers do not change.

**Why validate in the setter.** The rule "owner must not be blank" now holds in the constructor *and* every later assignment, because both go through the same code.''',
),
P(
    slug='oop-class-vs-instance-attributes', title='Class vs Instance Attributes', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='Tell shared (class) data from per-object (instance) data: a school name for everyone, a roll number for each student.',
    statement=r'''Create a class `Student` with `Student(name)`.

- **Class attributes** (shared by all students): `school`, which starts as `"Green Valley"`, and `count`, the number of students created so far, which starts at `0`.
- **Instance attributes** (one per student): `name` and `roll_no`. The first student created gets roll number 1, the next 2, and so on; creating a student adds 1 to `count`.
- `info()` prints `<roll_no>: <name> (<school>)`.
- `rename_school(new_name)` is a **class method**: it changes `school` for the class, so every student who has not set their own school sees it.
- `total()` is a **class method** that returns `count`.

Assigning `student.school = "X"` on one student creates an instance attribute that affects **only that student**.''',
    starter=r'''class Student:
    school = "Green Valley"

    def __init__(self, name):
        ...''',
    tests=OUT + r'''assert Student.school == "Green Valley" and Student.count == 0 and Student.total() == 0
a = Student("Asha")
b = Student("Ben")
c = Student("Cy")
assert (a.roll_no, b.roll_no, c.roll_no) == (1, 2, 3) and (a.name, b.name) == ("Asha", "Ben")
assert Student.count == 3 and Student.total() == 3 and a.count == 3 and a.total() == 3
assert out(a.info) == ["1: Asha (Green Valley)"] and out(c.info) == ["3: Cy (Green Valley)"]
assert Student.rename_school("Blue Hill") is None and Student.school == "Blue Hill"
assert out(a.info) == ["1: Asha (Blue Hill)"] and out(b.info) == ["2: Ben (Blue Hill)"]
b.school = "Private Tutor"
assert out(b.info) == ["2: Ben (Private Tutor)"] and out(a.info) == ["1: Asha (Blue Hill)"] and Student.school == "Blue Hill"
Student.rename_school("Red Oak")
assert out(a.info) == ["1: Asha (Red Oak)"] and out(b.info) == ["2: Ben (Private Tutor)"]
a.count = 99
assert Student.count == 3 and Student.total() == 3 and b.count == 3
d = Student("Dee")
assert d.roll_no == 4 and Student.count == 4 and Student.total() == 4
assert "school" in Student.__dict__ and "count" in Student.__dict__ and "name" not in Student.__dict__ and "roll_no" not in Student.__dict__
assert isinstance(Student.__dict__["rename_school"], classmethod) and isinstance(Student.__dict__["total"], classmethod)
assert "name" in a.__dict__ and "roll_no" in a.__dict__ and "school" not in c.__dict__''',
    solution=r'''class Student:
    school = "Green Valley"
    count = 0

    def __init__(self, name):
        Student.count += 1
        self.name = name
        self.roll_no = Student.count

    def info(self):
        print(f"{self.roll_no}: {self.name} ({self.school})")

    @classmethod
    def rename_school(cls, new_name):
        cls.school = new_name

    @classmethod
    def total(cls):
        return cls.count''',
    hints=[
        r'''Anything written directly inside the class body (`school = ...`, `count = 0`) belongs to the **class** and is shared. Anything set on `self` in `__init__` belongs to **one object**.''',
        r'''To change the shared counter write `Student.count += 1`. Writing `self.count += 1` would create a new instance attribute and leave the class counter alone.''',
        r'''A class method receives the class (`cls`) instead of an object: `cls.school = new_name` changes the shared attribute for everybody.''',
    ],
    explanation=r'''**Two places for data.** Class attributes live on the class; instance attributes live on each object. When you read `student.school`, Python looks on the object first and then on the class. That is why one student can have a private `school` while the others follow the class.

**The classic trap.** `self.count += 1` reads the class value, adds one and stores the result *on the object*: the shared counter never moves. The test `a.count = 99` shows that setting through an instance never changes the class.

**Class method versus instance method.** An instance method works on one object (`self`). A class method works on the class (`cls`): counters, alternative constructors, settings shared by everyone.''',
),
P(
    slug='oop-static-and-class-methods', title='Static and Class Methods', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='Use @staticmethod for helpers that need no object and @classmethod for an alternative constructor that also works in subclasses.',
    statement=r'''Create a class `TemperatureConverter` with two **static methods** (they need no object and are called on the class):

- `celsius_to_fahrenheit(c)` returns `c * 9 / 5 + 32`, rounded to 2 decimals.
- `fahrenheit_to_celsius(f)` returns `(f - 32) * 5 / 9`, rounded to 2 decimals.

Create a class `Person` with `Person(name, age)` and the attributes `name` and `age`.

- A class attribute `CURRENT_YEAR = 2025`.
- `from_birth_year(name, year)` is a **class method** (an alternative constructor): it returns a new object of the class it was called on, with `age = CURRENT_YEAR - year`. A year after `CURRENT_YEAR` is `ValueError("Birth year is in the future")`.
- `is_adult(age)` is a **static method** that returns `True` when `age >= 18`.
- `describe()` prints `<name> is <age> years old`.

Because `from_birth_year` is a class method, `Employee.from_birth_year(...)` on a subclass `Employee(Person)` must return an `Employee`.''',
    starter=r'''class TemperatureConverter:
    ...


class Person:
    CURRENT_YEAR = 2025

    def __init__(self, name, age):
        ...''',
    tests=OUT + r'''assert TemperatureConverter.celsius_to_fahrenheit(100) == 212.0 and TemperatureConverter.celsius_to_fahrenheit(0) == 32.0 and TemperatureConverter.celsius_to_fahrenheit(-40) == -40.0
assert TemperatureConverter.celsius_to_fahrenheit(37) == 98.6 and TemperatureConverter.celsius_to_fahrenheit(36.6) == 97.88 and TemperatureConverter.fahrenheit_to_celsius(212) == 100.0 and TemperatureConverter.fahrenheit_to_celsius(98.6) == 37.0 and TemperatureConverter.fahrenheit_to_celsius(0) == -17.78
assert isinstance(TemperatureConverter.__dict__["celsius_to_fahrenheit"], staticmethod) and isinstance(TemperatureConverter.__dict__["fahrenheit_to_celsius"], staticmethod)
assert TemperatureConverter().celsius_to_fahrenheit(10) == 50.0
p = Person("Asha", 30)
assert (p.name, p.age, Person.CURRENT_YEAR) == ("Asha", 30, 2025) and out(p.describe) == ["Asha is 30 years old"]
q = Person.from_birth_year("Ben", 2000)
assert isinstance(q, Person) and (q.name, q.age) == ("Ben", 25) and out(q.describe) == ["Ben is 25 years old"]
assert Person.from_birth_year("Baby", 2025).age == 0 and error_of(Person.from_birth_year, "Time", 2026) == "ValueError: Birth year is in the future"
assert Person.is_adult(18) is True and Person.is_adult(17) is False and p.is_adult(40) is True
assert isinstance(Person.__dict__["from_birth_year"], classmethod) and isinstance(Person.__dict__["is_adult"], staticmethod)
class Employee(Person):
    pass
e = Employee.from_birth_year("Cy", 1990)
assert type(e) is Employee and e.age == 35
class Century(Person):
    CURRENT_YEAR = 2100
assert Century.from_birth_year("Old", 2000).age == 100 and type(Century.from_birth_year("Old", 2000)) is Century''',
    solution=r'''class TemperatureConverter:
    @staticmethod
    def celsius_to_fahrenheit(c):
        return round(c * 9 / 5 + 32, 2)

    @staticmethod
    def fahrenheit_to_celsius(f):
        return round((f - 32) * 5 / 9, 2)


class Person:
    CURRENT_YEAR = 2025

    def __init__(self, name, age):
        self.name = name
        self.age = age

    @classmethod
    def from_birth_year(cls, name, year):
        if year > cls.CURRENT_YEAR:
            raise ValueError("Birth year is in the future")
        return cls(name, cls.CURRENT_YEAR - year)

    @staticmethod
    def is_adult(age):
        return age >= 18

    def describe(self):
        print(f"{self.name} is {self.age} years old")''',
    hints=[
        r'''A static method has no `self` and no `cls`: it is a plain function that lives in the class because it belongs with it. Decorate it with `@staticmethod`.''',
        r'''A class method is decorated with `@classmethod` and receives the class as its first argument (`cls`). `return cls(name, age)` builds an object of **whatever class the method was called on**, so subclasses work without extra code.''',
        r'''Read `cls.CURRENT_YEAR` (not `Person.CURRENT_YEAR`) so a subclass that changes the year is respected.''',
    ],
    explanation=r'''**Three kinds of method.**

| Kind | First argument | Use it for |
|---|---|---|
| instance method | `self` (one object) | behaviour of one object |
| class method | `cls` (the class) | alternative constructors, class-wide settings |
| static method | nothing | a helper that needs neither (unit conversion, validation) |

**Alternative constructors.** `Person.from_birth_year` is a second way to build a `Person`. Using `cls(...)` instead of `Person(...)` means `Employee.from_birth_year(...)` returns an `Employee`: the method follows the class it was called on.

**Static is not "global".** `is_adult` could be a module-level function, but keeping it in `Person` keeps related code together and makes it discoverable.''',
),
P(
    slug='oop-library-books', title='Library Book Desk', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='A small library that lends and takes back copies and prints a clear message for every case.',
    statement=r'''Create a class `Library` with no arguments. It keeps books by title.

- `add_book(title, author, copies=1)` adds copies. A known title gets more copies (same author kept). `copies` below 1 is `ValueError("Copies must be at least 1")`.
- `checkout(title)` **prints**:
  - `We do not have <title>` for an unknown title
  - `Sorry, <title> is not available` when every copy is out
  - otherwise it lends one copy and prints `You borrowed <title>`
- `return_book(title)` **prints**:
  - `We do not have <title>` for an unknown title
  - `All copies are already here` when no copy is out (nothing changes)
  - otherwise it takes one copy back and prints `Thanks for returning <title>`
- `show_catalog()` prints one line per book, **sorted by title**: `<title> by <author>: <available>/<total> available`. An empty library prints `The library is empty`.''',
    starter=r'''class Library:
    def __init__(self):
        ...

    def add_book(self, title, author, copies=1):
        ...

    def checkout(self, title):
        ...

    def return_book(self, title):
        ...

    def show_catalog(self):
        ...''',
    tests=OUT + r'''lib = Library()
assert out(lib.show_catalog) == ["The library is empty"]
assert out(lib.checkout, "Dune") == ["We do not have Dune"] and out(lib.return_book, "Dune") == ["We do not have Dune"]
assert lib.add_book("Dune", "Herbert", 2) is None and lib.add_book("Emma", "Austen") is None
assert error_of(lib.add_book, "X", "Y", 0) == "ValueError: Copies must be at least 1" and error_of(lib.add_book, "Dune", "Z", -1) == "ValueError: Copies must be at least 1"
assert out(lib.show_catalog) == ["Dune by Herbert: 2/2 available", "Emma by Austen: 1/1 available"]
assert out(lib.checkout, "Dune") == ["You borrowed Dune"] and out(lib.checkout, "Dune") == ["You borrowed Dune"] and out(lib.checkout, "Dune") == ["Sorry, Dune is not available"]
assert out(lib.show_catalog) == ["Dune by Herbert: 0/2 available", "Emma by Austen: 1/1 available"]
assert out(lib.return_book, "Dune") == ["Thanks for returning Dune"] and out(lib.show_catalog)[0] == "Dune by Herbert: 1/2 available"
assert out(lib.return_book, "Emma") == ["All copies are already here"] and out(lib.show_catalog)[1] == "Emma by Austen: 1/1 available"
lib.add_book("Dune", "Someone Else", 1)
assert out(lib.show_catalog)[0] == "Dune by Herbert: 2/3 available"
lib.add_book("Alice", "Carroll", 1)
assert out(lib.show_catalog) == ["Alice by Carroll: 1/1 available", "Dune by Herbert: 2/3 available", "Emma by Austen: 1/1 available"]
other = Library()
assert out(other.show_catalog) == ["The library is empty"]
assert out(lib.checkout, "dune") == ["We do not have dune"]''',
    solution=r'''class Library:
    def __init__(self):
        self._books = {}

    def add_book(self, title, author, copies=1):
        if copies < 1:
            raise ValueError("Copies must be at least 1")
        if title in self._books:
            self._books[title]["total"] += copies
            self._books[title]["available"] += copies
        else:
            self._books[title] = {"author": author, "total": copies, "available": copies}

    def checkout(self, title):
        book = self._books.get(title)
        if book is None:
            print(f"We do not have {title}")
        elif book["available"] == 0:
            print(f"Sorry, {title} is not available")
        else:
            book["available"] -= 1
            print(f"You borrowed {title}")

    def return_book(self, title):
        book = self._books.get(title)
        if book is None:
            print(f"We do not have {title}")
        elif book["available"] == book["total"]:
            print("All copies are already here")
        else:
            book["available"] += 1
            print(f"Thanks for returning {title}")

    def show_catalog(self):
        if not self._books:
            print("The library is empty")
            return
        for title in sorted(self._books):
            book = self._books[title]
            print(f"{title} by {book['author']}: {book['available']}/{book['total']} available")''',
    hints=[
        r'''One dictionary from title to a small record (`author`, `total`, `available`) is enough. Create it in `__init__` so each library has its own.''',
        r'''Handle the cases in the order of the statement: unknown, none left (or none out), otherwise the normal path. Each branch prints exactly one line.''',
        r'''`sorted(self._books)` gives the titles in alphabetical order for the catalogue.''',
    ],
    explanation=r'''**The idea.** The class owns a small table and exposes a few actions. Callers never touch the numbers directly, so the rules ("never lend a copy that is not there", "never take back more than were lent") live in one place.

**Every path says something.** A good beginner class never fails silently: each of the three outcomes of `checkout` and of `return_book` has its own message, and the tests check every one.

**Why a dictionary per library.** `self._books = {}` is created in `__init__`, so two libraries never share books (the last test checks it). Writing `_books = {}` in the class body would share it.''',
),
P(
    slug='oop-student-grades', title='Student Report Card', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='A student with marks per subject, an average, a letter grade, a printed report and a function that finds the topper.',
    statement=r'''Create a class `Student` with `Student(name)`. A blank name (not a string or only spaces) is `ValueError("Name required")`. Attributes: `name` and `marks` (a dictionary from subject to mark, empty at first).

- `add_mark(subject, mark)` stores a mark (a new mark for the same subject **replaces** the old one). A mark must be a number from 0 to 100 (a `bool` is not one), otherwise `ValueError("Mark must be between 0 and 100")`.
- `average()` returns the average mark rounded to 2 decimals, or `0` when there are no marks.
- `grade()` returns `"A"` for an average of 90 or more, `"B"` for 80 or more, `"C"` for 70 or more, `"D"` for 60 or more, `"F"` below that, and `"N/A"` when there are no marks.
- `report()` prints `Report for <name>`, then one line per subject **sorted by subject**: `  <subject>: <mark>` (two spaces first), then `Average: <average> (<grade>)`.

Write a function `topper(students)` that returns the student with the highest average (the first one in the list when tied), or `None` for an empty list.''',
    starter=r'''class Student:
    def __init__(self, name):
        ...

    def add_mark(self, subject, mark):
        ...

    def average(self):
        ...

    def grade(self):
        ...

    def report(self):
        ...


def topper(students):
    ...''',
    tests=OUT + r'''for bad in ("", "  ", None, 5):
    assert error_of(Student, bad) == "ValueError: Name required"
s = Student("Asha")
assert s.name == "Asha" and s.marks == {} and s.average() == 0 and s.grade() == "N/A"
assert out(s.report) == ["Report for Asha", "Average: 0 (N/A)"]
assert s.add_mark("Maths", 90) is None and s.add_mark("English", 75) is None and s.add_mark("Art", 85.5) is None
assert s.marks == {"Maths": 90, "English": 75, "Art": 85.5} and s.average() == 83.5 and s.grade() == "B"
assert out(s.report) == ["Report for Asha", "  Art: 85.5", "  English: 75", "  Maths: 90", "Average: 83.5 (B)"]
for bad in (-1, 100.5, 101, True, "90", None):
    assert error_of(s.add_mark, "X", bad) == "ValueError: Mark must be between 0 and 100"
assert "X" not in s.marks and s.average() == 83.5
s.add_mark("English", 95)
assert s.marks["English"] == 95 and s.average() == 90.17 and s.grade() == "A"
def student(name, *marks):
    st = Student(name)
    for index, mark in enumerate(marks):
        st.add_mark("s" + str(index), mark)
    return st
assert student("a", 100, 0).average() == 50 and student("a", 100, 0).grade() == "F"
assert [student("x", m).grade() for m in (100, 90, 89.99, 80, 79, 70, 69, 60, 59, 0)] == ["A", "A", "B", "B", "C", "C", "D", "D", "F", "F"]
assert student("t", 10, 20, 30).average() == 20 and student("t", 0, 0, 1).average() == 0.33
a, b, c = student("a", 70), student("b", 90, 80), student("c", 86)
assert topper([a, b, c]) is c and topper([c, b]) is c
assert topper([student("p", 80), student("q", 80)]).name == "p" and topper([]) is None and topper([a]) is a''',
    solution=r'''class Student:
    def __init__(self, name):
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Name required")
        self.name = name
        self.marks = {}

    def add_mark(self, subject, mark):
        if type(mark) not in (int, float) or not 0 <= mark <= 100:
            raise ValueError("Mark must be between 0 and 100")
        self.marks[subject] = mark

    def average(self):
        if not self.marks:
            return 0
        return round(sum(self.marks.values()) / len(self.marks), 2)

    def grade(self):
        if not self.marks:
            return "N/A"
        average = self.average()
        for limit, letter in ((90, "A"), (80, "B"), (70, "C"), (60, "D")):
            if average >= limit:
                return letter
        return "F"

    def report(self):
        print(f"Report for {self.name}")
        for subject in sorted(self.marks):
            print(f"  {subject}: {self.marks[subject]}")
        print(f"Average: {self.average()} ({self.grade()})")


def topper(students):
    best = None
    for student in students:
        if best is None or student.average() > best.average():
            best = student
    return best''',
    hints=[
        r'''`marks` is a plain dictionary created in `__init__`; `add_mark` assigns `self.marks[subject] = mark`, which also replaces an older mark.''',
        r'''Compute the average once with `sum(...) / len(...)`, guard the empty case first, and let `grade()` and `report()` call `average()` instead of repeating the sum.''',
        r'''In `topper`, only replace the current best when a student is **strictly** higher: that keeps the first one on a tie.''',
    ],
    explanation=r'''**The idea.** The object stores *facts* (the marks) and answers *questions* (`average`, `grade`) by calculating from them. Nothing is stored twice, so a changed mark can never leave a stale average behind.

**Grading by table.** The `for limit, letter in (...)` loop replaces four `if` statements and makes the boundaries (`89.99` is a B, `90` is an A) easy to read and change.

**Edge cases first.** No marks: average `0`, grade `N/A`. Empty list: `topper` returns `None`. Interviewers watch for these.''',
),
P(
    slug='oop-parking-fee', title='Parking Ticket', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='A ticket that works out a parking fee from entry and exit hours, with a daily cap and a one-time exit.',
    statement=r'''Create a class `ParkingTicket` with `ParkingTicket(plate, entry_hour)`.

- `plate` must be a non-blank string, otherwise `ValueError("Plate required")`; `entry_hour` must be an `int` of 0 or more (not a `bool`), otherwise `ValueError("Entry hour must be 0 or more")` (plate first). Attributes: `plate`, `entry_hour`, `exited` (`False`) and `fee` (`None`).
- `exit(exit_hour)` closes the ticket and **returns the fee**. Checks in order: already exited `ValueError("Already exited")`; `exit_hour` not later than `entry_hour` `ValueError("Exit must be after entry")`.
- The fee for `hours = exit_hour - entry_hour` is **20 for the first hour plus 10 for every further hour**, but never more than **100**.
- `exit` also **prints** `Vehicle <plate> parked <hours> hour(s). Fee: <fee>`, sets `exited` to `True` and stores the `fee`.''',
    starter=r'''class ParkingTicket:
    def __init__(self, plate, entry_hour):
        ...

    def exit(self, exit_hour):
        ...''',
    tests=OUT + r'''for bad in ("", "  ", None, 5):
    assert error_of(ParkingTicket, bad, 1) == "ValueError: Plate required"
for bad in (-1, 1.5, True, None):
    assert error_of(ParkingTicket, "KA01", bad) == "ValueError: Entry hour must be 0 or more"
assert error_of(ParkingTicket, "", -1) == "ValueError: Plate required"
t = ParkingTicket("KA01", 9)
assert (t.plate, t.entry_hour, t.exited, t.fee) == ("KA01", 9, False, None)
assert error_of(t.exit, 9) == "ValueError: Exit must be after entry" and error_of(t.exit, 3) == "ValueError: Exit must be after entry" and t.exited is False
buffer = io.StringIO()
with contextlib.redirect_stdout(buffer):
    fee = t.exit(10)
assert fee == 20 and buffer.getvalue().splitlines() == ["Vehicle KA01 parked 1 hour(s). Fee: 20"] and t.exited is True and t.fee == 20
assert error_of(t.exit, 12) == "ValueError: Already exited" and t.fee == 20
assert error_of(t.exit, 3) == "ValueError: Already exited"
def fee_for(hours):
    ticket = ParkingTicket("X", 0)
    result = []
    out(lambda: result.append(ticket.exit(hours)))
    return result[0]
assert [fee_for(h) for h in (1, 2, 3, 5, 9, 10, 11, 24)] == [20, 30, 40, 60, 100, 100, 100, 100]
assert out(ParkingTicket("MH12", 8).exit, 11) == ["Vehicle MH12 parked 3 hour(s). Fee: 40"]
assert out(ParkingTicket("MH12", 0).exit, 20) == ["Vehicle MH12 parked 20 hour(s). Fee: 100"]
second = ParkingTicket("TN09", 5)
assert second.exited is False and t.exited is True''',
    solution=r'''class ParkingTicket:
    FIRST_HOUR = 20
    EXTRA_HOUR = 10
    DAILY_MAX = 100

    def __init__(self, plate, entry_hour):
        if not isinstance(plate, str) or not plate.strip():
            raise ValueError("Plate required")
        if type(entry_hour) is not int or entry_hour < 0:
            raise ValueError("Entry hour must be 0 or more")
        self.plate = plate
        self.entry_hour = entry_hour
        self.exited = False
        self.fee = None

    def exit(self, exit_hour):
        if self.exited:
            raise ValueError("Already exited")
        if exit_hour <= self.entry_hour:
            raise ValueError("Exit must be after entry")
        hours = exit_hour - self.entry_hour
        fee = min(self.DAILY_MAX, self.FIRST_HOUR + self.EXTRA_HOUR * (hours - 1))
        self.exited = True
        self.fee = fee
        print(f"Vehicle {self.plate} parked {hours} hour(s). Fee: {fee}")
        return fee''',
    hints=[
        r'''Hours parked is `exit_hour - entry_hour`. The fee is `20 + 10 * (hours - 1)`, capped with `min(100, ...)`.''',
        r'''Check "already exited" before looking at the hour, and do all the checks before you change `exited`, so a refused call changes nothing.''',
        r'''Put the three prices in class attributes (`FIRST_HOUR`, `EXTRA_HOUR`, `DAILY_MAX`) so the numbers have names and one home.''',
    ],
    explanation=r'''**The idea.** A ticket is a small state machine: *open* until `exit` is called, *closed* afterwards. The flag `exited` is what turns a second `exit` into an error instead of a second fee.

**Names for numbers.** `20`, `10` and `100` written inline are "magic numbers". As class attributes they document themselves and a price change touches one line.

**Table-test the boundaries.** The test lists hours `1, 2, 3, 5, 9, 10, 11, 24`: the interesting ones are 1 (no extra hours), 9 (exactly 100) and 10 (the cap starts to matter).''',
),
P(
    slug='oop-multiple-inheritance-mro', title='Multiple Inheritance and MRO', topic='oop-and-classes', difficulty='intermediate', module=MODULE,
    description='A class with two parents: use cooperative super() so every ability is collected once, in method resolution order.',
    statement=r'''Create a base class `Animal` with `Animal(name)`.

- `abilities()` returns a list of ability names; for a plain `Animal` it is `[]`.
- `describe()` prints `<name> can <abilities joined with ", ">`, or `<name> has no special abilities` when the list is empty.

Create three **mixin-style** subclasses of `Animal`. Each one's `abilities()` returns **its own ability first** and then whatever `super().abilities()` returns:

- `Flyer`: `"fly"`
- `Swimmer`: `"swim"`
- `Runner`: `"run"`

Create these classes with **several parents**, and write **no** `abilities` method in them (the parents are enough):

- `Duck(Flyer, Swimmer, Runner)`
- `Otter(Swimmer, Runner)`

Write `mro_names(cls)` that returns the names of the classes in `cls.__mro__` (method resolution order), including `object`.''',
    starter=r'''class Animal:
    def __init__(self, name):
        ...


class Flyer(Animal):
    ...


def mro_names(cls):
    ...''',
    tests=OUT + r'''a = Animal("Thing")
assert a.name == "Thing" and a.abilities() == [] and out(a.describe) == ["Thing has no special abilities"]
assert Flyer("Eagle").abilities() == ["fly"] and Swimmer("Fish").abilities() == ["swim"] and Runner("Dog").abilities() == ["run"]
assert out(Flyer("Eagle").describe) == ["Eagle can fly"]
duck, otter = Duck("Don"), Otter("Ollie")
assert duck.name == "Don" and duck.abilities() == ["fly", "swim", "run"] and otter.abilities() == ["swim", "run"]
assert out(duck.describe) == ["Don can fly, swim, run"] and out(otter.describe) == ["Ollie can swim, run"]
assert isinstance(duck, Flyer) and isinstance(duck, Swimmer) and isinstance(duck, Runner) and isinstance(duck, Animal) and not isinstance(otter, Flyer)
assert "abilities" not in Duck.__dict__ and "abilities" not in Otter.__dict__
assert mro_names(Duck) == ["Duck", "Flyer", "Swimmer", "Runner", "Animal", "object"] and mro_names(Otter) == ["Otter", "Swimmer", "Runner", "Animal", "object"] and mro_names(Animal) == ["Animal", "object"]
class Penguin(Swimmer, Flyer):
    pass
assert Penguin("Pip").abilities() == ["swim", "fly"] and mro_names(Penguin) == ["Penguin", "Swimmer", "Flyer", "Animal", "object"]
class Robot(Runner, Flyer, Swimmer):
    def abilities(self):
        return ["charge"] + super().abilities()
assert Robot("R2").abilities() == ["charge", "run", "fly", "swim"] and out(Robot("R2").describe) == ["R2 can charge, run, fly, swim"]
assert Duck.__bases__ == (Flyer, Swimmer, Runner) and Otter.__bases__ == (Swimmer, Runner)''',
    solution=r'''class Animal:
    def __init__(self, name):
        self.name = name

    def abilities(self):
        return []

    def describe(self):
        abilities = self.abilities()
        if abilities:
            print(f"{self.name} can {', '.join(abilities)}")
        else:
            print(f"{self.name} has no special abilities")


class Flyer(Animal):
    def abilities(self):
        return ["fly"] + super().abilities()


class Swimmer(Animal):
    def abilities(self):
        return ["swim"] + super().abilities()


class Runner(Animal):
    def abilities(self):
        return ["run"] + super().abilities()


class Duck(Flyer, Swimmer, Runner):
    pass


class Otter(Swimmer, Runner):
    pass


def mro_names(cls):
    return [c.__name__ for c in cls.__mro__]''',
    hints=[
        r'''Each mixin writes `return ["fly"] + super().abilities()`. `super()` does **not** mean "the parent": it means "the next class in the method resolution order", which for a `Duck` after `Flyer` is `Swimmer`.''',
        r'''`class Duck(Flyer, Swimmer, Runner): pass` is the whole class. Python builds the order `Duck, Flyer, Swimmer, Runner, Animal, object` (see `Duck.__mro__`) so `Animal.abilities` is reached **once**, at the end.''',
        r'''Because every class in the chain calls `super()`, adding a new ability class never needs the others to change.''',
    ],
    explanation=r'''**Multiple inheritance** means a class has more than one parent. The danger is the *diamond*: `Flyer` and `Swimmer` both inherit `Animal`, so which `Animal` code runs, and how many times?

```mermaid
classDiagram
    Animal <|-- Flyer
    Animal <|-- Swimmer
    Animal <|-- Runner
    Flyer <|-- Duck
    Swimmer <|-- Duck
    Runner <|-- Duck
```

**Python's answer is the MRO** (method resolution order, computed by the *C3 linearisation*): a single list in which every class appears once and every class comes before its parents. `super()` follows that list, so with cooperative `super()` calls each ability is added exactly once.

**Order of the parents matters.** `Penguin(Swimmer, Flyer)` gives `["swim", "fly"]`, while `Duck(Flyer, Swimmer)` gives `["fly", "swim"]`. The test shows both.

**Use with care.** Small *mixins* (one ability each) are a good use. Big trees of multiple inheritance are hard to read; prefer composition when in doubt. Java and C# avoid the problem by allowing only one parent class (plus many interfaces).''',
),
P(
    slug='oop-playlist', title='Music Playlist', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='A playlist with add, remove, play-next and a numbered listing, printing a message for each case.',
    statement=r'''Create a class `Playlist` with `Playlist(name)`. A blank name is `ValueError("Name required")`. Attribute: `name`. `len(playlist)` is the number of songs.

- `add(song)` adds the song at the end and prints `Added <song>`. A song already in the playlist is **not** added again: it prints `<song> is already in the playlist`. A blank song (not a string or only spaces) is `ValueError("Song required")`.
- `remove(song)` removes it and prints `Removed <song>`, or prints `<song> is not in the playlist`.
- `play_next()` takes the **first** song out of the playlist and prints `Now playing: <song>`; with no songs it prints `Playlist is empty`.
- `show()` prints `Playlist <name> (<n> songs)` and then each song on its own line as `<position>. <song>`, starting from 1, in order.''',
    starter=r'''class Playlist:
    def __init__(self, name):
        ...

    def add(self, song):
        ...

    def remove(self, song):
        ...

    def play_next(self):
        ...

    def show(self):
        ...

    def __len__(self):
        ...''',
    tests=OUT + r'''for bad in ("", "  ", None, 5):
    assert error_of(Playlist, bad) == "ValueError: Name required"
p = Playlist("Road trip")
assert p.name == "Road trip" and len(p) == 0 and out(p.show) == ["Playlist Road trip (0 songs)"] and out(p.play_next) == ["Playlist is empty"]
assert out(p.add, "Believer") == ["Added Believer"] and out(p.add, "Faded") == ["Added Faded"] and out(p.add, "Closer") == ["Added Closer"] and len(p) == 3
assert out(p.add, "Faded") == ["Faded is already in the playlist"] and len(p) == 3
for bad in ("", "  ", None, 7):
    assert error_of(p.add, bad) == "ValueError: Song required"
assert out(p.show) == ["Playlist Road trip (3 songs)", "1. Believer", "2. Faded", "3. Closer"]
assert out(p.remove, "Faded") == ["Removed Faded"] and out(p.remove, "Faded") == ["Faded is not in the playlist"] and len(p) == 2
assert out(p.show) == ["Playlist Road trip (2 songs)", "1. Believer", "2. Closer"]
assert out(p.play_next) == ["Now playing: Believer"] and len(p) == 1 and out(p.show) == ["Playlist Road trip (1 songs)", "1. Closer"]
assert out(p.play_next) == ["Now playing: Closer"] and out(p.play_next) == ["Playlist is empty"] and len(p) == 0
assert out(p.add, "Believer") == ["Added Believer"] and out(p.show)[-1] == "1. Believer"
q = Playlist("Other")
assert len(q) == 0 and len(p) == 1''',
    solution=r'''class Playlist:
    def __init__(self, name):
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Name required")
        self.name = name
        self._songs = []

    def __len__(self):
        return len(self._songs)

    def add(self, song):
        if not isinstance(song, str) or not song.strip():
            raise ValueError("Song required")
        if song in self._songs:
            print(f"{song} is already in the playlist")
            return
        self._songs.append(song)
        print(f"Added {song}")

    def remove(self, song):
        if song in self._songs:
            self._songs.remove(song)
            print(f"Removed {song}")
        else:
            print(f"{song} is not in the playlist")

    def play_next(self):
        if not self._songs:
            print("Playlist is empty")
            return
        print(f"Now playing: {self._songs.pop(0)}")

    def show(self):
        print(f"Playlist {self.name} ({len(self._songs)} songs)")
        for position, song in enumerate(self._songs, start=1):
            print(f"{position}. {song}")''',
    hints=[
        r'''Keep the songs in a list (`self._songs = []` in `__init__`). A queue that plays from the front is `pop(0)`.''',
        r'''`__len__` lets you write `len(playlist)`: it just returns `len(self._songs)`.''',
        r'''`enumerate(self._songs, start=1)` gives you the position and the song together for `show`.''',
    ],
    explanation=r'''**The idea.** A playlist is a list with rules around it. Wrapping the list in a class means callers can only do what the playlist allows (no duplicates, no blank names), and `len(playlist)` works because the class defines `__len__`.

**Special methods make classes feel built-in.** `len(p)` calls `p.__len__()`. The same idea powers `+` for `Money` and `==` for your own types.

**FIFO.** `pop(0)` plays the oldest song first. For a long queue a `collections.deque` and `popleft()` is faster, but a list is fine here and easier to read.''',
),
]
