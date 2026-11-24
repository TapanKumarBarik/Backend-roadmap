V1 = r'''import math
import time


class ParkingLot:
    FITS = {
        "motorcycle": ("small", "medium", "large"),
        "car": ("medium", "large"),
        "truck": ("large",),
    }

    def __init__(self, small, medium, large, clock=time.time):
        self._clock = clock
        self._free = {"small": small, "medium": medium, "large": large}
        self._tickets = {}
        self._plates = set()
        self._next = 1

    def available(self):
        return dict(self._free)

    def park(self, plate, kind):
        if kind not in self.FITS:
            raise ValueError("Unknown vehicle")
        if plate in self._plates:
            raise ValueError("Already parked")
        size = next((s for s in self.FITS[kind] if self._free[s] > 0), None)
        if size is None:
            raise ValueError("Lot full")
        self._free[size] -= 1
        self._plates.add(plate)
        ticket_id = self._next
        self._next += 1
        self._tickets[ticket_id] = (plate, size, self._clock())
        return ticket_id

    def unpark(self, ticket_id):
        if ticket_id not in self._tickets:
            raise ValueError("Unknown ticket")
        plate, size, started = self._tickets.pop(ticket_id)
        self._free[size] += 1
        self._plates.discard(plate)
        hours = max(1, math.ceil((self._clock() - started) / 3600))
        return hours * 200'''

V2 = r'''import math
import time


class HourlyPricing:
    DEFAULT_RATES = {"motorcycle": 100, "car": 200, "truck": 500}

    def __init__(self, rates=None):
        self.rates = dict(self.DEFAULT_RATES if rates is None else rates)

    def fee(self, kind, minutes):
        hours = max(1, math.ceil(minutes / 60))
        return hours * self.rates[kind]


class ParkingLot:
    FITS = {
        "motorcycle": ("small", "medium", "large"),
        "car": ("medium", "large"),
        "truck": ("large",),
    }

    def __init__(self, small, medium, large, clock=time.time, pricing=None):
        self._clock = clock
        self._pricing = HourlyPricing() if pricing is None else pricing
        self._free = {"small": small, "medium": medium, "large": large}
        self._tickets = {}
        self._plates = set()
        self._next = 1

    def available(self):
        return dict(self._free)

    def park(self, plate, kind):
        if kind not in self.FITS:
            raise ValueError("Unknown vehicle")
        if plate in self._plates:
            raise ValueError("Already parked")
        size = next((s for s in self.FITS[kind] if self._free[s] > 0), None)
        if size is None:
            raise ValueError("Lot full")
        self._free[size] -= 1
        self._plates.add(plate)
        ticket_id = self._next
        self._next += 1
        self._tickets[ticket_id] = (plate, kind, size, self._clock())
        return ticket_id

    def unpark(self, ticket_id):
        if ticket_id not in self._tickets:
            raise ValueError("Unknown ticket")
        plate, kind, size, started = self._tickets.pop(ticket_id)
        self._free[size] += 1
        self._plates.discard(plate)
        minutes = math.ceil((self._clock() - started) / 60)
        return self._pricing.fee(kind, minutes)'''

