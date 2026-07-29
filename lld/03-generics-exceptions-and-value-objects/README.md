# Module 03: Generics, Exceptions & Value Objects

## Why this matters

Three practical gaps stand between "I understand the four pillars" and
"I can design a real system": how do you write one reusable container
that works for any type *without* losing type safety or copy-pasting the
same class four times (generics)? How do you fail in a way that tells the
caller *what* went wrong and *what to do about it*, instead of a generic
crash (exception design)? And how do you stop passing bare numbers and
strings around for things like money, status, or coordinates — a habit
called **primitive obsession** that quietly causes bugs (a `float`
doesn't know it's supposed to be a currency amount; a plain string doesn't
stop you from passing `"pending"` where `"Pending"` was expected)? Value
objects (enums, records/dataclasses) are the fix. All three show up
constantly starting with the very next module (SOLID) and never stop.

## Concepts

### Generics: one class, many types, still type-safe

You've already *used* generics — `List<T>` and `Dictionary<TKey,
TValue>` in C# are generic. Now you write your own.

{{tabs}}
{{tab Python}}
```python
from typing import Generic, TypeVar

T = TypeVar("T")

class Stack(Generic[T]):
    def __init__(self):
        self._items: list[T] = []

    def push(self, item: T) -> None:
        self._items.append(item)

    def pop(self) -> T:
        if not self._items:
            raise IndexError("pop from empty stack")
        return self._items.pop()

    def is_empty(self) -> bool:
        return len(self._items) == 0

int_stack: Stack[int] = Stack()
int_stack.push(1)
int_stack.push(2)
print(int_stack.pop())      # 2

str_stack: Stack[str] = Stack()
str_stack.push("a")
print(str_stack.pop())      # "a"
```

Python's generics (`TypeVar`, `Generic[T]`) are primarily a
**documentation and tooling** aid — a type checker like `mypy` uses them
to catch mistakes *before* running your code, but Python itself does not
enforce them at runtime. `int_stack.push("oops")` will run without
complaint from the language itself; a type checker would flag it.
{{tab C#}}
```csharp
public class Stack<T> {
    private List<T> _items = new List<T>();

    public void Push(T item) {
        _items.Add(item);
    }

    public T Pop() {
        if (_items.Count == 0) throw new InvalidOperationException("pop from empty stack");
        T last = _items[_items.Count - 1];
        _items.RemoveAt(_items.Count - 1);
        return last;
    }

    public bool IsEmpty() {
        return _items.Count == 0;
    }
}

var intStack = new Stack<int>();
intStack.Push(1);
intStack.Push(2);
Console.WriteLine(intStack.Pop());   // 2

var strStack = new Stack<string>();
strStack.Push("a");
Console.WriteLine(strStack.Pop());   // "a"

// intStack.Push("oops");   // COMPILE ERROR: cannot convert 'string' to 'int'
```

C# generics are enforced by the **compiler**, not just tooling —
`intStack.Push("oops")` fails to compile, full stop. This is a real,
practical consequence of the static-vs-dynamic split from module 00:
generics in C# are a hard guarantee; in Python they're a strong
convention a type checker can verify for you, but not the language
itself.
{{/tabs}}

Sometimes a generic needs to be *constrained* — not "any type," but "any
type that can do X":

{{tabs}}
{{tab Python}}
```python
from typing import TypeVar, Protocol

class Comparable(Protocol):
    def __lt__(self, other) -> bool: ...

TComparable = TypeVar("TComparable", bound=Comparable)

def find_max(items: list[TComparable]) -> TComparable:
    best = items[0]
    for item in items[1:]:
        if item > best:
            best = item
    return best

print(find_max([3, 7, 2]))          # 7 — works for any type supporting '<'/'>'
```
{{tab C#}}
```csharp
public static T FindMax<T>(List<T> items) where T : IComparable<T> {
    T best = items[0];
    foreach (var item in items) {
        if (item.CompareTo(best) > 0) best = item;
    }
    return best;
}

Console.WriteLine(FindMax(new List<int> { 3, 7, 2 }));   // 7
```

`where T : IComparable<T>` is a **generic constraint**: "this method
works for any `T`, as long as that `T` implements `IComparable<T>`." The
compiler now lets you call `.CompareTo()` inside, because it *knows*
every possible `T` supports it — without the constraint, `item.CompareTo`
wouldn't even compile, since a truly unconstrained `T` might be anything.
{{/tabs}}

### Exception handling: designing failure, not just catching it

Every language lets you `try`/catch a failure. The design question is
*what you throw* and *what you catch* — a generic `Exception` tells the
caller nothing; a well-designed hierarchy tells them exactly what went
wrong and lets them react differently to different failures.

{{tabs}}
{{tab Python}}
```python
class AccountError(Exception):
    """Base class for every error this module raises."""
    pass

