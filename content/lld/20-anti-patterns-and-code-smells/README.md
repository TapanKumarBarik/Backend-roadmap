# Module 20: Anti-Patterns & Code Smells

## Why this matters

Every module so far taught a principle or pattern by building *toward*
it. This module runs the tape backward: given a class, recognize which
principle it's violating, by name, fast — because "here's some code,
what's wrong with it?" is the actual opening move in most LLD
interviews, not "design something from scratch." Every anti-pattern
below is a smell this track already has the vocabulary and the fix
for — SRP (module 04), real OOP encapsulation (module 02), the Law of
Demeter (module 05), value objects (module 03). This module's job is
pattern-matching real code against that vocabulary, not introducing
new mechanics.

## Concepts

### God Object

A class that accumulates unrelated responsibilities until it does
almost everything — the most commonly cited LLD smell, and a direct
SRP (module 04) violation wearing a different name.

{{tabs}}
{{tab Python}}
```python
# VIOLATION: God Object — one class doing validation, hashing, email, and persistence
class UserManagerBad:
    def __init__(self):
        self.users = {}

    def register(self, email: str, password: str) -> bool:
        if "@" not in email:                                   # validation
            return False
        hashed = f"hashed:{password}"                            # password hashing
        print(f"Sending welcome email to {email}")               # email
        self.users[email] = hashed                               # persistence
        return True
```

