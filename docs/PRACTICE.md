# Practice Center: how the content works

The Practice Center (`/practice/`) has **coding problems you solve in the page** (Python, run in the browser against tests; and SQL, run on SQLite in the
browser), **study plans**, quizzes, coding interview questions, concept interview questions and exercises, every day a **drill** and a **problem of the day**, and
three ways to get ready: a **level check**, **mock interviews** and a **review queue** of what was missed. All of it is **content in git**, reviewed like a lesson,
and an item is tied to the lesson that teaches it where there is one.

> The Design Lab (low-level and high-level design challenges, `/design-lab/`) was removed in 2026-11 and replaced by the coding questions. Its addresses
> redirect (`webapp/public/_redirects`); what people had submitted stays in the database, unread.

## Files

| Kind | Where | Address |
|---|---|---|
| Coding problem (runs in the page; Python, or SQL when it says `"language": "sql"`) | `content/practice/code/<slug>.json` | `/practice/code/<slug>/` |
| The data SQL problems run on | `content/practice/sql-data/<dataset>.sql` (made by `scripts/dev/make-sql-data.py`) | not a page |
| Study plan | `content/practice/plans/<slug>.json` | `/practice/plan/<slug>/` |
| Quiz | `content/practice/quizzes/<slug>.json` | `/practice/quiz/<slug>/` |
| Exercise | `content/practice/exercises/<slug>.json` | `/practice/exercise/<slug>/` |
| Interview set (concepts, or coding questions) | `content/practice/interview/<slug>.json` | `/practice/interview/<slug>/` |

`webapp/src/lib/practice/validate.js` says what each must contain. In short:

- **Coding problem:** see [Coding problems](#coding-problems-solved-in-the-page) below.
- **Quiz:** `title`, `topic`, `difficulty` (beginner, intermediate, advanced), `module` (the lesson's `README.md` path under `content/`), `description`,
  and `questions`. A question has `id`, `type` (`single`, `multiple` or `truefalse`), `text`, `options` (`{ id, text }`; a true/false question has the
  options `true` and `false`), `answer` (option ids) and an `explanation` that says *why*.
- **Exercise:** `title`, `topic`, `difficulty`, `module`, `brief` (Markdown), `deliverables`.
- **Interview set:** `title`, `topic`, `difficulty`, optional `module`, optional `section` (`concepts`, the default, or `coding`), `questions` as `{ q, a }`. `a` is
  **Markdown**, so a coding answer can carry code blocks. A `coding` set is on the *Coding questions* tab of Practice and a `concepts` one on *Interview prep*;
  both are at `/practice/interview/<slug>/`, and both are public FAQ pages (with `FAQPage` data) because the answers are there to be read.

## What is public, and what is not

- A quiz's **answers and explanations never leave the server before a try**: the API sends the questions, scores a try, and sends the answers back with
  it. The public pages (`/practice/quiz/<slug>/`) carry the questions only. `scripts/lib/listingPages.test.mjs` checks it.
- A coding problem's **model solution and its explanation never leave the server until they are asked for** (`GET /api/practice/code/<slug>/solution`, which the
  page calls only after the reader has tried and asked twice, or has solved it). The public page (`/practice/code/<slug>/`) has the statement and the
  starting code, never the solution or the tests. `scripts/lib/listingPages.test.mjs` and `api/tests/practice.test.js` check both.
- An exercise **submission is private** to its author and to the admins. An admin can review it; the author reads the review. (Sharing a solution with
  other learners, and peer feedback, were Design Lab features and are gone; their tables stay, unread, and account deletion still clears them.)

## Adding or changing content

- **In git:** add or edit the file, then `npm run practice:build` (writes `api/generated/practice-content.json`) and `npm run check`. `npm run check:diagrams`
  draws every Mermaid diagram, including any inside the practice files. For a coding problem also run `npm run check:code` (see below).
- **In the browser:** Admin, Practice, "Edit the content": open one, or start a new quiz from a template, **Check it**, **Save to the repository**. The
  server validates before it commits (a bad file would stop the next deploy), and CI rebuilds the generated file.
- Tell a reviewer what you could not verify. The drafts written for 2.0 each came with a list of facts worth a second look.

## Coding problems, solved in the page

A coding problem is a file in `content/practice/code/` with these fields (`codeProblems` in `webapp/src/lib/practice/validate.js` checks them):

| Field | What |
|---|---|
| `title`, `topic`, `difficulty`, optional `module` | as for every kind. `topic` groups the problem on the map of topics (names and order in `CODE_TOPICS`, `webapp/src/config/practice.js`) |
| `description` | one sentence for the card |
| `statement` | Markdown, shown beside the editor: what to build, the rules the tests rely on (what is returned for empty input or no answer, whether order matters), and examples. **Every expectation of a test must be derivable from it** |
| `starter` | the code the editor starts with: a signature or class skeleton with a docstring and `...` for a body; helper classes (a `ListNode`) written out in full |
| `tests` | a list of pieces of Python, or `{ name, code }`; at least 3 must be *cases* (see below) |
| `hints` | up to 5, from a nudge to the detail people get wrong; the page shows them one at a time |
| `solution`, `explanation` | the model solution and how it works (Markdown); kept on the server until asked for |

**Tests.** A test is a piece of Python that runs after the learner's code, in the same namespace. One with an `assert` of its own is a *case*: it passes or fails,
is named by its first assert, and a plain `assert a == b` says "got X, expected Y" when it fails. One without is set-up for the tests after it (a helper that
builds a linked list). An `assert` inside a helper `def` is set-up too, not a case. Where several answers are right, check the property with a helper that
raises `AssertionError` with a message, and write `assert helper(...)` so it still counts. Keep tests deterministic (inject a clock, a sleep, an rng; no real time,
threads or files), and keep a linked chain or nested structure to about 800 nodes: **Pyodide's stack is smaller than a desktop Python's**, and freeing a long chain of
linked objects at once can kill it (the page says so and starts a new one).

**How it runs.** `webapp/public/runner/` holds Pyodide (CPython compiled to WebAssembly, MPL-2.0, in a folder named for its version so the browser keeps it for
good), `py-worker.js` (the worker) and `harness.py`, the one file that decides what passes. `webapp/src/lib/practice/pyRunner.js` starts the worker when a coding
screen opens, sends it the learner's code and the tests, and ends it if a run takes longer than `RUNNER.timeoutMs` (a loop that never ends cannot hang the page).
Nothing a learner writes leaves their browser. The Content-Security-Policy allows `'wasm-unsafe-eval'` for this (it allows compiling WebAssembly, not `eval`).
The editor (`CodeEditor.jsx`) is a textarea with the colours drawn behind it, line numbers, indentation, and Ctrl+Enter to run.

**Writing a problem.** The Python code inside a JSON string is awkward to write, so `python scripts/dev/code-problem-builder.py problems.py` builds the JSON from a Python file of `P(...)` calls (raw strings, tests as one block of asserts that it splits) and then runs the check below on what it wrote; `content/practice/code/two-sum.json`, `reverse-linked-list.json` and `min-stack.json` are a function, a function over a data structure and a class. A good problem teaches one thing, names the function in the first sentence, states every convention a test relies on (empty input, no answer, order, ties), has 6 to 12 tests (the examples first, then the edges, then one input big enough that a slow or wrong approach fails), three hints from a nudge to the detail people get wrong, and an explanation that gives the idea, the complexity and the usual mistakes without pasting the solution again.

**Checking a problem.** `npm run check:code` runs every problem's tests with `harness.py` twice, with ordinary Python (`scripts/lib/judge_problem.py`; needs Python 3) and in
Pyodide itself (`scripts/lib/pyodideJudge.mjs`): the model solution must pass every test in good time, and the starting code must run and fail some. CI runs it. While
writing, `node scripts/check/check-code-problems.mjs <slug> [--pyodide]` checks just that one.

**Progress.** A problem tried is a progress mark `practice/code/<slug>` = `wip`, solved is `done`; they are saved like a module's (in the browser, and on the server
for a signed-in reader), which is what earns XP (`game.config.json` -> `xp.problem`), keeps the streak and follows the account. `lib/practice/progressKeys.js` names the keys,
and module counts (`lib/curriculum/progressStats.js`) leave them out.

## The daily drill and the problem of the day

At the top of Practice (and under the quest on the Learn page) are two things to do today, the same for everyone on a given UTC day:

- **The drill** (`/practice/drill/`): `game.config.json` -> `drill.questions` (5) questions drawn from all the quizzes, at most `maxPerQuiz` from one, in an order that depends only
  on the day (`lib/practice/drill.js`). The API serves them without answers (`GET /api/practice/drill`) and checks each when it is given (`POST /api/practice/drill/check`),
  so the answer and the reason come straight after, as a drill should. A finished drill is the progress mark `practice/drill/<day>`; what was answered is not kept.
- **The problem of the day**: one of the problems whose level is in `dailyProblem.levels`, picked by `lib/practice/codeProgress.js` `problemOfTheDay`: the problems come round
  in a shuffled order, each once before any comes again, never the same one two days running.

## Coding questions

The *Coding questions* sets (`section: "coding"`) are FAQ-style answers to the questions a coding interview asks: what the problem is, the approach, a
worked solution in Python with its complexity, and the follow-up an interviewer is likely to ask. Every code block in them was run, with assertions,
when the set was written; if you edit a solution, run it again before you commit. They are grouped by pattern (arrays and hashing, two pointers and
sliding window, stacks, heaps and intervals, linked lists and trees, binary search and sorting, graphs and backtracking, dynamic programming), with one set
of practical backend problems (LRU cache, rate limiter, retries, consistent hashing, a bounded queue) and one FAQ on how coding interviews work.

## What a learner gets

Quizzes: optional timed mode (a minute per question; scored when it runs out), a retry of just the questions missed (practice: not added to the
history), and "Where to practise" on My Learning (from the latest try of each quiz, by topic). Their tries are kept when they are signed in.

The other files an admin can edit in the browser (the learning paths, the videos and the search titles) work the same way: see [`ADMIN_CONTENT.md`](ADMIN_CONTENT.md).

## SQL problems

A coding problem with `"language": "sql"` is judged by running the learner's **query** on SQLite (sql.js, SQLite compiled to WebAssembly, vendored in
`webapp/public/runner/sqljs-<version>/` and cached for good) in a worker (`sql-worker.js`; `lib/practice/sqlRunner.js` shares the worker client with the Python runner,
`lib/practice/workerClient.js`). It has no tests: it names a `dataset` (`content/practice/sql-data/<dataset>.sql`, `CREATE TABLE` and `INSERT` statements; five small
datasets: `shop`, `company`, `events`, `llm_calls`, `ml_runs`), `variants` (lists of statements that change the data: a NULL where there was none, a tie, a group with
nothing in it), and `expected`: the table the model solution gives on the data as it is and on each variant. The query runs on a **fresh in-memory copy** each time (so
`DROP TABLE` changes nothing next time), once on the data and once on each variant, and each result is compared with the expected one (`lib/practice/sqlCompare.js`: the
same column names in the same order, the same rows, in any order unless `orderMatters`, numbers to 6 places, NULL is not 0 or an empty string). At least one variant is
required, so a list of the rows is not an answer. The tables beside the statement are read from the data by the engine. A result is cut after `SQL_RUNNER.maxRows` rows and a
query is stopped after `SQL_RUNNER.timeoutMs` (`config/code.js`). Progress, XP, the discussion and the hub are the Python problems' (the mark is `practice/code/<slug>`).

**Writing and checking.** `python scripts/dev/sql-problem-builder.py problems.py` builds the JSON from a file of `S(...)` calls (raw strings), then runs
`node scripts/check/check-sql-problems.mjs --write <slugs>`, which runs the model solution with the same engine and the same `sql-core.js` the worker runs (Node loads
`webapp/public/runner/sql-core.js`, so the checks run the very code the browser runs), writes `expected` into the file, and fails when the starting query is already the
answer, a variant changes nothing, an empty answer would let anything pass, or `orderMatters` is set with no `ORDER BY`. `npm run check:sql` (a CI step) fails when
`expected` is not what the solution gives now: after changing a dataset (`python scripts/dev/make-sql-data.py`) or a solution, run `--write` for the problems it touches.
The builders refuse a slug that would overwrite a problem of the other language.

## Machine learning and GenAI problems

