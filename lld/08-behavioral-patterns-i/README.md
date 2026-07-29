# Module 08: Behavioral Patterns I

## Why this matters

Creational patterns (module 06) cover *making* objects; structural
patterns (module 07) cover *composing* them. Behavioral patterns — split
across this module and module 09 — cover how objects **communicate and
distribute responsibility** between each other: who decides what to do,
who gets told when something happens, and how a request itself can be
treated as a first-class thing you can queue, log, or undo. You've
already met Strategy informally, twice (module 04's OCP fix, module 05's
`Duck`/`FlyBehavior`) — this module gives it, and four siblings, their
full formal treatment.

## Concepts

### Strategy — swap an algorithm at runtime, without an `if` chain

You've built this pattern twice already without naming it. Here's the
canonical shape, made explicit: a **Context** holds a reference to a
**Strategy** interface and delegates to it, and the *caller* decides
which concrete strategy to plug in — including swapping it at runtime.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class SortStrategy(ABC):
    @abstractmethod
    def sort(self, data: list) -> list: ...

class QuickSort(SortStrategy):
    def sort(self, data):
        print("sorting with quicksort")
        return sorted(data)          # stand-in for a real quicksort implementation

class BubbleSort(SortStrategy):
    def sort(self, data):
        print("sorting with bubble sort")
        return sorted(data)          # stand-in for a real bubble sort implementation

class Sorter:                        # the CONTEXT
    def __init__(self, strategy: SortStrategy):
        self.strategy = strategy

    def set_strategy(self, strategy: SortStrategy):   # swap the algorithm AT RUNTIME
        self.strategy = strategy

    def sort(self, data):
        return self.strategy.sort(data)

sorter = Sorter(QuickSort())
sorter.sort([3, 1, 2])
sorter.set_strategy(BubbleSort())     # same Sorter object, different algorithm, no if/elif anywhere
sorter.sort([3, 1, 2])
```
{{tab C#}}
```csharp
public interface ISortStrategy {
    List<int> Sort(List<int> data);
}

public class QuickSort : ISortStrategy {
    public List<int> Sort(List<int> data) {
        Console.WriteLine("sorting with quicksort");
        return data.OrderBy(x => x).ToList();   // stand-in for a real quicksort implementation
    }
}
public class BubbleSort : ISortStrategy {
    public List<int> Sort(List<int> data) {
        Console.WriteLine("sorting with bubble sort");
        return data.OrderBy(x => x).ToList();   // stand-in for a real bubble sort implementation
    }
}

public class Sorter {                  // the CONTEXT
    private ISortStrategy _strategy;
    public Sorter(ISortStrategy strategy) { _strategy = strategy; }

    public void SetStrategy(ISortStrategy strategy) => _strategy = strategy;   // swap AT RUNTIME

    public List<int> Sort(List<int> data) => _strategy.Sort(data);
}

