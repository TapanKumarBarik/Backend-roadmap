# Module 19: API/Library Design & Dependency Injection

## Why this matters

Every module from 12 through 18 designed a system used *internally* —
`Game`, `Library`, `BookingService` were all called by code inside the
same problem. This module is about the boundary itself: the public
constructors, methods, and version contract that *other developers'*
code depends on, where you don't control the caller and can't just fix
every call site when something changes. Two threads run through it.
First, a public API's *shape* matters as much as its correctness — a
constructor with eight positional parameters is technically correct
and practically miserable to call. Second, this module formalizes a
promise module 04 already made: its DIP exercise ended with "this is
exactly what makes a class testable, previewed here and formalized in
module 19" — this is that formalization, with the actual technique
(constructor injection) and the actual payoff (swapping in a fake for
a test) made explicit.

## Concepts

### Fluent (chainable) APIs for configuration-heavy objects

A constructor with many optional parameters forces every caller to
either remember positional order or name every argument, just to
change one setting. A **fluent builder** — this module's public-facing
evolution of the Builder pattern from module 06 — lets each call read
as exactly what it configures, in any order, and chains because every
configuring method returns the same builder instance.

{{tabs}}
{{tab Python}}
```python
# VIOLATION: configuration via a giant constructor with many positional/boolean args
class HttpRequestBad:
    def __init__(self, url, method="GET", headers=None, timeout=30, retries=0,
                 follow_redirects=True, verify_ssl=True, body=None):
        self.url = url
        self.method = method
        self.headers = headers or {}
        self.timeout = timeout
        self.retries = retries
        self.follow_redirects = follow_redirects
        self.verify_ssl = verify_ssl
        self.body = body

# caller has to remember every positional slot, or name every kwarg, to change one thing
bad = HttpRequestBad("https://api.example.com", "POST", {"Accept": "json"}, 10, 2, True, False, "{}")
```