class InsufficientFundsError(AccountError):
    def __init__(self, requested, available):
        super().__init__(f"requested {requested}, only {available} available")
        self.requested = requested
        self.available = available

class AccountFrozenError(AccountError):
    pass

class BankAccount:
    def __init__(self, balance):
        self._balance = balance
        self._frozen = False

    def withdraw(self, amount):
        if self._frozen:
            raise AccountFrozenError("account is frozen")
        if amount > self._balance:
            raise InsufficientFundsError(amount, self._balance)
        self._balance -= amount

acct = BankAccount(100)
try:
    acct.withdraw(500)
except InsufficientFundsError as e:
    print(f"Can't withdraw: need {e.requested}, have {e.available}")
except AccountFrozenError:
    print("Account is frozen — contact support")
except AccountError:
    print("Some other account error")   # catches anything else from this module
finally:
    print("withdrawal attempt finished")   # always runs, success or failure
```
{{tab C#}}
```csharp
public class AccountException : Exception {           // base class for this module's errors
    public AccountException(string message) : base(message) { }
}

public class InsufficientFundsException : AccountException {
    public decimal Requested { get; }
    public decimal Available { get; }
    public InsufficientFundsException(decimal requested, decimal available)
        : base($"requested {requested}, only {available} available") {
        Requested = requested;
        Available = available;
    }
}

public class AccountFrozenException : AccountException {
    public AccountFrozenException(string message) : base(message) { }
}

public class BankAccount {
    private decimal _balance;
    private bool _frozen = false;

    public BankAccount(decimal balance) { _balance = balance; }

    public void Withdraw(decimal amount) {
        if (_frozen) throw new AccountFrozenException("account is frozen");
        if (amount > _balance) throw new InsufficientFundsException(amount, _balance);
        _balance -= amount;
    }
}

var acct = new BankAccount(100);
try {
    acct.Withdraw(500);
} catch (InsufficientFundsException e) {
    Console.WriteLine($"Can't withdraw: need {e.Requested}, have {e.Available}");
} catch (AccountFrozenException) {
    Console.WriteLine("Account is frozen — contact support");
} catch (AccountException) {
    Console.WriteLine("Some other account error");   // catches anything else from this module
} finally {
    Console.WriteLine("withdrawal attempt finished");   // always runs, success or failure
}
```

Both languages match a `catch`/`except` clause **top to bottom, most
specific first** — put a broad base-class handler before a specific one
and the specific one becomes unreachable (C#'s compiler will actually
refuse to build in that ordering; Python will silently let the broad one
swallow everything, another instance of Python trusting you more).
{{/tabs}}

**A custom exception hierarchy is itself a small design exercise**: a
common shared base (`AccountException`/`AccountError`) lets calling code
catch "anything from this subsystem" in one place, while specific
subclasses let it react precisely where it matters (e.g., only
`InsufficientFundsException` might trigger "offer overdraft," while
`AccountFrozenException` triggers "redirect to support").

### Enums: named, closed sets of values

An **enum** replaces a loose string or number ("pending", 0, 1, 2...)
with a small, closed, named set of valid values the compiler/interpreter
actually knows about.

{{tabs}}
{{tab Python}}
```python
from enum import Enum, auto

class OrderStatus(Enum):
    PENDING = auto()
    SHIPPED = auto()
    DELIVERED = auto()
    CANCELLED = auto()

status = OrderStatus.PENDING
print(status)                    # OrderStatus.PENDING
print(status == OrderStatus.PENDING)   # True

# status = "pending"   # a plain string here has NO relationship to OrderStatus at all —
                        # this is exactly the primitive-obsession bug enums prevent
```
{{tab C#}}
```csharp
public enum OrderStatus {
    Pending,
    Shipped,
    Delivered,
    Cancelled
}

OrderStatus status = OrderStatus.Pending;
Console.WriteLine(status);                          // Pending
Console.WriteLine(status == OrderStatus.Pending);    // true

