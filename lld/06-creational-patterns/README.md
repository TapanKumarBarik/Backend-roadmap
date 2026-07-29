# Module 06: Creational Patterns

## Why this matters

Every principle so far (SOLID, DRY/KISS/YAGNI, composition-over-
inheritance) has been about how classes *relate* to each other. Starting
here, we cover proven, named shapes for solving one recurring problem
each — starting with **how objects get created** without hard-coding
concrete classes everywhere (directly satisfying OCP and DIP from module
04). These five — Singleton, Factory Method, Abstract Factory, Builder,
Prototype — are also simply *expected vocabulary* in an LLD interview:
"I'd use a Builder here" is a complete, precise sentence an interviewer
immediately understands, versus re-explaining the same idea from
scratch every time.

## Concepts

### Singleton — exactly one instance, globally accessible

**Problem it solves:** some things genuinely should exist exactly once
per application — a configuration store, a single connection pool, a
central logging service. Singleton guarantees exactly one instance ever
exists, and gives every caller the same one.

{{tabs}}
{{tab Python}}
```python
class AppConfig:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance.settings = {}      # runs only the very first time
        return cls._instance

a = AppConfig()
b = AppConfig()
a.settings["debug"] = True
print(b.settings)      # {'debug': True} — 'a' and 'b' are the SAME object
print(a is b)           # True
```

