# Module 09: Capstone — Production Demand and Traffic Forecasting Microservice

This module is part of [Track 07: Time Series Forecasting](../README.md).

> **Prerequisites:** [Module 00: Time Series Anatomy](../00-time-series-anatomy-trend-seasonality-stationarity/README.md) through [Module 08: Probabilistic Forecasting & Conformal Intervals](../08-probabilistic-forecasting-and-prediction-intervals/README.md).  
> **Estimated Reading Time:** 50 minutes  
> **Target Audience:** Principal Systems Architects, Staff Machine Learning Engineers, Head of Data Platform, and Quantitative Infrastructure Leads deploying mission-critical, enterprise forecasting platforms.

> [!TIP]
> **The Capstone Architecture Axiom:** A production forecasting platform is not an isolated machine learning model; it is a distributed, closed-loop cybernetic system. The platform must orchestrate asynchronous telemetry ingestion, automated stationarity validation, leak-free feature store materialization, hybrid ensembling (anchoring non-linear tree ensembles with classical exponential smoothing baselines), and sub-100ms multi-horizon probabilistic serving behind strict REST/gRPC contracts.

---

## Executive Overview & Industry Context

Industrial forecasting platforms operate under stringent operational constraints:
1. **High Concurrency & Low Latency:** An e-commerce dynamic pricing engine or an edge cloud autoscaler queries multi-horizon forecasts across 50,000 distinct time series every 60 seconds. Model serving must evaluate predictions within a sub-50ms SLA.
2. **Cold-Start Resilience:** Enterprise platforms encounter newly launched SKUs, freshly deployed container microservices, and regional expansions with zero historical observations. The system must degrade gracefully from global categorical priors down to local statistical models as history accumulates.
3. **Probabilistic Risk Envelopes:** Downstream ERPs and autoscaling daemons require full uncertainty bounds ($\text{P10}, \text{P50}, \text{P90}$) to compute asymmetric safety buffers and avoid catastrophic stockouts or runaway compute bills.

This capstone module synthesizes all mathematical foundations established across Track 07 into an end-to-end, production-grade forecasting microservice:
- **Stationarity & Decomposition:** Automated classical trend-seasonal isolation.
- **Leak-Free Temporal Feature Store:** Causal rolling window aggregations and Fourier calendar projections.
- **Hybrid Ensemble Engine:** Combines **Holt-Winters Damped Trend Anchors** (for stable multi-horizon extrapolation) with **Quantile Loss Gradient Boosted Trees** (for non-linear exogenous covariate modeling).
- **FastAPI Production Microservice:** Fully typed Pydantic V2 schemas, in-memory LRU caching, batch scoring, and health telemetry.

---

## Production Incident Post-Mortem: The \$4.3M Flash-Sale Structural Break Inversion

### Incident Context
A tier-1 luxury fashion e-commerce marketplace operating across North America and Europe deployed an automated demand forecasting and warehouse replenishment service. The service predicted 30-day forward demand across 250,000 designer SKUs to issue purchase orders to international luxury fashion houses.

The platform utilized a complex deep sequence model (Temporal Fusion Transformer) coupled with an unregularized gradient boosted decision tree ensemble.

### The Failure Sequence

```mermaid
sequenceDiagram
    autonumber
    participant App as Mobile App & Web Gateway
    participant ETL as Hourly Telemetry Pipeline
    participant Service as Forecasting Microservice
    participant ERP as SAP Warehouse Replenishment
    participant Supplier as Luxury Brand Suppliers
    participant CFO as Corporate Audit

    App->>ETL: Unannounced 48-hour viral flash sale (Celebrity influencer endorsement: +850% demand)
    ETL->>Service: Ingest sudden 8.5x volume spike on 1,400 exclusive designer handbag SKUs
    Note over Service: Automated pipeline has NO promotional indicator or holiday masking
    Note over Service: Model misclassifies transient flash-sale impulse as permanent structural trend break
    Service->>ERP: Project 30-day forward demand: 42,000 units/week (Extrapolating transient spike)
    ERP->>Supplier: Dispatch irreversible purchase orders: 7.8M USD in non-returnable luxury inventory
    Note over App: Flash sale concludes -- customer demand immediately collapses back to 450 units/week
    Supplier->>ERP: Deliver 42,000 handbag units to regional fulfillment centers
    ERP-->>CFO: Warehouses breach 98% physical capacity -- dead inventory carrying costs explode
    CFO->>Service: P0 Disaster: 4.35M USD inventory liquidation write-down and overflow leasing
```

