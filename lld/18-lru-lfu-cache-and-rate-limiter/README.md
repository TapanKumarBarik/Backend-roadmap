# Module 18: LRU/LFU Cache & Rate Limiter

## Why this matters

Three classic problems, back to the multi-problem format of modules
12–14 — but with a different question driving the design than any
module so far. For **LRU** and **LFU**, the requirement isn't a
behavior to model, it's a *complexity bound*: every operation must run
in O(1). No single data structure gets you there alone — a hash map
alone can't track recency or frequency order in O(1); a linked list
alone can't look up a key in O(1). The design is the combination. This
is the module where "what pattern applies here?" is the wrong first
question, and "what data structures, combined, give me the required
complexity?" is the right one. The **Rate Limiter** closes the module
with a smaller but genuine point: its clock is passed in as a
dependency rather than called directly, which is exactly what makes it
possible to test deterministically — a preview of module 19's
dependency-injection theme, arrived at here for a very concrete reason
(you cannot unit-test time-based behavior against the real clock).

---

## Problem 1: LRU Cache

### Requirements

**Functional**: a fixed-capacity cache supports `get(key)` (returns
the value, or "miss") and `put(key, value)`. Every access to a key
marks it as most-recently-used; when a `put` would exceed capacity,
the **least**-recently-used key is evicted.

**Non-functional**: both `get` and `put` must run in O(1) time.

**Assumptions stated up front** (module 11, step 1): keys and values
are simple comparable types (ints, in the examples below); capacity is
fixed at construction, not resizable.

### Entities and relationships

