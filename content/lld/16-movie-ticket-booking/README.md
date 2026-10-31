# Module 16: Movie Ticket Booking

## Why this matters

This is the module where concurrency-safe design (module 10) stops
being an optional independent-challenge extension — as it was in
module 12's Parking Lot and module 13's Library — and becomes part of
the *core* required implementation. A booking system that occasionally
double-books a seat under load isn't a partial solution with a named
simplification; it's simply broken, so seat-locking is written
thread-safe from the first line, not bolted on afterward as an
exercise. There's also a modeling trap worth naming up front: "is this
seat booked?" is not a fact about the seat — it's a fact about *this
seat, for this specific show*. The same physical seat is free for the
7pm screening and sold out for the 9pm screening on the same screen.

## Requirements

**Functional**: theaters have screens; each screen has a fixed physical
seat layout (row, number, category); a **show** is a specific movie on
a specific screen at a specific start time, with its own per-category
pricing; a user selects one or more seats for a show and books them; a
booking request either reserves every requested seat or none of them
(no partial bookings), and two users can never end up holding the same
seat for the same show.

**Non-functional**: seat booking must be correct under concurrent
requests for the *same* show, without serializing bookings across
*different* shows that share no state (module 10 — each show's seat
availability is independent shared state, protected independently).

**Assumptions stated up front** (module 11, step 1): no seat-hold/expiry
timer — a real system holds selected seats for a few minutes during
payment before releasing them if unconfirmed (named as an extension
below); payment succeeds unconditionally once seats are reserved
(payment gateway integration is out of scope); no cancellations or
refunds (extension).

## Entities and relationships

Applying module 11's steps 3–4: `BookingService --> Show` (uses, to book
seats); `Show --> Movie`, `Show --> Screen` (association); `Screen o--
Seat` (composition, many — a fixed physical layout, reused across every
show scheduled on that screen); `BookingService --> Booking` (creates,
one per successful `book()` call); `Booking --> Show` (association).

## Class diagram

```
┌────────────────┐      ┌───────────────────┐
│ BookingService │ -->  │        Show       │
├────────────────┤      ├───────────────────┤
│ - nextId       │      │ - movie, screen   │
├────────────────┤      │ - startTime       │
│ + book()       │      │ - priceByCategory │
└────────────────┘      │ - bookedSeatIds   │
                         ├───────────────────┤
                         │ + bookSeats()     │
                         │ + priceFor()      │
                         └───────────────────┘

Show --> Movie   (association)
Show --> Screen   (association — many shows can reuse one physical screen)

┌─────────┐      ┌───────────────┐
│  Screen │ o──  │      Seat     │
├─────────┤      ├───────────────┤
│ - seats │      │ - row, number │
└─────────┘      │ - category    │
                  └───────────────┘

BookingService --> Booking   (creates one per successful book() call)
Booking --> Show   (association)

┌───────────────┐
│    Booking    │
├───────────────┤
│ - userId      │
│ - show        │
│ - seatIds     │
│ - totalAmount │
└───────────────┘
```

## Implementation

The critical detail: `Show` owns `_bookedSeatIds` **and** its own lock,
both fully private, and `bookSeats` checks every requested seat and
reserves all of them inside that single locked method — the same
check-then-act discipline as `Level.find_and_assign` in module 12,
except here it's the primary implementation, not an exercise. Each
`Show` gets its *own* lock (not one global lock for the whole system),
so bookings for unrelated shows never contend with each other.

