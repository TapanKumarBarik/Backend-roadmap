# Module 12: Parking Lot & Elevator

## Why this matters

This is the first classic-problem module — and the first place the
seven-step method from module 11 gets run for real, on complete designs
with full implementations, not a partial sketch. Both problems here
(Parking Lot, Elevator System) are among the most frequently asked LLD
interview questions, precisely because each forces you to combine
several patterns and principles from modules 04–10 into one coherent
design rather than applying any single one in isolation.

---

## Problem 1: Parking Lot

### Requirements

**Functional**: a multi-level parking lot supports three vehicle types
(motorcycle, car, truck) with three spot sizes (motorcycle, compact,
large); a motorcycle can use any spot size, a car needs compact or
large, a truck needs large only. On entry, a vehicle is assigned the
nearest suitable available spot and receives a ticket recording entry
time. On exit, a fee is computed from parked duration and paid before
the spot is released.

**Non-functional**: multiple entry gates may operate concurrently
(module 10's concurrency-safe design applies directly to spot
assignment); pricing must be easy to change without touching the core
allocation logic (module 04's OCP, satisfied via Strategy, module 08).

**Assumptions stated up front** (module 11, step 1): payment happens
only on exit; a single physical lot (legitimate Singleton use, module
06); spot search proceeds level by level, first-fit within a level.

### Entities and relationships

Applying module 11's steps 3–4 directly: `ParkingLot *-- Level *--
ParkingSpot` (composition — spots don't exist without their level, which
doesn't exist without the lot); `ParkingSpot --> Vehicle` (association —
a vehicle exists independently of being parked); `Vehicle <|-- Motorcycle
/ Car / Truck` (inheritance); `Ticket --> ParkingSpot`, `Ticket -->
Vehicle` (association); `ParkingLot --> PricingStrategy` (association,
injected — DIP, module 04).

### Class diagram

```
┌───────────────┐        ┌──────────┐        ┌────────────────┐
│  ParkingLot    │  *--   │  Level    │  *--   │  ParkingSpot    │
│ (Singleton)    │◇───────│           │◇───────│                 │
├───────────────┤        ├──────────┤        ├────────────────┤
│ - levels        │        │ - spots   │        │ - size: SpotSize │
│ - pricing        │        └──────────┘        │ - vehicle        │
├───────────────┤                              ├────────────────┤
│ + parkVehicle()  │                              │ + fits(vehicle)  │
│ + unpark(ticket) │                              │ + assign/vacate  │
└───────────────┘                              └────────┬───────┘
        │--> Ticket                                     │--> (association)
┌───────┴───────┐                              ┌────────┴───────┐
│    Ticket       │                              │    Vehicle       │ (abstract)
├───────────────┤                              └────────┬───────┘
│ - entryTime      │                                <|--┴--|>--|>
│ - spot, vehicle  │                        ┌─────────┼─────────┐
└───────────────┘                    ┌──────┴──┐ ┌───┴────┐ ┌──┴────┐
                                     │Motorcycle │ │  Car    │ │ Truck │
                                     └─────────┘ └────────┘ └───────┘

PricingStrategy (interface) <── HourlyPricing   (Strategy, module 08)
```

### Implementation

A note on running the C# code as a real project, since these are full
programs now, not illustrative fragments: C# requires top-level
statements (the `var lot = ...` usage lines at the end) to come *before*
any type declaration *in the same file* — so put the class definitions
in their own file (e.g. `Classes.cs`) and keep only the usage lines in
`Program.cs`. This isn't a limitation of the design, just C#'s file-level
rule for where top-level statements are allowed; every classic-problem
module from here on assumes this same split.

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod
from enum import Enum, auto
from datetime import datetime
import threading

class SpotSize(Enum):
    MOTORCYCLE = auto()
    COMPACT = auto()
    LARGE = auto()

class Vehicle(ABC):
    def __init__(self, license_plate):
        self.license_plate = license_plate

    @abstractmethod
    def required_sizes(self) -> set:      # sizes this vehicle can legally use
        ...

class Motorcycle(Vehicle):
    def required_sizes(self): return {SpotSize.MOTORCYCLE, SpotSize.COMPACT, SpotSize.LARGE}

class Car(Vehicle):
    def required_sizes(self): return {SpotSize.COMPACT, SpotSize.LARGE}

class Truck(Vehicle):
    def required_sizes(self): return {SpotSize.LARGE}

class ParkingSpot:
    def __init__(self, size: SpotSize):
        self.size = size
        self.vehicle: Vehicle | None = None

    def fits(self, vehicle: Vehicle) -> bool:
        return self.vehicle is None and self.size in vehicle.required_sizes()

    def assign(self, vehicle: Vehicle):
        self.vehicle = vehicle

    def vacate(self):
        self.vehicle = None

class Level:
    def __init__(self, spots: list[ParkingSpot]):
        self.spots = spots
        self._lock = threading.Lock()       # encapsulated per module 10 — callers never see this

    def find_and_assign(self, vehicle: Vehicle) -> ParkingSpot | None:
        with self._lock:                     # critical section: check-then-assign, kept minimal
            for spot in self.spots:
                if spot.fits(vehicle):
                    spot.assign(vehicle)
                    return spot
        return None

class Ticket:
    def __init__(self, vehicle: Vehicle, spot: ParkingSpot):
        self.vehicle = vehicle
        self.spot = spot
        self.entry_time = datetime.now()

class PricingStrategy(ABC):                  # Strategy, module 08
    @abstractmethod
    def calculate_fee(self, ticket: Ticket, exit_time: datetime) -> float: ...

class HourlyPricing(PricingStrategy):
    def __init__(self, rate_per_hour=2.0):
        self.rate = rate_per_hour

    def calculate_fee(self, ticket, exit_time):
        hours = max(1, (exit_time - ticket.entry_time).seconds // 3600 + 1)
        return hours * self.rate

class ParkingLot:                            # Singleton, module 06 — genuinely one physical lot
    _instance = None
    _lock = threading.Lock()

    def __init__(self, levels: list[Level], pricing: PricingStrategy):
        self.levels = levels
        self.pricing = pricing

    @classmethod
    def get_instance(cls, levels=None, pricing=None):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = ParkingLot(levels or [], pricing or HourlyPricing())
        return cls._instance

    def park_vehicle(self, vehicle: Vehicle) -> Ticket | None:
        for level in self.levels:
            spot = level.find_and_assign(vehicle)
            if spot:
                return Ticket(vehicle, spot)
        return None                            # lot is full

    def unpark(self, ticket: Ticket) -> float:
        fee = self.pricing.calculate_fee(ticket, datetime.now())
        ticket.spot.vacate()
        return fee

# usage
lot = ParkingLot.get_instance(levels=[Level([ParkingSpot(SpotSize.COMPACT), ParkingSpot(SpotSize.LARGE)])])
ticket = lot.park_vehicle(Car("ABC-123"))
print(f"Fee: ${lot.unpark(ticket):.2f}")
```
{{tab C#}}
```csharp
public enum SpotSize { Motorcycle, Compact, Large }

public abstract class Vehicle {
    public string LicensePlate;
    protected Vehicle(string plate) { LicensePlate = plate; }
    public abstract HashSet<SpotSize> RequiredSizes();   // sizes this vehicle can legally use
}

public class Motorcycle : Vehicle {
    public Motorcycle(string plate) : base(plate) { }
    public override HashSet<SpotSize> RequiredSizes() =>
        new HashSet<SpotSize> { SpotSize.Motorcycle, SpotSize.Compact, SpotSize.Large };
}
public class Car : Vehicle {
    public Car(string plate) : base(plate) { }
    public override HashSet<SpotSize> RequiredSizes() =>
        new HashSet<SpotSize> { SpotSize.Compact, SpotSize.Large };
}
public class Truck : Vehicle {
    public Truck(string plate) : base(plate) { }
    public override HashSet<SpotSize> RequiredSizes() => new HashSet<SpotSize> { SpotSize.Large };
}

public class ParkingSpot {
    public SpotSize Size;
    public Vehicle Vehicle;
    public ParkingSpot(SpotSize size) { Size = size; }

    public bool Fits(Vehicle vehicle) => Vehicle == null && vehicle.RequiredSizes().Contains(Size);
    public void Assign(Vehicle vehicle) => Vehicle = vehicle;
    public void Vacate() => Vehicle = null;
}

public class Level {
    public List<ParkingSpot> Spots;
    private readonly object _lock = new object();   // encapsulated per module 10 — callers never see this
    public Level(List<ParkingSpot> spots) { Spots = spots; }

    public ParkingSpot FindAndAssign(Vehicle vehicle) {
        lock (_lock) {                                 // critical section: check-then-assign, kept minimal
            foreach (var spot in Spots) {
                if (spot.Fits(vehicle)) { spot.Assign(vehicle); return spot; }
            }
        }
        return null;
    }
}

public class Ticket {
    public Vehicle Vehicle; public ParkingSpot Spot; public DateTime EntryTime;
    public Ticket(Vehicle vehicle, ParkingSpot spot) { Vehicle = vehicle; Spot = spot; EntryTime = DateTime.Now; }
}

public interface IPricingStrategy {                 // Strategy, module 08
    double CalculateFee(Ticket ticket, DateTime exitTime);
}

public class HourlyPricing : IPricingStrategy {
    private double _rate;
    public HourlyPricing(double ratePerHour = 2.0) { _rate = ratePerHour; }
    public double CalculateFee(Ticket ticket, DateTime exitTime) {
        int hours = Math.Max(1, (int)(exitTime - ticket.EntryTime).TotalHours + 1);
        return hours * _rate;
    }
}

public class ParkingLot {                           // Singleton, module 06 — genuinely one physical lot
    private static ParkingLot _instance;
    private static readonly object _lock = new object();
    public List<Level> Levels;
    public IPricingStrategy Pricing;

    private ParkingLot(List<Level> levels, IPricingStrategy pricing) { Levels = levels; Pricing = pricing; }

    public static ParkingLot GetInstance(List<Level> levels = null, IPricingStrategy pricing = null) {
        if (_instance == null) {
            lock (_lock) {
                if (_instance == null)
                    _instance = new ParkingLot(levels ?? new List<Level>(), pricing ?? new HourlyPricing());
            }
        }
        return _instance;
    }

    public Ticket ParkVehicle(Vehicle vehicle) {
        foreach (var level in Levels) {
            var spot = level.FindAndAssign(vehicle);
            if (spot != null) return new Ticket(vehicle, spot);
        }
        return null;                                  // lot is full
    }

    public double Unpark(Ticket ticket) {
        double fee = Pricing.CalculateFee(ticket, DateTime.Now);
        ticket.Spot.Vacate();
        return fee;
    }
}

// usage
var lot = ParkingLot.GetInstance(new List<Level> {
    new Level(new List<ParkingSpot> { new ParkingSpot(SpotSize.Compact), new ParkingSpot(SpotSize.Large) })
});
var ticket = lot.ParkVehicle(new Car("ABC-123"));
Console.WriteLine($"Fee: ${lot.Unpark(ticket):F2}");
```
{{/tabs}}

### Tradeoffs and extensions

- **Why `find_and_assign` as one locked method, not `find` + `assign`
  separately**: module 10's lesson applied directly — if "find" and
  "assign" were two separate calls, two concurrent gates could both
  find the same spot before either assigns it (a classic
  check-then-act race). Combining them into one locked method closes
  that window.
- **Swap `HourlyPricing` for a `MemberDiscountPricing` or
  `FlatRatePricing`** with zero changes to `ParkingLot` — this is OCP
  (module 04) and Strategy (module 08) working exactly as designed.
- **A real system would add an `Observer`** (module 08) — a display
  board subscribing to spot assign/vacate events — without touching
  `ParkingLot`'s core logic at all.

---

## Problem 2: Elevator System

### Requirements

**Functional**: N elevators serve M floors; a hall call specifies a
floor and a direction (up/down); an elevator car call specifies a
destination floor from inside; the system dispatches the *best*
available elevator to a hall call, and each elevator services requests
along its current direction of travel before reversing (a simplified
SCAN/elevator algorithm).

**Non-functional**: dispatch logic should be swappable (different
buildings may want different elevator-selection heuristics) without
touching elevator movement logic itself.

**Assumptions**: elevators move one floor per simulated "tick"; the
dispatch strategy here is "nearest idle-or-same-direction elevator" —
deliberately simplified, named explicitly as a simplification below.

### Class diagram

```
┌─────────────────────┐        ┌──────────────┐
│  ElevatorController   │  --> │  Elevator      │
│                       │ (many)│                │
├─────────────────────┤        ├──────────────┤
│ - elevators            │        │ - currentFloor  │
│ - dispatchStrategy      │        │ - direction      │
├─────────────────────┤        │ - targetFloors  │
│ + requestElevator()     │        ├──────────────┤
│ + step()                 │        │ + addTarget()    │
└─────────────────────┘        │ + step()          │
        │--> (association)      └──────────────┘
┌───────┴───────────┐
│ DispatchStrategy     │  (Strategy, module 08)
└───────────────────┘
        △
┌───────┴───────────┐
│ NearestElevator      │
└───────────────────┘
```

### Implementation

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod
from enum import Enum, auto

class Direction(Enum):
    UP = auto()
    DOWN = auto()
    IDLE = auto()

class Elevator:
    def __init__(self, id, current_floor=0):
        self.id = id
        self.current_floor = current_floor
        self.direction = Direction.IDLE
        self.targets: set[int] = set()

    def add_target(self, floor: int):
        self.targets.add(floor)
        if self.direction == Direction.IDLE and self.targets:
            self.direction = Direction.UP if floor > self.current_floor else Direction.DOWN

    def step(self):                          # simulate one tick of movement
        if not self.targets:
            self.direction = Direction.IDLE
            return
        if self.direction == Direction.UP:
            self.current_floor += 1
        elif self.direction == Direction.DOWN:
            self.current_floor -= 1

        if self.current_floor in self.targets:            # arrived — stop and pick up/drop off
            self.targets.remove(self.current_floor)
            print(f"Elevator {self.id} stopped at floor {self.current_floor}")

        if not self.targets:
            self.direction = Direction.IDLE
        elif self.direction == Direction.UP and not any(t > self.current_floor for t in self.targets):
            self.direction = Direction.DOWN          # no more targets above — reverse (simplified SCAN)
        elif self.direction == Direction.DOWN and not any(t < self.current_floor for t in self.targets):
            self.direction = Direction.UP

class DispatchStrategy(ABC):                  # Strategy, module 08
    @abstractmethod
    def select(self, elevators: list[Elevator], floor: int) -> Elevator: ...

class NearestElevatorStrategy(DispatchStrategy):
    def select(self, elevators, floor):        # SIMPLIFICATION: ignores current direction/targets entirely
        return min(elevators, key=lambda e: abs(e.current_floor - floor))

class ElevatorController:
    def __init__(self, elevators: list[Elevator], strategy: DispatchStrategy):
        self.elevators = elevators
        self.strategy = strategy

    def request_elevator(self, floor: int):     # a hall call
        best = self.strategy.select(self.elevators, floor)
        best.add_target(floor)
        return best

    def press_floor(self, elevator: Elevator, floor: int):   # a car call from inside
        elevator.add_target(floor)

    def step(self):
        for elevator in self.elevators:
            elevator.step()

controller = ElevatorController([Elevator(1), Elevator(2, current_floor=5)], NearestElevatorStrategy())
picked = controller.request_elevator(3)
controller.press_floor(picked, 7)
for _ in range(10):
    controller.step()
```
{{tab C#}}
```csharp
public enum Direction { Up, Down, Idle }

public class Elevator {
    public int Id, CurrentFloor;
    public Direction Direction = Direction.Idle;
    public HashSet<int> Targets = new HashSet<int>();

    public Elevator(int id, int currentFloor = 0) { Id = id; CurrentFloor = currentFloor; }

    public void AddTarget(int floor) {
        Targets.Add(floor);
        if (Direction == Direction.Idle && Targets.Count > 0)
            Direction = floor > CurrentFloor ? Direction.Up : Direction.Down;
    }

    public void Step() {                        // simulate one tick of movement
        if (Targets.Count == 0) { Direction = Direction.Idle; return; }
        if (Direction == Direction.Up) CurrentFloor++;
        else if (Direction == Direction.Down) CurrentFloor--;

        if (Targets.Contains(CurrentFloor)) {              // arrived — stop and pick up/drop off
            Targets.Remove(CurrentFloor);
            Console.WriteLine($"Elevator {Id} stopped at floor {CurrentFloor}");
        }

        if (Targets.Count == 0) Direction = Direction.Idle;
        else if (Direction == Direction.Up && !Targets.Any(t => t > CurrentFloor))
            Direction = Direction.Down;           // no more targets above — reverse (simplified SCAN)
        else if (Direction == Direction.Down && !Targets.Any(t => t < CurrentFloor))
            Direction = Direction.Up;
    }
}

public interface IDispatchStrategy {            // Strategy, module 08
    Elevator Select(List<Elevator> elevators, int floor);
}

public class NearestElevatorStrategy : IDispatchStrategy {
    public Elevator Select(List<Elevator> elevators, int floor) =>   // SIMPLIFICATION: ignores direction/targets
        elevators.OrderBy(e => Math.Abs(e.CurrentFloor - floor)).First();
}

public class ElevatorController {
    public List<Elevator> Elevators;
    private IDispatchStrategy _strategy;

    public ElevatorController(List<Elevator> elevators, IDispatchStrategy strategy) {
        Elevators = elevators; _strategy = strategy;
    }

    public Elevator RequestElevator(int floor) {   // a hall call
        var best = _strategy.Select(Elevators, floor);
        best.AddTarget(floor);
        return best;
    }

    public void PressFloor(Elevator elevator, int floor) => elevator.AddTarget(floor);   // a car call

    public void Step() {
        foreach (var elevator in Elevators) elevator.Step();
    }
}

var controller = new ElevatorController(
    new List<Elevator> { new Elevator(1), new Elevator(2, currentFloor: 5) },
    new NearestElevatorStrategy());
var picked = controller.RequestElevator(3);
controller.PressFloor(picked, 7);
for (int i = 0; i < 10; i++) controller.Step();
```
{{/tabs}}

### Tradeoffs and extensions

- **`NearestElevatorStrategy` is a named simplification, on purpose.** A
  production dispatch strategy would also weigh an elevator's *current
  direction* (an elevator already heading up, below the requested
  floor, is usually better than an idle one two floors closer) —
  swapping in a smarter `DirectionAwareStrategy` requires zero changes
  to `Elevator` or `ElevatorController`, exactly the payoff Strategy
  (module 08) is for.
- **The `targets` set plus direction-reversal logic is a simplified
  SCAN/elevator algorithm** — real elevator systems use more refined
  variants (LOOK, C-SCAN), but the *shape* (maintain a direction, serve
  requests along it, reverse when none remain ahead) is the same idea.
- **Concurrency (module 10)**: if requests can arrive from multiple
  floors concurrently in a real system, `add_target`/`AddTarget` and
  `step`/`Step` mutate shared state (`targets`, `direction`) — exactly
  the kind of critical section that needs the same lock-encapsulated-
  inside-the-class treatment `Level.find_and_assign` got above.

## Hands-on exercises

### 1. Parking Lot: add a spot-type observer

Add an `Observer` (module 08) to `Level` that gets notified whenever a
spot is assigned or vacated, and implement a simple
`OccupancyDisplay` observer that prints the current count of available
spots per level.

### 2. Parking Lot: swap the pricing strategy

Implement a `FlatRatePricing` strategy (a fixed fee regardless of
duration) and confirm swapping it into `ParkingLot` at construction
changes the computed fee with zero changes to `ParkingLot` itself.

### 3. Parking Lot: full-lot handling

Fill every spot in a small lot, then attempt to park one more vehicle —
confirm `park_vehicle`/`ParkVehicle` returns `None`/`null` rather than
crashing, and add a check in your calling code that prints "Lot is
full" in that case.

### 4. Elevator: verify the SCAN behavior

Send an elevator requests for floors 5, 2, and 8 (in that order) from
floor 0. Trace through `step()`/`Step()` calls by hand (or run it) and
confirm it visits floors in the order 2, 5, 8 — not the order the
requests arrived in — because it serves everything along its current
direction before reversing.

### 5. Elevator: a direction-aware dispatch strategy

Implement `DirectionAwareStrategy`, which prefers an elevator already
moving toward the requested floor in the requested direction over a
merely-closer idle one. Confirm it selects differently from
`NearestElevatorStrategy` in at least one scenario you construct.

## Independent challenge

No code given.

**Task:** Extend the Parking Lot with **multiple entry gates issuing
tickets concurrently** and **multiple exit gates processing payment
concurrently**. Using module 10's guidance, identify every piece of
shared mutable state touched by more than one gate, and ensure each is
protected by a lock fully encapsulated inside the class that owns it
(not exposed to the gates). Write a short test that starts several
"gate" threads simultaneously calling `park_vehicle`/`ParkVehicle` on
the same lot with different vehicles, and confirm every vehicle gets a
distinct spot with no two vehicles ever assigned the same one.

<details>
<summary>Hint</summary>

`Level.find_and_assign` is already safe as written (module 10's
check-then-act fix). The remaining shared state to think about: if
gates are also updating a shared "available spot count" for a display
(exercise 1's Observer), that counter is itself shared mutable state
touched by every gate — protect it the same way, or better, derive it
by re-counting rather than maintaining a separately-mutated counter at
all (fewer places for a race to hide).

</details>

## Common mistakes & troubleshooting

- **Separating "find a spot" and "assign it" into two separate public
  method calls.** This reopens exactly the race condition module 10
  warned about — always keep check-then-act as one atomic,
  lock-encapsulated operation.
- **Hard-coding vehicle-to-spot-size rules with `if`/`elif` inside
  `ParkingSpot.fits`.** The `required_sizes()` approach keeps that
  knowledge on `Vehicle` itself (each vehicle knows what it can use) —
  adding a new vehicle type needs one new subclass, not an edit to
  `ParkingSpot`.
- **Making `ParkingLot` a Singleton because "it's a nice pattern to
  show off," without the genuine one-physical-lot justification.**
  Revisit module 06's caveat — `ParkingLot` is one of the *legitimate*
  uses, but that's a property of the specific problem (one lot), not a
  reason to Singleton-ify `Level` or `ParkingSpot` too.
- **Forgetting the elevator needs to reverse direction, not just stop
  when its target list is empty mid-scan.** Without the reversal check,
  an elevator with targets both above and below its current floor after
  serving one direction's requests would get stuck never reaching the
  others.
- **Treating `NearestElevatorStrategy`'s simplification as the final
  answer rather than a named tradeoff.** Always be ready to say, out
  loud, what a real system would refine and why — this is exactly what
  module 11's step 7 (tradeoffs discussion) is for.

## Checkpoint quiz

1. Why does `find_and_assign` combine "search" and "assign" into one
   locked method instead of two separate public methods?
2. Which vehicle decides which spot sizes it can use, and why does that
   design choice make adding a new vehicle type cheap?
3. Why is Singleton defensible for `ParkingLot` specifically, but not
   `Level` or `ParkingSpot`?
4. In the elevator's `step()`/`Step()`, what causes a direction reversal,
   and why is that check necessary?
5. What's the one thing `NearestElevatorStrategy` deliberately ignores,
   and what pattern lets you fix that without touching `Elevator`?

<details>
<summary>Answers</summary>

1. To close the check-then-act race module 10 warned about — if
   "search" and "assign" were separate calls, two concurrent gates
   could both find the same available spot before either actually
   assigns it.
2. The `Vehicle` subclass itself, via `required_sizes()`/
   `RequiredSizes()` — this keeps the vehicle-to-size compatibility rule
   with the vehicle, so adding a new vehicle type (e.g., a bus) is one
   new subclass, with no edits to `ParkingSpot` or `Level`.
3. Because there's genuinely one physical lot the whole system manages
   — a true one-of-a-kind resource. `Level` and `ParkingSpot` have many
   legitimate instances by design; Singleton-ing them would make no
   sense and would just be an unjustified global.
4. When there are no remaining targets *in the current direction of
   travel* (checked via `any(t > current_floor ...)`/`Targets.Any(...)`).
   It's necessary because otherwise an elevator with targets on both
   sides of its current floor would keep moving in its original
   direction forever, past requests behind it that it can never reach.
5. It ignores each elevator's current direction of travel — an elevator
   already heading toward the requested floor might be a much better
   pick than a merely-closer idle one. Strategy (module 08) lets you
   swap in a `DirectionAwareStrategy` with zero changes to `Elevator`
   or `ElevatorController`.

</details>

## Interview questions

1. **"Walk me through your Parking Lot design and why you chose
   Singleton for the lot itself."**
   One physical lot genuinely exists once per running system — a true
   one-of-a-kind resource, which is exactly Singleton's legitimate use
   case (module 06), unlike `Level` or `ParkingSpot`, which have many
   instances by design.
2. **"How would you make spot assignment safe if multiple entry gates
   operate concurrently?"**
   Keep "find an available spot" and "assign it" as one method,
   protected by a lock fully encapsulated inside the class owning the
   spots (`Level`), so the check-then-act sequence can't be interleaved
   by two gates — never expose the lock for callers to manage
   themselves.
3. **"How would you change the pricing model without breaking existing
   code?"**
   `ParkingLot` depends on a `PricingStrategy`/`IPricingStrategy`
   abstraction, injected at construction (DIP, module 04) — a new
   pricing model is a new class implementing that interface, with zero
   changes to `ParkingLot` itself (OCP, module 04, via Strategy, module
   08).
4. **"Explain how your elevator decides which floor to go to next."**
   It maintains a set of target floors and a current direction; each
   step it moves one floor in that direction, stops and removes a
   target if it arrives at one, and reverses direction once no
   remaining targets are ahead of it in the current direction — a
   simplified SCAN/elevator algorithm.
5. **"What would you improve about your elevator dispatch strategy for
   a real building?"**
   The current `NearestElevatorStrategy` only considers distance, not
   whether an elevator is already moving toward the request in the
   right direction — a `DirectionAwareStrategy` would weigh both, and
   swapping it in requires no changes to `Elevator` or
   `ElevatorController`, since dispatch logic is isolated behind a
   `DispatchStrategy` abstraction.

## Further reading & sources

- [Refactoring.Guru: Strategy pattern](https://refactoring.guru/design-patterns/strategy) - revisit module 08's pattern, used for both pricing and dispatch here.
- [SCAN disk/elevator scheduling algorithm (Wikipedia)](https://en.wikipedia.org/wiki/Elevator_algorithm) - the real scheduling algorithm this module's simplified elevator logic is based on.
- [Python: `threading.Lock`](https://docs.python.org/3/library/threading.html#lock-objects) / [Microsoft Learn: `lock` statement](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/lock) - revisit module 10's concurrency primitives, applied directly in `Level.find_and_assign`.

## Next

[13-library-and-vending-machine](../13-library-and-vending-machine/README.md)
— two more classic problems, full guided solutions: a Library
Management system and a Vending Machine.