Applying module 11's steps 3–4: `LRUCache o-- Node` (composition, many
— each cached entry is one node in an internal doubly linked list);
`LRUCache --> Node` via a hash map for O(1) lookup (association, not
ownership duplication — the map and the list both reference the same
node objects, they don't hold separate copies).

### Class diagram

```
┌──────────────┐      ┌──────────────┐
│   LRUCache   │ o──  │     Node     │
├──────────────┤      ├──────────────┤
│ - capacity   │      │ - key, value │
│ - cache      │      │ - prev, next │
│ - head, tail │      └──────────────┘
├──────────────┤
│ + get()      │
│ + put()      │
└──────────────┘
```

### Implementation

The combination that makes O(1) possible: a **hash map** from key to
`Node` gives O(1) lookup; a **doubly linked list** of those same
`Node`s, ordered by recency, gives O(1) reordering (unlink + relink,
no shifting) and O(1) eviction (remove from the tail end). Neither
structure alone provides both lookup and order in O(1) — together they
do.

{{tabs}}
{{tab Python}}
```python
class Node:
    def __init__(self, key=None, value=None):
        self.key = key
        self.value = value
        self.prev: "Node | None" = None
        self.next: "Node | None" = None

class LRUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache: dict[int, Node] = {}
        self.head = Node()             # sentinel — most-recently-used side
        self.tail = Node()             # sentinel — least-recently-used side
        self.head.next = self.tail
        self.tail.prev = self.head

    def _remove(self, node: Node):
        node.prev.next = node.next
        node.next.prev = node.prev

    def _insert_at_front(self, node: Node):
        node.next = self.head.next
        node.prev = self.head
        self.head.next.prev = node
        self.head.next = node

    def get(self, key: int) -> "int | None":
        if key not in self.cache:
            return None
        node = self.cache[key]
        self._remove(node)
        self._insert_at_front(node)     # touched — now most recently used
        return node.value

    def put(self, key: int, value: int):
        if key in self.cache:
            self._remove(self.cache[key])
        elif len(self.cache) >= self.capacity:
            lru = self.tail.prev                    # least-recently-used node
            self._remove(lru)
            del self.cache[lru.key]

        node = Node(key, value)
        self._insert_at_front(node)
        self.cache[key] = node

# usage
cache = LRUCache(2)
cache.put(1, 1)
cache.put(2, 2)
print(cache.get(1))    # 1 -> touches 1: order becomes 1(MRU), 2(LRU)
cache.put(3, 3)         # evicts 2 (LRU)
print(cache.get(2))    # None
cache.put(4, 4)         # evicts 1 (LRU)
print(cache.get(1))    # None
print(cache.get(3))    # 3
print(cache.get(4))    # 4
```
{{tab C#}}
```csharp
public class Node {
    public int Key, Value;
    public Node Prev, Next;
    public Node(int key = 0, int value = 0) { Key = key; Value = value; }
}

public class LRUCache {
    private int _capacity;
    private Dictionary<int, Node> _cache = new Dictionary<int, Node>();
    private Node _head = new Node();     // sentinel — most-recently-used side
    private Node _tail = new Node();     // sentinel — least-recently-used side

    public LRUCache(int capacity) {
        _capacity = capacity;
        _head.Next = _tail;
        _tail.Prev = _head;
    }

    private void Remove(Node node) {
        node.Prev.Next = node.Next;
        node.Next.Prev = node.Prev;
    }

    private void InsertAtFront(Node node) {
        node.Next = _head.Next;
        node.Prev = _head;
        _head.Next.Prev = node;
        _head.Next = node;
    }

    public int? Get(int key) {
        if (!_cache.TryGetValue(key, out var node)) return null;
        Remove(node);
        InsertAtFront(node);              // touched — now most recently used
        return node.Value;
    }

    public void Put(int key, int value) {
        if (_cache.TryGetValue(key, out var existing)) {
            Remove(existing);
        } else if (_cache.Count >= _capacity) {
            var lru = _tail.Prev;                     // least-recently-used node
            Remove(lru);
            _cache.Remove(lru.Key);
        }

        var node = new Node(key, value);
        InsertAtFront(node);
        _cache[key] = node;
    }
}

// usage
var cache = new LRUCache(2);
cache.Put(1, 1);
cache.Put(2, 2);
Console.WriteLine(cache.Get(1));      // 1 -> touches 1: order becomes 1(MRU), 2(LRU)
cache.Put(3, 3);                       // evicts 2
Console.WriteLine(cache.Get(2));      // null
cache.Put(4, 4);                       // evicts 1
Console.WriteLine(cache.Get(1));      // null
Console.WriteLine(cache.Get(3));      // 3
Console.WriteLine(cache.Get(4));      // 4
```
{{/tabs}}

### Tradeoffs and extensions

- **Sentinel `head`/`tail` nodes remove every "is this the first/last
  node?" edge case** from `_remove`/`Remove` and
  `_insert_at_front`/`InsertAtFront` — every real node always has a
  genuine `prev` and `next` to relink, even at the boundaries. This is
  a small technique worth naming: it trades two always-allocated dummy
  nodes for the removal of an entire class of off-by-one bugs.
- **The hash map stores `Node` references, not copies** — `cache` and
  the linked list both point at the *same* objects, so moving a node
  in the list is instantly visible through the map with no
  synchronization needed between two data structures pretending to be
  independent.

---

## Problem 2: LFU Cache

### Requirements

**Functional**: like LRU, but eviction is driven by **access
frequency** instead of recency — the **least**-frequently-used key is
evicted on overflow. Ties (multiple keys at the same minimum
frequency) are broken by recency: the least-recently-used key *among*
the tied minimum-frequency keys is evicted.

**Non-functional**: both `get` and `put` must run in O(1) time — same
bound as LRU, harder to hit because frequency introduces a second
ordering dimension.

**Assumptions**: same as LRU — simple key/value types, fixed capacity;
a `capacity` of 0 means every `put` is a no-op (named edge case, tested
below).

### Class diagram

```
┌─────────────────────┐
│       LFUCache      │
├─────────────────────┤
│ - capacity, minFreq │
│ - keyToValue        │
│ - keyToFreq         │
│ - freqToKeys        │
├─────────────────────┤
│ + get()             │
│ + put()             │
└─────────────────────┘
```

### Implementation

The idea that makes O(1) possible here: instead of one ordered
structure, keep **one ordered structure per frequency**. `freqToKeys`
maps each frequency to an ordered collection of the keys currently at
that frequency (oldest-touched first) — an LRU list *within* each
frequency bucket. Tracking `minFreq` separately means eviction never
has to search for the minimum; it's always known.

{{tabs}}
{{tab Python}}
```python
from collections import OrderedDict, defaultdict

class LFUCache:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.min_freq = 0
        self.key_to_value: dict[int, int] = {}
        self.key_to_freq: dict[int, int] = {}
        self.freq_to_keys: dict[int, OrderedDict] = defaultdict(OrderedDict)   # freq -> keys, insertion order = recency

    def _bump_freq(self, key: int):
        freq = self.key_to_freq[key]
        del self.freq_to_keys[freq][key]
        if not self.freq_to_keys[freq] and self.min_freq == freq:
            self.min_freq += 1
        self.key_to_freq[key] = freq + 1
        self.freq_to_keys[freq + 1][key] = None

    def get(self, key: int) -> "int | None":
        if key not in self.key_to_value:
            return None
        self._bump_freq(key)
        return self.key_to_value[key]

    def put(self, key: int, value: int):
        if self.capacity == 0:
            return
        if key in self.key_to_value:
            self.key_to_value[key] = value
            self._bump_freq(key)
            return

        if len(self.key_to_value) >= self.capacity:
            evict_key, _ = self.freq_to_keys[self.min_freq].popitem(last=False)   # least-recently-used at min frequency
            del self.key_to_value[evict_key]
            del self.key_to_freq[evict_key]

        self.key_to_value[key] = value
        self.key_to_freq[key] = 1
        self.freq_to_keys[1][key] = None
        self.min_freq = 1

# usage
cache = LFUCache(2)
cache.put(1, 1)
cache.put(2, 2)
print(cache.get(1))    # 1 -> freq(1)=2, freq(2)=1
cache.put(3, 3)         # evicts key 2 (min freq, only key there)
print(cache.get(2))    # None
print(cache.get(3))    # 3 -> freq(3)=2
cache.put(4, 4)         # freq(1)=2, freq(3)=2 tie -> evicts 1 (touched before 3)
print(cache.get(1))    # None
print(cache.get(3))    # 3
print(cache.get(4))    # 4
```
{{tab C#}}
```csharp
public class LFUCache {
    private int _capacity;
    private int _minFreq;
    private Dictionary<int, int> _keyToValue = new Dictionary<int, int>();
    private Dictionary<int, int> _keyToFreq = new Dictionary<int, int>();
    private Dictionary<int, LinkedList<int>> _freqToKeys = new Dictionary<int, LinkedList<int>>();
    private Dictionary<int, LinkedListNode<int>> _keyToNode = new Dictionary<int, LinkedListNode<int>>();

    public LFUCache(int capacity) { _capacity = capacity; }

    private LinkedList<int> GetFreqList(int freq) {
        if (!_freqToKeys.TryGetValue(freq, out var list)) {
            list = new LinkedList<int>();
            _freqToKeys[freq] = list;
        }
        return list;
    }

    private void BumpFreq(int key) {
        int freq = _keyToFreq[key];
        var oldList = _freqToKeys[freq];
        oldList.Remove(_keyToNode[key]);
        if (oldList.Count == 0 && _minFreq == freq) _minFreq++;

        _keyToFreq[key] = freq + 1;
        var newList = GetFreqList(freq + 1);
        _keyToNode[key] = newList.AddLast(key);
    }

    public int? Get(int key) {
        if (!_keyToValue.ContainsKey(key)) return null;
        BumpFreq(key);
        return _keyToValue[key];
    }

    public void Put(int key, int value) {
        if (_capacity == 0) return;
        if (_keyToValue.ContainsKey(key)) {
            _keyToValue[key] = value;
            BumpFreq(key);
            return;
        }

        if (_keyToValue.Count >= _capacity) {
            var minList = _freqToKeys[_minFreq];
            int evictKey = minList.First.Value;          // least-recently-used at min frequency
            minList.RemoveFirst();
            _keyToValue.Remove(evictKey);
            _keyToFreq.Remove(evictKey);
            _keyToNode.Remove(evictKey);
        }

        _keyToValue[key] = value;
        _keyToFreq[key] = 1;
        _keyToNode[key] = GetFreqList(1).AddLast(key);
        _minFreq = 1;
    }
}

// usage
var cache = new LFUCache(2);
cache.Put(1, 1);
cache.Put(2, 2);
Console.WriteLine(cache.Get(1));      // 1 -> freq(1)=2, freq(2)=1
cache.Put(3, 3);                       // evicts key 2 (min freq, only key there)
Console.WriteLine(cache.Get(2));      // null
Console.WriteLine(cache.Get(3));      // 3 -> freq(3)=2
cache.Put(4, 4);                       // freq(1)=2, freq(3)=2 tie -> evicts 1 (touched before 3)
Console.WriteLine(cache.Get(1));      // null
Console.WriteLine(cache.Get(3));      // 3
Console.WriteLine(cache.Get(4));      // 4
```
{{/tabs}}

### Tradeoffs and extensions

- **`minFreq` is tracked incrementally, never recomputed by scanning.**
  It only ever increases by 1 at a time (when a key's old frequency
  bucket empties out) or resets to 1 (on a fresh insert) — an O(n)
  "find the minimum" scan would silently break the O(1) requirement
  this whole design exists to satisfy.
- **Frequency ties are broken by recency, using the exact same
  ordered-collection technique as the LRU cache above** — this is
  effectively "an LRU cache per frequency bucket." Problem 2 doesn't
  introduce a new eviction-ordering idea, it reuses Problem 1's inside
  each bucket.
- **Python's `OrderedDict` and C#'s `LinkedList<T>` +
  node-reference-map play the same role as `LRUCache`'s hand-rolled
  doubly linked list** — `OrderedDict` already *is* a hash-map-plus-
  order structure, so Python gets it from the standard library, while
  C# needs the explicit `LinkedList<int>` + `Dictionary<int,
  LinkedListNode<int>>` pairing to get the same O(1) guarantees.

---

## Problem 3: Rate Limiter

### Requirements

**Functional**: given a maximum request rate, decide for each incoming
request whether to allow or reject it. Requests may burst up to a
capacity, then must wait for capacity to refill over time (token
bucket algorithm).

**Non-functional**: must be correct under concurrent callers (module
10); must be testable without depending on real wall-clock time or
`sleep`-based tests, which are slow and flaky.

**Assumptions stated up front** (module 11, step 1): a single shared
bucket per limiter instance (per-user or per-endpoint limiting is a
named extension); token refill is continuous (fractional tokens
accumulate between requests), not a fixed per-second reset.

### Class diagram

```
┌────────────────────────┐
│ TokenBucketRateLimiter │
├────────────────────────┤
│ - capacity             │
│ - refillRate           │
│ - tokens               │
│ - lastRefill           │
│ - clock                │
├────────────────────────┤
│ + allowRequest()       │
└────────────────────────┘
```

### Implementation

The clock is a constructor parameter, not a direct call to
`time.monotonic()`/`DateTime.Now` inside the class — this is
dependency injection (a preview of module 19) for a concrete reason:
the tests below drive a **fake clock** manually instead of sleeping in
real time, making the refill behavior deterministic and fast to test.

{{tabs}}
{{tab Python}}
```python
import threading
import time

class TokenBucketRateLimiter:
    def __init__(self, capacity: int, refill_rate_per_sec: float, clock=time.monotonic):
        self.capacity = capacity
        self.refill_rate = refill_rate_per_sec
        self._clock = clock                       # injected time source — swap for a fake clock in tests
        self._tokens = float(capacity)
        self._last_refill = self._clock()
        self._lock = threading.Lock()

    def _refill(self):
        now = self._clock()
        elapsed = now - self._last_refill
        self._tokens = min(self.capacity, self._tokens + elapsed * self.refill_rate)
        self._last_refill = now

    def allow_request(self) -> bool:
        with self._lock:                           # critical section: check-then-consume over shared token count
            self._refill()
            if self._tokens >= 1:
                self._tokens -= 1
                return True
            return False

# usage — with a fake, manually-advanced clock: deterministic, no real sleeping
class FakeClock:
    def __init__(self):
        self.now = 0.0
    def advance(self, seconds):
        self.now += seconds
    def __call__(self):
        return self.now

clock = FakeClock()
limiter = TokenBucketRateLimiter(capacity=3, refill_rate_per_sec=1.0, clock=clock)

print(limiter.allow_request())   # True
print(limiter.allow_request())   # True
print(limiter.allow_request())   # True
print(limiter.allow_request())   # False -> bucket empty, no time has passed

clock.advance(1.0)                # 1 second passes -> 1 token refills
print(limiter.allow_request())   # True
print(limiter.allow_request())   # False
```
{{tab C#}}
```csharp
public class TokenBucketRateLimiter {
    private int _capacity;
    private double _refillRatePerSec;
    private Func<double> _clock;               // injected time source — swap for a fake clock in tests
    private double _tokens;
    private double _lastRefill;
    private readonly object _lock = new object();

    public TokenBucketRateLimiter(int capacity, double refillRatePerSec, Func<double> clock) {
        _capacity = capacity;
        _refillRatePerSec = refillRatePerSec;
        _clock = clock;
        _tokens = capacity;
        _lastRefill = clock();
    }

    private void Refill() {
        double now = _clock();
        double elapsed = now - _lastRefill;
        _tokens = Math.Min(_capacity, _tokens + elapsed * _refillRatePerSec);
        _lastRefill = now;
    }

    public bool AllowRequest() {
        lock (_lock) {                          // critical section: check-then-consume over the shared token count
            Refill();
            if (_tokens >= 1) {
                _tokens -= 1;
                return true;
            }
            return false;
        }
    }
}

// usage — with a fake, manually-advanced clock: deterministic, no real sleeping
public class FakeClock {
    public double Now = 0.0;
    public void Advance(double seconds) => Now += seconds;
    public double Get() => Now;
}

var clock = new FakeClock();
var limiter = new TokenBucketRateLimiter(capacity: 3, refillRatePerSec: 1.0, clock: clock.Get);

Console.WriteLine(limiter.AllowRequest());  // true
Console.WriteLine(limiter.AllowRequest());  // true
Console.WriteLine(limiter.AllowRequest());  // true
Console.WriteLine(limiter.AllowRequest());  // false — bucket empty

clock.Advance(1.0);                          // 1 second passes -> 1 token refills
Console.WriteLine(limiter.AllowRequest());  // true
Console.WriteLine(limiter.AllowRequest());  // false
```
{{/tabs}}

### Tradeoffs and extensions

- **The clock is injected, not hardcoded** — the single design choice
  that makes this class testable at all without real `sleep` calls in
  the test suite. This is dependency injection earning its keep for a
  concrete reason, ahead of module 19's fuller treatment of the idea.
- **The lock protects the same check-then-consume shape every
  concurrency-critical module in this track has used** (`Level.
  find_and_assign`, `Show.book_seats`, `RideManager`'s driver match):
  refill-then-check-then-decrement happens inside one locked method,
  never split across calls a race could interleave.
- **Token bucket vs. fixed window**: a simpler "reset counter every N
  seconds" rate limiter is easier to implement but allows a burst of
  `2×limit` requests right at a window boundary (a flood just before
  the reset, followed immediately by another flood just after). Token
  bucket's continuous refill avoids that edge case — named here as the
  reason to prefer it, not just an arbitrary implementation choice.
- **One bucket per limiter instance is a named simplification** — a
  real API gateway keys a separate bucket per user or per endpoint
  (extension: wrap this class in a `dict[key, TokenBucketRateLimiter]`
  keyed by whatever dimension needs independent limits).

## Hands-on exercises

### 1. LRU: verify O(1) is really being achieved

Add a counter to `_remove`/`Remove` and
`_insert_at_front`/`InsertAtFront` that counts how many nodes each call
touches. Confirm it's always a small constant, regardless of cache
size — never proportional to the number of cached entries.

### 2. LFU: handle the zero-capacity edge case explicitly

Confirm (or add a test proving) that `LFUCache(0)` makes every `put` a
no-op and every `get` a miss, without raising an error.

### 3. LFU: implement `get_frequency(key)`

Add a debug method returning a key's current access frequency, useful
for writing your own tie-breaking tests.

### 4. Rate limiter: implement a fixed-window variant

Implement `FixedWindowRateLimiter` (reset a counter every N seconds
instead of continuous refill), and write a test using the same
fake-clock technique that demonstrates the boundary-burst problem named
in the tradeoffs above — a flood of requests right before a window
reset, followed by another flood right after.

### 5. Rate limiter: per-key limiting

Wrap `TokenBucketRateLimiter` in a class that maintains one bucket per
key (e.g., per user ID), creating buckets lazily on first use, all
sharing the same capacity and refill rate.

## Independent challenge

No code given.

**Task:** Implement an **LRU cache with per-entry TTL (time-to-live)**.
Each `put(key, value, ttl_seconds)` should make the entry inaccessible
via `get` once `ttl_seconds` have elapsed, *in addition to* normal
LRU eviction on capacity overflow — whichever happens first. Use the
same injected-clock technique as the rate limiter for testability
(don't call the real clock directly inside the cache). Confirm a key
that's still within capacity but past its TTL returns a miss, and a
key that's evicted for capacity reasons is unaffected by whether its
TTL had expired.

<details>
<summary>Hint</summary>

Store an expiry timestamp (`clock() + ttl_seconds`) alongside each
`Node`'s key/value. On `get`, before doing the normal recency-touch
logic, check whether `clock() >= expiry` for that node — if so, treat
it exactly like a miss (and evict the node, since it's now known to be
dead weight) instead of touching it as most-recently-used. TTL
expiry and LRU capacity eviction are two independent removal reasons
that both operate on the same underlying node/map structure — they
don't need to know about each other.

</details>

## Common mistakes & troubleshooting

- **Using a plain (singly linked or array-backed) list for LRU
  ordering.** Removing an arbitrary node from an array means shifting
  every element after it — O(n), not O(1). The doubly linked list is
  what makes removal from the middle O(1); losing that is the most
  common way this problem's complexity requirement quietly breaks.
- **Forgetting sentinel nodes and hand-rolling null checks for
  "is this the head/tail?"** at every `_remove`/`_insert_at_front`
  call site. This is exactly the class of edge-case bug sentinels are
  designed to eliminate — every real node always has a genuine
  neighbor to relink.
- **LFU: recomputing `min_freq` by scanning all frequencies** instead
  of tracking it incrementally. This silently turns an O(1) operation
  into O(n) (or O(number of distinct frequencies)) and defeats the
  entire point of the design.
- **LFU: forgetting the frequency-tie-breaks-by-recency rule**, and
  evicting an arbitrary key at the minimum frequency instead of the
  least-recently-used one among them. This is the detail that makes
  LFU meaningfully different from "just group by frequency."
- **Rate limiter: calling the real clock directly inside the class**
  instead of accepting it as a parameter. This makes correct,
  deterministic tests of time-based behavior effectively impossible
  without slow, flaky `sleep`-based tests.

## Checkpoint quiz

1. Why does LRU need *both* a hash map and a doubly linked list —
   what does each one provide that the other can't?
2. Why are `head`/`tail` sentinel nodes used instead of letting
   `head`/`tail` be `None` when the list is empty?
3. Why is `min_freq` tracked incrementally in LFU instead of
   recomputed on demand?
4. What extra rule does LFU apply that a plain "group keys by
   frequency" design would miss?
5. Why is the rate limiter's clock passed in as a parameter instead of
   called directly inside the class?

<details>
<summary>Answers</summary>

1. The hash map gives O(1) lookup from key to node but has no
   intrinsic ordering; the doubly linked list gives O(1) reordering
   and O(1) removal from either end but has no O(1) lookup by key.
   Combined, a `get` can find a node instantly (map) and re-position it
   instantly (list) — neither structure alone provides both.
2. So every real node always has a genuine `prev` and `next` to relink
   against, even when inserting into an empty list or removing the
   only node. Without sentinels, every removal/insertion site would
   need special-case branches for "is this the first or last real
   node?" — a common source of off-by-one bugs.
3. Because recomputing it by scanning every frequency bucket would be
   O(n) (or O(distinct frequencies)) per operation, breaking the O(1)
   requirement the entire design exists to satisfy. Incrementally, it
   only ever increases by 1 (when a bucket empties) or resets to 1 (on
   a fresh insert) — both O(1) updates.
4. Breaking ties among multiple keys at the minimum frequency by
   recency — evicting the least-recently-used key *among* the
   minimum-frequency keys, not an arbitrary one. Without this, "LFU"
   would just be "group by frequency, evict something," which isn't
   the specified behavior.
5. So the class can be tested deterministically with a fake,
   manually-advanced clock instead of real `sleep` calls — dependency
   injection (previewed here, covered fully in module 19) applied for
   the concrete reason that time-based logic is otherwise very hard to
   test reliably and quickly.

</details>

## Interview questions

1. **"How would you implement an LRU cache with O(1) get and put?"**
   A hash map from key to node for O(1) lookup, combined with a
   doubly linked list (with sentinel head/tail nodes) ordered by
   recency for O(1) reordering and O(1) eviction from the
   least-recently-used end. Neither structure alone achieves both
   requirements; the combination does.
2. **"How is an LFU cache different from an LRU cache, and how do you
   still get O(1)?"**
   LFU evicts by access frequency instead of recency, with ties broken
   by recency. O(1) comes from keeping one ordered (LRU-style)
   structure *per frequency bucket*, plus an incrementally-tracked
   `minFreq` so the eviction target is always known without scanning.
3. **"Walk me through the token bucket algorithm."**
   A bucket holds up to `capacity` tokens, refilling continuously at
   `refillRate` tokens per second based on elapsed time since the last
   check. Each allowed request consumes one token; a request is
   rejected if fewer than one token is available. This permits bursts
   up to the bucket's capacity while enforcing a long-run average rate.
4. **"Why prefer token bucket over a simple fixed-window counter for
   rate limiting?"**
   A fixed window (reset a counter every N seconds) allows up to
   `2×limit` requests clustered right around a window boundary — a
   flood just before reset, immediately followed by another flood just
   after. Token bucket's continuous refill has no such boundary to
   exploit.
5. **"How would you test time-dependent logic like a rate limiter
   without making the test suite slow or flaky?"**
   Inject the time source as a constructor parameter instead of calling
   the real clock directly inside the class, then drive a fake,
   manually-advanced clock in tests — deterministic and instant, with
   no real `sleep` calls involved.

## Further reading & sources

- [LeetCode 146: LRU Cache](https://leetcode.com/problems/lru-cache/) - the canonical version of Problem 1, useful for timed practice after working through this module.
- [LeetCode 460: LFU Cache](https://leetcode.com/problems/lfu-cache/) - the canonical version of Problem 2, including the exact tie-breaking rule implemented here.
- [Token bucket (Wikipedia)](https://en.wikipedia.org/wiki/Token_bucket) - the general algorithm Problem 3 implements, including the burst-vs-average-rate tradeoff discussed above.

## Next

[19-api-library-design-and-di](../19-api-library-design-and-di/README.md)
— designing a clean, versioned, fluent public API/SDK, and applying
dependency injection for testability (the theme this module's rate
limiter previewed).
