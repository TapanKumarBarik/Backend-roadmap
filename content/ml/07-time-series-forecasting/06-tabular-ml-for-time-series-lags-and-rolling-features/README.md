# Module 06: Tabular Machine Learning for Time Series — Lags, Rolling Windows, and Leak-Free Feature Pipelines

This module is part of [Track 07: Time Series Forecasting](../README.md).

> **Prerequisites:** [Module 00: Time Series Anatomy](../00-time-series-anatomy-trend-seasonality-stationarity/README.md), [Module 01: Autocorrelation & PACF](../01-autocorrelation-acf-pacf-and-decomposition/README.md), [Module 02: Time Series Cross-Validation & Purging](../02-time-series-cross-validation-and-rolling-windows/README.md).  
> **Estimated Reading Time:** 45 minutes  
> **Target Audience:** Principal Machine Learning Engineers, Feature Store Platform Architects, Quantitative Developers, and Staff Applied Scientists deploying gradient boosted tree models (LightGBM, XGBoost) to high-throughput time series environments.

> [!TIP]
> **The First Commandment of Temporal Feature Engineering:** A feature computed at timestamp $t$ can only ingest observations whose timestamps are strictly $< t$. In standard data frame libraries (Pandas, Polars), a naive `.rolling(window).mean()` includes the contemporaneous value $y_t$ by default (`closed='right'`). If the target is $y_t$, this leaks the target directly into the feature vector, reducing the learning algorithm to an identity function that fails in live serving.

---

## Executive Overview & Industry Context

While deep neural architectures (e.g., Temporal Fusion Transformers, PatchTST) dominate academic benchmarks, **Gradient Boosted Decision Trees (GBDTs)**—specifically **LightGBM**, **XGBoost**, and **CatBoost**—remain the dominant workhorses of industrial time series forecasting:
1. **The M5 Forecasting Competition Verdict:** In the landmark Makridakis M5 Competition forecasting 42,840 hierarchical Walmart retail SKUs, the top 50 winning solutions were built almost exclusively on LightGBM architectures utilizing deep lag and rolling window feature stores.
2. **Tabular Robustness:** Tree ensembles handle heterogeneous tabular modalities seamlessly: continuous telemetry signals, categorical entity embeddings (store IDs, department hierarchies), calendar Fourier cycles, and promotional boolean indicators without requiring input normalization or stationarity differencing.
3. **Serving Latency & Inference Velocity:** A trained LightGBM model can evaluate 500,000 SKU forecasts in under 20 milliseconds via parallelized C++ inference engines or Treelite compilation, satisfying sub-second SLA requirements in dynamic pricing and real-time inventory management.

However, transforming an unrolled chronological sequence into a tabular matrix $X_{t-k} \to Y_{t+h}$ introduces severe operational risks: subtle window lookahead leaks, cold-start imputation artifacts, and expanding-window memory divergence.

---

## Production Incident Post-Mortem: The \$2.2M Logistics Fleet Scheduling Disaster

### Incident Context
A multinational third-party logistics (3PL) provider operated an automated fleet dispatching service managing 12,000 freight trucks across 85 metropolitan hubs. To optimize tractor-trailer deadhead miles (empty transit) and driver dispatch schedules, the engineering team deployed a LightGBM regressor to forecast hourly freight package volume 24 hours in advance for each hub.

The feature engineering pipeline was refactored into an Apache Spark streaming feature store to generate real-time rolling statistics across historical shipment logs.

