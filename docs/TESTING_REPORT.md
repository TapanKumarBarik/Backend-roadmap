# Testing report

How the project is tested, what each layer guards, and the numbers at the time of writing (2026-11-03, after the 2.0 batch). Everything below runs
in CI (`.github/actions/verify`), in this order, and nothing is deployed unless all of it passes.

| Step | Command | What it guards |
|---|---|---|
| Practice content | `npm run practice:build` | the API's bundled copy of the quizzes and challenges is what is in `content/` |
| Checks | `npm run check` | admin routes all check the admin (no missing `await`), learning paths and lesson images are valid, no overview is mistaken for an unwritten module, videos are valid, `content/seo.json` (hand-written search titles) is valid, **every quiz, exercise, interview set and challenge is valid and names a lesson that exists** |
| Lint | `npm run lint` | `eslint --max-warnings 0` over the repository |
| Types | `npm run typecheck` | `tsc` over the API, the scripts and the webapp (JSDoc types, no TypeScript files) |
| Unit and API tests | `npm test` | `node:test`: the API on the real app with an in-memory SQLite stand-in for D1 (`api/tests/helpers.js`), and the pure logic of the webapp and the scripts |
| Build | `npm run build` | the site builds; every module and every path, video, practice and design-lab page is written; internal links that point nowhere are listed |
| Size | `npm run check:bundle` | the first page and each heavy screen stay under the budgets in `site.config.json` |
| Addresses | `npm run check:urls` | every one of the 837 addresses published before the revamp still answers, with its own canonical and no new `noindex`; redirects are permanent and lead somewhere that answers |
| Browser | `npm run test:e2e` | the built site in a real browser, against the real API: flows, accessibility audit and responsive audit |

## Numbers

- **Unit and API tests: 501.** The API tests are the security boundary: `access.test.js` lists the public routes and fails when any other route answers a
  visitor, or when an admin route answers a non-admin; `practice.test.js` (quizzes never give answers away before a try, submissions are private until
  shared, feedback rules, weak areas), `blogs.test.js` (who may write what, kinds, versions, rejection reasons), `ownposts.test.js` (own edit and delete),
  `content.test.js` (the admin editor refuses what is not a lesson or a valid practice file), `siteContent.test.js` (the three site files: the allow-list, the checks against the module list, committing, a 409 conflict), `popular.test.js`, `migrations.test.js` (each migration twice).
- **The private workspace** (`workspace.test.js`, `workspaceRevision.test.js`, `webapp/src/lib/workspace/*.test.js`, `tests/e2e/workspace.e2e.mjs`): every route
  refuses a visitor and treats another person's page as not found; folders, plans and diagrams are rebuilt from an allow-list and size-limited; the
  plan's tick on a lesson is the lesson's own progress (one truth, tested as a pure function and in the browser); revision lists order by what is most overdue;
  copying a page into an article draft makes a draft and publishes nothing; account deletion removes all of it. The counts here were taken before these were added.
- **Browser tests: 149**, in `tests/e2e/`: `site` (modules, landing page, videos, search), `account` (sign in, progress, bookmarks, notes, admin), `design`
  (the style guide, the rail), `community`, `comments`, `blog`, `studio` (the editor, publishing, history, the assistant), `site-admin` (the admin's paths, videos and search-title editors), `practice` (quizzes, the design
  workspace, My Learning, paths, notices, admin review, the content editor, the real pages crawlers get, reading options, the module tree from the keyboard)
  and `audit` (every screen: every control has a name, no id is shared, nothing overflows at any width from 360 to 1920 px).
- **Diagrams:** `npm run check:diagrams` draws every Mermaid diagram in the lessons and in the design-challenge references (47 at the time of writing).

## Where it runs

On Windows (the developer's machine) and on Linux with Node 22 and Chromium, which is what CI uses. They differ in ways that matter: fonts (a test that
clicks the middle of a box can land past the end of its text), `localhost` resolving to one of two addresses, and speed. A test that passes on one and
fails on the other is a bug in the test, and has so far always been found by running the suite on Linux. A container that mirrors the CI steps is
described in `docs/LOCAL-SETUP.md`.

## Not covered by a machine

- A **screen-reader pass** has not been done by a person. The audit checks names, labels, landmarks, duplicate ids, positive tabindex and keyboard reachability
  inside `aria-hidden`; it cannot hear.
- **Lighthouse** is run by hand, not in CI: `npm run lighthouse` over a running preview. On 2026-11-03, mobile emulation, six pages (home, a module, a learning
  path, a quiz, a design challenge, the videos page): **accessibility 100, SEO 100, best practices 96** on every page (the 4 points are the preview's missing
  API, not the site), **performance 82 to 90** (the largest contentful paint, about 3.3 to 3.9 s, is the throttled simulation of a page drawn by script, and
  is the number to compare between runs). What the runs found and fixed: the search button had no name at phone width; the landing page's five "Start" links
  said nothing about where they went; the module page drew some 8,700 elements (every closed track of the tree) and now draws about 1,300, cutting blocking
  time from 290 to 80 ms; the first video thumbnails were lazy-loaded. Real-device testing is not part of CI either.
- The quizzes' and challenges' *facts* are checked by a reader, not a test: the drafts for 2.0 came with lists of statements to double-check.