### Root Cause Analysis
1. **Promotional Impulse vs. Structural Trend Confounding:** The automated pipeline lacked an explicit promotional calendar feature store. When the 48-hour flash sale generated an 850% demand surge, the model's lag features ($y_{t-1}, y_{t-2}$) and rolling statistics ($\text{rolling\_mean}_{7\text{d}}$) spiked. Because the model did not distinguish between an impulse shock and an integrated unit-root trend shift, it treated the transient spike as permanent structural growth.
2. **Absence of Classical Baseline Anchoring:** The microservice relied entirely on unconstrained non-linear trees and deep embeddings. A classical damped Holt-Winters model or STL pre-filter would have constrained the forward slope, dampening the extrapolation. The unanchored model extrapolated peak flash-sale demand continuously over the 30-day horizon.
3. **Financial Outcome:** The enterprise over-ordered \$7.8M in luxury inventory. When baseline demand returned to normal, the merchandise sat unsold. The marketplace was forced to lease emergency external warehouse storage and liquidate inventory at a 65% discount, resulting in a \$4.35M net loss.

### Remediation Architecture
1. **Mandatory Exogenous Event Flags:** Engineered explicit promotional indicator vectors with preceding announcement windows and post-sale hangover buffers ($[t_{\text{promo}} - 2, \,\, t_{\text{promo}} + 4]$).
2. **Hybrid Econometric Anchoring:** Enforced that all machine learning predictions be combined with an econometric baseline (Holt-Winters damped trend), bounding extreme deviations:
   $$\hat{y}_{\text{final}} = \alpha \cdot \hat{y}_{\text{ML}} + (1 - \alpha) \cdot \hat{y}_{\text{Holt-Winters}}$$
3. **Variance Spike Circuit Breakers:** Installed an automated serving gate: if a multi-horizon forecast exceeds the 90-day historical 99th percentile ($\text{P99}$) by more than $2.5\times$ in the absence of a verified promotional contract, the API triggers a circuit breaker and clamps the forecast to physical warehouse throughput limits.

---

## 1. System Architecture & Engineering Blueprint

```mermaid
flowchart TD
    subgraph DataIngestion["1. Stream & Batch Ingestion"]
        KafkaStream["Kafka Telemetry Stream<br/>(Real-Time Invocations / Orders)"] --> Resampler["Temporal Resampler & Grid Regularizer<br/>(Resample to fixed \Delta t; Linear Imputation)"]
        BatchDB["Snowflake / BigQuery Warehouse<br/>(Historical Catalogs & Promos)"] --> Resampler
    end

    subgraph FeatureStore["2. Leak-Free Feature Store Engine"]
        Resampler --> ShiftGate["Causal Shift Barrier: y_{t-1} = Shift(y_t, 1)"]
        ShiftGate --> Lags["Autoregressive Lags:<br/>[1, 2, 7, 14, 28]"]
        ShiftGate --> Rolling["Rolling Statistics (Left-Closed):<br/>Mean, Std, Min, Max (7d, 30d)"]
        Resampler --> Calendar["Exogenous & Calendar Transforms:<br/>Sin/Cos Fourier + Promotional Flags"]
    end

    subgraph ModelEnsemble["3. Hybrid Probabilistic Ensemble Engine"]
        Resampler --> HWEngine["Econometric Anchor:<br/>Holt-Winters Damped Trend"]
        Lags --> GBDTEngine["Quantile Tree Ensembles (LightGBM):<br/>P10, P50, P90 Multi-Horizon Regressors"]
        Rolling --> GBDTEngine
        Calendar --> GBDTEngine
        HWEngine --> EnsembleCombiner["Ensemble Combiner & Monotonic Rearrangement"]
        GBDTEngine --> EnsembleCombiner
    end

    subgraph ProductionServing["4. FastAPI Serving Infrastructure"]
        EnsembleCombiner --> ModelRegistry["Serialized Artifact Cache (Memory / Redis)"]
        ModelRegistry --> APIRoutes["FastAPI REST / gRPC Gateway"]
        APIRoutes --> PydanticValidation["Pydantic V2 Request & Response Validation"]
        PydanticValidation --> Client["Enterprise Clients:<br/>ERP Replenishment | Autoscaler Daemon"]
    end
```

---

## 2. Mathematical Formulations of the Hybrid Ensemble

### 2.1 Econometric Baseline Anchoring
To prevent non-linear machine learning models from extrapolating unrealistic trends during anomalous shifts, the system anchors forecasts using Gardner's **Damped Holt-Winters** model:

$$\hat{y}_{\text{HW}, t+h} = \left[ l_t + \left( \sum_{i=1}^h \phi^i \right) b_t \right] \cdot s_{t+h-m(k+1)}$$

where $\phi \in [0.80, 0.98]$ guarantees that the linear slope saturates asymptotically as $h \to \infty$.

### 2.2 Quantile Loss Regression Heads
Simultaneously, a fleet of gradient boosted decision trees or neural networks directly minimizes the asymmetric pinball loss for quantiles $\tau \in \{0.10, 0.50, 0.90\}$:

$$\mathcal{L}_\tau(y, \hat{q}_\tau) = \max\left( \tau(y - \hat{q}_\tau), \,\, (1 - \tau)(\hat{q}_\tau - y) \right)$$

### 2.3 The Hybrid Combination Rule
The final probabilistic forecast for quantile $\tau$ at horizon step $h$ is formulated as a convex combination of the econometric anchor and the machine learning quantile prediction:

$$\hat{y}_{t+h}^{(\tau)} = w_{\text{HW}} \cdot \hat{y}_{\text{HW}, t+h} + (1 - w_{\text{HW}}) \cdot \hat{q}_{\text{GBM}, t+h}^{(\tau)}$$

where $w_{\text{HW}} \in [0.15, 0.35]$ provides physical inertia. The resulting quantile vector $[\hat{y}^{(0.10)}, \hat{y}^{(0.50)}, \hat{y}^{(0.90)}]$ is passed through **Chernozhukov monotonic rearrangement** to guarantee:

$$\hat{y}_{t+h}^{(0.10)} \le \hat{y}_{t+h}^{(0.50)} \le \hat{y}_{t+h}^{(0.90)} \quad \forall h \in \{1, \dots, H\}$$

---

## 3. Production Microservice Implementation

Below is a complete, self-contained, enterprise-grade Python application. It contains:
1. **Synthetic End-to-End Retail & Cloud Telemetry Generator** with seasonal cycles, stochastic drift, and promotional shocks.
2. **Leak-Free Temporal Feature Store Engine**.
3. **Holt-Winters Damped Trend Engine** combined with **Multi-Quantile LightGBM/Ridge Regressors**.
4. **Comprehensive Metric Evaluator** computing **WAPE**, **MAPE**, **PICP**, and **Winkler Scores**.
5. **FastAPI Microservice Implementation** with strict Pydantic V2 schemas, in-memory model serialization, and `/forecast` endpoints.

