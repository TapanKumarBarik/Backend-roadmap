# Module 07: Capstone: End-to-End Baseline ML Pipeline

> **Prerequisites:** Modules [00](../00-what-is-machine-learning/README.md) to [06](../06-probability-calibration-and-error-analysis/README.md) of this track.  
> **Estimated Time to Complete:** 6 to 10 hours  
> **Target Audience:** Anyone who has worked through Track 01 and wants to prove, to a checker that cannot be argued with, that they can build a baseline that is honest

> [!TIP]
> **The Golden Rule of a Baseline Pipeline:** The first model's job is not to be clever; it is to be **honest**. Use only what is known at the moment of prediction, remove what would let the model cheat, validate the way it will be used (the past predicting the future), compare with a simple rule, make the probabilities mean what they say, choose the threshold from costs, and find where it fails. A baseline that does all of that is worth more than a better-scoring model that does not, because it is the yardstick for everything that comes after.

---

## Why This Matters

Every module of this track taught one way in which an evaluation lies: a model that memorizes (Module 00), the wrong question (01), leakage (02), a noisy or optimistic estimate (03), overfitting (04), the wrong metric (05), probabilities that do not mean what they say and failures hidden by an average (06). In real projects these errors arrive together, in one data set, and the first model built on that data becomes the number everyone remembers.

This capstone gives you such a data set, with every trap of the track built in on purpose, and a **checker** that trains your pipeline, scores it on customers who signed up **after** your data ends, and compares what you claimed with what happened. A pipeline that looks excellent in a notebook (cross-validated average precision **0.861**) is in this module too; on future customers it scores **0.174** and passes 2 of 8 checks. The reference pipeline claims 0.171, scores 0.239 and passes all 8.

---

## 1. The Brief

A subscription service wants to call customers who are likely to cancel within 90 days and offer them a retention deal. You have one row per customer who signed up in months 1 to 18 and whether they cancelled (`churned`). Build the pipeline that scores new customers.

**Costs, given by the business:** a churner nobody called costs **30**; a retention call costs **2** whether or not the customer would have left.

**Deliverables:**

1. `solution.py` with `train(frame)` returning a fitted model and `predict_proba(model, frame)` returning one probability of churn per row. The checker calls both.
2. `report.json`, written by your `solution.py`, with these keys:

| Key | What it must contain |
| :--- | :--- |
| `split` | How you validated, in words |
| `features` | The columns your model uses |
| `duplicate_rows_removed` | How many exact duplicate rows you dropped |
| `cv_average_precision` | Your estimate of average precision on future customers: `mean` and `std` |
| `baseline_average_precision` | What simple baselines score with the same validation |
| `threshold`, `threshold_reason` | The probability above which you call, and why |
| `slices`, `weakest_slice` | Average precision by region, and the region where the model is weakest |

**The data dictionary:**

| Column | Meaning | Known at prediction time? |
| :--- | :--- | :--- |
| `customer_id`, `household_id` | Identifiers | Yes, but they carry no transferable signal |
| `signup_month` | 1 to 18 in your data; the checker's customers are months 19 to 24 | Yes |
| `region`, `device`, `plan`, `monthly_fee` | Account details | Yes |
| `tenure_months`, `support_calls_90d`, `usage_hours_30d`, `late_payments_12m` | Behaviour so far | Yes |
| `cancellation_ticket` | 1 if the customer opened a cancellation request | **Read the description again** |
| `churned` | 1 if the customer cancelled within 90 days | The label |

The data is generated, so that the checker can produce future customers by the same process; nothing in it is a real person.

---

## 2. The Files

Everything is plain Python with pandas and scikit-learn (the same environment as Modules 00 to 06: Python 3.13.14, scikit-learn 1.9.1, NumPy 2.5.5, pandas 3.1.1). This capstone is Python only: the checker imports your pipeline and trains it in the same process.

### The data generator: `churn_data.py`

