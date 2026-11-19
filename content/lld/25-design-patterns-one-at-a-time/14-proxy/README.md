# Lesson 14: Proxy

> **Prerequisites:** [Flyweight](../13-flyweight/README.md) and [Track 25 Overview](../README.md).  
> **Estimated Reading Time:** 18 minutes  
> **Target Audience:** Engineers preparing for LLD, OOP, C#, or Python technical screening and architecture rounds.

> [!TIP]
> **The One Rule of the Proxy Pattern:** A Proxy is a **surrogate or placeholder** that implements the **exact same interface** as the target object to **control access** to it (such as lazy instantiation, role-based authorization, memoized caching, or network boundary serialization). While a **Decorator** enhances an already existing object provided by the caller, a **Proxy** controls *whether, when, and how* the real subject is created and accessed.

---

## 1. Why This Matters: The Interview Trap

"What is the Proxy pattern, how does it differ from a Decorator, and how do ORMs use it for lazy loading?" is one of the most frequent senior architecture interview questions.

### The Interview Trap

Candidates often reduce Proxy to:
> *"A Proxy is a wrapper class that sits in front of another object to do caching, logging, or security checks. It's essentially the same as a Decorator."*

This response immediately triggers deeper probing from interviewers. Saying a Proxy is "the same as a Decorator" demonstrates a failure to grasp **object lifecycle control and architectural intent**.

A senior engineer answers with precision:

> *"While both Proxy and Decorator implement the exact same interface as the wrapped subject, their **architectural intent and lifecycle ownership** are fundamentally different:*  
>  
> - ***Lifecycle Ownership:*** A **Decorator** is given an *already instantiated* object by the client; it never controls *if* or *when* the core object exists. Its sole purpose is additive behavior. A **Proxy** *controls the lifecycle and access* to the real subject. The real subject might not even exist yet (Virtual Proxy instantiates it on demand), might exist on a remote server across an RPC boundary (Remote Proxy), or access might be denied entirely without the real subject ever being called (Protection Proxy).*  
> - ***Relationship with the Client:*** With a Decorator, the client consciously composes layers: `new Logging(new Encrypting(new Service()))`. With a Proxy, the client typically doesn't know (or care) that a surrogate is involved; the client simply requests an `IDocumentService` and receives a proxy that transparently defers disk reads or enforces security.*  
> - ***ORMs and Lazy Loading:*** Frameworks like EF Core and SQLAlchemy substitute database entities with dynamic proxies (subclasses generated at runtime). When your code accesses a navigation property like `order.Customer.Name`, the proxy's getter intercepts execution, discovers that the customer reference is uninitialized, fires a SQL `SELECT` to fetch the record just in time, attaches the data, and returns the property transparently.*  
> - ***The Failure Mode:*** The biggest trap of proxy-based lazy loading is the **N+1 query disaster**: iterating through $N$ records and touching a proxy property produces 1 initial query plus $N$ individual network round-trips to the database."*

---

## 2. Visual Mental Model / Taxonomic Comparison

### The Multi-Faceted Proxy Workflow

A single Proxy can combine multiple protective responsibilities before touching the expensive, heavy subject.

```mermaid
flowchart TD
    Client["Client Code"] -->|"1. GetDocument(docId, userRole)"| Proxy["DocumentServiceProxy\n(Implements IDocumentService)"]

    Proxy --> AuthCheck{"Step 1: Protection Proxy\nIs userRole in ADMIN, MANAGER?"}
    AuthCheck -- No --> Deny["Return Access Denied\n(Short-circuit: Zero disk/DB I/O)"]
    AuthCheck -- Yes --> CacheCheck{"Step 2: Caching Proxy\nIs docId in memory cache?"}

    CacheCheck -- Yes --> ReturnCache["Return Cached Document\n(Zero disk/DB I/O)"]
    CacheCheck -- No --> VirtualCheck{"Step 3: Virtual Proxy\nIs _realService initialized?"}

    VirtualCheck -- No --> InitReal["Instantiate RealDocumentService\n(Allocate connection pool / load resources)"]
    VirtualCheck -- Yes --> Delegate["Forward call to RealDocumentService"]
    InitReal --> Delegate

    Delegate --> DiskRead["RealDocumentService.GetDocument()\n(Executes expensive disk/network I/O)"]
    DiskRead --> StoreCache["Store in Cache"]
    StoreCache --> ReturnPayload["Return Document to Client"]
```

