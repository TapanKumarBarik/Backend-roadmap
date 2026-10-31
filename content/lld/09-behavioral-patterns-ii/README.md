# Module 09: Behavioral Patterns II

## Why this matters

This module finishes the pattern catalog: Iterator, Chain of
Responsibility, Mediator, Memento, and Visitor. After this, you have all
22 patterns this track covers (of the GoF's 23 — only Interpreter, which
is genuinely rare outside building parsers/DSLs, is skipped) as concrete
vocabulary. Every classic problem starting at module 12 will reuse this
entire catalog freely — you'll be expected to recognize "oh, this needs a
Chain of Responsibility" the same way you'd recognize a sorting problem
needs a sort, not derive it from scratch under interview pressure.

## Concepts

### Iterator — walk a collection without exposing its internals

**Problem it solves:** let calling code step through a collection's
elements one at a time, without knowing or caring whether it's backed by
an array, a linked list, or something more exotic.

{{tabs}}
{{tab Python}}
```python
class BookShelf:
    def __init__(self):
        self._books = []

    def add(self, book):
        self._books.append(book)

    def __iter__(self):                  # Python's iteration protocol — makes BookShelf directly iterable
        return iter(self._books)

shelf = BookShelf()
shelf.add("Dune")
shelf.add("Neuromancer")

for book in shelf:                        # 'for' works because __iter__ exists — no exposed internals
    print(book)
```

Python's iteration protocol (`__iter__`/`__next__`, or the simpler
`yield`-based generator form) *is* the Iterator pattern, built into the
language — you rarely hand-write a separate Iterator class in Python;
you implement the protocol on your own collection instead:

```python
class BookShelf:
    def __init__(self):
        self._books = []
    def add(self, book):
        self._books.append(book)
    def __iter__(self):
        for book in self._books:          # a generator-based iterator — even less ceremony
            yield book
```
{{tab C#}}
```csharp
public class BookShelf : IEnumerable<string> {   // implements C#'s iteration interface directly
    private List<string> _books = new List<string>();

    public void Add(string book) => _books.Add(book);

    public IEnumerator<string> GetEnumerator() => _books.GetEnumerator();
    System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
}

var shelf = new BookShelf();
shelf.Add("Dune");
shelf.Add("Neuromancer");

foreach (var book in shelf) {             // 'foreach' works because IEnumerable<T> is implemented
    Console.WriteLine(book);
}
```

C# also has `yield return`, which lets you write a custom iteration
sequence without manually implementing `IEnumerator<T>`'s
`MoveNext()`/`Current` machinery:

```csharp
public IEnumerable<string> LongTitlesOnly() {
    foreach (var book in _books) {
        if (book.Length > 5) yield return book;   // the compiler builds the enumerator for you
    }
}
```
{{/tabs}}

**The honest takeaway**: both languages have made Iterator a
first-class, built-in protocol precisely because it's *that* useful — in
real code you almost always implement `__iter__`/`IEnumerable<T>` on your
own type rather than hand-rolling a separate custom Iterator class from
scratch. Knowing this *is* the pattern (not "avoiding" it) is the actual
interview-relevant knowledge.

### Chain of Responsibility — pass a request along a chain until someone handles it

**Problem it solves:** a request may need to be handled by one of
several possible handlers, and the sender shouldn't need to know which
one, or how many there are.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Approver(ABC):
    def __init__(self):
        self._next: Approver | None = None

    def set_next(self, next_approver: "Approver") -> "Approver":
        self._next = next_approver
        return next_approver           # returning it lets you chain .set_next() calls too

    @abstractmethod
    def approve(self, amount: float): ...

class TeamLead(Approver):
    def approve(self, amount):
        if amount <= 1000:
            print(f"TeamLead approved {amount}")
        elif self._next:
            self._next.approve(amount)      # can't handle it — pass it along the chain
        else:
            print("No one could approve this")

class Manager(Approver):
    def approve(self, amount):
        if amount <= 10000:
            print(f"Manager approved {amount}")
        elif self._next:
            self._next.approve(amount)
        else:
            print("No one could approve this")

class Director(Approver):
    def approve(self, amount):
        print(f"Director approved {amount}")   # the end of the chain — handles everything left

lead = TeamLead()
lead.set_next(Manager()).set_next(Director())

lead.approve(500)      # TeamLead approved 500
lead.approve(5000)     # Manager approved 5000
lead.approve(50000)    # Director approved 50000 — the CALLER never chose which approver handled it
```
{{tab C#}}
```csharp
public abstract class Approver {
    protected Approver Next;

    public Approver SetNext(Approver next) {
        Next = next;
        return next;                   // returning it lets you chain .SetNext() calls too
    }

    public abstract void Approve(double amount);
}

public class TeamLead : Approver {
    public override void Approve(double amount) {
        if (amount <= 1000) Console.WriteLine($"TeamLead approved {amount}");
        else if (Next != null) Next.Approve(amount);   // can't handle it — pass it along the chain
        else Console.WriteLine("No one could approve this");
    }
}

public class Manager : Approver {
    public override void Approve(double amount) {
        if (amount <= 10000) Console.WriteLine($"Manager approved {amount}");
        else if (Next != null) Next.Approve(amount);
        else Console.WriteLine("No one could approve this");
    }
}

public class Director : Approver {
    public override void Approve(double amount) =>
        Console.WriteLine($"Director approved {amount}");   // end of the chain — handles everything left
}

var lead = new TeamLead();
lead.SetNext(new Manager()).SetNext(new Director());

lead.Approve(500);      // TeamLead approved 500
lead.Approve(5000);     // Manager approved 5000
lead.Approve(50000);    // Director approved 50000 — the CALLER never chose which approver handled it
```
{{/tabs}}

**A real design risk, named up front**: if the last handler in the chain
doesn't unconditionally handle whatever's left (like `Director` does
above), a request that no handler recognizes silently vanishes with no
error and no log — always design an explicit fallback/terminal handler,
covered again in Common Mistakes.

### Mediator — centralize chaotic many-to-many communication

**Problem it solves:** when many objects need to talk to *each other*
directly, the web of references between them becomes unmanageable (every
object coupled to every other). A Mediator centralizes that
communication through one object, so participants only ever talk to
*it*.

{{tabs}}
{{tab Python}}
```python
class ChatRoom:                       # the MEDIATOR
    def show_message(self, sender: str, message: str):
        print(f"[{sender}]: {message}")

class User:
    def __init__(self, name: str, chat_room: ChatRoom):
        self.name = name
        self.chat_room = chat_room     # User knows only the mediator — NOT every other User directly

    def send(self, message: str):
        self.chat_room.show_message(self.name, message)

room = ChatRoom()
alice = User("Alice", room)
bob = User("Bob", room)

alice.send("hey Bob!")   # [Alice]: hey Bob!
bob.send("hey Alice!")   # [Bob]: hey Alice! — Alice and Bob never hold a reference to EACH OTHER
```
{{tab C#}}
```csharp
public class ChatRoom {               // the MEDIATOR
    public void ShowMessage(string sender, string message) =>
        Console.WriteLine($"[{sender}]: {message}");
}

public class User {
    private readonly string _name;
    private readonly ChatRoom _chatRoom;   // User knows only the mediator — NOT every other User directly

    public User(string name, ChatRoom chatRoom) { _name = name; _chatRoom = chatRoom; }

    public void Send(string message) => _chatRoom.ShowMessage(_name, message);
}

var room = new ChatRoom();
var alice = new User("Alice", room);
var bob = new User("Bob", room);

alice.Send("hey Bob!");   // [Alice]: hey Bob!
bob.Send("hey Alice!");   // [Bob]: hey Alice! — Alice and Bob never hold a reference to EACH OTHER
```
{{/tabs}}

Notice the resemblance to Observer (module 08) — both centralize
communication through one object. The difference: Observer is a
one-directional broadcast (subject → many observers, observers don't
talk back through it to each other); Mediator is specifically about
coordinating communication **between peers** that would otherwise need
direct references to each other.

### Memento — capture and restore state, without exposing internals

**Problem it solves:** you want undo/snapshot capability, without the
object whose state is being saved having to expose its private internals
to whoever manages the snapshots.

{{tabs}}
{{tab Python}}
```python
class EditorMemento:                  # an opaque snapshot — its contents are private to Editor
    def __init__(self, content):
        self._content = content       # single underscore: "only Editor should read this" (module 01 convention)

class Editor:                         # the ORIGINATOR
    def __init__(self):
        self.content = ""

    def type_text(self, text):
        self.content += text

    def save(self) -> EditorMemento:
        return EditorMemento(self.content)

    def restore(self, memento: EditorMemento):
        self.content = memento._content    # Editor is the only one that reaches into the memento

class History:                        # the CARETAKER — stores mementos, never reads/uses their content
    def __init__(self):
        self._snapshots = []

    def push(self, memento):
        self._snapshots.append(memento)

    def pop(self):
        return self._snapshots.pop() if self._snapshots else None

editor = Editor()
history = History()

editor.type_text("Hello")
history.push(editor.save())          # snapshot BEFORE the next change
editor.type_text(", world")
print(editor.content)                 # Hello, world

editor.restore(history.pop())        # undo back to the snapshot
print(editor.content)                 # Hello
```
{{tab C#}}
```csharp
public class EditorMemento {          // an opaque snapshot — its contents are private to Editor
    public string Content { get; }    // internal-ish by convention; real code often makes this internal
    public EditorMemento(string content) { Content = content; }
}

public class Editor {                 // the ORIGINATOR
    public string Content = "";

    public void TypeText(string text) => Content += text;

    public EditorMemento Save() => new EditorMemento(Content);

    public void Restore(EditorMemento memento) => Content = memento.Content;
}

public class History {                // the CARETAKER — stores mementos, never reads/uses their content
    private Stack<EditorMemento> _snapshots = new Stack<EditorMemento>();

    public void Push(EditorMemento memento) => _snapshots.Push(memento);
    public EditorMemento Pop() => _snapshots.Count > 0 ? _snapshots.Pop() : null;
}

var editor = new Editor();
var history = new History();

editor.TypeText("Hello");
history.Push(editor.Save());          // snapshot BEFORE the next change
editor.TypeText(", world");
Console.WriteLine(editor.Content);    // Hello, world

editor.Restore(history.Pop());        // undo back to the snapshot
Console.WriteLine(editor.Content);    // Hello
```
{{/tabs}}

The **caretaker** (`History`) deliberately never inspects or manipulates
a memento's contents — it just stores and returns opaque snapshots. Only
the **originator** (`Editor`) knows how to create and consume them. This
is what keeps Memento from breaking encapsulation the way exposing raw
internal state to an external undo-stack would.

### Visitor — add new operations to a class hierarchy without modifying it

**Problem it solves:** you have a stable hierarchy of related classes
(from module 02's `Shape` example) and want to add a *new operation*
across all of them (export to JSON, compute total cost, render as text)
without editing every existing class each time.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class ShapeVisitor(ABC):
    @abstractmethod
    def visit_circle(self, circle: "Circle"): ...
    @abstractmethod
    def visit_rectangle(self, rectangle: "Rectangle"): ...

class Shape(ABC):
    @abstractmethod
    def accept(self, visitor: ShapeVisitor): ...   # "double dispatch" entry point

class Circle(Shape):
    def __init__(self, radius): self.radius = radius
    def accept(self, visitor): return visitor.visit_circle(self)   # calls back with ITS OWN concrete type

class Rectangle(Shape):
    def __init__(self, w, h): self.width, self.height = w, h
    def accept(self, visitor): return visitor.visit_rectangle(self)

class AreaVisitor(ShapeVisitor):               # a NEW operation, zero changes to Circle/Rectangle
    def visit_circle(self, circle): return 3.14159 * circle.radius ** 2
    def visit_rectangle(self, rectangle): return rectangle.width * rectangle.height

class JsonExportVisitor(ShapeVisitor):          # ANOTHER new operation, still zero changes to Shape classes
    def visit_circle(self, circle): return f'{{"type": "circle", "radius": {circle.radius}}}'
    def visit_rectangle(self, rectangle): return f'{{"type": "rectangle", "w": {rectangle.width}, "h": {rectangle.height}}}'

shapes = [Circle(5), Rectangle(3, 4)]
area_visitor = AreaVisitor()
for shape in shapes:
    print(shape.accept(area_visitor))    # 78.53975 then 12 — NEW behavior, Circle/Rectangle never edited
```
{{tab C#}}
```csharp
public interface IShapeVisitor {
    double VisitCircle(Circle circle);
    double VisitRectangle(Rectangle rectangle);
}

public interface IShape {
    double Accept(IShapeVisitor visitor);   // "double dispatch" entry point
}

public class Circle : IShape {
    public double Radius;
    public Circle(double radius) { Radius = radius; }
    public double Accept(IShapeVisitor visitor) => visitor.VisitCircle(this);   // calls back with ITS OWN type
}

public class Rectangle : IShape {
    public double Width, Height;
    public Rectangle(double w, double h) { Width = w; Height = h; }
    public double Accept(IShapeVisitor visitor) => visitor.VisitRectangle(this);
}

public class AreaVisitor : IShapeVisitor {          // a NEW operation, zero changes to Circle/Rectangle
    public double VisitCircle(Circle circle) => Math.PI * circle.Radius * circle.Radius;
    public double VisitRectangle(Rectangle rectangle) => rectangle.Width * rectangle.Height;
}

var shapes = new List<IShape> { new Circle(5), new Rectangle(3, 4) };
var areaVisitor = new AreaVisitor();
foreach (var shape in shapes) {
    Console.WriteLine(shape.Accept(areaVisitor));   // 78.53... then 12 — NEW behavior, classes never edited
}
```
{{/tabs}}

**The honest tradeoff, named explicitly** (this is a real, famous
tension in OOP called **the expression problem**): Visitor makes adding
new *operations* easy (a new visitor class, zero changes to the
hierarchy) but makes adding a new *element type* to the hierarchy hard
(every existing visitor must be updated with a new `visit_X` method,
or it won't compile/won't handle the new type). This is the *exact
opposite* tradeoff of ordinary polymorphism (module 02), where adding a
new subclass is easy but adding a new operation means touching every
subclass. Choose Visitor specifically when the hierarchy is stable and
operations are what keeps growing — not the reverse.

## Hands-on exercises

### 1. Iterator

Implement a custom `Playlist` (reusing the idea from module 01's
exercises) that implements the iteration protocol (`__iter__` /
`IEnumerable<string>`) so it can be used directly in a `for`/`foreach`
loop. Then add a second iteration method that only yields songs longer
than 3 minutes (using `yield` in both languages).

### 2. Chain of Responsibility

Build a support-ticket escalation chain: `Level1Support` handles
"simple" tickets, `Level2Support` handles "technical" tickets,
`Level3Support` (the terminal handler) handles everything else. Send
several tickets of different categories through the chain starting at
`Level1Support`, and confirm each lands with the right handler.

### 3. Mediator

Build an `AirTrafficControl` mediator through which `Airplane` objects
request permission to land — the mediator should only allow one plane
to land at a time (queue the rest), without any `Airplane` holding a
reference to any other `Airplane`.

### 4. Memento

Extend the `Editor`/`History` example to support **redo** as well as
undo — you'll need a second stack, and to think carefully about when
each stack gets pushed/cleared (hint: a new edit after an undo should
usually clear the redo stack).

### 5. Visitor

Add a third visitor, `PerimeterVisitor`, to the `Circle`/`Rectangle`
hierarchy from the Visitor section, computing each shape's perimeter.
Confirm you didn't need to touch `Circle` or `Rectangle` at all to add
it.

## Independent challenge

No code given.

**Task:** Design a small **document editor core**, combining three
patterns from this module: a `Document` holding an ordered collection of
`Element`s (paragraphs and images, say) that supports **Iterator**-style
iteration (implement the language's native iteration protocol, per this
module's Iterator section) including a filtered iteration that skips
empty paragraphs; at least two **Visitor**s operating on that same
element hierarchy without modifying `Element`/its subclasses — a
`WordCountVisitor` and an `HtmlExportVisitor`; and **Memento**-based
undo for edits to the document (adding or removing an element), with a
`History` caretaker that never inspects a memento's actual contents.

<details>
<summary>Hint</summary>

Keep `Element`'s hierarchy genuinely stable for this exercise (this is
exactly when Visitor is the right call, per this module's tradeoff
discussion) — paragraph and image are enough element types; resist
adding a third mid-exercise just to test something, since every visitor
would then need updating. The `Document`'s memento should snapshot the
*entire* list of elements (e.g., a copy of the list) at each save point —
watch for the same shallow-vs-deep-copy question from module 06's
Prototype pattern: if `Element`s themselves are mutable, a shallow list
copy might not be enough to protect a snapshot from later mutation.

</details>

## Common mistakes & troubleshooting

- **Hand-rolling a custom Iterator class when the language's built-in
  protocol already does the job.** In both Python and C#, implementing
  `__iter__`/`IEnumerable<T>` directly on your own collection type is
  the idiomatic approach — reach for a separate, bespoke Iterator class
  only when you have a genuinely unusual traversal need the built-in
  protocol can't express.
- **A Chain of Responsibility with no guaranteed terminal handler.** If
  the last handler in the chain doesn't unconditionally handle whatever
  reaches it, an unrecognized request silently disappears with no error
  — always design an explicit fallback (as `Director` does above), or
  have the chain itself raise/throw if nothing handled the request.
- **A Mediator that absorbs so much logic it becomes its own SRP
  violation** (module 04) — a "God Mediator" that knows every detail of
  every participant's behavior, not just how to route messages between
  them, has just recreated the tight coupling problem in a new,
  centralized location instead of actually solving it.
- **A Memento whose contents are fully exposed (public, mutable
  fields).** If the caretaker (or anyone else) can read and modify a
  memento's internals directly, you've lost the actual point of the
  pattern — encapsulation of the snapshot. Keep the memento's state
  accessible only to its originator (via a convention or actual access
  modifier, per module 01).
- **Reaching for Visitor when the element hierarchy is still actively
  growing.** Per the expression-problem tradeoff explained above, adding
  a new element type means updating every existing visitor — fine for
  a stable hierarchy with growing operations, painful and error-prone
  (easy to forget a visitor) for a hierarchy that's still evolving.

## Checkpoint quiz

1. Why do you rarely hand-write a separate "Iterator class" in either
   Python or C# for ordinary collections?
2. In the Chain of Responsibility example, what specifically happens if
   you remove `Director` and someone calls `lead.approve(50000)`?
3. What's the key difference between Observer (module 08) and Mediator
   — both centralize communication through one object?
4. Why does `History` (the Memento caretaker) never read a memento's
   actual content?
5. What's "the expression problem," and which side of it does Visitor
   optimize for?
6. If you added a `Triangle` to the `Shape` hierarchy in the Visitor
   example, what specifically would you need to update, and how many
   places?

<details>
<summary>Answers</summary>

1. Because both languages provide a first-class, built-in iteration
   protocol (`__iter__`/`__next__` or generators in Python;
   `IEnumerable<T>`/`yield return` in C#) — implementing that protocol
   directly on your own type *is* applying the Iterator pattern; a
   separate bespoke Iterator class is only needed for unusual traversal
   logic the built-in protocol can't express.
2. `Manager.approve` calls `self._next.approve(amount)`/`Next.Approve()`,
   but `_next`/`Next` is `None`/`null` since nothing was chained after
   `Manager` — this hits the `else` branch and prints "No one could
   approve this" (in Python/C# as written) rather than crashing, but the
   request genuinely goes unhandled — exactly the silent-drop risk named
   in this module.
3. Observer is a one-directional broadcast: a subject notifies many
   observers, but observers don't communicate with *each other* through
   it. Mediator specifically coordinates two-way communication *between
   peers* that would otherwise need direct references to each other.
4. Because the caretaker's whole job is to store and return opaque
   snapshots without understanding or manipulating their contents — only
   the originator (`Editor`) knows how to create and consume a memento's
   actual state, keeping that state encapsulated.
5. The expression problem is the tension between adding new *types* to
   a hierarchy easily versus adding new *operations* over that hierarchy
   easily — ordinary polymorphism optimizes for easy new types (hard to
   add new operations without touching every class); Visitor optimizes
   for the opposite: easy new operations (new visitor classes), at the
   cost of needing to update every existing visitor when a new type is
   added.
6. You'd need to add a `visit_triangle`/`VisitTriangle` method to the
   `ShapeVisitor`/`IShapeVisitor` interface itself, and then implement
   it in *every* existing concrete visitor (`AreaVisitor`,
   `JsonExportVisitor`, and any others) — one interface change plus one
   update per existing visitor class, which is exactly the cost Visitor
   trades away in exchange for easy new operations.

</details>

## Interview questions

1. **"When would you use Chain of Responsibility over a simple
   if/elif/else chain?"**
   When the set of possible handlers is open-ended, configurable, or
   needs to be assembled/reordered independently of the calling code
   (e.g., middleware pipelines, approval hierarchies that vary by
   organization) — a hard-coded `if`/`elif` chain requires editing the
   same function for every new case (an OCP violation, module 04);
   Chain of Responsibility lets you add a new handler as a new class,
   inserted into the chain, with zero changes elsewhere.
2. **"What's the difference between Observer and Mediator? They both
   seem to centralize communication."**
   Observer is one-directional: a subject broadcasts state changes to
   subscribed observers, who don't talk back through it to each other.
   Mediator specifically exists to coordinate two-way communication
   *between peers* (like chat users, or air traffic control coordinating
   planes) who would otherwise need direct references to one another.
3. **"How does the Memento pattern preserve encapsulation, compared to
   just exposing an object's internal state directly for an undo
   stack?"**
   The memento is an opaque object whose contents only the originator
   (the object being snapshotted) can create or read — the caretaker
   managing the history of mementos never inspects or manipulates their
   contents, so the object's internal representation stays hidden from
   everything except itself.
4. **"What's the tradeoff of the Visitor pattern?"**
   It makes adding new *operations* over a class hierarchy easy (a new
   visitor, zero changes to existing classes) but makes adding a new
   *class* to that hierarchy expensive (every existing visitor needs a
   new method) — the "expression problem" tradeoff, opposite to
   ordinary polymorphism. Use it when the hierarchy is stable and
   operations are what keeps growing.
5. **"Is implementing `IEnumerable<T>`/`__iter__` on your own class
   'using the Iterator pattern,' or is that something different?"**
   It genuinely is the Iterator pattern — both languages made it a
   first-class built-in protocol precisely because the pattern is so
   broadly useful; you're expected to use the built-in protocol on your
   own types rather than hand-rolling a separate custom Iterator class
   in ordinary code.

## Further reading & sources

- [Refactoring.Guru: Behavioral Patterns](https://refactoring.guru/design-patterns/behavioral-patterns) - clear diagrams and multi-language examples, including all five patterns in this module.
- [Python: Iterator Types](https://docs.python.org/3/library/stdtypes.html#iterator-types) - official reference for `__iter__`/`__next__` and generators.
- [Microsoft Learn: Iterators (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/iterators) - official reference for `IEnumerable<T>` and `yield return`.
- [The Expression Problem (Wikipedia)](https://en.wikipedia.org/wiki/Expression_problem) - the formal statement of the tradeoff Visitor sits on one side of.
- [Gang of Four: *Design Patterns*](https://en.wikipedia.org/wiki/Design_Patterns) - the original source of all five patterns in this module.

## Next

[10-concurrency-safe-design](../10-concurrency-safe-design/README.md) —
with the full pattern catalog in hand, we cover designing for
concurrency: a properly thread-safe Singleton, producer-consumer
pipelines, immutability as a concurrency strategy, and where locks
actually belong in a design.