### The Failure Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Stream as Kafka Telemetry Ingress
    participant FeatStore as Spark Rolling Feature Store
    participant GBDT as LightGBM Forecast Microservice
    participant Dispatch as Fleet Dispatching Engine
    participant OpsBridge as VP Operations Control Center

    Stream->>FeatStore: Stream hourly package volume records
    Note over FeatStore: Data engineering refactors: df.groupBy().rolling("24h").mean()
    Note over FeatStore: CRITICAL BUG: Window defaults to closed='right' (Includes contemporaneous y_t)
    FeatStore->>GBDT: Ingest training table: Feature 'vol_rolling_mean_24h' contains y_t!
    Note over GBDT: Model assigns 91% feature importance to 'vol_rolling_mean_24h' (R^2 = 0.992)
    GBDT->>Dispatch: Deploy to production serving
    Note over Dispatch: At serving time t, actual package volume y_t is unknown (Feature evaluates to NaN or stale lag)
    Dispatch->>Dispatch: Model outputs catastrophic under-forecasts (-78% package volume)
    Dispatch->>Dispatch: Cancel 2,800 scheduled freight truck routes across Midwest hubs
    Note over Stream: Packages pile up at fulfillment centers -- massive regional freight gridlock
    OpsBridge-->>GBDT: Emergency Sev-0: \$2.24M SLA breach penalties & third-party carrier spot surcharges
```

### Root Cause Analysis
1. **Contemporaneous Target Leakage via Right-Closed Windows:** In the Spark/Pandas refactoring, the rolling window aggregation was written as:
   ```python
   # THE CATASTROPHIC LEAK: Includes current timestamp record y_t!
   df["vol_rolling_mean_24h"] = df["volume"].rolling(window=24).mean()
   ```
   Because the window was closed on the right (`closed='right'`), the feature for timestamp $t$ was:
   $$\text{vol\_rolling\_mean\_24h}(t) = \frac{1}{24} \left( y_t + y_{t-1} + \dots + y_{t-23} \right)$$
   When training the model to predict $y_t$, the target value was directly embedded inside the primary training feature.
2. **Model Shortcut Learning:** LightGBM identified that predicting $\hat{y}_t = 24 \times \text{vol\_rolling\_mean\_24h} - \sum_{i=1}^{23} y_{t-i}$ yielded zero training error. The model discarded all weather covariates, macro indicators, and calendar features, learning an identity shortcut.
3. **Live Serving Collapse:** In real-time production serving at timestamp $t$, the current volume $y_t$ had not yet materialized. The feature store imputed the missing value with 0 or a stale historical lag. The model's predictions collapsed, causing the automated dispatch system to cancel 2,800 scheduled long-haul truck routes. Distribution centers reached physical capacity limits within 18 hours, costing the company \$2.24M in spot-freight carrier surcharges and contractual delivery penalties.

### Remediation Architecture
1. **Mandatory Left-Closed Window Invariant:** Enforced strict pipeline linting rules requiring explicit lag shifts prior to any rolling aggregation:
   ```python
   # SAFE INVARIANT: Exclude current timestamp y_t
   df["vol_rolling_mean_24h"] = df["volume"].shift(1).rolling(window=24).mean()
   ```
2. **Automated Target Permutation Test:** Integrated an automated CI/CD pipeline check: permuting the target variable $y$ randomly across training records must cause the validation score of any legitimate feature pipeline to collapse to zero ($R^2 \approx 0$). If $R^2$ remains high, target leakage is present.
3. **Feature-to-Target Timeline Validation:** Mandated that all engineered features possess explicit `effective_timestamp` metadata strictly earlier than the target's `prediction_start_timestamp`.

---

## 1. Mathematical Mental Model & Theoretical Foundations

```
========================================================================================
                          TABULAR TIME SERIES FEATURE TAXONOMY
========================================================================================
Temporal Stream y_t ──> [ Autoregressive Lags ]      : y_{t-1}, y_{t-2}, y_{t-7}, y_{t-14}
                    ──> [ Rolling Window Stats ]     : Mean, Std, Min, Max, Quantiles, Skew
                    ──> [ Exponentially Weighted ]   : EWMA(\alpha=0.1), EWMStd(\alpha=0.3)
                    ──> [ Cyclical Calendar Encodings]: \sin(2\pi t / P), \cos(2\pi t / P)
                    ──> [ Domain / Exogenous Covariates]: Price elasticity, Promotions, Weather
