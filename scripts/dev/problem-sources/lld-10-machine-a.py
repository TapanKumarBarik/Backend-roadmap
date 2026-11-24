PROBLEMS = [
P(
    slug='lld-movie-ticket-booking', title='Movie Ticket Booking', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/16-movie-ticket-booking/README.md',
    description='Build a theater seat map where seats are held for a few minutes, then confirmed, released or lost when the hold expires.',
    statement=r'''Write a class `Theater` for one screening.

**Creating one:** `Theater(rows, seats_per_row, clock, hold_seconds=300)`.

- Seats are named by row letter and number: with `rows=2, seats_per_row=3` they are `A1 A2 A3 B1 B2 B3`.
- `clock` is a function that returns the current time in seconds. **Never read the real time**: call `clock()` whenever you need "now".
- A hold made at time `t` is **active** while `clock() < t + hold_seconds` and **expired** from `t + hold_seconds` on.

**Methods**

- `available()` returns the seats that are neither booked nor in an **active** hold, sorted.
- `hold(user, seats)` reserves all of `seats` for `user` and returns a hold id (`"H1"`, `"H2"`, ... in the order holds are made). It is **all or nothing**.
- `confirm(hold_id, user)` turns an active hold into bookings and returns the seats, sorted. The hold id stops existing.
- `release(hold_id, user)` gives the seats back. Releasing an **expired** hold is allowed and does nothing. The hold id stops existing.
- `bookings(user)` returns the user's confirmed seats, sorted.

**What is refused.** Raise `ValueError` with exactly this message, change nothing, and check in this order.

`hold`: no seats (empty list): `"No seats"`; more than 6 seats: `"Too many seats"`; a seat that does not exist: `"Unknown seat"`; a seat that is booked or held by an active hold: `"Seat unavailable"`. (The same seat listed twice is `"Seat unavailable"` too.)

`confirm` and `release`: unknown hold id: `"Unknown hold"`; someone else's hold: `"Not your hold"`; and, for `confirm` only, an expired hold: `"Hold expired"` (the hold stays on record, so asking again says the same).

**Example**

```
now = [0]
theater = Theater(2, 3, lambda: now[0])
hold = theater.hold("ann", ["A1", "A2"])     # "H1"
now[0] = 299
theater.confirm(hold, "ann")                 # ["A1", "A2"]
```''',
    starter=r'''class Theater:
    def __init__(self, rows, seats_per_row, clock, hold_seconds=300):
        ...

    def available(self):
        ...

    def hold(self, user, seats):
        ...

    def confirm(self, hold_id, user):
        ...

    def release(self, hold_id, user):
        ...

    def bookings(self, user):
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
theater = Theater(2, 3, clock)
assert theater.available() == ["A1", "A2", "A3", "B1", "B2", "B3"]
assert error_of(theater.hold, "ann", []) == "ValueError: No seats"
assert error_of(theater.hold, "ann", ["A1"] * 1 + ["A2", "A3", "B1", "B2", "B3", "A1"]) == "ValueError: Too many seats"
assert error_of(theater.hold, "ann", ["A1", "C1"]) == "ValueError: Unknown seat"
assert error_of(theater.hold, "ann", ["A9"]) == "ValueError: Unknown seat"
assert theater.available() == ["A1", "A2", "A3", "B1", "B2", "B3"]
assert error_of(theater.hold, "ann", ["A1", "A1"]) == "ValueError: Seat unavailable"
first = theater.hold("ann", ["A2", "A1"])
assert first == "H1" and theater.available() == ["A3", "B1", "B2", "B3"]
assert error_of(theater.hold, "bob", ["A3", "A1"]) == "ValueError: Seat unavailable"
assert error_of(theater.hold, "bob", ["A1", "C9"]) == "ValueError: Unknown seat"
assert theater.available() == ["A3", "B1", "B2", "B3"]
second = theater.hold("bob", ["B1"])
assert second == "H2"
assert error_of(theater.confirm, "H9", "ann") == "ValueError: Unknown hold"
assert error_of(theater.confirm, first, "bob") == "ValueError: Not your hold"
assert error_of(theater.release, first, "bob") == "ValueError: Not your hold"
assert error_of(theater.release, "H9", "ann") == "ValueError: Unknown hold"
clock.now = 299
assert theater.confirm(first, "ann") == ["A1", "A2"]
assert theater.bookings("ann") == ["A1", "A2"] and theater.bookings("bob") == []
assert error_of(theater.confirm, first, "ann") == "ValueError: Unknown hold"
assert error_of(theater.hold, "cy", ["A1"]) == "ValueError: Seat unavailable"
clock.now = 300
assert theater.available() == ["A3", "B1", "B2", "B3"]
assert error_of(theater.confirm, second, "bob") == "ValueError: Hold expired"
assert error_of(theater.confirm, second, "bob") == "ValueError: Hold expired"
assert error_of(theater.confirm, second, "cy") == "ValueError: Not your hold"
assert theater.bookings("bob") == []
third = theater.hold("cy", ["B1", "B2"])
assert third == "H3" and theater.available() == ["A3", "B3"]
assert theater.release(third, "cy") is None
assert theater.available() == ["A3", "B1", "B2", "B3"]
assert error_of(theater.confirm, third, "cy") == "ValueError: Unknown hold"
assert theater.release(second, "bob") is None
assert error_of(theater.confirm, second, "bob") == "ValueError: Unknown hold"
clock.now = 1000
fourth = theater.hold("dee", ["A3"])
clock.now = 1301
assert theater.available() == ["A3", "B1", "B2", "B3"]
assert theater.release(fourth, "dee") is None
short = Theater(1, 8, clock, hold_seconds=10)
short.hold("x", ["A1", "A2", "A3", "A4", "A5", "A6"])
assert error_of(short.hold, "y", ["A1"]) == "ValueError: Seat unavailable"
clock.now = 1311
assert short.available() == ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"]''',
    solution=r'''class Theater:
    def __init__(self, rows, seats_per_row, clock, hold_seconds=300):
        self._seats = {chr(ord("A") + r) + str(n) for r in range(rows) for n in range(1, seats_per_row + 1)}
        self._clock = clock
        self._hold_seconds = hold_seconds
        self._booked = {}
        self._holds = {}
        self._counter = 0

    def _active(self, hold):
        return self._clock() < hold[2]

    def _blocked(self):
        blocked = set(self._booked)
        for hold in self._holds.values():
            if self._active(hold):
                blocked.update(hold[1])
        return blocked

    def available(self):
        return sorted(self._seats - self._blocked())

    def hold(self, user, seats):
        if not seats:
            raise ValueError("No seats")
        if len(seats) > 6:
            raise ValueError("Too many seats")
        if any(seat not in self._seats for seat in seats):
            raise ValueError("Unknown seat")
        blocked = self._blocked()
        if len(set(seats)) != len(seats) or any(seat in blocked for seat in seats):
            raise ValueError("Seat unavailable")
        self._counter += 1
        hold_id = "H" + str(self._counter)
        self._holds[hold_id] = (user, list(seats), self._clock() + self._hold_seconds)
        return hold_id

    def _own(self, hold_id, user):
        if hold_id not in self._holds:
            raise ValueError("Unknown hold")
        hold = self._holds[hold_id]
        if hold[0] != user:
            raise ValueError("Not your hold")
        return hold

    def confirm(self, hold_id, user):
        hold = self._own(hold_id, user)
        if not self._active(hold):
            raise ValueError("Hold expired")
        del self._holds[hold_id]
        for seat in hold[1]:
            self._booked[seat] = user
        return sorted(hold[1])

    def release(self, hold_id, user):
        self._own(hold_id, user)
        del self._holds[hold_id]

    def bookings(self, user):
        return sorted(seat for seat, owner in self._booked.items() if owner == user)''',
    hints=[
        r'''Store each hold as `(user, seats, expires_at)` under its id. "Active" is only `clock() < expires_at`: nothing needs to remove an expired hold, so you never need a timer.''',
        r'''Compute the blocked seats on demand: everything booked plus the seats of every active hold. Then `available`, and the "seat unavailable" check in `hold`, are one line each.''',
        r'''Validate everything before you change anything (that is what makes `hold` all-or-nothing), and allocate the hold id only after the checks pass, so a refused hold does not use up `H1`.''',
    ],
    explanation=r'''**The idea.** Ticketing has a middle state that simple booking does not: *held*. A seat is free, held for a short while, then booked, or free again.

```mermaid
stateDiagram-v2
    [*] --> free
    free --> held: hold
    held --> booked: confirm
    held --> free: release
    held --> free: time passes
```

**Expiry without a timer.** The last transition has no method call: it happens because time passes. Rather than starting a background job that frees seats (hard to test, racy), each hold stores *when it expires* and every question is answered by comparing with `clock()`. The expired hold is simply ignored. That is called **lazy expiry**, and it is what makes the whole class testable with a fake clock.

**Inject the clock.** `clock` is a constructor argument, not a `time.time()` call inside the methods. A test moves a variable from 299 to 300 and checks the exact boundary; with the real clock it would have to sleep five minutes.

**All or nothing.** `hold` validates the whole request (count, existence, availability) before it records anything. A partial hold that fails halfway would block seats nobody owns.

**Real systems.** The same pattern is how a payment page keeps your seat for ten minutes. With many servers the "check then hold" would need a database transaction or an atomic compare-and-set; here one process makes it simple.

**Going further.** Add `extend(hold_id, user)` that gives a hold more time once. What should happen to an expired hold?''',
),

P(
    slug='lld-order-book', title='Order Book', topic='lld-machine-coding', difficulty='advanced',
    module='lld/21-lld-interview-playbook/README.md',
    description='Build the matching engine of an exchange: limit orders, price-time priority, partial fills, cancellation and market depth.',
    statement=r'''Write a class `OrderBook` for one instrument. Prices and quantities are positive integers.

**Method**

- `submit(side, price, quantity)` places a **limit order** and returns `(order_id, trades)`.
  - `side` is `"buy"` or `"sell"`. Order ids are `1, 2, 3, ...` in the order orders are submitted.
  - A **buy** matches against resting **sells** priced **at or below** its limit, cheapest first. A **sell** matches against resting **buys** priced **at or above** its limit, highest first. At the same price the **older order goes first** (price-time priority).
  - Each match is a trade `(price, quantity, resting_order_id)` and happens at the **resting order's price**. Trades are listed in the order they happen.
  - What is not filled **rests** in the book at its limit price.
- `cancel(order_id)` removes the unfilled part of a resting order and returns `True`. It returns `False` when the order is already filled, already cancelled, or never existed.
- `remaining(order_id)` is the unfilled quantity (`0` once filled or cancelled). An unknown id raises `ValueError("Unknown order")`.
- `best_bid` and `best_ask` are the best resting buy and sell prices, or `None`.
- `depth()` returns `{"bids": [...], "asks": [...]}`, each a list of `(price, total_quantity)`: bids from the **highest** price down, asks from the **lowest** price up. Prices with nothing resting are left out.

**What `submit` refuses.** `ValueError("Bad side")` for any other side, then `ValueError("Bad price or quantity")` for a price or quantity that is not an `int` of at least 1 (a `bool` is not). A refused order does **not** use up an id.

**Example**

```
book = OrderBook()
book.submit("sell", 101, 5)       # (1, [])
book.submit("sell", 100, 3)       # (2, [])
book.submit("buy", 101, 4)        # (3, [(100, 3, 2), (101, 1, 1)])
book.depth()                      # {"bids": [], "asks": [(101, 4)]}
```''',
    starter=r'''class OrderBook:
    def submit(self, side, price, quantity):
        """Return (order_id, trades)."""
        ...

    def cancel(self, order_id):
        ...

    def remaining(self, order_id):
        ...

    @property
    def best_bid(self):
        ...

    @property
    def best_ask(self):
        ...

    def depth(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
book = OrderBook()
assert book.best_bid is None and book.best_ask is None and book.depth() == {"bids": [], "asks": []}
assert error_of(book.submit, "hold", 10, 1) == "ValueError: Bad side"
assert error_of(book.submit, "buy", 0, 1) == "ValueError: Bad price or quantity"
assert error_of(book.submit, "buy", 10, 0) == "ValueError: Bad price or quantity"
assert error_of(book.submit, "buy", 10.5, 1) == "ValueError: Bad price or quantity"
assert error_of(book.submit, "buy", True, 1) == "ValueError: Bad price or quantity"
assert book.submit("sell", 101, 5) == (1, [])
assert book.submit("sell", 100, 3) == (2, [])
assert book.submit("sell", 101, 2) == (3, [])
assert (book.best_bid, book.best_ask) == (None, 100)
assert book.submit("buy", 99, 4) == (4, [])
assert book.best_bid == 99
assert book.depth() == {"bids": [(99, 4)], "asks": [(100, 3), (101, 7)]}
assert book.submit("buy", 101, 4) == (5, [(100, 3, 2), (101, 1, 1)])
assert book.remaining(1) == 4 and book.remaining(2) == 0 and book.remaining(5) == 0
assert book.depth() == {"bids": [(99, 4)], "asks": [(101, 6)]}
assert book.submit("buy", 101, 5) == (6, [(101, 4, 1), (101, 1, 3)])
assert book.remaining(3) == 1 and book.remaining(1) == 0
assert book.submit("buy", 105, 4) == (7, [(101, 1, 3)])
assert book.remaining(7) == 3 and book.depth() == {"bids": [(105, 3), (99, 4)], "asks": []}
assert book.best_bid == 105 and book.best_ask is None
assert book.submit("sell", 99, 10) == (8, [(105, 3, 7), (99, 4, 4)])
assert book.remaining(8) == 3 and book.best_ask == 99 and book.best_bid is None
assert book.cancel(8) is True and book.remaining(8) == 0 and book.depth() == {"bids": [], "asks": []}
assert book.cancel(8) is False and book.cancel(1) is False and book.cancel(99) is False
assert error_of(book.remaining, 99) == "ValueError: Unknown order"
assert book.submit("buy", 50, 1) == (9, [])
assert book.submit("buy", 50, 2) == (10, [])
assert book.submit("buy", 60, 1) == (11, [])
assert book.cancel(9) is True
assert book.depth() == {"bids": [(60, 1), (50, 2)], "asks": []}
assert book.submit("sell", 50, 3) == (12, [(60, 1, 11), (50, 2, 10)])
assert book.remaining(12) == 0 and book.depth() == {"bids": [], "asks": []}
fresh = OrderBook()
assert fresh.submit("sell", 10, 1) == (1, [])
assert fresh.submit("buy", 9, 1) == (2, [])
assert fresh.submit("buy", 10, 1) == (3, [(10, 1, 1)])
assert fresh.depth() == {"bids": [(9, 1)], "asks": []}''',
    solution=r'''class OrderBook:
    def __init__(self):
        self._next_id = 1
        self._orders = {}
        self._bids = []
        self._asks = []

    @staticmethod
    def _positive(value):
        return type(value) is int and value >= 1

    def submit(self, side, price, quantity):
        if side not in ("buy", "sell"):
            raise ValueError("Bad side")
        if not (self._positive(price) and self._positive(quantity)):
            raise ValueError("Bad price or quantity")
        order_id = self._next_id
        self._next_id += 1
        order = {"side": side, "price": price, "left": quantity}
        self._orders[order_id] = order
        trades = []
        book = self._asks if side == "buy" else self._bids
        while order["left"] > 0:
            resting = [(oid, o) for oid, o in book if o["left"] > 0]
            resting = [(oid, o) for oid, o in resting if (o["price"] <= price if side == "buy" else o["price"] >= price)]
            if not resting:
                break
            if side == "buy":
                oid, other = min(resting, key=lambda item: (item[1]["price"], item[0]))
            else:
                oid, other = min(resting, key=lambda item: (-item[1]["price"], item[0]))
            filled = min(order["left"], other["left"])
            order["left"] -= filled
            other["left"] -= filled
            trades.append((other["price"], filled, oid))
        if order["left"] > 0:
            (self._bids if side == "buy" else self._asks).append((order_id, order))
        return order_id, trades

    def cancel(self, order_id):
        order = self._orders.get(order_id)
        if order is None or order["left"] == 0:
            return False
        order["left"] = 0
        return True

    def remaining(self, order_id):
        if order_id not in self._orders:
            raise ValueError("Unknown order")
        return self._orders[order_id]["left"]

    def _levels(self, orders, descending):
        totals = {}
        for _, order in orders:
            if order["left"] > 0:
                totals[order["price"]] = totals.get(order["price"], 0) + order["left"]
        return sorted(totals.items(), reverse=descending)

    @property
    def best_bid(self):
        levels = self._levels(self._bids, True)
        return levels[0][0] if levels else None

    @property
    def best_ask(self):
        levels = self._levels(self._asks, False)
        return levels[0][0] if levels else None

    def depth(self):
        return {"bids": self._levels(self._bids, True), "asks": self._levels(self._asks, False)}''',
    hints=[
        r'''Keep two lists of resting orders (buys and sells). An order is a small record with its side, price and unfilled quantity; "resting" means unfilled quantity above zero.''',
        r'''To match a buy, pick the cheapest resting sell at or below the limit, breaking ties by the lower order id (older first). Trade at the **resting** order's price, then loop until the incoming order is filled or nothing matches.''',
        r'''Cancelling is just setting the unfilled quantity to 0: every other method already ignores orders with nothing left. Allocate the order id only after validation, so a refused order does not use one up.''',
    ],
    explanation=r'''**The idea.** An exchange keeps two queues: buyers who want the lowest price and sellers who want the highest. A new order is first matched against the opposite side; whatever is left waits its turn.

```mermaid
flowchart TD
    A[new order] --> B{opposite side has a price that crosses?}
    B -- yes --> C[trade at the resting order's price]
    C --> D{order fully filled?}
    D -- no --> B
    D -- yes --> F[done]
    B -- no --> E[rest in the book]
    E --> F
```

**Price-time priority.** Best price first; among equal prices, whoever arrived first. Using the order id as the tiebreaker works because ids grow with time.

**Trade at the resting price.** The order that was already waiting set the price; the newcomer accepts it. That is why a buy at 101 against a sell at 100 trades at 100: the buyer gets a better deal than asked.

**Cancel as a flag, not a delete.** Setting the remaining quantity to zero keeps every list valid and every id lookup working. Real engines delete lazily too.

**Complexity.** This version rescans the book on every match (O(n) per trade), which is fine to learn the rules. A production book uses a heap or a sorted map per side, with a queue per price level, for O(log n) per order.

**Going further.** Replace the lists with `heapq` keyed by `(price, id)`. What makes lazy deletion of cancelled orders tricky in a heap?''',
),

P(
    slug='lld-kv-transactions', title='Key-Value Store with Transactions', topic='lld-machine-coding', difficulty='advanced',
    module='lld/21-lld-interview-playbook/README.md',
    description='Build an in-memory key-value store with nested transactions: begin, commit all, roll back the latest, and count values.',
    statement=r'''Write a class `Store`, an in-memory key-value store with **nested transactions**.

**Methods**

- `set(key, value)` stores a value (a string or number).
- `get(key)` returns the value, or `None` when the key is not set.
- `delete(key)` removes the key. Deleting a key that is not set does nothing.
- `count(value)` returns how many keys currently hold that value. It must stay fast with many keys: a test stores 20,000 keys and asks for counts 20,000 times.
- `begin()` opens a new transaction, **inside** any already open one.
- `rollback()` undoes every change made since the **most recent** `begin()` and closes that transaction only. The outer ones stay open.
- `commit()` makes **all** open transactions permanent and closes them all.
- `rollback()` or `commit()` with no open transaction raises `ValueError("No transaction")`.

Changes made while a transaction is open are visible to `get` and `count` right away.

**Example**

```
db = Store()
db.set("a", 1)
db.begin()
db.set("a", 2)
db.begin()
db.delete("a")
db.get("a")          # None
db.rollback()
db.get("a")          # 2
db.rollback()
db.get("a")          # 1
```''',
    starter=r'''class Store:
    def set(self, key, value):
        ...

    def get(self, key):
        ...

    def delete(self, key):
        ...

    def count(self, value):
        ...

    def begin(self):
        ...

    def rollback(self):
        ...

    def commit(self):
        ...''',
    tests=r'''import time
def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
db = Store()
assert db.get("a") is None and db.count(1) == 0
assert error_of(db.rollback) == "ValueError: No transaction"
assert error_of(db.commit) == "ValueError: No transaction"
db.set("a", 1)
db.set("b", 1)
db.set("c", 2)
assert db.get("a") == 1 and db.count(1) == 2 and db.count(2) == 1 and db.count(3) == 0
db.set("a", 2)
assert db.count(1) == 1 and db.count(2) == 2
db.delete("zzz")
db.delete("b")
assert db.get("b") is None and db.count(1) == 0
db.set("b", 1)
db.set("b", 1)
assert db.count(1) == 1
db.begin()
db.set("a", 10)
db.delete("c")
db.set("d", 4)
assert (db.get("a"), db.get("c"), db.get("d")) == (10, None, 4)
assert db.count(2) == 0 and db.count(10) == 1
db.begin()
db.set("a", 20)
db.delete("a")
db.delete("d")
assert db.get("a") is None and db.get("d") is None
db.rollback()
assert (db.get("a"), db.get("d")) == (10, 4)
db.rollback()
assert (db.get("a"), db.get("c"), db.get("d")) == (2, 2, None)
assert db.count(2) == 2 and db.count(10) == 0 and db.count(4) == 0
assert error_of(db.rollback) == "ValueError: No transaction"
db.begin()
db.set("a", 7)
db.begin()
db.set("a", 8)
db.set("e", 5)
db.commit()
assert (db.get("a"), db.get("e")) == (8, 5)
assert error_of(db.rollback) == "ValueError: No transaction"
assert error_of(db.commit) == "ValueError: No transaction"
assert db.get("a") == 8
db.begin()
db.delete("a")
db.set("a", 9)
db.set("a", 8)
db.rollback()
assert db.get("a") == 8 and db.count(8) == 1 and db.count(9) == 0
db.begin()
db.set("new", 1)
db.rollback()
assert db.get("new") is None and db.count(1) == 1
db.begin()
db.delete("a")
db.rollback()
assert db.get("a") == 8
big = Store()
started = time.time()
for i in range(20000):
    big.set(i, i % 10)
big.begin()
for i in range(20000):
    assert big.count(i % 10) == 2000
big.rollback()
assert time.time() - started < 5''',
    solution=r'''class Store:
    _MISSING = object()

    def __init__(self):
        self._data = {}
        self._counts = {}
        self._undo = []

    def _put(self, key, value):
        """Change one key (value MISSING deletes it) and keep the counts right; return the old value."""
        old = self._data.get(key, self._MISSING)
        if old is not self._MISSING:
            self._counts[old] -= 1
        if value is self._MISSING:
            self._data.pop(key, None)
        else:
            self._data[key] = value
            self._counts[value] = self._counts.get(value, 0) + 1
        return old

    def set(self, key, value):
        old = self._put(key, value)
        if self._undo:
            self._undo[-1].setdefault(key, old)

    def get(self, key):
        return self._data.get(key)

    def delete(self, key):
        old = self._put(key, self._MISSING)
        if self._undo:
            self._undo[-1].setdefault(key, old)

    def count(self, value):
        return self._counts.get(value, 0)

    def begin(self):
        self._undo.append({})

    def rollback(self):
        if not self._undo:
            raise ValueError("No transaction")
        for key, old in self._undo.pop().items():
            self._put(key, old)

    def commit(self):
        if not self._undo:
            raise ValueError("No transaction")
        self._undo.clear()''',
    hints=[
        r'''Keep a main dictionary and a stack of *undo logs*, one dictionary per open transaction. The first time a transaction touches a key, record that key's old value (or "was missing") in the top log; later changes to the same key must not overwrite that record.''',
        r'''`rollback` pops the top log and puts every old value back. `commit` just empties the stack: the changes are already in the main dictionary.''',
        r'''For a fast `count`, keep a second dictionary from value to how many keys hold it, and update it in one place (a single helper that every `set`, `delete` and rollback goes through).''',
    ],
    explanation=r'''**The idea.** There are two ways to support transactions. You can copy the whole store at `begin()` (simple, O(n) per transaction), or write changes straight into the store and remember how to *undo* them. This solution does the second, so `begin` is O(1) and a transaction costs only as much as it changes.

**The undo log.** Each open transaction has a dictionary `key -> value before this transaction first touched it` (with a marker for "did not exist"). `setdefault` is the important call: the *first* old value is the one to restore, even if the key is changed five times.

```mermaid
flowchart LR
    S[set / delete] --> W[write to the main data]
    S --> L[record the old value in the top log, once per key]
    R[rollback] --> P[pop the top log]
    P --> U[write its old values back]
    C[commit] --> E[clear every log]
```

**One place that writes.** `count` needs a second index (value to number of keys). If `set`, `delete` and `rollback` each updated it by hand, one of them would eventually forget. A single `_put` helper makes the index correct by construction, and rollback reuses it.

**Complexity.** `set`, `get`, `delete`, `count`, `begin` are O(1); `rollback` is O(keys changed in that transaction); `commit` is O(1) amortised.

**Going further.** Real databases make `commit` close only the innermost transaction (a *savepoint*). What would you change so that `commit` merges the top log into its parent instead of discarding everything?''',
),

P(
    slug='lld-spreadsheet', title='Spreadsheet Cells', topic='lld-machine-coding', difficulty='advanced',
    module='lld/21-lld-interview-playbook/README.md',
    description='Build a tiny spreadsheet where cells hold numbers or formulas, dependents update automatically and circular references are refused.',
    statement=r'''Write a class `Sheet` of cells named like `A1` (a letter `A` to `Z` and a row `1` to `99`).

**Methods**

- `set(cell, text)` stores a cell. `text` is either a **number** written as text (`"5"`, `"-2"`, `"3.5"`) or a **formula** that starts with `=`.
- `get(cell)` is the cell's value as a number. An empty cell is `0`.
- `text(cell)` is exactly what was stored (`""` for an empty cell).

**Formulas.** After the `=`, one or more **terms** joined by `+` or `-`, with no spaces. A term is a number, a cell name (`B2`), or `SUM(A1:A3)`, the sum of the **rectangle** between two cells (inclusive). Examples: `=A1+B1-2`, `=SUM(A1:B2)+C1`.

A cell that uses another cell always shows its **current** value: changing `A1` changes `B1 = A1+1` without anyone setting `B1` again.

**What `set` refuses.** Raise `ValueError` with exactly this message and change **nothing** (the cell keeps its old text):

1. a cell name that is not `A1` to `Z99`: `"Bad cell"`
2. text that is not a valid number or formula: `"Bad formula"` (a reference to a bad cell name counts)
3. a formula that depends on itself, directly or through other cells (a range counts): `"Circular reference"`

Setting a cell to `""` empties it.

**Example**

```
sheet = Sheet()
sheet.set("A1", "10")
sheet.set("A2", "5")
sheet.set("B1", "=SUM(A1:A2)+1")     # 16
sheet.set("A1", "20")
sheet.get("B1")                      # 26
```''',
    starter=r'''class Sheet:
    def set(self, cell, text):
        ...

    def get(self, cell):
        ...

    def text(self, cell):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
sheet = Sheet()
assert sheet.get("A1") == 0 and sheet.text("A1") == ""
sheet.set("A1", "10")
sheet.set("A2", "5")
sheet.set("B1", "=SUM(A1:A2)+1")
assert sheet.get("B1") == 16 and sheet.text("B1") == "=SUM(A1:A2)+1"
sheet.set("A1", "20")
assert sheet.get("B1") == 26
sheet.set("C1", "=B1-A2-1.5")
assert sheet.get("C1") == 19.5
sheet.set("A1", "30")
assert sheet.get("C1") == 29.5 and sheet.get("A1") == 30
sheet.set("D3", "-2")
assert sheet.get("D3") == -2
sheet.set("D1", "=7")
sheet.set("D2", "=D1+D1+A9")
assert sheet.get("D2") == 14
sheet.set("E1", "1")
sheet.set("E2", "2")
sheet.set("F1", "3")
sheet.set("F2", "4")
sheet.set("G1", "=SUM(E1:F2)")
assert sheet.get("G1") == 10
sheet.set("G2", "=SUM(F2:E1)+0")
assert sheet.get("G2") == 10
assert error_of(sheet.set, "a1", "5") == "ValueError: Bad cell"
assert error_of(sheet.set, "A0", "5") == "ValueError: Bad cell"
assert error_of(sheet.set, "A100", "5") == "ValueError: Bad cell"
assert error_of(sheet.set, "1A", "5") == "ValueError: Bad cell"
assert error_of(sheet.set, "A1", "abc") == "ValueError: Bad formula"
assert error_of(sheet.set, "A1", "=") == "ValueError: Bad formula"
assert error_of(sheet.set, "A1", "=A1+") == "ValueError: Bad formula"
assert error_of(sheet.set, "A1", "=a1+1") == "ValueError: Bad formula"
assert error_of(sheet.set, "A1", "=Z100+1") == "ValueError: Bad formula"
assert error_of(sheet.set, "A1", "=SUM(A1)") == "ValueError: Bad formula"
assert error_of(sheet.set, "A1", "=1 + 2") == "ValueError: Bad formula"
assert sheet.text("A1") == "30" and sheet.get("A1") == 30
assert error_of(sheet.set, "A1", "=A1") == "ValueError: Circular reference"
assert error_of(sheet.set, "A1", "=C1+1") == "ValueError: Circular reference"
assert error_of(sheet.set, "A2", "=SUM(A1:B1)") == "ValueError: Circular reference"
assert error_of(sheet.set, "E1", "=SUM(E1:F2)") == "ValueError: Circular reference"
assert sheet.text("A1") == "30" and sheet.text("A2") == "5" and sheet.get("C1") == 29.5
sheet.set("H1", "=H2")
sheet.set("H2", "")
assert sheet.get("H1") == 0 and sheet.text("H2") == ""
sheet.set("H2", "=H3+1")
assert error_of(sheet.set, "H3", "=H1") == "ValueError: Circular reference"
sheet.set("H3", "=E1")
assert sheet.get("H1") == 2
sheet.set("A1", "")
assert sheet.get("A1") == 0 and sheet.get("B1") == 6
sheet.set("Z99", "=A1+1")
assert sheet.get("Z99") == 1''',
    solution=r'''import re


class Sheet:
    _CELL = re.compile(r"^[A-Z]([1-9][0-9]?)$")
    _TERM = re.compile(r"^(?:(-?\d+(?:\.\d+)?)|([A-Z][0-9]{1,3})|SUM\(([A-Z][0-9]{1,3}):([A-Z][0-9]{1,3})\))$")

    def __init__(self):
        self._text = {}

    @classmethod
    def _check_cell(cls, name):
        if not isinstance(name, str) or not cls._CELL.match(name):
            raise ValueError("Bad cell")

    @staticmethod
    def _number(text):
        try:
            return float(text) if "." in text else int(text)
        except ValueError:
            return None

    @classmethod
    def _terms(cls, formula):
        """Split '=A1+B1-2' into [(sign, term), ...] or raise Bad formula."""
        body = formula[1:]
        parts = re.findall(r"([+-]?)([^+-]+)", body) if not body.startswith("-") else None
        if not body or parts is None or "".join(a + b for a, b in parts) != body or parts[0][0] != "":
            raise ValueError("Bad formula")
        return [(-1 if sign == "-" else 1, term) for sign, term in parts]

    @classmethod
    def _expand(cls, term):
        """Return ('number', n) or ('cells', [names])."""
        match = cls._TERM.match(term)
        if not match:
            raise ValueError("Bad formula")
        number, single, start, end = match.groups()
        if number is not None:
            return "number", cls._number(number)
        if single is not None:
            cls._formula_cell(single)
            return "cells", [single]
        cls._formula_cell(start)
        cls._formula_cell(end)
        c1, c2 = sorted((start[0], end[0]))
        r1, r2 = sorted((int(start[1:]), int(end[1:])))
        return "cells", [chr(c) + str(r) for c in range(ord(c1), ord(c2) + 1) for r in range(r1, r2 + 1)]

    @classmethod
    def _formula_cell(cls, name):
        if not cls._CELL.match(name):
            raise ValueError("Bad formula")

    def _references(self, text):
        """The cells a text depends on, validating it on the way."""
        if text == "":
            return []
        if not text.startswith("="):
            if self._number(text) is None:
                raise ValueError("Bad formula")
            return []
        refs = []
        for _, term in self._terms(text):
            kind, value = self._expand(term)
            if kind == "cells":
                refs.extend(value)
        return refs

    def _reaches(self, start, target, seen):
        if start == target:
            return True
        if start in seen:
            return False
        seen.add(start)
        return any(self._reaches(ref, target, seen) for ref in self._references(self._text.get(start, "")))

    def set(self, cell, text):
        self._check_cell(cell)
        refs = self._references(text)
        if any(self._reaches(ref, cell, set()) for ref in refs):
            raise ValueError("Circular reference")
        if text == "":
            self._text.pop(cell, None)
        else:
            self._text[cell] = text

    def text(self, cell):
        return self._text.get(cell, "")

    def get(self, cell):
        text = self._text.get(cell, "")
        if text == "":
            return 0
        if not text.startswith("="):
            return self._number(text)
        total = 0
        for sign, term in self._terms(text):
            kind, value = self._expand(term)
            total += sign * (value if kind == "number" else sum(self.get(name) for name in value))
        return total''',
    hints=[
        r'''Store only the text of each cell. `get` evaluates on demand: a number is itself, a formula is the sum of its terms, and a cell reference calls `get` on that cell, so changes flow through for free.''',
        r'''Write one function that lists the cells a text depends on (expanding `SUM(A1:B2)` into every cell in the rectangle) and validates the text at the same time. `set` and `get` can both use it.''',
        r'''Circular check in `set`: before storing, look for a path from any referenced cell back to the cell you are setting (a depth-first search with a `seen` set). If there is one, raise and store nothing.''',
    ],
    explanation=r'''**The idea.** A spreadsheet is a graph. Each formula cell points at the cells it reads. Keeping a value cached and updating dependents is one design; **computing on demand from the stored text** is the simplest, and nothing can go stale.

```mermaid
flowchart LR
    A1 --> B1["B1 = SUM(A1:A2)+1"]
    A2 --> B1
    B1 --> C1["C1 = B1-A2-1.5"]
    A2 --> C1
```

**Validate, then store.** `set` computes the references (which also validates the text), checks for a cycle, and only then writes. A refused edit leaves the sheet exactly as it was.

**Why cycles matter.** If `A1 = B1` and `B1 = A1` were allowed, `get` would recurse forever. Checking at `set` time is the right place: the error belongs to the person who just typed the formula, not to whoever reads the cell later.

**Depth-first search.** "Can I get from this reference back to the cell I am setting?" is a graph reachability question. The `seen` set keeps it from revisiting cells, so a sheet with shared dependencies stays fast.

**Complexity.** `get` is O(size of the dependency tree); with caching and a topological order it could be O(1) per read.

**Going further.** Cache each value and mark only the *dependents* of a changed cell as dirty. Which structure do you need that this solution does not have? (A reverse graph: cell to the cells that read it.)''',
),

P(
    slug='lld-url-shortener', title='URL Shortener', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/21-lld-interview-playbook/README.md',
    description='Build a URL shortener with base-62 codes, custom aliases, expiring links, click counts and the same short link for the same address.',
    statement=r'''Write a class `Shortener` that turns long addresses into short ones.

**Creating one:** `Shortener(clock, base="https://sho.rt/")`. `clock` is a function that returns the current time in seconds (never read the real time).

**Methods**

- `shorten(url, alias=None, ttl=None)` returns the **short URL**: `base` followed by a **code**.
  - Without an `alias` the code comes from a counter that starts at `1` and grows by one for every new link, written in **base 62** with the digits `0-9`, then `a-z`, then `A-Z` and **no leading zeros**: `1` is `"1"`, `10` is `"a"`, `61` is `"Z"`, `62` is `"10"`. A code that is already taken by an alias is **skipped** (the counter moves on).
  - With an `alias` the code is the alias.
  - `ttl` is how many seconds the link lives; the link is dead from `created + ttl` on. `None` means forever.
  - Shortening the **same URL again** with no alias and no ttl returns the **same** short URL and does not use up a counter value.
- `resolve(short)` returns the long URL and counts one click. `short` is either a full short URL (starting with `base`) or just the code.
- `clicks(code)` returns the number of successful resolves.

**What is refused.** `ValueError` with exactly this message, nothing changes, checked in this order:

`shorten`: a url that does not start with `http://` or `https://`: `"Bad URL"`; an alias that is not 3 to 16 letters or digits: `"Bad alias"`; an alias already used (even by an expired link): `"Alias taken"`.

`resolve`: a code that does not exist: `"Unknown code"`; a dead link: `"Link expired"` (it does not count a click).

`clicks` of an unknown code: `"Unknown code"`.

**Example**

```
s = Shortener(lambda: 0)
s.shorten("https://example.com/a")              # "https://sho.rt/1"
s.shorten("https://example.com/b", alias="docs") # "https://sho.rt/docs"
s.resolve("https://sho.rt/1")                    # "https://example.com/a"
```''',
    starter=r'''class Shortener:
    def __init__(self, clock, base="https://sho.rt/"):
        ...

    def shorten(self, url, alias=None, ttl=None):
        ...

    def resolve(self, short):
        ...

    def clicks(self, code):
        ...''',
    tests=r'''def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Clock:
    def __init__(self):
        self.now = 0
    def __call__(self):
        return self.now
clock = Clock()
s = Shortener(clock)
assert s.shorten("https://example.com/a") == "https://sho.rt/1"
assert s.shorten("https://example.com/b") == "https://sho.rt/2"
assert s.shorten("https://example.com/a") == "https://sho.rt/1"
assert s.shorten("https://example.com/c") == "https://sho.rt/3"
assert s.resolve("https://sho.rt/1") == "https://example.com/a"
assert s.resolve("2") == "https://example.com/b"
assert s.resolve("2") == "https://example.com/b"
assert s.clicks("2") == 2 and s.clicks("1") == 1 and s.clicks("3") == 0
assert error_of(s.shorten, "ftp://x.com") == "ValueError: Bad URL"
assert error_of(s.shorten, "example.com") == "ValueError: Bad URL"
assert error_of(s.shorten, "bad", alias="a!") == "ValueError: Bad URL"
assert error_of(s.shorten, "https://x.com", alias="ab") == "ValueError: Bad alias"
assert error_of(s.shorten, "https://x.com", alias="a" * 17) == "ValueError: Bad alias"
assert error_of(s.shorten, "https://x.com", alias="my link") == "ValueError: Bad alias"
assert error_of(s.shorten, "https://x.com", alias="my-link") == "ValueError: Bad alias"
assert s.shorten("https://example.com/a", alias="docs") == "https://sho.rt/docs"
assert s.shorten("https://example.com/a") == "https://sho.rt/1"
assert error_of(s.shorten, "https://other.com", alias="docs") == "ValueError: Alias taken"
assert s.resolve("docs") == "https://example.com/a" and s.clicks("docs") == 1
assert error_of(s.resolve, "nope") == "ValueError: Unknown code"
assert error_of(s.resolve, "https://sho.rt/nope") == "ValueError: Unknown code"
assert error_of(s.clicks, "nope") == "ValueError: Unknown code"
t = Shortener(clock, base="http://s/")
for n in range(1, 10):
    t.shorten("https://x.com/" + str(n))
assert t.shorten("https://x.com/10") == "http://s/a"
for n in range(12, 62):
    t.shorten("https://x.com/" + str(n))
assert t.shorten("https://x.com/62") == "http://s/Z"
assert t.shorten("https://x.com/63") == "http://s/10"
assert t.shorten("https://x.com/64") == "http://s/11"
v = Shortener(clock)
v.shorten("https://x.com/alias", alias="100")
for n in range(1, 3844):
    v.shorten("https://x.com/n" + str(n))
assert v.shorten("https://x.com/next") == "https://sho.rt/101"
assert v.resolve("100") == "https://x.com/alias"
u = Shortener(clock)
assert u.shorten("https://x.com/2") == "https://sho.rt/1"
assert u.shorten("https://x.com/3") == "https://sho.rt/2"
clock.now = 100
u.shorten("https://x.com/temp", alias="temp", ttl=60)
clock.now = 159
assert u.resolve("temp") == "https://x.com/temp" and u.clicks("temp") == 1
clock.now = 160
assert error_of(u.resolve, "temp") == "ValueError: Link expired"
assert u.clicks("temp") == 1
assert error_of(u.shorten, "https://y.com", alias="temp") == "ValueError: Alias taken"
first = u.shorten("https://x.com/limited", ttl=10)
assert first == "https://sho.rt/3"
assert u.shorten("https://x.com/limited", ttl=10) == "https://sho.rt/4"
assert u.shorten("https://x.com/limited") == "https://sho.rt/5"
assert u.shorten("https://x.com/limited") == "https://sho.rt/5"
assert u.shorten("https://x.com/2", ttl=5) == "https://sho.rt/6"''',
    solution=r'''import re


class Shortener:
    _ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

    def __init__(self, clock, base="https://sho.rt/"):
        self._clock = clock
        self._base = base
        self._links = {}
        self._counter = 0
        self._by_url = {}

    @classmethod
    def _encode(cls, number):
        digits = ""
        while number:
            number, rest = divmod(number, 62)
            digits = cls._ALPHABET[rest] + digits
        return digits

    def shorten(self, url, alias=None, ttl=None):
        if not url.startswith(("http://", "https://")):
            raise ValueError("Bad URL")
        if alias is not None:
            if not re.fullmatch(r"[A-Za-z0-9]{3,16}", alias):
                raise ValueError("Bad alias")
            if alias in self._links:
                raise ValueError("Alias taken")
            code = alias
        else:
            if ttl is None and url in self._by_url:
                return self._base + self._by_url[url]
            while True:
                self._counter += 1
                code = self._encode(self._counter)
                if code not in self._links:
                    break
            if ttl is None:
                self._by_url[url] = code
        expires = None if ttl is None else self._clock() + ttl
        self._links[code] = {"url": url, "expires": expires, "clicks": 0}
        return self._base + code

    def _code(self, short):
        return short[len(self._base):] if short.startswith(self._base) else short

    def resolve(self, short):
        code = self._code(short)
        link = self._links.get(code)
        if link is None:
            raise ValueError("Unknown code")
        if link["expires"] is not None and self._clock() >= link["expires"]:
            raise ValueError("Link expired")
        link["clicks"] += 1
        return link["url"]

    def clicks(self, code):
        link = self._links.get(self._code(code))
        if link is None:
            raise ValueError("Unknown code")
        return link["clicks"]''',
    hints=[
        r'''One dictionary from code to a small record (`url`, `expires`, `clicks`). Keep a second dictionary from URL to its auto-generated code for the "same URL, same link" rule, only for links with no alias and no ttl.''',
        r'''Base 62 is repeated division: `divmod(n, 62)` gives the next digit from the right. Stop when the number is 0 so there are no leading zeros. To skip taken codes, keep drawing from the counter until the code is free.''',
        r'''Validate in the stated order (URL, alias format, alias taken) before touching the counter. An expired link must **not** count a click, and its code stays taken.''',
    ],
    explanation=r'''**The idea.** A shortener is a dictionary with a clever key. The code *is* the key, and the whole design is deciding where the key comes from.

**Counter plus base 62.** A counter gives short, unique codes with no collisions to retry. Base 62 keeps them compact: six characters already cover 56 billion links. Its weakness is that codes are guessable in order; production systems often mix in a random or hashed part.

**Aliases share the namespace.** A custom alias and a generated code live in the same dictionary, so the generator must *skip* codes that an alias already took, and an alias is refused when anything uses it. That one shared namespace is the rule most people forget.

**Idempotence.** Shortening the same address twice returning the same link is a design choice, and it only makes sense for links that cannot differ: with an alias or a lifetime, two requests really are different, so those always create a new link.

**Lazy expiry.** As in any cache, an expired link is not deleted by a timer; it is *detected* on use by comparing with `clock()`. The code remains reserved so it cannot be re-issued to someone else.

**Complexity.** Everything is O(1) apart from the base-62 encoding, which is O(log n).

**Going further.** Making the counter thread-safe and spread over many servers is the real design question. How would you give each server its own block of numbers?''',
),
]