V3 = r'''import math
import time


class HourlyPricing:
    DEFAULT_RATES = {"motorcycle": 100, "car": 200, "truck": 500}

    def __init__(self, rates=None):
        self.rates = dict(self.DEFAULT_RATES if rates is None else rates)

    def fee(self, kind, minutes):
        hours = max(1, math.ceil(minutes / 60))
        return hours * self.rates[kind]


class ParkingLot:
    FITS = {
        "motorcycle": ("small", "medium", "large"),
        "car": ("medium", "large"),
        "truck": ("large",),
    }
    PREFIX = {"small": "S", "medium": "M", "large": "L"}

    def __init__(self, small, medium, large, clock=time.time, pricing=None, allocator=None):
        self._clock = clock
        self._pricing = HourlyPricing() if pricing is None else pricing
        self._allocator = allocator if allocator is not None else (lambda candidates: candidates[0])
        counts = {"small": small, "medium": medium, "large": large}
        self._spots = {size: [self.PREFIX[size] + str(i) for i in range(1, counts[size] + 1)] for size in counts}
        self._size_of = {spot: size for size, spots in self._spots.items() for spot in spots}
        self._taken = set()
        self._tickets = {}
        self._plates = set()
        self._next = 1

    def available(self):
        return {size: sum(1 for spot in spots if spot not in self._taken) for size, spots in self._spots.items()}

    def spot_of(self, ticket_id):
        if ticket_id not in self._tickets:
            raise ValueError("Unknown ticket")
        return self._tickets[ticket_id][2]

    def park(self, plate, kind):
        if kind not in self.FITS:
            raise ValueError("Unknown vehicle")
        if plate in self._plates:
            raise ValueError("Already parked")
        candidates = [spot for size in self.FITS[kind] for spot in self._spots[size] if spot not in self._taken]
        if not candidates:
            raise ValueError("Lot full")
        spot = self._allocator(list(candidates))
        if spot not in candidates:
            raise ValueError("Bad allocation")
        self._taken.add(spot)
        self._plates.add(plate)
        ticket_id = self._next
        self._next += 1
        self._tickets[ticket_id] = (plate, kind, spot, self._clock())
        return ticket_id

    def unpark(self, ticket_id):
        if ticket_id not in self._tickets:
            raise ValueError("Unknown ticket")
        plate, kind, spot, started = self._tickets.pop(ticket_id)
        self._taken.discard(spot)
        self._plates.discard(plate)
        minutes = math.ceil((self._clock() - started) / 60)
        return self._pricing.fee(kind, minutes)'''

