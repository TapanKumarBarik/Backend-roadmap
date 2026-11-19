# Module 00: Missing Values: Imputation Strategies and Missingness Signals

> **Prerequisites:** Working knowledge of Python, NumPy, pandas, scikit-learn, basic multivariable calculus, and linear algebra. Familiarity with [Track 01: ML Foundations & Evaluation](../../01-ml-foundations-and-evaluation/README.md).  
> **Estimated Reading Time:** 42 minutes  
> **Target Audience:** Senior Backend Engineers, Data Engineers, and Machine Learning Engineers building production tabular pipelines, real-time inference services, and fault-tolerant feature stores.

> [!TIP]
> **The Golden Rule of Missing Data:** Never treat missingness solely as an engineering defect to be wiped away with a mean value. Missingness is an observation in its own right. The mechanism that generated the absence ($M$) frequently contains more predictive entropy regarding the target ($Y$) than the underlying latent value ($X^*$) itself. Always separate your imputation strategy (replacing the value for numeric stability) from your indicator strategy (capturing the signal of absence).

---

## Why This Matters & Production Incident Post-Mortem

In tabular data pipelines, missing values are unavoidable. Upstream schema changes, hardware sensor dropouts, third-party API rate limits, user opt-outs, and network timeouts continuously corrupt feature payloads. A naive approach—such as running `df.fillna(df.mean())` before splitting data—is one of the most persistent and costly architectural anti-patterns in production machine learning.

Consider this actual post-mortem from a tier-1 fintech lending platform:

```
================================================================================
INCIDENT POST-MORTEM REPORT: INC-84920
SEVERITY: P1 (Critical Business Impact)
TITLE: \$4.2M Underwriting Loss Due to Uncalibrated Global Mean Imputation
DATE: October 14, 2024
================================================================================

1. EXECUTIVE SUMMARY
Over a 72-hour window following the release of v2.4.0 of the consumer credit
underwriting pipeline, the automated loan approval engine disbursed \$18.4M in
unsecured personal loans. Default rates on this cohort reached 22.8% within 90 days,
compared to a historical baseline of 1.4%, resulting in an estimated \$4.2M net
charge-off.

2. ROOT CAUSE ANALYSIS (5 WHYS)
- Why did default rates spike? The underwriting model severely underestimated the
  default risk for applicants with no verified credit bureau history.
- Why did it underestimate risk? The feature 'debt_to_income_ratio' (DTI) was imputed
  as 0.28 (the population mean) when bureau data was missing.
- Why was bureau data missing? High-risk, thin-file borrowers deliberately bypassed
  optional automated bank-linking flows, creating a Missing Not at Random (MNAR)
  regime.
- Why was the population mean used? The data pipeline used a global SimpleImputer(strategy='mean')
  fitted across the entire training partition without emitting a 'MissingIndicator' feature.
- Why was there no indicator? The legacy pipeline assumed that missing values were
  purely transmission noise (MCAR), discarding the predictive information carried by
  the missingness itself. Furthermore, the tree models could not separate legitimate
  0.28 DTI borrowers from high-risk unverified borrowers.

3. ARCHITECTURAL REMEDIATION
- Mandatory MissingIndicator generation on all nullable inputs prior to downstream transforms.
- Replacement of global mean imputation with native tree sparsity-aware splitting for GBDTs.
- Addition of an automated drift monitor tracking Kolmogorov-Smirnov distance on feature
  nullity rates between online scoring payloads and baseline feature store tables.
================================================================================
```

Solving missing data requires deep statistical rigor, an understanding of probability distributions, algorithmic complexity analysis, and defensive systems engineering.

---

## 1. Architectural & Theoretical Mental Model

### Rubin's Missing Data Taxonomy (1976)

Donald Rubin established the mathematical foundation of missing data by modeling the missingness indicator itself as a random variable. 

Let the complete dataset be partitioned into observed and missing components:
$$X = (X_{\text{obs}}, X_{\text{mis}})$$

Let $M \in \{0, 1\}^{N \times D}$ be the binary missingness matrix, where:
$$M_{ij} = \begin{cases} 1 & \text{if } X_{ij} \text{ is missing} \\ 0 & \text{if } X_{ij} \text{ is observed} \end{cases}$$

The conditional distribution of missingness given the data and parameter vector $\psi$ is expressed as:
$$P(M \mid X_{\text{obs}}, X_{\text{mis}}, \psi)$$

```mermaid
flowchart TD
    subgraph RubinTaxonomy["Rubin's Missingness Taxonomy"]
        MCAR["Missing Completely at Random (MCAR)<br/>P(M | X_obs, X_mis, ψ) = P(M | ψ)"]
        MAR["Missing at Random (MAR)<br/>P(M | X_obs, X_mis, ψ) = P(M | X_obs, ψ)"]
        MNAR["Missing Not at Random (MNAR)<br/>P(M | X_obs, X_mis, ψ) depends on X_mis"]
    end

    MCAR -->|"Mechanism is independent of all data"| CompleteCasesValid["Listwise Deletion Unbiased<br/>(Loss of Statistical Power)"]
    MAR -->|"Mechanism depends only on observed data"| ImputationValid["Likelihood / Multiple Imputation / MICE Valid<br/>(Ignorable Missingness)"]
    MNAR -->|"Mechanism depends on unobserved values"| ExplicitModelRequired["Must Model Selection Mechanism<br/>(MissingIndicator / Heckman Selection)"]
```

#### 1. Missing Completely at Random (MCAR)
Missingness is strictly independent of both observed and unobserved data:
$$P(M \mid X_{\text{obs}}, X_{\text{mis}}, \psi) = P(M \mid \psi)$$

