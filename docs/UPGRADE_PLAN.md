# Backend Roadmap upgrade plan

**North star:** Interview-ready judgment you can *do* — not a prettier library, and not a clone of [Designed to Scale](https://designedtoscale.app/).

**Hard rule:** **Never compromise content quality.** UI, motion, and “cool” ship only when the lesson still passes the quality bar. A thin animated shell with weak text is a failure.

---

## What Designed to Scale does well (steal the *job*, not the skin)

| Their strength | Steal as |
| :--- | :--- |
| One pressure question per lesson (“traffic doubled…”) | Challenge line at top of flagship lessons |
| Step-through diagram + live metrics | Expand our **scenes** (we already have `SceneStage` + JSON) |
| Tight 40-lesson focus | Flagship **paths** with finish lines; don’t force the whole library into one tour |
| Replay / Next | Scene controls we already have — put them **in** lessons, not only topic pages |

## What we will do *better* (our unfair advantages)

Designed to Scale is HLD animation + metrics. We already have more surface area — use it:

1. **HLD + LLD in one product** — animate the system *and* the class design (scenes + LLD Studio + polyglot code).
2. **Judged practice** — quizzes, runnable Python, design challenges, mock interviews (they stop at “watch the diagram”).
3. **Depth when it earns it** — war stories, contracts, concurrency — without academic filler.
4. **Tools as labs** — rate limiter, Raft, SQL optimizer, incident debugger wired as “Try it” from lessons.
5. **Videos + notes** — watch, read, step the scene, then practice — one module, four modes.

**Product promise (not a tagline clone):**  
*Pressure → design → code → prove it.*

---

## Non‑negotiable content bar

### System Design
Existing 16-point rubric + tracker (`docs/curriculum-rewrite-tracker.md`). Keep completing networking modules; do not “shorten for UI.”

### LLD
12-point interview-coach rubric (`docs/lld-quality-rubric.md`) + tracker (`docs/lld-rewrite-tracker.md`).

A module is **done** only when all 12 points pass. Cuts allowed: marketing fluff, useless formalisms. **Not allowed:** removing interview Q&A, working code, UML/mental model, or the spoken 2‑minute answer to make the page “lighter.”

### Site-wide content hygiene
- Clarity UX (vocab, link titles, Try it / See also) never replaces rewriting bad lessons.
- Placeholders stay marked; never publish empty “cool” shells.

---

## Workstreams (parallel tracks, quality gate on content)

```text
Track A — Content (priority)     Track B — Clarity UX        Track C — Cool UI
─────────────────────────────    ─────────────────────       ─────────────────
LLD Wave 1 one-by-one            Vocab / routes / links      Tokens + landing
SD networking continue           Try-it / See also           Scenes in lessons
Practice ties to Wave 1          Search relevance            Reading chrome
                                 ↓                           Every-page polish
                          GATE: content for that surface is Wave-1 quality
                          before we call the surface “done”
```

**Order of truth:** A before C for any lesson surface. B can ship anytime (no lesson text loss).

---

## Track A — Content (one by one)

### LLD Wave 1 (interview core)
| # | Module | Status |
|---:| :--- | :---: |
| 1 | `04` SOLID | 🟢 |
| 2 | `05` Core principles | 🟢 |
| 3 | `06` Creational | 🟢 |
| 4 | `07` Structural | 🟢 |
| 5 | `08` Behavioral I | 🟢 |
| 6 | `09` Behavioral II | 🟢 |
| 7 | `12` Parking Lot & Elevator (+ scene) | 🟡 |
| 8 | `15` Splitwise | 🟡 |
| 9 | `18` Cache & Rate Limiter (+ tool link) | 🟡 |
| 10 | `21` Interview playbook | 🟡 |

Then Wave 2 → Wave 3 per tracker. **One module fully done before starting the next** unless you explicitly batch.

### System Design
Continue Phase 2 networking standardization (pending from `04-ports` onward) on the existing rubric — no shortcuts.

### Practice attachment
After each Wave 1 module: quiz and/or code problem + Studio/tool link. Coverage is part of “done,” not a later nice-to-have.

---

## Track B — Clarity (every page feels less confusing)

Already started: Explore heading, path CTAs (“Start this path”), flagship wording.

Still to do:
1. Real URLs for Explore / Community / My Learning
2. Friendly titles instead of `../foo/README.md` link text
3. One “Today” primary action on returning home
4. Lesson → tool “Try it” map
5. See-also between overlapping Backend / Learn / System Design tracks

---

## Track C — Cool UI (home + every page) — *inspired*, not copied

**Visual identity:** keep **Blueprint** ink discipline; push **motion + instruments** as the brand moment (scenes), not purple glow or DtS lookalike chrome. Amber stays for *earned* progress (streaks/XP); signal stays for *where you are / what to do next*.

### Home (first)
1. Brand-first hero: product name visible as hero signal; one challenge line; one CTA; one live mini-scene (caching or request path) — not a card dump.
2. Paths section: quieter cards, stronger hierarchy.
3. “Today / Continue” for returning readers (product analysis).

### Every page (shared chrome)
1. Top bar quieter while reading; progress + search stay.
2. Lesson header: challenge line + reading meta + Practise / Try it.
3. Scenes embeddable mid-lesson (not only topic hubs).
4. Explore / Practice / Tools: same tokens, same motion language, less “dashboard clutter.”
5. Mobile: same first-job hierarchy; no new nav destinations.

### Scene expansion (our DtS-beater)
| Scene | Where |
| :--- | :--- |
| Caching (exists) | Wire into caching lessons + home teaser |
| Request path / metrics (exists) | Home + foundations |
| Parking lot concurrency | After LLD `12` rewrite |
| Rate limiter | After LLD `18` + tool |
| Decorator / proxy chain | After LLD `07` |

**Rule:** a new scene requires a written step story + honest metrics labels (illustrative, not fake production claims).

---

## Cadence

| Session type | Deliverable |
| :--- | :--- |
| Content session | Exactly **one** Wave‑1 module to 🟢 on rubric (default) |
| Clarity session | 1–3 audit items, no lesson thinning |
| UI session | Landing **or** reading chrome **or** one new scene — not all three if content is behind |

If content queue slips, **pause UI** until Wave 1 is green.

---

## Definition of done (release checklist)

- [ ] LLD Wave 1 all 🟢  
- [ ] Each Wave 1 module has Try it + practice tie  
- [ ] Home: brand + one CTA + one scene teaser  
- [ ] Lessons can embed scenes  
- [ ] Clarity items 1–5 above  
- [ ] No module marked done with missing rubric points  

---

## Explicit non-goals

- Cloning Designed to Scale’s layout, pricing, or lesson list  
- Replacing deep lessons with animation-only pages  
- Equal polish of all 7 curricula before Wave 1 LLD is solid  
- Purple/glow “AI SaaS” restyle for coolness’ sake  

---

*Locked with product decisions in `lld-rewrite-tracker.md`. Update this file when a wave completes.*
