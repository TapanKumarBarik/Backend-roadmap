# Site audit: "good, but confusing, and the interlinking"

Date: 2026-11-21. Audited from the outside: the live site (https://backendroadmap.com) opened as a first-time visitor and as a
returning one, at 1440 px and 390 px, plus a crawl of every page in `dist/` (1,561 prerendered pages, 1,557 in the sitemap).
Not covered: signed-in screens (Community content, My Learning with data, Workspace, Admin), accessibility, speed, and the
text of the lessons themselves.

## What is solid

- 0 broken internal links across 1,561 pages. Every sitemap URL has at least one inbound link (no orphans).
- Every lesson has previous/next, breadcrumbs, a table of contents, a "Part of the X path · 3 of 10" badge, and a
  "Practise this" block that links to quizzes, interview sets and code problems when any exist.
- All 16 tool pages link to at least one lesson, and the tracker, videos and study-packs pages link into the lessons.
- Reading never needs an account, and the corrections/about pages are easy to find.

So the site is not broken. The confusion comes from **too many front doors that say different things**, and from
**lessons that only link along their own track**.

## A. Why it feels confusing

**A1. The same choice is offered on four different screens, with different words.**
The set of paths appears on: the landing page (first visit), "Pick a path" (what `/` shows on every later visit), Explore
(`/paths/`), and `Switch path`. Buttons say "Start this track", "Start this path", "Follow this path". The word *path*,
*track*, *curriculum*, *area*, *library* and *route* all name overlapping things. *Track* means two things:
a flagship route ("The 4 Flagship Tracks", "Start this track") and a folder of modules ("Track 01: Core Fundamentals",
"175 modules · 17 tracks", "Part of the Production Core path … 5 tracks").

**A2. Numbers on the home page contradict themselves** (hard-coded in `webapp/src/config/landing.js`):
- "The 4 Flagship Tracks" is followed by **6** cards.
- "…instead of a 400-module wall" while the hero says **1,059** modules.
- "The 4 Milestones" box lists **8** rows (4 routes + 4 milestones).
- Explore's heading is "Explore Backend Engineering" although the library has 7 areas (ML, GenAI, Linux to Cloud, LLD…).

**A3. Ten destinations, plus two daily buttons, before reading anything.** Top bar: Learn, Explore, Practice, Community,
My Learning, then Search, progress, Today, Daily Incident, Sign in, theme, more. Left rail: Videos, Prep tracker, Lab,
Packs, Blogs. On a phone the
bottom bar is Curriculum, Explore, Videos, Blogs, More, and **Practice is behind More**. "Learn" on desktop is
"Curriculum" on the phone.

**A4. "What should I do now?" has five answers:** Today (top bar), Daily Incident (top bar and a banner above the
tracks on the home page), Today's drill, Problem of the day, Review / Find your level / Mock interview. All are good;
none says which one to pick first.

**A5. Three of the five main destinations have no real address.** Explore, Community and My Learning are
`/#__explore`, `/#__community`, `/#__me`. They share the home page's browser title, cannot be indexed, and the comment in
`MainNav.jsx` ("they have real addresses") is no longer true for them. Explore *does* have a real address (`/paths/`) that
the nav does not use.

**A6. Names that do not match what is inside.**
- "Network Lab" / "Lab" holds 16 tools, and most are not networking (SQL optimizer, Raft, Kafka event streaming,
  incident debugger, LLD studio, estimator).
- The area "Linux to Cloud" lives at `/learn/…`, and "Learn" is also the first nav item.
- "System Design Interview Prep" (area), "System Design Interview Practice" (Backend track 14), "Interview prep tracker",
  Practice → "Interview prep" and LLD "Interview questions" are five interview surfaces.

## B. Interlinking

**B1. About two thirds of lessons link only inside their own track** (694 of 1,035 lessons classified). Links from a lesson to
a lesson in another area: Backend 1 of 175, LLD 0, ML 2, Neural Networks 8, System Design 7.

**B2. The overlapping tracks do not know about each other** (pages linking across, either direction):

| Topic | One side | Other side | Links |
|---|---|---|---|
| Security | backend/09 security deep dive | learn/11 security deep dive | 0 → 2 |
| Observability | backend/08 | learn/12 | 0 / 0 |
| Kafka and messaging | backend/17 | learn/15 | 0 / 0 |
| Databases | backend/04 | learn/14 | 0 / 0 |
| Networking | system-design/02 | learn/04 | 0 / 0 |
| System design | backend/14 interview practice | system-design area | 0 → 2 |
| Distributed systems | backend/10 | system-design area | 0 / 0 |
| DevOps / CI | backend/13 | learn/10 | 0 / 0 |
| ML ↔ GenAI | ml | genai | 0 / 0 |

**B3. Lessons never point to the tools.** 0 of ~1,000 lesson texts link to a tool, and the "Practise this" block has no
"Try it" kind. The tool pages do link to lessons, so the link only goes one way (a few, e.g. WebSocket scaling and Bloom
filter, link only to the generic networking track rather than the matching lesson).

**B4. Practice is attached to about 1 lesson in 10.** Modules with any quiz, exercise, interview set or code problem tied
to them: 109 of 1,059 (Backend 55, GenAI 19, LLD 13, Linux to Cloud 9 of 239, ML 7 of 109, Neural Networks 2 of 68).
14 of 49 interview sets are not tied to any lesson.

**B5. 92 pages show a file name as link text.** For example the "Next Steps" link on
`/backend/05-caching-and-performance/02-cache-eviction-and-invalidation/` reads `../03-multi-level-caching/README.md`.
(65 Backend, 21 Linux to Cloud, 4 LLD, 2 System Design.) Fixable at render time without touching the lesson text.

**B6. Search does not rescue it** (the earlier "latency" question): Ctrl+K finds lesson text but lists title matches first
and then the first 20 content hits alphabetically; Practice, Videos and Paths search titles only.

## C. Recommended order

| # | Change | Kind | Size |
|---|---|---|---|
| 1 | Fix the home numbers and Explore heading (A2) | copy in `landing.js`, `PathExplorer.jsx` | small |
| 2 | One vocabulary: *path* = route with a finish line, *track* only for folders; same button words everywhere (A1) | copy | small |
| 3 | Real addresses and page titles for Explore, Community, My Learning (A5) | routing | small to medium |
| 4 | Render link text from the target's title when it is a file path (B5) | render code, no lesson edits | small |
| 5 | "Try it" tools in the lesson's "Practise this" block, from a small tool → lessons map (B3) | data file + render | medium |
| 6 | "See also" between the nine overlapping topic pairs, shown on lessons and track overviews (B2) | curated data file + render | medium |
| 7 | One front door: decide what `/` shows, what "Learn" means, keep Explore as the single catalogue (A1) | **decision for the owner**, then code | medium |
| 8 | Practice coverage: tie the 14 loose interview sets and add sets for ML / Neural Networks / Linux to Cloud (B4) | content | large |
| 9 | Search relevance and wider scope (B6) | code | medium |

Items 1–4 do not touch lesson text. Items 5 and 6 add data and render it; they do not edit lessons either.

## D. Limits of this audit

It was done by the same assistant that built much of the site, from outside views (live pages and a crawl), not by an
unrelated reviewer. The findings are measurable and reproducible, but they do not replace watching two or three new
visitors try to find "something about caching" and say out loud where they got lost.