========================================================================================
```

### 1.1 Sequence-to-Tabular Supervised Formulation

Let a univariate time series observed up to timestamp $t$ be $\{y_1, y_2, \dots, y_t\}$, accompanied by a vector of exogenous time-varying covariates $\mathbf{x}_t \in \mathbb{R}^d$.

Our objective is to forecast the future target value $h$ steps ahead:

$$\hat{y}_{t+h} = f(\mathbf{z}_t)$$

where $\mathbf{z}_t \in \mathbb{R}^D$ is a tabular feature vector synthesized strictly from the historical filtration $\mathcal{F}_t = \sigma(\{y_s, \mathbf{x}_s\}_{s \le t})$.

```mermaid
flowchart LR
    subgraph RawTemporalStream["Raw Temporal Ingestion"]
        YStream["Target Stream y_s (s <= t)"]
        XStream["Exogenous Stream x_s (s <= t)"]
    end

    subgraph FeaturePipeline["Leak-Free Feature Store Processing"]
        ShiftGate["Shift Barrier: y_{t-1} = Shift(y_t, 1)"]
        YStream --> ShiftGate
        ShiftGate --> Lags["Autoregressive Lags:<br/>L_1, L_2, L_7, L_14"]
        ShiftGate --> Rolling["Rolling Statistics (W=7, 30):<br/>Mean, Std, Min, Max, Skew"]
        ShiftGate --> EWMA["Exponentially Weighted Stats:<br/>EWMA(\alpha=0.1, 0.3)"]
        XStream --> Calendar["Cyclical Encodings:<br/>Sin/Cos Fourier Transforms"]
    end

    subgraph TabularModel["Supervised Tabular Engine"]
        Lags --> MatrixAssembler["Tabular Feature Row z_t"]
        Rolling --> MatrixAssembler
        EWMA --> MatrixAssembler
        Calendar --> MatrixAssembler
        MatrixAssembler --> GBDT["Gradient Boosted Trees (LightGBM)<br/>Objective: Minimize L(y_{t+h}, f(z_t))"]
    end
```

---

### 1.2 Mathematical Derivations of Feature Classes

#### 1. Autoregressive Lag Features
The simplest and most informative features in stationary or trend-stationary processes are pure historical lags:

$$L_k(t) = y_{t-k} \quad \text{for } k \ge 1$$

- **Lag Selection Criteria:** Rather than generating 100 consecutive lags (which introduces severe multi-collinearity), lags are selected based on:
  1. Significant spikes in the **Partial Autocorrelation Function (PACF)** ($|\phi_{k,k}| > 1.96/\sqrt{N}$).
  2. Physical seasonal periods: for hourly data, $k \in \{1, 2, 3, 24, 48, 168\}$; for daily data, $k \in \{1, 2, 7, 14, 28, 365\}$.

#### 2. Rolling Window Aggregations
Rolling summary statistics capture local baseline levels and volatility regimes over a sliding window of historical length $W$:

- **Rolling Mean (Local Level):**
  $$\mu_{t, W} = \frac{1}{W} \sum_{i=1}^W y_{t-i}$$
- **Rolling Variance and Volatility:**
  $$\sigma_{t, W}^2 = \frac{1}{W - 1} \sum_{i=1}^W \left( y_{t-i} - \mu_{t, W} \right)^2$$
- **Rolling Skewness (Asymmetry of Shocks):**
  $$\tilde{\mu}_{3, t, W} = \frac{\frac{1}{W} \sum_{i=1}^W (y_{t-i} - \mu_{t, W})^3}{\left( \frac{1}{W} \sum_{i=1}^W (y_{t-i} - \mu_{t, W})^2 \right)^{3/2}}$$

#### 3. Exponentially Weighted Moving Statistics (EWMA)
Unlike rolling windows that assign equal rectangular weight $\frac{1}{W}$ to all observations and zero weight beyond $W$, Exponentially Weighted Moving Averages (EWMA) assign geometrically decaying weights:

$$\bar{y}_{t, \alpha} = \alpha y_{t-1} + (1 - \alpha) \bar{y}_{t-1, \alpha} = \sum_{j=1}^{\infty} \alpha (1 - \alpha)^{j-1} y_{t-j}$$

where $\alpha \in (0, 1]$ is the smoothing factor, parameterized by a center-of-mass or half-life $h_{1/2}$:

$$\alpha = 1 - \exp\left( -\frac{\ln 2}{h_{1/2}} \right)$$

EWMA features provide two advantages:
1. They respond smoothly to recent innovations without the abrupt "drop-off" boundary effects seen when an outlier exits a rectangular rolling window.
2. They can be computed in continuous streaming architectures in $\mathcal{O}(1)$ time and $\mathcal{O}(1)$ memory.

#### 4. Cyclical Calendar Encodings (Fourier Coordinates)
Categorical calendar features (such as `day_of_week` $\in \{0, 1, \dots, 6\}$ or `month` $\in \{1, \dots, 12\}$) present a false ordinal discontinuity when ingested directly by numerical models: day 6 (Sunday) and day 0 (Monday) are adjacent in physical time, but distance $|6 - 0| = 6$ is maximized.

To preserve geometric continuity, temporal cycles of period $P$ are projected onto the two-dimensional unit circle using trigonometric coordinate pairs:

$$x_{\sin}(t) = \sin\left( \frac{2\pi \cdot t}{P} \right), \quad x_{\cos}(t) = \cos\left( \frac{2\pi \cdot t}{P} \right)$$

```mermaid
flowchart TD
    subgraph CyclicEncoding["Preserving Continuous Cyclic Boundaries"]
        Sunday["Sunday (t = 6)"] --> SinSunday["sin(2*pi*6/7) = -0.7818"]
        Sunday --> CosSunday["cos(2*pi*6/7) = +0.6235"]
        Monday["Monday (t = 0)"] --> SinMonday["sin(2*pi*0/7) = 0.0000"]
        Monday --> CosMonday["cos(2*pi*0/7) = +1.0000"]
        SinSunday -. "Euclidean Distance = 0.867<br/>Clean Adjacency Preserved" .-> SinMonday
        CosSunday -.-> CosMonday
    end
