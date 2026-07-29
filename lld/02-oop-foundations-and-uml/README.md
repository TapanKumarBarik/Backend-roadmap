# Module 02: OOP Foundations & UML

## Why this matters

"Design patterns" is really just a name for recurring, well-tested ways of
combining four ideas: **encapsulation, abstraction, inheritance, and
polymorphism** — the "four pillars" of object-oriented design. You already
met encapsulation in module 01. This module completes the set, and adds
the other half of what every LLD interview actually tests: **can you draw
your design before you code it?** UML (Unified Modeling Language) is the
shared notation for that — a class diagram is how you and an interviewer
agree on a design's shape in five minutes instead of arguing over fifty
lines of code.

## Concepts

### The four pillars, in one pass

| Pillar | One-line definition | Where you've already seen it |
|---|---|---|
| **Encapsulation** | Hide internal data behind methods/properties that control access | Module 01 — private fields, properties |
| **Abstraction** | Expose *what* something does, hide *how* | Below — abstract classes/interfaces |
| **Inheritance** | A class reuses and extends another class's shape | Below — base/derived classes |
| **Polymorphism** | Different classes respond to the same call in their own way | Below — overriding + calling through a common type |

### Abstraction: interfaces and abstract classes

**Abstraction** means defining *what* operations exist without
necessarily saying *how* they're implemented — a contract, not an
implementation. Both languages let you declare a class that can't be
instantiated directly, only used as a base that *must* be completed by a
subclass.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Shape(ABC):              # ABC = Abstract Base Class
    @abstractmethod
    def area(self) -> float:
        ...                    # no implementation — subclasses MUST provide one

class Circle(Shape):
    def __init__(self, radius):
        self.radius = radius

    def area(self) -> float:
        return 3.14159 * self.radius ** 2

# shape = Shape()      # TypeError: Can't instantiate abstract class Shape
circle = Circle(2)
print(circle.area())   # 12.56636
```

Python doesn't have a separate "interface" keyword — an `ABC` with only
`@abstractmethod`s and no shared implementation *is* what other languages
call an interface; an `ABC` that also provides some real methods is what
other languages call an abstract class. Same mechanism, different intent.
{{tab C#}}
```csharp
public interface IShape {              // interface: pure contract, no implementation at all
    double Area();
}

public abstract class ShapeBase {      // abstract class: CAN mix real code with abstract members
    public string Name = "shape";
    public abstract double Area();     // subclasses MUST implement this
}

public class Circle : ShapeBase, IShape {
    private double _radius;
    public Circle(double radius) { _radius = radius; }
    public override double Area() {    // 'override' is required — makes the contract explicit
        return Math.PI * _radius * _radius;
    }
}

// var s = new ShapeBase();   // COMPILE ERROR: cannot create an instance of an abstract class
var circle = new Circle(2);
Console.WriteLine(circle.Area());   // 12.566...
```

C# makes the distinction explicit with two separate keywords:
**`interface`** is a pure contract — no fields, no implementation, a class
can implement *many* interfaces. An **`abstract class`** can mix real
implemented members with abstract ones a subclass must fill in, but a
class can inherit from only *one* class (abstract or not).
{{/tabs}}

### Inheritance: reusing and extending a shape

**Inheritance** models an **"is-a" relationship**: a `Dog` *is an*
`Animal`. The derived (child) class automatically gets everything the
base (parent) class defines, and can add new members or override
existing ones.

{{tabs}}
{{tab Python}}
```python
class Animal:
    def __init__(self, name):
        self.name = name

    def make_sound(self):
        return "..."

class Dog(Animal):                    # Dog inherits from Animal
    def make_sound(self):             # OVERRIDING the base method
        return "Woof!"

class Cat(Animal):
    def make_sound(self):
        return "Meow!"

d = Dog("Rex")
print(d.name)          # "Rex" — inherited from Animal, not redefined in Dog
print(d.make_sound())  # "Woof!" — Dog's own version
```

A subclass constructor that needs the parent's setup calls it explicitly
with `super().__init__(...)`:

```python
class Puppy(Dog):
    def __init__(self, name, age_months):
        super().__init__(name)        # runs Animal's __init__ first
        self.age_months = age_months
