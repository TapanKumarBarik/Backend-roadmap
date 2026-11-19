# Lesson 15: Dependency Injection Lifetimes: Singleton, Scoped and Transient

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 26: C# and .NET Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in C#, with the Python way beside them where the comparison helps.

**After this lesson you will be able to:** Choose `AddSingleton`, `AddScoped` or `AddTransient` correctly, and spot a captive dependency.

## What it will cover

- Registering services in `builder.Services`
- Singleton, Scoped and Transient: what each means per request
- The captive dependency (a scoped service inside a singleton) and scope validation
- `IServiceProvider`, `IServiceScopeFactory` and background services
- Keyed services; `IOptions`, `IOptionsSnapshot` and `IOptionsMonitor`

## Interview questions it will answer

1. What is the difference between `AddSingleton`, `AddScoped` and `AddTransient`?
2. What is a captive dependency?
3. How do you use a scoped service in a singleton or a background service?
4. Which lifetime should a `DbContext` have?
5. What is the difference between `IOptions` and `IOptionsMonitor`?

---

Previous: [The Middleware Pipeline: app.Use, app.Run and app.Map](../14-middleware-pipeline-use-run-map/README.md) · Next: [Routing, Controllers vs Minimal APIs, Model Binding and Filters](../16-routing-controllers-minimal-apis-and-filters/README.md)
