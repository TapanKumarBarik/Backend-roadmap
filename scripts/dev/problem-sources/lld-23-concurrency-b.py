PROBLEMS = [
P(
    slug='lld-timeout-connection-pool', title='Connection Pool With Timeouts', topic='lld-concurrency-design', difficulty='advanced',
    module='lld/10-concurrency-safe-design/README.md',
    description='Model a bounded connection pool with a FIFO wait queue, per-request deadlines in virtual time, hand-off on release and time-out reporting.',
    statement=r'''Write a class `WaitPool` for a pool of `size` numbered connections (`1` to `size`). Nothing blocks: every call receives the current time `now` and returns what happened, so a test can play any interleaving.

**Creating one:** `WaitPool(size)`; `size` must be an `int` of 1 or more (not a `bool`), else `ValueError("Size must be positive")`.

**Time.** Every method that takes `now` first checks it: a number of 0 or more (not a `bool`), else `ValueError("Bad time")`; not earlier than the latest `now` any earlier call used, else `ValueError("Time went backwards")`. A call with a valid time moves the pool's clock to it, even if the call is refused later.

**Methods**

- `acquire(task, now, timeout=None)` returns a connection number, or `"waiting"`. Order: time checks; waiters whose **deadline has passed** (`deadline <= now`) are removed and recorded as timed out; a task that already holds a connection or is waiting is `ValueError("Already holding or waiting: <task>")`; `timeout`, if given, must be a number above 0 (not a `bool`), else `ValueError("Timeout must be positive")`. Then the task gets the **lowest-numbered free** connection, or joins the back of the queue with deadline `now + timeout` (no deadline when `timeout` is `None`).
- `release(task, now)` gives the task's connection back. Order: time checks; a task that holds nothing is `ValueError("Not holding: <task>")` (and nothing else changes); then waiters whose deadline has passed are removed and recorded; then the connection **passes straight to the first remaining waiter**, and `release` returns `(waiter, connection)`; with nobody waiting the connection becomes free and `release` returns `None`.
- `tick(now)` removes the waiters whose deadline has passed and returns them as a list in queue order.
- `cancel(task)` removes a waiting task; not waiting is `ValueError("Not waiting: <task>")`.

**Questions:** `free` (free connections), `holders` (a **new** list of `(task, connection)` sorted by connection), `waiting` (a **new** list of tasks, oldest first), `timed_out` (a **new** list of every task that timed out so far, in order).''',
    starter=r'''class WaitPool:
    def __init__(self, size):
        ...

    def acquire(self, task, now, timeout=None):
        """A connection number, or "waiting"."""
        ...

    def release(self, task, now):
        """(waiter, connection) when handed on, else None."""
        ...

    def tick(self, now):
        ...

    def cancel(self, task):
        ...

    @property
    def free(self):
        ...

    @property
    def holders(self):
        ...

    @property
    def waiting(self):
        ...

    @property
    def timed_out(self):
        ...''',
    tests=r'''def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
for bad in (0, -1, 1.5, True, None):
    assert error_of(WaitPool, bad) == "ValueError: Size must be positive"
pool = WaitPool(3)
assert pool.free == 3 and pool.holders == [] and pool.waiting == [] and pool.timed_out == []
assert pool.acquire("a", 0) == 1 and pool.acquire("b", 0) == 2 and pool.acquire("c", 1) == 3 and pool.free == 0
assert pool.holders == [("a", 1), ("b", 2), ("c", 3)]
assert pool.release("b", 2) is None and pool.free == 1 and pool.acquire("d", 2) == 2 and pool.holders == [("a", 1), ("d", 2), ("c", 3)]
assert pool.release("a", 3) is None and pool.release("c", 3) is None and pool.acquire("e", 3) == 1 and pool.acquire("f", 3) == 3
for bad in (-1, True, None, "1"):
    assert error_of(pool.acquire, "x", bad) == "ValueError: Bad time"
assert error_of(pool.release, "e", -1) == "ValueError: Bad time" and error_of(pool.tick, None) == "ValueError: Bad time"
assert error_of(pool.acquire, "x", 2) == "ValueError: Time went backwards" and error_of(pool.release, "e", 1) == "ValueError: Time went backwards" and error_of(pool.tick, 0) == "ValueError: Time went backwards"
assert error_of(pool.acquire, "e", 3) == "ValueError: Already holding or waiting: e"
one = WaitPool(1)
assert one.acquire("a", 0) == 1
assert one.acquire("b", 1, timeout=3) == "waiting" and one.acquire("c", 2, timeout=10) == "waiting" and one.acquire("d", 3) == "waiting"
assert one.waiting == ["b", "c", "d"] and one.free == 0
assert error_of(one.acquire, "b", 3) == "ValueError: Already holding or waiting: b" and error_of(one.acquire, "a", 3) == "ValueError: Already holding or waiting: a"
for bad in (0, -1, True, "5"):
    assert error_of(one.acquire, "z", 3, timeout=bad) == "ValueError: Timeout must be positive"
assert one.waiting == ["b", "c", "d"]
assert one.tick(3) == [] and one.waiting == ["b", "c", "d"]
assert one.tick(4) == ["b"] and one.waiting == ["c", "d"] and one.timed_out == ["b"]
assert one.tick(4) == [] and one.timed_out == ["b"]
assert one.release("a", 5) == ("c", 1) and one.holders == [("c", 1)] and one.waiting == ["d"]
assert error_of(one.release, "a", 6) == "ValueError: Not holding: a" and error_of(one.release, "d", 6) == "ValueError: Not holding: d"
assert one.release("c", 6) == ("d", 1) and one.release("d", 7) is None and one.free == 1 and one.holders == []
two = WaitPool(1)
two.acquire("a", 0)
two.acquire("b", 1, timeout=2)
two.acquire("c", 2, timeout=5)
assert two.release("a", 3) == ("c", 1) and two.timed_out == ["b"] and two.waiting == []
assert error_of(two.release, "zzz", 4) == "ValueError: Not holding: zzz" and two.timed_out == ["b"]
three = WaitPool(1)
three.acquire("a", 0)
three.acquire("b", 1, timeout=2)
three.acquire("c", 1, timeout=1)
assert three.acquire("x", 3, timeout=1) == "waiting" and three.timed_out == ["b", "c"] and three.waiting == ["x"]
assert three.acquire("b", 3) == "waiting" and three.waiting == ["x", "b"]
assert three.cancel("x") is None and three.waiting == ["b"] and error_of(three.cancel, "x") == "ValueError: Not waiting: x" and error_of(three.cancel, "a") == "ValueError: Not waiting: a"
assert three.release("a", 3.5) == ("b", 1) and three.timed_out == ["b", "c"]
four = WaitPool(1)
four.acquire("a", 0)
four.acquire("w1", 0, timeout=1)
four.acquire("w2", 0, timeout=1)
four.acquire("w3", 0, timeout=2)
assert four.tick(1) == ["w1", "w2"] and four.timed_out == ["w1", "w2"] and four.waiting == ["w3"]
assert four.release("a", 1) == ("w3", 1)
snap = four.holders
snap.append("junk")
waits = four.waiting
waits.append("junk")
outs = four.timed_out
outs.append("junk")
assert four.holders == [("w3", 1)] and four.waiting == [] and four.timed_out == ["w1", "w2"]
five = WaitPool(2)
assert five.acquire("a", 0, timeout=5) == 1 and five.acquire("b", 0) == 2
assert five.acquire("c", 0, timeout=5) == "waiting" and five.acquire("d", 1, timeout=1.5) == "waiting"
assert five.tick(2.5) == ["d"] and five.waiting == ["c"]
assert five.release("b", 4.9) == ("c", 2) and five.timed_out == ["d"]
six = WaitPool(1)
six.acquire("a", 5)
assert six.acquire("b", 5, timeout=1) == "waiting" and six.tick(5.5) == [] and six.tick(6) == ["b"]
assert six.acquire("b", 6) == "waiting" and six.release("a", 6) == ("b", 1)''',
    solution=r'''class WaitPool:
    def __init__(self, size):
        if type(size) is not int or size < 1:
            raise ValueError("Size must be positive")
        self._size = size
        self._busy = {}
        self._waiting = []
        self._timed_out = []
        self._latest = None

    @property
    def free(self):
        return self._size - len(self._busy)

    @property
    def holders(self):
        return [(task, conn) for conn, task in sorted(self._busy.items())]

    @property
    def waiting(self):
        return [task for task, _ in self._waiting]

    @property
    def timed_out(self):
        return list(self._timed_out)

    def _advance(self, now):
        if type(now) not in (int, float) or now < 0:
            raise ValueError("Bad time")
        if self._latest is not None and now < self._latest:
            raise ValueError("Time went backwards")
        self._latest = now

    def _expire(self, now):
        gone = [task for task, deadline in self._waiting if deadline is not None and deadline <= now]
        self._waiting = [entry for entry in self._waiting if not (entry[1] is not None and entry[1] <= now)]
        self._timed_out.extend(gone)
        return gone

    def acquire(self, task, now, timeout=None):
        self._advance(now)
        self._expire(now)
        if task in self._busy.values() or any(waiter == task for waiter, _ in self._waiting):
            raise ValueError("Already holding or waiting: " + str(task))
        if timeout is not None and (type(timeout) not in (int, float) or timeout <= 0):
            raise ValueError("Timeout must be positive")
        for conn in range(1, self._size + 1):
            if conn not in self._busy:
                self._busy[conn] = task
                return conn
        self._waiting.append((task, None if timeout is None else now + timeout))
        return "waiting"

    def release(self, task, now):
        self._advance(now)
        held = [conn for conn, owner in self._busy.items() if owner == task]
        if not held:
            raise ValueError("Not holding: " + str(task))
        self._expire(now)
        conn = held[0]
        if self._waiting:
            successor, _ = self._waiting.pop(0)
            self._busy[conn] = successor
            return (successor, conn)
        del self._busy[conn]
        return None

    def tick(self, now):
        self._advance(now)
        return self._expire(now)

    def cancel(self, task):
        for index, (waiter, _) in enumerate(self._waiting):
            if waiter == task:
                del self._waiting[index]
                return
        raise ValueError("Not waiting: " + str(task))''',
    hints=[
        r'''Keep the busy connections as `{number: task}` and the queue as `(task, deadline or None)` pairs. Free connections are derived: the numbers in `1..size` not in the dict. The lowest free one is the first number you find.''',
        r'''One helper, `_expire(now)`, removes every waiter with `deadline <= now`, appends them to the timed-out list and returns them. `acquire`, `release` and `tick` all call it, so "a waiter past its deadline never receives a connection" holds everywhere.''',
        r'''Order of operations in `release`: check the time, check that the task really holds a connection (and stop if not, without expiring anything), expire, and only then hand the connection to the first waiter that is left. A handed-on connection keeps its number.''',
    ],
    explanation=r'''**The idea.** A pool with waiting adds two ideas to a bounded set of connections: a **fair queue** and **deadlines**. The pool never sleeps; it is told the time. That is what makes timeouts testable (no `sleep`, no flakiness).

```mermaid
flowchart TD
    A[release conn 1 at time t] --> B[drop waiters with deadline <= t]
    B --> C{anyone left waiting?}
    C -- yes --> D[conn 1 passes to the first waiter]
    C -- no --> E[conn 1 becomes free]
```

**A waiter that gave up must not get a connection.** If `release` handed the connection to the head of the queue and only *then* looked at deadlines, a task that had already timed out would receive a connection nobody will release. Expiring first is the fix; the test with deadline 3 and release at 3 pins the boundary.

**Boundaries are inclusive on the deadline.** `deadline <= now` means "at exactly the deadline you are out". Decide it once and test it, because off-by-one here is a classic production incident.

**Time only goes forward.** Expiry removes entries for good. Accepting an earlier `now` later would silently resurrect nothing and mis-order everything, so the pool refuses it.

**Complexity.** Each call is O(waiters + size).

**Going further.** Replace the list with a heap keyed by deadline so that expiry is O(k log n). How do you handle a waiter that is cancelled while still in the heap?''',
),
P(
    slug='lld-idempotency-store', title='Idempotency With In-Flight Duplicates', topic='lld-concurrency-design', difficulty='advanced',
    module='lld/10-concurrency-safe-design/README.md',
    description='Make a request safe to retry: replay finished results, report in-progress duplicates, reject key reuse and let failures be retried.',
    statement=r'''Payment APIs let clients attach an **idempotency key** to a request so that a retry (after a timeout, a double click) does not charge twice. Write a class `IdempotencyStore` that wraps the work.

**Creating one:** `IdempotencyStore(clock, ttl=60)`. `clock()` returns the time in seconds; call it **once** per `process` and per `purge`. `ttl` must be a number above 0 (not a `bool`), else `ValueError("TTL must be positive")`.

**`process(key, request, handler)`** returns a pair `(status, result)`:

1. `key` must be a non-blank string, else `ValueError("Key required")` (checked before the clock is read).
2. A **finished** entry for the key is **expired** when `now >= finished_at + ttl`; an expired entry counts as absent.
3. If the key has an entry (still running, or finished and not expired) and its stored request is **not equal** (`!=`) to `request`: `ValueError("Key reused with a different request")`.
4. A **running** entry (a duplicate arrived while the first request is still being handled) returns `("in_progress", None)` and does **not** run the handler.
5. A **finished** entry returns `("replayed", result)` without running the handler.
6. Otherwise the key is marked running, `handler(request)` is called, and its return value is stored as the finished result; the call returns `("done", result)`. If the handler **raises**, the running mark is removed (so the client may retry), nothing is stored, and the exception propagates.

**Other methods:** `purge()` removes every expired finished entry and returns how many; `size` is the number of entries currently stored (running ones included, expired-but-not-purged ones included).

In real life the "duplicate while running" comes from another thread. Here a test simulates it by having the **handler call `process` again** with the same key.''',
    starter=r'''class IdempotencyStore:
    def __init__(self, clock, ttl=60):
        ...

    def process(self, key, request, handler):
        """Return (status, result)."""
        ...

    def purge(self):
        ...

    @property
    def size(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Clock:
    def __init__(self, now=0):
        self.now = now
        self.reads = 0
    def __call__(self):
        self.reads += 1
        return self.now
clock = Clock(0)
for bad in (0, -1, None, "60", True):
    assert error_of(IdempotencyStore, clock, bad) == "ValueError: TTL must be positive"
store = IdempotencyStore(clock, ttl=10)
calls = []
def handler(request):
    calls.append(request)
    return "result-" + str(request)
for bad in ("", "  ", None, 5):
    assert error_of(store.process, bad, "x", handler) == "ValueError: Key required"
assert clock.reads == 0 and store.size == 0
assert store.process("k1", "pay 5", handler) == ("done", "result-pay 5") and calls == ["pay 5"] and clock.reads == 1 and store.size == 1
assert store.process("k1", "pay 5", handler) == ("replayed", "result-pay 5") and calls == ["pay 5"] and clock.reads == 2
assert error_of(store.process, "k1", "pay 6", handler) == "ValueError: Key reused with a different request" and calls == ["pay 5"]
clock.now = 9
assert store.process("k1", "pay 5", handler) == ("replayed", "result-pay 5") and len(calls) == 1
clock.now = 10
assert store.process("k1", "pay 7", handler) == ("done", "result-pay 7") and calls == ["pay 5", "pay 7"]
assert store.process("k1", "pay 7", handler) == ("replayed", "result-pay 7")
assert store.process("k2", "pay 5", handler) == ("done", "result-pay 5") and len(calls) == 3
inner = []
def reentrant(request):
    inner.append(store.process("k3", request, reentrant))
    inner.append(error_of(store.process, "k3", "other", reentrant))
    return "ok"
assert store.process("k3", "r", reentrant) == ("done", "ok") and inner == [("in_progress", None), "ValueError: Key reused with a different request"]
assert store.process("k3", "r", reentrant) == ("replayed", "ok") and inner == [("in_progress", None), "ValueError: Key reused with a different request"]
state = {"fail": True}
runs = []
def flaky(request):
    runs.append(request)
    if state["fail"]:
        raise RuntimeError("card declined")
    return "charged"
assert error_of(store.process, "k4", "pay", flaky) == "RuntimeError: card declined" and runs == ["pay"]
size_after_failure = store.size
assert error_of(store.process, "k4", "pay", flaky) == "RuntimeError: card declined" and runs == ["pay", "pay"] and store.size == size_after_failure
state["fail"] = False
assert store.process("k4", "pay", flaky) == ("done", "charged") and store.process("k4", "pay", flaky) == ("replayed", "charged") and runs == ["pay", "pay", "pay"]
def nothing(request):
    return None
assert store.process("k5", {"a": [1, 2]}, nothing) == ("done", None) and store.process("k5", {"a": [1, 2]}, nothing) == ("replayed", None)
assert error_of(store.process, "k5", {"a": [1, 3]}, nothing) == "ValueError: Key reused with a different request"
clock.now = 12
store.process("late", "x", nothing)
before = store.size
reads = clock.reads
assert before == 6 and store.purge() == 0 and clock.reads == reads + 1 and store.size == before
clock.now = 19
assert store.purge() == 0 and store.size == before
clock.now = 20
assert store.purge() == 5 and store.size == 1
clock.now = 22
assert store.purge() == 1 and store.size == 0 and store.purge() == 0
fresh = IdempotencyStore(Clock(5))
calls2 = []
def count(request):
    calls2.append(request)
    return len(calls2)
assert fresh.process("a", 1, count) == ("done", 1) and fresh.process("a", 1, count) == ("replayed", 1) and fresh.process("b", 1, count) == ("done", 2)
slow_clock = Clock(0)
slow = IdempotencyStore(slow_clock, ttl=5)
def moves_clock(request):
    slow_clock.now = 3
    return "r"
assert slow.process("k", "q", moves_clock) == ("done", "r")
slow_clock.now = 4
assert slow.process("k", "q", moves_clock) == ("replayed", "r")
slow_clock.now = 5
assert slow.process("k", "q", moves_clock) == ("done", "r")''',
    solution=r'''class IdempotencyStore:
    def __init__(self, clock, ttl=60):
        if type(ttl) not in (int, float) or ttl <= 0:
            raise ValueError("TTL must be positive")
        self._clock = clock
        self._ttl = ttl
        self._entries = {}

    @property
    def size(self):
        return len(self._entries)

    def _expired(self, entry, now):
        return entry["state"] == "done" and now >= entry["finished"] + self._ttl

    def process(self, key, request, handler):
        if not isinstance(key, str) or not key.strip():
            raise ValueError("Key required")
        now = self._clock()
        entry = self._entries.get(key)
        if entry is not None and self._expired(entry, now):
            del self._entries[key]
            entry = None
        if entry is not None:
            if entry["request"] != request:
                raise ValueError("Key reused with a different request")
            if entry["state"] == "running":
                return ("in_progress", None)
            return ("replayed", entry["result"])
        record = {"request": request, "state": "running"}
        self._entries[key] = record
        try:
            result = handler(request)
        except Exception:
            del self._entries[key]
            raise
        record["state"] = "done"
        record["result"] = result
        record["finished"] = now
        return ("done", result)

    def purge(self):
        now = self._clock()
        gone = [key for key, entry in self._entries.items() if self._expired(entry, now)]
        for key in gone:
            del self._entries[key]
        return len(gone)''',
    hints=[
        r'''Store one record per key: the request, a state (`"running"` or `"done"`), and for finished ones the result and the time it finished. The mark must exist **before** the handler is called, otherwise a duplicate that arrives during the handler cannot see that work is in progress.''',
        r'''Treat an expired entry as absent *before* any other rule, and compare requests with `!=` before deciding between "in progress" and "replayed": a reused key with a different request is an error in both states.''',
        r'''Wrap the handler call in `try/except Exception`: on failure delete the running record and re-raise. Only on success store the result. Read the clock once, at the top, and use that value for the finish time.''',
    ],
    explanation=r'''**The idea.** Networks lose answers, not just requests. A client that times out cannot know whether the server did the work, so it retries; without protection a retry charges twice. An idempotency key lets the server say "I have seen this exact request: here is the answer I gave".

```mermaid
stateDiagram-v2
    [*] --> Running: first request
    Running --> Done: handler returns
    Running --> [*]: handler raises (retry allowed)
    Done --> [*]: ttl passes
    Running --> Running: duplicate returns in_progress
    Done --> Done: duplicate replays result
```

**Mark first, then work.** The running mark is the whole concurrency defence: the second request finds it and does not start a second charge. In a multi-threaded server the check-and-mark must be one atomic step (a lock or a database unique constraint); the test simulates the race by calling `process` from inside the handler.

**Same key, different request is an error.** Replaying `"pay 5"` for a request that says `"pay 6"` would return the wrong answer silently. Refusing is the safe choice.

**Failures are not remembered.** If the handler failed, the client must be able to retry the same key, so the entry is removed. (Storing failures is a design choice some APIs make; say which you chose.)

**Expiry.** Keys cannot be kept for ever. The boundary `now >= finished + ttl` is tested at exactly the TTL. Note the finish time is the time **read at the start of the call**: the clock moves while the handler runs, and the test shows the entry is dated from the single read.

**Complexity.** O(1) per call; `purge` is O(entries).

**Going further.** Also store the final HTTP response status and headers. What do you replay for a request that is still running after 30 seconds?''',
),
P(
    slug='lld-saga-orchestrator', title='Saga Orchestrator', topic='lld-concurrency-design', difficulty='intermediate',
    module='lld/10-concurrency-safe-design/README.md',
    description='Run a multi-step workflow and, when a step fails, undo the finished steps in reverse order while surviving failing compensations.',
    statement=r'''A booking spans several services (reserve a seat, charge a card, send the ticket) and there is no database transaction across them. A **saga** runs the steps in order and, if one fails, **undoes** the earlier ones by running their *compensating actions* in reverse. Write a class `Saga`.

**Creating one:** `Saga(steps)` where `steps` is a list of `(name, action, compensate)` tuples. `action(context)` does the work; `compensate(context)` undoes it, or is `None` when there is nothing to undo. Check the steps in order, and for each step check, in this order: it is not a 3-tuple `ValueError("Bad step")`; its name was already used `ValueError("Duplicate step: <name>")`; `action` is not callable `ValueError("Step <name> needs an action")`; `compensate` is neither callable nor `None` `ValueError("Step <name> has a bad compensation")`. An empty list is `ValueError("Saga needs steps")` (checked first).

**`run(context)`** calls each `action(context)` in order (`context` is any object you pass to every action and compensation, for example a dict) and returns a **new dict** with exactly these keys:

- `"status"`: `"completed"` when every step succeeded; `"compensated"` when a step failed and every compensation that had to run succeeded; `"compensation_failed"` when a step failed and at least one compensation raised.
- `"completed"`: the names of the steps that succeeded, in order.
- `"failed_step"` and `"error"`: the name of the first step that raised and `str(error)`, or `None` and `None` when nothing failed. The saga stops at the first failure; later actions never run.
- `"compensated"`: the names of the steps whose compensation ran **successfully**, in the order they ran.
- `"compensation_errors"`: a list of `(name, str(error))` for compensations that raised.

**On failure:** go through the **successful** steps **in reverse order**; skip those whose `compensate` is `None`; call the others. A compensation that raises is recorded and the **remaining compensations still run**. The failed step itself is never compensated. Only `Exception`s are caught.''',
    starter=r'''class Saga:
    def __init__(self, steps):
        ...

    def run(self, context):
        """Return the report dict."""
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
log = []
def step(name, fail=None, undo_fail=None, undo=True):
    def action(context):
        log.append("do " + name)
        if fail:
            raise RuntimeError(fail)
        context.append(name)
    def compensate(context):
        log.append("undo " + name)
        if undo_fail:
            raise RuntimeError(undo_fail)
        context.remove(name)
    return (name, action, compensate if undo else None)
assert error_of(Saga, []) == "ValueError: Saga needs steps"
assert error_of(Saga, [("a", print)]) == "ValueError: Bad step" and error_of(Saga, ["a"]) == "ValueError: Bad step" and error_of(Saga, [("a", print, None, 1)]) == "ValueError: Bad step"
assert error_of(Saga, [("a", print, None), ("a", print, None)]) == "ValueError: Duplicate step: a"
assert error_of(Saga, [("a", None, None)]) == "ValueError: Step a needs an action" and error_of(Saga, [("a", 5, None)]) == "ValueError: Step a needs an action"
assert error_of(Saga, [("a", print, 5)]) == "ValueError: Step a has a bad compensation"
assert error_of(Saga, [("a", print, None), ("b", print)]) == "ValueError: Bad step"
assert error_of(Saga, [("a", print, None), ("a", None, 5)]) == "ValueError: Duplicate step: a"
assert error_of(Saga, [("a", None, 5)]) == "ValueError: Step a needs an action"
ok = Saga([step("seat"), step("card"), step("ticket")])
context = []
report = ok.run(context)
assert report == {"status": "completed", "completed": ["seat", "card", "ticket"], "failed_step": None, "error": None, "compensated": [], "compensation_errors": []}
assert context == ["seat", "card", "ticket"] and log == ["do seat", "do card", "do ticket"]
log.clear()
saga = Saga([step("seat"), step("card"), step("ticket", fail="mail down"), step("audit")])
context = []
report = saga.run(context)
assert report == {"status": "compensated", "completed": ["seat", "card"], "failed_step": "ticket", "error": "mail down", "compensated": ["card", "seat"], "compensation_errors": []}
assert log == ["do seat", "do card", "do ticket", "undo card", "undo seat"] and context == []
log.clear()
first = Saga([step("a", fail="boom"), step("b")])
context = []
assert first.run(context) == {"status": "compensated", "completed": [], "failed_step": "a", "error": "boom", "compensated": [], "compensation_errors": []} and log == ["do a"]
log.clear()
skip = Saga([step("a"), step("b", undo=False), step("c"), step("d", fail="no")])
context = []
report = skip.run(context)
assert report["compensated"] == ["c", "a"] and report["completed"] == ["a", "b", "c"] and report["status"] == "compensated"
assert log == ["do a", "do b", "do c", "do d", "undo c", "undo a"]
log.clear()
messy = Saga([step("a", undo_fail="a stuck"), step("b"), step("c", undo_fail="c stuck"), step("d", fail="d broke")])
context = []
report = messy.run(context)
assert report == {"status": "compensation_failed", "completed": ["a", "b", "c"], "failed_step": "d", "error": "d broke", "compensated": ["b"], "compensation_errors": [("c", "c stuck"), ("a", "a stuck")]}
assert log == ["do a", "do b", "do c", "do d", "undo c", "undo b", "undo a"]
log.clear()
again = Saga([step("x"), step("y", fail="late")])
for attempt in range(2):
    context = []
    result = again.run(context)
    assert result["status"] == "compensated" and result["completed"] == ["x"] and context == []
result["completed"].append("junk")
assert again.run([])["completed"] == ["x"]
steps = [step("p"), step("q")]
copy_saga = Saga(steps)
steps.append(step("r", fail="not part of the saga"))
assert copy_saga.run([])["status"] == "completed"
shared = {"count": 0}
def inc(ctx):
    ctx["count"] += 1
def dec(ctx):
    ctx["count"] -= 1
def bad(ctx):
    raise ValueError("nope")
counter = Saga([("a", inc, dec), ("b", inc, dec), ("c", bad, dec)])
report = counter.run(shared)
assert shared == {"count": 0} and report["compensated"] == ["b", "a"] and report["error"] == "nope"
def interrupt(ctx):
    raise KeyboardInterrupt()
stop = Saga([("a", inc, dec), ("b", interrupt, None)])
shared2 = {"count": 0}
try:
    stop.run(shared2)
    caught = False
except KeyboardInterrupt:
    caught = True
assert caught and shared2 == {"count": 1}''',
    solution=r'''class Saga:
    def __init__(self, steps):
        steps = list(steps)
        if not steps:
            raise ValueError("Saga needs steps")
        seen = set()
        for item in steps:
            if not isinstance(item, tuple) or len(item) != 3:
                raise ValueError("Bad step")
            name, action, compensate = item
            if name in seen:
                raise ValueError("Duplicate step: " + str(name))
            seen.add(name)
            if not callable(action):
                raise ValueError("Step " + str(name) + " needs an action")
            if compensate is not None and not callable(compensate):
                raise ValueError("Step " + str(name) + " has a bad compensation")
        self._steps = steps

    def run(self, context):
        completed = []
        failed_step = None
        error = None
        for name, action, _ in self._steps:
            try:
                action(context)
            except Exception as problem:
                failed_step = name
                error = str(problem)
                break
            completed.append(name)
        compensated = []
        compensation_errors = []
        if failed_step is not None:
            undo = {name: compensate for name, _, compensate in self._steps}
            for name in reversed(completed):
                if undo[name] is None:
                    continue
                try:
                    undo[name](context)
                except Exception as problem:
                    compensation_errors.append((name, str(problem)))
                else:
                    compensated.append(name)
        if failed_step is None:
            status = "completed"
        elif compensation_errors:
            status = "compensation_failed"
        else:
            status = "compensated"
        return {
            "status": status,
            "completed": completed,
            "failed_step": failed_step,
            "error": error,
            "compensated": compensated,
            "compensation_errors": compensation_errors,
        }''',
    hints=[
        r'''Validate everything in `__init__` and keep your own copy of the steps list. `run` then has two phases: go forward until one action raises (remembering the name and `str(error)`), then, if something failed, go backwards over the steps that **succeeded**.''',
        r'''A failed compensation must not stop the others: wrap each one in its own `try/except Exception`, record `(name, message)` on failure and `name` on success. The status is decided at the end: any recorded compensation error means `"compensation_failed"`.''',
        r'''Return fresh lists in the report on every call. The step that failed is *not* in `completed`, so it is never compensated; steps with `compensate=None` are skipped silently and are not listed in `"compensated"`.''',
    ],
    explanation=r'''**The idea.** Across several services you cannot "roll back"; each service already committed its part. A saga replaces the rollback with **compensating actions**: the code that semantically undoes a step (release the seat, refund the card). Reverse order matters because later steps may depend on earlier ones (you refund before you release the seat the refund refers to).

```mermaid
flowchart LR
    A[reserve seat] --> B[charge card] --> C[send ticket]
    C -- fails --> B2[refund card]
    B2 --> A2[release seat]
```

**Compensations can fail too.** The honest report says so: `"compensation_failed"` tells an operator that something needs a human. Stopping at the first failing compensation would leave the *remaining* steps un-undone, which is worse than trying all of them.

**The failed step is not compensated.** It never completed, so there is nothing of it to undo (a real step that half-completed has to be written to be atomic or to clean up after itself).

**Skipping `None`.** Some steps have no undo (sending an email cannot be taken back). Declaring that explicitly with `None` is better than a compensation that quietly does nothing.

**Why the report is a plain dict.** The caller (a job runner, a UI) needs to display or log what happened; a dict with fixed keys is easy to assert on, serialise and compare.

**Complexity.** O(steps).

**Going further.** A real orchestrator persists the progress after every step, so a crashed process can resume or compensate. What would the persisted record contain?''',
),
P(
    slug='lld-cyclic-barrier', title='Cyclic Barrier', topic='lld-concurrency-design', difficulty='intermediate',
    module='lld/10-concurrency-safe-design/README.md',
    description='Model a reusable barrier where N tasks must all arrive before any is released, with a barrier action, generations and a broken state.',
    statement=r'''A **barrier** makes a group of tasks wait for each other: nobody continues until everybody has arrived (phases of a parallel computation). Write a class `Barrier`. It never blocks: `arrive` returns what happened.

**Creating one:** `Barrier(parties, action=None)`. `parties` must be an `int` of 1 or more (not a `bool`), else `ValueError("Parties must be positive")`. `action` is a function called once each time the barrier trips (or `None`); anything else callable-less is `ValueError("Action must be callable")` (check `parties` first).

**Methods and properties**

- `arrive(task)` registers a task for the current **generation**. Checks in order: the barrier is broken `ValueError("Barrier is broken")`; the task already arrived in this generation `ValueError("Already arrived: <task>")`.
  - If fewer than `parties` tasks have arrived, the result is `("waiting", number_arrived)`.
  - The **last** task to arrive **trips** the barrier: `action()` is called once (the `waiting` list still holds **all** the arrivals at that moment), then the result is `("released", tasks)` with the tasks in the order they arrived. The barrier is then ready for the next generation: `generation` goes up by one and `waiting` is empty (the barrier is *cyclic*, it can be used again).
  - If `action` **raises**, the barrier becomes **broken**, `waiting` is cleared, and the exception propagates out of that `arrive` call.
- `break_barrier()` marks the barrier broken (for example after a timeout elsewhere) and returns the **list of tasks that were waiting** (they would be woken with an error); it clears `waiting`. Breaking a broken barrier returns `[]`.
- `reset()` returns the list of tasks that were waiting, clears `waiting`, makes the barrier **not** broken, and starts a new generation (`generation` + 1).
- `waiting` is a **new list** of the tasks that arrived in this generation, `generation` starts at 0, and `broken` is a bool.''',
    starter=r'''class Barrier:
    def __init__(self, parties, action=None):
        ...

    def arrive(self, task):
        """("waiting", n) or ("released", [tasks])."""
        ...

    def break_barrier(self):
        ...

    def reset(self):
        ...

    @property
    def waiting(self):
        ...

    @property
    def generation(self):
        ...

    @property
    def broken(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
for bad in (0, -1, 1.5, True, None):
    assert error_of(Barrier, bad) == "ValueError: Parties must be positive"
assert error_of(Barrier, 2, "x") == "ValueError: Action must be callable" and error_of(Barrier, 2, 5) == "ValueError: Action must be callable" and error_of(Barrier, 0, 5) == "ValueError: Parties must be positive"
seen = []
def action():
    seen.append(list(barrier.waiting))
barrier = Barrier(3, action)
assert barrier.generation == 0 and barrier.waiting == [] and barrier.broken is False
assert barrier.arrive("a") == ("waiting", 1) and barrier.arrive("b") == ("waiting", 2) and barrier.waiting == ["a", "b"]
assert error_of(barrier.arrive, "a") == "ValueError: Already arrived: a" and barrier.waiting == ["a", "b"]
assert seen == []
assert barrier.arrive("c") == ("released", ["a", "b", "c"])
assert seen == [["a", "b", "c"]] and barrier.generation == 1 and barrier.waiting == []
assert barrier.arrive("c") == ("waiting", 1) and barrier.arrive("a") == ("waiting", 2) and barrier.arrive("b") == ("released", ["c", "a", "b"])
assert seen == [["a", "b", "c"], ["c", "a", "b"]] and barrier.generation == 2
copy = barrier.arrive("x")
waiting = barrier.waiting
waiting.append("junk")
assert barrier.waiting == ["x"]
assert barrier.break_barrier() == ["x"] and barrier.broken is True and barrier.waiting == [] and barrier.generation == 2
assert error_of(barrier.arrive, "y") == "ValueError: Barrier is broken" and error_of(barrier.arrive, "x") == "ValueError: Barrier is broken"
assert barrier.break_barrier() == [] and barrier.broken is True
assert barrier.reset() == [] and barrier.broken is False and barrier.generation == 3
assert barrier.arrive("p") == ("waiting", 1)
assert barrier.reset() == ["p"] and barrier.waiting == [] and barrier.generation == 4 and barrier.broken is False
assert barrier.arrive("p") == ("waiting", 1) and barrier.arrive("q") == ("waiting", 2) and barrier.arrive("r") == ("released", ["p", "q", "r"])
solo = Barrier(1)
assert solo.arrive("only") == ("released", ["only"]) and solo.generation == 1 and solo.arrive("only") == ("released", ["only"]) and solo.generation == 2
plain = Barrier(2)
assert plain.arrive("a") == ("waiting", 1) and plain.arrive("b") == ("released", ["a", "b"])
def explode():
    raise RuntimeError("phase failed")
bomb = Barrier(2, explode)
bomb.arrive("a")
assert error_of(bomb.arrive, "b") == "RuntimeError: phase failed" and bomb.broken is True and bomb.waiting == [] and bomb.generation == 0
assert error_of(bomb.arrive, "c") == "ValueError: Barrier is broken"
bomb.reset()
assert bomb.broken is False and bomb.arrive("a") == ("waiting", 1) and error_of(bomb.arrive, "b") == "RuntimeError: phase failed"
count = []
counted = Barrier(2, lambda: count.append(1))
for round_number in range(5):
    counted.arrive("x")
    counted.arrive("y")
assert len(count) == 5 and counted.generation == 5
big = Barrier(100)
for index in range(99):
    assert big.arrive("t" + str(index)) == ("waiting", index + 1)
result = big.arrive("last")
assert result[0] == "released" and len(result[1]) == 100 and result[1][0] == "t0" and result[1][-1] == "last"
released = result[1]
released.append("junk")
assert big.waiting == []''',
    solution=r'''class Barrier:
    def __init__(self, parties, action=None):
        if type(parties) is not int or parties < 1:
            raise ValueError("Parties must be positive")
        if action is not None and not callable(action):
            raise ValueError("Action must be callable")
        self._parties = parties
        self._action = action
        self._waiting = []
        self._generation = 0
        self._broken = False

    @property
    def waiting(self):
        return list(self._waiting)

    @property
    def generation(self):
        return self._generation

    @property
    def broken(self):
        return self._broken

    def arrive(self, task):
        if self._broken:
            raise ValueError("Barrier is broken")
        if task in self._waiting:
            raise ValueError("Already arrived: " + str(task))
        self._waiting.append(task)
        if len(self._waiting) < self._parties:
            return ("waiting", len(self._waiting))
        if self._action is not None:
            try:
                self._action()
            except Exception:
                self._broken = True
                self._waiting = []
                raise
        released = self._waiting
        self._waiting = []
        self._generation += 1
        return ("released", released)

    def break_barrier(self):
        waiters = self._waiting
        self._waiting = []
        self._broken = True
        return waiters

    def reset(self):
        waiters = self._waiting
        self._waiting = []
        self._broken = False
        self._generation += 1
        return waiters''',
    hints=[
        r'''State is the list of arrivals in this generation, a generation counter and a `broken` flag. The barrier trips exactly when `len(waiting) == parties`; right then you hand the list to the caller and start a fresh empty list for the next generation.''',
        r'''Run the action **before** clearing `waiting` (the statement says the action sees all arrivals) and **before** bumping `generation`. If it raises, mark the barrier broken, clear the waiting list and re-raise: a barrier whose action failed must not look healthy.''',
        r'''`break_barrier` and `reset` both hand back the waiting tasks (they are the ones that would be woken with an error) and clear the list. They differ only in what happens to `broken` and `generation`.''',
    ],
    explanation=r'''**The idea.** A barrier is the simplest *synchronisation point*: a counter of arrivals that trips at N. Parallel algorithms use it between phases ("everyone finish step 1 before anyone starts step 2"). It is **cyclic** because the same barrier serves every phase.

```mermaid
stateDiagram-v2
    [*] --> Collecting
    Collecting --> Collecting: arrive (fewer than N)
    Collecting --> Collecting: Nth arrives: action, release, generation + 1
    Collecting --> Broken: action raises or break
    Broken --> Collecting: reset
```

**Generations stop mix-ups.** A fast task that finishes phase 2 and arrives again must count towards the *next* trip, not the one that just released it. A fresh waiting list per generation (and an `Already arrived` check inside one generation) gives that.

**The action runs once, by the last arriver.** That is the place to merge the phase's results. It runs while everybody is still counted as waiting, so the test action can see all arrivals.

**Broken is part of the protocol.** If one participant dies, the others would wait for ever. `break_barrier` is how a timeout elsewhere frees them (with an error), and the broken state makes every later `arrive` fail fast until someone decides to `reset`.

**Complexity.** `arrive` is O(waiting) for the duplicate check; a set makes it O(1).

**Going further.** A *latch* (count down to zero, then open for good) is a barrier that never cycles and whose waiters are not counted. Which of your methods would you delete?''',
),
P(
    slug='lld-micro-batcher', title='Micro-Batcher', topic='lld-concurrency-design', difficulty='intermediate',
    module='lld/10-concurrency-safe-design/README.md',
    description='Collect items and send them in batches by size or age, keep a failed batch for retry and handle items added while flushing.',
    statement=r'''Sending one item at a time is slow; sending every hour is late. A **micro-batcher** collects items and sends them together when the batch is **full** or **old enough**. Write a class `MicroBatcher`.

**Creating one:** `MicroBatcher(flush, max_size, max_age, clock)`. Check in this order: `flush` is not callable `ValueError("Flush must be callable")`; `max_size` is not an `int` of 1 or more (not a `bool`) `ValueError("Max size must be positive")`; `max_age` is not a number above 0 (not a `bool`) `ValueError("Max age must be positive")`. `clock()` returns the time in seconds; call it **once** in every call to `add`, `tick` and `flush_now`.

**Methods**

- `add(item)` puts the item in the batch. The batch's **age starts when its first item was added**. When the batch reaches `max_size` items it is flushed at once and `add` returns `True`; otherwise `False`.
- `tick()` is called regularly by a timer: when the batch is not empty and `clock() - first_added >= max_age` it is flushed and `tick` returns `True`; otherwise `False`.
- `flush_now()` flushes a non-empty batch immediately (`True`), or does nothing (`False`).
- `pending` is the number of items waiting; `batches_sent` the number of successful flushes.

**Flushing.** `flush(batch)` is called with a **new list** of the items, oldest first. The batcher empties its buffer **before** calling it, so items added *during* the call (by `flush` itself) go into the **next** batch, and their age starts then. If `flush` **raises**, the exception propagates and the batch is **put back in front** of anything added in the meantime, keeping its **original** start time; `batches_sent` does not change. A successful flush increments `batches_sent`.''',
    starter=r'''class MicroBatcher:
    def __init__(self, flush, max_size, max_age, clock):
        ...

    def add(self, item):
        """True when this add flushed the batch."""
        ...

    def tick(self):
        ...

    def flush_now(self):
        ...

    @property
    def pending(self):
        ...

    @property
    def batches_sent(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Clock:
    def __init__(self, now=0):
        self.now = now
        self.reads = 0
    def __call__(self):
        self.reads += 1
        return self.now
sent = []
clock = Clock(0)
assert error_of(MicroBatcher, "x", 3, 10, clock) == "ValueError: Flush must be callable" and error_of(MicroBatcher, None, 0, 0, clock) == "ValueError: Flush must be callable"
for bad in (0, -1, 1.5, True, None):
    assert error_of(MicroBatcher, sent.append, bad, 10, clock) == "ValueError: Max size must be positive"
for bad in (0, -1, True, None, "5"):
    assert error_of(MicroBatcher, sent.append, 3, bad, clock) == "ValueError: Max age must be positive"
assert error_of(MicroBatcher, sent.append, 0, 0, clock) == "ValueError: Max size must be positive"
batcher = MicroBatcher(sent.append, 3, 10, clock)
assert batcher.pending == 0 and batcher.batches_sent == 0 and batcher.tick() is False and batcher.flush_now() is False and sent == []
assert batcher.add("a") is False and batcher.add("b") is False and batcher.pending == 2 and sent == []
assert batcher.add("c") is True and sent == [["a", "b", "c"]] and batcher.pending == 0 and batcher.batches_sent == 1
clock.now = 5
assert batcher.add("d") is False
clock.now = 14
assert batcher.tick() is False and sent == [["a", "b", "c"]]
clock.now = 15
assert batcher.tick() is True and sent[-1] == ["d"] and batcher.pending == 0 and batcher.batches_sent == 2
assert batcher.tick() is False
clock.now = 20
batcher.add("e")
clock.now = 28
batcher.add("f")
clock.now = 30
assert batcher.tick() is True and sent[-1] == ["e", "f"]
reads = clock.reads
batcher.add("g")
assert clock.reads == reads + 1
batcher.tick()
assert clock.reads == reads + 2
batcher.flush_now()
assert clock.reads == reads + 3 and sent[-1] == ["g"]
assert batcher.flush_now() is False
batcher.add("h")
assert batcher.flush_now() is True and sent[-1] == ["h"] and batcher.batches_sent == 5
passed = []
check = MicroBatcher(passed.append, 2, 10, clock)
check.add(1)
check.add(2)
passed[0].append("junk")
check.add(3)
check.add(4)
assert passed == [[1, 2, "junk"], [3, 4]]
attempts = []
state = {"fail": True}
def flaky(batch):
    attempts.append(list(batch))
    if state["fail"]:
        raise OSError("network down")
clock2 = Clock(100)
retry = MicroBatcher(flaky, 2, 10, clock2)
retry.add("a")
assert error_of(retry.add, "b") == "OSError: network down" and attempts == [["a", "b"]] and retry.pending == 2 and retry.batches_sent == 0
clock2.now = 105
assert error_of(retry.add, "c") == "OSError: network down" and attempts[-1] == ["a", "b", "c"] and retry.pending == 3
state["fail"] = False
clock2.now = 110
assert retry.tick() is True and attempts[-1] == ["a", "b", "c"] and retry.pending == 0 and retry.batches_sent == 1
clock3 = Clock(0)
age = MicroBatcher(flaky, 10, 10, clock3)
state["fail"] = True
age.add("x")
clock3.now = 10
assert error_of(age.tick) == "OSError: network down" and age.pending == 1
clock3.now = 11
state["fail"] = False
assert age.tick() is True and attempts[-1] == ["x"]
reentrant_sent = []
def spawning(batch):
    reentrant_sent.append(list(batch))
    if len(reentrant_sent) == 1:
        again.add("late")
clock4 = Clock(0)
again = MicroBatcher(spawning, 2, 10, clock4)
again.add("a")
clock4.now = 3
assert again.add("b") is True and reentrant_sent == [["a", "b"]] and again.pending == 1 and again.batches_sent == 1
clock4.now = 12
assert again.tick() is False
clock4.now = 13
assert again.tick() is True and reentrant_sent[-1] == ["late"]
clock5 = Clock(50)
mid_state = {"fail": True}
mid_batches = []
def failing_adder(batch):
    if mid_state["fail"]:
        mid.add("during")
        raise RuntimeError("boom")
    mid_batches.append(list(batch))
mid = MicroBatcher(failing_adder, 2, 10, clock5)
mid.add("a")
clock5.now = 55
assert error_of(mid.add, "b") == "RuntimeError: boom"
assert mid.pending == 3
mid_state["fail"] = False
assert mid.flush_now() is True and mid_batches == [["a", "b", "during"]]
def eater(batch):
    batch.clear()
    raise OSError("eaten")
eat = MicroBatcher(eater, 2, 10, Clock(0))
eat.add("a")
assert error_of(eat.add, "b") == "OSError: eaten" and eat.pending == 2
big_sent = []
big = MicroBatcher(lambda batch: big_sent.append(len(batch)), 1000, 10, Clock(0))
for number in range(10500):
    big.add(number)
assert big_sent == [1000] * 10 and big.pending == 500 and big.batches_sent == 10''',
    solution=r'''class MicroBatcher:
    def __init__(self, flush, max_size, max_age, clock):
        if not callable(flush):
            raise ValueError("Flush must be callable")
        if type(max_size) is not int or max_size < 1:
            raise ValueError("Max size must be positive")
        if type(max_age) not in (int, float) or max_age <= 0:
            raise ValueError("Max age must be positive")
        self._flush = flush
        self._max_size = max_size
        self._max_age = max_age
        self._clock = clock
        self._items = []
        self._first = None
        self._sent = 0

    @property
    def pending(self):
        return len(self._items)

    @property
    def batches_sent(self):
        return self._sent

    def _send(self):
        batch = self._items
        first = self._first
        self._items = []
        self._first = None
        try:
            self._flush(list(batch))
        except Exception:
            self._items = batch + self._items
            self._first = first
            raise
        self._sent += 1

    def add(self, item):
        now = self._clock()
        if not self._items:
            self._first = now
        self._items.append(item)
        if len(self._items) >= self._max_size:
            self._send()
            return True
        return False

    def tick(self):
        now = self._clock()
        if self._items and now - self._first >= self._max_age:
            self._send()
            return True
        return False

    def flush_now(self):
        self._clock()
        if not self._items:
            return False
        self._send()
        return True''',
    hints=[
        r'''State: the list of items, the time the **first** item of this batch was added, and a counter. `add` records the time only when the list is empty, and flushes when the size is reached; `tick` flushes when the first item is old enough.''',
        r'''To make "items added while flushing go to the next batch" work, **take the batch out and empty the buffer first**, then call `flush` with a copy. That is also why a failed flush needs a repair step: put the batch back **in front of** whatever arrived meanwhile, and restore the original start time.''',
        r'''Read the clock once per public call, even in `flush_now` (which does not use the value): the statement counts the reads, so a test can detect a version that reads it twice or not at all.''',
    ],
    explanation=r'''**The idea.** Batching trades a little latency for a lot of throughput: one request with 100 items costs far less than 100 requests. Two triggers bound the trade: **size** (do not grow without limit) and **age** (do not wait for ever when traffic is slow).

```mermaid
flowchart TD
    A[add item] --> B{first item?}
    B -- yes --> C[start the age clock]
    A --> D{size reached?}
    D -- yes --> E[flush]
    T[timer tick] --> F{oldest item old enough?}
    F -- yes --> E
    E --> G{flush raised?}
    G -- yes --> H[put the batch back, keep its age]
    G -- no --> I[batches_sent + 1]
```

**Empty the buffer before calling out.** The flush function is somebody else's code: it may be slow, may add items, may fail. If the batcher cleared its buffer *after* the call, items added during it would be lost or sent twice. Taking the batch out first gives each item exactly one home.

**A failed batch keeps its age.** Restarting the clock on failure would let a broken downstream delay data indefinitely; keeping the original time means the next `tick` retries at once. The repaired buffer puts the failed items **first**, so order is preserved.

**Copy on the way out.** The flush callback receives a copy: if it keeps or changes the list, the batcher's own state is untouched.

**Complexity.** `add` and `tick` are O(1) apart from the flush itself (O(batch)).

**Going further.** Retrying forever with the same batch can wedge a pipeline (a poison item). Add a retry limit and a dead-letter list; which of the counters in this class would change?''',
),
]
