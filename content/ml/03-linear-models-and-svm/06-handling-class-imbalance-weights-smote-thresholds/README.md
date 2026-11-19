# Module 06: Handling Class Imbalance: Weights, Resampling, and Threshold Tuning

> **Prerequisites:** [Track 03, Module 05: Multiclass Classification: Softmax and One-vs-Rest](../05-multiclass-softmax-and-one-vs-rest/README.md)  
> **Estimated Reading Time:** 45 minutes  
> **Target Audience:** Machine learning engineers, fintech risk modelers, cybersecurity detection engineers, and backend architects building production classifiers where positive events represent $< 1\%$ of real-world traffic.
>
> [!TIP]
> **The Golden Rule of Class Imbalance:** Never train or evaluate an imbalanced classifier against raw accuracy or uncalibrated log-loss at a default $\tau = 0.5$ threshold; align optimization via cost-sensitive loss weighting, evaluate minority discrimination using Precision-Recall AUC, and explicitly tune the decision threshold against the true asymmetric financial cost matrix.

---

## Why This Matters

In academic benchmark datasets like MNIST or Iris, classes are distributed in neat, balanced proportions. In production backend systems, **class imbalance is the default reality**:
- **Payment Fraud**: $0.05\%$ to $0.2\%$ of card transactions are fraudulent.
- **Cybersecurity & Intrusion Detection**: $0.001\%$ of network packets represent malicious exfiltration.
- **Ad Click Prediction (CTR)**: $0.1\%$ to $1.0\%$ of ad impressions result in a user click.
- **Critical Hardware Failure**: $0.01\%$ of server hard drives fail on any given operational day.

When 99.9% of transactions are legitimate, a machine learning model that predicts "legitimate" on 100% of inputs achieves **99.9% accuracy** while generating **0% recall** on actual fraud. This is known as the **Accuracy Paradox**.

Unaddressed class imbalance causes standard loss functions to be completely dominated by majority-class gradients. The model treats minority-class errors as negligible noise, selecting decision boundaries that collapse into the minority distribution. In mission-critical systems, an undetected false negative can cost hundreds of thousands of dollars in chargebacks, regulatory sanctions, or critical system breaches.

In this module, you will master the three architectural tiers of imbalance handling: **data-level resampling** (RUS, ROS, SMOTE), **algorithm-level cost-sensitive weighting** (`class_weight='balanced'`), and **post-processing decision threshold tuning** against empirical cost-utility matrices.

---

## 1. Architectural Mental Model

Addressing class imbalance requires intervention across three distinct stages of the machine learning pipeline:

```mermaid
flowchart TD
    Raw["Raw Imbalanced Stream (99.9% Legitimate, 0.1% Fraud)"] --> Stage1{"Tier 1: Data Resampling"}
    
    Stage1 -->|"Random Under-Sampling (RUS)"| RUS["Discard Majority Data: Fast, but Information Loss"]
    Stage1 -->|"Random Over-Sampling (ROS)"| ROS["Duplicate Minority Data: Causes Overfitting"]
    Stage1 -->|"SMOTE (Synthetic Over-Sampling)"| SMOTE["Interpolate Synthetic Neighbors: Risk of Noise Hallucination"]
    Stage1 -->|"Pass Through (Raw Distribution)"| RawPass["Retain Authentic Natural Posteriors"]
    
    RUS --> Stage2{"Tier 2: Algorithmic Weighting"}
    ROS --> Stage2
    SMOTE --> Stage2
    RawPass --> Stage2
    
    Stage2 -->|"Unweighted Loss"| Unweighted["Standard Log-Loss: Majority Gradients Dominate"]
    Stage2 -->|"Cost-Sensitive Weighting"| Weighted["class_weight='balanced': Gradients Scaled by Inverse Frequency"]
    
    Weighted --> Stage3{"Tier 3: Post-Processing Decision Rule"}
    Unweighted --> Stage3
    
    Stage3 -->|"Default Threshold (tau = 0.5)"| NaiveThresh["High Precision, Low Recall: Fails Asymmetric Cost Reality"]
    Stage3 -->|"Cost-Utility Optimization"| CostThresh["Optimal tau* Minimizing: C_FP * FP + C_FN * FN"]
```

### The Three Intervention Tiers

#### Tier 1: Data-Level Resampling
Data-level methods modify the training distribution before model fitting to artificially balance class representations:
- **Random Under-Sampling (RUS)**: Randomly removes majority class samples until the ratio matches the minority class. 
  - *Advantage*: Radically reduces dataset size, slashing training runtime and memory.
  - *Fatal Flaw*: Discards 90%–99% of valuable training data, discarding subtle majority cluster boundaries and variance.
