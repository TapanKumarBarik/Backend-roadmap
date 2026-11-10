# Product analysis: why people would come back daily, and what they would pay for

Written 2026-11-10 from the repository at `a9c4b80`, the live site, and public information about comparable products.
Sources are listed at the end. Prices of other products are as their own pages or recent reviews showed them on that
date; several sources disagreed, and the ranges below say so.

## The short version

1. **The site is a very large free library with a thin layer of practice on top.** A library is what people visit once
   from a search and what a chat assistant now explains for free. It is not what brings anyone back tomorrow, and nobody
   in this market pays for it.
2. **What people in this market pay for is an outcome with feedback:** passing a system design interview, having their
   answer judged, building something that is tested. Every paid competitor sells one of those; none sells reading.
3. **The site's strongest asset is the one it shows least:** 167 short system design videos (24 public today, the rest
   scheduled, about one a day until 3 December), each with a written lesson and a PDF note (236 notes). That is a
   daily release calendar and an interview-prep course that already exist.
4. **Recommendation:** stop presenting five equal curricula. Make the product "system design and backend interview
   prep you do a little of every day", keep all reading free, and charge for judged practice (AI feedback on design
   answers, mock interviews, the full question bank). Build the daily loop (one drill, a streak, an email) before
   building anything to sell.
5. **Before any of that: there is no way to reach a reader.** No email is ever sent, no notification exists. A streak
   nobody is reminded of does not bring anyone back. This is the cheapest, highest-value gap.

Two things in this document reverse earlier decisions: the 2.0 brief said "free, no paid tiers", and the repository is
licensed closed while still public on GitHub. Both are called out where they matter.

## What exists today

| | Count | Note |
|---|---|---|
| Modules | 764 listed, 600 written | 164 unwritten, all in GenAI (133 of 297 written) |
| Areas | 5 | Backend 171, Linux to Cloud 239, GenAI 133, System Design 33, Low-Level Design 24 |
| Videos | 167, 24 public | scheduled daily to 2026-12-03; every one is attached to a module |
| PDF notes | 236 | per lesson, plus phase bundles |
| Learning paths | 12 | |
| Quizzes | 24, 186 questions | cover 17 of 84 tracks |
| Exercises | 7 | a brief and deliverables; nothing checks the answer |
| Interview sets | 7, 52 questions | |
| Design challenges | 14 (7 LLD, 7 HLD) | reference solution after a submission; feedback only from other readers |
| Account features | progress, bookmarks, notes, streak, weak areas, revision lists, study plans, workspace, diagram editor | |
| Community | questions, feed, books, suggestions, articles with a writing studio | effectively empty |
| Reach | 7 GitHub stars, no email list | traffic is in Cloudflare Web Analytics, which I cannot see |

Engineering quality is high: 588 unit and 169 browser tests, a deploy gate, every published address protected. That is
not where the gaps are.

## The gaps, in order of how much they cost

### 1. There is no reason to come back today

Nothing on the site is different tomorrow from a reader's point of view. The streak is counted in the database but
nothing tells a reader it is about to end, and it is not on the first screen. There is no "today" anywhere: no drill of
the day, no "new today", no queue of things due for review. (A "Daily Incident" drill is being built in another
session right now; it is the right idea and should be the centre of the home page, not a dialog.)

What the evidence says: Duolingo reports that 84% of today's users return tomorrow and credits the streak more than
any other feature; over four years of streak work its daily churn fell by more than 40%. The causal claim comes from
the company and analysts, not a controlled study, but the mechanism is the same one LeetCode's daily problem and
Boot.dev's streaks use. All three pair the streak with a reminder. A streak without a reminder is a number.

### 2. There is no way to reach a reader

The site signs people in with Google, so it has an address for every account, and it has never sent one message. No
welcome, no "your streak ends tonight", no weekly "three new lessons". There is no newsletter sign-up for people who
do not want an account. ByteByteGo's business is built on exactly this: a free weekly newsletter (over a million
subscribers by its own count) that sells the paid tier and sponsorship. For a one-person site with seven stars, an
email list is the only audience it will own.

