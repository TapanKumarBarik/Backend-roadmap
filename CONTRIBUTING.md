# Contributing

This repo is two things at once: a curriculum (markdown) and the app that
serves it (React + Azure Functions). What "contributing" means depends on
which one you're touching.

## Curriculum content

Welcome. If you find something wrong, unclear, or missing in `backend/`,
`learn/`, `lld/`, or `genai/` — open a pull request or an issue, whichever
you have time for.

A few conventions worth knowing before you write:

- One markdown file per module. Each top-level directory has its own
  `README.md` explaining its own structure — read that first.
- Seven content blocks (`[!key]`, `[!example]`, `[!model]`, `[!pitfall]`,
  `[!interview]`, `[!exercise]`, `[!check]`) give a module's prose real
  structure, using GitHub's own alert syntax so the file still reads
  correctly on GitHub, not only in the app. The main **README.md**'s
  "Writing module content" section has the full syntax and what each
  renders as. Using them is optional — a module using none of them renders
  exactly as it always has — but a new module is a good place to start.
- `{{tabs}}` / `{{tab Label}}` / `{{/tabs}}` renders a tabbed code block
  (e.g. showing the same request in three languages). See any existing
  module that uses it for the exact syntax.

You do **not** need to touch `docs-index.json` or `search-index.json` — both
are generated (see below) and regenerated automatically before every deploy.

## The app (`webapp/`, `api/`)

This part is maintained more tightly, since it's live for real users with
real accounts. Before sending a PR here:

1. Read `LOCAL-SETUP.md` and get the app running locally.
2. If you touched anything in `api/`, run
   `node scripts/check-admin-guards.js` — CI does, and it fails the build if
   an admin check is missing its `await`.
3. `cd webapp && npm run build` should succeed with no errors.
4. Say what you tested and how, in the PR description.

For anything more than a small fix, open an issue first to check the
direction before investing the time — this is a side project with one
maintainer, and larger changes are easier to align on before the code is
written than after.

## Reporting a security issue

Not here — see [SECURITY.md](SECURITY.md).

## Regenerating the indexes locally

```bash
python3 scripts/gen-docs-index.py
python3 scripts/gen-search-index.py
```

Needed once after cloning (they're gitignored, not committed) and again
after adding or renaming a module, if you want your local copy of the app to
reflect the change. CI does this on every deploy regardless, so the live
site is never affected by whether you ran these locally.
