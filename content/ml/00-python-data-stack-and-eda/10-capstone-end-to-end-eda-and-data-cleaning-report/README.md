# Module 10: Capstone: End-to-End EDA Report & Clean Parquet Dataset

> **Prerequisites:** Modules [00](../00-jupyter-uv-and-reproducible-data-environments/README.md) to [09](../09-systematic-eda-univariate-bivariate-and-leakage-checks/README.md) of this track.  
> **Estimated Time to Complete:** 4 to 8 hours  
> **Target Audience:** Anyone who has worked through Track 00 and wants to prove, to a checker that cannot be argued with, that they can turn a raw export into data a model can trust

> [!TIP]
> **The Golden Rule of a Clean Data Set:** Every value in the output should mean exactly what the source meant, and every row of the input should be **accounted for**. Read without guessing, decide each column's meaning explicitly, remove only what is provably a duplicate, **flag** what is unusual instead of deleting it, name the columns that are only known after the outcome, and write it all down in a report a reviewer can check.

---

## Why This Matters

Every module of this track showed one way in which data changes meaning on its way into an analysis: a reproducible environment (Module 00), types and memory (01), indexing and broadcasting (02), accumulated rounding (03), guessed types on import (04), joins and groupings that change row counts (05), sentinels, Unicode, dates and outliers (06), size limits that drop rows silently (07), charts that hide the denominator (08), and features that predict the label because they were recorded after it (09). In a real export these problems arrive together.

This capstone gives you such an export, with problems from every module built in on purpose, and a **checker** that runs your cleaner, reads the Parquet file it writes, and compares every row with the table the export should have become. A cleaner that looks reasonable (read with the defaults, drop duplicate rows, remove the top 1% of amounts) is in this module too; it passes **1 of 8** checks. The reference cleaner passes all 8.

---

## 1. The Brief

A marketplace exports its orders every quarter as a CSV file for the analytics team. You have the export for January to March 2026, `orders_raw.csv`. Produce the clean table that the analytics team and a future returns model will use, and a report that lets a reviewer trust it.

**Deliverables:**

1. `clean.py` with a function `clean(raw_path, out_path)` that writes the clean table to `out_path` as **Parquet** and returns the **report** as a dictionary. The checker calls it.
2. The clean table must have the raw columns, cleaned, plus a boolean column `amount_is_extreme`.
3. The report must contain:

| Key | What it must contain |
| :--- | :--- |
| `rows_in`, `rows_out` | Rows read and rows written |
| `removed` | `{reason: rows}` for every row removed; the counts must add up to `rows_in - rows_out` |
| `duplicates_removed` | How many rows were duplicates |
| `after_outcome_columns` | The columns that are only filled after the outcome (a return) is known |
| `extreme_rule` | How `amount_is_extreme` is decided, in words |
| `return_rate_by_channel` | For each of `web`, `app`, `partner`, `phone`: `orders` and `returns` |