### 3. Practice is thin, and nothing judges an answer

This is the gap between "free library" and "something worth paying for".

- 186 quiz questions, on 17 of 84 tracks. Hello Interview advertises 5,000+ reported interview questions; AlgoMaster
  lists 55 system design problems.
- The 7 exercises and 14 design challenges are the most valuable items on the site, and the reader's work on them goes
  nowhere: a reference solution to compare against, and peer feedback from a community that does not exist yet.
- Nothing runs code. Every "runnable example" is copied to the reader's own machine.

Hello Interview's paid tier is this and almost nothing else: 45 design questions worked step by step with instant
feedback after each step, an AI tutor, and a spoken mock interview that ends in a hire or no-hire report.

### 4. Five areas, no promise

The home page offers Backend, System Design, GenAI, Linux to Cloud and Low-Level Design as equals. A visitor cannot
say in one sentence what the site is for or who it is for. "Backend roadmap" as a search belongs to roadmap.sh
(3.2 million learners by its own page). Breadth without a promise competes with roadmap.sh on its ground and with
a chat assistant on explanations, and loses to both.

The site's own data points at the answer: every video, every PDF note and the whole Design Lab are about system design
and interviews. The product has already specialised; the navigation has not.

### 5. Trust

A reader deciding whether to rely on a lesson, and later whether to pay, sees nothing that says why to trust it.

- Lessons, quizzes and reference solutions were drafted with AI. A second read found no wrong quiz answer but did find
  a lesson that states something false (`genai/02-transformer-architecture/04-queries-keys-and-values`), and
  `docs/revamp/CONTENT_REVIEW.md` still lists facts no person has checked.
- There is no author page saying who writes this and what they have built, no "last reviewed" date on a lesson, no
  visible way a correction happens.
- 164 GenAI modules are listed and unwritten. They are hidden from search, but a reader browsing the tree meets a wall
  of "Soon".

Interview candidates are paying to not be wrong in front of an interviewer. One confidently wrong page costs more than
ten missing ones.

### 6. Too many surfaces for one maintainer and no users

The community has five separate places to post (questions, feed, books, suggestions, articles), plus a writing studio,
a private workspace, study plans, revision lists and a diagram editor. Each is tested and each is empty. An empty
community reads as an abandoned one, and none of these is why someone would choose this site over another. They are
also most of the code a single person has to keep working.

### 7. The video channel and the site do not feed each other enough

The videos are the top of the funnel. The lesson page plays its video and links its PDF, which is right. What is
missing is the other direction and the calendar: a page that shows what was released today and what is coming
tomorrow, a reminder to come back for it, and a clear next action after a video (the drill for that lesson, not just
the text).

### 8. Nothing exists to charge with

No payment provider, no record of who has paid for what, no terms that cover a purchase, no refund wording, no email to
send a receipt from. The privacy page says the site is free and the 2.0 brief said no paid tiers. Charging means
changing those deliberately.

### 9. The repository is public while licensed closed

GitHub answers the repository to anyone, the licence says all rights reserved, and every lesson, quiz answer and
reference solution is in it. If answers and solutions become part of what is sold, they cannot stay in a public
repository. Either make it private or decide the content is open and sell only the service around it. (The second is a
legitimate model: AI Engineering from Scratch is MIT-licensed, free, and asks for sponsorship.)

## What the market shows