{{tabs}}
{{tab Python}}
```python
import threading
from enum import Enum, auto
from datetime import datetime

class SeatCategory(Enum):
    SILVER = auto()
    GOLD = auto()
    PREMIUM = auto()

class Seat:
    def __init__(self, seat_id: str, row: int, number: int, category: SeatCategory):
        self.seat_id = seat_id
        self.row = row
        self.number = number
        self.category = category

class Screen:
    def __init__(self, screen_id: str, seats: list[Seat]):
        self.screen_id = screen_id
        self.seats = seats

class Movie:
    def __init__(self, movie_id: str, title: str, duration_minutes: int):
        self.movie_id = movie_id
        self.title = title
        self.duration_minutes = duration_minutes

class Show:
    def __init__(self, show_id: str, movie: Movie, screen: Screen, start_time: datetime,
                 price_by_category: dict[SeatCategory, float]):
        self.show_id = show_id
        self.movie = movie
        self.screen = screen
        self.start_time = start_time
        self.price_by_category = price_by_category
        self._booked_seat_ids: set[str] = set()
        self._lock = threading.Lock()          # one lock per show — bookings on different shows never contend

    def book_seats(self, seat_ids: list[str]) -> bool:
        with self._lock:                        # critical section: check-then-reserve, all-or-nothing
            if any(sid in self._booked_seat_ids for sid in seat_ids):
                return False
            self._booked_seat_ids.update(seat_ids)
            return True

    def price_for(self, seat_ids: list[str]) -> float:
        seats_by_id = {seat.seat_id: seat for seat in self.screen.seats}
        return sum(self.price_by_category[seats_by_id[sid].category] for sid in seat_ids)

class Booking:
    def __init__(self, booking_id: str, user_id: str, show: Show, seat_ids: list[str], total_amount: float):
        self.booking_id = booking_id
        self.user_id = user_id
        self.show = show
        self.seat_ids = seat_ids
        self.total_amount = total_amount

class BookingService:
    def __init__(self):
        self._next_id = 1

    def book(self, user_id: str, show: Show, seat_ids: list[str]) -> "Booking | None":
        if not show.book_seats(seat_ids):
            return None                          # at least one seat already taken — nothing was reserved
        total = show.price_for(seat_ids)
        booking = Booking(f"B{self._next_id}", user_id, show, seat_ids, total)
        self._next_id += 1
        return booking

# usage
seats = [Seat(f"A{i}", 1, i, SeatCategory.GOLD if i <= 5 else SeatCategory.PREMIUM) for i in range(1, 11)]
screen = Screen("SC1", seats)
movie = Movie("M1", "Inception", 148)
show = Show("SH1", movie, screen, datetime(2026, 8, 1, 19, 0), {SeatCategory.GOLD: 200.0, SeatCategory.PREMIUM: 350.0})

service = BookingService()
booking1 = service.book("U1", show, ["A1", "A2"])
print(f"Booking 1: {booking1 is not None}, total={booking1.total_amount}")

booking2 = service.book("U2", show, ["A2", "A3"])   # A2 already taken -> whole request fails, A3 stays free
print(f"Booking 2 (should fail, overlaps A2): {booking2 is None}")

booking3 = service.book("U2", show, ["A3"])
print(f"Booking 3 (A3 still free): {booking3 is not None}")
```
{{tab C#}}
```csharp
public enum SeatCategory { Silver, Gold, Premium }

public class Seat {
    public string SeatId; public int Row, Number; public SeatCategory Category;
    public Seat(string seatId, int row, int number, SeatCategory category) {
        SeatId = seatId; Row = row; Number = number; Category = category;
    }
}

public class Screen {
    public string ScreenId; public List<Seat> Seats;
    public Screen(string screenId, List<Seat> seats) { ScreenId = screenId; Seats = seats; }
}

public class Movie {
    public string MovieId, Title; public int DurationMinutes;
    public Movie(string movieId, string title, int durationMinutes) {
        MovieId = movieId; Title = title; DurationMinutes = durationMinutes;
    }
}

public class Show {
    public string ShowId; public Movie Movie; public Screen Screen; public DateTime StartTime;
    public Dictionary<SeatCategory, double> PriceByCategory;
    private HashSet<string> _bookedSeatIds = new HashSet<string>();
    private readonly object _lock = new object();     // one lock per show — bookings on different shows never contend

    public Show(string showId, Movie movie, Screen screen, DateTime startTime,
                Dictionary<SeatCategory, double> priceByCategory) {
        ShowId = showId; Movie = movie; Screen = screen; StartTime = startTime; PriceByCategory = priceByCategory;
    }

    public bool BookSeats(List<string> seatIds) {
        lock (_lock) {                                  // critical section: check-then-reserve, all-or-nothing
            if (seatIds.Any(id => _bookedSeatIds.Contains(id))) return false;
            foreach (var id in seatIds) _bookedSeatIds.Add(id);
            return true;
        }
    }

    public double PriceFor(List<string> seatIds) {
        var seatsById = Screen.Seats.ToDictionary(s => s.SeatId);
        return seatIds.Sum(id => PriceByCategory[seatsById[id].Category]);
    }
}

public class Booking {
    public string BookingId, UserId; public Show Show; public List<string> SeatIds; public double TotalAmount;
    public Booking(string bookingId, string userId, Show show, List<string> seatIds, double totalAmount) {
        BookingId = bookingId; UserId = userId; Show = show; SeatIds = seatIds; TotalAmount = totalAmount;
    }
}

public class BookingService {
    private int _nextId = 1;

    public Booking Book(string userId, Show show, List<string> seatIds) {
        if (!show.BookSeats(seatIds)) return null;      // at least one seat already taken — nothing was reserved
        double total = show.PriceFor(seatIds);
        var booking = new Booking($"B{_nextId}", userId, show, seatIds, total);
        _nextId++;
        return booking;
    }
}

// usage
var seats = Enumerable.Range(1, 10)
    .Select(i => new Seat($"A{i}", 1, i, i <= 5 ? SeatCategory.Gold : SeatCategory.Premium))
    .ToList();
var screen = new Screen("SC1", seats);
var movie = new Movie("M1", "Inception", 148);
var show = new Show("SH1", movie, screen, new DateTime(2026, 8, 1, 19, 0, 0),
    new Dictionary<SeatCategory, double> { [SeatCategory.Gold] = 200.0, [SeatCategory.Premium] = 350.0 });

var service = new BookingService();
var booking1 = service.Book("U1", show, new List<string> { "A1", "A2" });
Console.WriteLine($"Booking 1: {booking1 != null}, total={booking1.TotalAmount}");

var booking2 = service.Book("U2", show, new List<string> { "A2", "A3" });   // A2 already taken -> whole request fails
Console.WriteLine($"Booking 2 (should fail, overlaps A2): {booking2 == null}");

var booking3 = service.Book("U2", show, new List<string> { "A3" });
Console.WriteLine($"Booking 3 (A3 still free): {booking3 != null}");
```
{{/tabs}}

## Tradeoffs and extensions

- **Booking status is keyed to (`Show`, seat ID), not stored on `Seat`
  itself.** `Seat` objects are reused across every show scheduled on a
  screen; a boolean `isBooked` field on `Seat` would incorrectly link
  the 7pm show's booking to the 9pm show's availability. `Show` owning
  `_booked_seat_ids` is what keeps the two independent.
- **One lock per `Show`, not one global lock for the whole booking
  system.** Bookings for unrelated shows never contend with each
  other — the same lock-granularity lesson as `Level` owning its own
  lock per level in module 12's Parking Lot, rather than one lock for
  the entire `ParkingLot`.
- **`book_seats`/`BookSeats` is all-or-nothing over the whole requested
  list**, checked and reserved inside one locked method. Reserving
  seats one at a time would let two concurrent requests each grab a
  different subset of an overlapping batch — this module makes that
  discipline core, where modules 12 and 13 left it as an optional
  extension.
- **`price_for`/`PriceFor` looks up each seat's category and sums
  per-category prices** rather than assuming a flat rate — and prices
  live on the `Show`, not on `SeatCategory` itself, so two different
  shows of the same movie on the same screen (matinee vs. prime time)
  can charge different prices with zero changes to `Seat` or `Screen`.

## Hands-on exercises

### 1. Add a seat hold with expiry

Implement `hold_seats(show, seat_ids, held_by, expires_at)`/
`HoldSeats(...)` that reserves seats temporarily; if not confirmed via
a new `confirm_hold(...)`/`ConfirmHold(...)` call before `expires_at`,
they become bookable by someone else again.

### 2. Add booking cancellation

Implement `cancel_booking(booking)`/`CancelBooking(booking)` that
releases the booking's seats back to the show and marks the booking
cancelled.

### 3. Search across many shows

Add a `Catalog` (or similar) holding many `Show`s, with a
`find_shows(movie, city, date)`/`FindShows(...)` method filtering
across all of them.

### 4. Verify all-or-nothing under partial overlap

Attempt to book 3 seats where exactly 1 is already taken, and confirm
**none** of the 3 get reserved — not 2 out of 3.

### 5. Write your own concurrency stress test

Start several threads booking overlapping seat sets on the same show
concurrently, and assert exactly the expected number of bookings
succeed — the same kind of test used to verify this module's own
implementation before it was written up.

## Independent challenge

No code given.

**Task:** Implement `find_contiguous_seats(show, category, count)`/
`FindContiguousSeats(show, category, count)`, returning `count` seat
IDs in the same row, consecutively numbered, all currently unbooked,
in the requested category — or `None`/`null` if no such run exists.
This is a real feature of every seat-booking site (group bookings want
to sit together) and a different kind of problem than this module's
concurrency focus — a search over the existing seat layout, not a
locking concern.

<details>
<summary>Hint</summary>

Group the screen's seats by row, and within each row of the requested
category, sort by seat number. Scan for a run of `count` consecutive
numbers where none are in the show's booked set — the first such run
found is your answer. This doesn't need to touch `book_seats`/
`BookSeats` or the lock at all; it's a pure read over `Screen.seats`
and `Show`'s current booked-seat state.

</details>

## Common mistakes & troubleshooting

- **Storing a `booked` boolean directly on `Seat`.** A seat booked for
  the 7pm show would incorrectly show as booked for the 9pm show too,
  since the same `Seat` object is shared across every show on that
  screen — booking state belongs on `Show`, keyed by seat ID.
- **Reserving seats in a multi-seat request one at a time** instead of
  as a single all-or-nothing operation. Two concurrent requests could
  then each successfully claim a different subset of an overlapping
  batch, leaving a user with a partial, useless booking (2 seats out of
  a requested 3, not seated together).
- **One global lock for the entire booking system** instead of one per
  `Show`. Technically safe, but needlessly serializes bookings for
  completely unrelated shows that share no state — a throughput
  problem with no corresponding safety benefit.
- **Assuming every seat in a batch shares one category when computing
  price.** A booking spanning both GOLD and PREMIUM seats must sum
  each seat's own category price, not multiply a single category's
  price by the seat count.
- **Returning partial success from `book_seats`/`BookSeats`** — silently
  booking whatever's available and dropping the rest. A user with no
  way to know which of their requested seats they actually got is worse
  off than one who gets a clear failure and can retry.

## Checkpoint quiz

1. Why is booking status tracked per (`Show`, seat ID) rather than as a
   flag on `Seat` itself?
2. Why does each `Show` have its own lock instead of one lock shared by
   the whole booking system?
3. What does "all-or-nothing" mean for a multi-seat booking request,
   and why does it matter specifically under concurrency?
4. Why can't `price_for`/`PriceFor` simply be "price × number of
   seats"?
5. How does this module's concurrency handling differ from module 12's
   Parking Lot — in scope, not mechanism?

<details>
<summary>Answers</summary>

1. Because `Seat` objects are physical and reused across every show
   scheduled on a screen — a seat's availability is a fact about a
   specific (show, seat) pairing, not the seat alone. Tracking it on
   `Seat` would make a booking for one show incorrectly affect every
   other show sharing that seat.
2. So bookings for unrelated shows never contend with each other. A
   single global lock would be safe but would needlessly serialize all
   bookings system-wide, even between two shows that share no data —
   the same lock-granularity lesson as `Level`'s per-level lock in
   module 12.
3. It means a request for multiple seats either reserves every one of
   them or none of them — never a subset. Under concurrency this
   matters because reserving seats individually would let two
   overlapping concurrent requests each walk away with a different,
   incomplete subset of what they actually wanted.
4. Because a single booking can span multiple seat categories (e.g.,
   GOLD and PREMIUM together) — the price must be summed per seat based
   on that seat's own category, not computed as one flat rate times a
   seat count.
5. The mechanism is identical (a lock encapsulated inside the class
   owning the shared state, protecting a check-then-act sequence). The
   difference is scope: in module 12, this discipline was the
   *independent challenge* — an extension beyond the base solution. Here
   it's written into the core implementation from the start, because an
   occasionally-double-booking ticket system isn't an acceptable base
   solution at all.

</details>

## Interview questions

1. **"How do you prevent two users from booking the same seat at the
   same time?"**
   Each `Show` owns a lock, fully encapsulated inside the class, and
   `bookSeats` performs its check-then-reserve sequence for the entire
   requested seat list inside that single locked method — never
   exposing the lock, and never splitting the check from the reserve
   into two separate calls a race could interleave.
2. **"Why does each show manage its own lock instead of a single lock
   for the whole system?"**
   Lock granularity: a global lock would be correct but would
   needlessly serialize bookings across completely unrelated shows,
   hurting throughput for no safety benefit — each show's seat
   availability is independent shared state and should be protected
   independently, the same principle as `Level`'s per-level lock in the
   Parking Lot.
3. **"What happens if a user requests 3 seats and only 2 are still
   available?"**
   The whole request fails — `bookSeats` is all-or-nothing over the
   full requested list, checked inside the same locked method that
   reserves them. A partial success (2 of 3) would leave the user with
   an unusable booking and no clear signal about what happened.
4. **"How would you add a temporary seat hold during checkout?"**
   Add a hold state distinct from booked — seats move to "held" with an
   expiry, become bookable again if unconfirmed by that time, and only
   move to fully "booked" on explicit confirmation — layered on top of
   the existing per-show lock without changing how `Seat` or `Screen`
   work.
5. **"How would you support different prices for different seat
   categories, and different prices for different shows of the same
   movie?"**
   Price lives on `Show` as a category-to-price map, not as a fixed
   value on `SeatCategory` — `priceFor` sums each requested seat's
   category price from that show's own map, so a matinee and a
   prime-time show of the same movie on the same screen can price
   identically-categorized seats differently with zero changes to
   `Seat` or `Screen`.

## Further reading & sources

- [Python `threading.Lock`](https://docs.python.org/3/library/threading.html#lock-objects) / [Microsoft Learn: `lock` statement](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/lock) - revisit module 10's concurrency primitives; the same per-show lock pattern as `Level.find_and_assign` in module 12, now load-bearing rather than an exercise.
- [Optimistic concurrency control (Wikipedia)](https://en.wikipedia.org/wiki/Optimistic_concurrency_control) - the alternative to this module's pessimistic (lock-first) approach, relevant background for the seat-hold exercise and for reasoning about booking systems at larger scale.

## Next

[17-ride-sharing](../17-ride-sharing/README.md)
— a full guided solution for a ride-matching system, Uber-style.
