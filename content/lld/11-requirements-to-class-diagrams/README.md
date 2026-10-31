# Module 11: Requirements to Class Diagrams

## Why this matters

Every module so far taught you a piece of vocabulary — a principle, a
pattern, a concurrency technique. This module teaches the **process**
that ties them together: what you actually *do*, in order, in the first
ten minutes of an LLD interview, before writing a single line of code.
Interviewers are explicitly evaluating this process — jumping straight
to code on a vague prompt is one of the most common ways strong
coders still lose an LLD round. Every classic-problem module from 12
onward reuses this exact seven-step method; this is the module where you
learn the method itself, on a problem small enough to walk end to end.

## Concepts

### The seven-step method

1. **Clarify requirements** — functional and non-functional.
2. **Identify actors and use cases.**
3. **Extract candidate entities** from the requirements' nouns.
4. **Classify relationships** between entities (module 02's UML
   vocabulary).
5. **Draw a first-draft class diagram.**
6. **Walk through one or two key use cases with a sequence diagram** —
   this is where gaps in step 5 usually surface.
7. **Discuss tradeoffs and likely patterns** — which module 06–10 tool
   fits where, and why.

This is iterative, not a one-way pipeline: step 6 routinely reveals that
step 5's diagram is missing something, and you go back and fix it. That
back-and-forth is normal and expected — treating step 5 as "final" the
moment you've drawn it is itself a mistake, covered below.

We'll walk this whole process on a **small worked example** — a parking
lot — everything here is deliberately partial; the real, fully-detailed
Parking Lot design (with actual pricing, multiple vehicle types, and
complete code) is module 12's job. This module stops once the *process*
is demonstrated, not once the design is complete.

### Step 1: Clarify requirements

**Functional requirements** describe what the system must *do*.
**Non-functional requirements** describe qualities the system must
*have* — scale, concurrency, consistency, latency (module 10's whole
concern lives here).

For a vague prompt like "design a parking lot," you ask before you
assume:

- Multiple levels, or just one?
- Multiple vehicle types (car, motorcycle, truck) with different spot
  sizes, or one uniform spot type?
- Is payment collected on entry, on exit, or both?
- Multiple entry/exit gates operating concurrently? (This is exactly
  where module 10's concurrency-safe design becomes relevant — if two
  gates can assign a spot at the same instant, that's a race condition
  on shared state.)
- Does the system need to display real-time available-spot counts?

**State your assumptions explicitly once you've asked** — in a real
interview, you won't get every answer, and an interviewer wants to see
you proceed sensibly rather than stall. For this walkthrough: *multiple
levels, two vehicle types (car, motorcycle) with different spot sizes,
payment on exit, single entry gate for simplicity.*

### Step 2: Actors and use cases

An **actor** is anyone/anything that interacts with the system. A **use
case** is one discrete interaction.

| Actor | Use cases |
|---|---|
| Driver | Park a vehicle, Pay for parking, Retrieve vehicle |
| Attendant | Override/assist a stuck gate, View occupancy |

Keep this list short and concrete — three to six use cases is typically
plenty for a first pass; you'll add detail once you're implementing.

### Step 3: Extract candidate entities

Go through the requirements and assumptions, underlining nouns:
*parking lot, level, parking spot, vehicle, car, motorcycle, ticket,
payment, driver, entry gate.*

**Not every noun becomes a class.** Filter: does this noun have its own
identity, data, and behavior worth modeling — or is it just a
*property* of something else? "Color" is an attribute of `Vehicle`, not
its own class. "License plate" is a field, not an entity. After
filtering: `ParkingLot`, `Level`, `ParkingSpot`, `Vehicle` (with `Car`/
`Motorcycle` subtypes), `Ticket`, `Payment`, `Gate`.

### Step 4: Classify relationships

Apply module 02's UML vocabulary to every pair of related entities —
this is the step most people skip or get lazy about, and it's the one
that most reveals whether you actually understand the difference
between "has-a" flavors:

- `ParkingLot *-- Level` — **composition**: a `Level` has no existence
  or meaning outside its `ParkingLot`; destroying the lot destroys its
  levels.
- `Level *-- ParkingSpot` — **composition**, same reasoning.
- `ParkingSpot --> Vehicle` — **association**: a spot references
  whichever vehicle currently occupies it, but the `Vehicle` object
  exists independently — it existed before parking and continues to
  exist after leaving.
