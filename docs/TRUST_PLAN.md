# Trust plan: making the content something a reader can rely on

Written 2026-11-10. This is a plan, not a rewrite: **no lesson text is changed by this plan.** The author (you) corrects and approves content; the code
side (a "reviewed" mark on a page, an author page, a corrections route) is mine. Why it matters is in [PRODUCT_ANALYSIS.md](PRODUCT_ANALYSIS.md) (gap 5):
people preparing for an interview are paying, in time now and money later, to not be wrong in front of an interviewer. One confidently wrong page costs
more than ten missing ones.

## 1. The wrong GenAI lesson

`content/genai/02-transformer-architecture/04-queries-keys-and-values/README.md` says that when the queries and keys are the same vectors, a token's score
against itself is "mathematically guaranteed" to be the largest in its row, and cites Cauchy-Schwarz.

**What is wrong.** Cauchy-Schwarz says `x . y <= |x| * |y|`. A token's self-score is `x . x = |x|^2`. So `x . y <= x . x` only follows when `|y| <= |x|`. A
longer vector can score higher against `x` than `x` does against itself (`x = (1, 0)`, `y = (5, 0)`: `x . x = 1`, `x . y = 5`). It tends to hold when the
vectors have similar lengths, which is what the lesson's own experiment uses, so the experiment's result is true and the "guarantee" is not.

**Where the claim is made** (line numbers at 2026-11-10; they will move if you edit): 12 ("mathematically provable"), 38 to 42 (the argument), 71
("guarantee of using the same vector"), 99 to 102 ("the mathematical guarantee is gone"), 136 to 142 (the summary table), 155 to 176 (Exercise 2 and
its reflection), 184, 200 to 211 (the common mistakes), 217 to 242 (the check questions and their answers).

**A correct claim that keeps the lesson's point:** with `Q = K = X` the score matrix `X X^T` is symmetric, so token `i` attends to token `j` exactly as
much as `j` to `i`, and the diagonal (self-similarity) is `|x|^2`, which is large when vectors are large. With separate `Wq` and `Wk` the matrix is no
longer symmetric, so the model can learn directional relations ("a verb looks at its subject", not the reverse). That is the real reason for separate
projections, and it is true without any inequality. The quiz question on this lesson was already reworded to say "tends to dominate" (quiz `tokens-attention-transformers`; see CONTENT_REVIEW.md).

**Who and how long:** you; about 45 minutes. After the edit, the exercise's code and its printed numbers should be re-run.

## 2. Facts in the practice content that no person has checked

From [revamp/CONTENT_REVIEW.md](revamp/CONTENT_REVIEW.md), the claims that rest on something other than the lesson text. Each has where it is, what to
check against, and the answer to record. Tick them off in this table.

| # | Claim | Where | Check against | Effort |
|---|---|---|---|---|
| 1 | A service endpoint versus a private endpoint; `allow-forwarded-traffic` and `--use-remote-gateways` for hub-firewall forwarding | quiz `azure-vnet-peering-and-private-endpoints` | Microsoft Learn: virtual network peering, and private endpoint pages | 30 min |
| 2 | `max_tool_calls` limits only built-in tools in the OpenAI Responses API | quiz `prompting-and-tool-calling` | OpenAI API reference for the Responses API, today | 15 min |
| 3 | Default versus user-defined bridge networks in Docker: name resolution works only on user-defined ones | quiz `docker-images-containers-and-volumes` | Docker docs: networking, bridge drivers | 15 min |
| 4 | Rule-of-thumb capacity figures: about 100k ops/s per Redis node, 100k connections per gateway, a 3 Mbps average stream, 20 CPU-minutes per transcode | design challenge reference solutions | Redis benchmarks page, a gateway vendor's limits, a streaming-bitrate source. They are labelled "assumptions"; confirm the label is on each | 45 min |
| 5 | The EXPLAIN exercise's sequential-scan costs (synthetic) | exercise `debug-slow-query-with-explain` | Run it once on a real PostgreSQL with 20M rows, or state "illustrative numbers" on the page | 60 min |
| 6 | The elevator is "out of service between stops" (a design choice, not a standard) | design challenge `elevator-system` | Reword as a choice, or keep | 5 min |
| 7 | The e-commerce checkout creates the order PENDING before reserving stock | design challenge `ecommerce-platform` | Decide which order you teach; the saga text matches the current one | 15 min |
| 8 | PostgreSQL facts in the interview answers: read committed default, repeatable read as snapshot isolation, `FOR UPDATE SKIP LOCKED`, 412 on `If-Match`, RFC 9457, 422 versus 400 | interview sets | PostgreSQL docs; the RFCs | 45 min |

