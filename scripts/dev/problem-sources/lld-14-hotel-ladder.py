H1 = r'''class Hotel:
    def __init__(self, rooms):
        self._rooms = dict(rooms)
        self._bookings = {}
        self._counter = 0

    @staticmethod
    def _check(check_in, check_out):
        if not check_in < check_out:
            raise ValueError("Bad dates")

    def _free(self, room, check_in, check_out):
        for booking in self._bookings.values():
            if booking["room"] == room and check_in < booking["out"] and booking["in"] < check_out:
                return False
        return True

    def available(self, check_in, check_out, guests=1):
        self._check(check_in, check_out)
        return sorted(room for room, capacity in self._rooms.items()
                      if capacity >= guests and self._free(room, check_in, check_out))

    def book(self, guest, guests, check_in, check_out):
        self._check(check_in, check_out)
        if guests > max(self._rooms.values()):
            raise ValueError("Too many guests")
        options = self.available(check_in, check_out, guests)
        if not options:
            raise ValueError("No room available")
        room = min(options, key=lambda r: (self._rooms[r], r))
        self._counter += 1
        booking_id = "B" + str(self._counter)
        self._bookings[booking_id] = {"seq": self._counter, "guest": guest, "room": room, "in": check_in, "out": check_out}
        return booking_id

    def room_of(self, booking_id):
        if booking_id not in self._bookings:
            raise ValueError("Unknown booking")
        return self._bookings[booking_id]["room"]

    def cancel(self, booking_id):
        if booking_id not in self._bookings:
            raise ValueError("Unknown booking")
        del self._bookings[booking_id]

    def bookings_of(self, guest):
        mine = [b for b in self._bookings.values() if b["guest"] == guest]
        mine.sort(key=lambda b: (b["in"], b["seq"]))
        return [("B" + str(b["seq"]), b["room"], b["in"], b["out"]) for b in mine]'''

H2 = r'''class Hotel:
    def __init__(self, rooms):
        self._rooms = {number: tuple(info) for number, info in rooms.items()}
        self._bookings = {}
        self._counter = 0

    @staticmethod
    def _check(check_in, check_out):
        if not check_in < check_out:
            raise ValueError("Bad dates")

    def _free(self, room, check_in, check_out):
        for booking in self._bookings.values():
            if booking["room"] == room and check_in < booking["out"] and booking["in"] < check_out:
                return False
        return True

    def available(self, check_in, check_out, guests=1):
        self._check(check_in, check_out)
        return sorted(room for room, (capacity, _) in self._rooms.items()
                      if capacity >= guests and self._free(room, check_in, check_out))

    def book(self, guest, guests, check_in, check_out):
        self._check(check_in, check_out)
        if guests > max(capacity for capacity, _ in self._rooms.values()):
            raise ValueError("Too many guests")
        options = self.available(check_in, check_out, guests)
        if not options:
            raise ValueError("No room available")
        room = min(options, key=lambda r: (self._rooms[r][1], r))
        self._counter += 1
        booking_id = "B" + str(self._counter)
        self._bookings[booking_id] = {"seq": self._counter, "guest": guest, "room": room, "in": check_in, "out": check_out}
        return booking_id

    def room_of(self, booking_id):
        return self._get(booking_id)["room"]

    def _get(self, booking_id):
        if booking_id not in self._bookings:
            raise ValueError("Unknown booking")
        return self._bookings[booking_id]

    def _price(self, room, check_in, check_out):
        rate = self._rooms[room][1]
        total = sum(rate * 125 // 100 if night % 7 in (5, 6) else rate for night in range(check_in, check_out))
        if check_out - check_in >= 7:
            total -= total // 10
        return total

    def quote(self, booking_id):
        booking = self._get(booking_id)
        return self._price(booking["room"], booking["in"], booking["out"])

    def revenue(self):
        return sum(self.quote(booking_id) for booking_id in self._bookings)

    def cancel(self, booking_id):
        self._get(booking_id)
        del self._bookings[booking_id]

    def bookings_of(self, guest):
        mine = [b for b in self._bookings.values() if b["guest"] == guest]
        mine.sort(key=lambda b: (b["in"], b["seq"]))
        return [("B" + str(b["seq"]), b["room"], b["in"], b["out"]) for b in mine]'''

