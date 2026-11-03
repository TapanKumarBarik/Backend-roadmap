# Practice Center and Design Lab: how the content works

The Practice Center (`/practice/`) has quizzes, exercises and interview sets. The Design Lab (`/design-lab/`) has low-level and high-level design
challenges. All of it is **content in git**, reviewed like a lesson, and each item is tied to the lesson that teaches it.

## Files

| Kind | Where | Address |
|---|---|---|
| Quiz | `content/practice/quizzes/<slug>.json` | `/practice/quiz/<slug>/` |
| Exercise | `content/practice/exercises/<slug>.json` | `/practice/exercise/<slug>/` |
| Interview set | `content/practice/interview/<slug>.json` | `/practice/interview/<slug>/` |
| Design challenge | `content/design-lab/{lld,hld}/<slug>.json` | `/design-lab/{lld,hld}/<slug>/` |

`webapp/src/lib/practice/validate.js` says what each must contain. In short:

- **Quiz:** `title`, `topic`, `difficulty` (beginner, intermediate, advanced), `module` (the lesson's `README.md` path under `content/`), `description`,
  and `questions`. A question has `id`, `type` (`single`, `multiple` or `truefalse`), `text`, `options` (`{ id, text }`; a true/false question has the
  options `true` and `false`), `answer` (option ids) and an `explanation` that says *why*.
- **Exercise:** `title`, `topic`, `difficulty`, `module`, `brief` (Markdown), `deliverables`.
- **Interview set:** `title`, `topic`, `difficulty`, `module`, `questions` as `{ q, a }`.
- **Challenge:** `kind`, `title`, `summary`, `module`, `problem`, `functional`, `nonFunctional`, `constraints`, `deliverables`, `hints`, and a `reference`
  solution in Markdown. A reference presents one reasonable design and names the trade-offs and the alternatives; it is never "the" answer.

## What is public, and what is not

- A quiz's **answers and explanations never leave the server before a try**: the API sends the questions, scores a try, and sends the answers back with
  it. The public pages (`/practice/quiz/<slug>/`) carry the questions only. `scripts/lib/listingPages.test.mjs` checks it.
- A challenge's **reference solution** is shown to someone who has submitted their own, and to an admin. It is not on the public page.
- A learner's **submission is private** until they submit it *and* choose to share it. Shared solutions show under the author's public name, and
  other learners can leave feedback on them (never on their own). An admin can review any submission; the author reads both.

## Adding or changing content

- **In git:** add or edit the file, then `npm run practice:build` (writes `api/generated/practice-content.json`) and `npm run check`. `npm run check:diagrams`
  draws every Mermaid diagram, including those in challenge references.
- **In the browser:** Admin, Practice, "Edit the content": open one, or start a new quiz from a template, **Check it**, **Save to the repository**. The
  server validates before it commits (a bad file would stop the next deploy), and CI rebuilds the generated file.
- Tell a reviewer what you could not verify. The drafts written for 2.0 each came with a list of facts worth a second look.

## What a learner gets

Quizzes: optional timed mode (a minute per question; scored when it runs out), a retry of just the questions missed (practice: not added to the
history), and "Where to practise" on My Learning (from the latest try of each quiz, by topic). Their tries are kept when they are signed in.
