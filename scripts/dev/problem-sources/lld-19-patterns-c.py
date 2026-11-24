PROBLEMS = [
P(
    slug='lld-approval-chain', title='Approval Chain', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/08-behavioral-patterns-i/README.md',
    description='Pass an expense request up a chain of approvers with spending limits and vetoes (Chain of Responsibility).',
    statement=r'''Write a class `ApprovalChain` (the *Chain of Responsibility* pattern): a request is offered to approvers one after another, and the first one able to decide, does.

**Building the chain.** `add(name, limit, veto=None)` appends an approver and returns the chain (so calls can be chained). `limit` is the largest amount (an `int` of cents, 1 or more) that this approver may approve, or `None` for "no limit". `veto` is an optional function `veto(request_id, amount)` that returns a **reason string** to reject the request, or a falsy value to let it through. Check in this order:

1. the chain already ends with an unlimited approver: `ValueError("Chain is complete")`
2. `limit` is neither `None` nor an `int` of 1 or more (not a `bool`): `ValueError("Limit must be positive")`
3. `limit` is lower than the previous approver's: `ValueError("Limits must not decrease")`

**Deciding.** `approve(request_id, amount)` offers the request to the approvers **in order**. For each approver it reaches: it is added to the request's *trail*; then, if it has a `veto` and the veto gives a reason, the request is **rejected** and the result is `("rejected", name, reason)`; otherwise, if the amount is within its limit (or it has none), the result is `("approved", name)`; otherwise the request goes on to the next approver. A `veto` is called **only** for approvers the request actually reaches.

Checks, in this order: `amount` is not an `int` of 1 or more: `ValueError("Amount must be positive")`; `request_id` already decided: `ValueError("Request already decided")`. If the chain is exhausted without a decision: `ValueError("No approver for amount")`, and the request is **not** recorded (it can be offered again later).

`trail(request_id)` is a **new list** of the names that looked at a decided request, in order; an unknown id is `ValueError("Unknown request")`.''',
    starter=r'''class ApprovalChain:
    def __init__(self):
        ...

    def add(self, name, limit, veto=None):
        """Append an approver; return the chain."""
        ...

    def approve(self, request_id, amount):
        """("approved", name) or ("rejected", name, reason)."""
        ...

    def trail(self, request_id):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
calls = []
def budget_veto(request_id, amount):
    calls.append((request_id, amount))
    return "over budget" if request_id.startswith("x") else None
chain = ApprovalChain()
assert chain.add("lead", 10000) is chain
chain.add("manager", 100000, budget_veto).add("cfo", None)
assert error_of(chain.add, "ceo", 5) == "ValueError: Chain is complete"
assert error_of(chain.add, "ceo", None) == "ValueError: Chain is complete"
assert chain.approve("r1", 5000) == ("approved", "lead") and chain.trail("r1") == ["lead"]
assert chain.approve("r2", 10000) == ("approved", "lead")
assert calls == []
assert chain.approve("r3", 10001) == ("approved", "manager") and chain.trail("r3") == ["lead", "manager"]
assert calls == [("r3", 10001)]
assert chain.approve("r4", 100000) == ("approved", "manager")
assert chain.approve("r5", 100001) == ("approved", "cfo") and chain.trail("r5") == ["lead", "manager", "cfo"]
assert chain.approve("x1", 50000) == ("rejected", "manager", "over budget") and chain.trail("x1") == ["lead", "manager"]
assert chain.approve("x2", 5000) == ("approved", "lead") and ("x2", 5000) not in calls
assert chain.approve("x3", 500000) == ("rejected", "manager", "over budget")
assert error_of(chain.approve, "r1", 5) == "ValueError: Request already decided"
assert error_of(chain.approve, "x1", 5) == "ValueError: Request already decided"
assert error_of(chain.approve, "new", 0) == "ValueError: Amount must be positive"
assert error_of(chain.approve, "r1", 0) == "ValueError: Amount must be positive"
assert error_of(chain.approve, "new", 1.5) == "ValueError: Amount must be positive"
assert error_of(chain.approve, "new", True) == "ValueError: Amount must be positive"
assert error_of(chain.trail, "never") == "ValueError: Unknown request"
copy = chain.trail("r5")
copy.append("junk")
assert chain.trail("r5") == ["lead", "manager", "cfo"]
small = ApprovalChain()
small.add("a", 100).add("b", 100)
assert small.approve("s1", 100) == ("approved", "a")
assert error_of(small.approve, "s2", 101) == "ValueError: No approver for amount"
assert error_of(small.trail, "s2") == "ValueError: Unknown request"
small.add("c", 1000)
assert small.approve("s2", 101) == ("approved", "c") and small.trail("s2") == ["a", "b", "c"]
assert error_of(small.add, "d", 999) == "ValueError: Limits must not decrease"
assert error_of(small.add, "d", 0) == "ValueError: Limit must be positive"
assert error_of(small.add, "d", -5) == "ValueError: Limit must be positive"
assert error_of(small.add, "d", 1.5) == "ValueError: Limit must be positive"
assert error_of(small.add, "d", True) == "ValueError: Limit must be positive"
assert error_of(small.add, "d", "9") == "ValueError: Limit must be positive"
only_veto = ApprovalChain()
only_veto.add("gate", None, lambda rid, amount: "no weekends" if amount == 7 else "")
assert only_veto.approve("v1", 7) == ("rejected", "gate", "no weekends")
assert only_veto.approve("v2", 8) == ("approved", "gate")
empty = ApprovalChain()
assert error_of(empty.approve, "e1", 5) == "ValueError: No approver for amount"
equal = ApprovalChain()
equal.add("a", 500).add("b", 500).add("c", 900)
assert equal.approve("q", 500) == ("approved", "a") and equal.add("d", 900) is equal
vetoed_first = ApprovalChain()
vetoed_first.add("a", 10, lambda rid, amount: "stop").add("b", None)
assert vetoed_first.approve("z", 1000) == ("rejected", "a", "stop") and vetoed_first.trail("z") == ["a"]''',
    solution=r'''class ApprovalChain:
    def __init__(self):
        self._links = []
        self._trails = {}

    def add(self, name, limit, veto=None):
        if self._links and self._links[-1][1] is None:
            raise ValueError("Chain is complete")
        if limit is not None and (type(limit) is not int or limit < 1):
            raise ValueError("Limit must be positive")
        if limit is not None and self._links and limit < self._links[-1][1]:
            raise ValueError("Limits must not decrease")
        self._links.append((name, limit, veto))
        return self

    def approve(self, request_id, amount):
        if type(amount) is not int or amount < 1:
            raise ValueError("Amount must be positive")
        if request_id in self._trails:
            raise ValueError("Request already decided")
        trail = []
        for name, limit, veto in self._links:
            trail.append(name)
            if veto is not None:
                reason = veto(request_id, amount)
                if reason:
                    self._trails[request_id] = trail
                    return ("rejected", name, reason)
            if limit is None or amount <= limit:
                self._trails[request_id] = trail
                return ("approved", name)
        raise ValueError("No approver for amount")

    def trail(self, request_id):
        if request_id not in self._trails:
            raise ValueError("Unknown request")
        return list(self._trails[request_id])''',
    hints=[
        r'''Keep the approvers in a plain list of `(name, limit, veto)`. Deciding is one loop over that list: record the name, maybe veto, maybe approve, otherwise fall through to the next.''',
        r'''The veto belongs to the approver, and it runs only when the request *reaches* that approver. Call it after recording the name in the trail and before comparing the amount.''',
        r'''Record the decided trail only when a decision is made. When the chain runs out, raise without storing anything, so the same request id can be offered again after someone adds a bigger approver.''',
    ],
    explanation=r'''**The idea.** Chain of Responsibility decouples *who asked* from *who decides*. The caller hands the request to the chain and gets back a decision; it does not know that three people looked at it.

```mermaid
flowchart LR
    R[request] --> L[lead: up to 100]
    L -- too big --> M[manager: up to 1000]
    M -- too big --> C[cfo: unlimited]
    L -- approve --> D[decision]
    M -- approve or veto --> D
    C --> D
```

**Why a list and not linked objects.** Textbook versions give every handler a `next` pointer. In Python a list of `(name, limit, veto)` plus a loop does the same job with less ceremony, and "append an approver" is `list.append`. What matters is the contract: order is meaningful, each link may handle or pass.

**Vetoes see only what reaches them.** An approver who was never consulted cannot reject. The test with a spy records the veto calls, which is how you check the *absence* of a call.

**State and retries.** A request that nobody could approve is not recorded: the chain can change later. A decided request is final, which is what makes `trail` an audit record.

**Complexity.** `approve` is O(approvers).

**Going further.** Add a rule that a request must be approved by *two* different approvers (a four-eyes check). Which part of the loop changes, and what does the trail look like?''',
),
P(
    slug='lld-menu-composite', title='Menu Tree (Composite)', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/07-structural-patterns/README.md',
    description='Model a menu of items and nested sections that answer total, count, search and printing the same way (Composite).',
    statement=r'''Write two classes, `Item` and `Section`, that share one interface: the *Composite* pattern. A menu is a tree; callers treat a single dish and a whole section of dishes alike.

**Common to both**

- `name` (stripped; blank is `ValueError("Name required")`) and `parent` (the `Section` it is in, or `None`).
- `total`: the sum of the prices of every item below (an item's own price for an `Item`).
- `count`: how many items are below (`1` for an `Item`).
- `find(name)`: the first node with that name, searching this node first and then each child's subtree in order (depth first); `None` if there is none.
- `path(name)`: the list of names from this node down to the node called `name` (this node's own name first), or `None`.
- `lines()`: the menu as a list of text lines. An `Item` is one line, `"<name> <price>"`, with the price in cents shown as `12.50` (`1250`) or `0.05` (`5`). A `Section` is the line `"<name>:"` followed by its children's lines, **each indented by two spaces**.

**Item.** `Item(name, price)`; `price` must be an `int` of 0 or more (not a `bool`), else `ValueError("Price must be a non-negative integer")`. Check the name first.

**Section.** `Section(name)`.

- `children` is a **tuple** of the children in order.
- `add(*children)` appends nodes and returns the section. Checks in this order, **before anything is added**: a child that is not an `Item` or `Section` `ValueError("Not a menu node")`; a child that is this section or one of its ancestors `ValueError("Cycle")`; a child that already has a parent (or appears twice in this call) `ValueError("Already in a section")`.
- `remove(child)` detaches a child (its `parent` becomes `None`); a node that is not a child of this section is `ValueError("Not in this section")`.''',
    starter=r'''class Item:
    def __init__(self, name, price):
        ...

    # name, parent, total, count, find(name), path(name), lines()


class Section:
    def __init__(self, name):
        ...

    # name, parent, children, total, count, find(name), path(name), lines()
    def add(self, *children):
        ...

    def remove(self, child):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
assert error_of(Item, " ", 5) == "ValueError: Name required"
assert error_of(Section, "") == "ValueError: Name required"
assert error_of(Item, "", -1) == "ValueError: Name required"
for bad in (-1, 1.5, True, "5", None):
    assert error_of(Item, "Soup", bad) == "ValueError: Price must be a non-negative integer"
soup = Item(" Soup ", 450)
assert soup.name == "Soup" and soup.total == 450 and soup.count == 1 and soup.parent is None
assert soup.lines() == ["Soup 4.50"] and Item("Gum", 5).lines() == ["Gum 0.05"] and Item("Free", 0).lines() == ["Free 0.00"] and Item("Big", 123456).lines() == ["Big 1234.56"]
assert soup.find("Soup") is soup and soup.find("x") is None and soup.path("Soup") == ["Soup"] and soup.path("x") is None
menu = Section("Menu")
starters = Section("Starters")
mains = Section("Mains")
pasta = Section("Pasta")
salad = Item("Salad", 600)
assert menu.add(starters, mains) is menu and menu.children == (starters, mains)
assert starters.add(soup, salad) is starters and mains.add(pasta, Item("Steak", 2400)) is mains
pasta.add(Item("Penne", 1200), Item("Soup", 999))
assert menu.total == 450 + 600 + 2400 + 1200 + 999 and menu.count == 5 and starters.total == 1050 and pasta.count == 2
assert soup.parent is starters and starters.parent is menu and menu.parent is None
assert menu.lines() == [
    "Menu:",
    "  Starters:",
    "    Soup 4.50",
    "    Salad 6.00",
    "  Mains:",
    "    Pasta:",
    "      Penne 12.00",
    "      Soup 9.99",
    "    Steak 24.00",
]
assert starters.lines() == ["Starters:", "  Soup 4.50", "  Salad 6.00"]
assert Section("Empty").lines() == ["Empty:"] and Section("Empty").total == 0 and Section("Empty").count == 0
assert menu.find("Soup") is soup and menu.find("Pasta") is pasta and menu.find("Menu") is menu and menu.find("Nothing") is None
assert menu.find("Soup").parent is starters and mains.find("Soup").name == "Soup"
assert mains.find("Soup") is not soup
assert menu.path("Penne") == ["Menu", "Mains", "Pasta", "Penne"] and menu.path("Menu") == ["Menu"] and menu.path("Soup") == ["Menu", "Starters", "Soup"]
assert mains.path("Penne") == ["Mains", "Pasta", "Penne"] and mains.path("Salad") is None and menu.path("zzz") is None
assert error_of(menu.add, "not a node") == "ValueError: Not a menu node"
assert error_of(menu.add, Item("Z", 1), 5) == "ValueError: Not a menu node"
assert error_of(menu.add, menu) == "ValueError: Cycle"
assert error_of(pasta.add, menu) == "ValueError: Cycle"
assert error_of(pasta.add, mains) == "ValueError: Cycle"
assert error_of(pasta.add, pasta) == "ValueError: Cycle"
assert error_of(mains.add, soup) == "ValueError: Already in a section"
assert error_of(menu.add, pasta) == "ValueError: Already in a section"
fresh = Item("Fresh", 100)
before = len(menu.children)
assert error_of(menu.add, fresh, fresh) == "ValueError: Already in a section"
assert error_of(menu.add, fresh, soup) == "ValueError: Already in a section"
assert len(menu.children) == before and fresh.parent is None
assert error_of(menu.add, fresh, "x") == "ValueError: Not a menu node" and fresh.parent is None
assert error_of(menu.add, fresh, menu) == "ValueError: Cycle" and fresh.parent is None
menu.add(fresh)
assert fresh.parent is menu and menu.children == (starters, mains, fresh)
assert error_of(starters.remove, fresh) == "ValueError: Not in this section"
assert error_of(starters.remove, "x") == "ValueError: Not in this section"
starters.remove(soup)
assert soup.parent is None and starters.children == (salad,) and menu.total == 600 + 2400 + 1200 + 999 + 100
assert starters.total == 600 and menu.count == 5
mains.add(soup)
assert soup.parent is mains
detached = Section("Detached")
detached.add(Item("A", 1), Item("B", 2))
menu.add(detached)
assert menu.count == 8 and menu.total == 600 + 2400 + 1200 + 999 + 100 + 450 + 3
assert error_of(detached.add, menu) == "ValueError: Cycle"
detached.remove(detached.children[0])
assert detached.count == 1 and menu.count == 7
assert isinstance(menu.children, tuple)''',
    solution=r'''class _Node:
    def __init__(self, name):
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Name required")
        self._name = name.strip()
        self._parent = None

    @property
    def name(self):
        return self._name

    @property
    def parent(self):
        return self._parent

    def find(self, name):
        if self._name == name:
            return self
        for child in self._children_of():
            found = child.find(name)
            if found is not None:
                return found
        return None

    def path(self, name):
        if self._name == name:
            return [self._name]
        for child in self._children_of():
            below = child.path(name)
            if below is not None:
                return [self._name] + below
        return None

    def _children_of(self):
        return ()


class Item(_Node):
    def __init__(self, name, price):
        super().__init__(name)
        if type(price) is not int or price < 0:
            raise ValueError("Price must be a non-negative integer")
        self.price = price

    @property
    def total(self):
        return self.price

    @property
    def count(self):
        return 1

    def lines(self):
        return [f"{self._name} {self.price // 100}.{self.price % 100:02d}"]


class Section(_Node):
    def __init__(self, name):
        super().__init__(name)
        self._children = []

    @property
    def children(self):
        return tuple(self._children)

    def _children_of(self):
        return self._children

    @property
    def total(self):
        return sum(child.total for child in self._children)

    @property
    def count(self):
        return sum(child.count for child in self._children)

    def add(self, *children):
        seen = set()
        for child in children:
            if not isinstance(child, _Node):
                raise ValueError("Not a menu node")
            ancestor = self
            while ancestor is not None:
                if ancestor is child:
                    raise ValueError("Cycle")
                ancestor = ancestor._parent
            if child._parent is not None or id(child) in seen:
                raise ValueError("Already in a section")
            seen.add(id(child))
        for child in children:
            child._parent = self
            self._children.append(child)
        return self

    def remove(self, child):
        if not isinstance(child, _Node) or child._parent is not self:
            raise ValueError("Not in this section")
        self._children.remove(child)
        child._parent = None

    def lines(self):
        result = [self._name + ":"]
        for child in self._children:
            result.extend("  " + line for line in child.lines())
        return result''',
    hints=[
        r'''Give `Item` and `Section` the same methods, and let a `Section` answer each one by asking its children and combining: `total` is the sum of the children's totals, `lines` is its own heading plus the children's lines with two spaces added. The caller never asks "is this a leaf?".''',
        r'''Share what is identical (the name check, `parent`, `find`, `path`) in a small base class. `find` and `path` only differ in what "children" means: none for an item, the list for a section.''',
        r'''`add` must be all-or-nothing: validate every child first (type, then cycle, then "already has a parent or appears twice") and only then attach them. For the cycle check, walk from the section up through its parents; if you meet the child on the way, the child is an ancestor.''',
    ],
    explanation=r'''**The idea.** Composite makes *one thing* and *a group of things* look the same to the caller. `menu.total` works whether `menu` is a single dish or a menu of menus, because every node answers the same questions and a group answers by asking its members.

```mermaid
flowchart TD
    M[Menu] --> S[Starters]
    M --> P[Mains]
    S --> a[Soup]
    S --> b[Salad]
    P --> c[Pasta]
    c --> d[Penne]
```

**One parent per node.** A tree node with two parents is a graph, and a graph can contain cycles. Refusing "already in a section" keeps it a tree; the ancestor walk prevents the node being added under its own descendant.

**Validate, then attach.** `add(a, b, bad)` must not leave `a` and `b` attached when `bad` is refused. Two passes (check all, attach all) are simpler than undoing.

**The cost of recursion.** Every operation visits the whole subtree. For a menu that is nothing; for a filesystem with millions of files you cache totals and invalidate on change.

**Complexity.** `total`, `count`, `lines`: O(nodes below). `find`, `path`: O(nodes) worst case. `add`: O(depth).

**Going further.** Cache `total` in each section. Which operations must now tell the parent chain that something changed, and what do you do about an item whose price can change?''',
),
P(
    slug='lld-shipping-strategies', title='Shipping Strategies', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/08-behavioral-patterns-i/README.md',
    description='Swap interchangeable shipping price rules (Strategy): built-ins, custom registration, availability and the cheapest option.',
    statement=r'''Write a class `Shipping` that prices a parcel with a *strategy*: a function `strategy(weight_grams, order_total)` that returns a price in cents. The class knows nothing about how each price is computed.

**Built-in methods**

- `"standard"`: **free** when the order total is at least `5000`; otherwise `500` plus `100` for every started kilogram beyond the first. Parcels **over 50,000 g** are not accepted: the strategy raises `ValueError("Too heavy for standard")`.
- `"express"`: `1500` plus `250` for every started kilogram beyond the first. Parcels **over 20,000 g** are not accepted: the strategy raises `ValueError("Too heavy for express")`.
- `"pickup"`: a flat `200`. Parcels **over 30,000 g** are not accepted: the strategy raises `ValueError("Too heavy for pickup")`.

A "started kilogram" means weight divided by 1000, rounded **up** (1 to 1000 g is 1 kg, 1001 g is 2 kg).

**Methods**

- `register(name, strategy)` adds a method. A name already in use is `ValueError("Method already registered: <name>")`; something that is not callable is `ValueError("Strategy must be callable")` (check the name first).
- `methods()` is the sorted list of method names.
- `quote(method, weight_grams, order_total)` returns the price. Checks in this order: unknown method `ValueError("Unknown shipping method: <method>")`; `weight_grams` not an `int` of 1 or more (not a `bool`) `ValueError("Weight must be positive")`; `order_total` not an `int` of 0 or more `ValueError("Total cannot be negative")`. Whatever the strategy raises propagates. A strategy that returns anything but an `int` of 0 or more is `ValueError("Bad price from <method>")`.
- `cheapest(weight_grams, order_total)` returns `(method, price)` for the lowest price among the methods that **can** serve the parcel: a method whose strategy raises `ValueError` is skipped. Ties go to the alphabetically first name. A bad price still raises `"Bad price from ..."`, it is not skipped. If no method can serve it: `ValueError("No shipping method available")`. The same input checks as `quote` apply (without the method name).''',
    starter=r'''class Shipping:
    def __init__(self):
        ...

    def register(self, name, strategy):
        ...

    def methods(self):
        ...

    def quote(self, method, weight_grams, order_total):
        ...

    def cheapest(self, weight_grams, order_total):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
ship = Shipping()
assert ship.methods() == ["express", "pickup", "standard"]
assert ship.quote("standard", 1000, 100) == 500 and ship.quote("standard", 1, 0) == 500
assert ship.quote("standard", 1001, 100) == 600 and ship.quote("standard", 2500, 100) == 700 and ship.quote("standard", 10000, 4999) == 1400
assert ship.quote("standard", 10000, 5000) == 0 and ship.quote("standard", 1, 5000) == 0
assert ship.quote("express", 1000, 0) == 1500 and ship.quote("express", 1001, 0) == 1750 and ship.quote("express", 20000, 0) == 1500 + 250 * 19
assert error_of(ship.quote, "express", 20001, 0) == "ValueError: Too heavy for express"
assert ship.quote("pickup", 30000, 0) == 200 and error_of(ship.quote, "pickup", 30001, 0) == "ValueError: Too heavy for pickup" and error_of(ship.quote, "standard", 50001, 9999) == "ValueError: Too heavy for standard"
assert error_of(ship.quote, "teleport", 1, 1) == "ValueError: Unknown shipping method: teleport"
assert error_of(ship.quote, "teleport", 0, -1) == "ValueError: Unknown shipping method: teleport"
for bad in (0, -5, 1.5, True, None, "10"):
    assert error_of(ship.quote, "standard", bad, 1) == "ValueError: Weight must be positive"
for bad in (-1, 1.5, True, None):
    assert error_of(ship.quote, "standard", 1, bad) == "ValueError: Total cannot be negative"
assert error_of(ship.quote, "standard", 0, -1) == "ValueError: Weight must be positive"
assert ship.cheapest(500, 1000) == ("pickup", 200)
assert ship.cheapest(500, 5000) == ("standard", 0)
assert ship.cheapest(30000, 0) == ("pickup", 200) and ship.cheapest(40000, 0) == ("standard", 500 + 100 * 39)
assert error_of(ship.cheapest, 60000, 0) == "ValueError: No shipping method available"
assert error_of(ship.cheapest, 0, 5) == "ValueError: Weight must be positive"
assert error_of(ship.cheapest, 5, -5) == "ValueError: Total cannot be negative"
assert error_of(ship.register, "pickup", lambda w, t: 1) == "ValueError: Method already registered: pickup"
assert error_of(ship.register, "pickup", 5) == "ValueError: Method already registered: pickup"
assert error_of(ship.register, "drone", 5) == "ValueError: Strategy must be callable"
assert error_of(ship.register, "drone", None) == "ValueError: Strategy must be callable"
assert ship.methods() == ["express", "pickup", "standard"]
ship.register("drone", lambda w, t: 100 if w <= 2000 else (_ for _ in ()).throw(ValueError("Too heavy for drone")))
assert ship.methods() == ["drone", "express", "pickup", "standard"]
assert ship.quote("drone", 2000, 0) == 100 and error_of(ship.quote, "drone", 2001, 0) == "ValueError: Too heavy for drone"
assert ship.cheapest(500, 1000) == ("drone", 100)
assert ship.cheapest(5000, 1000) == ("pickup", 200)
ship.register("courier", lambda w, t: 200)
assert ship.cheapest(5000, 1000) == ("courier", 200)
assert ship.cheapest(500, 5000) == ("standard", 0)
ship.register("bad-float", lambda w, t: 1.5)
ship.register("bad-negative", lambda w, t: -1)
ship.register("bad-bool", lambda w, t: True)
ship.register("bad-none", lambda w, t: None)
for name in ("bad-float", "bad-negative", "bad-bool", "bad-none"):
    assert error_of(ship.quote, name, 1, 1) == "ValueError: Bad price from " + name
assert error_of(ship.cheapest, 1, 1) == "ValueError: Bad price from bad-bool"
only = Shipping()
only.register("never", lambda w, t: (_ for _ in ()).throw(ValueError("no")))
assert only.cheapest(30000, 0) == ("pickup", 200)
assert error_of(only.cheapest, 60000, 0) == "ValueError: No shipping method available"
seen = []
spy = Shipping()
spy.register("spy", lambda w, t: seen.append((w, t)) or 0)
assert spy.quote("spy", 700, 300) == 0 and seen == [(700, 300)]
assert spy.cheapest(700, 300) == ("spy", 0)''',
    solution=r'''def _kilograms(weight):
    return -(-weight // 1000)


def _standard(weight, total):
    if weight > 50000:
        raise ValueError("Too heavy for standard")
    if total >= 5000:
        return 0
    return 500 + 100 * (_kilograms(weight) - 1)


def _express(weight, total):
    if weight > 20000:
        raise ValueError("Too heavy for express")
    return 1500 + 250 * (_kilograms(weight) - 1)


def _pickup(weight, total):
    if weight > 30000:
        raise ValueError("Too heavy for pickup")
    return 200


class Shipping:
    def __init__(self):
        self._methods = {"standard": _standard, "express": _express, "pickup": _pickup}

    def register(self, name, strategy):
        if name in self._methods:
            raise ValueError("Method already registered: " + str(name))
        if not callable(strategy):
            raise ValueError("Strategy must be callable")
        self._methods[name] = strategy

    def methods(self):
        return sorted(self._methods)

    @staticmethod
    def _check(weight, total):
        if type(weight) is not int or weight < 1:
            raise ValueError("Weight must be positive")
        if type(total) is not int or total < 0:
            raise ValueError("Total cannot be negative")

    @staticmethod
    def _valid(name, price):
        if type(price) is not int or price < 0:
            raise ValueError("Bad price from " + str(name))
        return price

    def quote(self, method, weight_grams, order_total):
        if method not in self._methods:
            raise ValueError("Unknown shipping method: " + str(method))
        self._check(weight_grams, order_total)
        return self._valid(method, self._methods[method](weight_grams, order_total))

    def cheapest(self, weight_grams, order_total):
        self._check(weight_grams, order_total)
        best = None
        for name in sorted(self._methods):
            try:
                price = self._methods[name](weight_grams, order_total)
            except ValueError:
                continue
            price = self._valid(name, price)
            if best is None or price < best[1]:
                best = (name, price)
        if best is None:
            raise ValueError("No shipping method available")
        return best''',
    hints=[
        r'''A strategy is just a function stored under a name. `quote` looks the function up and calls it; the class has no `if method == "express"` anywhere, which is the point of the pattern.''',
        r'''Round kilograms **up** with integer maths: `-(-grams // 1000)`. Then both built-in prices are "base plus step times (kg - 1)".''',
        r'''In `cheapest`, wrap only the call to the strategy in `try/except ValueError` (that is "cannot serve this parcel"). Validate the price *after* the `try`, otherwise a strategy bug is silently skipped. Visit names in sorted order and keep a candidate only when it is strictly cheaper, which gives alphabetical tie-breaking.''',
    ],
    explanation=r'''**The idea.** Strategy replaces a growing `if/elif` over "which rule applies" with a table of interchangeable functions. Adding drone delivery means one `register` call; `Shipping` itself never changes (the *open/closed* principle).

**The contract is the signature.** Every strategy takes `(weight_grams, order_total)` and returns cents. That sameness is what lets `cheapest` loop over them without caring what they are.

**Two different failures.** A strategy that *cannot serve* the parcel says so with `ValueError`, and `cheapest` skips it. A strategy that returns a *nonsense price* is a bug in the strategy, and hiding it behind "skipped" would make it invisible. Putting the validation outside the `try` is how the code expresses that difference.

**Validate at the boundary.** Inputs are checked once in `quote` and `cheapest`, so strategies can assume sane numbers.

**Complexity.** `cheapest` is O(methods log methods) calls to strategies.

**Going further.** Strategies that need configuration (a carrier's rate table) are better as small objects with a `price(...)` method than as lambdas. What does `register` need to accept, and what do the tests look like?''',
),
P(
    slug='lld-object-pool', title='Object Pool', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/06-creational-patterns/README.md',
    description='Reuse expensive objects through a bounded pool: lazy creation, reuse, reset on release, exhaustion and a lease helper.',
    statement=r'''Write a class `Pool` that hands out a limited number of reusable objects (database connections, buffers) so they are not created again and again.

**Creating one:** `Pool(factory, size, reset=None)`. `factory()` builds a new object; `size` is the most objects the pool will ever have in existence, an `int` of 1 or more (not a `bool`), else `ValueError("Size must be positive")`. `reset(obj)`, if given, is called to clean an object when it is released.

**Methods**

- `acquire()` returns an object. Use an **idle** object if there is one (the one **released most recently** first); otherwise, if fewer than `size` objects exist, call `factory()` to build a new one (the factory is called **lazily**, never in advance); otherwise raise `ValueError("Pool exhausted")`. If `factory` raises, the error propagates and nothing is counted.
- `release(obj)` returns an object to the pool: first `reset(obj)` is called (if there is a `reset`), then the object becomes idle. Checks: an object that is idle already `ValueError("Already released")`; one this pool never handed out (or has discarded) `ValueError("Not from this pool")`; compare by **identity** (`is`), not equality. If `reset` **raises**, the object is **discarded** (the pool forgets it, so a new one may be built later) and the error propagates.
- `lease()` is a context manager: `with pool.lease() as obj:` acquires on entry and **always** releases on exit, even if the body raised.

**Questions:** `created` (objects that exist now, busy plus idle), `in_use` and `idle`.''',
    starter=r'''class Pool:
    def __init__(self, factory, size, reset=None):
        ...

    def acquire(self):
        ...

    def release(self, obj):
        ...

    def lease(self):
        """Use as: with pool.lease() as obj: ..."""
        ...

    @property
    def created(self):
        ...

    @property
    def in_use(self):
        ...

    @property
    def idle(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Conn:
    made = 0
    def __init__(self):
        Conn.made += 1
        self.number = Conn.made
        self.dirty = False
        self.cleaned = 0
    def __eq__(self, other):
        return True
    def __hash__(self):
        return 1
def clean(conn):
    conn.cleaned += 1
    conn.dirty = False
for bad in (0, -1, 2.5, True, None):
    assert error_of(Pool, Conn, bad) == "ValueError: Size must be positive"
pool = Pool(Conn, 2, clean)
assert Conn.made == 0 and pool.created == 0 and pool.in_use == 0 and pool.idle == 0
first = pool.acquire()
assert Conn.made == 1 and pool.created == 1 and pool.in_use == 1 and pool.idle == 0
second = pool.acquire()
assert first is not second and Conn.made == 2 and pool.created == 2 and pool.in_use == 2
assert error_of(pool.acquire) == "ValueError: Pool exhausted" and Conn.made == 2
first.dirty = True
pool.release(first)
assert first.dirty is False and first.cleaned == 1 and pool.idle == 1 and pool.in_use == 1 and pool.created == 2
assert pool.acquire() is first and Conn.made == 2 and pool.in_use == 2 and pool.idle == 0
pool.release(second)
pool.release(first)
assert pool.idle == 2 and pool.in_use == 0
assert pool.acquire() is first and pool.acquire() is second
pool.release(first)
pool.release(second)
assert pool.acquire() is second and pool.acquire() is first
assert error_of(pool.release, first) is None
assert error_of(pool.release, first) == "ValueError: Already released"
assert error_of(pool.release, Conn()) == "ValueError: Not from this pool"
assert error_of(pool.release, "text") == "ValueError: Not from this pool"
assert error_of(pool.release, None) == "ValueError: Not from this pool"
pool.release(second)
assert pool.created == 2 and pool.idle == 2 and pool.in_use == 0 and first.cleaned == 4
with pool.lease() as leased:
    assert pool.in_use == 1 and leased is second
    leased.dirty = True
assert pool.in_use == 0 and pool.idle == 2 and leased.dirty is False
try:
    with pool.lease() as leased:
        raise RuntimeError("boom")
except RuntimeError:
    pass
assert pool.in_use == 0 and pool.idle == 2
with pool.lease() as one:
    with pool.lease() as two:
        assert one is not two and pool.in_use == 2
        assert error_of(pool.acquire) == "ValueError: Pool exhausted"
    assert pool.in_use == 1
assert pool.in_use == 0
class Broken:
    count = 0
    def __init__(self):
        Broken.count += 1
        self.id = Broken.count
state = {"fail": True}
def picky(obj):
    if state["fail"] and obj.id == 1:
        raise OSError("cannot reset")
shaky = Pool(Broken, 1, picky)
bad_one = shaky.acquire()
assert error_of(shaky.release, bad_one) == "OSError: cannot reset"
assert shaky.created == 0 and shaky.in_use == 0 and shaky.idle == 0
assert error_of(shaky.release, bad_one) == "ValueError: Not from this pool"
fresh = shaky.acquire()
assert fresh is not bad_one and fresh.id == 2 and shaky.created == 1
shaky.release(fresh)
assert shaky.idle == 1 and shaky.acquire() is fresh
calls = {"n": 0}
def flaky():
    calls["n"] += 1
    if calls["n"] == 1:
        raise RuntimeError("no connection")
    return object()
fp = Pool(flaky, 1)
assert error_of(fp.acquire) == "RuntimeError: no connection" and fp.created == 0 and fp.in_use == 0
got = fp.acquire()
assert fp.created == 1 and fp.in_use == 1 and got is not None
plain = Pool(list, 1)
item = plain.acquire()
item.append(1)
plain.release(item)
assert plain.acquire() == [1]''',
    solution=r'''from contextlib import contextmanager


class Pool:
    def __init__(self, factory, size, reset=None):
        if type(size) is not int or size < 1:
            raise ValueError("Size must be positive")
        self._factory = factory
        self._size = size
        self._reset = reset
        self._idle = []
        self._busy = {}

    @property
    def created(self):
        return len(self._idle) + len(self._busy)

    @property
    def in_use(self):
        return len(self._busy)

    @property
    def idle(self):
        return len(self._idle)

    def acquire(self):
        if self._idle:
            obj = self._idle.pop()
        elif self.created < self._size:
            obj = self._factory()
        else:
            raise ValueError("Pool exhausted")
        self._busy[id(obj)] = obj
        return obj

    def release(self, obj):
        if any(item is obj for item in self._idle):
            raise ValueError("Already released")
        if id(obj) not in self._busy or self._busy[id(obj)] is not obj:
            raise ValueError("Not from this pool")
        del self._busy[id(obj)]
        if self._reset is not None:
            self._reset(obj)
        self._idle.append(obj)

    @contextmanager
    def lease(self):
        obj = self.acquire()
        try:
            yield obj
        finally:
            self.release(obj)''',
    hints=[
        r'''Keep two collections: a list of idle objects (use `pop()` so the most recently released comes back first) and a dict of busy objects keyed by `id(obj)`. `created` is just the two sizes added together.''',
        r'''Compare with identity, never `==`: a pooled object may define `__eq__` loosely. Look an object up with `id(obj)` and then confirm `is`, and look for "already released" with `any(item is obj ...)`.''',
        r'''In `release`, remove the object from the busy dict **before** calling `reset`. If `reset` raises, the object is then already forgotten (discarded), and the exception simply propagates.''',
    ],
    explanation=r'''**The idea.** Some objects are expensive to make (a database connection, a TLS session) and cheap to clean. A pool makes a few, lends them out, and takes them back, so the expensive step happens at most `size` times.

```mermaid
flowchart LR
    A[acquire] --> B{idle object?}
    B -- yes --> C[reuse it]
    B -- no --> D{created < size?}
    D -- yes --> E[factory builds one]
    D -- no --> F[Pool exhausted]
    G[release] --> H[reset then idle]
```

**Lazy, not eager.** Building all `size` objects at start-up wastes time when traffic is low and makes start-up slow when the factory is. The test counts factory calls to prove it.

**Reset on the way back.** The next borrower must never see the previous borrower's state. A reset that fails means the object is in an unknown state, so the safe move is to throw it away and let the pool build a new one later.

**LIFO reuse.** Handing out the most recently released object keeps a few objects "warm" (caches, open sockets) and lets rarely used ones time out. A queue would spread use evenly instead.

**`lease` makes release automatic.** Forgetting `release` leaks an object for ever. A context manager with `finally` makes the correct use the easy one.

**Complexity.** `acquire`, `release`: O(1) apart from the "already released" scan, O(idle).

**Going further.** In a threaded program `acquire` must *wait* when the pool is empty instead of failing. What primitive would you use, and what happens to waiters when an object is discarded?''',
),
P(
    slug='lld-prototype-document', title='Prototype Registry', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/06-creational-patterns/README.md',
    description='Create new documents by cloning registered templates, with deep copies so that no two documents share mutable state.',
    statement=r'''Write two classes, `Document` and `DocumentRegistry`, using the *Prototype* pattern: new objects are made by copying a ready-made one instead of building from scratch.

**Document.** `Document(title, body="", tags=None, meta=None)`.

- `title` must be a non-blank string, else `ValueError("Title required")`.
- It stores its own **copies** of `tags` (a list, default empty) and `meta` (a dict, default empty), so later changes to what the caller passed in do not affect it. Nested values inside `meta` count: copy **deeply**.
- Attributes `title`, `body`, `tags`, `meta` can be changed freely, and `id` starts as `None`.
- `clone(**changes)` returns a new document with the same values and `id` `None`. Everything mutable is copied **deeply**, so changing the clone's `tags` or `meta` (at any depth) never changes the original, and the other way round. `changes` may name `title`, `body`, `tags` or `meta` and replaces that field (also stored as a deep copy); any other name is `ValueError("Unknown field: <name>")` and nothing is made.
- Two documents are equal (`==`) when their `title`, `body`, `tags` and `meta` are equal; the `id` is ignored.

**DocumentRegistry.**

- `register(key, document)` stores a **deep copy** of the document as a prototype; a key already used is `ValueError("Prototype already registered: <key>")`.
- `create(key, **changes)` returns a clone of that prototype with `changes` applied (same rules as `clone`) and an `id` of `1` for the first document the registry creates, `2` for the next, and so on. An unknown key is `ValueError("Unknown prototype: <key>")`. A refused `create` (unknown key or field) does **not** use up an id.
- `keys()` is the sorted list of keys.

Changing the document you registered, or any document you created, must never change the stored prototype.''',
    starter=r'''class Document:
    def __init__(self, title, body="", tags=None, meta=None):
        ...

    def clone(self, **changes):
        ...


class DocumentRegistry:
    def __init__(self):
        ...

    def register(self, key, document):
        ...

    def create(self, key, **changes):
        ...

    def keys(self):
        ...''',
    tests=r'''def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
assert error_of(Document, "") == "ValueError: Title required"
assert error_of(Document, "  ") == "ValueError: Title required"
assert error_of(Document, None) == "ValueError: Title required"
tags = ["a"]
meta = {"owner": {"name": "Asha", "roles": ["admin"]}}
doc = Document("Report", "body", tags, meta)
assert doc.title == "Report" and doc.body == "body" and doc.tags == ["a"] and doc.meta == meta and doc.id is None
tags.append("b")
meta["owner"]["roles"].append("root")
assert doc.tags == ["a"] and doc.meta == {"owner": {"name": "Asha", "roles": ["admin"]}}
blank = Document("T")
assert blank.body == "" and blank.tags == [] and blank.meta == {}
blank.tags.append("x")
assert Document("T").tags == []
twin = doc.clone()
assert twin == doc and twin is not doc and twin.id is None
twin.tags.append("new")
twin.meta["owner"]["roles"].append("viewer")
twin.meta["owner"]["name"] = "Ben"
assert doc.tags == ["a"] and doc.meta["owner"] == {"name": "Asha", "roles": ["admin"]}
assert twin != doc
doc.meta["owner"]["roles"].clear()
assert twin.meta["owner"]["roles"] == ["admin", "viewer"]
doc.id = 99
assert doc.clone().id is None and doc.clone() == doc
changed = doc.clone(title="Other", tags=["z"])
assert changed.title == "Other" and changed.tags == ["z"] and changed.body == "body" and changed.meta == doc.meta
given = ["q"]
made = doc.clone(tags=given)
given.append("r")
assert made.tags == ["q"]
deep = {"k": [1, 2]}
made = doc.clone(meta=deep)
deep["k"].append(3)
assert made.meta == {"k": [1, 2]}
assert error_of(doc.clone, color="red") == "ValueError: Unknown field: color"
assert error_of(doc.clone, title="x", color="red") == "ValueError: Unknown field: color"
assert Document("A", "b") == Document("A", "b") and Document("A", "b") != Document("A", "c") and Document("A", tags=["x"]) != Document("A")
assert Document("A") != "A"
assert Document("A", meta={"k": 1}) != Document("A", meta={"k": 2}) and Document("A", meta={"k": 1}) == Document("A", meta={"k": 1})
reg = DocumentRegistry()
assert reg.keys() == []
template = Document("Invoice", "Dear customer", ["finance"], {"fields": {"due": 30}})
reg.register("memo", Document("Memo"))
reg.register("invoice", template)
assert reg.keys() == ["invoice", "memo"]
assert error_of(reg.register, "invoice", Document("X")) == "ValueError: Prototype already registered: invoice"
template.tags.append("later")
template.meta["fields"]["due"] = 99
first = reg.create("invoice")
assert first.tags == ["finance"] and first.meta == {"fields": {"due": 30}} and first.id == 1 and first.title == "Invoice"
first.tags.append("changed")
first.meta["fields"]["due"] = 1
second = reg.create("invoice", title="Invoice 2", body="Hi")
assert second.id == 2 and second.title == "Invoice 2" and second.body == "Hi" and second.tags == ["finance"] and second.meta == {"fields": {"due": 30}}
assert error_of(reg.create, "nope") == "ValueError: Unknown prototype: nope"
assert error_of(reg.create, "invoice", color="red") == "ValueError: Unknown field: color"
third = reg.create("memo")
assert third.id == 3 and third.title == "Memo" and third is not reg.create("memo")
assert reg.create("memo").id == 5
assert reg.create("memo", tags=["t"]).tags == ["t"] and reg.create("memo").tags == []''',
    solution=r'''import copy


class Document:
    _FIELDS = ("title", "body", "tags", "meta")

    def __init__(self, title, body="", tags=None, meta=None):
        if not isinstance(title, str) or not title.strip():
            raise ValueError("Title required")
        self.id = None
        self.title = title
        self.body = body
        self.tags = copy.deepcopy(tags) if tags else []
        self.meta = copy.deepcopy(meta) if meta else {}

    def clone(self, **changes):
        for name in changes:
            if name not in self._FIELDS:
                raise ValueError("Unknown field: " + name)
        twin = copy.deepcopy(self)
        twin.id = None
        for name, value in changes.items():
            setattr(twin, name, copy.deepcopy(value))
        return twin

    def __eq__(self, other):
        if not isinstance(other, Document):
            return NotImplemented
        return all(getattr(self, name) == getattr(other, name) for name in self._FIELDS)

    __hash__ = None


class DocumentRegistry:
    def __init__(self):
        self._prototypes = {}
        self._made = 0

    def register(self, key, document):
        if key in self._prototypes:
            raise ValueError("Prototype already registered: " + str(key))
        self._prototypes[key] = copy.deepcopy(document)

    def create(self, key, **changes):
        if key not in self._prototypes:
            raise ValueError("Unknown prototype: " + str(key))
        document = self._prototypes[key].clone(**changes)
        self._made += 1
        document.id = self._made
        return document

    def keys(self):
        return sorted(self._prototypes)''',
    hints=[
        r'''`copy.deepcopy` is the whole mechanism: it copies a list of dicts of lists all the way down. Use it in the constructor (so the document owns its data), in `clone`, and in `register`.''',
        r'''Validate the field names of `clone` **before** copying or changing anything. In `create`, take the next id only after the clone succeeded, so a refused call does not burn a number.''',
        r'''A clone starts from a deep copy of the original and then has `id` reset to `None`. Replacement values from `changes` are deep-copied too, otherwise the clone would share a list with the caller.''',
    ],
    explanation=r'''**The idea.** When building an object is complicated (many fields, nested settings) it is easier to keep a few ready-made examples and copy them. The registry is a catalogue of such templates: "invoice", "memo", "report".

**Deep versus shallow.** `dict(meta)` copies only the top level: the inner dict is still shared, so editing a clone's `meta["owner"]["roles"]` secretly edits the template and every other clone. That is the classic Prototype bug, and the test goes three levels down on purpose.

**Copy at every boundary.** Data enters (constructor, `register`, `changes`) and leaves (`clone`, `create`). Copying in both directions is what makes the registry safe against a caller who keeps a reference and changes it later.

**Identity is not value.** `==` ignores the id: two documents with the same content are equal, and the id says "which one". `__hash__ = None` makes that honest: a mutable value object should not be a dictionary key.

**Complexity.** Cloning costs time proportional to the size of the document.

**Going further.** `copy.deepcopy` calls `__deepcopy__` if you define it. When would you want a document to copy its `tags` but *share* a large attachment?''',
),
P(
    slug='lld-smart-home-facade', title='Smart Home Facade', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/07-structural-patterns/README.md',
    description='Hide four device subsystems behind simple scenes (Facade): fixed order, shared defaults and clear failure reports.',
    statement=r'''Write a class `SmartHome` that gives callers one button per scene instead of four devices to operate in the right order: the *Facade* pattern.

**Creating one:** `SmartHome(lights, thermostat, alarm, lock)`. The four devices are passed in; they are **not** part of your code. Their methods:

- `lights.rooms()` is the list of room names; `lights.set_level(room, level)` sets a room's brightness (0 to 100).
- `thermostat.set_target(celsius)`.
- `alarm.arm()` and `alarm.disarm(code)`; `disarm` raises `ValueError("Wrong code")` for a wrong code.
- `lock.lock()` and `lock.unlock()`.

**Scenes.** Each scene performs its steps **in this order** and returns the list of **step names** it carried out.

- `leave_home()`: `"lights"` (every room set to 0, in the order `rooms()` gives them), `"thermostat"` (16), `"lock"` (lock), `"alarm"` (arm). The alarm is armed **after** the door is locked.
- `arrive_home(code)`: `"alarm"` (disarm with `code`), `"lock"` (unlock), `"lights"` (the room `"hall"` to 80), `"thermostat"` (21). The alarm is disarmed **before** the door opens.
- `movie_night()`: `"lights"` (room `"living"` to 20, every other room to 0, in the order `rooms()` gives them), `"thermostat"` (22).

**Failures.** If any device call raises an exception, the scene **stops**: later steps are not run, earlier steps are **not** undone, and a `ValueError` is raised with the message `"<scene> failed at <step>: <original message>"` (for example `"arrive_home failed at alarm: Wrong code"`). The scene names are `leave_home`, `arrive_home` and `movie_night`.''',
    starter=r'''class SmartHome:
    def __init__(self, lights, thermostat, alarm, lock):
        ...

    def leave_home(self):
        """Return the list of steps carried out."""
        ...

    def arrive_home(self, code):
        ...

    def movie_night(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
calls = []
class Lights:
    def __init__(self, rooms):
        self._rooms = list(rooms)
    def rooms(self):
        return list(self._rooms)
    def set_level(self, room, level):
        calls.append(("lights", room, level))
class Thermostat:
    def set_target(self, celsius):
        calls.append(("thermostat", celsius))
class Alarm:
    def __init__(self, code="1234"):
        self.code = code
    def arm(self):
        calls.append(("alarm", "arm"))
    def disarm(self, code):
        if code != self.code:
            raise ValueError("Wrong code")
        calls.append(("alarm", "disarm"))
class Lock:
    def __init__(self, jammed=False):
        self.jammed = jammed
    def lock(self):
        if self.jammed:
            raise OSError("door jammed")
        calls.append(("lock", "lock"))
    def unlock(self):
        calls.append(("lock", "unlock"))
home = SmartHome(Lights(["hall", "living", "bedroom"]), Thermostat(), Alarm(), Lock())
assert home.leave_home() == ["lights", "thermostat", "lock", "alarm"]
assert calls == [("lights", "hall", 0), ("lights", "living", 0), ("lights", "bedroom", 0), ("thermostat", 16), ("lock", "lock"), ("alarm", "arm")]
calls.clear()
assert home.arrive_home("1234") == ["alarm", "lock", "lights", "thermostat"]
assert calls == [("alarm", "disarm"), ("lock", "unlock"), ("lights", "hall", 80), ("thermostat", 21)]
calls.clear()
assert home.movie_night() == ["lights", "thermostat"]
assert calls == [("lights", "hall", 0), ("lights", "living", 20), ("lights", "bedroom", 0), ("thermostat", 22)]
calls.clear()
assert error_of(home.arrive_home, "0000") == "ValueError: arrive_home failed at alarm: Wrong code"
assert calls == []
jammed = SmartHome(Lights(["a", "b"]), Thermostat(), Alarm(), Lock(jammed=True))
calls.clear()
assert error_of(jammed.leave_home) == "ValueError: leave_home failed at lock: door jammed"
assert calls == [("lights", "a", 0), ("lights", "b", 0), ("thermostat", 16)]
assert ("alarm", "arm") not in calls
calls.clear()
assert jammed.arrive_home("1234") == ["alarm", "lock", "lights", "thermostat"]
assert calls[0] == ("alarm", "disarm") and calls[1] == ("lock", "unlock")
class BrokenLights(Lights):
    def set_level(self, room, level):
        if room == "b":
            raise RuntimeError("bulb " + room + " burnt out")
        super().set_level(room, level)
calls.clear()
broken = SmartHome(BrokenLights(["a", "b", "c"]), Thermostat(), Alarm(), Lock())
assert error_of(broken.leave_home) == "ValueError: leave_home failed at lights: bulb b burnt out"
assert calls == [("lights", "a", 0)]
calls.clear()
assert error_of(broken.movie_night) == "ValueError: movie_night failed at lights: bulb b burnt out"
calls.clear()
empty = SmartHome(Lights([]), Thermostat(), Alarm(), Lock())
calls.clear()
assert empty.leave_home() == ["lights", "thermostat", "lock", "alarm"]
assert calls == [("thermostat", 16), ("lock", "lock"), ("alarm", "arm")]
calls.clear()
assert empty.movie_night() == ["lights", "thermostat"] and calls == [("thermostat", 22)]
class Counter:
    def __init__(self):
        self.reads = 0
    def rooms(self):
        self.reads += 1
        return ["x", "y"]
    def set_level(self, room, level):
        pass
counter = Counter()
once = SmartHome(counter, Thermostat(), Alarm(), Lock())
once.leave_home()
assert counter.reads == 1
once.movie_night()
assert counter.reads == 2''',
    solution=r'''class SmartHome:
    def __init__(self, lights, thermostat, alarm, lock):
        self._lights = lights
        self._thermostat = thermostat
        self._alarm = alarm
        self._lock = lock

    @staticmethod
    def _run(scene, steps):
        done = []
        for name, action in steps:
            try:
                action()
            except Exception as error:
                raise ValueError(f"{scene} failed at {name}: {error}") from None
            done.append(name)
        return done

    def _all_lights(self, level_of):
        for room in self._lights.rooms():
            self._lights.set_level(room, level_of(room))

    def leave_home(self):
        return self._run("leave_home", [
            ("lights", lambda: self._all_lights(lambda room: 0)),
            ("thermostat", lambda: self._thermostat.set_target(16)),
            ("lock", self._lock.lock),
            ("alarm", self._alarm.arm),
        ])

    def arrive_home(self, code):
        return self._run("arrive_home", [
            ("alarm", lambda: self._alarm.disarm(code)),
            ("lock", self._lock.unlock),
            ("lights", lambda: self._lights.set_level("hall", 80)),
            ("thermostat", lambda: self._thermostat.set_target(21)),
        ])

    def movie_night(self):
        return self._run("movie_night", [
            ("lights", lambda: self._all_lights(lambda room: 20 if room == "living" else 0)),
            ("thermostat", lambda: self._thermostat.set_target(22)),
        ])''',
    hints=[
        r'''Write each scene as a list of `(step name, zero-argument function)` pairs, and one helper that runs them in order. Then the order of steps is visible at a glance and the failure rule exists in exactly one place.''',
        r'''The helper catches any exception from a step and re-raises `ValueError(f"{scene} failed at {step}: {error}")`. Because it raises straight away, later steps never run, and nothing is undone, as the statement says.''',
        r'''The two orders that matter: **lock before arming** when leaving, **disarm before unlocking** when arriving. A wrong alarm code must therefore stop `arrive_home` before the door opens.''',
    ],
    explanation=r'''**The idea.** The subsystems are individually simple and collectively fiddly: to leave home you need four devices in the right order. A Facade is a small class whose methods are named after what the *user* wants (`leave_home`), and which knows the order, the defaults (16 degrees, hall light at 80) and what to do on failure.

**The facade does not replace the devices.** They are injected, not created inside. That makes `SmartHome` testable with simple recording fakes, and lets one home use a different alarm brand. The test's fake devices only append to a shared list, so the *order of calls* is an exact assertion.

**Order is the product.** Arming the alarm before the lock is engaged means a jammed lock leaves an armed, unlocked house; disarming after unlocking sets the siren off. These two orderings are the reason a facade exists.

**Fail loudly, in one format.** Each scene reports where it stopped using the same message shape. A caller (or a log search) can rely on `"<scene> failed at <step>"`.

**No rollback, on purpose.** Undoing lights and the thermostat after a jammed lock is rarely what you want. The statement says what happens, and the tests check that the lights stayed off.

**Complexity.** Each scene is a fixed number of device calls.

**Going further.** Scenes that must be all-or-nothing need compensating steps (a *saga*). What would `leave_home` undo if the alarm failed to arm?''',
),
P(
    slug='lld-glyph-flyweight', title='Glyph Flyweight', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/07-structural-patterns/README.md',
    description='Share one immutable glyph object per character, font and size across a large text buffer (Flyweight) and lay it out in lines.',
    statement=r'''Write three classes for a text editor that must hold a million characters without a million objects: the *Flyweight* pattern.

**Glyph.** `Glyph(char, font, size)` is an immutable value: the shape of one character in one font at one size.

- `char` must be a string of exactly one character, else `ValueError("Glyph must be one character")`; `font` must be one of `"mono"`, `"serif"`, `"sans"`, else `ValueError("Unknown font: <font>")`; `size` must be an `int` of 1 or more (not a `bool`), else `ValueError("Size must be positive")`. Check in that order.
- `char`, `font`, `size` and `width` are read-only properties (assigning raises `AttributeError`). `width = size * percent // 100` with `percent` 60 for `"mono"`, 55 for `"serif"`, 50 for `"sans"`.

**GlyphFactory.**

- `get(char, font, size)` returns the **same object** for the same three values (so `get("a", "mono", 12) is get("a", "mono", 12)`), and a different one otherwise. Invalid values raise the `Glyph` errors above and create nothing.
- `count` is how many different glyphs exist.

**TextBuffer.** `TextBuffer(factory)` stores text as a list of **shared** glyphs, one per character.

- `append(text, font="mono", size=12)` adds the characters of `text` (`""` is fine).
- `text` is the whole content as a string; `len(buffer)` is the number of characters; `glyph_at(index)` is the glyph object at a position (a bad index raises `IndexError`); `width` is the sum of the glyph widths.
- `layout(max_width)` splits the text into lines, **greedily**: keep adding characters to the line while the line's width stays at most `max_width`; a character that does not fit starts a new line. A `"\n"` ends the current line (it takes no width and is not in any line). A `max_width` smaller than the widest glyph in the text is `ValueError("Width too small")`. Returns a list of strings (an empty text gives `[]`).

Appending 100,000 characters must create no more glyphs than there are distinct (character, font, size) combinations.''',
    starter=r'''class Glyph:
    def __init__(self, char, font, size):
        ...

    # read-only: char, font, size, width


class GlyphFactory:
    def __init__(self):
        ...

    def get(self, char, font, size):
        ...

    @property
    def count(self):
        ...


class TextBuffer:
    def __init__(self, factory):
        ...

    def append(self, text, font="mono", size=12):
        ...

    @property
    def text(self):
        ...

    @property
    def width(self):
        ...

    def glyph_at(self, index):
        ...

    def layout(self, max_width):
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
def kind_of(action):
    try:
        action()
    except Exception as error:
        return type(error).__name__
    return None
assert error_of(Glyph, "ab", "mono", 12) == "ValueError: Glyph must be one character"
assert error_of(Glyph, "", "mono", 12) == "ValueError: Glyph must be one character"
assert error_of(Glyph, 5, "mono", 12) == "ValueError: Glyph must be one character"
assert error_of(Glyph, "a", "comic", 12) == "ValueError: Unknown font: comic"
assert error_of(Glyph, "a", "mono", 0) == "ValueError: Size must be positive"
assert error_of(Glyph, "a", "mono", True) == "ValueError: Size must be positive"
assert error_of(Glyph, "a", "mono", 1.5) == "ValueError: Size must be positive"
assert error_of(Glyph, "ab", "comic", 0) == "ValueError: Glyph must be one character"
assert error_of(Glyph, "a", "comic", 0) == "ValueError: Unknown font: comic"
g = Glyph("a", "mono", 20)
assert (g.char, g.font, g.size, g.width) == ("a", "mono", 20, 12)
assert Glyph("a", "serif", 20).width == 11 and Glyph("a", "sans", 20).width == 10 and Glyph("a", "sans", 15).width == 7 and Glyph("a", "mono", 1).width == 0
assert kind_of(lambda: setattr(g, "size", 5)) == "AttributeError" and kind_of(lambda: setattr(g, "extra", 5)) == "AttributeError"
factory = GlyphFactory()
assert factory.count == 0
a1 = factory.get("a", "mono", 12)
assert factory.get("a", "mono", 12) is a1 and factory.count == 1
assert factory.get("a", "mono", 13) is not a1 and factory.get("a", "sans", 12) is not a1 and factory.get("b", "mono", 12) is not a1 and factory.count == 4
assert error_of(factory.get, "ab", "mono", 12) == "ValueError: Glyph must be one character" and factory.count == 4
assert error_of(factory.get, "a", "comic", 12) == "ValueError: Unknown font: comic" and factory.count == 4
assert error_of(factory.get, "a", "mono", 0) == "ValueError: Size must be positive" and factory.count == 4
assert factory.get("A", "mono", 12) is not a1
assert factory.get(" ", "mono", 12) is factory.get(" ", "mono", 12)
buf = TextBuffer(GlyphFactory())
assert len(buf) == 0 and buf.text == "" and buf.width == 0 and buf.layout(100) == []
buf.append("")
assert len(buf) == 0
shared = GlyphFactory()
buf = TextBuffer(shared)
buf.append("hello", "mono", 10)
buf.append(" world", "sans", 20)
assert buf.text == "hello world" and len(buf) == 11
assert buf.width == 5 * 6 + 6 * 10
assert buf.glyph_at(0) is shared.get("h", "mono", 10) and buf.glyph_at(2) is buf.glyph_at(3)
assert buf.glyph_at(1) is not buf.glyph_at(0) and buf.glyph_at(6) is shared.get("w", "sans", 20) and buf.glyph_at(-1) is shared.get("d", "sans", 20)
assert shared.count == len({("h", "mono", 10), ("e", "mono", 10), ("l", "mono", 10), ("o", "mono", 10), (" ", "sans", 20), ("w", "sans", 20), ("r", "sans", 20), ("l", "sans", 20), ("d", "sans", 20), ("o", "sans", 20)})
assert kind_of(lambda: buf.glyph_at(11)) == "IndexError" and kind_of(lambda: buf.glyph_at(100)) == "IndexError"
assert error_of(buf.append, "x", "comic") == "ValueError: Unknown font: comic" and buf.text == "hello world"
assert error_of(buf.append, "xy", "mono", 0) == "ValueError: Size must be positive" and buf.text == "hello world"
lay = TextBuffer(GlyphFactory())
lay.append("abcdefgh", "mono", 10)
assert lay.layout(18) == ["abc", "def", "gh"]
assert lay.layout(6) == ["a", "b", "c", "d", "e", "f", "g", "h"]
assert lay.layout(48) == ["abcdefgh"] and lay.layout(47) == ["abcdefg", "h"] and lay.layout(1000) == ["abcdefgh"]
assert error_of(lay.layout, 5) == "ValueError: Width too small" and error_of(lay.layout, 0) == "ValueError: Width too small"
nl = TextBuffer(GlyphFactory())
nl.append("ab\ncd\n\nef", "mono", 10)
assert nl.layout(100) == ["ab", "cd", "", "ef"]
assert nl.layout(12) == ["ab", "cd", "", "ef"]
trail = TextBuffer(GlyphFactory())
trail.append("ab\n", "mono", 10)
assert trail.layout(100) == ["ab"]
lonely = TextBuffer(GlyphFactory())
lonely.append("\n", "mono", 10)
assert lonely.layout(100) == [""]
mix = TextBuffer(GlyphFactory())
mix.append("ab", "mono", 10)
mix.append("cd", "sans", 20)
assert mix.layout(22) == ["abc", "d"]
assert mix.width == 12 + 20
assert mix.layout(32) == ["abcd"] and mix.layout(21) == ["ab", "cd"]
assert error_of(mix.layout, 9) == "ValueError: Width too small" and error_of(TextBuffer(GlyphFactory()).layout, 0) is None
big_factory = GlyphFactory()
big = TextBuffer(big_factory)
started = time.time()
for repeat in range(1000):
    big.append("The quick brown fox jumps over the lazy dog. " * 2, "mono", 12)
assert len(big) == 1000 * 90 and big_factory.count == len(set("The quick brown fox jumps over the lazy dog. "))
assert time.time() - started < 3.0
assert len(set(id(big.glyph_at(i)) for i in range(len(big)))) == big_factory.count''',
    solution=r'''_PERCENT = {"mono": 60, "serif": 55, "sans": 50}


class Glyph:
    __slots__ = ("_char", "_font", "_size")

    def __init__(self, char, font, size):
        if not isinstance(char, str) or len(char) != 1:
            raise ValueError("Glyph must be one character")
        if font not in _PERCENT:
            raise ValueError("Unknown font: " + str(font))
        if type(size) is not int or size < 1:
            raise ValueError("Size must be positive")
        object.__setattr__(self, "_char", char)
        object.__setattr__(self, "_font", font)
        object.__setattr__(self, "_size", size)

    def __setattr__(self, name, value):
        raise AttributeError("Glyph is immutable")

    @property
    def char(self):
        return self._char

    @property
    def font(self):
        return self._font

    @property
    def size(self):
        return self._size

    @property
    def width(self):
        return self._size * _PERCENT[self._font] // 100


class GlyphFactory:
    def __init__(self):
        self._glyphs = {}

    def get(self, char, font, size):
        glyph = Glyph(char, font, size)
        key = (char, font, size)
        if key not in self._glyphs:
            self._glyphs[key] = glyph
        return self._glyphs[key]

    @property
    def count(self):
        return len(self._glyphs)


class TextBuffer:
    def __init__(self, factory):
        self._factory = factory
        self._glyphs = []
        self._width = 0

    def append(self, text, font="mono", size=12):
        added = [self._factory.get(char, font, size) for char in text]
        self._glyphs.extend(added)
        self._width += sum(glyph.width for glyph in added)

    def __len__(self):
        return len(self._glyphs)

    @property
    def text(self):
        return "".join(glyph.char for glyph in self._glyphs)

    @property
    def width(self):
        return self._width

    def glyph_at(self, index):
        return self._glyphs[index]

    def layout(self, max_width):
        if any(glyph.width > max_width for glyph in self._glyphs if glyph.char != "\n"):
            raise ValueError("Width too small")
        lines = []
        current = []
        used = 0
        for glyph in self._glyphs:
            if glyph.char == "\n":
                lines.append("".join(current))
                current, used = [], 0
                continue
            if used + glyph.width > max_width:
                lines.append("".join(current))
                current, used = [], 0
            current.append(glyph.char)
            used += glyph.width
        if current:
            lines.append("".join(current))
        return lines''',
    hints=[
        r'''The flyweight is the factory: a dictionary from `(char, font, size)` to the one `Glyph` object for it. `get` returns the stored object when the key exists, so a hundred thousand "e"s all point at one object.''',
        r'''The buffer holds only a list of references to shared glyphs. What is *not* in the glyph (the position in the text) lives in the list index: that is the extrinsic state the pattern talks about.''',
        r'''Greedy layout: start a new line **before** adding a glyph that would push the line over `max_width`. A `"\n"` closes the current line even if it is empty, but a trailing newline must not add an extra empty line at the end.''',
    ],
    explanation=r'''**The idea.** Most characters in a document repeat. Storing an object per character repeats the same font data a million times. A flyweight splits the data: the part that is the same for everybody (character, font, size: *intrinsic*) is stored once and shared; the part that differs (where it sits in the text: *extrinsic*) is kept outside the object, here as the position in the list.

**Why immutability is required.** If one shared glyph could be changed, changing "the e in this word" would change every "e" in the document. That is why `Glyph` refuses attribute assignment: sharing is only safe for values that cannot change.

**The factory is the guard.** If anyone could call `Glyph(...)` directly, sharing would depend on everyone's discipline. Routing creation through `get` makes sharing the only way to get a glyph; the test `is` checks the identity, not equality.

**Validate before you store.** `get` builds the `Glyph` first (which raises on bad input) and only then touches the dictionary, so a bad call creates nothing.

**Complexity.** `append` is O(characters); memory is O(distinct glyphs + characters x one pointer).

**Going further.** Real editors share *runs* of text with the same style rather than one glyph per character. How would `TextBuffer` change if it stored `(glyph_style, text_run)` pairs?''',
),
]