H3 = r'''class Hotel:
    def __init__(self, rooms):
        self._rooms = {number: tuple(info) for number, info in rooms.items()}
        self._bookings = {}
        self._counter = 0
        self._fees = 0

    @staticmethod
    def _check(check_in, check_out):
        if not check_in < check_out:
            raise ValueError("Bad dates")

    def _free(self, room, check_in, check_out, ignore=None):
        for booking_id, booking in self._bookings.items():
            if booking_id == ignore:
                continue
            if booking["room"] == room and check_in < booking["out"] and booking["in"] < check_out:
                return False
        return True

    def available(self, check_in, check_out, guests=1):
        self._check(check_in, check_out)
        return sorted(room for room, (capacity, _) in self._rooms.items()
                      if capacity >= guests and self._free(room, check_in, check_out))

    def book(self, guest, guests, check_in, check_out):
        self._check(check_in, check_out)
        if guests > max(capacity for capacity, _ in self._rooms.values()):
            raise ValueError("Too many guests")
        options = self.available(check_in, check_out, guests)
        if not options:
            raise ValueError("No room available")
        room = min(options, key=lambda r: (self._rooms[r][1], r))
        self._counter += 1
        booking_id = "B" + str(self._counter)
        self._bookings[booking_id] = {"seq": self._counter, "guest": guest, "room": room, "in": check_in, "out": check_out}
        return booking_id

    def _get(self, booking_id):
        if booking_id not in self._bookings:
            raise ValueError("Unknown booking")
        return self._bookings[booking_id]

    def room_of(self, booking_id):
        return self._get(booking_id)["room"]

    def _price(self, room, check_in, check_out):
        rate = self._rooms[room][1]
        total = sum(rate * 125 // 100 if night % 7 in (5, 6) else rate for night in range(check_in, check_out))
        if check_out - check_in >= 7:
            total -= total // 10
        return total

    def quote(self, booking_id):
        booking = self._get(booking_id)
        return self._price(booking["room"], booking["in"], booking["out"])

    def revenue(self):
        return sum(self.quote(booking_id) for booking_id in self._bookings) + self._fees

    def cancel(self, booking_id, today):
        booking = self._get(booking_id)
        if today >= booking["in"]:
            raise ValueError("Too late")
        quote = self.quote(booking_id)
        days_before = booking["in"] - today
        if days_before >= 7:
            refund = quote
        elif days_before >= 2:
            refund = quote // 2
        else:
            refund = 0
        self._fees += quote - refund
        del self._bookings[booking_id]
        return refund

    def extend(self, booking_id, new_check_out):
        booking = self._get(booking_id)
        if not new_check_out > booking["out"]:
            raise ValueError("Bad dates")
        if not self._free(booking["room"], booking["out"], new_check_out, ignore=booking_id):
            raise ValueError("Room not free")
        booking["out"] = new_check_out

    def bookings_of(self, guest):
        mine = [b for b in self._bookings.values() if b["guest"] == guest]
        mine.sort(key=lambda b: (b["in"], b["seq"]))
        return [("B" + str(b["seq"]), b["room"], b["in"], b["out"]) for b in mine]'''

HELPER = r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
'''

PROBLEMS = [
P(
    slug='lld-hotel-booking-1', title='Hotel Booking, Step 1: Rooms and Dates', topic='lld-change-requests', difficulty='intermediate',
    module='lld/11-requirements-to-class-diagrams/README.md',
    description='Step 1 of 3: book hotel rooms for a range of nights, with no double bookings and the smallest room that fits.',
    statement=r'''This is **step 1 of 3**. Steps 2 and 3 add new rules to the class you write here, so keep it tidy.

Write a class `Hotel`. Nights are whole numbers (day numbers); a stay from `check_in` to `check_out` covers the nights `check_in, check_in + 1, ..., check_out - 1`, so one guest can **leave and another arrive on the same day**.

**Creating one:** `Hotel(rooms)`, where `rooms` maps a room number (a string) to its **capacity**: `Hotel({"101": 2, "102": 4})`. It keeps its own copy.

**Methods**

- `available(check_in, check_out, guests=1)` is the sorted list of room numbers that fit `guests` and are free on **every** night of the stay.
- `book(guest, guests, check_in, check_out)` books the room with the **smallest capacity that fits** (ties: the lower room number) among the free rooms, and returns a booking id: `"B1"`, `"B2"`, ... in order.
- `room_of(booking_id)` is the booked room.
- `cancel(booking_id)` removes the booking, so the room is free again.
- `bookings_of(guest)` is a list of `(booking_id, room, check_in, check_out)` for that guest, ordered by `check_in` and then by the order they were booked.