```python
"""The capstone's data: a subscription service's customers, one row per customer, and whether they cancelled within 90 days (churned).
It is generated, so that the checker can create 'future' customers the same way, and it contains the traps of this track on purpose:
a column written after the outcome, duplicated rows, households whose members behave alike, a slow drift over time, and one region
where the recorded features say nothing about churn. Usage: python churn_data.py  (writes churn_train.csv: signup months 1 to 18)"""
import csv
import math
import random

COLUMNS = ["customer_id", "household_id", "signup_month", "region", "device", "plan", "monthly_fee", "tenure_months",
           "support_calls_90d", "usage_hours_30d", "late_payments_12m", "cancellation_ticket", "churned"]
PLANS = {"basic": 9.0, "plus": 15.0, "pro": 29.0}


def generate(seed, first_month, last_month, customers_per_month=400):
    rng = random.Random(seed)
    rows, customer, household = [], 0, 0
    for month in range(first_month, last_month + 1):
        made = 0
        while made < customers_per_month:
            household += 1
            family_effect = rng.gauss(0, 1.0)  # members of one household share habits, so they churn alike
            for _ in range(rng.choice([1, 1, 1, 2, 2, 3])):
                customer += 1
                made += 1
                region = rng.choice(["north", "south", "east", "west"])
                plan = rng.choices(list(PLANS), weights=[5, 3, 2])[0]
                tenure = rng.randint(1, 60)
                calls = min(12, int(rng.expovariate(0.6)))
                usage = round(max(0.0, rng.gauss(30, 14)), 1)
                late = min(6, int(rng.expovariate(1.1)))
                if region == "west":  # the recorded features carry no signal for these customers
                    logit = -2.0 + 0.6 * family_effect
                else:
                    logit = (-2.2 + 0.80 * late + 0.40 * calls - 0.045 * usage - 0.025 * tenure
                             + {"basic": 0.3, "plus": 0.0, "pro": -0.4}[plan] + 0.015 * (month - 12) + 0.6 * family_effect)
                churned = 1 if rng.random() < 1 / (1 + math.exp(-logit)) else 0
                ticket = 1 if rng.random() < (0.93 if churned else 0.02) else 0  # opened when the customer asks to cancel: after the fact
                rows.append([f"C{seed % 1000:03d}{customer:06d}", f"H{seed % 1000:03d}{household:06d}", month, region,
                             rng.choice(["ios", "android", "web"]), plan, PLANS[plan], tenure, calls, usage, late, ticket, churned])
                if rng.random() < 0.04:  # the same customer exported twice
                    rows.append(list(rows[-1]))
    return rows


def write(path, rows):
    with open(path, "w", newline="", encoding="utf-8") as handle:
        out = csv.writer(handle)
        out.writerow(COLUMNS)
        out.writerows(rows)


if __name__ == "__main__":
    rows = generate(seed=2026, first_month=1, last_month=18)
    write("churn_train.csv", rows)
    print(f"wrote churn_train.csv: {len(rows)} rows, {sum(r[-1] for r in rows) / len(rows):.1%} churned")
```

```text
$ python churn_data.py
wrote churn_train.csv: 7500 rows, 7.4% churned
```

Read it once to understand the data, then work only from `churn_train.csv` as you would with a real export.

### Your starting point: `solution.py`

```python
"""Your capstone pipeline. Fill in the three functions, run `python solution.py` to write report.json, then `python check_capstone.py`.
The checker calls train() on churn_train.csv and predict_proba() on customers who signed up later, so both must work on a pandas DataFrame
with the columns of churn_train.csv (the future rows have no 'churned' column, and their cancellation_ticket is always 0)."""
import json

import pandas as pd


def train(frame: pd.DataFrame):
    """Return a fitted model. Decide what to do with duplicates, which columns are legitimate, and how to get calibrated probabilities."""
    raise NotImplementedError


def predict_proba(model, frame: pd.DataFrame):
    """Return one probability of churn per row of `frame`, in order."""
    raise NotImplementedError


def build_report(data: pd.DataFrame) -> dict:
    """Evaluate honestly and return the report. Required keys: split, features, duplicate_rows_removed,
    cv_average_precision {mean, std}, baseline_average_precision, threshold, threshold_reason, slices, weakest_slice."""
    raise NotImplementedError


if __name__ == "__main__":
    report = build_report(pd.read_csv("churn_train.csv"))
    json.dump(report, open("report.json", "w", encoding="utf-8"), indent=2)
    print(json.dumps(report, indent=2))
```

