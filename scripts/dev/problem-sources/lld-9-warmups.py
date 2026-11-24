PROBLEMS = [
P(
    slug='lld-shopping-cart', title='Shopping Cart', topic='lld-oop-warmups', difficulty='beginner',
    module='lld/01-classes-objects-and-oop-building-blocks/README.md',
    description='Build a shopping cart that adds and removes products, rejects bad quantities and totals the order in cents.',
    statement=r'''Write a class `Cart` that holds products a shopper wants to buy. Money is whole **cents**.

**Creating one:** `Cart(prices)`, where `prices` maps a product code to its price in cents, e.g. `{"pen": 150, "book": 1200}`. The cart keeps **its own copy**: changing the dictionary afterwards must not change the cart.

**Methods and properties**

- `add(code, quantity=1)` puts `quantity` more of a product in the cart.
- `remove(code, quantity=None)` takes `quantity` of it out, or **all** of it when `quantity` is `None`. A product whose count reaches zero is no longer in the cart.
- `count(code)` is how many of a product are in the cart (`0` if none).
- `lines()` is a list of `(code, quantity, line_total)` tuples, **sorted by code**, one per product in the cart.
- `total` is the sum of all line totals.

**What is refused.** Raise `ValueError` with exactly this message and change nothing. Check in this order:

1. `add` or `remove` with a product that is not in `prices`: `"Unknown product"`
2. a `quantity` that is not an `int` or is below 1 (`True` is not a quantity): `"Quantity must be positive"`
3. `remove` of a product that is not in the cart: `"Not in cart"`
4. `remove` of more than the cart holds: `"Not enough in cart"`

**Example**

```
cart = Cart({"pen": 150, "book": 1200})
cart.add("pen", 3)
cart.add("book")
cart.lines()     # [("book", 1, 1200), ("pen", 3, 450)]
cart.total       # 1650
```''',
    starter=r'''class Cart:
    def __init__(self, prices):
        """Keep your own copy of `prices`."""
        ...

    def add(self, code, quantity=1):
        ...

    def remove(self, code, quantity=None):
        """Remove `quantity` (or everything when None)."""
        ...

    def count(self, code):
        ...

    def lines(self):
        """[(code, quantity, line_total), ...] sorted by code."""
        ...

    @property
    def total(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
prices = {"pen": 150, "book": 1200, "bag": 3000}
cart = Cart(prices)
assert cart.lines() == [] and cart.total == 0
cart.add("pen", 3)
cart.add("book")
cart.add("pen")
assert cart.count("pen") == 4 and cart.count("bag") == 0
assert cart.lines() == [("book", 1, 1200), ("pen", 4, 600)]
assert cart.total == 1800
prices["pen"] = 1
assert cart.total == 1800
assert error_of(cart.add, "ink") == "ValueError: Unknown product"
assert error_of(cart.remove, "ink") == "ValueError: Unknown product"
assert error_of(cart.add, "pen", 0) == "ValueError: Quantity must be positive"
assert error_of(cart.add, "pen", -2) == "ValueError: Quantity must be positive"
assert error_of(cart.add, "pen", 1.5) == "ValueError: Quantity must be positive"
assert error_of(cart.add, "pen", True) == "ValueError: Quantity must be positive"
assert error_of(cart.remove, "pen", 0) == "ValueError: Quantity must be positive"
assert error_of(cart.remove, "bag") == "ValueError: Not in cart"
assert error_of(cart.remove, "bag", 2) == "ValueError: Not in cart"
assert error_of(cart.remove, "pen", 5) == "ValueError: Not enough in cart"
assert cart.count("pen") == 4
cart.remove("pen", 3)
assert cart.lines() == [("book", 1, 1200), ("pen", 1, 150)]
cart.remove("pen", 1)
assert cart.lines() == [("book", 1, 1200)] and cart.count("pen") == 0
cart.add("bag", 2)
cart.remove("bag")
assert cart.lines() == [("book", 1, 1200)] and cart.total == 1200
assert error_of(Cart({"x": 5}).remove, "x") == "ValueError: Not in cart"
assert error_of(Cart({"x": 5}).add, "y", 0) == "ValueError: Unknown product"''',
    solution=r'''class Cart:
    def __init__(self, prices):
        self._prices = dict(prices)
        self._quantities = {}

    def _check_product(self, code):
        if code not in self._prices:
            raise ValueError("Unknown product")

    @staticmethod
    def _check_quantity(quantity):
        if type(quantity) is not int or quantity < 1:
            raise ValueError("Quantity must be positive")

    def add(self, code, quantity=1):
        self._check_product(code)
        self._check_quantity(quantity)
        self._quantities[code] = self._quantities.get(code, 0) + quantity

    def remove(self, code, quantity=None):
        self._check_product(code)
        if quantity is not None:
            self._check_quantity(quantity)
        if code not in self._quantities:
            raise ValueError("Not in cart")
        if quantity is None:
            quantity = self._quantities[code]
        if quantity > self._quantities[code]:
            raise ValueError("Not enough in cart")
        self._quantities[code] -= quantity
        if self._quantities[code] == 0:
            del self._quantities[code]

    def count(self, code):
        return self._quantities.get(code, 0)

    def lines(self):
        return [(code, qty, qty * self._prices[code]) for code, qty in sorted(self._quantities.items())]

    @property
    def total(self):
        return sum(line[2] for line in self.lines())''',
    hints=[
        r'''Two dictionaries: the prices (copied in `__init__`) and the quantities in the cart. A product leaves `lines()` when its quantity is gone, so delete the key instead of keeping a zero.''',
        r'''The order of checks is part of the contract: unknown product, then bad quantity, then not in cart, then not enough. Put each check in a small helper so `add` and `remove` share them.''',
        r'''`True` is an `int` in Python, so `isinstance(True, int)` is `True`. Use `type(quantity) is int` when a boolean must be refused.''',
    ],
    explanation=r'''**The idea.** A cart is a mapping from product to quantity plus a price list. Everything else (`lines`, `total`, `count`) is *derived* from those two, so there is nothing to keep in sync.

**Derived, not stored.** `total` is computed from the lines each time. Storing a running total would be faster, but it is one more number that every `add` and `remove` must remember to update. For a cart of a few lines the sum is free; keep the single source of truth.

**Own your data.** `dict(prices)` is the difference between a cart and a view onto somebody else's dictionary. A caller who changes a price later must not silently change what is already in the cart.

**Order of checks.** When several things are wrong at once, the caller should always see the same error. Fixing the order in the statement is what makes the tests (and real clients) predictable.

**Complexity.** `add`, `remove`, `count` are O(1); `lines` and `total` are O(n log n) and O(n) in the number of distinct products.

**Going further.** Real prices change. A cart that stores the price *at the time of adding* is a different design from one that looks it up at checkout. Which would you choose, and why?''',
),

P(
    slug='lld-time-interval', title='Time Interval', topic='lld-oop-warmups', difficulty='intermediate',
    module='lld/03-generics-exceptions-and-value-objects/README.md',
    description='Build an immutable half-open Interval that knows when it overlaps, touches, merges and intersects, and merge a whole list of them.',
    statement=r'''Write a class `Interval` for the half-open range `[start, end)` of numbers: it **contains** `start` but **not** `end`. It is a value object.

**Creating one:** `Interval(start, end)`. `start` must be less than `end`: otherwise `ValueError("Start must be before end")`. Read them as `.start` and `.end`; `.length` is `end - start`. Assigning to an attribute raises `AttributeError`.

**Value behaviour**

- Two intervals are equal when `start` and `end` are equal; equal intervals have the same hash (so they work in sets and as dictionary keys). Comparing with a non-`Interval` is `False`.
- `<` orders by `start`, then by `end`, so `sorted(...)` works.
- `repr(Interval(1, 5))` is `"Interval(1, 5)"`.

**Methods**

- `contains(point)` is `True` when `start <= point < end`.
- `overlaps(other)` is `True` when they share at least one point. `[1, 3)` and `[3, 5)` only **touch**, so they do **not** overlap.
- `intersection(other)` is the shared `Interval`, or `None` when they do not overlap.
- `merge(other)` is the single interval that covers both, allowed when they overlap **or touch**: otherwise `ValueError("Intervals do not touch")`.
- `Interval.merge_all(intervals)` takes any iterable and returns a **sorted** list of the fewest intervals that cover the same points (overlapping and touching ones are merged). It must not change its input.

**Example**

```
Interval(1, 3).overlaps(Interval(3, 5))     # False: they only touch
Interval(1, 3).merge(Interval(3, 5))        # Interval(1, 5)
Interval.merge_all([Interval(5, 8), Interval(1, 3), Interval(2, 4)])
                                            # [Interval(1, 4), Interval(5, 8)]
```''',
    starter=r'''class Interval:
    def __init__(self, start, end):
        ...

    @property
    def length(self):
        ...

    def contains(self, point):
        ...

    def overlaps(self, other):
        ...

    def intersection(self, other):
        ...

    def merge(self, other):
        ...

    @classmethod
    def merge_all(cls, intervals):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
a = Interval(1, 5)
assert (a.start, a.end, a.length) == (1, 5, 4)
assert repr(a) == "Interval(1, 5)"
assert error_of(Interval, 3, 3) == "ValueError: Start must be before end"
assert error_of(Interval, 5, 1) == "ValueError: Start must be before end"
try:
    a.start = 0
    frozen = False
except AttributeError:
    frozen = True
assert frozen and a.start == 1
assert a == Interval(1, 5) and a != Interval(1, 6) and a != (1, 5)
assert len({Interval(1, 5), Interval(1, 5), Interval(2, 3)}) == 2
assert Interval(1, 9) < Interval(2, 3) and Interval(1, 2) < Interval(1, 3)
assert sorted([Interval(2, 3), Interval(1, 9), Interval(1, 2)]) == [Interval(1, 2), Interval(1, 9), Interval(2, 3)]
assert a.contains(1) and a.contains(4.5) and not a.contains(5) and not a.contains(0)
assert Interval(1, 3).overlaps(Interval(2, 4)) and Interval(2, 4).overlaps(Interval(1, 3))
assert not Interval(1, 3).overlaps(Interval(3, 5)) and not Interval(3, 5).overlaps(Interval(1, 3))
assert Interval(1, 10).overlaps(Interval(4, 5)) and Interval(4, 5).overlaps(Interval(1, 10))
assert not Interval(1, 2).overlaps(Interval(8, 9))
assert Interval(1, 5).intersection(Interval(3, 9)) == Interval(3, 5)
assert Interval(1, 10).intersection(Interval(4, 5)) == Interval(4, 5)
assert Interval(1, 3).intersection(Interval(3, 5)) is None
assert Interval(1, 3).merge(Interval(2, 6)) == Interval(1, 6)
assert Interval(1, 3).merge(Interval(3, 5)) == Interval(1, 5)
assert Interval(3, 5).merge(Interval(1, 3)) == Interval(1, 5)
assert Interval(1, 10).merge(Interval(4, 5)) == Interval(1, 10)
assert error_of(Interval(1, 3).merge, Interval(4, 5)) == "ValueError: Intervals do not touch"
source = [Interval(5, 8), Interval(1, 3), Interval(2, 4), Interval(8, 9), Interval(20, 30)]
before = list(source)
assert Interval.merge_all(source) == [Interval(1, 4), Interval(5, 9), Interval(20, 30)]
assert source == before
assert Interval.merge_all([]) == []
assert Interval.merge_all(iter([Interval(1, 2), Interval(1, 2)])) == [Interval(1, 2)]
assert Interval.merge_all([Interval(0, 100), Interval(10, 20), Interval(30, 40)]) == [Interval(0, 100)]
assert Interval(0.5, 1.5).length == 1.0''',
    solution=r'''class Interval:
    __slots__ = ("_start", "_end")

    def __init__(self, start, end):
        if not start < end:
            raise ValueError("Start must be before end")
        object.__setattr__(self, "_start", start)
        object.__setattr__(self, "_end", end)

    def __setattr__(self, name, value):
        raise AttributeError("Interval is immutable")

    def __delattr__(self, name):
        raise AttributeError("Interval is immutable")

    @property
    def start(self):
        return self._start

    @property
    def end(self):
        return self._end

    @property
    def length(self):
        return self._end - self._start

    def __eq__(self, other):
        if not isinstance(other, Interval):
            return False
        return (self._start, self._end) == (other._start, other._end)

    def __hash__(self):
        return hash((self._start, self._end))

    def __lt__(self, other):
        return (self._start, self._end) < (other._start, other._end)

    def __repr__(self):
        return f"Interval({self._start}, {self._end})"

    def contains(self, point):
        return self._start <= point < self._end

    def overlaps(self, other):
        return self._start < other._end and other._start < self._end

    def intersection(self, other):
        if not self.overlaps(other):
            return None
        return Interval(max(self._start, other._start), min(self._end, other._end))

    def merge(self, other):
        if self._start > other._end or other._start > self._end:
            raise ValueError("Intervals do not touch")
        return Interval(min(self._start, other._start), max(self._end, other._end))

    @classmethod
    def merge_all(cls, intervals):
        merged = []
        for interval in sorted(intervals):
            if merged and interval._start <= merged[-1]._end:
                merged[-1] = merged[-1].merge(interval)
            else:
                merged.append(interval)
        return merged''',
    hints=[
        r'''Store `start` and `end` privately and expose them with read-only properties; block `__setattr__` so the object really is immutable. Define `__eq__` and `__hash__` from the same pair of numbers.''',
        r'''Half-open means `[1, 3)` and `[3, 5)` share no point: they overlap only if `a.start < b.end and b.start < a.end` (strict). They *touch* when `a.start <= b.end and b.start <= a.end`.''',
        r'''`merge_all`: sort first, then walk once, comparing each interval with the **last merged one**. Sorting a copy (`sorted(...)`) leaves the caller's list alone; sorting in place would not.''',
    ],
    explanation=r'''**The idea.** An interval is a classic value object: small, immutable, equal by content. Everything interesting is in getting the boundary right, and half-open ranges make that boundary clean: `[1, 3)` followed by `[3, 5)` leave no gap and no shared point.

**Overlap versus touch.** These two questions differ by one character, and mixing them up is the usual bug:

- *overlap*: `a.start < b.end and b.start < a.end` (strict, a point is shared)
- *touch or overlap* (what `merge` needs): `a.start <= b.end and b.start <= a.end`

**Sorting makes merging linear.** After sorting by start, an interval can only join the **last** merged one: anything earlier ends before it begins. That turns a nested loop into one pass, O(n log n) overall for the sort.

```mermaid
flowchart TD
    A[sort the intervals] --> B{overlaps or touches the last merged one?}
    B -- yes --> C[replace the last with the merge]
    B -- no --> D[append as a new interval]
    C --> E[next interval]
    D --> E
```

**Immutability.** Blocking `__setattr__` is what lets you put intervals in a set or use them as keys safely. If they could change, their hash would change while they sat in a bucket.

**Going further.** Add `subtract(other)` (which may return zero, one or two intervals) and see how much of `merge_all` you can reuse for a calendar's free-time search.''',
),

P(
    slug='lld-gradebook', title='Weighted Gradebook', topic='lld-oop-warmups', difficulty='intermediate',
    module='lld/01-classes-objects-and-oop-building-blocks/README.md',
    description='Build a gradebook with weighted categories, pooled category averages, letter grades and a ranking.',
    statement=r'''Write a class `Gradebook` for one course.

**Creating one:** `Gradebook(weights)`, where `weights` maps a category name to its weight in percent, e.g. `{"homework": 30, "exam": 70}`. The weights must add up to exactly `100`: otherwise `ValueError("Weights must add up to 100")`. The gradebook keeps its own copy.

**Methods**

- `add_score(student, category, points, out_of)` records one score. Raise `ValueError` and record nothing:
  1. unknown category: `"Unknown category"`
  2. `out_of` not above 0, or `points` below 0 or above `out_of`: `"Bad score"`
- `average(student, category)` is the **pooled** percentage: the student's total points in that category divided by the total `out_of`, times 100. (A 10/10 and a 0/90 make 10%, not 50%.) It is `None` when the student has no score in the category.
- `final(student)` is the weighted mean of the category averages, **rounded to 2 decimals**. Only categories the student has scores in count, and their weights are **rescaled** to add up to 100. It is `None` when the student has no scores at all.
- `letter(student)`: `"A"` for a final of 90 or more, `"B"` 80, `"C"` 70, `"D"` 60, otherwise `"F"`. `None` when there is no final. Use the **rounded** final.
- `ranking()` is a list of `(student, final)` for every student with scores, **best first**; ties are broken by the name in alphabetical order.

**Example**

```
book = Gradebook({"homework": 30, "exam": 70})
book.add_score("ann", "homework", 8, 10)
book.add_score("ann", "exam", 45, 50)
book.final("ann")          # 0.3 * 80 + 0.7 * 90 = 87.0
book.letter("ann")         # "B"
```''',
    starter=r'''class Gradebook:
    def __init__(self, weights):
        ...

    def add_score(self, student, category, points, out_of):
        ...

    def average(self, student, category):
        ...

    def final(self, student):
        ...

    def letter(self, student):
        ...

    def ranking(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
assert error_of(Gradebook, {"a": 50, "b": 40}) == "ValueError: Weights must add up to 100"
assert error_of(Gradebook, {"a": 60, "b": 60}) == "ValueError: Weights must add up to 100"
weights = {"homework": 30, "exam": 70}
book = Gradebook(weights)
weights["exam"] = 10
assert book.final("nobody") is None and book.letter("nobody") is None and book.ranking() == []
assert error_of(book.add_score, "ann", "quiz", 1, 2) == "ValueError: Unknown category"
assert error_of(book.add_score, "ann", "exam", 1, 0) == "ValueError: Bad score"
assert error_of(book.add_score, "ann", "exam", -1, 10) == "ValueError: Bad score"
assert error_of(book.add_score, "ann", "exam", 11, 10) == "ValueError: Bad score"
assert book.final("ann") is None
book.add_score("ann", "homework", 8, 10)
assert book.average("ann", "homework") == 80 and book.average("ann", "exam") is None
assert book.final("ann") == 80.0 and book.letter("ann") == "B"
book.add_score("ann", "exam", 45, 50)
assert book.final("ann") == 87.0 and book.letter("ann") == "B"
book.add_score("bob", "homework", 10, 10)
book.add_score("bob", "homework", 0, 90)
assert book.average("bob", "homework") == 10
assert book.final("bob") == 10.0 and book.letter("bob") == "F"
book.add_score("cy", "exam", 90, 100)
book.add_score("cy", "homework", 90, 100)
assert book.final("cy") == 90.0 and book.letter("cy") == "A"
book.add_score("di", "exam", 69.5, 100)
assert book.letter("di") == "D" and book.final("di") == 69.5
book.add_score("ed", "exam", 89.996, 100)
assert book.final("ed") == 90.0 and book.letter("ed") == "A"
book.add_score("abe", "exam", 90, 100)
book.add_score("flo", "homework", 87, 100)
book.add_score("flo", "exam", 87, 100)
assert book.final("flo") == 87.0
assert book.ranking() == [("abe", 90.0), ("cy", 90.0), ("ed", 90.0), ("ann", 87.0), ("flo", 87.0), ("di", 69.5), ("bob", 10.0)]''',
    solution=r'''class Gradebook:
    def __init__(self, weights):
        if sum(weights.values()) != 100:
            raise ValueError("Weights must add up to 100")
        self._weights = dict(weights)
        self._scores = {}

    def add_score(self, student, category, points, out_of):
        if category not in self._weights:
            raise ValueError("Unknown category")
        if out_of <= 0 or points < 0 or points > out_of:
            raise ValueError("Bad score")
        self._scores.setdefault(student, {}).setdefault(category, []).append((points, out_of))

    def average(self, student, category):
        entries = self._scores.get(student, {}).get(category)
        if not entries:
            return None
        return sum(p for p, _ in entries) / sum(o for _, o in entries) * 100

    def final(self, student):
        present = {c: self.average(student, c) for c in self._weights if self.average(student, c) is not None}
        if not present:
            return None
        total_weight = sum(self._weights[c] for c in present)
        return round(sum(self._weights[c] * avg for c, avg in present.items()) / total_weight, 2)

    def letter(self, student):
        grade = self.final(student)
        if grade is None:
            return None
        for cutoff, letter in ((90, "A"), (80, "B"), (70, "C"), (60, "D")):
            if grade >= cutoff:
                return letter
        return "F"

    def ranking(self):
        rows = [(student, self.final(student)) for student in self._scores]
        return sorted(rows, key=lambda row: (-row[1], row[0]))''',
    hints=[
        r'''Store every score as `(points, out_of)` under student then category. The pooled average is `sum(points) / sum(out_of) * 100`: add first, divide once.''',
        r'''For `final`, take only the categories that have an average, add up *their* weights, and divide the weighted sum by that total. That is the "rescale to 100" rule.''',
        r'''Round once, in `final`, and let `letter` and `ranking` use that rounded value. Sort the ranking with a key of `(-final, name)` so ties fall back to the name.''',
    ],
    explanation=r'''**The idea.** The gradebook stores raw facts (each score with its maximum) and computes everything else on demand. Averages, finals and letters are views over the scores, so they can never be stale.

**Pooled, not averaged.** The difference between "average of percentages" and "total points over total possible" is the point of the 10/10 plus 0/90 example: the second is how most courses really work, and it is the one a test can tell apart.

**Rescaled weights.** A student with only homework scores has no exam yet. Counting the missing exam as zero would punish them for something that has not happened; dropping its weight and dividing by the weights that remain gives a fair running grade.

**Rounding once.** Rounding at every step makes small errors that add up and, worse, can make `final`, `letter` and `ranking` disagree. Round at one place and let the rest read that value.

**Complexity.** `final` is O(categories x scores); `ranking` is O(s log s) for `s` students.

**Going further.** Drop the lowest homework score, or add extra credit. Which methods would change, and which would stay the same?''',
),

P(
    slug='lld-polynomial', title='Polynomial with Operators', topic='lld-oop-warmups', difficulty='intermediate',
    module='lld/03-generics-exceptions-and-value-objects/README.md',
    description='Build an immutable Polynomial that supports +, -, *, calling it like a function, equality and a readable text form.',
    statement=r'''Write a class `Polynomial` for a polynomial with whole-number coefficients.

**Creating one:** `Polynomial(coefficients)`, given **lowest power first**: `Polynomial([-1, 0, 3])` is `3x^2 - 1`. Trailing zeros (the highest powers) are dropped, so `Polynomial([1, 2, 0, 0])` equals `Polynomial([1, 2])`. The zero polynomial has no coefficients at all. It is **immutable** (assigning to an attribute raises `AttributeError`) and it must not keep a reference to the list it was given.

**Reading it**

- `coefficients` is a tuple, lowest power first, with no trailing zeros (`()` for the zero polynomial).
- `degree` is the highest power, and `-1` for the zero polynomial.

**Operators**

- `p + q`, `p - q`, `-p`.
- `p * q` multiplies two polynomials; `p * 3` and `3 * p` multiply every coefficient by an `int`.
- `p + 1` and `1 + p` add an `int` as a constant.
- `p(x)` evaluates the polynomial at `x`.
- Equal polynomials are `==` and have the same hash; comparing with a non-polynomial is `False`.
- `p.derivative()` is the derivative as a new polynomial.

**Text form.** `str(p)` lists terms from the highest power to the lowest, skipping zero terms, joined with `" + "` and `" - "`. A coefficient of `1` or `-1` is written without the number (`x`, `-x`) except for the constant term; the power `1` is written `x`, not `x^1`. The zero polynomial is `"0"`.

```
str(Polynomial([-1, 0, 3]))     # "3x^2 - 1"
str(Polynomial([0, -1, 1]))     # "x^2 - x"
str(Polynomial([5]))            # "5"
str(Polynomial([1, 1]))         # "x + 1"
```''',
    starter=r'''class Polynomial:
    def __init__(self, coefficients):
        """Lowest power first; drop trailing zeros; keep your own copy."""
        ...

    @property
    def coefficients(self):
        ...

    @property
    def degree(self):
        ...

    def derivative(self):
        ...''',
    tests=r'''p = Polynomial([-1, 0, 3])
assert p.coefficients == (-1, 0, 3) and p.degree == 2
assert Polynomial([1, 2, 0, 0]).coefficients == (1, 2)
assert Polynomial([0, 0]).coefficients == () and Polynomial([]).degree == -1
source = [1, 2]
q = Polynomial(source)
source.append(9)
assert q.coefficients == (1, 2)
try:
    q.coefficients = (5,)
    frozen = False
except AttributeError:
    frozen = True
assert frozen
assert Polynomial([1, 2]) == Polynomial([1, 2, 0]) and Polynomial([1, 2]) != Polynomial([2, 1]) and Polynomial([5]) != 5
assert len({Polynomial([1, 2]), Polynomial([1, 2, 0]), Polynomial([3])}) == 2
assert (Polynomial([1, 2]) + Polynomial([3, 0, 4])).coefficients == (4, 2, 4)
assert (Polynomial([1, 2]) + 1).coefficients == (2, 2) and (1 + Polynomial([1, 2])).coefficients == (2, 2)
assert (Polynomial([1, 2]) - Polynomial([1, 2])).coefficients == ()
assert (Polynomial([1, 2]) - Polynomial([0, 0, 5])).coefficients == (1, 2, -5)
assert (-Polynomial([1, -2])).coefficients == (-1, 2)
assert (Polynomial([1, 1]) * Polynomial([1, 1])).coefficients == (1, 2, 1)
assert (Polynomial([1, 1]) * Polynomial([-1, 1])).coefficients == (-1, 0, 1)
assert (Polynomial([1, 2, 3]) * 2).coefficients == (2, 4, 6) and (2 * Polynomial([1, 2, 3])).coefficients == (2, 4, 6)
assert (Polynomial([1, 2, 3]) * 0).coefficients == ()
assert (Polynomial([1, 1]) * Polynomial([])).coefficients == ()
assert p(2) == 11 and p(0) == -1 and p(-1) == 2 and Polynomial([])(7) == 0
assert Polynomial([1, 2, 3]).derivative().coefficients == (2, 6)
assert Polynomial([7]).derivative().coefficients == () and Polynomial([]).derivative() == Polynomial([])
assert str(Polynomial([-1, 0, 3])) == "3x^2 - 1"
assert str(Polynomial([0, -1, 1])) == "x^2 - x"
assert str(Polynomial([5])) == "5" and str(Polynomial([-5])) == "-5"
assert str(Polynomial([1, 1])) == "x + 1"
assert str(Polynomial([])) == "0"
assert str(Polynomial([0, 0, 0, -1])) == "-x^3"
assert str(Polynomial([2, -3, 0, 4])) == "4x^3 - 3x + 2"
assert str(Polynomial([0, 2])) == "2x"''',
    solution=r'''class Polynomial:
    __slots__ = ("_coefficients",)

    def __init__(self, coefficients):
        values = list(coefficients)
        while values and values[-1] == 0:
            values.pop()
        object.__setattr__(self, "_coefficients", tuple(values))

    def __setattr__(self, name, value):
        raise AttributeError("Polynomial is immutable")

    @property
    def coefficients(self):
        return self._coefficients

    @property
    def degree(self):
        return len(self._coefficients) - 1

    def __eq__(self, other):
        return isinstance(other, Polynomial) and self._coefficients == other._coefficients

    def __hash__(self):
        return hash(self._coefficients)

    def __neg__(self):
        return Polynomial(-c for c in self._coefficients)

    def __add__(self, other):
        if isinstance(other, int):
            other = Polynomial([other])
        if not isinstance(other, Polynomial):
            return NotImplemented
        size = max(len(self._coefficients), len(other._coefficients))
        a = self._coefficients + (0,) * (size - len(self._coefficients))
        b = other._coefficients + (0,) * (size - len(other._coefficients))
        return Polynomial(x + y for x, y in zip(a, b))

    __radd__ = __add__

    def __sub__(self, other):
        if isinstance(other, int):
            other = Polynomial([other])
        if not isinstance(other, Polynomial):
            return NotImplemented
        return self + (-other)

    def __mul__(self, other):
        if isinstance(other, int):
            return Polynomial(c * other for c in self._coefficients)
        if not isinstance(other, Polynomial):
            return NotImplemented
        if not self._coefficients or not other._coefficients:
            return Polynomial([])
        result = [0] * (len(self._coefficients) + len(other._coefficients) - 1)
        for i, a in enumerate(self._coefficients):
            for j, b in enumerate(other._coefficients):
                result[i + j] += a * b
        return Polynomial(result)

    __rmul__ = __mul__

    def __call__(self, x):
        value = 0
        for c in reversed(self._coefficients):
            value = value * x + c
        return value

    def derivative(self):
        return Polynomial(i * c for i, c in enumerate(self._coefficients) if i > 0)

    def __str__(self):
        if not self._coefficients:
            return "0"
        text = ""
        for power in range(len(self._coefficients) - 1, -1, -1):
            c = self._coefficients[power]
            if c == 0:
                continue
            body = "" if power == 0 else "x" if power == 1 else f"x^{power}"
            if power == 0 or abs(c) != 1:
                body = str(abs(c)) + body
            if not text:
                text = ("-" if c < 0 else "") + body
            else:
                text += (" - " if c < 0 else " + ") + body
        return text''',
    hints=[
        r'''Normalise in `__init__`: copy into a list, pop trailing zeros, and store a tuple. Then equality and hashing are just equality and hashing of that tuple.''',
        r'''Return `NotImplemented` (not an exception) from `__add__` and `__mul__` when the other side is a type you do not know; Python then tries the reflected method. `__radd__ = __add__` is enough for `1 + p`.''',
        r'''Evaluate with Horner's rule (`value = value * x + c` from the highest power down). For the text, build each term from the highest power down, and handle the sign separately from the magnitude.''',
    ],
    explanation=r'''**The idea.** Python lets your class behave like a built-in number: `+`, `*`, `-`, `==`, calling, `str`. Each operator is a method (`__add__`, `__mul__`, `__neg__`, `__call__`, `__str__`) that Python looks up for you. The skill is making them agree.

**One canonical form.** Trailing zeros are removed once, in `__init__`. After that `Polynomial([1, 2, 0])` and `Polynomial([1, 2])` are literally the same data, so equality, hashing, `degree` and `str` all work without special cases. Normalise on the way in and everything downstream gets simpler.

**Reflected operators.** `2 * p` first asks `int.__mul__(2, p)`, which answers `NotImplemented`; Python then calls `p.__rmul__(2)`. Returning `NotImplemented` instead of raising is what allows that hand-off.

**Horner's rule.** `3x^2 + 0x - 1` at `x` is `(3x + 0)x - 1`: one multiplication and one addition per coefficient, no powers.

**Complexity.** Addition and evaluation are O(n); multiplication is O(n x m).

**Going further.** Add `__divmod__` by a degree-1 polynomial, or `compose(other)` so that `p.compose(q)(x) == p(q(x))`.''',
),

P(
    slug='lld-music-player', title='Playlist Player', topic='lld-oop-warmups', difficulty='intermediate',
    module='lld/01-classes-objects-and-oop-building-blocks/README.md',
    description='Build a music player with next, previous, three repeat modes and non-destructive iteration over what is left to play.',
    statement=r'''Write a class `Player` that plays a list of songs (strings) in order.

**Creating one:** `Player(songs, repeat="off")`. It keeps **its own copy** of the list. `repeat` is `"off"`, `"all"` or `"one"`; anything else raises `ValueError("Bad repeat mode")`. When there are songs, the first one is the current song.

**Reading**

- `current` is the song now playing, or `None` when the playlist is empty or has **ended**.
- `repeat` can be read and **assigned** (the same validation applies).

**Moving.** Both return the new `current`.

- `next()`:
  - `"one"`: stays on the same song.
  - `"all"`: goes to the next song, wrapping from the last to the first.
  - `"off"`: goes to the next song; after the last one the player has **ended** (`current` is `None`) and `next()` keeps returning `None`.
  - an empty playlist always returns `None`.
- `previous()` goes to the song before the current one. At the first song it **wraps to the last** in `"all"` mode and otherwise **stays** on the first. From the ended state it goes to the **last** song (in any mode).

**Queue.**

- `enqueue(song)` adds a song at the **end** of the playlist. If the player had ended, the new song becomes current again; the current song never changes otherwise.
- `play_next(song)` inserts a song **right after the current one**. If the playlist is empty or has ended there is no current song, so the new song is added at the end and becomes current.

**Looking ahead.** `iter(player)` yields the songs from the current one to the end, **without moving the player**; every call gives a fresh, independent iterator. (It does not wrap, whatever the repeat mode.)

**Example**

```
p = Player(["a", "b", "c"])
p.next(), p.next(), p.next(), p.next()    # "b", "c", None, None
p.previous()                              # "c"
list(p)                                   # ["c"]
```''',
    starter=r'''class Player:
    def __init__(self, songs, repeat="off"):
        ...

    @property
    def current(self):
        ...

    def next(self):
        ...

    def previous(self):
        ...

    def enqueue(self, song):
        ...

    def play_next(self, song):
        ...

    def __iter__(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
assert error_of(Player, ["a"], "loop") == "ValueError: Bad repeat mode"
songs = ["a", "b", "c"]
p = Player(songs)
songs.append("z")
assert p.current == "a" and list(p) == ["a", "b", "c"]
assert (p.next(), p.next()) == ("b", "c")
assert list(p) == ["c"] and list(p) == ["c"] and p.current == "c"
assert p.next() is None and p.current is None and p.next() is None
assert list(p) == []
assert p.previous() == "c" and p.previous() == "b" and p.previous() == "a" and p.previous() == "a"
q = Player(["a", "b", "c"], repeat="all")
assert q.previous() == "c" and q.next() == "a" and q.next() == "b" and q.next() == "c" and q.next() == "a"
assert list(q) == ["a", "b", "c"]
r = Player(["a", "b"], repeat="one")
assert r.next() == "a" and r.next() == "a" and r.previous() == "a"
r.repeat = "off"
assert r.next() == "b" and r.next() is None
assert error_of(setattr, r, "repeat", "x") == "ValueError: Bad repeat mode"
assert r.repeat == "off"
e = Player([])
assert e.current is None and e.next() is None and e.previous() is None and list(e) == []
e.enqueue("x")
assert e.current == "x" and list(e) == ["x"]
s = Player(["a", "b"])
s.enqueue("c")
assert list(s) == ["a", "b", "c"]
s.play_next("n")
assert list(s) == ["a", "n", "b", "c"] and s.current == "a"
s.next()
s.next()
assert s.current == "b"
s.play_next("m")
assert list(s) == ["b", "m", "c"]
while s.next() is not None:
    pass
assert s.current is None
s.next()
s.next()
s.enqueue("d")
assert s.current == "d" and list(s) == ["d"]
t = Player(["a", "b"])
first, second = iter(t), iter(t)
assert next(first) == "a" and next(first) == "b" and next(second) == "a"
u = Player(["a"])
u.next()
u.play_next("z")
assert u.current == "z" and list(u) == ["z"]''',
    solution=r'''class Player:
    _MODES = ("off", "all", "one")

    def __init__(self, songs, repeat="off"):
        self._songs = list(songs)
        self._check(repeat)
        self._repeat = repeat
        self._index = 0

    @classmethod
    def _check(cls, mode):
        if mode not in cls._MODES:
            raise ValueError("Bad repeat mode")

    @property
    def repeat(self):
        return self._repeat

    @repeat.setter
    def repeat(self, mode):
        self._check(mode)
        self._repeat = mode

    @property
    def current(self):
        if 0 <= self._index < len(self._songs):
            return self._songs[self._index]
        return None

    def next(self):
        if not self._songs or self._index >= len(self._songs):
            return None
        if self._repeat == "one":
            return self.current
        self._index += 1
        if self._index >= len(self._songs) and self._repeat == "all":
            self._index = 0
        return self.current

    def previous(self):
        if not self._songs:
            return None
        if self._index >= len(self._songs):
            self._index = len(self._songs) - 1
        elif self._index > 0:
            self._index -= 1
        elif self._repeat == "all":
            self._index = len(self._songs) - 1
        return self.current

    def enqueue(self, song):
        self._songs.append(song)

    def play_next(self, song):
        if self._index >= len(self._songs):
            self._songs.append(song)
        else:
            self._songs.insert(self._index + 1, song)

    def __iter__(self):
        return iter(self._songs[self._index:])''',
    hints=[
        r'''Keep a list and an index. "Ended" is simply `index == len(songs)`; `current` is `None` whenever the index is outside the list.''',
        r'''When the player has ended, the cursor already points one past the last song, which is exactly where an appended song lands, so `enqueue` and `play_next` need no special case for it. `__iter__` can return `iter(self._songs[self._index:])`: a slice is a copy, so each call is independent and the player never moves.''',
        r'''Write the three `next()` modes as separate, small branches, then do the same for `previous()` (first song wraps only in "all"). Most bugs come from the ended state: test it explicitly.''',
    ],
    explanation=r'''**The idea.** A player is a list plus a cursor. All the behaviour is in how the cursor moves at the edges, and the edges are where the three repeat modes differ.

```mermaid
stateDiagram-v2
    [*] --> playing
    playing --> playing: next / previous
    playing --> ended: next past the last song (off)
    ended --> playing: previous / enqueue / play_next
```

**A state worth naming.** "Ended" is not a separate flag: it is the cursor pointing one past the last song. Encoding it in the existing index avoids a second variable that could disagree with it.

**Why `__iter__` returns a fresh iterator.** If `Player` were its own iterator (`__next__` plus `return self`), two `for` loops over the same player would fight over one cursor. Returning `iter(copy)` gives every loop its own position, and looking ahead does not play anything.

**Complexity.** `next` and `previous` are O(1); `__iter__` copies the rest of the list, O(n).

**Going further.** Add shuffle by giving the player an injected `random.Random` so tests can seed it; how would shuffle interact with `previous()`?''',
),
]