**Errors.** `ValueError` with exactly this message. `available` and `book`: `check_out` not after `check_in`: `"Bad dates"`. `book` then: more guests than the biggest room holds: `"Too many guests"`; no free room: `"No room available"`. `room_of` and `cancel` with an unknown id: `"Unknown booking"`. A refused call changes nothing and does not use up an id.

**Example**

```
hotel = Hotel({"101": 2, "102": 4})
hotel.book("ann", 2, 1, 4)     # "B1" (room 101: the smaller room that fits)
hotel.book("bob", 2, 3, 5)     # "B2" (room 101 is busy on night 3, so 102)
hotel.book("cy", 1, 4, 6)      # "B3" (room 101 is free again on night 4)
```''',
    starter=r'''class Hotel:
    def __init__(self, rooms):
        ...

    def available(self, check_in, check_out, guests=1):
        ...

    def book(self, guest, guests, check_in, check_out):
        ...

    def room_of(self, booking_id):
        ...

    def cancel(self, booking_id):
        ...

    def bookings_of(self, guest):
        ...''',
    tests=HELPER + r'''hotel = Hotel({"101": 2, "102": 4, "201": 2})
assert hotel.available(1, 3) == ["101", "102", "201"]
assert hotel.available(1, 3, guests=3) == ["102"]
assert hotel.available(1, 3, guests=5) == []
assert error_of(hotel.available, 3, 3) == "ValueError: Bad dates"
assert error_of(hotel.book, "x", 1, 5, 2) == "ValueError: Bad dates"
assert error_of(hotel.book, "x", 5, 1, 2) == "ValueError: Too many guests"
assert error_of(hotel.book, "x", 1, 5, 5) == "ValueError: Bad dates"
first = hotel.book("ann", 2, 1, 4)
assert first == "B1" and hotel.room_of(first) == "101"
assert hotel.available(1, 4) == ["102", "201"]
assert hotel.available(4, 6) == ["101", "102", "201"]
assert hotel.available(0, 2) == ["102", "201"]
second = hotel.book("bob", 2, 3, 5)
assert second == "B2" and hotel.room_of(second) == "201"
third = hotel.book("cy", 2, 3, 6)
assert third == "B3" and hotel.room_of(third) == "102"
assert error_of(hotel.book, "dee", 4, 4, 5) == "ValueError: No room available"
assert error_of(hotel.book, "dee", 5, 4, 5) == "ValueError: Too many guests"
fourth = hotel.book("ann", 1, 4, 6)
assert fourth == "B4" and hotel.room_of(fourth) == "101"
assert hotel.bookings_of("ann") == [("B1", "101", 1, 4), ("B4", "101", 4, 6)]
assert hotel.bookings_of("nobody") == []
assert error_of(hotel.room_of, "B9") == "ValueError: Unknown booking"
assert error_of(hotel.cancel, "B9") == "ValueError: Unknown booking"
assert hotel.cancel("B1") is None
assert hotel.available(1, 4) == ["101"]
assert error_of(hotel.room_of, "B1") == "ValueError: Unknown booking"
assert hotel.bookings_of("ann") == [("B4", "101", 4, 6)]
assert hotel.book("eli", 2, 1, 3) == "B5" and hotel.room_of("B5") == "101"
for n in range(6, 12):
    hotel.book("many", 2, 20 + n, 21 + n)
assert hotel.book("last", 2, 40, 41) == "B12"
assert [row[0] for row in hotel.bookings_of("many")] == ["B6", "B7", "B8", "B9", "B10", "B11"]
assert [row[0] for row in hotel.bookings_of("many")][-1] == "B11"
many_rooms = Hotel({str(i): 1 for i in range(11)})
for guest_number in range(11):
    many_rooms.book("same", 1, 5, 6)