### Taxonomy: The 5 Primary Kinds of Proxies

| Proxy Type | Core Purpose | Concrete Production Scenario |
| :--- | :--- | :--- |
| **Virtual Proxy** | **Lazy Initialization**: Defers the creation of expensive objects (heavy memory, large I/O, slow startup) until first invoked. | ORM navigation properties (EF Core / Hibernate / SQLAlchemy); High-resolution image placeholders in UI grids. |
| **Protection Proxy** | **Access Control**: Validates user credentials, role permissions (RBAC), or tenancy boundaries before permitting execution. | Healthcare record service verifying doctor credentials; Multi-tenant data segregation layer. |
| **Remote Proxy** | **Location Transparency**: Marshals method arguments across process or network boundaries (IPC, gRPC, RPC). | gRPC client stubs generated from `.proto` files; WCF service channels. |
| **Caching Proxy** | **Memoization**: Stores idempotent results in local memory or Redis to eliminate redundant computation or external calls. | API rate-limiting gateway caching HTTP `GET` responses; Database query caching proxies. |
| **Smart Reference Proxy** | **Bookkeeping & Auditing**: Executes administrative bookkeeping whenever an object is referenced. | Reference-counting smart pointers (`std::shared_ptr`); Thread-synchronization locks; Access audit loggers. |

### Comparison Matrix: Proxy vs. Decorator vs. Adapter vs. Facade

