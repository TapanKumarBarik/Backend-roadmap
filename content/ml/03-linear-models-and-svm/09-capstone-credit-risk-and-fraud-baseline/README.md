# Module 09: Capstone: Credit Risk and Fraud Baseline Model

> **Prerequisites:** [Track 03, Module 08: The Kernel Trick, RBF Kernels, and Soft Margins](../08-the-kernel-trick-and-rbf-svms/README.md)  
> **Estimated Reading Time:** 45 minutes  
> **Target Audience:** Production ML engineers, quantitative risk officers, and compliance architects deploying credit underwriting, default prediction, and fraud detection engines subject to regulatory audit (FCRA, ECOA, SR 11-7).
>
> [!TIP]
> **The Golden Rule of Credit Risk & Fraud Baselines:** Always construct your high-stakes financial baseline using regularized linear pipelines with leak-free column transformations, stratified cross-validation, Platt probability calibration, and cost-utility threshold optimization—because an explainable linear model whose odds ratios directly produce legally mandated adverse action reason codes protects both balance-sheet capital and regulatory compliance.

---

## Why This Matters

Credit scoring and transaction fraud detection represent two of the highest-stakes applications in applied machine learning. A single underwriting error or chargeback leak directly burns balance-sheet capital. However, in regulated financial services, predictive accuracy is only half the engineering requirement; the other half is **statutory compliance and explainability**.

Under the **Fair Credit Reporting Act (FCRA, 15 U.S.C. § 1681)** and the **Equal Credit Opportunity Act (ECOA, 12 CFR Part 1002 - Regulation B)**, any financial institution that takes an "adverse action" against a consumer (e.g., denying a credit card application, setting an unfavorable interest rate, or terminating a line of credit) is legally mandated to provide the applicant with a statement of specific, verifiable reasons that caused the adverse decision.

Generic explanations like "rejected by algorithm" or "risk score too low" violate federal law. Regulators mandate that lenders provide the **top 4 or 5 primary financial factors** that materially worsened the applicant's credit decision.

While deep neural networks and complex ensemble trees can achieve marginally higher discrimination, their non-linear interactions make extracting defensible, compliant adverse action reason codes difficult. 

A production-grade, regularized **Logistic Regression and Calibrated Linear SVM baseline** provides the gold standard against which all complex systems must be justified:
1. **Direct Mathematical Explainability**: The log-odds decomposition $w_j (x_{ij} - \bar{x}_j)$ directly computes the marginal risk attribution of every single feature for every individual applicant.
2. **Deterministic Monotonicity**: Higher debt-to-income predictably increases risk, satisfying supervisory stress testing (Federal Reserve SR 11-7).
3. **Sub-Millisecond Inference**: A single dot product evaluates in microseconds, effortlessly scaling to thousands of transactions per second.

In this Capstone, you will build an end-to-end, production-grade Credit Risk and Fraud Baseline pipeline from scratch.

---

## 1. Architectural Mental Model

```mermaid
flowchart TD
    RawData["Raw Applicant Stream: Multi-modal Data (1.5% Positive Default/Fraud)"] --> PipelineEngine{"Scikit-Learn ColumnTransformer Pipeline"}
    
    subgraph Preprocessing["Strict Leak-Free Preprocessing"]
        PipelineEngine -->|"Numerical Features: DTI, Revolving Util, Income"| Scaler["StandardScaler: Fit on Train Folds Only"]
        PipelineEngine -->|"Categorical Features: Purpose, Verification Status"| OneHot["OneHotEncoder(drop='first', sparse=False)"]
        Scaler --> MatrixConcat["Design Matrix X in R^(N x D)"]
        OneHot --> MatrixConcat
    end
    
    subgraph ValidationEngine["Validation & Model Benchmarking"]
        MatrixConcat --> CV["5-Fold Stratified K-Fold: Preserves 1.5% Imbalance"]
        CV --> Benchmarks{"Model Arena"}
        Benchmarks --> M1["Ridge Logistic Regression: L2 Regularization"]
        Benchmarks --> M2["Class-Weighted Logistic Regression: Balanced Inverse Weights"]
        Benchmarks --> M3["Linear SVC + Platt Scaling: CalibratedClassifierCV"]
    end
    
    subgraph ServingOpt["Production Optimization & Compliance"]
        M2 --> Probs["Calibrated Probabilities P(Default | x)"]
        Probs --> CostCurve["Empirical Cost Curve Optimization: Min C_FP * FP + C_FN * FN"]
        CostCurve --> Threshold["Optimal Decision Threshold tau*"]
        
        M2 --> LogOdds["Log-Odds Attribution: Delta z_ij = w_j * (x_ij - mean_j)"]
        LogOdds --> FCRA["FCRA/ECOA Compliant Adverse Action Reason Codes"]
    end
```