// status = "pending";   // COMPILE ERROR: cannot convert 'string' to 'OrderStatus'
```

C#'s enum is a real, distinct compile-time type — assigning a string or
arbitrary number to an `OrderStatus` variable is a compile error. Python's
`Enum` is enforced by the class itself at the object level (comparing
`OrderStatus.PENDING == "pending"` is simply `False`, never a match by
accident), but nothing stops a variable *typed* as "anything" from later
being reassigned a plain string instead — again, Python's dynamic typing
means the discipline is yours to keep, not the language's to enforce.
{{/tabs}}

A validated transition function turns the enum into real design, not just
a label:

{{tabs}}
{{tab Python}}
```python
_VALID_TRANSITIONS = {
    OrderStatus.PENDING: {OrderStatus.SHIPPED, OrderStatus.CANCELLED},
    OrderStatus.SHIPPED: {OrderStatus.DELIVERED},
    OrderStatus.DELIVERED: set(),
    OrderStatus.CANCELLED: set(),
}

def transition(current: OrderStatus, target: OrderStatus) -> OrderStatus:
    if target not in _VALID_TRANSITIONS[current]:
        raise ValueError(f"cannot go from {current} to {target}")
    return target

s = transition(OrderStatus.PENDING, OrderStatus.SHIPPED)   # OK
transition(OrderStatus.DELIVERED, OrderStatus.PENDING)     # raises ValueError
```
{{tab C#}}
```csharp
static readonly Dictionary<OrderStatus, HashSet<OrderStatus>> ValidTransitions = new() {
    { OrderStatus.Pending,   new HashSet<OrderStatus> { OrderStatus.Shipped, OrderStatus.Cancelled } },
    { OrderStatus.Shipped,   new HashSet<OrderStatus> { OrderStatus.Delivered } },
    { OrderStatus.Delivered, new HashSet<OrderStatus>() },
    { OrderStatus.Cancelled, new HashSet<OrderStatus>() },
};

static OrderStatus Transition(OrderStatus current, OrderStatus target) {
    if (!ValidTransitions[current].Contains(target))
        throw new InvalidOperationException($"cannot go from {current} to {target}");
    return target;
}

var s = Transition(OrderStatus.Pending, OrderStatus.Shipped);    // OK
Transition(OrderStatus.Delivered, OrderStatus.Pending);          // throws
```
{{/tabs}}

### Value objects: immutable data with value equality

A **value object** represents *a value*, not an identity — two `Money`
objects with the same amount and currency should be considered *equal*,
even though they're two separate objects in memory. Plain classes don't
give you this for free.

{{tabs}}
{{tab Python}}
```python
class MoneyPlain:
    def __init__(self, amount, currency):
        self.amount = amount
        self.currency = currency

a = MoneyPlain(10, "USD")
b = MoneyPlain(10, "USD")
print(a == b)     # False! Plain classes compare by IDENTITY (are they the same object?),
                   # not by value — this is almost never what you want for something like money.
