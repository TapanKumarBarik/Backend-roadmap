# PromQL in Depth

## Why this matters

A metrics database you can't query well is just an expensive disk. Everything
downstream — every Grafana panel (module 03), every alert (module 06), every
"is the error rate up?" during an incident — is a **PromQL** expression under
the hood. In [track 07](../../07-aks/06-monitoring-aks-azure-monitor-container-insights/README.md)
Azure gave you KQL against Log Analytics; PromQL is the metrics-native
equivalent, and it thinks differently — in *time series* and *rates*, not
rows. This module takes you from "I can type `up`" to writing the rate,
aggregation, and quantile queries that real dashboards and alerts are built
from, plus the recording and alerting rules that make them efficient and
actionable.

## Concepts

### `rate` and `irate` — turning counters into per-second rates

A **counter** (module 01) only ever increases, so its raw value is useless —
you want *how fast it's climbing*. **`rate(metric[5m])`** computes the
per-second average increase over the trailing 5-minute **range**, correctly
handling counter resets (when a pod restarts and the counter drops to 0, rate
doesn't report a huge negative spike). The `[5m]` is a **range selector**: it
turns an instant vector into a *range vector* (a window of samples per series),
which is exactly what `rate` needs.

- **`rate(http_requests_total[5m])`** — smooth average rate over 5 minutes;
  the right default for graphs and most alerts (resistant to single-sample
  noise).
- **`irate(http_requests_total[5m])`** — *instant* rate, using only the last
  two samples in the window; very responsive but spiky. Use it for fast-moving
  graphs where you want to see momentary bursts, not for alerts (too jumpy).
- Rule of thumb: **`rate` for alerting and most dashboards, `irate` for
  high-resolution troubleshooting graphs.** And always pick a range (`[5m]`)
  that's *at least ~4× your scrape interval*, or the window may not contain
  enough samples and `rate` returns nothing.

### Aggregation — collapsing many series into fewer

`rate(http_requests_total[5m])` returns *one series per pod per label
combination* — often dozens. **Aggregation operators** collapse them:
`sum`, `avg`, `max`, `min`, `count`. On their own they collapse to a *single*
series (total across everything). The power is the **`by`** and **`without`**
modifiers that control what to *keep*:

- `sum(rate(http_requests_total[5m]))` — total request rate across the whole
  fleet (one number).
- `sum by (status) (rate(http_requests_total[5m]))` — request rate broken down
  *per status code* (keep the `status` label, sum away everything else). This
  is the shape of almost every useful dashboard query.
- `sum without (pod, instance) (rate(http_requests_total[5m]))` — the inverse:
  sum away only `pod` and `instance`, keep every other label. `by` lists what
  to keep; `without` lists what to discard.

The single most common PromQL mistake is aggregating away a label you needed
(or keeping one that explodes the series count) — `by`/`without` is where you
control that.

### Histograms and quantiles — measuring latency correctly

Averages lie about latency: an average response time of 100ms can hide that 5%
of users wait 3 seconds. Prometheus **histograms** solve this. A histogram
metric (e.g. `http_request_duration_seconds`) is exposed as a set of
cumulative **buckets** — `..._bucket{le="0.1"}` counts requests that took ≤
0.1s, `le="0.5"` counts ≤ 0.5s, etc., plus `..._sum` and `..._count`. You
extract a **quantile** (a.k.a. percentile) with **`histogram_quantile`**:

```
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))
```

reads as "the 95th-percentile request duration" — 95% of requests were faster
than this value. Note the shape: you `rate()` the buckets, `sum by (le)` to
aggregate across pods while *keeping the `le` bucket boundary*, then
`histogram_quantile(0.95, ...)`. Forgetting `by (le)` — aggregating the bucket
label away — is the classic histogram bug that makes the function return
nonsense or nothing. p95/p99 latency is the metric SLOs are built on
(track 20), so this pattern is worth memorizing.

### Recording rules — precompute expensive queries

Some queries (a big `histogram_quantile` across thousands of series) are slow
to evaluate on every dashboard refresh. A **recording rule** tells Prometheus
to evaluate an expression on a schedule and *save the result as a new metric*.
You define, say, `job:http_request_duration:p95` once, and dashboards/alerts
query that cheap precomputed series instead of recomputing the heavy
expression every time. Recording rules also give you stable, named building
blocks (the `level:metric:operation` naming convention) and make alerts
faster and more consistent. They're the metrics-world equivalent of a
materialized view.

### Alerting rules — queries that page you

An **alerting rule** is a PromQL expression plus a condition and a duration:
"if `expr` has been true for `for: 10m`, fire an alert." For example,
`sum by (job) (rate(http_requests_total{status=~"5.."}[5m])) /
sum by (job) (rate(http_requests_total[5m])) > 0.05` for `10m` means "more
than 5% of requests have been 5xx errors for 10 minutes." Prometheus evaluates
the rule, and when it fires, hands the alert to **Alertmanager** (module 06)
for routing/notification. Two things to internalize now: **the `for:` duration
prevents flapping** (a one-scrape blip won't page anyone), and **the operator
and threshold are where good vs. noisy alerts are decided** (module 06) — a
wrong `>` vs. `<` or an impossible threshold produces an alert that never
fires, which you'll deliberately debug below.

## Command reference

| PromQL / command | What it does | Example |
|---|---|---|
| `rate(m[5m])` | Per-second avg increase of counter `m` over 5m (handles resets) | `rate(http_requests_total[5m])` |
| `irate(m[5m])` | Instant rate from the last two samples — responsive, spiky | `irate(http_requests_total[1m])` |
| `sum by (l) (expr)` | Aggregate, *keeping* label `l` | `sum by (status) (rate(http_requests_total[5m]))` |
| `sum without (l) (expr)` | Aggregate, *discarding* label `l`, keeping the rest | `sum without (pod) (rate(http_requests_total[5m]))` |
| `histogram_quantile(q, buckets)` | Extract the `q` quantile from histogram buckets | see below |
| `expr1 / expr2` | Binary op, matched by label set — the error-ratio pattern | see below |
| `count(metric)` | How many series match — a cardinality check | `count(http_requests_total)` |
| PrometheusRule CR | Declares recording/alerting rules for the Operator | see exercise 7 |

Flag/clause breakdown for the two multi-part expressions:

`histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))`
- `..._bucket` — the histogram's cumulative bucket series (has an `le` label).
- `rate(...[5m])` — per-second rate of each bucket (buckets are counters).
- `sum by (le) (...)` — aggregate across pods **but keep `le`**; dropping `le`
  breaks the quantile. This is the mandatory step people forget.
- `histogram_quantile(0.95, ...)` — interpolate the 95th percentile from the
  bucket boundaries. `0.95` = p95; use `0.99` for p99, `0.5` for the median.

Error-ratio alerting expression:
`sum by (job) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (job) (rate(http_requests_total[5m])) > 0.05`
- `{status=~"5.."}` — regex-match any 5xx status.
- numerator — 5xx request rate per job; denominator — *total* request rate per
  job. Division matches series by their shared label set (both are `by (job)`).
- `> 0.05` — fire when the 5xx *fraction* exceeds 5%. Using a ratio, not a raw
  count, is what makes the alert scale-independent.

PrometheusRule fields (exercise 7):
- `spec.groups[].rules[].record` — the *new metric name* a recording rule
  produces (use `level:metric:op` naming).
- `spec.groups[].rules[].alert` — the alert name (present on alerting rules
  instead of `record`).
- `expr` — the PromQL. `for:` — how long it must stay true before firing.
  `labels:` — attached to the alert (e.g. `severity: warning`, used for
  routing in module 06). `annotations:` — human-readable summary/description.

## Hands-on exercises

Continue on the **kind** cluster with `kube-prometheus-stack` and the
`metrics-app` from [module 01](../01-prometheus-fundamentals/README.md). Keep
the Prometheus UI port-forward open (`svc/kps-kube-prometheus-stack-prometheus
9090:9090`) — you'll run queries in its Graph tab. Generate traffic against the
app first so there's data:
```bash
kubectl port-forward -n demo svc/metrics-app 8080:8080 &
for i in $(seq 500); do curl -s localhost:8080/ >/dev/null; done
```

1. **(WSL2) rate vs. raw counter.** Query `http_requests_total{namespace=
   "demo"}` (raw — big, monotonic, useless) then
   `rate(http_requests_total{namespace="demo"}[5m])` — a per-second rate.
   Generate a burst of traffic and re-run: the rate reacts, the raw counter
   just keeps climbing. This is why you almost never graph a raw counter.

2. **(WSL2) rate vs. irate.** Graph both `rate(...[5m])` and
   `irate(...[1m])` for the same counter (use the Graph tab's time range).
   Note `irate` is spikier and more responsive, `rate` is smoother. Write one
   sentence on which you'd alert on and why.

3. **(WSL2) Aggregate with `by`.** Run
   `sum(rate(http_requests_total{namespace="demo"}[5m]))` (one total number),
   then `sum by (code) (rate(http_requests_total{namespace="demo"}[5m]))` (one
   series per HTTP status code). Then try
   `sum without (instance, pod) (rate(http_requests_total{namespace="demo"}[5m]))`
   and compare what labels survive. Confirm you understand `by` = keep,
   `without` = drop.

4. **(WSL2) Compute an error ratio.** The example app can emit non-200s. Build
   the ratio query:
   ```
   sum(rate(http_requests_total{namespace="demo",code=~"5.."}[5m]))
   /
   sum(rate(http_requests_total{namespace="demo"}[5m]))
   ```
   It returns the *fraction* of 5xx responses. (May be 0 if the app only
   returned 200s — that's fine; note that even "no errors" is a real answer.)

5. **(WSL2) Extract a latency quantile.** If the app exposes a
   `*_duration_seconds_bucket` histogram (check `curl -s localhost:8080/metrics
   | grep bucket`), compute p95:
   ```
   histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{namespace="demo"}[5m])))
   ```
   Compare p50 (`0.5`) and p99 (`0.99`). Note how the tail (p99) is far above
   the median — the exact thing an average would have hidden.

6. **Diagnose and fix: a histogram query returning nothing because `le` was
   aggregated away.** Run the *broken* version:
   ```
   histogram_quantile(0.95, sum (rate(http_request_duration_seconds_bucket{namespace="demo"}[5m])))
   ```
   (note: `sum` with **no** `by (le)`). It returns `NaN`/nothing, because
   `histogram_quantile` needs the per-bucket `le` boundaries and you summed
   them all into one. **Fix** by restoring `sum by (le) (...)`. Lesson: *the
   `le` label is load-bearing for histograms* — never aggregate it away.

7. **(WSL2) Write a recording rule and an alerting rule.** With the Operator,
   rules are a `PrometheusRule` CR:
   ```bash
   kubectl apply -f - <<'EOF'
   apiVersion: monitoring.coreos.com/v1
   kind: PrometheusRule
   metadata:
     name: demo-rules
     namespace: monitoring
     labels:
       release: kps          # so the Operator's ruleSelector picks it up
   spec:
     groups:
       - name: demo.rules
         rules:
           - record: namespace:http_requests:rate5m
             expr: sum by (namespace) (rate(http_requests_total[5m]))
           - alert: DemoHighErrorRatio
             expr: |
               sum(rate(http_requests_total{namespace="demo",code=~"5.."}[5m]))
               / sum(rate(http_requests_total{namespace="demo"}[5m])) > 0.05
             for: 5m
             labels: {severity: warning}
             annotations:
               summary: "demo app 5xx ratio above 5% for 5m"
   EOF
   ```
   In the Prometheus UI, open **Status → Rules** and confirm both appear; query
   the new metric `namespace:http_requests:rate5m` and confirm it returns data
   (the recording rule is now materializing it). Open **Alerts** and find
   `DemoHighErrorRatio` (likely `Inactive` if there are no errors — that's
   correct).

8. **Diagnose and fix: an alert that can never fire because of a wrong
   operator/threshold.** Add a deliberately broken alert:
   ```bash
   kubectl apply -f - <<'EOF'
   apiVersion: monitoring.coreos.com/v1
   kind: PrometheusRule
   metadata: {name: demo-badrule, namespace: monitoring, labels: {release: kps}}
   spec:
     groups:
       - name: demo.bad
         rules:
           - alert: NeverFires
             expr: sum(rate(http_requests_total{namespace="demo"}[5m])) < 0
             for: 1m
             labels: {severity: warning}
   EOF
   ```
   A request *rate* can never be `< 0`, so this alert is structurally
   impossible — it will sit `Inactive` forever, silently giving false comfort.
   Investigate by evaluating just the inner expression
   (`sum(rate(...[5m]))`) and seeing it's always ≥ 0. **Fix** the intent — say
   you meant "alert when traffic *drops to* zero", the correct expression is
   `sum(rate(http_requests_total{namespace="demo"}[5m])) == 0` (or `< 0.01`).
   Lesson from module 00's cardinality-style trap, applied to alerting: **an
   alert that never fires is as useless as one that always fires — always
   verify the expression *can* cross the threshold.**

9. **(WSL2) Clean up the bad rule** (keep the good one for later modules):
   ```bash
   kubectl delete prometheusrule demo-badrule -n monitoring
   ```

## Independent challenge

No query given — write it yourself, drawing on this module and
[module 01](../01-prometheus-fundamentals/README.md). Pick a real signal from
your cluster's *built-in* metrics (kube-state-metrics or node-exporter, not the
demo app) and build a complete, useful alerting rule from scratch as a
`PrometheusRule`. Good candidates: "a Deployment has had unavailable replicas
for 10 minutes" (`kube_deployment_status_replicas_unavailable`), "a container
has restarted more than N times in an hour" (`kube_pod_container_status_restarts_total`
with `rate`/`increase`), or "node available memory dropped below 10%". Your
rule must use a **rate or ratio** (not a raw counter), a sensible **`for:`**
duration, and a threshold you can *justify*. Then prove the rule is real: force
the condition (scale a Deployment to demand more replicas than can schedule, or
deploy a crash-looping pod) and watch the alert transition `Inactive → Pending
→ Firing` in the Prometheus UI. The skill is authoring an alert whose
expression genuinely *can* fire and *does* under the condition you designed it
for — the opposite of exercise 8's trap.

<details>
<summary>Stuck? One hint</summary>

For "container restarting too much," `increase(kube_pod_container_status_restarts_total[1h])
> 5` is close, but confirm the metric exists and has data first
(`count(kube_pod_container_status_restarts_total)` in the UI). Use `increase`
(total over the window) rather than `rate` when the natural threshold is "how
many times", and `rate` when it's "how fast". Set `for:` shorter than your
window while you test so you don't wait an hour to see it fire — then reason
about what `for:` you'd use in production. To *force* a restart storm, deploy a
pod whose command is `sh -c 'exit 1'` and watch it CrashLoopBackOff.

</details>

## Common mistakes & troubleshooting

- **Graphing a raw counter.** Its absolute value is meaningless and it resets
  on restart. Wrap counters in `rate`/`increase` essentially always.
- **`rate` window too short for the scrape interval.** `rate(m[15s])` with a
  15s scrape interval may not capture two samples and returns nothing. Keep the
  range ≥ ~4× the scrape interval (`[1m]`+ for 15s scrapes).
- **Aggregating away `le` in a histogram.** `histogram_quantile` needs the
  per-bucket `le` boundaries; `sum` without `by (le)` breaks it. Always
  `sum by (le) (rate(..._bucket[5m]))`.
- **`irate` on an alert.** `irate` is spiky by design and will flap an alert on
  momentary bursts. Alert on `rate`; save `irate` for high-res troubleshooting
  graphs.
- **Binary-op returning nothing due to label mismatch.** `a / b` matches series
  by their *full label sets*; if `a` and `b` don't share labels (e.g. one has a
  `code` label the other doesn't), the division matches nothing. Aggregate both
  sides to the same label set first (both `by (job)`).
- **An alert that can't cross its threshold.** A wrong operator (`<` vs `>`) or
  an impossible threshold produces an alert that never fires — silent false
  comfort. Always test the bare expression can actually reach the threshold
  (exercise 8).
- **PrometheusRule not loading.** Like ServiceMonitors, the Operator selects
  rules by label — your `PrometheusRule` needs the `release: kps` label (or
  matching `ruleSelector`), or it's silently ignored.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Why do you almost always wrap a counter in `rate()` instead of graphing it
   raw, and what does `rate` do about counter resets?
2. When would you choose `irate` over `rate`, and why is `irate` a bad choice
   for alerting?
3. Explain `by` vs. `without` in an aggregation. Write the query for "request
   rate per status code."
4. Why is an average latency misleading, and what's the full shape of the
   PromQL that gives you p95 latency?
5. What single label must you keep when aggregating histogram buckets, and what
   happens if you drop it?
6. What does a recording rule buy you over just putting the expression in every
   dashboard?
7. What do `for:` and the threshold operator each control in an alerting rule,
   and how can each be misconfigured into an alert that never fires?

</details>

<details>
<summary>Show answers</summary>

1. A counter's raw value is just "total since process start" (meaningless
   alone, resets on restart); `rate()` gives the per-second increase, which is
   the useful signal. `rate` detects counter resets (a drop to a lower value)
   and treats them as a reset rather than reporting a huge negative rate.
2. `irate` (instant rate from the last two samples) for high-resolution
   troubleshooting graphs where you want to see momentary spikes. It's bad for
   alerting because it's spiky and will flap the alert on brief bursts;
   `rate`'s averaging is more stable.
3. `by` lists the labels to *keep*; `without` lists the labels to *discard*
   (keeping the rest). Per-status-code rate:
   `sum by (status) (rate(http_requests_total[5m]))` (or `by (code)` depending
   on the metric's label name).
4. An average hides the tail — a few very slow requests are invisible in the
   mean. p95:
   `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m])))`.
5. `le` (the bucket upper-bound). Drop it and `histogram_quantile` has no
   bucket boundaries to interpolate from, so it returns `NaN`/nothing.
6. Prometheus evaluates the (possibly expensive) expression once on a schedule
   and stores the result as a new named metric, so dashboards/alerts query a
   cheap precomputed series instead of recomputing the heavy query on every
   refresh — faster and consistent, with a stable name to reuse.
7. `for:` sets how long the expression must stay true before the alert fires
   (prevents flapping on a single-scrape blip); the operator/threshold decides
   *when* the expression counts as "bad". A wrong operator (`<` where you meant
   `>`) or an unreachable threshold makes the expression never cross, so the
   alert is `Inactive` forever; too-loose settings make it fire constantly.

</details>

## Cumulative review

Closed book. Cover the answers and write each out before checking. These mix
everything so far — the concepts (module 00), Prometheus mechanics (module 01),
and PromQL (this module).

1. Someone proposes a metric `http_requests_total{user_email=..., path=...}` so
   they can "alert per user." Name the failure mode (module 00), which pillar
   should carry `user_email` instead, and what you'd label the metric with
   instead so it stays useful.
2. A target you added via ServiceMonitor shows *no entry at all* on the Targets
   page. Give the two most likely causes (module 01) and the exact `kubectl`
   command you'd run to check the first one.
3. Distinguish `up == 0` from a missing target, and say which is an app problem
   vs. a config problem.
4. Write the PromQL for "5xx error ratio per job over 5 minutes" and explain
   why a ratio is better than a raw 5xx count for an alert.
5. You graph `http_requests_total` directly and it's a straight line climbing
   forever. What did you do wrong and what's the fix?
6. A `histogram_quantile` query returns nothing. Give the single most likely
   PromQL cause and the fix.
7. Explain the pull model in one sentence and give one advantage it has over
   the push-based Azure Monitor agents you used in track 07.
8. You want p99 latency precomputed so dashboards load fast. What Prometheus
   feature do you use, and what naming convention do you give the new series?
9. An alert named `DiskWillFill` never fires even though disks are filling.
   List two independent misconfigurations that could each cause a
   never-firing alert (drawing on modules 01 and 02).
10. Match each to a pillar and say why: (a) "requests per second, per endpoint,
    trending"; (b) "the exact stack trace on the request that 500'd at
    14:07"; (c) "which downstream service made the checkout slow."

<details>
<summary>Show answers</summary>

1. **Cardinality explosion** (module 00) — `user_email` is unbounded, one new
   series per user, potentially millions, which can take Prometheus down.
   `user_email` belongs in **logs/traces**. Label the metric with bounded
   dimensions instead: `path` (bounded set of endpoints) and `status`/`code`.
2. (a) The `selector.matchLabels` (or `endpoints.port`) doesn't match the
   Service; (b) the chart is ignoring the ServiceMonitor because
   `serviceMonitorSelectorNilUsesHelmValues=false` wasn't set and it lacks the
   release label. Check the first with `kubectl get svc <name> --show-labels`.
3. `up == 0` = Prometheus found the target but the scrape failed (app not
   listening / wrong port) → an **app/network** problem. A missing target =
   the ServiceMonitor matched nothing → a **config/selector** problem.
4. `sum by (job) (rate(http_requests_total{status=~"5.."}[5m])) / sum by (job)
   (rate(http_requests_total[5m])) > 0.05`. A ratio is scale-independent — a
   raw 5xx count that's "fine" at low traffic and "bad" at high traffic needs
   different thresholds, whereas a 5% ratio means the same thing at any volume.
5. You graphed a raw counter; its value only ever grows. Fix: wrap it in
   `rate(...[5m])` (or `increase`) to see the per-second rate instead of the
   cumulative total.
6. You aggregated away the `le` label (`sum` without `by (le)`), so
   `histogram_quantile` has no bucket boundaries. Fix:
   `sum by (le) (rate(..._bucket[5m]))`.
7. Prometheus periodically scrapes each target's `/metrics` endpoint rather
   than receiving pushed data; advantage: a failed scrape is recorded as
   `up == 0`, so "target down" is a first-class, alertable signal (a push
   system just sees ambiguous absence of data).
8. A **recording rule** (in a `PrometheusRule`), which precomputes the p99
   expression on a schedule into a new series; name it with the
   `level:metric:operation` convention, e.g.
   `job:http_request_duration:p99`.
9. Any two of: a wrong comparison operator or unreachable threshold so the
   expression never crosses (module 02); a `for:` far longer than the condition
   ever persists; the `PrometheusRule` not carrying the `release` label so the
   Operator never loaded it (module 01/02); or the underlying metric not
   existing/having no data (wrong name or the target isn't scraped, module 01).
10. (a) **Metric** — aggregate, trended, low-cardinality (`endpoint`). (b)
    **Log** — a specific event's full detail/stack trace. (c) **Trace** — the
    single request's path across services and where the time went.

</details>

## Next

[03-grafana-dashboards](../03-grafana-dashboards/README.md) — stop reading
PromQL results as raw numbers in a UI and start building the dashboards,
variables, and community-imported boards that turn these queries into
something a team can actually watch.
