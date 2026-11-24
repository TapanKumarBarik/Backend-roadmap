PROBLEMS = [
P(
    slug='lld-order-state-machine', title='Order State Machine', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/08-behavioral-patterns-i/README.md',
    description='Model an order lifecycle as a table of allowed transitions, so a different workflow is data, not new code (State).',
    statement=r'''Write an `Order` whose life is a set of **states** and the **actions** that move it between them, and an exception for illegal moves.

**The default workflow**

| from | action | to |
|---|---|---|
| `created` | `pay` | `paid` |
| `created` | `cancel` | `cancelled` |
| `paid` | `ship` | `shipped` |
| `paid` | `cancel` | `cancelled` |
| `shipped` | `deliver` | `delivered` |

`delivered` and `cancelled` are final: no action leaves them.

**`IllegalTransition`** is an exception class (a subclass of `Exception`) that you define.

**`Order(order_id, transitions=None, initial="created")`**

- `transitions` is a dict `{(state, action): new_state}`. With `None` the default workflow above is used. The order keeps **its own copy** of the table: changing the dictionary afterwards must not change the order.
- `state` is the current state.
- `do(action)` performs the action and returns the new state. If the current state does not allow it, raise `IllegalTransition("Cannot <action> an order that is <state>")` (for example `"Cannot ship an order that is created"`) and change nothing.
- `pay()`, `ship()`, `deliver()`, `cancel()` are shortcuts for `do("pay")` and so on.
- `can(action)` says whether the action is allowed now.
- `available_actions()` is the sorted list of actions allowed now (`[]` in a final state).
- `history` is a list of `(from_state, action, to_state)` for every successful action, oldest first. It must be a **copy**: changing it does not change the order.

**Your `Order` is tested with workflows you have never seen**, passed in as a `transitions` table (a document that goes draft, review, published). The class must not hard-code the default states.

**Example**

```
order = Order("o1")
order.pay()                    # "paid"
order.available_actions()      # ["cancel", "ship"]
order.deliver()                # raises IllegalTransition("Cannot deliver an order that is paid")
```''',
    starter=r'''class IllegalTransition(Exception):
    pass


class Order:
    def __init__(self, order_id, transitions=None, initial="created"):
        """Use the default workflow when `transitions` is None; keep your own copy of the table."""
        ...

    @property
    def state(self):
        ...

    @property
    def history(self):
        """A copy: [(from_state, action, to_state), ...]."""
        ...

    def can(self, action):
        ...

    def available_actions(self):
        ...

    def do(self, action):
        """Perform the action and return the new state, or raise IllegalTransition and change nothing."""
        ...

    def pay(self):
        ...

    def ship(self):
        ...

    def deliver(self):
        ...

    def cancel(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
assert issubclass(IllegalTransition, Exception)
order = Order("o1")
assert (order.order_id, order.state, order.history, order.available_actions()) == ("o1", "created", [], ["cancel", "pay"])
assert (order.can("pay"), order.can("ship")) == (True, False)
assert error_of(order.ship) == "IllegalTransition: Cannot ship an order that is created"
assert error_of(order.do, "teleport") == "IllegalTransition: Cannot teleport an order that is created"
assert (order.state, order.history) == ("created", [])
assert order.pay() == "paid"
assert order.available_actions() == ["cancel", "ship"]
assert error_of(order.deliver) == "IllegalTransition: Cannot deliver an order that is paid"
assert error_of(order.pay) == "IllegalTransition: Cannot pay an order that is paid"
assert order.ship() == "shipped"
assert order.available_actions() == ["deliver"]
assert error_of(order.cancel) == "IllegalTransition: Cannot cancel an order that is shipped"
assert order.do("deliver") == "delivered"
assert (order.state, order.available_actions(), order.can("cancel")) == ("delivered", [], False)
assert error_of(order.pay) == "IllegalTransition: Cannot pay an order that is delivered"
assert order.history == [("created", "pay", "paid"), ("paid", "ship", "shipped"), ("shipped", "deliver", "delivered")]
early = Order("o2")
assert early.cancel() == "cancelled"
assert (early.available_actions(), error_of(early.pay)) == ([], "IllegalTransition: Cannot pay an order that is cancelled")
late = Order("o3")
late.pay()
assert late.cancel() == "cancelled"
assert late.history == [("created", "pay", "paid"), ("paid", "cancel", "cancelled")]
copy = order.history
copy.append(("x", "y", "z"))
assert len(order.history) == 3
a, b = Order("a"), Order("b")
a.pay()
assert (a.state, b.state, b.history) == ("paid", "created", [])
doc = {("draft", "submit"): "review", ("review", "approve"): "published", ("review", "reject"): "draft", ("published", "archive"): "archived"}
page = Order("d1", doc, initial="draft")
assert (page.state, page.available_actions()) == ("draft", ["submit"])
assert page.do("submit") == "review"
assert page.available_actions() == ["approve", "reject"]
assert page.do("reject") == "draft"
page.do("submit")
assert page.do("approve") == "published"
assert error_of(page.pay) == "IllegalTransition: Cannot pay an order that is published"
assert error_of(page.do, "submit") == "IllegalTransition: Cannot submit an order that is published"
assert page.do("archive") == "archived"
assert [step[1] for step in page.history] == ["submit", "reject", "submit", "approve", "archive"]
doc[("draft", "publish")] = "published"
fresh = Order("d2", doc, initial="draft")
assert fresh.can("publish") is True
doc[("draft", "delete")] = "gone"
assert fresh.can("delete") is False
assert Order("d3", doc, initial="draft").can("delete") is True
assert Order("o4").can("submit") is False''',
    solution=r'''DEFAULT_TRANSITIONS = {
    ("created", "pay"): "paid",
    ("created", "cancel"): "cancelled",
    ("paid", "ship"): "shipped",
    ("paid", "cancel"): "cancelled",
    ("shipped", "deliver"): "delivered",
}


class IllegalTransition(Exception):
    pass


class Order:
    def __init__(self, order_id, transitions=None, initial="created"):
        self.order_id = order_id
        self._transitions = dict(DEFAULT_TRANSITIONS if transitions is None else transitions)
        self._state = initial
        self._history = []

    @property
    def state(self):
        return self._state

    @property
    def history(self):
        return list(self._history)

    def can(self, action):
        return (self._state, action) in self._transitions

    def available_actions(self):
        return sorted(action for state, action in self._transitions if state == self._state)

    def do(self, action):
        key = (self._state, action)
        if key not in self._transitions:
            raise IllegalTransition(f"Cannot {action} an order that is {self._state}")
        new_state = self._transitions[key]
        self._history.append((self._state, action, new_state))
        self._state = new_state
        return new_state

    def pay(self):
        return self.do("pay")

    def ship(self):
        return self.do("ship")

    def deliver(self):
        return self.do("deliver")

    def cancel(self):
        return self.do("cancel")''',
    hints=[
        r'''Keep the workflow as **data**: a dictionary from `(state, action)` to the next state. `do` is then three lines: look the pair up, refuse if it is missing, otherwise record and move. There is no `if state == "paid"` anywhere.''',
        r'''Copy the table in the constructor (`dict(table)`), and return a copy of the history from the property. Otherwise a caller who edits the dictionary they passed in changes an order that already exists.''',
        r'''Check first, change after: build the error from the *current* state before you touch the state or the history, so a refused action leaves no trace.''',
    ],
    explanation=r'''**The idea.** An order is in exactly one **state**, and what you may do next depends on that state. The textbook **State** pattern gives every state its own class; for most business workflows there is a lighter, better way: put the states and moves in a **table** and have one small engine read it.

```mermaid
stateDiagram-v2
    [*] --> created
    created --> paid: pay
    created --> cancelled: cancel
    paid --> shipped: ship
    paid --> cancelled: cancel
    shipped --> delivered: deliver
    delivered --> [*]
    cancelled --> [*]
```

**Why data beats classes here.** The test passes a *document* workflow (draft, review, published, archived) to the same `Order`. A solution built from `if self.state == "paid"` blocks cannot do that; a table-driven one does it for free. When the rule changes (add a "refund" step), you edit a dictionary, not the engine, and the next workflow is a configuration file, not a deploy.

**Fail loudly and leave no trace.** An illegal action raises a specific exception (`IllegalTransition`) and changes nothing: not the state, not the history. Callers can catch that one type without swallowing real bugs.

**Defensive copies.** The constructor copies the table and `history` returns a copy; the last tests change the original dictionary after the order exists and check that it does not notice.

**When to use real State classes.** If each state has *behaviour* of its own (a `Paid` state that knows how to compute a refund, with its own methods), classes earn their keep. When states differ only in which moves are allowed, a table is simpler and easier to review: product owners can read it.

**Complexity.** `do` and `can` are O(1); `available_actions` is O(number of transitions).

**Going further.** Real workflows need *guards* ("ship only if the address is complete") and *side effects* ("send an email on pay"). Where would you hook them in without turning the table back into code?''',
),

P(
    slug='lld-notification-factory', title='Notification Channel Factory', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/06-creational-patterns/README.md',
    description='Build a registry that creates senders by name, so a new channel is registered, not hard-coded (Factory).',
    statement=r'''Write a `NotificationService` that creates message **senders** for named channels, and three senders to start with.

**A sender** is any object with a method `send(to, message)` that returns a string describing what was sent.

**The three senders you write**

| Class | Created with | `send(to, message)` returns |
|---|---|---|
| `EmailSender` | `EmailSender(from_addr)` | `"email from <from_addr> to <to>: <message>"` |
| `SmsSender` | `SmsSender(sender_id)` | `"sms <sender_id>-><to>: <message>"`, with the message cut to its first **160** characters |
| `PushSender` | `PushSender()` | `"push to <to>: <message>"` |

**`NotificationService()`** starts with the channels `"email"`, `"sms"` and `"push"` already registered. Each service has its **own** registry: registering a channel on one never shows up on another.

- `register(channel, factory, replace=False)` adds a channel. `factory` is any callable that takes keyword arguments and returns a sender. A name that is already registered raises `ValueError("Channel already registered")` unless `replace=True`.
- `create(channel, **config)` calls the channel's factory with `config` and returns a **new** sender each time. An unknown channel raises `ValueError("Unknown channel: <name>")`.
- The three built-in channels need their setting, passed as `from_addr=` for `"email"` and `sender_id=` for `"sms"`; `"push"` needs none. A missing one raises `ValueError("Missing config: from_addr")` (or `sender_id`).
- `channels()` returns the sorted channel names.
- `send(channel, to, message, **config)` creates the sender and returns what its `send` returns.

**Your `NotificationService` is tested with channels you have never seen.** The tests register their own factories (a `"slack"` channel, a class used as a factory) and send through them.

**Example**

```
service = NotificationService()
service.send("email", "asha@example.com", "Hi", from_addr="no-reply@x.io")
# "email from no-reply@x.io to asha@example.com: Hi"
```''',
    starter=r'''class EmailSender:
    def __init__(self, from_addr):
        ...

    def send(self, to, message):
        ...


class SmsSender:
    def __init__(self, sender_id):
        ...

    def send(self, to, message):
        ...


class PushSender:
    def send(self, to, message):
        ...


class NotificationService:
    def __init__(self):
        """The three built-in channels are registered; this service has its own registry."""
        ...

    def register(self, channel, factory, replace=False):
        ...

    def create(self, channel, **config):
        ...

    def channels(self):
        ...

    def send(self, channel, to, message, **config):
        ...''',
    tests=r'''def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
assert EmailSender("a@x.io").send("b@x.io", "Hi") == "email from a@x.io to b@x.io: Hi"
assert SmsSender("ACME").send("+91", "Hello") == "sms ACME->+91: Hello"
assert SmsSender("ACME").send("+91", "x" * 200) == "sms ACME->+91: " + "x" * 160
assert PushSender().send("device-1", "Ping") == "push to device-1: Ping"
service = NotificationService()
assert service.channels() == ["email", "push", "sms"]
assert service.send("email", "asha@example.com", "Hi", from_addr="no-reply@x.io") == "email from no-reply@x.io to asha@example.com: Hi"
assert service.send("sms", "+91", "Hi", sender_id="ACME") == "sms ACME->+91: Hi"
assert service.send("push", "dev", "Hi") == "push to dev: Hi"
sender = service.create("email", from_addr="a@x.io")
assert isinstance(sender, EmailSender) and sender.send("b", "m") == "email from a@x.io to b: m"
assert service.create("email", from_addr="a@x.io") is not sender
assert error_of(service.create, "email") == "ValueError: Missing config: from_addr"
assert error_of(service.create, "sms") == "ValueError: Missing config: sender_id"
assert error_of(service.create, "fax") == "ValueError: Unknown channel: fax"
assert error_of(service.send, "fax", "x", "y") == "ValueError: Unknown channel: fax"
class SlackSender:
    def __init__(self, webhook):
        self.webhook = webhook
    def send(self, to, message):
        return "slack " + self.webhook + " @" + to + ": " + message
service.register("slack", lambda **config: SlackSender(config["webhook"]))
assert service.channels() == ["email", "push", "slack", "sms"]
assert service.send("slack", "asha", "Deploy done", webhook="hooks/1") == "slack hooks/1 @asha: Deploy done"
class Pager:
    def __init__(self, **config):
        self.team = config.get("team", "ops")
    def send(self, to, message):
        return "page " + self.team + ": " + message
service.register("pager", Pager)
assert service.send("pager", "x", "down", team="db") == "page db: down"
assert service.send("pager", "x", "down") == "page ops: down"
assert error_of(service.register, "slack", Pager) == "ValueError: Channel already registered"
assert error_of(service.register, "email", Pager) == "ValueError: Channel already registered"
service.register("slack", Pager, replace=True)
assert service.send("slack", "x", "now a pager") == "page ops: now a pager"
other = NotificationService()
assert other.channels() == ["email", "push", "sms"]
assert error_of(other.create, "pager") == "ValueError: Unknown channel: pager"
service.register("email", lambda **config: PushSender(), replace=True)
assert service.send("email", "dev", "swapped") == "push to dev: swapped"
assert other.send("email", "b", "m", from_addr="a") == "email from a to b: m"''',
    solution=r'''class EmailSender:
    def __init__(self, from_addr):
        self.from_addr = from_addr

    def send(self, to, message):
        return f"email from {self.from_addr} to {to}: {message}"


class SmsSender:
    def __init__(self, sender_id):
        self.sender_id = sender_id

    def send(self, to, message):
        return f"sms {self.sender_id}->{to}: {message[:160]}"


class PushSender:
    def send(self, to, message):
        return f"push to {to}: {message}"


def _email(**config):
    if "from_addr" not in config:
        raise ValueError("Missing config: from_addr")
    return EmailSender(config["from_addr"])


def _sms(**config):
    if "sender_id" not in config:
        raise ValueError("Missing config: sender_id")
    return SmsSender(config["sender_id"])


def _push(**config):
    return PushSender()


class NotificationService:
    def __init__(self):
        self._factories = {"email": _email, "sms": _sms, "push": _push}

    def register(self, channel, factory, replace=False):
        if channel in self._factories and not replace:
            raise ValueError("Channel already registered")
        self._factories[channel] = factory

    def create(self, channel, **config):
        if channel not in self._factories:
            raise ValueError(f"Unknown channel: {channel}")
        return self._factories[channel](**config)

    def channels(self):
        return sorted(self._factories)

    def send(self, channel, to, message, **config):
        return self.create(channel, **config).send(to, message)''',
    hints=[
        r'''Keep a dictionary from channel name to **factory** (any callable that builds a sender). `create` is a lookup and a call; it must not know which channels exist.''',
        r'''Build the registry in `__init__` (an instance attribute), never as a class attribute or a default argument, or every service shares one registry and the "other service" test fails.''',
        r'''The three built-in channels are registered the *same way* a new one is: small factory functions that check their settings and build the sender. Nothing about `"email"` should be special inside `create`.''',
    ],
    explanation=r'''**The idea.** A **factory** hides *which class* gets built behind a name. The caller says `create("slack", webhook=...)` and does not import `SlackSender`. A **registry** makes the factory open: a new channel is one `register` call, with no edit to the service.

```mermaid
classDiagram
    class NotificationService {
        -factories dict
        +register()
        +create() Sender
        +send()
    }
    class Sender {
        <<interface>>
        +send()
    }
    NotificationService ..> Sender : creates
    Sender <|.. EmailSender
    Sender <|.. SmsSender
    Sender <|.. PushSender
    Sender <|.. YourSlackSender
```

**The wrong version.** `create` full of `if channel == "email": ... elif channel == "sms": ...`. Every new channel edits `NotificationService`, which is the **Open/Closed** violation; a registry turns the `if` chain into a dictionary lookup. The test that registers `"slack"` and a `Pager` *class* (a class is a callable that returns an instance, so it works as a factory unchanged) passes only if `create` treats all channels alike.

**Built-ins are just registrations.** The three starting channels go in the same dictionary through the same door. That is the sign of a good extension point: the framework uses it too.

**Per-instance state.** The registry lives on the instance. A class-level dictionary would make a channel registered in one test appear in every other service for the rest of the run, the kind of bug that only shows up in test order.

**Refusing duplicates.** Silently replacing `"email"` by accident would reroute every email; `replace=True` makes the intent explicit.

**Complexity.** O(1) per create.

**Going further.** Plug-in systems often register by decorator (`@service.channel("slack")`) or by scanning installed packages (entry points). Both end in the same `register` call.''',
),

P(
    slug='lld-text-decorators', title='Stackable Text Decorators', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/07-structural-patterns/README.md',
    description='Wrap a text component in decorators that stack in any order, with a base class new decorators can inherit (Decorator).',
    statement=r'''Write a small text-rendering toolkit built from **wrappers**.

**The component interface** is two methods: `render()` returns a string, and `describe()` returns a string naming the wrapping.

**`PlainText(text)`** is the basic component. `render()` returns the text; `describe()` returns `"PlainText"`.

**`TextDecorator(inner)`** is a **base class** for wrappers. It keeps `inner` (any component) and, by default:

- `render()` returns `inner.render()` unchanged;
- `describe()` returns `"<ClassName>(<inner.describe()>)"`, using the name of the actual class, so `Bold(Upper(PlainText("hi"))).describe()` is `"Bold(Upper(PlainText))"`;
- `unwrap()` returns `inner`.

**The decorators you write** (all subclasses of `TextDecorator`, each overriding only `render`)

| Class | Created with | `render()` |
|---|---|---|
| `Upper` | `Upper(inner)` | the inner text in upper case |
| `Bold` | `Bold(inner)` | `"**"` + the inner text + `"**"` |
| `Prefix` | `Prefix(inner, prefix)` | `prefix` + the inner text |
| `Truncate` | `Truncate(inner, limit)` | the inner text if it has at most `limit` characters, otherwise its first `limit - 3` characters followed by `"..."`. A `limit` below 3 raises `ValueError("Limit too small")` when it is created |

Decorators stack in **any order and any depth**, and rendering never changes a component: calling `render()` twice gives the same string.

**The tests write decorators of their own** by subclassing your `TextDecorator` and overriding `render`. They must get `describe()` and `unwrap()` from your base class without writing them.

**Example**

```
text = Bold(Truncate(Upper(PlainText("hello world")), 8))
text.render()      # "**HELLO...**"   (Upper makes "HELLO WORLD"; cut to 8: "HELLO" + "...")
text.describe()    # "Bold(Truncate(Upper(PlainText)))"
```''',
    starter=r'''class PlainText:
    def __init__(self, text):
        ...

    def render(self):
        ...

    def describe(self):
        ...


class TextDecorator:
    def __init__(self, inner):
        ...

    def render(self):
        """By default: whatever the wrapped component renders."""
        ...

    def describe(self):
        """"<ClassName>(<inner.describe()>)"."""
        ...

    def unwrap(self):
        ...


class Upper(TextDecorator):
    ...


class Bold(TextDecorator):
    ...


class Prefix(TextDecorator):
    def __init__(self, inner, prefix):
        ...


class Truncate(TextDecorator):
    def __init__(self, inner, limit):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
base = PlainText("hello world")
assert (base.render(), base.describe()) == ("hello world", "PlainText")
assert Upper(base).render() == "HELLO WORLD"
assert Bold(base).render() == "**hello world**"
assert Prefix(base, "> ").render() == "> hello world"
assert Truncate(base, 8).render() == "hello..."
assert Truncate(base, 11).render() == "hello world"
assert Truncate(base, 20).render() == "hello world"
assert Truncate(PlainText("abcdef"), 5).render() == "ab..."
assert Truncate(PlainText("abcd"), 3).render() == "..."
assert error_of(Truncate, base, 2) == "ValueError: Limit too small"
assert Bold(Upper(PlainText("hi"))).render() == "**HI**"
assert Upper(Bold(PlainText("hi"))).render() == "**HI**"
assert Truncate(Bold(base), 8).render() == "**hel..."
assert Bold(Truncate(base, 8)).render() == "**hello...**"
assert Prefix(Upper(Prefix(PlainText("x"), "a")), "b").render() == "bAX"
assert Bold(Upper(PlainText("hi"))).describe() == "Bold(Upper(PlainText))"
assert Truncate(Prefix(Bold(base), "-"), 9).describe() == "Truncate(Prefix(Bold(PlainText)))"
assert Upper(base).render() == Upper(base).render() == "HELLO WORLD"
assert base.render() == "hello world"
stack = Bold(Upper(base))
assert stack.unwrap().unwrap() is base
assert isinstance(stack, TextDecorator)
assert issubclass(Truncate, TextDecorator) and issubclass(Prefix, TextDecorator)
class Rot13(TextDecorator):
    def render(self):
        import codecs
        return codecs.encode(self.inner.render(), "rot13")
class Reverse(TextDecorator):
    def render(self):
        return self.inner.render()[::-1]
class Passthrough(TextDecorator):
    pass
assert Passthrough(PlainText("x")).render() == "x"
assert Passthrough(PlainText("x")).describe() == "Passthrough(PlainText)"
assert Rot13(PlainText("Hello")).render() == "Uryyb"
assert Rot13(PlainText("Hello")).describe() == "Rot13(PlainText)"
assert Bold(Rot13(Reverse(PlainText("abc")))).render() == "**pon**"
assert Bold(Rot13(Reverse(PlainText("abc")))).describe() == "Bold(Rot13(Reverse(PlainText)))"
assert Reverse(Upper(PlainText("ab"))).unwrap().unwrap().render() == "ab"
assert Rot13(Truncate(PlainText("hello world"), 8)).render() == "uryyb..."
class Counter(TextDecorator):
    def __init__(self, inner):
        super().__init__(inner)
        self.calls = 0
    def render(self):
        self.calls += 1
        return self.inner.render()
counted = Counter(Bold(PlainText("x")))
assert (counted.render(), counted.render(), counted.calls) == ("**x**", "**x**", 2)
assert counted.describe() == "Counter(Bold(PlainText))"''',
    solution=r'''class PlainText:
    def __init__(self, text):
        self._text = text

    def render(self):
        return self._text

    def describe(self):
        return "PlainText"


class TextDecorator:
    def __init__(self, inner):
        self.inner = inner

    def render(self):
        return self.inner.render()

    def describe(self):
        return f"{type(self).__name__}({self.inner.describe()})"

    def unwrap(self):
        return self.inner


class Upper(TextDecorator):
    def render(self):
        return self.inner.render().upper()


class Bold(TextDecorator):
    def render(self):
        return "**" + self.inner.render() + "**"


class Prefix(TextDecorator):
    def __init__(self, inner, prefix):
        super().__init__(inner)
        self.prefix = prefix

    def render(self):
        return self.prefix + self.inner.render()


class Truncate(TextDecorator):
    def __init__(self, inner, limit):
        if limit < 3:
            raise ValueError("Limit too small")
        super().__init__(inner)
        self.limit = limit

    def render(self):
        text = self.inner.render()
        if len(text) <= self.limit:
            return text
        return text[: self.limit - 3] + "..."''',
    hints=[
        r'''A decorator **is a** component and **has a** component. Give `TextDecorator` the same two methods as `PlainText`, and have its default `render` just ask the inner one. Each subclass then overrides only the part that is different.''',
        r'''Write `describe()` once, in the base class, using `type(self).__name__`, so every present and future decorator (including the tests' own) reports itself correctly without writing it.''',
        r'''Decorators must not change the component they wrap: compute the new string from `self.inner.render()` every time and store nothing derived. Check `Truncate`'s limit in its constructor, before calling `super().__init__`.''',
    ],
    explanation=r'''**The idea.** The **Decorator** pattern adds behaviour to an object by *wrapping* it in another object that has the same interface. Because a decorator looks exactly like the thing it wraps, you can wrap a wrapper: `Bold(Truncate(Upper(PlainText(...))))`. Behaviour is stacked at run time instead of being baked into a subclass for every combination.

```mermaid
classDiagram
    class Component {
        <<interface>>
        +render()
        +describe()
    }
    class PlainText
    class TextDecorator {
        +inner Component
        +render()
        +describe()
        +unwrap()
    }
    Component <|.. PlainText
    Component <|.. TextDecorator
    TextDecorator o-- Component : wraps
    TextDecorator <|-- Upper
    TextDecorator <|-- Bold
    TextDecorator <|-- Truncate
    TextDecorator <|-- YourRot13
```

**Why not subclasses?** With four decorators you would need a class for every combination (`BoldUpper`, `UpperTruncate`, ...): 15 subclasses for four options, and doubling with each new one. Decorators are *composition*, so four small classes cover every order.

**Order matters, and the tests show it.** `Truncate(Bold(x), 8)` cuts into the asterisks (`**hel...`) while `Bold(Truncate(x, 8))` wraps the cut text (`**hello...**`). Stacking is not commutative, which is exactly why it is a runtime choice for the caller.

**The shared base class is the extension point.** The tests' `Rot13`, `Reverse` and `Counter` inherit `__init__`, `describe` and `unwrap` and write only `render`. That is **Template Method** inside Decorator: the base class fixes the plumbing, the subclass supplies the one step that differs.

**Where you meet it.** Python's `functools.wraps` decorators, Java's `BufferedReader(new FileReader(...))`, middleware stacks, and logging wrappers are all this idea.

**Complexity.** Rendering costs O(depth) calls plus the text work of each layer.

**Going further.** Decorators and the thing they wrap can drift apart: `isinstance(stack, PlainText)` is false. What does that mean for code that needs the original object, and how does `unwrap()` help?''',
),

P(
    slug='lld-payment-adapters', title='Payment Gateway Adapters', topic='lld-patterns-in-use', difficulty='advanced',
    module='lld/07-structural-patterns/README.md',
    description='Wrap two incompatible payment SDKs behind one interface and try gateways in order until one accepts (Adapter).',
    statement=r'''You must put two third-party payment SDKs, which you cannot change, behind **one** interface, and write a processor that falls back from one gateway to the next.

**The two SDKs** (the tests provide fakes with exactly these methods)

- Stripe-like: `sdk.create_charge(source=<token>, amount=<cents>, currency=<lowercase code>)` returns a dict `{"status": "succeeded" or "failed", "id": "<ref>"}`.
- PayPal-like: `sdk.execute_payment(<token>, <amount as a string such as "12.34">, <UPPERCASE code>)` returns a tuple `(code, ref)` where `code` is `"APPROVED"` or `"DECLINED"`.

**The interface you define.** A **gateway** is any object with `charge(amount_cents, currency, token)` that returns a `Receipt`.

**What to write**

- `Receipt(ok, ref)`: a value with those two attributes; two receipts with the same `ok` and `ref` are equal.
- `StripeAdapter(sdk)` and `PayPalAdapter(sdk)`: gateways that call their SDK as above and turn the answer into a `Receipt` (`ok` is `True` for `"succeeded"` / `"APPROVED"`). Turn cents into the PayPal amount string with integer arithmetic (`1234` becomes `"12.34"`, `5` becomes `"0.05"`, `1200` becomes `"12.00"`); `currency` is passed in any case, so lower-case it for Stripe and upper-case it for PayPal.
- `PaymentFailed` is an exception class (a subclass of `Exception`) with an attribute `attempts`.
- `PaymentProcessor(gateways)` with `pay(amount_cents, currency, token)`:
  - `amount_cents` must be a whole number above 0, otherwise `ValueError("Bad amount")` before any gateway is touched.
  - It tries the gateways **in order**. The first `Receipt` with `ok=True` is returned and **no later gateway is called**.
  - A gateway that returns `ok=False` is recorded as `"declined"`. A gateway that **raises** an exception is recorded as `"error: <message>"` and the next one is tried.
  - If none succeeds, raise `PaymentFailed("All gateways failed")` whose `attempts` is the list of those records, one per gateway, in order.

**Your processor is tested with gateways you have never seen**: the tests write their own adapter class with a `charge` method and add it.

**Example**

```
processor = PaymentProcessor([StripeAdapter(stripe), PayPalAdapter(paypal)])
processor.pay(1234, "usd", "tok_1")     # Receipt(True, "ch_1") if Stripe accepts, else tries PayPal
```''',
    starter=r'''class Receipt:
    def __init__(self, ok, ref):
        ...

    # also __eq__ and __repr__


class StripeAdapter:
    def __init__(self, sdk):
        ...

    def charge(self, amount_cents, currency, token):
        """Call sdk.create_charge(...) and return a Receipt."""
        ...


class PayPalAdapter:
    def __init__(self, sdk):
        ...

    def charge(self, amount_cents, currency, token):
        """Call sdk.execute_payment(...) and return a Receipt."""
        ...


class PaymentFailed(Exception):
    def __init__(self, message, attempts):
        ...


class PaymentProcessor:
    def __init__(self, gateways):
        ...

    def pay(self, amount_cents, currency, token):
        """Try each gateway in order; return the first successful Receipt."""
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class FakeStripe:
    def __init__(self, status="succeeded"):
        self.status = status
        self.calls = []
    def create_charge(self, source, amount, currency):
        self.calls.append((source, amount, currency))
        return {"status": self.status, "id": "ch_%d" % len(self.calls)}
class FakePayPal:
    def __init__(self, code="APPROVED", fail=None):
        self.code = code
        self.fail = fail
        self.calls = []
    def execute_payment(self, token, amount, currency):
        self.calls.append((token, amount, currency))
        if self.fail:
            raise self.fail
        return (self.code, "PP-%d" % len(self.calls))
assert Receipt(True, "x") == Receipt(True, "x")
assert Receipt(True, "x") != Receipt(False, "x")
assert Receipt(True, "x") != Receipt(True, "y")
assert (Receipt(True, "x").ok, Receipt(True, "x").ref) == (True, "x")
stripe = FakeStripe()
assert StripeAdapter(stripe).charge(1234, "USD", "tok_1") == Receipt(True, "ch_1")
assert stripe.calls == [("tok_1", 1234, "usd")]
assert StripeAdapter(FakeStripe("failed")).charge(1, "usd", "t") == Receipt(False, "ch_1")
paypal = FakePayPal()
assert PayPalAdapter(paypal).charge(1234, "usd", "tok_2") == Receipt(True, "PP-1")
assert paypal.calls == [("tok_2", "12.34", "USD")]
PayPalAdapter(paypal).charge(5, "eur", "t")
PayPalAdapter(paypal).charge(1200, "eur", "t")
PayPalAdapter(paypal).charge(100000, "eur", "t")
assert [c[1] for c in paypal.calls[1:]] == ["0.05", "12.00", "1000.00"]
assert PayPalAdapter(FakePayPal("DECLINED")).charge(100, "usd", "t") == Receipt(False, "PP-1")
first, second = FakeStripe(), FakePayPal()
processor = PaymentProcessor([StripeAdapter(first), PayPalAdapter(second)])
assert processor.pay(500, "usd", "tok") == Receipt(True, "ch_1")
assert second.calls == []
declined = FakeStripe("failed")
backup = FakePayPal()
chain = PaymentProcessor([StripeAdapter(declined), PayPalAdapter(backup)])
assert chain.pay(500, "usd", "tok") == Receipt(True, "PP-1")
assert (len(declined.calls), len(backup.calls)) == (1, 1)
broken = FakePayPal(fail=RuntimeError("timeout"))
survivor = FakeStripe()
after_error = PaymentProcessor([PayPalAdapter(broken), StripeAdapter(survivor)])
assert after_error.pay(500, "usd", "tok") == Receipt(True, "ch_1")
none = PaymentProcessor([StripeAdapter(FakeStripe("failed")), PayPalAdapter(FakePayPal(fail=RuntimeError("boom"))), PayPalAdapter(FakePayPal("DECLINED"))])
failure = None
try:
    none.pay(500, "usd", "tok")
except PaymentFailed as error:
    failure = error
assert failure is not None
assert str(failure) == "All gateways failed"
assert failure.attempts == ["declined", "error: boom", "declined"]
assert issubclass(PaymentFailed, Exception)
assert error_of(PaymentProcessor([]).pay, 100, "usd", "t") == "PaymentFailed: All gateways failed"
untouched = FakeStripe()
guard = PaymentProcessor([StripeAdapter(untouched)])
assert error_of(guard.pay, 0, "usd", "t") == "ValueError: Bad amount"
assert error_of(guard.pay, -5, "usd", "t") == "ValueError: Bad amount"
assert error_of(guard.pay, 12.5, "usd", "t") == "ValueError: Bad amount"
assert untouched.calls == []
class BraintreeAdapter:
    def __init__(self):
        self.seen = []
    def charge(self, amount_cents, currency, token):
        self.seen.append((amount_cents, currency, token))
        return Receipt(True, "BT-" + token)
braintree = BraintreeAdapter()
mixed = PaymentProcessor([StripeAdapter(FakeStripe("failed")), braintree, PayPalAdapter(FakePayPal())])
assert mixed.pay(900, "inr", "abc") == Receipt(True, "BT-abc")
assert braintree.seen == [(900, "inr", "abc")]
class Refusing:
    def charge(self, amount_cents, currency, token):
        return Receipt(False, "no")
assert PaymentProcessor([Refusing(), braintree]).pay(1, "usd", "z") == Receipt(True, "BT-z")''',
    solution=r'''class Receipt:
    def __init__(self, ok, ref):
        self.ok = ok
        self.ref = ref

    def __eq__(self, other):
        if not isinstance(other, Receipt):
            return NotImplemented
        return (self.ok, self.ref) == (other.ok, other.ref)

    def __hash__(self):
        return hash((self.ok, self.ref))

    def __repr__(self):
        return f"Receipt({self.ok!r}, {self.ref!r})"


class StripeAdapter:
    def __init__(self, sdk):
        self._sdk = sdk

    def charge(self, amount_cents, currency, token):
        answer = self._sdk.create_charge(source=token, amount=amount_cents, currency=currency.lower())
        return Receipt(answer["status"] == "succeeded", answer["id"])


class PayPalAdapter:
    def __init__(self, sdk):
        self._sdk = sdk

    def charge(self, amount_cents, currency, token):
        amount = f"{amount_cents // 100}.{amount_cents % 100:02d}"
        code, ref = self._sdk.execute_payment(token, amount, currency.upper())
        return Receipt(code == "APPROVED", ref)


class PaymentFailed(Exception):
    def __init__(self, message, attempts):
        super().__init__(message)
        self.attempts = attempts


class PaymentProcessor:
    def __init__(self, gateways):
        self._gateways = list(gateways)

    def pay(self, amount_cents, currency, token):
        if not isinstance(amount_cents, int) or isinstance(amount_cents, bool) or amount_cents <= 0:
            raise ValueError("Bad amount")
        attempts = []
        for gateway in self._gateways:
            try:
                receipt = gateway.charge(amount_cents, currency, token)
            except Exception as error:
                attempts.append(f"error: {error}")
                continue
            if receipt.ok:
                return receipt
            attempts.append("declined")
        raise PaymentFailed("All gateways failed", attempts)''',
    hints=[
        r'''An **adapter** translates one interface into another. Each adapter holds an SDK object and has the *one* method your processor expects, `charge(amount_cents, currency, token)`. All the ugliness (argument names, lower-case vs upper-case currency, strings instead of cents) stays inside the adapter.''',
        r'''Make the PayPal amount with integer arithmetic: `cents // 100` for the whole part and `cents % 100` formatted with two digits (`:02d`) for the rest. Never divide by 100.0: floats print `0.05` as `0.050000000000000003` in some cases.''',
        r'''The processor must only call `gateway.charge(...)` and read `receipt.ok`. Catch `Exception` around each call so one gateway's crash is recorded and the next is tried, and stop at the first success so later gateways are never touched.''',
    ],
    explanation=r'''**The idea.** The **Adapter** pattern makes an incompatible interface look like the one your code expects. You cannot edit Stripe's or PayPal's SDK, so you write thin classes that speak *your* interface (`charge(...) -> Receipt`) on the outside and *theirs* on the inside.

```mermaid
classDiagram
    class Gateway {
        <<interface>>
        +charge() Receipt
    }
    class PaymentProcessor
    PaymentProcessor o-- Gateway
    Gateway <|.. StripeAdapter
    Gateway <|.. PayPalAdapter
    StripeAdapter --> StripeSDK : adapts
    PayPalAdapter --> PayPalSDK : adapts
```

**What each adapter hides.** Stripe wants a lower-case currency and a source token; PayPal wants an upper-case code and the amount as a decimal *string*. Those conversions live in one place each, so the rest of the system never sees them, and replacing PayPal means writing one new adapter.

**The processor is a Chain of Responsibility.** It tries gateways in order and stops at the first success. It depends only on `charge` and `Receipt.ok`; the test's own `BraintreeAdapter` and `Refusing` classes work because nothing in the processor names a concrete gateway.

**Failure handling is policy.** A *decline* (the bank said no) and an *error* (the network failed) are both "this gateway did not work", but you record them differently so that an operator can tell them apart in `attempts`. Whether to retry the same gateway on an error is a separate decision; this design moves on.

**Money detail.** Integer cents all the way, formatted only at the very edge, for the PayPal string.

**Complexity.** O(number of gateways) per payment.

**Going further.** Charging twice is the worst failure here: a timeout does not mean the first gateway did *not* charge. What would you add so a retry elsewhere cannot double-charge (hint: an idempotency key passed to every gateway)?''',
),

P(
    slug='lld-expression-visitor', title='Expression Tree Visitors', topic='lld-patterns-in-use', difficulty='advanced',
    module='lld/09-behavioral-patterns-ii/README.md',
    description='Build an expression tree whose operations (evaluate, print) are visitors, so a new operation never edits the nodes (Visitor).',
    statement=r'''Write the nodes of a small arithmetic expression tree, and two operations on it written as **visitors**.

**Nodes.** Each node has an `accept(visitor)` method that calls the matching method on the visitor, **passing the node itself**, and returns what that method returns:

| Node | Created with | Attributes | `accept` calls |
|---|---|---|---|
| `Num` | `Num(value)` | `value` | `visitor.visit_num(self)` |
| `Var` | `Var(name)` | `name` | `visitor.visit_var(self)` |
| `Add` | `Add(left, right)` | `left`, `right` | `visitor.visit_add(self)` |
| `Mul` | `Mul(left, right)` | `left`, `right` | `visitor.visit_mul(self)` |
| `Neg` | `Neg(operand)` | `operand` | `visitor.visit_neg(self)` |

`Num(value)` with a negative value raises `ValueError("Use Neg for negatives")`.

**The two visitors you write**

- `Evaluator(env=None)`: `evaluate(node)` returns the value of the tree (`node.accept(self)`). `env` maps variable names to numbers; an unknown variable raises `ValueError("Unknown variable: x")`.
- `Printer()`: `print(node)` returns the expression as text, with **only the parentheses that are needed**:
  - `Num` prints its value as Python does (`3`, `2.5`); `Var` prints its name;
  - `Add` prints `"<left> + <right>"`, and puts a **right** operand that is itself an `Add` in parentheses (`1 + (2 + 3)`), so the shape of the tree is not lost;
  - `Mul` prints `"<left> * <right>"`, putting any operand that is an `Add` in parentheses;
  - `Neg` prints `"-"` followed by its operand, in parentheses unless the operand is a `Num` or a `Var` (`-3`, `-x`, `-(1 + 2)`, `-(-3)`).

**The tests also write visitors you have never seen** (a depth counter, a node counter, a variable collector) with `visit_num`, `visit_var`, `visit_add`, `visit_mul` and `visit_neg` methods, and run them through `accept`. Your nodes must work with any such visitor.

**Example**

```
tree = Mul(Add(Num(1), Num(2)), Neg(Var("x")))
Evaluator({"x": 4}).evaluate(tree)    # -12
Printer().print(tree)                 # "(1 + 2) * -x"
```''',
    starter=r'''class Num:
    def __init__(self, value):
        ...

    def accept(self, visitor):
        ...


class Var:
    def __init__(self, name):
        ...

    def accept(self, visitor):
        ...


class Add:
    def __init__(self, left, right):
        ...

    def accept(self, visitor):
        ...


class Mul:
    def __init__(self, left, right):
        ...

    def accept(self, visitor):
        ...


class Neg:
    def __init__(self, operand):
        ...

    def accept(self, visitor):
        ...


class Evaluator:
    def __init__(self, env=None):
        ...

    def evaluate(self, node):
        ...

    # visit_num, visit_var, visit_add, visit_mul, visit_neg


class Printer:
    def print(self, node):
        ...

    # visit_num, visit_var, visit_add, visit_mul, visit_neg''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
n = lambda v: Num(v)
assert (Num(3).value, Var("x").name) == (3, "x")
tree = Mul(Add(n(1), n(2)), Neg(Var("x")))
assert (tree.left.left.value, tree.right.operand.name) == (1, "x")
assert error_of(Num, -1) == "ValueError: Use Neg for negatives"
assert Num(0).value == 0
ev = Evaluator()
assert ev.evaluate(n(5)) == 5
assert ev.evaluate(Add(n(2), n(3))) == 5
assert ev.evaluate(Mul(n(2), n(3))) == 6
assert ev.evaluate(Neg(n(4))) == -4
assert ev.evaluate(Neg(Neg(n(4)))) == 4
assert ev.evaluate(Add(n(1), Mul(n(2), n(3)))) == 7
assert ev.evaluate(Mul(Add(n(1), n(2)), n(3))) == 9
assert ev.evaluate(Add(n(0.5), n(0.25))) == 0.75
assert Evaluator({"x": 4}).evaluate(tree) == -12
assert Evaluator({"x": 1, "y": 2}).evaluate(Add(Var("x"), Var("y"))) == 3
assert error_of(Evaluator().evaluate, Var("x")) == "ValueError: Unknown variable: x"
assert error_of(Evaluator({"x": 1}).evaluate, Add(Var("x"), Var("z"))) == "ValueError: Unknown variable: z"
pr = Printer()
assert pr.print(n(3)) == "3"
assert pr.print(n(2.5)) == "2.5"
assert pr.print(Var("x")) == "x"
assert pr.print(Add(n(1), n(2))) == "1 + 2"
assert pr.print(Add(Add(n(1), n(2)), n(3))) == "1 + 2 + 3"
assert pr.print(Add(n(1), Add(n(2), n(3)))) == "1 + (2 + 3)"
assert pr.print(Mul(n(2), n(3))) == "2 * 3"
assert pr.print(Mul(Add(n(1), n(2)), n(3))) == "(1 + 2) * 3"
assert pr.print(Mul(n(3), Add(n(1), n(2)))) == "3 * (1 + 2)"
assert pr.print(Add(n(1), Mul(n(2), n(3)))) == "1 + 2 * 3"
assert pr.print(Mul(Mul(n(1), n(2)), Mul(n(3), n(4)))) == "1 * 2 * 3 * 4"
assert pr.print(Neg(n(3))) == "-3"
assert pr.print(Neg(Var("x"))) == "-x"
assert pr.print(Neg(Add(n(1), n(2)))) == "-(1 + 2)"
assert pr.print(Neg(Mul(n(2), n(3)))) == "-(2 * 3)"
assert pr.print(Neg(Neg(n(3)))) == "-(-3)"
assert pr.print(tree) == "(1 + 2) * -x"
assert pr.print(Add(Neg(n(1)), Neg(n(2)))) == "-1 + -2"
class Depth:
    def visit_num(self, node):
        return 1
    def visit_var(self, node):
        return 1
    def visit_add(self, node):
        return 1 + max(node.left.accept(self), node.right.accept(self))
    def visit_mul(self, node):
        return 1 + max(node.left.accept(self), node.right.accept(self))
    def visit_neg(self, node):
        return 1 + node.operand.accept(self)
assert n(1).accept(Depth()) == 1
assert tree.accept(Depth()) == 3
assert Add(n(1), Add(n(2), Add(n(3), n(4)))).accept(Depth()) == 4
class Variables:
    def __init__(self):
        self.found = []
    def visit_num(self, node):
        return self
    def visit_var(self, node):
        self.found.append(node.name)
        return self
    def visit_add(self, node):
        node.left.accept(self)
        node.right.accept(self)
        return self
    def visit_mul(self, node):
        node.left.accept(self)
        node.right.accept(self)
        return self
    def visit_neg(self, node):
        node.operand.accept(self)
        return self
collector = Variables()
assert Add(Var("a"), Mul(Var("b"), Neg(Var("c")))).accept(collector) is collector
assert collector.found == ["a", "b", "c"]
class Spy:
    def __init__(self):
        self.seen = []
    def visit_num(self, node):
        self.seen.append(node)
    def visit_var(self, node):
        self.seen.append(node)
    def visit_add(self, node):
        self.seen.append(node)
    def visit_mul(self, node):
        self.seen.append(node)
    def visit_neg(self, node):
        self.seen.append(node)
for node in (n(1), Var("v"), Add(n(1), n(2)), Mul(n(1), n(2)), Neg(n(1))):
    spy = Spy()
    assert node.accept(spy) is None
    assert spy.seen == [node] and spy.seen[0] is node
big = n(1)
for i in range(150):
    big = Add(big, n(1))
assert Evaluator().evaluate(big) == 151
assert pr.print(Add(n(1), n(2))) == "1 + 2"''',
    solution=r'''class Num:
    def __init__(self, value):
        if value < 0:
            raise ValueError("Use Neg for negatives")
        self.value = value

    def accept(self, visitor):
        return visitor.visit_num(self)


class Var:
    def __init__(self, name):
        self.name = name

    def accept(self, visitor):
        return visitor.visit_var(self)


class Add:
    def __init__(self, left, right):
        self.left = left
        self.right = right

    def accept(self, visitor):
        return visitor.visit_add(self)


class Mul:
    def __init__(self, left, right):
        self.left = left
        self.right = right

    def accept(self, visitor):
        return visitor.visit_mul(self)


class Neg:
    def __init__(self, operand):
        self.operand = operand

    def accept(self, visitor):
        return visitor.visit_neg(self)


class Evaluator:
    def __init__(self, env=None):
        self._env = dict(env or {})

    def evaluate(self, node):
        return node.accept(self)

    def visit_num(self, node):
        return node.value

    def visit_var(self, node):
        if node.name not in self._env:
            raise ValueError(f"Unknown variable: {node.name}")
        return self._env[node.name]

    def visit_add(self, node):
        return node.left.accept(self) + node.right.accept(self)

    def visit_mul(self, node):
        return node.left.accept(self) * node.right.accept(self)

    def visit_neg(self, node):
        return -node.operand.accept(self)


class Printer:
    def print(self, node):
        return node.accept(self)

    def visit_num(self, node):
        return str(node.value)

    def visit_var(self, node):
        return node.name

    def visit_add(self, node):
        right = node.right.accept(self)
        if isinstance(node.right, Add):
            right = f"({right})"
        return f"{node.left.accept(self)} + {right}"

    def visit_mul(self, node):
        left = node.left.accept(self)
        right = node.right.accept(self)
        if isinstance(node.left, Add):
            left = f"({left})"
        if isinstance(node.right, Add):
            right = f"({right})"
        return f"{left} * {right}"

    def visit_neg(self, node):
        inner = node.operand.accept(self)
        if not isinstance(node.operand, (Num, Var)):
            inner = f"({inner})"
        return f"-{inner}"''',
    hints=[
        r'''Each node's `accept` is one line: call the visitor method that matches the node's own kind and pass `self`. The node does not know what the visitor will do with it; that is the whole point.''',
        r'''Each visitor is one class with five methods and no `isinstance` for the *dispatch* (the node picks the method). A visitor recurses by calling `child.accept(self)`. Only the **Printer** needs to look at a child's type, to decide where parentheses go.''',
        r'''For the printer, write the rule for each node from the statement: only a right-hand `Add` inside an `Add`, any `Add` operand inside a `Mul`, and any non-leaf operand inside a `Neg` get parentheses. Check the examples in the statement against your output.''',
    ],
    explanation=r'''**The idea.** You have a tree of node types and *many operations* to run on it (evaluate, print, count, optimise, type-check). The **Visitor** pattern keeps the operations out of the nodes: each operation is one class with a method per node type, and the node's only job is to say "this is a `Mul`, here I am" (`visitor.visit_mul(self)`). That trick is called **double dispatch**: the right code is chosen by the node's type *and* the visitor's type.

```mermaid
classDiagram
    class Node {
        <<interface>>
        +accept()
    }
    class Visitor {
        <<interface>>
        +visit_num()
        +visit_var()
        +visit_add()
        +visit_mul()
        +visit_neg()
    }
    Node <|.. Num
    Node <|.. Add
    Node <|.. Mul
    Visitor <|.. Evaluator
    Visitor <|.. Printer
    Visitor <|.. YourDepthCounter
```

**What you gain.** A new operation (the tests add `Depth` and `Variables`) is a new class; no node is edited. Without Visitor you would add an `evaluate`, `print` and `depth` method to every node class, so each new feature touches all of them.

**What it costs: the honest trade-off.** Visitor makes *operations* easy to add and *node types* hard: a new node (`Pow`) forces a new method on **every** visitor. So use it when the set of node types is stable and the set of operations grows (compilers and linters are the classic case) and avoid it for the opposite.

**Printing with minimal parentheses** is a good small lesson in precedence. A child needs parentheses when printing it flat would change the tree: an `Add` under a `Mul`, and a right-nested `Add` (so `1 + (2 + 3)` and `1 + 2 + 3` stay different trees).

**Depth.** Both visitors are recursive, so a 150-deep tree is fine; a million-node chain would need an explicit stack.

**Complexity.** O(number of nodes) per visit.

**Going further.** In Python you can skip the visitor class and dispatch on the node type with `functools.singledispatch`. What do you lose (hint: the checklist of "did I handle every node type?")?''',
),
]