```
{{tab C#}}
```csharp
public class Animal {
    public string Name;
    public Animal(string name) { Name = name; }

    public virtual string MakeSound() {   // 'virtual' = "subclasses MAY override this"
        return "...";
    }
}

public class Dog : Animal {               // Dog inherits from Animal
    public Dog(string name) : base(name) { }   // ': base(name)' calls Animal's constructor

    public override string MakeSound() {       // OVERRIDING — 'override' is mandatory here
        return "Woof!";
    }
}

public class Cat : Animal {
    public Cat(string name) : base(name) { }
    public override string MakeSound() { return "Meow!"; }
}

var d = new Dog("Rex");
Console.WriteLine(d.Name);          // "Rex" — inherited from Animal
Console.WriteLine(d.MakeSound());   // "Woof!" — Dog's own version
```

Two keywords work together and are both required: the base method must be
marked **`virtual`** ("subclasses are allowed to override this") and the
subclass's version must be marked **`override`** ("this intentionally
replaces the base version"). Forgetting either is a compile error or
silent bug — covered in Common Mistakes.
{{/tabs}}

### Polymorphism: one call, many behaviors

**Polymorphism** ("many forms") means you can call the *same* method name
on a variable typed as the base/interface, and each actual object responds
in its own overridden way — without the calling code needing an `if` for
every possible type.

{{tabs}}
{{tab Python}}
```python
animals = [Dog("Rex"), Cat("Tom"), Animal("Generic")]

for animal in animals:
    print(f"{animal.name}: {animal.make_sound()}")
# Rex: Woof!
# Tom: Meow!
# Generic: ...
```

The loop has **no idea** which concrete class each `animal` is — it just
calls `.make_sound()` and each object supplies its own behavior. This is
also why Python code rarely needs `isinstance()` checks: if every object
in a collection *responds* to `.make_sound()`, Python doesn't even
require they share a base class at all — this looser style is called
**duck typing** ("if it walks like a duck and quacks like a duck..."). An
`ABC` (as in the Abstraction section) is how you *choose* to enforce the
contract anyway, for safety and clarity.
{{tab C#}}
```csharp
List<Animal> animals = new List<Animal> {
    new Dog("Rex"), new Cat("Tom"), new Animal("Generic")
};

foreach (var animal in animals) {
    Console.WriteLine($"{animal.Name}: {animal.MakeSound()}");
}
// Rex: Woof!
// Tom: Meow!
// Generic: ...
```

Every element in the list is *typed* as `Animal`, but `MakeSound()`
still runs each object's own overridden version — this is C#'s
polymorphism, and it's enforced by the type system: unlike Python, C#
requires the shared base type (`Animal`) to even put them in one
`List<Animal>` together, or a shared `interface` if they're otherwise
unrelated.
{{/tabs}}

### UML class diagrams: drawing a design before coding it

A UML class diagram is a box per class, split into three sections:

```
┌─────────────────────────┐
│         Animal          │   ← class name
├─────────────────────────┤
│ - name: string           │   ← attributes (fields), with visibility
├─────────────────────────┤
│ + makeSound(): string    │   ← methods, with visibility
└─────────────────────────┘
```

**Visibility symbols** prefix every attribute and method:

| Symbol | Means |
|---|---|
| `+` | public |
| `-` | private |
| `#` | protected |
| `~` | package/internal |

**Relationship lines** between boxes are where most of the actual design
information lives:

```
Animal  <|-- Dog              inheritance/generalization (hollow triangle, solid line)
                               "Dog IS-A Animal"

IShape  <|.. Circle            realization/implementation (hollow triangle, DASHED line)
                               "Circle IMPLEMENTS IShape"

Car  o-- Engine                aggregation (hollow diamond)
                               "Car HAS-A Engine, but Engine can outlive the Car"
                               (e.g. swap the engine into a different car)

House  *-- Room                composition (filled diamond)
                               "House OWNS Room; a Room cannot outlive its House"
                               (destroy the House, its Rooms are destroyed with it)

Driver  --> Car                 association (plain arrow)
                               "Driver USES/references a Car" — the weakest relationship

Order  ..> PaymentGateway       dependency (dashed arrow)
                               "Order calls PaymentGateway briefly" — not a stored reference,
                               just "this class depends on that one to do its job"
```

