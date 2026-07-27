# 12 - Testing and Code Quality

This track is about the discipline that lets you change code without fear.
Everything you built in the earlier tracks made promises — this endpoint returns
`201`, this validator rejects bad input, this service raises a domain exception —
and until those promises are pinned down by *automated tests*, the only thing
verifying them is you, manually, once. This track turns those promises into
executable checks and teaches you to write them at the right level: fast
isolated unit tests at the base, real-database integration tests in the middle,
a thin tip of end-to-end and contract tests, all driven by genuine TDD
discipline, automated in CI, and backed by objective code-quality measurement.

## How this track works

- It assumes you've finished **track 02 (API Layer and Request Handling)** —
  you're comfortable with FastAPI, Pydantic, the handler → service → repository
  layering, dependency injection with `Depends`, and the OpenAPI spec FastAPI
  generates. This track tests exactly the kind of service you built there, and
  it leans on that layering constantly (a service that's cleanly separated from
  HTTP and the database is a service you can actually test).
- Everything is built in **Python** with **pytest** as the runner, plus
  `httpx`/`TestClient`, `testcontainers`, `pytest-mock`, `schemathesis`, `ruff`,
  and `mypy`. You grow *one* `testing-lab` project across the modules and, in
  the capstone, bring a real earlier-track service to full pyramid coverage.
- Every module builds on the ones before it — the test pyramid introduced in
  module 00 is the spine, and each later module fills in one layer or discipline
  (unit → TDD → integration → mocking → e2e/contract → quality → CI/strategy).
  Go in order; no forward references.
- Each standard module has the same shape: why it matters, concepts, a command
  reference with real pytest/FastAPI code, progressive hands-on exercises (do
  them — including a "diagnose and fix" scenario each), an independent challenge
  with no code, common mistakes, and a checkpoint quiz. Two **cumulative
  reviews** (in modules 03 and 07) mix questions from everything so far,
  closed-book.
- CI is covered deliberately *briefly* in module 07 — **track 13 (DevOps for
  Backend Engineers)** owns CI/CD, containers, and deployment in depth, and this
  track cross-references it rather than duplicating it.
- The last module is an open-ended **capstone** with no solution given — it's
  the integration test for the whole track.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Testing fundamentals and the test pyramid](00-testing-fundamentals-and-the-test-pyramid/README.md) | Explain why we test, place tests on the unit/integration/e2e pyramid, tell the four test doubles apart, and run pytest | 60-90 min |
| 01 | [Unit testing in depth](01-unit-testing-in-depth/README.md) | Use fixtures and parametrization, test pure vs. side-effecting code, and read coverage as a signal not a target | 60-90 min |
| 02 | [Test-driven development in practice](02-test-driven-development-in-practice/README.md) | Drive a feature with real red-green-refactor, triangulate, and judge when TDD helps vs. slows you down | 60-90 min |
| 03 | [Integration testing](03-integration-testing/README.md) | Test against a real test database, drive routes with TestClient/httpx, isolate test data, and use testcontainers | 75-100 min |
| 04 | [Mocking and dependency injection for testability](04-mocking-and-dependency-injection-for-testability/README.md) | Mock external services with FastAPI overrides and fakes, control time, and avoid over-mocking | 60-90 min |
| 05 | [E2E and contract testing](05-e2e-and-contract-testing/README.md) | Write critical-path e2e tests, verify the API against its OpenAPI spec with schemathesis, and judge when e2e is worth the cost | 60-90 min |
| 06 | [Code quality and static analysis](06-code-quality-and-static-analysis/README.md) | Lint with ruff, type-check with mypy, measure complexity, wire pre-commit hooks, and reason about quality beyond style | 60-90 min |
| 07 | [Testing in CI and test strategy](07-testing-in-ci-and-test-strategy/README.md) | Run tests in CI, triage flaky tests, and steer a balanced pyramid as a codebase grows | 60-90 min |
| 08 | [Capstone project](08-capstone-project/README.md) | Bring an untested FastAPI service to full test-pyramid coverage with mocks, a real test DB, an e2e/contract test, and passing lint/type checks | 4-6 hrs |

Start here → [00-testing-fundamentals-and-the-test-pyramid/README.md](00-testing-fundamentals-and-the-test-pyramid/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**13-devops-for-backend-engineers** — it picks up exactly where module 07's CI
section stops, taking the tests and quality gates you built here and connecting
them to the full path to production: CI/CD pipelines, containers, and deployment
strategies.