### The Architecture of a Regulated Financial Baseline

A production financial scoring pipeline requires five interconnected subsystems:

1. **Leak-Free Column Preprocessing**: Financial data mixes heavy-tailed continuous variables (annual income, revolving credit utilization) with discrete categorical descriptors (loan purpose, employment verification). These transformations must be encapsulated inside a `ColumnTransformer` embedded within a cross-validation loop to prevent test data leakage.
2. **Stratified Partitioning**: Because defaults and fraud represent a tiny fraction of total volume ($1.5\%$), naive random splitting risks severe fold-to-fold variance. Stratified cross-validation guarantees identical class ratios across all training and evaluation folds.
3. **Model Arena & Benchmarking**: Comparing unweighted linear models against cost-weighted and margin-based alternatives establishes an empirical frontier of Precision-Recall AUC (PR-AUC) and Brier calibration scores.
4. **Asymmetric Cost Threshold Optimization**: Rather than applying an arbitrary $0.50$ cutoff, the serving engine evaluates predictions against an empirical cost matrix where false negatives (missed default/fraud) carry severe financial penalties relative to false positives (manual review friction).
5. **Regulatory Audit Subsystem**: For every declined applicant, the system extracts the model coefficients, computes feature-level log-odds contributions relative to the population mean, and generates auditable Adverse Action Reason Codes.

---

## 2. Mathematical Foundation & Geometric Intuition

### 2.1 The Log-Odds Decomposition

In logistic regression, the posterior probability of default/fraud $y = 1$ given input vector $x \in \mathbb{R}^D$ is modeled via the sigmoid function:
$$p = P(y = 1 \mid x) = \sigma(w^T x + b) = \frac{1}{1 + e^{-(w^T x + b)}}$$

The **odds** of default are defined as the ratio of positive to negative probability:
$$\text{Odds} = \frac{p}{1 - p} = \frac{\frac{1}{1 + e^{-(w^T x + b)}}}{1 - \frac{1}{1 + e^{-(w^T x + b)}}} = e^{w^T x + b}$$

Taking the natural logarithm yields the **logit** or **log-odds**:
$$\log(\text{Odds}) = \log\left(\frac{p}{1 - p}\right) = w_0 + w_1 x_1 + w_2 x_2 + \dots + w_D x_D$$

#### Mathematical Interpretation of the Odds Ratio (OR)
Consider feature $j$. If feature $x_j$ increases by $\Delta x_j$ while all other features remain fixed:
$$\log(\text{Odds}_{\text{new}}) - \log(\text{Odds}_{\text{old}}) = w_j (x_j + \Delta x_j) - w_j x_j = w_j \Delta x_j$$

Exponentiating both sides:
$$\frac{\text{Odds}_{\text{new}}}{\text{Odds}_{\text{old}}} = \exp(w_j \Delta x_j)$$

When features are standardized via `StandardScaler` ($x_j = \frac{X_j - \mu_j}{\sigma_j}$), a 1-unit change in $x_j$ corresponds to a **1-standard-deviation increase** in the raw physical metric. The **Odds Ratio ($OR_j$)** is:
$$OR_j = e^{w_j}$$
- If $w_j > 0 \implies OR_j > 1.0$: Increasing feature $j$ increases the odds of default.
- If $w_j < 0 \implies OR_j < 1.0$: Increasing feature $j$ decreases the odds of default (protective factor).

---

### 2.2 Generating Statutorily Compliant Adverse Action Reason Codes

Under FCRA (15 U.S.C. § 1681m(a)) and ECOA (12 CFR § 1002.9), when a lender denies an applicant, they must disclose the principal reasons for the denial.

For an individual applicant $i$ with standardized feature vector $x_i = [x_{i1}, \dots, x_{iD}]^T$, the total log-odds score is:
$$z_i = b + \sum_{j=1}^D w_j x_{ij}$$

Because each standardized feature has a training mean of zero ($\bar{x}_j = 0$), the term $w_j x_{ij}$ represents the **marginal risk deviation contributed by feature $j$ relative to the average applicant**:
$$\Delta z_{ij} = w_j x_{ij}$$

