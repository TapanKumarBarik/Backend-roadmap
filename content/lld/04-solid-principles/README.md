# Module 04: SOLID Principles

## Why this matters

SOLID is the single most commonly asked LLD topic there is — almost every
interviewer will, at some point, hand you a class and ask "what's wrong
with this design?", and the answer is almost always one of these five
letters. More importantly, SOLID isn't trivia to memorize: every design
pattern in modules 06–09 exists specifically to *satisfy* one or more of
these principles in a proven, reusable shape. Understanding SOLID first
means the patterns will feel like "oh, that's just OCP done properly,"
rather than five new things to memorize from scratch.

## Concepts

### S — Single Responsibility Principle (SRP)

**A class should have one reason to change.** Not "one method" — one
*reason*, meaning one axis along which requirements can shift
independently.

{{tabs}}
{{tab Python}}
```python
# VIOLATION: three unrelated reasons to change, in one class
class Report:
    def __init__(self, data):
        self.data = data

    def calculate_total(self):
        return sum(self.data)

    def format_as_html(self):
        return f"<p>Total: {self.calculate_total()}</p>"

    def save_to_file(self, path):
        with open(path, "w") as f:
            f.write(self.format_as_html())
```

This class changes if the calculation logic changes, if the *display
format* changes (HTML today, maybe JSON tomorrow), or if *where it's
saved* changes (file today, database tomorrow) — three unrelated teams
or requirements could each force an edit to this one class.

