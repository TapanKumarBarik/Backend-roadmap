# Module 21: LLD Interview Playbook

## Why this matters

This module doesn't teach a new principle or pattern — it teaches the
meta-skill of running everything from modules 00–20 inside a real
45-minute clock, in front of someone actively evaluating you. An
interviewer isn't only grading the final design; they're grading the
*process*: did you clarify before designing, did you narrate your
tradeoffs out loud, did you manage the clock. This module packages
module 11's seven-step method into an explicit time budget and adds
the one layer that method alone doesn't teach — what to actually say,
and when.

## Concepts

### The 45-minute budget

A rough allocation, defended below, for a typical 45-minute round:

| Minutes | Phase | What happens |
|---|---|---|
| 0–5 | Clarify requirements | Module 11, step 1 — functional scope, non-functional constraints, assumptions named out loud |
| 5–10 | Identify actors and entities | Module 11, steps 2–3 |
| 10–20 | Class diagram | Module 11, steps 4–5, narrated while drawing, not drawn in silence |
| 20–35 | Core implementation | Key method signatures and the logic that matters — not full production code (see below) |
| 35–42 | Tradeoffs, extensions, and questions | Module 11, step 7 — what you'd add with more time, what you deliberately simplified |
| 42–45 | Buffer | Absorbs whichever phase ran long — every phase runs long at least once |

The single most common failure mode this budget exists to prevent:
spending 20+ minutes on requirements and the class diagram, and
running out of time to write any code at all. A rough, narrated design
finished on time beats a beautiful, silent one that isn't.

### What to say out loud, and when

An interviewer can only grade what they hear. Concrete phrases for
each phase:

- **Opening clarification**: *"Before I design anything, let me
  restate the requirements and check a couple of assumptions."*
  Then actually ask 2–3 sharp questions — not because you don't know
  the answer, but because asking shows you know which details matter.
- **Naming a pattern as you use it**: *"I'm using a Strategy here so
  the pricing rule can change without touching the rest of this
  class."* Not just applying the pattern — saying its name and the
  reason, out loud, in one sentence.
- **Naming a simplification**: *"I'm intentionally skipping check/
  checkmate detection for now — in a real system I'd add it as a query
  over the existing `validMoves()` data, without touching any piece
  class."* This is not new advice — it's the exact "named
  simplification" habit modules 12–20 use in their own Tradeoffs
  sections, explicit here as an *interview technique*, not just a
  documentation convention. Saying it out loud turns a gap in your
  design into evidence of judgment.

### Compressed code under time pressure

Every module in this track shows full, comment-and-docstring-carrying
code, because it's written to be read later. A live interview needs a
**compressed** version of the same logic — correct, but without the
ceremony — because 15 minutes doesn't fit a docstring on every method.

{{tabs}}
{{tab Python}}
```python
import threading

# STUDY VERSION — the level of detail this track's own modules use, appropriate for a README you read later
class LevelStudy:
    def __init__(self, spots: list):
        self.spots = spots
        self._lock = threading.Lock()   # encapsulated per module 10 — callers never see this

    def find_and_assign(self, vehicle) -> "object | None":
        """Find the first spot that fits `vehicle` and assign it atomically.

        Returns the assigned spot, or None if the level is full. Thread-safe:
        the check-then-assign sequence is protected by a lock owned by this
        class, so two concurrent callers can never be assigned the same spot.
        """
        with self._lock:
            for spot in self.spots:
                if spot.fits(vehicle):
                    spot.assign(vehicle)
                    return spot
        return None
```

