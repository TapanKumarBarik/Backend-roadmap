# Topic guides and animated scenes

A **topic guide** answers "I want to learn X: what do I need first, and in what order?". `/topics/` lists them, `/topics/<id>/` is one guide:
what to know first (with a "learning order" such as *Linux → Networking → Docker → Kubernetes*), the lessons in stages with the reader's own progress,
the practice that goes with them, the lab tools, and where to go next. A guide can show an **animated scene**: a step-through picture of the idea.

The guides are data, so adding one is writing JSON, not code. Everything they name must exist, and `npm run check` says what does not.

| What | File | Checked by |
|---|---|---|
| The guides | [`content/topics.json`](../content/topics.json) | `npm run check:topics` (rules: `webapp/src/lib/siteContent/topics.js`) |
| The scenes | `content/scenes/<id>.json` | `npm run check:scenes` (rules: `webapp/src/lib/siteContent/scenes.js`) |
| The screens | `components/topics/TopicsView.jsx`, `SceneStage.jsx` | `tests/e2e/topics.e2e.mjs`, `tests/e2e/audit.e2e.mjs` |
| The pages search engines read | `scripts/lib/listingPages.mjs` (written by `scripts/build/prerender.mjs`) | `scripts/lib/listingPages.test.mjs` |

## Adding a guide

Add an object to `topics` in `content/topics.json`:

```json
{
  "id": "redis",                       // the address: /topics/redis/ (lower case, numbers, hyphens)
  "title": "Redis",                    // "short" (optional, up to 24 characters) is the name on the landing page
  "summary": "One line, 30 to 155 characters: it is also the search-result description.",
  "why": "One line on why it matters.",
  "level": "beginner",                 // beginner | intermediate | advanced
  "prerequisites": [
    { "topic": "docker", "need": "required", "know": ["What the reader should be able to do"] },
    { "lesson": "backend/05-caching-and-performance/00-caching-fundamentals/README.md", "need": "helpful", "know": ["..."] }
  ],
  "stages": [ { "title": "Start", "lessons": ["learn/.../README.md"] } ],   // 1 to 12 written lessons a stage; a lesson once per guide
  "practice": { "quizzes": ["slug"], "interview": ["slug"], "code": ["slug"], "exercises": ["slug"] },   // optional; the slugs of content/practice
  "tools": ["caching-strategies"],     // optional; ids of the Network Lab tools (webapp/src/config/lessonTools.js)
  "scene": "caching",                  // optional; a file in content/scenes
  "deeper": ["system-design/02-networking-from-zero/README.md"],   // optional; any page of the site
  "next": ["kubernetes"]               // optional; other guides
}
```

The rules the checker enforces: ids are unique; every lesson is a **written** lesson (not a placeholder, not a track overview); every quiz, problem, tool,
scene and guide named exists; a lesson is in a guide once; and the prerequisites form a route (no guide needs itself, however indirectly). The order of
the guides in the file is the order of the list.

**Be honest about what is there.** A guide is only as good as the lessons it names. If a topic has one thin lesson, say what it is in the `summary`
(the Python refresher does) rather than promising a course.

## Adding a scene

A scene is a story told in steps over a fixed picture: which **parts** are on stage, what **moves** between them, and which **numbers** change. A number set
in one step stays until a later step sets it again, so a step only says what is new.

```json
{
  "id": "caching", "title": "...", "caption": "Illustrative numbers: ...",       // the caption must say the numbers are illustrations
  "nodes":   [ { "id": "app", "label": "App server", "icon": "server", "x": 47, "y": 70 } ],   // x 8-92 and y 10-90, in percent; icons: SCENE_ICONS
  "metrics": [ { "id": "latency", "label": "Average read time", "unit": " ms" } ],             // 1 to 4 tiles
  "steps": [
    {
      "title": "...", "short": "Name on the rail", "show": ["users", "app"],   // `show` lists the parts on stage; leave it out to keep the last step's
      "text": "30 to 420 characters.", "idea": "The key idea, one line.",
      "flows": [ { "from": "users", "to": "app", "kind": "request", "label": "GET /product/42" } ],   // kinds: request response hit miss stale write event
      "set": { "latency": 20 }                                                                         // a number, or a short word such as "stale"
    }
  ]
}
```

A flow may only join two parts that are on stage in that step, and `set` may only name a number that has a tile. **Numbers are illustrations:** say what
you assumed (the caching scene states 1 ms for a cache read and 20 ms for a database read, and its arithmetic follows from that). Never present an invented
figure as a measurement. The player is `components/topics/SceneStage.jsx`: steps by buttons, the rail or the keyboard (← → R Space), and for anyone who asks
for reduced motion nothing moves and every flow is a drawn arrow with its label.

## Practice exercises in the style of "write a class"

The Practice Center's coding problems run in the browser (`docs/PRACTICE.md`). The OOP set (`topic: oop-and-classes`: Movie Ticket Booking, Bank Account,
Student Report Card, Shopping Cart, Library Lending, Shapes) was written with `python scripts/dev/code-problem-builder.py`; the statement fixes the exact
text a method prints, because a test may only expect what the statement says. Add the next one the same way, and give it a `module` (the lesson it
practises) so the lesson's "Practise this" block links to it.