Two topics of pure-Python problems (no numpy: they run in Pyodide next to the others): *Machine learning from scratch* (softmax, metrics, validation, linear and
logistic models, k-means, k-nearest neighbours, trees, ranking, drift, a forward pass) and *LLM and GenAI building blocks* (cosine search, sampling, attention, positional
encoding, BPE, chunking, BM25, rank fusion, packing a context, safe prompt templates, extracting JSON, KV cache memory, pass@k, the agent loop). The GenAI ones name the
lesson that teaches them in `module`; the ML lessons are still placeholders, so those problems name none.

## Study plans

A plan is `content/practice/plans/<slug>.json`: `title`, `topic`, `difficulty`, `description`, `audience`, and `days`, each `{ title, items }` where an item is `{ kind, ref }`:
a `lesson` (its file under `content/`), a `code` problem or a `quiz` (its slug) or a `mock` interview (the id of a track). `npm run practice:build` fails when something a
plan names is not there. What is done is read from the reader's own progress marks (`lib/practice/plans.js`): nothing is entered by hand and a plan has no clock to keep up
with; following a plan keeps `{ id, start }` on the device (`site.config.json` -> `storage.plan`), and the page says which day the schedule is on and how many days behind
the reader is (it costs nothing). A finished plan is the mark `practice/plan/<id>` (XP, a badge), saved wherever the plan is looked at (`hooks/useActivePlan.js`). Six plans
are in git: backend interview in 30 days, a 14-day crash course, algorithms in Python, GenAI engineer, SQL for developers, machine learning from scratch.

## The level check, mock interviews and the review

All three read `game.config.json` (`levelCheck`, `mock`) and `site.config.json` (`review`), and draw questions from the quizzes by topic with a seed (`lib/practice/picks.js`).
The API serves the questions by key without answers (`GET /api/practice/questions`, `GET /api/practice/level-check`, `GET /api/practice/mock?track=&seed=`) and checks what
was chosen (`POST /api/practice/questions/check`), so an answer never reaches the page before it has been given.

- **Level check** (`/practice/level/`): a few questions in each area (backend, DevOps, Python and algorithms, GenAI), the same for everyone, no feedback until the end,
  then each area's band (`bandsFromPercent`) and the path and plan to start with for the weakest. The result is kept on the device.
- **Mock interview** (`/practice/mock/` or `/practice/mock/<track>/`): a track's questions and coding problems, against a clock, with no hints, solution or discussion
  (`CodeProblemView` has a `mock` mode). The interview in progress is kept on the device so a reload does not lose it. The scorecard weighs a problem as two questions and says
  how each topic went; a finished mock is the mark `practice/mock/<track>/<time>` (XP, a badge) and the last ten are listed.
- **Review** (`/practice/review/`): the Leitner system (`lib/practice/review.js`): a question missed in a drill, quiz, level check or mock, and a coding problem solved, come back
  after 1, 3, 7, 14 and 30 days (`site.config.json` -> `review.intervalsDays`), a right answer moves an item a box on and a wrong one back to the first. It is kept on the device.

A quiz **passed** (`game.config.json` -> `quiz.passPercent`) is the mark `practice/quiz/<slug>` (XP, a badge); a try below it is "tried".

## The discussion under a problem

Each coding problem has a discussion, the comments system under the path `code:<slug>` (`lib/blog/limits.js`). It stays shut until it is asked for, because people share solutions
there, and opens by itself once the problem is solved, with a button that puts the reader's own code in the comment box as a fenced block to read over and post. Code in
any comment is shown as code (`lib/commentText.js`).

## Sharing, and public profiles

On the Learn page, *Share my progress* draws a picture of the reader's level, XP, streak, problems solved and badges **in their browser** (`lib/shareCard.js`, 1200 x 630;
nothing is uploaded) to download, copy as text or hand to the share sheet. A signed-in reader can also publish a **public profile**: a handle, a name and the same numbers and
badges, at `/#__profile@<handle>`, which anyone with the link can open. It is opt-in, it says the numbers were reported by their owner (the game is computed in the browser from
their own progress), it holds only the numbers and badge ids the game has (`api/routes/profile.js` cuts the snapshot), and it is gone when the reader takes it down or deletes their
account. It needs migration `0008_public_profiles.sql` (`npm run db:migrate:remote`).