assert [row[0] for row in many_rooms.bookings_of("same")] == ["B" + str(i) for i in range(1, 12)]
shared = Hotel({"1": 1})
shared.book("a", 1, 5, 6)
shared.book("a", 1, 1, 2)
assert [row[2] for row in shared.bookings_of("a")] == [1, 5]
rooms = {"1": 1}
copy = Hotel(rooms)
rooms["2"] = 1
assert copy.available(1, 2) == ["1"]''',
    solution=H1,
    hints=[
        r'''Keep a dictionary of bookings. A room is free for `[check_in, check_out)` when no booking of that room overlaps it: two ranges overlap when `a.start < b.end and b.start < a.end`. Using `<` (not `<=`) is what allows leaving and arriving on the same day.''',
        r'''To pick the room, filter `available(...)` for the guests, then take `min` with the key `(capacity, room_number)`.''',
        r'''Validate in the stated order and only then take the next id, so a refused `book` does not use up `"B1"`. Order `bookings_of` by the stay's start and the booking's sequence number, **not** by the id text (`"B10"` sorts before `"B2"` as text).''',
    ],
    explanation=r'''**The idea.** Booking is a *range overlap* problem. A booking claims the nights `[check_in, check_out)`; two bookings of the same room conflict exactly when their ranges overlap, which with half-open ranges is `a.start < b.end and b.start < a.end`.

**Why half-open.** A guest leaves on day 4 and the next arrives on day 4. With closed ranges `[1, 4]` and `[4, 6]` they would clash; with half-open `[1, 4)` and `[4, 6)` they do not, which is how hotels work.

**Pick, then record.** `book` first asks `available(...)`, then chooses the *best fit* (the smallest room that is big enough, so big rooms stay free for big groups), then records. Keeping the choice in one line (`min(..., key=...)`) matters: the next two steps change exactly that line and the pricing around it.

**Step 2 and 3 preview.** Step 2 gives rooms a price and changes the rule for choosing a room. Step 3 adds cancellation refunds and extending a stay. Code that kept "which room" in one place, and "is it free" in another, absorbs both changes with small edits.

**Complexity.** `available` scans every booking per room, O(rooms x bookings); an interval tree or a sorted list per room makes it O(log n).

**Going further.** Is `"B10"` after `"B9"` in your `bookings_of`? Sort by the number, not the text.''',
),

P(
    slug='lld-hotel-booking-2', title='Hotel Booking, Step 2: Prices', topic='lld-change-requests', difficulty='intermediate',
    module='lld/11-requirements-to-class-diagrams/README.md',
    description='Step 2 of 3: rooms get a nightly rate, weekends cost more, long stays get a discount, and the cheapest room that fits is chosen.',
    statement=r'''This is **step 2 of 3**. The starting code is a working solution to step 1. Everything from step 1 still holds **except where this step changes it**.

**What changes**

- `Hotel(rooms)` now maps a room number to `(capacity, rate)`, where `rate` is the price of one night in **cents**: `Hotel({"101": (2, 10000), "102": (4, 15000)})`.
- `book` now chooses the **cheapest** free room that fits (lowest `rate`, ties: lower room number), instead of the smallest capacity.
- `Too many guests` and `Bad dates` work as before.

**What is new**

- `quote(booking_id)` is the price of the booking in cents. Unknown id: `ValueError("Unknown booking")`.
  - A night costs the room's `rate`, except **weekend nights**: a night whose number `n` has `n % 7` equal to `5` or `6` costs **125 %** of the rate (`rate * 125 // 100`).
  - A stay of **7 nights or more** gets **10 % off the total** (`total - total // 10`), applied after the weekend rates.
- `revenue()` is the sum of the `quote` of every booking that is currently held.

**Example**

```
hotel = Hotel({"201": (2, 8000)})
b = hotel.book("ann", 2, 4, 7)    # nights 4, 5, 6
hotel.quote(b)                    # 8000 + 10000 + 10000 = 28000
```''',
    starter=H1,
    tests=HELPER + r'''hotel = Hotel({"101": (2, 10000), "102": (4, 15000), "201": (2, 8000)})
