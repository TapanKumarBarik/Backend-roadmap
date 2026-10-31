# Module 15: Splitwise Expense Sharing

## Why this matters

The first "shared ledger" problem in this track, and a single
comprehensive problem rather than two — it deserves the room. The
central design decision isn't a GOF pattern at all: it's that a balance
between two people is a fact about *the pair*, not about either person
individually. Store it twice (once as "Alice owes Bob $30" inside
Alice's data and again as "Bob is owed $30 by Alice" inside Bob's) and
the two copies can drift out of sync the moment one update path forgets
the other. `Ledger` below stores exactly one number per pair and derives
direction from how you ask — that single decision prevents an entire
class of bugs before it can happen. Split *rules* (equal, exact,
percentage) get the now-familiar Strategy treatment (module 08), but
with a twist: this is the first Strategy in the track that takes
per-call data (participants, amounts) instead of being fully configured
at construction.

---

## Requirements

**Functional**: users record shared expenses; each expense has a payer
and a set of participants; a split rule — equal, exact per-user
amounts, or percentages — determines how much each participant owes
toward that expense; the system reports the net balance between any two
users at any time, reflecting every expense that's ever touched that
pair.

**Non-functional**: adding a new split rule (e.g., weighted shares)
must require zero changes to `Ledger` or `ExpenseManager`'s core
`addExpense` flow (DIP, module 04; Strategy, module 08); balance state
for a given user pair must have exactly one authoritative
representation — never two independently-updated values that could
disagree.

**Assumptions stated up front** (module 11, step 1): expenses are
one-off, not recurring; a single implicit currency, no conversion;
editing an already-recorded expense's participants after the fact is
out of scope (named as an extension below) — once computed, a split is
final.

## Entities and relationships

Applying module 11's steps 3–4: `ExpenseManager o-- Ledger`
(composition — one manager, one ledger); `ExpenseManager --> Expense`
(creates, many, one per `addExpense` call); `Expense o-- Split` (many —
one per participant); `Split --> User`, `Expense --> User` (paidBy);
`EqualSplitStrategy`, `ExactSplitStrategy`, `PercentSplitStrategy
..|> SplitStrategy` (realize — Strategy, module 08, injected per call
rather than stored — DIP, module 04).

## Class diagram

```
┌────────────────┐      ┌────────────────┐
│ ExpenseManager │ o──  │     Ledger     │
├────────────────┤      ├────────────────┤
│ - ledger       │      │ - balances     │
│ - expenses     │      ├────────────────┤
├────────────────┤      │ + adjust()     │
│ + addExpense() │      │ + getBalance() │
│ + getBalance() │      └────────────────┘
└────────────────┘

ExpenseManager --> Expense   (creates one per addExpense() call)
Expense o── Split   (many — one per participant)

┌──────────┐      ┌────────────────┐
│ Expense  │ -->  │      User      │
├──────────┤      ├────────────────┤
│ - paidBy │      │ - userId, name │
│ - amount │      └────────────────┘
│ - splits │
└──────────┘

┌──────────┐      ┌────────────────┐
│  Split   │ -->  │      User      │
├──────────┤      ├────────────────┤
│ - user   │      │ - userId, name │
│ - amount │      └────────────────┘
└──────────┘

SplitStrategy (interface) <── EqualSplitStrategy, ExactSplitStrategy, PercentSplitStrategy   (Strategy, module 08)
```

## Implementation

A note on `Ledger`'s sign convention before reading the code, since
it's the one thing worth getting straight up front: `getBalance(a, b)`
returns a **positive** number when **a owes b**, and **negative** when
**b owes a**. `getBalance(b, a)` always returns the exact negation of
`getBalance(a, b)` — there's one stored number per pair; only the sign
depends on which way you ask.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod
from dataclasses import dataclass

class User:
    def __init__(self, user_id: str, name: str):
        self.user_id = user_id
        self.name = name

@dataclass(frozen=True)                        # value object, module 03
class Split:
    user: User
    amount: float

class SplitStrategy(ABC):                      # Strategy, module 08
    @abstractmethod
    def compute_splits(self, amount: float, participants: list[User], **kwargs) -> list[Split]: ...

class EqualSplitStrategy(SplitStrategy):
    def compute_splits(self, amount, participants, **kwargs):
        share = round(amount / len(participants), 2)
        splits = [Split(user, share) for user in participants[:-1]]
        last_share = round(amount - share * (len(participants) - 1), 2)   # last absorbs the rounding remainder
        splits.append(Split(participants[-1], last_share))
        return splits