```python
import threading

# INTERVIEW-PACED VERSION — same logic, same correctness, no docstring/comment ceremony.
# Say out loud instead: "the lock's mine, so two threads can't grab the same spot."
class Level:
    def __init__(self, spots):
        self.spots = spots
        self._lock = threading.Lock()

    def find_and_assign(self, vehicle):
        with self._lock:
            for spot in self.spots:
                if spot.fits(vehicle):
                    spot.assign(vehicle)
                    return spot
        return None
```
{{tab C#}}
```csharp
// STUDY VERSION — the level of detail this track's own modules use, appropriate for a README you read later
public class LevelStudy {
    public List<Spot> Spots;
    private readonly object _lock = new object();   // encapsulated per module 10 — callers never see this

    public LevelStudy(List<Spot> spots) { Spots = spots; }

    /// <summary>
    /// Finds the first spot that fits <paramref name="vehicle"/> and assigns it atomically.
    /// Thread-safe: the check-then-assign sequence is protected by a lock owned by this
    /// class, so two concurrent callers can never be assigned the same spot.
    /// </summary>
    public Spot FindAndAssign(object vehicle) {
        lock (_lock) {
            foreach (var spot in Spots) {
                if (spot.Fits(vehicle)) { spot.Assign(vehicle); return spot; }
            }
        }
        return null;
    }
}
```

```csharp
// INTERVIEW-PACED VERSION — same logic, same correctness, no XML-doc ceremony.
// Say out loud instead: "the lock's mine, so two threads can't grab the same spot."
public class Level {
    public List<Spot> Spots;
    private readonly object _lock = new object();
    public Level(List<Spot> spots) { Spots = spots; }

    public Spot FindAndAssign(object vehicle) {
        lock (_lock) {
            foreach (var spot in Spots) {
                if (spot.Fits(vehicle)) { spot.Assign(vehicle); return spot; }
            }
        }
        return null;
    }
}
```
{{/tabs}}

Both versions are the same design and the same correctness guarantee —
the difference is entirely presentation. In an interview, say the
sentence the comment would have contained; don't write the comment.

### Handling a mid-interview twist

Interviewers routinely add a constraint partway through — *"what if
multiple users book the same seat concurrently?"* is literally the
question modules 16 and 17 build their entire core implementation
around. The playbook move is: **don't restart.** Identify the smallest
change to the design already on the board — almost always "which class
already owns the state this twist affects, and does it need a lock
around one check-then-act sequence." Say the change out loud before
writing it: *"I'll add a lock inside `Show`, since it already owns
`bookedSeatIds` — nothing else about this design needs to change."*
A twist handled as a small, targeted addition reads as depth; a twist
that triggers a full redesign reads as a design that wasn't
well-factored to begin with.

## Hands-on exercises

### 1. Time a full run

Pick a problem from this track you haven't looked at recently (module
12's Parking Lot is a good choice) and run the full 45-minute budget
above with a real timer, narrating out loud even alone. Note which
phase actually ran long — it's rarely the one you'd predict.

### 2. Practice the named-simplification phrase

Pick three different constraints you'd realistically skip in a
Tic-Tac-Toe variant (network multiplayer, replay history, an AI
opponent) and say the named-simplification sentence for each out loud,
in under 10 seconds per one.

### 3. Handle a twist without restarting

Take this track's Vending Machine (module 13) design and practice
narrating the smallest change for the twist "now support multiple
currencies" — identify which class the change belongs to before
describing what changes inside it.

### 4. Run a mock interview

Narrate a full design for module 18's LRU Cache to a study partner (or
record yourself), then compare against the checklist implicit in this
module's phases: did you clarify first, name any patterns/
simplifications out loud, and finish with time for tradeoffs?

### 5. Write your own opening script

Pick a system you haven't designed in this track (a food-delivery app
works well) and write — then time — your own 60-second requirements-
clarification opening for it.

## Independent challenge

No code given.

**Task:** Run one complete, timed, 45-minute mock interview on a
problem **not covered anywhere in this track** (a hotel booking
system, a URL shortener, a food-delivery app) applying every phase of
this module's budget. Afterward, write a short retrospective: which
phase went over budget, what you'd say differently next time, and
whether you named at least one simplification out loud rather than
silently avoiding a hard part of the problem.

<details>
<summary>Hint</summary>

Pick a problem structurally similar to one you've already solved in
this track — a URL shortener rhymes with the LRU cache (module 18: a
capacity-bounded lookup structure) plus a hash-generation strategy
(module 08); a hotel booking system rhymes with Movie Ticket Booking
(module 16: date-ranged resource booking with concurrency-safe
reservation). Recognizing the rhyme *during* the interview, and saying
so, is itself a demonstration of the pattern-matching this whole track
has been building.

</details>

## Common mistakes & troubleshooting

- **Diving into code before clarifying requirements.** This is the
  single most-watched-for mistake in an LLD round — module 11's step 1
  exists specifically because skipping it produces a design built on
  guessed assumptions that often turn out wrong.
- **Thinking silently instead of narrating.** An interviewer can only
  grade what they hear; a long silent pause reads as "stuck," even when
  you're not, because there's no way to tell the difference from
  outside.
- **Writing full production-detail code** — imports, docstrings, error
  handling for every edge case — instead of compressed, correct
  pseudocode-level signatures. This track's own modules are written at
  study-detail on purpose; the interview itself needs the compressed
  version from this module's third concept.
