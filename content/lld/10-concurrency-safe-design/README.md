# Module 10: Concurrency-Safe Design

## Why this matters

Every pattern so far has been reasoned about as if only one thread ever
touches your objects. Real systems rarely get that luxury — a web server
handles many requests concurrently, a UI has a background worker thread,
a cache is read and written from everywhere at once. A design that's
perfectly correct single-threaded can silently corrupt data, deadlock, or
construct two "singletons" the moment a second thread gets involved. This
module gives you the concrete vocabulary (race condition, critical
section, lock) and shows exactly where module 06's naive Singleton
breaks — plus the two techniques (immutability, and putting locks *inside*
the class that owns the state) that make most of this manageable rather
than terrifying.

## Concepts

### Race conditions and critical sections

A **race condition** happens when two threads access shared *mutable*
state concurrently, and the outcome depends on timing you don't control.
The classic example: `count += 1` looks like one operation but is
actually three (read `count`, add 1, write it back) — if two threads
interleave those three steps, an increment can be lost entirely.

{{tabs}}
{{tab Python}}
```python
import threading

counter = 0

def increment():
    global counter
    for _ in range(100_000):
        counter += 1        # read-modify-write — NOT atomic, even under the GIL

threads = [threading.Thread(target=increment) for _ in range(2)]
for t in threads: t.start()
for t in threads: t.join()

print(counter)   # expected 200000 — almost always LESS, due to lost updates
```