class ExactSplitStrategy(SplitStrategy):
    def compute_splits(self, amount, participants, exact_amounts: dict[str, float] = None, **kwargs):
        total = round(sum(exact_amounts.values()), 2)
        if total != round(amount, 2):
            raise ValueError(f"Exact amounts ({total}) must sum to the expense total ({amount})")
        return [Split(user, exact_amounts[user.user_id]) for user in participants]

class PercentSplitStrategy(SplitStrategy):
    def compute_splits(self, amount, participants, percentages: dict[str, float] = None, **kwargs):
        total_pct = round(sum(percentages.values()), 2)
        if total_pct != 100.0:
            raise ValueError(f"Percentages ({total_pct}) must sum to 100")
        return [Split(user, round(amount * percentages[user.user_id] / 100, 2)) for user in participants]

class Ledger:                                   # single source of truth per user pair — no a->b AND b->a dicts to drift
    def __init__(self):
        self.balances: dict[tuple[str, str], float] = {}   # (smaller_id, larger_id) -> amount smaller owes larger

    def _key(self, a: str, b: str) -> tuple[str, str]:
        return (a, b) if a < b else (b, a)

    def adjust(self, ower_id: str, owed_to_id: str, amount: float):
        a, b = self._key(ower_id, owed_to_id)
        sign = 1 if ower_id == a else -1
        self.balances[(a, b)] = round(self.balances.get((a, b), 0.0) + sign * amount, 2)

    def get_balance(self, user_a_id: str, user_b_id: str) -> float:  # positive: a owes b; negative: b owes a
        a, b = self._key(user_a_id, user_b_id)
        net = self.balances.get((a, b), 0.0)
        return net if user_a_id == a else -net

class Expense:
    def __init__(self, paid_by: User, amount: float, splits: list[Split]):
        self.paid_by = paid_by
        self.amount = amount
        self.splits = splits

class ExpenseManager:
    def __init__(self):
        self.ledger = Ledger()
        self.expenses: list[Expense] = []

    def add_expense(self, paid_by: User, amount: float, participants: list[User],
                     strategy: SplitStrategy, **kwargs) -> Expense:
        splits = strategy.compute_splits(amount, participants, **kwargs)
        expense = Expense(paid_by, amount, splits)
        self.expenses.append(expense)

        for split in splits:
            if split.user.user_id != paid_by.user_id:
                self.ledger.adjust(ower_id=split.user.user_id, owed_to_id=paid_by.user_id, amount=split.amount)
        return expense

    def get_balance(self, user_a: User, user_b: User) -> float:
        return self.ledger.get_balance(user_a.user_id, user_b.user_id)

# usage
alice, bob, charlie = User("U1", "Alice"), User("U2", "Bob"), User("U3", "Charlie")
manager = ExpenseManager()

manager.add_expense(alice, 90.0, [alice, bob, charlie], EqualSplitStrategy())
print(f"Bob owes Alice: {manager.get_balance(bob, alice)}")          # 30.0

manager.add_expense(bob, 40.0, [alice, bob], ExactSplitStrategy(), exact_amounts={"U1": 25.0, "U2": 15.0})
print(f"Alice-Bob net: {manager.get_balance(alice, bob)}")           # -5.0: Bob was owed 30, Alice's new $25 share nets it to Bob-owed-5

manager.add_expense(charlie, 100.0, [alice, bob, charlie], PercentSplitStrategy(),
                     percentages={"U1": 50.0, "U2": 25.0, "U3": 25.0})
print(f"Alice-Charlie net: {manager.get_balance(alice, charlie)}")   # 20.0
```
{{tab C#}}
```csharp
public class User {
    public string UserId, Name;
    public User(string userId, string name) { UserId = userId; Name = name; }
}

public class Split {                                    // value object, module 03
    public User User; public double Amount;
    public Split(User user, double amount) { User = user; Amount = amount; }
}

public interface ISplitStrategy {                       // Strategy, module 08
    List<Split> ComputeSplits(double amount, List<User> participants, Dictionary<string, double> shares);
}

public class EqualSplitStrategy : ISplitStrategy {
    public List<Split> ComputeSplits(double amount, List<User> participants, Dictionary<string, double> shares) {
        double share = Math.Round(amount / participants.Count, 2);
        var splits = new List<Split>();
        for (int i = 0; i < participants.Count - 1; i++) splits.Add(new Split(participants[i], share));
        double lastShare = Math.Round(amount - share * (participants.Count - 1), 2);  // last absorbs the rounding remainder
        splits.Add(new Split(participants[^1], lastShare));
        return splits;
    }
}