PROBLEMS = [
P(
    slug='lld-parking-lot-1', title='Parking Lot, Step 1: Spots and Fees', topic='lld-change-requests', difficulty='intermediate',
    module='lld/12-parking-lot-and-elevator/README.md',
    description='Step 1 of 3: build a parking lot that fits vehicles into spots and charges by the hour, with a clock you can control.',
    statement=r'''This is **step 1 of 3** on one parking lot. In step 2 and step 3 the owner asks for changes, and the code you write here is what changes.

Write a class `ParkingLot` for a lot with three sizes of spot.

**Creating one:** `ParkingLot(small, medium, large, clock=time.time)`, where the first three numbers are how many spots of each size the lot has. `clock` is a function that returns the current time **in seconds**. Tests pass in a fake clock, so use `clock()` everywhere you need the time, never `time.time()` directly.

**Vehicles** are named by a kind, and each kind fits certain sizes:

| kind | fits |
|---|---|
| `"motorcycle"` | small, medium or large |
| `"car"` | medium or large |
| `"truck"` | large only |

A vehicle takes the **smallest** size that fits and has a free spot.

**Methods**

- `park(plate, kind)` parks the vehicle and returns a **ticket id**: `1, 2, 3, ...` in the order of **successful** parks (a failed attempt does not use up an id). Raise `ValueError` with exactly this message, checking in this order, and change nothing:
  1. `"Unknown vehicle"`: the kind is not in the table;
  2. `"Already parked"`: this plate is already in the lot;
  3. `"Lot full"`: no spot that fits is free.
- `unpark(ticket_id)` removes the vehicle, frees its spot (and its plate, which may park again) and returns the **fee in cents**: **200 cents for each hour started, and at least one hour**. Parking for 0 seconds, 1 second or exactly 3600 seconds costs 200; 3601 seconds costs 400. An unknown or already used ticket raises `ValueError("Unknown ticket")`.
- `available()` returns how many spots are free, as `{"small": n, "medium": n, "large": n}`. It is a **new dictionary on every call**: changing the one you got must not change the lot.

**Example**

```
lot = ParkingLot(1, 1, 1, clock=my_clock)
lot.park("KA-01", "motorcycle")     # 1   takes the small spot
lot.park("KA-02", "motorcycle")     # 2   small is taken, so medium
lot.park("KA-03", "car")            # 3   medium is taken, so large
lot.available()                     # {"small": 0, "medium": 0, "large": 0}
```''',
    starter=r'''import math
import time


class ParkingLot:
    def __init__(self, small, medium, large, clock=time.time):
        """`clock()` returns the time in seconds."""
        ...

    def available(self):
        """Free spots: {"small": n, "medium": n, "large": n}."""
        ...

    def park(self, plate, kind):
        """Park the vehicle in the smallest free spot that fits; return the ticket id."""
        ...

    def unpark(self, ticket_id):
        """Free the spot and return the fee in cents."""
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Clock:
    def __init__(self):
        self.now = 0
    def __call__(self):
        return self.now
clock = Clock()
lot = ParkingLot(1, 1, 1, clock=clock)
assert lot.available() == {"small": 1, "medium": 1, "large": 1}
snapshot = lot.available()
snapshot["small"] = 99
assert lot.available()["small"] == 1
assert lot.park("M-1", "motorcycle") == 1
assert lot.available() == {"small": 0, "medium": 1, "large": 1}
assert lot.park("M-2", "motorcycle") == 2
assert lot.available() == {"small": 0, "medium": 0, "large": 1}
assert lot.park("C-1", "car") == 3
assert lot.available() == {"small": 0, "medium": 0, "large": 0}
assert error_of(lot.park, "M-3", "motorcycle") == "ValueError: Lot full"
assert error_of(lot.park, "M-1", "motorcycle") == "ValueError: Already parked"
assert error_of(lot.park, "B-1", "bus") == "ValueError: Unknown vehicle"
assert lot.available() == {"small": 0, "medium": 0, "large": 0}
clock.now = 1800
assert lot.unpark(3) == 200
assert lot.available() == {"small": 0, "medium": 0, "large": 1}
assert lot.park("T-1", "truck") == 4
assert error_of(lot.park, "T-2", "truck") == "ValueError: Lot full"
assert error_of(lot.unpark, 3) == "ValueError: Unknown ticket"
assert error_of(lot.unpark, 99) == "ValueError: Unknown ticket"
assert lot.unpark(1) == 200
assert lot.park("M-1", "motorcycle") == 5
assert error_of(ParkingLot(3, 0, 0).park, "C-9", "car") == "ValueError: Lot full"
assert error_of(ParkingLot(3, 3, 0).park, "T-9", "truck") == "ValueError: Lot full"
fees = ParkingLot(5, 5, 5, clock=clock)
def fee_after(seconds):
    clock.now = 10000
    ticket = fees.park("F-1", "car")
    clock.now = 10000 + seconds
    return fees.unpark(ticket)
assert [fee_after(s) for s in (0, 1, 1800, 3600, 3601, 7200, 7201)] == [200, 200, 200, 200, 400, 400, 600]
assert fees.available() == {"small": 5, "medium": 5, "large": 5}
real = ParkingLot(1, 0, 0)
assert real.unpark(real.park("R-1", "motorcycle")) == 200
many = ParkingLot(200, 200, 200, clock=clock)
tickets = [many.park("P-%d" % i, "motorcycle") for i in range(600)]
assert tickets == list(range(1, 601))
assert many.available() == {"small": 0, "medium": 0, "large": 0}''',
    solution=V1,
    hints=[
        r'''Keep a count of free spots for each size, and a dictionary from ticket id to what you need later: the plate, the size taken and the time it arrived (from `clock()`).''',
        r'''To pick the spot, walk the sizes a vehicle fits **in order from smallest** and take the first with a free spot. Write the table of what fits what as data (a dictionary), not as a chain of `if`s: step 2 and step 3 will be easier.''',
        r'''Hours started is `ceil(seconds / 3600)`, with a minimum of 1. Check your three refusals in the order the statement gives, and only change anything after all three have passed.''',
    ],
    explanation=r'''**The idea.** There is no clever algorithm here: the work is modelling. A lot has spots of three sizes, vehicles of three kinds, a ticket per parked vehicle, and a fee. The solution keeps exactly that and nothing more.

```mermaid
classDiagram
    class ParkingLot {
        +park()
        +unpark()
        +available()
    }
    class Ticket {
        plate
        size
        started
    }
    ParkingLot "1" o-- "*" Ticket
```

**Two decisions worth saying out loud.**

- **The clock is an argument.** `ParkingLot(..., clock=time.time)` instead of calling `time.time()` inside. That one parameter is what makes fees testable at all: the tests move a fake clock to exactly 3600 or 3601 seconds. This is *dependency injection* in its smallest form, and it is the first thing interviewers look for when they ask "how would you test this?".
- **What fits what is data.** `FITS` is a dictionary from kind to sizes in preference order. The park logic is one loop over it. If the table were a nest of `if kind == "car"` branches, adding a vehicle kind would mean editing the algorithm.

**Validate, then change.** The three refusals happen before any counter moves, in a fixed order, so a refused `park` leaves the lot exactly as it was.

**Complexity.** All operations are O(1) (a few dictionary and set operations).

**What comes next.** The fee is the weakest part of this design: 200 cents is written into `unpark`. Step 2 is about to ask for different prices per vehicle, and you will see why hard-coding it was the problem.''',
),

P(
    slug='lld-parking-lot-2', title='Parking Lot, Step 2: Swap the Pricing', topic='lld-change-requests', difficulty='intermediate',
    module='lld/12-parking-lot-and-elevator/README.md',
    description='Step 2 of 3: the owner wants prices per vehicle and the freedom to change the rules; pull pricing out of the lot.',
    statement=r'''This is **step 2 of 3**. The editor already holds a working step 1; change it. Every rule of step 1 still holds (kinds and sizes, the refusals and their order, ticket ids, `available()`, the injected `clock`) **except how the fee is worked out**.

**The change request.** The owner wants

1. a different price for each kind of vehicle, and
2. to change how fees work (flat day rate, a surcharge, happy hour) **without anyone editing `ParkingLot`**.

**A pricing** is any object with a method `fee(kind, minutes)` that returns the fee in cents. `minutes` is the time parked, in **whole minutes, rounded up**: 0 seconds is `0`, 1 second is `1`, 3600 seconds is `60`, 3601 seconds is `61`.

**What to write**

- `ParkingLot(small, medium, large, clock=time.time, pricing=None)`: `unpark` returns `pricing.fee(kind, minutes)` for the kind of the vehicle that is leaving. It calls `fee` **exactly once per `unpark`** and never in `park`. `pricing=None` means `HourlyPricing()`.
- `HourlyPricing(rates=None)` with `fee(kind, minutes)`: the fee is the rate for that kind **times the hours started** (`ceil(minutes / 60)`), with a minimum of one hour. `rates` maps a kind to cents per hour; the default is `{"motorcycle": 100, "car": 200, "truck": 500}`.

**The tests plug in pricing classes you have never seen**, including one that wraps an `HourlyPricing` and adds to its fee. `ParkingLot` must work through `fee(kind, minutes)` alone.

**Example**

```
class DayRate:
    def fee(self, kind, minutes):
        return 1500

lot = ParkingLot(1, 1, 1, clock=my_clock, pricing=DayRate())
lot.unpark(lot.park("KA-01", "car"))     # 1500, whatever the time
```''',
    starter=V1,
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Clock:
    def __init__(self):
        self.now = 0
    def __call__(self):
        return self.now
clock = Clock()
lot = ParkingLot(1, 1, 1, clock=clock)
assert (lot.park("M-1", "motorcycle"), lot.park("M-2", "motorcycle"), lot.park("C-1", "car")) == (1, 2, 3)
assert lot.available() == {"small": 0, "medium": 0, "large": 0}
snapshot = lot.available()
snapshot["large"] = 99
assert lot.available()["large"] == 0
assert error_of(lot.park, "M-3", "motorcycle") == "ValueError: Lot full"
assert error_of(lot.park, "M-1", "motorcycle") == "ValueError: Already parked"
assert error_of(lot.park, "B-1", "bus") == "ValueError: Unknown vehicle"
clock.now = 1800
assert lot.unpark(3) == 200
assert error_of(lot.unpark, 3) == "ValueError: Unknown ticket"
assert lot.unpark(1) == 100
assert lot.park("T-1", "truck") == 4
clock.now = 1800 + 3601
assert lot.unpark(4) == 1000
fees = ParkingLot(5, 5, 5, clock=clock)
def fee_after(kind, seconds):
    clock.now = 10000
    ticket = fees.park("F-1", kind)
    clock.now = 10000 + seconds
    return fees.unpark(ticket)
assert [fee_after("car", s) for s in (0, 1, 3600, 3601, 7200, 7201)] == [200, 200, 200, 400, 400, 600]
assert [fee_after("motorcycle", s) for s in (0, 3601)] == [100, 200]
assert [fee_after("truck", s) for s in (0, 3601)] == [500, 1000]
rates = {"car": 300, "motorcycle": 50, "truck": 900}
custom = HourlyPricing(rates)
assert [custom.fee("car", m) for m in (0, 1, 60, 61, 120, 121)] == [300, 300, 300, 600, 600, 900]
assert (custom.fee("motorcycle", 61), custom.fee("truck", 60)) == (100, 900)
assert HourlyPricing().fee("truck", 61) == 1000
rates["car"] = 1
assert custom.fee("car", 1) == 300
priced = ParkingLot(2, 2, 2, clock=clock, pricing=HourlyPricing(rates))
clock.now = 0
ticket = priced.park("P-1", "car")
clock.now = 60 * 61
assert priced.unpark(ticket) == 2
class DayRate:
    def fee(self, kind, minutes):
        return 1500
flat = ParkingLot(1, 1, 1, clock=clock, pricing=DayRate())
clock.now = 0
assert flat.unpark(flat.park("D-1", "truck")) == 1500
class Spy:
    def __init__(self):
        self.calls = []
    def fee(self, kind, minutes):
        self.calls.append((kind, minutes))
        return 7
spy = Spy()
watched = ParkingLot(2, 2, 2, clock=clock, pricing=spy)
clock.now = 100
car = watched.park("S-1", "car")
bike = watched.park("S-2", "motorcycle")
assert spy.calls == []
clock.now = 100 + 3601
assert watched.unpark(car) == 7
clock.now = 100 + 3601
assert watched.unpark(bike) == 7
assert spy.calls == [("car", 61), ("motorcycle", 61)]
assert error_of(watched.unpark, car) == "ValueError: Unknown ticket"
assert len(spy.calls) == 2
clock.now = 5000
quick = watched.park("S-3", "truck")
assert watched.unpark(quick) == 7
assert spy.calls[-1] == ("truck", 0)
class WithSurcharge:
    def __init__(self, base, extra):
        self.base = base
        self.extra = extra
    def fee(self, kind, minutes):
        return self.base.fee(kind, minutes) + self.extra
wrapped = ParkingLot(1, 1, 1, clock=clock, pricing=WithSurcharge(HourlyPricing(), 75))
clock.now = 0
ticket = wrapped.park("W-1", "car")
clock.now = 3601
assert wrapped.unpark(ticket) == 475
real = ParkingLot(1, 0, 0)
assert real.unpark(real.park("R-1", "motorcycle")) == 100''',
    solution=V2,
    hints=[
        r'''The fee is a rule about *money*, not about *parking*. Move it out of `ParkingLot` into its own small class with one method, `fee(kind, minutes)`, and have `unpark` ask it. That class is the "pricing" the owner wants to swap.''',
        r'''`ParkingLot` needs the vehicle's **kind** when it leaves, so remember it in the ticket (step 1 only stored the size). Work out whole minutes rounded up with `math.ceil(seconds / 60)` and hand them over.''',
        r'''Default to `HourlyPricing()` when no pricing is given, and make sure `park` never calls the pricing: the tests check that it is called once per `unpark`, with the right kind and minutes.''',
    ],
    explanation=r'''**What changed, and why it hurt.** In step 1 the fee was `hours * 200` inside `unpark`. A per-vehicle price list would have meant editing `unpark`, and so would a flat day rate, and so would a happy-hour discount. A class that has to be reopened for every new business rule violates the **Open/Closed principle**, and a class that does parking *and* pricing violates the **Single Responsibility principle**. Both are the same smell seen from two sides.

**The fix is the same move as the discounts problem.** Pull the changing part out behind a one-method interface and let the caller choose it (**Strategy**). `ParkingLot` now knows only "a pricing has `fee(kind, minutes)`".

```mermaid
classDiagram
    class ParkingLot {
        +park()
        +unpark()
    }
    class Pricing {
        <<interface>>
        +fee()
    }
    ParkingLot --> Pricing : asks once per unpark
    Pricing <|.. HourlyPricing
    Pricing <|.. DayRate
    Pricing <|.. WithSurcharge
    WithSurcharge o-- Pricing : wraps
```

**Decorating pricing.** The `WithSurcharge` test wraps one pricing in another and still looks like a pricing to the lot. That is the **Decorator** pattern, and it only works because the lot depends on the interface and not on `HourlyPricing`.

**What you hand over matters.** The lot gives pricing `kind` and `minutes`: the smallest facts a price could depend on. It does not hand over the lot, the plate, or the ticket. The narrower the interface, the more kinds of pricing can implement it, and the fewer things a pricing can break.

**Keeping step 1 working.** The first dozen tests are step 1's, with the new default rates. Changing a design under existing tests is the real skill here: the old behaviour (ids, refusals, availability) must not move.

**Complexity.** Unchanged: O(1) per operation.

**What comes next.** Pricing is now swappable, but *where a vehicle parks* is still decided inside `park`. Step 3 changes that.''',
),