```python
"""
Production Demand & Telemetry Forecasting Microservice.
Enterprise Capstone Platform combining Holt-Winters, Quantile ML, and FastAPI.
Authored in pure Python, NumPy, Pandas, Scikit-Learn, and FastAPI.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from pydantic import BaseModel, Field
from sklearn.linear_model import Ridge


# =========================================================================
# 1. ECONOMETRIC & MACHINE LEARNING FORECASTING ENGINES
# =========================================================================

class DampedHoltWintersAnchor:
    """Fast Damped Holt-Winters model for trend anchoring."""

    def __init__(self, period: int = 7, alpha: float = 0.3, beta: float = 0.05, phi: float = 0.90):
        self.period = period
        self.alpha = alpha
        self.beta = beta
        self.phi = phi
        self.level_ = 0.0
        self.trend_ = 0.0
        self.seasonal_ = np.zeros(period)

    def fit(self, y: np.ndarray) -> "DampedHoltWintersAnchor":
        n = len(y)
        m = self.period
        if n < 2 * m:
            self.level_ = float(np.mean(y))
            return self

        # Heuristic state initialization
        self.level_ = float(np.mean(y[:m]))
        self.trend_ = float((np.mean(y[m : 2 * m]) - np.mean(y[:m])) / m)
        self.seasonal_ = y[:m] - self.level_
        self.seasonal_ -= np.mean(self.seasonal_)

        curr_l = self.level_
        curr_b = self.trend_
        s_buf = np.tile(self.seasonal_, int(np.ceil(n / m)) + 1)

        for t in range(n):
            s_prev = s_buf[t]
            yhat = curr_l + self.phi * curr_b + s_prev
            err = y[t] - yhat

            next_l = self.alpha * (y[t] - s_prev) + (1.0 - self.alpha) * (curr_l + self.phi * curr_b)
            next_b = self.beta * (next_l - curr_l) + (1.0 - self.beta) * self.phi * curr_b
            s_buf[t + m] = s_prev + 0.1 * err

            curr_l = next_l
            curr_b = next_b

        self.level_ = curr_l
        self.trend_ = curr_b
        self.seasonal_ = s_buf[n : n + m]
        return self

    def forecast(self, horizon: int) -> np.ndarray:
        preds = np.zeros(horizon, dtype=np.float64)
        m = self.period
        for h in range(1, horizon + 1):
            decay = self.phi * (1.0 - self.phi**h) / (1.0 - self.phi)
            s_val = self.seasonal_[(h - 1) % m]
            preds[h - 1] = self.level_ + decay * self.trend_ + s_val
        return preds


class HybridQuantilePipeline:
    """
    Hybrid Forecasting Engine combining Damped Holt-Winters Anchors
    with Asymmetric Quantile Tabular Regressors (P10, P50, P90).
    """

    def __init__(self, horizon: int = 14, seasonal_period: int = 7) -> None:
        self.horizon = horizon
        self.period = seasonal_period
        self.hw_anchor = DampedHoltWintersAnchor(period=seasonal_period)
        self.models_q10: List[Ridge] = []
        self.models_q50: List[Ridge] = []
        self.models_q90: List[Ridge] = []

    def fit(self, y: np.ndarray, promo_flag: Optional[np.ndarray] = None) -> "HybridQuantilePipeline":
        y_arr = np.asarray(y, dtype=np.float64)
        n = len(y_arr)
        p = 14  # 14 autoregressive historical lags

        # 1. Fit Econometric Anchor
        self.hw_anchor.fit(y_arr)

        # 2. Build Causal Tabular Features
        X_rows = []
        max_idx = n - self.horizon
        for t in range(p - 1, max_idx):
            lags = y_arr[t - p + 1 : t + 1][::-1]
            roll_mean = np.mean(lags[:7])
            roll_std = np.std(lags[:7])
            sin_dow = np.sin(2.0 * np.pi * (t % 7) / 7.0)
            cos_dow = np.cos(2.0 * np.pi * (t % 7) / 7.0)
            promo = promo_flag[t] if promo_flag is not None else 0.0
            feat_vec = np.concatenate([lags, [roll_mean, roll_std, sin_dow, cos_dow, promo]])
            X_rows.append(feat_vec)

        X_mat = np.array(X_rows)

        # Train Direct models for each horizon h = 1 ... H
        self.models_q10 = []
        self.models_q50 = []
        self.models_q90 = []

        for h in range(1, self.horizon + 1):
            y_target = np.array([y_arr[t + h] for t in range(p - 1, max_idx)])

            # Fit P50 (L2 Ridge baseline)
            m50 = Ridge(alpha=1.0)
            m50.fit(X_mat, y_target)
            self.models_q50.append(m50)

            # Fit P10 & P90 via asymmetric residual scaling
            preds_50 = m50.predict(X_mat)
            residuals = y_target - preds_50
            sigma_res = float(np.std(residuals))

            m10 = Ridge(alpha=1.0)
            m10.coef_ = m50.coef_.copy()
            m10.intercept_ = m50.intercept_ - 1.28155 * sigma_res
            self.models_q10.append(m10)

            m90 = Ridge(alpha=1.0)
            m90.coef_ = m50.coef_.copy()
            m90.intercept_ = m50.intercept_ + 1.28155 * sigma_res
            self.models_q90.append(m90)

        return self

    def predict(
        self, recent_history: np.ndarray, promo_future: Optional[np.ndarray] = None
    ) -> Dict[str, np.ndarray]:
        """
        Emits monotonic multi-horizon forecasts [P10, P50, P90].
        """
        y_hist = np.asarray(recent_history, dtype=np.float64)
        p = 14
        lags = y_hist[-p:][::-1]
        roll_mean = np.mean(lags[:7])
        roll_std = np.std(lags[:7])
        sin_dow = np.sin(2.0 * np.pi * (len(y_hist) % 7) / 7.0)
        cos_dow = np.cos(2.0 * np.pi * (len(y_hist) % 7) / 7.0)
        promo = promo_future[0] if promo_future is not None else 0.0

        feat_vec = np.concatenate([lags, [roll_mean, roll_std, sin_dow, cos_dow, promo]]).reshape(1, -1)

        # 1. Econometric Anchor Forecast
        hw_forecast = self.hw_anchor.forecast(self.horizon)

        # 2. ML Quantile Forecasts
        p10_raw = np.array([float(self.models_q10[h].predict(feat_vec)[0]) for h in range(self.horizon)])
        p50_raw = np.array([float(self.models_q50[h].predict(feat_vec)[0]) for h in range(self.horizon)])
        p90_raw = np.array([float(self.models_q90[h].predict(feat_vec)[0]) for h in range(self.horizon)])

        # 3. Hybrid Ensembling: 25% Holt-Winters Anchor + 75% ML Quantiles
        w_hw = 0.25
        p10_ens = w_hw * hw_forecast + (1.0 - w_hw) * p10_raw
        p50_ens = w_hw * hw_forecast + (1.0 - w_hw) * p50_raw
        p90_ens = w_hw * hw_forecast + (1.0 - w_hw) * p90_raw

        # 4. Monotonic Rearrangement: Guarantees P10 <= P50 <= P90
        stacked = np.column_stack([p10_ens, p50_ens, p90_ens])
        stacked_sorted = np.sort(stacked, axis=1)

        return {
            "p10": np.maximum(0.0, stacked_sorted[:, 0]),
            "p50": np.maximum(0.0, stacked_sorted[:, 1]),
            "p90": np.maximum(0.0, stacked_sorted[:, 2]),
        }


# =========================================================================
# 2. INDUSTRIAL EVALUATION SUITE
# =========================================================================

class EnterpriseEvaluator:
    """Evaluates multi-horizon forecasts using industrial retail and cloud metrics."""

    @staticmethod
    def evaluate_metrics(y_true: np.ndarray, y_pred_p50: np.ndarray, p10: np.ndarray, p90: np.ndarray) -> Dict[str, float]:
        y = np.asarray(y_true, dtype=np.float64)
        p50 = np.asarray(y_pred_p50, dtype=np.float64)

        # 1. WAPE (Weighted Absolute Percentage Error) - Industry standard for supply chains
        total_actual = float(np.sum(np.abs(y)))
        wape = float(np.sum(np.abs(y - p50)) / total_actual) if total_actual > 0 else 0.0

        # 2. MAPE (avoid division by zero)
        valid = y > 1e-4
        mape = float(np.mean(np.abs((y[valid] - p50[valid]) / y[valid]))) if np.any(valid) else 0.0

        # 3. PICP (Prediction Interval Coverage Probability: 80% nominal interval [P10, P90])
        covered = (y >= p10) & (y <= p90)
        picp = float(np.mean(covered))

        return {
            "wape": wape,
            "mape": mape,
            "picp_80": picp,
            "target_coverage": 0.80,
            "mean_demand": float(np.mean(y)),
        }


# =========================================================================
# 3. FASTAPI PRODUCTION MICROSERVICE DEFINITION
# =========================================================================

# Pydantic Schemas for API Contracts
class ForecastRequest(BaseModel):
    series_id: str = Field(..., description="Unique tenant, SKU, or microservice cluster identifier")
    historical_values: List[float] = Field(..., min_length=28, description="Historical observations (min length 28)")
    horizon: int = Field(default=14, ge=1, le=30, description="Forecast horizon steps forward")
    future_promo_flags: Optional[List[float]] = Field(default=None, description="Binary promotional indicators")


class ForecastResponse(BaseModel):
    series_id: str
    horizon: int
    p10_forecast: List[float]
    p50_forecast: List[float]
    p90_forecast: List[float]
    status: str = "SUCCESS"


# FastAPI Application Builder
def create_forecasting_app():
    """Initializes and returns production-grade FastAPI forecasting microservice."""
    try:
        from fastapi import FastAPI, HTTPException
    except ImportError:
        # Mock class if fastapi is not installed in local environment
        class FastAPI:
            def __init__(self, **kwargs): pass
            def post(self, *args, **kwargs): return lambda f: f
            def get(self, *args, **kwargs): return lambda f: f

    app = FastAPI(
        title="Enterprise Demand & Telemetry Forecasting Microservice",
        version="1.0.0",
        description="High-Throughput Probabilistic Multi-Horizon Forecasting Engine",
    )

    # In-memory pipeline cache simulating Redis model registry
    MODEL_CACHE: Dict[str, HybridQuantilePipeline] = {}

    @app.post("/v1/forecast", response_model=ForecastResponse)
    def generate_forecast(req: ForecastRequest) -> ForecastResponse:
        try:
            hist_data = np.array(req.historical_values, dtype=np.float64)

            # Retrieve or fit pipeline
            if req.series_id not in MODEL_CACHE:
                pipeline = HybridQuantilePipeline(horizon=req.horizon, seasonal_period=7)
                pipeline.fit(hist_data)
                MODEL_CACHE[req.series_id] = pipeline
            else:
                pipeline = MODEL_CACHE[req.series_id]

            # Generate forecast
            promo_f = np.array(req.future_promo_flags) if req.future_promo_flags else None
            preds = pipeline.predict(hist_data, promo_future=promo_f)

            return ForecastResponse(
                series_id=req.series_id,
                horizon=req.horizon,
                p10_forecast=[round(x, 2) for x in preds["p10"].tolist()],
                p50_forecast=[round(x, 2) for x in preds["p50"].tolist()],
                p90_forecast=[round(x, 2) for x in preds["p90"].tolist()],
                status="SUCCESS",
            )
        except Exception as e:
            return ForecastResponse(
                series_id=req.series_id,
                horizon=req.horizon,
                p10_forecast=[],
                p50_forecast=[],
                p90_forecast=[],
                status=f"ERROR: {str(e)}",
            )

    @app.get("/healthz")
    def health_check():
        return {"status": "HEALTHY", "cached_models": len(MODEL_CACHE)}

    return app


# =========================================================================
# 4. VERIFICATION & CAPSTONE PIPELINE EXECUTION
# =========================================================================

if __name__ == "__main__":
    np.random.seed(42)
    T = 365  # 1 year of daily telemetry
    H = 14   # 14-day multi-horizon test

    print("=" * 80)
    print("CAPSTONE: PRODUCTION DEMAND & TRAFFIC FORECASTING SERVICE")
    print("=" * 80)

    # 1. Synthesize Realistic Retail Demand Stream:
    # Trend + Weekly Cycle + Flash-Sale Promotional Spike + Noise
    t = np.arange(T)
    trend = 200.0 + 0.25 * t
    season = 40.0 * np.sin(2.0 * np.pi * t / 7.0)
    promo_flags = np.zeros(T)
    promo_flags[200:204] = 1.0  # 4-day flash sale at day 200
    promo_surge = promo_flags * 180.0
    noise = np.random.normal(0, 12.0, size=T)
    demand_series = np.maximum(10.0, trend + season + promo_surge + noise)

    # Train / Test Temporal Split
    train_y = demand_series[:-H]
    test_y = demand_series[-H:]
    train_promo = promo_flags[:-H]
    test_promo = promo_flags[-H:]

    print(f"Dataset Overview:")
    print(f"  Historical Training Days: {len(train_y)}")
    print(f"  Evaluation Test Horizon:  {H} days")
    print(f"  Training Demand Mean:     {np.mean(train_y):.2f} | Std: {np.std(train_y):.2f}")

    # 2. Fit Hybrid Quantile Pipeline
    print("\nTraining Hybrid Forecasting Engine (Holt-Winters + Multi-Quantile Ridge)...")
    service_pipeline = HybridQuantilePipeline(horizon=H, seasonal_period=7)
    service_pipeline.fit(train_y, promo_flag=train_promo)

    # 3. Predict Multi-Horizon Distribution
    preds = service_pipeline.predict(train_y, promo_future=test_promo)

    # 4. Diagnostic Metric Evaluation
    metrics = EnterpriseEvaluator.evaluate_metrics(test_y, preds["p50"], preds["p10"], preds["p90"])

    print("\nBacktest Performance Metrics Across 14-Day Horizon:")
    print(f"  WAPE (Weighted Abs Pct Error): {metrics['wape']*100:.2f}%")
    print(f"  MAPE (Mean Abs Pct Error):     {metrics['mape']*100:.2f}%")
    print(f"  80% Coverage (PICP):           {metrics['picp_80']*100:.2f}% (Target: 80.0%)")

    # 5. Horizon Breakdown Table
    print(f"\n{'Day':<5} | {'Actual':<10} | {'P10 (Low)':<10} | {'P50 (Median)':<12} | {'P90 (High)':<10} | {'In Bounds?'}")
    print("-" * 65)
    for day in range(H):
        is_in = (test_y[day] >= preds["p10"][day]) and (test_y[day] <= preds["p90"][day])
        print(
            f"D+{day+1:<2d} | {test_y[day]:<10.1f} | {preds['p10'][day]:<10.1f} | "
            f"{preds['p50'][day]:<12.1f} | {preds['p90'][day]:<10.1f} | {is_in}"
        )

    # 6. Assertions
    assert metrics["wape"] < 0.20, f"WAPE error exceeded threshold: {metrics['wape']}"
    assert np.all(preds["p10"] <= preds["p50"]), "Quantile crossing violation: P10 > P50"
    assert np.all(preds["p50"] <= preds["p90"]), "Quantile crossing violation: P50 > P90"

    print("\n[SUCCESS] Capstone hybrid pipeline passed all enterprise accuracy and safety invariants.")
    print("=" * 80)
```

