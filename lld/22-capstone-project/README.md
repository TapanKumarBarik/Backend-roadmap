# Module 22: Capstone Project

## Why this matters

Every module up to this point handed you a scoped problem, a class
diagram, and — for modules 12–18 — a full working solution. This
module hands you none of that. The entire point of a capstone is to
find out what you can actually do without a scaffold: pick a domain,
run module 11's requirements-to-class-diagram method on it yourself,
apply the patterns and principles from modules 04–10 where they
genuinely fit (not because a checklist told you to), and build it in
both languages. No solution is given here, and none will be — this
module *is* the open-ended integration test the rest of the track has
been preparing you for.

## The brief

Pick **one** domain you have not already built in this track. Some
options, roughly ordered by scope (pick one that fits the time you can
actually give it — a real capstone finished end to end beats an
ambitious one left half-built):

- **A gym/fitness-class booking system** — members, trainers, classes
  with capacity limits, waitlists, recurring schedules.
- **A food-delivery platform** — restaurants, menus, orders,
  delivery-driver assignment, order status tracking.
- **A hotel booking system** — rooms, rate plans, date-ranged
  availability, concurrent booking safety (rhymes with module 16, but
  date ranges instead of fixed showtimes — a genuinely different
  problem, not a reskin).
- **A URL shortener with analytics** — short-code generation, redirect
  handling, click tracking, expiry.
- **A multi-tenant task-tracking tool** (a small Jira/Trello) —
  boards, tasks, assignees, status workflows, activity history.
- **Something from your own work or interests** — the only requirement
  is that it's a domain you haven't already fully solved in this
  track, and that it's genuinely yours to scope, not copied from a
  tutorial.

## What your solution must demonstrate

This is the checklist a self-review (or a real interview) would hold
you to. Unlike earlier modules, nothing here is pre-solved — you
decide *how* each requirement gets satisfied.

- **The full method, run by you**: stated requirements (functional,
  non-functional, named assumptions), identified actors/entities and
  relationships, a class diagram, then implementation — module 11's
  seven steps, applied to a problem you scoped yourself.
- **At least three design patterns from modules 06–09**, each used
  because it solves a real problem in *your* design, with a one-line
  justification for each (not "because I was told to use five
  patterns" — a forced pattern is itself the God Object/YAGNI mistake
  from modules 05 and 20, just applied to patterns instead of classes).
- **At least one genuinely concurrency-sensitive piece of shared
  state**, protected the way modules 12, 16, and 17 taught — a lock
  fully encapsulated inside the class that owns the state, never
  exposed to callers.
- **At least one dependency injected against an abstraction** (module
  04's DIP, module 19's DI) — something in your design should be
  swappable (a notification channel, a pricing rule, a storage
  backend) without editing the class that depends on it.
- **A deliberate absence of at least two anti-patterns from module
  20** — a short note explaining a point in your design where a God
  Object, an anemic model, a train-wreck chain, or primitive obsession
  would have been the easy path, and what you did instead.
- **Both languages**, to the same standard as every earlier module —
  if you can only build it in one, the design likely isn't as
  language-independent as it looks.
- **At least one named simplification**, stated explicitly (module 11
  step 1's discipline, module 21's interview framing) — every real
  system leaves something out on purpose; say what and why.

## Deliverables

- A `README.md` for your capstone (in whatever location makes sense
  for how you're tracking this work) covering: requirements and
  assumptions, a class diagram, both language implementations
  (tabbed, matching this track's convention), and a short tradeoffs/
  extensions section.
- Working code in both Python and C# that actually runs — verify it
  yourself the way this track's own modules were verified: run it, or
  a short script exercising its main flows, and confirm the output
  matches what you claim.
- A one-paragraph retrospective: what took longer than expected, what
  you'd redesign with hindsight, and which earlier module's lesson you
  reached for most.

## Self-assessment

Before considering this done, check honestly:

- Could someone unfamiliar with your domain read your requirements
  section and understand what you're building and why, in under two
  minutes?
- If you added a plausible new feature tomorrow, is there an obvious
  seam to extend into (an interface to implement, a strategy to add) —
  or would it mean editing a class that already does too much?
- Did you *say* why each pattern is there, or just use it because it
  was available? (If you can't justify one in a sentence, it may not
  need to be there — YAGNI, module 05.)
- Does the concurrency-sensitive piece actually get exercised by a
  test that could fail if the lock were removed — not just code that
  looks thread-safe?

## Next

[23-supply-chain-platform](../23-supply-chain-platform/README.md)
— a second, differently-themed capstone: the same open-ended
integration test, applied end to end to one specific, meaty domain
(inventory, warehouses, suppliers, shipments) instead of a domain of
your own choosing.
