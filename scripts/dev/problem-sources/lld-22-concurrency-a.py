PROBLEMS = [
P(
    slug='lld-read-write-lock', title='Read-Write Lock', topic='lld-concurrency-design', difficulty='advanced',
    module='lld/10-concurrency-safe-design/README.md',
    description='Design the state machine of a fair read-write lock: shared readers, an exclusive writer, a FIFO queue and no starvation.',
    statement=r'''Threads are hard to test, but the *rules* of a lock are plain state. Write a class `ReadWriteLock` that decides who holds a lock and who waits, without any real threads or blocking: calls return what happened.

**Rules.** Any number of **readers** may hold the lock together, or **one writer** alone. Requests are served **fairly, first come first served**: a request is granted at once only if **nobody is queued** and it is compatible with the current holders; otherwise it joins the queue. (So a waiting writer stops *new* readers from slipping in and starving it.)

**Methods**

- `acquire_read(owner)` and `acquire_write(owner)` return `"granted"` or `"queued"`. An owner that already holds the lock or is queued is `ValueError("Already holding or waiting: <owner>")` (a lock is not re-entrant).
- `release(owner)` releases what the owner holds and returns the **list of owners granted as a result**, in the order they were granted. Releasing without holding (including when only queued) is `ValueError("Not holding: <owner>")`.
- `cancel(owner)` removes a **queued** request and returns the owners granted as a result (the removal may unblock readers behind a writer). Not queued: `ValueError("Not waiting: <owner>")`.
- `state` is `("read", [owners])` (in the order granted), `("write", [owner])` or `(None, [])`; `waiting` is a **new list** of `(owner, "read" or "write")`, oldest first.

**Granting after a release or cancel.** Look at the **head of the queue** only. If it is a **writer**: grant it only when nobody holds the lock (then stop). If it is a **reader**: grant it and keep granting the readers that follow it in the queue, until the next writer, as long as no writer holds the lock.''',
    starter=r'''class ReadWriteLock:
    def __init__(self):
        ...

    def acquire_read(self, owner):
        """Return "granted" or "queued"."""
        ...

    def acquire_write(self, owner):
        ...

    def release(self, owner):
        """Return the owners granted as a result."""
        ...

    def cancel(self, owner):
        ...

    @property
    def state(self):
        ...

    @property
    def waiting(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
lock = ReadWriteLock()
assert lock.state == (None, []) and lock.waiting == []
assert lock.acquire_read("r1") == "granted" and lock.acquire_read("r2") == "granted"
assert lock.state == ("read", ["r1", "r2"]) and lock.state[1].append("junk") is None and lock.state == ("read", ["r1", "r2"])
assert lock.acquire_write("w1") == "queued" and lock.acquire_read("r3") == "queued"
assert lock.waiting == [("w1", "write"), ("r3", "read")] and lock.state == ("read", ["r1", "r2"])
assert error_of(lock.acquire_read, "r1") == "ValueError: Already holding or waiting: r1" and error_of(lock.acquire_write, "r2") == "ValueError: Already holding or waiting: r2"
assert error_of(lock.acquire_write, "w1") == "ValueError: Already holding or waiting: w1" and error_of(lock.acquire_read, "r3") == "ValueError: Already holding or waiting: r3"
assert error_of(lock.release, "zed") == "ValueError: Not holding: zed" and error_of(lock.release, "w1") == "ValueError: Not holding: w1"
assert lock.release("r1") == [] and lock.state == ("read", ["r2"]) and lock.waiting == [("w1", "write"), ("r3", "read")]
assert lock.release("r2") == ["w1"] and lock.state == ("write", ["w1"]) and lock.waiting == [("r3", "read")]
assert lock.acquire_read("r4") == "queued" and lock.acquire_write("w2") == "queued"
assert lock.release("w1") == ["r3", "r4"] and lock.state == ("read", ["r3", "r4"]) and lock.waiting == [("w2", "write")]
assert lock.release("r3") == [] and lock.release("r4") == ["w2"] and lock.state == ("write", ["w2"]) and lock.waiting == []
assert lock.release("w2") == [] and lock.state == (None, [])
assert error_of(lock.release, "w2") == "ValueError: Not holding: w2"
w = ReadWriteLock()
assert w.acquire_write("w0") == "granted" and w.state == ("write", ["w0"])
assert w.acquire_read("a") == "queued" and w.acquire_read("b") == "queued" and w.acquire_write("w1") == "queued" and w.acquire_read("c") == "queued"
assert w.release("w0") == ["a", "b"] and w.state == ("read", ["a", "b"]) and w.waiting == [("w1", "write"), ("c", "read")]
assert w.release("a") == [] and w.release("b") == ["w1"] and w.release("w1") == ["c"] and w.state == ("read", ["c"])
assert w.acquire_write("w2") == "queued" and w.acquire_read("d") == "queued"
assert w.cancel("w2") == ["d"] and w.state == ("read", ["c", "d"]) and w.waiting == []
assert error_of(w.cancel, "w2") == "ValueError: Not waiting: w2" and error_of(w.cancel, "c") == "ValueError: Not waiting: c" and error_of(w.cancel, "zed") == "ValueError: Not waiting: zed"
x = ReadWriteLock()
x.acquire_read("r1")
x.acquire_write("w1")
x.acquire_write("w2")
x.acquire_read("r2")
assert x.cancel("w1") == [] and x.waiting == [("w2", "write"), ("r2", "read")]
assert x.cancel("w2") == ["r2"] and x.state == ("read", ["r1", "r2"])
y = ReadWriteLock()
y.acquire_write("w1")
y.acquire_write("w2")
y.acquire_read("r1")
assert y.release("w1") == ["w2"] and y.release("w2") == ["r1"]
z = ReadWriteLock()
z.acquire_read("r1")
z.acquire_read("r2")
z.acquire_write("w")
z.acquire_read("r3")
assert z.cancel("r3") == [] and z.waiting == [("w", "write")]
assert z.release("r2") == [] and z.release("r1") == ["w"]
snapshot = z.waiting
snapshot.append("junk")
assert z.waiting == [] and z.state[1].append("junk") is None and z.state == ("write", ["w"])
s = ReadWriteLock()
assert s.acquire_write("w") == "granted" and s.acquire_write("w2") == "queued" and s.acquire_read("r") == "queued"
assert s.cancel("w2") == [] and s.waiting == [("r", "read")] and s.state == ("write", ["w"])''',
    solution=r'''class ReadWriteLock:
    def __init__(self):
        self._readers = []
        self._writer = None
        self._queue = []

    def _check_new(self, owner):
        if owner in self._readers or owner == self._writer or any(queued == owner for queued, _ in self._queue):
            raise ValueError("Already holding or waiting: " + str(owner))

    def acquire_read(self, owner):
        self._check_new(owner)
        if not self._queue and self._writer is None:
            self._readers.append(owner)
            return "granted"
        self._queue.append((owner, "read"))
        return "queued"

    def acquire_write(self, owner):
        self._check_new(owner)
        if not self._queue and self._writer is None and not self._readers:
            self._writer = owner
            return "granted"
        self._queue.append((owner, "write"))
        return "queued"

    def _grant(self):
        granted = []
        while self._queue:
            owner, mode = self._queue[0]
            if mode == "write":
                if self._writer is None and not self._readers:
                    self._writer = owner
                    self._queue.pop(0)
                    granted.append(owner)
                break
            if self._writer is not None:
                break
            self._readers.append(owner)
            self._queue.pop(0)
            granted.append(owner)
        return granted

    def release(self, owner):
        if owner == self._writer:
            self._writer = None
        elif owner in self._readers:
            self._readers.remove(owner)
        else:
            raise ValueError("Not holding: " + str(owner))
        return self._grant()

    def cancel(self, owner):
        for index, (queued, _) in enumerate(self._queue):
            if queued == owner:
                del self._queue[index]
                return self._grant()
        raise ValueError("Not waiting: " + str(owner))

    @property
    def state(self):
        if self._writer is not None:
            return ("write", [self._writer])
        if self._readers:
            return ("read", list(self._readers))
        return (None, [])

    @property
    def waiting(self):
        return list(self._queue)''',
    hints=[
        r'''State is three things: the list of readers holding, the writer holding (or `None`), and one queue of `(owner, mode)`. A new request is **granted only if the queue is empty** and it fits; otherwise it joins the queue. That one rule is the fairness.''',
        r'''Write one `_grant()` and call it after every release **and** every cancel. It looks at the queue head only: a writer needs an empty lock (then stop), a reader is granted unless a writer holds, and then the loop continues so the readers behind it are granted too.''',
        r'''A queued owner does not hold anything, so `release` must refuse it (`Not holding`). Removing a writer from the head of the queue (`cancel`) can free the readers behind it, which is why `cancel` also calls `_grant()` and returns who was granted.''',
    ],
    explanation=r'''**The idea.** A lock is a tiny state machine: who holds it (readers, a writer or nobody) and who waits. Real threads add blocking and wake-ups on top of this machine; the *design* question (who is allowed in, in what order) can be answered and tested without any thread.

```mermaid
flowchart TD
    A[request] --> B{queue empty and compatible?}
    B -- yes --> C[granted]
    B -- no --> D[queued]
    E[release or cancel] --> F{head of queue}
    F -- writer --> G[grant only if lock is empty, then stop]
    F -- reader --> H[grant it and the readers after it, until a writer]
```

**Fairness is a choice.** If new readers could join whenever the current holders are readers, a steady stream of readers would keep a writer waiting for ever (*starvation*). Making every request wait behind the queue costs some read throughput and buys a bound on how long anyone waits.

**Batching readers.** After a writer finishes, all the readers at the head of the queue can run together. That is the point of a read-write lock; stopping at the first writer keeps the order fair.

**Return what changed.** `release` returns who was granted so that the caller (a scheduler, a thread pool) knows whom to wake. A lock that only returned `None` would force the caller to poll.

**Complexity.** Each call is O(queue) at worst.

**Going further.** Add *upgrade* (a reader asks to become the writer). Why is this the classic source of deadlocks, and what would you refuse?''',
),
P(
    slug='lld-fair-semaphore', title='Fair Semaphore', topic='lld-concurrency-design', difficulty='intermediate',
    module='lld/10-concurrency-safe-design/README.md',
    description='Model a counting semaphore with a first-come-first-served wait queue, hand-off on release, try-acquire and cancellation.',
    statement=r'''Write a class `Semaphore` that limits how many tasks may use something at once (database connections, parallel downloads). It is a plain state machine: calls return what happened and never block.

**Creating one:** `Semaphore(permits)`; `permits` must be an `int` of 1 or more (not a `bool`), else `ValueError("Permits must be positive")`.

**Methods**

- `acquire(task)` returns `"granted"` when a permit is free **and nobody is waiting**, otherwise `"queued"` (the task waits its turn). A task that already holds a permit or is waiting is `ValueError("Already holding or waiting: <task>")`.
- `try_acquire(task)` returns `True` and takes a permit when one is free and nobody is waiting, otherwise `False` and it **does not** queue the task. The same "already holding or waiting" error applies.
- `release(task)` gives a task's permit back. If tasks are waiting, the permit **passes straight to the first one** (it never becomes free) and `release` returns that task's name; otherwise it returns `None`. A task that does not hold a permit (waiting tasks do not) is `ValueError("Not holding: <task>")`.
- `cancel(task)` removes a waiting task from the queue; a task that is not waiting is `ValueError("Not waiting: <task>")`.
- `available` is the number of free permits; `holders` is a **new list** of the tasks holding permits, in the order they got them; `waiting` is a **new list** of the waiting tasks, oldest first.''',
    starter=r'''class Semaphore:
    def __init__(self, permits):
        ...

    def acquire(self, task):
        """Return "granted" or "queued"."""
        ...

    def try_acquire(self, task):
        ...

    def release(self, task):
        """Return the waiting task that got the permit, or None."""
        ...

    def cancel(self, task):
        ...

    @property
    def available(self):
        ...

    @property
    def holders(self):
        ...

    @property
    def waiting(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
for bad in (0, -1, 1.5, True, None):
    assert error_of(Semaphore, bad) == "ValueError: Permits must be positive"
sem = Semaphore(2)
assert sem.available == 2 and sem.holders == [] and sem.waiting == []
assert sem.acquire("a") == "granted" and sem.available == 1 and sem.acquire("b") == "granted" and sem.available == 0
assert sem.holders == ["a", "b"]
assert sem.acquire("c") == "queued" and sem.acquire("d") == "queued" and sem.waiting == ["c", "d"] and sem.available == 0
for task in ("a", "c"):
    assert error_of(sem.acquire, task) == "ValueError: Already holding or waiting: " + task and error_of(sem.try_acquire, task) == "ValueError: Already holding or waiting: " + task
assert sem.try_acquire("e") is False and sem.waiting == ["c", "d"] and sem.holders == ["a", "b"]
assert error_of(sem.release, "zed") == "ValueError: Not holding: zed" and error_of(sem.release, "d") == "ValueError: Not holding: d"
assert sem.release("a") == "c" and sem.holders == ["b", "c"] and sem.waiting == ["d"] and sem.available == 0
assert error_of(sem.cancel, "b") == "ValueError: Not waiting: b" and error_of(sem.cancel, "zed") == "ValueError: Not waiting: zed"
assert sem.cancel("d") is None and sem.waiting == [] and sem.available == 0
assert error_of(sem.release, "d") == "ValueError: Not holding: d"
assert sem.release("b") is None and sem.available == 1 and sem.holders == ["c"]
assert sem.try_acquire("e") is True and sem.holders == ["c", "e"] and sem.available == 0
assert sem.release("c") is None and sem.release("e") is None and sem.available == 2 and sem.holders == []
copy_holders = sem.holders
copy_holders.append("junk")
assert sem.holders == []
one = Semaphore(1)
assert one.acquire("a") == "granted" and one.acquire("b") == "queued" and one.acquire("c") == "queued"
assert one.try_acquire("d") is False
assert one.cancel("b") is None and one.waiting == ["c"]
assert one.release("a") == "c" and one.holders == ["c"] and one.available == 0 and one.waiting == []
assert one.release("c") is None and one.try_acquire("c") is True
fair = Semaphore(1)
fair.acquire("a")
fair.acquire("b")
assert fair.release("a") == "b" and fair.try_acquire("c") is False and fair.acquire("c") == "queued" and fair.waiting == ["c"]
assert fair.release("b") == "c" and fair.holders == ["c"]
snapshot = fair.waiting
snapshot.append("junk")
assert fair.waiting == []
three = Semaphore(3)
for name in ("p", "q", "r"):
    assert three.acquire(name) == "granted"
for name in ("s", "t", "u"):
    assert three.acquire(name) == "queued"
assert [three.release(name) for name in ("p", "q", "r")] == ["s", "t", "u"] and three.holders == ["s", "t", "u"] and three.available == 0''',
    solution=r'''class Semaphore:
    def __init__(self, permits):
        if type(permits) is not int or permits < 1:
            raise ValueError("Permits must be positive")
        self._permits = permits
        self._holders = []
        self._waiting = []

    def _check_new(self, task):
        if task in self._holders or task in self._waiting:
            raise ValueError("Already holding or waiting: " + str(task))

    @property
    def available(self):
        return self._permits - len(self._holders)

    @property
    def holders(self):
        return list(self._holders)

    @property
    def waiting(self):
        return list(self._waiting)

    def acquire(self, task):
        self._check_new(task)
        if self.available > 0 and not self._waiting:
            self._holders.append(task)
            return "granted"
        self._waiting.append(task)
        return "queued"

    def try_acquire(self, task):
        self._check_new(task)
        if self.available > 0 and not self._waiting:
            self._holders.append(task)
            return True
        return False

    def release(self, task):
        if task not in self._holders:
            raise ValueError("Not holding: " + str(task))
        self._holders.remove(task)
        if self._waiting:
            successor = self._waiting.pop(0)
            self._holders.append(successor)
            return successor
        return None

    def cancel(self, task):
        if task not in self._waiting:
            raise ValueError("Not waiting: " + str(task))
        self._waiting.remove(task)''',
    hints=[
        r'''The free count is *derived*: permits minus the number of holders. Do not keep a separate counter that has to be incremented and decremented in step.''',
        r'''Fairness is one condition, used in both `acquire` and `try_acquire`: a permit is granted only if `available > 0` **and the wait queue is empty**. On `release`, a waiting task takes the permit directly, so the permit is never "free" for a late arrival to snatch.''',
        r'''A waiting task holds nothing, so `release` refuses it; a holding task is not waiting, so `cancel` refuses it. `try_acquire` must never queue the task, but it must still refuse a task that is already holding or waiting.''',
    ],
    explanation=r'''**The idea.** A semaphore is a counter with a wait queue. What makes the design interesting is *who gets a freed permit*. The fair answer is "the longest waiter", handed over **at the moment of release**.

**Hand-off, not "free and race".** If `release` made the permit free and woke the first waiter, a task calling `acquire` in between could win it (*barging*). Passing the permit directly to the first waiter closes that window, and it is why `available` stays 0 while there are waiters.

**`try_acquire` respects the queue.** A non-blocking attempt that cut in front of waiters would be unfair in the same way. It returns `False` instead, and does not queue.

**Derived state.** `available` is `permits - len(holders)`. There is no second variable that could drift, so a double release or a lost task cannot make the count lie.

**Complexity.** Operations are O(holders + waiting) here because of list membership; a dict or a deque makes them O(1).

**Going further.** A *weighted* semaphore lets a task take several permits at once. What happens to fairness when the first waiter needs 3 and only 1 is free?''',
),
P(
    slug='lld-deadlock-detecting-locks', title='Deadlock-Detecting Lock Manager', topic='lld-concurrency-design', difficulty='advanced',
    module='lld/10-concurrency-safe-design/README.md',
    description='Build a lock manager with FIFO waiters that refuses a request when it would close a cycle in the wait-for graph.',
    statement=r'''Write a class `LockManager` for transactions that take **exclusive** locks on named resources. It never blocks: a request is either granted, put in a queue, or **refused because waiting would deadlock**.

**Methods**

- `acquire(txn, resource)` returns `"granted"` or `"waiting"`.
  - A transaction that is already **waiting** may not ask for more: `ValueError("Already waiting: <txn>")` (checked first).
  - If the resource is free, or the transaction already holds it, the result is `"granted"` (asking for a lock you hold is harmless).
  - Otherwise the transaction would wait for the **holder**. Build the chain `txn -> holder -> (whoever holds the resource that holder is waiting for) -> ...`. If the chain comes **back to `txn`**, waiting would be a deadlock: raise `ValueError("Deadlock: " + " -> ".join(chain))` where `chain` starts at `txn` and ends at `txn` (for example `"Deadlock: t3 -> t1 -> t2 -> t3"`), and **change nothing** (the request is not queued).
  - Otherwise the transaction joins that resource's queue and `acquire` returns `"waiting"`.
- `release_all(txn)` ends a transaction: it leaves any queue it is waiting in, then releases every lock it holds **in the order it acquired them**. A freed resource goes to the **first transaction in its queue**. Returns the list of `(txn, resource)` granted, in that order. An unknown transaction is fine and returns `[]`.
- `holder(resource)` is the holding transaction or `None`; `waiting_for(txn)` is the resource it waits for or `None`; `held_by(txn)` is the **sorted** list of resources it holds.''',
    starter=r'''class LockManager:
    def __init__(self):
        ...

    def acquire(self, txn, resource):
        """Return "granted" or "waiting"; raise ValueError on a deadlock."""
        ...

    def release_all(self, txn):
        """Return the [(txn, resource), ...] granted."""
        ...

    def holder(self, resource):
        ...

    def waiting_for(self, txn):
        ...

    def held_by(self, txn):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
lm = LockManager()
assert lm.holder("a") is None and lm.waiting_for("t1") is None and lm.held_by("t1") == [] and lm.release_all("nobody") == []
assert lm.acquire("t1", "a") == "granted" and lm.holder("a") == "t1" and lm.acquire("t1", "a") == "granted" and lm.held_by("t1") == ["a"]
assert lm.acquire("t2", "b") == "granted" and lm.acquire("t2", "a") == "waiting" and lm.waiting_for("t2") == "a"
assert error_of(lm.acquire, "t2", "c") == "ValueError: Already waiting: t2" and error_of(lm.acquire, "t2", "a") == "ValueError: Already waiting: t2"
assert error_of(lm.acquire, "t1", "b") == "ValueError: Deadlock: t1 -> t2 -> t1"
assert lm.waiting_for("t1") is None and lm.holder("a") == "t1" and lm.holder("b") == "t2"
assert lm.acquire("t1", "c") == "granted" and lm.held_by("t1") == ["a", "c"]
assert lm.release_all("t1") == [("t2", "a")] and lm.holder("a") == "t2" and lm.waiting_for("t2") is None and lm.held_by("t2") == ["a", "b"] and lm.holder("c") is None
ring = LockManager()
for txn, resource in (("t1", "a"), ("t2", "b"), ("t3", "c")):
    assert ring.acquire(txn, resource) == "granted"
assert ring.acquire("t1", "b") == "waiting" and ring.acquire("t2", "c") == "waiting"
assert error_of(ring.acquire, "t3", "a") == "ValueError: Deadlock: t3 -> t1 -> t2 -> t3"
assert ring.waiting_for("t3") is None and ring.holder("a") == "t1"
assert error_of(ring.acquire, "t3", "b") == "ValueError: Deadlock: t3 -> t2 -> t3" and error_of(ring.acquire, "t3", "c") is None
assert ring.release_all("t3") == [("t2", "c")] and ring.waiting_for("t2") is None
assert ring.release_all("t2") == [("t1", "b")] and ring.held_by("t1") == ["a", "b"]
chain = LockManager()
chain.acquire("t1", "a")
chain.acquire("t2", "b")
chain.acquire("t3", "c")
assert chain.acquire("t1", "b") == "waiting"
assert chain.acquire("t2", "c") == "waiting"
assert chain.acquire("t4", "a") == "waiting" and chain.acquire("t5", "a") == "waiting"
assert chain.release_all("t1") == [("t4", "a")] and chain.holder("a") == "t4"
assert chain.waiting_for("t1") is None
assert chain.acquire("t3", "a") == "waiting" and chain.waiting_for("t3") == "a"
assert error_of(chain.acquire, "t4", "c") == "ValueError: Deadlock: t4 -> t3 -> t4" and chain.waiting_for("t4") is None
fifo = LockManager()
fifo.acquire("t1", "x")
for txn in ("t2", "t3", "t4"):
    assert fifo.acquire(txn, "x") == "waiting"
assert fifo.release_all("t1") == [("t2", "x")] and fifo.release_all("t3") == [] and fifo.waiting_for("t3") is None
assert fifo.release_all("t2") == [("t4", "x")] and fifo.holder("x") == "t4"
assert fifo.release_all("t4") == [] and fifo.holder("x") is None
multi = LockManager()
multi.acquire("t1", "b")
multi.acquire("t1", "a")
multi.acquire("t2", "a")
multi.acquire("t3", "b")
assert multi.held_by("t1") == ["a", "b"]
assert multi.release_all("t1") == [("t3", "b"), ("t2", "a")]
assert multi.holder("a") == "t2" and multi.holder("b") == "t3" and multi.release_all("t1") == []
other = LockManager()
other.acquire("t1", "x")
other.acquire("t2", "y")
assert other.acquire("t3", "x") == "waiting" and other.acquire("t4", "y") == "waiting"
assert other.acquire("t1", "y") == "waiting"
assert error_of(other.acquire, "t2", "x") == "ValueError: Deadlock: t2 -> t1 -> t2"
assert other.release_all("t2") == [("t4", "y")] and other.waiting_for("t1") == "y"
self_cycle = LockManager()
self_cycle.acquire("t1", "a")
assert self_cycle.acquire("t1", "a") == "granted" and self_cycle.waiting_for("t1") is None''',
    solution=r'''class LockManager:
    def __init__(self):
        self._holder = {}
        self._queues = {}
        self._waiting = {}
        self._held = {}

    def holder(self, resource):
        return self._holder.get(resource)

    def waiting_for(self, txn):
        return self._waiting.get(txn)

    def held_by(self, txn):
        return sorted(self._held.get(txn, []))

    def _grant(self, txn, resource):
        self._holder[resource] = txn
        self._held.setdefault(txn, []).append(resource)

    def acquire(self, txn, resource):
        if txn in self._waiting:
            raise ValueError("Already waiting: " + str(txn))
        owner = self._holder.get(resource)
        if owner is None:
            self._grant(txn, resource)
            return "granted"
        if owner == txn:
            return "granted"
        chain = [txn]
        current = owner
        while current is not None:
            chain.append(current)
            if current == txn:
                raise ValueError("Deadlock: " + " -> ".join(str(item) for item in chain))
            wanted = self._waiting.get(current)
            current = self._holder.get(wanted) if wanted is not None else None
        self._queues.setdefault(resource, []).append(txn)
        self._waiting[txn] = resource
        return "waiting"

    def release_all(self, txn):
        granted = []
        wanted = self._waiting.pop(txn, None)
        if wanted is not None:
            self._queues[wanted].remove(txn)
        for resource in self._held.pop(txn, []):
            del self._holder[resource]
            queue = self._queues.get(resource)
            if queue:
                successor = queue.pop(0)
                del self._waiting[successor]
                self._grant(successor, resource)
                granted.append((successor, resource))
        return granted''',
    hints=[
        r'''Keep four small maps: resource to holder, resource to its queue of waiters, transaction to the one resource it waits for, and transaction to the resources it holds (in acquisition order). A transaction waits for at most one thing, so "who am I waiting for" is a plain lookup.''',
        r'''Deadlock detection is following a chain: start at the holder of the resource you want; if that holder is itself waiting, jump to the holder of *that* resource; and so on. If you meet yourself, you have found a cycle. Build the chain as a list so the error message can print it.''',
        r'''Check for the deadlock **before** queueing, and raise without changing anything. In `release_all`, take the transaction out of the queue it waits in first (it is aborting), then release held resources in acquisition order and hand each to the head of its queue.''',
    ],
    explanation=r'''**The idea.** A *wait-for graph* has an edge from every waiting transaction to the transaction that holds what it wants. A deadlock is a cycle in that graph. Because every transaction waits for at most one resource, each node has at most one outgoing edge, so "is there a cycle through me?" is just walking a chain.

```mermaid
flowchart LR
    t3 -- wants a --> t1
    t1 -- wants b --> t2
    t2 -- wants c --> t3
```

**Prevent, do not repair.** Detecting the cycle at the moment the last edge would be added means the graph is *always* acyclic: no transaction ever waits for ever, and nothing has to be rolled back later. The refused transaction gets an error and decides what to do (usually abort and retry).

**Why the order of release matters.** A transaction that held `b` then `a` gives them back in that order, and each goes to its first waiter. The tests check the order so that two correct-looking implementations cannot disagree silently.

**Aborting a waiter.** `release_all` also removes a waiting transaction from its queue. Forgetting that leaves a "ghost" at the head of the queue that is handed a lock and never gives it back.

**Complexity.** `acquire` walks at most one chain, O(transactions). `release_all` is O(locks held).

**Going further.** This manager has only exclusive locks. Allow shared locks: what changes about "the holder", and can a chain now branch?''',
),
P(
    slug='lld-optimistic-versioning', title='Optimistic Versioning', topic='lld-concurrency-design', difficulty='intermediate',
    module='lld/10-concurrency-safe-design/README.md',
    description='Use version numbers and compare-and-set to avoid lost updates, with a retrying update helper and a hook that simulates a rival writer.',
    statement=r'''Write a class `VersionedStore`, a key-value store that stops two writers from overwriting each other without any locks: *optimistic concurrency control*. Every key has a **version**: `0` when it does not exist, then `1, 2, 3, ...` with each successful write.

**Methods**

- `get(key)` returns `(value, version)`; a missing key is `(None, 0)`. `version(key)` is the version alone, and `keys()` the sorted list of keys that exist.
- `put(key, value, expected_version)` writes the value **only if** the key's current version equals `expected_version`, and returns the new version. `expected_version` must be an `int` of 0 or more (not a `bool`), else `ValueError("Bad version")` (checked first). A mismatch is `ValueError("Version conflict: expected <expected> but found <current>")` and nothing changes.
- `update(key, fn, retries=3, before_write=None)` is *read, compute, compare-and-set*, repeated until it works:
  1. read `(value, version)`; compute `new = fn(value)` (`fn` gets `None` for a missing key; if `fn` raises, the error propagates and nothing is written);
  2. if `before_write` is given, call `before_write(attempt)` with the attempt number (1, 2, ...): this is where a test makes a **rival writer** change the key between your read and your write;
  3. if the key's version is **still** the one you read, write `new` with that version and **return `new`**; otherwise start again from step 1 (so `fn` sees the rival's value).

  At most `retries + 1` attempts are made; after the last conflict raise `ValueError("Too many conflicts for <key>")`. `retries` must be an `int` of 0 or more (not a `bool`), else `ValueError("Retries must be 0 or more")` (checked before anything runs).''',
    starter=r'''class VersionedStore:
    def __init__(self):
        ...

    def get(self, key):
        """(value, version); a missing key is (None, 0)."""
        ...

    def version(self, key):
        ...

    def keys(self):
        ...

    def put(self, key, value, expected_version):
        """Write only if the version matches; return the new version."""
        ...

    def update(self, key, fn, retries=3, before_write=None):
        ...''',
    tests=r'''def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
store = VersionedStore()
assert store.get("k") == (None, 0) and store.version("k") == 0 and store.keys() == []
assert store.put("k", "a", 0) == 1 and store.get("k") == ("a", 1) and store.version("k") == 1 and store.keys() == ["k"]
assert error_of(store.put, "k", "b", 0) == "ValueError: Version conflict: expected 0 but found 1" and store.get("k") == ("a", 1)
assert error_of(store.put, "k", "b", 5) == "ValueError: Version conflict: expected 5 but found 1"
assert error_of(store.put, "new", "b", 1) == "ValueError: Version conflict: expected 1 but found 0" and store.keys() == ["k"]
assert store.put("k", "b", 1) == 2 and store.get("k") == ("b", 2)
for bad in (-1, 1.5, True, None, "1"):
    assert error_of(store.put, "k", "x", bad) == "ValueError: Bad version"
assert store.put("z", None, 0) == 1 and store.get("z") == (None, 1) and store.keys() == ["k", "z"]
store.put("n", 10, 0)
seen = []
def double(value):
    seen.append(value)
    return value * 2
assert store.update("n", lambda v: v + 1) == 11 and store.get("n") == (11, 2)
assert store.update("fresh", lambda v: (v or 0) + 1) == 1 and store.get("fresh") == (1, 1)
attempts = []
def rival(attempt):
    attempts.append(attempt)
    if attempt <= 2:
        store.put("n", store.get("n")[0] + 100, store.version("n"))
assert store.update("n", double, before_write=rival) == 422
assert seen == [11, 111, 211] and attempts == [1, 2, 3] and store.get("n") == (422, 5)
def always(attempt):
    store.put("n", store.get("n")[0] + 1, store.version("n"))
before = store.get("n")
assert error_of(store.update, "n", lambda v: -1, retries=1, before_write=always) == "ValueError: Too many conflicts for n"
assert store.get("n") == (before[0] + 2, before[1] + 2)
assert error_of(store.update, "n", lambda v: -1, retries=0, before_write=always) == "ValueError: Too many conflicts for n"
assert store.get("n")[1] == before[1] + 3
calls = []
def count(attempt):
    calls.append(attempt)
    always(attempt)
assert error_of(store.update, "n", lambda v: v, before_write=count) == "ValueError: Too many conflicts for n" and calls == [1, 2, 3, 4]
assert error_of(store.update, "n", lambda v: v, retries=2, before_write=count) == "ValueError: Too many conflicts for n" and calls == [1, 2, 3, 4, 1, 2, 3]
for bad in (-1, 1.5, True, None):
    assert error_of(store.update, "n", lambda v: v, retries=bad) == "ValueError: Retries must be 0 or more"
def boom(value):
    raise RuntimeError("boom")
hooked = []
snapshot = store.get("n")
assert error_of(store.update, "n", boom, before_write=hooked.append) == "RuntimeError: boom" and hooked == [] and store.get("n") == snapshot
assert store.update("n", lambda v: "done", retries=0) == "done" and store.get("n") == ("done", snapshot[1] + 1)
ran = []
def once(attempt):
    ran.append(attempt)
    if attempt == 1:
        store.put("q", "rival", 0)
assert store.update("q", lambda v: (v or "none") + "!", before_write=once) == "rival!" and store.get("q") == ("rival!", 2) and ran == [1, 2]
other = VersionedStore()
other.put("b", 2, 0)
other.put("a", 1, 0)
assert other.update("a", lambda v: v + 10) == 11 and other.get("b") == (2, 1) and other.keys() == ["a", "b"]
tally = VersionedStore()
tally.put("count", 0, 0)
for step in range(50):
    tally.update("count", lambda v: v + 1)
assert tally.get("count") == (50, 51)''',
    solution=r'''class VersionedStore:
    def __init__(self):
        self._data = {}

    def get(self, key):
        return self._data.get(key, (None, 0))

    def version(self, key):
        return self.get(key)[1]

    def keys(self):
        return sorted(self._data)

    def put(self, key, value, expected_version):
        if type(expected_version) is not int or expected_version < 0:
            raise ValueError("Bad version")
        current = self.version(key)
        if expected_version != current:
            raise ValueError(f"Version conflict: expected {expected_version} but found {current}")
        self._data[key] = (value, current + 1)
        return current + 1

    def update(self, key, fn, retries=3, before_write=None):
        if type(retries) is not int or retries < 0:
            raise ValueError("Retries must be 0 or more")
        for attempt in range(1, retries + 2):
            value, version = self.get(key)
            new = fn(value)
            if before_write is not None:
                before_write(attempt)
            if self.version(key) == version:
                self.put(key, new, version)
                return new
        raise ValueError("Too many conflicts for " + str(key))''',
    hints=[
        r'''Store `(value, version)` per key, and treat a missing key as `(None, 0)`. Then "create" and "update" are the same operation: write with the version you read.''',
        r'''`put` is the whole safety mechanism: compare the version you *read* with the version that is there *now*, and write only if they are equal. Raise the conflict error with both numbers and change nothing otherwise.''',
        r'''In `update`, the loop must **read again** on every attempt (so `fn` sees the rival's value), call the hook between the read and the write, and make at most `retries + 1` attempts. Validate `retries` before the loop starts.''',
    ],
    explanation=r'''**The idea.** Two clients read the same account balance, each adds 10 and writes back: one update is lost. A lock would prevent it by making them take turns. **Optimistic** concurrency lets both proceed and checks at write time: "is this still the version I read?". If not, the write is refused and the client reads again.

```mermaid
sequenceDiagram
    participant A as Client A
    participant S as Store
    participant B as Client B
    A->>S: get n (value 11, version 2)
    B->>S: get n (value 11, version 2)
    B->>S: put n=21, expected 2
    S-->>B: version 3
    A->>S: put n=21, expected 2
    S-->>A: conflict: found 3
    A->>S: get n (value 21, version 3), retry
```

**The hook makes the race testable.** Real races depend on timing. `before_write(attempt)` runs exactly between the read and the write, so a test can play the rival deterministically: the second attempt sees the rival's value (the test lists `[11, 111, 211]`).

**When retrying is wrong.** Retrying is safe because `fn` is a pure function of the value. Side effects in `fn` (sending an email) would run once per attempt. That is why the contract says what `fn` may do.

**Bounded retries.** Under heavy contention an optimistic client can starve. A limit turns "spin for ever" into an error the caller can handle (back off, or switch to a lock).

**Complexity.** `put` is O(1); `update` is O(attempts).

**Going further.** HTTP's `ETag` and `If-Match` headers are exactly this protocol. What status code means "your version is stale"?''',
),
P(
    slug='lld-cooperative-event-loop', title='Cooperative Event Loop', topic='lld-concurrency-design', difficulty='advanced',
    module='lld/10-concurrency-safe-design/README.md',
    description='Build a deterministic single-threaded scheduler for generator tasks with virtual-time sleeps, event waits, signals and error isolation.',
    statement=r'''Write a class `EventLoop` that runs many **tasks** in one thread by letting each task give up control when it must wait: the idea behind `asyncio`, in a few lines and with **virtual time** (no real sleeping). A task is a Python **generator**; every `yield` hands a **command** to the loop.

**Commands a task may yield**

- `("sleep", seconds)`: wake up after `seconds` of virtual time (`seconds` is a number of 0 or more; a `bool` is not one).
- `("wait", event)`: sleep until another task (or the caller) calls `signal(event)`.
- `("yield",)` or `None`: let the other ready tasks run first, then continue.

Anything else yielded is a bad command: the task is **stopped**, and its error is `"Bad command from <name>"`.

**Methods and properties**

- `spawn(name, generator)` adds a task, ready to run. A name that was ever used is `ValueError("Task already exists: <name>")`. A task may spawn another while running.
- `signal(event)` wakes **all** tasks currently waiting for that event, in the order they began waiting, and returns how many. A signal nobody is waiting for is lost (returns 0).
- `run()` runs until no task is ready and none is sleeping (tasks still waiting for an event stay blocked), and returns `now`. **Order is deterministic:** ready tasks run first come first served, one step (up to its next `yield`) at a time; when nothing is ready, time jumps to the earliest sleeper; sleepers with the same wake time wake in the order they went to sleep (a `("sleep", 0)` task resumes after the other ready tasks).
- `now` is the virtual time, starting at 0.
- When a generator **returns**, its value is stored in `results[name]`. If it **raises**, `errors[name]` is `str(error)` and the other tasks carry on. `results` and `errors` are **new dicts** each time; `pending` is the sorted list of names of tasks that have not finished.''',
    starter=r'''class EventLoop:
    def __init__(self):
        ...

    def spawn(self, name, generator):
        ...

    def signal(self, event):
        """Wake the tasks waiting for `event`; return how many."""
        ...

    def run(self):
        """Run until nothing can proceed; return the virtual time."""
        ...

    @property
    def now(self):
        ...

    @property
    def results(self):
        ...

    @property
    def errors(self):
        ...

    @property
    def pending(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
loop = EventLoop()
log = []
def worker(name, delay):
    log.append(name + " start")
    yield ("sleep", delay)
    log.append(name + " done")
    return name.upper()
assert loop.now == 0 and loop.run() == 0 and loop.results == {} and loop.errors == {} and loop.pending == []
loop.spawn("a", worker("a", 5))
loop.spawn("b", worker("b", 2))
assert error_of(loop.spawn, "a", worker("x", 1)) == "ValueError: Task already exists: a"
assert loop.pending == ["a", "b"] and log == []
assert loop.run() == 5 and loop.now == 5
assert log == ["a start", "b start", "b done", "a done"]
assert loop.results == {"a": "A", "b": "B"} and loop.errors == {} and loop.pending == []
assert error_of(loop.spawn, "a", worker("x", 1)) == "ValueError: Task already exists: a"
res = loop.results
res["junk"] = 1
assert loop.results == {"a": "A", "b": "B"}
loop2 = EventLoop()
log2 = []
def waiter(name):
    log2.append(name + " waiting")
    yield ("wait", "go")
    log2.append(name + " go")
def trigger():
    yield ("sleep", 3)
    log2.append("trigger")
    woke = loop2.signal("go")
    log2.append("woke " + str(woke))
loop2.spawn("w1", waiter("w1"))
loop2.spawn("w2", waiter("w2"))
loop2.spawn("t", trigger())
assert loop2.signal("go") == 0
assert loop2.run() == 3
assert log2 == ["w1 waiting", "w2 waiting", "trigger", "woke 2", "w1 go", "w2 go"] and loop2.pending == []
loop3 = EventLoop()
log3 = []
def blocked():
    yield ("wait", "later")
    log3.append("unblocked")
    return "ok"
loop3.spawn("y", blocked())
loop3.spawn("x", blocked())
assert loop3.run() == 0 and loop3.pending == ["x", "y"] and log3 == []
assert loop3.signal("other") == 0 and loop3.signal("later") == 2 and loop3.run() == 0
assert log3 == ["unblocked", "unblocked"] and loop3.results == {"x": "ok", "y": "ok"} and loop3.pending == []
loop4 = EventLoop()
log4 = []
def ping(name, other):
    log4.append(name + "1")
    yield ("yield",)
    log4.append(name + "2")
    yield None
    log4.append(name + "3")
loop4.spawn("a", ping("a", "b"))
loop4.spawn("b", ping("b", "a"))
loop4.run()
assert log4 == ["a1", "b1", "a2", "b2", "a3", "b3"]
loop5 = EventLoop()
log5 = []
def napper(name, zero):
    log5.append(name + " before")
    yield ("sleep", 0)
    log5.append(name + " after")
loop5.spawn("n", napper("n", 0))
loop5.spawn("q", napper("q", 0))
assert loop5.run() == 0 and log5 == ["n before", "q before", "n after", "q after"]
loop6 = EventLoop()
log6 = []
def sleeper(name, delay):
    yield ("sleep", delay)
    log6.append(name)
loop6.spawn("late", sleeper("late", 2))
loop6.spawn("y", sleeper("y", 1))
loop6.spawn("x", sleeper("x", 1))
loop6.spawn("z", sleeper("z", 1.5))
assert loop6.run() == 2 and log6 == ["y", "x", "z", "late"]
loop7 = EventLoop()
log7 = []
def failing():
    log7.append("f1")
    yield ("yield",)
    raise RuntimeError("boom")
def fine():
    log7.append("g1")
    yield ("sleep", 1)
    log7.append("g2")
    return 42
def bad(command):
    yield command
loop7.spawn("f", failing())
loop7.spawn("g", fine())
for index, command in enumerate(("oops", ("sleep",), ("sleep", -1), ("sleep", True), ("wait",), ("dance", 1), 5, ("sleep", "1"))):
    loop7.spawn("bad" + str(index), bad(command))
assert loop7.run() == 1
assert log7 == ["f1", "g1", "g2"] and loop7.results == {"g": 42} and loop7.pending == []
assert loop7.errors == {"f": "boom", "bad0": "Bad command from bad0", "bad1": "Bad command from bad1", "bad2": "Bad command from bad2", "bad3": "Bad command from bad3", "bad4": "Bad command from bad4", "bad5": "Bad command from bad5", "bad6": "Bad command from bad6", "bad7": "Bad command from bad7"}
errs = loop7.errors
errs.clear()
assert len(loop7.errors) == 9
loop8 = EventLoop()
log8 = []
def child():
    log8.append("child")
    yield ("sleep", 1)
    log8.append("child done")
def parent():
    log8.append("parent")
    loop8.spawn("child", child())
    yield ("yield",)
    log8.append("parent done")
loop8.spawn("parent", parent())
assert loop8.run() == 1 and log8 == ["parent", "child", "parent done", "child done"]
loop9 = EventLoop()
log9 = []
def consumer(name):
    for round_number in range(2):
        yield ("wait", "item")
        log9.append(name + " got " + str(round_number))
def producer():
    for round_number in range(2):
        yield ("sleep", 10)
        loop9.signal("item")
loop9.spawn("c1", consumer("c1"))
loop9.spawn("c2", consumer("c2"))
loop9.spawn("p", producer())
assert loop9.run() == 20 and log9 == ["c1 got 0", "c2 got 0", "c1 got 1", "c2 got 1"]
loop10 = EventLoop()
def two_phase():
    yield ("sleep", 5)
    yield ("sleep", 5)
    return "end"
loop10.spawn("t", two_phase())
assert loop10.run() == 10 and loop10.results == {"t": "end"}
loop10.spawn("u", two_phase())
assert loop10.run() == 20 and loop10.now == 20
empty = EventLoop()
def instant():
    return "instant"
    yield
empty.spawn("i", instant())
assert empty.run() == 0 and empty.results == {"i": "instant"}''',
    solution=r'''import heapq
from collections import deque


class EventLoop:
    def __init__(self):
        self._now = 0
        self._ready = deque()
        self._sleeping = []
        self._waiting = {}
        self._tasks = {}
        self._results = {}
        self._errors = {}
        self._sequence = 0

    @property
    def now(self):
        return self._now

    @property
    def results(self):
        return dict(self._results)

    @property
    def errors(self):
        return dict(self._errors)

    @property
    def pending(self):
        return sorted(self._tasks)

    def spawn(self, name, generator):
        if name in self._tasks or name in self._results or name in self._errors:
            raise ValueError("Task already exists: " + str(name))
        self._tasks[name] = generator
        self._ready.append(name)

    def signal(self, event):
        woken = self._waiting.pop(event, [])
        self._ready.extend(woken)
        return len(woken)

    def _step(self, name):
        generator = self._tasks[name]
        try:
            command = next(generator)
        except StopIteration as stop:
            self._results[name] = stop.value
            del self._tasks[name]
            return
        except Exception as error:
            self._errors[name] = str(error)
            del self._tasks[name]
            return
        if command is None or command == ("yield",):
            self._ready.append(name)
        elif isinstance(command, tuple) and len(command) == 2 and command[0] == "sleep" and type(command[1]) in (int, float) and command[1] >= 0:
            self._sequence += 1
            heapq.heappush(self._sleeping, (self._now + command[1], self._sequence, name))
        elif isinstance(command, tuple) and len(command) == 2 and command[0] == "wait":
            self._waiting.setdefault(command[1], []).append(name)
        else:
            del self._tasks[name]
            self._errors[name] = "Bad command from " + str(name)

    def run(self):
        while True:
            while self._ready:
                self._step(self._ready.popleft())
            if not self._sleeping:
                break
            wake = self._sleeping[0][0]
            self._now = max(self._now, wake)
            while self._sleeping and self._sleeping[0][0] <= self._now:
                self._ready.append(heapq.heappop(self._sleeping)[2])
        return self._now''',
    hints=[
        r'''The loop owns three collections: a FIFO queue of ready task names, a heap of sleepers keyed by `(wake time, sequence number)`, and a dict from event name to the list of tasks waiting for it. A task is in exactly one of them (or finished).''',
        r'''`run` is two nested loops: while there is a ready task, advance it one step with `next(generator)` and look at the command it yielded; when nothing is ready, jump the clock to the earliest sleeper and make every sleeper due at that time ready, in heap order.''',
        r'''Handle the three ways a step can end: `StopIteration` (store its `.value` as the result), any other exception (store its text and carry on), or a command. Anything that is not exactly one of the three commands, with a valid argument, is "Bad command from <name>".''',
    ],
    explanation=r'''**The idea.** Concurrency does not need threads. If every task *volunteers* to pause at a `yield`, one thread can interleave thousands of them, and the interleaving is **deterministic**: the same program gives the same order every time. That is what makes this loop testable, and it is also why `asyncio` programs are easier to reason about than threaded ones.

```mermaid
flowchart TD
    R[ready queue] --> S[step the next task]
    S --> C{command}
    C -- yield --> R
    C -- sleep n --> H[heap of sleepers]
    C -- wait e --> W[waiters of e]
    C -- StopIteration --> D[result stored]
    H -- no task ready: jump the clock --> R
    W -- signal e --> R
```

**Virtual time.** Because `sleep` only moves a number, a test of "after 20 seconds" takes microseconds. The loop never calls `time.sleep`; it just advances `now`. This is how timers are tested in every serious framework.

**The sequence number.** Two tasks sleeping until the same instant must wake in a fixed order, otherwise a test would pass or fail depending on heap internals. The counter is the tie-breaker that makes "FIFO among equals" a rule rather than an accident.

**Errors are isolated.** One failing task is recorded and the others continue. Letting the exception escape `run()` would stop everything for one bug.

**Lost signals.** `signal` only wakes tasks that are *already* waiting. A signal sent before anyone waits is gone: that is why real systems use queues or latched events when "it already happened" must be remembered.

**Complexity.** Each step is O(log sleepers).

**Going further.** Add `("wait", event, timeout)`: wake when signalled *or* after the timeout, whichever comes first. Which structure now holds the same task twice, and how do you avoid waking it twice?''',
),
]
