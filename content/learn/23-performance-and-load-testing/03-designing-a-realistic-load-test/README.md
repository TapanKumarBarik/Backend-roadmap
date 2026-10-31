# 03 - Designing a Realistic Load Test

## Why this matters

You can now write a k6 script ([module 01](../01-k6-fundamentals/README.md))
and run it at scale ([module 02](../02-azure-load-testing/README.md)). But a
test that hammers one endpoint, with no think time, with every virtual user
sending the identical request, is a *uniform flood* — and a uniform flood
tests a system that doesn't exist. Real traffic is uneven, hits many endpoints
in different proportions, pauses between actions, and carries different data
each time. A system can sail through a uniform test and fall over on real
traffic (or vice versa), so an unrealistic test gives you false confidence in
*both* directions. This module is about closing the gap between "load" and
"realistic load" — which is exactly what makes the autoscaling proof in
[module 04](../04-proving-autoscaling-works/README.md) trustworthy.

## Concepts

### Why a uniform flood is worse than no test

The seductive thing about a uniform test — 100 VUs all `GET /`, no sleep — is
that it produces big, clean numbers. It's also close to meaningless, in ways
that cut both directions. It can **understate** trouble: real users hit the
expensive `/checkout` and `/search` endpoints your flat `GET /health` test
never touches, so you "pass" while the real hot path is untested. And it can
**overstate** trouble: with no think time, your 100 VUs generate the request
rate of thousands of real users, so you provision for a spike that will never
happen. Worst of all, a uniform flood hits caches perfectly — every VU
requests the identical URL, so after the first request everything is a cache
hit and the database never gets touched. Real users request *different* things
and blow past the cache. A realistic test is not about being pedantic; it's the
difference between a number you can act on and a number that lies.

### Model the traffic *mix*, not one endpoint

Real users don't do one thing — they browse, search, add to cart, check out,
in some *proportion*. Your test should reproduce that proportion. If production
logs show 70% browse, 20% search, 8% add-to-cart, 2% checkout, your test should
issue roughly those ratios, because those endpoints have wildly different costs
(a checkout writes to the database and calls a payment provider; a browse hits
a cache). k6 models this with a weighted random choice in the default function,
or more cleanly with **scenarios** — named sub-tests, each with its own load
profile and its own function — so "browsers" and "checkers" can run as separate
populations with separate rates. The number you're chasing: the *shape* of load
your system actually sees, not the maximum load any single endpoint can bear.

### Think time makes VUs behave like people

You met `sleep()` in module 01; here's why it's load-modeling, not decoration.
A real user reads a page for a few seconds before clicking. That **think time**
is what makes "100 concurrent users" generate the request rate of 100 users
instead of 100 machine guns. Two refinements matter: think time should be
**randomized** (real users don't pause for exactly 3.000s — use a random range,
ideally a realistic distribution, not a constant), and it should sit **between
logical actions**, not between every HTTP call — a single page load fires ten
parallel asset requests with *no* think time, then the user pauses before the
next page. Getting think time wrong is the most common reason a test's RPS
bears no relationship to its VU count.

### Closed vs. open model, now in k6 (executors)

Module 00 introduced the closed model (fixed VUs, each waits for its response)
versus the open model (fixed *arrival rate*, requests injected regardless of
response time). In k6 this is the choice of **executor**:

- `ramping-vus` / `constant-vus` — **closed**: you specify VU counts (what
  module 01's `stages` used). Load backs off when the server slows.
- `constant-arrival-rate` / `ramping-arrival-rate` — **open**: you specify
  requests (iterations) *per second*, and k6 spins up as many VUs as needed to
  sustain that rate even as the server slows.

The rule: to reproduce *internet* traffic — users arriving whether or not your
server keeps up — use an **arrival-rate (open)** executor. This is the model
you want when validating autoscaling, because you want to keep pushing a
constant offered rate and watch the system add capacity, not politely back off
the moment latency rises (which a closed model does, hiding the very problem
you're testing).

### Data parameterization — kill the accidental cache hit

If every VU logs in as `user1` and requests product `42`, you are testing your
cache, not your system. **Parameterization** means each iteration uses
*different* data — a different user, a different product ID, a different search
term — drawn from a dataset. In k6 you load a CSV/JSON of test data with
`SharedArray` (loaded once, shared across all VUs to save memory) and index
into it per iteration, often keyed off the VU number and iteration counter so
the spread is even. This is what forces cache misses, exercises many database
rows, and reveals lock contention and connection-pool pressure that a
single-key test never touches — directly setting up the connection-pool
bottleneck you'll hunt in [module 05](../05-identifying-bottlenecks/README.md).

### Correlation and dynamic data — a test that survives real responses

Realistic flows are *stateful*: you log in and get a token, create an order and
get an order ID, then use that ID in the next request. **Correlation** is
extracting a value from one response and using it in the next — `res.json(
'token')`, then sending it as a header. A test that hard-codes a token or an
order ID either breaks the moment the app rejects a stale value, or worse,
silently exercises an error path. Correlation is also where realism and
robustness meet: a correctly-correlated test *is* a functional test of the
happy path under load, which is why a broken correlation often shows up first
as a spike in `http_req_failed`, not as a latency change.

### Steady state, warm-up, and ramp — don't measure the cold start

A system's first few seconds under load are unrepresentative: caches are cold,
JIT compilers haven't warmed, connection pools are still filling, and
autoscalers haven't reacted. If you measure percentiles over the *whole* run
including this warm-up, you smear cold-start latency into your steady-state
numbers. The disciplined shape is: **ramp** up gradually (which also gives
autoscalers time to react — a sudden slam is a *spike* test, a different
question), reach **steady state** and hold it, and evaluate your SLO thresholds
against the steady-state window. k6 supports this by tagging or by simply
setting thresholds knowing the ramp is included; for precise work you run the
ramp as a separate warm-up scenario. The principle from module 00 returns: know
*which question* you're asking — a gradual ramp answers "does it hold at peak?",
not "does it survive a spike?".

## Command reference

These are k6 script constructs, not CLI flags — realistic tests live in the
script:

| Construct | What it does | Sketch |
|---|---|---|
| `scenarios` | Named sub-tests, each with its own executor, load, and function | `scenarios: { browse: {...}, checkout: {...} }` |
| `executor: 'ramping-vus'` | Closed model — ramp VU count over stages | `{ executor: 'ramping-vus', stages: [...] }` |
| `executor: 'constant-arrival-rate'` | Open model — hold a fixed iterations/sec | `{ executor: 'constant-arrival-rate', rate: 200, timeUnit: '1s', duration: '5m', preAllocatedVUs: 100 }` |
| `executor: 'ramping-arrival-rate'` | Open model — ramp the *rate* over stages | `{ ..., stages: [{ target: 200, duration: '2m' }] }` |
| `SharedArray('data', () => JSON.parse(open('./users.json')))` | Load a dataset once, shared across VUs | data parameterization |
| `open('./file.csv')` | Read a file from disk at init time | loading test data |
| `res.json('field')` | Extract a value from a JSON response | correlation |
| `check(res, {...})` | Per-request assertion (from module 01) | validate correlated flow |
| `exec.scenario.iterationInTest` / `__VU` | Counters to index test data evenly | `data[__VU % data.length]` |
| `sleep(rand)` | Randomized think time between logical actions | `sleep(Math.random()*3 + 2)` |

Key arrival-rate fields, flag-by-flag:

`{ executor: 'constant-arrival-rate', rate: 200, timeUnit: '1s', duration: '5m', preAllocatedVUs: 100, maxVUs: 500 }`
- `rate: 200` + `timeUnit: '1s'` — inject **200 iterations per second**, held constant regardless of response time (the open model).
- `duration: '5m'` — hold that rate for five minutes.
- `preAllocatedVUs: 100` — VUs spun up before the test starts (avoids allocation lag).
- `maxVUs: 500` — the ceiling k6 may grow to if the server slows and it needs more VUs to sustain the rate. If it hits `maxVUs` and still can't keep the rate, that's itself a finding — the system can't absorb the offered load.

## Hands-on exercises

Reuse a real target with more than one endpoint. `httpbin` from module 01
works (`/get`, `/delay/N`, `/status/N`, `/anything`), or an app from tracks
06/07. These assume `BASE_URL` is set via `-e` as in module 01.

### 1. Feel the uniform-flood problem

Run a flat, no-think-time test:

```javascript
// flood.js
import http from 'k6/http';
export const options = { vus: 30, duration: '20s' };
export default function () {
  http.get(`${__ENV.BASE_URL}/get`);   // same endpoint, no sleep
}
```

```bash
k6 run -e BASE_URL=http://localhost:8080 flood.js
```

Expected: a very high RPS from only 30 VUs — note the number. That RPS
corresponds to *far* more than 30 real users, because real users pause. Keep
this number to compare against exercise 2.

### 2. Add realistic think time

```javascript
// realistic-thinktime.js
import http from 'k6/http';
import { sleep } from 'k6';
export const options = { vus: 30, duration: '20s' };
export default function () {
  http.get(`${__ENV.BASE_URL}/get`);
  sleep(Math.random() * 3 + 2);   // 2-5s think time
}
```

```bash
k6 run -e BASE_URL=http://localhost:8080 realistic-thinktime.js
```

Expected: the *same 30 VUs* now produce a **fraction** of exercise 1's RPS —
because each user now behaves like a person. Same concurrency, realistic rate.
This is why "concurrent users" and "requests per second" are not the same
number.

### 3. Model a traffic mix with weighted endpoints

```javascript
// mix.js
import http from 'k6/http';
import { sleep } from 'k6';
export const options = { vus: 20, duration: '30s' };
export default function () {
  const r = Math.random();
  if (r < 0.7)       http.get(`${__ENV.BASE_URL}/get`);          // 70% browse
  else if (r < 0.9)  http.get(`${__ENV.BASE_URL}/anything?q=x`); // 20% search
  else               http.post(`${__ENV.BASE_URL}/anything`, JSON.stringify({checkout:true})); // 10% checkout
  sleep(Math.random() * 3 + 1);
}
```

```bash
k6 run -e BASE_URL=http://localhost:8080 mix.js
```

Expected: the summary shows requests spread across endpoints in roughly
70/20/10. Confirm the proportions look right — a realistic test's request
*distribution* should mirror production, not be 100% one endpoint.

### 4. Split populations with scenarios

```javascript
// scenarios.js
import http from 'k6/http';
import { sleep } from 'k6';
export const options = {
  scenarios: {
    browsers: {
      executor: 'constant-vus', vus: 18, duration: '30s',
      exec: 'browse',
    },
    checkers: {
      executor: 'constant-arrival-rate', rate: 5, timeUnit: '1s',
      duration: '30s', preAllocatedVUs: 10, exec: 'checkout',
    },
  },
};
export function browse() {
  http.get(`${__ENV.BASE_URL}/get`);
  sleep(Math.random() * 3 + 2);
}
export function checkout() {
  http.post(`${__ENV.BASE_URL}/anything`, JSON.stringify({buy: true}));
}
```

```bash
k6 run -e BASE_URL=http://localhost:8080 scenarios.js
```

Expected: two populations running at once — a closed-model browser crowd and an
open-model checkout stream at a fixed 5/s. Note in the summary how the two
scenarios are reported. This is how you model "steady background browsing plus
a fixed checkout rate."

### 5. Parameterize with a shared dataset (kill the cache hit)

Create `users.json`:

```json
[{"id":"u1"},{"id":"u2"},{"id":"u3"},{"id":"u4"},{"id":"u5"}]
```

```javascript
// param.js
import http from 'k6/http';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
const users = new SharedArray('users', () => JSON.parse(open('./users.json')));
export const options = { vus: 10, duration: '20s' };
export default function () {
  const u = users[(__VU + __ITER) % users.length];   // spread across data
  http.get(`${__ENV.BASE_URL}/anything?user=${u.id}`);
  sleep(1);
}
```

```bash
k6 run -e BASE_URL=http://localhost:8080 param.js
```

Expected: requests carry *different* `user=` values across iterations. On a
real app with a cache/DB, this is the difference between a 100%-cache-hit test
and one that exercises many rows. Contrast mentally with a version that
hard-codes `user=u1` — that one tests only your cache.

### 6. Correlate a value between requests

Simulate login → use token (httpbin's `/uuid` stands in for a token endpoint):

```javascript
// correlate.js
import http from 'k6/http';
import { check } from 'k6';
export const options = { vus: 5, duration: '15s' };
export default function () {
  const login = http.get(`${__ENV.BASE_URL}/uuid`);
  const token = login.json('uuid');                 // extract from response
  check(login, { 'got token': () => !!token });
  const res = http.get(`${__ENV.BASE_URL}/anything`, {
    headers: { Authorization: `Bearer ${token}` },  // reuse it downstream
  });
  check(res, { 'authed call ok': (r) => r.status === 200 });
}
```

```bash
k6 run -e BASE_URL=http://localhost:8080 correlate.js
```

Expected: each iteration fetches a fresh token and uses it — a stateful flow,
not a hard-coded value. Break it deliberately (extract `login.json('nope')`)
and watch the "got token" check fail — proof that broken correlation surfaces
as a check/error failure, not a latency one.

### 7. Open model vs. closed model under a slow endpoint

Run both against a deliberately slow endpoint and compare offered load:

```bash
# closed: 20 VUs against a 1s-delay endpoint
k6 run -e BASE_URL=http://localhost:8080 --vus 20 --duration 20s \
  -e EP=/delay/1 closed.js
```
where `closed.js` does `http.get(`${__ENV.BASE_URL}${__ENV.EP}`)`. Then an
open-model version with `constant-arrival-rate: rate 50/s`. Expected: the
closed test caps near ~20 req/s (each VU blocked ~1s), while the open test
*attempts* 50/s and grows VUs to sustain it — demonstrating module 00's point
that a closed model throttles itself when the server is slow. Note which model
you'd want for autoscaling validation (open — you want to keep pushing).

### 8. Diagnose and fix: a "passing" test that only warms the cache

```javascript
// cache-fooled.js  -- every VU requests the identical key
import http from 'k6/http';
export const options = { vus: 20, duration: '20s',
  thresholds: { http_req_duration: ['p(95)<50'] } };
export default function () {
  http.get(`${__ENV.BASE_URL}/anything?user=SAME`);  // identical every time
}
```

Run it against an app with any caching layer. **Expected:** p95 is
suspiciously low and the threshold passes easily — because after the first
request, everything is a cache hit and the backend/DB is never touched. The
test "proves" great performance the real system will never deliver.
**Diagnose:** the URL is identical every iteration; the cache absorbs 100% of
load. **Fix:** parameterize the `user=` value from a `SharedArray` as in
exercise 5, forcing cache misses and real backend work — and watch p95 rise to
the *true* number. Lesson: a uniform-key test measures your cache, not your
system.

### 9. Clean up

```bash
rm -f users.json flood.js realistic-thinktime.js mix.js scenarios.js param.js correlate.js closed.js cache-fooled.js
# stop any port-forward; delete the test target if you created one for this module
```

Expected: scratch files gone. Keep any long-lived target app if a later module
reuses it.

## Independent challenge

Design a realistic load test — no full script given — for a two- or
three-endpoint app you've deployed (tracks 06/07), that: models a traffic
*mix* in production-like proportions across the endpoints; uses randomized
think time between logical actions; drives at least the expensive endpoint via
an **open** (arrival-rate) executor so the offered load doesn't back off under
strain; parameterizes at least one field from a shared dataset so you're not
just warming a cache; and correlates one value from an earlier response into a
later request. State, in a comment, which SLO the thresholds come from
([module 00](../00-performance-testing-concepts/README.md) / track 20). This
pulls together everything in this module plus the executors and thresholds
concept, and sets up module 04, where this exact realistic shape is what makes
the autoscaling proof believable.

<details>
<summary>Stuck? One hint</summary>

Structure it as `scenarios`: a large `constant-vus` (or `ramping-vus`)
"browsers" population with generous think time on the cheap endpoints, plus a
`constant-arrival-rate` "workers/checkers" scenario at a fixed rate on the
expensive endpoint. Load a small JSON of test data via `SharedArray` and index
it with `(__VU + __ITER) % len`. For correlation, do a `GET` that returns an ID
or token, pull it with `res.json('...')`, and pass it in a header on the next
request. The two thresholds are the same pair as module 01 —
`http_req_duration: ['p(95)<N']` and `http_req_failed: ['rate<0.01']` — with N
copied from your stated SLO.

</details>

## Common mistakes & troubleshooting

- **A uniform flood.** One endpoint, one key, no think time. It hits caches
  perfectly, skips your real hot paths, and produces a number that lies in both
  directions. Model the mix.
- **Confusing VUs with RPS.** Without think time, a handful of VUs produce the
  rate of thousands of users; with realistic think time the same VUs produce a
  realistic rate. Always relate the two consciously.
- **Closed model for an autoscaling test.** A closed executor backs off when
  the server slows — exactly when you wanted to keep pushing to watch it scale.
  Use an arrival-rate (open) executor for that job.
- **Hard-coded data.** One user, one product ID, one search term → you test the
  cache. Parameterize from a dataset.
- **`SharedArray` misuse.** Loading a big dataset without `SharedArray` copies
  it into *every* VU's memory and can OOM the generator. Load shared data once.
- **Ignoring correlation.** Hard-coded tokens/IDs either break or silently hit
  error paths; the flow you *think* you're testing isn't the one running.
- **Measuring the warm-up.** Percentiles over a run that includes cold caches
  and pre-scale latency understate steady-state health. Ramp, reach steady
  state, evaluate there.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give two distinct ways a uniform flood test lies — one where it *understates*
   trouble and one where it *overstates* it.
2. Why does a test where every VU requests the identical URL tell you almost
   nothing about backend or database performance?
3. What does adding realistic think time do to the relationship between VU count
   and requests per second, and why does that matter?
4. Which k6 executor family reproduces real internet traffic under strain, and
   what does the *other* family do wrong when you're validating autoscaling?
5. What is `SharedArray` for, and what goes wrong if you load a large dataset
   without it?
6. How does a *broken correlation* in a stateful flow typically show up in the
   results, and why in a different metric than a slow server would?
7. Why should you evaluate SLO thresholds against a steady-state window rather
   than over the whole run including warm-up?

<details>
<summary>Show answers</summary>

1. It **understates** by hammering one cheap endpoint (e.g. `/health`) and never
   exercising the expensive real hot paths (checkout, search), so you "pass"
   while the costly paths are untested. It **overstates** by omitting think time,
   so a few VUs generate the request rate of thousands of users and you provision
   for a spike that will never happen.
2. Every request is the identical key, so after the first it's a 100% cache hit
   and the backend/DB is never touched — you measure the cache's latency, not the
   system's.
3. With realistic think time, the same VU count produces a *far lower* (realistic)
   RPS, because each VU now pauses like a real user between actions. It matters
   because "concurrent users" and "requests per second" are otherwise wildly
   different numbers — without think time you badly misjudge how much load a given
   user population represents.
4. The **arrival-rate (open)** executors (`constant-arrival-rate`,
   `ramping-arrival-rate`) keep injecting the target rate even as the server
   slows. The **VU-based (closed)** executors back off offered load as the server
   slows — exactly when you wanted to keep pushing to trigger scale-up — hiding
   the behavior you're testing.
5. `SharedArray` loads a dataset **once** and shares it across all VUs. Without
   it, each VU gets its own copy of the data in memory, which for a large dataset
   can OOM the load generator.
6. As a spike in **`http_req_failed`** / failing **checks** (the downstream
   request is rejected because the token/ID is stale or wrong), not as increased
   latency. A slow *server* moves `http_req_duration`; a broken correlation moves
   the *error/check* metrics because the request is being rejected, not delayed.
7. Because the warm-up window has cold caches, unfilled connection pools,
   un-warmed JITs, and un-reacted autoscalers — smearing that cold-start latency
   into steady-state percentiles understates the system's real health. You ramp,
   reach steady state, and judge the SLO there.

</details>

## Cumulative review

Closed book. Cover the answers and write each out before checking. These mix
concepts from modules 00-03.

1. You're asked to "load test the checkout service." Before writing anything,
   what three questions from module 00 do you answer, and why does skipping
   them make the test meaningless?
2. A colleague reports "we did 5,000 RPS with just 25 VUs and p95 was 12ms."
   Give two independent reasons this result is probably not something to
   celebrate.
3. Translate this SLO into concrete k6 `thresholds`: "99% of API calls under
   250ms, error rate below 0.5%, at expected peak."
4. You need to prove an AKS HPA scales. Which k6 *executor* do you choose and
   why does the *other* family of executors actively work against you here?
5. Your local k6 test plateaus at 900 RPS and you suspect the target is maxed.
   List, in order, the two things you'd rule out before believing 900 RPS is
   the *server's* ceiling — one client-side, one about the service.
6. Why does a test where every VU requests `/product/42` tell you almost
   nothing about database performance, and what one change fixes it?
7. Explain how a broken *correlation* in a stateful test typically shows up in
   the results — and why it appears in a different metric than a slow server
   would.
8. When would you deliberately choose *not* to add think time, and what test
   type does that correspond to?
9. You have a working local script and need 10× the load with server-side
   metric correlation. What do you reach for, and what's the one thing you make
   sure of *before* the first managed run?
10. A latency threshold is green but you're suspicious. Name two distinct ways
    the test could be green while the service is actually unhealthy, drawing on
    modules 01 and 03.

<details>
<summary>Show answers</summary>

1. Which **test type** (load/stress/soak/spike — sets the load shape); which
   **SLO** you're verifying (sets the threshold); and **open or closed model**
   (sets whether load backs off under strain). Skip them and you get numbers
   with no defined question — you can't say what "pass" means or whether the
   shape resembles reality.
2. (a) 5,000 RPS from 25 VUs means essentially **no think time** — a machine-gun
   pattern that resembles no real traffic and overstates per-user load. (b) A
   12ms p95 at that rate suggests a **uniform-key/cache-hit** test that never
   touches the backend, so the number reflects the cache, not the system.
3. `http_req_duration: ['p(99)<250']` and `http_req_failed: ['rate<0.005']`,
   run while holding expected-peak load. (Both numbers copied from the SLO, not
   invented.)
4. A **ramping-arrival-rate / constant-arrival-rate (open)** executor — you
   want to keep injecting a constant/growing offered rate and watch the system
   add capacity. The **VU-based (closed)** executors back off as the server
   slows, reducing offered load exactly when you wanted to keep the pressure on
   to trigger scaling — hiding the behavior you're testing.
5. First (client-side): is the k6 **generator saturated** — CPU/network on the
   machine running k6 pinned at 900 RPS? Second (service): is a **downstream
   dependency or a uniform-cache effect** capping it rather than the service's
   own compute? If either is true, 900 RPS isn't the server's real limit.
6. Because every request is the identical key, so after the first it's a 100%
   cache hit and the database is never exercised — you measure the cache. Fix:
   **parameterize** the product ID from a dataset so requests spread across
   many rows and force cache misses.
7. It shows up as a spike in **`http_req_failed`** / failing **checks** (the
   downstream request is rejected because the token/ID is stale or wrong), not
   as increased latency — a slow *server* moves `http_req_duration`, whereas a
   broken correlation moves the *error/check* metrics.
8. In a **spike test** — you deliberately want a sudden, uniform slam to see if
   autoscaling reacts fast enough; there, the absence of think time is the
   point, not a bug.
9. **Azure Load Testing** with multiple engine instances (module 02). Before
   the first managed run, make sure the script **runs correctly locally** (and
   that it has an `http_req_failed` threshold), so you don't debug a broken
   script at managed cost.
10. Any two of: a latency threshold with **no error-rate threshold** blesses
    fast error pages (module 01 ex 9); a **uniform-cache** test reports the
    cache's latency, not the backend's (module 03 ex 8); a **broken
    correlation** silently exercises a cheap error path instead of the real
    flow.

</details>

## Next

[04-proving-autoscaling-works](../04-proving-autoscaling-works/README.md) — the
payoff: point a *realistic* load test at the HPA (track 03) and KEDA (track 06)
setups you built earlier, watch pods scale in real time on Grafana, and catch
the config that looks right but never actually fires.