```python
# FIXED: one reason to change, per class
class ReportData:
    def __init__(self, data):
        self.data = data

    def total(self):
        return sum(self.data)

class HtmlReportFormatter:
    def format(self, report: ReportData) -> str:
        return f"<p>Total: {report.total()}</p>"

class FileReportSaver:
    def save(self, content: str, path: str) -> None:
        with open(path, "w") as f:
            f.write(content)
```
{{tab C#}}
```csharp
// VIOLATION: three unrelated reasons to change, in one class
public class Report {
    private List<double> _data;
    public Report(List<double> data) { _data = data; }

    public double CalculateTotal() => _data.Sum();

    public string FormatAsHtml() => $"<p>Total: {CalculateTotal()}</p>";

    public void SaveToFile(string path) {
        File.WriteAllText(path, FormatAsHtml());
    }
}
```

```csharp
// FIXED: one reason to change, per class
public class ReportData {
    private List<double> _data;
    public ReportData(List<double> data) { _data = data; }
    public double Total() => _data.Sum();
}

public class HtmlReportFormatter {
    public string Format(ReportData report) => $"<p>Total: {report.Total()}</p>";
}

public class FileReportSaver {
    public void Save(string content, string path) {
        File.WriteAllText(path, content);
    }
}
```
{{/tabs}}

Each class can now change for exactly one reason, tested in isolation,
without risking breaking the other two concerns.

### O — Open/Closed Principle (OCP)

**Open for extension, closed for modification**: adding new behavior
should mean *adding new code*, not editing code that already works (and
is already tested).

{{tabs}}
{{tab Python}}
```python
# VIOLATION: adding a new customer type means editing this method again
class DiscountCalculator:
    def discount_for(self, customer_type: str, amount: float) -> float:
        if customer_type == "regular":
            return amount * 0.0
        elif customer_type == "premium":
            return amount * 0.1
        elif customer_type == "vip":
            return amount * 0.2
        # every new tier means another elif here, risking the existing ones
```

```python
# FIXED: new tiers are new classes; DiscountCalculator never changes again
from abc import ABC, abstractmethod

class DiscountPolicy(ABC):
    @abstractmethod
    def discount(self, amount: float) -> float: ...

class RegularDiscount(DiscountPolicy):
    def discount(self, amount): return amount * 0.0

class PremiumDiscount(DiscountPolicy):
    def discount(self, amount): return amount * 0.1

class VipDiscount(DiscountPolicy):
    def discount(self, amount): return amount * 0.2

def apply_discount(policy: DiscountPolicy, amount: float) -> float:
    return policy.discount(amount)     # never touched again, for any future tier

# adding "PlatinumDiscount" later = one new class, zero edits to existing code
```
{{tab C#}}
```csharp
// VIOLATION: adding a new customer type means editing this method again
public class DiscountCalculator {
    public double DiscountFor(string customerType, double amount) {
        if (customerType == "regular") return amount * 0.0;
        else if (customerType == "premium") return amount * 0.1;
        else if (customerType == "vip") return amount * 0.2;
        // every new tier means another 'else if' here, risking the existing ones
        return 0;
    }
}
```

```csharp
// FIXED: new tiers are new classes; the calling code never changes again
public interface IDiscountPolicy {
    double Discount(double amount);
}

public class RegularDiscount : IDiscountPolicy {
    public double Discount(double amount) => amount * 0.0;
}
public class PremiumDiscount : IDiscountPolicy {
    public double Discount(double amount) => amount * 0.1;
}
public class VipDiscount : IDiscountPolicy {
    public double Discount(double amount) => amount * 0.2;
}

public static double ApplyDiscount(IDiscountPolicy policy, double amount) {
    return policy.Discount(amount);   // never touched again, for any future tier
}

// adding "PlatinumDiscount" later = one new class, zero edits to existing code
```
{{/tabs}}

This is exactly the **Strategy pattern**, arriving formally in module 08
— OCP is the *principle*; Strategy is one *proven shape* that satisfies
it.

### L — Liskov Substitution Principle (LSP)

**A subtype must be usable anywhere its base type is expected, without
breaking the caller's expectations.** The textbook example is the
Square/Rectangle trap, and it's worth seeing exactly *why* it breaks,
not just that it does:

{{tabs}}
{{tab Python}}
```python
# VIOLATION: Square "is-a" Rectangle in the geometric sense, but NOT behaviorally
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    def set_width(self, w):
        self.width = w

    def set_height(self, h):
        self.height = h

    def area(self):
        return self.width * self.height

class Square(Rectangle):
    def set_width(self, w):
        self.width = w
        self.height = w      # a square must keep both sides equal...

    def set_height(self, h):
        self.width = h        # ...so setting one secretly changes the other
        self.height = h

def resize_and_check(rect: Rectangle):
    rect.set_width(5)
    rect.set_height(4)
    assert rect.area() == 20, f"expected 20, got {rect.area()}"   # written trusting Rectangle's contract

resize_and_check(Rectangle(0, 0))   # passes: area is 20
resize_and_check(Square(0, 0))      # FAILS: Square silently forced both sides to 4, area is 16
```

`resize_and_check` was written correctly *against `Rectangle`'s
contract* — "setting width and height independently controls the area
independently." `Square` cannot honor that contract without breaking its
own invariant (`width == height`), so substituting a `Square` wherever a
`Rectangle` is expected silently breaks the caller. This is LSP violated,
even though "a square is a rectangle" is true in geometry.
{{tab C#}}
```csharp
// VIOLATION: Square "is-a" Rectangle in the geometric sense, but NOT behaviorally
public class Rectangle {
    public double Width { get; set; }
    public double Height { get; set; }
    public double Area() => Width * Height;
}

public class Square : Rectangle {
    public new double Width {                 // overriding via 'new' to keep sides equal...
        get => base.Width;
        set { base.Width = value; base.Height = value; }
    }
    public new double Height {
        get => base.Height;
        set { base.Width = value; base.Height = value; }
    }
}

static void ResizeAndCheck(Rectangle rect) {
    rect.Width = 5;
    rect.Height = 4;
    if (rect.Area() != 20)
        throw new Exception($"expected 20, got {rect.Area()}");   // written trusting Rectangle's contract
}

ResizeAndCheck(new Rectangle { Width = 0, Height = 0 });   // passes: area is 20
ResizeAndCheck(new Square());                               // FAILS: Square forced both sides to 4, area is 16
```

(C# actually makes this *worse* in a subtle way: `new` here *hides*
`Rectangle`'s properties rather than overriding them, so code that holds
a `Square` through a `Rectangle`-typed reference gets yet another
inconsistent behavior depending on the variable's *declared* type — a
second, compounding bug on top of the LSP violation itself.)
{{/tabs}}

**The fix isn't a clever workaround — it's recognizing the inheritance
itself is wrong.** `Square` should not inherit from `Rectangle` at all.
Both should instead implement a common `Shape` abstraction (module 02)
with only an `area()` method and no shared `set_width`/`set_height`
contract that only one of them can honor:

{{tabs}}
{{tab Python}}
```python
class Shape(ABC):
    @abstractmethod
    def area(self) -> float: ...

class Rectangle(Shape):
    def __init__(self, width, height):
        self.width = width
        self.height = height
    def area(self): return self.width * self.height

class Square(Shape):
    def __init__(self, side):
        self.side = side          # no shared mutable width/height contract to violate
    def area(self): return self.side ** 2
```
{{tab C#}}
```csharp
public interface IShape {
    double Area();
}

public class Rectangle : IShape {
    public double Width, Height;
    public Rectangle(double w, double h) { Width = w; Height = h; }
    public double Area() => Width * Height;
}

public class Square : IShape {
    public double Side;
    public Square(double side) { Side = side; }   // no shared mutable Width/Height contract to violate
    public double Area() => Side * Side;
}
```
{{/tabs}}

### I — Interface Segregation Principle (ISP)

**No client should be forced to depend on methods it doesn't use.** A
"fat" interface with many unrelated methods forces every implementer to
provide (or stub out) methods that make no sense for it.

{{tabs}}
{{tab Python}}
```python
# VIOLATION: a fat interface forces RobotWorker to implement something meaningless
from abc import ABC, abstractmethod

class Worker(ABC):
    @abstractmethod
    def work(self): ...
    @abstractmethod
    def eat(self): ...

class HumanWorker(Worker):
    def work(self): print("coding")
    def eat(self): print("eating lunch")

class RobotWorker(Worker):
    def work(self): print("welding")
    def eat(self):
        raise NotImplementedError("robots don't eat")   # forced to implement something nonsensical
```

```python
# FIXED: split into focused interfaces; implement only what applies
class Workable(ABC):
    @abstractmethod
    def work(self): ...

class Feedable(ABC):
    @abstractmethod
    def eat(self): ...

class HumanWorker(Workable, Feedable):
    def work(self): print("coding")
    def eat(self): print("eating lunch")

class RobotWorker(Workable):        # simply doesn't implement Feedable — no method to fake
    def work(self): print("welding")
```
{{tab C#}}
```csharp
// VIOLATION: a fat interface forces RobotWorker to implement something meaningless
public interface IWorker {
    void Work();
    void Eat();
}

public class HumanWorker : IWorker {
    public void Work() => Console.WriteLine("coding");
    public void Eat() => Console.WriteLine("eating lunch");
}

public class RobotWorker : IWorker {
    public void Work() => Console.WriteLine("welding");
    public void Eat() => throw new NotSupportedException("robots don't eat");  // forced, nonsensical
}
```

```csharp
// FIXED: split into focused interfaces; implement only what applies
public interface IWorkable { void Work(); }
public interface IFeedable { void Eat(); }

public class HumanWorker : IWorkable, IFeedable {
    public void Work() => Console.WriteLine("coding");
    public void Eat() => Console.WriteLine("eating lunch");
}

public class RobotWorker : IWorkable {           // simply doesn't implement IFeedable
    public void Work() => Console.WriteLine("welding");
}
```
{{/tabs}}

### D — Dependency Inversion Principle (DIP)

**Depend on abstractions, not concrete implementations** — especially
across a "layer boundary" (a high-level policy shouldn't hard-wire itself
to one specific low-level detail).

{{tabs}}
{{tab Python}}
```python
# VIOLATION: NotificationService is welded to one concrete sender
class EmailSender:
    def send(self, message): print(f"Emailing: {message}")

class NotificationService:
    def __init__(self):
        self.sender = EmailSender()      # hard-wired — can never be swapped or faked in a test

    def notify(self, message):
        self.sender.send(message)
```

```python
# FIXED: NotificationService depends on an abstraction, not a concrete class
from abc import ABC, abstractmethod

class MessageSender(ABC):
    @abstractmethod
    def send(self, message: str) -> None: ...

class EmailSender(MessageSender):
    def send(self, message): print(f"Emailing: {message}")

class SmsSender(MessageSender):
    def send(self, message): print(f"Texting: {message}")

class NotificationService:
    def __init__(self, sender: MessageSender):   # the abstraction is INJECTED, not created inside
        self.sender = sender

    def notify(self, message):
        self.sender.send(message)

NotificationService(EmailSender()).notify("hello")   # swap in SmsSender() with zero changes here
```
{{tab C#}}
```csharp
// VIOLATION: NotificationService is welded to one concrete sender
public class EmailSender {
    public void Send(string message) => Console.WriteLine($"Emailing: {message}");
}

public class NotificationService {
    private EmailSender _sender = new EmailSender();   // hard-wired — can never be swapped or faked in a test
    public void Notify(string message) => _sender.Send(message);
}
```

```csharp
// FIXED: NotificationService depends on an abstraction, not a concrete class
public interface IMessageSender {
    void Send(string message);
}

public class EmailSender : IMessageSender {
    public void Send(string message) => Console.WriteLine($"Emailing: {message}");
}

public class SmsSender : IMessageSender {
    public void Send(string message) => Console.WriteLine($"Texting: {message}");
}

public class NotificationService {
    private readonly IMessageSender _sender;
    public NotificationService(IMessageSender sender) {   // the abstraction is INJECTED, not created inside
        _sender = sender;
    }
    public void Notify(string message) => _sender.Send(message);
}

new NotificationService(new EmailSender()).Notify("hello");   // swap in new SmsSender() with zero changes here
```
{{/tabs}}

This is called dependency *inversion* because the normal direction —
`NotificationService` deciding on and depending directly on `EmailSender`
— gets inverted: both `NotificationService` and `EmailSender` now depend
on the shared `MessageSender`/`IMessageSender` abstraction instead of on
each other. This is also the seed of **dependency injection**, treated in
full in module 19.

## Hands-on exercises

Do each in both languages.

### 1. Fix an SRP violation

Take a `UserAccount` class that stores user data, validates an email
format, *and* sends a welcome email, all in one class. Split it into
three single-responsibility classes.

### 2. Fix an OCP violation

Take a `ShippingCostCalculator` with an `if`/`elif` chain over
`"standard"`, `"express"`, `"overnight"` shipping methods. Refactor it to
the polymorphic shape from the OCP example so a new shipping method
requires zero edits to existing classes.

### 3. Spot and fix an LSP violation

Given a `Bird` base class with a `fly()` method, and a `Penguin`
subclass that overrides `fly()` to throw/raise "penguins can't fly" —
explain in writing why this violates LSP (an interviewer will ask you to
articulate this, not just fix it), then redesign so `Penguin` is not
forced into a contract it can't honor (hint: not every `Bird` can fly —
model `Flyable` separately, same idea as the ISP fix).

### 4. Fix an ISP violation

Take a fat `IPrinterMachine`/`PrinterMachine` interface with `print()`,
`scan()`, and `fax()`. Split it so a `SimplePrinter` class that only
prints isn't forced to implement `scan()`/`fax()`.

### 5. Fix a DIP violation

Take an `OrderProcessor` that directly instantiates a concrete
`MySqlOrderRepository` inside its constructor. Refactor it to depend on
an `OrderRepository`/`IOrderRepository` abstraction injected from
outside, then show you can pass in a fake/in-memory implementation
without changing `OrderProcessor` at all — this is exactly what makes a
class testable, previewed here and formalized in module 19.

## Independent challenge

No code given.

**Task:** You're given (mentally construct, or find/write) a single
`OrderManager` "God class" that: validates an order, calculates tax
using an `if`/`elif` chain over hardcoded country codes, calculates a
discount using another `if`/`elif` chain over hardcoded customer tiers,
sends a confirmation email by directly instantiating a concrete
`SmtpEmailClient`, and saves the order by directly instantiating a
concrete `SqlOrderRepository`. Refactor this single class into a design
that satisfies **all five** SOLID principles simultaneously — identify
which refactor addresses which letter, explicitly, in a short comment or
note above each new class.

<details>
<summary>Hint</summary>

You should end up with roughly: one class per responsibility (SRP) — an
`Order`/validation piece, a tax calculator, a discount calculator; the
tax and discount calculators built as swappable strategies keyed by
country/tier so adding a new one needs no edits (OCP); every strategy
implementation actually honoring its interface's contract with no
surprise exceptions (LSP); focused interfaces rather than one fat one for
"anything order-related" (ISP); and `OrderManager` itself depending on
injected abstractions for both email sending and persistence, never
constructing `SmtpEmailClient`/`SqlOrderRepository` directly (DIP).

</details>

## Common mistakes & troubleshooting

- **Over-applying SRP into dozens of tiny classes.** SRP means "one
  reason to change," not "one method per class." A class with five
  tightly related methods that all change together for the *same*
  reason is fine — don't fragment cohesive code just to look SOLID.
- **Misreading "closed for modification" as "never edit this file
  again."** OCP is about not needing to *modify existing, working,
  tested code* to add new behavior — it doesn't mean the file is
  literally frozen forever; genuine bug fixes still belong there.
- **Treating Square-extends-Rectangle as "just a fun puzzle."** It's the
  canonical LSP violation because it looks so obviously correct
  geometrically — the lesson is that "is-a" in plain English is not
  the same test as "is-a" behaviorally substitutable. Always ask "can
  every caller of the base type use this subtype with zero surprises?"
- **Defending a fat interface as "convenient — one place for
  everything."** Convenient for the interface's author, expensive for
  every implementer forced to fake methods that don't apply to them
  (as `RobotWorker.Eat()` had to). Split by what different *clients*
  actually need, not by what's easy to declare in one place.
- **Constructing dependencies with `new`/direct instantiation deep
  inside a class, then wondering why it can't be unit tested.** If a
  class builds its own `EmailSender`/`SqlOrderRepository` internally,
  no test can substitute a fake one — inject the abstraction through
  the constructor instead (DIP), exactly as shown above.

## Checkpoint quiz

1. What does "one reason to change" mean in SRP — why not just "one
   method"?
2. In the OCP example, what specifically has to change in
   `DiscountCalculator`/`ApplyDiscount` itself when a new "Platinum"
   tier is added, after the fix?
3. Why does `Square extends Rectangle` violate LSP even though a square
   genuinely is a rectangle geometrically?
4. What's wrong with `RobotWorker` being forced to implement `eat()`?
5. In the DIP fix, which two things does `NotificationService` now
   depend on, and which one did it depend on before the fix?
6. Which SOLID letter is most directly satisfied by the Strategy
   pattern (coming in module 08)?

<details>
<summary>Answers</summary>

1. It means one *axis of change* — one category of requirement that
   could force an edit. A class can have several methods and still have
   a single responsibility, as long as all its methods change together
   for the same underlying reason.
2. Nothing — you add one new class (`PlatinumDiscount`) implementing the
   existing `DiscountPolicy`/`IDiscountPolicy` abstraction; the
   calculator/apply function that consumes the abstraction is untouched.
3. Because `Rectangle`'s contract (set width and height independently,
   each controls area independently) cannot be honored by `Square`
   (which must keep both sides equal) — code written correctly against
   `Rectangle`'s contract breaks when a `Square` is substituted in.
4. It's forced to depend on and "implement" a method (`eat()`) that has
   no meaningful behavior for it — violating ISP, the interface promised
   more than every implementer can actually deliver.
5. After the fix, it depends only on the `MessageSender`/`IMessageSender`
   abstraction (injected via constructor). Before the fix, it depended
   directly on the concrete `EmailSender` class, constructed internally.
6. Open/Closed Principle (OCP) — Strategy lets you add new behavior
   (new strategy classes) without modifying the code that selects and
   uses a strategy.

</details>

## Interview questions

1. **"Walk me through all five SOLID principles with a one-sentence
   definition each."**
   SRP: a class should have one reason to change. OCP: open for
   extension, closed for modification. LSP: subtypes must be
   substitutable for their base type without breaking correctness. ISP:
   no client should depend on methods it doesn't use. DIP: depend on
   abstractions, not concrete implementations.
2. **"Why is `Square extends Rectangle` the textbook LSP violation, and
   what would you do instead?"**
   Because `Square` can't honor `Rectangle`'s implied contract of
   independently settable width/height without breaking its own
   `width == height` invariant — substituting it silently changes
   caller behavior. Instead, don't model the inheritance at all: give
   both a shared minimal abstraction (like a `Shape` with just `area()`)
   and no shared mutable-dimension contract that only one can honor.
3. **"How does the Strategy pattern relate to OCP?"**
   Strategy is a concrete, reusable shape for satisfying OCP: instead of
   a branching `if`/`elif` chain that must be edited for every new case,
   each case becomes its own class implementing a shared interface, and
   new cases are added purely by writing new classes — the code that
   *uses* a strategy never needs to change.
4. **"What's the relationship between DIP and dependency injection?"**
   DIP is the *principle* (depend on abstractions, not concretions).
   Dependency injection is the *mechanism* — passing the concrete
   implementation in from outside (typically via a constructor) rather
   than having a class construct its own dependency — that makes DIP
   achievable in practice, and is what makes a class unit-testable in
   isolation.
5. **"Give a real example of an ISP violation you've seen or could
   imagine, beyond the textbook worker/robot example."**
   A common real one: a single `IRepository` interface with
   `Create`/`Read`/`Update`/`Delete`/`Search`/`Export`/`Import` forces
   every simple read-only repository to stub out five methods it will
   never use — split into smaller interfaces (`IReadableRepository`,
   `IWritableRepository`) so a read-only implementer only implements
   what it actually does.

## Further reading & sources

- [Robert C. Martin: The Principles of OOD (the original SOLID essays)](https://web.archive.org/web/20150906155800/http://www.objectmentor.com/resources/articles/Principles_and_Patterns.pdf) - the source material SOLID is drawn from.
- [Microsoft Learn: Dependency inversion principle](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures#dependency-inversion) - DIP framed in a real application-architecture context.
- [Python: `abc` module](https://docs.python.org/3/library/abc.html) - the abstraction mechanism used throughout this module's OCP/ISP/DIP examples.

## Next

[05-core-design-principles](../05-core-design-principles/README.md) —
DRY, KISS, YAGNI, the Law of Demeter, composition-over-inheritance, and
coupling/cohesion: the other half of "principles," rounding out
everything you need before the patterns themselves begin in module 06.
