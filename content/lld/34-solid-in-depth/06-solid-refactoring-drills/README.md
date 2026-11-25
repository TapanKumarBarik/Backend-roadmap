# 06 · SOLID Refactoring Drills

> **Prerequisites:** lessons [01](../01-single-responsibility-principle/README.md) to [05](../05-dependency-inversion-principle/README.md) of this track.  
> **Reading time:** ~45 minutes  
> **Audience:** developers who know the five principles by name and need practice telling which one a piece of code breaks, and fixing it without changing what the code does

> [!NOTE]
> **In one line:** Reading about SOLID teaches the words. **Refactoring** one messy class, step by step, with a check after each step, teaches the skill.

> [!TIP]
> **Golden rule:** Change the structure, never the behaviour. Run the same check before and after every step. If the output changes, you did not refactor, you edited.

> [!TIP]
> **Try it:** Take the five quizzes, [SRP](/practice/quiz/srp-single-responsibility/), [OCP](/practice/quiz/ocp-open-closed/), [LSP](/practice/quiz/lsp-liskov-substitution/), [ISP](/practice/quiz/isp-interface-segregation/) and [DIP](/practice/quiz/dip-dependency-inversion/), then the longer [SOLID design principles](/practice/quiz/solid-design-principles/) quiz.

---

## 1. Roadmap

| Step | What you do | Section |
| :--- | :--- | :--- |
| 1 | Learn to diagnose: which principle is this? | 2 |
| 2 | Run the messy class and record its behaviour | 3 |
| 3 | Refactor in five small steps | 4 |
| 4 | Check that nothing changed | 5 |
| 5 | Drills with answers | 6 |
| 6 | Interview practice | 7 |

---

## 2. Diagnose first: the symptom table

Before fixing, name the problem. Most smells point at one principle:

| What you see | Likely principle |
| :--- | :--- |
| A class edited by several teams, many unrelated imports | **S**RP |
| An `if/elif` chain over a type, copied in many places | **O**CP |
| `isinstance` checks on a parent type, overrides that raise `NotImplementedError` | **L**SP |
| Implementing classes with empty methods, fakes with many stubs | **I**SP |
| `new ConcreteClass()` or `datetime.now()` inside business code | **D**IP |

A single class often breaks several at once. Fix them in the order that reduces risk: **SRP first** (split the jobs), then **DIP** (make each job replaceable), then **OCP** (open the variation), keeping **LSP** and **ISP** in mind whenever you introduce an interface.

---

## 3. The messy class, and its recorded behaviour

An order processor that does everything:

```python
class OrderProcessor:
    def __init__(self):
        self.sent = []

    def process(self, order):
        # validation
        if not order["items"]:
            raise ValueError("empty order")
        # pricing
        subtotal = sum(q * p for q, p in order["items"])
        if order["customer"] == "gold":
            subtotal *= 0.90
        elif order["customer"] == "silver":
            subtotal *= 0.95
        # payment
        if order["payment"] == "card":
            fee = subtotal * 0.02
        elif order["payment"] == "cash":
            fee = 0
        else:
            raise ValueError("unknown payment")
        total = round(subtotal + fee, 2)
        # notification
        self.sent.append(f"email: order total {total}")
        return total


def record(factory):
    cases = [
        {"items": [(2, 10.0), (1, 5.0)], "customer": "gold", "payment": "card"},
        {"items": [(1, 100.0)], "customer": "silver", "payment": "cash"},
        {"items": [(3, 9.99)], "customer": "regular", "payment": "card"},
    ]
    out = []
    for c in cases:
        p = factory()
        out.append(p.process(c))
    return out


print(record(OrderProcessor))
```

Output:

```text
[22.95, 95.0, 30.57]
```

This list is our **safety net**. Every refactoring step must print exactly the same numbers.

**Diagnose it:**

| Line | Problem | Principle |
| :--- | :--- | :--- |
| Validation, pricing, payment and notification in one method | Four reasons to change | SRP |
| `if customer == ...` and `if payment == ...` | A new tier or method edits the method | OCP |
| `self.sent.append("email...")` | A hard-coded notification channel | DIP |

---

## 4. Refactor in five small steps

