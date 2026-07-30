# Module 17: Ride-Sharing

## Why this matters

This module continues module 16's lesson that concurrency-safety is
core, not an extension — but makes a different lock-granularity call,
on purpose. Movie seats partition cleanly: each show's seats are
independent, so module 16 gave every `Show` its own lock. A driver
fleet doesn't partition that way by default — every ride request in
the system contends over the *same* pool of drivers, so this module
uses a single lock over the whole fleet. Seeing both choices, each
justified by the actual shape of the shared resource, is the point:
lock granularity is a design decision made from the problem, not a
rule ("always use one big lock" or "always shard") applied by habit.

## Requirements

**Functional**: a rider requests a ride from a pickup location to a
destination; the system matches the request to the best available
driver (nearest, by default) and marks that driver unavailable; on
completion, fare is computed from trip distance and the driver becomes
available again at the destination; a ride can be cancelled while still
requested or accepted, freeing its driver if one was assigned.

**Non-functional**: driver matching must be correct under many
concurrent ride requests — two riders must never end up matched to the
same driver; the matching rule (nearest, highest-rated, cheapest ETA)
must be swappable without touching `RideManager`'s core flow (DIP,
module 04; Strategy, module 08).

**Assumptions stated up front** (module 11, step 1): a driver serves
exactly one ride at a time — no ride pooling; fare is a simple
distance × rate calculation, no surge pricing or time component; ride
status is a plain enum with guard checks, not a full State-pattern
hierarchy — module 13 already made this exact call for `BookStatus`,
and the same reasoning applies: few, simple transitions don't justify
the ceremony.

## Entities and relationships

Applying module 11's steps 3–4: `RideManager o-- Driver` (aggregation —
manages the fleet, many drivers); `RideManager --> Ride` (creates, one
per successful `requestRide` call); `Ride --> Driver`, `Ride --> Rider`
(association); `Driver --> Location`, `Ride --> Location` for pickup and
destination (association); `NearestDriverStrategy ..|>
DriverMatchingStrategy` (realizes — Strategy, module 08, injected per
call — DIP, module 04).

## Class diagram

```
┌──────────────────┐      ┌───────────────┐
│   RideManager    │ o──  │     Driver    │
├──────────────────┤      ├───────────────┤
│ - drivers        │      │ - location    │
│ - nextId         │      │ - isAvailable │
├──────────────────┤      └───────────────┘
│ + requestRide()  │
│ + completeRide() │
│ + cancelRide()   │
└──────────────────┘

RideManager --> Ride   (creates one per successful requestRide() call)
Ride --> Driver, Ride --> Rider   (association)
Driver --> Location, Ride --> Location (pickup/destination)   (association)

┌───────────────────────┐
│          Ride         │
├───────────────────────┤
│ - rider, driver       │
│ - pickup, destination │
│ - status              │
│ - fare                │
└───────────────────────┘

┌────────┐        ┌────────────────┐
│ Rider  │        │    Location    │
├────────┤        ├────────────────┤
│ - name │        │ - x, y         │
└────────┘        ├────────────────┤
                   │ + distanceTo() │
                   └────────────────┘

DriverMatchingStrategy (interface) <── NearestDriverStrategy   (Strategy, module 08)
```

## Implementation

Notice the lock in `request_ride`/`RequestRide` wraps only "find an
available driver, mark it unavailable" — not the `Ride` object's
construction afterward. That data isn't shared until the method
returns it to the caller, so locking it too would only add contention
without adding safety (module 10: keep critical sections minimal).