```python
# FIXED: one focused class per responsibility, UserManager only coordinates
class EmailValidator:
    def is_valid(self, email: str) -> bool:
        return "@" in email

class PasswordHasher:
    def hash(self, password: str) -> str:
        return f"hashed:{password}"

class WelcomeEmailSender:
    def send(self, email: str):
        print(f"Sending welcome email to {email}")

class UserRepository:
    def __init__(self):
        self._users: dict[str, str] = {}

    def save(self, email: str, hashed_password: str):
        self._users[email] = hashed_password

class UserManager:                    # coordinates — doesn't do any of the work itself
    def __init__(self, validator: EmailValidator, hasher: PasswordHasher,
                 emailer: WelcomeEmailSender, repository: UserRepository):
        self._validator = validator
        self._hasher = hasher
        self._emailer = emailer
        self._repository = repository

    def register(self, email: str, password: str) -> bool:
        if not self._validator.is_valid(email):
            return False
        self._repository.save(email, self._hasher.hash(password))
        self._emailer.send(email)
        return True
```
{{tab C#}}
```csharp
// VIOLATION: God Object — one class doing validation, hashing, email, and persistence
public class UserManagerBad {
    private Dictionary<string, string> _users = new Dictionary<string, string>();

    public bool Register(string email, string password) {
        if (!email.Contains("@")) return false;                 // validation
        string hashed = $"hashed:{password}";                    // password hashing
        Console.WriteLine($"Sending welcome email to {email}");  // email
        _users[email] = hashed;                                   // persistence
        return true;
    }
}
```

```csharp
// FIXED: one focused class per responsibility, UserManager only coordinates
public class EmailValidator {
    public bool IsValid(string email) => email.Contains("@");
}

public class PasswordHasher {
    public string Hash(string password) => $"hashed:{password}";
}

public class WelcomeEmailSender {
    public void Send(string email) => Console.WriteLine($"Sending welcome email to {email}");
}

public class UserRepository {
    private Dictionary<string, string> _users = new Dictionary<string, string>();
    public void Save(string email, string hashedPassword) => _users[email] = hashedPassword;
}

public class UserManager {                // coordinates — doesn't do any of the work itself
    private EmailValidator _validator;
    private PasswordHasher _hasher;
    private WelcomeEmailSender _emailer;
    private UserRepository _repository;

    public UserManager(EmailValidator validator, PasswordHasher hasher,
                        WelcomeEmailSender emailer, UserRepository repository) {
        _validator = validator; _hasher = hasher; _emailer = emailer; _repository = repository;
    }

    public bool Register(string email, string password) {
        if (!_validator.IsValid(email)) return false;
        _repository.Save(email, _hasher.Hash(password));
        _emailer.Send(email);
        return true;
    }
}
```
{{/tabs}}

### Anemic Domain Model

The mirror image of a God Object — instead of one class hoarding all
behavior, an object is reduced to a passive bag of fields while every
operation on it lives in a separate "service" that reaches into its
internals from outside. Real encapsulation (module 02) means behavior
lives *with* the data it governs, not next to it in another class.

{{tabs}}
{{tab Python}}
```python
# VIOLATION: anemic domain model — Order is a data bag; all behavior lives outside it, reaching into its fields
class OrderBad:
    def __init__(self):
        self.items: list[float] = []
        self.status = "OPEN"

class OrderServiceBad:
    def add_item(self, order: OrderBad, price: float):
        order.items.append(price)                    # reaches into Order's internals from outside

    def total(self, order: OrderBad) -> float:
        return sum(order.items)                       # logic about Order lives in a totally separate class

    def cancel(self, order: OrderBad):
        if order.status == "SHIPPED":                 # the rule "can't cancel once shipped" lives outside Order
            raise ValueError("Cannot cancel a shipped order")
        order.status = "CANCELLED"
```

```python
# FIXED: behavior moves onto Order itself — the object protects its own invariants
class Order:
    def __init__(self):
        self._items: list[float] = []
        self._status = "OPEN"

    def add_item(self, price: float):
        self._items.append(price)

    def total(self) -> float:
        return sum(self._items)

    def cancel(self):
        if self._status == "SHIPPED":                 # the rule now lives with the data it governs
            raise ValueError("Cannot cancel a shipped order")
        self._status = "CANCELLED"

    @property
    def status(self) -> str:
        return self._status
```
{{tab C#}}
```csharp
// VIOLATION: anemic domain model — Order is a data bag; all behavior lives outside it, reaching into its fields
public class OrderBad {
    public List<double> Items = new List<double>();
    public string Status = "OPEN";
}

public class OrderServiceBad {
    public void AddItem(OrderBad order, double price) => order.Items.Add(price);   // reaches into Order's internals
    public double Total(OrderBad order) => order.Items.Sum();                       // logic lives outside Order

    public void Cancel(OrderBad order) {
        if (order.Status == "SHIPPED")                 // the rule "can't cancel once shipped" lives outside Order
            throw new InvalidOperationException("Cannot cancel a shipped order");
        order.Status = "CANCELLED";
    }
}
```

```csharp
// FIXED: behavior moves onto Order itself — the object protects its own invariants
public class Order {
    private List<double> _items = new List<double>();
    public string Status { get; private set; } = "OPEN";

    public void AddItem(double price) => _items.Add(price);
    public double Total() => _items.Sum();

    public void Cancel() {
        if (Status == "SHIPPED")                        // the rule now lives with the data it governs
            throw new InvalidOperationException("Cannot cancel a shipped order");
        Status = "CANCELLED";
    }
}
```
{{/tabs}}

### Tight coupling ("train wreck" chains)

A caller that reaches through one object into another, into another,
to get what it actually wants — every link in the chain is now a
dependency the caller carries, even though it only cared about the
last one. This is the Law of Demeter (module 05) violation in its most
recognizable shape.

{{tabs}}
{{tab Python}}
```python
# VIOLATION: "train wreck" chaining — caller reaches through Customer into Wallet's internals
class WalletBad:
    def __init__(self, balance: float):
        self.balance = balance

class CustomerBad:
    def __init__(self, wallet: WalletBad):
        self.wallet = wallet

def checkout_bad(customer: CustomerBad, amount: float):
    if customer.wallet.balance < amount:                 # reaches through Customer into Wallet's internals
        raise ValueError("Insufficient funds")
    customer.wallet.balance -= amount                     # caller now depends on Wallet's internal shape too
```

```python
# FIXED: Customer exposes a behavior; the caller never reaches past it (Law of Demeter, module 05)
class Wallet:
    def __init__(self, balance: float):
        self._balance = balance

    def has_at_least(self, amount: float) -> bool:
        return self._balance >= amount

    def deduct(self, amount: float):
        self._balance -= amount

class Customer:
    def __init__(self, wallet: Wallet):
        self._wallet = wallet

    def pay(self, amount: float):                          # Customer talks to its own Wallet — caller doesn't reach through
        if not self._wallet.has_at_least(amount):
            raise ValueError("Insufficient funds")
        self._wallet.deduct(amount)

def checkout(customer: Customer, amount: float):
    customer.pay(amount)                                    # one message to one direct collaborator
```
{{tab C#}}
```csharp
// VIOLATION: "train wreck" chaining — caller reaches through Customer into Wallet's internals
public class WalletBad {
    public double Balance;
    public WalletBad(double balance) { Balance = balance; }
}

public class CustomerBad {
    public WalletBad Wallet;
    public CustomerBad(WalletBad wallet) { Wallet = wallet; }
}

public class CheckoutBad {
    public void Checkout(CustomerBad customer, double amount) {
        if (customer.Wallet.Balance < amount)                 // reaches through Customer into Wallet's internals
            throw new InvalidOperationException("Insufficient funds");
        customer.Wallet.Balance -= amount;
    }
}
```

```csharp
// FIXED: Customer exposes a behavior; the caller never reaches past it (Law of Demeter, module 05)
public class Wallet {
    private double _balance;
    public Wallet(double balance) { _balance = balance; }
    public bool HasAtLeast(double amount) => _balance >= amount;
    public void Deduct(double amount) => _balance -= amount;
}

public class Customer {
    private Wallet _wallet;
    public Customer(Wallet wallet) { _wallet = wallet; }

    public void Pay(double amount) {                          // Customer talks to its own Wallet
        if (!_wallet.HasAtLeast(amount)) throw new InvalidOperationException("Insufficient funds");
        _wallet.Deduct(amount);
    }
}

public class Checkout {
    public void Process(Customer customer, double amount) => customer.Pay(amount);   // one message to one collaborator
}
```
{{/tabs}}

### Primitive Obsession

Using raw strings, floats, and ints for things that actually carry
rules — a valid email format, a currency-aware amount — instead of a
small value object (module 03). The rule ends up either duplicated at
every call site or missing entirely at some of them.

{{tabs}}
{{tab Python}}
```python
# VIOLATION: primitive obsession — raw str/float everywhere, no single place enforces "is this valid?"
class EmployeeBad:
    def __init__(self, email: str, salary: float, currency: str):
        self.email = email             # nothing stops an invalid email from ever being constructed
        self.salary = salary
        self.currency = currency       # nothing stops mismatched amount/currency pairs from being compared

def give_raise_bad(employee: EmployeeBad, amount: float, currency: str):
    if currency != employee.currency:                      # every call site has to remember to check this itself
        raise ValueError("Currency mismatch")
    employee.salary += amount
```

```python
# FIXED: value objects (module 03) make invalid states unrepresentable, and centralize the rules
from dataclasses import dataclass

@dataclass(frozen=True)
class Email:
    value: str

    def __post_init__(self):
        if "@" not in self.value:
            raise ValueError(f"Invalid email: {self.value}")

@dataclass(frozen=True)
class Money:
    amount: float
    currency: str

    def __add__(self, other: "Money") -> "Money":
        if other.currency != self.currency:                # the rule lives in exactly one place now
            raise ValueError("Currency mismatch")
        return Money(self.amount + other.amount, self.currency)

class Employee:
    def __init__(self, email: Email, salary: Money):
        self.email = email
        self.salary = salary

    def give_raise(self, amount: Money):
        self.salary = self.salary + amount
```
{{tab C#}}
```csharp
// VIOLATION: primitive obsession — raw string/double everywhere, no single place enforces "is this valid?"
public class EmployeeBad {
    public string Email; public double Salary; public string Currency;
    public EmployeeBad(string email, double salary, string currency) {
        Email = email; Salary = salary; Currency = currency;    // nothing rejects an invalid email here
    }
}
```

```csharp
// FIXED: value objects (module 03) make invalid states unrepresentable, and centralize the rules
public readonly struct Email {
    public readonly string Value;
    public Email(string value) {
        if (!value.Contains("@")) throw new ArgumentException($"Invalid email: {value}");
        Value = value;
    }
}

public readonly struct Money {
    public readonly double Amount; public readonly string Currency;
    public Money(double amount, string currency) { Amount = amount; Currency = currency; }

    public static Money operator +(Money a, Money b) {
        if (a.Currency != b.Currency) throw new InvalidOperationException("Currency mismatch");  // rule lives in one place
        return new Money(a.Amount + b.Amount, a.Currency);
    }
}

public class Employee {
    public Email Email; public Money Salary;
    public Employee(Email email, Money salary) { Email = email; Salary = salary; }
    public void GiveRaise(Money amount) => Salary = Salary + amount;
}
```
{{/tabs}}

## Hands-on exercises

Do each in both languages.

### 1. Find and fix a God Object

Take a `ReportGenerator` class that fetches data, calculates
statistics, formats output, saves to disk, *and* emails the result —
all in one class. Split it the same way `UserManagerBad` was split
above.

### 2. Enrich an anemic model

Take an `Account` whose balance is only ever changed by an external
`AccountService.withdraw(account, amount)` function that checks and
mutates `account.balance` directly. Move `withdraw` onto `Account`
itself, with the insufficient-funds check as part of the method, not a
separate step the caller has to remember.

### 3. Untangle a train wreck

Given `order.get_customer().get_address().get_city()` used to print a
shipping label, add a single `order.shipping_city()` method that
returns the same value, and update the caller to use only that.

### 4. Replace a stringly-typed status

Take a codebase using raw string literals (`"PENDING"`, `"PAID"`,
`"SHIPPED"`) compared directly in `if` statements scattered across
several classes. Replace them with an enum, and let your language's
type checker/compiler find every place that needs updating.

### 5. Spot Shotgun Surgery

Given a hypothetical change request ("add a loyalty-points bonus to
every purchase") that, in a specific poorly-organized codebase, would
require editing five unrelated classes to implement, identify what
poor cohesion caused that spread and consolidate the purchase-related
logic into fewer, more cohesive places.

## Independent challenge

No code given.

**Task:** Pick one classic-problem module from earlier in this track
(e.g., module 13's `Library`, module 16's `Show`, or module 17's
`RideManager`) and write a short **code-smell audit**: identify one
plausible future feature (drawn from that module's own hands-on
exercises) that, if added carelessly as more methods piled onto the
same core class, would start tipping it toward a God Object or an
anemic split. Then explain what's *already* in that module's design —
an injected Strategy, an Observer, a repository-like collection — that
gives you a natural seam to extend into instead of piling onto the
core class.

<details>
<summary>Hint</summary>

Look specifically at `Library`'s checkout/reserve/return trio or
`RideManager`'s request/complete/cancel trio. Ask: if fines, ratings,
receipts, and notifications were each added as more methods directly
on the same class rather than as new collaborator classes injected the
way `SplitStrategy` or `DriverMatchingStrategy` were, at what point
does the class stop having one reason to change? The seam you're
looking for is usually already visible in how the module's *existing*
dependencies were injected, not something you have to invent from
scratch.

</details>

## Common mistakes & troubleshooting

- **Treating every large class as a God Object without checking
  whether its size comes from one cohesive responsibility** (many
  small, related methods) versus several unrelated ones. SRP (module
  04) is about reasons to change, not line count — a class with ten
  methods that all serve one clear purpose isn't a God Object.
- **Over-correcting an anemic model by moving *every* operation onto
  the entity**, including ones that legitimately span multiple
  objects. An `Order.ship_via(carrier)` that also has to call an
  external shipping API is orchestration, not something `Order` alone
  can own — that belongs in a service; only `Order`'s own state
  changes belong on `Order`.
- **Fixing one train-wreck chain but leaving the underlying object
  graph exposed everywhere else.** The actual fix is exposing
  *behavior* (`pay()`), not hiding one particular chain while every
  other caller still reaches straight through the same objects.
- **Introducing a value object for validation but forgetting to make
  it actually immutable.** A "value object" whose fields can still be
  mutated after construction doesn't make invalid states
  unrepresentable — it just delays when they become representable.
- **Applying these fixes regardless of scale.** A two-field,
  internal-only struct doesn't need full value-object ceremony with
  custom validation and equality; matching the fix to what the code
  actually needs — not more — is itself part of the judgment (YAGNI,
  module 05).

## Checkpoint quiz

1. What's the actual definition of a God Object — is it about class
   size, or something else?
2. In what sense is an Anemic Domain Model the mirror image of a God
   Object, given they look like opposites?
3. What replaces a "train wreck" chain like `a.getB().getC().getD()`,
   and why does the fix reduce coupling rather than just hide it?
4. Why does wrapping a primitive in a value object with constructor
   validation prevent bugs that a scattered `if` check at every call
   site can't reliably prevent?
5. Name one situation where applying one of this module's fixes would
   be overkill.

<details>
<summary>Answers</summary>

1. It's about *reasons to change*, not size. A God Object accumulates
   multiple unrelated responsibilities — several independent axes
   along which requirements can shift, each forcing an edit to the
   same class — which is exactly SRP's (module 04) definition of a
   violation, just given a more memorable name.
2. Both put behavior in the wrong place relative to data. A God Object
   pulls too much behavior *into* one class; an anemic model pushes
   all behavior *out* of the class that should own it, into an
   external service. Neither keeps behavior located with the data it
   actually governs.
3. Exposing a behavior method on the object the caller already has
   (`customer.pay(amount)`) instead of reaching through it. This
   reduces coupling — not just hides it — because the caller no longer
   depends on `Wallet`'s existence or shape at all; only `Customer`'s
   public behavior.
4. Because constructor validation makes the invalid state impossible
   to construct in the first place — there's no code path that skips
   it. A scattered `if` check only works if every single call site
   remembers to include it, and any one omission lets an invalid value
   through undetected.
5. Any answer describing ceremony disproportionate to the actual risk
   — e.g., building a fully validated, custom-equality value object
   for an internal-only, two-field struct that's never exposed outside
   one small function and carries no real invariant to protect.

</details>

## Interview questions

1. **"Here's a class — what's wrong with it?"** (handed a God Object)
   Walk through what responsibilities it holds, group them by "reason
   to change" (module 04's SRP), and propose one focused class per
   group, with the original class reduced to coordinating between them
   — the same shape as the `UserManagerBad` → `UserManager` refactor.
2. **"This `Order` class has no methods, just fields, and an
   `OrderService` does everything to it — what's the issue?"**
   It's an anemic domain model: behavior that belongs with `Order`'s
   own state (like the "can't cancel a shipped order" rule) lives
   somewhere else entirely, so nothing actually protects `Order`'s
   invariants — any code with a reference to it can mutate it into an
   invalid state without `Order` ever getting a say.
3. **"How would you refactor `a.getB().getC().getD()`?"**
   Add a method to `a` that returns what the caller actually needs,
   computed internally by walking that chain itself — the caller
   should send one message to one direct collaborator (Law of
   Demeter, module 05), not reach through three.
4. **"Why use a value object instead of a raw string or float for
   something like an email address or a money amount?"**
   A value object (module 03) centralizes validation at construction,
   making an invalid instance impossible to create — versus a raw
   primitive, where every call site that cares about validity has to
   remember to check it independently, and any one omission is a bug.
5. **"How do you avoid over-applying these fixes and creating needless
   ceremony?"**
   Match the fix to the actual risk: a value object earns its keep
   when a rule is genuinely duplicated or missed across multiple call
   sites; splitting a class earns its keep when it genuinely has
   multiple independent reasons to change. Applying either fix to code
   that doesn't have that problem is YAGNI (module 05) in the other
   direction — solving a problem the code doesn't have yet.

## Further reading & sources

- [Refactoring.Guru: Code Smells](https://refactoring.guru/refactoring/smells) - a broader catalog than this module covers; useful for pattern-matching code you'll see that doesn't fit neatly into the four smells above.
- [Martin Fowler: AnemicDomainModel](https://martinfowler.com/bliki/AnemicDomainModel.html) - the article that named this anti-pattern, making the same "this isn't really object-oriented" argument made above.
- [Law of Demeter (Wikipedia)](https://en.wikipedia.org/wiki/Law_of_Demeter) - revisit module 05's principle, the direct fix for the train-wreck-chain smell.

## Next

[21-lld-interview-playbook](../21-lld-interview-playbook/README.md)
— running a structured 45-minute LLD interview end to end: clarifying
requirements, whiteboarding a design, and communicating tradeoffs
under time pressure.