### The checker: `check_capstone.py`

```python
"""The capstone checker. It trains YOUR pipeline (solution.py) on churn_train.csv, scores it on customers who signed up AFTER the training
data (months 19 to 24, generated by the same process), and checks your report.json against what really happened.
Usage: python check_capstone.py [solution_module]   (default: solution)"""
import importlib
import json
import sys

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

from churn_data import COLUMNS, generate

MISSED_CHURNER, CONTACT = 30.0, 2.0  # the costs given in the brief: a churner nobody called, and one retention call
REGIONS = ["east", "north", "south", "west"]


def ece(probability, label, bins=10):
    index = np.minimum((probability * bins).astype(int), bins - 1)
    total = 0.0
    for b in range(bins):
        mask = index == b
        if mask.any():
            total += mask.mean() * abs(probability[mask].mean() - label[mask].mean())
    return total


def cost(probability, label, threshold):
    called = probability >= threshold
    return float(((~called) & (label == 1)).sum() * MISSED_CHURNER + called.sum() * CONTACT)


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "solution"
    solution = importlib.import_module(name)
    report = json.load(open(f"report_{name}.json" if name != "solution" else "report.json", encoding="utf-8"))
    train = pd.read_csv("churn_train.csv")
    future = pd.DataFrame(generate(seed=7, first_month=19, last_month=24, customers_per_month=1000), columns=COLUMNS).drop_duplicates()
    y = future["churned"].to_numpy()
    # At the moment of prediction a customer has not asked to cancel yet: the ticket column is empty for everyone.
    future["cancellation_ticket"] = 0

    model = solution.train(train)
    p = np.asarray(solution.predict_proba(model, future.drop(columns=["churned"])), dtype=float)
    probe = future.drop(columns=["churned"]).copy()
    probe["cancellation_ticket"] = 1
    p_probe = np.asarray(solution.predict_proba(model, probe), dtype=float)  # if the model reads the column, its answers move

    future_ap = average_precision_score(y, p)
    rule_ap = average_precision_score(y, future["late_payments_12m"] + future["support_calls_90d"])
    by_region = {r: average_precision_score(y[future["region"] == r], p[(future["region"] == r).to_numpy()]) for r in REGIONS}
    exact_duplicates = int(train.duplicated().sum())
    threshold = float(report.get("threshold", 0.5))

    checks = [
        ("no column recorded after the outcome is used",
         "cancellation_ticket" not in report.get("features", []) and float(np.max(np.abs(p - p_probe))) < 1e-9,
         f"largest change in a prediction when cancellation_ticket is set to 1: {float(np.max(np.abs(p - p_probe))):.4f}"),
        ("the exact duplicate rows were found and removed",
         report.get("duplicate_rows_removed") == exact_duplicates,
         f"report says {report.get('duplicate_rows_removed')}, the training file has {exact_duplicates}"),
        ("the reported estimate is honest (within 0.10 of the future average precision)",
         abs(report["cv_average_precision"]["mean"] - future_ap) <= 0.10,
         f"reported {report['cv_average_precision']['mean']:.3f}, on future customers {future_ap:.3f}"),
        ("the split is described as time- or group-aware",
         any(word in report.get("split", "").lower() for word in ("time", "month", "group", "household")),
         f"split: {report.get('split', '')!r}"),
        ("the model beats the simple rule (late payments + support calls) on future customers",
         future_ap > rule_ap,
         f"model {future_ap:.3f}, rule {rule_ap:.3f}"),
        ("the probabilities are calibrated (ECE at most 0.04 on future customers)",
         ece(p, y) <= 0.04,
         f"ECE {ece(p, y):.4f}"),
        ("the threshold is chosen from the costs (no worse than 0.5 on future customers)",
         cost(p, y, threshold) <= cost(p, y, 0.5),
         f"cost at your threshold {threshold:.2f}: {cost(p, y, threshold):,.0f}; at 0.50: {cost(p, y, 0.5):,.0f}; calling nobody: {cost(p, y, 2.0):,.0f}"),
        ("the weakest region is found",
         report.get("weakest_slice") == min(by_region, key=by_region.get),
         "future average precision by region: " + ", ".join(f"{r} {v:.3f}" for r, v in by_region.items())),
    ]
    passed = 0
    for title, ok, detail in checks:
        passed += bool(ok)
        print(f"[{'PASS' if ok else 'FAIL'}] {title}\n        {detail}")
    print(f"\n{passed} of {len(checks)} checks passed")


if __name__ == "__main__":
    main()
```