var sorter = new Sorter(new QuickSort());
sorter.Sort(new List<int> { 3, 1, 2 });
sorter.SetStrategy(new BubbleSort());   // same Sorter object, different algorithm, no if/elif anywhere
sorter.Sort(new List<int> { 3, 1, 2 });
```
{{/tabs}}

### Observer — notify many dependents automatically, when one thing changes

**Problem it solves:** one object's state change needs to automatically
propagate to an open-ended, possibly-changing set of interested parties,
without that object needing to know anything concrete about them.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Observer(ABC):
    @abstractmethod
    def update(self, temperature: float) -> None: ...

class WeatherStation:                       # the SUBJECT (publisher)
    def __init__(self):
        self._observers: list[Observer] = []
        self._temperature = 0.0

    def subscribe(self, observer: Observer):
        self._observers.append(observer)

    def unsubscribe(self, observer: Observer):
        self._observers.remove(observer)

    def set_temperature(self, temp: float):
        self._temperature = temp
        self._notify_all()                   # one state change, fanned out to everyone

    def _notify_all(self):
        for observer in self._observers:
            observer.update(self._temperature)

class CurrentConditionsDisplay(Observer):
    def update(self, temperature):
        print(f"Current conditions: {temperature}°")

class StatisticsDisplay(Observer):
    def __init__(self):
        self.readings = []
    def update(self, temperature):
        self.readings.append(temperature)
        print(f"Average so far: {sum(self.readings)/len(self.readings):.1f}°")

station = WeatherStation()
station.subscribe(CurrentConditionsDisplay())
station.subscribe(StatisticsDisplay())
station.set_temperature(72)   # BOTH displays react — WeatherStation knows nothing about their details
station.set_temperature(76)
```
{{tab C#}}
```csharp
public interface IObserver {
    void Update(double temperature);
}

public class WeatherStation {               // the SUBJECT (publisher)
    private List<IObserver> _observers = new List<IObserver>();
    private double _temperature;

    public void Subscribe(IObserver observer) => _observers.Add(observer);
    public void Unsubscribe(IObserver observer) => _observers.Remove(observer);

    public void SetTemperature(double temp) {
        _temperature = temp;
        NotifyAll();                          // one state change, fanned out to everyone
    }

    private void NotifyAll() {
        foreach (var observer in _observers) observer.Update(_temperature);
    }
}

public class CurrentConditionsDisplay : IObserver {
    public void Update(double temperature) => Console.WriteLine($"Current conditions: {temperature}°");
}

public class StatisticsDisplay : IObserver {
    private List<double> _readings = new List<double>();
    public void Update(double temperature) {
        _readings.Add(temperature);
        Console.WriteLine($"Average so far: {_readings.Average():F1}°");
    }
}

var station = new WeatherStation();
station.Subscribe(new CurrentConditionsDisplay());
station.Subscribe(new StatisticsDisplay());
station.SetTemperature(72);   // BOTH displays react — WeatherStation knows nothing about their details
station.SetTemperature(76);
```
{{/tabs}}

### Command — turn a request into an object

**Problem it solves:** you want to decouple *who requests an action* from
*who performs it*, and treat the request itself as a first-class object
you can queue, log, or undo.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Command(ABC):
    @abstractmethod
    def execute(self): ...
    @abstractmethod
    def undo(self): ...

class Light:                          # the RECEIVER — does the actual work
    def on(self): print("Light is ON")
    def off(self): print("Light is OFF")

class LightOnCommand(Command):
    def __init__(self, light: Light):
        self.light = light
    def execute(self):
        self.light.on()
    def undo(self):
        self.light.off()

class RemoteControl:                  # the INVOKER — knows nothing about Light directly
    def __init__(self):
        self._history: list[Command] = []

    def press_button(self, command: Command):
        command.execute()
        self._history.append(command)

    def press_undo(self):
        if self._history:
            self._history.pop().undo()

remote = RemoteControl()
remote.press_button(LightOnCommand(Light()))   # Light is ON
remote.press_undo()                              # Light is OFF — undo, without RemoteControl knowing HOW
```
{{tab C#}}
```csharp
public interface ICommand {
    void Execute();
    void Undo();
}

public class Light {                  // the RECEIVER — does the actual work
    public void On() => Console.WriteLine("Light is ON");
    public void Off() => Console.WriteLine("Light is OFF");
}

public class LightOnCommand : ICommand {
    private readonly Light _light;
    public LightOnCommand(Light light) { _light = light; }
    public void Execute() => _light.On();
    public void Undo() => _light.Off();
}

public class RemoteControl {          // the INVOKER — knows nothing about Light directly
    private Stack<ICommand> _history = new Stack<ICommand>();

    public void PressButton(ICommand command) {
        command.Execute();
        _history.Push(command);
    }

    public void PressUndo() {
        if (_history.Count > 0) _history.Pop().Undo();
    }
}

var remote = new RemoteControl();
remote.PressButton(new LightOnCommand(new Light()));   // Light is ON
remote.PressUndo();                                      // Light is OFF — undo, without RemoteControl knowing HOW
```
{{/tabs}}

### State — behavior changes as an object's internal state changes

**Problem it solves:** an object's behavior needs to genuinely *differ*
depending on which state it's in — not just "is this transition valid"
(module 03's enum + transition-table already handles that cheaply), but
"this method should actually *do something different* in each state."

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class OrderState(ABC):
    @abstractmethod
    def next(self, order: "Order"): ...
    @abstractmethod
    def name(self) -> str: ...

class PendingState(OrderState):
    def next(self, order):
        print("Shipping the order...")
        order.state = ShippedState()
    def name(self): return "Pending"

class ShippedState(OrderState):
    def next(self, order):
        print("Delivering the order...")
        order.state = DeliveredState()
    def name(self): return "Shipped"

class DeliveredState(OrderState):
    def next(self, order):
        print("Already delivered — nothing to do.")
    def name(self): return "Delivered"

class Order:
    def __init__(self):
        self.state: OrderState = PendingState()   # the ORDER delegates behavior to its current state object

    def advance(self):
        self.state.next(self)                      # Order itself has NO if/elif on status at all

order = Order()
print(order.state.name())   # Pending
order.advance()               # Shipping the order...
order.advance()               # Delivering the order...
print(order.state.name())   # Delivered
```
{{tab C#}}
```csharp
public interface IOrderState {
    void Next(Order order);
    string Name { get; }
}

public class PendingState : IOrderState {
    public void Next(Order order) {
        Console.WriteLine("Shipping the order...");
        order.State = new ShippedState();
    }
    public string Name => "Pending";
}

public class ShippedState : IOrderState {
    public void Next(Order order) {
        Console.WriteLine("Delivering the order...");
        order.State = new DeliveredState();
    }
    public string Name => "Shipped";
}

public class DeliveredState : IOrderState {
    public void Next(Order order) => Console.WriteLine("Already delivered — nothing to do.");
    public string Name => "Delivered";
}

public class Order {
    public IOrderState State = new PendingState();   // the ORDER delegates behavior to its current state object

    public void Advance() => State.Next(this);         // Order itself has NO if/elif on status at all
}

var order = new Order();
Console.WriteLine(order.State.Name);   // Pending
order.Advance();                        // Shipping the order...
order.Advance();                        // Delivering the order...
Console.WriteLine(order.State.Name);   // Delivered
```
{{/tabs}}

**State vs. Strategy — the pattern almost everyone confuses, because the
code shape is nearly identical.** Both hold a reference to an
interchangeable object and delegate to it. The difference is entirely
about **intent and who changes the reference**: in Strategy, the
*client/caller* picks the strategy from outside, for *how* to do
something (an algorithm choice), and it rarely changes itself mid-flow.
In State, the state object itself decides to *transition the reference
to a new state* (`order.state = ShippedState()`, from inside the state's
own method) in response to something happening — modeling *what the
object currently is*, changing autonomously over the object's lifetime.

**State vs. module 03's enum-driven transitions — when to use which.**
If every state only needs a validity check (can we go from A to B?) with
otherwise identical behavior, module 03's enum + transition dictionary is
simpler and sufficient — reaching for full State-pattern classes there
would be over-engineering (YAGNI, module 05). Use the full State pattern
when different states need to genuinely **behave** differently, not just
permit different next steps.

### Template Method — fix the algorithm's shape, let subclasses fill in steps

**Problem it solves:** several variants of a process share the same
overall *sequence* of steps, but differ in how one or two individual
steps are done.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class DataProcessor(ABC):
    def process(self):                    # the TEMPLATE METHOD — fixes the sequence, never overridden
        data = self.read_data()
        result = self.transform_data(data)
        self.save_data(result)

    @abstractmethod
    def read_data(self): ...
    @abstractmethod
    def transform_data(self, data): ...

    def save_data(self, result):          # a step with a sensible DEFAULT — subclasses may override if needed
        print(f"Saving: {result}")

class CsvDataProcessor(DataProcessor):
    def read_data(self):
        return "a,b,c"
    def transform_data(self, data):
        return data.split(",")

class JsonDataProcessor(DataProcessor):
    def read_data(self):
        return '{"a": 1}'
    def transform_data(self, data):
        return {"parsed": data}

CsvDataProcessor().process()    # Saving: ['a', 'b', 'c']
JsonDataProcessor().process()   # Saving: {'parsed': '{"a": 1}'}
# the SEQUENCE (read -> transform -> save) is identical for both — only two steps actually differ
```
{{tab C#}}
```csharp
public abstract class DataProcessor {
    public void Process() {               // the TEMPLATE METHOD — fixes the sequence, never overridden
        var data = ReadData();
        var result = TransformData(data);
        SaveData(result);
    }

    protected abstract object ReadData();
    protected abstract object TransformData(object data);

    protected virtual void SaveData(object result) =>       // a step with a sensible DEFAULT
        Console.WriteLine($"Saving: {result}");
}

public class CsvDataProcessor : DataProcessor {
    protected override object ReadData() => "a,b,c";
    protected override object TransformData(object data) => ((string)data).Split(',');
}

public class JsonDataProcessor : DataProcessor {
    protected override object ReadData() => "{\"a\": 1}";
    protected override object TransformData(object data) => $"parsed({data})";
}

new CsvDataProcessor().Process();    // Saving: System.String[]
new JsonDataProcessor().Process();   // Saving: parsed({"a": 1})
// the SEQUENCE (read -> transform -> save) is identical for both — only two steps actually differ
```
{{/tabs}}

Template Method is the one pattern in this pair that **uses inheritance
directly** rather than composition — and that's fine here specifically
*because* the varying steps are genuinely part of one shared algorithm's
identity, not an independently-swappable behavior (contrast with
Strategy, which would be the composition-based alternative if you needed
to swap the *entire* algorithm at runtime instead of overriding a couple
of its steps once per subclass).

## Hands-on exercises

### 1. Strategy

Build a `PricingContext` that holds a pricing `Strategy`
(`RegularPricing`, `MemberPricing`, `ClearancePricing`), each computing a
final price differently from a base price. Confirm swapping the strategy
on the same context object changes the computed price with no other code
changes.

### 2. Observer

Extend the `WeatherStation` example with a third observer,
`ForecastDisplay`, that prints a naive forecast based on whether the
temperature went up or down since the last reading. Then demonstrate
`unsubscribe` actually stops that observer from receiving further
updates.

### 3. Command

Extend the `RemoteControl`/`Light` example with `LightOffCommand` and a
second appliance, `Fan`, with its own on/off commands. Press several
buttons, then call undo three times in a row and confirm each undo
reverses the most recent action, in reverse order (LIFO).

### 4. State

Implement the `Order`/`OrderState` example, then add a `CancelledState`
reachable only from `PendingState` (not from `ShippedState` or
`DeliveredState` — attempting to cancel a shipped order should print a
clear rejection message instead of transitioning).

### 5. Template Method

Build a `GameAI` template method `take_turn()`/`TakeTurn()` that always
follows `gather_info()` → `decide_move()` → `execute_move()`, with two
concrete subclasses, `AggressiveAI` and `DefensiveAI`, that override
`decide_move`/`DecideMove` differently while sharing identical
`gather_info`/`execute_move` steps from the base class.

## Independent challenge

No code given.

**Task:** Design a small **smart home automation** system combining
three patterns from this module: a **Command** for every device action
(`TurnOnLightCommand`, `LockDoorCommand`, etc.) issued through one
`SmartHomeHub` invoker that supports undo; an **Observer**-based
`ActivityDashboard` that gets notified of every command executed
(regardless of which device or command type) and maintains a running
log; and a **Strategy** for scheduling — implement at least two
scheduling strategies (`ImmediateSchedule` runs a command right away,
`DelayedSchedule` — simulate the delay, no real timers needed — logs
"would run after N seconds" instead of actually waiting) that the hub
can be configured with, swappable at runtime.

<details>
<summary>Hint</summary>

The Command objects should be the thing both the hub *and* the dashboard
know about — the hub executes them (and pushes them onto an undo stack,
exactly like `RemoteControl`), and after each execution it should notify
the dashboard (Observer) with some description of what just ran (the
command's own class name or a `describe()` method is enough — the
dashboard shouldn't need to know each command's internals). The
scheduling Strategy sits *in front of* command execution — the hub asks
its current strategy "how/when should this run?" before actually calling
`execute()`, and swapping strategies changes that timing behavior
without changing anything about the commands or the dashboard.

</details>

## Common mistakes & troubleshooting

- **Confusing Strategy and State because the code looks identical.**
  Ask: who changes the reference, and why? If the *client* picks it once
  from outside for *how* to do something, it's Strategy. If the
  *object itself* changes it in response to something happening,
  representing *what it currently is*, it's State.
- **The "lapsed listener" problem: forgetting to unsubscribe an
  Observer.** An observer that's no longer needed but never
  unsubscribed keeps getting notified forever, and the subject keeps a
  reference to it — preventing it from ever being cleaned up. Always
  pair `subscribe` with a corresponding `unsubscribe` at the point the
  observer is no longer needed.
- **A Command's `undo()` that doesn't actually restore prior state.**
  `LightOnCommand.undo()` calling `light.off()` only works because "on"
  and "off" are each other's exact opposite; a command that, say,
  *increases* a value needs to remember the *previous* value itself
  (captured at `execute()` time) to undo correctly — don't assume undo
  is always "do the opposite command."
- **Reaching for the full State pattern for a simple validity check.**
  If nothing about *behavior* differs between states — only which
  transitions are legal — module 03's enum + transition table is
  simpler and sufficient; the class-per-state machinery is overkill
  there (YAGNI again).
- **A Template Method base class with too many overridable "hook"
  steps.** If nearly every step is abstract/overridable and subclasses
  end up overriding almost all of them differently, the shared
  "template" isn't actually providing much shared structure anymore —
  that's often a sign Strategy (swap the *whole* algorithm) fits better
  than Template Method (override a couple of *steps* within one fixed
  algorithm).

## Checkpoint quiz

1. In the Strategy example, what exactly does `Sorter` (the context) not
   need to know about `QuickSort` and `BubbleSort`?
2. What problem does Observer solve that a subject calling each
   dependent directly, by name, would not solve as well?
3. In the Command example, what does `RemoteControl` never need to know
   about `Light`?
4. What's the precise difference in *intent* between State and
   Strategy, given that their code shapes look nearly identical?
5. Why is Template Method one of the few behavioral patterns that
   leans on inheritance rather than composition?
6. Give one concrete symptom that tells you a "State pattern" situation
   is actually simple enough for module 03's enum + transition table
   instead.

<details>
<summary>Answers</summary>

1. It doesn't need to know how either algorithm actually sorts — only
   that whatever `Strategy` it's holding implements `sort()`/`Sort()`;
   it can't even tell which concrete strategy is plugged in.
2. It lets the subject stay decoupled from a fixed, hard-coded list of
   dependents — new observer types can subscribe/unsubscribe at
   runtime without the subject's code ever changing, unlike a subject
   that calls out to specific named dependents directly.
3. It never knows `Light` has `on()`/`off()` methods at all — it only
   knows it was handed something implementing `Command`'s
   `execute()`/`undo()`; the actual appliance and its API are entirely
   hidden inside the concrete command classes.
4. Strategy: the *client* chooses the behavior from outside, for *how*
   to do something (an algorithm), and the choice is comparatively
   stable. State: the *object itself* changes the reference from
   inside, in response to events, to reflect *what it currently is* —
   an ongoing, self-managed lifecycle.
5. Because the varying pieces (individual steps) are genuinely part of
   one shared algorithm's identity and structure, not independently
   swappable behavior — inheritance is appropriate here specifically
   because LSP is easy to honor: every subclass really is "a
   `DataProcessor`, using the fixed process, with different step
   details."
6. If every state only ever needs a validity check (is this transition
   allowed?) and no state actually causes visibly *different behavior*
   beyond that — no method's actual logic differs by state, only which
   next states are legal — that's the enum + transition-table's exact
   use case, and the extra class-per-state machinery buys nothing.

</details>

## Interview questions

1. **"What's the difference between Strategy and State? I've heard
   they look almost the same in code."**
   They do — both hold and delegate to an interchangeable object behind
   a shared interface. The difference is intent and who drives the
   change: Strategy is picked by the calling code, from outside, for
   *how* to perform an operation, and stays fairly stable. State is
   changed by the object *itself*, from inside, as part of its own
   lifecycle, to represent *what it currently is* and change its own
   behavior accordingly.
2. **"How does Observer help with loose coupling?"**
   The subject (publisher) only depends on a small shared `Observer`
   interface, never on concrete observer classes — new observer types
   can be added, subscribed, and unsubscribed at runtime with zero
   changes to the subject's code, satisfying both OCP and DIP (module
   04) at once.
3. **"How would you implement undo in a text editor using the Command
   pattern?"**
   Every edit action (insert, delete, format) becomes a `Command` object
   capturing whatever data it needs to *reverse* itself (e.g., the
   deleted text and its position, for a delete command's undo) — every
   executed command is pushed onto a history stack; undo pops the most
   recent command and calls its `undo()`, which restores exactly what
   that specific command changed.
4. **"When would you choose Template Method over Strategy?"**
   When several variants share the same overall *sequence* of steps and
   only one or two individual steps genuinely differ — Template Method
   fixes that shared sequence once in a base class and lets subclasses
   override just the differing steps. Choose Strategy instead when you
   need to swap the *entire* algorithm interchangeably, especially at
   runtime, not just customize a couple of fixed steps within one
   shared structure.
5. **"What's a real-world risk with the Observer pattern in a long-
   running application?"**
   The "lapsed listener" problem — an observer that's no longer needed
   but is never unsubscribed stays referenced by the subject forever,
   both continuing to receive unwanted notifications and preventing
   that observer object from being garbage-collected, a subtle memory
   leak.

## Cumulative review

Closed-book. Pulls from modules 06–08.

1. (06 + 08) Factory Method (module 06) and Strategy (module 08) both
   involve subclasses/implementations providing different behavior
   behind a shared abstract signature. What's the key difference in
   *what* is being varied?
2. (07 + 08) The Decorator pattern (module 07) and the Command pattern
   (module 08) both wrap something behind a shared interface. What does
   each one add that the other doesn't?
3. (06 + 08) Which module-06 pattern would you combine with Observer if
   you needed every newly-*constructed* object of a certain type to
   automatically register itself with a central tracker?
4. (07 + 08) Explain why State (module 08) is a more behavior-driven
   cousin of Bridge (module 07) — what do they share structurally, and
   what's different about intent?
5. (06 + 07 + 08) Name one YAGNI-flavored common mistake from each of
   modules 06, 07, and 08 that all boil down to the same underlying
   warning.

<details>
<summary>Answers</summary>

1. Factory Method varies *which concrete class gets constructed*.
   Strategy varies *which algorithm/behavior runs*, on already-
   constructed, interchangeable objects — creation vs. runtime
   behavior-swapping.
2. Decorator adds new *behavior/responsibility* to an object while
   preserving its interface. Command turns a *request* itself into an
   object, decoupling the sender from the receiver and enabling
   queuing/logging/undo — Decorator changes what an object *does*;
   Command changes what a *request* *is*.
3. Singleton, specifically as a shared registry — a single
   `VehicleRegistry`-style Singleton (as in module 06's independent
   challenge) that every new instance notifies (Observer-style, or
   simply by calling a registration method directly) upon construction.
4. Both compose an object with a reference to a separate abstraction it
   delegates to (Bridge: a `Shape` delegates rendering to a
   `Renderer`; State: an `Order` delegates behavior to its current
   `OrderState`). The difference: Bridge's implementation reference is
   chosen once, from outside, to let two axes vary independently by
   design; State's reference is changed *from inside*, autonomously,
   over the object's lifetime, to represent an evolving identity.
5. Module 06: building an Abstract Factory for only one product family.
   Module 07: building a Bridge, Proxy, or Flyweight before there's an
   actual second implementation/access-control need/memory problem.
   Module 08: reaching for the full State pattern for a simple validity
   check module 03's enum already handles. All three are the same
   warning: don't build a pattern's structural machinery ahead of a
   second, real, current requirement that justifies it.

</details>

## Further reading & sources

- [Refactoring.Guru: Behavioral Patterns](https://refactoring.guru/design-patterns/behavioral-patterns) - clear diagrams and multi-language examples, including the five patterns in this module.
- [Martin Fowler: Event-driven notification and the Observer pattern](https://martinfowler.com/articles/distributed-objects-microservices.html) - Observer's role beyond the textbook example, including its use in distributed systems.
- [Gang of Four: *Design Patterns*](https://en.wikipedia.org/wiki/Design_Patterns) - the original source of all five patterns in this module.

## Next

[09-behavioral-patterns-ii](../09-behavioral-patterns-ii/README.md) —
Iterator, Chain of Responsibility, Mediator, Memento, and Visitor: the
second half of the behavioral catalog, rounding out the 22 GoF patterns
this track covers (of the 23 in the original catalog, only Interpreter —
genuinely rare outside building parsers/DSLs — is skipped).
