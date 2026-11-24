PROBLEMS = [
P(
    slug='lld-testable-token-service', title='Make the Token Service Testable', topic='lld-testable-design', difficulty='intermediate',
    module='lld/05-core-design-principles/README.md',
    description='Refactor a working token service that calls time and uuid directly so its clock and ids can be injected.',
    statement=r'''The editor holds a `TokenService` that works, but it is impossible to test properly: it reads the real clock (`time.time()`) and makes random ids (`uuid.uuid4()`) itself, so a test can neither move time nor know which token it will get. **Change it so both can be injected**, without changing what it does with the defaults, and add two small features while you are there.

**Creating one:** `TokenService(ttl=3600, clock=time.time, new_id=None)`

- `ttl` is how many seconds a token lives. It must be above 0, otherwise `ValueError("Bad ttl")`.
- `clock()` returns the current time in seconds. Use it for **every** reading of the time.
- `new_id()` returns the text of a new token. `None` means the original behaviour: `uuid.uuid4().hex` (32 lower-case hex characters).

**Methods**

- `issue(user)` creates a token for `user`, valid until `clock() + ttl`, and returns it. If `new_id()` gives an id that the service **already stores** (valid, or expired but not yet removed), raise `ValueError("Token id collision")` and change nothing: the earlier token must keep its user.
- `validate(token)` returns the user, or `None` for an unknown token or one that has expired. A token is valid while `clock() < expires`; at **exactly** the expiry time it is expired. Validating an expired token also removes it.
- `revoke(token)` removes a token and returns `True` if it was still valid; `False` for an unknown or expired one (an expired one is still removed).
- `purge()` removes every expired token and returns how many it removed.
- `len(service)` is the number of tokens that are valid right now. It removes nothing.

Different services never share tokens.

**Example**

```
clock = FakeClock()
service = TokenService(ttl=10, clock=clock, new_id=lambda: "t1")
service.issue("asha")        # "t1"
service.validate("t1")       # "asha"
clock.now += 10
service.validate("t1")       # None   (expired exactly at issue time + 10)
```''',
    starter=r'''import time
import uuid


class TokenService:
    TTL = 3600

    def __init__(self):
        self._tokens = {}

    def issue(self, user):
        token = uuid.uuid4().hex
        self._tokens[token] = (user, time.time() + self.TTL)
        return token

    def validate(self, token):
        entry = self._tokens.get(token)
        if entry is None:
            return None
        user, expires = entry
        if time.time() >= expires:
            del self._tokens[token]
            return None
        return user

    def revoke(self, token):
        return self._tokens.pop(token, None) is not None''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Clock:
    def __init__(self, now=0):
        self.now = now
    def __call__(self):
        return self.now
def ids(*values):
    queue = list(values)
    return lambda: queue.pop(0)
clock = Clock(100)
svc = TokenService(ttl=10, clock=clock, new_id=ids("t1", "t2", "t3", "t4", "t5"))
assert svc.issue("asha") == "t1"
assert (svc.validate("t1"), svc.validate("nope")) == ("asha", None)
clock.now = 105
assert svc.issue("ben") == "t2"
assert len(svc) == 2
clock.now = 109.5
assert svc.validate("t1") == "asha"
clock.now = 110
assert svc.validate("t1") is None
assert len(svc) == 1
assert svc.validate("t2") == "ben"
clock.now = 114.99
assert svc.validate("t2") == "ben"
clock.now = 115
assert (len(svc), svc.validate("t2")) == (0, None)
assert svc.purge() == 0
clock.now = 200
assert svc.issue("cy") == "t3"
assert svc.issue("dee") == "t4"
assert svc.revoke("t3") is True
assert (svc.revoke("t3"), svc.validate("t3"), svc.validate("t4")) == (False, None, "dee")
assert svc.revoke("missing") is False
clock.now = 210
assert svc.revoke("t4") is False
assert svc.validate("t4") is None
tidy = Clock(0)
batch = TokenService(ttl=5, clock=tidy, new_id=ids("a", "b", "c", "d"))
batch.issue("u1")
tidy.now = 3
batch.issue("u2")
batch.issue("u3")
tidy.now = 5
assert len(batch) == 2
assert batch.purge() == 1
assert batch.purge() == 0
tidy.now = 8
assert (len(batch), batch.purge(), len(batch)) == (0, 2, 0)
clash = TokenService(clock=Clock(0), new_id=ids("x", "x", "y"))
assert clash.issue("first") == "x"
assert error_of(clash.issue, "second") == "ValueError: Token id collision"
assert clash.validate("x") == "first"
assert clash.issue("third") == "y"
late = Clock(0)
held = TokenService(ttl=1, clock=late, new_id=ids("k", "k"))
held.issue("a")
late.now = 5
assert error_of(held.issue, "b") == "ValueError: Token id collision"
assert held.purge() == 1
assert error_of(TokenService, 0) == "ValueError: Bad ttl"
assert error_of(TokenService, -5) == "ValueError: Bad ttl"
one = TokenService(clock=Clock(0), new_id=ids("same"))
two = TokenService(clock=Clock(0), new_id=ids("same"))
one.issue("only-in-one")
assert two.validate("same") is None
assert two.issue("fine") == "same"
real = TokenService()
token = real.issue("real-user")
assert len(token) == 32 and all(c in "0123456789abcdef" for c in token)
assert real.issue("other") != token
assert real.validate(token) == "real-user"
assert real.revoke(token) is True
assert real.validate(token) is None
default_ttl = Clock(0)
day = TokenService(clock=default_ttl, new_id=ids("d"))
day.issue("u")
default_ttl.now = 3599
assert day.validate("d") == "u"
default_ttl.now = 3600
assert day.validate("d") is None''',
    solution=r'''import time
import uuid


class TokenService:
    def __init__(self, ttl=3600, clock=time.time, new_id=None):
        if ttl <= 0:
            raise ValueError("Bad ttl")
        self._ttl = ttl
        self._clock = clock
        self._new_id = new_id if new_id is not None else (lambda: uuid.uuid4().hex)
        self._tokens = {}

    def issue(self, user):
        token = self._new_id()
        if token in self._tokens:
            raise ValueError("Token id collision")
        self._tokens[token] = (user, self._clock() + self._ttl)
        return token

    def validate(self, token):
        entry = self._tokens.get(token)
        if entry is None:
            return None
        user, expires = entry
        if self._clock() >= expires:
            del self._tokens[token]
            return None
        return user

    def revoke(self, token):
        if self.validate(token) is None:
            return False
        del self._tokens[token]
        return True

    def purge(self):
        now = self._clock()
        expired = [token for token, (_, expires) in self._tokens.items() if now >= expires]
        for token in expired:
            del self._tokens[token]
        return len(expired)

    def __len__(self):
        now = self._clock()
        return sum(1 for _, expires in self._tokens.values() if now < expires)''',
    hints=[
        r'''Anything a test cannot control should be handed in from outside. Take the clock and the id generator as constructor arguments with the **original behaviour as the default** (`time.time`, a lambda returning `uuid.uuid4().hex`), store them, and call `self._clock()` and `self._new_id()` instead of `time.time()` and `uuid.uuid4()`.''',
        r'''Be consistent about "now": every comparison with an expiry uses the injected clock, and the boundary is `clock() >= expires` means expired. One stray `time.time()` is enough to make a test pass on your machine and fail on someone else's.''',
        r'''For the new features: a collision check before you write anything (so the old token is untouched), `revoke` built on `validate` so an expired token reports `False`, and `purge` that counts what it removes.''',
    ],
    explanation=r'''**The idea.** Code is hard to test when it *reaches out* for things it should be *given*: the current time, randomness, the network, the file system. The cure is **dependency injection**: pass the collaborator in, and default it to the real thing. Production code calls `TokenService()` and nothing changes; a test calls `TokenService(clock=fake, new_id=scripted)` and controls time itself.

```mermaid
classDiagram
    class TokenService {
        +issue()
        +validate()
        +revoke()
        +purge()
    }
    class Clock {
        <<callable>>
        +call() seconds
    }
    class IdSource {
        <<callable>>
        +call() text
    }
    TokenService --> Clock : injected
    TokenService --> IdSource : injected
```

**What the injection bought.** Look at the first test: it checks that a token is valid at `109.5`, expired at exactly `110`, and that `len` and `purge` agree. With the real clock that test would need to `sleep(10)` and would still be flaky at the boundary. With a fake clock it is instant and exact. The id source gives the second win: a test can *force* a collision (`ids("x", "x")`) to check that the service refuses to overwrite another user's token, a bug you could never trigger with random uuids.

**Defaults keep behaviour.** `ttl=3600`, `time.time` and `uuid4().hex` are exactly what the original did, and the last tests check them (32 hex characters, valid for 3599 s and expired at 3600).

**The boundary.** `clock() >= expires` means *expired at exactly the expiry time*. Whether the end is inclusive is a decision; the test pins it so nobody changes it by accident.

**Callables, not classes.** For a single function (`now()`), a plain callable is enough; inventing a `Clock` interface with one method would be ceremony. Use an interface when the collaborator has several methods or several states.

**Complexity.** `issue`, `validate`, `revoke` are O(1); `purge` and `len` are O(tokens).

**Going further.** `purge` is something you must remember to call. How would you run it automatically without putting a timer thread inside this class (which would make it untestable again)?''',
),

P(
    slug='lld-testable-report-mailer', title='Make the Report Mailer Testable', topic='lld-testable-design', difficulty='advanced',
    module='lld/05-core-design-principles/README.md',
    description='Refactor a mailer that talks to a database and a mail server through globals so both can be injected, then add retries.',
    statement=r'''The editor holds a `ReportMailer` whose `send_daily` calls two global functions: `load_rows()` (a database) and `send_mail(...)` (an SMTP server), and reads a global `RECIPIENTS`. In a test neither the database nor the mail server exists, so it cannot be run at all. **Change it so all three are injected**, and add retries.

**Creating one:** `ReportMailer(source, sender, recipients, attempts=3)`

- `source()` returns the report's rows: a list of `(name, value)` pairs.
- `sender(to, subject, body)` sends one email. It may raise `TransientError` (a hiccup; trying again may work, and the class is already in the editor) or any other exception (a real failure).
- `recipients` maps a team name to a list of addresses. The mailer keeps **its own copy**.
- `attempts` is how many times one email may be tried in total.

**`send_daily(team)`**

1. An unknown team raises `ValueError("Unknown team")` **before** the source is read.
2. It reads the rows **once**. With no rows it sends nothing and returns `{"sent": 0, "failed": []}`.
3. The body is the rows as lines `"<name>: <value>"` joined by newlines; the subject is `"Daily report"`.
4. It sends to each address of the team, in order. If `sender` raises `TransientError` it tries the **same** email again, up to `attempts` times in all. Any **other** exception is a failure at once (no retry). One address failing never stops the others.
5. It returns `{"sent": <how many addresses got the email>, "failed": [<the addresses that did not>, in order]}`.

**Example**

```
mailer = ReportMailer(lambda: [("orders", 120)], send_to_outbox, {"ops": ["a@x.io", "b@x.io"]})
mailer.send_daily("ops")      # {"sent": 2, "failed": []}   body "orders: 120"
```''',
    starter=r'''RECIPIENTS = {"ops": ["a@x.io", "b@x.io"], "dev": ["c@x.io"]}


def load_rows():
    """Reads the rows of the report from the production database."""
    raise RuntimeError("no database in this environment")


def send_mail(to, subject, body):
    """Sends one email through the company's SMTP server."""
    raise RuntimeError("no mail server in this environment")


class TransientError(Exception):
    """A mail server hiccup: trying again may work."""


class ReportMailer:
    def send_daily(self, team):
        rows = load_rows()
        body = "\n".join(f"{name}: {value}" for name, value in rows)
        for address in RECIPIENTS[team]:
            send_mail(address, "Daily report", body)''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
class Outbox:
    def __init__(self):
        self.mails = []
    def __call__(self, to, subject, body):
        self.mails.append((to, subject, body))
class Source:
    def __init__(self, rows):
        self.rows = rows
        self.calls = 0
    def __call__(self):
        self.calls += 1
        return list(self.rows)
class Flaky:
    """Fails with a TransientError `times` times for each address, then delivers."""
    def __init__(self, times):
        self.times = times
        self.tries = {}
        self.delivered = []
    def __call__(self, to, subject, body):
        self.tries[to] = self.tries.get(to, 0) + 1
        if self.tries[to] <= self.times:
            raise TransientError("busy")
        self.delivered.append(to)
rows = [("orders", 120), ("refunds", 3)]
team = {"ops": ["a@x.io", "b@x.io"], "dev": ["c@x.io"]}
outbox, source = Outbox(), Source(rows)
mailer = ReportMailer(source, outbox, team)
assert mailer.send_daily("ops") == {"sent": 2, "failed": []}
assert outbox.mails == [("a@x.io", "Daily report", "orders: 120\nrefunds: 3"), ("b@x.io", "Daily report", "orders: 120\nrefunds: 3")]
assert source.calls == 1
assert mailer.send_daily("dev") == {"sent": 1, "failed": []}
assert (source.calls, outbox.mails[-1][0]) == (2, "c@x.io")
assert error_of(mailer.send_daily, "sales") == "ValueError: Unknown team"
assert source.calls == 2
empty_source, quiet = Source([]), Outbox()
silent = ReportMailer(empty_source, quiet, team)
assert silent.send_daily("ops") == {"sent": 0, "failed": []}
assert quiet.mails == [] and empty_source.calls == 1
assert error_of(silent.send_daily, "nobody") == "ValueError: Unknown team"
assert empty_source.calls == 1
one_row = Outbox()
ReportMailer(Source([("only", 1)]), one_row, {"t": ["z@x.io"]}).send_daily("t")
assert one_row.mails == [("z@x.io", "Daily report", "only: 1")]
flaky = Flaky(2)
retrying = ReportMailer(Source(rows), flaky, team)
assert retrying.send_daily("ops") == {"sent": 2, "failed": []}
assert flaky.tries == {"a@x.io": 3, "b@x.io": 3}
assert flaky.delivered == ["a@x.io", "b@x.io"]
hopeless = Flaky(5)
giving_up = ReportMailer(Source(rows), hopeless, team)
assert giving_up.send_daily("ops") == {"sent": 0, "failed": ["a@x.io", "b@x.io"]}
assert hopeless.tries == {"a@x.io": 3, "b@x.io": 3}
few = Flaky(5)
assert ReportMailer(Source(rows), few, team, attempts=2).send_daily("dev") == {"sent": 0, "failed": ["c@x.io"]}
assert few.tries == {"c@x.io": 2}
once = Flaky(1)
assert ReportMailer(Source(rows), once, team, attempts=1).send_daily("dev") == {"sent": 0, "failed": ["c@x.io"]}
assert once.tries == {"c@x.io": 1}
class Mixed:
    def __init__(self):
        self.calls = []
    def __call__(self, to, subject, body):
        self.calls.append(to)
        if to == "a@x.io":
            raise ValueError("mailbox does not exist")
mixed = Mixed()
assert ReportMailer(Source(rows), mixed, team).send_daily("ops") == {"sent": 1, "failed": ["a@x.io"]}
assert mixed.calls == ["a@x.io", "b@x.io"]
class Third:
    def __init__(self):
        self.calls = []
    def __call__(self, to, subject, body):
        self.calls.append(to)
        if to == "b@x.io":
            raise TransientError("down")
wide = {"all": ["a@x.io", "b@x.io", "c@x.io"]}
third = Third()
assert ReportMailer(Source(rows), third, wide).send_daily("all") == {"sent": 2, "failed": ["b@x.io"]}
assert third.calls == ["a@x.io", "b@x.io", "b@x.io", "b@x.io", "c@x.io"]
mine = {"ops": ["a@x.io"]}
private = Outbox()
copying = ReportMailer(Source(rows), private, mine)
mine["ops"].append("intruder@x.io")
mine["dev"] = ["late@x.io"]
assert copying.send_daily("ops") == {"sent": 1, "failed": []}
assert error_of(copying.send_daily, "dev") == "ValueError: Unknown team"
assert [m[0] for m in private.mails] == ["a@x.io"]
assert issubclass(TransientError, Exception)''',
    solution=r'''class TransientError(Exception):
    """A mail server hiccup: trying again may work."""


class ReportMailer:
    def __init__(self, source, sender, recipients, attempts=3):
        self._source = source
        self._sender = sender
        self._recipients = {team: list(addresses) for team, addresses in recipients.items()}
        self._attempts = attempts

    def send_daily(self, team):
        if team not in self._recipients:
            raise ValueError("Unknown team")
        rows = self._source()
        if not rows:
            return {"sent": 0, "failed": []}
        body = "\n".join(f"{name}: {value}" for name, value in rows)
        sent = 0
        failed = []
        for address in self._recipients[team]:
            for _ in range(self._attempts):
                try:
                    self._sender(address, "Daily report", body)
                except TransientError:
                    continue
                except Exception:
                    failed.append(address)
                    break
                sent += 1
                break
            else:
                failed.append(address)
        return {"sent": sent, "failed": failed}''',
    hints=[
        r'''The three things the class reaches for (the database, the mail server, the recipient list) become **constructor arguments**. `send_daily` then only talks to `self._source`, `self._sender` and `self._recipients`; no global is mentioned inside it.''',
        r'''Check the team **before** reading the source (so a typo does not cost a database query), read the rows only once, and build the body once. Copy the recipients dictionary and each address list in the constructor.''',
        r'''Retry with a `for _ in range(attempts)` loop around each send: `TransientError` means `continue`, any other exception means record a failure and `break`, success means count it and `break`. A `for ... else` records the failure when every attempt was transient.''',
    ],
    explanation=r'''**The idea.** The starter is a textbook *untestable* class: its work depends on a database and a mail server it finds by name in the module. This is the **Dependency Inversion** principle: high-level code (what a daily report *is*) should depend on abstractions it is given (`source`, `sender`), not on concrete things it reaches for (`load_rows`, `send_mail`).

```mermaid
classDiagram
    class ReportMailer {
        +send_daily()
    }
    class Source {
        <<callable>>
        +call() rows
    }
    class Sender {
        <<callable>>
        +call()
    }
    ReportMailer --> Source : injected
    ReportMailer --> Sender : injected
    Source <|.. Database
    Source <|.. FakeRows
    Sender <|.. SmtpSender
    Sender <|.. Outbox
```

**Fakes and spies.** Because the dependencies are plain callables, the tests use a `Source` that counts its calls and an `Outbox` that records mails. You can then assert things that were impossible before: the source is read **once** (not once per recipient), an unknown team never touches it, and the same body goes to everyone. `Flaky` and `Mixed` make the failure paths testable without a real server that actually fails.

**Retry policy is a design choice.** Only `TransientError` is retried; anything else is a real failure and retrying would just repeat it. A fixed number of attempts with no waiting keeps the class deterministic; a real system would add a delay with backoff, and *that delay* would also be an injected collaborator (a `sleep` function), for the same reason as the clock.

**Isolation of failures.** One bad address must not stop the report for the rest, and the return value says exactly who missed out. Returning data (`sent`, `failed`) instead of printing or raising lets a caller decide what to do.

**Copy the config.** The recipients are copied, so adding a team to the original dictionary afterwards does not change this mailer.

**Going further.** What would you do if sending 5,000 emails took ten minutes and the process died halfway? The return value is no help then. That is the point where a queue and idempotent sends replace a loop.''',
),

P(
    slug='lld-repository-cache-proxy', title='Caching Repository Proxy', topic='lld-patterns-in-use', difficulty='intermediate',
    module='lld/07-structural-patterns/README.md',
    description='Wrap any repository in a caching proxy with a time limit, write-through saves and an injected clock (Proxy).',
    statement=r'''Write a class `CachingRepository` that sits in front of another **repository** and remembers what it has read. A repository is any object with two methods: `get(key)` (returns the value, or `None` when there is none) and `save(key, value)`.

**Creating one:** `CachingRepository(inner, ttl=60, clock=time.time)`

- `inner` is the repository to wrap. It could be any object with `get` and `save`; the tests use several of their own.
- `ttl` is how many seconds a cached value stays fresh; it must be above 0, otherwise `ValueError("Bad ttl")`.
- `clock()` returns the time in seconds. Use it for every reading of the time.

**Methods**

- `get(key)`:
  - returns the cached value if it was stored **less than `ttl` seconds ago** (at exactly `ttl` it has expired); that is a **hit**;
  - otherwise asks `inner.get(key)` (a **miss**), caches the answer with the current time and returns it;
  - a `None` answer is **not cached** (so the next `get` asks `inner` again).
- `save(key, value)` writes through: it calls `inner.save(key, value)` **first**, and only if that succeeds updates the cache with the new value. If `inner.save` raises, the exception is passed on and the cache is **unchanged**.
- `invalidate(key)` forgets a cached key; returns `True` if it was cached, otherwise `False`.
- `stats()` returns `{"hits": n, "misses": n}`.

Different `CachingRepository` objects never share a cache.

**Example**

```
repo = CachingRepository(slow_repo, ttl=30, clock=my_clock)
repo.get("u1")        # miss: asks slow_repo
repo.get("u1")        # hit: slow_repo is not asked again
```''',
    starter=r'''import time


class CachingRepository:
    def __init__(self, inner, ttl=60, clock=time.time):
        ...

    def get(self, key):
        ...

    def save(self, key, value):
        ...

    def invalidate(self, key):
        ...

    def stats(self):
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
    def __call__(self):
        return self.now
class FakeRepo:
    def __init__(self, data=None):
        self.data = dict(data or {})
        self.gets = []
        self.saves = []
        self.fail_save = False
    def get(self, key):
        self.gets.append(key)
        return self.data.get(key)
    def save(self, key, value):
        if self.fail_save:
            raise RuntimeError("db down")
        self.saves.append((key, value))
        self.data[key] = value
clock = Clock(100)
inner = FakeRepo({"u1": "asha", "u2": "ben"})
repo = CachingRepository(inner, ttl=30, clock=clock)
assert repo.stats() == {"hits": 0, "misses": 0}
assert repo.get("u1") == "asha"
assert (inner.gets, repo.stats()) == (["u1"], {"hits": 0, "misses": 1})
assert repo.get("u1") == "asha"
assert (inner.gets, repo.stats()) == (["u1"], {"hits": 1, "misses": 1})
assert repo.get("u2") == "ben"
assert inner.gets == ["u1", "u2"]
clock.now = 129.9
assert repo.get("u1") == "asha"
assert inner.gets == ["u1", "u2"]
clock.now = 130
assert repo.get("u1") == "asha"
assert inner.gets == ["u1", "u2", "u1"]
assert repo.stats() == {"hits": 2, "misses": 3}
clock.now = 150
assert repo.get("u1") == "asha"
assert inner.gets.count("u1") == 2
inner.data["u1"] = "changed behind the cache"
assert repo.get("u1") == "asha"
clock.now = 160
assert repo.get("u1") == "changed behind the cache"
assert repo.invalidate("u1") is True
assert repo.invalidate("u1") is False
assert repo.invalidate("never") is False
before = len(inner.gets)
assert repo.get("u1") == "changed behind the cache"
assert len(inner.gets) == before + 1
assert repo.get("nobody") is None
assert repo.get("nobody") is None
assert inner.gets.count("nobody") == 2
repo.save("u3", "cy")
assert inner.saves == [("u3", "cy")]
before = len(inner.gets)
assert repo.get("u3") == "cy"
assert len(inner.gets) == before
repo.save("u3", "cy2")
assert (repo.get("u3"), inner.data["u3"]) == ("cy2", "cy2")
assert len(inner.gets) == before
inner.fail_save = True
assert error_of(repo.save, "u3", "never stored") == "RuntimeError: db down"
assert repo.get("u3") == "cy2"
assert error_of(repo.save, "u9", "also never") == "RuntimeError: db down"
inner.fail_save = False
before = len(inner.gets)
assert repo.get("u9") is None
assert len(inner.gets) == before + 1
a, b = FakeRepo({"k": 1}), FakeRepo({"k": 2})
first, second = CachingRepository(a, clock=Clock()), CachingRepository(b, clock=Clock())
assert (first.get("k"), second.get("k")) == (1, 2)
assert (first.stats(), second.stats()) == ({"hits": 0, "misses": 1}, {"hits": 0, "misses": 1})
class DictRepo:
    def __init__(self):
        self.store = {}
        self.reads = 0
    def get(self, key):
        self.reads += 1
        return self.store.get(key)
    def save(self, key, value):
        self.store[key] = value
tick = Clock(0)
other = DictRepo()
wrapped = CachingRepository(other, ttl=5, clock=tick)
wrapped.save("a", 1)
assert (wrapped.get("a"), wrapped.get("a"), other.reads) == (1, 1, 0)
tick.now = 5
assert (wrapped.get("a"), other.reads) == (1, 1)
assert error_of(CachingRepository, FakeRepo(), 0) == "ValueError: Bad ttl"
assert error_of(CachingRepository, FakeRepo(), -1) == "ValueError: Bad ttl"
default = CachingRepository(FakeRepo({"x": 9}))
assert (default.get("x"), default.get("x"), default.stats()) == (9, 9, {"hits": 1, "misses": 1})''',
    solution=r'''import time


class CachingRepository:
    def __init__(self, inner, ttl=60, clock=time.time):
        if ttl <= 0:
            raise ValueError("Bad ttl")
        self._inner = inner
        self._ttl = ttl
        self._clock = clock
        self._cache = {}
        self._hits = 0
        self._misses = 0

    def get(self, key):
        entry = self._cache.get(key)
        if entry is not None and self._clock() - entry[1] < self._ttl:
            self._hits += 1
            return entry[0]
        self._misses += 1
        value = self._inner.get(key)
        if value is None:
            self._cache.pop(key, None)
        else:
            self._cache[key] = (value, self._clock())
        return value

    def save(self, key, value):
        self._inner.save(key, value)
        self._cache[key] = (value, self._clock())

    def invalidate(self, key):
        return self._cache.pop(key, None) is not None

    def stats(self):
        return {"hits": self._hits, "misses": self._misses}''',
    hints=[
        r'''A proxy has the same interface as the thing it wraps (`get`, `save`) and forwards to it, adding behaviour on the way. Store `(value, stored_at)` per key; a read is a hit only when `clock() - stored_at < ttl`.''',
        r'''Order matters in `save`: call `inner.save` **first**, and only then touch the cache. If the database write raises, the cache must not already say the new value is there.''',
        r'''Do not cache `None`: "not found" is not a value worth remembering, because the record may be created a moment later. Use the injected clock for both the freshness check and the stored time.''',
    ],
    explanation=r'''**The idea.** A **Proxy** is an object that stands in for another one with the same interface. The caller does not know whether it is talking to the database repository or to a proxy in front of it. Here the proxy adds a *cache*: the first read goes through, later reads within `ttl` seconds are answered from memory.

```mermaid
sequenceDiagram
    participant C as Caller
    participant P as CachingRepository
    participant R as inner repository
    C->>P: get("u1")
    P->>R: get("u1")  (miss)
    R-->>P: "asha"
    P-->>C: "asha"
    C->>P: get("u1")
    P-->>C: "asha"  (hit, no call to R)
```

**Why a proxy and not a cache inside the repository.** The wrapped repository stays simple and unaware of caching, and *any* repository can be wrapped (the tests wrap three different fakes). Behaviour is added by composition, the same shape as Decorator; what distinguishes a Proxy is its *purpose*: controlling access (here, avoiding repeated slow reads).

**Three decisions that are really bugs if you get them wrong.**

1. **Write-through order.** `save` writes the real store first, then the cache. If the cache were updated first and the write then failed, readers would see a value that was never stored.
2. **Do not cache "not found".** A `None` today may be a record that exists tomorrow.
3. **Staleness is a trade-off you choose with `ttl`.** The test that changes the data "behind the cache" shows the cost: the proxy keeps returning the old value until it expires or is invalidated. A cache trades freshness for speed, and the `ttl` is how much freshness you give up.

**Injection again.** `clock` is a constructor argument, so the tests move time to 129.9 and 130 and check the exact boundary.

**Complexity.** O(1) per call, O(distinct keys) memory; a real cache also needs a size limit (LRU) so it cannot grow without bound.

**Going further.** If ten requests ask for the same missing key at once, all ten go to the database (a *cache stampede*). What would you add to let one of them fetch while the others wait? (The `singleflight` problem in Practice is exactly this.)''',
),
]