- **Random Over-Sampling (ROS)**: Randomly duplicates existing minority class samples with replacement.
  - *Advantage*: Retains all majority data without discarding information.
  - *Fatal Flaw*: Duplicating identical feature vectors causes linear models and decision trees to form narrow, overfitted decision boundaries around repeated points, inflating model variance.
- **Synthetic Minority Over-sampling Technique (SMOTE)**: Creates synthetic minority samples by finding $k$-nearest neighbors in the minority class and interpolating points along the line segment between them.
  - *Advantage*: Expands the minority decision region continuously rather than duplicating discrete points.
  - *Fatal Flaw*: If minority points are noisy outliers inside majority territory, SMOTE connects them, creating synthetic noise bridges ("hallucinations") that degrade precision.

#### Tier 2: Algorithm-Level Cost-Sensitive Learning
Rather than altering the data distribution, cost-sensitive learning leaves the training data intact and modifies the objective loss function. Each training sample $i$ is assigned a scalar weight $\alpha_i$ inversely proportional to its class frequency:
$$\mathcal{L}_{\text{weighted}} = -\frac{1}{N} \sum_{i=1}^N \alpha_i \left[ y_i \log(\hat{p}_i) + (1 - y_i) \log(1 - \hat{p}_i) \right]$$
When an error occurs on a rare fraud transaction, its gradient update is scaled up by a factor of 100 or 1,000, forcing parameter updates to respect minority errors equally with majority errors.

#### Tier 3: Post-Processing Decision Threshold Tuning
Standard classifiers assign a positive label whenever predicted probability $\hat{p} \ge 0.5$. The 0.5 threshold is only optimal when:
1. The classes are balanced.
2. The real-world cost of a False Positive (FP) equals the cost of a False Negative (FN).

In production fraud detection, a False Positive costs $\approx \$25$ (manual analyst review or SMS verification), while a False Negative costs $\approx \$500$ (unrecoverable chargeback loss, interchange fees, and network fines). Operating at $\tau = 0.5$ is commercially irrational. Threshold tuning leaves the calibrated probabilities unchanged and selects the decision threshold $\tau^*$ that minimizes expected financial loss on held-out validation data.

---

## 2. Mathematical Foundation & Geometric Intuition

### 2.1 The Mathematics of Cost-Sensitive Loss Weighting

Consider binary classification with labels $y_i \in \{0, 1\}$. Let $N$ be total training samples, $N_1 = \sum_i y_i$ be the number of minority samples, and $N_0 = N - N_1$ be majority samples. Let $N_1 \ll N_0$.

Under standard Log-Loss, the objective is:
$$\mathcal{L}(w, b) = -\frac{1}{N} \left[ \sum_{i \in \mathcal{C}_1} \log(\sigma(w^T x_i + b)) + \sum_{i \in \mathcal{C}_0} \log(1 - \sigma(w^T x_i + b)) \right]$$

The gradient with respect to weight vector $w$ is:
$$\nabla_w \mathcal{L} = \frac{1}{N} \left[ \sum_{i \in \mathcal{C}_1} (\hat{p}_i - 1) x_i + \sum_{i \in \mathcal{C}_0} (\hat{p}_i - 0) x_i \right]$$

Notice the scale disparity:
- The minority gradient sum has $N_1$ terms.
- The majority gradient sum has $N_0$ terms.

If $N_0 = 999 \times N_1$, the majority term exerts $\approx 1000\times$ more force on the gradient trajectory than the minority term. Gradient descent will happily set $\hat{p}_i \approx 0$ for all samples to minimize the dominant $N_0$ terms, accepting a small constant penalty on the negligible $N_1$ terms.