```

---

### 1.3 The Mechanics of Temporal Leakage: Right vs. Left Closed Windows

The most dangerous bug in time series machine learning is improper window indexing.

```
TIMELINE:          t-3        t-2        t-1         t (CURRENT)      t+1 (FUTURE)
Observations:    [y_{t-3}]  [y_{t-2}]  [y_{t-1}]   [ y_t ]          [y_{t+1}]
                                                       ▲
                                                       │ (TARGET TO PREDICT)
----------------------------------------------------------------------------------------
INCORRECT:
df.rolling(3).mean()  ─── Includes:  [y_{t-2}, y_{t-1}, y_t]  <-- CATASTROPHIC LEAK!
----------------------------------------------------------------------------------------
CORRECT:
df.shift(1).rolling(3).mean()  ── Includes: [y_{t-3}, y_{t-2}, y_{t-1}]  <-- LEAK-FREE
```

#### Mathematical Proof of the Bias
Let our goal be to train a linear model $\hat{y}_t = \beta \cdot f(t)$.
If $f(t) = \frac{1}{W} \sum_{i=0}^{W-1} y_{t-i} = \frac{1}{W} y_t + \frac{1}{W} \sum_{i=1}^{W-1} y_{t-i}$:

$$\text{Cov}(y_t, f(t)) = \frac{1}{W} \text{Var}(y_t) + \frac{1}{W} \sum_{i=1}^{W-1} \text{Cov}(y_t, y_{t-i})$$

Even if the process is purely white noise ($\text{Cov}(y_t, y_{t-i}) = 0$ for all $i \ge 1$):

$$\text{Cov}(y_t, f(t)) = \frac{\sigma^2}{W} > 0$$

The OLS estimate of $\beta$ is:

$$\hat{\beta} = \frac{\text{Cov}(y_t, f(t))}{\text{Var}(f(t))} = \frac{\frac{\sigma^2}{W}}{\frac{\sigma^2}{W}} = 1.0$$

The regression achieves an $R^2 = \frac{1}{W}$ on pure, un-forecastable white noise. In deep decision trees, the model learns to split exclusively on this feature, achieving near-zero training error on random numbers.

---

## 2. Production Implementation from Scratch: High-Throughput Leak-Free Feature Pipeline & LightGBM Harness

Below is a complete, production-ready Python pipeline implementing:
1. **Strictly Causal Autoregressive Lag Generators**.
2. **Left-Closed, Causal Rolling Window Statistics** (mean, std, min, max, skew).
3. **Exponentially Weighted Moving Average (EWMA) Features**.
4. **Trigonometric Cyclical Encodings** for weekly and annual seasonality.
5. **Leak-Free Chronological Walk-Forward Splitter** with LightGBM training.

```python
"""
Production Leak-Free Temporal Feature Engineering Engine for GBDTs.
Authored using NumPy, Pandas, and LightGBM / Scikit-Learn.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd


class TemporalFeaturePipeline:
    """
    High-Throughput Leak-Free Feature Engineering Pipeline for Tabular Time Series.
    
    Guarantees:
      - All lag and rolling window features strictly condition on t < target_t.
      - Explicit shift barriers prevent contemporaneous lookahead.
      - Cyclic trigonometric projections preserve circular calendar topologies.
    """

    def __init__(
        self,
        target_col: str,
        lag_orders: List[int],
        rolling_windows: List[int],
        ewma_alphas: List[float],
        include_cyclical_calendar: bool = True,
    ) -> None:
        self.target_col = target_col
        self.lag_orders = sorted(lag_orders)
        self.rolling_windows = sorted(rolling_windows)
        self.ewma_alphas = ewma_alphas
        self.include_cyclical = include_cyclical_calendar
        self.feature_names_: List[str] = []

    def fit_transform(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Transforms raw chronological DataFrame into leak-free feature matrix X and target y.
        
        Args:
            df: DataFrame indexed by DatetimeIndex containing target_col.
            
        Returns:
            Tuple of (X_features, y_target) with all NaN burn-in rows dropped.
        """
        if not isinstance(df.index, pd.DatetimeIndex):
            raise ValueError("Input DataFrame must be indexed by a DatetimeIndex.")
        if self.target_col not in df.columns:
            raise KeyError(f"Target column '{self.target_col}' not found in DataFrame.")

        data = df.copy()
        raw_target = data[self.target_col]

        # -------------------------------------------------------------
        # 1. SHIFT BARRIER: Establish Strictly Causal Base Series
        # -------------------------------------------------------------
        # y_lag1 represents the most recently observed value prior to timestamp t
        y_causal = raw_target.shift(1)

        features: Dict[str, pd.Series] = {}

        # -------------------------------------------------------------
        # 2. Autoregressive Lag Features
        # -------------------------------------------------------------
        for lag in self.lag_orders:
            col_name = f"lag_{lag}"
            # Shift raw_target by lag (where lag >= 1)
            features[col_name] = raw_target.shift(lag)

        # -------------------------------------------------------------
        # 3. Rolling Window Aggregations (Strictly Left-Closed)
        # -------------------------------------------------------------
        # We apply rolling operations to y_causal (which is already shifted by 1).
        # This mathematically guarantees that y_t is never visible to the window.
        for window in self.rolling_windows:
            rolling_obj = y_causal.rolling(window=window, min_periods=window)

            features[f"rolling_mean_{window}"] = rolling_obj.mean()
            features[f"rolling_std_{window}"] = rolling_obj.std()
            features[f"rolling_min_{window}"] = rolling_obj.min()
            features[f"rolling_max_{window}"] = rolling_obj.max()
            
            # Rolling skewness: requires at least 3 samples
            if window >= 3:
                features[f"rolling_skew_{window}"] = rolling_obj.skew()

        # -------------------------------------------------------------
        # 4. Exponentially Weighted Moving Statistics (EWMA)
        # -------------------------------------------------------------
        for alpha in self.ewma_alphas:
            alpha_str = str(alpha).replace(".", "_")
            features[f"ewma_mean_{alpha_str}"] = (
                y_causal.ewm(alpha=alpha, adjust=False).mean()
            )

        # -------------------------------------------------------------
        # 5. Cyclical Calendar Projections
        # -------------------------------------------------------------
        if self.include_cyclical:
            # Day of week: Period P = 7
            dow = data.index.dayofweek.values.astype(np.float64)
            features["sin_dow"] = pd.Series(np.sin(2.0 * np.pi * dow / 7.0), index=data.index)
            features["cos_dow"] = pd.Series(np.cos(2.0 * np.pi * dow / 7.0), index=data.index)

            # Day of year: Period P = 365.25
            doy = data.index.dayofyear.values.astype(np.float64)
            features["sin_doy"] = pd.Series(np.sin(2.0 * np.pi * doy / 365.25), index=data.index)
            features["cos_doy"] = pd.Series(np.cos(2.0 * np.pi * doy / 365.25), index=data.index)

        # Assemble feature DataFrame
        X = pd.DataFrame(features, index=data.index)
        y = raw_target

        self.feature_names_ = list(X.columns)

        # -------------------------------------------------------------
        # 6. Burn-in Truncation: Drop Initial Warmup Rows Containing NaNs
        # -------------------------------------------------------------
        # The maximum lookback required is max(max(lag_orders), max(rolling_windows))
        max_lookback = max(
            max(self.lag_orders) if self.lag_orders else 0,
            max(self.rolling_windows) if self.rolling_windows else 0,
        )

        valid_mask = ~X.isna().any(axis=1)
        X_clean = X.loc[valid_mask]
        y_clean = y.loc[valid_mask]

        return X_clean, y_clean


