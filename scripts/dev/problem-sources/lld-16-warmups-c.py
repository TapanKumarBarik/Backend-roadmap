PROBLEMS = [
P(
    slug='lld-fraction', title='Fraction Value Object', topic='lld-oop-warmups', difficulty='beginner',
    module='lld/03-generics-exceptions-and-value-objects/README.md',
    description='Build an immutable fraction that stays in lowest terms, does arithmetic with fractions and ints, sorts and hashes correctly.',
    statement=r'''Write a class `Fraction` for exact arithmetic. It is a **value object**: two fractions with the same value are equal, whatever way they were written.

**Creating one:** `Fraction(numerator, denominator=1)`. It is always stored in **lowest terms with a positive denominator**: `Fraction(2, 4)`, `Fraction(-3, -6)` and `Fraction(1, 2)` are the same fraction; `Fraction(3, -6)` is `-1/2`; zero is `0/1`.

Check in this order and raise `ValueError` with exactly this message:

1. either part is not an `int` (a `bool` is not an `int` here): `"Parts must be integers"`
2. the denominator is zero: `"Denominator cannot be zero"`

**Properties:** `numerator`, `denominator`. Instances are **immutable**: assigning any attribute raises `AttributeError`.

**Arithmetic:** `+ - * /` between two fractions, or between a fraction and an `int` on either side (`1 + half`, `3 * half`, `1 / half`). Anything else (a `float`, a string) is not supported: Python raises `TypeError` when you return `NotImplemented`. Dividing by a zero fraction (or by `0`) raises `ValueError("Cannot divide by zero")`. Also `-x`, `abs(x)` and `float(x)`.

**Comparison:** `==` with another fraction **or an int** (`Fraction(4, 2) == 2`); a float or a string is simply not equal. `< <= > >=` with fractions and ints; comparing with anything else is a `TypeError`. Equal values must have the **same hash**, so `Fraction(2, 1)` and `2` work as the same dictionary key, and `sum([...])` of fractions works.

**Text:** `str(Fraction(3, 4))` is `"3/4"`; a whole number prints without the denominator (`"2"`); `repr` is `Fraction(3, 4)`.''',
    starter=r'''class Fraction:
    def __init__(self, numerator, denominator=1):
        ...

    @property
    def numerator(self):
        ...

    @property
    def denominator(self):
        ...

    # arithmetic: __add__, __radd__, __sub__, __rsub__, __mul__, __rmul__,
    # __truediv__, __rtruediv__, __neg__, __abs__, __float__
    # comparison: __eq__, __lt__ (and the rest), __hash__
    # text: __str__, __repr__''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def kind_of(action):
    try:
        action()
    except Exception as error:
        return type(error).__name__
    return None
half = Fraction(1, 2)
assert (half.numerator, half.denominator) == (1, 2)
assert (Fraction(2, 4).numerator, Fraction(2, 4).denominator) == (1, 2)
assert (Fraction(-3, -6).numerator, Fraction(-3, -6).denominator) == (1, 2)
assert (Fraction(3, -6).numerator, Fraction(3, -6).denominator) == (-1, 2)
assert (Fraction(0, -5).numerator, Fraction(0, -5).denominator) == (0, 1)
assert (Fraction(7).numerator, Fraction(7).denominator) == (7, 1)
assert str(Fraction(3, 4)) == "3/4" and str(Fraction(4, 2)) == "2" and str(Fraction(3, -6)) == "-1/2" and str(Fraction(0, 3)) == "0"
assert repr(Fraction(6, 8)) == "Fraction(3, 4)"
assert error_of(Fraction, 1, 0) == "ValueError: Denominator cannot be zero"
assert error_of(Fraction, 1.5, 2) == "ValueError: Parts must be integers"
assert error_of(Fraction, 1, True) == "ValueError: Parts must be integers"
assert error_of(Fraction, 1.5, 0) == "ValueError: Parts must be integers"
assert kind_of(lambda: setattr(half, "numerator", 3)) == "AttributeError"
assert kind_of(lambda: setattr(half, "anything", 3)) == "AttributeError"
assert half + Fraction(1, 3) == Fraction(5, 6)
assert half + 1 == Fraction(3, 2) and 1 + half == Fraction(3, 2)
assert half - Fraction(1, 3) == Fraction(1, 6) and 1 - half == half and half - 1 == Fraction(-1, 2)
assert Fraction(2, 3) * Fraction(3, 4) == half and 3 * half == Fraction(3, 2) and half * 4 == 2
assert half / Fraction(1, 4) == 2 and 1 / half == 2 and half / 2 == Fraction(1, 4)
assert error_of(lambda: half / 0) == "ValueError: Cannot divide by zero"
assert error_of(lambda: half / Fraction(0)) == "ValueError: Cannot divide by zero"
assert error_of(lambda: 1 / Fraction(0)) == "ValueError: Cannot divide by zero"
assert kind_of(lambda: half + 0.5) == "TypeError" and kind_of(lambda: half * "a") == "TypeError" and kind_of(lambda: 0.5 * half) == "TypeError"
assert -half == Fraction(-1, 2) and abs(Fraction(-1, 2)) == half and abs(half) == half
assert float(Fraction(1, 4)) == 0.25
assert Fraction(2, 1) == 2 and 2 == Fraction(2, 1) and Fraction(2, 4) == half
assert half != 0.5 and half != "1/2" and half != Fraction(1, 3)
assert hash(Fraction(2, 1)) == hash(2) and hash(Fraction(1, 2)) == hash(Fraction(3, 6))
assert {Fraction(1, 2): "x"}[Fraction(2, 4)] == "x" and {2: "y"}[Fraction(4, 2)] == "y"
assert Fraction(1, 3) < half and half <= half and half > Fraction(1, 3) and half >= half
assert half < 1 and 1 > half and half > 0 and Fraction(5, 2) > 2 and not Fraction(2, 1) < 2
assert sorted([Fraction(3, 4), Fraction(-1, 2), Fraction(1, 3)]) == [Fraction(-1, 2), Fraction(1, 3), Fraction(3, 4)]
assert kind_of(lambda: half < "a") == "TypeError" and kind_of(lambda: half < 0.5) == "TypeError"
assert sum([Fraction(1, 2), Fraction(1, 3), Fraction(1, 6)]) == 1
assert Fraction(10**30, 10**30 * 2) == half''',
    solution=r'''from math import gcd
from functools import total_ordering


@total_ordering
class Fraction:
    __slots__ = ("_n", "_d")

    def __init__(self, numerator, denominator=1):
        if type(numerator) is not int or type(denominator) is not int:
            raise ValueError("Parts must be integers")
        if denominator == 0:
            raise ValueError("Denominator cannot be zero")
        if denominator < 0:
            numerator, denominator = -numerator, -denominator
        divisor = gcd(numerator, denominator)
        object.__setattr__(self, "_n", numerator // divisor)
        object.__setattr__(self, "_d", denominator // divisor)

    def __setattr__(self, name, value):
        raise AttributeError("Fraction is immutable")

    @property
    def numerator(self):
        return self._n

    @property
    def denominator(self):
        return self._d

    @staticmethod
    def _coerce(other):
        if isinstance(other, Fraction):
            return other
        if type(other) is int:
            return Fraction(other)
        return None

    def __add__(self, other):
        other = self._coerce(other)
        if other is None:
            return NotImplemented
        return Fraction(self._n * other._d + other._n * self._d, self._d * other._d)

    __radd__ = __add__

    def __sub__(self, other):
        other = self._coerce(other)
        if other is None:
            return NotImplemented
        return Fraction(self._n * other._d - other._n * self._d, self._d * other._d)

    def __rsub__(self, other):
        other = self._coerce(other)
        if other is None:
            return NotImplemented
        return other - self

    def __mul__(self, other):
        other = self._coerce(other)
        if other is None:
            return NotImplemented
        return Fraction(self._n * other._n, self._d * other._d)

    __rmul__ = __mul__

    def __truediv__(self, other):
        other = self._coerce(other)
        if other is None:
            return NotImplemented
        if other._n == 0:
            raise ValueError("Cannot divide by zero")
        return Fraction(self._n * other._d, self._d * other._n)

    def __rtruediv__(self, other):
        other = self._coerce(other)
        if other is None:
            return NotImplemented
        return other / self

    def __neg__(self):
        return Fraction(-self._n, self._d)

    def __abs__(self):
        return Fraction(abs(self._n), self._d)

    def __float__(self):
        return self._n / self._d

    def __eq__(self, other):
        other = self._coerce(other)
        if other is None:
            return NotImplemented
        return (self._n, self._d) == (other._n, other._d)

    def __lt__(self, other):
        other = self._coerce(other)
        if other is None:
            return NotImplemented
        return self._n * other._d < other._n * self._d

    def __hash__(self):
        return hash(self._n) if self._d == 1 else hash((self._n, self._d))

    def __str__(self):
        return str(self._n) if self._d == 1 else f"{self._n}/{self._d}"

    def __repr__(self):
        return f"Fraction({self._n}, {self._d})"''',
    hints=[
        r'''Normalise in `__init__` only: fix the sign, then divide both parts by `math.gcd`. After that every other method can trust that the fraction is already in lowest terms, so equality is just "same two numbers".''',
        r'''One helper that turns the other operand into a `Fraction` (an int becomes `Fraction(n)`, anything else gives up) removes most of the duplication. When it gives up, return `NotImplemented`; Python then tries the other side and finally raises `TypeError` for you.''',
        r'''`__eq__` and `__hash__` must agree: if `Fraction(2, 1) == 2`, then `hash(Fraction(2, 1)) == hash(2)`. Immutability needs both `__slots__` (no `__dict__`) and a `__setattr__` that refuses, with `object.__setattr__` used once in `__init__`.''',
    ],
    explanation=r'''**The idea.** A value object is *defined by its value*. The one place that decides what the value is lives in the constructor: sign fixed, divided by the gcd. Every operation builds a *new* `Fraction` through the constructor, so every result is automatically normalised.

**Return `NotImplemented`, do not raise.** `half + 0.5` should not be your decision to refuse. Returning `NotImplemented` lets Python try the reflected method on the other operand (`0.5.__radd__`) and then raise the standard `TypeError`. It is also what makes `1 + half` work: `int.__add__` gives up, so Python calls `half.__radd__(1)`.

**Equality, hash and ordering travel together.** If two objects are equal they must hash alike, otherwise dictionaries and sets misbehave. That is why a whole-number fraction hashes like the int. `functools.total_ordering` fills in `<=`, `>`, `>=` from `__eq__` and `__lt__`.

**Why compare by cross-multiplying.** `a/b < c/d` is `a*d < c*b` when both denominators are positive. No floats, no rounding, and Python ints do not overflow.

**Complexity.** Every operation is O(log n) in the size of the numbers (the gcd).

**Going further.** `fractions.Fraction` in the standard library does exactly this, plus floats and powers. Read its source after you pass this problem and see what it does for `float` operands.''',
),
P(
    slug='lld-bank-account', title='Bank Account With Overdraft and Freeze', topic='lld-oop-warmups', difficulty='beginner',
    module='lld/01-classes-objects-and-oop-building-blocks/README.md',
    description='Model an account with deposits, withdrawals, an overdraft limit, a freeze switch, an audit history and an all-or-nothing transfer.',
    statement=r'''Write a class `Account`. Money is whole **cents**.

**Creating one:** `Account(owner, overdraft_limit=0)`. `owner` must be a non-blank string, else `ValueError("Owner required")`. `overdraft_limit` must be an `int` of 0 or more, else `ValueError("Overdraft limit cannot be negative")`. Check the owner first.

**Properties:** `owner`, `balance` (starts at 0), `frozen` (starts `False`), `history`: a **new list** each time of `(kind, amount, balance_after)` tuples, oldest first.

**Methods**

- `deposit(amount)` adds money; kind `"deposit"`.
- `withdraw(amount)` takes money out; kind `"withdraw"`. The balance may go down to `-overdraft_limit` and no further.
- `transfer(target, amount)` moves money from this account to `target`. It records `"transfer_out"` on this account and `"transfer_in"` on the target.
- `freeze()` and `unfreeze()` switch the frozen flag. A frozen account can neither pay nor receive.

**What is refused.** `ValueError` with exactly this message. Check in this order, and **change nothing** (no history entry either) when anything is refused:

1. `transfer` to the same account: `"Cannot transfer to the same account"`
2. this account (or, for a transfer, the target) is frozen: `"Account is frozen"`
3. `amount` is not an `int` (a `bool` is not one) or is below 1: `"Amount must be positive"`
4. the withdrawal or transfer would take the balance below `-overdraft_limit`: `"Insufficient funds"`

**Example**

```
a = Account("Asha"); b = Account("Ben")
a.deposit(500)
a.transfer(b, 200)
a.balance, b.balance   # 300, 200
b.history              # [("transfer_in", 200, 200)]
```''',
    starter=r'''class Account:
    def __init__(self, owner, overdraft_limit=0):
        ...

    @property
    def owner(self):
        ...

    @property
    def balance(self):
        ...

    @property
    def frozen(self):
        ...

    @property
    def history(self):
        """A new list of (kind, amount, balance_after), oldest first."""
        ...

    def deposit(self, amount):
        ...

    def withdraw(self, amount):
        ...

    def transfer(self, target, amount):
        ...

    def freeze(self):
        ...

    def unfreeze(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
assert error_of(Account, "") == "ValueError: Owner required"
assert error_of(Account, "   ") == "ValueError: Owner required"
assert error_of(Account, 7) == "ValueError: Owner required"
assert error_of(Account, "A", -1) == "ValueError: Overdraft limit cannot be negative"
assert error_of(Account, "A", 1.5) == "ValueError: Overdraft limit cannot be negative"
assert error_of(Account, "", -1) == "ValueError: Owner required"
acct = Account("Asha")
assert acct.owner == "Asha" and acct.balance == 0 and acct.frozen is False and acct.history == []
acct.deposit(500)
acct.withdraw(120)
assert acct.balance == 380
assert acct.history == [("deposit", 500, 500), ("withdraw", 120, 380)]
log = acct.history
log.append("junk")
assert acct.history == [("deposit", 500, 500), ("withdraw", 120, 380)]
assert error_of(acct.withdraw, 381) == "ValueError: Insufficient funds"
acct.withdraw(380)
assert acct.balance == 0
for bad in (0, -5, 1.5, True, "5", None):
    assert error_of(acct.deposit, bad) == "ValueError: Amount must be positive"
    assert error_of(acct.withdraw, bad) == "ValueError: Amount must be positive"
assert len(acct.history) == 3
card = Account("Ben", overdraft_limit=200)
card.withdraw(150)
assert card.balance == -150
assert error_of(card.withdraw, 51) == "ValueError: Insufficient funds"
card.withdraw(50)
assert card.balance == -200 and error_of(card.withdraw, 1) == "ValueError: Insufficient funds"
card.deposit(10)
assert card.balance == -190
a = Account("Asha")
b = Account("Ben")
a.deposit(500)
a.transfer(b, 200)
assert (a.balance, b.balance) == (300, 200)
assert a.history[-1] == ("transfer_out", 200, 300) and b.history == [("transfer_in", 200, 200)]
assert error_of(a.transfer, b, 301) == "ValueError: Insufficient funds"
assert (a.balance, b.balance) == (300, 200) and len(a.history) == 2 and len(b.history) == 1
assert error_of(a.transfer, a, 10) == "ValueError: Cannot transfer to the same account"
assert error_of(a.transfer, a, 0) == "ValueError: Cannot transfer to the same account"
assert error_of(a.transfer, b, 0) == "ValueError: Amount must be positive"
assert error_of(a.transfer, b, 1.5) == "ValueError: Amount must be positive"
b.freeze()
assert b.frozen is True
assert error_of(b.deposit, 5) == "ValueError: Account is frozen"
assert error_of(b.withdraw, 5) == "ValueError: Account is frozen"
assert error_of(b.deposit, 0) == "ValueError: Account is frozen"
assert error_of(a.transfer, b, 10) == "ValueError: Account is frozen"
assert error_of(b.transfer, a, 10) == "ValueError: Account is frozen"
assert error_of(a.transfer, b, 0) == "ValueError: Account is frozen"
assert (a.balance, b.balance) == (300, 200) and len(a.history) == 2 and len(b.history) == 1
b.unfreeze()
b.transfer(a, 200)
assert (a.balance, b.balance) == (500, 0)
assert error_of(a.transfer, b, 10**9) == "ValueError: Insufficient funds"
loan = Account("Cy", overdraft_limit=100)
loan.transfer(a, 100)
assert loan.balance == -100 and a.balance == 600
assert error_of(loan.transfer, a, 1) == "ValueError: Insufficient funds"''',
    solution=r'''class Account:
    def __init__(self, owner, overdraft_limit=0):
        if not isinstance(owner, str) or not owner.strip():
            raise ValueError("Owner required")
        if type(overdraft_limit) is not int or overdraft_limit < 0:
            raise ValueError("Overdraft limit cannot be negative")
        self._owner = owner
        self._limit = overdraft_limit
        self._balance = 0
        self._frozen = False
        self._history = []

    @property
    def owner(self):
        return self._owner

    @property
    def balance(self):
        return self._balance

    @property
    def frozen(self):
        return self._frozen

    @property
    def history(self):
        return list(self._history)

    def freeze(self):
        self._frozen = True

    def unfreeze(self):
        self._frozen = False

    @staticmethod
    def _check_amount(amount):
        if type(amount) is not int or amount < 1:
            raise ValueError("Amount must be positive")

    def _check_active(self):
        if self._frozen:
            raise ValueError("Account is frozen")

    def _apply(self, kind, delta):
        self._balance += delta
        self._history.append((kind, abs(delta), self._balance))

    def deposit(self, amount):
        self._check_active()
        self._check_amount(amount)
        self._apply("deposit", amount)

    def withdraw(self, amount):
        self._check_active()
        self._check_amount(amount)
        if self._balance - amount < -self._limit:
            raise ValueError("Insufficient funds")
        self._apply("withdraw", -amount)

    def transfer(self, target, amount):
        if target is self:
            raise ValueError("Cannot transfer to the same account")
        self._check_active()
        target._check_active()
        self._check_amount(amount)
        if self._balance - amount < -self._limit:
            raise ValueError("Insufficient funds")
        self._apply("transfer_out", -amount)
        target._apply("transfer_in", amount)''',
    hints=[
        r'''Keep the history private and hand out `list(self._history)`: a caller must not be able to rewrite your audit trail through the list you return.''',
        r'''A refused call must change nothing, so do every check **before** the first line that changes the balance. A transfer checks both accounts first and only then touches either.''',
        r'''`bool` is a subclass of `int`: `isinstance(True, int)` is `True`. Use `type(amount) is int`. The history stores the positive amount; the sign is only used to move the balance.''',
    ],
    explanation=r'''**The idea.** An account is a balance plus a rule about how far it may fall. The history is a second, append-only fact that must always agree with the balance: the last `balance_after` equals `balance`. Routing every change through one method, `_apply`, is what keeps that true.

**Validate, then mutate.** The rule "a refused call changes nothing" is the most common bug in transfers. If you withdraw first and discover afterwards that the target is frozen, you have already moved money. Check everything, then change two things back to back.

**Guard clauses in a fixed order.** Same account, frozen, amount, funds. A fixed order is part of the contract: with three things wrong, the caller should always hear about the same one.

**Do not hand out your internals.** `history` returns a copy. Otherwise `acct.history.clear()` rewrites the past.

**Complexity.** Every operation is O(1) except `history`, which copies, O(n).

**Going further.** Real systems never keep a balance field alone: the balance is *derived* from the ledger. What changes if `balance` is computed from `history` each time, and what does it buy you when two transfers race?''',
),
P(
    slug='lld-address-book', title='Address Book', topic='lld-oop-warmups', difficulty='beginner',
    module='lld/01-classes-objects-and-oop-building-blocks/README.md',
    description='Keep contacts with normalised phones and emails, reject duplicates, update atomically and search across fields.',
    statement=r'''Write a class `AddressBook` that stores contacts.

**Methods**

- `add(name, phone=None, email=None)` stores a contact and returns its **id**: 1 for the first contact, then 2, 3, ... Ids are never reused, even after `remove`.
- `get(contact_id)` returns a **new dict** `{"id", "name", "phone", "email"}` (changing it must not change the book).
- `update(contact_id, **fields)` changes `name`, `phone` and/or `email`; passing `None` clears a phone or email.
- `remove(contact_id)` deletes a contact.
- `search(text)` returns a list of ids of the contacts whose name, phone or email **contains** `text`, ignoring case; sorted by name (ignoring case), then by id. An empty `text` matches everybody.

**Cleaning.** A name is stored stripped of surrounding spaces and must not be blank. A **phone** is stored as **digits only** (`"+91 98765-43210"` becomes `"919876543210"`) and must contain at least one digit. An **email** is stored **lower-case**, stripped, and must contain exactly one `@` with text on both sides. Two contacts may not have the same email.

**What is refused.** `ValueError` with exactly this message, changing nothing. Check in this order:

1. `get`, `update` or `remove` with an id that does not exist: `"Unknown contact"`
2. `update` with a field other than the three: `"Unknown field"`
3. a blank name: `"Name required"`
4. a bad phone: `"Bad phone"`
5. a bad email: `"Bad email"`
6. an email that another contact already uses: `"Duplicate email"` (a contact never clashes with itself, and `update` is **all or nothing**: if any field is refused, no field changes)''',
    starter=r'''class AddressBook:
    def __init__(self):
        ...

    def add(self, name, phone=None, email=None):
        """Store a contact and return its id."""
        ...

    def get(self, contact_id):
        ...

    def update(self, contact_id, **fields):
        ...

    def remove(self, contact_id):
        ...

    def search(self, text):
        """Ids of the contacts that match, sorted by name then id."""
        ...''',
    tests=r'''def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
book = AddressBook()
asha = book.add("  Asha Rao ", "+91 98765-43210", "Asha@Example.com ")
ben = book.add("ben", email="ben@example.com")
cy = book.add("Cy")
assert (asha, ben, cy) == (1, 2, 3)
assert book.get(asha) == {"id": 1, "name": "Asha Rao", "phone": "919876543210", "email": "asha@example.com"}
assert book.get(cy) == {"id": 3, "name": "Cy", "phone": None, "email": None}
copy = book.get(asha)
copy["name"] = "Changed"
assert book.get(asha)["name"] == "Asha Rao"
assert book.search("") == [asha, ben, cy]
assert book.search("EXAMPLE") == [asha, ben]
assert book.search("9876") == [asha] and book.search("zzz") == []
assert book.search("rao") == [asha] and book.search("B") == [ben]
other = book.add("alan", None, "zed@x.io")
assert other == 4 and book.search("") == [other, asha, ben, cy]
tie_one = book.add("Dee")
tie_two = book.add("dee")
assert book.search("dee") == [tie_one, tie_two]
assert error_of(book.add, "") == "ValueError: Name required"
assert error_of(book.add, "   ") == "ValueError: Name required"
assert error_of(book.add, "X", "abc") == "ValueError: Bad phone"
assert error_of(book.add, "X", "", None) == "ValueError: Bad phone"
assert error_of(book.add, "X", None, "nope") == "ValueError: Bad email"
assert error_of(book.add, "X", None, "a@b@c") == "ValueError: Bad email"
assert error_of(book.add, "X", None, "@x.com") == "ValueError: Bad email"
assert error_of(book.add, "X", None, "me@") == "ValueError: Bad email"
assert error_of(book.add, "X", None, "ASHA@example.COM") == "ValueError: Duplicate email"
assert error_of(book.add, "", "abc") == "ValueError: Name required"
assert error_of(book.add, "X", "abc", "nope") == "ValueError: Bad phone"
assert error_of(book.add, "X", None, "ben@example.com") == "ValueError: Duplicate email"
assert len(book.search("")) == 6
assert error_of(book.get, 99) == "ValueError: Unknown contact"
assert error_of(book.remove, 99) == "ValueError: Unknown contact"
assert error_of(book.update, 99, name="Q") == "ValueError: Unknown contact"
assert error_of(book.update, 99, color="red") == "ValueError: Unknown contact"
assert error_of(book.update, asha, color="red") == "ValueError: Unknown field"
book.update(asha, email="ASHA@example.com", phone="12-34")
assert book.get(asha)["email"] == "asha@example.com" and book.get(asha)["phone"] == "1234"
book.update(asha, phone=None, name=" Asha R ")
assert book.get(asha) == {"id": 1, "name": "Asha R", "phone": None, "email": "asha@example.com"}
before = book.get(asha)
assert error_of(book.update, asha, name="New", email="ben@example.com") == "ValueError: Duplicate email"
assert error_of(book.update, asha, name="New", phone="xx") == "ValueError: Bad phone"
assert error_of(book.update, asha, name="  ") == "ValueError: Name required"
assert error_of(book.update, asha, phone="xx", name="  ") == "ValueError: Name required"
assert error_of(book.update, asha, email="nope", phone="xx") == "ValueError: Bad phone"
assert book.get(asha) == before
book.update(ben, email=None)
assert book.get(ben)["email"] is None
assert book.add("New", None, "ben@example.com") == 7
book.remove(cy)
assert error_of(book.get, cy) == "ValueError: Unknown contact"
assert book.add("After") == 8''',
    solution=r'''class AddressBook:
    _FIELDS = ("name", "phone", "email")

    def __init__(self):
        self._contacts = {}
        self._next_id = 1

    @staticmethod
    def _clean_name(name):
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Name required")
        return name.strip()

    @staticmethod
    def _clean_phone(phone):
        if phone is None:
            return None
        digits = "".join(ch for ch in str(phone) if ch.isdigit()) if isinstance(phone, str) else ""
        if not digits:
            raise ValueError("Bad phone")
        return digits

    @staticmethod
    def _clean_email(email):
        if email is None:
            return None
        if not isinstance(email, str):
            raise ValueError("Bad email")
        email = email.strip().lower()
        parts = email.split("@")
        if len(parts) != 2 or not parts[0] or not parts[1]:
            raise ValueError("Bad email")
        return email

    def _check_duplicate(self, email, own_id=None):
        if email is None:
            return
        for contact_id, contact in self._contacts.items():
            if contact_id != own_id and contact["email"] == email:
                raise ValueError("Duplicate email")

    def _clean(self, values, own_id=None):
        cleaned = {}
        if "name" in values:
            cleaned["name"] = self._clean_name(values["name"])
        if "phone" in values:
            cleaned["phone"] = self._clean_phone(values["phone"])
        if "email" in values:
            cleaned["email"] = self._clean_email(values["email"])
            self._check_duplicate(cleaned["email"], own_id)
        return cleaned

    def _contact(self, contact_id):
        if contact_id not in self._contacts:
            raise ValueError("Unknown contact")
        return self._contacts[contact_id]

    def add(self, name, phone=None, email=None):
        cleaned = self._clean({"name": name, "phone": phone, "email": email})
        contact_id = self._next_id
        self._next_id += 1
        self._contacts[contact_id] = {"id": contact_id, **cleaned}
        return contact_id

    def get(self, contact_id):
        return dict(self._contact(contact_id))

    def update(self, contact_id, **fields):
        contact = self._contact(contact_id)
        for field in fields:
            if field not in self._FIELDS:
                raise ValueError("Unknown field")
        contact.update(self._clean(fields, contact_id))

    def remove(self, contact_id):
        self._contact(contact_id)
        del self._contacts[contact_id]

    def search(self, text):
        needle = text.lower()
        found = [
            contact for contact in self._contacts.values()
            if any(needle in str(contact[field]).lower() for field in self._FIELDS if contact[field] is not None)
        ]
        found.sort(key=lambda contact: (contact["name"].lower(), contact["id"]))
        return [contact["id"] for contact in found]''',
    hints=[
        r'''Write one `_clean` step that turns raw input into stored form (stripped name, digits-only phone, lower-case email) and raises on the first bad value in the order of the statement. `add` and `update` both call it.''',
        r'''For an all-or-nothing `update`, clean **every** field into a new dict first and only then call `contact.update(cleaned)`. A refusal in the middle then leaves the contact untouched.''',
        r'''When checking for a duplicate email during `update`, skip the contact you are changing. Ids come from a counter that only goes up, not from `len(contacts)`, so removing a contact never reuses an id.''',
    ],
    explanation=r'''**The idea.** The book holds one dict per contact. Everything interesting is *normalisation at the door*: whatever the caller passes in, what is stored is clean. After that, search and duplicate checks are plain string comparisons.

**Normalise once, compare simply.** Lower-casing the email on the way in is what makes the duplicate check one `==`. If you stored what the user typed and compared with `.lower()` everywhere, one forgotten call is a bug.

**All-or-nothing update.** Build the new values first, apply them in one `dict.update`. This is a tiny version of a database transaction: never leave a record half-changed.

**Ids that never repeat.** A counter that only increases is what makes "contact 3" mean the same person for the whole life of the book, even after others are deleted.

**Complexity.** `add`, `get`, `remove` are O(1) except the duplicate-email scan, which is O(n). `search` is O(n log n). An index from email to id would make the duplicate check O(1).

**Going further.** Add that email index, and then decide: what must `update` do to it when the email changes, and what if the update is refused halfway?''',
),
P(
    slug='lld-deck-of-cards', title='Deck of Cards', topic='lld-oop-warmups', difficulty='beginner',
    module='lld/01-classes-objects-and-oop-building-blocks/README.md',
    description='Model cards and a 52-card deck with an injectable shuffler, dealing and round-robin hands.',
    statement=r'''Write two classes, `Card` and `Deck`. The deck is the first class where *testing a shuffle* matters, so the randomness is **injected**.

**Card.** `Card(rank, suit)` where `rank` is one of `"2"` ... `"10"`, `"J"`, `"Q"`, `"K"`, `"A"` (in that order, low to high) and `suit` is one of `"clubs"`, `"diamonds"`, `"hearts"`, `"spades"` (in that order). Anything else raises `ValueError("Bad card")`.
It has `rank` and `suit`, `str(card)` is `"A of spades"`, cards with the same rank and suit are equal and hashable, and cards sort by **rank first, then suit** in the orders above (`Card("2", "spades") < Card("3", "clubs")`).

**Deck.** `Deck(rng=None)`: `rng` is any object with a `shuffle(list)` method that shuffles in place. When it is `None`, use `random.Random()`.

- A new deck holds the 52 cards in order: **all clubs from `2` to `A`, then diamonds, then hearts, then spades**. The first card is the top of the deck.
- `cards` is a **tuple** of the cards left, top first. `len(deck)` is how many are left.
- `shuffle()` shuffles the cards left by calling `rng.shuffle(...)` exactly once.
- `deal(count=1)` removes `count` cards from the top and returns them as a list, top first.
- `deal_hands(players, size)` deals `size` cards to each of `players` players, **one card at a time in turn** (player 0, player 1, ..., then player 0 again) and returns a list of `players` lists.
- `reset()` puts all 52 cards back in the starting order.

**What is refused.** `ValueError`, changing nothing. In this order: `count`, `players`, `size` not an `int` of 1 or more: `"Count must be positive"` (also for `players` and `size`); then asking for more cards than are left: `"Not enough cards"`.''',
    starter=r'''class Card:
    def __init__(self, rank, suit):
        ...


class Deck:
    def __init__(self, rng=None):
        ...

    @property
    def cards(self):
        ...

    def shuffle(self):
        ...

    def deal(self, count=1):
        ...

    def deal_hands(self, players, size):
        ...

    def reset(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Reverser:
    def __init__(self):
        self.calls = 0
    def shuffle(self, items):
        self.calls += 1
        items.reverse()
ace = Card("A", "spades")
assert (ace.rank, ace.suit) == ("A", "spades") and str(ace) == "A of spades" and str(Card("10", "hearts")) == "10 of hearts"
assert error_of(Card, "1", "clubs") == "ValueError: Bad card"
assert error_of(Card, "A", "stars") == "ValueError: Bad card"
assert error_of(Card, 2, "clubs") == "ValueError: Bad card"
assert Card("Q", "hearts") == Card("Q", "hearts") and Card("Q", "hearts") != Card("Q", "spades")
assert hash(Card("Q", "hearts")) == hash(Card("Q", "hearts")) and len({Card("2", "clubs"), Card("2", "clubs")}) == 1
assert Card("2", "spades") < Card("3", "clubs") and Card("9", "clubs") < Card("9", "spades") and Card("10", "clubs") > Card("9", "spades")
assert Card("A", "clubs") > Card("K", "spades") and Card("J", "hearts") >= Card("J", "hearts") and Card("J", "hearts") <= Card("J", "hearts")
assert sorted([Card("K", "clubs"), Card("2", "hearts"), Card("2", "clubs")]) == [Card("2", "clubs"), Card("2", "hearts"), Card("K", "clubs")]
deck = Deck()
assert len(deck) == 52 and isinstance(deck.cards, tuple)
assert str(deck.cards[0]) == "2 of clubs" and str(deck.cards[12]) == "A of clubs" and str(deck.cards[13]) == "2 of diamonds" and str(deck.cards[-1]) == "A of spades"
assert len(set(deck.cards)) == 52
top = deck.deal(3)
assert [str(card) for card in top] == ["2 of clubs", "3 of clubs", "4 of clubs"] and len(deck) == 49
assert str(deck.deal()[0]) == "5 of clubs" and len(deck) == 48
assert error_of(deck.deal, 0) == "ValueError: Count must be positive"
assert error_of(deck.deal, True) == "ValueError: Count must be positive"
assert error_of(deck.deal, 2.0) == "ValueError: Count must be positive"
assert error_of(deck.deal, 49) == "ValueError: Not enough cards" and len(deck) == 48
deck.reset()
assert len(deck) == 52 and str(deck.cards[0]) == "2 of clubs"
fake = Reverser()
shuffled = Deck(fake)
shuffled.shuffle()
assert fake.calls == 1 and str(shuffled.cards[0]) == "A of spades" and str(shuffled.cards[-1]) == "2 of clubs" and len(shuffled) == 52
shuffled.reset()
assert fake.calls == 1 and str(shuffled.cards[0]) == "2 of clubs"
shuffled.shuffle()
dealt = shuffled.deal(2)
assert [str(card) for card in dealt] == ["A of spades", "K of spades"]
hands = Deck().deal_hands(3, 2)
assert [[str(card) for card in hand] for hand in hands] == [["2 of clubs", "5 of clubs"], ["3 of clubs", "6 of clubs"], ["4 of clubs", "7 of clubs"]]
small = Deck()
assert error_of(small.deal_hands, 0, 2) == "ValueError: Count must be positive"
assert error_of(small.deal_hands, 2, 0) == "ValueError: Count must be positive"
assert error_of(small.deal_hands, 2, 1.5) == "ValueError: Count must be positive"
assert error_of(small.deal_hands, 8, 7) == "ValueError: Not enough cards" and len(small) == 52
assert len(small.deal_hands(4, 13)) == 4 and len(small) == 0
assert error_of(small.deal) == "ValueError: Not enough cards"
real = Deck()
real.shuffle()
assert len(real) == 52 and len(set(real.cards)) == 52''',
    solution=r'''import random
from functools import total_ordering

RANKS = ("2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A")
SUITS = ("clubs", "diamonds", "hearts", "spades")


@total_ordering
class Card:
    __slots__ = ("_rank", "_suit")

    def __init__(self, rank, suit):
        if rank not in RANKS or suit not in SUITS:
            raise ValueError("Bad card")
        self._rank = rank
        self._suit = suit

    @property
    def rank(self):
        return self._rank

    @property
    def suit(self):
        return self._suit

    def _key(self):
        return (RANKS.index(self._rank), SUITS.index(self._suit))

    def __eq__(self, other):
        if not isinstance(other, Card):
            return NotImplemented
        return self._key() == other._key()

    def __lt__(self, other):
        if not isinstance(other, Card):
            return NotImplemented
        return self._key() < other._key()

    def __hash__(self):
        return hash(self._key())

    def __str__(self):
        return f"{self._rank} of {self._suit}"

    def __repr__(self):
        return f"Card({self._rank!r}, {self._suit!r})"


def _positive(value):
    if type(value) is not int or value < 1:
        raise ValueError("Count must be positive")


class Deck:
    def __init__(self, rng=None):
        self._rng = rng if rng is not None else random.Random()
        self._cards = []
        self.reset()

    @property
    def cards(self):
        return tuple(self._cards)

    def __len__(self):
        return len(self._cards)

    def reset(self):
        self._cards = [Card(rank, suit) for suit in SUITS for rank in RANKS]

    def shuffle(self):
        self._rng.shuffle(self._cards)

    def deal(self, count=1):
        _positive(count)
        if count > len(self._cards):
            raise ValueError("Not enough cards")
        top = self._cards[:count]
        del self._cards[:count]
        return top

    def deal_hands(self, players, size):
        _positive(players)
        _positive(size)
        if players * size > len(self._cards):
            raise ValueError("Not enough cards")
        hands = [[] for _ in range(players)]
        for turn in range(players * size):
            hands[turn % players].append(self._cards.pop(0))
        return hands''',
    hints=[
        r'''The deck is a list of cards, top first. Build it with two nested loops, suits outside and ranks inside, so the order matches the statement.''',
        r'''Ordering needs a numeric key per card: the position of the rank in the rank tuple, then the position of the suit. `functools.total_ordering` then needs only `__eq__` and `__lt__`.''',
        r'''Call `self._rng.shuffle(self._cards)` and nothing else random. Anything that calls the global `random` module cannot be tested; an injected object can be replaced by one that simply reverses the list.''',
    ],
    explanation=r'''**The idea.** Randomness is a dependency like a database or a clock. If `Deck` called `random.shuffle` directly, a test could only check "still 52 distinct cards". Handing it an object with a `shuffle` method lets a test pass a fake that reverses the list, so "the shuffler was used exactly once and the result is what it produced" becomes an exact assertion.

**Cards are value objects.** Equality, hash and ordering all come from one key, `(rank index, suit index)`. Defining `_key` once keeps the three methods consistent.

**Validate before you mutate.** `deal_hands` checks the total up front. A deal that fails halfway would leave some players with cards and the deck short.

**Round-robin, like a real table.** Card number `n` goes to player `n % players`. Dealing all of player 0's cards first is a different (and wrong) game.

**Complexity.** `deal` is O(count); `deal_hands` here is O(players * size * n) because `pop(0)` shifts the list; slicing once and distributing from the slice makes it O(players * size).

**Going further.** Make `deal_hands` O(players * size) without changing behaviour, and write the one test that would have caught the slow version.''',
),
P(
    slug='lld-circular-buffer', title='Circular Buffer', topic='lld-oop-warmups', difficulty='beginner',
    module='lld/03-generics-exceptions-and-value-objects/README.md',
    description='Build a fixed-size ring buffer that overwrites the oldest item when full and does every operation in constant time.',
    statement=r'''Write a class `CircularBuffer`, a fixed-size queue that **overwrites its oldest item when it is full**. It keeps log lines, recent readings, "last 100 events".

**Creating one:** `CircularBuffer(capacity)`; `capacity` must be an `int` of 1 or more (a `bool` is not), else `ValueError("Capacity must be positive")`.

**Methods and properties**

- `push(item)` adds an item at the newest end. If the buffer is full, the **oldest** item is dropped to make room and `push` **returns the dropped item**; otherwise it returns `None`.
- `pop()` removes and returns the **oldest** item; `peek()` returns it without removing. Both raise `ValueError("Buffer is empty")` when empty.
- `latest(n)` returns the `n` newest items, **newest first**, as a list (fewer if there are fewer). `n` below 0 raises `ValueError("Count cannot be negative")`.
- `to_list()` returns every item, **oldest first**. Iterating the buffer (`for x in buffer`) gives the same order. `len(buffer)` is how many items it holds.
- `capacity`, `is_full`, `is_empty` and `clear()`.

**Speed.** Every operation except `latest`, `to_list` and iteration must take **constant time**: no shifting of a list. The tests push 200,000 items through a buffer of 50,000 and expect it to finish quickly.''',
    starter=r'''class CircularBuffer:
    def __init__(self, capacity):
        ...

    def push(self, item):
        """Add `item`; return the item that was dropped, or None."""
        ...

    def pop(self):
        ...

    def peek(self):
        ...

    def latest(self, n):
        ...

    def to_list(self):
        ...

    def clear(self):
        ...

    def __len__(self):
        ...

    def __iter__(self):
        ...

    @property
    def capacity(self):
        ...

    @property
    def is_full(self):
        ...

    @property
    def is_empty(self):
        ...''',
    tests=r'''import time
def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
for bad in (0, -1, 1.5, True, "3", None):
    assert error_of(CircularBuffer, bad) == "ValueError: Capacity must be positive"
buf = CircularBuffer(3)
assert buf.capacity == 3 and len(buf) == 0 and buf.is_empty and not buf.is_full and buf.to_list() == []
assert error_of(buf.pop) == "ValueError: Buffer is empty" and error_of(buf.peek) == "ValueError: Buffer is empty"
assert buf.push("a") is None and buf.push("b") is None
assert buf.to_list() == ["a", "b"] and len(buf) == 2 and not buf.is_full and not buf.is_empty
assert buf.push("c") is None and buf.is_full
assert buf.push("d") == "a" and buf.to_list() == ["b", "c", "d"] and len(buf) == 3
assert buf.push("e") == "b" and list(buf) == ["c", "d", "e"]
assert buf.peek() == "c" and len(buf) == 3
assert buf.pop() == "c" and buf.to_list() == ["d", "e"] and not buf.is_full
assert buf.push("f") is None and buf.to_list() == ["d", "e", "f"]
assert buf.latest(2) == ["f", "e"] and buf.latest(0) == [] and buf.latest(10) == ["f", "e", "d"]
assert error_of(buf.latest, -1) == "ValueError: Count cannot be negative"
assert buf.pop() == "d" and buf.pop() == "e" and buf.pop() == "f" and buf.is_empty
assert error_of(buf.pop) == "ValueError: Buffer is empty"
buf.push(1)
buf.push(2)
buf.clear()
assert len(buf) == 0 and buf.is_empty and buf.to_list() == []
buf.push(9)
assert buf.to_list() == [9] and buf.peek() == 9
one = CircularBuffer(1)
assert one.push("x") is None and one.push("y") == "x" and one.to_list() == ["y"] and one.latest(5) == ["y"]
nothing = CircularBuffer(2)
assert nothing.push(None) is None and nothing.push(None) is None and len(nothing) == 2 and not nothing.is_empty
assert nothing.pop() is None and len(nothing) == 1
for step in range(20):
    buf.push(step)
assert buf.to_list() == [17, 18, 19] and buf.latest(1) == [19]
big = CircularBuffer(50000)
started = time.time()
dropped = 0
for number in range(200000):
    if big.push(number) is not None:
        dropped += 1
assert dropped == 150000 and big.peek() == 150000 and big.latest(1) == [199999]
assert time.time() - started < 2.0''',
    solution=r'''class CircularBuffer:
    def __init__(self, capacity):
        if type(capacity) is not int or capacity < 1:
            raise ValueError("Capacity must be positive")
        self._slots = [None] * capacity
        self._start = 0
        self._size = 0

    @property
    def capacity(self):
        return len(self._slots)

    @property
    def is_full(self):
        return self._size == len(self._slots)

    @property
    def is_empty(self):
        return self._size == 0

    def __len__(self):
        return self._size

    def push(self, item):
        capacity = len(self._slots)
        dropped = None
        if self._size == capacity:
            dropped = self._slots[self._start]
            self._slots[self._start] = item
            self._start = (self._start + 1) % capacity
        else:
            self._slots[(self._start + self._size) % capacity] = item
            self._size += 1
        return dropped

    def peek(self):
        if self._size == 0:
            raise ValueError("Buffer is empty")
        return self._slots[self._start]

    def pop(self):
        item = self.peek()
        self._slots[self._start] = None
        self._start = (self._start + 1) % len(self._slots)
        self._size -= 1
        return item

    def to_list(self):
        capacity = len(self._slots)
        return [self._slots[(self._start + offset) % capacity] for offset in range(self._size)]

    def __iter__(self):
        return iter(self.to_list())

    def latest(self, n):
        if n < 0:
            raise ValueError("Count cannot be negative")
        return list(reversed(self.to_list()))[:n]

    def clear(self):
        self._slots = [None] * len(self._slots)
        self._start = 0
        self._size = 0''',
    hints=[
        r'''Allocate the list once, at full capacity. Keep two numbers: where the oldest item is (`start`) and how many items there are (`size`). The newest item sits at `(start + size) % capacity`.''',
        r'''When the buffer is full, a push overwrites the slot at `start` (that is the oldest item, so return it) and moves `start` forward by one. When it is not full, `size` grows instead and `start` stays.''',
        r'''Do not use `None` to mean "empty slot" when deciding anything: someone may push `None`. Decide emptiness from `size` alone.''',
    ],
    explanation=r'''**The idea.** A ring buffer is a fixed array plus a moving start. Instead of shifting items when the oldest leaves, the start index moves and the array position is taken `% capacity`. Nothing is ever copied, so `push` and `pop` are O(1).

```mermaid
flowchart LR
    A["slots: [d, e, c]"] --> B["start = 2 (oldest is c)"]
    B --> C["order: c, d, e"]
```

**Why not `list.pop(0)`?** It works, and it is O(n) because every remaining item shifts one place left. With 50,000 items and 200,000 pushes that is billions of moves. The timing test exists to catch exactly this.

**Size is its own variable.** With only a start index you cannot tell an empty buffer from a full one (both have `start == end`). A separate `size` removes the ambiguity, and it also means `None` is a perfectly good item.

**Complexity.** `push`, `pop`, `peek`, `len` are O(1). `to_list` and `latest` are O(size).

**Going further.** `collections.deque(maxlen=n)` is a ring buffer in the standard library. What does it do when full, and how would you get the *dropped* item back out of it?''',
),
P(
    slug='lld-matrix', title='Matrix', topic='lld-oop-warmups', difficulty='intermediate',
    module='lld/03-generics-exceptions-and-value-objects/README.md',
    description='Build an immutable matrix with addition, scalar and matrix multiplication, transpose, powers and clear shape errors.',
    statement=r'''Write an immutable class `Matrix` of numbers.

**Creating one:** `Matrix(rows)` where `rows` is a list of equal-length lists of numbers. The matrix keeps its **own copy**. Raise `ValueError` for: no rows or a row with no numbers `"Matrix cannot be empty"`, then rows of different lengths `"Rows must have equal length"`.

**Properties:** `rows` (a tuple of tuples), `shape` (`(row count, column count)`), and `T`, the **transpose** (a new matrix). `m[r, c]` is one cell. `Matrix.identity(n)` is the n by n identity (`ValueError("Size must be positive")` when `n` is not an `int` of 1 or more).

**Operators** (every one returns a **new** matrix)

- `a + b` and `a - b` need equal shapes, else `ValueError("Shapes do not match")`.
- `a * k` and `k * a` multiply every cell by a number `k` (an `int` or `float`). Multiplying two matrices with `*` is not supported (`TypeError`: return `NotImplemented`).
- `a @ b` is the matrix product; the columns of `a` must equal the rows of `b`, else `ValueError("Inner dimensions do not match")`.
- `a ** k` is `a` multiplied by itself `k` times, for an `int` `k` of 0 or more (`a ** 0` is the identity); the matrix must be square, else `ValueError("Matrix must be square")`. A negative or non-int `k` is a `TypeError`.
- `==` compares shape and cells; matrices are hashable.

`trace()` is the sum of the diagonal (square matrices only, same error). `str(m)` puts each row on its own line with the numbers separated by one space.''',
    starter=r'''class Matrix:
    def __init__(self, rows):
        ...

    @classmethod
    def identity(cls, n):
        ...

    @property
    def rows(self):
        ...

    @property
    def shape(self):
        ...

    @property
    def T(self):
        ...

    def __getitem__(self, position):
        """m[r, c]"""
        ...

    def trace(self):
        ...

    # __add__, __sub__, __mul__, __rmul__, __matmul__, __pow__, __eq__, __hash__, __str__''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def kind_of(action):
    try:
        action()
    except Exception as error:
        return type(error).__name__
    return None
data = [[1, 2], [3, 4]]
m = Matrix(data)
assert m.rows == ((1, 2), (3, 4)) and m.shape == (2, 2) and m[1, 0] == 3 and m[0, 1] == 2
data[0][0] = 99
assert m[0, 0] == 1
assert Matrix([[1, 2, 3]]).shape == (1, 3) and Matrix([[1], [2]]).shape == (2, 1)
assert error_of(Matrix, []) == "ValueError: Matrix cannot be empty"
assert error_of(Matrix, [[]]) == "ValueError: Matrix cannot be empty"
assert error_of(Matrix, [[1, 2], [3]]) == "ValueError: Rows must have equal length"
assert m.T == Matrix([[1, 3], [2, 4]]) and Matrix([[1, 2, 3]]).T.shape == (3, 1) and m.T.T == m
assert Matrix.identity(2) == Matrix([[1, 0], [0, 1]]) and Matrix.identity(3).trace() == 3
assert error_of(Matrix.identity, 0) == "ValueError: Size must be positive"
assert error_of(Matrix.identity, 2.0) == "ValueError: Size must be positive"
assert error_of(Matrix.identity, True) == "ValueError: Size must be positive"
assert m + m == Matrix([[2, 4], [6, 8]]) and m - m == Matrix([[0, 0], [0, 0]])
assert m + Matrix([[1, 1], [1, 1]]) == Matrix([[2, 3], [4, 5]])
assert m - Matrix([[1, 1], [1, 1]]) == Matrix([[0, 1], [2, 3]])
assert error_of(lambda: m + Matrix([[1, 2, 3]])) == "ValueError: Shapes do not match"
assert error_of(lambda: m - Matrix([[1], [2]])) == "ValueError: Shapes do not match"
assert kind_of(lambda: m + 1) == "TypeError" and kind_of(lambda: m * m) == "TypeError" and kind_of(lambda: m * "a") == "TypeError"
assert m * 2 == Matrix([[2, 4], [6, 8]]) and 3 * m == Matrix([[3, 6], [9, 12]]) and m * 0.5 == Matrix([[0.5, 1.0], [1.5, 2.0]])
assert m @ Matrix([[0, 1], [1, 0]]) == Matrix([[2, 1], [4, 3]])
assert Matrix([[1, 2, 3]]) @ Matrix([[1], [2], [3]]) == Matrix([[14]])
assert Matrix([[1], [2]]) @ Matrix([[3, 4]]) == Matrix([[3, 4], [6, 8]])
assert (m @ Matrix.identity(2)) == m and (Matrix.identity(2) @ m) == m
assert error_of(lambda: m @ Matrix([[1, 2, 3]])) == "ValueError: Inner dimensions do not match"
assert kind_of(lambda: m @ 2) == "TypeError"
fib = Matrix([[1, 1], [1, 0]])
assert fib ** 0 == Matrix.identity(2) and fib ** 1 == fib and fib ** 2 == Matrix([[2, 1], [1, 1]])
assert (fib ** 10)[0, 1] == 55 and (fib ** 30)[0, 1] == 832040
assert error_of(lambda: Matrix([[1, 2, 3]]) ** 2) == "ValueError: Matrix must be square"
assert error_of(lambda: Matrix([[1, 2, 3]]).trace()) == "ValueError: Matrix must be square"
assert kind_of(lambda: m ** -1) == "TypeError" and kind_of(lambda: m ** 1.5) == "TypeError" and kind_of(lambda: m ** True) == "TypeError"
assert m.trace() == 5
assert str(m) == "1 2\n3 4" and str(Matrix([[1.5, 2]])) == "1.5 2"
assert m == Matrix([[1, 2], [3, 4]]) and m != Matrix([[1, 2], [3, 5]]) and m != Matrix([[1, 2, 3, 4]]) and m != [[1, 2], [3, 4]]
assert hash(m) == hash(Matrix([[1, 2], [3, 4]])) and len({m, Matrix([[1, 2], [3, 4]])}) == 1
assert kind_of(lambda: setattr(m, "x", 1)) == "AttributeError"
big = Matrix.identity(40)
assert (big ** 500).shape == (40, 40)''',
    solution=r'''class Matrix:
    __slots__ = ("_rows",)

    def __init__(self, rows):
        rows = [tuple(row) for row in rows]
        if not rows or not rows[0]:
            raise ValueError("Matrix cannot be empty")
        if any(len(row) != len(rows[0]) for row in rows):
            raise ValueError("Rows must have equal length")
        object.__setattr__(self, "_rows", tuple(rows))

    def __setattr__(self, name, value):
        raise AttributeError("Matrix is immutable")

    @classmethod
    def identity(cls, n):
        if type(n) is not int or n < 1:
            raise ValueError("Size must be positive")
        return cls([[1 if r == c else 0 for c in range(n)] for r in range(n)])

    @property
    def rows(self):
        return self._rows

    @property
    def shape(self):
        return (len(self._rows), len(self._rows[0]))

    @property
    def T(self):
        return Matrix(zip(*self._rows))

    def __getitem__(self, position):
        r, c = position
        return self._rows[r][c]

    def _require_square(self):
        if self.shape[0] != self.shape[1]:
            raise ValueError("Matrix must be square")

    def trace(self):
        self._require_square()
        return sum(self._rows[i][i] for i in range(len(self._rows)))

    def __add__(self, other):
        if not isinstance(other, Matrix):
            return NotImplemented
        if self.shape != other.shape:
            raise ValueError("Shapes do not match")
        return Matrix([[a + b for a, b in zip(r1, r2)] for r1, r2 in zip(self._rows, other._rows)])

    def __sub__(self, other):
        if not isinstance(other, Matrix):
            return NotImplemented
        if self.shape != other.shape:
            raise ValueError("Shapes do not match")
        return Matrix([[a - b for a, b in zip(r1, r2)] for r1, r2 in zip(self._rows, other._rows)])

    def __mul__(self, factor):
        if type(factor) not in (int, float):
            return NotImplemented
        return Matrix([[cell * factor for cell in row] for row in self._rows])

    __rmul__ = __mul__

    def __matmul__(self, other):
        if not isinstance(other, Matrix):
            return NotImplemented
        if self.shape[1] != other.shape[0]:
            raise ValueError("Inner dimensions do not match")
        columns = list(zip(*other._rows))
        return Matrix([[sum(a * b for a, b in zip(row, column)) for column in columns] for row in self._rows])

    def __pow__(self, exponent):
        if type(exponent) is not int or exponent < 0:
            return NotImplemented
        self._require_square()
        result = Matrix.identity(len(self._rows))
        base = self
        while exponent:
            if exponent & 1:
                result = result @ base
            base = base @ base
            exponent >>= 1
        return result

    def __eq__(self, other):
        if not isinstance(other, Matrix):
            return NotImplemented
        return self._rows == other._rows

    def __hash__(self):
        return hash(self._rows)

    def __str__(self):
        return "\n".join(" ".join(str(cell) for cell in row) for row in self._rows)

    def __repr__(self):
        return f"Matrix({[list(row) for row in self._rows]!r})"''',
    hints=[
        r'''Store the rows as a tuple of tuples, copied in the constructor. That alone gives you immutability of the data, a free `==` and a free `hash`.''',
        r'''For the product, each cell is a row of `a` dotted with a column of `b`. `zip(*b.rows)` gives you the columns, so a cell is `sum(x * y for x, y in zip(row, column))`.''',
        r'''A power does not need `k` multiplications: square the base and multiply it into the result whenever the lowest bit of `k` is set. The identity matrix is the starting result, which is also why `a ** 0` needs no special case.''',
    ],
    explanation=r'''**The idea.** A matrix is a value: the same cells mean the same matrix. Storing a tuple of tuples makes equality and hashing the tuple's own, and the constructor is the one place that checks the shape; every operator builds a new matrix through it.

**Shape errors are the contract.** Most matrix bugs are a silent wrong-shaped result. Raising a clear `ValueError` the moment shapes disagree is the whole value of wrapping a list of lists in a class.

**`*` versus `@`.** Python gives matrix product its own operator for a reason: `a * b` reads like cell-by-cell multiplication, which is a different thing. Refusing `*` between matrices (`NotImplemented`) removes the ambiguity.

**Fast powers.** Squaring and halving the exponent needs O(log k) multiplications. This is how Fibonacci's `F(10**18)` mod a number is computed: `[[1,1],[1,0]] ** n`.

**Complexity.** Product of an n by m and an m by p matrix is O(n*m*p). Power is O(n^3 log k).

**Going further.** Add `determinant()` (cofactor expansion for small sizes) and think about what `__eq__` should do with `1` and `1.0` cells.''',
),
]