public class ExactSplitStrategy : ISplitStrategy {
    public List<Split> ComputeSplits(double amount, List<User> participants, Dictionary<string, double> shares) {
        double total = Math.Round(shares.Values.Sum(), 2);
        if (total != Math.Round(amount, 2))
            throw new ArgumentException($"Exact amounts ({total}) must sum to the expense total ({amount})");
        return participants.Select(u => new Split(u, shares[u.UserId])).ToList();
    }
}

public class PercentSplitStrategy : ISplitStrategy {
    public List<Split> ComputeSplits(double amount, List<User> participants, Dictionary<string, double> shares) {
        double totalPct = Math.Round(shares.Values.Sum(), 2);
        if (totalPct != 100.0)
            throw new ArgumentException($"Percentages ({totalPct}) must sum to 100");
        return participants.Select(u => new Split(u, Math.Round(amount * shares[u.UserId] / 100, 2))).ToList();
    }
}

public class Ledger {                                    // single source of truth per user pair — no a->b AND b->a dicts to drift
    private Dictionary<(string, string), double> _balances = new Dictionary<(string, string), double>();

    private (string, string) Key(string a, string b) => string.CompareOrdinal(a, b) < 0 ? (a, b) : (b, a);

    public void Adjust(string owerId, string owedToId, double amount) {
        var (a, b) = Key(owerId, owedToId);
        int sign = owerId == a ? 1 : -1;
        _balances.TryGetValue((a, b), out double current);
        _balances[(a, b)] = Math.Round(current + sign * amount, 2);
    }

    public double GetBalance(string userAId, string userBId) {   // positive: a owes b; negative: b owes a
        var (a, b) = Key(userAId, userBId);
        _balances.TryGetValue((a, b), out double net);
        return userAId == a ? net : -net;
    }
}

public class Expense {
    public User PaidBy; public double Amount; public List<Split> Splits;
    public Expense(User paidBy, double amount, List<Split> splits) { PaidBy = paidBy; Amount = amount; Splits = splits; }
}

public class ExpenseManager {
    public Ledger Ledger = new Ledger();
    public List<Expense> Expenses = new List<Expense>();

    public Expense AddExpense(User paidBy, double amount, List<User> participants,
                               ISplitStrategy strategy, Dictionary<string, double> shares = null) {
        var splits = strategy.ComputeSplits(amount, participants, shares ?? new Dictionary<string, double>());
        var expense = new Expense(paidBy, amount, splits);
        Expenses.Add(expense);

        foreach (var split in splits) {
            if (split.User.UserId != paidBy.UserId)
                Ledger.Adjust(split.User.UserId, paidBy.UserId, split.Amount);
        }
        return expense;
    }

    public double GetBalance(User userA, User userB) => Ledger.GetBalance(userA.UserId, userB.UserId);
}

// usage
var alice = new User("U1", "Alice");
var bob = new User("U2", "Bob");
var charlie = new User("U3", "Charlie");
var manager = new ExpenseManager();

manager.AddExpense(alice, 90.0, new List<User> { alice, bob, charlie }, new EqualSplitStrategy());
Console.WriteLine($"Bob owes Alice: {manager.GetBalance(bob, alice)}");          // 30.0

manager.AddExpense(bob, 40.0, new List<User> { alice, bob }, new ExactSplitStrategy(),
    new Dictionary<string, double> { ["U1"] = 25.0, ["U2"] = 15.0 });
Console.WriteLine($"Alice-Bob net: {manager.GetBalance(alice, bob)}");           // -5.0

manager.AddExpense(charlie, 100.0, new List<User> { alice, bob, charlie }, new PercentSplitStrategy(),
    new Dictionary<string, double> { ["U1"] = 50.0, ["U2"] = 25.0, ["U3"] = 25.0 });