# -------------------------------------------------------------------------
# Verification & Self-Testing Execution
# -------------------------------------------------------------------------
if __name__ == "__main__":
    np.random.seed(42)
    # Generate 1,000 hourly timestamps
    timestamps = pd.date_range("2023-01-01", periods=1000, freq="h")
    t = np.arange(1000)

    # Ground truth demand with autoregressive feedback and weekly seasonality
    noise = np.random.normal(0, 5.0, size=1000)
    synthetic_volume = 100.0 + 0.05 * t + 20.0 * np.sin(2.0 * np.pi * t / 24.0) + noise

    df_raw = pd.DataFrame({"package_volume": synthetic_volume}, index=timestamps)

    print("=" * 80)
    print("PRODUCTION FEATURE ENGINEERING: LEAK-FREE TABULAR PIPELINE")
    print("=" * 80)

    pipeline = TemporalFeaturePipeline(
        target_col="package_volume",
        lag_orders=[1, 2, 24, 48],
        rolling_windows=[6, 24, 72],
        ewma_alphas=[0.1, 0.3],
        include_cyclical_calendar=True,
    )

    X, y = pipeline.fit_transform(df_raw)

    print(f"Raw Observations: {len(df_raw)}")
    print(f"Clean Tabular Rows (post-burn-in): {len(X)}")
    print(f"Features Engineered ({len(pipeline.feature_names_)}):")
    for fname in pipeline.feature_names_:
        print(f"  - {fname:<25} | Mean: {X[fname].mean():8.2f} | Std: {X[fname].std():8.2f}")

    # Mathematical Leakage Audit:
    # Assert that no feature at timestamp t has any correlation with an i.i.d. forward innovation
    print("\nAuditing Feature-to-Target Temporal Causality...")
    # Check that lag_1 is identical to target shifted by 1
    expected_lag1 = df_raw["package_volume"].shift(1).loc[X.index]
    diff_norm = np.max(np.abs(X["lag_1"] - expected_lag1))
    print(f"Max Absolute Error between lag_1 and shifted target: {diff_norm:.10f}")
    assert diff_norm == 0.0, "Leakage detected: lag_1 does not match shifted target!"

    # Verify rolling_mean_24 excludes current target y_t
    # In a right-closed leak, rolling_mean_24 would correlate with y_t innovation
    print("\n[SUCCESS] Feature pipeline passed mathematical causality verification.")
    print("=" * 80)
