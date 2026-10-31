# Lesson 01: What Is System Design? HLD vs LLD

## Roadmap

You are at the start of **System Design Interview Prep**, in Track 01, **Core Fundamentals**: lesson 1 of 19. Nothing comes before it, and it assumes only that you can read a short Python function. The next eighteen lessons take the ideas introduced here one at a time (requirements, tiers, scaling, latency, availability, CAP, consistency, failure); this lesson gives you the whole picture first, so each later one has somewhere to land.

It links to, and does not re-teach, two other places. [Track 14, Module 01: The System Design Interview Framework](../../../backend/14-system-design-interview-practice/01-the-system-design-interview-framework/README.md) is the full seven-step version of the short opening you learn at the end of this lesson. [Low-Level Design](../../../lld/README.md) is the course for the LLD half of "HLD vs LLD".

After this lesson you can:

- say in one sentence what system design is, and why requirements come before boxes;
- tell high-level design (HLD) from low-level design (LLD), with an example of each and the place on this site that teaches each;
- take a small FastAPI app from one process to a separate database, replicas behind a load balancer, a cache and a CDN, and say at every step what it buys and what it costs;
- run the two-copies experiment that shows why state has to leave the process before a second server can help;
- say what an interviewer is scoring, and open an answer in five steps.

Why it matters: a system design interview is not a quiz on technologies. It hands you a vague sentence ("design a link shortener") and watches how you turn it into something buildable. People who know a great deal still fail it because they start naming tools (Kafka, Cassandra, Redis) before they know what the system has to do, and then cannot say why any box is there.

## Concept

> [!key] System design is turning requirements into an architecture: the parts of a system and the connections between them, chosen so that the whole meets its needs at the scale you expect. There is no single right answer. There are choices, each with a cost, and a good design is one whose choices you can justify.

## Explanation

### Requirements come first

A design is an answer, and the requirements are the question. They come in two kinds (lessons 3 and 4 take each in turn):

- **Functional requirements** say what the system does: "turn a long URL into a short one", "redirect a short URL to the long one".
- **Non-functional requirements** say how well it must do it: how many users, how fast a redirect must be, how much downtime is acceptable, whether it may ever lose a link.

The same features can need very different systems:

| | A link shortener for a class of 30 | A link shortener for the whole internet |
|---|---|---|
| Functional | create a link, follow a link | create a link, follow a link |
| Traffic | a few requests an hour | thousands of redirects every second |
| If it is down for an hour | nobody notices | broken links on a million pages |
| A sensible design | one small server | replicas, a cache, a CDN, a replicated database |

Two features, two architectures. This is why the first thing to do in an interview, before drawing anything, is to ask about the numbers.

### HLD and LLD

You will hear these two words in every round of interview preparation.

- **High-level design (HLD)** decides which parts exist and how they talk: services, databases, caches, queues, load balancers, and the data that flows between them.
- **Low-level design (LLD)** decides how the code inside one part is shaped: classes, interfaces, methods, and who is responsible for what.

| | High-level design (HLD) | Low-level design (LLD) |
|---|---|---|
| The question | Which parts exist, and how do they talk? | How is the code inside one part shaped? |
| Building blocks | Services, databases, caches, queues, load balancers, CDNs | Classes, interfaces, methods, modules |
| What you produce | Boxes and arrows, data flow, rough numbers, an API sketch | Class and sequence diagrams, responsibilities, design patterns |
| A typical prompt | "Design a link shortener / a news feed / a chat app" | "Design a parking lot / an elevator / a vending machine" |
| Taught on this site | This course, then [backend track 14](../../../backend/14-system-design-interview-practice/README.md) | [Low-Level Design](../../../lld/README.md) |