**The data dictionary** (this is what the source system's owners tell you):

| Column | Meaning |
| :--- | :--- |
| `order_id` | Identifies an order. An order can appear more than once in an export. |
| `customer_email` | As typed by the customer; case and spaces are not significant |
| `zip` | Postal code, always 5 characters |
| `country` | ISO 3166 two-letter code (IN, US, NA, GB, BR) |
| `city` | City name, as entered |
| `ordered_at` | When the order was placed. Times with an offset are local times at that offset. Times written day first (`dd/mm/yyyy hh:mm`) without an offset come from the phone team's system and are UTC. |
| `amount` | Order value; `-1` means the amount was not recorded. Free orders have an amount of 0. Business customers place real orders of 10,000 and more. |
| `items` | Number of items; `999` means not recorded |
| `channel` | `web`, `app`, `partner` or `phone`; empty when not recorded |
| `returned` | 1 if the order was returned |
| `refund_issued_at` | Date the refund was issued |

The data is generated, so that the checker knows exactly what the clean table should be; nothing in it is a real person or order.

---

## 2. The Files

Everything is plain Python with pandas and PyArrow (the environment of Modules 00 to 09: Python 3.13.14, pandas 3.1.1, NumPy 2.5.5, PyArrow 26.0.1). This capstone is Python only: the checker imports your cleaner and runs it in the same process.

### The data generator: `orders_data.py`

```python
"""Generates the capstone's raw order export and, for the checker, the clean table it should become. Every problem in the raw
file comes from a module of Track 00. Run it once to write orders_raw.csv:  python orders_data.py"""
import unicodedata

import numpy as np
import pandas as pd

ORDERS = 6_000
CUSTOMERS = 2_500
EXACT_DUPLICATES = 150     # the same line exported twice
RESENT_ORDERS = 60         # the same order exported again with the e-mail address typed differently
COUNTRIES = ["IN", "US", "NA", "GB", "BR"]  # NA is Namibia
COUNTRY_SHARE = [0.40, 0.25, 0.08, 0.15, 0.12]
UTC_OFFSET = {"IN": "+05:30", "US": "-05:00", "NA": "+02:00", "GB": "+00:00", "BR": "-03:00"}
CITIES = ["Pune", "Lagos", "Lima", "São Paulo", "Zürich", "Windhoek"]
CHANNELS = ["web", "app", "partner", "phone"]
RETURN_RATE = {"web": 0.08, "app": 0.06, "partner": 0.10, "phone": 0.07}
AMOUNT_UNKNOWN, ITEMS_UNKNOWN = "-1", "999"   # the export's codes for "not recorded"
LARGE_ORDER_SHARE = 0.005                     # real business orders between 10,000 and 50,000


def generate(seed=2026):
    """Returns (raw CSV text, the clean table it should become)."""
    rng = np.random.default_rng(seed)
    customer = rng.integers(0, CUSTOMERS, ORDERS)
    country = rng.choice(COUNTRIES, ORDERS, p=COUNTRY_SHARE)
    channel = rng.choice(CHANNELS, ORDERS, p=[0.5, 0.35, 0.1, 0.05])
    channel_missing = rng.random(ORDERS) < 0.03
    ordered_at = pd.Timestamp("2026-01-01", tz="UTC") + pd.to_timedelta(rng.integers(0, 90 * 24 * 60, ORDERS), unit="min")
    amount = rng.gamma(2.0, 40.0, ORDERS).round(2)
    amount[rng.random(ORDERS) < 0.01] = 0.0                                       # free orders: real zeros
    large = rng.random(ORDERS) < LARGE_ORDER_SHARE
    amount[large] = rng.uniform(10_000, 50_000, int(large.sum())).round(2)
    amount_unknown = rng.random(ORDERS) < 0.02
    items = rng.integers(1, 6, ORDERS)
    items_unknown = rng.random(ORDERS) < 0.015
    returned = rng.random(ORDERS) < np.array([RETURN_RATE[c] for c in channel])
    refund_days = rng.integers(3, 21, ORDERS)
    decomposed = rng.random(ORDERS) < 0.5
    email_case = rng.random(ORDERS) < 0.15
    email_space = rng.random(ORDERS) < 0.10

    truth = pd.DataFrame({
        "order_id": pd.array([f"O{100_000 + i}" for i in range(ORDERS)], dtype="string"),
        "customer_email": pd.array([f"user{c:04d}@example.com" for c in customer], dtype="string"),
        "zip": pd.array([f"{z:05d}" for z in rng.integers(0, 100_000, ORDERS)], dtype="string"),
        "country": pd.array(country, dtype="string"),
        "city": pd.array(rng.choice(CITIES, ORDERS), dtype="string"),
        "ordered_at": ordered_at,
        "amount": pd.array(np.where(amount_unknown, np.nan, amount), dtype="Float64"),
        "items": pd.array(np.where(items_unknown, pd.NA, items), dtype="Int64"),
        "channel": pd.array(np.where(channel_missing, None, channel), dtype="string"),
        "returned": returned,
        "refund_issued_at": pd.array([str((t + pd.Timedelta(days=int(d))).date()) if r else None
                                      for t, d, r in zip(ordered_at, refund_days, returned)], dtype="string"),
    })

    def raw_email(i):
        e = truth.at[i, "customer_email"]
        if email_case[i]:
            e = e[0].upper() + e[1:].replace("example.com", "Example.com")
        return e + (" " if email_space[i] else "")

    def raw_time(i):
        t = ordered_at[i]
        if channel[i] == "phone":  # the phone team's system writes day-first UTC times with no offset
            return t.strftime("%d/%m/%Y %H:%M")
        offset = UTC_OFFSET[country[i]]
        hours, minutes = int(offset[1:3]), int(offset[4:6])
        sign = 1 if offset[0] == "+" else -1
        local = t.tz_localize(None) + sign * pd.Timedelta(hours=hours, minutes=minutes)
        return local.strftime("%Y-%m-%dT%H:%M:00") + offset

    lines = []
    for i in range(ORDERS):
        city = truth.at[i, "city"]
        lines.append([
            truth.at[i, "order_id"], raw_email(i), truth.at[i, "zip"], country[i],
            unicodedata.normalize("NFD", city) if decomposed[i] else city,
            raw_time(i),
            AMOUNT_UNKNOWN if amount_unknown[i] else f"{amount[i]:.2f}",
            ITEMS_UNKNOWN if items_unknown[i] else str(items[i]),
            "" if channel_missing[i] else channel[i],
            "1" if returned[i] else "0",
            truth.at[i, "refund_issued_at"] if returned[i] else "",
        ])
    for i in rng.choice(ORDERS, EXACT_DUPLICATES, replace=False):
        lines.append(list(lines[i]))
    for i in rng.choice(ORDERS, RESENT_ORDERS, replace=False):
        again = list(lines[i])
        again[1] = again[1].strip().upper() + "  "
        lines.append(again)
    order = rng.permutation(len(lines))
    header = "order_id,customer_email,zip,country,city,ordered_at,amount,items,channel,returned,refund_issued_at"
    text = header + "\n" + "\n".join(",".join(lines[k]) for k in order) + "\n"
    return text, truth


if __name__ == "__main__":
    raw, _ = generate()
    with open("orders_raw.csv", "w", encoding="utf-8", newline="") as f:
        f.write(raw)
    print(f"wrote orders_raw.csv: {raw.count(chr(10)) - 1} rows")
```

```text
$ python orders_data.py
wrote orders_raw.csv: 6210 rows
```

You may read the generator to understand the export, but solve the brief from the data dictionary and the raw file, as you would at work: the checker regenerates the same file and compares your output with the generator's clean table.

### Your starting point: `clean.py`

```python
"""Your cleaner. The checker calls clean(raw_path, out_path): write the clean table to out_path as Parquet and return the report
as a dict. This starting point copies the raw text through unchanged, so the checker runs from the first minute."""
import pandas as pd


def clean(raw_path, out_path):
    raw = pd.read_csv(raw_path, dtype="string", keep_default_na=False)
    df = raw.copy()
    # Your work: duplicates, identifiers, missing values, times, text, extremes. Account for every row you remove.
    df.to_parquet(out_path, index=False)
    return {
        "rows_in": len(raw),
        "rows_out": len(df),
        "removed": {},                 # {"reason": number of rows}, summing to rows_in - rows_out
        "duplicates_removed": 0,
        "after_outcome_columns": [],   # columns that are only filled after the outcome is known
        "extreme_rule": "",            # how amount_is_extreme is decided
        "return_rate_by_channel": {},  # {"web": {"orders": ..., "returns": ...}, ...}
    }
```

### The checker: `check_capstone.py`

```python
"""The capstone checker. It runs YOUR cleaner (clean.py) on orders_raw.csv, reads the Parquet file it writes and the report it
returns, and compares both with the clean table the generator knows to be right.
Usage: python check_capstone.py [module]   (default: clean)"""
import importlib
import pathlib
import sys

import pandas as pd

from orders_data import CHANNELS, generate

LARGE_ORDER = 10_000.0     # every order at or above this amount is real and must survive, flagged
MAX_FLAGGED_SHARE = 0.02   # a flag that marks more than this share of orders is not a flag


def same(a, b):
    """Equal values, treating missing as equal to missing, whatever the dtypes."""
    a, b = pd.Series(a).astype(object).reset_index(drop=True), pd.Series(b).astype(object).reset_index(drop=True)
    return len(a) == len(b) and bool(((a == b) | (a.isna() & b.isna())).all())


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else "clean"
    module = importlib.import_module(name)
    raw_text, truth = generate()
    raw_path, out_path = pathlib.Path("orders_raw.csv"), pathlib.Path(f"orders_clean_{name}.parquet")
    raw_path.write_text(raw_text, encoding="utf-8", newline="")
    raw_rows = raw_text.count("\n") - 1

    report = module.clean(str(raw_path), str(out_path))
    out = pd.read_parquet(out_path)
    first = out.drop_duplicates("order_id")
    by_id = first.set_index(first["order_id"].astype(str))
    truth_by_id = truth.set_index(truth["order_id"].astype(str))
    common = truth_by_id.index.intersection(by_id.index)
    t, o = truth_by_id.loc[common], by_id.loc[common]
    removed = report.get("removed", {})
    large = truth_by_id.index[truth_by_id["amount"].fillna(0) >= LARGE_ORDER]
    flag = out.get("amount_is_extreme")
    truth_rates = {c: {"orders": int((truth["channel"] == c).sum()), "returns": int(((truth["channel"] == c) & truth["returned"]).sum())}
                   for c in CHANNELS}
    reported_rates = {c: {k: int(v) for k, v in report.get("return_rate_by_channel", {}).get(c, {}).items() if k in ("orders", "returns")}
                      for c in CHANNELS}

    checks = [
        ("every raw row is accounted for",
         report.get("rows_in") == raw_rows and report.get("rows_out") == len(out) and raw_rows - len(out) == sum(removed.values()),
         f"raw {raw_rows}, report rows_in {report.get('rows_in')}, rows_out {report.get('rows_out')}, Parquet {len(out)}, "
         f"removed {sum(removed.values())} ({removed})"),
        ("duplicates removed, and nothing else",
         out["order_id"].is_unique and set(out["order_id"].astype(str)) == set(truth_by_id.index),
         f"{len(out)} rows, {out['order_id'].nunique()} distinct order ids; {len(truth)} real orders, "
         f"{len(set(truth_by_id.index) - set(out['order_id'].astype(str)))} of them missing"),
        ("identifiers are text, with their leading zeros",
         pd.api.types.is_string_dtype(out["zip"]) and same(o["zip"], t["zip"]),
         f"zip dtype {out['zip'].dtype}; first zips {out['zip'].head(3).tolist()}"),
        ("missing means missing, and only that",
         all(int(out[c].isna().sum()) == int(truth[c].isna().sum()) for c in ("amount", "items", "channel", "country"))
         and int((out["country"] == "NA").sum()) == int((truth["country"] == "NA").sum()),
         "missing per column (yours / right): " + ", ".join(f"{c} {int(out[c].isna().sum())}/{int(truth[c].isna().sum())}"
                                                            for c in ("amount", "items", "channel", "country"))
         + f"; Namibia (NA) {int((out['country'] == 'NA').sum())}/{int((truth['country'] == 'NA').sum())}"),
        ("times are UTC instants",
         isinstance(out["ordered_at"].dtype, pd.DatetimeTZDtype) and str(out["ordered_at"].dt.tz) == "UTC"
         and same(o["ordered_at"].dt.tz_convert("UTC") if isinstance(o["ordered_at"].dtype, pd.DatetimeTZDtype) else o["ordered_at"],
                  t["ordered_at"]),
         f"dtype {out['ordered_at'].dtype}; rows equal to the right instant: "
         f"{int((pd.to_datetime(o['ordered_at'], utc=True, errors='coerce') == t['ordered_at']).sum())} of {len(common)}"),
        ("text is normalized (city NFC, e-mail trimmed and lower-case)",
         same(o["city"], t["city"]) and same(o["customer_email"], t["customer_email"]),
         f"distinct cities {out['city'].nunique()} (right: {truth['city'].nunique()}); distinct e-mails "
         f"{out['customer_email'].nunique()} (right: {truth['customer_email'].nunique()})"),
        ("large orders are kept, with their amounts, and flagged",
         flag is not None and all(i in by_id.index for i in large) and same(by_id.loc[large, "amount"], truth_by_id.loc[large, "amount"])
         and bool(by_id.loc[large, "amount_is_extreme"].all()) and float(flag.mean()) <= MAX_FLAGGED_SHARE,
         f"{sum(i in by_id.index for i in large)} of {len(large)} large orders present; "
         + (f"flagged {int(flag.sum())} rows ({float(flag.mean()):.1%})" if flag is not None else "no amount_is_extreme column")),
        ("the outcome-time column is named, and return rates are counted right",
         "refund_issued_at" in report.get("after_outcome_columns", []) and reported_rates == truth_rates,
         f"after_outcome_columns {report.get('after_outcome_columns')}; web returns reported "
         f"{reported_rates['web'].get('returns')}/{reported_rates['web'].get('orders')}, right "
         f"{truth_rates['web']['returns']}/{truth_rates['web']['orders']}"),
    ]
    passed = 0
    for title, ok, detail in checks:
        passed += bool(ok)
        print(f"[{'PASS' if ok else 'FAIL'}] {title}\n        {detail}")
    print(f"\n{passed} of {len(checks)} checks passed")


if __name__ == "__main__":
    main()
```

The checker writes `orders_raw.csv`, calls your `clean()`, reads your Parquet file, and runs eight checks:

| Check | What it tests | Modules |
| :--- | :--- | :--- |
| Every raw row is accounted for | `rows_in`, `rows_out` and `removed` agree with the files | 05, 07 |
| Duplicates removed, and nothing else | One row per real order, and no real order missing | 05, 06 |
| Identifiers are text | `zip` is a string column with its leading zeros | 04 |
| Missing means missing, and only that | `-1`, `999` and empty channels are missing; Namibia's `NA` is not | 04, 06 |
| Times are UTC instants | A time-zone-aware UTC column, equal to the right instant on every row | 06 |
| Text is normalized | City names in Unicode NFC, e-mail addresses trimmed and lower-case | 06 |
| Large orders are kept and flagged | Every order of 10,000 or more is present with its amount and `amount_is_extreme`; at most 2% of rows flagged | 06, 08, 09 |
| Outcome-time column named, rates right | `refund_issued_at` is in `after_outcome_columns`; orders and returns per channel are exact | 09 |

The starting point already passes two of them, because it reads everything as text and removes nothing:

```text
$ python check_capstone.py
[PASS] every raw row is accounted for
        raw 6210, report rows_in 6210, rows_out 6210, Parquet 6210, removed 0 ({})
[FAIL] duplicates removed, and nothing else
        6210 rows, 6000 distinct order ids; 6000 real orders, 0 of them missing
[PASS] identifiers are text, with their leading zeros
        zip dtype string; first zips ['79343', '91369', '40893']
[FAIL] missing means missing, and only that
        missing per column (yours / right): amount 0/103, items 0/99, channel 0/191, country 0/0; Namibia (NA) 515/494
[FAIL] times are UTC instants
        dtype string; rows equal to the right instant: 5670 of 6000
[FAIL] text is normalized (city NFC, e-mail trimmed and lower-case)
        distinct cities 8 (right: 6); distinct e-mails 3416 (right: 2270)
[FAIL] large orders are kept, with their amounts, and flagged
        33 of 33 large orders present; no amount_is_extreme column
[FAIL] the outcome-time column is named, and return rates are counted right
        after_outcome_columns []; web returns reported None/None, right 238/2953

2 of 8 checks passed
```

---

## 3. Milestones

Work in this order. Each step names the module that teaches it.

1. **Set up (Module 00).** A project with `uv`, the versions pinned, the generator and checker in it. Run the checker on the starting point.
2. **Profile the raw file (Modules 04, 09).** Read it as text. For every column: distinct values, the most common values, the shortest and longest strings. Find the codes that mean "not recorded".
3. **Count before you change (Modules 05, 07).** Rows, distinct `order_id`, exact duplicate lines. Decide what makes two rows the same order.
4. **Give each column its meaning (Modules 04, 06).** Identifiers as text, codes to missing, numbers as numbers (nullable where needed), times parsed with explicit formats and stored in UTC.
5. **Normalize text (Module 06).** NFC, trimming and case where the data dictionary says they are not significant, before you look for duplicates.
6. **Flag extremes (Modules 06, 08).** Look at the distribution of `amount` (a log scale helps); choose a rule; flag, do not delete. Check what it flags.
7. **Audit for the outcome (Module 09).** Which columns are filled only for returned orders? Compute return counts per channel.
8. **Write the report and run the checker.** Read every failing line as a finding about your cleaner.

---

## 4. The Cleaner That Looks Reasonable

Here is a cleaner that many first attempts resemble: the default reader, `drop_duplicates()`, a date parse, and the top 1% of amounts removed as outliers.

```python
"""The cleaner many first attempts resemble: read with the defaults, drop duplicate rows, parse the dates, remove the top 1% of
amounts as outliers. It is here to show what the checker catches."""
import pandas as pd


def clean(raw_path, out_path):
    raw = pd.read_csv(raw_path)
    df = raw.drop_duplicates()
    df["ordered_at"] = pd.to_datetime(df["ordered_at"], utc=True, errors="coerce")
    df = df[df["amount"] <= df["amount"].quantile(0.99)]          # "remove outliers"
    df.to_parquet(out_path, index=False)
    rates = df.groupby("channel")["returned"].agg(orders="size", returns="sum")
    return {
        "rows_in": len(raw),
        "rows_out": len(df),
        "removed": {"duplicates": len(raw) - len(raw.drop_duplicates()), "outliers": len(raw.drop_duplicates()) - len(df)},
        "after_outcome_columns": [],
        "return_rate_by_channel": {c: {"orders": int(r.orders), "returns": int(r.returns)} for c, r in rates.iterrows()},
    }
```

```text
$ python check_capstone.py naive
[PASS] every raw row is accounted for
        raw 6210, report rows_in 6210, rows_out 5999, Parquet 5999, removed 211 ({'duplicates': 150, 'outliers': 61})
[FAIL] duplicates removed, and nothing else
        5999 rows, 5939 distinct order ids; 6000 real orders, 61 of them missing
[FAIL] identifiers are text, with their leading zeros
        zip dtype int64; first zips [79343, 91369, 40893]
[FAIL] missing means missing, and only that
        missing per column (yours / right): amount 0/103, items 0/99, channel 192/191, country 495/0; Namibia (NA) 0/494
[FAIL] times are UTC instants
        dtype datetime64[us, UTC]; rows equal to the right instant: 5610 of 5939
[FAIL] text is normalized (city NFC, e-mail trimmed and lower-case)
        distinct cities 8 (right: 6); distinct e-mails 3396 (right: 2270)
[FAIL] large orders are kept, with their amounts, and flagged
        0 of 33 large orders present; no amount_is_extreme column
[FAIL] the outcome-time column is named, and return rates are counted right
        after_outcome_columns []; web returns reported 238/2950, right 238/2953

1 of 8 checks passed
```

What each failure means:

- **Duplicates:** `drop_duplicates()` removed the 150 identical lines but not the 60 orders exported again with the e-mail typed differently, so 60 orders appear twice (5,999 rows, 5,939 distinct ids).
- **Identifiers:** `zip` became `int64`; 02134 is now 2134.
- **Missing values:** `-1` and `999` stayed as numbers (0 missing where 103 and 99 should be); Namibia's `NA` codes became missing values (495 rows, one of them a duplicate).
- **Times:** the default parser read the ISO times and turned the day-first phone times into `NaT` (331 rows); 5,610 of 5,939 orders have the right instant.
- **Text:** 8 cities instead of 6 (two spellings of São Paulo and Zürich in different Unicode forms) and 3,396 e-mail addresses instead of 2,270.
- **Outliers:** removing the top 1% deleted all 33 business orders, and with them 61 real orders in total.
- **The audit:** no outcome-time column was named, and the return counts are off because rows were lost.
- **The one pass** is bookkeeping: the cleaner counted its own removals correctly. Accounting for rows is necessary; it is not sufficient.

---

## 5. Stretch Goals

Once your cleaner passes all eight checks:

1. **An EDA report.** Write `report.md` from your clean table: a profile of every column, return rate by channel with Wilson intervals (Module 08), the distribution of `amount` on a log scale, and the audit findings. Every number in it should come from code you can rerun.
2. **Make the rules configuration.** Move the codes (`-1`, `999`), the time formats, the extreme rule's limit and the outcome-time columns into one configuration file the cleaner reads, so that next quarter's export can change them without editing code.
3. **Fail loudly.** Make the cleaner raise an error, naming the rows, when a time cannot be parsed, a new channel appears, a `zip` is not 5 digits, or the number of duplicates jumps; test each with a modified raw file.
4. **Scale it (Module 07).** Generate a file a hundred times larger (change `ORDERS`), and rewrite the cleaner with Polars LazyFrames or DuckDB. Check that the two cleaners produce the same Parquet file.
5. **Look at the flags.** Your extreme rule flags more than the business orders. Plot what it flags and decide, with reasons, whether free orders and very small amounts should be flagged.

---

## 6. Reflection Questions

Answer these in a paragraph each, as you would in a design review:

1. The naive cleaner removed the top 1% of amounts. Which sentence of the data dictionary should have stopped it, and what would the returns model have learned without business orders?
2. Why must text be normalized before duplicates are counted? What would have happened to the report's `removed` counts otherwise?
3. `refund_issued_at` is in the clean table. Should it be? What would you tell the team that builds the returns model?
4. Which of your decisions would you need the source system's owners to confirm, and how would you record their answers?
5. Next quarter the export has 40% more rows and a new channel, `kiosk`. Which parts of your cleaner break silently, and which loudly?

---

## 7. A Reference Cleaner (Open It After Your Own Attempt)

<details><summary>reference.py, its report, and the checker's verdict</summary>

```python
"""A reference cleaner that passes every check. Read everything as text, decide each column's meaning explicitly, remove only
duplicates, flag extremes instead of dropping them, and account for every row. Run: python check_capstone.py reference"""
import json
import unicodedata

import numpy as np
import pandas as pd

AMOUNT_UNKNOWN, ITEMS_UNKNOWN = "-1", "999"   # the export's codes for "not recorded", from the data dictionary
DAY_FIRST_UTC = r"^\d{2}/\d{2}/\d{4} \d{2}:\d{2}$"   # the phone team's format: day first, UTC, no offset
ROBUST_LIMIT = 3.5                           # robust z-score on log(1 + amount) above which an amount is flagged
AFTER_OUTCOME = ["refund_issued_at"]         # filled only once an order has been returned
CHANNELS = ["web", "app", "partner", "phone"]


def text_key(series):
    return series.map(lambda t: unicodedata.normalize("NFC", t).strip())


def clean(raw_path, out_path):
    raw = pd.read_csv(raw_path, dtype="string", keep_default_na=False)   # nothing guessed, nothing turned into missing
    rows_in = len(raw)

    exact = raw.duplicated()                       # the same line twice, before anything is changed
    df = raw[~exact].copy()
    df["customer_email"] = text_key(df["customer_email"]).str.lower()
    df["city"] = text_key(df["city"])
    resent = df.duplicated("order_id")             # the same order again, with its text written differently
    df = df[~resent].copy()

    df["channel"] = df["channel"].replace("", pd.NA)
    df["amount"] = pd.to_numeric(df["amount"].replace(AMOUNT_UNKNOWN, pd.NA)).astype("Float64")
    df["items"] = pd.to_numeric(df["items"].replace(ITEMS_UNKNOWN, pd.NA)).astype("Int64")
    day_first = df["ordered_at"].str.fullmatch(DAY_FIRST_UTC)
    df["ordered_at"] = pd.Series(pd.NaT, index=df.index, dtype="datetime64[us, UTC]")
    df.loc[day_first, "ordered_at"] = pd.to_datetime(raw.loc[df.index[day_first], "ordered_at"], format="%d/%m/%Y %H:%M", utc=True)
    df.loc[~day_first, "ordered_at"] = pd.to_datetime(raw.loc[df.index[~day_first], "ordered_at"], format="ISO8601", utc=True)
    if df["ordered_at"].isna().any():
        raise ValueError(f"{int(df['ordered_at'].isna().sum())} order times could not be parsed")
    df["returned"] = df["returned"] == "1"
    df["refund_issued_at"] = df["refund_issued_at"].replace("", pd.NA)

    log_amount = np.log1p(df["amount"].astype(float))
    median = log_amount.median()
    mad = (log_amount - median).abs().median()
    df["amount_is_extreme"] = ((log_amount - median).abs() / (1.4826 * mad) > ROBUST_LIMIT).fillna(False).astype(bool)

    df.to_parquet(out_path, index=False)
    report = {
        "rows_in": rows_in,
        "rows_out": len(df),
        "removed": {"exact duplicate lines": int(exact.sum()), "same order exported again": int(resent.sum())},
        "duplicates_removed": int(exact.sum() + resent.sum()),
        "after_outcome_columns": AFTER_OUTCOME,
        "extreme_rule": f"robust z-score of log(1 + amount) above {ROBUST_LIMIT}; flagged, not removed",
        "return_rate_by_channel": {
            c: {"orders": int((df["channel"] == c).sum()), "returns": int(((df["channel"] == c) & df["returned"]).sum()),
                "rate": round(float(df.loc[df["channel"] == c, "returned"].mean()), 4)}
            for c in CHANNELS
        },
    }
    with open("report_reference.json", "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    return report
```

```text
$ python check_capstone.py reference
[PASS] every raw row is accounted for
        raw 6210, report rows_in 6210, rows_out 6000, Parquet 6000, removed 210 ({'exact duplicate lines': 150, 'same order exported again': 60})
[PASS] duplicates removed, and nothing else
        6000 rows, 6000 distinct order ids; 6000 real orders, 0 of them missing
[PASS] identifiers are text, with their leading zeros
        zip dtype string; first zips ['79343', '91369', '40893']
[PASS] missing means missing, and only that
        missing per column (yours / right): amount 103/103, items 99/99, channel 191/191, country 0/0; Namibia (NA) 494/494
[PASS] times are UTC instants
        dtype datetime64[us, UTC]; rows equal to the right instant: 6000 of 6000
[PASS] text is normalized (city NFC, e-mail trimmed and lower-case)
        distinct cities 6 (right: 6); distinct e-mails 2270 (right: 2270)
[PASS] large orders are kept, with their amounts, and flagged
        33 of 33 large orders present; flagged 107 rows (1.8%)
[PASS] the outcome-time column is named, and return rates are counted right
        after_outcome_columns ['refund_issued_at']; web returns reported 238/2953, right 238/2953

8 of 8 checks passed
```

What it does differently:

- **Reads everything as text** with `keep_default_na=False`, so nothing is guessed and nothing becomes missing by accident.
- **Removes exact duplicate lines first (150), then normalizes text, then removes repeated order ids (60)**, and reports the two separately.
- **Turns only the documented codes into missing values**, keeps `NA` as Namibia, and uses nullable dtypes (`Float64`, `Int64`).
- **Parses each time format explicitly** and raises an error if any time is left unparsed.
- **Flags extremes with a robust z-score on a log scale** (above 3.5): 107 rows, 1.8%, made of the 33 business orders, the 55 free orders and 19 amounts under 4. They are flagged, not removed, and stretch goal 5 asks whether all of them should be.

</details>

---

## Further Reading and Sources

- [pandas: `read_csv`](https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html) — `dtype`, `keep_default_na` and `na_values`, the settings this capstone turns on and off.
- [pandas: `to_datetime`](https://pandas.pydata.org/docs/reference/api/pandas.to_datetime.html) — explicit formats and UTC.
- [pandas: Nullable integer data type](https://pandas.pydata.org/docs/user_guide/integer_na.html) — `Int64` and `pd.NA`.
- [Python: `unicodedata.normalize`](https://docs.python.org/3/library/unicodedata.html#unicodedata.normalize) — NFC and the other forms.
- [ISO 3166 country codes](https://www.iso.org/iso-3166-country-codes.html) — why `NA` is a country.

## Next

Track 00 is complete. Continue to **[Track 01: ML Foundations & Evaluation](../../01-ml-foundations-and-evaluation/README.md)**, where clean tables become the first models.
