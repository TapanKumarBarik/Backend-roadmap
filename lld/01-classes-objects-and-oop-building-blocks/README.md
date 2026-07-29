# Module 01: Classes, Objects & OOP Building Blocks

## Why this matters

Every module after this one — SOLID, every design pattern, every classic
interview problem — is really just "arrange classes well." None of that
matters if you're shaky on what a class *is*, how an object gets created,
what "private" actually protects, or why almost nobody exposes a raw
public field in real code. This module is the vocabulary and mechanics
you'll use in every single module from here to the capstone. Nothing here
is a "design pattern" yet — this is the alphabet, not the sentences.

## Concepts

### Classes and objects

A **class** is a blueprint — it describes what data (fields) and behavior
(methods) something has, but creates nothing by itself. An **object** (or
**instance**) is one concrete thing built from that blueprint, with its
own copy of the data. `Dog` the class describes "a dog has a name and can
bark"; `my_dog = Dog("Rex")` is one actual dog named Rex.

{{tabs}}
{{tab Python}}
```python
class Dog:
    def __init__(self, name):     # the constructor
        self.name = name          # 'self' = "this particular object"

    def bark(self):
        print(f"{self.name} says Woof!")

my_dog = Dog("Rex")     # creates an object (an instance of Dog)
my_dog.bark()           # Rex says Woof!

other_dog = Dog("Fido")
other_dog.bark()        # Fido says Woof! — a separate object, separate data
```
{{tab C#}}
```csharp
public class Dog {
    public string Name;

    public Dog(string name) {     // the constructor — same name as the class
        Name = name;              // 'this' is implicit here; could write this.Name
    }

    public void Bark() {
        Console.WriteLine($"{Name} says Woof!");
    }
}

var myDog = new Dog("Rex");   // 'new' creates the object
myDog.Bark();                 // Rex says Woof!

var otherDog = new Dog("Fido");
otherDog.Bark();               // Fido says Woof! — a separate object, separate data
```
{{/tabs}}

Notice the shape is identical in both: a constructor sets up each object's
own data, and methods act on `self`/(implicit `this`) — "the object this
method was called on."

### `self` and `this`

Every instance method needs a way to refer to "the specific object it was
called on." Python makes this **explicit**: every instance method's first
parameter is `self`, and you access fields as `self.name`. C# makes this
**implicit**: inside a method, a bare `Name` already means "this object's
`Name`"; you only write `this.Name` when you need to disambiguate (most
commonly, when a constructor parameter has the same name as a field).

{{tabs}}
{{tab Python}}
```python
class Point:
    def __init__(self, x, y):
        self.x = x     # self.x is the field; x is the parameter — same name, no clash
        self.y = y

    def distance_from_origin(self):
        return (self.x ** 2 + self.y ** 2) ** 0.5
```
{{tab C#}}
```csharp
public class Point {
    public double X;
    public double Y;

    public Point(double x, double y) {
        this.X = x;    // 'this.X' disambiguates the field from the parameter 'x'
        this.Y = y;
    }

    public double DistanceFromOrigin() {
        return Math.Sqrt(X * X + Y * Y);   // no 'this.' needed — no name clash here
    }
}
```
{{/tabs}}

### Constructors

A constructor runs once, automatically, when an object is created — its
job is to put the new object into a valid starting state.

{{tabs}}
{{tab Python}}
```python
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

r = Rectangle(3, 4)
```

Python has exactly one constructor method, `__init__`. You *can* fake
"multiple constructors" with default parameter values or by writing
alternate constructors as `@classmethod`s that return a built instance
(you'll see this pattern for real in the Builder pattern, module 06).
{{tab C#}}
```csharp
public class Rectangle {
    public double Width;
    public double Height;

    public Rectangle(double width, double height) {
        Width = width;
        Height = height;
    }

    public Rectangle(double side) : this(side, side) {   // constructor overload
        // a square is just a rectangle with equal sides —
        // ": this(side, side)" calls the two-parameter constructor above
    }
}

var r1 = new Rectangle(3, 4);
var r2 = new Rectangle(5);      // uses the one-parameter overload -> a 5x5 square
```

C# genuinely supports **multiple constructors** (constructor overloading)
— the compiler picks the right one based on how many/what type of
arguments you pass. If you write *no* constructor at all, C# silently
generates a public parameterless one for you; the moment you write any
constructor yourself, that free one disappears.
{{/tabs}}

### Access modifiers and encapsulation

**Encapsulation** means hiding an object's internal data behind its
methods, so outside code can't reach in and put the object into an
invalid state. Both languages let you mark fields as accessible only from
inside the class — but the enforcement is completely different.

{{tabs}}
{{tab Python}}
```python
class BankAccount:
    def __init__(self, balance):
        self._balance = balance     # single underscore: "protected" — a CONVENTION only
        self.__pin = "1234"         # double underscore: name-mangled, harder to reach

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self._balance += amount

acct = BankAccount(100)
acct.deposit(50)
print(acct._balance)      # 150 — Python does NOT stop you from reading/writing this.
                           # The underscore is a signal to other programmers, not a lock.
```

Python has **no true private access enforced by the language**. A single
leading underscore (`_balance`) is a widely-followed *convention* meaning
"internal, don't touch from outside." A double leading underscore
(`__pin`) triggers **name mangling** (Python internally renames it to
`_BankAccount__pin`), which makes accidental access harder but is still
not a hard lock — it's "keep out" tape, not a locked door.
{{tab C#}}
```csharp
public class BankAccount {
    private decimal _balance;    // private: literally cannot be accessed outside this class

    public BankAccount(decimal balance) {
        _balance = balance;
    }

    public void Deposit(decimal amount) {
        if (amount <= 0) throw new ArgumentException("deposit must be positive");
        _balance += amount;
    }
}

var acct = new BankAccount(100);
acct.Deposit(50);
// acct._balance;   // COMPILE ERROR: '_balance' is inaccessible due to its protection level
```

C# access modifiers are **enforced by the compiler**, not convention:

| Modifier | Visible from |
|---|---|
| `public` | anywhere |
| `private` | only inside this class |
| `protected` | this class and subclasses (module 02 covers inheritance) |
| `internal` | anywhere in the same project/assembly |
{{/tabs}}

This is one of the sharpest real differences between the two languages,
and it matters for design: in C#, `private` is a genuine guarantee you can
design around. In Python, "privacy" is a courtesy your teammates are
trusting you to honor — Python's actual philosophy here is famously "we
are all consenting adults," documented directly in the language's own
style guide (linked below).

### Properties: controlled access without a public field

Neither language wants you to have raw public fields with no validation
— but both offer a way to *look like* a field from the outside while
actually running code (validation, computed values) underneath.

{{tabs}}
{{tab Python}}
```python
class Person:
    def __init__(self, age):
        self._age = age

    @property
    def age(self):            # the "getter"
        return self._age

    @age.setter
    def age(self, value):     # the "setter" — runs on every assignment
        if value < 0:
            raise ValueError("age cannot be negative")
        self._age = value

p = Person(30)
print(p.age)      # 30 — reads like a plain field, but calls the getter method
p.age = 31        # calls the setter — validated
p.age = -5        # raises ValueError
```
{{tab C#}}
```csharp
public class Person {
    private int _age;

    public int Age {                  // an auto-implemented property with custom logic
        get { return _age; }
        set {
            if (value < 0) throw new ArgumentException("age cannot be negative");
            _age = value;
        }
    }

    public Person(int age) { Age = age; }   // goes through the setter, so it's validated too
}

var p = new Person(30);
Console.WriteLine(p.Age);   // 30 — reads like a plain field, but calls the getter
p.Age = 31;                  // calls the setter — validated
p.Age = -5;                  // throws ArgumentException
```

For the common case with no extra logic, C# also has a shorthand,
**auto-implemented properties** — `public int Age { get; set; }` — which
silently creates a hidden backing field for you. Reach for the full
`get`/`set` block (as above) the moment you need validation.
{{/tabs}}

**The rule of thumb both languages converge on**: never expose a raw
public mutable field on a class that has *any* invariant to protect
(can't be negative, can't be empty, must stay in sync with another field,
etc). A property costs nothing extra to call and buys you a place to add
validation later without breaking every caller.

### Static (class-level) members

An **instance** member belongs to one object; a **static** (Python:
class-level) member belongs to the *class itself* — shared by every
instance, and accessible without creating any object at all.

{{tabs}}
{{tab Python}}
```python
class Product:
    total_created = 0     # class attribute — shared by ALL instances

    def __init__(self, name):
        self.name = name          # instance attribute — one per object
        Product.total_created += 1

p1 = Product("Widget")
p2 = Product("Gadget")
print(Product.total_created)   # 2 — shared counter, not per-object
```
{{tab C#}}
```csharp
public class Product {
    public static int TotalCreated = 0;   // static field — shared by ALL instances

    public string Name;                    // instance field — one per object

    public Product(string name) {
        Name = name;
        TotalCreated++;
    }
}

var p1 = new Product("Widget");
var p2 = new Product("Gadget");
Console.WriteLine(Product.TotalCreated);   // 2 — accessed via the CLASS, not an instance
```
{{/tabs}}

A classic Python gotcha lives right next to this idea: a **mutable**
class attribute (a list or dict, not a number) is genuinely shared and
mutating it through one instance affects all of them — covered explicitly
in Common Mistakes below.

### Basic collections of objects

You'll spend the rest of this track storing objects in collections —
worth seeing the idiomatic shape now.

{{tabs}}
{{tab Python}}
```python
people = []                       # a list of Person objects
people.append(Person(30))
people.append(Person(25))

for person in people:
    print(person.age)

by_name = {}                      # a dict keyed by name
by_name["Ada"] = Person(30)
print(by_name["Ada"].age)
```
{{tab C#}}
```csharp
var people = new List<Person>();  // a List<T> of Person objects
people.Add(new Person(30));
people.Add(new Person(25));

foreach (var person in people) {
    Console.WriteLine(person.Age);
}

var byName = new Dictionary<string, Person>();
byName["Ada"] = new Person(30);
Console.WriteLine(byName["Ada"].Age);
```
{{/tabs}}

## Hands-on exercises

Do each in both languages.

### 1. A minimal class

Write a `Book` class with `title` and `author` fields, a constructor, and
a method `describe()`/`Describe()` that prints `"{title} by {author}"`.
Create two `Book` objects and call `describe` on each.

### 2. Encapsulate a balance

Write a `BankAccount` class with a private/protected balance, a
constructor that sets an initial balance, and `deposit`/`withdraw` methods
that reject negative amounts and (for withdraw) reject withdrawing more
than the current balance. Prove from outside the class that you cannot
set the balance directly to an invalid value (in Python, respect the
underscore convention even though the language won't stop you; in C#,
confirm the compiler actually refuses direct access).

### 3. A validated property

Write a `Temperature` class with a property `celsius` that raises/throws
if set below absolute zero (-273.15). Add a second property `fahrenheit`
that is *computed* from `celsius` (no separate stored field) — reading it
should return `celsius * 9/5 + 32`.

### 4. Count instances

Write a `Car` class with a static/class-level counter that tracks how
many `Car` objects have been created so far, incremented in the
constructor. Create three cars and print the counter.

### 5. A tiny collection

Write a `Playlist` class with an internal list of song title strings, an
`add_song`/`AddSong` method, and a `total_songs`/`TotalSongs` property
that returns the count. Add a few songs and print the total.

## Independent challenge

No code given.

**Task:** Build a **Contact Book**, in both languages. You need at least
two classes: a `Contact` (name, phone number, email — with validation:
reject an empty name, reject a phone number that isn't all digits) and a
`ContactBook` that holds a collection of `Contact` objects and supports
adding a contact, removing a contact by name, and searching by partial
name match (case-insensitive). Print the full contact list, then search
for one, then remove one and print the list again to confirm it changed.

<details>
<summary>Hint</summary>

`ContactBook` should own a `List<Contact>` / `list` of `Contact` objects
internally (encapsulated — not a public field, per this module's rule of
thumb). Its `add`, `remove`, and `search` methods are the *only* way
outside code touches that internal collection. Validation belongs inside
`Contact`'s constructor/properties, not in `ContactBook` — each class
should be responsible for keeping *itself* valid.

</details>

## Common mistakes & troubleshooting

- **Public mutable fields with no validation.** If invalid data can be
  assigned directly, it eventually will be, in some caller you didn't
  anticipate. Default to a property (or private field + methods) the
  moment there's any rule to protect.
- **Forgetting `self`/`this` isn't optional in Python.** Every Python
  instance method's first parameter must be `self` (by convention named
  `self`, but the language only cares about position, not the name) —
  forget it and you'll get a confusing "takes 1 positional argument but 2
  were given" error the moment you call the method.
- **Python's mutable class-attribute trap.** A class attribute that's a
  `list` or `dict` (not a number/string) is shared storage:
  ```python
  class Team:
      members = []              # DANGER: one list, shared by every Team instance

      def add(self, name):
          self.members.append(name)

  a = Team(); b = Team()
  a.add("Ann")
  print(b.members)   # ['Ann'] — leaked into b! They shared the same list.
  ```
  Fix: initialize mutable attributes inside `__init__` (`self.members =
  []`), never as a bare class-level default.
- **Assuming Python's `_` /`__` prevents access.** It doesn't. It's a
  convention (`_`) or name-mangling (`__`), never an enforced lock. Don't
  design a system's *security* around it.
- **Forgetting C# generates a free parameterless constructor — until you
  write one.** The instant you add any constructor with parameters, the
  free no-argument one disappears; `new Rectangle()` then stops
  compiling unless you also wrote a matching overload.
- **Confusing a static/class member for "a default value for new
  instances."** It is not a template copied into each object — it is one
  shared piece of data. Only put genuinely shared state there (counters,
  constants), never per-object data.

## Checkpoint quiz

Write your answer before expanding it.

1. What is the difference between a class and an object?
2. In Python, what does the first parameter of every instance method
   conventionally represent, and is naming it `self` enforced by the
   language?
3. You write `private decimal _balance;` in a C# class. Can a class in a
   *different* file, with no relationship to this class, read
   `_balance` directly? What about a Python attribute named `_balance`?
4. Why would you use a property instead of a public field?
5. What happens in C# if you write no constructor at all? What happens
   the instant you write one with a parameter?
6. What's the difference between an instance field and a static field?

<details>
<summary>Answers</summary>

1. A class is the blueprint (data + behavior description); an object is
   one concrete instance built from that blueprint, with its own copy of
   the instance data.
2. It conventionally represents "the object this method was called on"
   and is conventionally named `self` — the *name* isn't enforced (you
   could call it anything), but its *position* (first parameter) and
   presence are required by the language.
3. C#: no — `private` is compiler-enforced; unrelated code cannot access
   it, full stop. Python: yes, technically — `_balance` is only a
   convention signaling "please don't," not an enforced restriction.
4. To validate or compute the value on every read/write while still
   letting callers use field-like syntax (`obj.age = 5`), without
   exposing the raw underlying storage.
5. C# silently generates a public parameterless constructor for you if
   you write none. The moment you write any constructor yourself, that
   free one disappears — you'd need to write a parameterless one
   explicitly if you still want it.
6. An instance field has one separate copy per object; a static field has
   exactly one copy shared by the class itself and every instance of it.

</details>

## Interview questions

1. **"What's the difference between a class and an object?"**
   A class is a blueprint/type definition; an object is a specific
   instance created from that blueprint, with its own state.
2. **"Why would you make a field private and expose it through a
   property/getter-setter instead of just making the field public?"**
   To keep the ability to validate, compute, or change the internal
   representation later without breaking every place that reads or
   writes the value — the public property is a stable contract even if
   what's behind it changes.
3. **"Does Python have true private members?"**
   No — Python has conventions (`_name`) and name-mangling (`__name`),
   but nothing the language enforces the way `private` is enforced in
   C#/Java. This is a deliberate design choice ("we're all consenting
   adults"), not an oversight.
4. **"What's a static/class member, and give a real use case."**
   Data or behavior that belongs to the type itself rather than any one
   instance — shared across every instance. Real use cases: an
   instance counter, a shared configuration constant, or a factory
   method that doesn't need an existing instance to run.
5. **"Can a class have more than one constructor? Does it depend on the
   language?"**
   Yes in C# (constructor overloading, distinguished by parameter
   signature). Python has exactly one `__init__`; "multiple
   constructors" are faked via default parameter values or
   `@classmethod` factory methods.

## Further reading & sources

- [Python: A First Look at Classes](https://docs.python.org/3/tutorial/classes.html) - the official tutorial chapter this module is based on.
- [PEP 8: naming conventions (`_single` / `__double` leading underscores)](https://peps.python.org/pep-0008/#descriptive-naming-styles) - the source of the "consenting adults" privacy philosophy.
- [Microsoft Learn: Classes and objects (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/classes) - the official reference for classes, constructors, and access modifiers.
- [Microsoft Learn: Properties (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/programming-guide/classes-and-structs/properties) - full property syntax including auto-implemented properties.
- [Python: `@property` decorator reference](https://docs.python.org/3/library/functions.html#property) - authoritative reference for the getter/setter syntax used above.

## Next

[02-oop-foundations-and-uml](../02-oop-foundations-and-uml/README.md) —
now that you can build a single well-encapsulated class, we zoom out to
the four pillars (encapsulation, abstraction, inheritance, polymorphism)
and how to *draw* a design before writing it, with UML.