About 4 hours in all. Record the result in `docs/revamp/CONTENT_REVIEW.md`, and when a person has checked an item, the content file gets its `reviewed` field
(see section 4).

## 3. The author page

A page at `/about/` (a real, built address, in the sitemap) that answers the question a stranger asks before trusting a lesson or paying: who writes this,
and why should I believe them. It also gives search engines a `Person` record, which helps the lessons' author data.

**What I build** (code, no invented facts): the route and page, the `Person` structured data, a link in the footer and on each lesson ("Written by"), and a
configuration block in `site.config.json` for the facts below so nothing is hard-coded.

**What only you can supply** (I will not write a biography):
1. Your name as you want it shown, and a photo (any size; I will resize).
2. Two or three sentences: what you do, for how long, and what you have built or run.
3. The reason this site exists, in your words, in a few lines.
4. Links you want shown (LinkedIn, GitHub, YouTube are already in the config).
5. How you want AI assistance described, if at all (section 5).
6. A contact line for corrections.

## 4. A "reviewed" mark on a page

An author-controlled field, so a reader (and a search engine) can see that a person checked the page.

- **Where it lives:** a line at the top of a lesson's README (for example `> [!reviewed] 2026-11-12`) or a small registry file (`content/reviews.json`:
  lesson key to date and note). The registry is better: it needs no edit to lesson text, which is yours, and it can be filled in from a spreadsheet.
- **What it shows:** "Reviewed by the author on 12 Nov 2026" under the title, and `dateModified`/`reviewedBy` in the page's structured data.
- **Unreviewed pages** show nothing, not a warning: a page with no mark is simply not yet marked.
- **The same registry** feeds the Practice content (a quiz or challenge checked against its sources).
- **Admin screen:** a table of lessons with a "mark reviewed today" button, committing to the registry the way the other admin editors do.

**What I build:** the registry, the check, the display, the structured data and the admin screen. **What you do:** decide what "reviewed" means for you
(read once, ran the code, checked each claim) and write it once, on the about page.

## 5. How to describe AI assistance

The lessons, quizzes and reference solutions were drafted with AI help and a second AI read. Readers and search engines increasingly ask. It is your
decision what to say; the options:

- **Say it plainly** ("Drafted with AI assistance, reviewed and corrected by the author"), once, on the about page and in the footer. Honest, and it
  makes the "reviewed" mark mean something.
- **Say nothing** and only mark what is reviewed. Legal in most places; it is exposed if someone asks.
- **Say it per page** (a small note on unreviewed pages). Most honest, noisiest.

My recommendation is the first: it costs nothing and turns the weakness into the reason the "reviewed" mark exists.

## 6. A way for a reader to correct a page, and for you to show you did

Today the lesson page has "Found a mistake ... Tell me", which opens an email. That is private, so nobody sees that corrections happen.

- **A public corrections log** at `/corrections/`: date, page, what was wrong, what changed. Short entries, newest first, written by you (or from the commit
  message of a content fix). I build the page and the data file; you write the entries.
- **The mail link stays**, and the page says how quickly you reply.

## 7. The order to do it in

1. Fix the wrong GenAI lesson (section 1). You: 45 minutes.
2. Give me the author-page facts (section 3). You: 20 minutes; me: build.
3. Decide the AI wording (section 5). You: 5 minutes.
4. I build the registry, the "reviewed" display and the admin screen (section 4), and the corrections page (section 6).
5. Work down the table in section 2. You: about 4 hours, spread over a week; each item you tick gets its mark.
6. Review the system design course, lesson by lesson, since it is the product (33 lessons now, growing): read once, run the code, mark. This is the
   long job; 20 to 30 minutes a lesson, so a day and a half for what exists. Start with the lessons that have the most views, which the admin page
   already lists.

Nothing here blocks a push. It blocks charging: do sections 1 to 4 before any paid feature.