### Step 1: SRP, split the jobs

Each concern becomes a small class, and `process` becomes the workflow:

```python
class Validator:
    def check(self, order):
        if not order["items"]:
            raise ValueError("empty order")


class Pricer:
    def subtotal(self, order):
        s = sum(q * p for q, p in order["items"])
        if order["customer"] == "gold":
            s *= 0.90
        elif order["customer"] == "silver":
            s *= 0.95
        return s


class PaymentFees:
    def fee(self, order, subtotal):
        if order["payment"] == "card":
            return subtotal * 0.02
        if order["payment"] == "cash":
            return 0
        raise ValueError("unknown payment")
```

The numbers still have to match, so check after each step (section 5).

### Step 2: OCP, open the two chains

The tier and the payment method are the axes of change. Replace each chain with a registry of small classes:

```python
from abc import ABC, abstractmethod


class Discount(ABC):
    @abstractmethod
    def apply(self, amount): ...


class NoDiscount(Discount):
    def apply(self, amount): return amount

class Silver(Discount):
    def apply(self, amount): return amount * 0.95

class Gold(Discount):
    def apply(self, amount): return amount * 0.90

DISCOUNTS = {"regular": NoDiscount(), "silver": Silver(), "gold": Gold()}


class FeeRule(ABC):
    @abstractmethod
    def fee(self, subtotal): ...


class CardFee(FeeRule):
    def fee(self, subtotal): return subtotal * 0.02

class CashFee(FeeRule):
    def fee(self, subtotal): return 0

FEES = {"card": CardFee(), "cash": CashFee()}
```

A new tier or payment method is now one class and one registry line.

### Step 3: ISP, keep each interface to what its caller needs

`Pricer` needs only `apply`, and the payment code only needs `fee`. Two one-method interfaces are the right size: nobody is forced to depend on the other's method. (If you had merged them into one `Rules` interface with both, the pricer would depend on fees it never uses.)

### Step 4: DIP, the notification becomes a dependency

```python
class Notifier(ABC):
    @abstractmethod
    def order_placed(self, total): ...


class EmailNotifier(Notifier):
    def __init__(self):
        self.sent = []

    def order_placed(self, total):
        self.sent.append(f"email: order total {total}")
```

The workflow will receive a `Notifier`, so a test can pass a fake, and production can pass email, SMS or a queue.

### Step 5: LSP, check every implementation against one contract

Every `Discount` must return a number that is not negative and not above the input, and every `FeeRule` must return a number that is not negative:

```python
def check_discounts():
    for name, d in DISCOUNTS.items():
        assert 0 <= d.apply(100.0) <= 100.0, name


def check_fees():
    for name, f in FEES.items():
        assert f.fee(100.0) >= 0, name


check_discounts()
check_fees()
print("contracts hold")
```

Output:

```text
contracts hold
```

Now assemble the workflow:

```python
class OrderProcessor2:
    def __init__(self, notifier):
        self._validator = Validator()
        self._notifier = notifier

    def process(self, order):
        self._validator.check(order)
        subtotal = sum(q * p for q, p in order["items"])
        subtotal = DISCOUNTS[order["customer"]].apply(subtotal)
        try:
            fee = FEES[order["payment"]].fee(subtotal)
        except KeyError:
            raise ValueError("unknown payment")
        total = round(subtotal + fee, 2)
        self._notifier.order_placed(total)
        return total
```

---

## 5. Prove that nothing changed

Run the same recording against the new class:

```python
print(record(lambda: OrderProcessor2(EmailNotifier())))
```

Output:

```text
[22.95, 95.0, 30.57]
```

Identical to the original. The structure changed and the behaviour did not. That is a refactoring.

What you gained, and can now show:

| Before | After |
| :--- | :--- |
| New tier: edit `process` | New tier: add a class and a registry line |
| Test pricing: build a full processor with a notification list | Test `Gold().apply(100.0)` alone |
| Notification is hard-coded | `Notifier` is injected, and a fake records calls |
| One file, four owners | Four small classes, one owner each |

> [!NOTE]
> The workflow still reads the tier through a dictionary. That is acceptable: the registry is the **extension point**, and the workflow stays closed to new tiers.

---

## 6. Practice theory: drills

