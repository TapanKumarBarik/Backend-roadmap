# Module 05: Core Design Principles

## Why this matters

SOLID governs how classes relate to each other structurally. This module
covers the everyday judgment calls you make *inside and around* that
structure — whether to extract a shared helper, whether an abstraction
is earning its keep yet, how deeply one object should reach into another,
and whether inheritance is even the right tool. These aren't five more
rigid rules; they're the practical taste that tells you when SOLID
principles are being applied well versus over-applied. Every pattern from
module 06 onward is judged, in part, by whether it actually respects
these — a pattern applied where YAGNI says "not yet" is a pattern
misapplied.

## Concepts

### DRY — Don't Repeat Yourself

Duplicated logic means every future change has to be found and made in
every copy — miss one, and you have a bug that's *correct in one place
and wrong in another*.

{{tabs}}
{{tab Python}}
```python
# VIOLATION: the same validation logic, copy-pasted in two places
class UserRegistration:
    def register(self, email, password):
        if "@" not in email or "." not in email:
            raise ValueError("invalid email")
        # ... register the user

class PasswordReset:
    def reset(self, email, new_password):
        if "@" not in email or "." not in email:   # duplicated — will drift out of sync
            raise ValueError("invalid email")
        # ... reset the password
```

```python
# FIXED: one shared function, used by both
def validate_email(email: str) -> None:
    if "@" not in email or "." not in email:
        raise ValueError("invalid email")

class UserRegistration:
    def register(self, email, password):
        validate_email(email)
        # ... register the user

class PasswordReset:
    def reset(self, email, new_password):
        validate_email(email)
        # ... reset the password
```
{{tab C#}}
```csharp
// VIOLATION: the same validation logic, copy-pasted in two places
public class UserRegistration {
    public void Register(string email, string password) {
        if (!email.Contains("@") || !email.Contains("."))
            throw new ArgumentException("invalid email");
        // ... register the user
    }
}

public class PasswordReset {
    public void Reset(string email, string newPassword) {
        if (!email.Contains("@") || !email.Contains("."))   // duplicated — will drift out of sync
            throw new ArgumentException("invalid email");
        // ... reset the password
    }
}
```

```csharp
// FIXED: one shared method, used by both
public static class EmailValidator {
    public static void Validate(string email) {
        if (!email.Contains("@") || !email.Contains("."))
            throw new ArgumentException("invalid email");
    }
}

public class UserRegistration {
    public void Register(string email, string password) {
        EmailValidator.Validate(email);
        // ... register the user
    }
}

public class PasswordReset {
    public void Reset(string email, string newPassword) {
        EmailValidator.Validate(email);
        // ... reset the password
    }
}
```
{{/tabs}}

### KISS — Keep It Simple

The simplest design that correctly solves the *actual* problem beats a
cleverer one that solves a bigger problem nobody asked about.

{{tabs}}
{{tab Python}}
```python
# OVER-ENGINEERED: a generic rule-engine to check if a number is even
class Rule:
    def evaluate(self, x): raise NotImplementedError

class EvenRule(Rule):
    def evaluate(self, x): return x % 2 == 0

class RuleEngine:
    def __init__(self):
        self.rules = []
    def add_rule(self, rule):
        self.rules.append(rule)
    def evaluate_all(self, x):
        return all(r.evaluate(x) for r in self.rules)

engine = RuleEngine()
engine.add_rule(EvenRule())
print(engine.evaluate_all(4))     # a lot of ceremony to ask "is 4 even?"
```

```python
# SIMPLE: solves the actual problem, no more
def is_even(x: int) -> bool:
    return x % 2 == 0

print(is_even(4))
```
{{tab C#}}
```csharp
// OVER-ENGINEERED: a generic rule-engine to check if a number is even
public interface IRule {
    bool Evaluate(int x);
}
public class EvenRule : IRule {
    public bool Evaluate(int x) => x % 2 == 0;
}
public class RuleEngine {
    private List<IRule> _rules = new List<IRule>();
    public void AddRule(IRule rule) => _rules.Add(rule);
    public bool EvaluateAll(int x) => _rules.All(r => r.Evaluate(x));
}

var engine = new RuleEngine();
engine.AddRule(new EvenRule());
Console.WriteLine(engine.EvaluateAll(4));   // a lot of ceremony to ask "is 4 even?"
```

```csharp
// SIMPLE: solves the actual problem, no more
static bool IsEven(int x) => x % 2 == 0;

Console.WriteLine(IsEven(4));
```
{{/tabs}}

The rule-engine version isn't "wrong" in isolation — a real rules engine
is a legitimate design when you genuinely have many independent,
composable, run-time-configurable rules. The problem is applying that
machinery to a problem that doesn't have that shape yet. Which leads
directly into the next principle.

### YAGNI — You Aren't Gonna Need It

Don't build for a requirement you *imagine* you'll get — build for the
requirement you actually have, and add generality only once a second real
case shows up (a common form of this: "the rule of three" — the same
shape appearing a *third* time is a much stronger signal to abstract than
the second).

{{tabs}}
{{tab Python}}
```python
# VIOLATION: today there's exactly one payment provider, but this is
# built as if five are coming next sprint
class PaymentGatewayFactory:
    def create(self, provider_name: str):
        if provider_name == "stripe":
            return StripeGateway()
        # ... four more empty branches "reserved for later", a config file
        # for provider priority, a plugin discovery mechanism... for ONE provider.

class StripeGateway:
    def charge(self, amount): print(f"Charging {amount} via Stripe")
```

```python
# YAGNI-RESPECTING: build for the one real case, cleanly
class StripeGateway:
    def charge(self, amount): print(f"Charging {amount} via Stripe")

gateway = StripeGateway()
gateway.charge(100)

# The moment a SECOND real provider shows up, refactor to introduce
# a shared PaymentGateway abstraction (OCP, module 04) THEN —
# not speculatively now, for a need that may never arrive.
```
{{tab C#}}
```csharp
// VIOLATION: today there's exactly one payment provider, but this is
// built as if five are coming next sprint
public class PaymentGatewayFactory {
    public IPaymentGateway Create(string providerName) {
        if (providerName == "stripe") return new StripeGateway();
        // ... four more empty branches "reserved for later", a config file
        // for provider priority, a plugin discovery mechanism... for ONE provider.
        throw new NotSupportedException();
    }
}

public class StripeGateway {
    public void Charge(decimal amount) => Console.WriteLine($"Charging {amount} via Stripe");
}
```

```csharp
// YAGNI-RESPECTING: build for the one real case, cleanly
public class StripeGateway {
    public void Charge(decimal amount) => Console.WriteLine($"Charging {amount} via Stripe");
}

var gateway = new StripeGateway();
gateway.Charge(100);

// The moment a SECOND real provider shows up, refactor to introduce
// a shared IPaymentGateway abstraction (OCP, module 04) THEN —
// not speculatively now, for a need that may never arrive.
```
{{/tabs}}

**YAGNI and OCP are in creative tension, on purpose.** OCP says "design so
*future* extension doesn't require modifying existing code." YAGNI says
"don't build that extensibility until a second real case justifies it."
They resolve together: keep the *current* single case simple and direct;
reach for the OCP-satisfying abstraction (interface + implementations)
the moment — and not before — a second genuine case actually arrives.

### Law of Demeter ("don't talk to strangers")

An object should only call methods on: itself, its own fields, objects
passed into its methods as parameters, or objects it creates directly —
**not** on objects it got back from *another* object's method. Reaching
through a chain of getters is sometimes called a "train wreck."

{{tabs}}
{{tab Python}}
```python
# VIOLATION: OrderProcessor reaches through Order -> Customer -> Address
class OrderProcessor:
    def get_shipping_label(self, order):
        city = order.customer.address.city    # reaches through THREE objects it doesn't own
        return f"Ship to: {city}"
```

`OrderProcessor` now silently depends on `Order` having a `customer`,
which has an `address`, which has a `city` — if `Address` is ever
restructured (say, city moves into a nested `Location` object),
*every caller like this one* breaks, even though none of them "own" that
structure.

```python
# FIXED: Order exposes what callers need; the chain is hidden inside it
class Order:
    def __init__(self, customer):
        self.customer = customer

    def shipping_city(self) -> str:              # Order asks its OWN customer
        return self.customer.shipping_city()      # which asks its OWN address

class Customer:
    def __init__(self, address):
        self.address = address

    def shipping_city(self) -> str:
        return self.address.city                  # Customer talks only to its own field

class OrderProcessor:
    def get_shipping_label(self, order):
        city = order.shipping_city()               # ONE call, to an object it was given directly
        return f"Ship to: {city}"
```
{{tab C#}}
```csharp
// VIOLATION: OrderProcessor reaches through Order -> Customer -> Address
public class OrderProcessor {
    public string GetShippingLabel(Order order) {
        string city = order.Customer.Address.City;   // reaches through THREE objects it doesn't own
        return $"Ship to: {city}";
    }
}
```

```csharp
// FIXED: Order exposes what callers need; the chain is hidden inside it
public class Address {
    public string City;
}

public class Customer {
    public Address Address;
    public string ShippingCity() => Address.City;    // Customer talks only to its own field
}

public class Order {
    public Customer Customer;
    public string ShippingCity() => Customer.ShippingCity();   // Order asks its OWN customer
}

public class OrderProcessor {
    public string GetShippingLabel(Order order) {
        string city = order.ShippingCity();            // ONE call, to an object it was given directly
        return $"Ship to: {city}";
    }
}
```
{{/tabs}}

### Composition over inheritance

Prefer a class *containing* another object that provides a behavior, over
inheriting that behavior from a base class — especially when the behavior
needs to vary independently of everything else about the class.

{{tabs}}
{{tab Python}}
```python
# INHERITANCE-HEAVY: every new flying/non-flying combination needs its own subclass,
# and it gets worse fast (what about swimming ducks vs non-swimming ducks?)
class Duck:
    def fly(self):
        print("flying normally")

class RubberDuck(Duck):
    def fly(self):
        raise NotImplementedError("rubber ducks can't fly")   # forced override just to REMOVE behavior
```

```python
# COMPOSITION: flying behavior is a swappable, independent piece
class FlyBehavior:
    def fly(self): raise NotImplementedError

class NormalFly(FlyBehavior):
    def fly(self): print("flying normally")

class NoFly(FlyBehavior):
    def fly(self): print("can't fly")

class Duck:
    def __init__(self, fly_behavior: FlyBehavior):
        self.fly_behavior = fly_behavior   # Duck HAS-A FlyBehavior, doesn't inherit one

    def perform_fly(self):
        self.fly_behavior.fly()

mallard = Duck(NormalFly())
rubber_duck = Duck(NoFly())
mallard.perform_fly()       # flying normally
rubber_duck.perform_fly()   # can't fly — no forced override, no exception, just a different behavior object
```
{{tab C#}}
```csharp
// INHERITANCE-HEAVY: every new flying/non-flying combination needs its own subclass,
// and it gets worse fast (what about swimming ducks vs non-swimming ducks?)
public class Duck {
    public virtual void Fly() => Console.WriteLine("flying normally");
}

public class RubberDuck : Duck {
    public override void Fly() {
        throw new NotSupportedException("rubber ducks can't fly");   // forced override just to REMOVE behavior
    }
}
```

```csharp
// COMPOSITION: flying behavior is a swappable, independent piece
public interface IFlyBehavior {
    void Fly();
}
public class NormalFly : IFlyBehavior {
    public void Fly() => Console.WriteLine("flying normally");
}
public class NoFly : IFlyBehavior {
    public void Fly() => Console.WriteLine("can't fly");
}

public class Duck {
    private readonly IFlyBehavior _flyBehavior;
    public Duck(IFlyBehavior flyBehavior) { _flyBehavior = flyBehavior; }   // Duck HAS-A IFlyBehavior

    public void PerformFly() => _flyBehavior.Fly();
}

var mallard = new Duck(new NormalFly());
var rubberDuck = new Duck(new NoFly());
mallard.PerformFly();       // flying normally
rubberDuck.PerformFly();    // can't fly — no forced override, no exception, just a different behavior object
```
{{/tabs}}

This is the exact same shape as module 04's LSP fix (stop inheriting a
contract you can't honor) and directly previews the **Strategy pattern**
(module 08) — "prefer composition" isn't an abstract slogan, it's this
concrete technique: pull the *varying* behavior out into its own small
type, and hand it to the class that needs it.

### Coupling and cohesion

These two words are the actual *measurements* SOLID's letters are
protecting: **cohesion** is how closely related the responsibilities
inside one class are (SRP wants this *high* — a class should be a tightly
focused unit); **coupling** is how much one class depends on another's
internal details (DIP wants this *low* — depend on abstractions, not
concrete internals).

```
HIGH cohesion, LOW coupling  →  the goal. Each class does one focused
                                 thing well, and talks to others only
                                 through small, stable abstractions.

LOW cohesion   →  a class doing unrelated things (module 04's original
                   Report class: calculating AND formatting AND saving).
                   Symptom: you can't summarize the class in one sentence
                   without using "and."

HIGH coupling  →  a class that breaks whenever an unrelated class's
                   internals change (this module's Law-of-Demeter
                   violation: OrderProcessor breaks if Address is
                   restructured, despite never being told about Address
                   directly).
```

Every fix in this module and module 04 is, underneath, a fix for one of
these two measurements — DRY and SRP raise cohesion; DIP, Law of Demeter,
and composition-over-inheritance lower coupling.

## Hands-on exercises

### 1. DRY it up

You have two classes that each independently format a `Money` value
object (module 03) as a currency string (`"$19.99"`). Extract the
formatting into one shared function/static method both use.

### 2. Simplify it

Given an over-engineered "generic validation pipeline" built to validate
one single field (an age must be between 0 and 120), replace it with a
plain, direct function. Then articulate in one sentence *when* the
pipeline version would actually earn its complexity back.

### 3. Apply YAGNI

Given a `Logger` class built with a pluggable "log destination" system
(console, file, remote server, syslog — all four implemented) when the
project only ever logs to the console, strip it down to just what's
used, and write a one-sentence note on what signal would justify bringing
the abstraction back.

### 4. Fix a Law of Demeter violation

Given a `ShoppingCart` that computes a total by reaching
`cart.items[i].product.price.amount` in a loop, refactor so `Product`
exposes its own price, and `ShoppingCart` never reaches past the object
it directly holds.

### 5. Composition over inheritance

Take a `Vehicle` base class with an overridden `make_sound`/`MakeSound`
for `Car` ("vroom"), `ElectricCar` ("silent hum"), and `Motorcycle`
("roar") — then imagine a fourth requirement: some cars can also have a
"loud exhaust mod" *independent* of their engine type. Show why bolting
this onto the inheritance tree gets awkward, then refactor `Vehicle` to
use a composed `SoundBehavior` instead, and add the loud-exhaust variant
as a new behavior class with zero changes to `Vehicle` itself.

## Independent challenge

No code given.

**Task:** You're given (mentally construct, or write) an
`InvoiceGenerator` class with all of these problems at once: the tax
calculation logic is copy-pasted in two methods (DRY violation), it
reaches `invoice.customer.billingAddress.country.taxRules.rate` to get a
tax rate (Law of Demeter violation), and it was built with a fully
generic, configurable "multi-currency, multi-locale, multi-format"
architecture even though the product only ever issues USD invoices in one
format (YAGNI violation). Refactor it to fix all three, and write one
sentence per fix explaining which principle it satisfies — practice
articulating this out loud, since an interviewer will ask "why" for every
change you make, not just "what."

<details>
<summary>Hint</summary>

Fix order matters less than making each fix *independently justifiable*.
Extract the duplicated tax logic into one shared method (DRY). Give
`Invoice` (or `Customer`) its own `tax_rate()`/`TaxRate()` method so
`InvoiceGenerator` calls one method on an object it was directly given,
instead of reaching through four (Law of Demeter). Strip the speculative
multi-currency/multi-locale machinery down to what USD-only actually
needs, and note in a comment what real second requirement would justify
bringing generality back (YAGNI) — don't delete the *idea*, just the
premature implementation.

</details>

## Common mistakes & troubleshooting

- **Applying DRY to superficially similar code that isn't actually the
  same concept.** Two pieces of code that *look* alike today but exist
  for unrelated business reasons will diverge later — forcing them into
  one shared function then means untangling them under pressure. The
  common guidance: **duplicate twice, abstract on the third real
  occurrence** ("rule of three") — a coincidental second match isn't
  strong enough evidence yet.
- **Using KISS as an excuse to skip design entirely.** KISS means the
  simplest solution that *correctly and fully* solves the actual
  problem — it is not license to hard-code, skip validation, or ignore
  edge cases "to keep it simple."
- **Using YAGNI to justify never planning for anything.** YAGNI targets
  *speculative* generality for requirements you don't have yet — it
  doesn't mean ignoring requirements you *do* have, or refusing to think
  one step ahead about an interface's shape.
- **Over-applying Law of Demeter into pointless wrapper soup.** Adding a
  trivial one-line delegating method to every class "just in case,"
  even where there's no real train-wreck chain and no real coupling
  risk, adds ceremony without reducing actual coupling. Apply it where a
  chain reaches through objects the caller has no business knowing
  about — not reflexively everywhere.
- **Believing "composition over inheritance" means "never use
  inheritance."** Inheritance is still the right tool for a genuine,
  LSP-safe "is-a" relationship (module 02's `Dog`/`Cat`/`Animal`, where
  every subclass can truly substitute for the base). The guidance is
  about behavior that *varies independently* of the class's core
  identity — that's what belongs in a composed object, not a
  forced subclass.

## Checkpoint quiz

1. What's the "rule of three," and why is a second similar-looking piece
   of code not always enough justification to apply DRY?
2. In what situation would the "over-engineered" rule-engine from the
   KISS example actually be the right amount of complexity?
3. Explain the tension between OCP (module 04) and YAGNI, and how they
   resolve together in practice.
4. What specifically makes `order.customer.address.city` a Law of
   Demeter violation, and what's the fix?
5. In the Duck example, what specifically breaks down as you add more
   flying/non-flying/swimming/non-swimming combinations to an
   inheritance-only design?
6. Define coupling and cohesion in one sentence each, and name one
   SOLID principle each is most associated with.

<details>
<summary>Answers</summary>

1. Duplicate the logic once more (a third real occurrence) before
   extracting a shared abstraction. A second occurrence might be
   coincidental — two things that look alike today but change for
   different reasons tomorrow; forcing them together too early creates
   a wrong abstraction that's more expensive to undo than the original
   duplication.
2. When you genuinely have many independent, composable rules that need
   to be added/removed/reconfigured at runtime without code changes —
   e.g., a real business-rules engine with dozens of rules configured
   by non-developers. Not when you have exactly one fixed check.
3. OCP says design so *future* extension doesn't require modifying
   existing code; YAGNI says don't build that extensibility until a
   second real case justifies it. They resolve by keeping the current
   single case simple and direct, and introducing the OCP-satisfying
   abstraction only once a second genuine case actually arrives — not
   speculatively.
4. `OrderProcessor` reaches through three objects it doesn't own
   (`customer`, then `address`) to get `city` — coupling it to their
   internal structure even though it was only ever given an `order`.
   The fix: give `Order` (and `Customer`) their own method that hides
   that internal structure, so the caller makes one call to an object
   it was directly given.
5. Every new combination (flying variant × swimming variant × ...)
   multiplies the number of subclasses needed, and any override that
   exists only to *remove* inherited behavior (like `RubberDuck`
   throwing from `Fly()`) signals the inheritance itself models the
   wrong relationship — composition lets each behavior vary
   independently without a combinatorial subclass explosion.
6. Cohesion: how closely related the responsibilities inside one class
   are — associated with SRP (wants it high). Coupling: how much one
   class depends on another's internal details — associated with DIP
   (wants it low).

</details>

## Interview questions

1. **"What's the difference between DRY and premature abstraction, and
   how do you avoid the second while still practicing the first?"**
   DRY removes duplication of a single, genuinely shared concept. Premature
   abstraction forces two *coincidentally* similar pieces of code
   together before it's clear they represent the same underlying
   concept — the "rule of three" (wait for a third real occurrence)
   is the practical guard against that mistake.
2. **"How do you decide when an abstraction is 'earning its keep' versus
   over-engineering?"**
   Ask whether a second (or third) *real, current* requirement justifies
   it — not a hypothetical future one. If today there's exactly one
   case, the abstraction is speculative (YAGNI); once a genuine second
   case exists, extracting a shared interface/abstraction (OCP) is
   justified.
3. **"What is the Law of Demeter, and can you give an example of
   violating it?"**
   Roughly "only talk to your immediate friends" — a method should only
   call methods on itself, its own fields, its parameters, or objects it
   directly creates, not on objects returned from another object's
   method. Classic violation: `a.getB().getC().doSomething()` — a
   "train wreck" that couples the caller to `B`'s and `C`'s existence
   and structure.
4. **"Why is 'composition over inheritance' usually good advice, and
   when would you still choose inheritance?"**
   Composition lets behavior vary independently and be swapped at
   runtime without a combinatorial explosion of subclasses, and avoids
   forcing a subclass to override-just-to-remove behavior it can't
   honor (an LSP smell). Inheritance is still correct for a genuine,
   substitutable "is-a" relationship where every subclass can stand in
   for the base without surprises.
5. **"Define coupling and cohesion, and explain why you want low
   coupling but high cohesion, not the reverse."**
   Cohesion: how related a module's own responsibilities are — you want
   this high so each class stays focused, understandable, and has one
   real reason to change (SRP). Coupling: how much one module depends
   on another's internal details — you want this low so a change in one
   class doesn't ripple unpredictably into others that merely use it
   (this is what DIP, encapsulation, and the Law of Demeter all protect
   against from different angles).

## Cumulative review

Closed-book. Pulls from modules 03–05.

1. (03 + 04) A `Result<T>` type (module 03) that separates "success" from
   "failure" without throwing avoids exceptions for routine outcomes.
   Which SOLID letter does designing a focused `Result<T>` — rather than
   bolting extra fields onto an existing class — most directly support,
   and why?
2. (04 + 05) The DIP fix in module 04 (`NotificationService` depending on
   `MessageSender`/`IMessageSender` instead of a concrete `EmailSender`)
   is also an example of which module-05 principle in action?
3. (03 + 05) Why is a `record`/frozen `dataclass` value object (module
   03) naturally *low-coupling-friendly* compared to a plain mutable
   class passed around and modified by many different callers?
4. (04 + 05) The Square/Rectangle LSP violation (module 04) and the
   Duck/RubberDuck composition example (module 05) are really the same
   underlying mistake. What is it?
5. (03 + 04 + 05) An enum (module 03) used for `OrderStatus` instead of
   a raw string prevents which module-05 category of bug — coupling,
   cohesion, or primitive obsession — and how?

<details>
<summary>Answers</summary>

1. DIP (or its cousin, ISP, if the "extra fields" would also bloat an
   interface) — a focused `Result<T>` depends only on the abstraction
   of "success or failure," rather than coupling calling code to one
   specific class's growing, unrelated set of fields.
2. Dependency Inversion is the *principle*; injecting the abstraction
   through the constructor rather than constructing the concrete class
   internally is literally *low coupling* in action — module 05's
   coupling/cohesion discussion is naming what module 04's DIP fix was
   already doing.
3. Because it can't be mutated after creation, no caller can ever be
   surprised by another caller changing shared data out from under it —
   removing an entire class of hidden dependency between otherwise
   unrelated pieces of code that happen to hold the same object.
4. Both force a subclass to either violate an inherited contract it
   can't honor (`Square` can't independently set width/height;
   `RubberDuck` can't actually fly) or override a method just to throw/
   remove behavior — the fix in both cases is the same: stop modeling
   the relationship as inheritance/a shared contract that only some
   subtypes can honor.
5. Primitive obsession — a raw string status can be misspelled,
   mis-cased, or hold an entirely invalid value with nothing to catch
   it; the enum makes invalid values impossible to represent at all
   (fully, in C#; at least at the comparison level, in Python).

</details>

## Further reading & sources

- [Wikipedia: Law of Demeter](https://en.wikipedia.org/wiki/Law_of_Demeter) - the original formulation and formal statement of the principle.
- [Martin Fowler: Yagni](https://martinfowler.com/bliki/Yagni.html) - a clear, practitioner-level explanation of what YAGNI does and doesn't mean.
- [Head First Design Patterns: Strategy chapter (Duck example origin)](https://www.oreilly.com/library/view/head-first-design/0596007124/) - the original Duck/FlyBehavior composition example this module's version is based on.
- [Coupling and cohesion (Wikipedia)](https://en.wikipedia.org/wiki/Coupling_(computer_programming)) - formal definitions and classic coupling/cohesion classification scales.

## Next

[06-creational-patterns](../06-creational-patterns/README.md) — with
every principle from SOLID through composition-over-inheritance in
place, we start the pattern catalog itself: Singleton, Factory Method,
Abstract Factory, Builder, and Prototype — proven, reusable shapes for
*creating* objects correctly.