`__new__` (not `__init__`) is where object *creation* happens in Python —
overriding it lets us intercept "someone's trying to make an instance"
and hand back the existing one instead of building a new one.
{{tab C#}}
```csharp
public class AppConfig {
    private static AppConfig _instance;
    private static readonly object _lock = new object();

    public Dictionary<string, object> Settings = new Dictionary<string, object>();

    private AppConfig() { }    // PRIVATE constructor — nobody outside can 'new' one directly

    public static AppConfig Instance {
        get {
            if (_instance == null) {
                lock (_lock) {                     // guards against two threads both seeing null
                    if (_instance == null) {        // and both trying to create one (module 10 covers this in depth)
                        _instance = new AppConfig();
                    }
                }
            }
            return _instance;
        }
    }
}

var a = AppConfig.Instance;
var b = AppConfig.Instance;
a.Settings["debug"] = true;
Console.WriteLine(b.Settings["debug"]);   // True — 'a' and 'b' are the SAME object
Console.WriteLine(ReferenceEquals(a, b)); // True
```

The **private constructor** is the actual enforcement mechanism — `new
AppConfig()` from outside the class simply won't compile; the *only*
door in is the static `Instance` property. (The `lock`-based double-check
above is a preview — module 10 covers exactly why naive lazy
initialization is unsafe under concurrency, and builds this up properly.)
{{/tabs}}

**The honest caveat, up front:** Singleton is the most *criticized* GoF
pattern, and for good reason — it's a global variable wearing a class's
clothes. Any class that reaches for `AppConfig.Instance` internally has a
hidden dependency invisible in its constructor, which directly fights
DIP (module 04) and makes unit testing harder (you can't inject a fake
config for a test — module 20 names this explicitly as an anti-pattern
to watch for). Use it sparingly, for things that are *genuinely*
singular by nature (there really is only one log file, one app-wide
config) — not as a general way to avoid passing a dependency through a
constructor.

### Factory Method — let subclasses decide which class to instantiate

**Problem it solves:** you want to create an object, but the *exact*
concrete class to create should be decided by a subclass, not hard-coded
in the base logic.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Notification(ABC):
    @abstractmethod
    def send(self, message): ...

class EmailNotification(Notification):
    def send(self, message): print(f"Emailing: {message}")

class SmsNotification(Notification):
    def send(self, message): print(f"Texting: {message}")

class NotificationCreator(ABC):
    @abstractmethod
    def create_notification(self) -> Notification: ...   # the "factory method" itself

    def notify(self, message):                             # shared logic, unaware of the concrete type
        notification = self.create_notification()
        notification.send(message)

class EmailNotificationCreator(NotificationCreator):
    def create_notification(self):
        return EmailNotification()

class SmsNotificationCreator(NotificationCreator):
    def create_notification(self):
        return SmsNotification()

EmailNotificationCreator().notify("hello")   # Emailing: hello
SmsNotificationCreator().notify("hello")     # Texting: hello
```
{{tab C#}}
```csharp
public interface INotification {
    void Send(string message);
}

public class EmailNotification : INotification {
    public void Send(string message) => Console.WriteLine($"Emailing: {message}");
}
public class SmsNotification : INotification {
    public void Send(string message) => Console.WriteLine($"Texting: {message}");
}

public abstract class NotificationCreator {
    protected abstract INotification CreateNotification();   // the "factory method" itself

    public void Notify(string message) {                      // shared logic, unaware of the concrete type
        var notification = CreateNotification();
        notification.Send(message);
    }
}

public class EmailNotificationCreator : NotificationCreator {
    protected override INotification CreateNotification() => new EmailNotification();
}
public class SmsNotificationCreator : NotificationCreator {
    protected override INotification CreateNotification() => new SmsNotification();
}

new EmailNotificationCreator().Notify("hello");   // Emailing: hello
new SmsNotificationCreator().Notify("hello");     // Texting: hello
```
{{/tabs}}

**Don't confuse this with a "simple factory."** A plain function or
static method with an `if`/`elif` chain choosing which class to build
(exactly what module 04's OCP fix turned *into* a Strategy) is a useful,
common idiom, but it isn't the GoF Factory Method pattern — the defining
trait of Factory Method is that **subclassing** decides the product,
via an overridden method, not a branch. Interviewers who ask "factory
method vs. simple factory" are testing exactly this distinction.

### Abstract Factory — families of related objects, guaranteed to match

**Problem it solves:** you need to create several *related* objects that
must be used together and must never be mismatched — e.g., a light-theme
button must never end up paired with a dark-theme checkbox.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Button(ABC):
    @abstractmethod
    def render(self): ...

class Checkbox(ABC):
    @abstractmethod
    def render(self): ...

class LightButton(Button):
    def render(self): print("[ Light Button ]")
class LightCheckbox(Checkbox):
    def render(self): print("[x] Light Checkbox")

class DarkButton(Button):
    def render(self): print("[ Dark Button ]")
class DarkCheckbox(Checkbox):
    def render(self): print("[x] Dark Checkbox")

class UIFactory(ABC):                       # the ABSTRACT factory: a family of related products
    @abstractmethod
    def create_button(self) -> Button: ...
    @abstractmethod
    def create_checkbox(self) -> Checkbox: ...

class LightUIFactory(UIFactory):
    def create_button(self): return LightButton()
    def create_checkbox(self): return LightCheckbox()

class DarkUIFactory(UIFactory):
    def create_button(self): return DarkButton()
    def create_checkbox(self): return DarkCheckbox()

def render_form(factory: UIFactory):
    factory.create_button().render()
    factory.create_checkbox().render()
    # impossible to accidentally mix LightButton with DarkCheckbox — the factory guarantees the family

render_form(DarkUIFactory())   # [ Dark Button ]  [x] Dark Checkbox
```
{{tab C#}}
```csharp
public interface IButton { void Render(); }
public interface ICheckbox { void Render(); }

public class LightButton : IButton { public void Render() => Console.WriteLine("[ Light Button ]"); }
public class LightCheckbox : ICheckbox { public void Render() => Console.WriteLine("[x] Light Checkbox"); }
public class DarkButton : IButton { public void Render() => Console.WriteLine("[ Dark Button ]"); }
public class DarkCheckbox : ICheckbox { public void Render() => Console.WriteLine("[x] Dark Checkbox"); }

public interface IUIFactory {                 // the ABSTRACT factory: a family of related products
    IButton CreateButton();
    ICheckbox CreateCheckbox();
}

public class LightUIFactory : IUIFactory {
    public IButton CreateButton() => new LightButton();
    public ICheckbox CreateCheckbox() => new LightCheckbox();
}
public class DarkUIFactory : IUIFactory {
    public IButton CreateButton() => new DarkButton();
    public ICheckbox CreateCheckbox() => new DarkCheckbox();
}

static void RenderForm(IUIFactory factory) {
    factory.CreateButton().Render();
    factory.CreateCheckbox().Render();
    // impossible to accidentally mix LightButton with DarkCheckbox — the factory guarantees the family
}

RenderForm(new DarkUIFactory());   // [ Dark Button ]  [x] Dark Checkbox
```
{{/tabs}}

**The relationship between Factory Method and Abstract Factory**: Factory
Method creates *one* product via subclassing; Abstract Factory creates
an entire *family* of related products (often implemented internally
*using* several Factory Methods, one per product in the family) and
guarantees they're always used together consistently.

### Builder — construct a complex object step by step

**Problem it solves:** an object has many optional parts/parameters, and
a constructor with ten optional arguments (or ten overloaded
constructors) is unreadable and error-prone. Builder constructs the
object incrementally, usually via **method chaining** ("fluent" style).

{{tabs}}
{{tab Python}}
```python
class Pizza:
    def __init__(self):
        self.size = "medium"
        self.cheese = False
        self.pepperoni = False
        self.extra_sauce = False

    def __repr__(self):
        toppings = [t for t, on in [("cheese", self.cheese), ("pepperoni", self.pepperoni)] if on]
        return f"{self.size} pizza with {', '.join(toppings) or 'no toppings'}"

class PizzaBuilder:
    def __init__(self):
        self._pizza = Pizza()

    def size(self, size):
        self._pizza.size = size
        return self                  # returning self is what makes chaining possible

    def add_cheese(self):
        self._pizza.cheese = True
        return self

    def add_pepperoni(self):
        self._pizza.pepperoni = True
        return self

    def build(self) -> Pizza:
        return self._pizza

pizza = (PizzaBuilder()
         .size("large")
         .add_cheese()
         .add_pepperoni()
         .build())
print(pizza)   # large pizza with cheese, pepperoni
```
{{tab C#}}
```csharp
public class Pizza {
    public string Size = "medium";
    public bool Cheese, Pepperoni, ExtraSauce;

    public override string ToString() {
        var toppings = new List<string>();
        if (Cheese) toppings.Add("cheese");
        if (Pepperoni) toppings.Add("pepperoni");
        return $"{Size} pizza with {(toppings.Count > 0 ? string.Join(", ", toppings) : "no toppings")}";
    }
}

public class PizzaBuilder {
    private Pizza _pizza = new Pizza();

    public PizzaBuilder Size(string size) {
        _pizza.Size = size;
        return this;                 // returning 'this' is what makes chaining possible
    }
    public PizzaBuilder AddCheese() {
        _pizza.Cheese = true;
        return this;
    }
    public PizzaBuilder AddPepperoni() {
        _pizza.Pepperoni = true;
        return this;
    }
    public Pizza Build() => _pizza;
}

var pizza = new PizzaBuilder()
    .Size("large")
    .AddCheese()
    .AddPepperoni()
    .Build();
Console.WriteLine(pizza);   // large pizza with cheese, pepperoni
```
{{/tabs}}

Compare this to module 01's constructor-overloading example
(`Rectangle`/`Square`) — overloading works for two or three parameter
combinations, but collapses once you have many *independent optional*
parts; Builder scales to that case cleanly, and reads like a sentence at
the call site.

### Prototype — clone an existing object instead of building from scratch

**Problem it solves:** creating an object from scratch is expensive or
complex (many fields to set up, an expensive computation to redo), but
you already have a fully-configured instance you can copy.

{{tabs}}
{{tab Python}}
```python
import copy

class Enemy:
    def __init__(self, name, stats, inventory):
        self.name = name
        self.stats = stats            # a dict — MUTABLE, watch this
        self.inventory = inventory    # a list — also MUTABLE

    def clone(self) -> "Enemy":
        return copy.deepcopy(self)    # deep copy: nested dict/list are copied too, not shared

orc_template = Enemy("Orc", {"hp": 100, "attack": 15}, ["axe"])

orc1 = orc_template.clone()
orc2 = orc_template.clone()
orc1.stats["hp"] = 50           # only affects orc1

print(orc1.stats)    # {'hp': 50, 'attack': 15}
print(orc2.stats)    # {'hp': 100, 'attack': 15} — untouched, because clone() deep-copied
```

`copy.copy()` (shallow) vs. `copy.deepcopy()` (deep) is the exact
distinction that matters here — a shallow copy duplicates the `Enemy`
object itself but leaves it pointing at the *same* `stats` dict and
`inventory` list as the original, so mutating `orc1.stats` would have
silently corrupted `orc_template` and `orc2` too. This is directly the
same class of bug as module 01's mutable-class-attribute trap, showing
up again in a new place.
{{tab C#}}
```csharp
public class Enemy {
    public string Name;
    public Dictionary<string, int> Stats;   // MUTABLE, watch this
    public List<string> Inventory;           // also MUTABLE

    public Enemy(string name, Dictionary<string, int> stats, List<string> inventory) {
        Name = name; Stats = stats; Inventory = inventory;
    }

    public Enemy Clone() {
        // DEEP copy: build new nested collections, don't share the originals' references
        return new Enemy(Name, new Dictionary<string, int>(Stats), new List<string>(Inventory));
    }
}

var orcTemplate = new Enemy("Orc", new Dictionary<string, int> { { "hp", 100 }, { "attack", 15 } },
                              new List<string> { "axe" });

var orc1 = orcTemplate.Clone();
var orc2 = orcTemplate.Clone();
orc1.Stats["hp"] = 50;            // only affects orc1

Console.WriteLine(orc1.Stats["hp"]);   // 50
Console.WriteLine(orc2.Stats["hp"]);   // 100 — untouched, because Clone() deep-copied
```

C# has no built-in universal deep-copy the way Python's `copy.deepcopy`
is — you write the deep copy explicitly (as above), or implement it via
serialization for very complex graphs. The important discipline is the
same either way: a `Clone()` that only copies top-level fields
(`new Enemy(Name, Stats, Inventory)`, reusing the *same* dictionary and
list references) is a shallow copy in disguise, and reintroduces the
exact shared-mutable-state bug this pattern exists to avoid.
{{/tabs}}

## Hands-on exercises

### 1. A real Singleton

Build a `Logger` singleton with a `log(message)` method that appends to
an in-memory list, and a `get_logs()`/`GetLogs()` method. Confirm from
two different places in your code that both "instances" you get back are
actually the same object and share the same log history.

### 2. Factory Method for payment processors

Build a `PaymentProcessorCreator` abstract base with an abstract
`create_processor()`/`CreateProcessor()` factory method and a shared
`process_payment(amount)`/`ProcessPayment(amount)` method that uses it.
Implement `CreditCardProcessorCreator` and `PayPalProcessorCreator`
subclasses.

### 3. Abstract Factory for a cross-platform UI

Extend the Light/Dark UI factory example with a third product,
`ScrollBar`, in both families. Confirm `render_form`/`RenderForm` never
needs to change to support the new product type — only the factories and
concrete products do.

### 4. Builder for a User profile

Build a `UserProfileBuilder` with optional chained methods for `name`,
`email`, `bio`, and `avatar_url`, ending in `.build()`/`.Build()`, used to
construct a `UserProfile`. Show constructing two different profiles with
different subsets of fields set.

### 5. Prototype with a deliberate shallow-copy bug

First implement a *shallow* clone (Python: `copy.copy`; C#: a
constructor call reusing the same nested collection references) for the
`Enemy` example, and demonstrate the bug — mutating one clone's stats
corrupts the "template." Then fix it to a proper deep copy and re-run
the same demonstration to show it's now safe.

## Independent challenge

No code given.

**Task:** Design a small **Vehicle configuration system**, using at
least three of the five patterns from this module together:

- An **Abstract Factory** producing matching families of parts for two
  vehicle lines — e.g. a `SedanPartsFactory` and an `SUVPartsFactory`,
  each creating a matching `Engine` and `Wheels` (a Sedan should never
  end up with SUV wheels).
- A **Builder** that assembles a full `Vehicle` from a chosen parts
  factory plus optional extras (sunroof, leather seats, tow package).
- A **Singleton** `VehicleRegistry` that every built vehicle registers
  itself into on creation, with a method to list all vehicles built so
  far in the program's lifetime.

Build at least one Sedan and one SUV through this system, confirm the
registry shows both, and confirm no Sedan ever ends up with an SUV part.

<details>
<summary>Hint</summary>

The Builder's constructor or a setter should take an `IPartsFactory`
(or `PartsFactory` in Python) as a dependency (this is also DIP, module
04, in action) — the Builder itself shouldn't know or care whether it's
building a Sedan or an SUV, only that it was handed a matching factory
for one family of parts. The Singleton registry should be reached for
sparingly and only for this one genuinely-singular piece of state (the
running list of all vehicles) — not as a dumping ground for anything
else, per this module's Singleton caveat.

</details>

## Common mistakes & troubleshooting

- **Reaching for Singleton as a substitute for passing a dependency.**
  If a class internally calls `SomeSingleton.Instance` instead of
  receiving what it needs through its constructor, that dependency is
  now invisible from the outside and impossible to fake in a test — this
  directly undermines DIP (module 04). Ask "is this genuinely one-of-a-
  kind in the whole application," not "would a global be convenient
  here."
- **Calling any `if`/`elif` class-selection logic "Factory Method."**
  If there's no subclassing and no overridden method deciding the
  product, it's a *simple factory* (a fine, common idiom) but not the
  GoF Factory Method pattern — know the difference, an interviewer will.
- **Building an Abstract Factory for only one product family.** If
  there's only ever one "family" in sight, a full Abstract Factory is
  premature generality — this is YAGNI (module 05) applied directly to
  a creational pattern; wait for a second real family before
  introducing the abstraction.
- **Forgetting to `return self`/`return this` in a Builder method.** The
  entire fluent-chaining API breaks (or silently returns `None`/`void`)
  if even one step forgets to return the builder itself.
- **A Prototype `clone()` that only copies top-level references
  (shallow copy) for an object with nested mutable state.** As shown
  above, this doesn't actually protect the "template" or sibling clones
  from each other — always be deliberate about shallow vs. deep copy
  based on whether your fields are themselves mutable containers.

## Checkpoint quiz

1. What's the actual enforcement mechanism that makes a C# Singleton
   impossible to instantiate from outside the class?
2. What's the difference between a "simple factory" (an `if`/`elif`
   chain in a static method) and the Factory Method *pattern*?
3. Why can't `render_form`/`RenderForm` (Abstract Factory example) ever
   accidentally receive a mismatched Light button with a Dark checkbox?
4. What does a Builder method need to do, every step, to make method
   chaining possible?
5. What's the difference between a shallow copy and a deep copy, and
   why does it matter for Prototype specifically?
6. Name one real reason Singleton is criticized as an anti-pattern by
   many engineers.

<details>
<summary>Answers</summary>

1. A **private constructor** — code outside the class simply cannot
   compile a call to `new AppConfig()`; the only way to obtain an
   instance is through the static `Instance` property.
2. A simple factory is just a function/static method that branches to
   decide which concrete class to build — no subclassing involved. The
   Factory Method *pattern* specifically uses an abstract/virtual
   "factory method" that **subclasses override** to decide the product,
   while shared logic in the base class stays the same for every
   subclass.
3. Because each concrete factory (`LightUIFactory`/`DarkUIFactory`)
   creates its *entire* matching family internally — `RenderForm` only
   ever calls `CreateButton()`/`CreateCheckbox()` on whichever single
   factory it was given, so both products it gets back always came from
   the same family.
4. It must `return self`/`return this` at the end, so the next method
   call in the chain can be called directly on the result of the
   previous one.
5. A shallow copy duplicates the top-level object but leaves its fields
   pointing at the *same* nested objects (mutable containers) as the
   original; a deep copy recursively duplicates those nested objects
   too. It matters for Prototype because a shallow-copied clone would
   silently share (and let you corrupt) the original template's mutable
   internal state.
6. It behaves like a global variable: it hides a class's real
   dependencies (nothing in the constructor signature reveals it), and
   makes unit testing harder because you can't substitute a fake
   instance for a test.

</details>

## Interview questions

1. **"What's the difference between Factory Method and Abstract
   Factory?"**
   Factory Method creates one product, with the concrete type decided
   by an overridden method in a subclass. Abstract Factory creates an
   entire *family* of related products (often several, via multiple
   factory methods internally) and guarantees they're always used
   together consistently — the key added concern is *consistency across
   multiple related objects*, not just "which one class to make."
2. **"Is Singleton an anti-pattern? Would you use it?"**
   It's controversial, not universally banned — it solves a real
   problem (genuinely singular resources) but is frequently *misused*
   as a convenient global, which hides dependencies and hurts
   testability. A defensible answer: use it sparingly for things that
   are truly one-of-a-kind at the application level, and prefer passing
   a dependency explicitly (module 04's DIP) in every other case.
3. **"When would you choose a Builder over just adding constructor
   parameters?"**
   When an object has many *optional*, independently-settable parts —
   constructor overloading (module 01) or a single huge parameter list
   becomes unreadable and error-prone past a handful of options; Builder
   scales cleanly and self-documents which fields are being set at the
   call site via named chained methods.
4. **"How would you implement a thread-safe Singleton, at a high
   level?"**
   Guard the lazy-initialization check with a lock so two threads can't
   both see "not yet created" and both construct an instance
   simultaneously — shown as a preview above (double-checked locking);
   module 10 covers the full reasoning and safer alternatives (like
   Python's import-time module-level singleton, or C#'s `Lazy<T>`) in
   depth.
5. **"What's the risk with a naive Prototype `clone()` implementation?"**
   If it only shallow-copies (duplicates the top-level object but
   reuses references to the same nested mutable collections/objects),
   mutating one "clone" silently corrupts the original template and
   every other clone sharing that same nested state — always deep-copy
   any mutable nested fields, or make the prototype's data immutable
   (module 03's value objects) so shallow-copying is actually safe.

## Further reading & sources

- [Refactoring.Guru: Creational Patterns](https://refactoring.guru/design-patterns/creational-patterns) - clear diagrams and multi-language examples for all five patterns in this module.
- [Microsoft Learn: Lazy&lt;T&gt; (a safer built-in alternative to hand-rolled lazy Singleton in C#)](https://learn.microsoft.com/en-us/dotnet/api/system.lazy-1) - the production-grade way to lazily initialize a singleton in real C# code.
- [Python: `copy` — shallow and deep copy operations](https://docs.python.org/3/library/copy.html) - official reference for `copy.copy` vs `copy.deepcopy`, the Prototype mechanism used above.
- [Gang of Four: *Design Patterns: Elements of Reusable Object-Oriented Software*](https://en.wikipedia.org/wiki/Design_Patterns) - the original source of all five patterns in this module (and every pattern in modules 07-09).

## Next

[07-structural-patterns](../07-structural-patterns/README.md) — with
creation handled, we move to patterns for composing classes and objects
into larger structures: Adapter, Decorator, Facade, Composite, Proxy,
Bridge, and Flyweight.