| Product | What it sells | Price seen | What stays free |
|---|---|---|---|
| Hello Interview | system design and LLD guided practice with AI feedback, AI mock interview, 5,000+ reported questions | about $47 a month, $79 to $95 a year, $319 lifetime; in India ₹3,199 a month, ₹6,299 a year, ₹21,374 lifetime | core articles and videos |
| ByteByteGo | visual system design courses (7 to 8 books' worth) | about $189 to $199 a year, $499 lifetime, often half off; no monthly plan | weekly newsletter, YouTube |
| AlgoMaster | DSA patterns, system design and LLD question banks, weekly deep dives | $29 to $39 a month, $99 a year, about $200 lifetime | much of the LLD and system design text |
| CodeCrafters | "build your own Redis, Git, SQLite" with automated tests on your code | 3-month, yearly and lifetime membership (third parties estimate about $300 a year); team seats | first stages of each challenge |
| Boot.dev | a backend course as a game: XP, streaks, quests, code checked in the browser | $49 to $59 a month, $349 to $399 a year | reading; the checking is paid |
| roadmap.sh | AI tutor, generated courses and quizzes, certificates | monthly and yearly (amount not shown to me), teams $10 a seat | all roadmaps; 20 AI chats |
| LeetCode | company-tagged questions, premium problems | $35 a month, $159 to $179 a year | most problems, the daily problem, contests |
| AI Engineering from Scratch (the site you showed) | nothing; sponsorship | free, MIT | everything: 542 lessons, quizzes, a six-volume book |

What this says:

- **Nobody charges for text.** Text is free everywhere and a chat assistant writes more of it on demand. One course
  author reported this year that his sales are well down and blamed exactly that.
- **People pay for four things:** a judged answer (Hello Interview, Boot.dev, CodeCrafters), questions known to be
  asked (LeetCode, Hello Interview), structure that ends in an outcome (ByteByteGo, AlgoMaster), and proof
  (certificates). Three of the four are about interviews.
- **The free part is the marketing.** In every case the free tier is generous and is what search engines and
  newsletters distribute.
- **India is priced separately.** Hello Interview shows rupee prices at roughly a third to a half of its dollar price.
  The channel's audience is likely mostly Indian (I cannot see the analytics), and a dollar-only price would lose them.
- **Lifetime plans are common** and are how small products get cash early.

## What I recommend

### The promise

**"System design and backend interviews, ten minutes a day."** One video-backed lesson, one drill, one streak. The
other areas stay as the free reference library behind it.

Why this and not the alternatives:

- It matches what is already made (167 videos, 236 notes, 14 design challenges, 52 interview questions) and what is
  released daily for the next month.
- It is the segment where people demonstrably pay, including at Indian prices.
- Hands-on labs with tested code (the CodeCrafters model) is a stronger product but months of work for one person and
  a different skill; it is a later step, not the first.
- Competing on breadth is not winnable against roadmap.sh.

### The daily loop (build this first; it is free to readers)

In order of value for effort:

1. **Email.** A sign-up box for people without an account, and three messages for people with one: welcome, "your
   streak ends in a few hours", and a weekly digest of what was released. Needs a sender (Resend or Cloudflare Email)
   and a scheduled job (Cloudflare Cron Triggers). Consent and an unsubscribe link in every message.
2. **Today, as the home page for a returning reader.** Three things only: today's drill, today's new lesson and
   video, and what is due for review. Everything else on the dashboard moves below.
3. **The daily drill** (the Daily Incident in progress): one scenario, one decision, two minutes, an explanation, and a
   link to the lesson. The same drill for everyone on a given day, so it can be shared and discussed. It needs a bank
   of at least 60 before launch so it does not repeat within two months.
4. **A streak that is visible and forgiving:** in the top bar, with one "freeze" a week. Duolingo's own data is that
   making a streak easier to keep raised retention.
5. **Spaced review.** The revision lists already record what was revised and when. Turn them into a queue: a missed
   quiz question returns after 1, 3, 7 and 21 days. This is what makes the tenth visit useful, not just habitual.
6. **The release calendar:** "new today" and "tomorrow", driven by the `published` dates already in
   `content/videos.json`.
7. **A shareable result** ("Day 12, 4 of 5 this week") as an image. Free distribution.

Not recommended yet: leaderboards and XP. With few users a leaderboard is empty, and Boot.dev's reviews split on
whether the game layer helps or grates.

### What to charge for

Free forever: every lesson, every video, per-lesson notes, the quizzes, the daily drill, progress and streaks. This is
the audience and the search traffic.

Paid ("Pro"):

| Paid feature | Why someone pays | What it needs |
|---|---|---|
| **AI feedback on a design answer**: the submission is scored against a written rubric for that challenge (requirements, estimates, data model, scaling, failure modes) and returns what is missing, with the lesson to read | the one thing a reader cannot get from text, and the core of Hello Interview's paid tier | a rubric per challenge (content work), a grading route on the existing assistant provider, daily limits |
| **Mock interview**: a timed, turn-by-turn design interview with follow-up questions and a written report | the closest thing to the real event | the same provider; text first, voice later |
| **The full question bank** with "asked at" tags and model answers | LeetCode's main paid feature | a first-class question model; a few hundred questions, each checked by a person |
| **The handbook**: all notes as one book per phase (PDF and EPUB) | convenience; can be sold alone, once | already nearly built |
| **A certificate per path**, with a public verification page | proof for a CV; roadmap.sh gives the same | a path-level assessment so it means something |
| Unlimited drills and review history | small extras | flags |

Suggested starting prices, to be tested rather than believed: ₹399 a month, ₹2,499 a year, ₹5,999 lifetime in India;
$9 a month, $59 a year, $129 lifetime elsewhere. That sits clearly under Hello Interview and AlgoMaster, which is
honest for a newer product with less content. A free trial of three graded answers lets a reader feel the paid thing
before paying.

Costs to know: each graded answer is a model call of a few thousand tokens. At a small model's price that is a
fraction of a cent to a few cents, so a cap (say 10 graded answers a day) keeps a ₹399 subscriber profitable. The
quality of the rubric matters more than the model.

**The cheapest test of whether anyone will pay** is the handbook: put the Phase 1 to 4 notes together as one book,
sell it for ₹299 or $5 through a hosted checkout, and link it from every lesson. It needs no accounts, no
subscriptions and no new code beyond a link. If a few hundred lesson readers produce no sales, a subscription will not
either, and that is worth knowing before building one.

Other income that does not need a paywall: one sponsor line in the weekly email once the list passes a few thousand,
and a "sponsor this course" link now.

### What it will and will not earn

I cannot see traffic, so this is the shape, not a forecast. Consumer learning products convert roughly 1 to 3 in 100
*active* free users to paid. At ₹2,499 a year, 100 subscribers is about ₹2.5 lakh a year. To get 100 subscribers the
site needs several thousand people who come back weekly, which it almost certainly does not have yet. That is why the
order is: reach (email, the channel), then habit (the daily loop), then payment. Building the paywall first would be
building a till for an empty shop.

## What changes in the architecture

| Change | Why |
|---|---|
| An email sender, a `subscribers` table with consent and unsubscribe, and scheduled jobs | gap 2; nothing else works without it |
| An `events` table (lesson opened, drill answered, signed in, returned on day N), with a small admin view of day-1, day-7 and day-30 return | today there is no way to know whether a change brings anyone back |
| A question bank as its own content type (`content/questions/`), with tags, difficulty, source and review date | quizzes, drills, interview sets and spaced review all draw from one bank instead of four formats |
| A rubric file beside each design challenge, and a grading route | the paid feature |
| An `entitlements` table and a payment webhook; a merchant of record (Razorpay for India, plus Lemon Squeezy or Paddle elsewhere so tax is handled) | charging; keep it one small module |
| Answers, reference solutions and rubrics out of the public repository, or the repository made private | gap 9 |
| One community surface (questions on lessons, plus articles) and the feed, books and suggestions retired or hidden | gap 6; less to maintain, less that looks empty |
| Unwritten GenAI modules out of the tree until written | gap 5 |
| A "reviewed by a person on <date>" field per lesson, shown on the page | gap 5 |
| The home page and top navigation led by the promise; the five areas under "Library" | gap 4 |

Nothing here needs a different stack. Cloudflare Pages, D1 and the existing API cover all of it.

## What changes in the content

- **Finish and review the system design course first.** It is the product. Every lesson reviewed by a person, with a
  date.
- **Write rubrics for the 14 design challenges, then add challenges** until the common interview list is covered
  (about 30 to 40).
- **Grow the question bank to a few hundred**, each tied to a lesson. Quality over count: one wrong answer is worse
  than ten missing questions.
- **Write 60 or more daily drills.**
- **Fix the known wrong lesson, and clear the list in `CONTENT_REVIEW.md`.**
- **Stop writing new breadth** (more Linux to Cloud, more GenAI) until the core earns its keep. Park GenAI's 164
  unwritten modules out of sight.

## A 90-day order of work

**Days 1 to 30: reach and habit.** Email sign-up and the three messages. The "today" home screen, the daily drill with
a bank of 60, the visible streak with a freeze, the release calendar. The events table. The handbook on sale as the
payment test. An author page. Repository visibility decided.
*Gate:* email subscribers, and the share of new sign-ins who return within 7 days. If the 7-day return does not move,
fix the loop before going on.

**Days 31 to 60: the thing worth paying for.** Rubrics for all 14 challenges, AI feedback on submissions (free, capped,
labelled as a preview), spaced review, the question bank format and the first 150 questions, the navigation led by the
promise, community surfaces consolidated.
*Gate:* how many readers submit a design answer, and whether those who get feedback come back more than those who do
not.

**Days 61 to 90: charging.** Entitlements, payment, the Pro page, terms and privacy rewritten for a purchase, the mock
interview in text form, certificates for one path. Launch to the email list and the channel first, with a founding
lifetime price.
*Gate:* paid conversions from people who used the free graded answers.

## What to measure

Weekly: new email subscribers, sign-ins, share who return on day 1, 7 and 30, drills answered per active reader,
design answers submitted, and (later) trials started and paid. Cloudflare Web Analytics already has visits, referrers
and top pages; the events table adds what happens after a sign-in.

## What I could not check

- **Traffic and who the readers are.** It is in Cloudflare Web Analytics and YouTube Studio. The India pricing and
  the size estimates above depend on it. Look at the country split and the top 20 pages before deciding prices.
- **Search Console.** Whether pages are indexed and for which queries.
- **Competitors' current prices.** Sources disagreed, pages showed sale prices, and two pages did not show an amount.
  Check each pricing page on the day a price is set.
- **Whether AI grading is good enough.** It depends on the rubrics. Test it on ten real answers before promising it.
- **The lessons themselves.** I did not re-read 600 lessons for this document; the trust findings come from the
  earlier review and from what the pages do and do not show.

## Sources

- Hello Interview pricing: https://www.hellointerview.com/pricing ; review: https://prachub.com/resources/hellointerview-review-2026
- ByteByteGo: https://www.techinterview.org/bootcamp_directory/p/bytebytego/ ; https://devopscube.com/bytebytego-discount.md ; newsletter: https://blog.bytebytego.com/about and https://blog.bytebytego.com/p/1000000-special-30-off-annual-premium
- AlgoMaster: https://algomaster.io/premium ; https://prachub.com/resources/algomaster-pricing ; https://blog.algomaster.io/p/launching-premium-lld-resource
- CodeCrafters: https://codecrafters.io/pricing
- Boot.dev: https://dev.to/royce_fabbd83cb268312e928/bootdev-review-2026-backend-developer-path-pricing-verdict-hk8 ; https://scrimba.com/articles/scrimba-vs-bootdev/amp/
- roadmap.sh premium: https://roadmap.sh/premium
- LeetCode: https://prachub.com/resources/leetcode-pricing ; https://www.lodely.com/blog/leetcode-premium-cost
- AI Engineering from Scratch: https://aiengineeringfromscratch.com/
- Duolingo retention and streaks: https://pulse2.com/duolingo-daily-active-users-reach-58-7-million-as-retention-hits-record-84-and-social-accounts-top-1-billion-organic-impressions/ ; https://marishalakhiani.substack.com/p/breaking-down-duolingos-growth-model
- Course sales and AI: https://simonwillison.net/2026/Jul/3/josh-w-comeau/ ; https://elearningindustry.com/ai-is-not-killing-the-online-course-industry-its-killing-the-old-version-of-it
