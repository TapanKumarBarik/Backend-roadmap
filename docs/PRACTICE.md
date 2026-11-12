# Practice Center: how the content works

The Practice Center (`/practice/`) has quizzes, **coding interview questions**, concept interview questions and exercises. All of it is **content
in git**, reviewed like a lesson, and an item is tied to the lesson that teaches it where there is one.

> The Design Lab (low-level and high-level design challenges, `/design-lab/`) was removed in 2026-11 and replaced by the coding questions. Its addresses
> redirect (`webapp/public/_redirects`); what people had submitted stays in the database, unread.

## Files

| Kind | Where | Address |
|---|---|---|
| Quiz | `content/practice/quizzes/<slug>.json` | `/practice/quiz/<slug>/` |
| Exercise | `content/practice/exercises/<slug>.json` | `/practice/exercise/<slug>/` |
| Interview set (concepts, or coding questions) | `content/practice/interview/<slug>.json` | `/practice/interview/<slug>/` |

`webapp/src/lib/practice/validate.js` says what each must contain. In short:

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
- An exercise **submission is private** to its author and to the admins. An admin can review it; the author reads the review. (Sharing a solution with
  other learners, and peer feedback, were Design Lab features and are gone; their tables stay, unread, and account deletion still clears them.)

## Adding or changing content

- **In git:** add or edit the file, then `npm run practice:build` (writes `api/generated/practice-content.json`) and `npm run check`. `npm run check:diagrams`
  draws every Mermaid diagram, including any inside the practice files.
- **In the browser:** Admin, Practice, "Edit the content": open one, or start a new quiz from a template, **Check it**, **Save to the repository**. The
  server validates before it commits (a bad file would stop the next deploy), and CI rebuilds the generated file.
- Tell a reviewer what you could not verify. The drafts written for 2.0 each came with a list of facts worth a second look.

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
