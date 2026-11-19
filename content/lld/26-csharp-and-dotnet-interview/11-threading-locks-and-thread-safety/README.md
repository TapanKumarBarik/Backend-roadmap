# Lesson 11: Threading, Locks and Thread Safety

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 26: C# and .NET Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in C#, with the Python way beside them where the comparison helps.

**After this lesson you will be able to:** Make code thread-safe with `lock`, `Interlocked`, `SemaphoreSlim` and concurrent collections.

## What it will cover

- Race conditions shown in code
- `lock` and `Monitor`; why you cannot `await` inside `lock`
- `Interlocked`, `SemaphoreSlim`, `ReaderWriterLockSlim`
- `ConcurrentDictionary` and friends
- A thread-safe Singleton (see Track 25)

## Interview questions it will answer

1. What is a race condition?
2. What does the `lock` keyword do?
3. Why can you not use `await` inside a `lock`?
4. When would you use `ConcurrentDictionary`?

---

Previous: [async/await, Tasks and the Deadlock Trap](../10-async-await-and-tasks/README.md) · Next: [Extension Methods, Partial Classes, Attributes and Reflection](../12-extension-methods-attributes-and-reflection/README.md)
