PROBLEMS = [
P(
    slug='lld-testable-retry-client', title='Make the Retry Client Testable', topic='lld-testable-design', difficulty='intermediate',
    module='lld/05-core-design-principles/README.md',
    description='Refactor an API client that sleeps, rolls random jitter and calls the network itself so its transport, sleep and randomness can be injected.',
    statement=r'''`ApiClient.get(url)` works: it calls the network, and when the connection fails it waits and tries again. But it is **untestable**: a test would really sleep for several seconds, cannot know the random jitter, and cannot make the network fail on purpose. **Change the design so everything it depends on can be replaced, without changing what it does.**

**Creating one:** `ApiClient(transport=None, sleep=None, rng=None, attempts=3, base=2)`

- `transport(url)` fetches a URL and returns the body. `None` means the module's `_http_get`.
- `sleep(seconds)` waits. `None` means `time.sleep`.
- `rng()` returns a random number from 0 up to 1. `None` means `random.random`.
- The three defaults are looked up **when the client is created** (so replacing `time.sleep` before that is enough to change what a default client does).
- `attempts` is how many times it tries in total; below 1 raises `ValueError("attempts must be at least 1")`. `base` is the growth of the wait.

**`get(url)`**

- Returns whatever `transport(url)` returns.
- If `transport` raises a **`ConnectionError`**, wait and try again: after the n-th failed attempt (n = 1, 2, ...) call `sleep(base ** n + rng())`. There is **no wait after the last** attempt: the last `ConnectionError` is raised.
- Any **other** exception is raised at once: no wait, no retry.
- `rng()` is called exactly once per wait.

**Example**

```
client = ApiClient(transport=flaky, sleep=waits.append, rng=lambda: 0.5)
client.get("/users")      # fails twice, then works
waits                     # [2.5, 4.5]
```''',
    starter=r'''import random
import time


def _http_get(url):
    """The real network call (not available in this sandbox)."""
    raise ConnectionError("network is not available here")


class ApiClient:
    def get(self, url):
        last = None
        for attempt in range(1, 4):
            try:
                return _http_get(url)
            except ConnectionError as error:
                last = error
                if attempt < 3:
                    time.sleep(2 ** attempt + random.random())
        raise last''',
    tests=r'''import random
import time
def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def flaky(failures, body="body"):
    state = {"calls": 0, "urls": []}
    def transport(url):
        state["calls"] += 1
        state["urls"].append(url)
        if state["calls"] <= failures:
            raise ConnectionError("down " + str(state["calls"]))
        return body
    transport.state = state
    return transport
waits = []
transport = flaky(2)
client = ApiClient(transport=transport, sleep=waits.append, rng=lambda: 0.5)
assert client.get("/users") == "body"
assert waits == [2.5, 4.5] and transport.state["calls"] == 3 and transport.state["urls"] == ["/users"] * 3
del waits[:]
assert ApiClient(transport=flaky(0), sleep=waits.append, rng=lambda: 0.5).get("/x") == "body" and waits == []
dead = flaky(9)
assert error_of(ApiClient(transport=dead, sleep=waits.append, rng=lambda: 0.25).get, "/y") == "ConnectionError: down 3"
assert waits == [2.25, 4.25] and dead.state["calls"] == 3
del waits[:]
single = flaky(9)
assert error_of(ApiClient(transport=single, sleep=waits.append, rng=lambda: 0.5, attempts=1).get, "/z") == "ConnectionError: down 1"
assert waits == [] and single.state["calls"] == 1
five = flaky(4)
assert ApiClient(transport=five, sleep=waits.append, rng=lambda: 0.0, attempts=5, base=3).get("/f") == "body"
assert waits == [3.0, 9.0, 27.0, 81.0] and five.state["calls"] == 5
del waits[:]
def broken(url):
    raise ValueError("bad url " + url)
assert error_of(ApiClient(transport=broken, sleep=waits.append, rng=lambda: 0.5).get, "/q") == "ValueError: bad url /q"
assert waits == []
def times_out(url):
    raise TimeoutError("slow")
assert error_of(ApiClient(transport=times_out, sleep=waits.append, rng=lambda: 0.5).get, "/t") == "TimeoutError: slow"
assert waits == []
draws = []
def counting_rng():
    draws.append(1)
    return 0.1
ApiClient(transport=flaky(2), sleep=waits.append, rng=counting_rng).get("/c")
assert len(draws) == 2
assert error_of(ApiClient, None, None, None, 0) == "ValueError: attempts must be at least 1"
assert error_of(lambda: ApiClient(attempts=0)) == "ValueError: attempts must be at least 1"
assert ApiClient(attempts=1) is not None
real_sleep, real_random, real_get = time.sleep, random.random, _http_get
slept, elsewhere = [], []
time.sleep = slept.append
random.random = lambda: 0.5
_http_get = flaky(2, "from the default transport")
try:
    default_client = ApiClient()
    time.sleep = elsewhere.append
    random.random = lambda: 0.9
    default_result = default_client.get("/d")
finally:
    time.sleep, random.random, _http_get = real_sleep, real_random, real_get
assert default_result == "from the default transport"
assert slept == [2.5, 4.5] and elsewhere == []
assert error_of(ApiClient(sleep=lambda s: None, rng=lambda: 0).get, "/real") == "ConnectionError: network is not available here"
assert error_of(ApiClient(transport=flaky(1), sleep=lambda s: None).get, "/r") is None''',
    solution=r'''import random
import time


def _http_get(url):
    """The real network call (not available in this sandbox)."""
    raise ConnectionError("network is not available here")


class ApiClient:
    def __init__(self, transport=None, sleep=None, rng=None, attempts=3, base=2):
        if attempts < 1:
            raise ValueError("attempts must be at least 1")
        self._transport = transport if transport is not None else _http_get
        self._sleep = sleep if sleep is not None else time.sleep
        self._rng = rng if rng is not None else random.random
        self._attempts = attempts
        self._base = base

    def get(self, url):
        for attempt in range(1, self._attempts + 1):
            try:
                return self._transport(url)
            except ConnectionError:
                if attempt == self._attempts:
                    raise
                self._sleep(self._base ** attempt + self._rng())''',
    hints=[
        r'''Take the three collaborators (the network call, the sleep, the random numbers) as constructor arguments and keep them on `self`. `get` then only ever calls `self._transport`, `self._sleep` and `self._rng`: no `time.` or `random.` inside it.''',
        r'''A default is just "use the real one when nothing is given": `transport if transport is not None else _http_get`, evaluated in `__init__` (not in the `def` line, which would freeze the value when the class is defined).''',
        r'''Retry only on `ConnectionError`; every other exception passes straight through. Re-raise on the last attempt with a bare `raise` instead of sleeping first.''',
    ],
    explanation=r'''**The idea.** The original is a good algorithm hidden inside a bad dependency structure. Three things it reaches for (`_http_get`, `time.sleep`, `random.random`) are hidden inputs and outputs, so no test can control or observe them.

```mermaid
flowchart LR
    subgraph before["before"]
        G1[ApiClient.get] --> N1[network]
        G1 --> S1[time.sleep]
        G1 --> R1[random]
    end
    subgraph after["after"]
        G2[ApiClient.get] --> T[transport]
        G2 --> S2[sleep]
        G2 --> R2[rng]
        T -.default.-> N2[network]
        S2 -.default.-> S3[time.sleep]
        R2 -.default.-> R3[random.random]
    end
```

**Dependency injection.** The class stops *creating* what it needs and is *given* it. In production you pass nothing and get the real thing; in a test you pass a fake transport that fails on cue, a `sleep` that just records the number, and an `rng` that always returns 0.5. The 2.5 and 4.5 in the tests are now exact, instead of "somewhere between 2 and 3".

**Default at construction, not at definition.** `def __init__(self, sleep=time.sleep)` would freeze `time.sleep` when the class is defined, and replacing it later would have no effect. Choosing the default inside `__init__` keeps the real behaviour *and* lets a test (or a framework) swap it.

**Seams.** A *seam* is a place where you can change behaviour without editing the code. Each constructor argument is one. The original had none, so there was no way in.

**Behaviour preserved.** The refactor must not change what the client does: same waits (`2 ** n + jitter`), no wait after the last try, the last error re-raised. The default-client test at the end proves the real wiring still works, with the module's functions swapped for fakes.

**Going further.** The retry rule ("which errors, how long") could itself be an object: a `RetryPolicy`. When would that be worth it?''',
),

P(
    slug='lld-testable-order-service', title='Make the Order Service Testable', topic='lld-testable-design', difficulty='advanced',
    module='lld/05-core-design-principles/README.md',
    description='Refactor an order service that builds its own database, payment gateway and mailer so each can be replaced by a fake that records what happened.',
    statement=r'''`OrderService.place(user, items)` works, but it creates its own `Database`, `PaymentGateway` and `SmtpMailer` inside the method, and none of them is available to a test. **Change the design so the three collaborators are passed in, without changing what `place` does.**

**Creating one:** `OrderService(db=None, gateway=None, mailer=None)`. `None` means the original: `Database()`, `PaymentGateway()` and `SmtpMailer()` (create them when the service is created). Every use of a collaborator must go through the object that was given.

**`place(user, items)`**, where `items` maps a product code to a quantity, must do exactly this, **in this order**, for each product in the order of `items`:

1. `db.find_price(sku)`; `None` means `ValueError("Unknown product")`;
2. `db.stock(sku)`; less than the quantity means `ValueError("Out of stock: " + sku)`.

Then, with `total` the sum of `price * quantity`:

3. `gateway.charge(user, total)`; a falsy answer means `ValueError("Payment declined")`;
4. `order_id = db.save_order({"user": user, "items": dict(items), "total": total})`;
5. `db.reserve(sku, quantity)` for each product, in order;
6. `mailer.send(user, "Your order " + str(order_id), "Total: " + str(total))`.

It returns `order_id`. Any refusal stops everything **before** the next step: a declined payment saves nothing and sends no mail, an unknown product charges nothing.

An empty `items` is **not** special: it charges 0 and goes on.

**Example**

```
service = OrderService(db=FakeDb(), gateway=FakeGateway(), mailer=FakeMailer())
service.place("asha", {"pen": 2})      # order id from FakeDb.save_order
```''',
    starter=r'''class Database:
    def find_price(self, sku):
        raise RuntimeError("the real database is not available here")

    def stock(self, sku):
        raise RuntimeError("the real database is not available here")

    def save_order(self, order):
        raise RuntimeError("the real database is not available here")

    def reserve(self, sku, quantity):
        raise RuntimeError("the real database is not available here")


class PaymentGateway:
    def charge(self, user, cents):
        raise RuntimeError("the real payment gateway is not available here")


class SmtpMailer:
    def send(self, to, subject, body):
        raise RuntimeError("the real mail server is not available here")


class OrderService:
    def place(self, user, items):
        db, gateway, mailer = Database(), PaymentGateway(), SmtpMailer()
        total = 0
        for sku, quantity in items.items():
            price = db.find_price(sku)
            if price is None:
                raise ValueError("Unknown product")
            if db.stock(sku) < quantity:
                raise ValueError("Out of stock: " + sku)
            total += price * quantity
        if not gateway.charge(user, total):
            raise ValueError("Payment declined")
        order_id = db.save_order({"user": user, "items": dict(items), "total": total})
        for sku, quantity in items.items():
            db.reserve(sku, quantity)
        mailer.send(user, "Your order " + str(order_id), "Total: " + str(total))
        return order_id''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Log:
    def __init__(self):
        self.calls = []
class FakeDb:
    def __init__(self, log, prices, stock):
        self.log, self.prices, self.stock_left = log, prices, stock
    def find_price(self, sku):
        self.log.calls.append("price " + sku)
        return self.prices.get(sku)
    def stock(self, sku):
        self.log.calls.append("stock " + sku)
        return self.stock_left.get(sku, 0)
    def save_order(self, order):
        self.log.calls.append(("save", order))
        return 77
    def reserve(self, sku, quantity):
        self.log.calls.append(("reserve", sku, quantity))
class FakeGateway:
    def __init__(self, log, answer=True):
        self.log, self.answer = log, answer
    def charge(self, user, cents):
        self.log.calls.append(("charge", user, cents))
        return self.answer
class FakeMailer:
    def __init__(self, log):
        self.log = log
    def send(self, to, subject, body):
        self.log.calls.append(("mail", to, subject, body))
def build(answer=True):
    log = Log()
    db = FakeDb(log, {"pen": 150, "book": 1200, "free": 0}, {"pen": 10, "book": 1, "free": 5})
    return OrderService(db=db, gateway=FakeGateway(log, answer), mailer=FakeMailer(log)), log
service, log = build()
assert service.place("asha", {"pen": 2, "book": 1}) == 77
assert log.calls == [
    "price pen", "stock pen", "price book", "stock book",
    ("charge", "asha", 1500),
    ("save", {"user": "asha", "items": {"pen": 2, "book": 1}, "total": 1500}),
    ("reserve", "pen", 2), ("reserve", "book", 1),
    ("mail", "asha", "Your order 77", "Total: 1500"),
]
service, log = build()
assert error_of(service.place, "asha", {"ink": 1}) == "ValueError: Unknown product"
assert log.calls == ["price ink"]
service, log = build()
assert error_of(service.place, "asha", {"pen": 1, "book": 2}) == "ValueError: Out of stock: book"
assert log.calls == ["price pen", "stock pen", "price book", "stock book"]
service, log = build()
assert error_of(service.place, "asha", {"ink": 1, "book": 5}) == "ValueError: Unknown product"
assert log.calls == ["price ink"]
service, log = build()
assert error_of(service.place, "asha", {"book": 5, "ink": 1}) == "ValueError: Out of stock: book"
assert log.calls == ["price book", "stock book"]
service, log = build(answer=False)
assert error_of(service.place, "asha", {"pen": 1}) == "ValueError: Payment declined"
assert log.calls == ["price pen", "stock pen", ("charge", "asha", 150)]
service, log = build()
assert service.place("zed", {"free": 2}) == 77
assert ("charge", "zed", 0) in log.calls and ("reserve", "free", 2) in log.calls
service, log = build()
assert service.place("zed", {}) == 77
assert log.calls == [("charge", "zed", 0), ("save", {"user": "zed", "items": {}, "total": 0}), ("mail", "zed", "Your order 77", "Total: 0")]
service, log = build()
order = {"pen": 1}
service.place("asha", order)
order["pen"] = 99
saved = [c for c in log.calls if isinstance(c, tuple) and c[0] == "save"][0][1]
assert saved["items"] == {"pen": 1}
class TalkativeDb(FakeDb):
    def save_order(self, order):
        self.log.calls.append("saving")
        return "ord-9"
log = Log()
other = OrderService(db=TalkativeDb(log, {"a": 1}, {"a": 5}), gateway=FakeGateway(log), mailer=FakeMailer(log))
assert other.place("u", {"a": 1}) == "ord-9"
assert log.calls[-1] == ("mail", "u", "Your order ord-9", "Total: 1")
class FalsyGateway(FakeGateway):
    def __bool__(self):
        return False
falsy_log = Log()
falsy = OrderService(db=FakeDb(falsy_log, {"a": 1}, {"a": 1}), gateway=FalsyGateway(falsy_log), mailer=FakeMailer(falsy_log))
assert falsy.place("u", {"a": 1}) == 77 and ("charge", "u", 1) in falsy_log.calls
first, first_log = build()
second, second_log = build()
first.place("a", {"pen": 1})
assert second_log.calls == [] and len(first_log.calls) > 0
default = OrderService()
assert error_of(default.place, "u", {"a": 1}) == "RuntimeError: the real database is not available here"
partial = OrderService(gateway=FakeGateway(Log()))
assert error_of(partial.place, "u", {"a": 1}) == "RuntimeError: the real database is not available here"''',
    solution=r'''class Database:
    def find_price(self, sku):
        raise RuntimeError("the real database is not available here")

    def stock(self, sku):
        raise RuntimeError("the real database is not available here")

    def save_order(self, order):
        raise RuntimeError("the real database is not available here")

    def reserve(self, sku, quantity):
        raise RuntimeError("the real database is not available here")


class PaymentGateway:
    def charge(self, user, cents):
        raise RuntimeError("the real payment gateway is not available here")


class SmtpMailer:
    def send(self, to, subject, body):
        raise RuntimeError("the real mail server is not available here")


class OrderService:
    def __init__(self, db=None, gateway=None, mailer=None):
        self._db = db if db is not None else Database()
        self._gateway = gateway if gateway is not None else PaymentGateway()
        self._mailer = mailer if mailer is not None else SmtpMailer()

    def place(self, user, items):
        total = 0
        for sku, quantity in items.items():
            price = self._db.find_price(sku)
            if price is None:
                raise ValueError("Unknown product")
            if self._db.stock(sku) < quantity:
                raise ValueError("Out of stock: " + sku)
            total += price * quantity
        if not self._gateway.charge(user, total):
            raise ValueError("Payment declined")
        order_id = self._db.save_order({"user": user, "items": dict(items), "total": total})
        for sku, quantity in items.items():
            self._db.reserve(sku, quantity)
        self._mailer.send(user, "Your order " + str(order_id), "Total: " + str(total))
        return order_id''',
    hints=[
        r'''Move the three `Database()`, `PaymentGateway()`, `SmtpMailer()` out of `place` and into `__init__`, taking each as an optional argument: `self._db = db if db is not None else Database()`. Then replace every `db.` in `place` by `self._db.`, and so on.''',
        r'''Do not reorder anything: the order of the calls is part of the behaviour, and the test records it. Keep the validation loop before the charge, and the charge before the save.''',
        r'''Check each collaborator separately against `None` (not `or`), so a fake that happens to be falsy (an empty list-like object) is still used, and passing only one collaborator still builds the other two as the real ones.''',
    ],
    explanation=r'''**The idea.** `place` is a small *workflow*: validate, charge, save, reserve, notify. Its logic is easy to test **if** you can see what it asked of the outside world. With the three objects created inside the method, nothing outside can see or replace them.

```mermaid
sequenceDiagram
    participant S as OrderService.place
    participant D as db
    participant G as gateway
    participant M as mailer
    S->>D: find_price, stock (each product)
    S->>G: charge(user, total)
    S->>D: save_order, reserve
    S->>M: send(receipt)
```

**Interaction testing.** The test passes in fakes that write every call to one shared log, and then compares the whole log with the expected list. That checks the *order* (no charge before the stock check, no mail before the save) and the *absence* of calls (a declined payment never reaches `save_order`). This kind of fake is called a *spy*.

**Constructor injection.** The three collaborators arrive through the constructor and are stored. This is the most common form of dependency injection: the service's *dependencies are visible in its signature*, so reading `OrderService(db, gateway, mailer)` tells you everything it talks to.

**Defaults keep old callers working.** Code that still writes `OrderService()` keeps getting the real objects. The final tests prove it: the default service fails with the real database's message, and a service built with only a gateway still has a real database.

**Why not mock the module?** Patching `Database` in the test would work today, but it ties the test to *where* the class is looked up. Passing the dependency in works whatever the module layout is, and no patching tool is needed.

**Going further.** `db` is doing four jobs (price, stock, save, reserve). Which two interfaces would you split it into, following the Interface Segregation Principle, and which tests would get simpler?''',
),

P(
    slug='lld-testable-audit-ledger', title='Make the Ledger Testable', topic='lld-testable-design', difficulty='advanced',
    module='lld/05-core-design-principles/README.md',
    description='Replace a hidden global audit-log singleton with an injected one, and fix the ledger so a failed audit write can never leave money moved.',
    statement=r'''A `Ledger` keeps account balances and writes an audit line for every change, but it fetches the audit log from a **singleton** (`AuditLog.instance()`) that writes to a file. A test cannot see the lines, cannot make the log fail, and every `Ledger` shares one global object. **Pass the audit log in, and fix the bug below.**

**Creating one:** `Ledger(audit=None)`. `audit` is any object with `write(line)`. `None` means `AuditLog.instance()` **looked up when the ledger is created**. `AuditLog` and its singleton must stay as they are. Read the balances from the dictionary `ledger.balances`.

**Methods** (money is whole cents; an amount that is not above 0 raises `ValueError("Amount must be positive")` first)

- `deposit(account, cents)` adds to the account and writes the line `"deposit <account> <cents>"`.
- `transfer(source, target, cents)` moves money and writes `"transfer <source>-><target> <cents>"`. If the source has less than `cents`, it writes `"refused <source>-><target> <cents>"` and raises `ValueError("Insufficient funds")`; a failing audit write there is **ignored** (the error to raise is still "Insufficient funds").

**The bug to fix.** The original changes the balances **first** and writes the audit line afterwards, so if the write fails the money has already moved without a record. Write the line **before** changing anything. If that `write` raises (any exception) for a `deposit` or a successful-looking `transfer`, raise `ValueError("Audit unavailable")` and leave **every balance exactly as it was**.

**Example**

```
audit = RecordingAudit()
ledger = Ledger(audit)
ledger.deposit("asha", 500)
ledger.transfer("asha", "ben", 200)
audit.lines    # ["deposit asha 500", "transfer asha->ben 200"]
```''',
    starter=r'''class AuditLog:
    _instance = None

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def write(self, line):
        with open("/var/log/ledger-audit.log", "a") as handle:
            handle.write(line + "\n")


class Ledger:
    def __init__(self):
        self.balances = {}

    def deposit(self, account, cents):
        if cents <= 0:
            raise ValueError("Amount must be positive")
        self.balances[account] = self.balances.get(account, 0) + cents
        AuditLog.instance().write("deposit " + account + " " + str(cents))

    def transfer(self, source, target, cents):
        if cents <= 0:
            raise ValueError("Amount must be positive")
        if self.balances.get(source, 0) < cents:
            AuditLog.instance().write("refused " + source + "->" + target + " " + str(cents))
            raise ValueError("Insufficient funds")
        self.balances[source] -= cents
        self.balances[target] = self.balances.get(target, 0) + cents
        AuditLog.instance().write("transfer " + source + "->" + target + " " + str(cents))''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Recorder:
    def __init__(self, failing=False):
        self.lines = []
        self.failing = failing
    def write(self, line):
        if self.failing:
            raise OSError("disk full")
        self.lines.append(line)
audit = Recorder()
ledger = Ledger(audit)
assert ledger.balances == {}
ledger.deposit("asha", 500)
ledger.transfer("asha", "ben", 200)
assert ledger.balances == {"asha": 300, "ben": 200}
assert audit.lines == ["deposit asha 500", "transfer asha->ben 200"]
assert error_of(ledger.deposit, "asha", 0) == "ValueError: Amount must be positive"
assert error_of(ledger.deposit, "asha", -5) == "ValueError: Amount must be positive"
assert error_of(ledger.transfer, "asha", "ben", 0) == "ValueError: Amount must be positive"
assert audit.lines == ["deposit asha 500", "transfer asha->ben 200"]
assert error_of(ledger.transfer, "asha", "ben", 301) == "ValueError: Insufficient funds"
assert audit.lines[-1] == "refused asha->ben 301" and ledger.balances == {"asha": 300, "ben": 200}
assert error_of(ledger.transfer, "nobody", "ben", 1) == "ValueError: Insufficient funds"
assert audit.lines[-1] == "refused nobody->ben 1" and "nobody" not in ledger.balances
ledger.transfer("asha", "asha", 300)
assert ledger.balances["asha"] == 300 and audit.lines[-1] == "transfer asha->asha 300"
audit.failing = True
assert error_of(ledger.deposit, "asha", 50) == "ValueError: Audit unavailable"
assert ledger.balances == {"asha": 300, "ben": 200}
assert error_of(ledger.transfer, "asha", "ben", 100) == "ValueError: Audit unavailable"
assert ledger.balances == {"asha": 300, "ben": 200}
assert error_of(ledger.transfer, "asha", "ben", 999) == "ValueError: Insufficient funds"
assert ledger.balances == {"asha": 300, "ben": 200}
assert error_of(ledger.deposit, "newcomer", 10) == "ValueError: Audit unavailable"
assert "newcomer" not in ledger.balances
audit.failing = False
ledger.deposit("newcomer", 10)
assert ledger.balances["newcomer"] == 10 and audit.lines[-1] == "deposit newcomer 10"
class Exploding:
    def write(self, line):
        raise KeyError("odd failure")
assert error_of(Ledger(Exploding()).deposit, "x", 1) == "ValueError: Audit unavailable"
one, two = Recorder(), Recorder()
Ledger(one).deposit("a", 1)
Ledger(two).deposit("b", 2)
assert one.lines == ["deposit a 1"] and two.lines == ["deposit b 2"]
shared = Recorder()
AuditLog._instance = shared
default = Ledger()
default.deposit("z", 5)
Ledger().deposit("y", 6)
assert shared.lines == ["deposit z 5", "deposit y 6"]
AuditLog._instance = None
assert AuditLog.instance() is AuditLog.instance()
assert isinstance(AuditLog.instance(), AuditLog)
empty_like = Recorder()
empty_like.__class__ = type("Quiet", (Recorder,), {"__bool__": lambda self: False})
quiet = Ledger(empty_like)
quiet.deposit("q", 1)
assert empty_like.lines == ["deposit q 1"]
swapped = Recorder()
late = Ledger(swapped)
AuditLog._instance = Recorder()
late.deposit("late", 1)
assert swapped.lines == ["deposit late 1"] and AuditLog._instance.lines == []
AuditLog._instance = None''',
    solution=r'''class AuditLog:
    _instance = None

    @classmethod
    def instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def write(self, line):
        with open("/var/log/ledger-audit.log", "a") as handle:
            handle.write(line + "\n")


class Ledger:
    def __init__(self, audit=None):
        self._audit = audit if audit is not None else AuditLog.instance()
        self.balances = {}

    def _record(self, line):
        try:
            self._audit.write(line)
        except Exception:
            raise ValueError("Audit unavailable") from None

    def deposit(self, account, cents):
        if cents <= 0:
            raise ValueError("Amount must be positive")
        self._record("deposit " + account + " " + str(cents))
        self.balances[account] = self.balances.get(account, 0) + cents

    def transfer(self, source, target, cents):
        if cents <= 0:
            raise ValueError("Amount must be positive")
        if self.balances.get(source, 0) < cents:
            try:
                self._audit.write("refused " + source + "->" + target + " " + str(cents))
            except Exception:
                pass
            raise ValueError("Insufficient funds")
        self._record("transfer " + source + "->" + target + " " + str(cents))
        self.balances[source] -= cents
        self.balances[target] = self.balances.get(target, 0) + cents''',
    hints=[
        r'''Take `audit` in the constructor and store it: `self._audit = audit if audit is not None else AuditLog.instance()`. Then every `AuditLog.instance().write(...)` becomes `self._audit.write(...)`. The singleton class itself stays untouched.''',
        r'''To fix the bug, move the write **before** the changes to `balances`. Wrap it in one small helper that turns any exception into `ValueError("Audit unavailable")`, so deposit and transfer share it.''',
        r'''The "refused" line is different: it must never hide the real reason, so swallow an exception from *that* write and still raise "Insufficient funds". Test the default wiring by replacing `AuditLog._instance` before creating the ledger.''',
    ],
    explanation=r'''**The idea.** A singleton is a global variable with a nicer name. `AuditLog.instance()` inside `Ledger` is a *hidden dependency*: the constructor and method signatures say nothing about it, every ledger in the process shares it, and a test has no way to substitute it short of patching the class.

```mermaid
flowchart LR
    subgraph before["before: hidden global"]
        L1[Ledger] --> S[AuditLog.instance]
        L2[another Ledger] --> S
    end
    subgraph after["after: passed in"]
        L3[Ledger] --> A1[audit A]
        L4[Ledger] --> A2[audit B]
    end
```

**Keep the singleton, stop depending on it.** The refactor does **not** delete `AuditLog`. The production default still asks the singleton, but only in one place (the default argument), and only when the ledger is created. Everywhere else the ledger uses *the object it was given*. That is how a legacy singleton is usually retired: first stop spreading it, then replace it later.

**Testability exposed a real bug.** Once a fake audit log can fail on purpose, the old order of operations is obviously wrong: it changed the balances and *then* wrote the record. If the write failed, money moved with no trace, which for a ledger is the worst outcome. The fix is **write-ahead**: record the intent first, and only change state if that succeeded (databases do the same with a write-ahead log).

**Fail closed.** For a financial audit, "cannot record" means "must not do it". Hence `Audit unavailable` and an unchanged ledger. For the *refused* line the opposite choice is right: the caller must still learn the real reason ("Insufficient funds"), so a failing write is ignored there. Deciding which failures are fatal is a design choice; a test is the best place to pin it.

**Looked up at creation.** The last test creates a ledger with one recorder, then replaces the singleton, and checks the ledger kept writing to its own recorder. A ledger that re-read `AuditLog.instance()` on every call would have followed the swap.

**Going further.** What would a `Ledger` look like that takes a *list* of audit sinks (a file, a metrics counter) and requires all of them to succeed?''',
),
]
