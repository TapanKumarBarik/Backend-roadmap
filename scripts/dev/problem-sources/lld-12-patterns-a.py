PROBLEMS = [
P(
    slug='lld-job-queue-retries', title='Job Queue with Retries', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/21-lld-interview-playbook/README.md',
    description='Build a job queue that runs due jobs, retries failures with growing delays and moves jobs that keep failing to a dead-letter list.',
    statement=r'''Write a class `JobQueue` that runs jobs (functions with no arguments).

**Creating one:** `JobQueue(clock, max_attempts=3, delays=(10, 30))`. `clock` returns the time in seconds (never read the real time). After the **n-th failed attempt** of a job, it is tried again `delays[n - 1]` seconds later; if `n` goes past the end of `delays`, the **last** delay is used. A job that has failed `max_attempts` times is **dead**.

**Methods**

- `submit(job_id, func)` adds a job that is due **now**. A job id used before raises `ValueError("Duplicate job")`.
- `run_due()` runs every pending job whose due time is **at or before the current time**, ordered by due time and then by the order they were submitted. It returns a list of `(job_id, outcome)` in the order they ran, where `outcome` is:
  - `"done"`: the function returned (its return value is kept);
  - `"retry"`: it raised, and it will be tried again later;
  - `"dead"`: it raised and this was its last attempt.
  Read the clock **once** at the start of the call. A job runs at most once per `run_due()` call, even if its retry would already be due.
- `status(job_id)` is `"pending"`, `"done"` or `"dead"`.
- `result(job_id)` is the value a `"done"` job returned. For any other status it raises `ValueError("No result")`.
- `attempts(job_id)` is how many times the job has run.
- `dead_letters()` is a list of `(job_id, error_text)` in the order jobs died, where `error_text` is `str(exception)` of the last failure.

An unknown job id raises `ValueError("Unknown job")` in `status`, `result` and `attempts`.

**Example**

```
now = [0]
queue = JobQueue(lambda: now[0])
queue.submit("send", flaky_function)    # fails twice, then works
queue.run_due()                         # [("send", "retry")]   next try at 10
now[0] = 10
queue.run_due()                         # [("send", "retry")]   next try at 40
now[0] = 40
queue.run_due()                         # [("send", "done")]
```''',
    starter=r'''class JobQueue:
    def __init__(self, clock, max_attempts=3, delays=(10, 30)):
        ...

    def submit(self, job_id, func):
        ...

    def run_due(self):
        ...

    def status(self, job_id):
        ...

    def result(self, job_id):
        ...

    def attempts(self, job_id):
        ...

    def dead_letters(self):
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
def flaky(failures, value="ok"):
    state = {"calls": 0}
    def job():
        state["calls"] += 1
        if state["calls"] <= failures:
            raise RuntimeError("boom " + str(state["calls"]))
        return value
    return job
clock = Clock()
queue = JobQueue(clock)
assert queue.run_due() == []
assert error_of(queue.status, "x") == "ValueError: Unknown job"
assert error_of(queue.result, "x") == "ValueError: Unknown job"
assert error_of(queue.attempts, "x") == "ValueError: Unknown job"
queue.submit("a", flaky(0, 41))
queue.submit("b", flaky(2))
queue.submit("c", flaky(9))
assert error_of(queue.submit, "a", flaky(0)) == "ValueError: Duplicate job"
assert queue.status("a") == "pending" and error_of(queue.result, "a") == "ValueError: No result"
assert queue.run_due() == [("a", "done"), ("b", "retry"), ("c", "retry")]
assert queue.status("a") == "done" and queue.result("a") == 41 and queue.attempts("a") == 1
assert queue.status("b") == "pending" and error_of(queue.result, "b") == "ValueError: No result"
assert queue.run_due() == []
clock.now = 9
assert queue.run_due() == []
clock.now = 10
assert queue.run_due() == [("b", "retry"), ("c", "retry")]
assert queue.attempts("b") == 2 and queue.attempts("c") == 2
clock.now = 39
assert queue.run_due() == []
clock.now = 40
assert queue.run_due() == [("b", "done"), ("c", "dead")]
assert queue.status("b") == "done" and queue.result("b") == "ok" and queue.status("c") == "dead"
assert queue.dead_letters() == [("c", "boom 3")]
letters = queue.dead_letters()
letters.clear()
assert queue.dead_letters() == [("c", "boom 3")]
assert error_of(queue.result, "c") == "ValueError: No result"
clock.now = 1000
assert queue.run_due() == [] and queue.attempts("c") == 3
assert error_of(queue.submit, "c", flaky(0)) == "ValueError: Duplicate job"
slow = JobQueue(clock, max_attempts=5, delays=(1, 2))
slow.submit("s", flaky(9))
attempts_seen = []
for gap in (0, 1, 2, 2, 2):
    clock.now += gap
    slow.run_due()
    attempts_seen.append(slow.attempts("s"))
assert attempts_seen == [1, 2, 3, 4, 5]
assert slow.status("s") == "dead" and slow.dead_letters() == [("s", "boom 5")]
order = JobQueue(clock)
log = []
order.submit("late", lambda: log.append("late"))
clock.now = 2000
order.submit("first", lambda: log.append("first"))
order.submit("second", lambda: log.append("second"))
assert order.run_due() == [("late", "done"), ("first", "done"), ("second", "done")]
assert log == ["late", "first", "second"]
once = JobQueue(clock, delays=(0,))
once.submit("z", flaky(1))
assert once.run_due() == [("z", "retry")]
assert once.run_due() == [("z", "done")]
assert JobQueue(clock, max_attempts=1).run_due() == []
single = JobQueue(clock, max_attempts=1)
single.submit("one", flaky(1))
assert single.run_due() == [("one", "dead")] and single.dead_letters() == [("one", "boom 1")]
gap = Clock()
timed = JobQueue(gap)
timed.submit("x", flaky(1))
timed.run_due()
gap.now = 5
timed.submit("y", flaky(0))
gap.now = 10
assert timed.run_due() == [("y", "done"), ("x", "done")]
mixed = JobQueue(clock)
mixed.submit("m1", flaky(1))
mixed.submit("m2", flaky(0, "fine"))
assert mixed.run_due() == [("m1", "retry"), ("m2", "done")]
clock.now = 2010
mixed.submit("m3", flaky(0))
assert mixed.run_due() == [("m1", "done"), ("m3", "done")]''',
    solution=r'''class JobQueue:
    def __init__(self, clock, max_attempts=3, delays=(10, 30)):
        self._clock = clock
        self._max_attempts = max_attempts
        self._delays = tuple(delays)
        self._jobs = {}
        self._order = []
        self._dead = []

    def submit(self, job_id, func):
        if job_id in self._jobs:
            raise ValueError("Duplicate job")
        self._jobs[job_id] = {"func": func, "due": self._clock(), "attempts": 0, "status": "pending", "result": None}
        self._order.append(job_id)

    def _job(self, job_id):
        if job_id not in self._jobs:
            raise ValueError("Unknown job")
        return self._jobs[job_id]

    def run_due(self):
        now = self._clock()
        due = [j for j in self._order if self._jobs[j]["status"] == "pending" and self._jobs[j]["due"] <= now]
        due.sort(key=lambda j: (self._jobs[j]["due"], self._order.index(j)))
        outcomes = []
        for job_id in due:
            job = self._jobs[job_id]
            job["attempts"] += 1
            try:
                job["result"] = job["func"]()
            except Exception as error:
                if job["attempts"] >= self._max_attempts:
                    job["status"] = "dead"
                    self._dead.append((job_id, str(error)))
                    outcomes.append((job_id, "dead"))
                else:
                    delay = self._delays[min(job["attempts"], len(self._delays)) - 1]
                    job["due"] = now + delay
                    outcomes.append((job_id, "retry"))
            else:
                job["status"] = "done"
                outcomes.append((job_id, "done"))
        return outcomes

    def status(self, job_id):
        return self._job(job_id)["status"]

    def result(self, job_id):
        job = self._job(job_id)
        if job["status"] != "done":
            raise ValueError("No result")
        return job["result"]

    def attempts(self, job_id):
        return self._job(job_id)["attempts"]

    def dead_letters(self):
        return list(self._dead)''',
    hints=[
        r'''One record per job: the function, when it is next due, how many attempts so far, its status and its result. A separate list of ids keeps the submission order for the tie-break.''',
        r'''A failure either schedules a retry (`now + delay` where the delay comes from `delays[attempts - 1]`, clamped to the last entry) or, when attempts reach `max_attempts`, moves the job to `dead` and appends `(id, str(error))` to the dead letters.''',
        r'''Read `now = clock()` once, collect the due jobs *before* running any of them, and run each one a single time: that is what stops a job with a zero delay from running twice in one call.''',
    ],
    explanation=r'''**The idea.** A retrying queue is a small state machine per job and a clock. The job is `pending` until it succeeds (`done`) or fails too often (`dead`); in between, every failure moves its due time forward.

```mermaid
stateDiagram-v2
    [*] --> pending: submit
    pending --> pending: fails, attempts left (due moves forward)
    pending --> done: succeeds
    pending --> dead: fails on the last attempt
```

**Backoff.** Retrying immediately usually hits the same problem (a down service stays down for a few seconds). Waiting longer each time, here 10 seconds and then 30, gives the dependency room to recover and stops a flood of retries. The common refinement is *exponential* backoff with some random jitter.

**Dead letters.** A job that never succeeds must not be retried forever, and must not vanish silently. Moving it to a *dead-letter list* with its last error is how queues such as SQS and RabbitMQ keep failures visible for a human or another process to deal with.

**Freeze the time and the batch.** Reading the clock once and choosing the due jobs before running any of them makes one call predictable: a job that fails and would be due again immediately still waits for the next call. It also makes the fake clock in a test enough to drive the whole schedule.

**Complexity.** `run_due` scans every job here, O(n log n); a production queue keeps due jobs in a heap keyed by due time.

**Going further.** Replace the scan with `heapq` entries `(due, order, job_id)`. What do you do with an entry whose job has since finished?''',
),

P(
    slug='lld-config-builder', title='Server Config Builder', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/06-creational-patterns/README.md',
    description='Build an immutable ServerConfig with a fluent builder that applies defaults, validates once on build and can be reused.',
    statement=r'''Write two classes: an immutable `ServerConfig` and its builder.

**The builder.** `ServerConfig.builder()` returns a new `ServerConfigBuilder`. Every setter **returns the builder** so calls can be chained:

- `host(name)`
- `port(number)`
- `tls(certificate, key)` turns TLS on
- `timeout(seconds)`
- `retries(count)`

`build()` checks the settings and returns a `ServerConfig`. **All checks happen in `build()`**, in this order, each raising `ValueError`:

1. no host set: `"Host is required"`
2. a port that is not an `int` from 1 to 65535 (a `bool` is not): `"Bad port"`
3. a timeout that is not above 0: `"Bad timeout"`
4. retries that is not an `int` of at least 0: `"Bad retries"`
5. TLS with an empty certificate or key: `"TLS needs a certificate and a key"`

**Defaults.** `port`: `443` when TLS is on, otherwise `80`. `timeout`: `30`. `retries`: `3`. TLS: off.

**The config.** `ServerConfig` has the read-only attributes `host`, `port`, `tls` (a bool), `timeout` and `retries`; assigning to any of them raises `AttributeError`. `to_dict()` returns them as a dictionary with those five keys. The certificate and key are **not** part of the config (for safety they are not stored in it).

**Reuse.** A builder can be used again after `build()`: changing it afterwards must **not** change a config that was already built, and two `build()` calls give two separate objects (equal when their values are equal).

**Example**

```
config = ServerConfig.builder().host("api.example.com").tls("cert", "key").timeout(5).build()
config.to_dict()   # {"host": "api.example.com", "port": 443, "tls": True, "timeout": 5, "retries": 3}
```''',
    starter=r'''class ServerConfig:
    @classmethod
    def builder(cls):
        ...

    def to_dict(self):
        ...


class ServerConfigBuilder:
    def host(self, name):
        ...

    def port(self, number):
        ...

    def tls(self, certificate, key):
        ...

    def timeout(self, seconds):
        ...

    def retries(self, count):
        ...

    def build(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
builder = ServerConfig.builder()
assert isinstance(builder, ServerConfigBuilder)
assert builder.host("a.com") is builder and builder.port(8080) is builder and builder.tls("c", "k") is builder
assert builder.timeout(1) is builder and builder.retries(0) is builder
assert error_of(ServerConfig.builder().build) == "ValueError: Host is required"
assert error_of(ServerConfig.builder().port(0).build) == "ValueError: Host is required"
for bad_timeout in (True, 0, "5"):
    assert error_of(ServerConfig.builder().host("a").timeout(bad_timeout).build) == "ValueError: Bad timeout"
for bad_port in (0, 65536, -1, 80.5, "80", True):
    assert error_of(ServerConfig.builder().host("a").port(bad_port).build) == "ValueError: Bad port"
assert ServerConfig.builder().host("a").port(65535).build().port == 65535
assert ServerConfig.builder().host("a").port(1).build().port == 1
assert error_of(ServerConfig.builder().host("a").timeout(0).build) == "ValueError: Bad timeout"
assert error_of(ServerConfig.builder().host("a").timeout(-5).build) == "ValueError: Bad timeout"
assert ServerConfig.builder().host("a").timeout(0.5).build().timeout == 0.5
assert error_of(ServerConfig.builder().host("a").retries(-1).build) == "ValueError: Bad retries"
assert error_of(ServerConfig.builder().host("a").retries(1.5).build) == "ValueError: Bad retries"
assert error_of(ServerConfig.builder().host("a").retries(True).build) == "ValueError: Bad retries"
assert ServerConfig.builder().host("a").retries(0).build().retries == 0
assert error_of(ServerConfig.builder().host("a").tls("", "k").build) == "ValueError: TLS needs a certificate and a key"
assert error_of(ServerConfig.builder().host("a").tls("c", "").build) == "ValueError: TLS needs a certificate and a key"
assert error_of(ServerConfig.builder().host("a").port(0).timeout(0).build) == "ValueError: Bad port"
assert error_of(ServerConfig.builder().host("a").timeout(0).retries(-1).tls("", "").build) == "ValueError: Bad timeout"
assert error_of(ServerConfig.builder().host("a").retries(-1).tls("", "").build) == "ValueError: Bad retries"
plain = ServerConfig.builder().host("a.com").build()
assert plain.to_dict() == {"host": "a.com", "port": 80, "tls": False, "timeout": 30, "retries": 3}
secure = ServerConfig.builder().host("api.example.com").tls("cert", "key").timeout(5).build()
assert secure.to_dict() == {"host": "api.example.com", "port": 443, "tls": True, "timeout": 5, "retries": 3}
assert ServerConfig.builder().host("a").tls("c", "k").port(8443).build().port == 8443
assert (secure.host, secure.port, secure.tls, secure.timeout, secure.retries) == ("api.example.com", 443, True, 5, 3)
for name in ("host", "port", "tls", "timeout", "retries"):
    assert error_of(setattr, secure, name, 1) == "AttributeError: ServerConfig is immutable"
assert not hasattr(secure, "certificate") and "cert" not in str(secure.to_dict().values())
shared = ServerConfig.builder().host("a.com").port(81)
first = shared.build()
shared.port(82).host("b.com")
second = shared.build()
assert first.to_dict()["port"] == 81 and first.host == "a.com"
assert second.to_dict()["port"] == 82 and second.host == "b.com"
twin_a = ServerConfig.builder().host("t").build()
twin_b = ServerConfig.builder().host("t").build()
assert twin_a is not twin_b and twin_a == twin_b and twin_a != first
assert len({twin_a, twin_b}) == 1
first.to_dict()["port"] = 1
assert first.port == 81''',
    solution=r'''class ServerConfig:
    __slots__ = ("_values",)

    def __init__(self, values):
        object.__setattr__(self, "_values", dict(values))

    @classmethod
    def builder(cls):
        return ServerConfigBuilder()

    def __getattr__(self, name):
        values = object.__getattribute__(self, "_values")
        if name in values:
            return values[name]
        raise AttributeError(name)

    def __setattr__(self, name, value):
        raise AttributeError("ServerConfig is immutable")

    def to_dict(self):
        return dict(self._values)

    def __eq__(self, other):
        return isinstance(other, ServerConfig) and self._values == other._values

    def __hash__(self):
        return hash(tuple(sorted(self._values.items())))


class ServerConfigBuilder:
    def __init__(self):
        self._host = None
        self._port = None
        self._tls = None
        self._timeout = 30
        self._retries = 3

    def host(self, name):
        self._host = name
        return self

    def port(self, number):
        self._port = number
        return self

    def tls(self, certificate, key):
        self._tls = (certificate, key)
        return self

    def timeout(self, seconds):
        self._timeout = seconds
        return self

    def retries(self, count):
        self._retries = count
        return self

    def build(self):
        if not self._host:
            raise ValueError("Host is required")
        port = self._port if self._port is not None else (443 if self._tls else 80)
        if type(port) is not int or not 1 <= port <= 65535:
            raise ValueError("Bad port")
        if isinstance(self._timeout, bool) or not isinstance(self._timeout, (int, float)) or self._timeout <= 0:
            raise ValueError("Bad timeout")
        if type(self._retries) is not int or self._retries < 0:
            raise ValueError("Bad retries")
        if self._tls and (not self._tls[0] or not self._tls[1]):
            raise ValueError("TLS needs a certificate and a key")
        return ServerConfig({"host": self._host, "port": port, "tls": bool(self._tls), "timeout": self._timeout, "retries": self._retries})''',
    hints=[
        r'''The builder only *collects* values (each setter stores one and returns `self`). Put every check in `build()`, in the order the statement lists them, then create the config from a fresh dictionary.''',
        r'''The default port depends on TLS, so compute it in `build()`, after all setters have run, not in `tls()` (the caller may set the port before or after).''',
        r'''Make the config immutable by storing its values privately and blocking `__setattr__`. Give `to_dict()` a **copy**, and give the config its own copy of the values, so neither the builder nor a caller can change a built object afterwards.''',
    ],
    explanation=r'''**The idea.** The Builder pattern separates *collecting* settings from *creating* the object. A constructor with five optional arguments invites mistakes (`ServerConfig("a", 80, False, 30, 3)`: which is which?); a builder names every setting and lets the caller leave out what has a default.

```mermaid
classDiagram
    class ServerConfigBuilder {
        host()
        port()
        tls()
        timeout()
        retries()
        build()
    }
    class ServerConfig {
        host
        port
        tls
        timeout
        retries
        to_dict()
    }
    ServerConfigBuilder ..> ServerConfig : creates
```

**Validate in one place.** If each setter checked its own argument, the order of calls would decide which error you see, and a half-configured builder could still be "valid". Checking in `build()` means an invalid object cannot exist: whoever holds a `ServerConfig` knows it passed every rule.

**Defaults that depend on other settings.** The port default (443 or 80) depends on TLS, so it can only be decided when everything is known. Computing it in `build()` is also what makes `tls(...).port(8443)` and `port(8443).tls(...)` behave the same.

**Immutable product, reusable builder.** The built object copies the values, so later changes to the builder cannot leak into earlier products. This is the property that makes configuration safe to share between threads or requests.

**Secrets stay out.** The config keeps only `tls: True`. A certificate and key in an object that gets logged or serialised is a classic leak; not storing them is the simplest fix.

**Going further.** Add `ServerConfig.builder_from(config)` that starts a builder from an existing config. What would you have to keep, given that the certificate is gone?''',
),

P(
    slug='lld-stock-ticker', title='Stock Ticker Observers', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/08-behavioral-patterns-i/README.md',
    description='Build a price feed with observers that can unsubscribe, subscribe to all symbols, fail on their own and change the list while it is being notified.',
    statement=r'''Write a class `Ticker` that tells subscribers when a stock price changes.

**Methods**

- `subscribe(symbol, callback)` registers `callback` for one symbol, or for **every** symbol when `symbol` is `"*"`. It returns an **unsubscribe function**: calling it removes that subscription; calling it again does nothing.
- `publish(symbol, price)` records a price and notifies the subscribers, and returns a list of the **error messages** (`str(exception)`) raised by callbacks.
- `last(symbol)` is the last published price, or `None`.

**Notification rules**

- A callback is called as `callback(symbol, price, previous)`, where `previous` is the earlier price or `None` for the first one.
- Publishing the **same price** as the last one is not a change: it notifies nobody, returns `[]`.
- Subscribers of the symbol are called in the order they subscribed, with `"*"` subscribers mixed into that **same order** (one list, one order).
- A callback that raises must **not stop** the others: collect its message and carry on.
- A callback may unsubscribe itself or others while it is being called. The notification goes on over the subscribers as they were **when `publish` started**, except that anyone who has been **unsubscribed by the time their turn comes is skipped**.
- A callback that subscribes someone during a notification does **not** make that new subscriber part of the **current** notification.

**Example**

```
ticker = Ticker()
stop = ticker.subscribe("ACME", lambda s, p, prev: print(s, prev, "->", p))
ticker.publish("ACME", 10)     # prints: ACME None -> 10
ticker.publish("ACME", 10)     # nothing: same price
stop()
```''',
    starter=r'''class Ticker:
    def subscribe(self, symbol, callback):
        """Return a function that removes this subscription."""
        ...

    def publish(self, symbol, price):
        ...

    def last(self, symbol):
        ...''',
    tests=r'''ticker = Ticker()
log = []
def watcher(name):
    def callback(symbol, price, previous):
        log.append((name, symbol, price, previous))
    return callback
assert ticker.last("ACME") is None
stop_a = ticker.subscribe("ACME", watcher("a"))
stop_all = ticker.subscribe("*", watcher("all"))
ticker.subscribe("ACME", watcher("b"))
assert ticker.publish("ACME", 10) == []
assert log == [("a", "ACME", 10, None), ("all", "ACME", 10, None), ("b", "ACME", 10, None)]
assert ticker.last("ACME") == 10
del log[:]
assert ticker.publish("ACME", 10) == [] and log == []
ticker.publish("OTHER", 5)
assert log == [("all", "OTHER", 5, None)]
del log[:]
ticker.publish("ACME", 12)
assert log == [("a", "ACME", 12, 10), ("all", "ACME", 12, 10), ("b", "ACME", 12, 10)]
del log[:]
stop_a()
stop_a()
ticker.publish("ACME", 13)
assert [entry[0] for entry in log] == ["all", "b"]
del log[:]
stop_all()
ticker.publish("OTHER", 6)
assert log == []
def bad(symbol, price, previous):
    raise RuntimeError("bad " + str(price))
ticker.subscribe("ACME", bad)
ticker.subscribe("ACME", watcher("after"))
del log[:]
assert ticker.publish("ACME", 14) == ["bad 14"]
assert [entry[0] for entry in log] == ["b", "after"]
assert ticker.last("ACME") == 14
stops = {}
def quitter(symbol, price, previous):
    log.append(("quitter", price))
    stops["quitter"]()
stops["quitter"] = ticker.subscribe("Q", quitter)
ticker.subscribe("Q", watcher("tail"))
del log[:]
ticker.publish("Q", 1)
ticker.publish("Q", 2)
assert log == [("quitter", 1), ("tail", "Q", 1, None), ("tail", "Q", 2, 1)]
def killer(symbol, price, previous):
    stops["victim"]()
ticker.subscribe("K", killer)
stops["victim"] = ticker.subscribe("K", watcher("victim"))
ticker.subscribe("K", watcher("survivor"))
del log[:]
ticker.publish("K", 1)
assert log == [("survivor", "K", 1, None)]
def recruiter(symbol, price, previous):
    if price == 1:
        ticker.subscribe("R", watcher("recruit"))
ticker.subscribe("R", recruiter)
del log[:]
ticker.publish("R", 1)
assert log == []
ticker.publish("R", 2)
assert log == [("recruit", "R", 2, 1)]
fresh = Ticker()
seen = []
fresh.subscribe("A", lambda s, p, prev: seen.append(prev))
fresh.publish("A", 1)
fresh.publish("A", 2)
fresh.publish("A", 1)
assert seen == [None, 1, 2] and fresh.last("A") == 1''',
    solution=r'''class Ticker:
    def __init__(self):
        self._subscriptions = []
        self._last = {}

    def subscribe(self, symbol, callback):
        entry = {"symbol": symbol, "callback": callback, "active": True}
        self._subscriptions.append(entry)

        def unsubscribe():
            if entry["active"]:
                entry["active"] = False
                self._subscriptions.remove(entry)

        return unsubscribe

    def publish(self, symbol, price):
        previous = self._last.get(symbol)
        if symbol in self._last and previous == price:
            return []
        self._last[symbol] = price
        errors = []
        for entry in list(self._subscriptions):
            if not entry["active"] or entry["symbol"] not in (symbol, "*"):
                continue
            try:
                entry["callback"](symbol, price, previous)
            except Exception as error:
                errors.append(str(error))
        return errors

    def last(self, symbol):
        return self._last.get(symbol)''',
    hints=[
        r'''Keep one list of subscription records `{symbol, callback, active}`. `subscribe` returns a closure that flips `active` off and removes the record; calling it twice must be harmless.''',
        r'''Iterate over a **copy** of the list (`list(self._subscriptions)`): subscribers may add or remove entries while you loop. The copy keeps new subscribers out of this notification, and the `active` flag skips the ones removed before their turn.''',
        r'''Wrap each callback call in `try/except Exception`, keep going, and collect `str(error)`. Compare the price with `last` only after checking the symbol has been seen, so the first publish (even of `None`-like prices) always notifies.''',
    ],
    explanation=r'''**The idea.** The Observer pattern lets a *subject* tell any number of *observers* about changes without knowing who they are. The two hard parts are not the loop but what happens **while** the loop runs.

```mermaid
sequenceDiagram
    participant P as publisher
    participant T as Ticker
    participant A as callback a
    participant B as callback b
    P->>T: publish("ACME", 12)
    T->>A: callback("ACME", 12, 10)
    T->>B: callback("ACME", 12, 10)
    T-->>P: errors []
```

**Mutation during iteration.** If a callback unsubscribes itself and you loop over the live list, Python skips the next element, or a list in another language throws. Looping over a **snapshot** fixes that; the `active` flag fixes the opposite problem: someone removed *before their turn* must not be called from a stale snapshot.

**Isolation.** One broken observer must not break the others, or the publisher. Catching the exception per callback and returning the messages gives the publisher a way to notice without crashing.

**Unsubscribe by handle.** Returning a function (a *disposable*) is simpler than asking the caller to remember the callback and symbol again. It is how event emitters and RxJS subscriptions work.

**No change, no event.** Skipping equal prices means observers only wake up for real changes; the comparison needs the *previous* value, which is why the ticker stores it.

**Complexity.** `publish` is O(subscribers).

**Going further.** In a threaded program the snapshot is not enough: another thread can still change the list. What would you add?''',
),

P(
    slug='lld-media-player-state', title='Media Player States', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/08-behavioral-patterns-i/README.md',
    description='Build a media player whose play, pause, stop and next buttons each do something different depending on the state it is in.',
    statement=r'''Write a class `MediaPlayer` that plays a list of tracks. Each track is `(title, seconds)`.

**Creating one:** `MediaPlayer(tracks)`. It starts in the state `"stopped"` on the first track at position `0`.

**Reading**

- `state` is `"stopped"`, `"playing"` or `"paused"`.
- `track` is the title of the current track (the first one while stopped), or `None` when the list is empty.
- `position` is the seconds played in the current track.

**Actions.** Each returns the new `state`. What an action does depends on the state:

| action | stopped | playing | paused |
|---|---|---|---|
| `play()` | start playing | nothing | resume (keep the position) |
| `pause()` | `ValueError("Nothing is playing")` | pause | nothing |
| `stop()` | nothing | stop and reset to the **first** track at `0` | same as playing |
| `next_track()` | `ValueError("Nothing is playing")` | go to the next track at position `0`, keep playing | same, and it **plays** |

- `play()` on an **empty** list raises `ValueError("No tracks")`.
- `next_track()` on the **last** track stops the player (back to the first track at `0`).

**Time.** `tick(seconds)` moves time forward. It only has an effect while **playing**: the position grows by `seconds`; whenever it reaches or passes the **end of the track** the player goes to the next track, as if `next_track()` had been called, and the **leftover time carries into the new track** (it may even finish that one too). Reaching the end of the last track stops the player. It returns the state.

**Example**

```
player = MediaPlayer([("one", 10), ("two", 5)])
player.play()          # "playing"
player.tick(12)        # "playing"   track "two" at position 2
player.tick(3)         # "stopped"   the playlist ended
```''',
    starter=r'''class MediaPlayer:
    def __init__(self, tracks):
        ...

    @property
    def state(self):
        ...

    @property
    def track(self):
        ...

    @property
    def position(self):
        ...

    def play(self):
        ...

    def pause(self):
        ...

    def stop(self):
        ...

    def next_track(self):
        ...

    def tick(self, seconds):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
player = MediaPlayer([("one", 10), ("two", 5), ("three", 8)])
assert (player.state, player.track, player.position) == ("stopped", "one", 0)
assert error_of(player.pause) == "ValueError: Nothing is playing"
assert error_of(player.next_track) == "ValueError: Nothing is playing"
assert player.stop() == "stopped" and player.tick(100) == "stopped" and player.position == 0
assert player.play() == "playing"
assert player.play() == "playing" and player.position == 0
assert player.tick(4) == "playing" and (player.track, player.position) == ("one", 4)
assert player.pause() == "paused" and player.pause() == "paused"
assert player.tick(50) == "paused" and player.position == 4
assert player.play() == "playing" and player.position == 4
assert player.tick(6) == "playing" and (player.track, player.position) == ("two", 0)
assert player.tick(5) == "playing" and (player.track, player.position) == ("three", 0)
assert player.next_track() == "stopped" and (player.track, player.position) == ("one", 0)
assert player.play() == "playing"
assert player.tick(12) == "playing" and (player.track, player.position) == ("two", 2)
assert player.tick(3 + 8 - 1) == "playing" and (player.track, player.position) == ("three", 7)
assert player.tick(1) == "stopped" and (player.track, player.position) == ("one", 0)
assert player.play() == "playing"
assert player.next_track() == "playing" and (player.track, player.position) == ("two", 0)
assert player.tick(2) == "playing"
assert player.pause() == "paused"
assert player.next_track() == "playing" and (player.track, player.position) == ("three", 0)
assert player.pause() == "paused"
assert player.stop() == "stopped" and (player.track, player.position) == ("one", 0)
assert player.play() == "playing" and player.tick(1) == "playing"
assert player.stop() == "stopped" and (player.track, player.position) == ("one", 0)
assert player.state == "stopped"
assert player.play() == "playing" and player.tick(10 + 5 + 8) == "stopped"
assert (player.track, player.position) == ("one", 0)
assert player.play() == "playing" and player.tick(33) == "stopped"
assert player.play() == "playing" and player.tick(0) == "playing" and player.position == 0
empty = MediaPlayer([])
assert empty.track is None and empty.state == "stopped" and empty.position == 0
assert error_of(empty.play) == "ValueError: No tracks"
single = MediaPlayer([("solo", 3)])
single.play()
assert single.next_track() == "stopped" and single.track == "solo"
single.play()
assert single.tick(2) == "playing" and single.tick(1) == "stopped" and single.position == 0''',
    solution=r'''class MediaPlayer:
    def __init__(self, tracks):
        self._tracks = list(tracks)
        self._index = 0
        self._position = 0
        self._state = _Stopped()

    @property
    def state(self):
        return self._state.name

    @property
    def track(self):
        return self._tracks[self._index][0] if self._tracks else None

    @property
    def position(self):
        return self._position

    def _become(self, state):
        self._state = state
        return state.name

    def _rewind(self):
        self._index = 0
        self._position = 0

    def play(self):
        return self._state.play(self)

    def pause(self):
        return self._state.pause(self)

    def stop(self):
        return self._state.stop(self)

    def next_track(self):
        return self._state.next_track(self)

    def tick(self, seconds):
        return self._state.tick(self, seconds)


class _Stopped:
    name = "stopped"

    def play(self, player):
        if not player._tracks:
            raise ValueError("No tracks")
        return player._become(_Playing())

    def pause(self, player):
        raise ValueError("Nothing is playing")

    def stop(self, player):
        return self.name

    def next_track(self, player):
        raise ValueError("Nothing is playing")

    def tick(self, player, seconds):
        return self.name


class _Playing:
    name = "playing"

    def play(self, player):
        return self.name

    def pause(self, player):
        return player._become(_Paused())

    def stop(self, player):
        player._rewind()
        return player._become(_Stopped())

    def next_track(self, player):
        if player._index + 1 >= len(player._tracks):
            return self.stop(player)
        player._index += 1
        player._position = 0
        return player._become(_Playing())

    def tick(self, player, seconds):
        player._position += seconds
        while player._position >= player._tracks[player._index][1]:
            left = player._position - player._tracks[player._index][1]
            if self.next_track(player) == "stopped":
                return "stopped"
            player._position = left
        return self.name


class _Paused:
    name = "paused"

    def play(self, player):
        return player._become(_Playing())

    def pause(self, player):
        return self.name

    def stop(self, player):
        return _Playing().stop(player)

    def next_track(self, player):
        player._become(_Playing())
        return _Playing().next_track(player)

    def tick(self, player, seconds):
        return self.name''',
    hints=[
        r'''Make one small class per state (`_Stopped`, `_Playing`, `_Paused`), each with all five methods. The player forwards every action to its current state object and the state object decides what happens, including switching to another state.''',
        r'''Put the shared work on the player (`_become(state)`, `_rewind()`), so a state only says *what* to do. The "stopped" and "paused" tick are the same one-liner: return the name without moving anything.''',
        r'''For `tick`, add the seconds, then loop while the position is at or past the end of the track: compute the leftover, move to the next track (or stop if it was the last), and put the leftover into the new position. A single tick can cross several short tracks.''',
    ],
    explanation=r'''**The idea.** When an object behaves differently in different situations, the usual code is a tangle of `if self.state == "paused" and ...`. The State pattern moves each situation's behaviour into its own class, so adding or changing one state touches one place.

```mermaid
stateDiagram-v2
    [*] --> stopped
    stopped --> playing: play
    playing --> paused: pause
    paused --> playing: play
    playing --> stopped: stop or the playlist ends
    paused --> stopped: stop
    playing --> playing: next_track or the track ends
    paused --> playing: next_track
```

**The table is the specification.** The 3 x 4 table in the statement is exactly the set of methods on the three state classes. If you can fill a table like that, you can write the pattern. A cell that says "nothing" is a method that returns the state name; a cell that says "error" is one that raises.

**When the pattern is worth it.** Earlier, the vending machine derived its state from the money inserted, with no state classes at all. That was right: its states had little behaviour of their own. Here each state reacts differently to *every* action, so classes pay off; a flag plus `if` chains would grow with every new button.

**Context and states.** The player is the *context*: it holds the data (tracks, index, position) and delegates. States hold no data of their own, which is why a new state object can be created freely on each transition.

**Leftover time.** `tick(12)` on a 10-second track must put 2 seconds into the next one. Subtract the track length instead of resetting to 0, otherwise a long tick loses time and a very long one never skips short tracks.

**Going further.** Add a `repeat` setting to the context. Which state classes change, and which do not?''',
),
]