assert hotel.available(1, 3) == ["101", "102", "201"]
assert hotel.available(1, 3, guests=3) == ["102"]
assert error_of(hotel.available, 3, 3) == "ValueError: Bad dates"
assert error_of(hotel.book, "x", 1, 5, 5) == "ValueError: Bad dates"
assert error_of(hotel.book, "x", 5, 1, 2) == "ValueError: Too many guests"
first = hotel.book("ann", 2, 1, 3)
assert first == "B1" and hotel.room_of(first) == "201"
assert hotel.quote(first) == 16000
second = hotel.book("bob", 2, 2, 4)
assert second == "B2" and hotel.room_of(second) == "101"
assert hotel.quote(second) == 20000
third = hotel.book("cy", 2, 2, 3)
assert third == "B3" and hotel.room_of(third) == "102"
assert error_of(hotel.book, "dee", 2, 2, 3) == "ValueError: No room available"
assert error_of(hotel.quote, "B9") == "ValueError: Unknown booking"
weekend = Hotel({"201": (2, 8000)})
w = weekend.book("ann", 2, 4, 7)
assert weekend.quote(w) == 28000
saturday = weekend.book("ann", 2, 12, 13)
assert weekend.quote(saturday) == 10000
sunday = weekend.book("ann", 2, 13, 14)
assert weekend.quote(sunday) == 10000
monday = weekend.book("ann", 2, 14, 15)
assert weekend.quote(monday) == 8000
friday = weekend.book("ann", 2, 11, 12)
assert weekend.quote(friday) == 8000
week = Hotel({"A": (2, 8000)})
long_stay = week.book("ann", 2, 0, 7)
assert week.quote(long_stay) == 54000
six = week.book("ann", 2, 7, 13)
assert week.quote(six) == 8000 * 5 + 10000
seven = week.book("ann", 2, 20, 27)
assert week.quote(seven) == 54000
odd = Hotel({"A": (2, 99)})
night = odd.book("x", 1, 5, 6)
assert odd.quote(night) == 123
odd_week = odd.book("x", 1, 10, 17)
assert odd_week == "B2" and odd.quote(odd_week) == (99 * 5 + 123 * 2) - (99 * 5 + 123 * 2) // 10
assert odd.revenue() == 123 + odd.quote("B2")
fresh = Hotel({"101": (2, 10000), "102": (4, 8000)})
cheap = fresh.book("ann", 2, 1, 2)
assert fresh.room_of(cheap) == "102"
tie = Hotel({"B": (2, 5000), "A": (2, 5000), "C": (1, 4000)})
assert tie.room_of(tie.book("x", 2, 1, 2)) == "A"
assert tie.room_of(tie.book("x", 1, 1, 2)) == "C"
assert tie.revenue() == 5000 + 4000
assert hotel.revenue() == 16000 + 20000 + hotel.quote(third)
hotel.cancel("B2")
assert hotel.revenue() == 16000 + hotel.quote(third)
assert error_of(hotel.quote, "B2") == "ValueError: Unknown booking"
assert Hotel({"1": (1, 1)}).revenue() == 0
big = Hotel({"s": (2, 1), "b": (4, 1)})
assert big.room_of(big.book("g", 3, 1, 2)) == "b"''',
    solution=H2,
    hints=[
        r'''Store `(capacity, rate)` per room. Only two places read the capacity or the rate: the "does it fit" test in `available` and the choice in `book`. Change the choice to `min(options, key=lambda r: (rate, r))`.''',
        r'''Write one private `_price(room, check_in, check_out)` and make `quote` and `revenue` use it. Sum the nights first (weekend nights at `rate * 125 // 100`), and only then take the 10 % off the total for stays of 7 nights or more.''',
        r'''Use integer arithmetic (`//`) for the 125 % and the 10 % so every price is a whole number of cents, and apply the long-stay discount to the *total*, not to each night.''',
    ],
    explanation=r'''**The idea.** This is a *change request*: new rules arrive for code that already works. The skill is changing the **fewest places**, and knowing which they are.

What changed in step 1's code:

- the constructor now stores a pair instead of a number (one line),
- `available` reads the capacity from the pair (one expression),
- `book` picks by price instead of capacity (**one line**: the `key` of a `min`),
- `quote`, `revenue` and `_price` are new methods.

Nothing else moved: overlap checking, ids, `cancel` and `bookings_of` are exactly as they were. If your step 1 had mixed the room choice into five places, this step would hurt; that is the lesson of the ladder.

**Money in integers.** A weekend night at `125 %` of 99 cents is `99 * 125 // 100 = 123`, not 123.75. Using whole cents and `//` keeps every price exact and every total reproducible. Floating point (`99 * 1.25`) would drift.

**Order of discounts.** "125 % on weekend nights, then 10 % off the total" and "10 % off each night, then 125 %" give different cents. A statement that fixes the order, as this one does, is what lets a test pin a single answer.