#### The Balanced Weighting Formulation
To restore gradient equilibrium, we apply inverse class frequency weighting (standard in scikit-learn's `class_weight='balanced'`):
$$w_0 = \frac{N}{2 \cdot N_0}, \quad w_1 = \frac{N}{2 \cdot N_1}$$

The weighted loss function becomes:
$$\mathcal{L}_w(w, b) = -\frac{1}{N} \sum_{i=1}^N \left[ w_1 y_i \log(\hat{p}_i) + w_0 (1 - y_i) \log(1 - \hat{p}_i) \right]$$

The corresponding gradient evaluates to:
$$\nabla_w \mathcal{L}_w = \frac{1}{N} \left[ w_1 \sum_{i \in \mathcal{C}_1} (\hat{p}_i - 1) x_i + w_0 \sum_{i \in \mathcal{C}_0} \hat{p}_i x_i \right]$$

Substituting $w_1$ and $w_0$:
$$w_1 \cdot N_1 = \frac{N}{2 \cdot N_1} \cdot N_1 = \frac{N}{2}, \quad w_0 \cdot N_0 = \frac{N}{2 \cdot N_0} \cdot N_0 = \frac{N}{2}$$

The total gradient mass contributed by the minority class now exactly equals the total gradient mass contributed by the majority class. The optimization landscape is balanced.

---

### 2.2 SMOTE Mechanics and the Geometry of Synthesis

SMOTE operates directly in the continuous feature space $\mathbb{R}^D$:

```
        Majority Class (O)                Minority Class (X)
        
            O     O                         X (Neighbor x_zi)
               O                               \
            O    O                              \   Synthetic point:
                   O                             *  x_new = x_i + lambda*(x_zi - x_i)
              O                                   \
                                                   X (Base point x_i)
```

For each minority sample $x_i \in \mathcal{C}_1$:
1. Calculate the Euclidean distance to all other minority samples in $\mathcal{C}_1$:
   $$d(x_i, x_j) = \|x_i - x_j\|_2 = \sqrt{\sum_{d=1}^D (x_{id} - x_{jd})^2}$$
2. Identify the $k$-nearest minority neighbors $\mathcal{N}_k(x_i)$.
3. Randomly select one neighbor $x_{zi} \in \mathcal{N}_k(x_i)$.
4. Sample a random scaling coefficient from a continuous uniform distribution:
   $$\lambda \sim \text{Uniform}(0, 1)$$
5. Synthesize a new artificial feature vector via linear interpolation along the connecting line segment:
   $$x_{\text{new}} = x_i + \lambda (x_{zi} - x_i)$$
6. Assign the synthetic sample the positive minority label $y_{\text{new}} = 1$.

#### Theoretical Failure Modes of SMOTE

```
    Majority (O)        Borderline Anomaly (X)         Majority (O)
        O                    X                              O
          O                   \  Synthetic Noise Bridge!   O
        O                      * <----------------------- O
          O                     \                        O
                                 X (Minority Cluster)
```

1. **Borderline Hallucination**: If a minority sample $x_i$ is a noisy measurement or label error located deep inside the majority class cluster, its $k$-nearest minority neighbors may lie across the decision boundary. SMOTE will draw a line segment directly through the majority cluster, populating it with synthetic positive points and severely degrading precision.
2. **The Curse of Dimensionality**: In high-dimensional spaces ($D > 50$), Euclidean distance concentrates: the ratio between the distance to the nearest neighbor and the distance to the farthest neighbor approaches 1:
   $$\lim_{D \to \infty} \frac{d_{\max} - d_{\min}}{d_{\min}} \to 0$$
   Nearest neighbors become arbitrary, causing SMOTE to interpolate across unrelated areas of feature space.
3. **Categorical Corruption**: If $x$ contains one-hot encoded categorical variables (e.g., `[0, 1, 0]` for Currency = EUR), linear interpolation yields non-binary fractional values (e.g., `[0.35, 0.65, 0.0]`), creating physically impossible feature states.

---

### 2.3 Evaluation Geometry: Why ROC-AUC Deceives

The **Receiver Operating Characteristic (ROC)** curve plots the True Positive Rate ($TPR$) against the False Positive Rate ($FPR$):
$$TPR = \text{Recall} = \frac{TP}{TP + FN}, \quad FPR = \frac{FP}{FP + TN}$$

Consider a real-world financial fraud scenario with $N = 100{,}000$ transactions:
- **Actual Legitimate ($N_0$)**: $99{,}000$
- **Actual Fraud ($N_1$)**: $1{,}000$

Suppose a model flags $1{,}000$ legitimate transactions as fraud ($FP = 1{,}000$) while successfully capturing $800$ fraud transactions ($TP = 800, FN = 200$).

Let us compute the metrics:
$$TPR = \frac{800}{800 + 200} = \frac{800}{1{,}000} = 0.8000 \quad (80\% \text{ Recall})$$
$$FPR = \frac{1{,}000}{1{,}000 + 98{,}000} = \frac{1{,}000}{99{,}000} \approx \mathbf{0.0101} \quad (1.01\% \text{ False Positive Rate})$$

Because $TN = 98{,}000$ is massive, the denominator $FP + TN$ dwarfs $FP$. The $FPR$ is a tiny $1.01\%$. On an ROC curve, a point with $TPR = 0.80$ and $FPR = 0.01$ sits in the top-left corner, producing an outstanding **ROC-AUC of $\approx 0.97$**.

Now examine **Precision**:
$$\text{Precision} = \frac{TP}{TP + FP} = \frac{800}{800 + 1{,}000} = \frac{800}{1{,}800} \approx \mathbf{0.4444} \quad (44.4\% \text{ Precision})$$

More than half of all flagged transactions are false alarms!

```
        ROC Curve: Deceptively Rosy           PR Curve: Unforgivingly Honest
   1.0 +---------*-------------+         1.0 +-----------------------+
       |        /              |             |                       |
   TPR |       /   ROC-AUC     |   Precision |*                      |
   0.8 |......*    ~ 0.97      |         0.4 |......*   PR-AUC       |
       |      |                |             |      |   ~ 0.62       |
   0.0 +------+----------------+         0.0 +------+----------------+
      0.0    0.01             1.0           0.0    0.8              1.0
             FPR                                   Recall
```

The **Precision-Recall (PR) Curve** completely excludes True Negatives ($TN$) from its formulation. It evaluates only $TP$, $FP$, and $FN$—the quantities that dictate operational performance on the rare class. In imbalanced problems, **always report PR-AUC alongside or in place of ROC-AUC**.

---

### 2.4 Cost-Utility Matrices & Optimal Threshold Derivation

In production, decisions are governed by dollars, not abstract probability cutoffs. Let each classification outcome carry a specific business cost:
- $C_{TP}$: Cost of a True Positive (e.g., automated fraud hold: $\$0$)
- $C_{TN}$: Cost of a True Negative (e.g., seamless authorization: $\$0$)
- $C_{FP}$: Cost of a False Positive (e.g., customer SMS friction + manual investigation: $\$25$)
- $C_{FN}$: Cost of a False Negative (e.g., lost transaction amount + chargeback fee + card scheme penalty: $\$500$)

For any decision threshold $\tau \in [0, 1]$, the total expected cost is:
$$\text{Cost}(\tau) = C_{FP} \cdot FP(\tau) + C_{FN} \cdot FN(\tau) + C_{TP} \cdot TP(\tau) + C_{TN} \cdot TN(\tau)$$

Assuming $C_{TP} = C_{TN} = 0$:
$$\text{Cost}(\tau) = C_{FP} \cdot FP(\tau) + C_{FN} \cdot FN(\tau)$$

From Bayes decision theory, to minimize expected risk, we should classify sample $x$ as positive ($y=1$) whenever the expected loss of predicting positive is less than the expected loss of predicting negative:
$$P(y=0 \mid x) \cdot C_{FP} + P(y=1 \mid x) \cdot C_{TP} < P(y=1 \mid x) \cdot C_{FN} + P(y=0 \mid x) \cdot C_{TN}$$

Substituting $P(y=0 \mid x) = 1 - P(y=1 \mid x)$ and setting $C_{TP} = C_{TN} = 0$:
$$(1 - p) \cdot C_{FP} < p \cdot C_{FN} \implies C_{FP} - p \cdot C_{FP} < p \cdot C_{FN}$$
$$C_{FP} < p(C_{FN} + C_{FP}) \implies p > \frac{C_{FP}}{C_{FN} + C_{FP}}$$

Therefore, the **theoretical Bayes-optimal decision threshold $\tau^*$** is:
$$\tau^* = \frac{C_{FP}}{C_{FN} + C_{FP}}$$

For our financial fraud scenario:
$$\tau^* = \frac{25}{500 + 25} = \frac{25}{525} \approx \mathbf{0.0476}$$

If the model predicts a probability of fraud greater than just **$4.76\%$**, the rational commercial decision is to flag the transaction! Enforcing a default threshold of $\tau = 0.50$ implies that catching a fraud transaction is only worth as much as annoying a legitimate user, an error that bleeds capital.

---

## 3. Real-World Case Study / Production Failure

### The Outage: The 99.8% Accurate Anti-Fraud Collapse (2020)

A fast-growing European payment service provider (PSP) processing €450 million monthly in merchant transactions migrated its rule-based anti-fraud system to a machine learning linear baseline model.

```
+-----------------------------------------------------------+
|  Offline Model Validation (Data Science Team)            |
|  - Metric Monitored: Test Accuracy                        |
|  - Result: 99.82% Accuracy! Model Approved for Prod.     |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|  Production Serving Container                             |
|  - Threshold: Default tau = 0.50                          |
|  - Real-world Fraud Rate: 0.15% (15 frauds per 10k txs)   |
|  - Model Output: P(Fraud) < 0.20 for ALL transactions     |
|  - Hard Decision: ALL TRANSACTIONS APPROVED (0 Flaggable) |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|  Financial & Regulatory Fallout (Over 6 Weeks)            |
|  - Total Undetected Fraud: €3,200,000                     |
|  - Chargeback Ratio Spiked to 1.42% (Threshold: 0.90%)    |
|  - Card Schemes Fined PSP €450,000                        |
|  - Merchant Processing Suspended for 48 Hours             |
+-----------------------------------------------------------+
```

### Root Cause Analysis

1. **The Accuracy Blindspot**: The offline training pipeline evaluated model candidates exclusively on accuracy. Because the dataset had a natural fraud rate of 0.18%, the unweighted Ridge Logistic Regression converged to parameters where $w \approx 0$ and $b \approx -6.5$. The predicted probabilities never exceeded $0.15$. The model predicted "legitimate" on 100% of test samples, logging a stellar accuracy of $99.82\%$.
2. **The Default Threshold Trap**: The engineering team deployed the model with `predict()` rather than `predict_proba()`. In scikit-learn, `predict()` applies a hardcoded $\tau = 0.50$. Since $\hat{p} < 0.15$ on every query, the model never generated a single fraud alert in production.
3. **The Settlement Lag**: In the payment card ecosystem, credit card chargebacks operate on a 30- to 60-day dispute lag. While the monitoring dashboard showed healthy green metrics and zero reported false positives for four weeks, actual cardholders were discovering fraudulent charges on their monthly statements and filing disputes.
4. **The Network Sanction**: When the chargeback wave hit the acquiring banks, the PSP's chargeback-to-transaction ratio surged to $1.42\%$, far exceeding Visa's and Mastercard's $0.90\%$ Excessive Chargeback Program (ECP) threshold. The payment networks imposed an immediate €450,000 fine and threatened complete terminal revocation.

### Remediation Architecture

The engineering leadership rebuilt the fraud engine with three core architectural controls:
1. **Banned Accuracy**: Accuracy was permanently purged from all CI/CD model deployment gates and dashboards. PR-AUC and expected business cost became the sole deployment gates.
2. **Cost-Sensitive Loss with Calibration**: Models were retrained using `class_weight='balanced'`, paired with Platt Scaling cross-validation to ensure predicted probabilities reflected true posterior frequencies.
3. **Automated Cost-Curve Threshold Optimization**: The serving container loads a validated `threshold_config.json` generated by optimizing the empirical cost curve on held-out validation data. The threshold was lowered from $0.50$ to $0.035$, cutting chargeback losses by $88\%$ in the first 30 days.

---

## 4. Hands-on Implementation from Scratch

The following production script implements an end-to-end imbalanced classification pipeline in pure Python/NumPy and scikit-learn. It implements a self-contained SMOTE oversampler, trains baseline, class-weighted, and resampled models, and computes full cost curves to locate the empirical cost-minimizing threshold.

```python
"""
End-to-End Class Imbalance Benchmark & Threshold Optimization Pipeline.
Compares:
1. Baseline Unweighted Logistic Regression
2. Cost-Sensitive Class-Weighted Logistic Regression
3. SMOTE Resampled Logistic Regression
4. Cost-Optimized Threshold Tuning on Expected Financial Loss
"""

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, confusion_matrix, roc_auc_score


def smote_from_scratch(
    X_min: np.ndarray,
    n_synthetic_samples: int,
    k_neighbors: int = 5,
    random_state: int = 42,
) -> np.ndarray:
    """
    Generate synthetic minority samples using the SMOTE algorithm in pure NumPy.
    Interpolates along the line segment connecting minority neighbors.
    """
    rng = np.random.default_rng(random_state)
    n_samples, n_features = X_min.shape

    # 1. Compute pairwise squared Euclidean distance matrix: ||x_i - x_j||^2
    # Shape: (n_samples, n_samples)
    diff = X_min[:, np.newaxis, :] - X_min[np.newaxis, :, :]
    dist_matrix = np.sum(diff ** 2, axis=2)

    # 2. Extract k-nearest neighbors (excluding self at index 0)
    k_effective = min(k_neighbors, n_samples - 1)
    nn_indices = np.argsort(dist_matrix, axis=1)[:, 1 : k_effective + 1]

    synthetic_points = np.empty((n_synthetic_samples, n_features), dtype=np.float64)

    # 3. Synthesize samples via random linear interpolation
    for i in range(n_synthetic_samples):
        # Pick a random minority seed point
        base_idx = rng.integers(0, n_samples)
        # Pick one of its k nearest neighbors
        neighbor_idx = rng.choice(nn_indices[base_idx])
        # Vector difference
        feature_diff = X_min[neighbor_idx] - X_min[base_idx]
        # Random step size lambda ~ Uniform(0, 1)
        step = rng.uniform(0.0, 1.0)
        # New point: x_new = x_base + lambda * (x_neighbor - x_base)
        synthetic_points[i] = X_min[base_idx] + step * feature_diff

    return synthetic_points


def evaluate_decision_rule(
    y_true: np.ndarray,
    probs: np.ndarray,
    threshold: float,
    cost_fp: float = 25.0,
    cost_fn: float = 500.0,
):
    """
    Evaluate confusion matrix, precision, recall, and total financial cost.
    """
    preds = (probs >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, preds).ravel()
    total_cost = (fp * cost_fp) + (fn * cost_fn)
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    return {
        "cost": total_cost,
        "recall": recall,
        "precision": precision,
        "fp": fp,
        "fn": fn,
        "tp": tp,
        "tn": tn,
    }


# =====================================================================
# Main Benchmark Pipeline
# =====================================================================
if __name__ == "__main__":
    # 1. Generate Realistic Imbalanced Transaction Dataset
    # Total: 10,000 transactions, 100 fraudulent (1.0% fraud rate)
    rng = np.random.default_rng(42)
    N_neg, N_pos = 9900, 100

    # Feature 0: Standardized transaction amount
    # Feature 1: Anomaly velocity score
    X_legit = rng.normal(loc=[0.0, 0.0], scale=[1.0, 1.0], size=(N_neg, 2))
    X_fraud = rng.normal(loc=[1.8, 2.0], scale=[1.2, 1.2], size=(N_pos, 2))

    X = np.vstack([X_legit, X_fraud])
    y = np.array([0] * N_neg + [1] * N_pos)

    # 2. Strict Train/Test Split (70/30)
    # Critical: Resampling must ONLY occur on the training fold!
    indices = rng.permutation(len(y))
    split_boundary = 7000
    train_idx, test_idx = indices[:split_boundary], indices[split_boundary:]

    X_train, y_train = X[train_idx], y[train_idx]
    X_test, y_test = X[test_idx], y[test_idx]

    # Financial Cost Parameters
    COST_FP = 25.0   # $25 manual verification friction
    COST_FN = 500.0  # $500 unrecoverable chargeback loss

    # Model 1: Baseline Unweighted Logistic Regression
    clf_base = LogisticRegression(random_state=42).fit(X_train, y_train)
    probs_base = clf_base.predict_proba(X_test)[:, 1]

    # Model 2: Balanced Class-Weighted Logistic Regression
    clf_weighted = LogisticRegression(
        class_weight="balanced", random_state=42
    ).fit(X_train, y_train)
    probs_weighted = clf_weighted.predict_proba(X_test)[:, 1]

    # Model 3: SMOTE Oversampled Logistic Regression
    X_min_train = X_train[y_train == 1]
    n_majority = np.sum(y_train == 0)
    n_minority = len(X_min_train)
    n_to_synthesize = n_majority - n_minority

    X_synthetic = smote_from_scratch(
        X_min_train, n_to_synthesize, k_neighbors=5, random_state=42
    )
    X_train_smote = np.vstack([X_train, X_synthetic])
    y_train_smote = np.concatenate([y_train, np.ones(n_to_synthesize, dtype=int)])

    clf_smote = LogisticRegression(random_state=42).fit(
        X_train_smote, y_train_smote
    )
    probs_smote = clf_smote.predict_proba(X_test)[:, 1]

    # 3. Model Evaluation at Standard Threshold (tau = 0.5)
    print("=" * 80)
    print("PRODUCTION IMBALANCE BENCHMARK (1.0% FRAUD RATE)")
    print(f"Test Set Size: {len(y_test)} (Legitimate: {np.sum(y_test == 0)}, Fraud: {np.sum(y_test == 1)})")
    print(f"Cost Structure: False Positive = ${COST_FP:.0f} | False Negative = ${COST_FN:.0f}")
    print("=" * 80)

    models = [
        ("Baseline (tau=0.50)", probs_base, 0.50),
        ("Class-Weighted (tau=0.50)", probs_weighted, 0.50),
        ("SMOTE Resampled (tau=0.50)", probs_smote, 0.50),
    ]

    for name, probs, thresh in models:
        metrics = evaluate_decision_rule(
            y_test, probs, thresh, COST_FP, COST_FN
        )
        pr_auc = average_precision_score(y_test, probs)
        roc_auc = roc_auc_score(y_test, probs)
        print(f"\nModel: {name}")
        print(f"  PR-AUC: {pr_auc:.4f}  |  ROC-AUC: {roc_auc:.4f}")
        print(f"  Recall: {metrics['recall']*100:.1f}%  |  Precision: {metrics['precision']*100:.1f}%")
        print(f"  Errors: False Positives={metrics['fp']} | Missed Frauds (FN)={metrics['fn']}")
        print(f"  TOTAL EXPECTED FINANCIAL LOSS: USD {metrics['cost']:>8,.0f}")

    # 4. Post-Processing: Empirical Cost Curve Threshold Optimization
    # Search for threshold tau in [0.01, 0.99] minimizing Total Cost on Baseline Model
    threshold_grid = np.linspace(0.01, 0.99, 200)
    best_thresh = 0.5
    lowest_cost = float("inf")
    best_metrics = None

    for candidate_t in threshold_grid:
        m = evaluate_decision_rule(
            y_test, probs_base, candidate_t, COST_FP, COST_FN
        )
        if m["cost"] < lowest_cost:
            lowest_cost = m["cost"]
            best_thresh = candidate_t
            best_metrics = m

    print("\n" + "=" * 80)
    print(f"OPTIMAL THRESHOLD TUNING (Baseline Model with tau* = {best_thresh:.2f})")
    print(f"  Recall: {best_metrics['recall']*100:.1f}%  |  Precision: {best_metrics['precision']*100:.1f}%")
    print(f"  Errors: False Positives={best_metrics['fp']} | Missed Frauds (FN)={best_metrics['fn']}")
    print(f"  TOTAL EXPECTED FINANCIAL LOSS: USD {lowest_cost:>8,.0f}")
    
    # Financial savings calculation
    base_cost = evaluate_decision_rule(y_test, probs_base, 0.50, COST_FP, COST_FN)["cost"]
    savings = base_cost - lowest_cost
    print(f"  NET SAVINGS OVER NAIVE BASELINE: USD {savings:>8,.0f} ({(savings/base_cost)*100:.1f}% Reduction)")
    print("=" * 80)
```

### Execution Output

```text
# Output:
================================================================================
PRODUCTION IMBALANCE BENCHMARK (1.0% FRAUD RATE)
Test Set Size: 3000 (Legitimate: 2968, Fraud: 32)
Cost Structure: False Positive = $25 | False Negative = $500
================================================================================

Model: Baseline (tau=0.50)
  PR-AUC: 0.7039  |  ROC-AUC: 0.9777
  Recall: 46.9%  |  Precision: 93.8%
  Errors: False Positives=1 | Missed Frauds (FN)=17
  TOTAL EXPECTED FINANCIAL LOSS: USD    8,525

Model: Class-Weighted (tau=0.50)
  PR-AUC: 0.7135  |  ROC-AUC: 0.9774
  Recall: 93.8%  |  Precision: 11.1%
  Errors: False Positives=240 | Missed Frauds (FN)=2
  TOTAL EXPECTED FINANCIAL LOSS: USD    7,000

Model: SMOTE Resampled (tau=0.50)
  PR-AUC: 0.7078  |  ROC-AUC: 0.9775
  Recall: 93.8%  |  Precision: 12.2%
  Errors: False Positives=216 | Missed Frauds (FN)=2
  TOTAL EXPECTED FINANCIAL LOSS: USD    6,400

================================================================================
OPTIMAL THRESHOLD TUNING (Baseline Model with tau* = 0.02)
  Recall: 93.8%  |  Precision: 16.6%
  Errors: False Positives=151 | Missed Frauds (FN)=2
  TOTAL EXPECTED FINANCIAL LOSS: USD    4,775
  NET SAVINGS OVER NAIVE BASELINE: USD    3,750 (44.0% Reduction)
================================================================================
```

---

## 5. Common Pitfalls & Anti-Patterns

### Anti-Pattern 1: Applying SMOTE Before Train-Test Split (Data Leakage)

```python
# NAIVE / DISASTROUS: Leakage across folds
from imblearn.over_sampling import SMOTE
# DO NOT DO THIS!
X_resampled, y_resampled = SMOTE().fit_resample(X, y)
# The synthetic samples now blend points from future test sets into train sets!
X_train, X_test, y_train, y_test = train_test_split(X_resampled, y_resampled)

# ROBUST / PRODUCTION-GRADE: Split FIRST, Resample ONLY the train fold
X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y)
X_train_res, y_train_res = SMOTE().fit_resample(X_train, y_train)
# Test data remains untouched, authentic, and naturally imbalanced!
```

### Anti-Pattern 2: Relying on ROC-AUC for Imbalanced Classifiers

```python
# NAIVE / MISLEADING
from sklearn.metrics import roc_auc_score
# In 1:1000 imbalance, a model predicting 500 False Positives can still score:
roc = roc_auc_score(y_test, probs)  # Returns 0.98! Looks amazing to managers.

# ROBUST / TRUTHFUL
from sklearn.metrics import average_precision_score
# PR-AUC directly reveals catastrophic precision collapse:
pr_auc = average_precision_score(y_test, probs)  # Returns 0.32! Identifies failure.
```

### Anti-Pattern 3: Hardcoding `predict()` instead of Parameterizing Thresholds

```python
# NAIVE / DANGEROUS
# model.predict(X) applies an unalterable threshold of 0.50
decisions = model.predict(X_incoming)

# ROBUST / PRODUCTION-GRADE
# Externalize the business-optimized threshold via configuration
THRESHOLD = 0.04  # Derived from Cost(FP) = $25, Cost(FN) = $500
probabilities = model.predict_proba(X_incoming)[:, 1]
decisions = (probabilities >= THRESHOLD).astype(int)
```

---

## 6. Self-Check & Exercises

### Exercise 1: Computing Theoretical Bayes Optimal Threshold
**Question:** In an identity verification backend, authenticating a fraudulent login results in an average account takeover remediation loss of $\$1{,}200$ ($C_{FN} = 1200$). Triggering an automated multi-factor authentication (MFA) push notification costs $\$0.10$ in SMS gateway fees and creates minor customer friction, valued at $\$1.90$, totaling $\$2.00$ ($C_{FP} = 2.0$). Assuming no cost for correct decisions ($C_{TP} = C_{TN} = 0$), what is the theoretically optimal probability threshold $\tau^*$ at which the backend should trigger step-up MFA?

**Detailed Solution:**
Using the Bayes-optimal decision rule:
$$\tau^* = \frac{C_{FP} - C_{TN}}{(C_{FP} - C_{TN}) + (C_{FN} - C_{TP})} = \frac{2.0 - 0}{(2.0 - 0) + (1200 - 0)} = \frac{2.0}{1202.0} \approx \mathbf{0.00166}$$

The backend should trigger step-up authentication if the model's predicted probability of fraud exceeds just **$0.166\%$** (approximately 1 in 600 odds). Setting the threshold to 0.50 would cause massive unmitigated account takeover losses.

---

### Exercise 2: Mathematical Proof of ROC vs PR Resilience
**Question:** A security classifier monitors $N = 1{,}000{,}000$ daily events containing $N_1 = 500$ real cyber attacks and $N_0 = 999{,}500$ benign events. Model A detects $400$ attacks ($TP = 400, FN = 100$) while generating $2{,}000$ false alerts ($FP = 2{,}000$).
1. Compute the False Positive Rate ($FPR$).
2. Compute the Precision.
3. Explain why the ROC curve gives a false sense of security compared to the PR curve.

**Detailed Solution:**
1. True Negatives: $TN = N_0 - FP = 999{,}500 - 2{,}000 = 997{,}500$.
   $$FPR = \frac{FP}{FP + TN} = \frac{2{,}000}{2{,}000 + 997{,}500} = \frac{2{,}000}{999{,}500} \approx \mathbf{0.0020} \quad (0.20\%)$$
2. Precision:
   $$\text{Precision} = \frac{TP}{TP + FP} = \frac{400}{400 + 2{,}000} = \frac{400}{2{,}400} \approx \mathbf{0.1667} \quad (16.7\%)$$
3. **Geometric Analysis**: 
   On an ROC plot, $FPR = 0.002$ is indistinguishable from 0. The ROC point $(0.002, 0.80)$ suggests near-perfect performance. However, in security operations, the Precision of $16.7\%$ means that **5 out of every 6 alerts investigated by analysts are false alarms**, causing severe alert fatigue. The PR curve reveals this reality; the ROC curve conceals it inside the massive $TN$ denominator.

---

### Exercise 3: Inverse Class Frequency Calculation
**Question:** A dataset of $N = 50{,}000$ examples contains $49{,}500$ benign samples and $500$ fraud samples. Compute the exact balanced class weights $w_0$ and $w_1$ applied under `class_weight='balanced'`. Verify that the total weighted sum of minority samples equals the total weighted sum of majority samples.

**Detailed Solution:**
1. Formula: $w_k = \frac{N}{K \cdot N_k}$ where $K = 2$.
   $$w_0 = \frac{50{,}000}{2 \times 49{,}500} = \frac{50{,}000}{99{,}000} \approx \mathbf{0.50505}$$
   $$w_1 = \frac{50{,}000}{2 \times 500} = \frac{50{,}000}{1{,}000} = \mathbf{50.0}$$
2. Weighted gradient mass verification:
   $$\sum_{i \in \mathcal{C}_0} w_0 = 49{,}500 \times \frac{50{,}000}{2 \times 49{,}500} = 25{,}000$$
   $$\sum_{i \in \mathcal{C}_1} w_1 = 500 \times 50.0 = 25{,}000$$
   Both classes now exert exactly equal gradient mass ($25{,}000$) during optimization.

---

[$\leftarrow$ Previous Module](../05-multiclass-softmax-and-one-vs-rest/README.md) | [Track Overview](../README.md) | [Next Module $\rightarrow$](../07-support-vector-machines-and-max-margin/README.md)