The checker generates customers for months **19 to 24** (1,000 a month, a different random seed), sets `cancellation_ticket` to 0 for all of them because nobody has asked to cancel at the moment of prediction, trains your pipeline on `churn_train.csv`, and runs eight checks:

| Check | What it tests | Module |
| :--- | :--- | :--- |
| No after-the-fact column | Your predictions do not change when `cancellation_ticket` is set to 1 | 02 |
| Duplicates removed | Your count equals the number of exact duplicate rows | 02 |
| An honest estimate | Your reported average precision is within 0.10 of the future one | 02, 03 |
| A time- or group-aware split | Your `split` says how you respected time or households | 02, 03 |
| Beats a simple rule | Average precision above the rule "late payments + support calls" | 00, 05 |
| Calibrated | Expected calibration error at most 0.04 on future customers | 06 |
| Threshold from costs | The cost at your threshold is no worse than at 0.5 | 05 |
| The weakest slice | Your `weakest_slice` is the region with the lowest future average precision | 06 |

---

## 3. Milestones

Work in this order. Each step names the module that teaches it.

1. **Frame it (Module 01).** Write down T, E and P: what is predicted, for whom, at what moment, and what decision it drives. What does a cancellation ticket mean in time?
2. **Inspect the data (Module 02).** Count rows, customers, households, exact duplicates, the churn rate by month and by region. Find the columns that would not exist at the moment of prediction.
3. **Design the validation (Modules 02, 03).** Your model will score customers who sign up later. Make your validation do the same, and check whether households can cross your split.
4. **Build the baselines (Modules 00, 05).** The positive rate, and a simple rule. Score them with your validation.
5. **Fit a first model (Module 04).** A simple, regularized model first; read the learning curve before reaching for a bigger one.
6. **Calibrate (Module 06).** Check the reliability of the probabilities on held-out data and calibrate on data the model did not train on.
7. **Choose the threshold (Module 05).** From the costs of 30 and 2, on validation predictions.
8. **Slice the errors (Module 06).** Average precision by region (and anything else you suspect); name the weakest slice.
9. **Write `report.json` and run the checker.** Read every failing line as a finding about your pipeline, not about the checker.

---

## 4. The Pipeline That Looks Good in a Notebook

Here is a pipeline that many first attempts resemble: every column, a random 5-fold split, a random forest, a threshold of 0.5.

```python
"""The pipeline that looks good in a notebook: every column, a random split, a default threshold. It is here to show what the checker catches."""
import json

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import average_precision_score
from sklearn.model_selection import KFold, cross_val_predict

DROP = ["customer_id", "household_id", "churned"]


def features(frame):
    return pd.get_dummies(frame.drop(columns=[c for c in DROP if c in frame.columns]), columns=["region", "device", "plan"], dtype=float)


def train(frame):
    X = features(frame)
    model = RandomForestClassifier(n_estimators=200, random_state=0).fit(X, frame["churned"])
    model.columns_ = list(X.columns)
    return model


def predict_proba(model, frame):
    return model.predict_proba(features(frame).reindex(columns=model.columns_, fill_value=0.0))[:, 1]


if __name__ == "__main__":
    data = pd.read_csv("churn_train.csv")
    X, y = features(data), data["churned"]
    oof = cross_val_predict(RandomForestClassifier(n_estimators=200, random_state=0), X, y, cv=KFold(5, shuffle=True, random_state=0), method="predict_proba")[:, 1]
    by_region = {r: average_precision_score(y[data.region == r], oof[(data.region == r).to_numpy()]) for r in sorted(data.region.unique())}
    report = {"split": "random 5-fold", "features": list(X.columns), "duplicate_rows_removed": 0,
              "cv_average_precision": {"mean": float(average_precision_score(y, oof)), "std": 0.0},
              "threshold": 0.5, "weakest_slice": min(by_region, key=by_region.get)}
    json.dump(report, open("report_naive.json", "w", encoding="utf-8"), indent=2)
    print(json.dumps(report["cv_average_precision"]), report["weakest_slice"])
```

