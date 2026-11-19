# Lesson 20: Chain of Responsibility and the Middleware Pipeline

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 25: Design Patterns, One at a Time](../README.md) in the [Low-Level Design](../../README.md) course. Every example will be written twice, in Python and in C#.

**After this lesson you will be able to:** Pass a request along a chain of handlers, and see that ASP.NET Core middleware is exactly this pattern.

## What it will cover

- Handlers that either handle a request or pass it on
- Validation and approval chains
- The ASP.NET Core middleware pipeline as a chain (`app.Use`, `app.Run`), see Track 26
- Python: WSGI and ASGI middleware as a chain
- The silent hang: a handler that never calls next

## Interview questions it will answer

1. What is the Chain of Responsibility pattern?
2. How is ASP.NET Core middleware an example of it?
3. What happens if a handler does not call the next one?

---

Previous: [State](../19-state/README.md) · Next: [Iterator (IEnumerable and Generators)](../21-iterator/README.md)