{{tabs}}
{{tab Python}}
```python
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum, auto

@dataclass(frozen=True)                        # value object, module 03
class Location:
    x: float
    y: float

    def distance_to(self, other: "Location") -> float:
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5

class Driver:
    def __init__(self, driver_id: str, name: str, location: Location):
        self.driver_id = driver_id
        self.name = name
        self.location = location
        self.is_available = True

class Rider:
    def __init__(self, rider_id: str, name: str):
        self.rider_id = rider_id
        self.name = name

class DriverMatchingStrategy(ABC):              # Strategy, module 08
    @abstractmethod
    def match(self, available_drivers: list[Driver], pickup: Location) -> "Driver | None": ...

class NearestDriverStrategy(DriverMatchingStrategy):
    def match(self, available_drivers, pickup):
        if not available_drivers:
            return None
        return min(available_drivers, key=lambda d: d.location.distance_to(pickup))

class RideStatus(Enum):
    REQUESTED = auto()
    ACCEPTED = auto()
    IN_PROGRESS = auto()
    COMPLETED = auto()
    CANCELLED = auto()

class Ride:
    def __init__(self, ride_id: str, rider: Rider, pickup: Location, destination: Location):
        self.ride_id = ride_id
        self.rider = rider
        self.pickup = pickup
        self.destination = destination
        self.driver: "Driver | None" = None
        self.status = RideStatus.REQUESTED
        self.fare: "float | None" = None

class RideManager:
    RATE_PER_UNIT_DISTANCE = 5.0

    def __init__(self, drivers: list[Driver]):
        self.drivers = drivers
        self._next_id = 1
        self._lock = threading.Lock()           # one lock for the whole fleet — drivers are a genuinely shared pool

    def request_ride(self, rider: Rider, pickup: Location, destination: Location,
                      strategy: DriverMatchingStrategy) -> "Ride | None":
        with self._lock:                         # critical section: check-then-assign over the shared driver pool
            available = [d for d in self.drivers if d.is_available]
            matched = strategy.match(available, pickup)
            if matched is None:
                return None
            matched.is_available = False

        ride = Ride(f"R{self._next_id}", rider, pickup, destination)
        self._next_id += 1
        ride.driver = matched
        ride.status = RideStatus.ACCEPTED
        return ride

    def complete_ride(self, ride: Ride) -> float:
        if ride.status != RideStatus.ACCEPTED and ride.status != RideStatus.IN_PROGRESS:
            raise ValueError(f"Cannot complete a ride in status {ride.status}")
        distance = ride.pickup.distance_to(ride.destination)
        ride.fare = round(distance * self.RATE_PER_UNIT_DISTANCE, 2)
        ride.status = RideStatus.COMPLETED
        with self._lock:
            ride.driver.is_available = True
            ride.driver.location = ride.destination
        return ride.fare

    def cancel_ride(self, ride: Ride):
        if ride.status not in (RideStatus.REQUESTED, RideStatus.ACCEPTED):
            raise ValueError(f"Cannot cancel a ride in status {ride.status}")
        ride.status = RideStatus.CANCELLED
        if ride.driver is not None:
            with self._lock:
                ride.driver.is_available = True

# usage
drivers = [Driver("D1", "Sam", Location(0, 0)), Driver("D2", "Ana", Location(10, 10))]
manager = RideManager(drivers)
rider = Rider("U1", "Priya")

ride = manager.request_ride(rider, Location(1, 1), Location(5, 5), NearestDriverStrategy())
print(f"Matched driver: {ride.driver.name if ride else None}")     # Sam — closer to pickup (1,1)

fare = manager.complete_ride(ride)
print(f"Fare: {fare}, driver available again: {drivers[0].is_available}")
```
{{tab C#}}
```csharp
public readonly struct Location : IEquatable<Location> {   // value object, module 03
    public readonly double X, Y;
    public Location(double x, double y) { X = x; Y = y; }
    public double DistanceTo(Location other) => Math.Sqrt(Math.Pow(X - other.X, 2) + Math.Pow(Y - other.Y, 2));
    public bool Equals(Location other) => X == other.X && Y == other.Y;
    public override bool Equals(object obj) => obj is Location l && Equals(l);
    public override int GetHashCode() => HashCode.Combine(X, Y);
}

public class Driver {
    public string DriverId, Name; public Location Location; public bool IsAvailable = true;
    public Driver(string driverId, string name, Location location) { DriverId = driverId; Name = name; Location = location; }
}

public class Rider {
    public string RiderId, Name;
    public Rider(string riderId, string name) { RiderId = riderId; Name = name; }
}

public interface IDriverMatchingStrategy {                  // Strategy, module 08
    Driver Match(List<Driver> availableDrivers, Location pickup);
}

public class NearestDriverStrategy : IDriverMatchingStrategy {
    public Driver Match(List<Driver> availableDrivers, Location pickup) {
        if (availableDrivers.Count == 0) return null;
        return availableDrivers.OrderBy(d => d.Location.DistanceTo(pickup)).First();
    }
}

public enum RideStatus { Requested, Accepted, InProgress, Completed, Cancelled }

public class Ride {
    public string RideId; public Rider Rider; public Location Pickup, Destination;
    public Driver Driver; public RideStatus Status = RideStatus.Requested; public double? Fare;

    public Ride(string rideId, Rider rider, Location pickup, Location destination) {
        RideId = rideId; Rider = rider; Pickup = pickup; Destination = destination;
    }
}

public class RideManager {
    private const double RatePerUnitDistance = 5.0;
    public List<Driver> Drivers;
    private int _nextId = 1;
    private readonly object _lock = new object();            // one lock for the whole fleet — drivers are a genuinely shared pool

    public RideManager(List<Driver> drivers) { Drivers = drivers; }

    public Ride RequestRide(Rider rider, Location pickup, Location destination, IDriverMatchingStrategy strategy) {
        Driver matched;
        lock (_lock) {                                        // critical section: check-then-assign over the shared driver pool
            var available = Drivers.Where(d => d.IsAvailable).ToList();
            matched = strategy.Match(available, pickup);
            if (matched == null) return null;
            matched.IsAvailable = false;
        }

        var ride = new Ride($"R{_nextId}", rider, pickup, destination);
        _nextId++;
        ride.Driver = matched;
        ride.Status = RideStatus.Accepted;
        return ride;
    }

    public double CompleteRide(Ride ride) {
        if (ride.Status != RideStatus.Accepted && ride.Status != RideStatus.InProgress)
            throw new InvalidOperationException($"Cannot complete a ride in status {ride.Status}");
        double distance = ride.Pickup.DistanceTo(ride.Destination);
        ride.Fare = Math.Round(distance * RatePerUnitDistance, 2);
        ride.Status = RideStatus.Completed;
        lock (_lock) {
            ride.Driver.IsAvailable = true;
            ride.Driver.Location = ride.Destination;
        }
        return ride.Fare.Value;
    }

    public void CancelRide(Ride ride) {
        if (ride.Status != RideStatus.Requested && ride.Status != RideStatus.Accepted)
            throw new InvalidOperationException($"Cannot cancel a ride in status {ride.Status}");
        ride.Status = RideStatus.Cancelled;
        if (ride.Driver != null) {
            lock (_lock) { ride.Driver.IsAvailable = true; }
        }
    }
}

// usage
var drivers = new List<Driver> { new Driver("D1", "Sam", new Location(0, 0)), new Driver("D2", "Ana", new Location(10, 10)) };
var manager = new RideManager(drivers);
var rider = new Rider("U1", "Priya");

var ride = manager.RequestRide(rider, new Location(1, 1), new Location(5, 5), new NearestDriverStrategy());
Console.WriteLine($"Matched driver: {ride?.Driver.Name}");          // Sam — closer to pickup (1,1)

var fare = manager.CompleteRide(ride);
Console.WriteLine($"Fare: {fare}, driver available again: {drivers[0].IsAvailable}");
```
{{/tabs}}

## Tradeoffs and extensions

- **One lock for the whole fleet, not one per driver or per ride —
  and this is a genuinely different call than module 16's, not a
  regression from it.** Movie seats partition cleanly by show; the
  driver pool here doesn't partition by anything in this model, so
  every ride request contends over the same resource. Lock granularity
  follows the shape of the shared state, not a fixed rule.
- **Named extension: partition by region.** A real system assigns
  drivers to geographic regions and locks per-region — once region
  exists as a concept in the model, that's exactly module 16's
  per-`Show` pattern applied here (exercise 5).
- **The critical section covers only the driver-pool check-then-assign**,
  not `Ride` construction or any notification/I-O that would follow in
  a real system. Locking more than the actually-shared state adds
  contention without adding safety.
- **`RideStatus` is a plain enum with guards**, following module 13's
  `BookStatus` precedent rather than a full State-pattern hierarchy —
  named consistently with the same reasoning: few, simple transitions
  don't justify the ceremony a full class-per-state design would add.

## Hands-on exercises

### 1. Add a highest-rated-driver strategy

Give `Driver` a `rating` field and implement
`HighestRatedDriverStrategy`, picking the highest-rated available
driver instead of the nearest. Confirm it swaps into `RideManager`
with zero other changes.

### 2. Start a ride

Implement `start_ride(ride)`/`StartRide(ride)`, transitioning
`ACCEPTED` → `IN_PROGRESS` with a guard — confirm it rejects a `Ride`
still in `REQUESTED` or already `COMPLETED`.

### 3. ETA-aware matching

Give `Driver` a `speed` field and implement a matching strategy that
picks the driver with the shortest estimated time to pickup
(distance ÷ speed) rather than raw distance.

### 4. Write your own concurrency stress test

Start many rider threads requesting rides concurrently against a
driver pool smaller than the rider count. Assert exactly
`min(riders, drivers)` rides are matched and every matched driver ID is
unique — the same shape of test used to verify this module's own
implementation.

### 5. Partition by region

Give `Driver` a `region` field and `RideManager` one lock per region
instead of one global lock. Confirm (with a targeted test or by
reasoning through it) that ride requests in different regions no
longer block each other.

## Independent challenge

No code given.

**Task:** Add driver ratings. After a ride completes, the rider can
call `rate_ride(ride, stars)`/`RateRide(ride, stars)` with a 1–5 rating.
Track each driver's average rating and expose it as
`Driver.average_rating`/`Driver.AverageRating`, then update exercise
1's `HighestRatedDriverStrategy` to actually use it. **Constraint**:
no two independently-updated numbers that could drift — the same
single-source-of-truth discipline `Ledger` used in module 15. Don't
store a running sum *and* a separately-maintained average that a write
path could forget to keep in sync; derive the average from what's
actually stored.

<details>
<summary>Hint</summary>

Two valid single-source-of-truth designs: (a) store every individual
rating in a list per driver and compute the average on read
(`sum(ratings) / len(ratings)`), or (b) store a running `(total,
count)` pair updated together in exactly one method, with average
computed as `total / count` on read. What to avoid either way: a
cached `average_rating` field that gets written directly by more than
one code path — that's exactly the two-sources-of-truth shape module
15's `Ledger` section warned about, just with ratings instead of
balances.

</details>

## Common mistakes & troubleshooting

- **Splitting "find an available driver" and "mark it unavailable"
  into two separate calls** instead of one locked method. This
  reopens the exact check-then-act race the lock exists to prevent —
  the single most common bug in this exact classic problem.
- **Using a lock per `Ride` instead of a shared lock over the driver
  pool.** A per-ride lock protects nothing, since the actual race is
  *between different ride requests* contending over the same drivers,
  not within a single ride.
- **Holding the lock for the entire `request_ride`/`RequestRide` call**,
  including `Ride` construction or any notification step a real system
  would add. This needlessly widens the critical section and hurts
  throughput for no safety benefit — lock only the shared driver-pool
  mutation.
- **Forgetting to make a driver available again** (and update their
  location) when a ride completes or is cancelled. A driver stuck
  permanently unavailable after their first ride silently shrinks the
  usable fleet.
- **Letting `complete_ride`/`CompleteRide` or `cancel_ride`/`CancelRide`
  run against a ride in the wrong status** without a guard check —
  completing an already-cancelled ride, for instance — silently
  corrupts ride state instead of failing clearly.

## Checkpoint quiz

1. Why does `RideManager` use one lock for the whole driver pool
   instead of a lock per driver or per ride?
2. Contrast this module's lock granularity with module 16's Movie
   Booking — why is a single lock correct here but per-`Show` locks
   were correct there?
3. Why isn't `Ride` construction inside the locked section of
   `request_ride`/`RequestRide`?
4. Why is `RideStatus` a plain enum with guards rather than a full
   State-pattern hierarchy, and where has this track made that same
   call before?
5. Per the independent challenge, what must a driver's rating
   computation avoid to prevent drift?

<details>
<summary>Answers</summary>

1. Because every ride request in the system contends over the *same*
   shared pool of drivers — a per-driver or per-ride lock wouldn't
   protect the actual shared state being read and mutated (`is_available`
   across the whole list).
2. Movie seats partition cleanly by show — each show's seats are
   independent state, so per-show locks add no unnecessary contention.
   The driver pool here doesn't partition by anything in this model;
   every request reads and mutates the same shared list, so a single
   lock is the correct granularity for the shape of *this* shared
   state, not a rule applied regardless of shape.
3. Because the `Ride` object isn't shared state until it's returned to
   the caller — locking its construction would add contention without
   protecting anything, violating module 10's "keep critical sections
   minimal" guidance.
4. `RideStatus` has few, simple transitions with little behavioral
   difference per status — the same reasoning module 13 used for
   `BookStatus` (Library) rather than the Vending Machine's full State
   pattern: a class-per-state hierarchy would be ceremony without
   payoff here too.
5. Storing a cached average that more than one code path writes
   directly — any design where the average could be updated
   inconsistently with the underlying ratings. The fix is deriving the
   average from a single authoritative source (either every stored
   rating, or a running total/count pair updated together in exactly
   one place), the same discipline module 15's `Ledger` used for
   balances.

</details>

## Interview questions

1. **"How do you prevent two riders from being matched to the same
   driver at the same time?"**
   `RideManager` holds a single lock over the driver pool; matching
   ("find an available driver" + "mark it unavailable") happens inside
   one locked method, so the check-then-act sequence can't be
   interleaved by two concurrent requests — the same discipline as
   `Level.find_and_assign` in module 12, applied to a person instead of
   a parking spot.
2. **"Why not lock per-driver instead of one lock for the whole
   fleet?"**
   The race isn't within one driver's state — it's between multiple
   ride requests competing to be the one that claims *some* available
   driver from the pool. A per-driver lock wouldn't prevent two
   requests from both reading the pool's availability list
   inconsistently; the pool itself is the shared state that needs
   protecting.
3. **"How would you extend driver matching to consider more than
   distance?"**
   `DriverMatchingStrategy` is already an injected interface (Strategy,
   module 08) — a rating-aware or ETA-aware matcher is a new class
   implementing the same interface, with zero changes to `RideManager`.
4. **"How would you scale this to a much larger fleet across many
   cities?"**
   Partition drivers by geographic region and give each region its own
   lock, exactly like module 16's per-`Show` locking — ride requests in
   different regions then never contend with each other, and a real
   system would pair this with a spatial index (e.g., a geohash or
   quadtree) so "find nearby available drivers" doesn't mean scanning
   every driver in the region.
5. **"How would you add driver ratings without introducing a second
   source of truth that can drift?"**
   Never store a cached average that gets written by more than one code
   path. Store either every individual rating or a running
   `(total, count)` pair updated together in exactly one method, and
   always derive the average on read — the same single-source-of-truth
   discipline module 15's `Ledger` used for balances.

## Further reading & sources

- [Refactoring.Guru: Strategy pattern](https://refactoring.guru/design-patterns/strategy) - revisit module 08's pattern, applied here to driver matching exactly as it was to elevator dispatch in module 12.
- [Python `threading.Lock`](https://docs.python.org/3/library/threading.html#lock-objects) / [Microsoft Learn: `lock` statement](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/lock) - revisit module 10's primitives; this module's single-lock-over-a-shared-pool choice, contrasted with module 16's per-resource locks.
- [Geohash (Wikipedia)](https://en.wikipedia.org/wiki/Geohash) - the spatial-indexing technique real ride-sharing systems use for "find nearby available drivers" at a scale where scanning every driver stops being feasible — relevant background for the scaling/region-partitioning extension.

## Next

[18-lru-lfu-cache-and-rate-limiter](../18-lru-lfu-cache-and-rate-limiter/README.md)
— full guided solutions for an LRU cache, an LFU cache, and a rate
limiter.
