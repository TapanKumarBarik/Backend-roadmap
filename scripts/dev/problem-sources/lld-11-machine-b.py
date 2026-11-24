PROBLEMS = [
P(
    slug='lld-snake-game', title='Snake Game', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/14-tic-tac-toe-and-chess/README.md',
    description='Build the Snake game engine: moves, growth when eating, wall and self collisions, and the tail that moves out of the way.',
    statement=r'''Write a class `Snake` for a board with `height` rows and `width` columns. Cells are `(row, col)`, with `(0, 0)` at the top left.

**Creating one:** `Snake(width, height, food)`. The snake starts with **length 1** at `(0, 0)`. `food` is a list of cells; **one piece is on the board at a time**, in the order of the list, and the next piece appears as soon as the current one is eaten. After the last piece there is no food.

**Methods and properties**

- `move(direction)` moves the head one cell: `"U"` (row - 1), `"D"` (row + 1), `"L"` (col - 1) or `"R"` (col + 1). Anything else raises `ValueError("Bad direction")`. It returns the **score** after the move (the number of pieces eaten), or `-1` when the game is over.
- `score` is the number of pieces eaten.
- `body` is the list of the snake's cells, **head first**.
- `food` is the cell of the current piece, or `None`.
- `over` is `True` after a collision.

**Rules**

- If the new head is on the current food, the snake **grows**: the tail stays where it is and the score goes up by one.
- Otherwise the tail **moves out of the way first**, so the head may move into the cell the tail is leaving.
- The head leaving the board, or landing on any other part of the body, ends the game: that `move` returns `-1`. The body does not change on that move, and every later `move` also returns `-1` (after checking the direction).

**Example**

```
game = Snake(3, 2, [(1, 2), (0, 1)])
game.move("R")     # 0
game.move("D")     # 0
game.move("R")     # 1   ate the first piece
game.move("U")     # 1
game.move("L")     # 2   ate the second piece
game.move("U")     # -1  off the board
```''',
    starter=r'''class Snake:
    def __init__(self, width, height, food):
        ...

    @property
    def score(self):
        ...

    @property
    def body(self):
        ...

    @property
    def food(self):
        ...

    @property
    def over(self):
        ...

    def move(self, direction):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
game = Snake(3, 2, [(1, 2), (0, 1)])
assert game.body == [(0, 0)] and game.food == (1, 2) and game.score == 0 and game.over is False
assert error_of(game.move, "X") == "ValueError: Bad direction"
assert game.move("R") == 0 and game.body == [(0, 1)]
assert game.move("D") == 0 and game.body == [(1, 1)]
assert game.move("R") == 1 and game.body == [(1, 2), (1, 1)] and game.food == (0, 1)
assert game.move("U") == 1 and game.body == [(0, 2), (1, 2)]
assert game.move("L") == 2 and game.body == [(0, 1), (0, 2), (1, 2)] and game.food is None
assert game.move("U") == -1 and game.over is True
assert game.body == [(0, 1), (0, 2), (1, 2)] and game.score == 2
assert game.move("D") == -1 and game.move("L") == -1
assert error_of(game.move, "?") == "ValueError: Bad direction"
loop = Snake(3, 3, [(0, 1), (0, 2), (1, 2)])
assert loop.move("R") == 1 and loop.move("R") == 2 and loop.move("D") == 3
assert loop.body == [(1, 2), (0, 2), (0, 1), (0, 0)]
assert loop.move("L") == 3 and loop.body == [(1, 1), (1, 2), (0, 2), (0, 1)]
assert loop.move("U") == 3 and loop.body == [(0, 1), (1, 1), (1, 2), (0, 2)]
assert loop.move("R") == 3 and loop.body == [(0, 2), (0, 1), (1, 1), (1, 2)]
assert loop.move("L") == -1 and loop.over is True and loop.body == [(0, 2), (0, 1), (1, 1), (1, 2)]
edge = Snake(2, 2, [])
assert edge.move("L") == -1 and edge.body == [(0, 0)]
tight = Snake(1, 3, [(1, 0)])
assert tight.move("D") == 1 and tight.body == [(1, 0), (0, 0)]
assert tight.move("U") == 1 and tight.body == [(0, 0), (1, 0)]
assert tight.move("D") == 1
solo = Snake(2, 1, [(0, 1)])
assert solo.move("R") == 1 and solo.body == [(0, 1), (0, 0)]
assert solo.move("L") == 1 and solo.body == [(0, 0), (0, 1)]
assert solo.move("R") == 1 and solo.move("R") == -1''',
    solution=r'''from collections import deque


class Snake:
    _STEPS = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}

    def __init__(self, width, height, food):
        self._width = width
        self._height = height
        self._food = list(food)
        self._eaten = 0
        self._body = deque([(0, 0)])
        self._over = False

    @property
    def score(self):
        return self._eaten

    @property
    def body(self):
        return list(self._body)

    @property
    def food(self):
        return self._food[self._eaten] if self._eaten < len(self._food) else None

    @property
    def over(self):
        return self._over

    def move(self, direction):
        if direction not in self._STEPS:
            raise ValueError("Bad direction")
        if self._over:
            return -1
        d_row, d_col = self._STEPS[direction]
        row, col = self._body[0][0] + d_row, self._body[0][1] + d_col
        head = (row, col)
        if not (0 <= row < self._height and 0 <= col < self._width):
            self._over = True
            return -1
        eating = head == self.food
        occupied = list(self._body) if eating else list(self._body)[:-1]
        if head in occupied:
            self._over = True
            return -1
        self._body.appendleft(head)
        if eating:
            self._eaten += 1
        else:
            self._body.pop()
        return self._eaten''',
    hints=[
        r'''Keep the body as a `deque` of cells, head first. A normal move adds the new head to the front and drops the last cell; eating adds the head and keeps the tail.''',
        r'''The collision test is the trap. When you are **not** eating, the tail leaves this turn, so it is not an obstacle: compare the new head against the body *without* its last cell. When you are eating the tail stays, so compare against the whole body.''',
        r'''Check the wall and the body *before* changing anything, so a losing move leaves `body` as it was. Remember to validate the direction first, even after the game is over.''',
    ],
    explanation=r'''**The idea.** The snake is a queue of cells: a new head joins the front, the old tail leaves the back. Moving is *push front, pop back*; growing is *push front* only. A `deque` does both ends in O(1).

**The tail trap.** The snake of length 4 chasing its own tail is legal: when the head steps onto the cell the tail occupies, the tail has just moved on. If you test the new head against the full body *before* removing the tail, you reject legal moves; if you remove the tail first and then eat, you lose a segment. The cleanest order is to decide *eating or not* first, then compare with the right set of cells.

```mermaid
flowchart TD
    A[compute the new head] --> B{inside the board?}
    B -- no --> X[game over]
    B -- yes --> C{head on the food?}
    C -- yes --> D[obstacles = whole body]
    C -- no --> E[obstacles = body without the tail]
    D --> F{head in obstacles?}
    E --> F
    F -- yes --> X
    F -- no --> G[push the head, pop the tail unless eating]
```

**State that is derived.** `food` is computed from the score and the list, so there is no second index to keep in step. The same idea made `state` a property in the vending machine.

**Complexity.** O(length) per move here because of the membership test; keeping a `set` of occupied cells makes it O(1).

**Going further.** Keep a `set` next to the `deque`. Which two operations must update both, and in which order?''',
),

P(
    slug='lld-leaderboard', title='Leaderboard', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/21-lld-interview-playbook/README.md',
    description='Build a game leaderboard with accumulating scores, ties that share a rank, a top list and the players around you.',
    statement=r'''Write a class `Leaderboard` of players with integer scores.

**Methods**

- `add(player, points)` adds `points` (an `int`, which may be negative) to the player's score; a new player starts at `0`. A `points` that is not an `int` (a `bool` is not) raises `ValueError("Points must be a whole number")`.
- `remove(player)` deletes a player. An unknown player raises `ValueError("Unknown player")`.
- `score(player)` is the player's score (`ValueError("Unknown player")` for an unknown one).
- `top(k)` returns the best `k` players as `(player, score)`, highest score first; players with equal scores are ordered by name. It returns fewer if there are not `k` players. A `k` below 1 raises `ValueError("k must be positive")`.
- `rank(player)` is the player's place, starting at `1`. Players with the **same score share a rank**, and the next rank skips the shared places (scores `90, 80, 80, 70` have ranks `1, 2, 2, 4`). Unknown player: `ValueError("Unknown player")`.
- `around(player, n)` returns the players from `n` places above to `n` places below the given player in the **`top` order** (clipped at both ends) as `(rank, player, score)` triples.

**Example**

```
board = Leaderboard()
for name, points in [("ann", 90), ("bob", 80), ("cy", 80), ("di", 70)]:
    board.add(name, points)
board.rank("cy")        # 2
board.rank("di")        # 4
board.top(2)            # [("ann", 90), ("bob", 80)]
```''',
    starter=r'''class Leaderboard:
    def add(self, player, points):
        ...

    def remove(self, player):
        ...

    def score(self, player):
        ...

    def top(self, k):
        ...

    def rank(self, player):
        ...

    def around(self, player, n):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
board = Leaderboard()
assert board.top(3) == []
assert error_of(board.top, 0) == "ValueError: k must be positive"
assert error_of(board.rank, "x") == "ValueError: Unknown player"
assert error_of(board.score, "x") == "ValueError: Unknown player"
assert error_of(board.remove, "x") == "ValueError: Unknown player"
assert error_of(board.around, "x", 1) == "ValueError: Unknown player"
assert error_of(board.add, "ann", 1.5) == "ValueError: Points must be a whole number"
assert error_of(board.add, "ann", True) == "ValueError: Points must be a whole number"
assert error_of(board.score, "ann") == "ValueError: Unknown player"
for name, points in [("di", 70), ("cy", 80), ("ann", 90), ("bob", 80)]:
    board.add(name, points)
assert board.top(10) == [("ann", 90), ("bob", 80), ("cy", 80), ("di", 70)]
assert board.top(2) == [("ann", 90), ("bob", 80)]
assert [board.rank(p) for p in ("ann", "bob", "cy", "di")] == [1, 2, 2, 4]
board.add("di", 10)
assert board.score("di") == 80 and board.rank("di") == 2
assert board.top(4) == [("ann", 90), ("bob", 80), ("cy", 80), ("di", 80)]
board.add("di", -50)
assert board.score("di") == 30 and board.rank("di") == 4
board.add("zed", 0)
assert board.rank("zed") == 5 and board.top(10)[-1] == ("zed", 0)
board.add("neg", -5)
assert board.rank("neg") == 6 and board.score("neg") == -5
board.remove("neg")
assert error_of(board.rank, "neg") == "ValueError: Unknown player"
assert board.rank("zed") == 5
assert board.around("cy", 1) == [(2, "bob", 80), (2, "cy", 80), (4, "di", 30)]
assert board.around("ann", 1) == [(1, "ann", 90), (2, "bob", 80)]
assert board.around("zed", 2) == [(2, "cy", 80), (4, "di", 30), (5, "zed", 0)]
assert board.around("bob", 0) == [(2, "bob", 80)]
assert len(board.around("bob", 100)) == 5
board.remove("ann")
assert board.rank("bob") == 1 and board.top(1) == [("bob", 80)]
many = Leaderboard()
for i in range(3000):
    many.add("p" + str(i).zfill(4), i % 100)
assert many.rank("p0099") == 1 and many.top(1)[0][1] == 99
assert many.rank("p0000") == 2971''',
    solution=r'''class Leaderboard:
    def __init__(self):
        self._scores = {}

    def _require(self, player):
        if player not in self._scores:
            raise ValueError("Unknown player")

    def add(self, player, points):
        if type(points) is not int:
            raise ValueError("Points must be a whole number")
        self._scores[player] = self._scores.get(player, 0) + points

    def remove(self, player):
        self._require(player)
        del self._scores[player]

    def score(self, player):
        self._require(player)
        return self._scores[player]

    def _ordered(self):
        return sorted(self._scores.items(), key=lambda item: (-item[1], item[0]))

    def top(self, k):
        if k < 1:
            raise ValueError("k must be positive")
        return self._ordered()[:k]

    def rank(self, player):
        self._require(player)
        mine = self._scores[player]
        return 1 + sum(1 for value in self._scores.values() if value > mine)

    def around(self, player, n):
        self._require(player)
        ordered = self._ordered()
        index = [name for name, _ in ordered].index(player)
        window = ordered[max(0, index - n):index + n + 1]
        return [(self.rank(name), name, value) for name, value in window]''',
    hints=[
        r'''Store one dictionary from player to score. Everything else (`top`, `rank`, `around`) is computed from it, so it can never disagree with the scores.''',
        r'''The order is "score descending, then name ascending": sort with the key `(-score, name)`. The **rank** of a player is one plus the number of players with a *strictly higher* score; that gives ties the same rank and skips the places after them for free.''',
        r'''`around` is a slice of the sorted list from `index - n` to `index + n`, with the start clipped at 0 (a negative start would wrap around and return the wrong players).''',
    ],
    explanation=r'''**The idea.** The score table is the only fact; ranking is a *view* on it. That is why `rank` is "one plus how many are strictly better", not a stored number that every `add` must repair.

**Ranks with ties.** This is called *competition ranking* (1, 2, 2, 4). The other common scheme, *dense ranking*, gives 1, 2, 2, 3. A good interview answer asks which one the product wants before writing code, because the data structure does not change but the formula does.

**Deterministic order.** Sorting by score alone leaves ties in whatever order the dictionary happened to be in. Adding the name to the sort key makes `top` and `around` repeatable, which is what makes them testable (and what players expect to see on a screen).

**Slicing trap.** `ordered[index - n:...]` with `index - n < 0` starts from the *end* of the list. Clip the start with `max(0, ...)`.

**Complexity.** This version sorts per call: O(n log n) for `top` and `around`, O(n) for `rank`. That is fine for thousands of players. For millions you would keep a balanced tree or a skip list (this is how Redis sorted sets work) to get O(log n) for all three.

**Going further.** Sketch the sorted structure you would need for O(log n) `rank`. What does each node have to store besides its score?''',
),

P(
    slug='lld-pubsub-broker', title='Publish-Subscribe Broker', topic='lld-machine-coding', difficulty='advanced',
    module='lld/21-lld-interview-playbook/README.md',
    description='Build a message broker where subscribers pull messages at their own pace and the broker forgets what everyone has already read.',
    statement=r'''Write a class `Broker` that moves messages from publishers to subscribers through named **topics**.

**Methods**

- `create_topic(name)` makes a topic. A name that exists raises `ValueError("Topic exists")`.
- `subscribe(topic, subscriber)` starts a subscription. The subscriber receives only the messages published **after** this call. Subscribing twice raises `ValueError("Already subscribed")`.
- `unsubscribe(topic, subscriber)` ends it (`ValueError("Not subscribed")` if there is none). Subscribing again later starts fresh: old messages are not replayed.
- `publish(topic, message)` adds a message and returns its **sequence number** in that topic (`1, 2, 3, ...`, never reused).
- `poll(topic, subscriber, limit=10)` returns the subscriber's next undelivered messages, **oldest first**, at most `limit`, and marks them delivered (they are not returned again). `ValueError("Not subscribed")` if there is no subscription.
- `backlog(topic, subscriber)` is how many messages that subscriber has not yet polled.
- `retained(topic)` is how many messages the broker is still **storing**: a message is kept only while at least one subscriber has not polled it. With no subscribers nothing is kept.

An unknown topic raises `ValueError("Unknown topic")` in every method except `create_topic`. Check the topic **before** the subscription.

**Example**

```
broker = Broker()
broker.create_topic("news")
broker.subscribe("news", "ann")
broker.publish("news", "hello")        # 1
broker.subscribe("news", "bob")        # bob does not see "hello"
broker.publish("news", "world")        # 2
broker.poll("news", "bob")             # ["world"]
broker.poll("news", "ann", limit=1)    # ["hello"]
broker.retained("news")                # 1   only "world" is still needed (ann has not read it)
```''',
    starter=r'''class Broker:
    def create_topic(self, name):
        ...

    def subscribe(self, topic, subscriber):
        ...

    def unsubscribe(self, topic, subscriber):
        ...

    def publish(self, topic, message):
        ...

    def poll(self, topic, subscriber, limit=10):
        ...

    def backlog(self, topic, subscriber):
        ...

    def retained(self, topic):
        ...''',
    tests=r'''def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
broker = Broker()
assert error_of(broker.publish, "news", "x") == "ValueError: Unknown topic"
assert error_of(broker.subscribe, "news", "ann") == "ValueError: Unknown topic"
assert error_of(broker.poll, "news", "ann") == "ValueError: Unknown topic"
assert error_of(broker.retained, "news") == "ValueError: Unknown topic"
broker.create_topic("news")
assert error_of(broker.create_topic, "news") == "ValueError: Topic exists"
assert error_of(broker.poll, "news", "ann") == "ValueError: Not subscribed"
assert error_of(broker.unsubscribe, "news", "ann") == "ValueError: Not subscribed"
assert error_of(broker.backlog, "news", "ann") == "ValueError: Not subscribed"
assert broker.publish("news", "lost") == 1
assert broker.retained("news") == 0
broker.subscribe("news", "ann")
assert error_of(broker.subscribe, "news", "ann") == "ValueError: Already subscribed"
assert broker.publish("news", "hello") == 2
broker.subscribe("news", "bob")
assert broker.publish("news", "world") == 3
assert broker.backlog("news", "ann") == 2 and broker.backlog("news", "bob") == 1
assert broker.retained("news") == 2
assert broker.poll("news", "bob") == ["world"]
assert broker.backlog("news", "bob") == 0 and broker.retained("news") == 2
assert broker.poll("news", "bob") == []
assert broker.poll("news", "ann", limit=1) == ["hello"]
assert broker.retained("news") == 1
assert broker.poll("news", "ann") == ["world"]
assert broker.retained("news") == 0
broker.publish("news", "m4")
broker.publish("news", "m5")
broker.publish("news", "m6")
assert broker.retained("news") == 3
assert broker.poll("news", "bob", limit=2) == ["m4", "m5"]
assert broker.retained("news") == 3
broker.unsubscribe("news", "ann")
assert broker.retained("news") == 1
broker.unsubscribe("news", "bob")
assert broker.retained("news") == 0
broker.subscribe("news", "bob")
assert broker.poll("news", "bob") == []
assert broker.publish("news", "m7") == 7
assert broker.poll("news", "bob") == ["m7"]
broker.create_topic("sports")
broker.subscribe("sports", "bob")
broker.publish("sports", "goal")
broker.publish("news", "m8")
assert broker.poll("sports", "bob") == ["goal"] and broker.poll("news", "bob") == ["m8"]
assert broker.publish("sports", "again") == 2
slow = Broker()
slow.create_topic("t")
slow.subscribe("t", "fast")
slow.subscribe("t", "slow")
for i in range(1000):
    slow.publish("t", i)
    assert slow.poll("t", "fast") == [i]
assert slow.retained("t") == 1000 and slow.backlog("t", "slow") == 1000
assert slow.poll("t", "slow", limit=1000)[-1] == 999
assert slow.retained("t") == 0''',
    solution=r'''class Broker:
    def __init__(self):
        self._topics = {}

    def _topic(self, name):
        if name not in self._topics:
            raise ValueError("Unknown topic")
        return self._topics[name]

    def create_topic(self, name):
        if name in self._topics:
            raise ValueError("Topic exists")
        self._topics[name] = {"first": 1, "messages": [], "next": 1, "offsets": {}}

    def _subscription(self, topic, subscriber):
        data = self._topic(topic)
        if subscriber not in data["offsets"]:
            raise ValueError("Not subscribed")
        return data

    def _trim(self, data):
        if data["offsets"]:
            keep_from = min(data["offsets"].values())
        else:
            keep_from = data["next"]
        drop = keep_from - data["first"]
        if drop > 0:
            del data["messages"][:drop]
            data["first"] = keep_from

    def subscribe(self, topic, subscriber):
        data = self._topic(topic)
        if subscriber in data["offsets"]:
            raise ValueError("Already subscribed")
        data["offsets"][subscriber] = data["next"]

    def unsubscribe(self, topic, subscriber):
        data = self._subscription(topic, subscriber)
        del data["offsets"][subscriber]
        self._trim(data)

    def publish(self, topic, message):
        data = self._topic(topic)
        number = data["next"]
        data["next"] += 1
        data["messages"].append(message)
        self._trim(data)
        return number

    def poll(self, topic, subscriber, limit=10):
        data = self._subscription(topic, subscriber)
        start = data["offsets"][subscriber]
        end = min(data["next"], start + limit)
        batch = data["messages"][start - data["first"]:end - data["first"]]
        data["offsets"][subscriber] = end
        self._trim(data)
        return batch

    def backlog(self, topic, subscriber):
        data = self._subscription(topic, subscriber)
        return data["next"] - data["offsets"][subscriber]

    def retained(self, topic):
        return len(self._topic(topic)["messages"])''',
    hints=[
        r'''Per topic keep one list of messages, the sequence number of its first element, and for each subscriber the sequence number of the **next** message they have not read. One shared list, many cursors: no copy of a message per subscriber.''',
        r'''`subscribe` sets the cursor to the topic's *next* sequence number, which is exactly "only messages published after now". `backlog` is `next - cursor`.''',
        r'''After every change to a cursor or to the subscribers, drop messages that every cursor has passed: delete the list prefix up to `min(cursors)` (or everything when there are no subscribers) and advance the first-sequence number. Slice with `cursor - first` because the list no longer starts at 1.''',
    ],
    explanation=r'''**The idea.** A broker decouples senders from receivers. The design question is *where messages wait*. This solution uses one log per topic and one **cursor per subscriber**, the same shape as Kafka.

```mermaid
flowchart LR
    P[publish] --> L["topic log: m4 m5 m6 m7"]
    L --> A["ann cursor at m6"]
    L --> B["bob cursor at m5"]
    A -. polls .-> L
    B -. polls .-> L
```

**Pull instead of push.** Subscribers call `poll` when they are ready, so a slow consumer never blocks a fast one and the broker needs no callbacks, threads or queues per subscriber. Back-pressure is simply `backlog`.

**One copy of each message.** The alternative is a private queue per subscriber, which copies every message once per reader. A shared log plus offsets stores each message once; the price is deciding when it can be **dropped**, which is what `retained` tests.

**Trimming.** A message may go once every cursor is past it. The slowest subscriber therefore decides how much memory the topic uses, and with no subscribers nothing is kept at all. Because the list shrinks from the front, positions are `sequence - first`, not the sequence itself; getting that offset right is the part to test carefully.

**Complexity.** `publish` is O(1) amortised (the trim deletes a prefix, amortised); `poll` is O(batch size).

**Going further.** Real brokers add *acknowledgements*: a message is redelivered if the subscriber crashes before acking. What would `poll` have to return, and what would the cursor mean?''',
),

P(
    slug='lld-ride-matching', title='Ride Matching', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/17-ride-sharing/README.md',
    description='Build a ride service that assigns the nearest free driver, tracks a ride through its states and charges a fare by distance.',
    statement=r'''Write a class `RideService` on a grid. Locations are `(x, y)` integers and **distance** is the Manhattan distance `|x1 - x2| + |y1 - y2|`.

**Methods**

- `add_driver(driver, x, y)` registers a free driver. A name already registered raises `ValueError("Driver exists")`.
- `request_ride(rider, x, y, to_x, to_y)` creates a ride from the pickup `(x, y)` to `(to_x, to_y)` and assigns the **nearest free driver** (distance to the pickup); ties go to the driver whose name sorts first. It returns the ride id (`"R1"`, `"R2"`, ...). With no free driver it raises `ValueError("No drivers available")` and uses no id.
- `start(ride_id)` begins the trip (the driver has picked the rider up). Allowed only for an `"assigned"` ride, otherwise `ValueError("Wrong state")`.
- `complete(ride_id)` ends the trip and returns the **fare** in cents: `300 + 100 * distance(pickup, destination)`. Allowed only for an `"on_trip"` ride, otherwise `ValueError("Wrong state")`. The driver becomes free again, located at the **destination**.
- `cancel(ride_id)` cancels a ride that has not started: `ValueError("Cannot cancel")` for any other state. The driver becomes free again, **where they were**.
- `status(ride_id)` is `"assigned"`, `"on_trip"`, `"completed"` or `"cancelled"`; `driver_of(ride_id)` is the driver's name.
- `free_drivers()` is the sorted list of free driver names.

An unknown ride id raises `ValueError("Unknown ride")` in every method that takes one.

**Example**

```
svc = RideService()
svc.add_driver("dan", 0, 0)
svc.add_driver("eve", 5, 5)
ride = svc.request_ride("rita", 4, 4, 4, 9)   # "R1": eve is closer
svc.start(ride)
svc.complete(ride)                            # 300 + 100 * 5 = 800
```''',
    starter=r'''class RideService:
    def add_driver(self, driver, x, y):
        ...

    def request_ride(self, rider, x, y, to_x, to_y):
        ...

    def start(self, ride_id):
        ...

    def complete(self, ride_id):
        ...

    def cancel(self, ride_id):
        ...

    def status(self, ride_id):
        ...

    def driver_of(self, ride_id):
        ...

    def free_drivers(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
svc = RideService()
assert svc.free_drivers() == []
assert error_of(svc.request_ride, "rita", 0, 0, 1, 1) == "ValueError: No drivers available"
svc.add_driver("dan", 0, 0)
svc.add_driver("eve", 5, 5)
assert error_of(svc.add_driver, "dan", 1, 1) == "ValueError: Driver exists"
assert error_of(svc.status, "R9") == "ValueError: Unknown ride"
assert error_of(svc.start, "R9") == "ValueError: Unknown ride"
assert error_of(svc.complete, "R9") == "ValueError: Unknown ride"
assert error_of(svc.cancel, "R9") == "ValueError: Unknown ride"
assert error_of(svc.driver_of, "R9") == "ValueError: Unknown ride"
assert error_of(svc.request_ride, "rita", 0, 0, 1, 1) is None
assert svc.driver_of("R1") == "dan" and svc.status("R1") == "assigned" and svc.free_drivers() == ["eve"]
ride = svc.request_ride("sam", 4, 4, 4, 9)
assert ride == "R2" and svc.driver_of(ride) == "eve" and svc.free_drivers() == []
assert error_of(svc.request_ride, "tom", 1, 1, 2, 2) == "ValueError: No drivers available"
assert error_of(svc.complete, ride) == "ValueError: Wrong state"
svc.start(ride)
assert svc.status(ride) == "on_trip"
assert error_of(svc.start, ride) == "ValueError: Wrong state"
assert error_of(svc.cancel, ride) == "ValueError: Cannot cancel"
assert svc.complete(ride) == 800
assert svc.status(ride) == "completed" and svc.free_drivers() == ["eve"]
assert error_of(svc.complete, ride) == "ValueError: Wrong state"
assert error_of(svc.cancel, ride) == "ValueError: Cannot cancel"
svc.cancel("R1")
assert svc.status("R1") == "cancelled" and svc.free_drivers() == ["dan", "eve"]
assert error_of(svc.cancel, "R1") == "ValueError: Cannot cancel"
assert error_of(svc.start, "R1") == "ValueError: Wrong state"
third = svc.request_ride("uma", 4, 10, 0, 0)
assert third == "R3" and svc.driver_of(third) == "eve"
svc.cancel(third)
fourth = svc.request_ride("vic", 4, 9, 4, 9)
assert svc.driver_of(fourth) == "eve"
svc.start(fourth)
assert svc.complete(fourth) == 300
tie = RideService()
tie.add_driver("zoe", 0, 2)
tie.add_driver("amy", 2, 0)
tie.add_driver("far", 9, 9)
assert tie.driver_of(tie.request_ride("r", 0, 0, 3, 3)) == "amy"
assert tie.driver_of(tie.request_ride("r", 0, 0, 3, 3)) == "zoe"
assert tie.driver_of(tie.request_ride("r", 0, 0, 3, 3)) == "far"
hop = RideService()
hop.add_driver("a", 0, 0)
hop.add_driver("b", 10, 0)
leg = hop.request_ride("x", 10, 0, 0, 10)
assert hop.driver_of(leg) == "b"
hop.start(leg)
hop.complete(leg)
assert hop.driver_of(hop.request_ride("y", 0, 9, 0, 9)) == "b"
neg = RideService()
neg.add_driver("n", -3, -4)
r = neg.request_ride("x", 0, 0, -2, 5)
neg.start(r)
assert neg.complete(r) == 300 + 100 * 7
neg2 = neg.request_ride("y", -2, 5, -2, 5)
assert neg.driver_of(neg2) == "n"''',
    solution=r'''class RideService:
    def __init__(self):
        self._drivers = {}
        self._rides = {}
        self._counter = 0

    def add_driver(self, driver, x, y):
        if driver in self._drivers:
            raise ValueError("Driver exists")
        self._drivers[driver] = {"at": (x, y), "free": True}

    @staticmethod
    def _distance(a, b):
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def _ride(self, ride_id):
        if ride_id not in self._rides:
            raise ValueError("Unknown ride")
        return self._rides[ride_id]

    def request_ride(self, rider, x, y, to_x, to_y):
        free = [name for name, d in self._drivers.items() if d["free"]]
        if not free:
            raise ValueError("No drivers available")
        pickup = (x, y)
        driver = min(free, key=lambda name: (self._distance(self._drivers[name]["at"], pickup), name))
        self._counter += 1
        ride_id = "R" + str(self._counter)
        self._drivers[driver]["free"] = False
        self._rides[ride_id] = {"rider": rider, "driver": driver, "pickup": pickup, "dest": (to_x, to_y), "status": "assigned"}
        return ride_id

    def start(self, ride_id):
        ride = self._ride(ride_id)
        if ride["status"] != "assigned":
            raise ValueError("Wrong state")
        ride["status"] = "on_trip"

    def complete(self, ride_id):
        ride = self._ride(ride_id)
        if ride["status"] != "on_trip":
            raise ValueError("Wrong state")
        ride["status"] = "completed"
        driver = self._drivers[ride["driver"]]
        driver["free"] = True
        driver["at"] = ride["dest"]
        return 300 + 100 * self._distance(ride["pickup"], ride["dest"])

    def cancel(self, ride_id):
        ride = self._ride(ride_id)
        if ride["status"] != "assigned":
            raise ValueError("Cannot cancel")
        ride["status"] = "cancelled"
        self._drivers[ride["driver"]]["free"] = True

    def status(self, ride_id):
        return self._ride(ride_id)["status"]

    def driver_of(self, ride_id):
        return self._ride(ride_id)["driver"]

    def free_drivers(self):
        return sorted(name for name, d in self._drivers.items() if d["free"])''',
    hints=[
        r'''Two records: drivers (`at`, `free`) and rides (`driver`, `pickup`, `dest`, `status`). A ride's status only ever moves forward: assigned, then on_trip, then completed, or assigned then cancelled.''',
        r'''The nearest-driver pick is one `min` over the free drivers with the key `(distance, name)`. Writing the tiebreaker into the key is what makes the choice repeatable.''',
        r'''Do all the checks before changing anything: a refused request must not use up a ride id or mark a driver busy. On `complete`, move the driver to the destination; on `cancel`, leave them where they were.''',
    ],
    explanation=r'''**The idea.** Dispatch is a small state machine per ride plus a "pick one resource" rule. Keep the two apart: the *matching* policy (nearest, then name) lives in one expression, and the *lifecycle* (what each status allows) lives in a few guarded methods.

```mermaid
stateDiagram-v2
    [*] --> assigned: request_ride
    assigned --> on_trip: start
    assigned --> cancelled: cancel
    on_trip --> completed: complete
```

**Guarded transitions.** Every method that changes a ride first asks "is it in the state this action needs?". That single habit rules out completing a cancelled ride or starting a ride twice, and it gives each mistake a clear error.

**The driver is a resource.** A driver is free or busy, and where they are matters for the next match. `complete` moves the driver to the drop-off point, which is why the next request after a trip can be matched to them, and `cancel` does not, because they never moved.

**A policy you can swap.** Replacing "nearest" with "best rated within 3 km" should touch only the `min` line. In an interview, say that this is the Strategy pattern waiting to happen, but write the plain version first.

**Complexity.** `request_ride` scans every driver: O(d). A real service keeps drivers in a spatial index (a grid or geohash) so it only looks at nearby cells.

**Going further.** Add surge pricing as a multiplier chosen when the ride is requested. Where would you store it so `complete` still computes the same fare later?''',
),

P(
    slug='lld-chess-moves', title='Chess Move Validator', topic='lld-machine-coding', difficulty='advanced',
    module='lld/14-tic-tac-toe-and-chess/README.md',
    description='Build a chess board that knows how every piece moves, blocks sliding pieces, captures only enemies and enforces whose turn it is.',
    statement=r'''Write a class `Board` for the **movement rules** of chess. There is no check, castling, en passant or promotion.

**Squares and pieces.** Squares are `"a1"` to `"h8"`. A piece is one letter: `K` king, `Q` queen, `R` rook, `B` bishop, `N` knight, `P` pawn. **Upper case is white, lower case is black.** The board starts **empty**.

**Methods**

- `place(piece, square)` puts a piece on a square (replacing anything there). A square that is not on the board raises `ValueError("Bad square")`; a letter that is not a piece raises `ValueError("Bad piece")` (check the piece first).
- `at(square)` is the piece on a square or `None`.
- `moves(square)` is the **sorted** list of squares the piece there can move to (an empty list for an empty square).
- `move(source, target)` makes a move and returns the captured piece letter, or `None`. White moves first, then the colours alternate. `ValueError` for: an empty source `"No piece"`; a piece of the wrong colour `"Not your turn"`; a target not in `moves(source)` `"Illegal move"`. A refused move changes nothing.

**How pieces move**

- **Rook** along a rank or file; **bishop** along a diagonal; **queen** both. They stop at the first piece in the way: they may **capture** it if it is an enemy and cannot go past it.
- **Knight** jumps in an L (two squares one way, one the other) over anything.
- **King** one square in any direction.
- A piece never lands on a square holding a piece of its own colour.
- **Pawns:** white moves toward rank 8, black toward rank 1. One square forward onto an **empty** square; two squares from its starting rank (2 for white, 7 for black) if **both** squares are empty; one square diagonally forward **only to capture** an enemy.

**Example**

```
board = Board()
board.place("R", "a1")
board.place("p", "a4")
board.moves("a1")      # ["a2", "a3", "a4", "b1", "c1", "d1", "e1", "f1", "g1", "h1"]
```''',
    starter=r'''class Board:
    def place(self, piece, square):
        ...

    def at(self, square):
        ...

    def moves(self, square):
        ...

    def move(self, source, target):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def board_of(pieces):
    board = Board()
    for square, piece in pieces.items():
        board.place(piece, square)
    return board
empty = Board()
assert empty.at("e4") is None and empty.moves("e4") == []
assert error_of(empty.place, "R", "i1") == "ValueError: Bad square"
assert error_of(empty.place, "R", "a9") == "ValueError: Bad square"
assert error_of(empty.place, "R", "z") == "ValueError: Bad square"
assert error_of(empty.place, "X", "a1") == "ValueError: Bad piece"
assert error_of(empty.place, "X", "z9") == "ValueError: Bad piece"
assert board_of({"a1": "R", "a4": "p", "c1": "P"}).moves("a1") == ["a2", "a3", "a4", "b1"]
assert board_of({"a1": "R", "a4": "p", "c1": "p"}).moves("a1") == ["a2", "a3", "a4", "b1", "c1"]
assert board_of({"h8": "r"}).moves("h8") == ["a8", "b8", "c8", "d8", "e8", "f8", "g8", "h1", "h2", "h3", "h4", "h5", "h6", "h7"]
assert board_of({"b1": "N"}).moves("b1") == ["a3", "c3", "d2"]
assert board_of({"b1": "N", "a3": "P", "c3": "p", "b2": "P"}).moves("b1") == ["c3", "d2"]
assert board_of({"e5": "n"}).moves("e5") == ["c4", "c6", "d3", "d7", "f3", "f7", "g4", "g6"]
assert board_of({"c1": "B"}).moves("c1") == ["a3", "b2", "d2", "e3", "f4", "g5", "h6"]
assert board_of({"c1": "B", "e3": "P", "b2": "p"}).moves("c1") == ["b2", "d2"]
assert len(board_of({"d4": "Q"}).moves("d4")) == 27
queen = board_of({"d4": "Q", "d6": "p", "f6": "P"}).moves("d4")
assert "d6" in queen and "d7" not in queen and "f6" not in queen and "e5" in queen
assert board_of({"e1": "K"}).moves("e1") == ["d1", "d2", "e2", "f1", "f2"]
assert board_of({"e1": "K", "e2": "P"}).moves("e1") == ["d1", "d2", "f1", "f2"]
assert board_of({"h8": "k"}).moves("h8") == ["g7", "g8", "h7"]
assert board_of({"e2": "P"}).moves("e2") == ["e3", "e4"]
assert board_of({"e2": "P", "e3": "p"}).moves("e2") == []
assert board_of({"e2": "P", "e4": "p"}).moves("e2") == ["e3"]
assert board_of({"e2": "P", "d3": "p", "f3": "p"}).moves("e2") == ["d3", "e3", "e4", "f3"]
assert board_of({"e2": "P", "e3": "p", "d3": "p", "f3": "P"}).moves("e2") == ["d3"]
assert board_of({"c3": "P"}).moves("c3") == ["c4"]
assert board_of({"g7": "p"}).moves("g7") == ["g5", "g6"]
assert board_of({"g7": "p", "g6": "P"}).moves("g7") == []
assert board_of({"g7": "p", "f6": "P", "h6": "p"}).moves("g7") == ["f6", "g5", "g6"]
assert board_of({"a2": "P", "b3": "p"}).moves("a2") == ["a3", "a4", "b3"]
assert board_of({"h8": "P"}).moves("h8") == []
game = board_of({"e2": "P", "d7": "p", "b1": "N"})
assert error_of(game.move, "e5", "e6") == "ValueError: No piece"
assert error_of(game.move, "d7", "d6") == "ValueError: Not your turn"
assert error_of(game.move, "e2", "e5") == "ValueError: Illegal move"
assert game.at("e2") == "P" and game.at("e5") is None
assert game.move("e2", "e4") is None and game.at("e4") == "P" and game.at("e2") is None
assert error_of(game.move, "b1", "c3") == "ValueError: Not your turn"
assert game.move("d7", "d5") is None
assert game.move("e4", "d5") == "p" and game.at("d5") == "P"
game.place("q", "d8")
assert game.move("d8", "d5") == "P" and game.at("d5") == "q"
assert error_of(game.move, "b1", "b3") == "ValueError: Illegal move"
assert game.move("b1", "d2") is None''',
    solution=r'''class Board:
    _PIECES = "KQRBNPkqrbnp"
    _ROOK = ((1, 0), (-1, 0), (0, 1), (0, -1))
    _BISHOP = ((1, 1), (1, -1), (-1, 1), (-1, -1))
    _KNIGHT = ((1, 2), (2, 1), (-1, 2), (-2, 1), (1, -2), (2, -1), (-1, -2), (-2, -1))

    def __init__(self):
        self._cells = {}
        self._white_to_move = True

    @staticmethod
    def _parse(square):
        if not isinstance(square, str) or len(square) != 2 or square[0] not in "abcdefgh" or square[1] not in "12345678":
            raise ValueError("Bad square")
        return ord(square[0]) - 97, int(square[1]) - 1

    @staticmethod
    def _name(file, rank):
        return chr(97 + file) + str(rank + 1)

    @staticmethod
    def _white(piece):
        return piece.isupper()

    def place(self, piece, square):
        if piece not in self._PIECES or len(piece) != 1:
            raise ValueError("Bad piece")
        self._parse(square)
        self._cells[square] = piece

    def at(self, square):
        return self._cells.get(square)

    def _slide(self, file, rank, directions, white):
        found = []
        for d_file, d_rank in directions:
            f, r = file + d_file, rank + d_rank
            while 0 <= f < 8 and 0 <= r < 8:
                other = self._cells.get(self._name(f, r))
                if other is None:
                    found.append(self._name(f, r))
                else:
                    if self._white(other) != white:
                        found.append(self._name(f, r))
                    break
                f, r = f + d_file, r + d_rank
        return found

    def _step(self, file, rank, offsets, white):
        found = []
        for d_file, d_rank in offsets:
            f, r = file + d_file, rank + d_rank
            if 0 <= f < 8 and 0 <= r < 8:
                other = self._cells.get(self._name(f, r))
                if other is None or self._white(other) != white:
                    found.append(self._name(f, r))
        return found

    def _pawn(self, file, rank, white):
        found = []
        direction = 1 if white else -1
        start = 1 if white else 6
        if 0 <= rank + direction < 8 and self._cells.get(self._name(file, rank + direction)) is None:
            found.append(self._name(file, rank + direction))
            if rank == start and self._cells.get(self._name(file, rank + 2 * direction)) is None:
                found.append(self._name(file, rank + 2 * direction))
        for d_file in (-1, 1):
            f, r = file + d_file, rank + direction
            if 0 <= f < 8 and 0 <= r < 8:
                other = self._cells.get(self._name(f, r))
                if other is not None and self._white(other) != white:
                    found.append(self._name(f, r))
        return found

    def moves(self, square):
        piece = self._cells.get(square)
        if piece is None:
            return []
        file, rank = self._parse(square)
        white = self._white(piece)
        kind = piece.upper()
        if kind == "R":
            found = self._slide(file, rank, self._ROOK, white)
        elif kind == "B":
            found = self._slide(file, rank, self._BISHOP, white)
        elif kind == "Q":
            found = self._slide(file, rank, self._ROOK + self._BISHOP, white)
        elif kind == "N":
            found = self._step(file, rank, self._KNIGHT, white)
        elif kind == "K":
            found = self._step(file, rank, self._ROOK + self._BISHOP, white)
        else:
            found = self._pawn(file, rank, white)
        return sorted(found)

    def move(self, source, target):
        piece = self._cells.get(source)
        if piece is None:
            raise ValueError("No piece")
        if self._white(piece) != self._white_to_move:
            raise ValueError("Not your turn")
        if target not in self.moves(source):
            raise ValueError("Illegal move")
        captured = self._cells.get(target)
        del self._cells[source]
        self._cells[target] = piece
        self._white_to_move = not self._white_to_move
        return captured''',
    hints=[
        r'''Store the board as a dictionary from square name to piece letter. Convert a square to `(file, rank)` numbers (`"c3"` is `(2, 2)`) to do arithmetic, and convert back to a name to look it up.''',
        r'''Two helpers cover five pieces: a *slider* walks along each direction until it leaves the board or meets a piece (adding that square only when it is an enemy), and a *stepper* tries each fixed offset once. Rook, bishop and queen differ only in their directions; knight and king differ only in their offsets.''',
        r'''The pawn is its own case: forward moves need an empty square (the double step needs both empty and the starting rank), the diagonals need an enemy. Use the sign of the direction (+1 white, -1 black) instead of writing the code twice.''',
    ],
    explanation=r'''**The idea.** There are six kinds of piece but only three *kinds of movement*: slide until blocked, step to fixed offsets, and the pawn's special rules. Express each once, parameterised by data (the direction or offset list), and you are done.

**Data, not branches.** A rook is "slide along `(1,0) (-1,0) (0,1) (0,-1)`"; a queen is the rook's list plus the bishop's; a king is "step along the same eight". Putting the directions in tuples replaces six near-identical methods with two.

**The object-oriented version.** This solution uses one class and a few helpers so it fits in a file. In a design interview you would likely draw a `Piece` base class with `targets(board, square)` and subclasses, so a new piece (a fairy chess piece, say) is a new class and the board does not change. That is the Open/Closed principle in practice, and the data-driven helpers are exactly what those subclasses would share.

**Blocked, but capturable.** The slider rule has three cases for each square on the ray: empty (take it and continue), enemy (take it and stop), friend (stop without it). Forgetting the middle case is how people accidentally let a rook jump past a capture.

**Pawns break the symmetry.** A pawn is the only piece that moves differently than it captures, and the only one with a direction and a starting rank. Isolating that in its own method keeps the rest clean.

**Complexity.** `moves` is O(1) per piece (at most 27 squares); `move` re-uses it, so a legal move costs the same.

**Going further.** To reject moves that leave your own king attacked you need `is_attacked(square, by)`. Which of the helpers here would it reuse?''',
),
]
