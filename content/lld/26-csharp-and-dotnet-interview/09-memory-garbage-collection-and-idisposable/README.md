# Lesson 09: Memory, Garbage Collection and IDisposable

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 26: C# and .NET Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in C#, with the Python way beside them where the comparison helps.

**After this lesson you will be able to:** Explain the generational GC, implement `IDisposable` correctly, and find a .NET memory leak.

## What it will cover

- How the garbage collector works: generations 0, 1 and 2, the large object heap
- `IDisposable`, `using` statements and `using` declarations
- The Dispose pattern and finalizers
- `IAsyncDisposable`
- Memory leaks in a garbage-collected language: event handlers, static references, caches

## Interview questions it will answer

1. How does garbage collection work in .NET?
2. What is the difference between Dispose and Finalize?
3. What does the `using` statement do?
4. Can you have a memory leak in .NET?

---

Previous: [Exceptions Done Right](../08-exceptions-done-right/README.md) · Next: [async/await, Tasks and the Deadlock Trap](../10-async-await-and-tasks/README.md)