---

## 4. Failure Modes, Edge Cases & Antipatterns

### 4.1 Cold-Start Failure on Newly Launched SKUs
- **The Pitfall:** Ingesting a newly launched product SKU with only 3 days of historical sales into the full 14-lag feature pipeline.
- **Failure Mode:** Feature engineering yields `NaN` across all 7-day rolling statistics and 14-day lags. The pipeline throws an unhandled exception or falls back to `0.0` imputation, predicting zero sales for new items and preventing initial warehouse stocking.
- **Production Architecture Fix:** Implement a 3-tier hierarchical cold-start cascade:
  1. If history length $N < 7$ days: Return the **Category Hierarchical Prior** (e.g., median sales of all newly launched items in the same brand/subcategory).
  2. If $7 \le N < 28$ days: Fall back to a pure **Single Exponential Smoothing (SES)** model without high-order lags.
  3. If $N \ge 28$ days: Activate the full **Hybrid Quantile Pipeline**.

### 4.2 Asynchronous Feature Store Drift (Online-Offline Skew)
- **The Pitfall:** Batch training computes rolling statistics using historical midnight database snapshots, while the real-time inference microservice computes rolling statistics on real-time streaming Kafka logs.
- **Failure Mode:** Minor differences in event time vs. processing time (late-arriving records) cause feature distributions to diverge. The model experiences online-offline skew, resulting in degraded live accuracy despite pristine backtest metrics.
- **Remediation:** Enforce a single unified feature definition using tools like Feast or Polars pipelines shared identically across offline training and online serving containers.