```python
# FIXED: fluent builder — each call reads as what it configures, chainable, order-independent
class HttpRequest:                        # the finished, immutable-in-spirit object build() produces
    def __init__(self, url, method, headers, timeout, retries, body):
        self.url = url
        self.method = method
        self.headers = headers
        self.timeout = timeout
        self.retries = retries
        self.body = body

class HttpRequestBuilder:
    def __init__(self, url: str):
        self._url = url
        self._method = "GET"
        self._headers: dict[str, str] = {}
        self._timeout = 30
        self._retries = 0
        self._body = None

    def method(self, method: str) -> "HttpRequestBuilder":
        self._method = method
        return self

    def header(self, key: str, value: str) -> "HttpRequestBuilder":
        self._headers[key] = value
        return self

    def timeout(self, seconds: int) -> "HttpRequestBuilder":
        self._timeout = seconds
        return self

    def retries(self, count: int) -> "HttpRequestBuilder":
        self._retries = count
        return self

    def body(self, body: str) -> "HttpRequestBuilder":
        self._body = body
        return self

    def build(self) -> HttpRequest:
        return HttpRequest(self._url, self._method, self._headers, self._timeout, self._retries, self._body)

request = (
    HttpRequestBuilder("https://api.example.com")
    .method("POST")
    .header("Accept", "json")
    .timeout(10)
    .retries(2)
    .body("{}")
    .build()
)
```
{{tab C#}}
```csharp
// VIOLATION: configuration via a giant constructor with many positional/boolean args
public class HttpRequestBad {
    public string Url, Method, Body;
    public Dictionary<string, string> Headers;
    public int Timeout, Retries;

    public HttpRequestBad(string url, string method = "GET", Dictionary<string, string> headers = null,
                           int timeout = 30, int retries = 0, string body = null) {
        Url = url; Method = method; Headers = headers ?? new Dictionary<string, string>();
        Timeout = timeout; Retries = retries; Body = body;
    }
}

// caller has to remember every positional slot, or name every parameter, to change one thing
var bad = new HttpRequestBad("https://api.example.com", "POST",
    new Dictionary<string, string> { ["Accept"] = "json" }, 10, 2, "{}");
```

```csharp
// FIXED: fluent builder — each call reads as what it configures, chainable, order-independent
public class HttpRequest {                  // the finished, immutable-in-spirit object Build() produces
    public string Url, Method, Body;
    public Dictionary<string, string> Headers;
    public int Timeout, Retries;

    public HttpRequest(string url, string method, Dictionary<string, string> headers,
                        int timeout, int retries, string body) {
        Url = url; Method = method; Headers = headers; Timeout = timeout; Retries = retries; Body = body;
    }
}

public class HttpRequestBuilder {
    private string _url, _method = "GET", _body;
    private Dictionary<string, string> _headers = new Dictionary<string, string>();
    private int _timeout = 30, _retries = 0;

    public HttpRequestBuilder(string url) { _url = url; }

    public HttpRequestBuilder Method(string method) { _method = method; return this; }
    public HttpRequestBuilder Header(string key, string value) { _headers[key] = value; return this; }
    public HttpRequestBuilder Timeout(int seconds) { _timeout = seconds; return this; }
    public HttpRequestBuilder Retries(int count) { _retries = count; return this; }
    public HttpRequestBuilder Body(string body) { _body = body; return this; }

    public HttpRequest Build() => new HttpRequest(_url, _method, _headers, _timeout, _retries, _body);
}

var request = new HttpRequestBuilder("https://api.example.com")
    .Method("POST")
    .Header("Accept", "json")
    .Timeout(10)
    .Retries(2)
    .Body("{}")
    .Build();
```
{{/tabs}}

Every configuring call returns the same builder type, so calls chain;
`build()` is the one method that returns something else — the finished,
immutable-in-spirit object.

### Versioning and backward compatibility

Semantic versioning (`MAJOR.MINOR.PATCH`) gives a precise vocabulary:
a **MINOR** bump may only *add* capability without changing existing
behavior; a **MAJOR** bump is required the moment an existing public
signature's meaning changes for callers who haven't opted into
anything new. Inserting a new *required* parameter into an existing
method is a MAJOR change dressed up as a small edit.

{{tabs}}
{{tab Python}}
```python
# v1.0.0 public API
class SearchClientV1Shape:
    def search(self, query: str) -> list:
        return [f"result for {query}"]

# VIOLATION: adding pagination by inserting a new REQUIRED parameter — breaks every existing v1 caller
class SearchClientBad:
    def search(self, query: str, page: int) -> list:   # every old call site `client.search("term")` now raises TypeError
        return [f"result {page} for {query}"]

SearchClientBad().search("term")   # TypeError: missing required argument 'page' — this is a MAJOR change, not a patch
```

```python
# FIXED: pagination added as an OPTIONAL parameter with a default — purely additive, a MINOR version bump
class SearchClientGood:
    def search(self, query: str, page: int = 1) -> list:
        return [f"result page {page} for {query}"]

client = SearchClientGood()
client.search("term")            # old call site — still compiles and runs unchanged
client.search("term", page=2)    # new capability, opted into explicitly

# FIXED: renaming a method — keep the old name as a thin, deprecated wrapper instead of deleting it outright
import warnings

class SearchClientRenamed:
    def find(self, query: str, page: int = 1) -> list:   # the new, preferred name
        return [f"result page {page} for {query}"]

    def search(self, query: str, page: int = 1) -> list:  # old name — kept working, flagged for removal in a future MAJOR version
        warnings.warn("search() is deprecated, use find() instead", DeprecationWarning, stacklevel=2)
        return self.find(query, page)
```
{{tab C#}}
```csharp
// VIOLATION: adding pagination by inserting a new REQUIRED parameter — breaks every existing v1 caller
public class SearchClientBad {
    public List<string> Search(string query, int page) {   // every old call site `client.Search("term")` no longer compiles
        return new List<string> { $"result {page} for {query}" };
    }
}
```

```csharp
// FIXED: pagination added as an OPTIONAL parameter with a default — purely additive, a MINOR version bump
public class SearchClientGood {
    public List<string> Search(string query, int page = 1) {
        return new List<string> { $"result page {page} for {query}" };
    }
}

var client = new SearchClientGood();
client.Search("term");        // old call site — still compiles and runs unchanged
client.Search("term", 2);     // new capability, opted into explicitly

// FIXED: renaming a method — keep the old name as a thin, deprecated wrapper instead of deleting it outright
public class SearchClientRenamed {
    public List<string> Find(string query, int page = 1) {   // the new, preferred name
        return new List<string> { $"result page {page} for {query}" };
    }

    [Obsolete("Use Find() instead. Search() will be removed in the next major version.")]
    public List<string> Search(string query, int page = 1) => Find(query, page);   // old name — kept working
}
```
{{/tabs}}

A rename is really two releases, not one edit: add the new name
(MINOR), mark the old name deprecated but functional, and only remove
the old name in a later MAJOR release once callers have had time to
migrate.

### Dependency Injection, formalized

Module 04's DIP said a class should depend on abstractions, not
concretions. **Dependency Injection** is the concrete mechanism that
satisfies DIP in practice: a class receives its dependencies from
outside — through its constructor — instead of constructing them
itself. Constructor injection is preferred over setter/property
injection because it makes "this object cannot exist in a valid-looking
but half-configured state" true by construction — there's no window
where the object exists without its required dependency.

{{tabs}}
{{tab Python}}
```python
# VIOLATION: OrderProcessor constructs its own concrete dependency — can't test without a real email server
class SmtpEmailSender:
    def send(self, to: str, subject: str) -> bool:
        raise RuntimeError("would attempt a real network connection")   # stands in for real SMTP I/O

class OrderProcessorBad:
    def __init__(self):
        self._emailer = SmtpEmailSender()          # welded to one concrete class, constructed internally

    def complete_order(self, customer_email: str) -> bool:
        return self._emailer.send(customer_email, "Order confirmed")
```

```python
# FIXED: constructor injection against an abstraction — the class never constructs its own dependency
from abc import ABC, abstractmethod

class EmailSender(ABC):                              # the "seam" a test can substitute
    @abstractmethod
    def send(self, to: str, subject: str) -> bool: ...

class RealSmtpEmailSender(EmailSender):
    def send(self, to, subject):
        raise RuntimeError("would attempt a real network connection")

class OrderProcessor:
    def __init__(self, emailer: EmailSender):        # injected, not constructed — DIP, module 04
        self._emailer = emailer

    def complete_order(self, customer_email: str) -> bool:
        return self._emailer.send(customer_email, "Order confirmed")

# a fake used only in tests — no network I/O, no mocking framework needed
class FakeEmailSender(EmailSender):
    def __init__(self):
        self.sent_to: list[str] = []

    def send(self, to, subject):
        self.sent_to.append(to)
        return True

fake = FakeEmailSender()
processor = OrderProcessor(fake)                      # inject the fake — no real class was ever touched
processor.complete_order("alice@example.com")
assert fake.sent_to == ["alice@example.com"]
```
{{tab C#}}
```csharp
// VIOLATION: OrderProcessor constructs its own concrete dependency — can't test without a real email server
public class SmtpEmailSender {
    public bool Send(string to, string subject) {
        throw new InvalidOperationException("would attempt a real network connection");   // stands in for real SMTP I/O
    }
}

public class OrderProcessorBad {
    private SmtpEmailSender _emailer = new SmtpEmailSender();   // welded to one concrete class, constructed internally

    public bool CompleteOrder(string customerEmail) => _emailer.Send(customerEmail, "Order confirmed");
}
```

```csharp
// FIXED: constructor injection against an abstraction — the class never constructs its own dependency
public interface IEmailSender {                    // the "seam" a test can substitute
    bool Send(string to, string subject);
}

public class RealSmtpEmailSender : IEmailSender {
    public bool Send(string to, string subject) =>
        throw new InvalidOperationException("would attempt a real network connection");
}

public class OrderProcessor {
    private IEmailSender _emailer;
    public OrderProcessor(IEmailSender emailer) { _emailer = emailer; }  // injected, not constructed — DIP, module 04

    public bool CompleteOrder(string customerEmail) => _emailer.Send(customerEmail, "Order confirmed");
}

// a fake used only in tests — no network I/O, no mocking framework needed
public class FakeEmailSender : IEmailSender {
    public List<string> SentTo = new List<string>();
    public bool Send(string to, string subject) { SentTo.Add(to); return true; }
}

var fake = new FakeEmailSender();
var processor = new OrderProcessor(fake);          // inject the fake — no real class was ever touched
processor.CompleteOrder("alice@example.com");
```
{{/tabs}}

At any real scale, wiring every injected dependency by hand at every
call site gets tedious — a **DI container** (a composition root that
builds the full object graph once, at startup) is the natural next
step beyond what these hand-wired examples show, and every mainstream
framework in both languages ships one. The technique demonstrated here
— constructor injection against an abstraction — is what a container
automates, not a different idea from it.

## Hands-on exercises

Do each in both languages.

### 1. Convert a giant constructor to a fluent builder

Take a `ReportConfig` class with 6+ constructor parameters (title,
author, date range, format, include-charts flag, output path).
Refactor it into a fluent builder with one chainable method per
setting.

### 2. Fix a breaking signature change

Take a public method that had a new *required* parameter inserted
into it. Fix it using the additive-optional-parameter technique, and
confirm an old-style call site (without the new argument) still
compiles and runs unchanged.

### 3. Inject a logger

Take a class that constructs a concrete file-system logger internally
(`self._logger = FileLogger("app.log")`). Refactor it to depend on an
injected `Logger`/`ILogger` abstraction, write a `FakeLogger` that
records messages in a list instead of writing to disk, and use it to
assert what the class logged — without touching the filesystem.

### 4. Deprecate, don't delete

Rename a public method following the deprecate-not-delete pattern from
this module's versioning example. Confirm the old name still works and
produces a deprecation signal (`DeprecationWarning` in Python,
`[Obsolete]` in C#).

### 5. Combine builder and DI

Design a fluent builder whose `.build()` call constructs an object with
an **injected** dependency (not one the builder constructs itself) —
e.g., a builder that accepts a `.transport(fake_transport)` call and
passes it straight through to the built object's constructor.

## Independent challenge

No code given.

**Task:** Design and build a small public SDK for a fictitious
`WeatherClient`: a fluent builder for configuration (API key, base URL,
timeout), a `get_forecast(city)`/`GetForecast(city)` method, and a
constructor-injected `HttpTransport`/`IHttpTransport` abstraction so
tests can supply a `FakeHttpTransport` returning canned JSON instead of
making a real network call. Then design a hypothetical v2 that adds a
`units` parameter (metric/imperial) to `get_forecast` **without**
breaking v1 callers, and write down — as a comment above each change —
whether it would be a MAJOR or MINOR version bump and why.

<details>
<summary>Hint</summary>

The fluent builder's `.build()` should return a `WeatherClient` whose
constructor takes the injected transport — the builder configures
*data* (API key, base URL, timeout), while the transport is a
*dependency*, and both end up passed into the same constructor. For
the v2 exercise: `units` should be an optional parameter with a
sensible default (e.g., `"metric"`), which is exactly what makes it a
MINOR bump instead of a MAJOR one — the same technique
`SearchClientGood` used above for pagination.

</details>

## Common mistakes & troubleshooting

- **Making every setter chainable "just because it's fluent,"** even
  on objects that aren't being configured or built. Fluent chaining
  earns its keep during construction/configuration; applying it to
  every mutator on a domain object tends to hide meaningful state
  changes behind cosmetic chaining rather than clarifying anything.
- **Treating a public rename as one atomic edit** instead of two
  releases (add the new name, deprecate the old, remove the old
  later). Deleting the old name immediately is exactly as breaking as
  removing any other public method — a rename is not a special case
  that gets to skip the deprecation cycle.
- **Defaulting to setter/property injection instead of constructor
  injection.** An object should never exist in a valid-looking but
  half-configured state; if a dependency is required, the constructor
  is the only place that can actually guarantee it's present before
  any method runs.
- **"Injecting" a concrete class instead of an abstraction** — passing
  `new SmtpEmailSender()` in from one layer higher up the call stack,
  rather than depending on an `EmailSender` interface. This moves the
  coupling one level up without removing it; the class still can't be
  tested without a real SMTP server, just from a different caller's
  code.
- **Confusing "doesn't break my own test suite" with "backward
  compatible."** A change that keeps your tests green but changes a
  default's behavior can still silently break a caller's existing
  code that never updates that default explicitly — backward
  compatibility is about existing *callers*, not existing *tests*.

## Checkpoint quiz

1. Why is a fluent builder better UX for a public API than a
   constructor with eight positional parameters, even though both are
   technically correct?
2. What's the precise difference between a MAJOR and a MINOR version
   bump, in terms of what's allowed to change?
3. Why treat a public method rename as two releases instead of one
   edit?
4. Why is constructor injection generally preferred over setter
   injection?
5. What did module 04's DIP exercise already promise about this
   module, and how does this module deliver on it?

<details>
<summary>Answers</summary>

1. Both compile and run correctly, but the builder's calls read as
   exactly what they configure and can be given in any order, while
   the positional constructor forces every caller to either memorize
   argument order or name every parameter just to change one setting —
   the difference is entirely in how easy the API is to use correctly.
2. A MINOR bump may only *add* capability without changing the
   behavior of anything that already exists (e.g., a new optional
   parameter with a default). A MAJOR bump is required the moment an
   existing public signature's behavior changes for callers who
   haven't opted into anything new (e.g., a new *required* parameter,
   or a removed method).
3. Because deleting or changing the old name immediately breaks every
   existing caller with no migration window — the same as any other
   breaking change. Adding the new name is additive (MINOR); removing
   the old name is breaking (MAJOR) and belongs in a separate,
   later release, with a deprecation period in between.
4. It makes it impossible for the object to exist without its required
   dependencies — there's no window after construction but before some
   setter is called where the object looks valid but isn't fully
   configured. Setter injection allows exactly that window.
5. Module 04's DIP exercise ended by refactoring a class to depend on
   an injected abstraction instead of constructing a concrete
   dependency, noting "this is exactly what makes a class testable,
   previewed here and formalized in module 19." This module delivers
   on that by naming the technique explicitly (constructor injection)
   and showing the payoff directly: swapping in a `FakeEmailSender`/
   `FakeEmailSender` with zero changes to the class under test.

</details>

## Interview questions

1. **"How would you design a fluent API for configuring a complex
   object?"**
   A builder class holding the in-progress configuration, with one
   method per setting that mutates the builder's internal state and
   returns the same builder instance (`self`/`this`), plus a final
   `build()` method that constructs and returns the finished object —
   the public-facing evolution of the Builder pattern from module 06.
2. **"How do you evolve a public API without breaking existing
   consumers?"**
   New capability goes in as optional parameters with sensible
   defaults or entirely new methods (MINOR/additive changes); renames
   or removals go through a deprecation cycle — add the new name, mark
   the old one deprecated but still functional, remove it only in a
   later MAJOR release once callers have had time to migrate.
3. **"What's the difference between Dependency Inversion and
   Dependency Injection?"**
   Dependency Inversion (the "D" in SOLID, module 04) is the
   *principle*: depend on abstractions, not concrete implementations.
   Dependency Injection is the *mechanism* that satisfies it in
   practice — a class receives its dependencies from outside (typically
   via its constructor) instead of constructing them itself.
4. **"Why is constructor injection usually preferred over setter
   injection?"**
   It guarantees a dependency is present before any method on the
   object can run — there's no valid-looking-but-incomplete state to
   accidentally use, unlike setter injection where the object exists
   before its dependencies are supplied.
5. **"How would you make a class that currently creates its own
   dependencies internally testable?"**
   Extract an interface for whatever it constructs internally, change
   the constructor to accept that interface as a parameter instead of
   instantiating the concrete class directly, and write a fake
   implementation for tests — the exact `OrderProcessorBad` →
   `OrderProcessor` refactor in this module's DI example.

## Further reading & sources

- [Refactoring.Guru: Builder pattern](https://refactoring.guru/design-patterns/builder) - revisit module 06's pattern; the fluent builders in this module are its public-API-facing variant.
- [Semantic Versioning 2.0.0](https://semver.org/) - the precise MAJOR.MINOR.PATCH vocabulary used throughout the versioning section.
- [Martin Fowler: Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html) - the article that named and popularized the DI terminology used in this module, including the container concept mentioned as a natural next step.

## Next

[20-anti-patterns-and-code-smells](../20-anti-patterns-and-code-smells/README.md)
— recognizing and fixing God Objects, anemic domain models, spaghetti
coupling, and other common LLD code smells.