```text
$ python naive.py
{"mean": 0.8608653758093687, "std": 0.0} west
```

A cross-validated average precision of **0.861** looks like an excellent model. The checker disagrees:

```text
$ python check_capstone.py naive
[FAIL] no column recorded after the outcome is used
        largest change in a prediction when cancellation_ticket is set to 1: 0.9600
[FAIL] the exact duplicate rows were found and removed
        report says 0, the training file has 296
[FAIL] the reported estimate is honest (within 0.10 of the future average precision)
        reported 0.861, on future customers 0.174
[FAIL] the split is described as time- or group-aware
        split: 'random 5-fold'
[FAIL] the model beats the simple rule (late payments + support calls) on future customers
        model 0.174, rule 0.196
[FAIL] the probabilities are calibrated (ECE at most 0.04 on future customers)
        ECE 0.0841
[PASS] the threshold is chosen from the costs (no worse than 0.5 on future customers)
        cost at your threshold 0.50: 17,550; at 0.50: 17,550; calling nobody: 17,550
[PASS] the weakest region is found
        future average precision by region: east 0.181, north 0.190, south 0.339, west 0.149

2 of 8 checks passed
```

What each failure means:

- **The model reads `cancellation_ticket`.** Setting it to 1 moves a prediction by 0.96. In training, a ticket is almost the label itself; at the moment of prediction nobody has opened one, so the model's best signal is gone.
- **On future customers it scores 0.174**, below the simple rule (0.196). The 0.861 measured the leak, not churn.
- **Its probabilities are not calibrated** for the world it will meet (ECE 0.0841), and with every future customer below 0.5 the threshold of 0.5 calls **nobody**: the cost is the same as doing nothing (17,550). The threshold check "passes" only because 0.5 is compared with itself; a threshold is not a decision until a cost chose it.
- **Duplicates were not counted and the split ignored time.** Each would inflate the estimate on its own; here the leak dwarfs them.

---

## 5. Stretch Goals

Once your pipeline passes all eight checks:

1. **Measure each trap separately.** Starting from your pipeline, put back one mistake at a time (the ticket column, a random split, the duplicates, no calibration) and record which checks fail and how far the estimate moves.
2. **A stronger model.** Try gradient boosting with the same validation. Does it beat your baseline on future customers by more than the noise between folds? Is it as well calibrated?
3. **Drift.** The checker's months are later than yours. Compare your validation folds month by month; is the churn rate moving? What does a model that uses `signup_month` do differently from one that does not, and which model families can follow a trend beyond the months they saw?
4. **The weakest region.** Look at the customers of the weakest region. Is anything in the recorded features related to their churn at all? What would you ask the business to start recording?
5. **Households.** Members of one household behave alike. Show whether a household-level feature (computed only from information available at prediction time) helps, and how you would validate it without leakage.

---

## 6. Reflection Questions

Answer these in a paragraph each, as you would in a design review:

1. Why did the naive pipeline's estimate (0.861) fail so badly on future customers, and which single sentence in the data dictionary should have stopped it?
2. Your validation estimate and the future score will not be equal. In which direction would you rather be wrong, and why?
3. What did the simple rule teach you about how much signal the features carry?
4. A manager asks for "the model's accuracy". What do you answer instead, and with which numbers?
5. The weakest region's churn cannot be predicted from these features. What do you recommend: exclude it, treat it with a rule, or collect new data? What are the risks of each?

---

