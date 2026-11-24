PROBLEMS = [
P(
    slug='lld-report-template', title='Report Template Method', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/09-behavioral-patterns-ii/README.md',
    description='Build a base Report that fixes the order of the steps and let a text report, a CSV report and your own subclasses fill in the details.',
    statement=r'''Write a base class `Report` whose method `generate(rows)` is a **template method**: it fixes the order of the steps, and subclasses fill in the steps. Then write two subclasses.

**`Report.generate(rows)`** takes a list of dictionaries and returns one string. Anything that is not a `list` raises `ValueError("Rows must be a list")`. Then, in this order:

1. call `self.header(rows)`;
2. if there are rows, call `self.format_row(row)` for each, in order; if there are none, call `self.empty_message()` instead (once);
3. call `self.footer(rows)`;
4. leave out every part that is the empty string, and return `self.join(parts)`.

**The steps (what subclasses may override)**

| method | in `Report` |
|---|---|
| `header(rows)` | must be overridden: raises `NotImplementedError` |
| `format_row(row)` | must be overridden: raises `NotImplementedError` |
| `empty_message()` | returns `"(no data)"` |
| `footer(rows)` | returns `""` |
| `join(parts)` | returns the parts joined by `"\n"` |

**`TextReport(title)`**: header `"== <title> =="`; each row is `"- "` followed by `key=value` pairs sorted by key and joined by `", "`; footer is `"<n> rows"`, or `"1 row"` for exactly one.

**`CsvReport(columns)`**: header is the column names joined by `","`; each row is that row's value for each column (missing: empty), joined by `","`. A value containing a comma, a double quote or a line break is wrapped in double quotes, with inner quotes doubled. With no rows there is **no** message (the report is just the header).

**Example**

```
TextReport("Sales").generate([{"item": "pen", "qty": 3}])
# "== Sales ==\n- item=pen, qty=3\n1 row"
```''',
    starter=r'''class Report:
    def generate(self, rows):
        ...

    def header(self, rows):
        ...

    def format_row(self, row):
        ...

    def empty_message(self):
        ...

    def footer(self, rows):
        ...

    def join(self, parts):
        ...


class TextReport(Report):
    def __init__(self, title):
        ...


class CsvReport(Report):
    def __init__(self, columns):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
text = TextReport("Sales")
assert text.generate([{"item": "pen", "qty": 3}]) == "== Sales ==\n- item=pen, qty=3\n1 row"
assert text.generate([{"b": 2, "a": 1}, {"a": 9}]) == "== Sales ==\n- a=1, b=2\n- a=9\n2 rows"
assert text.generate([]) == "== Sales ==\n(no data)\n0 rows"
assert error_of(text.generate, "rows") == "ValueError: Rows must be a list"
assert error_of(text.generate, ({"a": 1},)) == "ValueError: Rows must be a list"
csv = CsvReport(["name", "qty"])
assert csv.generate([{"name": "pen", "qty": 3}, {"name": "ink"}]) == "name,qty\npen,3\nink,"
assert csv.generate([]) == "name,qty"
assert CsvReport(["qty", "name"]).generate([{"name": "pen", "qty": 3}]) == "qty,name\n3,pen"
assert csv.generate([{"name": "a,b", "qty": 1}]) == 'name,qty\n"a,b",1'
assert csv.generate([{"name": 'say "hi"', "qty": 1}]) == 'name,qty\n"say ""hi""",1'
assert csv.generate([{"name": "two\nlines", "qty": 0}]) == 'name,qty\n"two\nlines",0'
assert csv.generate([{"name": "x", "qty": 1, "extra": 5}]) == "name,qty\nx,1"
assert error_of(csv.generate, None) == "ValueError: Rows must be a list"
assert error_of(Report().generate, []) == "NotImplementedError: "
class Recorder(Report):
    def __init__(self):
        self.calls = []
    def header(self, rows):
        self.calls.append("header")
        return "H"
    def format_row(self, row):
        self.calls.append("row " + str(row["n"]))
        return "r" + str(row["n"])
    def empty_message(self):
        self.calls.append("empty")
        return "none"
    def footer(self, rows):
        self.calls.append("footer")
        return "F"
recorder = Recorder()
assert recorder.generate([{"n": 1}, {"n": 2}]) == "H\nr1\nr2\nF"
assert recorder.calls == ["header", "row 1", "row 2", "footer"]
recorder.calls.clear()
assert recorder.generate([]) == "H\nnone\nF"
assert recorder.calls == ["header", "empty", "footer"]
class Pipes(Recorder):
    def join(self, parts):
        return " | ".join(parts)
    def footer(self, rows):
        return ""
    def header(self, rows):
        return ""
assert Pipes().generate([{"n": 1}, {"n": 2}]) == "r1 | r2"
class Quiet(Report):
    def header(self, rows):
        return "title"
    def format_row(self, row):
        return ""
assert Quiet().generate([{}, {}]) == "title"
assert Quiet().generate([]) == "title\n(no data)"
assert issubclass(TextReport, Report) and issubclass(CsvReport, Report)
assert "generate" not in TextReport.__dict__ and "generate" not in CsvReport.__dict__''',
    solution=r'''class Report:
    def generate(self, rows):
        if not isinstance(rows, list):
            raise ValueError("Rows must be a list")
        parts = [self.header(rows)]
        if rows:
            parts.extend(self.format_row(row) for row in rows)
        else:
            parts.append(self.empty_message())
        parts.append(self.footer(rows))
        return self.join([part for part in parts if part != ""])

    def header(self, rows):
        raise NotImplementedError

    def format_row(self, row):
        raise NotImplementedError

    def empty_message(self):
        return "(no data)"

    def footer(self, rows):
        return ""

    def join(self, parts):
        return "\n".join(parts)


class TextReport(Report):
    def __init__(self, title):
        self._title = title

    def header(self, rows):
        return f"== {self._title} =="

    def format_row(self, row):
        return "- " + ", ".join(f"{key}={row[key]}" for key in sorted(row))

    def footer(self, rows):
        return f"{len(rows)} row" if len(rows) == 1 else f"{len(rows)} rows"


class CsvReport(Report):
    def __init__(self, columns):
        self._columns = list(columns)

    @staticmethod
    def _cell(value):
        text = str(value)
        if any(char in text for char in ',"\n\r'):
            return '"' + text.replace('"', '""') + '"'
        return text

    def header(self, rows):
        return ",".join(self._columns)

    def format_row(self, row):
        return ",".join(self._cell(row.get(column, "")) for column in self._columns)

    def empty_message(self):
        return ""''',
    hints=[
        r'''`generate` is the only method with logic: build a list of parts by calling the step methods in order, drop the empty ones, and hand the list to `join`. It must call the steps through `self`, so a subclass's version is the one that runs.''',
        r'''The base class steps `header` and `format_row` are *abstract*: raise `NotImplementedError`. `empty_message`, `footer` and `join` are *hooks* with sensible defaults that a subclass may override or ignore.''',
        r'''In the subclasses write only the steps, never `generate`. For CSV, check each cell for a comma, a quote or a line break; if there is one, double the quotes and wrap the cell in quotes.''',
    ],
    explanation=r'''**The idea.** The Template Method pattern puts an algorithm's *skeleton* in a base class and lets subclasses supply the *steps*. The skeleton here is "header, then the rows (or a message), then a footer, drop blanks, join". Every report has that shape; only the details differ.

```mermaid
classDiagram
    class Report {
        generate(rows)
        header(rows)*
        format_row(row)*
        empty_message()
        footer(rows)
        join(parts)
    }
    Report <|-- TextReport
    Report <|-- CsvReport
```

**Inversion of control.** Normally your code calls a library. Here the base class calls *your* methods: "don't call us, we'll call you" (the Hollywood principle). That is why `generate` must call `self.header(...)` and not a fixed function: a subclass that overrides `header` changes the result without touching `generate`.

**Abstract steps and hooks.** `header` and `format_row` have no sensible default, so the base refuses to run without them. `empty_message`, `footer` and `join` have defaults, so subclasses only override them when they need to; the CSV report overrides `empty_message` to say nothing, and a test subclass overrides `join` to use pipes.

**Template Method or Strategy?** Both vary part of an algorithm. Template Method varies it by *inheritance* (a subclass per variant, fixed at class definition); Strategy varies it by *composition* (an object passed in, swappable at run time). If you find yourself subclassing only to change one step, a strategy is often lighter.

**Small traps.** "1 row" versus "2 rows" is the sort of detail real reports get wrong. And a value that contains a comma breaks a CSV unless quoted: format the cell, do not just join with commas.

**Going further.** Add `HtmlReport`. Which methods do you write, and does `generate` change?''',
),

P(
    slug='lld-game-save', title='Game Save Snapshots', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/09-behavioral-patterns-ii/README.md',
    description='Build a game whose state can be saved into an opaque snapshot and restored, plus a bounded undo stack, without a snapshot ever changing behind your back.',
    statement=r'''Write three classes: `Game`, `Snapshot` and `Checkpoints`.

**`Game(hp=100, x=0, y=0, inventory=())`** keeps its own copy of the inventory.

- Read: `hp`, `x`, `y`, and `inventory` (a **tuple**, so callers cannot change the game through it).
- `damage(n)` lowers `hp`, never below `0`. `heal(n)` raises it, never above `100`.
- `move(dx, dy)` changes the position.
- `pick(item)` adds an item at the end. `drop(item)` removes **one** copy of it, or raises `ValueError("No such item")`.
- `save()` returns a `Snapshot` of the current state.
- `restore(snapshot)` puts the game back into that state. Anything that is not a `Snapshot` raises `ValueError("Not a snapshot")`.

**`Snapshot`** is **immutable** and **independent**: it keeps its own copy of everything, so changing the game after `save()` never changes the snapshot, and restoring from it never ties the game to it. Assigning to any attribute of a snapshot raises `AttributeError`. The game's fields are not meant to be read from it; callers only pass it back to `restore`.

**`Checkpoints(game, limit=3)`** is an undo stack for one game.

- `save()` takes a snapshot of the game and pushes it. When there are more than `limit`, the **oldest** is thrown away.
- `undo()` restores the **latest** snapshot and removes it. With none, it raises `ValueError("No checkpoint")`.
- `count` is how many are stored.

**Example**

```
game = Game(inventory=["sword"])
saved = game.save()
game.pick("shield"); game.damage(30)
game.restore(saved)
game.inventory, game.hp       # ("sword",), 100
```''',
    starter=r'''class Snapshot:
    ...


class Game:
    def __init__(self, hp=100, x=0, y=0, inventory=()):
        ...

    def damage(self, n):
        ...

    def heal(self, n):
        ...

    def move(self, dx, dy):
        ...

    def pick(self, item):
        ...

    def drop(self, item):
        ...

    def save(self):
        ...

    def restore(self, snapshot):
        ...


class Checkpoints:
    def __init__(self, game, limit=3):
        ...

    def save(self):
        ...

    def undo(self):
        ...

    @property
    def count(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
bag = ["sword"]
game = Game(inventory=bag)
bag.append("lie")
assert (game.hp, game.x, game.y, game.inventory) == (100, 0, 0, ("sword",))
assert isinstance(game.inventory, tuple)
game.damage(30)
game.damage(500)
assert game.hp == 0
game.heal(40)
game.heal(1000)
assert game.hp == 100
game.move(2, -3)
game.move(1, 1)
assert (game.x, game.y) == (3, -2)
game.pick("potion")
game.pick("potion")
assert game.inventory == ("sword", "potion", "potion")
game.drop("potion")
assert game.inventory == ("sword", "potion")
assert error_of(game.drop, "axe") == "ValueError: No such item"
saved = game.save()
assert isinstance(saved, Snapshot)
game.damage(60)
game.move(10, 10)
game.pick("shield")
game.drop("sword")
assert (game.hp, game.x, game.y, game.inventory) == (40, 13, 8, ("potion", "shield"))
game.restore(saved)
assert (game.hp, game.x, game.y, game.inventory) == (100, 3, -2, ("sword", "potion"))
game.pick("gem")
game.damage(10)
assert game.inventory == ("sword", "potion", "gem")
game.restore(saved)
assert (game.hp, game.inventory) == (100, ("sword", "potion"))
other = Game(hp=5, inventory=["rope"])
other.restore(saved)
assert (other.hp, other.x, other.inventory) == (100, 3, ("sword", "potion"))
other.pick("gem")
assert game.inventory == ("sword", "potion") and saved is not None
game.restore(saved)
assert game.inventory == ("sword", "potion")
assert error_of(game.restore, None) == "ValueError: Not a snapshot"
assert error_of(game.restore, {"hp": 1}) == "ValueError: Not a snapshot"
for name in ("hp", "x", "y", "inventory", "extra", "_state"):
    assert error_of(setattr, saved, name, 5).startswith("AttributeError")
lone = Game()
twin = lone.save()
lone.pick("a")
assert lone.save() is not twin
lone.restore(twin)
assert lone.inventory == ()
undo = Checkpoints(game)
assert undo.count == 0 and error_of(undo.undo) == "ValueError: No checkpoint"
game.move(1, 0)
undo.save()
game.move(1, 0)
undo.save()
game.move(1, 0)
assert undo.count == 2 and game.x == 6
undo.undo()
assert game.x == 5 and undo.count == 1
undo.undo()
assert game.x == 4 and undo.count == 0
assert error_of(undo.undo) == "ValueError: No checkpoint"
for step in range(5):
    game.move(1, 0)
    undo.save()
assert undo.count == 3 and game.x == 9
undo.undo()
undo.undo()
undo.undo()
assert game.x == 7 and error_of(undo.undo) == "ValueError: No checkpoint"
small = Checkpoints(game, limit=1)
small.save()
game.move(5, 0)
small.save()
game.move(5, 0)
assert small.count == 1
small.undo()
assert game.x == 12''',
    solution=r'''class Snapshot:
    __slots__ = ("_state",)

    def __init__(self, hp, x, y, inventory):
        object.__setattr__(self, "_state", (hp, x, y, tuple(inventory)))

    def __setattr__(self, name, value):
        raise AttributeError("Snapshot is immutable")


class Game:
    def __init__(self, hp=100, x=0, y=0, inventory=()):
        self._hp = hp
        self._x = x
        self._y = y
        self._inventory = list(inventory)

    @property
    def hp(self):
        return self._hp

    @property
    def x(self):
        return self._x

    @property
    def y(self):
        return self._y

    @property
    def inventory(self):
        return tuple(self._inventory)

    def damage(self, n):
        self._hp = max(0, self._hp - n)

    def heal(self, n):
        self._hp = min(100, self._hp + n)

    def move(self, dx, dy):
        self._x += dx
        self._y += dy

    def pick(self, item):
        self._inventory.append(item)

    def drop(self, item):
        if item not in self._inventory:
            raise ValueError("No such item")
        self._inventory.remove(item)

    def save(self):
        return Snapshot(self._hp, self._x, self._y, self._inventory)

    def restore(self, snapshot):
        if not isinstance(snapshot, Snapshot):
            raise ValueError("Not a snapshot")
        hp, x, y, inventory = snapshot._state
        self._hp, self._x, self._y = hp, x, y
        self._inventory = list(inventory)


class Checkpoints:
    def __init__(self, game, limit=3):
        self._game = game
        self._limit = limit
        self._stack = []

    def save(self):
        self._stack.append(self._game.save())
        if len(self._stack) > self._limit:
            self._stack.pop(0)

    def undo(self):
        if not self._stack:
            raise ValueError("No checkpoint")
        self._game.restore(self._stack.pop())

    @property
    def count(self):
        return len(self._stack)''',
    hints=[
        r'''A snapshot is a small immutable object holding **copies**: numbers are fine to share, but the inventory must be copied into a tuple. A tuple cannot be changed, so nothing can alter the snapshot later.''',
        r'''`restore` must copy *out of* the snapshot too: `self._inventory = list(snapshot_items)`. If you assign the snapshot's own list, the game and the snapshot share it and the next `pick` silently edits the "saved" state.''',
        r'''For `Checkpoints`, a plain list is a stack: append on `save`, `pop()` on `undo`. When it grows past `limit`, `pop(0)` removes the oldest.''',
    ],
    explanation=r'''**The idea.** The Memento pattern lets an object (the *originator*, here `Game`) hand out a snapshot of its private state and take it back later, **without exposing that state**. Three roles are involved:

```mermaid
classDiagram
    class Game {
        save() Snapshot
        restore(snapshot)
    }
    class Snapshot
    class Checkpoints {
        save()
        undo()
    }
    Game ..> Snapshot : creates and reads
    Checkpoints o-- Snapshot : stores
    Checkpoints --> Game : asks to save and restore
```

The *caretaker* (`Checkpoints`) keeps snapshots but never looks inside them; only the game knows what is in one. That is why adding a field to `Game` changes `Game` and `Snapshot`, and `Checkpoints` does not move.

**Copy in, copy out.** The classic bug is aliasing. If `save()` stores the game's own list, later `pick` calls change the "saved" state. If `restore()` hands the snapshot's list to the game, later `pick` calls change the *snapshot*, and the second restore brings back the wrong state. Immutability (a tuple) solves the first; copying out (`list(...)`) solves the second.

**Why not just `copy.deepcopy(game)`?** It works for a toy, but it copies *everything*, ties the snapshot to the class's layout, and exposes the whole object. A memento carries exactly the state worth restoring.

**Bounded history.** Undo history costs memory, so editors keep the last N states; here the oldest is dropped. An alternative is storing only the *differences* (the Command pattern), which is what text editors do for long histories.

**Going further.** Add `redo`. What must happen to the redo stack when the player does something new after an undo?''',
),

P(
    slug='lld-tree-iterator', title='Tree Iterator', topic='lld-patterns-in-use', difficulty='advanced',
    module='lld/08-behavioral-patterns-i/README.md',
    description='Build a lazy tree walker with pre-order, post-order and level-order iterators that handle very deep trees without recursion.',
    statement=r'''Write a class `Node` for a tree, and give it three ways to walk it.

**`Node(value, children=())`** has the attributes `value` and `children` (a **list** of nodes; it keeps its own copy of the sequence you pass). `add(child)` appends a child and returns the child.

**Walking.** `node.walk(order="pre")` returns an **iterator** over the **values** of the tree below and including `node`:

- `"pre"`: a node, then each child's subtree left to right;
- `"post"`: each child's subtree left to right, then the node;
- `"level"`: by depth, left to right (breadth first).

`iter(node)` is the same as `node.walk("pre")`, so `list(node)` and `for v in node` work. Any other `order` raises `ValueError("Bad order")` **when `walk` is called**, not when the first value is requested.

**Requirements**

- The iterator is a proper iterator: `iter(it) is it`, `next(it)` gives the next value, and `StopIteration` once it is exhausted (and it **stays** exhausted).
- Every call to `walk` gives an **independent** iterator.
- Walking is **lazy**: creating the iterator does nothing, and asking for the first value must not visit the whole tree. The walker reads a node's `children` through the **attribute** `node.children`, and only when it needs to.
- It must not use recursion: a test walks a tree that is 5,000 levels deep.

**Example**

```
root = Node(1)
two = root.add(Node(2)); root.add(Node(3))
two.add(Node(4))
list(root.walk("pre"))     # [1, 2, 4, 3]
list(root.walk("post"))    # [4, 2, 3, 1]
list(root.walk("level"))   # [1, 2, 3, 4]
```''',
    starter=r'''class Node:
    def __init__(self, value, children=()):
        ...

    def add(self, child):
        ...

    def walk(self, order="pre"):
        ...

    def __iter__(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
root = Node(1)
two = root.add(Node(2))
three = root.add(Node(3))
assert two.value == 2 and root.children == [two, three]
two.add(Node(4))
two.add(Node(5))
three.add(Node(6))
assert list(root.walk("pre")) == [1, 2, 4, 5, 3, 6]
assert list(root.walk("post")) == [4, 5, 2, 6, 3, 1]
assert list(root.walk("level")) == [1, 2, 3, 4, 5, 6]
assert list(root) == [1, 2, 4, 5, 3, 6] and [v for v in root] == list(root.walk())
assert list(two.walk("pre")) == [2, 4, 5] and list(two.walk("post")) == [4, 5, 2]
assert list(Node("solo").walk("level")) == ["solo"]
assert error_of(root.walk, "in") == "ValueError: Bad order"
assert error_of(root.walk, None) == "ValueError: Bad order"
kids = [Node("a"), Node("b")]
parent = Node("p", kids)
kids.append(Node("c"))
assert list(parent) == ["p", "a", "b"] and len(parent.children) == 2
it = root.walk("level")
assert iter(it) is it
assert next(it) == 1 and next(it) == 2
other = root.walk("level")
assert next(other) == 1 and next(it) == 3 and next(other) == 2
rest = list(it)
assert rest == [4, 5, 6]
assert error_of(next, it) == "StopIteration: "
assert error_of(next, it) == "StopIteration: "
for order in ("pre", "post", "level"):
    pending = Node(1).walk(order)
    assert next(pending) == 1
    assert error_of(next, pending) == "StopIteration: "
calls = []
class Spy(Node):
    def __init__(self, value, kids=()):
        self.value = value
        self._kids = list(kids)
    @property
    def children(self):
        calls.append(self.value)
        return self._kids
leaves = [Spy(i) for i in range(1, 11)]
spy_root = Spy(0, [Spy(100 + i, [leaves[i]]) for i in range(10)])
spy_iter = spy_root.walk("pre")
assert calls == []
assert next(spy_iter) == 0
assert len(calls) <= 1
assert next(spy_iter) == 100
assert len(calls) <= 3
assert len(set(calls)) <= 3
assert list(spy_root.walk("pre"))[:3] == [0, 100, 1]
deep = Node(0)
tip = deep
for depth in range(1, 5000):
    tip = tip.add(Node(depth))
assert len(list(deep.walk("pre"))) == 5000 and list(deep.walk("pre"))[-1] == 4999
post = list(deep.walk("post"))
assert post[0] == 4999 and post[-1] == 0 and len(post) == 5000
assert list(deep.walk("level"))[:3] == [0, 1, 2]
wide = Node("r", [Node(i) for i in range(2000)])
assert list(wide.walk("level"))[:3] == ["r", 0, 1] and list(wide.walk("post"))[-1] == "r"
mixed = Node(1, [Node(2, [Node(4)]), Node(3, [Node(5, [Node(7)]), Node(6)])])
assert list(mixed.walk("level")) == [1, 2, 3, 4, 5, 6, 7]
assert list(mixed.walk("post")) == [4, 2, 7, 5, 6, 3, 1]
assert list(mixed.walk("pre")) == [1, 2, 4, 3, 5, 7, 6]''',
    solution=r'''from collections import deque


class Node:
    def __init__(self, value, children=()):
        self.value = value
        self.children = list(children)

    def add(self, child):
        self.children.append(child)
        return child

    def walk(self, order="pre"):
        if order == "pre":
            return _PreOrder(self)
        if order == "post":
            return _PostOrder(self)
        if order == "level":
            return _LevelOrder(self)
        raise ValueError("Bad order")

    def __iter__(self):
        return self.walk("pre")


class _Walker:
    def __iter__(self):
        return self


class _PreOrder(_Walker):
    def __init__(self, root):
        self._stack = [root]

    def __next__(self):
        if not self._stack:
            raise StopIteration
        node = self._stack.pop()
        self._stack.extend(reversed(node.children))
        return node.value


class _PostOrder(_Walker):
    def __init__(self, root):
        self._stack = [(root, False)]

    def __next__(self):
        while self._stack:
            node, expanded = self._stack.pop()
            if expanded:
                return node.value
            self._stack.append((node, True))
            self._stack.extend((child, False) for child in reversed(node.children))
        raise StopIteration


class _LevelOrder(_Walker):
    def __init__(self, root):
        self._queue = deque([root])

    def __next__(self):
        if not self._queue:
            raise StopIteration
        node = self._queue.popleft()
        self._queue.extend(node.children)
        return node.value''',
    hints=[
        r'''Write one small iterator class per order, each with `__iter__` (return `self`) and `__next__`. Recursion is out (5,000 levels), so every walker keeps its own explicit stack or queue of nodes still to visit.''',
        r'''Pre-order: pop a node, push its children in **reverse** (so the leftmost comes off first), return its value. Level order is the same with a queue (`deque.popleft`) and no reversing.''',
        r'''Post-order needs to remember "my children are already pushed". Push `(node, False)`; when popped unexpanded, push it back as `(node, True)` followed by its children (reversed); when popped expanded, return its value.''',
    ],
    explanation=r'''**The idea.** The Iterator pattern gives a collection a way to hand out its elements **one at a time without exposing how it is stored**. A tree has several sensible orders, so the tree offers `walk(order)` and each order is its own iterator object.

**Why an object, not a list.** Returning `list(...)` of all values would be simplest, but it visits the whole tree up front, and a huge tree costs the memory and time even if the caller wants the first five values. An iterator keeps only the *frontier*: the nodes still to visit. That is why the laziness test counts how many times `children` is read.

```mermaid
flowchart LR
    S["stack or queue of nodes still to visit"] --> N["__next__"]
    N --> P[take one node]
    P --> E[add its children to the frontier]
    E --> R[return its value]
```

**Stack versus queue.** Depth-first walks use a **stack** (last in, first out): go as deep as possible. Breadth-first uses a **queue** (first in, first out): finish one level before the next. The traversal code is otherwise identical, which is the whole lesson about graph search.

**Avoiding recursion.** A recursive generator is the textbook answer, but Python limits recursion to about 1,000 frames, so a 5,000-deep tree crashes it. An explicit stack lives on the heap and has no such limit.

**Post-order trick.** A node must come out *after* its children, so you push it twice: once to expand it and once, behind its children, to emit it.

**Iterator protocol.** `__iter__` returning `self` plus `__next__` raising `StopIteration` is all Python needs for `for`, `list`, `zip` and friends. Raising `StopIteration` again on every later call is what "stays exhausted" means.

**Going further.** Add a `"leaves"` order (only nodes without children). Which of the three walkers is the closest starting point?''',
),

P(
    slug='lld-chat-mediator', title='Chat Room Mediator', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/09-behavioral-patterns-ii/README.md',
    description='Build a chat room that sits between users, so that users never hold references to each other, with muting, private messages and recent history.',
    statement=r'''Write two classes, `User` and `ChatRoom`. The room is the **mediator**: users talk to the room and the room talks to users. A user must **never store a reference to another user or to the room**.

**`User(name)`**

- `name` and `inbox`, a list of `(sender_name, text, kind)` tuples in the order received. `kind` is `"public"`, `"private"` or `"history"`.
- `receive(sender_name, text, kind)` appends one entry to the inbox.

**`ChatRoom()`**

- `join(user)` adds the user. A name already in the room raises `ValueError("Name taken")`. The newcomer immediately receives the **last 3 public messages** sent before they joined (oldest first) as `"history"` entries.
- `leave(user)` removes the user and **forgets their mutes**. Anyone not in the room raises `ValueError("Not in room")`.
- `send(user, text)` sends a public message to **every other member who has not muted the sender**, and records it in the room's history. It returns the number of members who received it. `ValueError("Not in room")` if the sender is not a member, then `ValueError("Empty message")` if `text` is empty or only spaces.
- `private(user, to_name, text)` sends a message to one member and returns `True`; if that member has muted the sender it is **not delivered** and it returns `False`. Errors, in order: `"Not in room"` (sender), `"Empty message"`, `"No such user"` (nobody in the room has that name).
- `mute(user, name)` stops the user from receiving anything from `name` (public or private). `ValueError("Not in room")` for a non-member, `ValueError("Cannot mute yourself")` when `name` is the user's own name. `unmute(user, name)` undoes it; unmuting someone who is not muted does nothing.

Muting changes who **receives** a message; it does not remove the message from the room's history.

**Example**

```
room = ChatRoom()
ann, bob = User("ann"), User("bob")
room.join(ann); room.join(bob)
room.send(ann, "hi")          # 1
bob.inbox                     # [("ann", "hi", "public")]
```''',
    starter=r'''class User:
    def __init__(self, name):
        ...

    def receive(self, sender_name, text, kind):
        ...


class ChatRoom:
    def join(self, user):
        ...

    def leave(self, user):
        ...

    def send(self, user, text):
        ...

    def private(self, user, to_name, text):
        ...

    def mute(self, user, name):
        ...

    def unmute(self, user, name):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
room = ChatRoom()
ann, bob, cy = User("ann"), User("bob"), User("cy")
assert ann.name == "ann" and ann.inbox == []
assert error_of(room.send, ann, "hi") == "ValueError: Not in room"
assert error_of(room.leave, ann) == "ValueError: Not in room"
assert error_of(room.mute, ann, "bob") == "ValueError: Not in room"
room.join(ann)
assert error_of(room.join, User("ann")) == "ValueError: Name taken"
assert error_of(room.join, ann) == "ValueError: Name taken"
room.join(bob)
assert room.send(ann, "hi") == 1
assert bob.inbox == [("ann", "hi", "public")] and ann.inbox == []
assert error_of(room.send, User("ann"), "impostor") == "ValueError: Not in room"
assert error_of(room.send, ann, "") == "ValueError: Empty message"
assert error_of(room.send, ann, "   ") == "ValueError: Empty message"
assert error_of(room.send, User("ghost"), "") == "ValueError: Not in room"
room.join(cy)
assert cy.inbox == [("ann", "hi", "history")]
assert room.send(bob, "yo") == 2
assert ann.inbox == [("bob", "yo", "public")] and cy.inbox[-1] == ("bob", "yo", "public")
assert room.mute(ann, "bob") is None
assert room.send(bob, "again") == 1
assert [m for m in ann.inbox if m[1] == "again"] == [] and cy.inbox[-1] == ("bob", "again", "public")
assert room.send(ann, "from ann") == 2
assert room.private(bob, "ann", "psst") is False
assert ("bob", "psst", "private") not in ann.inbox
assert room.private(ann, "bob", "hello bob") is True
assert bob.inbox[-1] == ("ann", "hello bob", "private")
assert room.private(cy, "ann", "to ann") is True and ann.inbox[-1] == ("cy", "to ann", "private")
assert error_of(room.private, cy, "zed", "x") == "ValueError: No such user"
assert error_of(room.private, cy, "ann", "") == "ValueError: Empty message"
assert error_of(room.private, User("ghost"), "ann", "x") == "ValueError: Not in room"
assert error_of(room.private, cy, "zed", "") == "ValueError: Empty message"
assert error_of(room.mute, cy, "cy") == "ValueError: Cannot mute yourself"
room.unmute(ann, "bob")
room.unmute(ann, "bob")
assert room.send(bob, "back") == 2 and ann.inbox[-1] == ("bob", "back", "public")
assert room.private(bob, "ann", "now visible") is True and ann.inbox[-1] == ("bob", "now visible", "private")
room.mute(cy, "ann")
room.leave(cy)
assert error_of(room.send, cy, "x") == "ValueError: Not in room"
assert room.send(ann, "bye cy") == 1
dan = User("dan")
room.join(dan)
assert dan.inbox == [("ann", "from ann", "history"), ("bob", "back", "history"), ("ann", "bye cy", "history")]
room.join(cy)
room.send(ann, "cy is back")
assert cy.inbox[-1] == ("ann", "cy is back", "public")
cy2 = User("cy")
room.leave(cy)
room.join(cy2)
assert room.send(ann, "x") == 3
for member in (ann, bob, cy, dan):
    assert not any(isinstance(value, (User, ChatRoom)) for value in vars(member).values())
    assert not any(isinstance(item, (User, ChatRoom)) for value in vars(member).values() if isinstance(value, (list, dict, set)) for item in value)''',
    solution=r'''class User:
    def __init__(self, name):
        self.name = name
        self.inbox = []

    def receive(self, sender_name, text, kind):
        self.inbox.append((sender_name, text, kind))


class ChatRoom:
    def __init__(self):
        self._members = {}
        self._muted = {}
        self._history = []

    def _member(self, user):
        if self._members.get(user.name) is not user:
            raise ValueError("Not in room")

    def join(self, user):
        if user.name in self._members:
            raise ValueError("Name taken")
        for sender, text in self._history[-3:]:
            user.receive(sender, text, "history")
        self._members[user.name] = user
        self._muted[user.name] = set()

    def leave(self, user):
        self._member(user)
        del self._members[user.name]
        del self._muted[user.name]

    @staticmethod
    def _check_text(text):
        if not text.strip():
            raise ValueError("Empty message")

    def send(self, user, text):
        self._member(user)
        self._check_text(text)
        self._history.append((user.name, text))
        delivered = 0
        for name, member in self._members.items():
            if name != user.name and user.name not in self._muted[name]:
                member.receive(user.name, text, "public")
                delivered += 1
        return delivered

    def private(self, user, to_name, text):
        self._member(user)
        self._check_text(text)
        if to_name not in self._members:
            raise ValueError("No such user")
        if user.name in self._muted[to_name]:
            return False
        self._members[to_name].receive(user.name, text, "private")
        return True

    def mute(self, user, name):
        self._member(user)
        if name == user.name:
            raise ValueError("Cannot mute yourself")
        self._muted[user.name].add(name)

    def unmute(self, user, name):
        self._member(user)
        self._muted[user.name].discard(name)''',
    hints=[
        r'''The room owns everything that relates users: a dictionary of members by name, a set of muted names per member, and the public history. A `User` only has a name and an inbox; it never holds another user.''',
        r'''Check things in the order the statement gives: member first, then the text, then the recipient. A user is "in the room" only if the dictionary holds *that object* under their name (a different `User` with the same name is not them).''',
        r'''On `join`, send the last three history entries **before** adding the user, so they do not also get live messages twice. On `leave`, delete the user's mute set so a returning user starts clean.''',
    ],
    explanation=r'''**The idea.** Without a mediator, every user would need a list of every other user to send them a message: N users, N x N connections, and every new rule (muting, private messages) spreads across all of them. The Mediator pattern routes every message through **one object**, so the connections become N, one per user.

```mermaid
flowchart LR
    subgraph before["without a mediator"]
        A1[ann] --- B1[bob]
        A1 --- C1[cy]
        B1 --- C1
    end
    subgraph after["with a mediator"]
        A2[ann] --- R((room))
        B2[bob] --- R
        C2[cy] --- R
    end
```

**Where the rules live.** Muting, history, "who is a member" all live in `ChatRoom`. A `User` knows how to receive a message, nothing more. That is why the last test checks that no user holds a `User` or `ChatRoom`: the whole point is that users are decoupled from each other.

**Receiver decides, room enforces.** A mute is a preference of the *receiver*, but it is stored in the room, because the sender must not need to know about it. `private` returns `False` instead of an error so the sender cannot probe who has muted them.

**Identity versus name.** Names are unique inside a room, but `join(User("ann"))` for a second object named "ann" must fail, and a stranger named "ann" must not be able to `send` as the member "ann". Comparing the *object* (`is`), not just the name, closes that hole.

**Trade-off.** A mediator concentrates logic; in a big system it can grow into a "god object". Keep it to coordination (who gets what) and push everything else into the colleagues.

**Going further.** Add rooms by topic: a `Lobby` holding several `ChatRoom`s. Is the lobby another mediator, or something else?''',
),

P(
    slug='lld-product-filters', title='Product Filters (Specification)', topic='lld-patterns-in-use', difficulty='advanced',
    module='lld/07-structural-patterns/README.md',
    description='Build composable filter rules that combine with &, | and ~, describe themselves in words, short-circuit and accept custom rules.',
    statement=r'''Write a small **specification** library for filtering dictionaries (products, users, anything).

**`Spec`** is the base class of every rule. A subclass must implement `is_satisfied_by(item)`, which returns a bool. `Spec` itself provides:

- `a & b` is a rule that holds when **both** hold; `a | b` when **either** holds; `~a` when `a` does **not** hold. They return new rules and change neither operand.
- `a.filter(items)` returns the list of items (in order) that satisfy the rule.
- `a.describe()` returns the rule as text, see below.

`And` and `Or` are **short-circuiting**: `a & b` does not ask `b` when `a` already failed; `a | b` does not ask `b` when `a` already held.

**`where(field, op, value)`** returns a rule about one field. The operators are `"=="`, `"!="`, `"<"`, `"<="`, `">"`, `">="`, `"in"` (the item's value is in the collection `value`) and `"contains"` (`value` is in the item's value). Any other operator raises `ValueError("Unknown operator")` **when `where` is called**.

- An item **without** that field does not satisfy the rule (for every operator, `"!="` included).
- A comparison Python cannot make (a string compared with `<` to a number, say) simply does not hold, instead of raising.

**Describing.** A single `where` is `field op value` with the value shown by `repr`: `price < 50`, `color == 'red'`. `a & b` is `(<a> and <b>)`, `a | b` is `(<a> or <b>)`, and `~a` is `not <a>`. Custom rules describe themselves with the class name, `ClassName()`, unless they override `describe()`.

**Example**

```
cheap_red = where("price", "<", 50) & where("color", "==", "red")
cheap_red.describe()     # "(price < 50 and color == 'red')"
(~cheap_red).describe()  # "not (price < 50 and color == 'red')"
```''',
    starter=r'''class Spec:
    def is_satisfied_by(self, item):
        raise NotImplementedError

    def filter(self, items):
        ...

    def describe(self):
        ...


def where(field, op, value):
    ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
items = [
    {"name": "pen", "price": 5, "color": "red", "tags": ["office", "cheap"]},
    {"name": "lamp", "price": 80, "color": "red", "tags": ["home"]},
    {"name": "mug", "price": 12, "color": "blue", "tags": ["home", "cheap"]},
    {"name": "desk", "price": 300, "tags": ["office"]},
]
def names(spec):
    return [item["name"] for item in spec.filter(items)]
assert names(where("price", "<", 50)) == ["pen", "mug"]
assert names(where("price", "<=", 12)) == ["pen", "mug"] and names(where("price", "<", 12)) == ["pen"]
assert names(where("price", ">", 80)) == ["desk"]
assert names(where("price", ">=", 80)) == ["lamp", "desk"]
assert names(where("color", "==", "red")) == ["pen", "lamp"]
assert names(where("color", "!=", "red")) == ["mug"]
assert names(where("color", "in", ["blue", "green"])) == ["mug"]
assert names(where("tags", "contains", "home")) == ["lamp", "mug"]
assert names(where("name", "contains", "u")) == ["mug"]
assert names(where("missing", "==", 1)) == [] and names(where("missing", "!=", 1)) == []
assert names(where("color", "<", 5)) == []
assert error_of(where, "a", "~", 1) == "ValueError: Unknown operator"
assert error_of(where, "a", "like", 1) == "ValueError: Unknown operator"
cheap, red = where("price", "<", 50), where("color", "==", "red")
assert names(cheap & red) == ["pen"] and names(cheap | red) == ["pen", "lamp", "mug"]
assert names(~cheap) == ["lamp", "desk"] and names(~red) == ["mug", "desk"]
assert names(~(cheap | red)) == ["desk"] and names(~~cheap) == names(cheap)
assert names(cheap & ~red) == ["mug"] and names(where("tags", "contains", "home") & ~cheap) == ["lamp"]
assert names(~where("missing", "==", 1)) == ["pen", "lamp", "mug", "desk"]
assert cheap.describe() == "price < 50" and red.describe() == "color == 'red'"
assert (cheap & red).describe() == "(price < 50 and color == 'red')"
assert (cheap | red).describe() == "(price < 50 or color == 'red')"
assert (~cheap).describe() == "not price < 50"
assert (~(cheap & red)).describe() == "not (price < 50 and color == 'red')"
assert ((cheap | red) & ~where("name", "in", ["pen"])).describe() == "((price < 50 or color == 'red') and not name in ['pen'])"
assert names(cheap) == ["pen", "mug"]
class InStock(Spec):
    def __init__(self, stock):
        self.stock = stock
    def is_satisfied_by(self, item):
        return self.stock.get(item["name"], 0) > 0
in_stock = InStock({"pen": 4, "desk": 1})
assert names(in_stock) == ["pen", "desk"] and names(in_stock & cheap) == ["pen"] and names(~in_stock) == ["lamp", "mug"]
assert in_stock.describe() == "InStock()"
assert (in_stock & cheap).describe() == "(InStock() and price < 50)"
class Named(Spec):
    def is_satisfied_by(self, item):
        return True
    def describe(self):
        return "anything"
assert (Named() | cheap).describe() == "(anything or price < 50)"
calls = []
class Probe(Spec):
    def __init__(self, label, answer):
        self.label, self.answer = label, answer
    def is_satisfied_by(self, item):
        calls.append(self.label)
        return self.answer
assert (Probe("a", False) & Probe("b", True)).is_satisfied_by({}) is False and calls == ["a"]
del calls[:]
assert (Probe("a", True) | Probe("b", False)).is_satisfied_by({}) is True and calls == ["a"]
del calls[:]
assert (Probe("a", True) & Probe("b", True)).is_satisfied_by({}) is True and calls == ["a", "b"]
del calls[:]
assert (Probe("a", False) | Probe("b", True)).is_satisfied_by({}) is True and calls == ["a", "b"]
assert (~Probe("n", False)).is_satisfied_by({}) is True
combined = cheap & red
assert names(cheap) == ["pen", "mug"] and names(red) == ["pen", "lamp"] and names(combined) == ["pen"]
assert items[0]["price"] == 5 and where("price", "<", 50).filter([]) == []''',
    solution=r'''class Spec:
    def is_satisfied_by(self, item):
        raise NotImplementedError

    def filter(self, items):
        return [item for item in items if self.is_satisfied_by(item)]

    def describe(self):
        return type(self).__name__ + "()"

    def __and__(self, other):
        return _And(self, other)

    def __or__(self, other):
        return _Or(self, other)

    def __invert__(self):
        return _Not(self)


class _And(Spec):
    def __init__(self, left, right):
        self._left, self._right = left, right

    def is_satisfied_by(self, item):
        return self._left.is_satisfied_by(item) and self._right.is_satisfied_by(item)

    def describe(self):
        return f"({self._left.describe()} and {self._right.describe()})"


class _Or(Spec):
    def __init__(self, left, right):
        self._left, self._right = left, right

    def is_satisfied_by(self, item):
        return self._left.is_satisfied_by(item) or self._right.is_satisfied_by(item)

    def describe(self):
        return f"({self._left.describe()} or {self._right.describe()})"


class _Not(Spec):
    def __init__(self, inner):
        self._inner = inner

    def is_satisfied_by(self, item):
        return not self._inner.is_satisfied_by(item)

    def describe(self):
        return "not " + self._inner.describe()


_OPERATORS = {
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "in": lambda a, b: a in b,
    "contains": lambda a, b: b in a,
}


class _Where(Spec):
    def __init__(self, field, op, value):
        self._field, self._op, self._value = field, op, value

    def is_satisfied_by(self, item):
        if self._field not in item:
            return False
        try:
            return bool(_OPERATORS[self._op](item[self._field], self._value))
        except TypeError:
            return False

    def describe(self):
        return f"{self._field} {self._op} {self._value!r}"


def where(field, op, value):
    if op not in _OPERATORS:
        raise ValueError("Unknown operator")
    return _Where(field, op, value)''',
    hints=[
        r'''Three small combinator classes (`And`, `Or`, `Not`) hold their operands and implement `is_satisfied_by` by asking them. Python's `and` / `or` already short-circuit, so use them directly instead of computing both sides first.''',
        r'''Put the operators in a dictionary from the symbol to a small function. `where` checks the symbol is in the dictionary immediately (so the error comes from `where`, not from a later `filter`).''',
        r'''A leaf rule returns `False` for a missing field *before* trying the operator, and catches `TypeError` around the comparison. `describe` is built from the children's `describe`, so nested rules print themselves with no extra code.''',
    ],
    explanation=r'''**The idea.** The Specification pattern turns a business rule ("cheap and red") into an **object** you can combine, test, print and pass around. Instead of one function with a growing pile of `if` flags, you build rules from small ones.

```mermaid
classDiagram
    class Spec {
        is_satisfied_by(item)
        describe()
        filter(items)
    }
    Spec <|-- Where
    Spec <|-- And
    Spec <|-- Or
    Spec <|-- Not
    And o-- Spec
    Or o-- Spec
    Not o-- Spec
```

**Composite in disguise.** `And`, `Or` and `Not` are *composites*: they are `Spec`s that contain `Spec`s. Because every rule has the same two methods, a rule built from rules is used exactly like a simple one. The same trick appears in expression trees, file systems and UI widgets.

**Operator overloading.** `&`, `|` and `~` map to `__and__`, `__or__` and `__invert__`, so `where(...) & ~where(...)` reads like the sentence it means. (Python's `and` / `or` / `not` cannot be overloaded, which is why symbols are used.)

**Open for extension.** The test defines `InStock`, a rule the library has never heard of, and combines it with the built-in ones. That is the Open/Closed principle: new behaviour is a new subclass, with no edits to existing code.

**Self-description.** A rule that can describe itself is easy to log ("why was this product hidden?") and to test. It costs one method per class and falls out of the structure.

**Short-circuiting** matters when a rule is expensive (a database call): `cheap & expensive_check` only runs the expensive part for cheap items.

**Going further.** Translate a `Spec` tree into a SQL `WHERE` clause. Which classes need a new method, and what must `InStock` do to take part?''',
),
]
