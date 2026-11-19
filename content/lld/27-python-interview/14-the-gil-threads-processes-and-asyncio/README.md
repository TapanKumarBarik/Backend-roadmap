# Lesson 14: The GIL, Threads, Processes and asyncio

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 27: Python Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in Python, with the C# way beside them where the comparison helps.

**After this lesson you will be able to:** Explain the GIL, and choose `threading`, `multiprocessing` or asyncio for a given workload.

## What it will cover

- What the GIL is and why CPython has it
- I/O-bound versus CPU-bound work
- `threading`, `multiprocessing`, `concurrent.futures`
- asyncio for many waiting tasks
- Free-threaded CPython (PEP 703): what changed, and what has not yet

## Interview questions it will answer

1. What is the GIL?
2. Threading or `multiprocessing`: when which?
3. When is asyncio the right choice?
4. Does Python support true parallelism?

---

Previous: [Memory, Garbage Collection and Performance](../13-memory-garbage-collection-and-performance/README.md) · Next: [asyncio in Depth](../15-asyncio-in-depth/README.md)