Python's Global Interpreter Lock (GIL) means only one thread executes
Python bytecode at a time, but that does **not** make `count += 1`
atomic — it's still multiple bytecode operations, and the interpreter can
switch threads *between* them. The GIL prevents certain classes of
low-level corruption, not this one. This is a genuinely common
misconception worth being explicit about.
{{tab C#}}
```csharp
int counter = 0;

void Increment() {
    for (int i = 0; i < 100_000; i++) {
        counter++;          // read-modify-write — NOT atomic
    }
}

var t1 = new Thread(Increment);
var t2 = new Thread(Increment);
t1.Start(); t2.Start();
t1.Join(); t2.Join();

Console.WriteLine(counter);   // expected 200000 — almost always LESS, due to lost updates
```

C# has no GIL-equivalent — threads genuinely run in parallel on
multi-core hardware, which makes this exact bug even easier to trigger,
but the *root cause* (an unsynchronized read-modify-write on shared
state) is identical in both languages.
{{/tabs}}

The fix: wrap the **critical section** (the code that touches shared
state) in a lock, so only one thread executes it at a time.

{{tabs}}
{{tab Python}}
```python
import threading

counter = 0
lock = threading.Lock()

def increment():
    global counter
    for _ in range(100_000):
        with lock:               # only ONE thread can be inside this block at a time
            counter += 1

threads = [threading.Thread(target=increment) for _ in range(2)]
for t in threads: t.start()
for t in threads: t.join()

print(counter)   # 200000 — correct, every time
```
{{tab C#}}
```csharp
int counter = 0;
object lockObj = new object();

void Increment() {
    for (int i = 0; i < 100_000; i++) {
        lock (lockObj) {          // only ONE thread can be inside this block at a time
            counter++;
        }
    }
}

var t1 = new Thread(Increment);
var t2 = new Thread(Increment);
t1.Start(); t2.Start();
t1.Join(); t2.Join();

Console.WriteLine(counter);   // 200000 — correct, every time
```
{{/tabs}}

### A properly thread-safe Singleton

Module 06 showed a *lazy* Singleton with a double-checked lock, and
promised the full reasoning would land here. First, see exactly what
breaks **without** it:

{{tabs}}
{{tab Python}}
```python
class AppConfig:
    _instance = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:      # BROKEN under concurrency:
            cls._instance = AppConfig()  # two threads can BOTH pass the check above
        return cls._instance             # before either finishes creating an instance —
                                          # resulting in two different "singleton" objects
```

The fix — guard creation with a lock, and check *again* inside the lock
(the "double check"), because another thread might have finished
creating the instance while this one was waiting for the lock:

```python
import threading

class AppConfig:
    _instance = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls):
        if cls._instance is None:               # fast path: skip locking if already created
            with cls._lock:
                if cls._instance is None:         # SECOND check — another thread may have juat built it
                    cls._instance = AppConfig()
        return cls._instance
```

In practice, Python's cleanest thread-safe singleton is usually simpler
than this: a plain **module** is only ever imported (and its top-level
code executed) once, guarded by Python's own internal import lock —
`config.py` containing `settings = {}` at module level, imported as
`from config import settings` everywhere, *is* a thread-safe singleton
with zero manual locking.
{{tab C#}}
```csharp
public class AppConfig {
    private static AppConfig _instance;

    public static AppConfig GetInstance() {
        if (_instance == null) {           // BROKEN under concurrency:
            _instance = new AppConfig();     // two threads can BOTH pass the check above
        }
        return _instance;                    // before either finishes creating an instance —
    }                                          // resulting in two different "singleton" objects
    private AppConfig() { }
}
```

The fix — guard creation with a lock, and check *again* inside the lock:

```csharp
public class AppConfig {
    private static AppConfig _instance;
    private static readonly object _lock = new object();

    public static AppConfig GetInstance() {
        if (_instance == null) {                // fast path: skip locking if already created
            lock (_lock) {
                if (_instance == null) {          // SECOND check — another thread may have just built it
                    _instance = new AppConfig();
                }
            }
        }
        return _instance;
    }
    private AppConfig() { }
}
```

In practice, real C# code should reach for **`Lazy<T>`** instead of
hand-rolling this — it's thread-safe by default, with none of the
double-check ceremony to get subtly wrong:

```csharp
public class AppConfig {
    private static readonly Lazy<AppConfig> _instance =
        new Lazy<AppConfig>(() => new AppConfig());   // thread-safe lazy init, built into the framework

    public static AppConfig Instance => _instance.Value;

    private AppConfig() { }
}
```
{{/tabs}}

**Why check twice?** The *first* check (before the lock) is a fast path —
after the singleton is created once, every future call skips locking
entirely, since locking has real overhead even when uncontested. The
*second* check (inside the lock) exists because between the first check
returning "not yet created" and this thread actually acquiring the lock,
some *other* thread might have gotten there first and already finished
construction — without the second check, you'd construct a second
instance anyway.

### Producer-consumer: decoupling work generation from work processing

**Problem it solves:** one or more threads *produce* work items, one or
more threads *consume* and process them, at potentially different
speeds — you need a hand-off point that's itself safe under concurrent
push/pop, without hand-rolling locks and wait-conditions yourself.

{{tabs}}
{{tab Python}}
```python
import threading
import queue
import time

work_queue = queue.Queue()      # already thread-safe — no manual locking needed

def producer():
    for i in range(5):
        print(f"Producing {i}")
        work_queue.put(i)
        time.sleep(0.1)
    work_queue.put(None)         # a sentinel value signaling "no more work"

def consumer():
    while True:
        item = work_queue.get()      # BLOCKS until something is available — no busy-waiting
        if item is None:
            break
        print(f"Consuming {item} -> {item ** 2}")

t1 = threading.Thread(target=producer)
t2 = threading.Thread(target=consumer)
t1.start(); t2.start()
t1.join(); t2.join()
```
{{tab C#}}
```csharp
using System.Collections.Concurrent;

var workQueue = new BlockingCollection<int>();    // already thread-safe — no manual locking needed

void Producer() {
    for (int i = 0; i < 5; i++) {
        Console.WriteLine($"Producing {i}");
        workQueue.Add(i);
        Thread.Sleep(100);
    }
    workQueue.CompleteAdding();     // signals "no more work" — no sentinel value needed
}

void Consumer() {
    foreach (var item in workQueue.GetConsumingEnumerable()) {   // BLOCKS until available, ends on CompleteAdding
        Console.WriteLine($"Consuming {item} -> {item * item}");
    }
}

var t1 = new Thread(Producer);
var t2 = new Thread(Consumer);
t1.Start(); t2.Start();
t1.Join(); t2.Join();
```
{{/tabs}}

**The single most important lesson here**: neither example hand-rolls
any locking at all. `queue.Queue`/`BlockingCollection<T>` are themselves
already thread-safe, battle-tested implementations of exactly this
hand-off — reinventing this with your own lock and condition-variable
logic is both unnecessary and a common source of subtle bugs (see Common
Mistakes).

### Immutability: the best lock is no lock

Module 03 introduced value objects (`@dataclass(frozen=True)`/`record`)
for value equality. Here's their other major payoff: **an object that
can never be mutated after construction cannot have a race condition**,
because there is no "mutate" operation for two threads to race on. This
is often cheaper and safer than any amount of careful locking.

{{tabs}}
{{tab Python}}
```python
# UNSAFE: a mutable Point shared and modified by two threads
class MutablePoint:
    def __init__(self, x, y):
        self.x = x
        self.y = y

# Two threads both calling point.x += 1 concurrently -> the exact same lost-update race as 'counter' above

# SAFE: an immutable value object — there's no mutation to race on
from dataclasses import dataclass

@dataclass(frozen=True)
class Point:
    x: int
    y: int

def move_right(point: Point) -> Point:
    return Point(point.x + 1, point.y)    # returns a NEW Point — never touches the old one

p1 = Point(0, 0)
p2 = move_right(p1)     # p1 is UNCHANGED — safe to hand p1 to as many threads as you like,
                          # none of them can ever see it in a half-updated state
```
{{tab C#}}
```csharp
// UNSAFE: a mutable Point shared and modified by two threads
public class MutablePoint {
    public int X, Y;
}
// Two threads both calling point.X++ concurrently -> the exact same lost-update race as 'counter' above

// SAFE: an immutable value object — there's no mutation to race on
public record Point(int X, int Y);

Point MoveRight(Point point) => point with { X = point.X + 1 };   // returns a NEW Point

var p1 = new Point(0, 0);
var p2 = MoveRight(p1);   // p1 is UNCHANGED — safe to hand p1 to as many threads as you like,
                           // none of them can ever see it in a half-updated state
```
{{/tabs}}

The practical guidance: **prefer immutable data passed between threads
over mutable shared state guarded by locks**, wherever the design
allows it. Locks are a necessary tool for state that genuinely must be
shared and mutated (like the counter and the singleton above) — but the
cheapest way to win a synchronization bug is to have no shared mutable
state to synchronize in the first place.

### Where locks belong in a design

Three concrete rules, applied as design decisions, not just syntax:

1. **Keep the critical section as small as possible.** Lock only the
   actual read-modify-write of shared state — never expensive work
   (I/O, sleeping, a slow computation) that doesn't itself touch the
   shared data, since anything inside the lock blocks every other thread
   waiting on it.
2. **Encapsulate the lock inside the class that owns the shared state**,
   the same way module 01 taught you to encapsulate a field behind a
   method rather than trusting every caller to validate it themselves.
   A class that exposes its lock publicly and expects callers to
   remember `lock(myObject.TheLock) { ... }` around every access is one
   forgotten call away from a race condition — put the locking *inside*
   the method (as the `Increment`/`increment` example does), so it's
   structurally impossible to forget.
3. **Never acquire multiple locks in inconsistent order across
   different code paths.** If thread A locks `X` then `Y`, and thread B
   locks `Y` then `X`, both can end up permanently waiting for a lock
   the other holds — a **deadlock**. If a design genuinely needs two
   locks, always acquire them in the same, fixed global order everywhere
   in the codebase.

## Hands-on exercises

### 1. Reproduce, then fix, a race condition

Run the unsynchronized counter example above several times and observe
the final count is usually wrong (and inconsistent between runs). Add
the lock and confirm it's now always exactly 200,000, every run.

### 2. Thread-safe Singleton

Implement the double-checked-locking `AppConfig` singleton (or, in C#,
the `Lazy<T>` version) and write a short test that starts several
threads all calling `get_instance()`/`GetInstance()` simultaneously,
confirming every thread receives the *same* object (compare by identity/
`ReferenceEquals`, not by value).

### 3. Producer-consumer pipeline

Build the producer/consumer example above with two consumers instead of
one, both pulling from the same queue. Confirm every produced item gets
consumed exactly once, never twice, and never dropped.

### 4. Race condition removed via immutability

Take the unsafe `MutablePoint` example and have two threads both call
`point.x += 1` a large number of times concurrently — observe lost
updates, just like the counter. Then replace it with the immutable
`Point` + `move_right`/`MoveRight` pattern, confirm the race is
structurally impossible now (there's no shared mutation left to race
on).

### 5. Encapsulate the lock

Given a `Counter` class whose `value` field is public and mutated
directly by callers wrapping their own `lock`/`with lock:` around every
access (easy to forget), refactor so the lock lives *inside* an
`increment()`/`Increment()` method on `Counter` itself — callers just
call the method, with no way to forget the lock because they never see
it.

## Independent challenge

No code given.

**Task:** Design a small thread-safe **in-memory cache** (a preview of
the real LRU cache coming in module 18) supporting concurrent `get(key)`
and `put(key, value)` calls from multiple threads, with the locking
**fully encapsulated** inside the cache class — callers never see or
manage a lock directly. Prove it's actually safe: spin up several
threads that concurrently `put` a large number of distinct keys, then
confirm from a single thread afterward that every key that was put is
correctly retrievable via `get`, with no corrupted or missing entries.

<details>
<summary>Hint</summary>

A single internal lock guarding both `get` and `put` (per this module's
"keep the critical section small" guidance, wrapping only the actual
dictionary/`Dictionary<K,V>` read or write, not any surrounding logic) is
sufficient for correctness here — don't reach for anything fancier
(reader-writer locks, lock-free structures) until you've measured an
actual contention problem; that's the same YAGNI judgment call (module
05) applied to concurrency primitives specifically.

</details>

## Common mistakes & troubleshooting

- **Assuming Python's GIL means threads never need locks.** The GIL
  prevents certain low-level interpreter corruption, but a compound
  operation like `x += 1` is still multiple bytecode steps a thread
  switch can interleave — this module's very first example proves it.
  Locking is still required for correctness on any shared mutable
  state, GIL or not.
- **Exposing a lock publicly and trusting every caller to remember to
  acquire it.** One missed `lock`/`with lock:` anywhere in the codebase
  reintroduces the race. Put the lock *inside* the class, acquired
  automatically by its own methods.
- **Holding a lock across slow or blocking work that doesn't touch the
  shared state.** This needlessly serializes threads that could
  otherwise proceed in parallel — keep locked sections to the minimum
  actual read/write of shared data.
- **Acquiring multiple locks in inconsistent order across different
  code paths.** The classic deadlock: thread A holds lock 1, waits for
  lock 2; thread B holds lock 2, waits for lock 1 — neither ever
  proceeds. Always acquire multiple locks in one fixed, global order.
- **Hand-rolling a producer-consumer queue with your own lock and
  condition-variable logic instead of using `queue.Queue`/
  `BlockingCollection<T>`.** These built-ins are already correctly
  implemented and heavily tested — reinventing them is extra risk for
  zero benefit, the concurrency-specific version of module 05's "don't
  build what already exists" judgment call.
- **Forgetting the *second* null-check inside a double-checked lock.**
  Without it, two threads can both pass the *first* check, then both
  wait on the lock, and both construct an instance one after another
  once each gets the lock in turn — the double-check is what actually
  prevents the second one from doing so.

## Checkpoint quiz

1. Why is `counter += 1` not atomic, even in Python under the GIL?
2. In the double-checked-locking Singleton, why is there a null-check
   both *before* and *inside* the lock — what would break if you
   removed the second one?
3. What does `queue.Queue`/`BlockingCollection<T>` give you for free
   that you'd otherwise have to hand-roll with a lock and a condition
   variable?
4. Why can't an immutable value object ever have a race condition?
5. What's a deadlock, and what's the one concrete rule that prevents the
   classic two-lock version of it?
6. What's wrong with a class that exposes its internal lock publicly
   for callers to acquire themselves?

<details>
<summary>Answers</summary>

1. Because it's actually three separate steps — read the current value,
   compute the new value, write it back — and a thread switch can occur
   between any of them, letting two threads both read the same stale
   value and each write back an increment that overwrites the other's.
2. The first check is a fast path that avoids locking overhead once the
   singleton already exists. The second check (inside the lock) catches
   the case where another thread finished construction between this
   thread's first check and it actually acquiring the lock — without it,
   this thread would go ahead and construct a second instance anyway.
3. Thread-safe push/pop with correct blocking behavior (a consumer
   waiting on an empty queue is woken exactly when an item arrives,
   with no busy-waiting or missed/duplicated items) — logic that's easy
   to get subtly wrong if hand-rolled with a raw lock and manual
   wait/notify calls.
4. Because there's no operation that changes it after construction — a
   race condition requires a read-modify-write (or any mutation) on
   shared state that another thread could interleave with; if nothing
   can ever mutate the object, there's nothing to race on.
5. A deadlock is when two (or more) threads each hold a lock the other
   is waiting for, so neither can ever proceed. The fix: always acquire
   multiple locks in one single, fixed, consistent order everywhere in
   the codebase, so the "A waits for B while B waits for A" situation
   can't arise.
6. Every caller must remember to wrap their own access in
   `lock`/`with lock:` themselves — a single missed call anywhere in
   the codebase silently reintroduces the exact race condition the lock
   was meant to prevent. Encapsulating the lock inside the class's own
   methods makes this structurally impossible to forget.

</details>

## Interview questions

1. **"How would you make a Singleton thread-safe?"**
   Guard the lazy-initialization check with a lock, and check again
   inside the lock (double-checked locking) to avoid constructing two
   instances if two threads both saw "not yet created" before either
   acquired the lock — or, in C#, simply use the built-in `Lazy<T>`,
   which does this correctly for you.
2. **"Does Python's GIL mean you never need locks for thread safety?"**
   No — the GIL serializes bytecode execution but doesn't make
   multi-step operations (like `x += 1`, or any read-then-write
   sequence) atomic; a thread switch can still occur mid-sequence,
   producing the same lost-update race as in a language without a GIL.
3. **"Explain the producer-consumer pattern and why you'd use a
   thread-safe queue instead of a plain list with manual locking."**
   Producers add work items, consumers remove and process them,
   decoupled by a shared hand-off point supporting concurrent, blocking
   push/pop. A thread-safe queue (`queue.Queue`/`BlockingCollection<T>`)
   already correctly implements the locking *and* the "wait until
   something's available" blocking behavior — hand-rolling this with a
   plain list and manual locks is extra risk (missed edge cases around
   waiting/notifying) for no benefit.
4. **"How does immutability help with concurrency?"**
   An object that can never be mutated after construction has no
   operation for two threads to race on — it can be freely read and
   shared across as many threads as you like with zero locking, because
   there's no "in-progress mutation" state it could ever be caught in.
5. **"What's a deadlock, and how do you avoid it when a design needs
   multiple locks?"**
   Two threads each hold one lock and wait for a lock the other one
   holds, so neither ever proceeds. Avoid it by always acquiring
   multiple locks in one single, consistent, predetermined order
   throughout the entire codebase, so the circular-wait condition that
   causes deadlock can never arise.

## Further reading & sources

- [Python: `threading` — Lock objects](https://docs.python.org/3/library/threading.html#lock-objects) - official reference for `threading.Lock`.
- [Python: `queue` — a synchronized queue class](https://docs.python.org/3/library/queue.html) - official reference for the thread-safe `queue.Queue` used above.
- [Microsoft Learn: `lock` statement (C#)](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/lock) - official reference for C#'s `lock`.
- [Microsoft Learn: `Lazy&lt;T&gt;`](https://learn.microsoft.com/en-us/dotnet/api/system.lazy-1) - the production-grade thread-safe lazy-initialization type referenced in the Singleton fix.
- [Microsoft Learn: `BlockingCollection&lt;T&gt;`](https://learn.microsoft.com/en-us/dotnet/api/system.collections.concurrent.blockingcollection-1) - official reference for the thread-safe collection used in the producer-consumer example.
- [Real Python: The GIL](https://realpython.com/python-gil/) - a clear, practical explanation of what the GIL does and doesn't protect you from.

## Next

[11-requirements-to-class-diagrams](../11-requirements-to-class-diagrams/README.md)
— the actual method used in an LLD interview: turning a vague prompt
into actors, use cases, entities, relationships, and a first-draft class
and sequence diagram, plus a cumulative review across modules 09–11.