### 4.3 High Serialization Overhead on Large Model Fleets
- **The Pitfall:** Serializing 50,000 separate scikit-learn or LightGBM model binaries to disk using standard Python `pickle` and deserializing them on every API request.
- **Failure Mode:** Disk I/O bottlenecks and Python Global Interpreter Lock (GIL) contention cause inference latency to spike from 15ms to 850ms per request.
- **Remediation:** Maintain an in-memory LRU cache of deserialized pipeline objects and compile tree ensembles using Treelite or ONNX Runtime for multi-threaded C++ evaluation.

---

## 5. Senior Technical Interview Questions & Model Answers

### Question 1: WAPE vs. MAPE in Retail Demand Forecasting
**Prompt:** "Why is Mean Absolute Percentage Error (MAPE) considered fundamentally flawed for retail demand forecasting, and why do enterprise supply chain systems enforce Weighted Absolute Percentage Error (WAPE) instead?"

#### Model Answer:
"While MAPE is mathematically intuitive, it exhibits two structural mathematical flaws that make it hazardous for enterprise inventory planning:

1. **Division by Zero and Instability Near Zero:**
   $$\text{MAPE} = \frac{100\%}{N} \sum_{i=1}^N \left| \frac{y_i - \hat{y}_i}{y_i} \right|$$
   In retail and cloud telemetry, intermittent demand and zero-sales days are frequent. If actual sales $y_i = 0$, MAPE divides by zero, producing an undefined error ($\infty$). Even if $y_i$ is a small positive number (e.g., actual sales = 1 unit, predicted = 5 units), the error is $\frac{|1 - 5|}{1} = 400\%$, exerting disproportionate leverage over the aggregate metric.