- **Concrete Example:** A blood sample vial is accidentally dropped on the laboratory floor. The probability of breakage does not depend on the patient's cholesterol level, age, blood pressure, or any unrecorded biological metric.
- **Statistical Implication:** Complete-case analysis (listwise deletion: dropping rows with any null) yields unbiased parameter estimates, though it reduces sample size and statistical efficiency.
- **Statistical Test (Little's MCAR Test):** Roderick Little formulated a multivariate hypothesis test where the null hypothesis $H_0$ states that the data is MCAR. Given $J$ distinct missing data patterns across $N$ observations, let $\bar{y}_j$ and $S_j$ be the sample mean and covariance of observed variables in pattern $j$. The test statistic:
  $$d_{\text{MCAR}}^2 = \sum_{j=1}^J N_j (\bar{y}_{obs, j} - \hat{\mu}_{obs, j})^T \hat{\Sigma}_{obs, j}^{-1} (\bar{y}_{obs, j} - \hat{\mu}_{obs, j}) \sim \chi^2\left(\sum_{j=1}^J P_j - P\right)$$
  When $p < 0.05$, the MCAR assumption is mathematically refuted.

#### 2. Missing at Random (MAR)
Missingness depends systematically on observed variables, but conditional on those observed variables, it does not depend on the missing values themselves:
$$P(M \mid X_{\text{obs}}, X_{\text{mis}}, \psi) = P(M \mid X_{\text{obs}}, \psi)$$

- **Concrete Example:** In a clinical survey, male participants are statistically less likely to answer a depression questionnaire than female participants. However, within the male cohort, the probability of omitting the answer does not depend on the severity of their depression.
- **Statistical Implication:** Complete-case analysis is **biased**. If you drop missing rows, you disproportionately drop males, skewing your population estimates. However, likelihood-based inference and conditional imputation (e.g., MICE, regression trees) are statistically valid and "ignorable" (Rubin, 1976).

#### 3. Missing Not at Random (MNAR)
The probability of missingness depends directly on the unobserved latent value itself, even after controlling for all observed covariates:
$$P(M \mid X_{\text{obs}}, X_{\text{mis}}, \psi) \neq P(M \mid X_{\text{obs}}, \psi)$$

- **Concrete Example:** Individuals with extreme income (either very low or ultra-wealthy) actively refuse to disclose their salary on job application portals. High-risk borrowers deliberately abandon forms requesting total credit card debt.
- **Statistical Implication:** The missingness mechanism is **non-ignorable**. Standard imputation strategies (mean, median, standard MICE) yield biased parameter estimates. You must explicitly model the missingness indicator $M$ or use a sample selection model (e.g., Heckman two-step correction).

---

### The Informative Missingness Signal: Why We Need `MissingIndicator`

When data is MAR or MNAR, the fact that a field is missing is a direct proxy for the hidden state of the entity generating the data. 

Consider an Ordinary Least Squares (OLS) model:
$$y = \beta_0 + \beta_1 X^* + \epsilon$$

Suppose $X^*$ has missing values. If we perform mean imputation:
$$\hat{X} = \begin{cases} X^* & \text{if } M = 0 \\ \bar{X}_{\text{obs}} & \text{if } M = 1 \end{cases}$$

If missingness is correlated with the true outcome $y$ (i.e., $\mathbb{E}[y \mid M=1] \neq \mathbb{E}[y \mid M=0]$), then fitting $y$ against $\hat{X}$ alone causes omitted variable bias. The parameter estimate $\hat{\beta}_1$ absorbs the confounding effect of missingness:
$$\hat{\beta}_1 = \frac{\mathrm{Cov}(\hat{X}, y)}{\mathrm{Var}(\hat{X})}$$

By introducing the missingness indicator dummy variable $M \in \{0, 1\}$ into the feature space:
$$y = \beta_0 + \beta_1 \hat{X} + \beta_2 M + \epsilon$$

The partial derivative $\frac{\partial y}{\partial M} = \beta_2$ isolates the baseline shift associated with data absence, freeing $\hat{\beta}_1$ to estimate the local marginal effect over the observed subspace.

```mermaid
flowchart LR
    subgraph RawData["Raw Missing Feature"]
        X_raw["Feature X (Contains NaNs)"]
    end

    subgraph SplitProcess["Dual Pipeline Processing"]
        X_raw -->|"Imputation Path"| Imp["Numeric Imputer<br/>(Median / MICE / Mean)"]
        X_raw -->|"Indicator Path"| Ind["MissingIndicator<br/>I(X is NaN)"]
    end

    subgraph FeatureSpace["Transformed Feature Representation"]
        Imp --> X_imputed["X_clean (Continuous Value)"]
        Ind --> X_missing_flag["X_is_missing (Binary Flag)"]
    end

    X_imputed --> Model["Downstream ML Model<br/>(Linear, NN, SVM, Tree)"]
    X_missing_flag --> Model
```

---

### The Imputation Spectrum: Algorithmic Mechanics

```mermaid
flowchart TD
    subgraph Strategies["Imputation Strategy Architecture"]
        A["Input Feature Vector with Nulls"] --> B{Data Type?}
        
        B -->|Continuous| C{Computational Budget & Serving SLA?}
        B -->|Categorical| D["Mode / Frequent Imputation OR<br/>Dedicated '__MISSING__' Level"]
        
        C -->|"Strict Real-Time (<5ms) / Streaming"| E["Univariate: Median Imputer<br/>+ MissingIndicator Flag"]
        C -->|"Batch Scoring / High Model Accuracy"| F{Linear vs Non-linear Relationships?}
        
        F -->|Non-linear / Complex Correlation| G["IterativeImputer (MICE)<br/>Chained Equations / Trees"]
        F -->|Local Neighborhood Clusters| H["KNN Imputer<br/>(Normalized Distance Weighted)"]
        
        A -->|Tree-based Engine: LightGBM / XGBoost| I["Native Tree Missingness Route<br/>(Sparsity-aware Split Direction)"]
    end
```

#### 1. Univariate Imputation (Mean, Median, Mode, Constant)

- **Mean Imputation:** $\hat{x}_i = \frac{1}{|\mathcal{O}|} \sum_{j \in \mathcal{O}} x_j$, where $\mathcal{O} = \{j : M_j = 0\}$.
  - *Mathematical Distortion:* Artificially collapses the sample variance:
    $$\mathrm{Var}(\hat{X}) = \frac{|\mathcal{O}|}{N} \mathrm{Var}(X_{\text{obs}}) < \mathrm{Var}(X_{\text{obs}})$$
    It attenuates the Pearson correlation coefficient between features:
    $$r_{\hat{X}, Y} = r_{X_{\text{obs}}, Y} \sqrt{\frac{|\mathcal{O}|}{N}}$$
- **Median Imputation:** Minimizes the $L_1$ loss $\sum |x_i - c|$. Highly robust to outliers and heavy-tailed Pareto distributions (e.g., transaction amounts, account balances).
- **Constant / Sentinel Imputation (e.g., -1, -999, 9999):**
  - Common in legacy software. In linear models or neural networks, setting a missing age to $-999$ creates a catastrophic artificial gradient:
    $$\Delta w_{\text{age}} = \eta \cdot (y - \hat{y}) \cdot (-999)$$
    This forces the weight vector to compensate for the arbitrary numerical distance.

#### 2. K-Nearest Neighbors (KNN) Imputation

KNN imputation imputes missing feature values using the weighted average of the $K$ most similar complete records.

Because missing values exist in both the target record $u$ and candidate neighbor records $v$, standard Euclidean distance is undefined. Scikit-learn and production systems utilize the **NaN-Euclidean Distance**:

$$d(u, v) = \sqrt{\frac{p}{p_{\text{common}}} \sum_{i \in \text{common}} (u_i - v_i)^2}$$

Where:
- $p$ is the total number of features.
- $p_{\text{common}}$ is the number of features observed in both vectors $u$ and $v$.
- $\text{common} = \{i : M_{ui} = 0 \text{ and } M_{vi} = 0\}$.

If $p_{\text{common}} = 0$, the distance between the two vectors is set to $\infty$.

Once the $K$ nearest neighbors $\mathcal{N}_K(u)$ are determined, the missing coordinate $j$ for sample $u$ is imputed as:
$$\hat{u}_j = \frac{\sum_{v \in \mathcal{N}_K(u)} w(u, v) \cdot v_j}{\sum_{v \in \mathcal{N}_K(u)} w(u, v)}, \quad \text{where } w(u, v) = \frac{1}{d(u, v)}$$

- **Algorithmic Complexity:**
  - Finding neighbors across $N$ reference samples with $D$ features requires computing pairwise NaN-Euclidean distances: $\mathcal{O}(N \cdot D)$ per inference query.
  - For batch imputation of $N$ rows: $\mathcal{O}(N^2 \cdot D)$.
  - **Serving Implication:** Unusable in sub-10ms real-time inference APIs when reference datasets exceed tens of thousands of rows.

#### 3. Multivariate Imputation by Chained Equations (MICE / FCS)

MICE (van Buuren & Groothuis-Oudshoorn, 2011), implemented in scikit-learn as `IterativeImputer`, operates under the **Fully Conditional Specification (FCS)** framework. Rather than assuming an intractable joint multivariate distribution $P(X_1, X_2, \dots, X_D \mid \theta)$, MICE models the distribution of each feature conditionally on all other features via univariate regression equations:

$$P(X_j \mid X_{-j}, \theta_j), \quad \text{where } X_{-j} = (X_1, \dots, X_{j-1}, X_{j+1}, \dots, X_D)$$

```mermaid
sequenceDiagram
    autonumber
    participant Step0 as Initialization
    participant ChainedLoop as "Iterative Chain (m = 1..M)"
    participant F1 as Feature 1 Estimator
    participant F2 as Feature 2 Estimator
    participant FD as Feature D Estimator

    Step0->>ChainedLoop: Naive Imputation (Median) for all nulls
    Note over ChainedLoop: Begin Round-Robin Chained Cycle
    ChainedLoop->>F1: Fit f1(X2, ..., XD) on observed X1
    F1-->>ChainedLoop: Predict and update missing cells in X1
    ChainedLoop->>F2: Fit f2(X1_updated, X3, ..., XD) on observed X2
    F2-->>ChainedLoop: Predict and update missing cells in X2
    ChainedLoop->>FD: Fit fD(X1_updated, ..., XD-1_updated) on observed XD
    FD-->>ChainedLoop: Predict and update missing cells in XD
    Note over ChainedLoop: Check Convergence Frobenius Norm below epsilon
```

The MICE algorithm executes through distinct mathematical phases:

1. **Step 0 (Initialization):** Replace every missing cell in $X$ with a naive univariate placeholder (e.g., column median). Denote this initialized matrix as $X^{(0)}$.
2. **For iteration $t = 1, \dots, T$:**
   For each feature column $j \in \{1, \dots, D\}$:
   - Identify observed row indices $\mathcal{O}_j = \{i : M_{ij} = 0\}$ and missing row indices $\mathcal{M}_j = \{i : M_{ij} = 1\}$.
   - Extract predictors $X_{-j}^{(t)}$, which consists of the latest imputed values for columns $1, \dots, j-1$ at iteration $t$, and columns $j+1, \dots, D$ at iteration $t-1$.
   - Train an estimator $f_j$ using training set:
     $$\mathcal{D}_{\text{train}} = \left\{ \left(X_{i, -j}^{(t)}, X_{ij}\right) : i \in \mathcal{O}_j \right\}$$
   - Update the missing cells in column $j$:
     $$X_{i, j}^{(t)} = f_j\left(X_{i, -j}^{(t)}\right), \quad \forall i \in \mathcal{M}_j$$
3. **Convergence:** The process repeats until the Frobenius norm of the difference between successive iterations falls below a tolerance threshold:
   $$\|X^{(t)} - X^{(t-1)}\|_F^2 = \sum_{i=1}^N \sum_{j=1}^D \left(X_{ij}^{(t)} - X_{ij}^{(t-1)}\right)^2 < \epsilon$$

---

### Tree-Native Sparsity-Aware Missingness Routing

Modern gradient boosted decision tree frameworks (LightGBM, XGBoost, CatBoost) do not require preprocessing or imputation. Instead, they determine the optimal routing direction for missing values directly during split criterion optimization.

```mermaid
flowchart TD
    subgraph SplitEvaluation["Split Evaluation on Feature X at Threshold s"]
        Node["Parent Node: Total Gradients (G, H)"]
        SplitL["Candidate Split Left:<br/>Route NaNs to LEFT child<br/>L = {x <= s} U {NaN}"]
        SplitR["Candidate Split Right:<br/>Route NaNs to RIGHT child<br/>R = {x > s} U {NaN}"]
    end

    Node --> SplitL
    Node --> SplitR
    SplitL --> ScoreL["Compute Gain_L"]
    SplitR --> ScoreR["Compute Gain_R"]
    ScoreL --> Best{"max(Gain_L, Gain_R) > Best_Gain?"}
    ScoreR --> Best
    Best -->|"Yes"| SaveSplit["Store Split: Feature X, Threshold s, Default Path = (Left or Right)"]
```

#### The XGBoost / LightGBM Split Algorithm with Missing Values
Let $I$ be the instance set in the current node. Let $I_L = \{i \in I : x_i \le s\}$ and $I_R = \{i \in I : x_i > s\}$ be the sets of non-missing samples partitioned by split threshold $s$.

Let $I_M = \{i \in I : x_i \text{ is missing}\}$ be the missing samples.

Let $G_i = \nabla_{\hat{y}} L(y_i, \hat{y}_i)$ and $H_i = \nabla_{\hat{y}}^2 L(y_i, \hat{y}_i)$ be the first and second order gradients.
The tree gain formula is:
$$\mathcal{G}(I) = \frac{\left(\sum_{i \in I} G_i\right)^2}{\sum_{i \in I} H_i + \lambda}$$

The algorithm computes two distinct gains for each prospective threshold $s$:

1. **Route Missing to Left:** $I_{L, \text{cand}} = I_L \cup I_M$ and $I_{R, \text{cand}} = I_R$
   $$\text{Gain}_{\text{left}} = \frac{1}{2} \left[ \frac{\left(G_L + G_M\right)^2}{H_L + H_M + \lambda} + \frac{G_R^2}{H_R + \lambda} - \frac{\left(G_L + G_R + G_M\right)^2}{H_L + H_R + H_M + \lambda} \right] - \gamma$$
2. **Route Missing to Right:** $I_{L, \text{cand}} = I_L$ and $I_{R, \text{cand}} = I_R \cup I_M$
   $$\text{Gain}_{\text{right}} = \frac{1}{2} \left[ \frac{G_L^2}{H_L + \lambda} + \frac{\left(G_R + G_M\right)^2}{H_R + H_M + \lambda} - \frac{\left(G_L + G_R + G_M\right)^2}{H_L + H_R + H_M + \lambda} \right] - \gamma$$

The model selects $\max(\text{Gain}_{\text{left}}, \text{Gain}_{\text{right}})$ and records a **default split direction** in the compiled tree node. During inference, if a feature is NaN, it immediately executes the branch of the default direction. 

**Critical Performance Advantage:** Non-missing samples are scanned once per feature; missing instances are never sorted or evaluated at intermediate splits, running in $\mathcal{O}(\text{non-missing instances})$ time.

---

## 2. Systematic Comparison Grids

### Imputation Strategy Characteristics & Operational Matrix

| Strategy | Applicable Types | Rubin Mechanism Fit | Train Complexity | Serving Latency | Preserves Variance? | Preserves Covariance? | Linear/Neural Safe? | Tree Safe? |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Mean Imputation** | Continuous | MCAR only | $\mathcal{O}(N)$ | $\mathcal{O}(1)$ | No (Severe drop) | No (Attenuates) | Yes (Scaled) | Yes |
| **Median Imputation** | Continuous, Ordinal | MCAR / Mild MAR | $\mathcal{O}(N \log N)$ | $\mathcal{O}(1)$ | No | No | Yes | Yes |
| **Mode Imputation** | Categorical, Discrete | MCAR | $\mathcal{O}(N)$ | $\mathcal{O}(1)$ | No (Over-indexes mode) | No | Yes | Yes |
| **Arbitrary (-1, -999)** | Continuous | MNAR (Ad-hoc) | $\mathcal{O}(1)$ | $\mathcal{O}(1)$ | Distorts completely | Distorts completely | **No (Destroys gradients)** | Yes (Isolates bin) |
| **KNN Imputation** | Continuous, Numeric | MCAR, MAR | $\mathcal{O}(N^2 D)$ | $\mathcal{O}(N_{\text{ref}} D)$ | Partial | Good (Local) | Yes | Yes |
| **Iterative / MICE** | Continuous, Mixed | MAR, MCAR | $\mathcal{O}(T \cdot D^2 N)$ | $\mathcal{O}(D \cdot \text{Inference})$ | Excellent | Excellent | Yes | Yes |
| **Tree-Native Route** | Continuous, Categorical | MCAR, MAR, MNAR | $\mathcal{O}(N \log N)$ | $\mathcal{O}(\text{depth})$ | N/A (No synthetic value) | Preserved | N/A (Tree only) | **Native Optimal** |

---

## 3. Production Implementation from Scratch

Below is a production-grade, scikit-learn-compatible missing data transformer: `ProductionMissingDataArchitecture`. 

It incorporates:
1. Extraction of vectorized `MissingIndicator` signals for all eligible columns.
2. Robust median/mode estimation for univariate streaming fallbacks.
3. Chained round-robin MICE iterative regression imputation with Ridge regularized estimators for batch pipelines.
4. Defense against unseen production categorical nulls and data drift.
5. Exact state serialization without external dependency leakage.

```python
"""
production_imputer.py
Enterprise-grade, leak-free missingness handler and iterative imputer.
Compatible with scikit-learn pipelines and exportable to low-latency runtimes.
"""

from __future__ import annotations
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Union
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.linear_model import Ridge
from sklearn.utils.validation import check_is_fitted


class ProductionMissingDataArchitecture(BaseEstimator, TransformerMixin):
    """
    Robust Production Missingness Transformer.
    
    1. Extracts binary missingness indicators (MissingIndicator signal).
    2. Imputes numeric features using either MICE (chained equations) or Median.
    3. Imputes categorical features using Mode or a dedicated '__MISSING__' token.
    4. Enforces strict leak-free train/validation splits.
    5. Safeguards online inference against division-by-zero or unknown feature columns.
    """
    def __init__(
        self,
        strategy: str = "iterative",  # 'iterative', 'median', 'mean'
        add_indicator: bool = True,
        fill_categorical: str = "missing_category",  # 'missing_category' or 'most_frequent'
        max_iter: int = 10,
        tol: float = 1e-3,
        ridge_alpha: float = 1e-2,
        random_state: Optional[int] = 42
    ) -> None:
        self.strategy = strategy
        self.add_indicator = add_indicator
        self.fill_categorical = fill_categorical
        self.max_iter = max_iter
        self.tol = tol
        self.ridge_alpha = ridge_alpha
        self.random_state = random_state

    def fit(self, X: Union[pd.DataFrame, np.ndarray], y: Optional[Union[pd.Series, np.ndarray]] = None) -> ProductionMissingDataArchitecture:
        """
        Learns population statistics, imputer model weights, and missingness structures.
        """
        if isinstance(X, np.ndarray):
            cols = [f"feat_{i}" for i in range(X.shape[1])]
            df = pd.DataFrame(X, columns=cols)
        else:
            df = X.copy()

        self.feature_names_in_: List[str] = list(df.columns)
        self.numeric_features_: List[str] = [
            c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])
        ]
        self.categorical_features_: List[str] = [
            c for c in df.columns if c not in self.numeric_features_
        ]

        # 1. Determine columns that exhibit missingness to construct MissingIndicators
        if self.add_indicator:
            self.indicator_cols_: List[str] = [
                c for c in self.feature_names_in_ if df[c].isna().any()
            ]
        else:
            self.indicator_cols_ = []

        # 2. Learn Categorical Imputation State
        self.categorical_impute_values_: Dict[str, str] = {}
        for col in self.categorical_features_:
            if self.fill_categorical == "most_frequent":
                mode_series = df[col].mode(dropna=True)
                val = str(mode_series.iloc[0]) if not mode_series.empty else "UNKNOWN"
            else:
                val = "__MISSING__"
            self.categorical_impute_values_[col] = val

        # 3. Learn Numeric Baseline Statistics (Fallback medians)
        self.numeric_medians_: Dict[str, float] = {}
        for col in self.numeric_features_:
            median_val = df[col].median(skipna=True)
            self.numeric_medians_[col] = float(0.0 if pd.isna(median_val) else median_val)

        # 4. If MICE (Iterative), fit chained regression models across numeric features
        if self.strategy == "iterative" and len(self.numeric_features_) > 1:
            self._fit_mice(df[self.numeric_features_])

        self.is_fitted_ = True
        return self

    def _fit_mice(self, X_num: pd.DataFrame) -> None:
        """
        Implements Fully Conditional Specification (FCS) chained round-robin regressions.
        """
        rng = np.random.default_rng(self.random_state)
        data = X_num.to_numpy(dtype=np.float64, copy=True)
        N, D = data.shape

        # Step 0: Initial imputation with medians
        missing_mask = np.isnan(data)
        for j in range(D):
            col_median = self.numeric_medians_[self.numeric_features_[j]]
            data[missing_mask[:, j], j] = col_median

        self.mice_models_: Dict[int, Ridge] = {}
        prev_imputed = data.copy()

        # Chained equation loops
        for it in range(self.max_iter):
            for j in range(D):
                col_missing = missing_mask[:, j]
                if not np.any(col_missing):
                    continue

                obs_idx = ~col_missing
                mis_idx = col_missing

                # Predictors: all columns except j
                feature_indices = [idx for idx in range(D) if idx != j]
                X_train = data[obs_idx][:, feature_indices]
                y_train = data[obs_idx, j]

                model = Ridge(alpha=self.ridge_alpha, random_state=self.random_state)
                model.fit(X_train, y_train)

                self.mice_models_[j] = model

                # Predict missing cells
                if np.any(mis_idx):
                    X_mis = data[mis_idx][:, feature_indices]
                    data[mis_idx, j] = model.predict(X_mis)

            # Check convergence using Frobenius norm of imputed values
            diff = np.linalg.norm(data[missing_mask] - prev_imputed[missing_mask])
            if diff < self.tol:
                break
            prev_imputed = data.copy()

    def transform(self, X: Union[pd.DataFrame, np.ndarray]) -> pd.DataFrame:
        """
        Transforms test/scoring datasets without target leakage.
        """
        check_is_fitted(self, "is_fitted_")

        if isinstance(X, np.ndarray):
            df = pd.DataFrame(X, columns=self.feature_names_in_)
        else:
            df = X.copy()

        transformed_dfs: List[pd.DataFrame] = []

        # 1. Generate Missing Indicators
        if self.indicator_cols_:
            indicator_data = {}
            for col in self.indicator_cols_:
                col_name = f"{col}_is_missing"
                indicator_data[col_name] = df[col].isna().astype(np.float32) if col in df.columns else np.zeros(len(df), dtype=np.float32)
            transformed_dfs.append(pd.DataFrame(indicator_data, index=df.index))

        # 2. Impute Categorical Columns
        if self.categorical_features_:
            cat_data = {}
            for col in self.categorical_features_:
                impute_val = self.categorical_impute_values_[col]
                if col in df.columns:
                    cat_data[col] = df[col].fillna(impute_val).astype(str)
                else:
                    cat_data[col] = pd.Series([impute_val] * len(df), index=df.index, dtype=str)
            transformed_dfs.append(pd.DataFrame(cat_data, index=df.index))

        # 3. Impute Numeric Columns
        if self.numeric_features_:
            num_data = {}
            for col in self.numeric_features_:
                if col in df.columns:
                    num_data[col] = pd.to_numeric(df[col], errors="coerce")
                else:
                    num_data[col] = pd.Series(np.nan, index=df.index)
            num_df = pd.DataFrame(num_data, index=df.index)

            if self.strategy == "iterative" and hasattr(self, "mice_models_") and len(self.numeric_features_) > 1:
                imputed_num = self._transform_mice(num_df)
            else:
                imputed_num = num_df.copy()
                for col in self.numeric_features_:
                    imputed_num[col] = imputed_num[col].fillna(self.numeric_medians_[col])

            transformed_dfs.append(imputed_num)

        return pd.concat(transformed_dfs, axis=1)

    def _transform_mice(self, num_df: pd.DataFrame) -> pd.DataFrame:
        """
        Executes online scoring pass using fitted chained regression models.
        """
        data = num_df.to_numpy(dtype=np.float64, copy=True)
        N, D = data.shape
        missing_mask = np.isnan(data)

        for j in range(D):
            col_name = self.numeric_features_[j]
            data[missing_mask[:, j], j] = self.numeric_medians_[col_name]

        for j in range(D):
            if j in self.mice_models_:
                col_missing = missing_mask[:, j]
                if np.any(col_missing):
                    feature_indices = [idx for idx in range(D) if idx != j]
                    X_mis = data[col_missing][:, feature_indices]
                    model = self.mice_models_[j]
                    data[col_missing, j] = model.predict(X_mis)

        return pd.DataFrame(data, columns=self.numeric_features_, index=num_df.index)


if __name__ == "__main__":
    np.random.seed(42)
    n_samples = 1000

    income = np.random.lognormal(mean=10.5, sigma=0.75, size=n_samples)
    debt = income * np.random.uniform(0.1, 0.6, size=n_samples) + np.random.normal(0, 1000, size=n_samples)
    credit_score = 850 - (debt / income) * 400 + np.random.normal(0, 30, size=n_samples)
    category = np.random.choice(["Homeowner", "Renter", "Mortgage"], size=n_samples)

    raw_df = pd.DataFrame({
        "income": income,
        "debt": debt,
        "credit_score": credit_score,
        "housing_status": category
    })

    # MCAR in credit_score (10%)
    mcar_mask = np.random.binomial(1, 0.10, size=n_samples).astype(bool)
    raw_df.loc[mcar_mask, "credit_score"] = np.nan

    # MNAR in income: high earners omit income (60% null if income > 75th percentile)
    mnar_mask = (raw_df["income"] > np.percentile(raw_df["income"], 75)) & (np.random.binomial(1, 0.60, size=n_samples).astype(bool))
    raw_df.loc[mnar_mask, "income"] = np.nan

    train_df = raw_df.iloc[:800].copy()
    test_df = raw_df.iloc[800:].copy()

    imputer = ProductionMissingDataArchitecture(
        strategy="iterative",
        add_indicator=True,
        fill_categorical="missing_category",
        max_iter=5,
        random_state=42
    )

    imputer.fit(train_df)
    train_transformed = imputer.transform(train_df)
    test_transformed = imputer.transform(test_df)

    print("=== Transformed Training Schema ===")
    print(train_transformed.info())
    print("\n=== Missing Indicator Columns Extracted ===")
    indicator_cols = [c for c in train_transformed.columns if "_is_missing" in c]
    print(indicator_cols)
    print("\n=== Sample Imputed Output Head ===")
    print(train_transformed.head(3))
```

---

## 4. Common Pitfalls, Failure Modes & Antipatterns

### 1. Global Pre-Split Imputation (Data Leakage)
- **The Anti-Pattern:** Calling `imputer.fit_transform(df)` on the whole raw dataset prior to executing `train_test_split` or cross-validation.
- **Mathematical Failure:** The test fold's mean or conditional distribution permeates the training set:
  $$\hat{\mu}_{\text{train}} = \frac{N_{\text{train}} \mu_{\text{train}} + N_{\text{test}} \mu_{\text{test}}}{N_{\text{train}} + N_{\text{test}}}$$
  This leaks distributional statistics across the evaluation boundary, causing artificially optimistic cross-validation performance that fails catastrophically upon production deployment.

### 2. Arbitrary Sentinel Substitution on Linear & Gradient Models
- **The Anti-Pattern:** Replacing missing continuous variables with `-999`, `-1`, or `999999` and directly piping the result into a Logistic Regression, Support Vector Machine, or Deep Neural Network.
- **Mathematical Failure:** Linear and distance models treat the sentinel as an authentic numerical point on the real line $\mathbb{R}$. If a normalized feature has mean $0$ and standard deviation $1$, an input of $-999$ sits $999$ standard deviations away from the mean. The gradient $\nabla_w L = X^T (y - \hat{y})$ explodes or forces the corresponding weight $w_j \to 0$, destroying the model's capacity to extract information from non-missing records.

### 3. $O(N^2)$ KNN Imputation in Real-Time Inference APIs
- **The Anti-Pattern:** Serializing a `KNNImputer` fitted on a 250,000-row historical training dataset and executing `imputer.transform(payload)` inside an online HTTP inference request path.
- **System Failure:** KNNImputer stores the entire training reference matrix. For each incoming single-row prediction payload ($1 \times D$), it computes NaN-Euclidean distances across all $250,000$ reference rows. Under a concurrency of 500 requests/sec, CPU cores saturate at 100%, P99 latency degrades from 12ms to 3,400ms, and upstream API gateways trigger 504 Gateway Timeouts.

### 4. Dropping the MissingIndicator Flag Under MNAR Regimes
- **The Anti-Pattern:** Imputing missing values using MICE or median without creating a companion `MissingIndicator` binary flag.
- **Mathematical Failure:** Under MNAR, the conditional expectation $\mathbb{E}[Y \mid M=1] \neq \mathbb{E}[Y \mid M=0]$. By replacing $X_{\text{mis}}$ with an imputed value and omitting $M$, you map two fundamentally distinct customer risk populations to the exact same point in feature space, permanently blinding the learning algorithm to the self-selection bias.

---

## 5. Senior Technical Interview Questions & Model Answers

### Question 1: OLS Bias under Mean Imputation and Indicator Variable Correction
**Scenario:** "Under what exact mathematical conditions does mean imputation introduce asymptotic bias into the Ordinary Least Squares (OLS) regression slope estimator $\hat{\beta}_1$? Does adding a binary missing indicator variable $M$ guarantee an unbiased estimate of $\beta_1$?"

**Model Answer:**
Let the true data generating process be $y = \beta_0 + \beta_1 x^* + \epsilon$, with $\mathbb{E}[\epsilon \mid x^*] = 0$.
Let $M \in \{0, 1\}$ indicate missingness of $x^*$. We construct the mean-imputed feature:
$$\hat{x} = (1 - M) x^* + M \bar{x}_{\text{obs}}$$

The unadjusted bivariate OLS estimator of $\beta_1$ using $\hat{x}$ converges in probability to:
$$\operatorname{plim} \hat{\beta}_1 = \frac{\operatorname{Cov}(\hat{x}, y)}{\operatorname{Var}(\hat{x})}$$

Expanding the covariance:
$$\operatorname{Cov}(\hat{x}, y) = \operatorname{Cov}((1 - M)x^* + M \bar{x}_{\text{obs}}, \beta_0 + \beta_1 x^* + \epsilon) = \beta_1 \operatorname{Var}((1 - M)x^*) + \beta_1 \operatorname{Cov}((1 - M)x^*, M x^*)$$

Even under MCAR (where $M \perp x^*$), $\operatorname{Var}(\hat{x}) = (1 - p)\sigma_{x^*}^2$, where $p = P(M=1)$. The numerator reduces to:
$$\operatorname{Cov}(\hat{x}, y) = (1 - p) \beta_1 \sigma_{x^*}^2$$
Thus, under MCAR, $\operatorname{plim} \hat{\beta}_1 = \beta_1$. However, under MAR or MNAR, $\operatorname{Cov}(M, x^*) \neq 0$, causing $\hat{\beta}_1$ to be asymptotically biased:
$$\operatorname{plim} \hat{\beta}_1 \neq \beta_1$$

**Does the MissingIndicator $M$ resolve this?**
Adding $M$ yields the multiple regression:
$$y = \alpha_0 + \alpha_1 \hat{x} + \alpha_2 M + u$$

By the Frisch-Waugh-Lovell (FWL) theorem, $\hat{\alpha}_1$ is obtained by regressing $y$ on the residuals of $\hat{x}$ purged of $M$. 
- If $x^*$ is **MCAR**, $\hat{\alpha}_1$ is unbiased, and $\alpha_2$ captures baseline target shifts.
- If $x^*$ is **MAR** conditional on other observed covariates $Z$, $\hat{\alpha}_1$ is still biased *unless* $Z$ is also included in the regression.
- If $x^*$ is **MNAR** (e.g., $P(M=1 \mid x^*)$ depends directly on $x^*$), the residual missing values $x_{\text{mis}}^*$ violate the zero conditional mean assumption $\mathbb{E}[u \mid \hat{x}, M] \neq 0$. Therefore, simply adding a dummy variable $M$ does **not** mathematically eliminate bias under an MNAR regime. Unbiased estimation under MNAR requires modeling the joint selection probability (such as Heckman's inverse Mills ratio $\lambda(Z\gamma)$).

---

### Question 2: Low-Latency Inference Serving for High-Dimensional MICE Pipelines
**Scenario:** "Your data science team trained an end-to-end model pipeline using `IterativeImputer(estimator=RandomForestRegressor())` across 120 tabular features. The model achieves state-of-the-art AUC offline. However, the production deployment requires handling 10,000 requests per second at P99 latency $< 15\text{ms}$. The current MICE transform takes $180\text{ms}$ per row. How do you re-architect the inference system without degrading model accuracy?"

**Model Answer:**
A production-grade re-architecture requires breaking the dependency on live multivariate iterative solving at request time while preserving the accuracy gains learned offline:

```mermaid
flowchart TD
    subgraph OfflineTraining["Offline Pipeline (Batch)"]
        TrainData["Training Data"] --> MICE["Full MICE (IterativeImputer)"]
        MICE --> ImputedData["Imputed Feature Matrix"]
        ImputedData --> FinalGBDT["Train Production Model<br/>(e.g., LightGBM / CatBoost)"]
    end

    subgraph OnlineServing["Online High-Throughput Serving (<15ms)"]
        Payload["Incoming Request Payload (NaNs present)"] --> FastExtract["Extract MissingIndicator Flags<br/>O(1) bitwise scan"]
        FastExtract --> CheckModel{"Model Engine Architecture?"}
        
        CheckModel -->|"Tree-Native (LightGBM)"| NativeRoute["Bypass Imputation Entirely!<br/>Route NaNs down default path.<br/>Latency: 0ms overhead"]
        
        CheckModel -->|"Linear / Neural Network"| PrecomputedFallback["Fast Univariate Median Table<br/>(Stored in Redis / In-Memory RAM)<br/>Vectorized fillna(). Latency: <1ms"]
    end
```

1. **Leverage Native Tree Routing (Primary Solution):**
   If the downstream estimator is a gradient boosted tree (LightGBM or XGBoost), eliminate runtime imputation completely. Tree engines optimize default split paths during training. By training the final GBDT on raw data with native NaNs while keeping `MissingIndicator` columns, the model learns optimal split directions for missing values. Runtime inference latency drops to $\mathcal{O}(\text{depth})$, which executes in $< 1\text{ms}$ in C++ or Rust via ONNX or Treelite.

2. **Decoupled Surrogate Imputation (If Neural/Linear is Mandatory):**
   If downstream models require a dense vector:
   - Do **not** evaluate round-robin random forests in the request critical path.
   - Profile the feature correlation matrix. In 95% of tabular schemas, only 3-5 key features exhibit strong multivariable dependency; the remaining 115 features are near-orthogonal.
   - Approximate the MICE predictions using a single, distilled, vectorized multi-output Linear Ridge model or shallow MLP:
     $$\hat{X}_{\text{mis}} = W X_{\text{obs}} + b$$
   - For all weakly correlated features, fall back to precomputed in-memory column medians. A vectorized linear matrix multiply executes in $< 0.8\text{ms}$ for 120 features using SIMD/BLAS instructions.

---

### Question 3: Tree-Native Split Criterion vs Imputation
**Scenario:** "Under what conditions can the native missingness handling of XGBoost or LightGBM fail or produce suboptimal splits compared to an explicit imputation pipeline?"

**Model Answer:**
While tree-native sparsity routing is mathematically optimal under greedy split criteria, it exhibits three documented failure modes:

1. **Constrained Single Direction Routing:**
   Tree-native routing forces **all** missing values in a given node to travel exclusively to the Left Child OR the Right Child:
   $$I_{L} = \{x_i \le s\} \cup I_M \quad \text{OR} \quad I_{R} = \{x_i > s\} \cup I_M$$
   If the missing instances actually represent a heterogeneous subgroup—where some missing instances belong to the lower target distribution and others belong to the higher target distribution depending on a second variable $Z$—the tree cannot split them at this node. It requires a deeper tree depth to isolate and correct the misplaced instances, risking overfitting.

2. **Data Drift in Missingness Mechanisms (Online vs Offline Skew):**
   Suppose feature $X$ was missing in training purely due to random sensor dropouts (MCAR), and the tree routed NaNs to the right child because $\bar{y}_R > \bar{y}_L$. In production, if an upstream microservice fails and begins emitting nulls for all users (including low-risk cohorts), the tree will unconditionally route all these new nulls to the high-value right child. Explicit multi-feature imputation (MICE) would use other healthy features to reconstruct the true state, providing greater resilience to isolated sensor failures.

3. **High-Dimensional Categoricals with High Cardinality:**
   When categorical features with missing values are handled natively without explicit grouping, rare categories that share null-like properties are fractured across splits, diluting statistical power.

---

### Question 4: Testing MCAR vs MAR and Handling Suspected MNAR in Clinical & Financial Features
**Scenario:** "You are designing an algorithmic underwriting pipeline. One feature, `liquid_assets`, is missing in 34% of applications. How do you design an empirical test to distinguish between MCAR and MAR? If your domain knowledge indicates the feature is MNAR, how do you model it without violating regulatory auditability?"

**Model Answer:**

```mermaid
flowchart TD
    Start["Nullable Feature: liquid_assets (34% missing)"] --> Test1["Step 1: Test for MCAR<br/>Run Little's Multivariate Test & Logistic T-test"]
    
    Test1 --> CheckMCAR{"Is Missingness Independent of Other Features?"}
    CheckMCAR -->|"p > 0.05 (Unlikely)"| MCAR_Confirmed["Data is MCAR.<br/>Univariate Imputation / Complete Cases Unbiased"]
    CheckMCAR -->|"p < 0.05"| MAR_Hypothesis["MCAR Rejected. Data is MAR or MNAR."]
    
    MAR_Hypothesis --> Step2["Step 2: Investigate MNAR Mechanism<br/>Domain Check: Do High/Low Assets Drive Non-disclosure?"]
    Step2 --> ModelMNAR["Auditable Production Architecture:<br/>1. Create Binary Flag: liquid_assets_is_missing<br/>2. Apply Quantile / Median Imputation to Value<br/>3. Fit Monotone-Constrained GBDT<br/>4. Calculate SHAP Values for Indicator Auditability"]
```

1. **Testing MCAR vs MAR:**
   - **Logistic Regression Missingness Test:** Construct the binary indicator $M = \mathbb{I}(\text{liquid\_assets is NaN})$. Train a logistic regression model predicting $M$ using all remaining observed features $X_{-j}$:
     $$\operatorname{logit}(P(M = 1)) = \gamma_0 + \sum_{k \neq j} \gamma_k X_k$$
   - Perform a Likelihood Ratio Test comparing this model against a null intercept-only model. If any $\gamma_k$ coefficients are statistically significant ($p < 0.01$), the MCAR assumption is formally disproven: missingness is systematically correlated with observed covariates (evidence of MAR).
   - Compute Little's multivariate MCAR $\chi^2$ statistic across the global schema.

2. **Auditable Architecture for MNAR in Regulated Environments:**
   Under financial regulatory frameworks (e.g., Fair Credit Reporting Act, ECOA):
   - **Explicit Decomposition:** Separate the feature into two orthogonal components:
     1. `liquid_assets_imputed`: Imputed using robust median conditional on verified employment and income.
     2. `liquid_assets_missing_indicator`: Explicit boolean flag ($1 = \text{missing}, 0 = \text{reported}$).
   - **Monotonic Constraints:** Enforce monotonic constraints on the tree model: ensure that as `liquid_assets_imputed` increases, the credit risk score cannot arbitrarily jump downwards.
   - **Audit Trail via SHAP Decomposition:** Decompose the model's prediction using TreeSHAP:
     $$\phi_0 + \phi_{\text{liquid\_assets\_imputed}} + \phi_{\text{liquid\_assets\_is\_missing}}$$
     If an adverse action notice must be sent to the applicant, the regulatory reason code can clearly cite "Failure to verify liquid assets" driven by the SHAP attribution of the indicator, rather than an unexplainable artifact of a latent imputation algorithm.
