S1 = r'''class ExpenseBook:
    def __init__(self, members):
        members = list(members)
        if not members:
            raise ValueError("No members")
        if len(set(members)) != len(members):
            raise ValueError("Duplicate member")
        self._net = {member: 0 for member in members}

    def _known(self, *names):
        for name in names:
            if name not in self._net:
                raise ValueError("Unknown member")

    @staticmethod
    def _positive(amount_cents):
        if not isinstance(amount_cents, int) or isinstance(amount_cents, bool) or amount_cents <= 0:
            raise ValueError("Bad amount")

    def net(self, member):
        self._known(member)
        return self._net[member]

    def balances(self):
        return {member: net for member, net in self._net.items() if net != 0}

    def add_expense(self, payer, amount_cents, participants):
        participants = list(participants)
        self._known(payer, *participants)
        if not participants or len(set(participants)) != len(participants):
            raise ValueError("Bad participants")
        self._positive(amount_cents)
        share, extra = divmod(amount_cents, len(participants))
        for index, person in enumerate(participants):
            self._net[person] -= share + (1 if index < extra else 0)
        self._net[payer] += amount_cents

    def settle(self, payer, receiver, amount_cents):
        self._known(payer, receiver)
        self._positive(amount_cents)
        if payer == receiver:
            raise ValueError("Cannot settle with yourself")
        self._net[payer] += amount_cents
        self._net[receiver] -= amount_cents'''

S2 = r'''class EqualSplit:
    def shares(self, amount_cents, participants):
        share, extra = divmod(amount_cents, len(participants))
        return {person: share + (1 if index < extra else 0) for index, person in enumerate(participants)}


class ExactSplit:
    def __init__(self, amounts):
        self._amounts = dict(amounts)

    def shares(self, amount_cents, participants):
        if set(self._amounts) != set(participants) or sum(self._amounts.values()) != amount_cents:
            raise ValueError("Shares do not add up")
        return dict(self._amounts)


class PercentSplit:
    def __init__(self, percents):
        if sum(percents.values()) != 100:
            raise ValueError("Percents must add up to 100")
        self._percents = dict(percents)

    def shares(self, amount_cents, participants):
        if set(self._percents) != set(participants):
            raise ValueError("Shares do not add up")
        base = {person: amount_cents * self._percents[person] // 100 for person in participants}
        leftover = amount_cents - sum(base.values())
        for person in participants[:leftover]:
            base[person] += 1
        return base


class ExpenseBook:
    def __init__(self, members):
        members = list(members)
        if not members:
            raise ValueError("No members")
        if len(set(members)) != len(members):
            raise ValueError("Duplicate member")
        self._net = {member: 0 for member in members}

    def _known(self, *names):
        for name in names:
            if name not in self._net:
                raise ValueError("Unknown member")

    @staticmethod
    def _positive(amount_cents):
        if not isinstance(amount_cents, int) or isinstance(amount_cents, bool) or amount_cents <= 0:
            raise ValueError("Bad amount")

    def net(self, member):
        self._known(member)
        return self._net[member]

    def balances(self):
        return {member: net for member, net in self._net.items() if net != 0}

    def add_expense(self, payer, amount_cents, participants, split=None):
        participants = list(participants)
        self._known(payer, *participants)
        if not participants or len(set(participants)) != len(participants):
            raise ValueError("Bad participants")
        self._positive(amount_cents)
        shares = (EqualSplit() if split is None else split).shares(amount_cents, list(participants))
        valid = (
            isinstance(shares, dict)
            and set(shares) == set(participants)
            and all(isinstance(owed, int) and not isinstance(owed, bool) and owed >= 0 for owed in shares.values())
            and sum(shares.values()) == amount_cents
        )
        if not valid:
            raise ValueError("Shares do not add up")
        for person, owed in shares.items():
            self._net[person] -= owed
        self._net[payer] += amount_cents

    def settle(self, payer, receiver, amount_cents):
        self._known(payer, receiver)
        self._positive(amount_cents)
        if payer == receiver:
            raise ValueError("Cannot settle with yourself")
        self._net[payer] += amount_cents
        self._net[receiver] -= amount_cents'''