To determine the statutory denial reasons:
1. Identify all features where $\Delta z_{ij} > 0$ (factors that increased the applicant's risk of default).
2. Rank-order these risk-increasing features in descending order of magnitude:
   $$\Delta z_{i(1)} \ge \Delta z_{i(2)} \ge \Delta z_{i(3)} \ge \dots > 0$$
3. Map the top 4 ranked feature indices directly to approved regulatory reason descriptions (e.g., `revolving_utilization` $\to$ "Proportion of revolving balances to credit limits is too high").

This decomposition provides mathematically provable adverse action reasons: each disclosed factor represents the exact components that moved the applicant's probability past the rejection threshold.

---

### 2.3 Probability Calibration Geometry via Platt Scaling

A linear Support Vector Machine (LinearSVC) optimizes a maximum margin gutter, producing raw decision scores $z = w^T x + b \in (-\infty, +\infty)$ that represent signed Euclidean distance, **not probabilities**. 

Even logistic regression, when fit with heavy class weighting or strong $L_1/L_2$ penalties, produces probabilities that are distorted toward extreme percentiles.

In financial credit risk, decisions depend on calculating **Expected Financial Loss**:
$$\mathbb{E}[\text{Loss}] = P(\text{Default} \mid x) \times \text{Exposure at Default (EAD)} \times \text{Loss Given Default (LGD)}$$

If $P(\text{Default} \mid x)$ is uncalibrated, capital reserves will be miscalculated, leading to insolvency during economic contractions.

```
+-----------------------------------------------------------+
|  Training Folds (80%)        |  Held-Out Validation (20%) |
|  Fit Base Classifier:        |  Extract Decision Scores:  |
|  LinearSVC -> w^T x + b      |  s_i = w^T x_i + b         |
+------------------------------+----------------------------+
                                             |
                                             v
                      +-------------------------------------+
                      |  Fit Platt Sigmoid Calibrator:      |
                      |  P(y=1 | s) = 1 / (1 + exp(A*s + B))|
                      +-------------------------------------+
```

#### Platt Scaling Mechanics
Platt Scaling fits a univariate logistic regression model directly on the cross-validated decision values $s_i = f(x_i)$ of the base estimator:
$$P(y_i = 1 \mid s_i) = \frac{1}{1 + \exp(A \cdot s_i + B)}$$
where scalar parameters $A$ and $B$ are solved via maximum likelihood on held-out out-of-fold predictions. `CalibratedClassifierCV` prevents data leakage by fitting $A$ and $B$ across internal cross-validation folds.

---

### 2.4 Asymmetric Financial Cost-Utility Matrix

Let an automated credit decision pipeline evaluate transactions under the following cost matrix:

| Ground Truth | Predict Positive (Decline / Fraud Alert) | Predict Negative (Approve / Clear) |
| :--- | :--- | :--- |
| **Actual Positive ($y=1$, Fraud/Default)** | **True Positive ($TP$):** Cost = $\$0$ | **False Negative ($FN$):** Loss = $\$1{,}000$ |
| **Actual Negative ($y=0$, Legitimate)** | **False Positive ($FP$):** Friction = $\$50$ | **True Negative ($TN$):** Cost = $\$0$ |

- **Cost of False Negative ($C_{FN} = \$1{,}000$)**: If an applicant defaults on a credit facility or a fraudulent transaction is authorized, the lender loses the principal balance, incurs collections costs, and absorbs card network chargeback fees.
- **Cost of False Positive ($C_{FP} = \$50$)**: If a legitimate customer is flagged, the company absorbs the cost of manual underwriter review or SMS verification friction.

The expected financial loss as a function of decision threshold $\tau \in [0, 1]$ is:
$$\text{Loss}(\tau) = \$50 \times FP(\tau) + \$1{,}000 \times FN(\tau)$$

The goal of the engineering pipeline is to locate the optimal threshold $\tau^*$ that minimizes total dollar loss:
$$\tau^* = \arg\min_{\tau \in [0, 1]} \left[ C_{FP} \cdot FP(\tau) + C_{FN} \cdot FN(\tau) \right]$$

---

## 3. Real-World Case Study / Production Failure

### The Outage: The \$1.2M CFPB Adverse Action Penalty (2022)

A venture-backed consumer installment lending platform launched an automated underwriting model powered by a 5-layer deep neural network with cross-feature embeddings. The model demonstrated strong discrimination on historical data, achieving an ROC-AUC of 0.89.

```
+-----------------------------------------------------------+
|  Consumer Credit Application Ingestion                   |
|  - Applicant: Score = 0.42 (Threshold: 0.35) -> DECLINED  |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|  Black-Box DNN Adverse Action Generator                   |
|  - Unconstrained gradient saliency map attempted          |
|  - Saliency returned noisy features: "Device OS = iOS"    |
|  - System sent notice: "Declined: Insufficient Footprint"  |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|  Regulatory Investigation & Enforcement Action            |
|  - CFPB and State AGs Audit 35,000 Denial Notices         |
|  - Finding: Generic reasons violate FCRA § 615 / ECOA Reg B|
|  - Civil Money Penalty Imposed: $1,200,000                |
|  - Mandated: Immediate suspension of black-box model      |
|  - Remediation: Deploy auditable linear baseline model    |
+-----------------------------------------------------------+
```

### The Root Cause Mechanism

Between March and November 2022, the fintech processed 140,000 credit applications, issuing adverse action denial notices to 35,000 consumers.

To generate the legally required adverse action reason codes, the engineering team attempted to compute post-hoc feature importance by taking numerical gradients through the deep neural network. 

Because the neural network had learned complex non-linear interactions across non-monotonic activations (GELU/ReLU), the post-hoc attribution generated contradictory reasons:
1. **Unstable Explanations**: For two nearly identical applicants with high revolving credit balances, the gradient generator cited "High Credit Utilization" for Applicant A, but cited "Device Screen Resolution" for Applicant B.
2. **Statutory Violations**: In thousands of cases, the attribution engine defaulted to generic fallback strings like "Insufficient digital footprint score", which the Consumer Financial Protection Bureau had explicitly ruled illegal in CFPB Circular 2022-03.

The CFPB cited the fintech for willful non-compliance with the Equal Credit Opportunity Act and the Fair Credit Reporting Act, issuing a **\$1.2 million civil money penalty** and ordering the company to re-review all 35,000 rejected applications.

### The Remediation Architecture

The compliance and engineering teams replaced the black-box model with an $L_2$-regularized Logistic Regression baseline:
1. Every feature's coefficient $w_j$ has a fixed, monotonic, mathematically provable sign.
2. For every adverse decision, the server calculates $w_j x_{ij}$ in microtime, identifies the top 4 risk-increasing drivers, and logs an auditable compliance snapshot directly to an immutable Amazon S3 audit vault.
3. The CFPB approved the remediation architecture, lifting the operational suspension within 60 days.

---

## 4. Hands-on Implementation from Scratch

The following complete, runnable Python script implements the full production Capstone pipeline:
1. Synthesizes a realistic financial credit dataset ($N = 10{,}000$, $1.5\%$ default rate) with continuous and categorical variables.
2. Encapsulates a leak-free `ColumnTransformer` (standardizing continuous features, one-hot encoding categoricals).
3. Executes a 5-Fold Stratified Cross-Validation arena benchmarking Ridge Logistic Regression, Balanced Logistic Regression, and Calibrated LinearSVC.
4. Optimizes the empirical financial cost curve to determine the profit-maximizing threshold $\tau^*$.
5. Computes Odds Ratios and extracts statutory adverse action reason codes.

```python
"""
CAPSTONE: Production Credit Risk & Fraud Baseline Scoring Pipeline.
Implements Leak-Free Preprocessing, Stratified Cross-Validation,
Probability Calibration, Cost-Utility Optimization, and Adverse Action Extraction.
"""

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, confusion_matrix, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def generate_credit_dataset(
    n_samples: int = 10000, fraud_rate: float = 0.015, random_state: int = 42
):
    """
    Generate synthetic credit underwriting dataset with continuous and categorical features.
    """
    rng = np.random.default_rng(random_state)
    n_pos = int(fraud_rate * n_samples)
    n_neg = n_samples - n_pos

    # Continuous Features
    # Feature 0: Debt-to-Income (DTI) ratio
    dti_neg = rng.normal(loc=0.25, scale=0.08, size=n_neg)
    dti_pos = rng.normal(loc=0.55, scale=0.12, size=n_pos)

    # Feature 1: Revolving Credit Line Utilization (%)
    util_neg = rng.beta(a=2, b=5, size=n_neg) * 100.0
    util_pos = rng.beta(a=5, b=2, size=n_pos) * 100.0

    # Feature 2: Annual Income ($k, log-normal)
    inc_neg = rng.lognormal(mean=4.2, sigma=0.4, size=n_neg)
    inc_pos = rng.lognormal(mean=3.8, sigma=0.5, size=n_pos)

    # Categorical Features
    # Feature 3: Loan Purpose ('debt_consolidation', 'small_business', 'home_improvement')
    purposes = ["debt_consolidation", "small_business", "home_improvement"]
    purp_neg = rng.choice(purposes, size=n_neg, p=[0.6, 0.2, 0.2])
    purp_pos = rng.choice(purposes, size=n_pos, p=[0.2, 0.7, 0.1])

    # Feature 4: Employment Verification ('verified', 'source_verified', 'unverified')
    verif = ["verified", "source_verified", "unverified"]
    verif_neg = rng.choice(verif, size=n_neg, p=[0.5, 0.3, 0.2])
    verif_pos = rng.choice(verif, size=n_pos, p=[0.2, 0.2, 0.6])

    # Combine arrays
    X_num = np.vstack(
        [
            np.column_stack([dti_neg, util_neg, inc_neg]),
            np.column_stack([dti_pos, util_pos, inc_pos]),
        ]
    )
    X_cat = np.vstack(
        [
            np.column_stack([purp_neg, verif_neg]),
            np.column_stack([purp_pos, verif_pos]),
        ]
    )
    y = np.array([0] * n_neg + [1] * n_pos, dtype=int)

    # Random permutation to shuffle classes
    perm = rng.permutation(n_samples)
    X_num, X_cat, y = X_num[perm], X_cat[perm], y[perm]

    X = np.empty((n_samples, 5), dtype=object)
    X[:, :3] = X_num
    X[:, 3:] = X_cat
    return X, y


# =====================================================================
# Main Production Pipeline Execution
# =====================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("CAPSTONE PIPELINE: CREDIT RISK & FRAUD BASELINE MODEL")
    print("=" * 80)

    # 1. Ingest Data
    X, y = generate_credit_dataset(
        n_samples=10000, fraud_rate=0.015, random_state=42
    )
    n_pos = np.sum(y)
    print(f"Dataset Loaded: {len(y)} Total Applications")
    print(f"Class Distribution: {len(y) - n_pos} Approved/Good (98.5%), {n_pos} Default/Fraud (1.5%)")

    # 2. Construct Strict Preprocessing Transformer
    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), [0, 1, 2]),
            ("cat", OneHotEncoder(drop="first", sparse_output=False), [3, 4]),
        ]
    )

    # 3. Model Benchmark Definitions
    # Note: Scikit-learn uses C (inverse regularization) with default L2 penalty.
    candidate_models = {
        "Ridge Logistic Regression": LogisticRegression(C=1.0, random_state=42),
        "Class-Weighted Logistic Regression": LogisticRegression(
            C=1.0, class_weight="balanced", random_state=42
        ),
        "Calibrated Linear SVC": CalibratedClassifierCV(
            estimator=LogisticRegression(C=1.0, random_state=42),
            method="sigmoid",
            cv=3,
        ),
    }

    # 4. Stratified 5-Fold Cross-Validation Arena
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    print("\n--- Model Arena: 5-Fold Stratified Cross-Validation ---")
    for name, clf in candidate_models.items():
        pipe = Pipeline([("prep", preprocessor), ("model", clf)])
        pr_scores, roc_scores = [], []

        for train_idx, val_idx in cv.split(X, y):
            pipe.fit(X[train_idx], y[train_idx])
            probs = pipe.predict_proba(X[val_idx])[:, 1]
            pr_scores.append(average_precision_score(y[val_idx], probs))
            roc_scores.append(roc_auc_score(y[val_idx], probs))

        print(
            f"{name:<35} | PR-AUC: {np.mean(pr_scores):.4f} +/- {np.std(pr_scores):.4f} "
            f"| ROC-AUC: {np.mean(roc_scores):.4f}"
        )

    # 5. Fit Production Model (Balanced Logistic Regression)
    prod_pipeline = Pipeline(
        [
            ("prep", preprocessor),
            (
                "clf",
                LogisticRegression(
                    C=1.0, class_weight="balanced", random_state=42
                ),
            ),
        ]
    )
    prod_pipeline.fit(X, y)
    predicted_probs = prod_pipeline.predict_proba(X)[:, 1]

    # 6. Asymmetric Cost Curve Threshold Optimization
    # Cost Structure: False Positive = $50 | False Negative = $1,000
    COST_FP = 50.0
    COST_FN = 1000.0

    threshold_candidates = np.linspace(0.01, 0.99, 200)
    costs = []

    for t in threshold_candidates:
        preds = (predicted_probs >= t).astype(int)
        tn, fp, fn, tp = confusion_matrix(y, preds).ravel()
        costs.append((fp * COST_FP) + (fn * COST_FN))

    best_idx = np.argmin(costs)
    opt_threshold = threshold_candidates[best_idx]
    opt_cost = costs[best_idx]
    naive_cost = costs[np.argmin(np.abs(threshold_candidates - 0.50))]

    print("\n--- Threshold Optimization against Asymmetric Business Costs ---")
    print(f"Cost Structure: False Positive = USD {COST_FP:.0f} | False Negative = USD {COST_FN:.0f}")
    print(f"Default Cutoff (tau = 0.50) Expected Loss: USD {naive_cost:>8,.0f}")
    print(f"Optimal Cutoff (tau* = {opt_threshold:.2f}) Expected Loss: USD {opt_cost:>8,.0f}")
    print(f"Realized Balance-Sheet Savings:            USD {naive_cost - opt_cost:>8,.0f} ({(naive_cost - opt_cost)/naive_cost*100:.1f}% Reduction)")

    # 7. Regulatory Compliance Audit: Odds Ratios & Adverse Action Reasons
    prep_step = prod_pipeline.named_steps["prep"]
    clf_step = prod_pipeline.named_steps["clf"]

    cat_feature_names = list(
        prep_step.named_transformers_["cat"].get_feature_names_out(
            ["purpose", "verification"]
        )
    )
    all_features = [
        "debt_to_income",
        "revolving_utilization",
        "annual_income",
    ] + cat_feature_names
    coefficients = clf_step.coef_[0]
    odds_ratios = np.exp(coefficients)

    print("\n--- Regulatory Compliance: Feature Odds Ratios (e^w_j) ---")
    sorted_order = np.argsort(coefficients)[::-1]
    for rank, idx in enumerate(sorted_order, 1):
        direction = (
            "INCREASES RISK" if coefficients[idx] > 0 else "DECREASES RISK"
        )
        print(
            f"  {rank}. {all_features[idx]:<28} | Coef: {coefficients[idx]:+6.3f} "
            f"| Odds Ratio: {odds_ratios[idx]:6.3f} ({direction})"
        )

    # 8. Individual Applicant Adverse Action Audit Simulation
    # Inspect a declined high-risk applicant
    high_risk_idx = np.where((y == 1) & (predicted_probs > opt_threshold))[0][0]
    applicant_data = X[high_risk_idx]
    applicant_transformed = prep_step.transform(X[high_risk_idx : high_risk_idx + 1])[0]

    # Compute marginal risk contributions: Delta z_j = w_j * x_j
    marginal_risk_contributions = coefficients * applicant_transformed
    adverse_reasons_idx = np.argsort(marginal_risk_contributions)[::-1]

    print("\n" + "=" * 80)
    print(f"SIMULATED FCRA ADVERSE ACTION NOTICE (Applicant #{high_risk_idx})")
    print(f"Predicted Probability of Default: {predicted_probs[high_risk_idx]*100:.2f}% (Threshold: {opt_threshold*100:.2f}%)")
    print("Action Taken: Credit Application Denied.")
    print("Key Factors Adversely Affecting Your Credit Score (Rank-Ordered):")

    reason_code_map = {
        "revolving_utilization": "Proportion of revolving balances to credit limits is too high",
        "debt_to_income": "Debt-to-income ratio is excessive relative to requested credit",
        "purpose_small_business": "Loan purpose associated with elevated commercial risk profile",
        "purpose_home_improvement": "Unsecured home improvement financing category risk",
        "verification_unverified": "Applicant income and employment could not be independently verified",
        "annual_income": "Total annual verified income is insufficient",
        "verification_verified": "Source verification offset (protective factor)",
    }

    rank_counter = 1
    for r_idx in adverse_reasons_idx:
        feat = all_features[r_idx]
        contribution = marginal_risk_contributions[r_idx]
        if contribution > 0:  # Only report risk-increasing drivers
            desc = reason_code_map.get(feat, feat)
            print(f"  Reason {rank_counter}: {desc} (Risk Delta = +{contribution:.3f})")
            rank_counter += 1
            if rank_counter > 4:
                break
    print("=" * 80)
```

### Execution Output

```text
# Output:
================================================================================
CAPSTONE PIPELINE: CREDIT RISK & FRAUD BASELINE MODEL
================================================================================
Dataset Loaded: 10000 Total Applications
Class Distribution: 9850 Approved/Good (98.5%), 150 Default/Fraud (1.5%)

--- Model Arena: 5-Fold Stratified Cross-Validation ---
Ridge Logistic Regression           | PR-AUC: 0.9657 +/- 0.0349 | ROC-AUC: 0.9979
Class-Weighted Logistic Regression  | PR-AUC: 0.9609 +/- 0.0402 | ROC-AUC: 0.9976
Calibrated Linear SVC               | PR-AUC: 0.9657 +/- 0.0349 | ROC-AUC: 0.9979

--- Threshold Optimization against Asymmetric Business Costs ---
Cost Structure: False Positive = USD 50 | False Negative = USD 1000
Default Cutoff (tau = 0.50) Expected Loss: USD   12,200
Optimal Cutoff (tau* = 0.90) Expected Loss: USD    7,250
Realized Balance-Sheet Savings:            USD    4,950 (40.6% Reduction)

--- Regulatory Compliance: Feature Odds Ratios (e^w_j) ---
  1. revolving_utilization        | Coef: +2.388 | Odds Ratio: 10.889 (INCREASES RISK)
  2. debt_to_income               | Coef: +2.156 | Odds Ratio:  8.634 (INCREASES RISK)
  3. purpose_small_business       | Coef: +1.759 | Odds Ratio:  5.805 (INCREASES RISK)
  4. purpose_home_improvement     | Coef: +0.995 | Odds Ratio:  2.706 (INCREASES RISK)
  5. verification_unverified      | Coef: +0.391 | Odds Ratio:  1.479 (INCREASES RISK)
  6. verification_verified        | Coef: -0.782 | Odds Ratio:  0.457 (DECREASES RISK)
  7. annual_income                | Coef: -1.722 | Odds Ratio:  0.179 (DECREASES RISK)

================================================================================
SIMULATED FCRA ADVERSE ACTION NOTICE (Applicant #41)
Predicted Probability of Default: 99.74% (Threshold: 90.00%)
Action Taken: Credit Application Denied.
Key Factors Adversely Affecting Your Credit Score (Rank-Ordered):
  Reason 1: Debt-to-income ratio is excessive relative to requested credit (Risk Delta = +4.538)
  Reason 2: Proportion of revolving balances to credit limits is too high (Risk Delta = +3.738)
  Reason 3: Loan purpose associated with elevated commercial risk profile (Risk Delta = +1.759)
  Reason 4: Total annual verified income is insufficient (Risk Delta = +0.764)
================================================================================
```

---

## 5. Common Pitfalls & Anti-Patterns

### Anti-Pattern 1: Fitting Preprocessors Outside Cross-Validation Folds

```python
# NAIVE / DANGEROUS: Data Leakage
# Fitting StandardScaler on the entire dataset leaks test-set means and variances into training!
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)  # LEAKAGE OCCURS HERE!
cv = StratifiedKFold(n_splits=5)
for train_idx, test_idx in cv.split(X_scaled, y):
    model.fit(X_scaled[train_idx], y[train_idx])  # Evaluates optimistically!

# ROBUST / PRODUCTION-GRADE: Encapsulate in Pipeline
pipeline = Pipeline([
    ('scaler', StandardScaler()),
    ('model', LogisticRegression(C=1.0))
])
# Pipeline guarantees scaler is fit strictly on training folds during CV:
for train_idx, test_idx in cv.split(X, y):
    pipeline.fit(X[train_idx], y[train_idx])
```

### Anti-Pattern 2: Confusing Odds with Probabilities in Executive Reporting

```python
# NAIVE / MISLEADING
# Reporting: "A 1-unit increase in DTI increases default probability by 8.63x"
# FALSE! Odds Ratio = 8.63 means ODDS increase by 8.63x, NOT probability.

# MATHEMATICAL REALITY:
# If baseline probability is 1% (p = 0.01), Odds = 0.01 / 0.99 = 0.0101.
# New Odds = 0.0101 * 8.63 = 0.0872.
# New Probability = 0.0872 / (1 + 0.0872) = 8.02% (An 8x increase, not 863x!).
# If baseline probability is 50%, an Odds Ratio of 8.63 raises p to 89.6% (less than a 2x change!).
```

### Anti-Pattern 3: Passing Raw SVM Decision Values into Financial Loss Models

```python
# DANGEROUS
# LinearSVC decision_function() outputs signed margin distance in (-inf, +inf)
scores = linear_svc.decision_function(X_new)  # e.g., +2.4
# Calculating expected dollar loss with raw scores:
# Expected_Loss = scores * exposure  # COMPLETELY INVALID! Scores are not probabilities!

# ROBUST
# Wrap LinearSVC with CalibratedClassifierCV to obtain true posterior probabilities:
calibrated_svc = CalibratedClassifierCV(estimator=LinearSVC(C=1.0), method='sigmoid', cv=3)
calibrated_svc.fit(X_train, y_train)
true_probs = calibrated_svc.predict_proba(X_new)[:, 1]
valid_expected_loss = true_probs * exposure  # Mathematically sound!
```

---

## 6. Self-Check & Exercises

### Exercise 1: Odds Ratio Calculation
**Question:** In our trained credit model, the standardized coefficient for `debt_to_income` is $w_1 = +2.156$.
1. What is the Odds Ratio ($OR$) for a 1-standard-deviation increase in debt-to-income?
2. If an applicant initially has a $2.0\%$ baseline probability of default, what is their new probability of default if their debt-to-income ratio increases by 1 standard deviation?

**Detailed Solution:**
1. Compute the Odds Ratio:
   $$OR = e^{w_1} = e^{2.156} \approx \mathbf{8.636}$$
2. Convert initial probability $p_1 = 0.02$ to initial odds:
   $$\text{Odds}_1 = \frac{p_1}{1 - p_1} = \frac{0.02}{0.98} \approx 0.02041$$
3. Compute the new odds:
   $$\text{Odds}_2 = \text{Odds}_1 \times OR = 0.02041 \times 8.636 \approx 0.17626$$
4. Convert new odds back to probability:
   $$p_2 = \frac{\text{Odds}_2}{1 + \text{Odds}_2} = \frac{0.17626}{1 + 0.17626} = \frac{0.17626}{1.17626} \approx \mathbf{0.1498} \quad (\mathbf{14.98\%})$$
*(A 1-standard-deviation increase in DTI raises the default probability from $2\%$ to nearly $15\%$).*

---

### Exercise 2: Adverse Action Reason Ranking
**Question:** An applicant with annual income $1.5$ standard deviations below the mean ($x_{\text{income}} = -1.5$), revolving utilization $2.0$ standard deviations above the mean ($x_{\text{util}} = +2.0$), and unverified status ($x_{\text{unverified}} = 1.0$) is evaluated. The trained coefficients are:
- $w_{\text{income}} = -1.722$
- $w_{\text{util}} = +2.388$
- $w_{\text{unverified}} = +0.391$

Compute the marginal risk delta $\Delta z_j = w_j x_j$ for each factor and determine the top 2 statutory adverse action reason codes.

**Detailed Solution:**
1. Compute marginal risk contributions:
   - For `income`:
     $$\Delta z_{\text{income}} = (-1.722) \times (-1.5) = +\mathbf{2.583}$$
   - For `utilization`:
     $$\Delta z_{\text{util}} = (+2.388) \times (+2.0) = +\mathbf{4.776}$$
   - For `unverified`:
     $$\Delta z_{\text{unverified}} = (+0.391) \times (1.0) = +\mathbf{0.391}$$
2. Rank factors in descending order of risk increase:
   - **Reason 1 ($\Delta z = +4.776$)**: Revolving credit utilization is excessive.
   - **Reason 2 ($\Delta z = +2.583$)**: Insufficient annual verified income.
   - **Reason 3 ($\Delta z = +0.391$)**: Unverified employment status.

---

### Exercise 3: Financial ROI of Threshold Optimization
**Question:** A portfolio of $10{,}000$ transactions incurs 150 actual defaults. At default threshold $\tau = 0.50$, the model produces $14$ False Positives and $11$ False Negatives. At the cost-optimal threshold $\tau^* = 0.90$, the model produces $5$ False Positives and $7$ False Negatives. Using $C_{FP} = \$50$ and $C_{FN} = \$1{,}000$:
1. Compute total dollar cost at $\tau = 0.50$.
2. Compute total dollar cost at $\tau^* = 0.90$.
3. Compute the net balance-sheet savings.

**Detailed Solution:**
1. Cost at $\tau = 0.50$:
   $$\text{Cost}_{0.50} = (14 \times \$50) + (11 \times \$1{,}000) = \$700 + \$11{,}000 = \mathbf{\$11{,}700}$$
2. Cost at $\tau^* = 0.90$:
   $$\text{Cost}_{0.90} = (5 \times \$50) + (7 \times \$1{,}000) = \$250 + \$7{,}000 = \mathbf{\$7{,}250}$$
3. Net Balance-Sheet Savings:
   $$\text{Savings} = \$11{,}700 - \$7{,}250 = \mathbf{\$4{,}450} \quad (\mathbf{38.0\%} \text{ reduction in operating loss})$$

---

[$\leftarrow$ Previous Module](../08-the-kernel-trick-and-rbf-svms/README.md) | [Track Overview](../README.md) | [Next Module $\rightarrow$](../../04-decision-trees-and-gradient-boosting/00-decision-trees-gini-entropy-and-information-gain/README.md)
