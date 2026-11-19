# Lesson 10: async/await, Tasks and the Deadlock Trap

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 26: C# and .NET Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in C#, with the Python way beside them where the comparison helps.

**After this lesson you will be able to:** Explain what await does, avoid `async void` and `.Result` deadlocks, and run work in parallel safely.

## What it will cover

- What `await` really does (and does not do): no new thread
- Task versus Thread versus `ValueTask`
- `async void` and why to avoid it
- `.Result` and `.Wait()` deadlocks; `ConfigureAwait(false)`
- `Task.WhenAll`, `Task.WhenAny`, `CancellationToken`
- I/O-bound versus CPU-bound work

## Interview questions it will answer

1. What does async/await do?
2. What is the difference between a Task and a Thread?
3. Why should you avoid `async void`?
4. What causes a deadlock with `.Result`?
5. What does `ConfigureAwait(false)` do?

---

Previous: [Memory, Garbage Collection and IDisposable](../09-memory-garbage-collection-and-idisposable/README.md) · Next: [Threading, Locks and Thread Safety](../11-threading-locks-and-thread-safety/README.md)
