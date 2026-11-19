# C# and .NET Engineering Practice Arena: 22 Drills

> **Track:** [Track 26: C# and .NET Interview Questions](README.md)  
> **Target Audience:** C# and .NET backend developers preparing for senior, staff, and architecture interviews.  
> **Format:** 22 hands-on engineering challenges testing deep runtime mechanics, memory allocation, and ASP.NET Core internals.

---

## Part 1: Core CLR, Memory & Language Drills

- [ ] **Drill 01: CLR JIT & Assembly Lifecycle ([Lesson 01](01-how-dotnet-runs-your-code/README.md)):** Use `dotnet build -c Release` and inspect the generated IL using `ildasm` or `ilverify`. Explain tiered compilation (Tier 0 Quick JIT vs Tier 1 Optimized JIT).
- [ ] **Drill 02: Struct vs. Class Memory Benchmark ([Lesson 02](02-value-and-reference-types-structs-records/README.md)):** Use BenchmarkDotNet to allocate 1,000,000 `struct Point(double X, double Y)` vs `class Point`. Verify that the struct version causes 0 Gen 0 GC collections.
- [ ] **Drill 03: String Interning & Memory Profiling ([Lesson 03](03-strings-constants-and-immutability/README.md)):** Demonstrate `string.IsInterned`, `StringBuilder` capacity scaling, and `string.Create` with `Span<char>` to avoid heap allocations.
- [ ] **Drill 04: Modern Parameters & Invariants ([Lesson 04](04-parameters-ref-out-in-and-params/README.md)):** Contrast `ref`, `out`, `in` (pass-by-reference readonly), `ref readonly`, and `params ReadOnlySpan<T>`.
- [ ] **Drill 05: Multicast Delegates & Memory Leaks ([Lesson 05](05-delegates-events-and-lambdas/README.md)):** Build an event publisher and demonstrate how subscribing a short-lived listener to a long-lived publisher prevents GC collection unless unhooked or using weak references.
- [ ] **Drill 06: Covariance & Contravariance (`out` vs `in`) ([Lesson 06](06-generics-constraints-and-variance/README.md)):** Write an `IReadOnlyRepository<out T>` (covariant) and `IReceiver<in T>` (contravariant). Verify assignment compatibility with inheritance.
- [ ] **Drill 07: LINQ Deferred Execution & Custom Operators ([Lesson 07](07-collections-linq-and-deferred-execution/README.md)):** Implement a custom LINQ operator `.ChunkBy<T>(int size)` using `yield return`. Prove deferred execution: modifying the source list before iteration alters the output.
- [ ] **Drill 08: Exception Handling Performance ([Lesson 08](08-exceptions-done-right/README.md)):** Benchmark throwing 10,000 exceptions vs returning a `Result<T>` struct. Observe the stack unwinding cost.
- [ ] **Drill 09: IDisposable & Finalizer Pattern ([Lesson 09](09-memory-garbage-collection-and-idisposable/README.md)):** Implement the standard Dispose pattern (`Dispose(bool disposing)`) with `GC.SuppressFinalize(this)` wrapping an unmanaged handle.
- [ ] **Drill 10: Async/Await State Machine & Deadlock ([Lesson 10](10-async-await-and-tasks/README.md)):** Reproduce the classic `.Result` deadlock on a simulated single-threaded dispatcher, then fix it using `await` and `ConfigureAwait(false)`.
- [ ] **Drill 11: ThreadPool & Synchronization Primitives ([Lesson 11](11-threading-locks-and-thread-safety/README.md)):** Contrast `lock (Monitor)`, `SemaphoreSlim`, `ReaderWriterLockSlim`, and `Interlocked.Increment`. Build a concurrent rate limiter.
- [ ] **Drill 12: Source Generators vs Reflection ([Lesson 12](12-extension-methods-attributes-and-reflection/README.md)):** Write a custom attribute `[ValidateNotNull]` and inspect it via reflection, then benchmark against compile-time static dispatch.

---

## Part 2: ASP.NET Core & Enterprise Architecture Drills

- [ ] **Drill 13: Minimal API vs Controller Pipeline ([Lesson 13](13-aspnet-core-startup-program-cs/README.md)):** Build a clean `Program.cs` registering endpoints via extension methods on `WebApplication`.
- [ ] **Drill 14: Custom Middleware Chain ([Lesson 14](14-middleware-pipeline-use-run-map/README.md)):** Write a custom `CorrelationIdMiddleware` that reads `X-Correlation-ID` header, sets it in `HttpContext.Items`, logs request duration, and attaches it to response headers.
- [ ] **Drill 15: Captive Dependency Bug & Fix ([Lesson 15](15-dependency-injection-lifetimes/README.md)):** Deliberately inject a `Scoped` service into a `Singleton` service. Enable `ValidateScopes = true` in WebApplicationBuilder and observe the runtime startup exception.
- [ ] **Drill 16: Action Filter vs Middleware ([Lesson 16](16-routing-controllers-minimal-apis-and-filters/README.md)):** Build a model validation filter that returns custom `ValidationProblem` before controller action execution.
- [ ] **Drill 17: Options Pattern with Validation ([Lesson 17](17-configuration-logging-and-environments/README.md)):** Bind a strongly typed `DatabaseOptions` class with `[Required]` and `ValidateOnStart()`.
- [ ] **Drill 18: RFC 7807 ProblemDetails Handler ([Lesson 18](18-error-handling-and-problem-details/README.md)):** Configure `.AddProblemDetails()` and a custom `IExceptionHandler` mapping domain exceptions to standard HTTP error formats.
- [ ] **Drill 19: Policy-Based Authorization ([Lesson 19](19-authentication-and-authorization/README.md)):** Write a custom authorization requirement `MinimumAgeRequirement` and a handler `MinimumAgeHandler` inspecting JWT claims.
- [ ] **Drill 20: EF Core N+1 & Split Queries ([Lesson 20](20-ef-core-interview-questions/README.md)):** Write a query loading Orders with OrderItems and Customer. Compare `.Include()` vs `.AsSplitQuery()` and `.AsNoTracking()`.
- [ ] **Drill 21: Integration Testing with WebApplicationFactory ([Lesson 21](21-testing-xunit-mocks-and-integration-tests/README.md)):** Write an xUnit test spinning up an in-memory test server (`WebApplicationFactory<Program>`) substituting PostgreSQL with Testcontainers.
- [ ] **Drill 22: Rapid-Fire C# Master Quiz ([Lesson 22](22-rapid-fire-csharp-and-dotnet/README.md)):** Test yourself against the 81 questions covering the entire .NET runtime ecosystem.

