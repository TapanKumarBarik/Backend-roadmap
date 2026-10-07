# Contributing to Backend Roadmap

**Thank you for being here.** This is a free, open-source curriculum, and it only gets better when more people help build it. You don't need to be an expert — if you're learning backend engineering and want to contribute *while* learning, that's very welcome.

Please be kind to each other. This project follows a [Code of Conduct](CODE_OF_CONDUCT.md).

> New here? The [README](README.md#contribute) has the big picture: where help is needed, the modules waiting for authors, and ideas worth building. This page is the practical "how".

## Pick how you want to help

| I want to… | Start here |
|---|---|
| **Write a missing module** | [Claim a module](#writing-a-new-module) — 210 are waiting |
| **Fix or improve an existing module** | [Improving existing content](#improving-existing-content) |
| **Fix a typo / broken link / outdated command** | Click **Edit this page on GitHub** at the bottom of any module, or open a PR |
| **Work on the app or API** | [Contributing to the app](#contributing-to-the-app) |
| **Suggest a different approach (even a big one)** | [Proposing bigger changes](#proposing-bigger-changes) |
| **Report a problem** | [Open an issue](https://github.com/TapanKumarBarik/Backend-roadmap/issues/new/choose) |
| **I'm not sure** | Open an issue, say what you're interested in, and we'll find something that fits |

## Your first contribution in 10 minutes

You don't need to clone anything for a small fix:

1. Open any module on [backendroadmap.com](https://backendroadmap.com/) and click **Edit this page on GitHub** at the bottom.
2. GitHub walks you through forking the repo and editing the file in your browser.
3. Describe what you changed and why, and open the pull request.

That's it. Typos, broken links, outdated commands, and unclear sentences are all great first PRs.

## Writing a new module

**210 modules are placeholders** (their `README.md` says *"Content for this module has not been written yet."*). To list them:

```bash
git grep -l "has not been written yet" -- genai
```

1. **Claim it.** Open an issue titled `Claim: genai/09-retrieval-augmented-generation/01-naive-rag-end-to-end` (the **Claim this module** button on the module's page does this for you). This stops two people writing the same module. Say roughly when you expect a draft — no rush, but it helps. Changed your mind or got busy? Just say so and someone else can take it.
2. **Read the track's `README.md`** (it lists the modules in order and what each should cover), and read the previous module so yours continues from it.
3. **Write it** following the recipe below. Replace the placeholder file's content entirely.
4. **Preview it** ([run it locally](README.md#run-it-locally)) so you see it the way a learner will.
5. **Open a pull request.** One module per PR is easiest to review. A draft PR early is welcome.

### The module recipe

Every module teaches in the same order:

> **Roadmap → Concept → Explanation → Code → Visual diagram → Practice → Project → Interview question**

| Stage | Where it lives in the file |
|---|---|
| Roadmap | *Why this matters* — where this fits, prerequisites, what you'll be able to do afterwards |
| Concept | The core idea in a sentence or two, as a `> [!key]` block |
| Explanation | *Concepts* with `###` subheadings; `> [!model]` for mental models, `> [!pitfall]` for traps |
| Code | Real, runnable examples (`> [!example]` for worked cases) |
| Visual diagram | A diagram that teaches — ASCII box-drawing in `backend/`, `genai/`, `lld/`; Mermaid is welcome in `learn/` |
| Practice | *Hands-on exercises* with answers in `<details>`, and a *Checkpoint quiz* |
| Project | *Independent challenge* — a small build that uses the module |
| Interview question | An `> [!interview]` block: the question, and what a strong answer covers |

The README has a [copy-paste skeleton](README.md#what-a-great-module-looks-like). Every module also ends with **Further reading & sources** and a **Next** link.

### The bar for "done"

- [ ] **Accurate.** Every claim is something you've verified, ideally against a primary source.
- [ ] **Runnable.** Every command and code sample is something you actually ran, on a version you can state.
- [ ] **Sourced.** *Further reading & sources* has real, authoritative links (official docs, RFCs, papers) — not blog roundups — each with a one-line reason.
- [ ] **Teaches, not just tells.** There's a diagram or mental model, at least one hands-on exercise with an answer, and a few quiz questions.
- [ ] **Follows the house style** (below) and links to the next module.

### House style

- One `README.md` per module folder; folders are `NN-kebab-case`.
- Content blocks use [GitHub's alert syntax](https://docs.github.com/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts) so files read correctly on GitHub: `[!key]`, `[!example]`, `[!model]`, `[!pitfall]`, `[!interview]`, `[!exercise]`, `[!check]`.
- A "can you do X?" checklist uses `> [!check]` with a list, **not** `- [ ]` (those render as permanently disabled boxes in the app).
- Don't wrap a single short value in its own code fence — use inline code. Fences are for real commands and multi-line diagrams (and tag the language).
- Link to the next module with the explicit file: `../02-next/README.md`, never a bare directory.
- Answers to exercises and quizzes go in `<details><summary>Answer</summary>…</details>`.
- Tabbed code samples (`{{tabs}}` / `{{tab Label}}` / `{{/tabs}}`) are for showing the same thing in several languages — see any `lld/` module.

### Using AI tools

AI assistants are fine as a helper — for outlining, for a first draft you then rewrite, or for catching mistakes. But **you are responsible for every word you submit.** An unreviewed AI dump is worse than no module: it can be confidently wrong, and learners will trust it.

- **Run every command and code sample yourself.**
- **Check every factual claim and every link** against a real source.
- **Say so in the PR** if AI helped (no shame in it — it helps reviewers know what to double-check).
- PRs that look like unreviewed generated text (invented links, commands that don't run, generic filler) will be closed with a request to rework them.

## Improving existing content

Making a written module better is as valuable as writing a new one. Typical improvements: correcting a claim or an outdated version, explaining something more clearly, adding the failure mode people hit in production, adding missing exercises/quiz/interview question/sources, or tightening what doesn't teach.

- **Keep each PR focused** on one module or one idea.
- **Say what you changed and why**, and cite a source for factual changes. Disagreeing with a module is welcome — "I think this is wrong, here's why" is a contribution.
- **Open an issue first** if you want to rename, move, split, merge or reorder modules. Module URLs are bookmarked and shared, and learners' progress is stored by path, so moves need a plan.

## Contributing to the app

The app and API are a live codebase with real user accounts, so changes here are reviewed a little more carefully.

1. Read [LOCAL-SETUP.md](LOCAL-SETUP.md) and get it running. You can do **frontend and content work with no secrets**; see the README's [quick start](README.md#run-it-locally).
2. Keep the change small and focused.
3. Run the checks before you push:
   ```bash
   npm run check    # admin-guard check: every isAdmin() is awaited, every API file parses
   npm run build    # the full site build, as deployed
   ```
4. In the PR, say what you tested and how. Screenshots help for UI changes (light **and** dark).

Layout: `webapp/src/components/<feature>/`, `webapp/src/lib/{markdown,curriculum,search}/`, `api/routes/`, `api/lib/`, and `api/schema.sql` for the database. There's no automated test suite yet — adding one is a very welcome contribution.

> **Security:** never commit secrets, and don't report a vulnerability in a public issue — see [SECURITY.md](SECURITY.md).

## Proposing bigger changes

If you have a better way to build any of this — including the architecture — open an issue titled `RFC: <your idea>` (there's a form for it) covering **the problem, your proposal, the trade-offs, and how we'd migrate without breaking module URLs or learner progress**. A prototype beats a long argument. See [the README](README.md#open-to-better-ideas--including-the-architecture) for the open questions.

For anything bigger than a small fix, please open an issue *before* investing the time — it's much easier to agree on direction before the code is written than after.

## Pull requests

- **Branch** from `main` with a descriptive name: `claim-genai-09-01`, `fix-http-caching-typo`.
- **Commit messages** explain *why*, in plain language. One logical change per commit is nice but not required — PRs are squash-merged.
- **Checks:** CI builds the whole site on every PR. If it fails, the log says why; ask if it's unclear.
- **Review:** this is a one-maintainer project, so allow a few days — thank you for your patience. Reviews are about the *work*, never the person, and you'll always get a reason for any change requested.
- **Regular contributors** who know a track well may be invited to help review it.

## Getting help

Stuck on anything? [Open an issue](https://github.com/TapanKumarBarik/Backend-roadmap/issues/new/choose) — there are no silly questions.

## Regenerating the indexes locally

The search and navigation indexes are generated, not committed:

```bash
python scripts/gen-docs-index.py   # writes dist/docs-index.json  (python3 on macOS / Linux)
python scripts/gen-search-index.py # writes dist/search-index.json
```

Run them once after cloning, and again after you add or rename a module. CI does this on every deploy regardless.
