# Lesson 13: Memory, Garbage Collection and Performance

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 27: Python Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in Python, with the C# way beside them where the comparison helps.

**After this lesson you will be able to:** Explain reference counting and the cycle collector, and find what is slow before optimising it.

## What it will cover

- Reference counting and the cyclic garbage collector
- `weakref`
- Small-integer caching and string interning (why is can surprise you)
- Profiling with `cProfile` and `timeit`
- Common speed-ups: built-ins, sets for lookups, avoiding repeated work

## Interview questions it will answer

1. How does Python manage memory?
2. What is reference counting?
3. Why can two equal integers or strings sometimes be the same object and sometimes not?
4. How do you find what is slow?

---

Previous: [Exceptions Done Right](../12-exceptions-done-right/README.md) · Next: [The GIL, Threads, Processes and asyncio](../14-the-gil-threads-processes-and-asyncio/README.md)