| Dimension | Proxy | Decorator | Adapter | Facade |
| :--- | :--- | :--- | :--- | :--- |
| **Interface Match** | **Exact same** interface as real subject | **Exact same** interface as component | Converts to an **expected existing** interface | Brand-new **simplified** high-level interface |
| **Lifecycle Ownership** | **Controls** creation, deferral, or rejection of subject | **Receives** already existing subject from caller | Wraps existing adaptee passed into it | Instantiates or aggregates entire subsystem |
| **Primary Intent** | Access control, lifecycle, caching, network boundary | Dynamically add features/responsibilities | Interface compatibility and translation | Complexity reduction and convenience |
| **Client Knowledge** | Often transparent (client thinks it's the real thing) | Explicit composition by client | Explicit wrapping by client or DI container | Explicitly invoked as the high-level doorway |

---

## 3. Code Implementation: The Transparent Document Gateway

Let us build a comprehensive Document Service illustrating three proxy archetypes in one:
1. **Protection Proxy:** Blocks unauthorized roles before touching resources.
2. **Virtual Proxy:** Defers the heavy connection initialization of `RealDocumentService` until the first authorized request.
3. **Caching Proxy:** Memoizes retrieved document content in memory to eliminate redundant disk reads.

````carousel
```python
from abc import ABC, abstractmethod
from typing import Optional


# 1. SHARED SUBJECT CONTRACT
class IDocumentService(ABC):

  @abstractmethod
  def get_document(self, doc_id: str, user_role: str) -> str:
    """Retrieves document contents based on user authorization."""
    pass


# 2. REAL SUBJECT (Heavy, resource-intensive, expensive)
class RealDocumentService(IDocumentService):

  def __init__(self) -> None:
    # Simulates expensive connection setup, memory buffers, or cold-start overhead
    print("[RealDocumentService] Initialized heavy storage connection.")

  def get_document(self, doc_id: str, user_role: str) -> str:
    print(
        f"[Disk I/O] Loading document '{doc_id}' from encrypted disk"
        " storage..."
    )
    return f"Contents of {doc_id}: Classified System Architecture Specs"


# 3. PROXY (Combines Protection, Virtual, and Caching Proxies)
class DocumentServiceProxy(IDocumentService):

  def __init__(self) -> None:
    # Notice: RealDocumentService is NOT initialized at proxy instantiation time!
    self._real_service: Optional[RealDocumentService] = None
    self._cache: dict[str, str] = {}

  def get_document(self, doc_id: str, user_role: str) -> str:
    # 1. PROTECTION PROXY: Verify authorization before doing anything
    if user_role not in ("ADMIN", "MANAGER"):
      print(
          f"[Security] Access DENIED for role '{user_role}' requesting"
          f" '{doc_id}'"
      )
      return f"Error: Unauthorized access to {doc_id}"

    # 2. CACHING PROXY: Serve from cache if already retrieved
    if doc_id in self._cache:
      print(f"[Cache] HIT for document '{doc_id}'")
      return self._cache[doc_id]

    # 3. VIRTUAL PROXY: Defer heavy initialization until first authorized, uncached call
    if self._real_service is None:
      print("[Virtual Proxy] Instantiating RealDocumentService on demand...")
      self._real_service = RealDocumentService()

    # 4. Delegate to real subject and cache result
    content = self._real_service.get_document(doc_id, user_role)
    self._cache[doc_id] = content
    return content


if __name__ == "__main__":
  proxy: IDocumentService = DocumentServiceProxy()

  print("--- Request 1: Unauthorized Guest ---")
  print(proxy.get_document("DOC-101", "GUEST"))

  print("\n--- Request 2: Authorized Manager (Cache Miss, Lazy Load) ---")
  print(proxy.get_document("DOC-101", "MANAGER"))

  print("\n--- Request 3: Authorized Admin (Cache Hit) ---")
  print(proxy.get_document("DOC-101", "ADMIN"))
```
<!-- slide -->
```csharp
using System;
using System.Collections.Generic;

// 1. SHARED SUBJECT CONTRACT
public interface IDocumentService
{
    string GetDocument(string docId, string userRole);
}

// 2. REAL SUBJECT (Heavy, resource-intensive, expensive)
public class RealDocumentService : IDocumentService
{
    public RealDocumentService()
    {
        // Simulates expensive connection setup, memory buffers, or cold-start overhead
        Console.WriteLine("[RealDocumentService] Initialized heavy storage connection.");
    }

    public string GetDocument(string docId, string userRole)
    {
        Console.WriteLine($"[Disk I/O] Loading document '{docId}' from encrypted disk storage...");
        return $"Contents of {docId}: Classified System Architecture Specs";
    }
}

// 3. PROXY (Combines Protection, Virtual, and Caching Proxies)
public class DocumentServiceProxy : IDocumentService
{
    // Notice: RealDocumentService is NOT initialized at proxy instantiation time!
    private RealDocumentService? _realService;
    private readonly Dictionary<string, string> _cache = new();

    public string GetDocument(string docId, string userRole)
    {
        // 1. PROTECTION PROXY: Verify authorization before doing anything
        if (userRole != "ADMIN" && userRole != "MANAGER")
        {
            Console.WriteLine($"[Security] Access DENIED for role '{userRole}' requesting '{docId}'");
            return $"Error: Unauthorized access to {docId}";
        }

        // 2. CACHING PROXY: Serve from cache if already retrieved
        if (_cache.TryGetValue(docId, out string? cachedContent))
        {
            Console.WriteLine($"[Cache] HIT for document '{docId}'");
            return cachedContent;
        }

        // 3. VIRTUAL PROXY: Defer heavy initialization until first authorized, uncached call
        if (_realService == null)
        {
            Console.WriteLine("[Virtual Proxy] Instantiating RealDocumentService on demand...");
            _realService = new RealDocumentService();
        }

        // 4. Delegate to real subject and cache result
        string content = _realService.GetDocument(docId, userRole);
        _cache[docId] = content;
        return content;
    }
}

public class Program
{
    public static void Main()
    {
        IDocumentService proxy = new DocumentServiceProxy();

        Console.WriteLine("--- Request 1: Unauthorized Guest ---");
        Console.WriteLine(proxy.GetDocument("DOC-101", "GUEST"));

        Console.WriteLine("\n--- Request 2: Authorized Manager (Cache Miss, Lazy Load) ---");
        Console.WriteLine(proxy.GetDocument("DOC-101", "MANAGER"));

        Console.WriteLine("\n--- Request 3: Authorized Admin (Cache Hit) ---");
        Console.WriteLine(proxy.GetDocument("DOC-101", "ADMIN"));
    }
}
```
````

**Expected Output (Both Languages):**

```text
--- Request 1: Unauthorized Guest ---
[Security] Access DENIED for role 'GUEST' requesting 'DOC-101'
Error: Unauthorized access to DOC-101

--- Request 2: Authorized Manager (Cache Miss, Lazy Load) ---
[Virtual Proxy] Instantiating RealDocumentService on demand...
[RealDocumentService] Initialized heavy storage connection.
[Disk I/O] Loading document 'DOC-101' from encrypted disk storage...
Contents of DOC-101: Classified System Architecture Specs

--- Request 3: Authorized Admin (Cache Hit) ---
[Cache] HIT for document 'DOC-101'
Contents of DOC-101: Classified System Architecture Specs
```

---

## 4. Where You Already Use It

### In .NET / C#

1. **Entity Framework Core Lazy-Loading Proxies:**
   - Package: `Microsoft.EntityFrameworkCore.Proxies`.
   - When configured with `options.UseLazyLoadingProxies()`, EF Core emits runtime dynamic proxy subclasses (using Castle.Core) for every entity with `virtual` navigation properties:
     ```csharp
     public class Order
     {
         public int Id { get; set; }
         public virtual Customer Customer { get; set; } // Intercepted by Virtual Proxy!
     }
     ```
   - When you access `order.Customer`, the proxy intercepts the getter, executes SQL to fetch the customer if null, and populates it seamlessly.
2. **Castle DynamicProxy (Interceptors and Mocking):**
   - The engine powering mocking libraries like **Moq** (`Mock<T>.Object`), AOP interception, and Autofac dynamic decorators. It emits proxy classes that intercept method calls via `IInterceptor`.
3. **gRPC and WCF Client Stubs:**
   - Generated client classes (e.g., `BillingServiceClient`) act as **Remote Proxies**: they implement the service contract interface locally, but serialize requests into Protobuf and send them over HTTP/2 sockets.

### In Python

1. **`unittest.mock.MagicMock`:**
   - Python's standard mocking framework uses dynamic proxies driven by `__getattr__` and `__call__`. Any method called on a `MagicMock` is dynamically recorded and intercepted without a real implementation existing.
2. **SQLAlchemy Lazy Relationships:**
   - Specifying `relationship("Address", lazy="select")` instructs SQLAlchemy to wrap the relationship in an instrumentation descriptor (proxy) that triggers an SQL query upon attribute access.
3. **`multiprocessing.managers.SyncManager` / `BaseProxy`:**
   - Used for inter-process communication (IPC). When sharing a list or dictionary across OS process boundaries (`manager.list()`), Python returns a proxy object that marshals calls across IPC pipes to the manager process holding the real collection.
4. **`weakref.proxy`:**
   - Creates a weak reference proxy that acts like the referent object without preventing garbage collection. If the referent is collected, any subsequent proxy access raises `ReferenceError`.

---

## 5. Pitfalls and When Not to Use It

1. **The N+1 Query Disaster:**
   - The primary hazard of Virtual Proxies in data layers:
     ```python
     # 1 query to fetch 100 orders
     orders = db.query(Order).limit(100).all()

     # Each iteration accesses order.customer (Virtual Proxy), firing 100 extra queries!
     for order in orders:
       print(order.customer.name)  # Total: 101 database round-trips!
```
   - *Fix:* Use **eager loading** (`.Include(o => o.Customer)` in EF Core or `joinedload(Order.customer)` in SQLAlchemy) to fetch related entities in a single `JOIN`.
2. **Reference Equality Breaks (`proxy != realSubject`):**
   - In languages like C# and Java, `object.ReferenceEquals(proxy, realSubject)` evaluates to `false`. Code that relies on pointer equality or checks `GetType()` instead of checking interface types will fail unexpectedly.
3. **Serialization and JSON Disasters:**
   - Passing an ORM dynamic proxy directly to `System.Text.Json` or `json.dumps()` frequently triggers infinite recursion (circular navigation properties) or crashes trying to serialize database connection handles attached to the proxy interceptor.
   - *Fix:* Always project entities into clean DTOs (Data Transfer Objects) before serialization.
4. **Concurrency and Double-Checked Locking in Virtual Proxies:**
   - In multi-threaded environments, if two threads invoke `proxy.GetDocument()` simultaneously while `_realService` is null, both may attempt to instantiate the heavy resource concurrently. Virtual proxies in production must use double-checked locking or `Lazy<T>`.

---

## 6. Exercises & Practical Drills

### Exercise 1: Proxy or Decorator?

Examine the following two class definitions and classify each as either a **Proxy** or a **Decorator**, explaining your reasoning:

```csharp
// Class A
public class MeteredPaymentService : IPaymentService
{
    private readonly IPaymentService _service;
    private readonly IMetricsClient _metrics;

    public MeteredPaymentService(IPaymentService service, IMetricsClient metrics)
    {
        _service = service;
        _metrics = metrics;
    }

    public async Task ProcessAsync(decimal amount)
    {
        var timer = Stopwatch.StartNew();
        await _service.ProcessAsync(amount);
        _metrics.Record("payment_duration_ms", timer.ElapsedMilliseconds);
    }
}

// Class B
public class LazyPaymentService : IPaymentService
{
    private IPaymentService? _realService;
    private readonly string _connectionString;

    public LazyPaymentService(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task ProcessAsync(decimal amount)
    {
        _realService ??= new HeavyPaymentService(_connectionString);
        await _realService.ProcessAsync(amount);
    }
}
```

<details>
<summary>Answer</summary>

- **Class A is a Decorator:** It accepts an already instantiated `IPaymentService` instance in its constructor and adds an orthogonal cross-cutting behavior (metrics collection). It does not govern access or manage the lifetime of the service.
- **Class B is a Proxy (Virtual Proxy):** It does not accept an existing service instance in its constructor; instead, it accepts configuration (`connectionString`) and completely manages the creation and lifecycle of the `HeavyPaymentService`, deferring its instantiation until `ProcessAsync` is invoked for the first time.
</details>

### Exercise 2: Diagnose and Fix the N+1 Lazy Loading Trap

You discover the following endpoint taking 3.5 seconds to return 200 orders:

```csharp
// C# / EF Core
[HttpGet("recent")]
public IActionResult GetRecentOrders()
{
    // Lazy loading is enabled globally
    var orders = _context.Orders.OrderByDescending(o => o.CreatedAt).Take(200).ToList();

    var results = orders.Select(o => new
    {
        OrderId = o.Id,
        CustomerName = o.Customer.FullName, // Virtual proxy triggers SQL query per order!
        ShippingCity = o.ShippingAddress.City // Another virtual proxy query!
    }).ToList();

    return Ok(results);
}
```
Explain the query execution pattern and rewrite the query using eager loading to eliminate the N+1 problem.

<details>
<summary>Answer</summary>

**Execution Pattern:**
1 query to fetch the 200 `Orders`, followed by 200 queries to fetch each `Customer`, plus 200 queries to fetch each `ShippingAddress`. Total: $1 + 200 + 200 = 401$ separate database network round-trips!

**Fix (Eager Loading with `Include`):**
```csharp
[HttpGet("recent")]
public IActionResult GetRecentOrders()
{
    var results = _context.Orders
        .OrderByDescending(o => o.CreatedAt)
        .Take(200)
        .Select(o => new
        {
            OrderId = o.Id,
            CustomerName = o.Customer.FullName,
            ShippingCity = o.ShippingAddress.City
        })
        .ToList();

    return Ok(results);
}
```
*Note:* Using `.Select(...)` directly into an anonymous projection generates a single SQL query with the appropriate `LEFT JOIN`s, bypassing the entity tracking and lazy-loading proxy layer completely. Alternatively, `.Include(o => o.Customer).Include(o => o.ShippingAddress)` loads the entities eagerly.
</details>

---

## 7. Interview Questions & Model Answers

> [!interview]
> **Question 1: What is the Proxy pattern?**  
> **Strong Answer:**  
> "The Proxy pattern is a Gang of Four structural design pattern that provides a surrogate, placeholder, or control object for another target object. The proxy implements the exact same interface as the real subject, allowing it to seamlessly substitute for the subject in client code.  
> 
> Its primary purpose is **access control and lifecycle management**. Rather than directly executing the target's logic, the proxy intercepts invocations to enforce security rules (Protection Proxy), delay expensive instantiation until first use (Virtual Proxy), cache idempotent responses (Caching Proxy), or marshal calls across network and IPC boundaries (Remote Proxy)."

> [!interview]
> **Question 2: What is the difference between Proxy and Decorator?**  
> **Strong Answer:**  
> "While both Proxy and Decorator implement the exact same interface as the wrapped object, their intent and lifecycle responsibilities differ fundamentally:  
> 
> 1. **Lifecycle Management:** A **Decorator** is passed an *already instantiated* object by the client; it enhances that object with new behavior but never controls whether the object exists. A **Proxy** controls the *lifecycle and access* of the real subject—it can instantiate the real subject lazily on demand, reject access entirely, or manage communication with a subject that lives on another server.  
> 2. **Intent:** Decorator is about *extending functionality* dynamically (such as adding encryption or logging to a stream). Proxy is about *controlling access* (such as lazy loading, RBAC authorization, or caching).  
> 3. **Client Awareness:** A client explicitly composes decorators in layers, whereas a client is typically oblivious that it is talking to a proxy instead of the real subject."

> [!interview]
> **Question 3: How does lazy loading use a proxy?**  
> **Strong Answer:**  
> "Lazy loading relies on a **Virtual Proxy**. In ORMs like Entity Framework Core or SQLAlchemy, entity relationship properties (such as `order.Customer` or `order.Items`) are not populated during the initial query. Instead, the framework attaches a dynamic proxy subclass that overrides the property getters.  
> 
> When the application code reads `order.Customer.Name`, the proxy interceptor checks if the backing field is null. If it has not been loaded, the proxy intercepts execution, queries the database (`SELECT * FROM Customers WHERE Id = @id`), populates the reference, and then returns the value. To the consumer, it appears as a standard object graph access, but the expensive I/O was deferred until the exact moment of access. The major architectural hazard of this approach is the N+1 query problem, which must be countered with eager loading."

> [!interview]
> **Question 4: What kinds of proxies exist?**  
> **Strong Answer:**  
> "There are five primary types of proxies:  
> 1. **Virtual Proxy:** Defers the instantiation of a resource-heavy or slow-loading object until it is actually accessed (e.g., ORM lazy loading, high-res image placeholders).  
> 2. **Protection Proxy:** Enforces authorization, authentication, and role-based access control (RBAC) before delegating requests to sensitive operations.  
> 3. **Remote Proxy:** Acts as a local ambassador for an object that exists in a different address space, process, or remote server, marshalling parameters and handling network transport (e.g., gRPC client stubs, WCF channels).  
> 4. **Caching Proxy:** Intercepts requests to return memoized results from local memory or distributed caches, short-circuiting expensive backend computations.  
> 5. **Smart Reference Proxy:** Performs bookkeeping actions when an object is accessed, such as reference counting, audit logging, or acquiring thread-safety locks."

---

## 8. Sources & Further Reading

- Gamma, Helm, Johnson, Vlissides (Gang of Four). *Design Patterns: Elements of Reusable Object-Oriented Software*. Addison-Wesley.
- [Microsoft Learn: Entity Framework Core Lazy Loading](https://learn.microsoft.com/en-us/ef/core/querying/related-data/lazy)
- [Castle Project: Castle DynamicProxy Overview](https://github.com/castleproject/Core/blob/master/docs/dynamicproxy.md)
- [Python Documentation: weakref — Weak references](https://docs.python.org/3/library/weakref.html#weakref.proxy)
- [Python Documentation: multiprocessing.managers](https://docs.python.org/3/library/multiprocessing.html#managers)
- [Refactoring.Guru: Proxy Design Pattern](https://refactoring.guru/design-patterns/proxy)

---

Previous: [Flyweight](../13-flyweight/README.md) · Next: [Strategy](../15-strategy/README.md)