## 7. A Reference Pipeline (Open It After Your Own Attempt)

<details><summary>reference.py, its report, and the checker's verdict</summary>

```python
"""A reference pipeline that passes every check: duplicates removed, no after-the-fact column, forward-in-time validation, a baseline, calibrated
probabilities, a threshold from the costs, and a slice report. Run: python reference.py  (writes report_reference.json)"""
import json

import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

NUMERIC = ["signup_month", "monthly_fee", "tenure_months", "support_calls_90d", "usage_hours_30d", "late_payments_12m"]
CATEGORICAL = ["region", "device", "plan"]
LEVELS = {"region": ["east", "north", "south", "west"], "device": ["android", "ios", "web"], "plan": ["basic", "plus", "pro"]}
MISSED_CHURNER, CONTACT = 30.0, 2.0
FOLDS = [(9, 12), (12, 15), (15, 18)]  # train on months 1..a, validate on months a+1..b: always the past predicting the future


def features(frame):
    """Only what is known when a customer signs up and while they are active. Not the ids, not cancellation_ticket (written after the outcome)."""
    columns = [frame[NUMERIC].astype(float)]
    for name in CATEGORICAL:
        columns.append(pd.DataFrame({f"{name}={level}": (frame[name] == level).astype(float) for level in LEVELS[name]}, index=frame.index))
    return pd.concat(columns, axis=1)


def make_model():
    return CalibratedClassifierCV(make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)), method="sigmoid", cv=5)


def train(frame):
    frame = frame.drop_duplicates()
    return make_model().fit(features(frame), frame["churned"])


def predict_proba(model, frame):
    return model.predict_proba(features(frame))[:, 1]


def cost(probability, label, threshold):
    called = probability >= threshold
    return float(((~called) & (label == 1)).sum() * MISSED_CHURNER + called.sum() * CONTACT)


if __name__ == "__main__":
    raw = pd.read_csv("churn_train.csv")
    data = raw.drop_duplicates()
    scores, rule_scores, held_out = [], [], []
    for last_train, last_valid in FOLDS:
        past = data[data.signup_month <= last_train]
        future = data[(data.signup_month > last_train) & (data.signup_month <= last_valid)]
        p = predict_proba(train(past), future)
        scores.append(average_precision_score(future.churned, p))
        rule_scores.append(average_precision_score(future.churned, future.late_payments_12m + future.support_calls_90d))
        held_out.append(future.assign(p=p))
    pooled = pd.concat(held_out)
    grid = np.round(np.arange(0.01, 1.0, 0.01), 2)
    threshold = float(min(grid, key=lambda t: cost(pooled.p.to_numpy(), pooled.churned.to_numpy(), t)))
    by_region = {r: average_precision_score(g.churned, g.p) for r, g in pooled.groupby("region")}
    report = {
        "split": "forward in time by signup month (train on months 1..a, validate on the next three); households never span months",
        "features": list(features(data).columns),
        "duplicate_rows_removed": int(len(raw) - len(data)),
        "cv_average_precision": {"mean": float(np.mean(scores)), "std": float(np.std(scores)), "folds": [round(s, 4) for s in scores]},
        "baseline_average_precision": {"rule: late payments + support calls": float(np.mean(rule_scores)), "positive rate": float(data.churned.mean())},
        "threshold": threshold,
        "threshold_reason": f"minimises {MISSED_CHURNER:.0f} per missed churner + {CONTACT:.0f} per retention call on the forward validation predictions",
        "slices": {r: round(v, 4) for r, v in by_region.items()},
        "weakest_slice": min(by_region, key=by_region.get),
    }
    json.dump(report, open("report_reference.json", "w", encoding="utf-8"), indent=2)
    print(json.dumps(report, indent=2))
```