### Drill 1: name the principle

For each snippet, say which principle is the **primary** problem.

```python
# a
class Bird:
    def fly(self): ...
class Ostrich(Bird):
    def fly(self): raise Exception("cannot fly")

# b
class Report:
    def build(self): ...
    def save_to_s3(self): ...
    def email(self): ...

# c
def price(kind):
    if kind == "a": ...
    elif kind == "b": ...

# d
class Service:
    def __init__(self):
        self.api = HttpClient("https://prod.example.com")
```

<details>
<summary>Answer</summary>

(a) **LSP**: a subtype that cannot do what the parent promises. (b) **SRP**: building, storage and mailing change for different reasons. (c) **OCP**: every new kind edits the function. (d) **DIP**: a hard-coded client and URL inside the service.

</details>

### Drill 2: choose the fix order

A class has a type switch (OCP), builds its own database client (DIP) and does three unrelated jobs (SRP). Which do you fix first, and why?

<details>
<summary>Answer</summary>

SRP first: splitting the jobs gives small pieces to work with. Then DIP, so each piece can be tested alone. Then OCP, where the type switch actually lives. Doing OCP first on a class that still does three jobs produces an interface hierarchy in the wrong place.

</details>

### Drill 3: write the missing test

You introduced `DISCOUNTS` with `NoDiscount`, `Silver` and `Gold`. A teammate adds `Platinum` that returns `amount * 1.1`.

**Question:** What breaks, and how do you catch it before production?

<details>
<summary>Answer</summary>

`Platinum` charges **more** than the original amount, which breaks the contract that a discount never raises the price (an LSP problem). The contract check from step 5 (`0 <= d.apply(100.0) <= 100.0`) fails in a test as soon as `Platinum` is registered.

</details>

### Drill 4: the over-engineered version

A colleague wraps `slugify`, a pure function, in an interface, a factory and a registry "for DIP and OCP".

**Question:** What do you say in the review?

<details>
<summary>Answer</summary>

These principles pay off where change or testing pain exists. `slugify` has neither: it is pure and stable. Keep it as a function. Introduce abstractions when a second variant or a real test difficulty appears.

</details>

### Drill 5: your own class

Take a class from a project you know. Do these four things on paper: list its actors (SRP), find any `if/elif` over a type (OCP), search for `isinstance` or empty overrides (LSP, ISP), and underline every hidden collaborator (DIP). Write the recorded outputs first, as in section 3, then refactor.

---

## 7. Interview corner

**"Walk me through refactoring a class that breaks SOLID."**
I first record its behaviour with a few cases. Then I split the responsibilities (SRP), put the external pieces behind interfaces and inject them (DIP), replace type switches with a registry of small classes (OCP), and add a contract test for the implementations (LSP). I keep interfaces to what callers need (ISP). After every step the recorded outputs must be identical.

**"Which principle do you apply first?"**
SRP, because splitting the jobs gives me small units to put behind interfaces. Applying OCP to a class that still does several jobs puts the abstraction in the wrong place.

**"Can SOLID be overdone?"**
Yes. Interfaces for pure helpers and one-method classes everywhere create indirection with no benefit. I apply a principle where there is a real pain: a team conflict, a type switch that keeps growing, a test that needs a database.

---

## 8. Cheat sheet

| Step | Principle | Move |
| :--- | :--- | :--- |
| 0 | None | Record the behaviour with a few cases |
| 1 | SRP | Split by actor, keep a thin workflow |
| 2 | DIP | Inject external collaborators |
| 3 | OCP | Replace the type switch with a registry of classes |
| 4 | ISP | Keep each interface to the methods its caller uses |
| 5 | LSP | One contract test for every implementation |
| 6 | All | Re-run the recording: identical output |

---

## Further reading

- Martin Fowler, *Refactoring*, 2nd ed. (2018): the catalogue of small behaviour-preserving steps.
- Robert C. Martin, *Clean Architecture* (2017), part III, "Design Principles".

## Next

Practise on real problems: [Practice → Low-level design](/practice/), or continue with [25 · Design Patterns, One at a Time](../../25-design-patterns-one-at-a-time/README.md), where the same ideas appear as named patterns.