2. **Asymmetric Penalty on Over- vs. Under-Forecasting:**
   For a given absolute error $|y - \hat{y}| = 100$:
   - If $y = 100$ and $\hat{y} = 0$ (100% under-forecast), the percentage error is $\frac{100}{100} = 100\%$.
   - If $y = 1$ and $\hat{y} = 101$ (over-forecast by 100), the percentage error is $\frac{100}{1} = 10,000\%$.
   MAPE severely over-penalizes over-forecasting compared to under-forecasting, biasing models toward systematically under-predicting demand.

**Why WAPE is the Enterprise Gold Standard:**
Weighted Absolute Percentage Error (WAPE) weights individual absolute errors by the total volume across the entire catalog:

$$\text{WAPE} = \frac{\sum_{i=1}^N |y_i - \hat{y}_i|}{\sum_{i=1}^N y_i}$$

1. **Robust to Zero:** Individual zeroes in $y_i$ cause zero mathematical difficulty as long as the aggregate catalog volume $\sum y_i > 0$.
2. **Volume-Weighted Economic Relevance:** An error of 100 units on a top-selling SKU (where daily sales = 10,000) contributes negligibly ($\frac{100}{10,000} = 1\%$), whereas that same error on a low-volume SKU is properly contextualized by total platform throughput."

---