```text
$ python reference.py
{
  "split": "forward in time by signup month (train on months 1..a, validate on the next three); households never span months",
  "features": [
    "signup_month",
    "monthly_fee",
    "tenure_months",
    "support_calls_90d",
    "usage_hours_30d",
    "late_payments_12m",
    "region=east",
    "region=north",
    "region=south",
    "region=west",
    "device=android",
    "device=ios",
    "device=web",
    "plan=basic",
    "plan=plus",
    "plan=pro"
  ],
  "duplicate_rows_removed": 296,
  "cv_average_precision": {
    "mean": 0.17139276736326906,
    "std": 0.00396590870387727,
    "folds": [
      0.1762,
      0.1714,
      0.1665
    ]
  },
  "baseline_average_precision": {
    "rule: late payments + support calls": 0.14710762028251756,
    "positive rate": 0.07398667406996114
  },
  "threshold": 0.05,
  "threshold_reason": "minimises 30 per missed churner + 2 per retention call on the forward validation predictions",
  "slices": {
    "east": 0.2782,
    "north": 0.3257,
    "south": 0.3456,
    "west": 0.1016
  },
  "weakest_slice": "west"
}
```

```text
$ python check_capstone.py reference
[PASS] no column recorded after the outcome is used
        largest change in a prediction when cancellation_ticket is set to 1: 0.0000
[PASS] the exact duplicate rows were found and removed
        report says 296, the training file has 296
[PASS] the reported estimate is honest (within 0.10 of the future average precision)
        reported 0.171, on future customers 0.239
[PASS] the split is described as time- or group-aware
        split: 'forward in time by signup month (train on months 1..a, validate on the next three); households never span months'
[PASS] the model beats the simple rule (late payments + support calls) on future customers
        model 0.239, rule 0.196
[PASS] the probabilities are calibrated (ECE at most 0.04 on future customers)
        ECE 0.0281
[PASS] the threshold is chosen from the costs (no worse than 0.5 on future customers)
        cost at your threshold 0.05: 9,688; at 0.50: 17,344; calling nobody: 17,550
[PASS] the weakest region is found
        future average precision by region: east 0.396, north 0.311, south 0.423, west 0.155

8 of 8 checks passed
```

What it does, and why:

- **Features:** everything known at sign-up and during the customer's life so far, **including `signup_month`**, and nothing written after the outcome. A linear model can follow a slow trend in the month beyond the training months; a tree cannot (Module 02, Workflow 3).
- **Validation:** three forward folds (train on months 1 to 9, 12 and 15; validate on the next three months). Households are created within a month, so they never straddle a fold.
- **Baseline:** the simple rule scores 0.147 on average across the folds (0.170, 0.155, 0.117); the model beats it in every fold (0.176, 0.171, 0.167).
- **Calibration:** a logistic regression wrapped in sigmoid calibration with internal cross-validation; ECE on future customers 0.0281.
- **Threshold:** 0.05, chosen from the costs on the forward validation predictions. On future customers it costs **9,688** against 17,344 at a threshold of 0.5 and 17,550 for calling nobody.
- **Slices:** the west region has the lowest average precision (0.102 in validation, 0.155 on future customers) because its churn is not related to the recorded features.
- **Honesty, not precision:** the estimate (0.171) is lower than the future score (0.239). The future months have a slightly higher churn rate, and average precision rises with the base rate (Module 05); a pessimistic estimate of this size is acceptable, an optimistic one is not.

</details>

---

## Further Reading and Sources

- [Zinkevich, "Rules of Machine Learning: Best Practices for ML Engineering"](https://developers.google.com/machine-learning/guides/rules-of-ml) — Rule #4, "keep the first model simple and get the infrastructure right", is the spirit of this capstone.
- [scikit-learn: Common pitfalls and recommended practices](https://scikit-learn.org/stable/common_pitfalls.html) — the leakage rules the checker enforces.
- [scikit-learn: Probability calibration](https://scikit-learn.org/stable/modules/calibration.html) — the calibration methods used in the reference.
- [Kapoor and Narayanan, "Leakage and the Reproducibility Crisis in ML-based Science" (arXiv 2207.07048)](https://arxiv.org/abs/2207.07048) — why a feature recorded after the outcome is the most common leak of all.

## Next

You have finished Track 01. Return to the **[Track 01 Overview](../README.md)**, or continue with **[Track 02: Math for Machine Learning](../../02-math-for-machine-learning/README.md)**.
