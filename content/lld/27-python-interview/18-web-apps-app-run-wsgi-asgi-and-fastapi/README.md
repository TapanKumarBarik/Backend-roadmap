# Lesson 18: Web Apps: app.run, WSGI, ASGI, Middleware and FastAPI Depends

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 27: Python Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in Python, with the C# way beside them where the comparison helps.

**After this lesson you will be able to:** Explain what `app.run` does in Flask, why production uses `gunicorn` or `uvicorn`, WSGI versus ASGI, middleware, and FastAPI dependency injection.

## What it will cover

- Flask `app.run`: the development server, and why not to use it in production
- WSGI (`gunicorn`) versus ASGI (`uvicorn`)
- Middleware in Flask, Django and FastAPI (Starlette), compared with ASP.NET Core `app.Use`
- FastAPI `Depends` as dependency injection
- Request lifecycle from socket to view function

## Interview questions it will answer

1. What does `app.run` do in Flask?
2. Why should you not use `app.run` in production?
3. What is the difference between WSGI and ASGI?
4. How does middleware work in FastAPI?
5. How does dependency injection work in FastAPI?

---

Previous: [Modules, Packages and Imports](../17-modules-packages-and-imports/README.md) · Next: [Testing: pytest, Fixtures and Mocking](../19-testing-pytest-fixtures-and-mocking/README.md)