Console.WriteLine($"Alice-Charlie net: {manager.GetBalance(alice, charlie)}");   // 20.0
```
{{/tabs}}

## Tradeoffs and extensions

- **`Ledger` stores exactly one value per pair, keyed by sorted
  IDs.** Whichever direction you call `getBalance` from, the sign is
  derived, not separately stored — this is the design's central
  guarantee: there's no second copy that could ever disagree with the
  first.
- **`EqualSplitStrategy`'s last-participant-absorbs-the-remainder is a
  named simplification.** Splitting $10 three ways gives $3.33, $3.33,
  and the last participant gets $3.34 so the splits sum exactly to
  $10. A real system might round-robin the leftover cent(s) instead —
  that's a fair extension (exercise 3), not a bug in this version.
- **`ExactSplitStrategy` and `PercentSplitStrategy` validate their
  inputs and raise immediately on mismatch**, rather than silently
  proceeding with a split that doesn't actually sum to the expense
  total — fail fast at the boundary instead of letting bad data enter
  the ledger.
- **`SplitStrategy.computeSplits` takes participants and shares as
  method parameters, not constructor arguments.** One
  `EqualSplitStrategy` instance is reusable across every `addExpense`
  call in the system; baking per-expense data into the strategy object
  itself would mean constructing a new one for every single expense.

## Hands-on exercises

### 1. Add a weighted-share split

Implement `ShareSplitStrategy`, splitting proportionally to arbitrary
weights (e.g., 2:1:1 instead of equal thirds) rather than a fixed
percentage. Confirm it requires no changes to `ExpenseManager` or
`Ledger`.

### 2. Report every balance for one user

Add `get_all_balances(user)`/`GetAllBalances(user)` to `ExpenseManager`,
returning every nonzero balance the given user currently has with
anyone they've ever transacted with.

### 3. Round-robin the rounding remainder

Change `EqualSplitStrategy` so an unevenly-divisible amount distributes
its leftover cent(s) across participants round-robin instead of
dumping all of it on the last participant. Confirm splits still sum
exactly to the original amount for a case like $10 split three ways.

### 4. Undo an expense

Add a method that reverses a specific `Expense`'s effect on the ledger
exactly — hint: call `ledger.adjust` again with each split's amount
negated, for the same (ower, paidBy) pairs.

### 5. Validate expense inputs at the boundary

Make `add_expense`/`AddExpense` raise a clear error if `participants`
is empty or if `paid_by`/`paidBy` isn't present in `participants` —
validate once, at the entry point, rather than letting bad input reach
`SplitStrategy` or `Ledger`.

## Independent challenge

No code given.

**Task:** Implement debt simplification — given the full set of
pairwise balances a `Ledger` has accumulated across many users, compute
a minimal set of settling transactions (fewer, larger payments instead
of many small pairwise ones). Expose it as
`simplify_debts()`/`SimplifyDebts()`, returning a list of
`(from_user, to_user, amount)` transactions. Confirm correctness by
applying every returned transaction into a *fresh* `Ledger` and checking
that each user's **net position** (total owed to them minus total they
owe, summed across everyone) exactly matches their net position in the
original — even though who-pays-whom is now different.

<details>
<summary>Hint</summary>

Don't try to simplify pairwise balances directly. First collapse the
whole multi-party graph into one number per person: each user's net
position is the sum of `get_balance(user, other)` across every other
user they have a nonzero balance with (owed money nets positive, owed
*to* others nets negative — pick a sign convention and state it, same
as `Ledger` does). Once you have a list of net creditors (positive) and
net debtors (negative), repeatedly match the largest creditor against
the largest debtor, settle the smaller of the two amounts, and reduce
both — this greedy min-cash-flow approach is the standard answer to
this exact interview extension.

</details>

## Common mistakes & troubleshooting

- **Storing balances in two independent dicts** (e.g., `debts[a][b]`
  and `debts[b][a]`, each updated separately). These two numbers must
  always be exact negatives of each other — any update path that
  touches one without the other (or gets a sign wrong) lets them drift,
  silently. Store exactly one value per pair, the way `Ledger` does.
- **Comparing floating-point split totals for equality without
  rounding first.** Accumulated floating-point error can make a
  mathematically-exact split fail a raw `==` check; round to cents
  before comparing, as `ExactSplitStrategy` and `PercentSplitStrategy`
  both do.
- **Giving every participant in `EqualSplitStrategy` the same rounded
  share, including the last one.** For amounts that don't divide
  evenly, the splits then sum to slightly more or less than the actual
  expense — one participant must absorb the rounding remainder so the
  total matches exactly.
- **Skipping the payer entirely when computing splits**, instead of
  computing their share and only skipping the *ledger adjustment* for
  it. The payer's own share still needs to be computed — it's part of
  what the total gets divided into — even though they never owe
  themselves money.
- **Treating `get_balance(a, b)` and `get_balance(b, a)` as two
  unrelated numbers** instead of exact negations of each other. Every
  caller needs to know the sign convention (this module: positive means
  the first argument owes the second) and rely on it consistently.

## Checkpoint quiz

1. Why does `Ledger` store exactly one value per user pair instead of
   two separate directional values?
2. What does a positive vs. a negative return from
   `get_balance(a, b)`/`GetBalance(a, b)` mean?
3. Why does `EqualSplitStrategy` give the last participant a different
   calculation than everyone else?
4. Why do `ExactSplitStrategy` and `PercentSplitStrategy` validate
   their inputs and raise on mismatch, rather than silently proceeding?
5. Why does `SplitStrategy.computeSplits` take participants and shares
   as method parameters instead of the strategy being constructed once
   per expense with that data baked in?

<details>
<summary>Answers</summary>

1. Because the two directions are mathematically forced to be exact
   negatives of each other — storing them separately creates two
   values that could disagree after a bug, whereas storing one value
   and deriving the sign from the query direction makes disagreement
   structurally impossible.
2. Positive means the first argument (`a`) owes the second (`b`);
   negative means `b` owes `a`. This is `Ledger`'s stated sign
   convention, and every caller must rely on it consistently rather
   than guessing.
3. Dividing the amount evenly and rounding to cents can leave a
   leftover fraction of a cent unaccounted for when the amount doesn't
   divide evenly by the participant count. Giving every participant
   the same rounded share would make the splits sum to slightly more
   or less than the actual total — the last participant absorbing the
   remainder keeps the sum exact.
4. To fail fast at the boundary (module 02 fundamentals) — silently
   accepting exact amounts or percentages that don't actually sum
   correctly would let an inconsistent split enter the ledger, and the
   resulting balance error would be far harder to trace back to its
   source later.
5. So one strategy instance is reusable across every `addExpense` call
   in the system. If participant/share data were baked into the
   strategy at construction, a new strategy object would be needed for
   every single expense instead of once per split *type*.

</details>

## Interview questions

1. **"How would you support multiple ways to split an expense — equal,
   exact amounts, percentages?"**
   A `SplitStrategy` interface with one method, `computeSplits`, and a
   concrete class per split type (Strategy, module 08). `ExpenseManager`
   depends only on the interface (DIP, module 04), so a new split rule
   is a new class with zero changes to `ExpenseManager` or `Ledger`.
2. **"How do you track balances between users without the numbers
   drifting out of sync?"**
   Store exactly one value per user pair, keyed by a canonical (e.g.,
   sorted) ordering of the two IDs, and derive the sign from which
   direction the caller queries — never store the same fact twice in
   two independently-updated places.
3. **"How would you extend this to minimize the number of settling
   transactions across a group?"**
   Collapse every user's pairwise balances into one net position (total
   owed to them minus total they owe), then greedily match the largest
   net creditor against the largest net debtor, settling the smaller
   amount and repeating — the classic minimum-cash-flow approach,
   addable on top of `Ledger` without changing how individual expenses
   are recorded.
4. **"What happens when an amount doesn't divide evenly among
   participants — say, $10 split three ways?"**
   Each of the first N-1 participants gets the rounded per-person share
   ($3.33), and the last participant gets whatever's left ($3.34), so
   the splits always sum exactly to the original amount rather than
   drifting by a rounding error.
5. **"Why validate exact and percentage splits inside the strategy
   itself instead of trusting the caller to pass correct data?"**
   Because the boundary where external data enters the system (module
   02 fundamentals: validate at construction/entry, not deep inside) is
   exactly where a mismatched split should be rejected — catching it
   there produces a clear, immediate error instead of a silently wrong
   balance that's much harder to trace back later.

## Further reading & sources

- [Refactoring.Guru: Strategy pattern](https://refactoring.guru/design-patterns/strategy) - revisit module 08's pattern, applied here with per-call rather than per-instance configuration.
- [Python: Floating-Point Arithmetic — Issues and Limitations](https://docs.python.org/3/tutorial/floatingpoint.html) - why split amounts are rounded to cents before comparison, in both `ExactSplitStrategy` and `Ledger`.
- [Microsoft Learn: `Math.Round`](https://learn.microsoft.com/en-us/dotnet/api/system.math.round) - the C# equivalent rounding behavior used throughout the C# implementation.

## Next

[16-movie-ticket-booking](../16-movie-ticket-booking/README.md)
— a full guided solution for a seat-selection ticket-booking system,
BookMyShow-style.
