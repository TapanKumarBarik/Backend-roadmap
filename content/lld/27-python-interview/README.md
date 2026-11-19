# Track 27: Python Interview Questions

The Python questions asked in developer interviews, from mutability and the mutable default argument to decorators, generators, dunder methods, the MRO, the GIL and asyncio, and the Python side of web apps (`app.run`, WSGI, ASGI, FastAPI dependencies). Each answer is short enough to say out loud, with code you can run.

## How this track works

- Lessons 01 to 17 are the language; lesson 18 is web apps (Flask, FastAPI, WSGI and ASGI); lesson 19 is testing; lesson 20 is the revision sheet.
- Every code sample runs on current CPython with the standard library, unless the lesson says otherwise.
- If you have an interview this week: lessons 02, 04, 05, 06, 07, 14 and 20 first.
- The examples are in Python. Where C# does the same thing differently and the comparison helps, a second tab shows the C# way.
- The track has twenty lessons. Lessons whose text is not ready yet are marked *Soon* in the sidebar; their page already lists what they will cover and the interview questions they will answer.

## Lessons

| # | Lesson | What you'll be able to do |
|---|--------|---------------------------|
| 01 | [How Python Runs Your Code: Objects, Names and Bytecode](01-how-python-runs-your-code/README.md) | Explain that everything is an object, that variables are names bound to objects, and what CPython does with your file |
| 02 | [Mutability, Identity and Copying](02-mutability-identity-and-copying/README.md) | Predict what changes when you mutate a shared object, and avoid the mutable default argument trap |
| 03 | [Functions: *args, **kwargs, Closures and Scope](03-functions-args-kwargs-closures-and-scope/README.md) | Use every kind of parameter, explain LEGB scope, and write a closure |
| 04 | [Decorators](04-decorators/README.md) | Write a decorator from scratch, with arguments, keeping the wrapped function's name with `functools.wraps` |
| 05 | [Iterators, Generators and yield](05-iterators-generators-and-yield/README.md) | Explain the iterator protocol, write generators, and choose a generator expression over a list comprehension |
| 06 | [Classes: How an Object Is Made, Class Attributes and Slots](06-classes-init-new-and-slots/README.md) | Explain how an instance is created, class versus instance attributes, `@classmethod` constructors and `__slots__` |
| 07 | [Dunder Methods and the Data Model](07-dunder-methods-and-the-data-model/README.md) | Make your own classes work with `print`, `==`, `len`, `[]`, `with` and `+`, by implementing the right dunder methods |
| 08 | [Inheritance, super() and the MRO](08-inheritance-super-and-the-mro/README.md) | Explain multiple inheritance, the MRO (C3 linearisation) and what `super()` really calls |
| 09 | [ABCs, Protocols, Duck Typing and Type Hints](09-abcs-protocols-duck-typing-and-type-hints/README.md) | Define contracts with `abc.ABC` or `typing.Protocol`, and explain what type hints do and do not do at run time |
| 10 | [dataclasses, NamedTuple, Enum and pydantic](10-dataclasses-namedtuples-enums-and-pydantic/README.md) | Pick the right tool for a data-holding class: dataclass, `NamedTuple`, Enum or a pydantic model |
| 11 | [Context Managers and with](11-context-managers/README.md) | Write a context manager as a class and with contextlib, and explain what `with` guarantees |
| 12 | [Exceptions Done Right](12-exceptions-done-right/README.md) | Raise, chain and catch exceptions properly, and explain EAFP versus LBYL |
| 13 | [Memory, Garbage Collection and Performance](13-memory-garbage-collection-and-performance/README.md) | Explain reference counting and the cycle collector, and find what is slow before optimising it |
| 14 | [The GIL, Threads, Processes and asyncio](14-the-gil-threads-processes-and-asyncio/README.md) | Explain the GIL, and choose `threading`, `multiprocessing` or asyncio for a given workload |
| 15 | [asyncio in Depth](15-asyncio-in-depth/README.md) | Write correct async code: the event loop, tasks, `gather`, timeouts, and never blocking the loop |
| 16 | [Metaclasses, Descriptors and How @property Works](16-metaclasses-descriptors-and-property/README.md) | Explain descriptors and metaclasses well enough to answer the senior-level questions |
| 17 | [Modules, Packages and Imports](17-modules-packages-and-imports/README.md) | Explain how imports work, why `if __name__ == "__main__"` exists, and how to break a circular import |
| 18 | [Web Apps: app.run, WSGI, ASGI, Middleware and FastAPI Depends](18-web-apps-app-run-wsgi-asgi-and-fastapi/README.md) | Explain what `app.run` does in Flask, why production uses `gunicorn` or `uvicorn`, WSGI versus ASGI, middleware, and FastAPI dependency injection |
| 19 | [Testing: pytest, Fixtures and Mocking](19-testing-pytest-fixtures-and-mocking/README.md) | Test Python code with pytest fixtures and parametrize, and mock in the right place |
| 20 | [Rapid Fire: the Python Revision Sheet](20-rapid-fire-python/README.md) | Answer about eighty Python questions in one or two sentences each |

## Sources

- [Python documentation: the data model](https://docs.python.org/3/reference/datamodel.html)
- [Python documentation: Descriptor HowTo Guide](https://docs.python.org/3/howto/descriptor.html)
- [Python documentation: the method resolution order](https://docs.python.org/3/howto/mro.html)
- [Python documentation: functools](https://docs.python.org/3/library/functools.html)
- [Python documentation: contextlib](https://docs.python.org/3/library/contextlib.html)
- [Python documentation: asyncio](https://docs.python.org/3/library/asyncio.html)
- [PEP 557: Data Classes](https://peps.python.org/pep-0557/)
- [PEP 703: Making the Global Interpreter Lock Optional](https://peps.python.org/pep-0703/)
- [PEP 3333: the WSGI specification](https://peps.python.org/pep-3333/)
- [FastAPI: dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)
- [Flask: deploying to production](https://flask.palletsprojects.com/en/stable/deploying/)

Start here → [01-how-python-runs-your-code/README.md](01-how-python-runs-your-code/README.md)

Back to the course index: [../README.md](../README.md)