P(
    slug='lld-parking-lot-3', title='Parking Lot, Step 3: Choose the Spot', topic='lld-change-requests', difficulty='advanced',
    module='lld/12-parking-lot-and-elevator/README.md',
    description='Step 3 of 3: name the individual spots, report where a vehicle is, and let the owner plug in how a spot is chosen.',
    statement=r'''This is **step 3 of 3**. The editor holds a working step 2; change it. Every rule of step 2 still holds (kinds, refusals and their order, ticket ids, `available()`, the injected `clock`, and `pricing` with `HourlyPricing` as the default).

**The change request.** The owner wants to know *which spot* each vehicle is in, and wants to change the rule for choosing a spot (nearest the exit, spread out, keep the large ones for trucks) without editing `ParkingLot`.

**Spots have names.** The small spots are `"S1"`, `"S2"`, ... the medium ones `"M1"`, `"M2"`, ... and the large ones `"L1"`, `"L2"`, ... numbered from 1 in each size.

**An allocator** is any function `allocator(candidates)` that returns the name of the spot to use. `candidates` is a list of the spots that are **free and fit the vehicle**, ordered **smallest size first, then by number**: for a car in a fresh lot with 2 medium and 1 large spot it is `["M1", "M2", "L1"]`.

**What to write**

- `ParkingLot(small, medium, large, clock=time.time, pricing=None, allocator=None)`. With `allocator=None` the lot takes the **first** candidate (which is the step 2 behaviour, now with a named spot).
- `park(plate, kind)` works out the candidates, and:
  - if there are none, raises `ValueError("Lot full")` (the allocator is **not** called);
  - otherwise calls `allocator(candidates)` and parks the vehicle in the spot it returns. If the allocator returns a name that is **not in the candidates**, raise `ValueError("Bad allocation")` and change **nothing**: no spot taken, no ticket id used, the plate not recorded.
  - The existing refusals keep their order: `"Unknown vehicle"`, then `"Already parked"`, then the above.
- `spot_of(ticket_id)` returns the spot name of a vehicle that is parked, or raises `ValueError("Unknown ticket")`.
- `unpark` frees that particular spot, so it appears among the candidates of the next vehicle.

**The tests plug in allocators you have never seen**, including one that records what it was given.

**Example**

```
lot = ParkingLot(1, 2, 1, clock=my_clock)
t = lot.park("KA-01", "car")
lot.spot_of(t)                    # "M1"

last = ParkingLot(1, 2, 1, clock=my_clock, allocator=lambda c: c[-1])
last.spot_of(last.park("KA-02", "car"))     # "L1"   candidates were ["M1", "M2", "L1"]
```''',
    starter=V2,
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Clock:
    def __init__(self):
        self.now = 0
    def __call__(self):
        return self.now
clock = Clock()
lot = ParkingLot(2, 2, 1, clock=clock)
bikes = [lot.park("B-%d" % i, "motorcycle") for i in range(5)]
assert bikes == [1, 2, 3, 4, 5]
assert [lot.spot_of(t) for t in bikes] == ["S1", "S2", "M1", "M2", "L1"]
assert lot.available() == {"small": 0, "medium": 0, "large": 0}
snapshot = lot.available()
snapshot["large"] = 99
assert lot.available()["large"] == 0
assert error_of(lot.park, "B-9", "motorcycle") == "ValueError: Lot full"
assert error_of(lot.park, "B-0", "motorcycle") == "ValueError: Already parked"
assert error_of(lot.park, "B-9", "bus") == "ValueError: Unknown vehicle"
assert error_of(lot.spot_of, 99) == "ValueError: Unknown ticket"
clock.now = 1800
assert lot.unpark(bikes[0]) == 100
assert error_of(lot.spot_of, bikes[0]) == "ValueError: Unknown ticket"
assert lot.available() == {"small": 1, "medium": 0, "large": 0}
assert lot.spot_of(lot.park("B-9", "motorcycle")) == "S1"
assert lot.unpark(bikes[3]) == 100
assert lot.spot_of(lot.park("C-1", "car")) == "M2"
assert lot.unpark(bikes[2]) == 100
assert lot.unpark(bikes[4]) == 100
assert lot.spot_of(lot.park("C-2", "car")) == "M1"
assert lot.spot_of(lot.park("C-3", "car")) == "L1"
assert error_of(lot.park, "T-1", "truck") == "ValueError: Lot full"
last = ParkingLot(1, 2, 1, clock=clock, allocator=lambda candidates: candidates[-1])
assert last.spot_of(last.park("X-1", "car")) == "L1"
assert last.spot_of(last.park("X-2", "car")) == "M2"
assert last.spot_of(last.park("X-3", "car")) == "M1"
assert last.spot_of(last.park("X-4", "motorcycle")) == "S1"
class Spy:
    def __init__(self):
        self.calls = []
    def __call__(self, candidates):
        self.calls.append(list(candidates))
        return candidates[0]
spy = Spy()
watched = ParkingLot(1, 1, 1, clock=clock, allocator=spy)
a = watched.park("W-1", "motorcycle")
b = watched.park("W-2", "truck")
c = watched.park("W-3", "car")
assert spy.calls == [["S1", "M1", "L1"], ["L1"], ["M1"]]
assert error_of(watched.park, "W-4", "motorcycle") == "ValueError: Lot full"
assert len(spy.calls) == 3
watched.unpark(a)
d = watched.park("W-5", "motorcycle")
assert spy.calls[-1] == ["S1"]
assert watched.spot_of(d) == "S1"
class Toggle:
    def __init__(self):
        self.answers = ["X9", "M1"]
    def __call__(self, candidates):
        return self.answers.pop(0)
tog = ParkingLot(0, 1, 0, clock=clock, allocator=Toggle())
assert error_of(tog.park, "G-1", "car") == "ValueError: Bad allocation"
assert tog.available() == {"small": 0, "medium": 1, "large": 0}
assert tog.park("G-1", "car") == 1
assert tog.spot_of(1) == "M1"
taken = ParkingLot(1, 1, 0, clock=clock, allocator=lambda candidates: "M1")
taken.park("Y-1", "car")
assert error_of(taken.park, "Y-2", "motorcycle") == "ValueError: Bad allocation"
assert taken.available() == {"small": 1, "medium": 0, "large": 0}
priced = ParkingLot(1, 1, 1, clock=clock)
clock.now = 0
ticket = priced.park("Q-1", "car")
clock.now = 3601
assert priced.unpark(ticket) == 400
class DayRate:
    def fee(self, kind, minutes):
        return 1500
flat = ParkingLot(1, 1, 1, clock=clock, pricing=DayRate(), allocator=lambda candidates: candidates[-1])
assert flat.unpark(flat.park("Z-1", "motorcycle")) == 1500
big = ParkingLot(300, 300, 300, clock=clock)
spots = [big.spot_of(big.park("P-%d" % i, "motorcycle")) for i in range(900)]
assert spots[0] == "S1" and spots[299] == "S300" and spots[300] == "M1" and spots[899] == "L300"
assert len(set(spots)) == 900''',
    solution=V3,
    hints=[
        r'''Give every spot a name when the lot is built (`"S1"` ... `"M1"` ... `"L1"` ...) and keep the set of **taken** names. A spot is free when its name is not in that set; `available()` just counts the free ones per size.''',
        r'''In `park`, build the list of candidates first (the free spots that fit, smallest size first, then by number). Hand `allocator` a **copy** of that list, then check that what it returns is really one of the candidates before you change anything.''',
        r'''The default allocator is just "take the first candidate", so it is a one-line function you pass in your own constructor, not a special case inside `park`. Keep the order of your checks: unknown vehicle, already parked, lot full, then the allocator.''',
    ],
    explanation=r'''**What changed.** Step 2 stopped `ParkingLot` from deciding *the price*. Step 3 stops it from deciding *the spot*. It is the same refactor a third time, which is the point of the ladder: once you see the pattern ("the part that varies goes behind a one-method interface; the caller chooses it") you apply it in minutes.

```mermaid
classDiagram
    class ParkingLot {
        +park()
        +unpark()
        +spot_of()
        +available()
    }
    class Pricing {
        <<interface>>
        +fee()
    }
    class Allocator {
        <<interface>>
        +call() spot
    }
    ParkingLot --> Pricing
    ParkingLot --> Allocator
```

**The interesting design choice is what the allocator receives.** It is given a **list of the spots that are free and fit**, not the lot. That has three consequences, and they are the whole lesson:

1. The allocator cannot return a spot that does not fit, *unless it ignores its input*, so the lot still verifies the answer (`"Bad allocation"`) rather than trusting a plug-in.
2. The allocator never needs to know about sizes, plates or tickets, so a new rule (nearest the exit, spread the load, reserve large spots for trucks) is a few lines that only look at names.
3. The lot passes a **copy**, so an allocator that reorders or empties its list cannot damage the lot's own bookkeeping. Trust is a design decision: hand out the least you can.

**Failing safely.** `park` checks the allocator's answer *before* it touches the taken set, the plate set or the ticket counter. A bad allocation therefore leaves the lot exactly as it was and uses no ticket id. When an operation can fail halfway, order it so that every check comes before the first change.

**Why the order of candidates is part of the interface.** The default behaviour ("first candidate") equals step 2's "smallest size that fits, then lowest number" only because the candidates are ordered that way. A documented order is a contract; an undocumented one is a bug waiting for someone to depend on it.

**Complexity.** `park` is O(spots) because it builds the candidate list; `unpark` and `spot_of` are O(1). A lot with thousands of spots would keep a free list per size instead, at the cost of making the allocator's interface harder to explain.

**Looking back at the ladder.** Step 1 was a model, step 2 pulled out pricing, step 3 pulled out allocation. A fourth request (reservations, multiple floors, EV chargers) would, with this shape, be a new class and a constructor argument. That is what "designed for change" looks like from the outside.''',
),
]