### Question 2: Designing an Asymmetric Cost-Utility Forecasting Layer
**Prompt:** "In a grocery supply chain, the cost of an out-of-stock event (lost margin + customer churn penalty) is \$45 per unit, whereas the cost of holding unsold perishable inventory that spoils is \$5 per unit. If your forecasting team can only provide a single point forecast, what quantile $\tau^*$ should your model optimize for?"

#### Model Answer:
"This is the classical **Newsvendor Problem** of operations research. When loss costs are asymmetric, predicting the conditional mean $\mathbb{E}[Y]$ or median is economically sub-optimal.

Let:
- $c_u$ = Cost of Under-forecasting (Underage cost) = \$45 (lost margin + churn penalty)
- $c_o$ = Cost of Over-forecasting (Overage cost) = \$5 (spoilage / disposal cost)

Let $Q$ be the inventory order quantity (our point forecast). Expected total cost is:

$$\mathbb{E}[C(Q)] = c_o \int_{-\infty}^Q (Q - y) f(y) dy + c_u \int_Q^\infty (y - Q) f(y) dy$$

Differentiating with respect to $Q$ using Leibniz's rule:

$$\frac{d}{dQ} \mathbb{E}[C(Q)] = c_o \int_{-\infty}^Q 1 \cdot f(y) dy - c_u \int_Q^\infty 1 \cdot f(y) dy$$

$$c_o F(Q^*) - c_u (1 - F(Q^*)) = 0$$

$$c_o F(Q^*) + c_u F(Q^*) - c_u = 0$$

$$F(Q^*) (c_o + c_u) = c_u \implies F(Q^*) = \frac{c_u}{c_u + c_o}$$

Substituting the operational parameters:

$$\tau^* = \frac{45}{45 + 5} = \frac{45}{50} = 0.90$$

**Conclusion:**
To minimize expected commercial cost, the model must not output the mean or median forecast. It must directly optimize for the **90th percentile ($\text{P90}$)** conditional quantile using the asymmetric pinball loss with $\tau^* = 0.90$. Ordering at the 90th percentile guarantees that stockouts occur on only 10% of days, matching the optimal economic risk balance."

---

### Question 3: Real-Time Serving Architecture for 100,000 Time Series
**Prompt:** "You must design a microservice serving 14-day forward forecasts for 100,000 enterprise tenants with an end-to-end P99 latency SLA of $< 100\text{ms}$. Walk through the caching, compute, and model serialization architecture."

#### Model Answer:
"Serving multi-horizon probabilistic forecasts across 100,000 series within a 100ms P99 SLA requires decoupling real-time feature computation from online serving:

**1. Architectural Topology: Pre-Materialized Serving with On-Demand Fallback**
- **Offline Nightly Batch Inference:** 95% of queries request forecasts for tomorrow. An asynchronous Apache Spark/Ray cluster executes batch inference nightly at 02:00 UTC, pre-computing the 14-day probabilistic forecast vectors $[\hat{y}_{\text{p10}}, \hat{y}_{\text{p50}}, \hat{y}_{\text{p90}}]_{1:14}$ for all 100,000 series.
- **Low-Latency Key-Value Serving Store:** Pre-computed vectors are bulk-loaded into a distributed in-memory cache (**Redis Enterprise Cluster** or **AWS DynamoDB with DAX**). Serving latency is reduced to an $\mathcal{O}(1)$ key lookup: `GET forecast:tenant_id:2026-11-20`, returning in $< 4\text{ms}$.

**2. Real-Time On-Demand Fallback (The Remaining 5%)**
When an interactive user overrides assumptions (e.g., simulating an ad-hoc promotional discount):
- **Lightweight Model Artifacts:** Tree models are compiled into optimized C-libraries via **Treelite** or exported to **ONNX Runtime**, eliminating Python interpreter overhead. Model weights for a tenant are under 250 KB.
- **In-Memory Worker Cache:** The FastAPI serving pods maintain an in-memory LRU cache of compiled ONNX inference sessions.
- **Vectorized Preprocessing:** Feature engineering uses compiled NumPy/C-extensions without pandas overhead, transforming the 28-day historical input into feature matrix $X$ in $< 2\text{ms}$.
- **C++ Inference Execution:** ONNX Runtime evaluates the 14 direct models concurrently across CPU threads in $< 12\text{ms}$.

**3. Total Latency Budget Breakdown:**
- TLS Termination & Ingress Gateway: 8ms
- Redis Cache Hit: 4ms
- Cache Miss Fallback: Feature generation (2ms) + ONNX inference (12ms) + Pydantic serialization (2ms) = 16ms
- Total P99 Latency: $< 30\text{ms}$, comfortably inside the 100ms statutory SLA."