```

`@dataclass(frozen=True)` fixes both problems at once — value equality
*and* immutability — in one line:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Money:
    amount: float
    currency: str

a = Money(10, "USD")
b = Money(10, "USD")
print(a == b)          # True — dataclass generates value-based equality automatically

a.amount = 20           # FrozenInstanceError — frozen=True makes every field read-only after creation
```
{{tab C#}}
```csharp
public class MoneyPlain {
    public decimal Amount;
    public string Currency;
    public MoneyPlain(decimal amount, string currency) { Amount = amount; Currency = currency; }
}

var a = new MoneyPlain(10, "USD");
var b = new MoneyPlain(10, "USD");
Console.WriteLine(a == b);   // False! A plain class compares by REFERENCE by default —
                              // same bug as Python's plain class above.
```

A **`record`** (introduced in C# 9) fixes both problems in one line, the
same way `@dataclass(frozen=True)` does:

```csharp
public record Money(decimal Amount, string Currency);

var a = new Money(10, "USD");
var b = new Money(10, "USD");
Console.WriteLine(a == b);   // True — records generate value-based equality automatically

// a.Amount = 20;   // COMPILE ERROR: records are immutable by default (init-only properties)
```
{{/tabs}}

**The rule of thumb**: if two instances should be considered "the same"
purely because their data matches — money, coordinates, a date range, an
address — reach for `@dataclass(frozen=True)`/`record`, not a plain
class. If instead an object has a distinct *identity* that matters even
when data is identical (two different `BankAccount`s can coincidentally
have the same balance but are *not* interchangeable), a plain class with
reference equality is correct — this identity-vs-value distinction is
itself a real design decision, not a style preference.

## Hands-on exercises

### 1. Generic stack, two types

Implement the `Stack<T>`/`Stack[T]` from the Generics section. Push a mix
of `int`s onto one instance and `str`ings onto a separate instance, and
pop from both to confirm each stays correctly typed.

### 2. Custom exception hierarchy

Extend the `BankAccount` from module 01 with the `AccountException`
hierarchy shown above (`InsufficientFundsException`/`Error`,
`AccountFrozenException`/`Error`). Write code that attempts three
withdrawals — one that succeeds, one that's insufficient funds, one
against a frozen account — catching each specific exception type
separately and printing a distinct message for each.

### 3. Enum-driven state machine

Implement the `OrderStatus` enum and `transition` function above exactly
as shown, then write a small loop that attempts several transitions,
including at least one invalid one, catching and printing the error for
the invalid attempt without crashing the whole program.

### 4. A real value object

Design and implement a `Coordinate` value object (`latitude`,
`longitude`) as an immutable value object (`@dataclass(frozen=True)` /
`record`). Prove two `Coordinate`s with the same lat/long compare equal,
and that attempting to mutate one after creation fails.

### 5. Generic method with a predicate

Write a generic `find_first`/`FindFirst<T>` function that takes a
collection of `T` and a function/predicate (`Callable[[T], bool]` in
Python type hints; `Func<T, bool>` in C#) and returns the first item for
which the predicate returns true (or `None`/`default` if none match).
Test it once against a list of `int`s (find the first even number) and
once against a list of your `Coordinate` value objects (find the first
one north of the equator).

## Independent challenge

No code given.

**Task:** Build a generic **`Result<T>`** type — a real, widely-used
pattern for representing "this operation either succeeded with a value,
or failed with a message," *without* throwing an exception for an
entirely expected failure (like bad user input). It should support at
least: creating a success result carrying a value of type `T`, creating a
failure result carrying an error message, and checking which one you got
before accessing the value. Then write a function `parse_positive_int`
(Python) / `ParsePositiveInt` (C#) that takes a string and returns a
`Result<int>` — success if the string is a valid positive integer,
failure with a descriptive message otherwise (not empty, not negative,
actually numeric) — and call it with several inputs, both valid and
invalid, printing the outcome each time without a single `try`/`except`
or `try`/`catch` in the calling code.

<details>
<summary>Hint</summary>

A minimal shape: a generic class holding an `is_success`/`IsSuccess`
`bool`, a `value` field (only meaningful when successful), and an
`error` field (only meaningful when it failed) — plus two factory
methods/constructors, one for each case (`Result.success(value)` /
`Result<T>.Success(value)` and `Result.failure(message)` /
`Result<T>.Failure(message)`). The calling code then checks
`is_success`/`IsSuccess` and reads the right field — no exception
required for the "expected" failure path. (You'll recognize this shape
again, more formally, when Factory Method comes up in module 06.)

</details>

## Common mistakes & troubleshooting

- **Catching a bare `Exception`/`except:`.** This swallows *everything*,
  including genuine bugs you never intended to catch (a typo causing an
  `AttributeError`/`NullReferenceException` looks identical to your
  intended `InsufficientFundsException` once caught this broadly). Catch
  the most specific type that makes sense.
- **Using exceptions for expected, routine outcomes.** If "user typed an
  invalid number" happens on every tenth input, that's not exceptional —
  model it with a `Result` type (this module's challenge) or a validated
  parse function, and reserve real exceptions for things that indicate
  an actual bug or an unrecoverable situation.
- **Ordering `catch`/`except` blocks broad-to-narrow.** A base-class
  handler placed before a subclass handler swallows the subclass case
  first. C# refuses to compile this ordering; Python will not warn you
  at all.
- **Forgetting `frozen=True`/using a plain class for something that
  should be a value object.** Without it, two conceptually-equal `Money`
  amounts compare unequal, and nothing stops accidental mutation of what
  should be immutable data.
- **Primitive obsession.** Passing a raw `float` for money, a raw
  `string` for a status, or a raw pair of numbers for a coordinate,
  instead of a named value object or enum. It compiles/runs fine every
  time — right up until someone passes latitude where longitude was
  expected, or `"Pending"` where `"pending"` (wrong case) was expected,
  and nothing catches it. (This gets its own treatment as a named
  anti-pattern in module 20.)
- **Ignoring a generic constraint you actually need.** If your generic
  method needs to compare, print, or otherwise *do something specific*
  with `T`, you need a constraint (`where T : IComparable<T>` in C#; a
  `Protocol`/bound `TypeVar` in Python) — without it, the compiler (C#)
  or type checker (Python) correctly refuses to let you call that
  capability on an unconstrained `T`.

## Checkpoint quiz

1. What's the practical difference between how Python and C# enforce
   generic type parameters?
2. Why put `catch (InsufficientFundsException e)` before `catch
   (AccountException)` rather than the other way around?
3. What two problems does `@dataclass(frozen=True)`/`record` solve at
   once, that a plain class does not solve by default?
4. What's wrong with using a raised exception to break out of a loop
   under entirely normal, expected conditions?
5. Give one concrete example of "primitive obsession" and the value
   object or enum that fixes it.
6. What does `where T : IComparable<T>` (a generic constraint) actually
   let you do inside the method that you couldn't do without it?

<details>
<summary>Answers</summary>

1. C# enforces generics at compile time — passing the wrong type is a
   compile error. Python's generics (`TypeVar`/`Generic`) are checked
   only by external tools like `mypy`; the language itself does not
   enforce them at runtime.
2. `catch`/`except` clauses are matched top to bottom, most specific
   first. If the broad `AccountException` handler came first, it would
   catch `InsufficientFundsException` instances too (since it's a
   subclass), making the specific handler unreachable.
3. Value-based equality (two instances with equal data compare `==`
   true) and immutability (fields can't be changed after construction) —
   a plain class gives you neither by default (reference equality,
   mutable fields).
4. It uses an expensive, exceptional control-flow mechanism for a
   routine, expected event, obscures the actual logic, and makes it
   harder to distinguish "this failed because of a real bug" from "this
   finished normally, just via an unusual exit."
5. E.g., passing a raw `float` for a monetary amount (fixed by a `Money`
   value object that also carries currency and prevents mixing up units)
   or a raw string for a status (fixed by an enum that makes invalid
   values impossible to represent).
6. It lets you call `.CompareTo()` (or whatever the constraint
   guarantees) on a value of type `T` inside the generic method — without
   the constraint, the compiler can't assume an arbitrary `T` supports
   that operation and refuses to compile the call.

</details>

## Interview questions

1. **"Why would you design a custom exception hierarchy instead of just
   throwing a generic exception with a message?"**
   A hierarchy lets calling code catch and react to *specific* failure
   categories differently (retry on one, fail fast on another, show a
   specific user message on a third), while still allowing a single
   broad catch for "anything from this subsystem" via the shared base
   class. A generic exception with only a message forces callers to
   parse strings to figure out what happened.
2. **"What's the difference between a value object and an entity?"**
   A value object is defined entirely by its data — two instances with
   equal data *are* equal, and it's typically immutable (`Money`, a
   `Coordinate`, a date range). An entity has a distinct identity that
   persists even if its data changes or temporarily matches another
   entity's data (two `BankAccount`s with the same balance are still two
   different accounts).
3. **"Why are `record`s / `frozen` dataclasses useful for concurrent or
   shared state?"**
   Immutable objects can be freely shared across threads/callers without
   fear of one holder mutating data another is relying on — an entire
   category of bugs (and the need for locking around that particular
   piece of data) disappears if the data literally cannot change after
   creation. (This connects directly to module 10, concurrency-safe
   design.)
4. **"When should you use exceptions vs. a Result/Option-style return
   value?"**
   Exceptions for genuinely exceptional, usually unrecoverable-at-this-
   level conditions (a required file is missing, a network call fails
   unexpectedly). A `Result`-style value for routine, expected outcomes
   where failure is a normal, anticipated branch (user input validation,
   a lookup that may legitimately find nothing) — cheaper, and forces
   the caller to explicitly handle the failure case rather than letting
   an uncaught exception crash somewhere unrelated.
5. **"What problem does an enum solve that a plain integer or string
   constant doesn't?"**
   It creates a closed, named set of valid values that the
   compiler/language itself understands as a distinct type — you can't
   accidentally assign an out-of-range integer or a mistyped string where
   an enum was expected (in C#, this is compiler-enforced; in Python,
   it at least prevents a mistyped string from ever comparing equal to a
   real enum member).

## Further reading & sources

- [Python: `typing` — Generic, TypeVar](https://docs.python.org/3/library/typing.html#generics) - official reference for Python's generics.
- [Microsoft Learn: Generics (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/generics) - official reference, including constraints (`where`).
- [Python: `dataclasses` — frozen instances](https://docs.python.org/3/library/dataclasses.html#frozen-instances) - official reference for `@dataclass(frozen=True)`.
- [Microsoft Learn: Records (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/records) - official reference for `record` value equality and immutability.
- [Python: `enum` module](https://docs.python.org/3/library/enum.html) - official reference for `Enum`.
- [Microsoft Learn: Enumeration types (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/enum) - official reference for C#'s `enum`.

## Next

[04-solid-principles](../04-solid-principles/README.md) — with classes,
inheritance, polymorphism, generics, and clean error/value modeling all
in place, we're ready for the five principles that separate "code that
works" from "code you can change without fear."