```mermaid
flowchart LR
    N[nights of the stay] --> W[weekend nights x 125 %]
    W --> S[sum]
    S --> D{7 nights or more?}
    D -- yes --> T[total minus total // 10]
    D -- no --> T2[total]
```

**Going further.** Move the rules into a `PricingPolicy` object passed to `Hotel`. Which methods change, and which tests would not?''',
),

P(
    slug='lld-hotel-booking-3', title='Hotel Booking, Step 3: Refunds and Extensions', topic='lld-change-requests', difficulty='advanced',
    module='lld/11-requirements-to-class-diagrams/README.md',
    description='Step 3 of 3: cancellations refund by how early they are, the hotel keeps the fee, and guests can extend a stay when their room is free.',
    statement=r'''This is **step 3 of 3**. The starting code is a working solution to step 2. Everything holds **except where this step changes it**.

**What changes**

- `cancel(booking_id, today)` now takes the current day number and **returns the refund in cents**. Unknown id: `"Unknown booking"` (checked first). `today >= check_in` (the stay has started): `ValueError("Too late")` and nothing changes. Otherwise, with `days_before = check_in - today` and the booking's `quote`:
  - `days_before >= 7`: refund the **whole** quote;
  - `2 <= days_before <= 6`: refund **half** (`quote // 2`);
  - otherwise (1 day before): refund **nothing**.
  The room is free again.
- `revenue()` is now the quotes of the bookings currently held **plus the fees the hotel kept** from cancellations, where each kept fee is `quote - refund`.

**What is new**

- `extend(booking_id, new_check_out)` makes a stay longer, in the **same room**. `"Unknown booking"` for an unknown id; `"Bad dates"` when `new_check_out` is not after the current `check_out`; `"Room not free"` when that room is booked by someone else on any of the extra nights. A refused call changes nothing. The booking's `quote` is computed again for the longer stay (so a stay reaching 7 nights gets the long-stay discount).

**Example**

```
hotel = Hotel({"201": (2, 8000)})
b = hotel.book("ann", 2, 10, 12)    # quote 16000
hotel.cancel(b, today=8)             # 2 days before: refund 8000
hotel.revenue()                      # 8000 kept
```''',
    starter=H2,
    tests=HELPER + r'''hotel = Hotel({"101": (2, 10000), "201": (2, 8000)})
