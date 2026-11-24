PROBLEMS = [
P(
    slug='lld-lru-cache', title='LRU Cache With Stats', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/18-lru-lfu-cache-and-rate-limiter/README.md',
    description='Build a fixed-size cache that evicts the least recently used entry, with O(1) get and put and hit/miss counters.',
    statement=r'''Write a class `LRUCache`: a key-value cache with a fixed capacity that, when full, throws away the entry that was **used least recently**.

**Creating one:** `LRUCache(capacity)`; `capacity` must be an `int` of 1 or more (not a `bool`), else `ValueError("Capacity must be positive")`.

**Methods**

- `get(key, default=None)` returns the value and makes the key the **most recently used**. A missing key returns `default` and counts as a miss.
- `peek(key, default=None)` returns the value **without** changing recency and without touching the counters.
- `put(key, value)` stores the value and makes the key the most recently used. Updating an existing key never evicts. When a **new** key arrives and the cache is full, the least recently used entry is removed first and `put` returns it as a `(key, value)` tuple; otherwise `put` returns `None`.
- `delete(key)` removes a key and returns `True`, or returns `False` when it was not there.
- `keys()` is a list of the keys, **most recently used first**.
- `len(cache)`, `key in cache` (does **not** change recency), and `stats`: a `(hits, misses)` tuple counting `get` calls only.

**Speed.** `get` and `put` must be O(1). The tests run 200,000 operations on a cache of 1,000 entries and expect it to finish quickly.''',
    starter=r'''class LRUCache:
    def __init__(self, capacity):
        ...

    def get(self, key, default=None):
        ...

    def peek(self, key, default=None):
        ...

    def put(self, key, value):
        """Store the value; return the evicted (key, value) or None."""
        ...

    def delete(self, key):
        ...

    def keys(self):
        """Most recently used first."""
        ...

    @property
    def stats(self):
        """(hits, misses) counted by get."""
        ...

    def __len__(self):
        ...

    def __contains__(self, key):
        ...''',
    tests=r'''import time
def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
for bad in (0, -1, 2.5, True, None):
    assert error_of(LRUCache, bad) == "ValueError: Capacity must be positive"
cache = LRUCache(3)
assert len(cache) == 0 and cache.keys() == [] and cache.stats == (0, 0)
assert cache.put("a", 1) is None and cache.put("b", 2) is None and cache.put("c", 3) is None
assert cache.keys() == ["c", "b", "a"] and len(cache) == 3
assert cache.get("a") == 1
assert cache.keys() == ["a", "c", "b"]
assert cache.put("d", 4) == ("b", 2)
assert cache.keys() == ["d", "a", "c"] and "b" not in cache and "a" in cache
assert cache.get("b") is None and cache.get("b", "none") == "none"
assert cache.stats == (1, 2)
assert cache.peek("c") == 3 and cache.peek("zzz", 0) == 0
assert cache.keys() == ["d", "a", "c"] and cache.stats == (1, 2)
assert "c" in cache and cache.keys() == ["d", "a", "c"]
assert cache.put("c", 30) is None
assert cache.keys() == ["c", "d", "a"] and cache.get("c") == 30 and len(cache) == 3
assert cache.put("e", 5) == ("a", 1)
assert cache.keys() == ["e", "c", "d"]
assert cache.put("d", 40) is None and cache.keys() == ["d", "e", "c"]
assert cache.delete("e") is True and cache.delete("e") is False and cache.keys() == ["d", "c"] and len(cache) == 2
assert cache.put("x", 1) is None and cache.put("y", 2) == ("c", 30)
assert cache.keys() == ["y", "x", "d"]
assert cache.get("y") == 2 and cache.stats == (3, 2)
zero = LRUCache(1)
assert zero.put(1, "a") is None and zero.put(2, "b") == (1, "a") and zero.get(1) is None and zero.get(2) == "b"
nothing = LRUCache(2)
nothing.put("k", None)
assert "k" in nothing and nothing.get("k", "d") is None and nothing.stats == (1, 0)
big = LRUCache(1000)
started = time.time()
for number in range(200000):
    big.put(number, number)
    big.get(number - 500)
assert len(big) == 1000 and big.keys()[0] == 199499
assert time.time() - started < 2.0''',
    solution=r'''from collections import OrderedDict


class LRUCache:
    def __init__(self, capacity):
        if type(capacity) is not int or capacity < 1:
            raise ValueError("Capacity must be positive")
        self._capacity = capacity
        self._items = OrderedDict()
        self._hits = 0
        self._misses = 0

    def get(self, key, default=None):
        if key in self._items:
            self._items.move_to_end(key)
            self._hits += 1
            return self._items[key]
        self._misses += 1
        return default

    def peek(self, key, default=None):
        return self._items.get(key, default)

    def put(self, key, value):
        evicted = None
        if key in self._items:
            self._items.move_to_end(key)
        elif len(self._items) == self._capacity:
            evicted = self._items.popitem(last=False)
        self._items[key] = value
        return evicted

    def delete(self, key):
        if key in self._items:
            del self._items[key]
            return True
        return False

    def keys(self):
        return list(reversed(self._items))

    @property
    def stats(self):
        return (self._hits, self._misses)

    def __len__(self):
        return len(self._items)

    def __contains__(self, key):
        return key in self._items''',
    hints=[
        r'''You need two things at once: look a key up in O(1) and know which key is oldest in O(1). A hash map that also remembers insertion order does both: Python's `collections.OrderedDict` has `move_to_end` and `popitem(last=False)`.''',
        r'''Keep the least recently used entry at the **front** and the most recent at the **back**. `get` and `put` of an existing key both move the key to the back; eviction pops from the front.''',
        r'''An update to an existing key must never evict, even when the cache is full. And `peek`, `in` and `keys` must not move anything, otherwise merely looking at the cache changes what it evicts.''',
    ],
    explanation=r'''**The idea.** An LRU cache is a hash map and a recency list that stay in step. The classic solution joins a dictionary to a doubly linked list so both "find" and "move to front" are O(1). `OrderedDict` is exactly that pair, built in.

```mermaid
flowchart LR
    A[oldest] --> B[b] --> C[c] --> D[newest a]
    D -. "get a moves it here" .-> D
    A -. "evict from here" .-> A
```

**Reads are writes.** The surprise of LRU is that a `get` changes state. Reading must update recency or "least recently used" would mean "least recently inserted". Everything that must not count as a use (`peek`, `in`, `keys`) is therefore a separate path.

**Update is not insert.** A full cache that receives a *known* key has nothing to evict. Checking `key in items` first is what avoids the off-by-one that throws away a healthy entry.

**Complexity.** `get`, `put`, `delete` are O(1) average. Space is O(capacity).

**Going further.** Thread safety: two threads both calling `get` mutate the order. What lock granularity would you pick, and what does a read-write lock buy you when every read writes?''',
),
P(
    slug='lld-lfu-cache', title='LFU Cache With Tie-Breaking', topic='lld-machine-coding', difficulty='advanced',
    module='lld/18-lru-lfu-cache-and-rate-limiter/README.md',
    description='Build a cache that evicts the least frequently used entry, breaking ties by recency, in O(1) per operation.',
    statement=r'''Write a class `LFUCache`: a fixed-capacity cache that, when full, evicts the entry used the **fewest times**; among entries with the same count, the one used **least recently**.

**Creating one:** `LFUCache(capacity)`; `capacity` must be an `int` of 1 or more (not a `bool`), else `ValueError("Capacity must be positive")`.

**Counting uses.** A new key starts with frequency **1**. Every `get` hit adds 1. A `put` on a key that already exists replaces its value and also adds 1. A missed `get` changes nothing.

**Methods**

- `get(key, default=None)` returns the value (adding a use) or `default`.
- `put(key, value)` stores the value. When a **new** key arrives and the cache is full, first evict the entry with the lowest frequency (ties: the least recently used of them) and return it as a `(key, value)` tuple; otherwise return `None`. A new key never competes with itself: it is inserted *after* the eviction.
- `frequency(key)` is the key's count, or `0` when it is not cached.
- `len(cache)` and `key in cache` (neither counts as a use).

**Speed.** Every operation must be O(1). The tests put 60,000 new keys through a cache of 5,000 and expect it to finish quickly.''',
    starter=r'''class LFUCache:
    def __init__(self, capacity):
        ...

    def get(self, key, default=None):
        ...

    def put(self, key, value):
        """Store the value; return the evicted (key, value) or None."""
        ...

    def frequency(self, key):
        ...

    def __len__(self):
        ...

    def __contains__(self, key):
        ...''',
    tests=r'''import time
def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
for bad in (0, -3, 1.5, True, None):
    assert error_of(LFUCache, bad) == "ValueError: Capacity must be positive"
cache = LFUCache(2)
assert len(cache) == 0 and cache.frequency("x") == 0 and cache.get("x") is None
assert cache.put(1, "one") is None and cache.put(2, "two") is None
assert cache.frequency(1) == 1 and cache.frequency(2) == 1
assert cache.get(1) == "one" and cache.frequency(1) == 2
assert cache.put(3, "three") == (2, "two")
assert 2 not in cache and cache.get(2) is None and cache.get(2, "gone") == "gone" and cache.frequency(2) == 0
assert cache.get(3) == "three" and cache.frequency(3) == 2
assert cache.put(4, "four") == (1, "one")
assert 1 not in cache and 3 in cache and 4 in cache and len(cache) == 2
assert cache.get(3) == "three" and cache.get(4) == "four"
assert cache.frequency(3) == 3 and cache.frequency(4) == 2
assert cache.put(5, "five") == (4, "four")
assert cache.frequency(5) == 1 and cache.frequency(3) == 3
other = LFUCache(2)
other.put("a", 1)
other.put("b", 2)
assert other.put("a", 10) is None and other.frequency("a") == 2 and other.get("a") == 10
assert other.put("c", 3) == ("b", 2)
assert other.frequency("a") == 3 and other.frequency("c") == 1
assert other.put("d", 4) == ("c", 3)
ties = LFUCache(3)
for key in "abc":
    ties.put(key, key.upper())
ties.get("a")
ties.get("b")
ties.get("c")
ties.get("a")
assert ties.put("d", "D") == ("b", "B")
assert ("a" in ties) and ("c" in ties) and ("d" in ties)
assert ties.frequency("a") == 3 and ties.frequency("c") == 2 and ties.frequency("d") == 1
assert ties.put("e", "E") == ("d", "D")
assert ties.put("f", "F") == ("e", "E")
single = LFUCache(1)
assert single.put("x", 1) is None and single.get("x") == 1 and single.put("y", 2) == ("x", 1) and single.frequency("y") == 1
holder = LFUCache(2)
holder.put("k", None)
assert holder.get("k", "d") is None and holder.frequency("k") == 2
big = LFUCache(5000)
started = time.time()
for number in range(60000):
    big.put(number, number)
    big.get(number)
assert len(big) == 5000
assert time.time() - started < 2.0''',
    solution=r'''from collections import OrderedDict, defaultdict


class LFUCache:
    def __init__(self, capacity):
        if type(capacity) is not int or capacity < 1:
            raise ValueError("Capacity must be positive")
        self._capacity = capacity
        self._values = {}
        self._counts = {}
        self._buckets = defaultdict(OrderedDict)
        self._lowest = 0

    def _use(self, key):
        count = self._counts[key]
        del self._buckets[count][key]
        if not self._buckets[count]:
            del self._buckets[count]
            if self._lowest == count:
                self._lowest = count + 1
        self._counts[key] = count + 1
        self._buckets[count + 1][key] = None

    def get(self, key, default=None):
        if key not in self._values:
            return default
        self._use(key)
        return self._values[key]

    def put(self, key, value):
        if key in self._values:
            self._values[key] = value
            self._use(key)
            return None
        evicted = None
        if len(self._values) == self._capacity:
            oldest, _ = self._buckets[self._lowest].popitem(last=False)
            if not self._buckets[self._lowest]:
                del self._buckets[self._lowest]
            evicted = (oldest, self._values.pop(oldest))
            del self._counts[oldest]
        self._values[key] = value
        self._counts[key] = 1
        self._buckets[1][key] = None
        self._lowest = 1
        return evicted

    def frequency(self, key):
        return self._counts.get(key, 0)

    def __len__(self):
        return len(self._values)

    def __contains__(self, key):
        return key in self._values''',
    hints=[
        r'''Keep three maps: key to value, key to count, and **count to the keys that have that count**, oldest first. The last one is what makes "least frequent, then least recent" a single O(1) lookup.''',
        r'''Also keep the lowest count currently in use. A use moves a key from bucket `n` to bucket `n + 1`; if bucket `n` just became empty and `n` was the lowest, the lowest is now `n + 1`. A brand new key always has count 1, so the lowest is 1 again.''',
        r'''Evict **before** inserting the new key, and only for a new key. If you insert first, the new key (count 1) may be the one chosen for eviction.''',
    ],
    explanation=r'''**The idea.** LRU needs one ordered list. LFU needs *a list per frequency*: every bucket is an `OrderedDict` of the keys that share a count, oldest first. Eviction takes the oldest key of the lowest bucket; a use moves a key to the next bucket.

```mermaid
flowchart LR
    A["count 1: d"] --> B["count 2: c"] --> C["count 3: a"]
    C -. "get d moves it up" .-> B
```

**The lowest count is a variable, not a search.** Scanning the buckets for the smallest count is O(number of distinct counts). Keeping `lowest` up to date costs two lines and makes every operation O(1): it only ever moves up by one when a bucket empties, or resets to 1 on an insert.

**Why a naive version fails the timing test.** `min(counts, key=...)` over 5,000 entries on every eviction is 5,000 steps times 60,000 puts: hundreds of millions of operations.

**Frequency is not forever.** A key that was popular a year ago keeps a huge count and is never evicted. Real LFU caches *decay* counts. That is a good follow-up in an interview.

**Complexity.** O(1) per operation; O(capacity) space.

**Going further.** Add `decay()` that halves every count (and merges buckets). What breaks in the `lowest` bookkeeping?''',
),
P(
    slug='lld-sliding-window-rate-limiter', title='Sliding-Window Rate Limiter', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/18-lru-lfu-cache-and-rate-limiter/README.md',
    description='Limit each key to N requests in any rolling window, with an injected clock, remaining counts and a retry-after hint.',
    statement=r'''Write a class `RateLimiter` that allows at most `limit` requests per key in **any** rolling window of `window` seconds (a *sliding window log*).

**Creating one:** `RateLimiter(limit, window, clock)`. `clock` is a function that returns the current time in seconds; **call it once per method call** and never use the real time. Check in this order: `limit` must be an `int` of 1 or more (not a `bool`), else `ValueError("Limit must be positive")`; `window` must be a number above 0, else `ValueError("Window must be positive")`.

**The rule.** An allowed request made at time `t` counts against its key during the window `(t, t + window]`; at exactly `t + window` it no longer counts. A request is allowed when fewer than `limit` allowed requests count at that moment. A **rejected request is not recorded** and does not extend anyone's wait.

**Methods**

- `allow(key)` returns `True` and records the request, or `False`.
- `remaining(key)` is how many more requests would be allowed right now.
- `retry_after(key)` is `0` when a request would be allowed now, otherwise how many seconds until it would be (the oldest counting request expires at its time plus `window`).
- `reset(key)` forgets a key's history.
- `tracked` is the number of keys that still have a counting request. Keys whose requests have all expired must not stay in memory.

Different keys are completely independent.''',
    starter=r'''class RateLimiter:
    def __init__(self, limit, window, clock):
        ...

    def allow(self, key):
        ...

    def remaining(self, key):
        ...

    def retry_after(self, key):
        ...

    def reset(self, key):
        ...

    @property
    def tracked(self):
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
        self.reads = 0
    def __call__(self):
        self.reads += 1
        return self.now
clock = Clock()
for bad in (0, -1, 1.5, True, None):
    assert error_of(RateLimiter, bad, 10, clock) == "ValueError: Limit must be positive"
for bad in (0, -5, None, "10"):
    assert error_of(RateLimiter, 2, bad, clock) == "ValueError: Window must be positive"
assert error_of(RateLimiter, 0, 0, clock) == "ValueError: Limit must be positive"
limiter = RateLimiter(3, 10, clock)
assert limiter.remaining("u") == 3 and limiter.retry_after("u") == 0 and limiter.tracked == 0
clock.now = 0
assert limiter.allow("u") is True
clock.now = 4
assert limiter.allow("u") is True
clock.now = 5
assert limiter.allow("u") is True
assert limiter.remaining("u") == 0 and limiter.retry_after("u") == 5
clock.now = 6
assert limiter.allow("u") is False
assert limiter.retry_after("u") == 4
clock.now = 9
assert limiter.allow("u") is False and limiter.retry_after("u") == 1 and limiter.remaining("u") == 0
clock.now = 10
assert limiter.remaining("u") == 1 and limiter.retry_after("u") == 0
assert limiter.allow("u") is True
assert limiter.allow("u") is False and limiter.retry_after("u") == 4
clock.now = 14
assert limiter.remaining("u") == 1 and limiter.allow("u") is True and limiter.allow("u") is False
clock.now = 15
assert limiter.remaining("u") == 1
clock.now = 100
assert limiter.remaining("u") == 3 and limiter.tracked == 0
assert limiter.allow("a") is True and limiter.allow("b") is True
assert limiter.tracked == 2
limiter.allow("a")
limiter.allow("a")
assert limiter.allow("a") is False and limiter.allow("b") is True and limiter.remaining("b") == 1
limiter.reset("a")
assert limiter.remaining("a") == 3 and limiter.allow("a") is True and limiter.tracked == 2
limiter.reset("never-seen")
assert limiter.tracked == 2
clock.now = 111
assert limiter.tracked == 0
reads = clock.reads
limiter.allow("z")
assert clock.reads == reads + 1
limiter.retry_after("z")
assert clock.reads == reads + 2
limiter.remaining("z")
assert clock.reads == reads + 3
limiter.allow("z")
limiter.allow("z")
reads = clock.reads
assert limiter.retry_after("z") == 10 and clock.reads == reads + 1
fast = RateLimiter(1, 0.5, clock)
clock.now = 200
assert fast.allow("k") is True and fast.allow("k") is False and fast.retry_after("k") == 0.5
clock.now = 200.5
assert fast.allow("k") is True
rejected = RateLimiter(2, 10, clock)
clock.now = 300
rejected.allow("r")
clock.now = 301
rejected.allow("r")
clock.now = 302
for attempt in range(5):
    assert rejected.allow("r") is False
clock.now = 310
assert rejected.allow("r") is True and rejected.allow("r") is False
assert rejected.retry_after("r") == 1''',
    solution=r'''from collections import deque


class RateLimiter:
    def __init__(self, limit, window, clock):
        if type(limit) is not int or limit < 1:
            raise ValueError("Limit must be positive")
        if type(window) not in (int, float) or window <= 0:
            raise ValueError("Window must be positive")
        self._limit = limit
        self._window = window
        self._clock = clock
        self._log = {}

    def _live(self, key, now):
        log = self._log.get(key)
        if log is None:
            return deque()
        cutoff = now - self._window
        while log and log[0] <= cutoff:
            log.popleft()
        if not log:
            del self._log[key]
        return log

    def allow(self, key):
        now = self._clock()
        log = self._live(key, now)
        if len(log) >= self._limit:
            return False
        self._log.setdefault(key, log).append(now)
        return True

    def remaining(self, key):
        return self._limit - len(self._live(key, self._clock()))

    def retry_after(self, key):
        now = self._clock()
        log = self._live(key, now)
        if len(log) < self._limit:
            return 0
        return log[0] + self._window - now

    def reset(self, key):
        self._log.pop(key, None)

    @property
    def tracked(self):
        now = self._clock()
        for key in list(self._log):
            self._live(key, now)
        return len(self._log)''',
    hints=[
        r'''For each key keep a queue of the times of the *allowed* requests. Before every decision, drop the times that are older than the window from the front; what is left is exactly what counts.''',
        r'''The boundary: a request made at `t` is out of the window when `now - window >= t`. Use `<=` when dropping, so at exactly `t + window` the slot is free again.''',
        r'''Read the clock **once** per call and use that one value for both the pruning and the timestamp you record. Record only requests you allowed; a rejected request must not lengthen the wait.''',
    ],
    explanation=r'''**The idea.** The sliding window *log* keeps one timestamp per allowed request. "Is this request allowed?" becomes "how many timestamps are inside `(now - window, now]`?". Exact and simple; the cost is memory proportional to `limit` per key.

**Why not the fixed window?** A counter that resets every minute lets a client send `limit` requests at 0:59 and `limit` more at 1:00, double the limit in two seconds. The sliding log has no such burst.

**Inject the clock.** `time.time()` inside the class makes every test either slow (`sleep`) or flaky. A callable passed in is the whole trick: the tests set `clock.now` and the class cannot tell. The statement says "read once per call" because two reads in one call can straddle a boundary and give two different answers.

**Memory.** Delete a key when its queue empties, or an attacker who sends one request from a million addresses grows the map forever.

**Complexity.** `allow` is amortised O(1); memory O(limit) per active key.

**Going further.** The sliding window *counter* stores two buckets instead of a log and approximates the same rule in O(1) memory. When is the approximation good enough, and when is it not?''',
),
P(
    slug='lld-autocomplete-trie', title='Autocomplete Suggestions', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/21-lld-interview-playbook/README.md',
    description='Build a prefix-search suggester over weighted words with a trie, popularity updates and fast top-k results.',
    statement=r'''Write a class `AutoComplete` that suggests words for what the user has typed so far.

**Words** are stored stripped and in **lower case**. A word is a non-blank string, else `ValueError("Word required")`.

**Methods**

- `add(word, weight=1)` adds a word, or **adds** `weight` to its popularity if it is already known. `weight` must be an `int` of 1 or more (not a `bool`), else `ValueError("Weight must be positive")`. Check the word first.
- `record(word)` adds 1 to the weight of a known word; an unknown word is `ValueError("Unknown word")`.
- `remove(word)` forgets a word; an unknown word is `ValueError("Unknown word")`.
- `weight(word)` is the popularity of a word, or `0` when unknown.
- `suggest(prefix, limit=3)` returns up to `limit` known words that start with `prefix` (ignoring case), **most popular first**, ties in alphabetical order. An empty prefix suggests from every word. `limit` must be an `int` of 1 or more, else `ValueError("Limit must be positive")`.
- `len(ac)` is the number of known words.

**Speed.** Do not scan every word for every query. The tests build 30,000 words and ask 3,000 questions and expect it to finish quickly.''',
    starter=r'''class AutoComplete:
    def __init__(self):
        ...

    def add(self, word, weight=1):
        ...

    def record(self, word):
        ...

    def remove(self, word):
        ...

    def weight(self, word):
        ...

    def suggest(self, prefix, limit=3):
        ...

    def __len__(self):
        ...''',
    tests=r'''import time
def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
ac = AutoComplete()
assert len(ac) == 0 and ac.suggest("a") == [] and ac.suggest("") == [] and ac.weight("x") == 0
for bad in ("", "   ", None, 5):
    assert error_of(ac.add, bad) == "ValueError: Word required"
for bad in (0, -1, 1.5, True):
    assert error_of(ac.add, "ok", bad) == "ValueError: Weight must be positive"
assert error_of(ac.add, "", 0) == "ValueError: Word required"
assert len(ac) == 0
for word, weight in (("apple", 5), ("app", 8), ("apply", 5), ("apt", 2), ("banana", 4), ("Band", 1)):
    ac.add(word, weight)
assert len(ac) == 6 and ac.weight("APP") == 8
assert ac.suggest("ap") == ["app", "apple", "apply"]
assert ac.suggest("ap", 2) == ["app", "apple"] and ac.suggest("ap", 10) == ["app", "apple", "apply", "apt"]
assert ac.suggest("AP") == ["app", "apple", "apply"] and ac.suggest("appl") == ["apple", "apply"]
assert ac.suggest("b") == ["banana", "band"] and ac.suggest("c") == [] and ac.suggest("apples") == []
assert ac.suggest("") == ["app", "apple", "apply"]
assert error_of(ac.suggest, "a", 0) == "ValueError: Limit must be positive"
assert error_of(ac.suggest, "a", True) == "ValueError: Limit must be positive"
ac.add("  Apt  ", 10)
assert ac.weight("apt") == 12 and len(ac) == 6 and ac.suggest("ap", 1) == ["apt"]
ac.record("apply")
ac.record("apply")
ac.record("apply")
assert ac.weight("apply") == 8 and ac.suggest("ap") == ["apt", "app", "apply"]
assert error_of(ac.record, "nope") == "ValueError: Unknown word"
assert error_of(ac.remove, "nope") == "ValueError: Unknown word"
ac.remove("apt")
assert ac.weight("apt") == 0 and len(ac) == 5 and ac.suggest("ap") == ["app", "apply", "apple"]
assert error_of(ac.remove, "apt") == "ValueError: Unknown word"
assert error_of(ac.record, "apt") == "ValueError: Unknown word"
ac.add("apt")
assert ac.weight("apt") == 1 and ac.suggest("apt") == ["apt"]
ac.add("new york", 3)
assert ac.suggest("new y") == ["new york"] and ac.suggest("new") == ["new york"]
ac.remove("app")
assert ac.suggest("app") == ["apply", "apple"] and ac.suggest("ap", 1) == ["apply"]
state = 12345
words = []
for index in range(30000):
    word = ""
    for position in range(6):
        state = (state * 1103515245 + 12345) % 2147483648
        word += chr(97 + (state >> 16) % 26)
    words.append(word)
big = AutoComplete()
started = time.time()
for index, word in enumerate(words):
    big.add(word, index % 7 + 1)
found = 0
for index in range(3000):
    found += len(big.suggest(words[index][:3], 3))
assert found >= 3000
assert time.time() - started < 3.0''',
    solution=r'''class _Node:
    __slots__ = ("children", "weight")

    def __init__(self):
        self.children = {}
        self.weight = 0


class AutoComplete:
    def __init__(self):
        self._root = _Node()
        self._count = 0

    @staticmethod
    def _clean(word):
        if not isinstance(word, str) or not word.strip():
            raise ValueError("Word required")
        return word.strip().lower()

    def _find(self, text):
        node = self._root
        for char in text:
            node = node.children.get(char)
            if node is None:
                return None
        return node

    def add(self, word, weight=1):
        word = self._clean(word)
        if type(weight) is not int or weight < 1:
            raise ValueError("Weight must be positive")
        node = self._root
        for char in word:
            node = node.children.setdefault(char, _Node())
        if node.weight == 0:
            self._count += 1
        node.weight += weight

    def _known(self, word):
        node = self._find(self._clean(word))
        if node is None or node.weight == 0:
            raise ValueError("Unknown word")
        return node

    def record(self, word):
        self._known(word).weight += 1

    def remove(self, word):
        node = self._known(word)
        node.weight = 0
        self._count -= 1

    def weight(self, word):
        node = self._find(self._clean(word))
        return node.weight if node else 0

    def suggest(self, prefix, limit=3):
        if type(limit) is not int or limit < 1:
            raise ValueError("Limit must be positive")
        prefix = prefix.lower()
        start = self._find(prefix)
        if start is None:
            return []
        found = []
        stack = [(start, prefix)]
        while stack:
            node, text = stack.pop()
            if node.weight:
                found.append((-node.weight, text))
            for char, child in node.children.items():
                stack.append((child, text + char))
        found.sort()
        return [text for _, text in found[:limit]]

    def __len__(self):
        return self._count''',
    hints=[
        r'''A trie is a tree with one level per letter. Walking down the prefix costs O(length of prefix), no matter how many words exist. All the words under that node are the candidates.''',
        r'''Mark "a word ends here" with a weight on the node, and treat weight 0 as "not a word". Removing a word then only means setting its weight back to 0, and `len` needs a counter you adjust when a word becomes known or forgotten.''',
        r'''Sort the candidates by `(-weight, word)`: negative weight puts the most popular first, and ties fall back to alphabetical order for free.''',
    ],
    explanation=r'''**The idea.** The slow way to autocomplete is `[w for w in words if w.startswith(p)]`, which looks at every word. A trie shares prefixes: all words starting with `app` hang below the same three nodes, so finding them costs the length of the prefix plus the size of the answer.

**Where the work goes.** `suggest` walks to the prefix node (fast), collects every word below it (as many as match), and sorts them. For a short prefix such as `a` on a big dictionary that is a lot of words. Production systems store the **top k at every node** so that a query is a single lookup, at the cost of updating the ancestors whenever a weight changes.

**Normalise at the door.** Lower-casing and stripping once on the way in means the structure never has to think about case again.

**Removal.** Setting the weight to 0 keeps the structure valid and cheap. Pruning empty branches would free memory but needs a path stack; say so in an interview and offer it as the follow-up.

**Complexity.** `add`, `record`, `remove`, `weight`: O(length of the word). `suggest`: O(prefix + matches log matches).

**Going further.** Store the top 3 at each node. What has to happen to every ancestor when `record("apple")` makes `apple` more popular than a word that was in the top 3?''',
),
P(
    slug='lld-hit-counter', title='Hit Counter', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/18-lru-lfu-cache-and-rate-limiter/README.md',
    description='Count hits in the last N seconds with bounded memory, validated timestamps and bulk hits.',
    statement=r'''Write a class `HitCounter` that counts hits in the last `window` seconds ("visits in the last 5 minutes").

**Creating one:** `HitCounter(window=300)`; `window` must be an `int` of 1 or more (not a `bool`), else `ValueError("Window must be positive")`.

**Methods**

- `hit(timestamp, count=1)` records `count` hits at a time given in whole seconds.
- `count(timestamp)` is the number of hits in the window that ends at `timestamp`: hits with `timestamp - window < t <= timestamp`.
- `stored` is how many distinct seconds the counter currently remembers. It must **never exceed `window`**, however many hits arrive, because memory must stay bounded.

**What is refused.** `ValueError`, changing nothing. Check in this order:

1. `timestamp` is not an `int` (a `bool` is not one): `"Timestamp must be an integer"`
2. `timestamp` is earlier than the latest timestamp seen by any earlier `hit` or `count`: `"Timestamps must not go back"`
3. (`hit` only) `count` is not an `int` of 1 or more: `"Count must be positive"`

Several hits in the same second share one entry. Hits that fall out of the window are forgotten.

**Speed.** The tests send 300,000 hits over 100,000 seconds and expect it to finish quickly.''',
    starter=r'''class HitCounter:
    def __init__(self, window=300):
        ...

    def hit(self, timestamp, count=1):
        ...

    def count(self, timestamp):
        ...

    @property
    def stored(self):
        ...''',
    tests=r'''import time
def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
for bad in (0, -1, 2.5, True, None):
    assert error_of(HitCounter, bad) == "ValueError: Window must be positive"
counter = HitCounter()
assert counter.count(1) == 0 and counter.stored == 0
counter.hit(1)
counter.hit(2)
counter.hit(3)
assert counter.count(4) == 3 and counter.stored == 3
assert counter.count(300) == 3
assert counter.count(301) == 2
assert counter.stored == 2
assert counter.count(302) == 1 and counter.count(303) == 0 and counter.stored == 0
small = HitCounter(window=5)
small.hit(10, 4)
small.hit(10)
small.hit(12, 2)
assert small.count(12) == 7 and small.stored == 2
assert small.count(14) == 7
assert small.count(15) == 2
assert small.count(16) == 2
assert small.count(17) == 0
assert error_of(small.hit, 16) == "ValueError: Timestamps must not go back"
assert error_of(small.count, 16) == "ValueError: Timestamps must not go back"
small.hit(17)
assert small.count(17) == 1
assert error_of(small.hit, 1.5) == "ValueError: Timestamp must be an integer"
assert error_of(small.hit, True) == "ValueError: Timestamp must be an integer"
assert error_of(small.count, "5") == "ValueError: Timestamp must be an integer"
assert error_of(small.hit, 3, 0) == "ValueError: Timestamps must not go back"
assert error_of(small.hit, 20, 0) == "ValueError: Count must be positive"
assert error_of(small.hit, 20, -2) == "ValueError: Count must be positive"
assert error_of(small.hit, 20, 1.5) == "ValueError: Count must be positive"
assert error_of(small.hit, 20, True) == "ValueError: Count must be positive"
assert small.count(17) == 1
small.hit(25, 3)
assert small.count(25) == 3 and small.stored == 1
same = HitCounter(window=3)
same.hit(1)
same.hit(1)
same.hit(1)
assert same.stored == 1 and same.count(1) == 3
assert same.count(3) == 3 and same.count(4) == 0
big = HitCounter(300)
started = time.time()
for second in range(100000):
    big.hit(second, 3)
    assert big.stored <= 300
assert big.count(99999) == 900 and big.stored == 300
assert time.time() - started < 2.0''',
    solution=r'''from collections import deque


class HitCounter:
    def __init__(self, window=300):
        if type(window) is not int or window < 1:
            raise ValueError("Window must be positive")
        self._window = window
        self._buckets = deque()
        self._total = 0
        self._latest = None

    @property
    def stored(self):
        return len(self._buckets)

    def _advance(self, timestamp):
        if type(timestamp) is not int:
            raise ValueError("Timestamp must be an integer")
        if self._latest is not None and timestamp < self._latest:
            raise ValueError("Timestamps must not go back")

    def _expire(self, timestamp):
        self._latest = timestamp
        while self._buckets and self._buckets[0][0] <= timestamp - self._window:
            self._total -= self._buckets.popleft()[1]

    def hit(self, timestamp, count=1):
        self._advance(timestamp)
        if type(count) is not int or count < 1:
            raise ValueError("Count must be positive")
        self._expire(timestamp)
        if self._buckets and self._buckets[-1][0] == timestamp:
            self._buckets[-1][1] += count
        else:
            self._buckets.append([timestamp, count])
        self._total += count

    def count(self, timestamp):
        self._advance(timestamp)
        self._expire(timestamp)
        return self._total''',
    hints=[
        r'''Do not keep one entry per hit. Keep one `[second, hits]` entry per distinct second, in a deque, and a running total. Old seconds leave from the left, new hits join on the right.''',
        r'''Expire before you add, and expire in `count` as well: asking about a later time must forget what has fallen out. A bucket is out when `bucket_time <= timestamp - window`.''',
        r'''Validate in the order of the statement and before changing anything: the type of the timestamp, then going back in time, then the count. A refused `hit` must not even move the "latest" time.''',
    ],
    explanation=r'''**The idea.** The window only ever moves forward, so a queue of per-second buckets is enough: new seconds append on the right, expired seconds pop from the left, and a running total makes `count` O(1). Memory is at most `window` buckets, whatever the traffic.

**One entry per second, not per hit.** A busy site has thousands of hits a second. Storing each one makes memory grow with traffic; one counter per second makes it grow with *time*, and only up to the window.

**Time must not go back.** Expiry is a one-way operation: once an old bucket is thrown away it cannot be recovered. So the class refuses an earlier timestamp rather than answering wrongly. Real systems either reject late events or keep a separate "late" path.

**Complexity.** Amortised O(1) per call; O(window) space.

**Going further.** With millisecond timestamps and a one-hour window you would have 3.6 million buckets. Group them into one-second buckets: which accuracy do you lose?''',
),
P(
    slug='lld-task-dependency-graph', title='Task Dependency Graph', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/21-lld-interview-playbook/README.md',
    description='Keep tasks and their dependencies, refuse cycles, list a deterministic run order, and find what is ready or affected.',
    statement=r'''Write a class `TaskGraph` for a build system: tasks, and which tasks must finish before which.

**Methods**

- `add(name, depends_on=())` adds a task that depends on tasks that **already exist**. A repeated name is `ValueError("Duplicate task: <name>")`; a dependency that does not exist is `ValueError("Unknown task: <dependency>")` (the first one in the order given). Check the duplicate first. A refused `add` adds nothing.
- `depend(task, on)` makes an existing task also depend on another existing task. Unknown names are refused in that order (`task`, then `on`) with `"Unknown task: <name>"`. If it would create a **cycle** (including a task depending on itself) raise `ValueError("Cycle detected")` and change nothing. Adding a dependency that is already there is fine.
- `order()` is a list of **all** tasks in a valid run order (every task after everything it depends on). Where several tasks could go next, choose the **alphabetically first**. The result must be the same every time.
- `ready(done)` is the sorted list of tasks **not in `done`** whose dependencies are all in `done`. `done` is any iterable of names; an unknown name in it is `ValueError("Unknown task: <name>")` (the alphabetically first unknown one).
- `dependencies(task)` is the sorted list of **all** tasks it needs, directly or through others; `dependents(task)` is the sorted list of all tasks that need it, directly or through others. An unknown task is refused as above.

**Example.** After `add("build")`, `add("test", ["build"])`, `add("lint")`, `add("deploy", ["test", "lint"])`, `order()` is `["build", "lint", "test", "deploy"]`.''',
    starter=r'''class TaskGraph:
    def __init__(self):
        ...

    def add(self, name, depends_on=()):
        ...

    def depend(self, task, on):
        ...

    def order(self):
        ...

    def ready(self, done):
        ...

    def dependencies(self, task):
        ...

    def dependents(self, task):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
graph = TaskGraph()
assert graph.order() == [] and graph.ready([]) == []
graph.add("build")
graph.add("test", ["build"])
graph.add("lint")
graph.add("deploy", ["test", "lint"])
assert graph.order() == ["build", "lint", "test", "deploy"]
assert graph.order() == ["build", "lint", "test", "deploy"]
assert graph.ready([]) == ["build", "lint"]
assert graph.ready(["build"]) == ["lint", "test"]
assert graph.ready(("build", "lint")) == ["test"]
assert graph.ready({"build", "lint", "test"}) == ["deploy"]
assert graph.ready(["build", "lint", "test", "deploy"]) == []
assert graph.ready(x for x in ["lint"]) == ["build"]
assert graph.dependencies("deploy") == ["build", "lint", "test"]
assert graph.dependencies("test") == ["build"] and graph.dependencies("build") == []
assert graph.dependents("build") == ["deploy", "test"] and graph.dependents("lint") == ["deploy"] and graph.dependents("deploy") == []
assert error_of(graph.add, "build") == "ValueError: Duplicate task: build"
assert error_of(graph.add, "build", ["nope"]) == "ValueError: Duplicate task: build"
assert error_of(graph.add, "new", ["lint", "zzz", "yyy"]) == "ValueError: Unknown task: zzz"
assert graph.order() == ["build", "lint", "test", "deploy"] and error_of(graph.dependencies, "new") == "ValueError: Unknown task: new"
assert error_of(graph.ready, ["build", "zzz", "aaa"]) == "ValueError: Unknown task: aaa"
assert error_of(graph.dependents, "q") == "ValueError: Unknown task: q"
assert error_of(graph.depend, "q", "build") == "ValueError: Unknown task: q"
assert error_of(graph.depend, "q", "r") == "ValueError: Unknown task: q"
assert error_of(graph.depend, "build", "r") == "ValueError: Unknown task: r"
assert error_of(graph.depend, "build", "build") == "ValueError: Cycle detected"
assert error_of(graph.depend, "build", "deploy") == "ValueError: Cycle detected"
assert error_of(graph.depend, "test", "deploy") == "ValueError: Cycle detected"
assert graph.order() == ["build", "lint", "test", "deploy"]
graph.depend("test", "build")
graph.depend("build", "lint")
assert graph.order() == ["lint", "build", "test", "deploy"]
assert graph.dependencies("test") == ["build", "lint"] and graph.dependents("lint") == ["build", "deploy", "test"]
assert error_of(graph.depend, "lint", "test") == "ValueError: Cycle detected"
assert graph.order() == ["lint", "build", "test", "deploy"]
wide = TaskGraph()
for name in ("c", "b", "a"):
    wide.add(name)
wide.add("z", ["c"])
wide.add("y", ["a", "z"])
assert wide.order() == ["a", "b", "c", "z", "y"]
chain = TaskGraph()
chain.add("t0")
for number in range(1, 3000):
    chain.add("t" + str(number), ["t" + str(number - 1)])
assert chain.order()[-1] == "t2999" and len(chain.dependencies("t2999")) == 2999 and len(chain.dependents("t0")) == 2999
assert error_of(chain.depend, "t0", "t2999") == "ValueError: Cycle detected"
diamond = TaskGraph()
diamond.add("root")
diamond.add("l", ["root"])
diamond.add("r", ["root"])
diamond.add("tip", ["l", "r", "root"])
assert diamond.dependencies("tip") == ["l", "r", "root"] and diamond.dependents("root") == ["l", "r", "tip"]
assert diamond.order() == ["root", "l", "r", "tip"]''',
    solution=r'''import heapq


class TaskGraph:
    def __init__(self):
        self._needs = {}

    def _require(self, name):
        if name not in self._needs:
            raise ValueError("Unknown task: " + str(name))

    def add(self, name, depends_on=()):
        if name in self._needs:
            raise ValueError("Duplicate task: " + str(name))
        depends_on = list(depends_on)
        for dependency in depends_on:
            self._require(dependency)
        self._needs[name] = set(depends_on)

    def _reaches(self, start, goal):
        seen = set()
        stack = [start]
        while stack:
            current = stack.pop()
            if current == goal:
                return True
            if current in seen:
                continue
            seen.add(current)
            stack.extend(self._needs[current])
        return False

    def depend(self, task, on):
        self._require(task)
        self._require(on)
        if self._reaches(on, task):
            raise ValueError("Cycle detected")
        self._needs[task].add(on)

    def order(self):
        waiting = {name: len(needs) for name, needs in self._needs.items()}
        users = {name: [] for name in self._needs}
        for name, needs in self._needs.items():
            for need in needs:
                users[need].append(name)
        heap = [name for name, count in waiting.items() if count == 0]
        heapq.heapify(heap)
        result = []
        while heap:
            name = heapq.heappop(heap)
            result.append(name)
            for user in users[name]:
                waiting[user] -= 1
                if waiting[user] == 0:
                    heapq.heappush(heap, user)
        return result

    def ready(self, done):
        done = set(done)
        for name in sorted(done):
            self._require(name)
        return sorted(name for name, needs in self._needs.items() if name not in done and needs <= done)

    def dependencies(self, task):
        self._require(task)
        found = set()
        stack = list(self._needs[task])
        while stack:
            current = stack.pop()
            if current not in found:
                found.add(current)
                stack.extend(self._needs[current])
        return sorted(found)

    def dependents(self, task):
        self._require(task)
        users = {name: [] for name in self._needs}
        for name, needs in self._needs.items():
            for need in needs:
                users[need].append(name)
        found = set()
        stack = list(users[task])
        while stack:
            current = stack.pop()
            if current not in found:
                found.add(current)
                stack.extend(users[current])
        return sorted(found)''',
    hints=[
        r'''Store for each task the set of tasks it needs. Adding a dependency `task -> on` creates a cycle exactly when `on` can already reach `task` by following needs (or when they are the same task). Check that *before* adding the edge.''',
        r'''For `order`, count how many unfinished dependencies each task has. Put the tasks with zero in a min-heap (so the alphabetically first comes out first), and when you emit one, reduce the count of the tasks that were waiting for it.''',
        r'''Use an explicit stack and a `seen` set for the graph walks: the test chains 3,000 tasks, which a recursive walk would overflow, and without `seen` a diamond shape is walked twice.''',
    ],
    explanation=r'''**The idea.** A dependency graph is a directed graph; a valid run order is a *topological order*. Kahn's algorithm builds it by repeatedly taking a task with nothing left to wait for.

```mermaid
flowchart LR
    build --> test --> deploy
    lint --> deploy
```

**Prevent the cycle, do not detect it later.** Checking at `depend` time ("can `on` already reach `task`?") keeps the graph always valid, so `order()` can never fail halfway. The alternative, accepting any edge and reporting a cycle when ordering, hands the caller a graph they cannot use.

**Determinism is a feature.** With a heap the answer is the same on every run and every machine. Build tools that pick "any ready task" produce different logs each time, which makes failures impossible to compare.

**Why the walks are iterative.** A recursive depth-first search is shorter to write, and fails on a long chain. In an interview, say that out loud.

**Complexity.** `order`: O((V + E) log V). `depend`: O(V + E). Queries: O(V + E).

**Going further.** Make `ready` fast for a graph of a million tasks: what do you keep so that finishing a task updates only its direct dependents?''',
),
]