Take the link shortener. The HLD says: stateless app servers behind a load balancer, one database holding code-to-URL pairs, a cache for the popular links, a CDN in front. The LLD zooms into a single app server and asks what a `Link` is, which class makes the short codes, whether the redirect handler knows about SQL or asks a `LinkRepository`, and how expiry can be tested without waiting a day. The [diagram below](#visual-diagram) shows the two zoom levels side by side.

> [!pitfall]
> HLD and LLD are not "big" and "small". They are different questions asked at different zoom levels. Clean classes cannot rescue a system with a single point of failure, and a perfect box diagram cannot rescue code nobody can change. Interviews usually test them in separate rounds, so make sure you know which one you are being asked.

### Every step is a trade-off

There is no free lunch in a design. Every box you add improves some quality and costs another: a cache makes reads fast and makes them stale; a replica adds capacity and adds a consistency question; a queue smooths a spike and adds delay. Saying so out loud is most of what "justify your design" means.

> [!model]
> Each box on a diagram can fail, has to be paid for, and has to be understood by whoever is on call at three in the morning. Add a box when a number forces you to, and say which number.

### What interviewers evaluate

An interviewer is not checking your design against an answer key. There is none. They are scoring how you think:

- **Structured thinking.** Do you clarify requirements and scope before designing, and work from a simple version to a more complete one, or do you jump to the end?
- **Trade-offs.** For each choice, can you say what it improves, what it costs, and when you would choose differently?
- **Communication.** Can they follow you? Do you think out loud, state your assumptions, and take a hint when they steer you?

A shape that works for the opening minutes of almost any prompt:

1. **Clarify.** Functional and non-functional requirements, and what is out of scope.
2. **Estimate.** Users, requests per second, how much data. Just enough to know whether one machine could do it.
3. **Sketch.** The simplest design that could work, and the path of one core request through it.
4. **Deep-dive.** The part that breaks first under your numbers, or the part the interviewer points at.
5. **Trade-offs and failure.** What each choice costs, and what happens when a box dies.

[Track 14, Module 01](../../../backend/14-system-design-interview-practice/01-the-system-design-interview-framework/README.md) expands this into seven steps with a time budget.

## Code

The way to learn this is not to draw the final diagram and defend it, but to start with the simplest thing that works and grow it only when something forces you to. The example is a tiny link shortener written in FastAPI. It needs Python 3.10 or newer and `pip install fastapi uvicorn`; everything below was run with Python 3.11.9, FastAPI 0.162.0 and Uvicorn 0.54.0.

### Stage 0: everything in one process

Save this as `shortener_v0.py`:

```python
import secrets

from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, HttpUrl

app = FastAPI()
links: dict[str, str] = {}  # the data lives inside this process


class NewLink(BaseModel):
    url: HttpUrl


@app.post("/links", status_code=201)
def create_link(body: NewLink):
    code = secrets.token_urlsafe(4)
    links[code] = str(body.url)
    return {"code": code, "short_url": f"/{code}"}


@app.get("/{code}")
def follow(code: str):
    url = links.get(code)
    if url is None:
        raise HTTPException(status_code=404, detail="unknown code")
    return RedirectResponse(url, status_code=302)
```

Run it with `uvicorn shortener_v0:app --port 8000`. Open `http://127.0.0.1:8000/docs`, use **POST /links** to create a link, and follow the returned code in a browser.

This is a complete system: one server, one process, no network hops, nothing to configure. For a class project it is the right design. It also hides two assumptions, and both break first: the links live in this process's memory, so restarting the app loses them, and there is only one copy of the app.

### Stage 1: move the state out (a separate database)

Move the links into a database the app does not own, so the app can be restarted, replaced or copied. This sample uses a SQLite file so it runs with nothing else installed; in production the same step is a database server (PostgreSQL, MySQL) on its own machine. Save it as `shortener_v1.py`:

```python
import os
import secrets
import sqlite3

from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, HttpUrl


class NewLink(BaseModel):
    url: HttpUrl


def create_app(db_path: str) -> FastAPI:
    app = FastAPI()

    def run(sql: str, args: tuple = ()) -> list[tuple]:
        db = sqlite3.connect(db_path)
        try:
            with db:  # commits when the block succeeds
                return db.execute(sql, args).fetchall()
        finally:
            db.close()

    run("CREATE TABLE IF NOT EXISTS links (code TEXT PRIMARY KEY, url TEXT NOT NULL)")

    @app.post("/links", status_code=201)
    def create_link(body: NewLink):
        code = secrets.token_urlsafe(4)
        run("INSERT INTO links (code, url) VALUES (?, ?)", (code, str(body.url)))
        return {"code": code, "short_url": f"/{code}"}

    @app.get("/{code}")
    def follow(code: str):
        rows = run("SELECT url FROM links WHERE code = ?", (code,))
        if not rows:
            raise HTTPException(status_code=404, detail="unknown code")
        return RedirectResponse(rows[0][0], status_code=302)

    return app


app = create_app(os.environ.get("DB_PATH", "links.db"))
```

The API is unchanged. What changed is where the truth lives. The step buys durability and the ability to run more than one copy of the app on the same data. It costs a round trip on every request, a new part that can be down, and connections and a schema to manage.

### Stage 2: more than one app server (a load balancer and replicas)

Because state is no longer in the process, a second copy of the app is useful. A **load balancer** is the one address users talk to; it spreads requests across the copies (the **replicas**) and, when it has health checks, skips a copy that is down. This NGINX sketch is illustrative and was not run for this lesson; `upstream` declares the group, and requests are spread round-robin unless you configure otherwise:

```nginx
upstream shortener {
    server app1:8000;
    server app2:8000;
}

server {
    listen 80;

    location / {
        proxy_pass http://shortener;
    }
}
```

The step buys capacity, and the ability to lose or redeploy one copy while the others serve. It costs the **stateless** rule: anything a request leaves behind in one replica's memory or disk is invisible to the others, which is exactly why Stage 0 had to change first ([lesson 19](../19-stateless-vs-stateful/README.md) comes back to this). It also adds a part that can fail: the load balancer itself, so production runs two ([lesson 17](../17-single-point-of-failure/README.md)).

### Stage 3: a cache in front of the database

Most requests to a shortener are redirects, and the same popular codes are followed again and again. Keep recent answers in memory and ask the database only on a miss. Copy `shortener_v1.py` to `shortener_v2.py`, add `import time` and `CACHE_SECONDS = 60` at the top, and add these lines inside `create_app`, below `run`:

```python
    cache: dict[str, tuple[float, str]] = {}  # code -> (expires_at, url); one per replica

    def lookup(code: str) -> str | None:
        hit = cache.get(code)
        if hit and hit[0] > time.monotonic():
            return hit[1]  # answered from memory: no trip to the database
        rows = run("SELECT url FROM links WHERE code = ?", (code,))
        if not rows:
            return None
        cache[code] = (time.monotonic() + CACHE_SECONDS, rows[0][0])
        return rows[0][0]
```

The step buys fewer database reads and faster answers. It costs correctness at the edges: an answer can be **stale**. The cache here is a dictionary inside each replica, so each replica has its own copy and they can disagree; real systems put a shared cache such as Redis in this position, which is one more system to run and watch.

### Stage 4: a CDN at the edge

A **CDN** (content delivery network) is a fleet of caches in many cities that sits between users and your load balancer. One header is enough to let it help. In `shortener_v2.py`, `follow` now uses `lookup` and sends the header:

```python
    @app.get("/{code}")
    def follow(code: str):
        url = lookup(code)
        if url is None:
            raise HTTPException(status_code=404, detail="unknown code")
        # Tells a CDN (and browsers) it may reuse this answer for a minute.
        return RedirectResponse(url, status_code=302, headers={"Cache-Control": f"public, max-age={CACHE_SECONDS}"})
```

`Cache-Control: public, max-age=60` tells shared caches, a CDN included, that they may reuse this response for sixty seconds. Static files (the site's JavaScript and images) go the same way. The step buys answers from a machine near the user and far less traffic reaching you. It costs control: a response stored by a cache stays until it expires or is purged, you no longer see every click on your own servers, and the CDN is another bill.

The staleness is not theoretical. We tested it: after deleting the row from the database, the replica that had the link cached kept answering with the redirect (302), while a replica with a cold cache correctly answered 404.

| Step | What it buys | What it costs |
|---|---|---|
| 1. A database apart from the app | The data outlives the process; many app copies can share it; it can be backed up and tuned on its own | A network round trip on every query; a new part that can be down; connections and a schema to manage |
| 2. A load balancer and replicas | More capacity; one copy can die or be redeployed while the others serve | The app must be stateless; the balancer is itself a part that can fail; health checks and deploys to manage |
| 3. A cache | Fewer database reads and faster answers | Stale answers; deciding when to drop an entry; another system to run; per-replica copies that disagree |
| 4. A CDN | Answers from near the user; far less traffic reaching your servers | A cached answer cannot be recalled before it expires or is purged; you no longer see every request; another bill |

## Visual diagram

The two zoom levels of one system. The top line is HLD: boxes and the connections between them. Zooming into the app server gives the LLD: the classes inside it.

```
 HLD: which parts exist, and how they talk
 ┌───────┐    ┌───────────────┐    ┌────────────┐    ┌──────────┐
 │ users │───►│ load balancer │───►│ app server │───►│ database │
 └───────┘    └───────────────┘    └─────┬──────┘    └──────────┘
                                         │
                                         │ zoom in
                                         ▼
 LLD: how the code inside one part is shaped
 ┌─────────────────────────────────────────────────────────────┐
 │ app server                                                  │
 │                                                             │
 │  ┌────────────┐   ┌─────────────┐   ┌──────────────────┐    │
 │  │ HTTP route │──►│ LinkService │──►│ LinkRepository   │    │
 │  │ follow()   │   │ (the rules) │   │ «interface»      │    │
 │  └────────────┘   └─────────────┘   └──────────────────┘    │
 │                                                             │
 └─────────────────────────────────────────────────────────────┘
```

The shortener after all four stages. A request leaves at the first box that can answer it, so the further down it gets, the more it costs.

```
     ┌───────┐
     │ users │
     └───┬───┘
         │
         ▼
    ┌─────────┐
    │   CDN   │   keeps static files and redirects near the user
    └────┬────┘
         │ miss
         ▼
  ┌───────────────┐
  │ load balancer │   one address; spreads requests; skips a dead copy
  └───┬───────┬───┘
      │       │
      ▼       ▼
 ┌────────┐ ┌────────┐
 │ app 1  │ │ app 2  │   the same code, nothing remembered between requests
 └───┬────┘ └────┬───┘
     │           │
     └─────┬─────┘
           ▼
      ┌─────────┐
      │  cache  │   hot links, answered from memory
      └────┬────┘
           │ miss
           ▼
     ┌──────────┐
     │ database │   where the links live for good
     └──────────┘
```

## Practice

### 1. Watch the state die with the process

Run `shortener_v0.py` (`uvicorn shortener_v0:app --port 8000`), create a link through `/docs`, and follow the code it returns (in a terminal: `curl -i http://127.0.0.1:8000/<code>`; in Windows PowerShell write `curl.exe`). Then stop the server with Ctrl+C, start it again, and follow the same code. What do you get, and what does that say about where the data lives?

<details><summary>Answer</summary>

The first follow answers `302 Found` with a `Location` header pointing at the URL you saved. After the restart the same code answers `404` with `{"detail":"unknown code"}`. The links were a Python dictionary inside the process, so they died with it. Nothing was "lost" by a bug: this is what keeping state in memory means, and it is the first reason to move it out.

</details>

### 2. Run two copies

Open two terminals. In each, run `shortener_v0.py`, one with `--port 8001` and one with `--port 8002`. Create a link on port 8001 and follow it on port 8001, then follow the same code on port 8002. Then repeat with `shortener_v1.py` instead, giving both copies the same database file (bash: `DB_PATH=links.db uvicorn shortener_v1:app --port 8001`; PowerShell: `$env:DB_PATH = "links.db"; uvicorn shortener_v1:app --port 8001`). What differs, and why?

<details><summary>Answer</summary>

With `shortener_v0` the follow on 8001 is a `302` and the follow on 8002 is a `404 {"detail":"unknown code"}`: each process has its own dictionary. With `shortener_v1` both answer `302` to the same URL, because both read the same database. A load balancer in front of the `v0` pair would send a visitor to a copy that has never heard of the link about half the time. That is why state has to leave the process before a second server helps.

</details>

### 3. HLD or LLD?

For each statement, say whether it is a high-level or a low-level design decision:

1. Put a cache between the app servers and the database.
2. `LinkRepository` is an interface, with an in-memory fake for tests.
3. Run three replicas of the app in two availability zones.
4. Put code generation in its own `CodeGenerator` class so it can be replaced.
5. Serve the site's static files from a CDN.

<details><summary>Answer</summary>

1. HLD: a new part and a new connection between parts.
2. LLD: how the code inside the app is shaped, and what it depends on.
3. HLD: how many copies of a part, and where they run.
4. LLD: who is responsible for what inside one part.
5. HLD: a new part between users and the system.

The test: if the decision adds, removes or connects parts that run separately, it is HLD. If it is about how the code inside one part is organised, it is LLD.

</details>

### 4. Price a step

A teammate proposes adding a cache in front of the database. Write down what it buys, two things it costs, and one number you would measure before agreeing.

<details><summary>Answer</summary>

It buys fewer database reads and lower latency on the hot path. It costs stale answers (an entry can outlive the data behind it, as the deleted link did in Stage 4) and an invalidation decision (when does an entry stop being trusted?); it also adds a system to run, and a per-replica cache means replicas can disagree. The number to measure first is the **hit rate** a cache would have: the share of lookups that repeat a recent one. If few lookups repeat, the cache costs everything above and buys almost nothing. A second good number is how often the database is the part that is actually slow.

</details>

### 5. Prove the stale window

Using `shortener_v2.py` (Stage 3 and 4 applied), create a link and follow it once so it is cached. Delete the row from the database, then follow the code again. What do you see, and what would you change to shorten the window?

<details><summary>Answer</summary>

To delete the row without extra tools, run `python -c "import sqlite3; db = sqlite3.connect('links.db'); db.execute('DELETE FROM links'); db.commit()"` in the folder holding the database file. The follow still answers `302` until `CACHE_SECONDS` has passed, then `404`; a second copy started after the delete answers `404` at once. To shorten the window: a smaller `CACHE_SECONDS`, or have delete also remove the entry from the cache (and ask the CDN to purge it). Each option costs something: a smaller number means more database reads, and purging means more moving parts and a CDN API call on every delete.

</details>

### Checkpoint quiz

1. Two systems have the same features but need different architectures. What makes them different?
2. Which is HLD and which is LLD: (a) choosing between one database and a database with read replicas; (b) deciding that `LinkService` talks to a `LinkRepository` interface?
3. Why did the links have to move out of the process before a second app server was any use?
4. A CDN caches your redirect for 60 seconds and you delete the link. What happens, and what are two ways to shorten the window?
5. "There is no single right answer" in a design interview. Does that mean any design will do?
6. What do you do before you draw anything in an interview?

<details><summary>Answers</summary>

1. Their non-functional requirements: scale, latency, availability, durability, cost. The features can be identical.
2. (a) is HLD; (b) is LLD.
3. State kept in one process's memory is invisible to every other process. A second copy would answer 404 for links created on the first (exercise 2). The app has to be stateless for replicas to be interchangeable.
4. Visitors keep being redirected from the CDN's stored copy until it expires, because a response held by a cache cannot be recalled early. Shorten it with a lower `max-age`, or purge the entry through the CDN's API when a link is deleted (or both).
5. No. A design is judged on whether its choices follow from the requirements and whether you can say what each costs and how it fails. Several designs can be good; many are not.
6. Clarify functional and non-functional requirements and what is out of scope, then get rough numbers. Drawing comes after.

</details>

> [!check]
> - I can say in one sentence what system design is.
> - I can tell HLD from LLD, give an example of each, and say which course on this site teaches which.
> - I can describe the five stages of the shortener and say what each buys and costs.
> - I can explain why the first app server's memory is the wrong place to keep state once there are two.
> - I can open a system design answer with the five-step shape.

## Project

Extend the shortener with **expiring links**. A link may carry `expires_in_seconds` when it is created; once that time has passed, following it answers `410 Gone` instead of redirecting. Build it on `shortener_v1.py`, with a test that proves a link does not expire early and does not live past its time. Then answer in a short note, no code: which parts of your change are high-level design and which are low-level design; what happens to an expiring link under Stage 3's cache and Stage 4's `Cache-Control` header (will it keep redirecting after it has expired, and for how long?); and how you would change the cache entry or the header so an expired link stops redirecting on time, with the price of that change. No solution is given.

## Interview questions

> [!interview] What does a system design interview evaluate?

<details><summary>What a strong answer covers</summary>

- How you think, not which architecture you recite: structured thinking, trade-offs and communication. There is no single right answer.
- Structure: clarifying requirements and scope first, estimating before sketching, starting simple and growing the design when a number forces it.
- Trade-offs: for each choice, what it improves, what it costs, and what would make you choose differently.
- Communication: thinking out loud, stating assumptions, taking the interviewer's hints, keeping to the time.

</details>

> [!interview] How is HLD different from LLD?

<details><summary>What a strong answer covers</summary>

- HLD covers services, storage and data flow: which parts exist and how they talk. LLD covers classes, modules and interfaces: how the code inside one part is shaped.
- A concrete example: for a link shortener, HLD is load balancer, app servers, database, cache, CDN; LLD is `Link`, `LinkService`, a `LinkRepository` interface and how expiry is tested.
- Not a difference of size or importance: both can sink a project, and they are usually separate interview rounds ("design a news feed" versus "design a parking lot").

</details>

> [!interview] You have one server and traffic is growing. What do you do?

<details><summary>What a strong answer covers</summary>

- First measure: which resource is the bottleneck (CPU, memory, database, network) and at what load, rather than guessing.
- Cheap fixes before new parts: a bigger machine, an index, a better query.
- Then grow in order, naming the cost each time: state out of the process (a separate database), replicas behind a load balancer once the app is stateless, a cache for hot reads, a CDN for static and cacheable content.
- Failure for each new part: the load balancer needs redundancy, the cache can serve stale data, the database is now the part everything depends on.

</details>

> [!interview] Why not start with microservices, Kafka and a sharded database?

<details><summary>What a strong answer covers</summary>

- Every component is a cost: it can fail, must be operated and understood, and slows every change. A design is not better for having more boxes.
- Start with the simplest design that meets the stated requirements and numbers, and say which number would force each addition.
- Distinguish a requirement that really needs the complexity (very high write volume, strict isolation) from a habit borrowed from large companies.

</details>

## Common mistakes & troubleshooting

- **Naming technologies before requirements.** "We'll use Kafka" before you know whether anything needs a queue. Ask first, choose after.
- **Drawing the final architecture first.** Start with the simplest design that works, say what number would break it, then grow it.
- **A box with no number behind it.** For each component, be able to say what requirement or measurement forced it in.
- **Describing only the happy path.** For each box, say what happens when it is down or slow.
- **Treating HLD and LLD as big and small.** They are different questions; know which one you are asked.
- **Silence.** An interviewer cannot score thinking they cannot hear. Narrate your reasoning.
- **`ModuleNotFoundError: No module named 'shortener_v0'`.** Run `uvicorn` from the folder that holds the file.
- **The port is already in use.** Another copy is still running; stop it or choose another `--port`.
- **A `404` on the second copy of `shortener_v0` in exercise 2.** That is the expected result, not a bug.
- **`curl` in Windows PowerShell behaves oddly.** In Windows PowerShell `curl` is an alias for a different command; write `curl.exe`.

## Further reading & sources

- [What Is System Design? HLD vs LLD Explained (video, 2:24)](https://www.youtube.com/watch?v=aNVDz45U-cM) - the two-and-a-half-minute version of this lesson, by the author.
- [Designing Data-Intensive Applications](https://dataintensive.net/) - Martin Kleppmann's book on the data systems behind these choices; the standard reference for the trade-offs the rest of this course names (replication, consistency, partitioning).
- [The System Design Primer](https://github.com/donnemartin/system-design-primer) - free, open-source notes on load balancers, caches, CDNs and the CAP theorem, with interview questions and sample designs.
- [AWS Well-Architected Framework](https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html) - a vendor's framework for weighing the pros and cons of design decisions across reliable, secure, efficient, cost-effective and sustainable systems; the same "every choice has a cost" idea as this lesson.
- [Site Reliability Engineering](https://sre.google/sre-book/table-of-contents/) - Google's free online book; its chapters on load balancing, handling overload and cascading failures show what the boxes added here cost when they fail.
- [NGINX: HTTP load balancing](https://nginx.org/en/docs/http/load_balancing.html) - the `upstream` block and the round-robin default used in the Stage 2 sketch.
- [MDN: HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching) - how `Cache-Control: max-age` works, what shared caches such as CDNs do with it, and why a stored response stays until it expires or is purged.
- [FastAPI: First steps](https://fastapi.tiangolo.com/tutorial/first-steps/) - the framework used for the running example.

## Next

[Lesson 02: Client-Server and Multi-Tier Architecture](../02-client-server-and-multi-tier-architecture/README.md)
