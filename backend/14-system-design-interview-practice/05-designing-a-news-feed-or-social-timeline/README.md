# Module 05: Designing a News Feed or Social Timeline

## Why this matters

The news feed — Twitter's timeline, Instagram's feed, Facebook's home feed — is
the canonical "large-scale read system" interview problem, and it's where all the
building blocks from the previous modules finally combine into one design with a
genuinely hard core. On the surface it's simple: show a user the recent posts of
the people they follow, newest first. Underneath, it forces the single most
famous tradeoff in system design — **fan-out on write vs. fan-out on read** — and
then breaks *both* of those with **the celebrity problem** (an account with 100M
followers), which is why the real answer is always a **hybrid**.

What makes it a rite of passage is that there's no clean winning move — every
approach is a tradeoff you must reason about out loud, tied to the read:write
ratio and the follower distribution. It pulls in estimation (how many feed
writes does one celebrity post generate?), caching (the feed is a cache of
pre-computed results), partitioning (where does a user's feed live?), and
consistency (is it okay if a post shows up a few seconds late?). If you can drive
this problem cleanly, you can drive almost any read-heavy social/content system —
which is exactly why it's asked so often.

## Concepts

### Requirements and scope

**Functional:**
- A user sees a **feed**: recent posts from accounts they follow, in reverse-
  chronological (or ranked) order.
- A user can **post** (create content that lands in their followers' feeds).
- A user can **follow/unfollow** other users.
- (Often) the feed is **ranked**, not strictly chronological.

**Non-functional (these drive the whole design):**
- **Massively read-heavy.** Users scroll far more than they post — assume
  ~**100:1** read:write. Feed *reads* must be fast (<200 ms) and cheap.
- **High availability, eventual consistency is fine.** It's completely acceptable
  for a new post to appear in followers' feeds a few seconds late; nobody needs
  strong consistency on a timeline. This latitude is what makes aggressive
  caching/denormalization legal.
- **Huge scale & skewed follower distribution.** Hundreds of millions of users,
  and a *power-law* follower count — most users have hundreds of followers, a
  handful have tens of millions. That skew is the source of the celebrity problem.

### Capacity estimation (why the numbers force the design)

Assume **200M DAU**, each posting **2/day**, following ~**200** accounts, and
reading their feed ~**10×/day**.

```
posts:      200M × 2 / 10^5      = 4,000 posts/sec average  (~12,000 peak)
feed reads: 200M × 10 / 10^5     = 20,000 feed reads/sec avg (~60,000 peak)
```

The killer number is **fan-out volume**. If feeds are precomputed on write, each
post must be written into every follower's feed. Average followers ≈ 200, so:

```
feed writes (fan-out on write) = 4,000 posts/sec × 200 followers
                               = 800,000 feed-entry writes/sec average
```

That's already large — and it's the *average*. A single celebrity with 50M
followers posting once triggers **50 million** feed writes for one post. That one
number is the entire reason a naive fan-out-on-write design collapses and the
hybrid exists.

### Fan-out on write (push model)

**Precompute each user's feed when a post is created.** When someone posts, the
system immediately writes that post's id into the feed list of every follower —
so each follower has a ready-made, pre-materialized feed sitting in a cache.

- **Read path: O(1) and blazing fast.** A feed read just fetches the user's
  precomputed list from cache (recall cache-aside and hot-set sizing from
  **05-caching-and-performance** and module 04). This is why push is the default
  for a read-heavy system — reads dominate, so you optimize them.
- **Write path: expensive and bursty.** One post = one write per follower. The
  fan-out happens **asynchronously** via a message queue and worker fleet (recall
  **06-background-processing-and-realtime**) so the poster's request returns
  instantly while workers scatter the post into followers' feeds.
- **The fatal flaw: celebrities.** Fanning a celebrity's post out to 50M feeds is
  50M writes — slow, a huge queue backlog, and wasteful (many of those followers
  won't read soon). Pure push cannot handle high-fan-out accounts.

### Fan-out on read (pull model)

**Compute the feed on demand when the user opens the app.** Store each user's own
posts; at read time, look up who they follow, fetch each of those users' recent
posts, merge them by time, and return.

- **Write path: O(1) and cheap.** A post is a single write to the author's own
  post list — no fan-out at all. Celebrities cost nothing extra to post.
- **Read path: expensive.** Every feed load must gather-and-merge posts from up
  to hundreds of followed accounts — a scatter-gather that's slow and does heavy
  work on the read path, which is the *hot* path in a 100:1 read system. Doing
  this on every read at scale is brutal.
- **When it shines: exactly the celebrity case.** For an account followed by
  millions, pulling their posts at read time (once per reader who wants them) is
  far cheaper than pushing to millions of feeds. Pull is bad in general but great
  for high-fan-out authors.

### The hybrid (the actual answer) and ranking

The winning design **combines both, splitting by follower count:**

- For **normal accounts** (the vast majority, with modest follower counts), use
  **fan-out on write** — precompute followers' feeds so reads stay O(1).
- For **celebrity accounts** (above some follower threshold, e.g. >100K), do
  **not** fan out their posts. Instead, at read time, **pull** the recent posts of
  any celebrities the user follows and **merge** them into the user's mostly-
  precomputed feed.
- So a feed read = the precomputed (pushed) portion **+** a small on-demand pull
  from the handful of celebrities followed, merged. This caps the fan-out cost
  (no 50M-write storms) while keeping normal reads fast.

This split *is* the senior-signal answer: "push for the many, pull for the few,
merge at read." Layered on top:

- **Ranking.** Real feeds aren't strictly chronological — they rank by predicted
  engagement (a ranking service scores candidate posts). This adds a scoring step
  and a candidate-generation vs. ranking split, but the fan-out substrate is the
  same.
- **Feed storage.** A user's precomputed feed is a capped list (e.g. most recent
  ~1,000 post ids) in a fast store keyed by user id — partitioned by user (recall
  consistent hashing, module 04). Store *post ids*, not full posts; hydrate post
  content from a separate post store/cache at read time so a post edited once
  isn't rewritten into millions of feeds.

## Command reference

The fan-out decision — the table to have memorized cold.

| | Fan-out on write (push) | Fan-out on read (pull) |
|---|---|---|
| When post is created | write to **every follower's** feed | write once (author's list) |
| When feed is read | fetch precomputed list — **O(1), fast** | gather+merge followees' posts — **slow** |
| Write cost | high (× followers), bursty | low (O(1)) |
| Read cost | low | high (scatter-gather per read) |
| Celebrity (50M followers) | **catastrophic** (50M writes/post) | **cheap** (no fan-out) |
| Best for | normal accounts, read-heavy | high-fan-out authors, write-heavy |

**Hybrid rule:** push for accounts below a follower threshold; pull celebrities
above it; merge both at read time.

Estimation anchors (200M DAU example):

```
posts/sec        ≈ 4,000 (avg), 12,000 (peak)
feed reads/sec   ≈ 20,000 (avg), 60,000 (peak)
fan-out writes   ≈ 800,000/sec avg (push, at ~200 followers each)
one celebrity post (50M followers) = 50,000,000 feed writes  ← why hybrid exists
```

Core API and feed-read flow:

```python
@app.post("/api/v1/posts", status_code=201)
def create_post(req: CreatePost, user=Depends(current_user)):
    post_id = post_store.insert(user.id, req.text)      # 1 write (author's list)
    if follower_count(user.id) < CELEBRITY_THRESHOLD:
        fanout_queue.enqueue("fanout", post_id, user.id)  # async push to followers
    # celebrities: skip fan-out; pulled at read time
    return {"post_id": post_id}

@app.get("/api/v1/feed")
def get_feed(user=Depends(current_user), limit: int = 50):
    precomputed = feed_cache.get(user.id, limit)         # pushed portion (O(1))
    celeb_posts = pull_recent(celebrities_followed(user.id))  # pulled portion
    merged = rank_and_merge(precomputed, celeb_posts)[:limit]
    return hydrate(merged)     # turn post ids into full post objects from cache
```

Async fan-out worker (the write-path scatter):

```python
def handle_fanout(post_id, author_id):
    for follower_id in followers_of(author_id):          # batched in practice
        feed_store.prepend(follower_id, post_id, cap=1000)  # capped feed list
```

## Hands-on exercises

Written design exercises — put numbers on the fan-out and defend the tradeoffs.

### 1. Compute the fan-out bill

With 4,000 posts/sec average and an average of 200 followers, compute total
feed-entry writes/sec under pure fan-out-on-write. Then compute the one-post cost
for a celebrity with 30M followers. State, in one sentence each, why the average
is manageable and why the celebrity number is not.

### 2. Choose push vs. pull per account

For accounts with these follower counts — 150, 5,000, 250,000, 40,000,000 —
decide push or pull for each under a 100K threshold, and state the read-time
consequence for a user who follows a mix of them.

### 3. Design the hybrid read path

Write pseudocode for a feed read that merges the precomputed (pushed) feed with a
live pull of followed celebrities, ranks/merges by time, caps to 50, and
hydrates post ids into content. Note where a cache is used and why you store ids
rather than full posts.

### 4. Size the feed cache

Each user's precomputed feed holds ~1,000 post ids × 8 bytes = ~8 KB. For 200M
users, estimate total feed-cache memory and whether it fits in one node or needs
partitioning (tie back to module 04's consistent hashing). What TTL/eviction
policy fits a feed cache?

### 5. Handle the async fan-out backlog

Your fan-out workers fall behind during a traffic spike and the queue grows.
Explain what the user *sees* (and doesn't) during the lag, why eventual
consistency makes this acceptable, and two things you'd do to drain the backlog
(recall queue/worker scaling from **06-background-processing-and-realtime**).

### 6. The follow/unfollow edge cases

When a user follows a celebrity, their feed should start including that
celebrity — but the celebrity isn't fanned out. Describe how the hybrid read path
naturally handles a *new* follow without backfilling. Then describe what happens
to already-pushed entries when a user *unfollows* a normal account, and whether
you backfill or let them age out.

### 7. From chronological to ranked

You must switch from reverse-chronological to an engagement-ranked feed. Describe
the two-stage "candidate generation → ranking" split, where it sits relative to
the fan-out substrate, and why ranking doesn't change the push/pull decision.

### 8. Diagnose and fix a flawed design

Critique and fix this feed design.

> "Every time a user opens the app, we run `SELECT * FROM posts WHERE author_id
> IN (list of everyone they follow) ORDER BY created_at DESC LIMIT 50` against the
> primary Postgres. We do the same for everyone, including users who follow
> accounts with tens of millions of followers. There's no cache. Posts are stored
> with full text duplicated into each query result. We chose pure pull because
> writes are then trivial and we never have a fan-out storm."

<details>
<summary>Solution</summary>

Flaws and fixes:

1. **Pure pull on a 100:1 read-heavy system optimizes the wrong path.** The read
   path is the hot path; doing a giant `IN (...)` scatter-merge on *every* feed
   open, at ~20K–60K reads/sec, is exactly the expensive work you want to avoid.
   For normal accounts, precompute feeds (**fan-out on write**) so reads are O(1).
2. **No cache.** A read-heavy feed *is* a cache of precomputed results. Add a
   feed cache (post ids per user) and hydrate content from a post cache. Serving
   feeds from the primary DB won't scale.
3. **The `IN (list of everyone they follow)` query is a huge scatter** for users
   following hundreds of accounts, and hits the primary. At minimum it belongs on
   replicas/cache; better, it's replaced by precomputed feeds for normal authors.
4. **They avoided the fan-out storm but created a read storm** — the celebrity
   problem is real, but pure pull "solves" it by making *every* read slow, not
   just celebrity handling. The right move is **hybrid**: push normal accounts,
   pull only the few celebrities, merge at read.
5. **Duplicating full post text into every result** wastes bandwidth and memory
   and makes edits expensive. Store/emit **post ids** and hydrate from a shared
   post store/cache once.

Corrected: hybrid fan-out — async push to followers' precomputed feed caches for
sub-threshold accounts, pull-and-merge for celebrities at read time; feeds are
capped lists of post ids in a partitioned cache; content hydrated from a post
cache; eventual consistency accepted so fan-out is async.

</details>

## Independent challenge

No solution given. Design the timeline for a **short-video app** (TikTok-style)
where the feed is *not* follow-graph-based but **algorithmically ranked** from a
huge candidate pool — most content a user sees is from accounts they don't
follow. Decide how candidate generation and ranking interact with (or replace)
the fan-out models above, how you'd serve a personalized ranked feed at
<200 ms for hundreds of millions of users, and where caching and precomputation
still apply when the feed isn't a simple follow-based merge. Lean on the
partitioning/caching substrate from **04-designing-a-distributed-cache-and-key-
value-store** and the async processing from **06-background-processing-and-
realtime**.

<details>
<summary>Hint</summary>

When the feed is discovery-driven rather than follow-driven, the classic
push/pull fan-out mostly dissolves — there's no "followers to fan out to." The
hard problem shifts to **candidate generation** (cheaply narrowing a billion
videos to a few hundred plausible ones per user, often precomputed per-segment or
via embeddings/ANN retrieval) followed by a **ranking model** that scores those
candidates for this user in real time. Precomputation still applies, but to
*candidate pools* and features rather than final feeds, because the ranking is
too personalized and volatile to fully precompute. Think about what you can cache
(the candidate set, feature vectors, model outputs for a short window) versus what
must be computed per-request, and how you keep the <200 ms budget when a model
inference is in the path — this connects to the expensive-downstream reasoning
from module 03.

</details>

## Common mistakes & troubleshooting

- **Committing to pure push or pure pull.** Each has a fatal case (celebrities for
  push, read cost for pull). The answer is a **hybrid** split by follower count —
  say so explicitly.
- **Ignoring the celebrity/high-fan-out problem.** A design that fans every post
  to every follower dies on the first 50M-follower account. Handle celebrities by
  pulling, not pushing.
- **Doing fan-out synchronously.** Blocking the poster's request on writing to
  millions of feeds. Fan-out must be **async** via a queue and worker fleet.
- **Storing full posts in every feed.** Store post **ids** and hydrate content
  once from a shared cache; otherwise edits and memory explode.
- **Optimizing the write path in a read-heavy system.** With 100:1 reads, the read
  path is what must be O(1). Pure pull optimizes writes at the expense of the path
  that actually dominates.
- **Forgetting eventual consistency latitude.** Feeds don't need strong
  consistency; a few seconds of fan-out lag is fine, and that's precisely what
  lets you make fan-out async and cache aggressively.
- **Uncapped feeds.** A user's precomputed feed must be a bounded list (e.g. last
  1,000 ids) or storage grows without limit.
- **Treating ranking as a different architecture.** Ranking sits *on top of* the
  candidate substrate; it changes ordering, not the push/pull decision.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Contrast fan-out on write and fan-out on read on both the write cost and the
   read cost. Which optimizes the read path, and why does that matter in a 100:1
   read-heavy system?
2. What exactly is the celebrity problem, and why does it break pure fan-out on
   write? Put a number on it.
3. Describe the hybrid design in one or two sentences. What's the rule for
   deciding push vs. pull per account, and what does a feed read look like?
4. Why must the fan-out on the write path be asynchronous, and what component
   makes that possible?
5. Why do you store post *ids* in a user's precomputed feed rather than full post
   content, and where does the content come from at read time?
6. A new user follows a celebrity who is *not* fanned out. How does the hybrid
   read path include the celebrity's posts without any backfill?
7. Feeds tolerate eventual consistency. Name two design freedoms that latitude
   buys you.

<details>
<summary>Answers</summary>

1. **Push**: high write cost (one write per follower, bursty) but **O(1) reads**
   (fetch a precomputed list). **Pull**: O(1) writes but **expensive reads**
   (gather-and-merge followees' posts per read). Push optimizes the read path,
   which matters because in a 100:1 read-heavy system reads vastly dominate, so
   the read path must be cheap even at the cost of expensive writes.
2. An account with a huge follower count (e.g. 50M) makes a *single post* require
   fanning out to all of them — **50,000,000 feed writes for one post** — causing
   queue backlogs, slow propagation, and wasted work (most won't read soon). Pure
   push can't absorb that.
3. Push (precompute feeds) for normal accounts below a follower threshold; do
   **not** fan out celebrities above it — instead pull their recent posts at read
   time and merge into the mostly-precomputed feed. A feed read = precomputed
   pushed list **+** on-demand pull of followed celebrities, merged/ranked.
4. Because fanning a post to potentially thousands/millions of followers can't
   happen inside the poster's synchronous request without huge latency. A
   **message queue + worker fleet** (background processing) does the scatter
   asynchronously so the post returns instantly.
5. Storing ids keeps feeds tiny and means an edited or deleted post isn't
   rewritten into millions of feeds — you change it once in the post store. At
   read time you **hydrate** ids into full post objects from a shared post
   cache/store.
6. The pulled portion of the read path fetches recent posts of *all* celebrities
   the user currently follows and merges them — so following a new celebrity
   immediately includes them on the next read, with no backfill of past feed
   entries needed.
7. Any two of: fan-out can be **asynchronous** (post returns before followers'
   feeds update); feeds can be **aggressively cached/denormalized** without
   coordination; you can tolerate brief fan-out **lag/backlog** under spikes;
   replicas can serve slightly stale reads. All flow from not needing strong
   consistency on a timeline.

</details>

## Next

[06-designing-a-chat-and-notification-system](../06-designing-a-chat-and-notification-system/README.md)
— the feed was read-heavy and async-tolerant; next you'll design chat and
notifications, which flip to **real-time delivery, persistent connections, and
online presence** — websockets, message ordering, and push fan-out with hard
latency expectations. It also carries the track's **second cumulative review**,
mixing everything from modules 00–06.
