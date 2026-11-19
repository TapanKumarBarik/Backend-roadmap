# Lesson 15: asyncio in Depth

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 27: Python Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in Python, with the C# way beside them where the comparison helps.

**After this lesson you will be able to:** Write correct async code: the event loop, tasks, `gather`, timeouts, and never blocking the loop.

## What it will cover

- Coroutines, the event loop and await
- `asyncio.create_task`, `gather`, `TaskGroup`
- Timeouts and cancellation
- The blocking-call trap, and `to_thread`
- `async with` and `async for`

## Interview questions it will answer

1. What is the event loop?
2. What is the difference between a coroutine and a task?
3. What happens if you call a blocking function inside async code?

---

Previous: [The GIL, Threads, Processes and asyncio](../14-the-gil-threads-processes-and-asyncio/README.md) · Next: [Metaclasses, Descriptors and How @property Works](../16-metaclasses-descriptors-and-property/README.md)