**Aggregation vs. composition is the one distinction interviewers
actually probe**, because it changes your code's lifetime management: if
deleting the container should also delete its parts, that's composition
(the parts are typically created *inside* the container's constructor and
never shared outside it); if the parts have independent existence, that's
aggregation (they're typically passed *in* from outside).

**Multiplicity** (how many of one class relate to how many of another) is
written at each end of a line: `Driver "1" --> "0..*" Car` means one
Driver can be associated with zero or more Cars.

### UML sequence diagrams: showing a flow over time

Where a class diagram shows *structure* (what exists), a sequence diagram
shows *behavior over time* (what calls what, in order) — essential for
explaining a use case like "what happens when a user places an order."

```
Customer          Order              PaymentGateway         Inventory
   |                 |                      |                    |
   |--placeOrder()-->|                      |                    |
   |                 |----charge()--------->|                    |
   |                 |                      |--(success)-------->|
   |                 |<---(charged)---------|                    |
   |                 |------------reserveItems()--------------->|
   |                 |<-----------------(reserved)---------------|
   |<--(confirmed)---|                      |                    |
   |                 |                      |                    |
```

Each vertical line is a **lifeline** (one object/participant). Each
horizontal arrow is a **message** (a method call), read top to bottom in
the order things actually happen. You'll draw diagrams exactly like this
one, by hand, in module 11 (turning requirements into diagrams) and again
in every classic-problem module from 12 onward — this is the actual
whiteboard skill an LLD interview tests.

## Hands-on exercises

### 1. Build the Animal hierarchy

Implement the `Animal`/`Dog`/`Cat` hierarchy from the Inheritance section
above, in both languages, plus one more subclass, `Bird`, that overrides
`make_sound`/`MakeSound` to return `"Tweet!"`. Put all four in one
collection and loop over it printing each sound (the Polymorphism
example) — confirm you see all four distinct outputs from one loop with
one method call.

### 2. Add an abstract method

Make `Animal`/`ShapeBase`-style abstraction real: turn `make_sound` into
an abstract method (Python: `@abstractmethod` on an `ABC`; C#: `abstract`
on an `abstract class`) so that `Animal` itself can no longer be
instantiated directly, only its subclasses. Confirm attempting to
instantiate the base class now fails.

### 3. Draw it first

Before writing any code, draw (as text/ASCII, like the examples above) a
UML class diagram for a `Library` that has many `Book`s (composition —
books are created by and belong to the library) and lends to many
`Member`s (association — members exist independently of the library).
Include visibility symbols and at least one method on each class. *Then*
implement it in both languages and check your code actually matches what
you drew.

### 4. Sequence diagram for a real flow

Draw a sequence diagram (text/ASCII) for "a `Member` borrows a `Book`
from a `Library`" using the classes from exercise 3 — at minimum it
should show the `Member` calling something on `Library`, `Library`
checking the `Book`'s availability, and a final confirmation back to
`Member`.

## Independent challenge

No code given.

**Task:** Design and implement a small **Shape** hierarchy, in both
languages: an abstract `Shape` with abstract `area()` and `perimeter()`
methods, and at least three concrete subclasses (`Circle`, `Rectangle`,
`Triangle`). Then write a function that takes a collection of `Shape`s
(typed as the abstract base — this is the polymorphism part) and returns
the **total area** of all of them, without any `if`/`isinstance`/type
-checking inside that function. Draw the UML class diagram for this
hierarchy first, before writing the code, exactly as you practiced in
exercise 3.

<details>
<summary>Hint</summary>

The "no `if`/type-checking" constraint is the actual point of the
exercise: if you find yourself writing `if isinstance(shape, Circle):
... elif isinstance(shape, Rectangle): ...` inside the total-area
function, you've defeated the purpose of polymorphism — that logic
belongs *inside* each shape's own `area()` override, not in code that
consumes the shapes. The total-area function should be a single loop
calling `.area()` and summing, nothing else.

</details>

## Common mistakes & troubleshooting

- **Forgetting `virtual`/`override` in C#.** If a base method isn't
  marked `virtual` (or `abstract`), a subclass's same-named method
  doesn't override it — it silently *hides* it instead, and which
  version runs depends on the *declared* type of the variable, not the
  actual object, which is almost never what you want and is a genuine,
  common bug source.
- **Forgetting to call the base constructor.** In C#, if the base class
  has no parameterless constructor, you *must* call `: base(...)`
  explicitly with matching arguments, or it won't compile. In Python,
  forgetting `super().__init__(...)` compiles fine but silently skips the
  parent's setup — a much sneakier bug because Python won't stop you.
- **Reaching for inheritance when you mean "has-a."** Just because two
  classes share some behavior doesn't mean one should inherit from the
  other — inheritance should model "is-a," not "reuses some code from."
  (Module 05 covers this in depth: composition-over-inheritance.)
- **Confusing interface and abstract class in C#.** Interface: pure
  contract, no fields, a class can implement many. Abstract class: can
  mix real code with abstract requirements, a class can inherit from
  only one. If you need "shared code across several unrelated types,"
  that's usually an interface each implements independently, not a
  forced shared abstract base.
- **Drawing composition when you mean aggregation (or vice versa).** Ask
  yourself: "if I delete the container, should the parts also die?" Yes
  → composition (filled diamond). No, they can be reused/reassigned
  elsewhere → aggregation (hollow diamond). Getting this wrong in an
  interview signals you haven't thought about object lifetime.

## Checkpoint quiz

1. Name the four pillars of OOP and give a one-sentence definition of
   each.
2. In C#, what two keywords are both required to make method overriding
   work correctly, and where does each go?
3. What's the practical difference between an interface and an abstract
   class in C#? Does Python distinguish them the same way?
4. In the polymorphic "total area" example, why is it wrong for the
   total-area function to contain `if isinstance(shape, Circle): ...`?
5. What UML diamond (hollow or filled) represents composition, and what
   does that imply about object lifetime?
6. What's the difference between association and dependency in UML?

<details>
<summary>Answers</summary>

1. Encapsulation (hide data behind controlled access), abstraction
   (expose what, hide how), inheritance (a class reuses/extends
   another's shape, modeling "is-a"), polymorphism (the same call
   produces different behavior depending on the actual object).
2. `virtual` on the base class's method, and `override` on the
   subclass's version. Both are required for real overriding to happen.
3. An interface is a pure contract (no implementation, no fields); a
   class can implement many. An abstract class can mix real
   implementation with abstract members; a class can inherit from only
   one. Python doesn't distinguish them with separate keywords — an ABC
   with only abstract methods plays the role of an interface, and one
   with some real methods plays the role of an abstract class.
4. Because it defeats polymorphism's entire purpose — the "which
   behavior for which type" decision should live inside each subclass's
   own overridden method, not in the code that consumes them. The
   `if`/`isinstance` chain also has to be updated every time a new
   shape is added, whereas the polymorphic version doesn't.
5. A filled diamond represents composition — it implies the "owned"
   object's lifetime is tied to its owner; destroying the container
   destroys its parts.
6. Association is a stored reference/relationship one object holds onto
   (e.g., a field pointing at another object); dependency is a brief,
   non-stored "uses it to do a job" relationship (e.g., a parameter
   passed into one method call, never kept).

</details>

## Interview questions

1. **"Explain the four pillars of OOP with a real example, not just
   definitions."**
   Encapsulation: a `BankAccount`'s balance is private, only changed via
   `deposit`/`withdraw`. Abstraction: callers of `Shape.area()` don't
   need to know *how* each shape computes it. Inheritance: `SavingsAccount`
   and `CheckingAccount` both extend a shared `Account` base. Polymorphism:
   a loop over `List<Account>` calling `.calculateInterest()` runs each
   account type's own logic without an `if` chain.
2. **"What's the difference between method overriding and method
   overloading?"**
   Overriding: a subclass replaces a base class's method with its own
   implementation (same name, same signature, runtime dispatch based on
   actual object type). Overloading: multiple methods with the *same
   name but different parameter signatures* in the same class, resolved
   at compile time based on the arguments passed — a different
   mechanism entirely (you saw this with C# constructor overloads in
   module 01).
3. **"When would you choose an abstract class over an interface, or vice
   versa?"**
   Interface, when unrelated types need to promise the same capability
   with no shared implementation (a `Flyable` interface implemented by
   both `Bird` and `Airplane`, which share nothing else). Abstract
   class, when subclasses genuinely share a common "is-a" lineage *and*
   some real reusable implementation, not just a shared method
   signature.
4. **"What is duck typing, and does C# support it?"**
   Duck typing (from Python's world): if an object has the method you're
   about to call, you can call it, regardless of its declared type or
   inheritance — "if it quacks like a duck." C# is statically typed and
   requires a shared type (interface, base class, or `dynamic`, rarely
   used) to call a method polymorphically — it doesn't support duck
   typing the way Python does by default.
5. **"What's the difference between aggregation and composition, and why
   does it matter in a design?"**
   Both are "has-a" relationships; the difference is lifetime
   ownership. Composition: the part cannot exist independently of the
   whole (a `Room` inside a `House`) — when the whole is destroyed, so
   are its parts. Aggregation: the part has an independent lifetime and
   can be shared or reassigned (an `Engine` that could be moved to a
   different `Car`). It matters because it drives real decisions: who
   constructs the part, who's responsible for cleaning it up, and
   whether it can be shared.

## Cumulative review

Closed-book. Pulls from modules 00–02.

1. (00 + 01) What does `self`/`this` refer to inside an instance method,
   and how is it made explicit differently in Python vs. C#?
2. (00 + 02) `7 / 3` truncates to `2` in C#. Given that C# is statically
   typed, why does the compiler allow this instead of refusing to
   compile it?
3. (01 + 02) A property with a validating setter, and an abstract
   method, are both a form of the same OOP pillar. Which one, and why?
4. (01 + 02) Why does forgetting `super().__init__()`/`: base(...)`
   (module 01/02) tend to produce a much sneakier bug in Python than in
   C#?
5. (02) In the Animal/Dog/Cat polymorphism example, what would happen if
   `Dog` didn't override `make_sound`/`MakeSound` at all?

<details>
<summary>Answers</summary>

1. It refers to "the specific object this method was called on." Python
   makes it explicit as the required first parameter (`self`); C# makes
   it implicit (a bare field name already refers to `this` object's
   field), only writing `this.` explicitly to disambiguate from a
   same-named parameter.
2. Because `int / int` producing `int` (with truncation) is *itself* a
   valid, well-typed operation in C#'s type system — there's no type
   error, just a numeric result you may not have wanted. The compiler
   only rejects code that doesn't type-check, not code that type-checks
   but produces a surprising value.
3. Abstraction. Both hide "how" behind a stable "what": the property's
   caller doesn't know or care that a check happens on write; the
   abstract method's caller doesn't know or care how each subclass
   actually computes the answer.
4. C# requires an explicit `: base(...)` call whenever the base class
   has no parameterless constructor, and refuses to compile if it's
   missing and required — the mistake is caught immediately. Python's
   `super().__init__(...)` is just a normal method call you can forget
   entirely; the code still runs, just with the parent's setup silently
   skipped, so the bug surfaces later as missing/uninitialized data
   instead of at write-time.
5. It would inherit `Animal`'s own `make_sound`/`MakeSound` unchanged and
   print `Animal`'s generic sound ("...") instead of "Woof!" — perfectly
   legal, just not what you intended; this is exactly why the pattern is
   called "overriding" and not "required per subclass."

</details>

## Further reading & sources

- [Python: `abc` — Abstract Base Classes](https://docs.python.org/3/library/abc.html) - official reference for `ABC`/`@abstractmethod`.
- [Microsoft Learn: Inheritance (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/object-oriented/inheritance) - `virtual`/`override`/`base` in depth.
- [Microsoft Learn: Interfaces (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/interfaces) - official interface reference, including multiple-implementation.
- [UML class diagram relationships (association, aggregation, composition, generalization)](https://www.uml-diagrams.org/class-reference.html) - the authoritative visual notation reference this module's ASCII diagrams are based on.
- [UML sequence diagrams reference](https://www.uml-diagrams.org/sequence-diagrams-reference.html) - lifelines, messages, activation bars in full notation.

## Next

[03-generics-exceptions-and-value-objects](../03-generics-exceptions-and-value-objects/README.md)
— generic/type-safe classes and methods, designing an exception hierarchy
instead of throwing generic errors everywhere, and modeling immutable
value objects with enums and records/dataclasses.