S3 = S2 + r'''

    def simplify(self):
        debts = {member: -net for member, net in self._net.items() if net < 0}
        credits = {member: net for member, net in self._net.items() if net > 0}
        transfers = []
        while debts and credits:
            debtor = min(debts, key=lambda member: (-debts[member], member))
            creditor = min(credits, key=lambda member: (-credits[member], member))
            amount = min(debts[debtor], credits[creditor])
            transfers.append((debtor, creditor, amount))
            debts[debtor] -= amount
            credits[creditor] -= amount
            if debts[debtor] == 0:
                del debts[debtor]
            if credits[creditor] == 0:
                del credits[creditor]
        return transfers'''

PROBLEMS = [
P(
    slug='lld-expense-sharing-1', title='Shared Expenses, Step 1: Equal Splits', topic='lld-change-requests', difficulty='intermediate',
    module='lld/15-splitwise-expense-sharing/README.md',
    description='Step 1 of 3: track who paid and who owes in a group, splitting each bill equally to the cent.',
    statement=r'''This is **step 1 of 3** on a shared-expenses tracker (like Splitwise). Steps 2 and 3 are change requests on the code you write here.

Write a class `ExpenseBook` for a group of friends. Money is whole **cents**.

**Creating one:** `ExpenseBook(members)` where `members` is a list of names. An empty list raises `ValueError("No members")`; a repeated name raises `ValueError("Duplicate member")`.

**Methods**

- `add_expense(payer, amount_cents, participants)` records that `payer` paid the bill, and that it is shared **equally** by `participants` (a list; the payer may or may not be in it).
  - Each participant owes `amount_cents // n` cents, and the **first** `amount_cents % n` participants, **in the order the list was given**, owe one cent more, so the shares add up exactly.
  - Checks, in this order, raising `ValueError` with exactly this message and changing nothing: `"Unknown member"` (the payer or any participant is not a member), `"Bad participants"` (the list is empty or has a repeat), `"Bad amount"` (not a whole number above 0).
- `net(member)` is what the member has paid minus what they owe: **positive means they are owed money, negative means they owe**. An unknown member raises `ValueError("Unknown member")`.
- `balances()` returns `{member: net}` for every member whose net is **not zero**.
- `settle(payer, receiver, amount_cents)` records that `payer` handed `amount_cents` to `receiver` to pay off a debt: the payer's net goes **up** by the amount and the receiver's goes **down**. Checks, in order: `"Unknown member"`, `"Bad amount"`, then `"Cannot settle with yourself"`.

The nets of all members always add up to **zero**.

**Example**

```
book = ExpenseBook(["asha", "ben", "cy"])
book.add_expense("asha", 3000, ["asha", "ben", "cy"])
book.balances()      # {"asha": 2000, "ben": -1000, "cy": -1000}
```''',
    starter=r'''class ExpenseBook:
    def __init__(self, members):
        ...

    def net(self, member):
        ...

    def balances(self):
        ...

    def add_expense(self, payer, amount_cents, participants):
        """Split equally; the first (amount % n) participants, in the given order, owe one cent more."""
        ...

    def settle(self, payer, receiver, amount_cents):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
book = ExpenseBook(["asha", "ben", "cy"])
assert (book.net("asha"), book.balances()) == (0, {})
book.add_expense("asha", 3000, ["asha", "ben", "cy"])
assert (book.net("asha"), book.net("ben"), book.net("cy")) == (2000, -1000, -1000)
assert book.balances() == {"asha": 2000, "ben": -1000, "cy": -1000}
book.add_expense("ben", 100, ["asha", "ben", "cy"])
assert (book.net("asha"), book.net("ben"), book.net("cy")) == (1966, -933, -1033)
book.settle("ben", "asha", 933)
assert book.balances() == {"asha": 1033, "cy": -1033}
assert book.net("ben") == 0
paid = ExpenseBook(["asha", "ben", "cy"])
paid.add_expense("asha", 1000, ["ben", "cy"])
assert paid.balances() == {"asha": 1000, "ben": -500, "cy": -500}
order = ExpenseBook(["asha", "ben", "cy"])
order.add_expense("asha", 101, ["cy", "ben"])
assert (order.net("cy"), order.net("ben"), order.net("asha")) == (-51, -50, 101)
order.add_expense("asha", 5, ["ben", "cy", "asha"])
assert (order.net("ben"), order.net("cy"), order.net("asha")) == (-50 - 2, -51 - 2, 101 + 5 - 1)
single = ExpenseBook(["asha", "ben"])
single.add_expense("asha", 999, ["asha"])
assert single.balances() == {}
single.add_expense("ben", 1, ["asha", "ben"])
assert (single.net("asha"), single.net("ben")) == (-1, 1)
for bad in [("zed", 100, ["asha"]), ("asha", 100, ["zed"]), ("zed", 0, [])]:
    assert error_of(single.add_expense, *bad) == "ValueError: Unknown member"
assert error_of(single.add_expense, "asha", 100, []) == "ValueError: Bad participants"
assert error_of(single.add_expense, "asha", 100, ["ben", "ben"]) == "ValueError: Bad participants"
assert error_of(single.add_expense, "asha", 0, ["ben"]) == "ValueError: Bad amount"
assert error_of(single.add_expense, "asha", -5, ["ben"]) == "ValueError: Bad amount"
assert error_of(single.add_expense, "asha", 1.5, ["ben"]) == "ValueError: Bad amount"
assert error_of(single.add_expense, "asha", True, ["ben"]) == "ValueError: Bad amount"
assert error_of(single.add_expense, "asha", 0, []) == "ValueError: Bad participants"
assert (single.net("asha"), single.net("ben")) == (-1, 1)
assert error_of(single.net, "zed") == "ValueError: Unknown member"
assert error_of(single.settle, "asha", "zed", 5) == "ValueError: Unknown member"
assert error_of(single.settle, "asha", "ben", 0) == "ValueError: Bad amount"
assert error_of(single.settle, "asha", "asha", 5) == "ValueError: Cannot settle with yourself"
assert error_of(single.settle, "zed", "zed", 0) == "ValueError: Unknown member"
assert error_of(ExpenseBook, []) == "ValueError: No members"
assert error_of(ExpenseBook, ["a", "a"]) == "ValueError: Duplicate member"
people = ["p%d" % i for i in range(7)]
group = ExpenseBook(people)
for i in range(300):
    group.add_expense(people[i % 7], 100 + i * 37, people[: 1 + i % 7])
    if i % 5 == 0:
        group.settle(people[(i + 1) % 7], people[i % 7], 1 + i)
assert sum(group.net(p) for p in people) == 0
assert group.balances() == {p: group.net(p) for p in people if group.net(p) != 0}''',
    solution=S1,
    hints=[
        r'''Store one number per member: their **net** (paid minus owed). An expense adds the whole amount to the payer and subtracts each participant's share; a settlement moves an amount from one net to another. Everything else (`balances`) is derived from the nets.''',
        r'''For the split use `divmod(amount, n)`: every participant owes the quotient, and the first `remainder` participants **in the list order you were given** owe one more cent. Do not sort the participants.''',
        r'''Run all your checks (unknown member, bad participants, bad amount) before you change any net, in the order the statement gives, so a refused expense leaves everything as it was.''',
    ],
    explanation=r'''**The idea.** Group expenses look like a graph of who-owes-whom, but you do not need to store that graph. Store one number per person, their **net position** (paid minus owed). The nets always add up to zero (money is never created), and every question you will ask later (who is owed, who owes, how to settle up) can be answered from them.

```mermaid
classDiagram
    class ExpenseBook {
        -net dict
        +add_expense()
        +settle()
        +net() int
        +balances() dict
    }
```

**The cent problem.** `100` cents among three people cannot be `33.33...` each. Whole-cent shares with the leftover handed out one cent at a time **in a defined order** guarantee the shares add up to the bill. The order is part of the contract (here: the order the caller gave), so two runs of the same expense always produce the same debts.

**Validate, then change.** Three checks in a stated order, all before any net moves.

**Invariant, tested hard.** The last test adds 300 expenses and settlements and checks `sum(nets) == 0`. An invariant you can state in one line is the best test an accounting model has.

**What comes next.** An equal split is the only rule so far, and it is written inside `add_expense`. Step 2 is about to ask for exact amounts and percentages.''',
),

P(
    slug='lld-expense-sharing-2', title='Shared Expenses, Step 2: Other Ways to Split', topic='lld-change-requests', difficulty='intermediate',
    module='lld/15-splitwise-expense-sharing/README.md',
    description='Step 2 of 3: split by exact amounts or percentages, and let any split rule be plugged in.',
    statement=r'''This is **step 2 of 3**. The editor holds a working step 1; change it. Everything from step 1 still holds (the methods, the order of checks, the nets adding up to zero).

**The change request.** Friends also split bills by exact amounts and by percentages, and the app wants new rules to be added without editing `ExpenseBook`.

**A split** is any object with a method `shares(amount_cents, participants)` that returns a dict `{participant: cents_owed}`.

**What to write**

- `add_expense(payer, amount_cents, participants, split=None)`: after the three existing checks, it asks `split.shares(amount_cents, participants)` (a **copy** of the list) and applies the answer. `None` means `EqualSplit()`. It must **refuse** an answer that is not valid, raising `ValueError("Shares do not add up")` and changing nothing. Valid means: a dict whose keys are exactly the participants, whose values are whole numbers of 0 or more, and which add up to `amount_cents`.
- `EqualSplit()`: the step 1 rule (equal shares; the first `amount % n` participants in the given order owe one cent more).
- `ExactSplit(amounts)`: `amounts` is `{member: cents}`. Its shares are those amounts, but it raises `ValueError("Shares do not add up")` if its members are not exactly the participants or its amounts do not add up to the bill.
- `PercentSplit(percents)`: `percents` is `{member: whole percent}`. It raises `ValueError("Percents must add up to 100")` when it is created if they do not add up to 100. Each share is `amount * percent // 100` (rounded down); the cents left over go **one each to the first participants in the order given**. If its members are not exactly the participants it raises `ValueError("Shares do not add up")`.

**The tests plug in split rules you have never seen**, such as one that splits by weights, and rules that return wrong answers. `ExpenseBook` must work through `shares(...)` alone and check what comes back.

**Example**

```
book.add_expense("asha", 1000, ["asha", "ben", "cy"], PercentSplit({"asha": 50, "ben": 30, "cy": 20}))
# shares: asha 500, ben 300, cy 200
```''',
    starter=S1,
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def fresh():
    return ExpenseBook(["asha", "ben", "cy"])
everyone = ["asha", "ben", "cy"]
book = fresh()
book.add_expense("asha", 3000, everyone)
book.add_expense("ben", 100, everyone)
assert (book.net("asha"), book.net("ben"), book.net("cy")) == (1966, -933, -1033)
book.settle("ben", "asha", 933)
assert book.balances() == {"asha": 1033, "cy": -1033}
assert error_of(book.add_expense, "zed", 100, ["asha"]) == "ValueError: Unknown member"
assert error_of(book.add_expense, "asha", 100, []) == "ValueError: Bad participants"
assert error_of(book.add_expense, "asha", 0, ["ben"]) == "ValueError: Bad amount"
assert EqualSplit().shares(101, ["cy", "ben"]) == {"cy": 51, "ben": 50}
eq = fresh()
eq.add_expense("asha", 100, everyone, EqualSplit())
assert (eq.net("asha"), eq.net("ben"), eq.net("cy")) == (100 - 34, -33, -33)
exact = fresh()
exact.add_expense("asha", 1000, everyone, ExactSplit({"asha": 600, "ben": 300, "cy": 100}))
assert (exact.net("asha"), exact.net("ben"), exact.net("cy")) == (400, -300, -100)
exact2 = fresh()
assert error_of(exact2.add_expense, "asha", 1000, everyone, ExactSplit({"asha": 600, "ben": 300, "cy": 99})) == "ValueError: Shares do not add up"
assert error_of(exact2.add_expense, "asha", 1000, everyone, ExactSplit({"asha": 700, "ben": 300})) == "ValueError: Shares do not add up"
assert error_of(exact2.add_expense, "asha", 1000, ["asha", "ben"], ExactSplit({"asha": 1100, "ben": -100})) == "ValueError: Shares do not add up"
assert exact2.balances() == {}
assert error_of(ExactSplit({"asha": 1}).shares, 5, ["asha"]) == "ValueError: Shares do not add up"
assert error_of(ExactSplit({"asha": 5}).shares, 5, ["asha", "ben"]) == "ValueError: Shares do not add up"
assert ExactSplit({"asha": 5}).shares(5, ["asha"]) == {"asha": 5}
assert PercentSplit({"asha": 50, "ben": 30, "cy": 20}).shares(1000, everyone) == {"asha": 500, "ben": 300, "cy": 200}
assert PercentSplit({"asha": 50, "ben": 30, "cy": 20}).shares(101, everyone) == {"asha": 51, "ben": 30, "cy": 20}
assert PercentSplit({"asha": 50, "ben": 30, "cy": 20}).shares(101, ["cy", "asha", "ben"]) == {"cy": 21, "asha": 50, "ben": 30}
assert PercentSplit({"asha": 33, "ben": 33, "cy": 34}).shares(100, everyone) == {"asha": 33, "ben": 33, "cy": 34}
assert PercentSplit({"asha": 33, "ben": 33, "cy": 34}).shares(7, everyone) == {"asha": 3, "ben": 2, "cy": 2}
assert PercentSplit({"asha": 50, "ben": 50}).shares(3, ["asha", "ben"]) == {"asha": 2, "ben": 1}
assert PercentSplit({"asha": 70, "ben": 30}).shares(5, ["ben", "asha"]) == {"ben": 2, "asha": 3}
assert error_of(PercentSplit, {"asha": 50, "ben": 30}) == "ValueError: Percents must add up to 100"
assert error_of(PercentSplit({"asha": 50, "ben": 50}).shares, 100, everyone) == "ValueError: Shares do not add up"
pct = fresh()
pct.add_expense("cy", 1000, everyone, PercentSplit({"asha": 50, "ben": 30, "cy": 20}))
assert (pct.net("asha"), pct.net("ben"), pct.net("cy")) == (-500, -300, 800)
class ByWeights:
    def __init__(self, weights):
        self.weights = weights
    def shares(self, amount_cents, participants):
        total = sum(self.weights[p] for p in participants)
        base = {p: amount_cents * self.weights[p] // total for p in participants}
        for p in participants[: amount_cents - sum(base.values())]:
            base[p] += 1
        return base
weighted = fresh()
weighted.add_expense("asha", 100, ["asha", "ben"], ByWeights({"asha": 2, "ben": 1}))
assert (weighted.net("asha"), weighted.net("ben")) == (33, -33)
class Spy:
    def __init__(self):
        self.calls = []
    def shares(self, amount_cents, participants):
        self.calls.append((amount_cents, list(participants)))
        participants.append("intruder")
        return EqualSplit().shares(amount_cents, participants[:-1])
spy = Spy()
watched = fresh()
watched.add_expense("asha", 90, ["ben", "cy"], spy)
assert spy.calls == [(90, ["ben", "cy"])]
assert (watched.net("ben"), watched.net("cy"), watched.net("asha")) == (-45, -45, 90)
assert error_of(watched.add_expense, "zed", 90, ["ben"], spy) == "ValueError: Unknown member"
assert len(spy.calls) == 1
class Short:
    def shares(self, amount_cents, participants):
        return {p: amount_cents // len(participants) for p in participants}
class Extra:
    def shares(self, amount_cents, participants):
        return {"asha": amount_cents, "ghost": 0}
class NotADict:
    def shares(self, amount_cents, participants):
        return [amount_cents]
class Negative:
    def shares(self, amount_cents, participants):
        return {participants[0]: amount_cents + 5, participants[1]: -5}
class Fractions:
    def shares(self, amount_cents, participants):
        return {p: amount_cents / len(participants) for p in participants}
bad = fresh()
for rule in (Short(), Extra(), NotADict(), Negative(), Fractions()):
    assert error_of(bad.add_expense, "asha", 101, ["asha", "ben"], rule) == "ValueError: Shares do not add up"
assert bad.balances() == {}
assert error_of(bad.add_expense, "asha", 100, ["asha", "ben", "cy"], Short()) == "ValueError: Shares do not add up"
assert bad.add_expense("asha", 100, ["asha", "ben"], ByWeights({"asha": 1, "ben": 1})) is None
assert (bad.net("asha"), bad.net("ben")) == (50, -50)''',
    solution=S2,
    hints=[
        r'''Move the *rule for dividing a bill* out of `add_expense` into small objects with one method, `shares(amount, participants)`. `add_expense` then does the same three things for every rule: get the shares, check them, apply them.''',
        r'''Never trust a plug-in. Before applying what `split.shares(...)` returned, check it is a dict, its keys are exactly the participants, every value is a whole number of 0 or more, and the sum equals the bill. Only then change any net.''',
        r'''Give the split a **copy** of the participants list (a rule that edits its argument must not damage yours), and call it only after the earlier checks have passed. For percentages, floor each share and hand the leftover cents to the first participants one by one.''',
    ],
    explanation=r'''**What changed, and why it hurts.** In step 1 the equal split was written inside `add_expense`. A rule for exact amounts would have meant an `if split_type == "exact"` there, and so would percentages, and so would "by weights". Each new rule would edit the method every other rule depends on. That is the **Open/Closed** violation again, and the cure is the same as in the parking lot: pull the part that varies behind a one-method interface (**Strategy**).

```mermaid
classDiagram
    class ExpenseBook {
        +add_expense()
    }
    class Split {
        <<interface>>
        +shares() dict
    }
    ExpenseBook --> Split : asks, then checks the answer
    Split <|.. EqualSplit
    Split <|.. ExactSplit
    Split <|.. PercentSplit
    Split <|.. YourWeightedSplit
```

**The new idea: do not trust the plug-in.** The book is the only thing that knows the invariant (shares must add up to the bill), so it *checks every answer* instead of assuming each rule is correct. The tests include five wrong rules (too short, an extra person, not a dict, negative, fractions) and each is refused with no change to any net. A plug-in point without validation moves your bugs into other people's code, where you cannot see them.

**Another defensive copy.** The rule gets a copy of the participants list; the `Spy` test appends to it and nothing leaks into the book.

**Rounding is a decision per rule.** Percentages floor and give the leftover cents to the first participants in order, so `7` split `33/33/34` is `3/2/2`. A different rule (largest remainder) would give another answer; what matters is that the rule is stated and tested.

**Complexity.** O(participants) per expense.

**What comes next.** Balances are correct but not *convenient*: with ten people there may be dozens of small debts. Step 3 asks for the fewest payments that settle everyone.''',
),

P(
    slug='lld-expense-sharing-3', title='Shared Expenses, Step 3: Settle Up', topic='lld-change-requests', difficulty='advanced',
    module='lld/15-splitwise-expense-sharing/README.md',
    description='Step 3 of 3: work out a short list of payments that settles the whole group, without changing any balance.',
    statement=r'''This is **step 3 of 3**. The editor holds a working step 2; change it. Everything from steps 1 and 2 still holds (the checks and their order, `EqualSplit`, `ExactSplit`, `PercentSplit`, plug-in splits and their validation, nets adding up to zero).

**The change request.** After a few weeks nobody knows who should pay whom. The app should say, in as few payments as it reasonably can, how to settle the whole group.

**`simplify()`** returns a list of transfers `(debtor, creditor, amount_cents)`:

1. Take the member who owes the **most** (ties: the name that comes first alphabetically) and the member who is owed the **most** (ties: the same).
2. Make a transfer from the first to the second of the **smaller** of those two amounts.
3. Reduce both amounts accordingly; anyone who reaches zero drops out.
4. Repeat until nobody owes anything.

Rules:

- It returns `[]` when every net is zero.
- It **does not change** any balance: it only describes payments. Calling it twice gives the same list.
- Every amount is above 0. Following all the transfers (with `settle(debtor, creditor, amount)`) brings every net to zero, and there are **at most one fewer transfers than people who owe or are owed**.

**Example**

```
# nets: asha +300, ben -100, cy -200
book.simplify()      # [("cy", "asha", 200), ("ben", "asha", 100)]
```''',
    starter=S2,
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def book_with(members, expenses):
    book = ExpenseBook(members)
    for payer, amount, people in expenses:
        book.add_expense(payer, amount, people)
    return book
book = book_with(["asha", "ben", "cy"], [("asha", 600, ["asha", "ben", "cy"])])
assert book.balances() == {"asha": 400, "ben": -200, "cy": -200}
assert book.simplify() == [("ben", "asha", 200), ("cy", "asha", 200)]
assert book.balances() == {"asha": 400, "ben": -200, "cy": -200}
assert book.simplify() == book.simplify()
three = ExpenseBook(["asha", "ben", "cy"])
three.add_expense("asha", 300, ["ben", "cy"], ExactSplit({"ben": 100, "cy": 200}))
assert three.balances() == {"asha": 300, "ben": -100, "cy": -200}
assert three.simplify() == [("cy", "asha", 200), ("ben", "asha", 100)]
two = ExpenseBook(["asha", "ben", "cy"])
two.add_expense("cy", 200, ["asha", "ben"], ExactSplit({"asha": 100, "ben": 100}))
assert two.simplify() == [("asha", "cy", 100), ("ben", "cy", 100)]
split = ExpenseBook(["asha", "ben", "cy"])
split.add_expense("asha", 200, ["cy"])
split.add_expense("ben", 200, ["cy"])
assert split.simplify() == [("cy", "asha", 200), ("cy", "ben", 200)]
assert ExpenseBook(["a", "b"]).simplify() == []
even = ExpenseBook(["a", "b"])
even.add_expense("a", 100, ["b"])
even.add_expense("b", 100, ["a"])
assert even.simplify() == []
chain = ExpenseBook(["a", "b", "c", "d"])
chain.add_expense("a", 100, ["b"])
chain.add_expense("b", 100, ["c"])
chain.add_expense("c", 100, ["d"])
assert chain.balances() == {"a": 100, "d": -100}
assert chain.simplify() == [("d", "a", 100)]
partial = book_with(["asha", "ben", "cy"], [("asha", 600, ["asha", "ben", "cy"])])
partial.settle("ben", "asha", 200)
assert partial.simplify() == [("cy", "asha", 200)]
big_people = ["p%d" % i for i in range(8)]
big = ExpenseBook(big_people)
for i in range(40):
    big.add_expense(big_people[i % 8], 500 + i * 123, big_people[: 2 + i % 6])
before = big.balances()
moves = big.simplify()
assert big.balances() == before
assert all(isinstance(m[2], int) and m[2] > 0 for m in moves)
assert len(moves) <= len(before) - 1
for debtor, creditor, amount in moves:
    big.settle(debtor, creditor, amount)
assert big.balances() == {}
assert big.simplify() == []
tie = ExpenseBook(["a", "b", "c", "d"])
tie.add_expense("d", 300, ["a", "b", "c"])
assert tie.simplify() == [("a", "d", 100), ("b", "d", 100), ("c", "d", 100)]
lopsided = ExpenseBook(["a", "b", "c", "d"])
lopsided.add_expense("a", 1000, ["b", "c", "d"], ExactSplit({"b": 600, "c": 300, "d": 100}))
assert lopsided.simplify() == [("b", "a", 600), ("c", "a", 300), ("d", "a", 100)]
mixed = ExpenseBook(["a", "b", "c", "d"])
mixed.add_expense("a", 500, ["c", "d"], ExactSplit({"c": 400, "d": 100}))
mixed.add_expense("b", 300, ["c"])
assert mixed.balances() == {"a": 500, "b": 300, "c": -700, "d": -100}
assert mixed.simplify() == [("c", "a", 500), ("c", "b", 200), ("d", "b", 100)]
assert error_of(mixed.settle, "c", "c", 5) == "ValueError: Cannot settle with yourself"
odd = ExpenseBook(["zoe", "amy", "bob", "cat"])
odd.add_expense("cat", 300, ["zoe", "amy", "bob"])
assert odd.simplify() == [("amy", "cat", 100), ("bob", "cat", 100), ("zoe", "cat", 100)]
odd2 = ExpenseBook(["zoe", "amy", "bob"])
odd2.add_expense("zoe", 100, ["bob"])
odd2.add_expense("amy", 100, ["bob"])
assert odd2.simplify() == [("bob", "amy", 100), ("bob", "zoe", 100)]
class ByHalf:
    def shares(self, amount_cents, participants):
        return EqualSplit().shares(amount_cents, participants)
halves = ExpenseBook(["a", "b"])
halves.add_expense("a", 101, ["a", "b"], ByHalf())
assert halves.simplify() == [("b", "a", 50)]''',
    solution=S3,
    hints=[
        r'''Build two dictionaries from the nets: what each debtor owes (as a positive number) and what each creditor is owed. `simplify` works on **copies**, so the real nets are never touched.''',
        r'''Each round, choose the biggest debtor and the biggest creditor with `min(..., key=lambda m: (-amount[m], m))` (largest amount first, then name), transfer the smaller of the two amounts, reduce both, and drop anyone who reaches zero.''',
        r'''Every round clears at least one person (the smaller of the two reaches zero), which is why there are never more transfers than people minus one. The list is built in the order the rounds happen.''',
    ],
    explanation=r'''**What changed.** Steps 1 and 2 *recorded* money. Step 3 *reads* the nets and computes a plan, without touching them. The nets (one number per person, summing to zero) are exactly the right input: whoever is above zero is a creditor, whoever is below is a debtor, and the plan only has to move money from the second group to the first.

```mermaid
flowchart LR
    N[nets] --> D[debtors, largest first]
    N --> C[creditors, largest first]
    D --> M{biggest debtor, biggest creditor}
    C --> M
    M --> T[transfer the smaller amount]
    T -->|someone left| M
    T -->|all zero| L[list of transfers]
```

**Why this is "reasonably few" payments.** In every round the smaller of the two amounts reaches zero, so at least one person is cleared per transfer. With `k` people who owe or are owed there are therefore at most `k - 1` transfers, and the last transfer clears two people at once. Finding the *absolute minimum* is NP-hard (it is a subset-sum style problem), so the greedy rule trades a possible extra transfer for an answer in microseconds. In an interview, saying that is worth more than the code.

**Deterministic on purpose.** Ties are broken by name, so the same book always gives the same list. Without that, tests (and users comparing two screens) would see the plan flicker.

**Pure function of the state.** `simplify` does not call `settle`; the test checks the balances before and after, and that applying the plan with `settle` leaves everyone at zero. Separating *planning* from *doing* means a user can look at the plan before anyone pays.

**Looking back at the ladder.** Step 1 was a model and an invariant, step 2 pulled out splitting (Strategy, with validation of plug-ins), step 3 added a read-only algorithm on top. None of the later steps broke the earlier tests, which is what a good design buys you.

**Complexity.** O(k²) as written (each round scans the maps); with heaps, O(k log k).

**Going further.** Real apps show *who pays whom* per pair of people, not only the minimum plan, because people trust payments they can trace to a bill. How would you keep a ledger of pairwise debts next to the nets?''',
),
]