- `Vehicle <|-- Car`, `Vehicle <|-- Motorcycle` — **inheritance**: both
  genuinely *are* vehicles, substitutable anywhere a `Vehicle` is
  expected (module 02's LSP-safe test).
- `Ticket --> ParkingSpot`, `Ticket --> Vehicle` — **association**: a
  ticket references a spot and a vehicle for the duration of one parking
  session, without owning either's lifecycle.

### Step 5: Draw a first-draft class diagram

```
┌────────────────────┐        ┌───────────────────┐
│     ParkingLot      │  *--   │       Level        │
├────────────────────┤◇───────├───────────────────┤
│ - levels: Level[]    │        │ - spots: Spot[]     │
├────────────────────┤        ├───────────────────┤
│ + parkVehicle()      │        │ + findAvailable()   │
│ + processExit()      │        └─────────┬─────────┘
└────────────────────┘                  *--
                                          │◇
                                ┌─────────┴─────────┐
                                │    ParkingSpot      │
                                ├───────────────────┤
                                │ - occupied: bool     │
                                ├───────────────────┤
                                │ + assign(v)          │
                                │ + vacate()           │
                                └─────────┬─────────┘
                                          │--> (association)
                                ┌─────────┴─────────┐
                                │      Vehicle        │  (abstract)
                                └────────┬──────────┘
                                     <|--┴--|>
                              ┌──────┴───┐ ┌───┴──────┐
                              │    Car     │ │Motorcycle │
                              └──────────┘ └──────────┘
```

This is intentionally partial — no `Ticket`, `Payment`, or `Gate` drawn
yet, no pricing logic, no method parameters filled in. A first-draft
diagram in an interview should look roughly this sparse; you fill in
detail as you walk through use cases next, not all at once up front.

### Step 6: Walk through one use case with a sequence diagram

Taking "Driver parks a vehicle" through the diagram above is what
reveals whether it actually holds together:

```
Driver          ParkingLot         Level            ParkingSpot
  |                  |                |                   |
  |--parkVehicle(v)->|                |                   |
  |                  |--findLevel()-->|                   |
  |                  |                |--findAvailable()->|
  |                  |                |<--spot------------|
  |                  |                |--assign(v)------->|
  |                  |<--spot---------|                   |
  |<--ticket---------|                |                   |
```

Notice what this walkthrough *exposes*: `ParkingLot.parkVehicle()`
returns something to the `Driver` — but nothing in the step-5 diagram
represents that return value. That's a real gap: we need a `Ticket`
entity after all, created here and handed back. **This is exactly why
step 6 comes after step 5, not instead of it** — the sequence diagram
is what catches missing entities and methods a static class diagram
alone doesn't surface.

### Step 7: Discuss tradeoffs and likely patterns

With the shape in place, name which tools from modules 06–10 would
plausibly apply, and why — this is what separates "I can draw boxes"
from "I understand design":

- **Strategy** (module 08) for pricing — different rate calculations
  (hourly, flat, member-discounted) as swappable strategy objects,
  rather than an `if`/`elif` chain in `ParkingLot`.
- **Factory Method** (module 06) for spot allocation — different
  allocation policies (nearest-available, size-matched) as subclasses of
  an allocator, rather than hard-coded search logic.
- **Observer** (module 08) for a live occupancy display — a board
  subscribing to spot-assignment/vacate events, decoupled from
  `ParkingLot` itself.
- **Singleton** (module 06, caveat and all) — genuinely defensible here
  for exactly one thing: a single `ParkingLot` instance representing the
  one physical structure the whole program manages — not for anything
  else in this design.
- **Concurrency safety** (module 10) — if multiple gates can call
  `parkVehicle` simultaneously, `Level.findAvailable()` + `assign()`
  together form a critical section: two gates could both find the same
  "available" spot before either assigns it. That needs a lock scoped
  to exactly that check-then-assign sequence, encapsulated inside
  `Level`, per module 10's guidance.

### From diagram to code skeleton

The diagram translates directly into stub classes — this is the bridge
into module 12, where these stubs get real implementations, pricing,
and the full multi-vehicle-type design:

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Vehicle(ABC):
    def __init__(self, license_plate):
        self.license_plate = license_plate

class Car(Vehicle): pass
class Motorcycle(Vehicle): pass

class ParkingSpot:
    def __init__(self):
        self.vehicle = None

    def is_available(self):
        return self.vehicle is None

    def assign(self, vehicle: Vehicle):
        self.vehicle = vehicle

    def vacate(self):
        self.vehicle = None

class Level:
    def __init__(self):
        self.spots: list[ParkingSpot] = []

    def find_available(self):
        return next((s for s in self.spots if s.is_available()), None)

class ParkingLot:
    def __init__(self):
        self.levels: list[Level] = []

    def park_vehicle(self, vehicle: Vehicle):
        for level in self.levels:
            spot = level.find_available()
            if spot:
                spot.assign(vehicle)
                return spot            # a Ticket would wrap this, per the step-6 gap found above
        return None
```
{{tab C#}}
```csharp
public abstract class Vehicle {
    public string LicensePlate;
    protected Vehicle(string plate) { LicensePlate = plate; }
}

public class Car : Vehicle { public Car(string plate) : base(plate) { } }
public class Motorcycle : Vehicle { public Motorcycle(string plate) : base(plate) { } }

public class ParkingSpot {
    public Vehicle Vehicle;

    public bool IsAvailable() => Vehicle == null;
    public void Assign(Vehicle vehicle) => Vehicle = vehicle;
    public void Vacate() => Vehicle = null;
}

public class Level {
    public List<ParkingSpot> Spots = new List<ParkingSpot>();

    public ParkingSpot FindAvailable() => Spots.FirstOrDefault(s => s.IsAvailable());
}

public class ParkingLot {
    public List<Level> Levels = new List<Level>();

    public ParkingSpot ParkVehicle(Vehicle vehicle) {
        foreach (var level in Levels) {
            var spot = level.FindAvailable();
            if (spot != null) {
                spot.Assign(vehicle);
                return spot;            // a Ticket would wrap this, per the step-6 gap found above
            }
        }
        return null;
    }
}
```
{{/tabs}}

## Hands-on exercises

### 1. Clarifying questions, cold

Before reading ahead to module 12 or 13, write down five genuinely
useful clarifying questions for the prompt "design a library management
system" — don't answer them yourself yet, just practice generating
them. Compare against module 13's actual assumptions once you get there.

### 2. Noun extraction

Given this paragraph — *"A vending machine holds several products, each
with a price and a quantity. A customer selects a product by entering
its code, inserts money, and the machine dispenses the product and
returns change if needed. An operator can restock products and collect
the money."* — extract every candidate noun, then filter out the ones
that are really just attributes (not classes) and justify each cut in
one sentence.

### 3. Relationship classification

Given the filtered entity list from exercise 2 (roughly:
`VendingMachine`, `Product`, `Customer`, `Operator`, `Transaction`),
classify every pair's relationship (association, aggregation,
composition, inheritance/none) the way step 4 did for the parking lot.

### 4. Class diagram from a paragraph

Using this prompt — *"Build an online quiz system: a quiz has multiple
questions, each question has multiple choices with exactly one correct
choice; a user attempts a quiz, selecting one choice per question, and
receives a score"* — run steps 1–5 yourself: clarifying questions and
assumptions, actors/use cases, entities, relationships, and a first-draft
ASCII class diagram.

### 5. Sequence diagram for the gap-finder step

For the same quiz system, draw a sequence diagram for "User submits an
attempt." Does it reveal anything missing from your step-5 diagram
(similar to how the parking lot's walkthrough revealed the missing
`Ticket`)? Fix your diagram if so.

## Independent challenge

No code given — this module is entirely about process, not
implementation (that resumes fully in module 12).

**Task:** Given only the one-paragraph prompt *"Design a hotel
reservation system"*, run the complete seven-step method end to end,
writing out each step explicitly:

1. Clarifying questions and the assumptions you'll proceed with.
2. Actors and use cases.
3. Extracted entities (with at least two candidate nouns you
   deliberately rejected, and why).
4. Every entity relationship, classified.
5. A first-draft ASCII class diagram.
6. A sequence diagram for "Guest books a room" — and note any gap it
   reveals in your step-5 diagram, the way the parking lot walkthrough
   revealed the missing `Ticket`.
7. Two patterns from modules 06–10 you'd expect to use, and exactly
   where and why.

<details>
<summary>Hint</summary>

Expect your sequence diagram to reveal at least one missing piece —
that's the point of doing step 6 at all, not a sign you did step 5
wrong. A common one for this exact prompt: does "booking a room" need
to *hold* a room (reserve it pending payment) before payment succeeds?
If so, that's a state worth modeling explicitly (module 08's State
pattern is a legitimate candidate here, if a `Room`'s behavior genuinely
differs between "available," "held," and "booked" — versus module 03's
simpler enum-only transitions, if it's really just a validity check).

</details>

## Common mistakes & troubleshooting

- **Jumping straight to code on a vague prompt.** This is one of the
  most common ways a strong coder still loses an LLD round — the
  process itself (clarifying, then entities, then diagram) is what's
  being evaluated, not just whether the final code compiles.
- **Modeling every noun as a class.** Attributes (color, license plate,
  a price) are fields, not entities — over-modeling clutters the
  diagram and signals you haven't distinguished "has data" from "has
  its own identity and behavior."
- **Skipping non-functional requirements until it's too late.**
  Concurrency, scale, and consistency needs (module 10) change the
  design — discovering mid-interview that "actually, multiple gates run
  concurrently" after you've already designed with no locking in mind
  costs far more time than asking up front.
- **Treating the class diagram as final the moment it's drawn.** The
  sequence-diagram walkthrough (step 6) exists specifically to catch
  gaps — as it did for the missing `Ticket` above. Skipping this step,
  or refusing to revise step 5 after it reveals something, defeats the
  purpose of doing it iteratively.
- **Designing for every conceivable extension in the first draft.**
  Wanting to "future-proof" the very first diagram against every
  imaginable requirement is YAGNI (module 05) applied to the design
  *process* itself — start minimal for the stated requirements, and
  extend deliberately once a use case actually demands it.

## Checkpoint quiz

1. What's the difference between a functional and a non-functional
   requirement? Give one example of each for the parking lot prompt.
2. Why does the sequence-diagram step (6) come *after* drawing the
   class diagram (5), rather than replacing it?
3. Give one example of a noun from the parking lot prompt that was
   deliberately *not* turned into its own class, and explain why.
4. In the parking lot's step-6 sequence diagram, what specific gap did
   it reveal in the step-5 class diagram?
5. Why is Singleton defensible for `ParkingLot` itself but not
   necessarily for other entities in the same design?
6. What's wrong with trying to design for every possible future
   requirement in your very first class diagram?

<details>
<summary>Answers</summary>

1. Functional requirements describe what the system must *do* (e.g.,
   "a driver can park a vehicle and receive a ticket"). Non-functional
   requirements describe qualities the system must have (e.g., "the
   system must support multiple gates assigning spots concurrently
   without double-booking a spot").
2. Because a static class diagram alone doesn't reveal whether the
   classes and methods it defines actually support a *specific flow*
   end to end — walking through a real use case as a sequence diagram
   is what surfaces missing entities, methods, or return values that a
   box-and-line diagram can hide.
3. "License plate" (or "color") — it's a field/attribute of `Vehicle`,
   with no independent identity or behavior of its own, not a class.
4. It revealed that `ParkingLot.parkVehicle()` needs to return
   something to the `Driver` (a `Ticket`), which wasn't represented
   anywhere in the original step-5 diagram.
5. Because there's genuinely only one physical parking lot the whole
   program manages — a true one-of-a-kind resource, which is
   Singleton's legitimate use case (module 06). Other entities like
   `Level` or `ParkingSpot` have many instances by design; forcing them
   into a Singleton would make no sense and would just be reaching for
   a global, the exact misuse module 06 warned against.
6. It's speculative generality for requirements you don't actually have
   yet (YAGNI, module 05) — it burns limited interview time and often
   produces a more complex, harder-to-explain diagram than the
   requirements actually call for; extend the design deliberately once
   a real requirement demands it, not preemptively.

</details>

## Interview questions

1. **"Walk me through how you'd approach a low-level design problem you
   haven't seen before."**
   Clarify functional and non-functional requirements first and state
   any assumptions; identify actors and use cases; extract candidate
   entities from the requirements' nouns, filtering out plain
   attributes; classify every relationship using proper UML vocabulary
   (association/aggregation/composition/inheritance); draw a first-draft
   class diagram; walk through one or two key use cases as sequence
   diagrams to catch gaps; then discuss which established patterns and
   non-functional concerns (concurrency, extensibility) apply and why.
2. **"Why do you ask clarifying questions before designing, instead of
   just making reasonable assumptions and moving faster?"**
   Because the "reasonable" assumption is often wrong for the specific
   scale/constraints the interviewer actually has in mind (single vs.
   multi-level, single vs. concurrent gates), and discovering that
   mid-design costs far more time than asking up front — plus,
   articulating good clarifying questions is itself something
   interviewers are directly evaluating.
3. **"How do you decide whether something from the requirements should
   be its own class, versus just a field on another class?"**
   Ask whether it has its own identity, meaningful independent
   behavior, or its own set of related data worth encapsulating — if
   it's just a single value describing another entity (a color, a
   price, a license plate), it's a field/attribute, not a class.
4. **"What do you do if, partway through implementing, you realize your
   class diagram is missing something?"**
   Go back and fix the diagram — this is expected and normal, not a
   failure; the sequence-diagram walkthrough step exists specifically
   to surface exactly this kind of gap before you've written much code
   around a flawed shape.
5. **"How do non-functional requirements like concurrency change a
   class diagram, concretely?"**
   They don't usually add new classes, but they add real constraints on
   *where* locking or synchronization needs to live (module 10) — e.g.,
   recognizing that a "find available spot, then assign it" sequence is
   a critical section the moment multiple gates can run concurrently,
   and that the lock needs to be encapsulated inside the class owning
   that shared state, not left to callers to remember.

## Cumulative review

Closed-book. Pulls from modules 09–11.

1. (09 + 11) The parking lot's step-7 discussion suggested an Observer
   (module 09) for a live occupancy display. What exactly would the
   `ParkingLot`/`Level` need to do differently to support this, and
   what would it *not* need to know about the display?
2. (10 + 11) Why is "multiple gates operating concurrently" a
   non-functional requirement worth asking about in step 1, rather than
   something you can safely postpone until the code is written?
3. (09 + 11) If a `ParkingSpot`'s behavior needed to genuinely differ
   between "empty," "reserved," and "occupied" (not just validity of
   transitions), which module-08 pattern would be the natural fit, and
   why not just an enum?
4. (06 + 11) Which module-06 pattern fits "different spot allocation
   policies" (nearest-available vs. size-matched) most naturally, and
   why does it beat an `if`/`elif` chain inside `Level`?
5. (02 + 11) The step-4 relationship table classified
   `ParkingSpot --> Vehicle` as association, not composition. Explain
   why, referencing module 02's lifetime-ownership test.

<details>
<summary>Answers</summary>

1. `Level`/`ParkingSpot` would need to notify subscribed observers
   whenever a spot's occupied state changes (on `assign`/`vacate`) —
   they would *not* need to know anything about the display's internals
   (how it renders, what it does with the notification), only that
   something implementing a shared observer interface is listening.
2. Because it changes the actual design — a "find available spot, then
   assign it" sequence becomes a critical section requiring a lock
   (module 10) the moment two gates can run it simultaneously; deciding
   this after the code is already written means retrofitting locking
   into a design that wasn't shaped with it in mind, rather than
   encapsulating it correctly inside `Level` from the start.
3. The State pattern (module 08) — if each state genuinely triggers
   different *behavior* (not just "is this transition allowed"), a
   class-per-state design lets each state's object own its own logic.
   A plain enum (module 03) is simpler and sufficient only when the
   states are otherwise behaviorally identical and you only need a
   validity check between them.
4. Factory Method (module 06) — different allocation policies become
   subclasses overriding one factory method for "which spot to try
   next," while shared logic in the base allocator stays untouched;
   this satisfies OCP (module 04) the same way module 06's
   `DiscountPolicy` example did, versus an `if`/`elif` chain that must
   be edited for every new policy.
5. Composition would mean the `Vehicle` cannot exist independently of
   the `ParkingSpot` and is destroyed along with it — false here: the
   vehicle existed before parking and continues existing after leaving.
   Association is correct because the spot merely *references* whichever
   vehicle currently occupies it, with no shared lifetime.

</details>

## Further reading & sources

- [UML class diagram relationships reference](https://www.uml-diagrams.org/class-reference.html) - revisit module 02's reference; every relationship classified in this module uses this exact vocabulary.
- [UML sequence diagrams reference](https://www.uml-diagrams.org/sequence-diagrams-reference.html) - revisit module 02's reference for the sequence diagram notation used in step 6.
- [Martin Fowler: UML Distilled (concept overview)](https://martinfowler.com/books/uml.html) - a widely-recommended concise treatment of using UML pragmatically in real design work, not as a heavyweight formal process.

## Next

[12-parking-lot-and-elevator](../12-parking-lot-and-elevator/README.md)
— the first classic problem module: full guided solutions (requirements
→ class diagram → complete Python and C# implementation → tradeoffs) for
a real Parking Lot and an Elevator System, applying this module's process
for real, with nothing left as a partial sketch.