a = hotel.book("ann", 2, 10, 12)
assert a == "B1" and hotel.room_of(a) == "201" and hotel.quote(a) == 16000
assert error_of(hotel.cancel, "B9", 0) == "ValueError: Unknown booking"
assert error_of(hotel.cancel, a, 10) == "ValueError: Too late"
assert error_of(hotel.cancel, a, 11) == "ValueError: Too late"
assert hotel.revenue() == 16000
assert hotel.cancel(a, 8) == 8000
assert hotel.revenue() == 8000
assert error_of(hotel.quote, a) == "ValueError: Unknown booking"
assert hotel.available(10, 12) == ["101", "201"]
b = hotel.book("bob", 2, 10, 12)
assert hotel.cancel(b, 9) == 0
assert hotel.revenue() == 8000 + 16000
c = hotel.book("cy", 2, 10, 12)
assert hotel.cancel(c, 3) == 16000
assert hotel.revenue() == 8000 + 16000
d = hotel.book("dee", 2, 10, 12)
assert hotel.cancel(d, 4) == 8000 and hotel.cancel(hotel.book("eve", 2, 10, 12), 5) == 8000
assert hotel.revenue() == 8000 + 16000 + 8000 + 8000
e = hotel.book("fay", 2, 21, 22)
assert hotel.quote(e) == 8000 and hotel.cancel(e, 14) == 8000
assert hotel.cancel(hotel.book("g", 2, 21, 22), 15) == 4000
assert hotel.cancel(hotel.book("h", 2, 21, 22), 19) == 4000 and hotel.cancel(hotel.book("i", 2, 21, 22), 20) == 0
odd = Hotel({"A": (2, 99)})
night = odd.book("x", 1, 5, 6)
assert odd.quote(night) == 123 and odd.cancel(night, 3) == 61
assert odd.revenue() == 62
ext = Hotel({"A": (2, 8000), "B": (2, 9000)})
s = ext.book("ann", 2, 0, 5)
t = ext.book("bob", 2, 3, 8)
assert ext.room_of(s) == "A" and ext.room_of(t) == "B"
assert error_of(ext.extend, "B9", 9) == "ValueError: Unknown booking"
assert error_of(ext.extend, s, 5) == "ValueError: Bad dates"
assert error_of(ext.extend, s, 3) == "ValueError: Bad dates"
ext.book("cy", 1, 6, 9)
assert ext.room_of("B3") == "A"
assert error_of(ext.extend, s, 7) == "ValueError: Room not free"
assert ext.quote(s) == 8000 * 5 and ext.bookings_of("ann") == [("B1", "A", 0, 5)]
assert ext.extend(s, 6) is None
assert ext.bookings_of("ann") == [("B1", "A", 0, 6)] and ext.quote(s) == 8000 * 5 + 10000
assert ext.available(5, 6) == []
ext.cancel("B3", 0)
assert ext.extend(s, 7) is None
assert ext.quote(s) == (8000 * 5 + 10000 * 2) - (8000 * 5 + 10000 * 2) // 10
before = ext.revenue()
assert error_of(ext.extend, t, 7) == "ValueError: Bad dates"
assert ext.revenue() == before
move = Hotel({"A": (2, 100), "B": (2, 200)})
g1 = move.book("g", 1, 1, 3)
move.book("h", 1, 3, 5)
assert error_of(move.extend, g1, 4) == "ValueError: Room not free" and move.room_of(g1) == "A"
room_a = Hotel({"A": (2, 100)})
r = room_a.book("x", 1, 1, 3)
room_a.book("y", 1, 3, 4)
assert error_of(room_a.extend, r, 4) == "ValueError: Room not free"
assert error_of(room_a.extend, r, 3) == "ValueError: Bad dates"
assert room_a.bookings_of("x") == [("B1", "A", 1, 3)]
assert Hotel({"A": (1, 1)}).revenue() == 0''',
    solution=H3,
    hints=[
        r'''`cancel` needs the booking's price *before* deleting it, so call `quote` first, decide the refund from `check_in - today`, add `quote - refund` to a running `fees` total, and only then delete the booking.''',
        r'''Add `fees` to the revenue: revenue is the quotes of live bookings **plus** what cancellations kept. Cancelling must never make revenue go down by more than the refund.''',
        r'''For `extend`, check the room against every *other* booking: give `_free` an `ignore` parameter (the booking being extended), because its own old nights would otherwise count as a clash. Validate before changing, and change only `out`; the quote is derived from the booking, so it recomputes by itself.''',
    ],
    explanation=r'''**The idea.** Two more changes to the same class, and by now the design is paying off or hurting.

- **`cancel` changed its signature** (it now needs `today` and returns a number). That is a *breaking change* to every caller, which is why real systems add a new method or a default argument first. Here the statement says exactly what changes, so your job is to apply it cleanly.
- **`extend` reuses what exists.** It needs "is this room free for these nights?", which `_free` already answers; the only new thing is *ignoring the booking itself*, otherwise it conflicts with its own earlier nights. Adding an optional `ignore` argument is a small, local change.

**Derived values update by themselves.** `quote` computes the price from the booking each time, so extending a stay to 7 nights automatically earns the long-stay discount, with no code in `extend` about prices. If the price had been *stored* when booking, `extend` would have to remember to recompute it, which is a classic source of stale totals.

**Money that stays.** A cancellation with a partial refund leaves the hotel with a fee. If revenue were just "the sum of live bookings", cancelling would erase the fee. Keeping a separate `fees` counter makes the books balance: everything paid in is either a live booking, a refund, or a kept fee.

```mermaid
flowchart TD
    C[cancel with today] --> T{today >= check_in?}
    T -- yes --> E[Too late]
    T -- no --> D{days before}
    D -- 7 or more --> F[refund all]
    D -- 2 to 6 --> H[refund half]
    D -- 1 --> N[refund nothing]
    F --> K[fees += quote - refund]
    H --> K
    N --> K
```

**Looking back.** Three steps, one class, no rewrite. That is the standard to aim for when an interviewer says "now add...".

**Going further.** Make the refund rule a table (`[(7, 100), (2, 50), (0, 0)]`) instead of `if` branches. What would adding a "3 to 6 days: 75 %" rule cost?''',
),
]
