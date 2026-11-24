PROBLEMS = [
P(
    slug='lld-checkout-discounts', title='Checkout with Pluggable Discounts', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/08-behavioral-patterns-i/README.md',
    description='Build a checkout that applies any discount object, so a new promotion never means editing the checkout (Strategy).',
    statement=r'''Write a shopping `Checkout` that can apply **any** discount, and three discounts to go with it. Prices are whole **cents**.

**A discount** is any object with

- a `name` (text), and
- a method `amount(items)` that returns how many cents it takes off (a whole number, `0` or more).

`items` is a list of `(name, unit_price, qty)` tuples, in the order they were added.

**The three discounts you write**

| Class | `name` | `amount(items)` |
|---|---|---|
| `PercentOff(percent)` | `"10% off"` | the subtotal times `percent`, divided by 100, **rounded down** (whole-number arithmetic) |
| `BuyNGetOneFree(item_name, n)` | `"Buy 2 pen, get 1 free"` | the number of items called `item_name` across all lines is `q`; `q // (n + 1)` of them are free, each worth that item's unit price (all lines of one item have the same price). `0` when the item is not in the cart |
| `FlatOff(cents, minimum)` | `"500 off over 2000"` | `cents` when the subtotal is at least `minimum`, otherwise `0` |

**`Checkout(discounts=())`**

- `add(name, unit_price, qty=1)` adds a line.
- `add_discount(discount)` adds one more discount to **this** checkout only. A list passed to the constructor is not changed, and two checkouts never share discounts.
- `subtotal()` is the sum of `unit_price * qty` over all lines.
- `applied()` returns `[(discount.name, amount), ...]` for every discount whose amount is more than `0`, in the order the discounts were given. Every discount is worked out from the **original** items (they do not stack on each other).
- `total()` is the subtotal minus all the amounts, but never below `0`.
- Each discount is handed **its own copy** of the items list, so a discount that edits the list cannot affect the cart or the other discounts.

**Your `Checkout` is tested with discounts you have never seen.** The tests define their own discount classes and plug them in. It must work through the `name` and `amount` interface alone.

**Example**

```
shop = Checkout([PercentOff(10), BuyNGetOneFree("pen", 2)])
shop.add("pen", 120, 3)          # 360
shop.add("book", 1500)           # 1500
shop.applied()                   # [("10% off", 186), ("Buy 2 pen, get 1 free", 120)]
shop.total()                     # 1860 - 186 - 120 = 1554
```''',
    starter=r'''class PercentOff:
    def __init__(self, percent):
        ...

    def amount(self, items):
        """Cents off: the subtotal times percent / 100, rounded down."""
        ...


class BuyNGetOneFree:
    def __init__(self, item_name, n):
        ...

    def amount(self, items):
        """Cents off: the free units of `item_name`, at its unit price."""
        ...


class FlatOff:
    def __init__(self, cents, minimum):
        ...

    def amount(self, items):
        """`cents` off when the subtotal reaches `minimum`, else 0."""
        ...


class Checkout:
    def __init__(self, discounts=()):
        ...

    def add(self, name, unit_price, qty=1):
        ...

    def add_discount(self, discount):
        ...

    def subtotal(self):
        ...

    def applied(self):
        """[(name, cents_off), ...] for the discounts that take something off."""
        ...

    def total(self):
        ...''',
    tests=r'''def subtotal_of(items):
    return sum(price * qty for _, price, qty in items)
assert PercentOff(10).name == "10% off"
assert BuyNGetOneFree("pen", 2).name == "Buy 2 pen, get 1 free"
assert FlatOff(500, 2000).name == "500 off over 2000"
assert PercentOff(10).amount([("pen", 120, 3), ("book", 1500, 1)]) == 186
assert PercentOff(15).amount([("x", 99, 1)]) == 14
assert BuyNGetOneFree("pen", 2).amount([("pen", 120, 3)]) == 120
assert BuyNGetOneFree("pen", 2).amount([("pen", 120, 2)]) == 0
assert BuyNGetOneFree("pen", 2).amount([("pen", 120, 4), ("book", 5, 9), ("pen", 120, 2)]) == 240
assert BuyNGetOneFree("pen", 2).amount([("book", 5, 9)]) == 0
assert FlatOff(500, 2000).amount([("x", 2000, 1)]) == 500
assert FlatOff(500, 2000).amount([("x", 1999, 1)]) == 0
plain = Checkout()
plain.add("pen", 120, 3)
plain.add("book", 1500)
assert plain.subtotal() == 1860
assert plain.total() == 1860
assert plain.applied() == []
shop = Checkout([PercentOff(10), BuyNGetOneFree("pen", 2), FlatOff(500, 2000)])
shop.add("pen", 120, 3)
shop.add("book", 1500)
assert shop.applied() == [("10% off", 186), ("Buy 2 pen, get 1 free", 120)]
assert shop.total() == 1554
shop.add("lamp", 400)
assert shop.applied() == [("10% off", 226), ("Buy 2 pen, get 1 free", 120), ("500 off over 2000", 500)]
assert shop.total() == 1414
cheap = Checkout([PercentOff(100), FlatOff(50, 0)])
cheap.add("x", 100)
assert cheap.total() == 0
class FirstItemFree:
    name = "First item free"
    def amount(self, items):
        return items[0][1] if items else 0
promo = Checkout([FirstItemFree()])
promo.add("tea", 300, 2)
promo.add("cake", 450)
assert promo.applied() == [("First item free", 300)]
assert promo.total() == 750
promo.add_discount(PercentOff(10))
assert promo.applied() == [("First item free", 300), ("10% off", 105)]
assert promo.total() == 645
class Spy:
    name = "spy"
    def __init__(self):
        self.calls = []
    def amount(self, items):
        self.calls.append(list(items))
        return 0
spy = Spy()
watched = Checkout([spy])
watched.add("a", 10)
watched.add("b", 20, 2)
watched.total()
assert spy.calls[0] == [("a", 10, 1), ("b", 20, 2)]
class Greedy:
    name = "greedy"
    def amount(self, items):
        items.clear()
        return 5
guard = Checkout([Greedy(), PercentOff(50)])
guard.add("x", 100)
assert guard.applied() == [("greedy", 5), ("50% off", 50)]
assert guard.subtotal() == 100
assert guard.total() == 45
class Duck:
    pass
duck = Duck()
duck.name = "duck"
duck.amount = lambda items: 7
quack = Checkout([duck])
quack.add("x", 50)
assert quack.applied() == [("duck", 7)]
first = Checkout()
first.add_discount(PercentOff(50))
second = Checkout()
second.add("x", 100)
assert second.total() == 100
given = [PercentOff(10)]
mine = Checkout(given)
mine.add_discount(FlatOff(1, 0))
assert len(given) == 1''',
    solution=r'''class PercentOff:
    def __init__(self, percent):
        self.percent = percent
        self.name = f"{percent}% off"

    def amount(self, items):
        subtotal = sum(price * qty for _, price, qty in items)
        return subtotal * self.percent // 100


class BuyNGetOneFree:
    def __init__(self, item_name, n):
        self.item_name = item_name
        self.n = n
        self.name = f"Buy {n} {item_name}, get 1 free"

    def amount(self, items):
        lines = [(price, qty) for name, price, qty in items if name == self.item_name]
        if not lines:
            return 0
        free = sum(qty for _, qty in lines) // (self.n + 1)
        return free * lines[0][0]


class FlatOff:
    def __init__(self, cents, minimum):
        self.cents = cents
        self.minimum = minimum
        self.name = f"{cents} off over {minimum}"

    def amount(self, items):
        subtotal = sum(price * qty for _, price, qty in items)
        return self.cents if subtotal >= self.minimum else 0


class Checkout:
    def __init__(self, discounts=()):
        self._items = []
        self._discounts = list(discounts)

    def add(self, name, unit_price, qty=1):
        self._items.append((name, unit_price, qty))

    def add_discount(self, discount):
        self._discounts.append(discount)

    def subtotal(self):
        return sum(price * qty for _, price, qty in self._items)

    def applied(self):
        result = []
        for discount in self._discounts:
            off = discount.amount(list(self._items))
            if off > 0:
                result.append((discount.name, off))
        return result

    def total(self):
        return max(0, self.subtotal() - sum(off for _, off in self.applied()))''',
    hints=[
        r'''`Checkout` should never ask *which kind* of discount it has. It loops over the discounts it was given and calls `discount.amount(items)` on each: no `isinstance`, no `if name == "percent"`.''',
        r'''Put the arithmetic of each promotion in its own class and keep `Checkout` ignorant of all of them. Use whole-number maths for percentages (`subtotal * percent // 100`), not floats, so cents never drift.''',
        r'''Two classic traps: a default argument such as `discounts=[]` is created **once** and shared by every checkout, and passing your own `self._items` to a discount lets a careless discount edit your cart. Copy in, and copy out.''',
    ],
    explanation=r'''**The idea.** This is the **Strategy** pattern: a family of interchangeable algorithms (here, ways to compute a discount) behind one small interface, chosen by whoever builds the object, not by `if` statements inside it.

```mermaid
classDiagram
    class Checkout {
        +add(name, unit_price, qty)
        +add_discount(discount)
        +applied()
        +total()
    }
    class Discount {
        <<interface>>
        +name
        +amount(items)
    }
    Checkout o-- Discount : many
    Discount <|.. PercentOff
    Discount <|.. BuyNGetOneFree
    Discount <|.. FlatOff
    Discount <|.. YourNextPromotion
```

**Why it matters.** The wrong version of this problem has `Checkout.total()` full of `if kind == "percent": ... elif kind == "bogo": ...`. Every new promotion edits `Checkout`, and every edit risks breaking the others. With Strategy the checkout is closed for modification and open for extension (the **O** in SOLID): the test that plugs in `FirstItemFree`, a class you have never seen, passes only if you never named a concrete discount inside `Checkout`.

**Notice what you did not need.** There is no `Discount` base class in this problem. Python's duck typing means "has a `name` and an `amount` method" *is* the interface (one test uses a plain object with a lambda). In Java or C# you would write an `interface IDiscount`; in Python a `Protocol` or an abstract base class is optional documentation.

**Details worth a sentence in an interview.**

- Money is integers. Floats turn `0.1 + 0.2` into trouble; whole cents never do.
- Each discount sees the original items, so the order of discounts does not change any amount, only the order of `applied()`.
- Handing out copies of the items is *defensive copying*: the checkout does not trust a plug-in to behave.
- The mutable default argument is the single most common Python bug in this kind of code.

**Going further.** Real stores need rules such as "discounts stack, but only one percentage". Where would that rule live: in the discounts, in `Checkout`, or in a third object? What does each choice cost when a new rule arrives?''',
),

P(
    slug='lld-editor-undo-redo', title='Text Editor with Undo and Redo', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/08-behavioral-patterns-i/README.md',
    description='Build an editor whose edits are command objects, so undo and redo work for commands that did not exist when the editor was written.',
    statement=r'''Write an `Editor` that keeps a piece of text and can undo and redo edits, and four commands to go with it.

**A command** is any object with two methods, both taking the editor: `execute(editor)` does the edit and `undo(editor)` takes it back. A command reads and writes the text through `editor.text`.

**`Editor(text="", limit=None)`**

- `text` is the current text.
- `execute(command)` runs `command.execute(editor)` and remembers it so it can be undone. Running a new command **clears everything that could be redone**.
- `undo()` takes back the most recent command and returns `True`, or returns `False` when there is nothing to undo.
- `redo()` runs the most recently undone command again and returns `True`, or returns `False` when there is nothing to redo. After a `redo()` the command can be undone again.
- `can_undo` and `can_redo` are properties (`True` or `False`).
- `limit` is the most commands the editor remembers. When there are more, the **oldest** is forgotten (it can no longer be undone). `None` means no limit.

**The four commands you write**

- `Insert(pos, s)` puts `s` into the text at index `pos`. A `pos` past the end means "at the end". Undo removes exactly what it inserted.
- `Delete(pos, length)` removes up to `length` characters starting at `pos` (fewer if the text ends first, none if `pos` is past the end). Undo puts back exactly what was removed.
- `Upper()` turns the whole text to upper case. Undo restores the text as it was.
- `Macro(commands)` is a list of commands that counts as **one**: executing it executes them in order, and undoing it undoes them in **reverse** order. A macro may contain other macros.

**Your `Editor` is tested with commands you have never seen.** The tests define their own command classes and run them through `execute`, `undo` and `redo`. The editor must work through the two methods alone.

**Example**

```
ed = Editor("hello")
ed.execute(Insert(5, " world"))     # "hello world"
ed.execute(Upper())                  # "HELLO WORLD"
ed.undo()                            # "hello world"
ed.undo()                            # "hello"
ed.redo()                            # "hello world"
```''',
    starter=r'''class Editor:
    def __init__(self, text="", limit=None):
        """`limit` is how many commands can be undone (None for no limit)."""
        ...

    @property
    def can_undo(self):
        ...

    @property
    def can_redo(self):
        ...

    def execute(self, command):
        """Run the command, remember it for undo, and forget anything that could be redone."""
        ...

    def undo(self):
        """Take back the last command. True if there was one."""
        ...

    def redo(self):
        """Run the last undone command again. True if there was one."""
        ...


class Insert:
    def __init__(self, pos, s):
        ...

    def execute(self, editor):
        ...

    def undo(self, editor):
        ...


class Delete:
    def __init__(self, pos, length):
        ...

    def execute(self, editor):
        ...

    def undo(self, editor):
        ...


class Upper:
    def execute(self, editor):
        ...

    def undo(self, editor):
        ...


class Macro:
    def __init__(self, commands):
        ...

    def execute(self, editor):
        ...

    def undo(self, editor):
        ...''',
    tests=r'''def run(command):
    """A step: execute this command."""
    return lambda editor: editor.execute(command)
def texts(editor, *steps):
    """Run each step on the editor and return the text after each one."""
    seen = []
    for step in steps:
        step(editor)
        seen.append(editor.text)
    return seen
fresh = Editor("hello")
assert (fresh.text, fresh.can_undo, fresh.can_redo) == ("hello", False, False)
assert (fresh.undo(), fresh.redo()) == (False, False)
assert texts(Editor("hello"), run(Insert(5, " world")), run(Delete(0, 6)), Editor.undo, Editor.undo, Editor.undo, Editor.redo) == ["hello world", "world", "hello world", "hello", "hello", "hello world"]
flags = Editor("a")
flags.execute(Insert(1, "b"))
assert (flags.can_undo, flags.can_redo) == (True, False)
assert (flags.undo(), flags.can_undo, flags.can_redo) == (True, False, True)
assert (flags.redo(), flags.can_undo, flags.can_redo, flags.text) == (True, True, False, "ab")
assert (flags.undo(), flags.text) == (True, "a")
cleared = Editor("hello")
cleared.execute(Insert(5, " world"))
cleared.execute(Delete(0, 6))
cleared.undo()
cleared.undo()
cleared.redo()
cleared.execute(Upper())
assert (cleared.text, cleared.can_redo, cleared.redo()) == ("HELLO WORLD", False, False)
assert texts(cleared, Editor.undo, Editor.undo) == ["hello world", "hello"]
assert texts(Editor("abc"), run(Insert(99, "!")), Editor.undo) == ["abc!", "abc"]
assert texts(Editor("abcd"), run(Delete(1, 99)), Editor.undo) == ["a", "abcd"]
assert texts(Editor("ab"), run(Delete(10, 2)), Editor.undo) == ["ab", "ab"]
assert texts(Editor("ac"), run(Insert(1, "b")), run(Delete(0, 1)), Editor.undo, Editor.undo) == ["abc", "bc", "abc", "ac"]
assert texts(Editor("Hello World"), run(Upper()), Editor.undo, Editor.redo) == ["HELLO WORLD", "Hello World", "HELLO WORLD"]
assert texts(Editor("hi"), run(Macro([Insert(0, "> "), Upper()])), Editor.undo, Editor.redo) == ["> HI", "hi", "> HI"]
single = Editor("hi")
single.execute(Macro([Insert(0, "> "), Upper()]))
single.undo()
assert single.can_undo is False
assert texts(Editor(""), run(Macro([Insert(0, "ab"), Delete(0, 1)])), Editor.undo) == ["b", ""]
assert texts(Editor("x"), run(Macro([Macro([Insert(1, "y"), Insert(2, "z")]), Upper()])), Editor.undo) == ["XYZ", "x"]
capped = Editor("", limit=2)
for letter in "abc":
    capped.execute(Insert(99, letter))
assert capped.text == "abc"
assert ([capped.undo() for _ in range(3)], capped.text) == ([True, True, False], "a")
assert ([capped.redo() for _ in range(3)], capped.text) == ([True, True, False], "abc")
class Reverse:
    def execute(self, editor):
        editor.text = editor.text[::-1]
    def undo(self, editor):
        editor.text = editor.text[::-1]
assert texts(Editor("abc"), run(Reverse()), run(Insert(0, "X")), Editor.undo, Editor.undo, Editor.redo) == ["cba", "Xcba", "cba", "abc", "cba"]
assert texts(Editor("ab"), run(Macro([Reverse(), Insert(0, "-")])), Editor.undo) == ["-ba", "ab"]
class Probe:
    def __init__(self):
        self.seen = []
    def execute(self, editor):
        self.seen.append(("execute", editor.text))
    def undo(self, editor):
        self.seen.append(("undo", editor.text))
probe = Probe()
watched = Editor("t")
watched.execute(probe)
watched.undo()
watched.redo()
assert probe.seen == [("execute", "t"), ("undo", "t"), ("execute", "t")]''',
    solution=r'''class Editor:
    def __init__(self, text="", limit=None):
        self.text = text
        self._limit = limit
        self._undo = []
        self._redo = []

    @property
    def can_undo(self):
        return bool(self._undo)

    @property
    def can_redo(self):
        return bool(self._redo)

    def execute(self, command):
        command.execute(self)
        self._undo.append(command)
        if self._limit is not None and len(self._undo) > self._limit:
            del self._undo[0]
        self._redo.clear()

    def undo(self):
        if not self._undo:
            return False
        command = self._undo.pop()
        command.undo(self)
        self._redo.append(command)
        return True

    def redo(self):
        if not self._redo:
            return False
        command = self._redo.pop()
        command.execute(self)
        self._undo.append(command)
        return True


class Insert:
    def __init__(self, pos, s):
        self.pos = pos
        self.s = s

    def execute(self, editor):
        self._at = min(self.pos, len(editor.text))
        editor.text = editor.text[:self._at] + self.s + editor.text[self._at:]

    def undo(self, editor):
        editor.text = editor.text[:self._at] + editor.text[self._at + len(self.s):]


class Delete:
    def __init__(self, pos, length):
        self.pos = pos
        self.length = length

    def execute(self, editor):
        self._at = min(self.pos, len(editor.text))
        self._removed = editor.text[self._at:self._at + self.length]
        editor.text = editor.text[:self._at] + editor.text[self._at + len(self._removed):]

    def undo(self, editor):
        editor.text = editor.text[:self._at] + self._removed + editor.text[self._at:]


class Upper:
    def execute(self, editor):
        self._before = editor.text
        editor.text = editor.text.upper()

    def undo(self, editor):
        editor.text = self._before


class Macro:
    def __init__(self, commands):
        self.commands = list(commands)

    def execute(self, editor):
        for command in self.commands:
            command.execute(editor)

    def undo(self, editor):
        for command in reversed(self.commands):
            command.undo(editor)''',
    hints=[
        r'''Keep two stacks of command objects, one for undo and one for redo. `execute` pushes on the first and empties the second; `undo` moves one command from the first to the second; `redo` moves it back.''',
        r'''Each command must remember whatever it needs to reverse itself *at the moment it runs*: the position it really used (after clamping) and the text it removed. The editor never looks inside a command; it only calls `execute(editor)` and `undo(editor)`.''',
        r'''A macro is a command that holds commands. Its `undo` must go **backwards**: the last thing it did is the first thing to take back. Do not forget that a redone command goes back on the undo stack.''',
    ],
    explanation=r'''**The idea.** This is the **Command** pattern. An edit becomes an *object* that knows how to do itself and how to undo itself. Once edits are objects you can keep them in a list, which is all that undo and redo are: two stacks.

```mermaid
classDiagram
    class Editor {
        +text
        -undo_stack
        -redo_stack
        +execute(command)
        +undo()
        +redo()
    }
    class Command {
        <<interface>>
        +execute(editor)
        +undo(editor)
    }
    Editor o-- Command : remembers
    Command <|.. Insert
    Command <|.. Delete
    Command <|.. Upper
    Command <|.. Macro
    Macro o-- Command : composes
```

**Why the editor stays small.** `Editor` does not know what an insert or a delete is. It calls two methods. That is why a test can hand it a `Reverse` command written five minutes ago and undo/redo just works: adding a feature means adding a class, not changing `Editor`. A version that checks `isinstance(command, Insert)` fails that test, and it is also what turns a 40-line class into a 400-line one in real code.

**Where the undo information lives.** The command stores what it needs *when it executes*, not when it is built. `Delete` only knows what it removed after it has looked at the text; `Insert` only knows its real position after clamping `pos` to the length. Compute it in `execute`, use it in `undo`.

**Redo is cleared by a new edit.** After you undo twice and then type something new, the two undone edits would apply to a different document than the one they were made on, so they are discarded. Every editor you use does this.

**Macro is Composite + Command.** A macro is a command made of commands, which makes "one undo step" for a whole group trivial. The reverse-order undo is the part people get wrong: undoing the steps in the order they ran puts the text back wrongly, and the macro test checks exactly that.

**Complexity.** Each operation is O(size of the edit); the stacks add O(1). Real editors store *diffs* rather than whole-text snapshots like `Upper` does, to keep memory down on large files.

**Going further.** Typing "hello" is five `Insert`s, but a user expects one undo to remove the word. How would you merge consecutive inserts into one command?''',
),

P(
    slug='lld-request-middleware', title='Request Middleware Pipeline', topic='lld-patterns-in-use', difficulty='advanced',
    module='lld/09-behavioral-patterns-ii/README.md',
    description='Build a middleware pipeline where each handler can change the request, stop the chain, retry the rest or change the response (Chain of Responsibility).',
    statement=r'''Write a class `Pipeline` that runs a request through a chain of **middleware** and then an **endpoint**, the way web frameworks do.

- The **endpoint** is a function `endpoint(request) -> response`.
- A **middleware** is a function `middleware(request, call_next) -> response`. `call_next(request)` runs the **rest of the chain** (the next middleware, or the endpoint after the last one) and returns its response.

Requests and responses can be any objects (the examples use dictionaries).

**`Pipeline(endpoint)`**

- `use(middleware)` adds a middleware **after** the ones already added, and **returns the pipeline** so calls can be chained: `Pipeline(app).use(a).use(b)`. The first middleware added is the **outermost**: it sees the request first and the response last.
- `handle(request)` sends the request through the chain and returns the final response.

**What a middleware may do** (your pipeline must allow all of it)

- change the request before calling `call_next`, or change the response after;
- not call `call_next` at all, and return its own response (the rest of the chain, and the endpoint, never run);
- call `call_next` **more than once** (a retry), each call running the rest of the chain again from that point;
- catch an exception raised further down, or let it pass up. **An exception nobody catches reaches the caller of `handle` unchanged.**

**Other rules**

- A pipeline can be used for any number of requests, and `handle` can be called while another `handle` on the **same pipeline** is still running (a middleware may handle a sub-request).
- A request runs through the middleware that were registered **when `handle` was called**. A middleware added during a request affects the next request, not the one in progress.
- Chains of a few hundred middleware must work.

**Example**

```
def app(request):
    return {"status": 200, "body": "hello"}

def require_user(request, call_next):
    if "user" not in request:
        return {"status": 401}
    return call_next(request)

pipeline = Pipeline(app).use(require_user)
pipeline.handle({})                    # {"status": 401}
pipeline.handle({"user": "asha"})      # {"status": 200, "body": "hello"}
```''',
    starter=r'''class Pipeline:
    def __init__(self, endpoint):
        """`endpoint(request)` runs after every middleware."""
        ...

    def use(self, middleware):
        """Add a middleware after the existing ones; return the pipeline."""
        ...

    def handle(self, request):
        """Run the request through the chain and return the response."""
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__
    return None
calls = []
log = []
def endpoint(request):
    calls.append(request.get("path"))
    return {"status": 200, "body": "hi " + request.get("user", "anon")}
def logger(request, call_next):
    log.append(("in", request["path"]))
    response = call_next(request)
    log.append(("out", response["status"]))
    return response
def auth(request, call_next):
    if "user" not in request:
        return {"status": 401, "body": "login"}
    return call_next(request)
bare = Pipeline(endpoint)
assert bare.handle({"path": "/a"}) == {"status": 200, "body": "hi anon"}
assert calls == ["/a"]
assert bare.use(logger) is bare
chain = Pipeline(endpoint).use(logger).use(auth)
calls.clear()
log.clear()
assert chain.handle({"path": "/x", "user": "asha"}) == {"status": 200, "body": "hi asha"}
assert log == [("in", "/x"), ("out", 200)]
calls.clear()
log.clear()
assert chain.handle({"path": "/y"}) == {"status": 401, "body": "login"}
assert calls == []
assert log == [("in", "/y"), ("out", 401)]
order = []
def tag(name):
    def middleware(request, call_next):
        order.append(name + " in")
        response = call_next(request)
        order.append(name + " out")
        return response
    return middleware
def final(request):
    order.append("endpoint")
    return "done"
Pipeline(final).use(tag("a")).use(tag("b")).use(tag("c")).handle({})
assert order == ["a in", "b in", "c in", "endpoint", "c out", "b out", "a out"]
def add_user(request, call_next):
    return call_next({**request, "user": "ben"})
def stamp(request, call_next):
    response = call_next(request)
    return {**response, "served_by": "pipeline"}
shaped = Pipeline(endpoint).use(stamp).use(add_user)
assert shaped.handle({"path": "/z"}) == {"status": 200, "body": "hi ben", "served_by": "pipeline"}
assert shaped.handle({"path": "/z"}) == {"status": 200, "body": "hi ben", "served_by": "pipeline"}
state = {"tries": 0, "passes": 0}
def shaky(request):
    state["tries"] += 1
    if state["tries"] < 3:
        raise RuntimeError("boom")
    return {"status": 200, "body": "finally"}
def retrying(request, call_next):
    for _ in range(5):
        try:
            return call_next(request)
        except RuntimeError:
            continue
    return {"status": 503}
def counting(request, call_next):
    state["passes"] += 1
    return call_next(request)
retried = Pipeline(shaky).use(retrying).use(counting)
assert retried.handle({}) == {"status": 200, "body": "finally"}
assert (state["tries"], state["passes"]) == (3, 3)
assert error_of(Pipeline(lambda request: 1 / 0).handle, {}) == "ZeroDivisionError"
def explode(request, call_next):
    raise KeyError("nope")
assert error_of(Pipeline(endpoint).use(logger).use(explode).handle, {"path": "/e"}) == "KeyError"
def nester(request, call_next):
    if request.get("depth", 0) == 0:
        inner = nested.handle({"path": "/inner", "depth": 1})
        return {**call_next(request), "inner": inner["status"]}
    return call_next(request)
nested = Pipeline(endpoint).use(nester)
assert nested.handle({"path": "/outer"}) == {"status": 200, "body": "hi anon", "inner": 200}
def registrar(request, call_next):
    late.use(stamp)
    return call_next(request)
late = Pipeline(endpoint).use(registrar)
assert "served_by" not in late.handle({"path": "/1"})
assert late.handle({"path": "/2"})["served_by"] == "pipeline"
def pass_through(request, call_next):
    return call_next(request)
long = Pipeline(endpoint)
for _ in range(200):
    long.use(pass_through)
assert long.handle({"path": "/long"}) == {"status": 200, "body": "hi anon"}''',
    solution=r'''class Pipeline:
    def __init__(self, endpoint):
        self._endpoint = endpoint
        self._middleware = []

    def use(self, middleware):
        self._middleware.append(middleware)
        return self

    def handle(self, request):
        chain = list(self._middleware)

        def call(index, current):
            if index == len(chain):
                return self._endpoint(current)
            return chain[index](current, lambda following: call(index + 1, following))

        return call(0, request)''',
    hints=[
        r'''Build `call_next` as a closure that remembers *which position in the chain it stands for*. A function `call(index, request)` that returns `chain[index](request, lambda r: call(index + 1, r))` is the whole idea.''',
        r'''Do not keep "where we are in the chain" in an attribute of the pipeline. A retry calls `call_next` twice, and a middleware that handles a sub-request runs a second `handle` at the same time: shared position state breaks both.''',
        r'''Copy the list of middleware at the start of `handle`, so a `use()` made while a request is running only affects later requests. Do not catch exceptions anywhere: let them travel up through every `call_next`.''',
    ],
    explanation=r'''**The idea.** This is **Chain of Responsibility**: a request goes along a chain of handlers, and each one decides whether to handle it, change it, pass it on or stop it. Every web framework's middleware (Express, Django, ASP.NET, Starlette) is this.

```mermaid
sequenceDiagram
    participant C as Caller
    participant A as logger
    participant B as auth
    participant E as endpoint
    C->>A: handle(request)
    A->>B: call_next(request)
    B->>E: call_next(request)
    E-->>B: response
    B-->>A: response
    A-->>C: response
```

**Why `call_next` is a function and not "the next object".** If a middleware only said "go on", it could not wrap what happens *after* the rest of the chain, which is where logging, timing, caching and error handling live. Passing the continuation in as a function gives each middleware the full "around" position, and lets it call the continuation zero times (stop), once (normal) or several times (retry).

**The bug this problem is built around.** The tempting implementation keeps an index in the pipeline: `self._pos += 1` each time `call_next` is called. It works for one straight request. It breaks when a middleware retries (the second `call_next` continues from where the first stopped) and when a middleware handles a sub-request on the same pipeline (the inner request advances the outer one's position). The fix is not clever: make the position an *argument*, so every call carries its own, which is what the recursive `call(index, request)` does. The rule of thumb: state that belongs to one request must not live on the object that serves many.

**Snapshot at the start.** Copying the middleware list in `handle` means a request sees a stable chain even if something calls `use()` while it runs. Without the copy, a middleware added mid-request could run in the middle of it.

**Exceptions.** There is no `try` in the pipeline. An exception raised by the endpoint travels back up through each `call_next` call, so any middleware that wants to handle errors (like the retry in the tests) can simply wrap its `call_next`. Catching errors in the pipeline would hide them from the middleware that is built to deal with them.

**Complexity.** O(number of middleware) per request. The recursion adds two stack frames per middleware, so a chain of a few hundred is fine but a chain of thousands is not; a loop-based pipeline could remove that limit at the cost of clarity.

**Going further.** Most frameworks run middleware as `async` functions. What changes in `call` when `call_next` returns a coroutine?''',
),
]
