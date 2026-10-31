# Module 07: Structural Patterns

## Why this matters

Creational patterns (module 06) answer "how do objects get made?"
Structural patterns answer the next question: **how do objects and
classes combine into larger structures**, cleanly? Seven patterns live
here — Adapter, Decorator, Facade, Composite, Proxy, Bridge, Flyweight —
and three of them (Adapter, Facade, Bridge) are frequently confused with
each other in interviews specifically because they all "wrap" something;
this module is written to make the actual distinctions between all seven
concrete, not just definitions to memorize.

## Concepts

### Adapter — make an incompatible interface fit

**Problem it solves:** you have existing code (often something you don't
control — a third-party library, legacy code) whose interface doesn't
match what your code expects, and you can't or shouldn't modify it
directly.

{{tabs}}
{{tab Python}}
```python
class OldPrinter:                     # existing code, interface you can't change
    def print_old(self, text):
        print(f"[OLD] {text}")

class Printer:                        # the interface YOUR code expects
    def print_text(self, text): ...

class OldPrinterAdapter(Printer):     # translates one interface into the other
    def __init__(self, old_printer: OldPrinter):
        self._old_printer = old_printer

    def print_text(self, text):
        self._old_printer.print_old(text)     # delegates, translating the call

def send_to_printer(printer: Printer, text):
    printer.print_text(text)

send_to_printer(OldPrinterAdapter(OldPrinter()), "hello")   # [OLD] hello
```
{{tab C#}}
```csharp
public class OldPrinter {             // existing code, interface you can't change
    public void PrintOld(string text) => Console.WriteLine($"[OLD] {text}");
}

public interface IPrinter {           // the interface YOUR code expects
    void PrintText(string text);
}

public class OldPrinterAdapter : IPrinter {   // translates one interface into the other
    private readonly OldPrinter _oldPrinter;
    public OldPrinterAdapter(OldPrinter oldPrinter) { _oldPrinter = oldPrinter; }

    public void PrintText(string text) => _oldPrinter.PrintOld(text);   // delegates, translating the call
}

static void SendToPrinter(IPrinter printer, string text) => printer.PrintText(text);

SendToPrinter(new OldPrinterAdapter(new OldPrinter()), "hello");   // [OLD] hello
```
{{/tabs}}

### Decorator — add behavior dynamically, without subclassing

**Problem it solves:** you want to add responsibilities to an *individual
object* at runtime, in any combination, without a combinatorial explosion
of subclasses (`MilkCoffee`, `SugarCoffee`, `MilkSugarCoffee`,
`MilkSugarWhipCoffee`...). This is composition-over-inheritance (module
05) applied as a named pattern.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Coffee(ABC):
    @abstractmethod
    def cost(self) -> float: ...
    @abstractmethod
    def description(self) -> str: ...

class SimpleCoffee(Coffee):
    def cost(self): return 2.0
    def description(self): return "Coffee"

class CoffeeDecorator(Coffee):              # wraps ANY Coffee, including another decorator
    def __init__(self, coffee: Coffee):
        self._coffee = coffee
    def cost(self): return self._coffee.cost()
    def description(self): return self._coffee.description()

class MilkDecorator(CoffeeDecorator):
    def cost(self): return self._coffee.cost() + 0.5
    def description(self): return self._coffee.description() + " + Milk"

class SugarDecorator(CoffeeDecorator):
    def cost(self): return self._coffee.cost() + 0.25
    def description(self): return self._coffee.description() + " + Sugar"

order = SugarDecorator(MilkDecorator(SimpleCoffee()))   # stack decorators in any combination, at runtime
print(order.description(), "-", order.cost())            # Coffee + Milk + Sugar - 2.75
```
{{tab C#}}
```csharp
public interface ICoffee {
    double Cost();
    string Description();
}

public class SimpleCoffee : ICoffee {
    public double Cost() => 2.0;
    public string Description() => "Coffee";
}

public abstract class CoffeeDecorator : ICoffee {     // wraps ANY ICoffee, including another decorator
    protected readonly ICoffee Coffee;
    protected CoffeeDecorator(ICoffee coffee) { Coffee = coffee; }
    public virtual double Cost() => Coffee.Cost();
    public virtual string Description() => Coffee.Description();
}

public class MilkDecorator : CoffeeDecorator {
    public MilkDecorator(ICoffee coffee) : base(coffee) { }
    public override double Cost() => Coffee.Cost() + 0.5;
    public override string Description() => Coffee.Description() + " + Milk";
}

public class SugarDecorator : CoffeeDecorator {
    public SugarDecorator(ICoffee coffee) : base(coffee) { }
    public override double Cost() => Coffee.Cost() + 0.25;
    public override string Description() => Coffee.Description() + " + Sugar";
}

var order = new SugarDecorator(new MilkDecorator(new SimpleCoffee()));   // stack in any combination, at runtime
Console.WriteLine($"{order.Description()} - {order.Cost()}");             // Coffee + Milk + Sugar - 2.75
```
{{/tabs}}

### Facade — one simple interface in front of a complex subsystem

**Problem it solves:** a subsystem has many moving parts with an
intricate interaction order; most callers just want to do "the normal
thing" without learning all of it.

{{tabs}}
{{tab Python}}
```python
class Amplifier:
    def on(self): print("Amplifier on")
    def set_volume(self, level): print(f"Volume set to {level}")

class DvdPlayer:
    def on(self): print("DVD player on")
    def play(self, movie): print(f"Playing '{movie}'")

class Projector:
    def on(self): print("Projector on")
    def set_input(self, source): print(f"Input set to {source}")

class HomeTheaterFacade:                 # ONE simple entry point over three complex subsystems
    def __init__(self, amp, dvd, projector):
        self._amp = amp
        self._dvd = dvd
        self._projector = projector

    def watch_movie(self, movie):
        self._amp.on()
        self._amp.set_volume(5)
        self._projector.on()
        self._projector.set_input("DVD")
        self._dvd.on()
        self._dvd.play(movie)

theater = HomeTheaterFacade(Amplifier(), DvdPlayer(), Projector())
theater.watch_movie("Inception")   # one call hides five steps across three subsystems
```
{{tab C#}}
```csharp
public class Amplifier {
    public void On() => Console.WriteLine("Amplifier on");
    public void SetVolume(int level) => Console.WriteLine($"Volume set to {level}");
}
public class DvdPlayer {
    public void On() => Console.WriteLine("DVD player on");
    public void Play(string movie) => Console.WriteLine($"Playing '{movie}'");
}
public class Projector {
    public void On() => Console.WriteLine("Projector on");
    public void SetInput(string source) => Console.WriteLine($"Input set to {source}");
}

public class HomeTheaterFacade {        // ONE simple entry point over three complex subsystems
    private readonly Amplifier _amp;
    private readonly DvdPlayer _dvd;
    private readonly Projector _projector;

    public HomeTheaterFacade(Amplifier amp, DvdPlayer dvd, Projector projector) {
        _amp = amp; _dvd = dvd; _projector = projector;
    }

    public void WatchMovie(string movie) {
        _amp.On();
        _amp.SetVolume(5);
        _projector.On();
        _projector.SetInput("DVD");
        _dvd.On();
        _dvd.Play(movie);
    }
}

var theater = new HomeTheaterFacade(new Amplifier(), new DvdPlayer(), new Projector());
theater.WatchMovie("Inception");   // one call hides five steps across three subsystems
```
{{/tabs}}

**Facade vs. Adapter, the interview-favorite mix-up**: Adapter makes an
*existing, incompatible* interface match what's expected — it changes
*shape*, one-to-one. Facade doesn't reshape anything — it adds a *new,
simpler* interface in front of several subsystems that keep their
original interfaces underneath, to hide *complexity and multi-step
sequencing*, not incompatibility.

### Composite — treat one object and a group of objects identically

**Problem it solves:** you have tree-shaped data (a filesystem, an
organization chart, a UI with nested containers) and want client code to
treat a single leaf and an entire subtree through the exact same
interface, with no special-casing.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class FileSystemItem(ABC):
    @abstractmethod
    def size(self) -> int: ...

class File(FileSystemItem):                 # a LEAF
    def __init__(self, name, size_kb):
        self.name = name
        self._size = size_kb
    def size(self):
        return self._size

class Folder(FileSystemItem):               # a COMPOSITE — holds other FileSystemItems, including Folders
    def __init__(self, name):
        self.name = name
        self.children: list[FileSystemItem] = []

    def add(self, item: FileSystemItem):
        self.children.append(item)

    def size(self):
        return sum(child.size() for child in self.children)   # recurses through leaves AND sub-folders

root = Folder("root")
root.add(File("a.txt", 10))
docs = Folder("docs")
docs.add(File("b.txt", 20))
root.add(docs)
print(root.size())    # 30 — client code never distinguished File from Folder
```
{{tab C#}}
```csharp
public interface IFileSystemItem {
    int Size();
}

public class FileItem : IFileSystemItem {     // a LEAF
    private int _sizeKb;
    public FileItem(string name, int sizeKb) { _sizeKb = sizeKb; }
    public int Size() => _sizeKb;
}

public class Folder : IFileSystemItem {       // a COMPOSITE — holds other IFileSystemItems, including Folders
    private List<IFileSystemItem> _children = new List<IFileSystemItem>();
    public void Add(IFileSystemItem item) => _children.Add(item);
    public int Size() => _children.Sum(c => c.Size());   // recurses through leaves AND sub-folders
}

var root = new Folder();
root.Add(new FileItem("a.txt", 10));
var docs = new Folder();
docs.Add(new FileItem("b.txt", 20));
root.Add(docs);
Console.WriteLine(root.Size());   // 30 — client code never distinguished FileItem from Folder
```
{{/tabs}}

### Proxy — a stand-in that controls access to the real object

**Problem it solves:** you want something with the *same interface* as a
real object, sitting in front of it to add lazy loading, access control,
caching, or logging — without the caller knowing or caring.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Image(ABC):
    @abstractmethod
    def display(self): ...

class RealImage(Image):
    def __init__(self, filename):
        self.filename = filename
        self._load_from_disk()          # expensive — happens at CONSTRUCTION time

    def _load_from_disk(self):
        print(f"Loading {self.filename} from disk (expensive)")

    def display(self):
        print(f"Displaying {self.filename}")

class ProxyImage(Image):                # SAME interface as RealImage
    def __init__(self, filename):
        self.filename = filename
        self._real_image = None         # not created yet — no expensive load has happened

    def display(self):
        if self._real_image is None:              # load only the FIRST time it's actually needed
            self._real_image = RealImage(self.filename)
        self._real_image.display()

image = ProxyImage("photo.png")   # no loading yet — cheap
print("proxy created, nothing loaded yet")
image.display()                    # NOW it loads, then displays
image.display()                    # already loaded — no reload, just displays
```
{{tab C#}}
```csharp
public interface IImage {
    void Display();
}

public class RealImage : IImage {
    private string _filename;
    public RealImage(string filename) {
        _filename = filename;
        LoadFromDisk();               // expensive — happens at CONSTRUCTION time
    }
    private void LoadFromDisk() => Console.WriteLine($"Loading {_filename} from disk (expensive)");
    public void Display() => Console.WriteLine($"Displaying {_filename}");
}

public class ProxyImage : IImage {    // SAME interface as RealImage
    private string _filename;
    private RealImage _realImage;      // not created yet — no expensive load has happened
    public ProxyImage(string filename) { _filename = filename; }

    public void Display() {
        if (_realImage == null) {               // load only the FIRST time it's actually needed
            _realImage = new RealImage(_filename);
        }
        _realImage.Display();
    }
}

var image = new ProxyImage("photo.png");   // no loading yet — cheap
Console.WriteLine("proxy created, nothing loaded yet");
image.Display();    // NOW it loads, then displays
image.Display();    // already loaded — no reload, just displays
```
{{/tabs}}

**Proxy vs. Decorator, the other interview mix-up**: both wrap an object
behind the same interface. **Decorator adds new behavior/responsibility**
(the coffee genuinely costs more with milk). **Proxy controls *access* to
the same, unchanged behavior** (the image displays identically either
way — the proxy only changes *when/whether* the expensive real work
happens). Same shape, opposite intent.

### Bridge — decouple an abstraction from its implementation

**Problem it solves:** you have an abstraction (e.g., "a shape") and
multiple ways to *implement* one part of it (e.g., "how it's rendered"),
and both need to vary independently — without a combinatorial explosion
(`CircleVectorRenderer`, `CircleRasterRenderer`, `SquareVectorRenderer`,
`SquareRasterRenderer`...).

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Renderer(ABC):                  # the IMPLEMENTATION side — "how" to draw
    @abstractmethod
    def render_circle(self, radius): ...

class VectorRenderer(Renderer):
    def render_circle(self, radius):
        print(f"Drawing a vector circle of radius {radius}")

class RasterRenderer(Renderer):
    def render_circle(self, radius):
        print(f"Drawing pixels for a circle of radius {radius}")

class Shape(ABC):                     # the ABSTRACTION side — "what" to draw
    def __init__(self, renderer: Renderer):
        self.renderer = renderer      # the BRIDGE: composed, not inherited

class Circle(Shape):
    def __init__(self, renderer, radius):
        super().__init__(renderer)
        self.radius = radius
    def draw(self):
        self.renderer.render_circle(self.radius)   # delegates the "how" across the bridge

Circle(VectorRenderer(), 5).draw()   # Drawing a vector circle of radius 5
Circle(RasterRenderer(), 5).draw()   # Drawing pixels for a circle of radius 5
# adding a THIRD renderer, or a THIRD shape, is one new class each — never 3x3 combinations
```
{{tab C#}}
```csharp
public interface IRenderer {          // the IMPLEMENTATION side — "how" to draw
    void RenderCircle(double radius);
}

public class VectorRenderer : IRenderer {
    public void RenderCircle(double radius) => Console.WriteLine($"Drawing a vector circle of radius {radius}");
}
public class RasterRenderer : IRenderer {
    public void RenderCircle(double radius) => Console.WriteLine($"Drawing pixels for a circle of radius {radius}");
}

public abstract class Shape {         // the ABSTRACTION side — "what" to draw
    protected readonly IRenderer Renderer;   // the BRIDGE: composed, not inherited
    protected Shape(IRenderer renderer) { Renderer = renderer; }
}

public class Circle : Shape {
    private double _radius;
    public Circle(IRenderer renderer, double radius) : base(renderer) { _radius = radius; }
    public void Draw() => Renderer.RenderCircle(_radius);   // delegates the "how" across the bridge
}

new Circle(new VectorRenderer(), 5).Draw();   // Drawing a vector circle of radius 5
new Circle(new RasterRenderer(), 5).Draw();   // Drawing pixels for a circle of radius 5
// adding a THIRD renderer, or a THIRD shape, is one new class each — never 3x3 combinations
```
{{/tabs}}

### Flyweight — share common state across huge numbers of objects

**Problem it solves:** you need *many* similar objects (thousands to
millions), and creating a full, independent object per instance would
waste memory — split each object's state into **intrinsic** (shared,
identical across instances — reuse one object) and **extrinsic**
(unique per instance — kept outside, passed in when needed).

{{tabs}}
{{tab Python}}
```python
class Glyph:                              # INTRINSIC state: shared, immutable, expensive to duplicate
    def __init__(self, char, font):
        self.char = char
        self.font = font                  # imagine this holds real font/bitmap data — expensive

class GlyphFactory:
    _glyphs = {}
    @classmethod
    def get_glyph(cls, char, font):
        key = (char, font)
        if key not in cls._glyphs:
            cls._glyphs[key] = Glyph(char, font)     # created ONCE per (char, font) combination
        return cls._glyphs[key]                       # every later request reuses the same object

class CharacterInstance:                  # EXTRINSIC state: unique per instance — position
    def __init__(self, glyph: Glyph, x, y):
        self.glyph = glyph
        self.x = x
        self.y = y

document = []
for i, ch in enumerate("hello"):
    glyph = GlyphFactory.get_glyph(ch, "Arial")       # shared glyph object, reused for repeated letters
    document.append(CharacterInstance(glyph, x=i * 10, y=0))

print(len(GlyphFactory._glyphs))   # 4 — only 4 UNIQUE glyphs ('h','e','l','o') for 5 characters
```
{{tab C#}}
```csharp
public class Glyph {                       // INTRINSIC state: shared, immutable, expensive to duplicate
    public char Character;
    public string Font;
    public Glyph(char character, string font) { Character = character; Font = font; }   // imagine real font/bitmap data
}

public static class GlyphFactory {
    private static Dictionary<(char, string), Glyph> _glyphs = new();
    public static Glyph GetGlyph(char character, string font) {
        var key = (character, font);
        if (!_glyphs.ContainsKey(key)) {
            _glyphs[key] = new Glyph(character, font);   // created ONCE per (char, font) combination
        }
        return _glyphs[key];                              // every later request reuses the same object
    }
}

public class CharacterInstance {           // EXTRINSIC state: unique per instance — position
    public Glyph Glyph; public int X, Y;
    public CharacterInstance(Glyph glyph, int x, int y) { Glyph = glyph; X = x; Y = y; }
}

var document = new List<CharacterInstance>();
string text = "hello";
for (int i = 0; i < text.Length; i++) {
    var glyph = GlyphFactory.GetGlyph(text[i], "Arial");   // shared glyph object, reused for repeated letters
    document.Add(new CharacterInstance(glyph, i * 10, 0));
}
// only 4 unique Glyph objects ('h','e','l','o') get created for 5 characters
```
{{/tabs}}

## Hands-on exercises

### 1. Adapter

Adapt a third-party-style `LegacyLogger` (with a method `write_log(msg,
level_number)`) to a modern `Logger` interface your code expects
(`info(msg)`, `error(msg)`), mapping the friendlier method names to the
appropriate `level_number` internally.

### 2. Decorator

Build a `TextEditor` content pipeline where a base `PlainText` can be
wrapped by `UpperCaseDecorator` and `ExclaimDecorator`, each transforming
the text further. Confirm stacking them in different orders produces
different output.

### 3. Facade

Build a `OrderCheckoutFacade` in front of three separately-existing
subsystems (`InventoryService`, `PaymentService`, `ShippingService`),
exposing one `checkout(cart)` method that calls all three in the right
order.

### 4. Composite

Extend the filesystem example with a method `describe(indent=0)` /
`Describe(int indent = 0)` that prints an indented tree view of the
whole structure — confirm it works identically whether called on a
single `File` or on the whole `root` folder.

### 5. Proxy

Build a `SecureDocumentProxy` in front of a `RealDocument` that only
calls through to the real document's `read()` if a `user_role` passed to
the proxy's constructor is `"admin"`, otherwise raises/throws a
permission error — the real document's interface never changes.

### 6. Bridge

Extend the Shape/Renderer bridge with a second shape, `Square`, reusing
both existing renderers with zero changes to `VectorRenderer` or
`RasterRenderer`.

### 7. Flyweight

Build a simple "forest" simulation: a `TreeType` (intrinsic: species
name, color, texture) shared via a factory, and a `Tree` (extrinsic: x/y
position) that references a shared `TreeType`. Create 1000 trees of only
3 species and confirm only 3 `TreeType` objects actually exist.

## Independent challenge

No code given.

**Task:** Design a small **media playback system** combining at least
three patterns from this module: an **Adapter** layer so two
differently-shaped third-party audio libraries (imagine one exposes
`playMp3(path)` and the other `startPlayback(path, format)`) both work
behind one common `AudioPlayer` interface; a **Decorator** stack that can
add a "volume-normalized" and/or "with equalizer" wrapper around any
player, in any combination; and a **Facade** (`MediaPlayerFacade`) that
exposes one simple `play(path)` method hiding which adapter and which
decorators are actually in play underneath. Play at least two different
file "formats" through the facade and confirm the same simple call works
for both.

<details>
<summary>Hint</summary>

Layering order matters here: the Adapters make the two underlying
libraries conform to one shared `AudioPlayer` interface first. The
Decorators then wrap *that* shared interface (they don't need to know or
care which adapter is underneath — this is the whole point of adapting
first). The Facade sits on top of everything and is the only thing
calling code ever touches directly — it internally decides which
adapter to use (perhaps based on file extension) and which decorators to
apply, exactly the way module 06's Factory Method let a base class defer
"which concrete class" to a subclass.

</details>

## Common mistakes & troubleshooting

- **Reaching for Decorator when plain inheritance would do.** If there's
  only ever one fixed combination of extra behavior needed, and it will
  never vary at runtime or combine in different orders, a single
  subclass may be simpler (KISS/YAGNI, module 05) — Decorator earns its
  keep when behaviors need to combine flexibly and be chosen at runtime.
- **A Facade that leaks subsystem details back out.** If callers still
  need to reach *through* the Facade to configure a subsystem directly
  for anything routine, the Facade isn't actually hiding the complexity
  it claims to — keep its surface genuinely simple.
- **A Composite where leaf and composite don't share a truly identical
  interface.** If client code ever needs an `if isinstance(item, File):
  ... else: ...` check to treat leaves differently from composites,
  the pattern has failed at its one job — uniformity.
- **Adding a Proxy "just in case" with no actual access-control, lazy-
  loading, or logging need.** An unnecessary proxy layer is pure
  indirection with no payoff — the same YAGNI judgment call as an
  Abstract Factory built for one product family (module 06).
- **Building a Bridge for an implementation axis that will only ever
  have one implementation.** If there's genuinely only one renderer and
  no second one on the horizon, the abstraction/implementation split is
  premature — same YAGNI reasoning again, this pattern is not exempt.
- **Reaching for Flyweight before actually having a memory problem.**
  It adds real complexity (shared, carefully-immutable intrinsic state)
  — worth it at real scale (thousands+ of similar objects), premature
  and confusing for a handful of objects that would be fine as
  ordinary, independent instances.

## Checkpoint quiz

1. What's the precise difference between Adapter and Facade — both
   "wrap" something, so what makes them different?
2. What's the precise difference between Proxy and Decorator — both
   implement the same interface as what they wrap, so what makes them
   different?
3. In the Composite pattern, what single property must be true of
   `File.size()` and `Folder.size()` for client code to treat them
   uniformly?
4. In the Bridge example, what are the two things that can now vary
   *independently* of each other, and why does that avoid a
   combinatorial explosion?
5. What's the difference between intrinsic and extrinsic state in
   Flyweight, and which one gets shared?
6. Why might building a Bridge, Proxy, or Abstract Factory (module 06)
   too early be a YAGNI violation rather than good design?

<details>
<summary>Answers</summary>

1. Adapter reshapes an *existing, incompatible* interface to match what
   callers expect — a one-to-one translation. Facade doesn't reshape
   anything; it adds a *new, simpler* interface in front of several
   already-compatible subsystems, purely to hide multi-step complexity.
2. Decorator changes/adds *behavior* — the wrapped object genuinely
   does more (or different) work. Proxy controls *access* to unchanged
   behavior — what happens when you call through it is identical to
   calling the real object directly; only *when/whether* that happens
   (or who's allowed to) changes.
3. Both must implement the exact same interface (here, a `size()`
   method with the same signature and meaning) so that calling code
   never needs to know or check which one it's holding.
4. The shape (`Circle`, `Square`, ...) and the rendering technique
   (`VectorRenderer`, `RasterRenderer`, ...) vary independently — adding
   a new shape or a new renderer is one new class each, instead of a new
   class for every shape×renderer combination.
5. Intrinsic state is shared, identical data reused across many
   instances (the glyph's character and font); extrinsic state is
   unique per instance and kept separately (each character's on-screen
   position). Only the intrinsic state is shared/reused.
6. Because all three add real structural complexity to solve a problem
   of *variation* (multiple implementations, controlled access,
   multiple product families) — when there's currently only one real
   case, that complexity has no payoff yet; it's speculative generality,
   exactly what YAGNI (module 05) warns against.

</details>

## Interview questions

1. **"Explain the difference between Adapter, Facade, and Bridge — I
   always mix these up."**
   Adapter: makes one existing incompatible interface match what's
   expected (translation). Facade: adds a new simple interface in front
   of an already-compatible but complex multi-step subsystem (hides
   complexity, not incompatibility). Bridge: splits an abstraction from
   its implementation *up front*, by design, so both can vary
   independently (not reacting to an existing mismatch — designed in
   from the start).
2. **"What's the difference between Proxy and Decorator?"**
   Both wrap an object behind the same interface, but Proxy controls
   *access* to unchanged behavior (lazy loading, permission checks,
   caching), while Decorator adds genuinely new behavior/responsibility
   that changes the result.
3. **"When would you use Composite?"**
   Whenever you have a tree-shaped structure (filesystems, UI component
   trees, org charts, nested comment threads) and want client code to
   treat a single item and an entire subtree identically, without
   type-checking which one it has.
4. **"What's the tradeoff of using Flyweight?"**
   Reduced memory for large numbers of similar objects, at the cost of
   real added complexity: intrinsic state must be genuinely shareable
   (usually immutable) and carefully separated from per-instance
   extrinsic state, which has to be threaded through wherever it's
   needed instead of just living on the object.
5. **"How does Decorator relate to the Open/Closed Principle (module
   04)?"**
   New behavior is added by wrapping in a *new* decorator class, with
   zero modification to the base component or any existing decorator —
   textbook "open for extension, closed for modification."

## Further reading & sources

- [Refactoring.Guru: Structural Patterns](https://refactoring.guru/design-patterns/structural-patterns) - clear diagrams and multi-language examples for all seven patterns in this module.
- [Microsoft Learn: Adapter pattern in .NET (conceptual)](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/) - general architectural guidance context for wrapping incompatible components.
- [Gang of Four: *Design Patterns*](https://en.wikipedia.org/wiki/Design_Patterns) - the original source of all seven patterns in this module.

## Next

[08-behavioral-patterns-i](../08-behavioral-patterns-i/README.md) —
Strategy, Observer, Command, State, and Template Method: patterns for how
objects *communicate and distribute responsibility* between each other,
plus a cumulative review across modules 06–08.