- **Refusing to simplify** ("I'm not sure how to handle X") instead of
  naming the simplification and moving on ("I'll assume X for now, and
  mention it as an extension at the end"). This is the single highest-
  leverage phrase in this entire module — it converts an unfinished
  part of the design into visible judgment instead of a visible gap.
- **Either ignoring scale/concurrency entirely, or over-engineering
  toward a full distributed system when a single in-memory lock
  (module 10) is what the question is actually asking for.** Match the
  depth of the answer to what was actually asked.

## Checkpoint quiz

1. What's the single most common time-budget failure in a 45-minute
   LLD interview?
2. Why does narrating a named simplification matter more *in the
   interview itself* than it does in a README written afterward?
3. When an interviewer adds a mid-interview twist, what should you
   identify first, before changing any code?
4. Why is compressed, pseudocode-level code usually more appropriate
   under time pressure than this track's own full-detail modules?
5. Beyond the final design itself, name two things an interviewer is
   also grading.

<details>
<summary>Answers</summary>

1. Spending too long on requirements gathering and the class diagram —
   often 20+ minutes — and running out of time to write any code at
   all. A rough, narrated, finished design beats a polished, silent,
   unfinished one.
2. Because in the interview, the simplification is the *only* evidence
   the interviewer has that you noticed the gap on purpose. In a
   README, a reader can infer intent from context and take their time;
   in a live round, an unstated gap and a silently-avoided hard problem
   look identical from the interviewer's side unless you say the
   sentence.
3. Which existing class already owns the state the twist affects — the
   goal is the smallest targeted addition to the current design, not a
   restart. Most twists in this track's own problems (seat booking,
   ride matching) turn out to need one lock added to one class that
   already owns the relevant state.
4. Because 45 minutes doesn't fit docstrings, full comments, and every
   edge case on every method — the study-detail version is written to
   be read later, at leisure; the interview version needs to convey the
   same correctness with far less ceremony, with the missing context
   supplied verbally instead.
5. Any two of: whether requirements were clarified before designing,
   whether reasoning was narrated rather than done silently, whether
   time was managed across phases, whether tradeoffs and
   simplifications were named explicitly rather than glossed over.

</details>

## Interview questions

These are about *process*, not code — the kind of follow-up question
that probes how you work, not just what you built.

1. **"Walk me through how you'd approach this problem before writing
   any code."**
   State the plan itself: clarify functional and non-functional
   requirements and name assumptions (module 11, step 1), identify
   actors and entities, sketch a class diagram narrated out loud, then
   implement core logic at a compressed level of detail — describing
   the process is itself part of the answer.
2. **"Why did you spend time asking questions instead of just starting
   to design?"**
   Because a design built on guessed assumptions frequently turns out
   to solve the wrong problem — a few minutes of clarification is
   cheap insurance against redesigning under worse time pressure later
   in the round.
3. **"You mentioned you were simplifying X — why, and what would you
   do differently with more time?"**
   This is exactly the payoff of naming a simplification out loud in
   the first place — it invites this question instead of leaving the
   interviewer to wonder whether you noticed the gap at all. Answer
   with the concrete extension (module 11 step 7's tradeoffs
   discussion), not a vague "I'd make it more robust."
4. **"How would you extend this design if I told you it also needed
   to support [new constraint]?"**
   Identify which existing class already owns the affected state, and
   describe the smallest addition to it — the same "don't restart"
   instinct this module's fourth concept covers, demonstrated live.
5. **"How do you decide how much detail to put into your code during a
   timed round?"**
   Enough to prove the logic is correct — key method signatures, core
   control flow, the data structures actually doing the work — without
   docstrings, full error handling, or the kind of ceremony a
   published README needs but a whiteboard doesn't.

## Further reading & sources

- [11-requirements-to-class-diagrams](../11-requirements-to-class-diagrams/README.md) - the seven-step method this module puts a stopwatch on; re-read it before your first timed practice run.
- [10-concurrency-safe-design](../10-concurrency-safe-design/README.md) - revisit this before practicing mid-interview twists, since "now make it concurrent" is one of the most common twists across real LLD interviews.
- *Cracking the Coding Interview* (Gayle Laakmann McDowell) - not LLD-specific, but its interview-process advice (clarify, narrate, manage time) generalizes directly to system/object design rounds.

## Next

[22-capstone-project](../22-capstone-project/README.md)
— design and build a larger combined system end to end, with no
guidance given.