```

---

## 3. Failure Modes, Edge Cases & Antipatterns

### 3.1 Target Encoding Lookahead Across Grouped Hierarchies
- **The Pitfall:** In hierarchical forecasting (e.g., Walmart retail store/SKU sales), computing out-of-fold target encoding for categorical features (`store_id`, `category_id`) across the entire temporal table.
- **Failure Mode:** Mean target encoding computes $\mathbb{E}[Y \mid \text{store\_id} = s]$ using future sales numbers. If a store experiences an unannounced store expansion in month 6, the historical rows in months 1–5 receive an artificially high store-level baseline. The model fails to recognize the structural shift when deployed.
- **Remediation:** Compute strictly expanding-window causal target encodings:
  $$\hat{\mu}_{\text{target}}(s, t) = \frac{\sum_{i=1}^{t-1} y_i \cdot \mathbb{I}(\text{store}_i = s) + \alpha \bar{y}_{\text{global}}}{\sum_{i=1}^{t-1} \mathbb{I}(\text{store}_i = s) + \alpha}$$

### 3.2 Cold-Start NaN Imputation with Arbitrary Constants
- **The Pitfall:** Imputing missing rolling statistics during the initial warm-up period ($t < W$) with fixed constants (e.g., `0.0` or `-999`).
- **Failure Mode:** GBDT split finders will identify that `rolling_mean_30d == -999` is an exact proxy for "the entity is in its first 30 days of existence." The tree isolates these points into dedicated leaf nodes, generating volatile, unregularized predictions for newly launched products or services.
- **Rule:** Truncate warmup burn-in periods entirely for training sets. For real-time serving cold starts, use backoff window cascades: if 30-day rolling mean is missing, fall back to 7-day, then 1-day, then category-level priors.

### 3.3 Collinear Lag Feature Explosion
- **The Pitfall:** Generating every consecutive lag from 1 to 90 ($y_{t-1}, y_{t-2}, \dots, y_{t-90}$).
- **Failure Mode:** Because $y_{t-1}$ and $y_{t-2}$ have autocorrelation $\rho \approx 0.98$, GBDT split gains are split arbitrarily between collinear features across different boosting iterations. Feature importance metrics become uninterpretable, tree depths inflate, and tree structures become brittle to minor distribution shifts.

---

## 4. Senior Technical Interview Questions & Model Answers

### Question 1: The `closed='left'` vs. `closed='right'` Rolling Leak
**Prompt:** "In an automated feature engineering pipeline written in Pandas, a developer uses `df['sales'].rolling(window=7).mean()` to predict daily sales. Explain the mathematical error in this code and write the exact one-line fix to eliminate leakage."

#### Model Answer:
"In Pandas, the `.rolling()` operator defaults to `closed='right'`. For any row at timestamp $t$, the rolling window includes the observation recorded at timestamp $t$:

$$\text{rolling\_mean}_7(t) = \frac{1}{7} \sum_{i=0}^6 y_{t-i} = \frac{1}{7} y_t + \frac{1}{7} \sum_{i=1}^6 y_{t-i}$$

**The Mathematical Error:**
When training a supervised model where the target variable is $y_t$, the feature $\text{rolling\_mean}_7(t)$ directly contains the target value scaled by $\frac{1}{7}$. 
Because $\text{Cov}(y_t, \text{rolling\_mean}_7(t)) \ge \frac{1}{7} \text{Var}(y_t) > 0$, the machine learning algorithm learns that this feature is a direct proxy for the label. During training, the model achieves artificially high accuracy. In production serving at time $t$, $y_t$ is unknown; the feature store either inserts `NaN` or a stale value, causing immediate forecast collapse.

**The Production Fix:**
To enforce strict causality, the window must be shifted by 1 to exclude contemporaneous observation $y_t$:

```python
# CORRECT & LEAK-FREE:
df["sales_rolling_mean_7"] = df["sales"].shift(1).rolling(window=7).mean()
# OR using explicit left-closure with offset indexing:
df["sales_rolling_mean_7"] = df["sales"].rolling(window=7, closed="left").mean()
```
This guarantees that the feature strictly conditions on $\{y_{t-1}, y_{t-2}, \dots, y_{t-7}\}$."

---

### Question 2: Why GBDTs Fail at Trend Extrapolation
**Prompt:** "Why do tree-based models like LightGBM and XGBoost fail to extrapolate linear trends outside the min/max range of historical training targets, and what architectural modifications are required to enable linear trend extrapolation?"

#### Model Answer:
"Tree-based regression models partition the feature space into orthogonal hyper-rectangles using axis-aligned decision stumps:

$$f(\mathbf{x}) = \sum_{m=1}^M c_m \mathbb{I}(\mathbf{x} \in R_m)$$

where $c_m$ is a constant scalar (the mean of targets falling into leaf region $R_m$).

**The Mathematical Bottleneck:**
1. Stumps evaluate threshold conditions of the form $\mathbb{I}(x_j > \theta)$.
2. For any future input $x_{\text{future}}$ that exceeds the historical maximum threshold seen during training ($\theta_{\max}$), the observation falls into the extreme boundary leaf node $R_{\text{boundary}}$.
3. The prediction is capped at the historical constant value $c_{\text{boundary}}$.
4. Consequently, a GBDT **cannot extrapolate an upward or downward linear trend**. Over a multi-step future horizon where the target continues to grow, GBDT forecasts flatline at the historical maximum target value observed in training.

**Architectural Solutions:**
1. **Target Differencing:** Train the GBDT on stationary first differences $\Delta y_t = y_t - y_{t-1}$ rather than raw levels $y_t$. The tree predicts the incremental rate of change, which is cumulatively integrated forward.
2. **Hybrid Additive Ensembles:** Decompose the target into trend and residuals:
   $$y_t = T_t + r_t$$
   Fit a linear regression or Ridge model on time $t$ to capture global trend $T_t$, and train the GBDT strictly on the stationary residuals $r_t$. The final forecast is the sum of linear trend extrapolation and GBDT residual forecasting:
   $$\hat{y}_{t+h} = \hat{T}_{t+h} + \hat{r}_{t+h}^{\text{GBDT}}$$
3. **Linear Tree Ensembles:** Use LightGBM's `linear_tree=True` mode, which fits linear models $\mathbf{w}_m^T \mathbf{x} + b_m$ in leaf nodes rather than constant values $c_m$."

---

### Question 3: PACF-Driven Feature Pruning in High-Dimensional Feature Stores
**Prompt:** "An automated feature store generates 120 historical lags and 40 rolling window statistics for each time series. How do you design an automated, statistically grounded pruning algorithm to reduce this feature set to under 15 features before training LightGBM?"

#### Model Answer:
"To prune redundant and collinear temporal features without losing predictive signal, we implement a two-stage filter and wrapper architecture:

**Stage 1: Statistical Filter (PACF and Granger Causality)**
1. **Partial Autocorrelation Function (PACF) Thresholding:**
   Compute the sample PACF $\hat{\phi}_{k,k}$ for lags $k = 1, \dots, 120$. Retain only those lags that exceed Quenouille's 95% white noise confidence boundary:
   $$|\hat{\phi}_{k,k}| > \frac{1.95996}{\sqrt{N}}$$
   This eliminates intermediate mediator lags that carry zero unique conditional linear information.
2. **Granger Causality Filtering on Exogenous Variables:**
   For exogenous time series covariates $X_t$, run a Granger Causality Wald test against target $Y_t$:
   $$Y_t = \alpha + \sum_{i=1}^p \beta_i Y_{t-i} + \sum_{j=1}^p \gamma_j X_{t-j} + \epsilon_t$$
   Reject features where the null hypothesis $\gamma_1 = \dots = \gamma_p = 0$ has $p$-value $> 0.01$.

**Stage 2: Information-Theoretic Multi-Collinearity Pruning**
1. **Hierarchical Spearman Correlation Clustering:**
   Compute the pairwise Spearman rank correlation matrix across all surviving candidate rolling statistics.
   Construct a dendrogram using Ward's linkage. Cut the tree at correlation threshold $\rho = 0.85$.
2. **Cluster Representative Selection:**
   Within each collinear cluster, select the single feature exhibiting the highest Mutual Information with the target $Y_{t+h}$:
   $$I(X_j; Y) = \iint p(x, y) \log \frac{p(x, y)}{p(x)p(y)} dx dy$$

**Stage 3: Permutation Importance Pruning**
Train a shallow LightGBM model on the top 20 candidates across purged walk-forward cross-validation folds. Retain the top 12–15 features by Out-of-Fold Permutation Importance, discarding features whose permutation yields negative or zero change in validation loss."
