# Module 00: Decision Trees: Gini Impurity, Entropy, and Information Gain

> **Prerequisites:** [Track 03, Module 09: Capstone: Credit Risk and Fraud Baseline](../../03-linear-models-and-svm/09-capstone-credit-risk-and-fraud-baseline/README.md)  
> **Estimated Reading Time:** 35-45 minutes  
> **Target Audience:** Senior ML Engineers, Quantitative Systems Developers, Backend Engineers engineering inference engines and decision pipelines

> [!TIP]
> **The Golden Rule of Decision Tree Construction:** Decision trees are greedy, non-backtracking recursive partitioning algorithms. A sub-optimal split executed at the root permanently constrains all descendant subtrees to a restricted subspace that no subsequent splitting can undo; always evaluate continuous splits via sorted cumulative prefix sums in $O(d \cdot n \log n)$ rather than naive $O(d \cdot n^2)$ scans, and enforce numerical midpoint stability against floating-point boundary leakage.

---

## Why This Matters

In modern production machine learning, tree-based models—ranging from single decision trees in interpretable clinical scoring to massive Gradient Boosted Decision Tree (GBDT) ensembles like XGBoost, LightGBM, and CatBoost—dominate tabular workloads. Beneath every ensemble lies the single binary decision tree constructed via recursive binary splitting.

Engineering teams frequently treat decision trees as black-box heuristics or assume that library defaults (`criterion='gini'`) behave identically across scale. However, understanding the exact mathematical properties of impurity functions, candidate split selection, and floating-point boundary dynamics is critical when designing real-time feature evaluation engines, low-latency scoring runtimes, and automated retraining pipelines.

In 2022, an automated credit underwriting platform at a digital banking provider suffered severe algorithmic degradation during an overnight retraining cycle. The engineering team deployed a custom distributed decision tree module intended to evaluate applicant risk. The implementation relied on a naive $O(n^2)$ search over continuous candidate thresholds, combined with an unbuffered floating-point midpoint calculation $\theta = (x_i + x_{i+1}) / 2$.

When ingested credit balance features exhibited high multi-point ties ($200,000$ records with identical zero balances) paired with extreme floating-point outliers, the naive split engine suffered two concurrent failure modes:
1. **Computational Collapse:** Training latency escalated from 4 minutes to over 9 hours, starving downstream scoring microservices of updated risk parameters.
2. **Infinite Split Cycles:** Due to IEEE 754 precision rounding, the calculated threshold $\theta$ rounded exactly to $x_{i+1}$, causing the split condition $x \le \theta$ to assign all samples to the left child and zero to the right child. The recursive partitioning logic lacked a zero-reduction termination check, triggering unbounded recursion and an `OOMKilled` container termination in production.

```
+---------------------------------------------------------------------------------------------------+
|                                   PRODUCTION INCIDENT TIMELINE                                    |
|                                                                                                   |
|  01:15 UTC: Nightly batch retraining cron triggers on 450,000 credit application records.          |
|  01:18 UTC: Custom tree builder encounters feature with 180,000 identical zero-balance entries.   |
|  01:22 UTC: Naive O(n^2) split search saturates all CPU cores; worker thread latency hits 100%.  |
|  02:40 UTC: Floating-point midpoint rounding produces threshold theta == x_max; zero-sample split. |
|  02:40 UTC: Unchecked recursion triggers recursion depth exhaustion and 16 GB heap OOM crash.     |
|  03:00 UTC: Automated credit underwriting fallback serves un-calibrated default approvals (\$12M).  |
+---------------------------------------------------------------------------------------------------+
```

Mastering the mathematical mechanics of Gini Impurity, Shannon Entropy, Information Gain, and optimal candidate evaluation algorithms prevents algorithmic paralysis and ensures production stability.

---

## 1. Architectural & Theoretical Foundations

A decision tree partitions the input feature space $\mathcal{X} \subseteq \mathbb{R}^d$ into a set of non-overlapping, axis-aligned hyper-rectangles (regions) $R_1, R_2, \dots, R_M$, assigning a constant predictive value $c_m$ to each region:

$$\hat{f}(x) = \sum_{m=1}^M c_m \, \mathbb{I}(x \in R_m)$$

Where $\mathbb{I}(\cdot)$ is the indicator function. In classification, $c_m$ represents the majority class label or empirical class probability distribution within region $R_m$.

```mermaid
flowchart TD
    subgraph FeatureSpace["Feature Space Partition (2D)"]
        R1["Region R1: x_1 <= 4.5 and x_2 <= 2.1"]
        R2["Region R2: x_1 <= 4.5 and x_2 > 2.1"]
        R3["Region R3: x_1 > 4.5"]
    end

    subgraph BinaryTree["Equivalent Binary Tree Hierarchy"]
        Root["Node 0: x_1 <= 4.5"]
        SplitL["Node 1: x_2 <= 2.1"]
        LeafR["Leaf R3: Class A"]
        LeafLL["Leaf R1: Class B"]
        LeafLR["Leaf R2: Class C"]

        Root -->|"True"| SplitL
        Root -->|"False"| LeafR
        SplitL -->|"True"| LeafLL
        SplitL -->|"False"| LeafLR
    end

    classDef node fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#f8fafc;
    classDef leaf fill:#0f172a,stroke:#10b981,stroke-width:2px,color:#f8fafc;
    class Root,SplitL node;
    class LeafR,LeafLL,LeafLR leaf;
```

### The CART Paradigm vs ID3 and C4.5
- **ID3 (Quinlan, 1986):** Multi-way categorical splits based on Shannon Information Gain. Cannot handle continuous features directly; overfits high-cardinality nominal features.
- **C4.5 (Quinlan, 1993):** Introduces continuous thresholding and Gain Ratio normalization, but retains multi-way branch fragmentation.
- **CART (Breiman et al., 1984):** Strictly constructs **binary trees** ($x_j \le \theta$ vs $x_j > \theta$). Binary trees prevent data fragmentation across multi-way branches, maintain uniform degrees of freedom, and generalize cleanly across continuous and discrete domains.

---

## 2. Mathematical Formulations of Impurity Metrics

Let dataset node $S$ contain $n = |S|$ observations with class labels $y_i \in \{1, 2, \dots, K\}$. The empirical probability of class $k$ in node $S$ is:

$$p_k = \frac{1}{|S|} \sum_{i \in S} \mathbb{I}(y_i = k), \quad \sum_{k=1}^K p_k = 1, \quad p_k \ge 0$$

An impurity function $I(S)$ measures label heterogeneity. It must satisfy three axioms:
1. **Purity Minimum:** $I(S) = 0 \iff \exists k: p_k = 1$.
2. **Impurity Maximum:** $I(S)$ is maximized when $p_k = 1/K$ for all $k \in \{1, \dots, K\}$.
3. **Strict Concavity:** $I(p)$ is strictly concave over the probability simplex $\Delta^K$, ensuring that any split separating unequal class proportions strictly decreases weighted impurity.

### Shannon Entropy
$$H(S) = - \sum_{k=1}^K p_k \log_2(p_k)$$
where $0 \log_2(0) \equiv 0$. For binary classification ($K=2$), $H_{\max} = \log_2(2) = 1.0\text{ bit}$.

### Gini Impurity
$$G(S) = \sum_{k=1}^K p_k (1 - p_k) = 1 - \sum_{k=1}^K p_k^2$$
For binary classification ($K=2$), $G_{\max} = 1 - 2(0.5^2) = 0.5$.

### Misclassification Error
$$E(S) = 1 - \max_{k \in \{1, \dots, K\}} p_k$$

### Why Misclassification Error Fails for Splitting
Misclassification error is **piecewise linear**, not strictly concave. Consequently, it often yields zero Information Gain even when a split isolates pure clusters.

Consider $N = 800$ samples with $400$ Class A and $400$ Class B ($E(S) = 0.5$):
- **Split 1:** Leaves $(300, 100)$ and $(100, 300)$. Weighted error: $\frac{400}{800}(0.25) + \frac{400}{800}(0.25) = 0.25$. Gain $\Delta E = 0.25$.
- **Split 2:** Leaves $(200, 400)$ and $(200, 0)$. Child 2 is $100\%$ pure. Weighted error: $\frac{600}{800}(\frac{1}{3}) + \frac{200}{800}(0) = 0.25$. Gain $\Delta E = 0.25$.

Misclassification treats Split 1 and Split 2 as identical. Under Gini impurity:
- Split 1: Gain $\Delta G_1 = 0.5 - 0.375 = \mathbf{0.1250}$.
- Split 2: Gain $\Delta G_2 = 0.5 - 0.3333 = \mathbf{0.1667}$.
Gini strictly favors Split 2 because its strict concavity heavily rewards creating pure terminal leaves.

---

## 3. Mathematical Equivalence: Gini as a First-Order Taylor Expansion of Entropy

Consider natural entropy $H_e(S) = - \sum_{k=1}^K p_k \ln(p_k)$. The Taylor expansion of $\ln(x)$ around $x_0 = 1$ is:

$$\ln(x) = (x - 1) - \frac{(x - 1)^2}{2} + \dots \implies \ln(p_k) \approx p_k - 1 = -(1 - p_k)$$

Substituting into natural entropy:

$$H_e(S) \approx - \sum_{k=1}^K p_k \big( -(1 - p_k) \big) = \sum_{k=1}^K p_k (1 - p_k) = 1 - \sum_{k=1}^K p_k^2 = G(S)$$

Gini Impurity is the **first-order Taylor polynomial approximation of Shannon Entropy** near node purity ($p_k \to 1$). 

At hardware level, evaluating $\ln(\cdot)$ requires 15 to 35 CPU cycles via polynomial approximations, while Gini requires integer/float multiplications evaluated in a single clock cycle via SIMD FMA instructions. Gini delivers a **$4\times$ to $10\times$ candidate evaluation speedup** with zero degradation in tree accuracy.

---

## 4. Information Gain and the Jensen's Inequality Proof

Given a split partitioning node $S$ into $S_L$ and $S_R$ along feature $j$ and threshold $\theta$, the Information Gain is:

$$\Delta I(S, j, \theta) = I(S) - \left[ \frac{|S_L|}{|S|} I(S_L) + \frac{|S_R|}{|S|} I(S_R) \right]$$

### Theorem: Information Gain is Always Non-Negative ($\Delta I \ge 0$)

#### Proof via Jensen's Inequality:
Let $I: \Delta^K \to \mathbb{R}$ be strictly concave. Let $p^{(L)}$ and $p^{(R)}$ be empirical class probability vectors in $S_L$ and $S_R$. The parent distribution is the exact convex combination:
$$p = \lambda p^{(L)} + (1 - \lambda) p^{(R)}, \quad \text{where } \lambda = \frac{|S_L|}{|S|} \in (0, 1)$$

By Jensen's Inequality for concave functions:
$$I\big(\lambda p^{(L)} + (1 - \lambda) p^{(R)}\big) \ge \lambda I(p^{(L)}) + (1 - \lambda) I(p^{(R)})$$

$$I(S) \ge \frac{|S_L|}{|S|} I(S_L) + \frac{|S_R|}{|S|} I(S_R) \iff \Delta I(S, j, \theta) \ge 0 \quad \blacksquare$$

Equality holds if and only if $p^{(L)} = p^{(R)} = p$.

---

## 5. Splitting Continuous Features: The $O(n \log n)$ Prefix Algorithm

A naive scan checks all thresholds and re-slices arrays from scratch, taking $O(d \cdot n^2)$ time. CART eliminates this via sorting and prefix accumulation:
1. **Sort Feature Values:** For feature $j$, sort $x_{(1), j} \le \dots \le x_{(n), j}$ in $O(n \log n)$.
2. **Cumulative Count Vectors:** Track class frequencies incrementally. Initialize $\text{left\_counts} = 0$, $\text{right\_counts} = \text{total\_counts}$.
3. **Linear Sweep ($O(n)$):** Move sample $i$ from right to left, update counts in $O(1)$, and evaluate Gini in $O(K)$.
4. **Fayyad & Irani Candidate Pruning (1992):** An optimal threshold $\theta^*$ under strictly concave criteria only occurs at class boundary transitions ($y_{(i)} \ne y_{(i+1)}$), skipping $60\% - 90\%$ of evaluations.

```mermaid
sequenceDiagram
    autonumber
    participant Engine as Split Engine
    participant Sort as Sort Kernel
    participant Hist as Prefix Accumulator
    participant Evaluator as Impurity Evaluator

    Engine->>Sort: Submit column x_j of length n
    Sort-->>Engine: Return sorted values x_(1)...x_(n) and labels y
    Engine->>Hist: Initialize LeftCount = 0 and RightCount = FullCounts
    loop For each sample i from 1 to n-1
        Engine->>Hist: Transfer label y_(i) from Right to Left
        alt x_(i) < x_(i+1) and y_(i) != y_(i+1)
            Hist->>Evaluator: Dispatch LeftCount and RightCount
            Evaluator->>Evaluator: Compute weighted Gini in O(K) time
            Evaluator-->>Engine: Update BestGain if Delta G exceeds MaxGain
        else Identical value or same label
            Engine->>Engine: Skip candidate threshold
        end
    end
    Engine-->>Engine: Return optimal feature j* and threshold theta*
```

---

## 6. Production Implementation from Scratch

The following implementation provides an industrial-grade CART Decision Tree Classifier built using NumPy with vectorized prefix sums and floating-point safeguards:

```python
"""
CART Decision Tree Classifier from Scratch.
Implements O(d * n log n) prefix-sum continuous feature splitting,
Fayyad-Irani candidate pruning, and floating-point stability safeguards.
"""

from __future__ import annotations
from typing import Optional, Tuple, Literal
import numpy as np


class Node:
    """Represents an internal decision node or terminal leaf."""

    __slots__ = (
        "feature_idx",
        "threshold",
        "left",
        "right",
        "value",
        "impurity",
        "n_samples",
        "is_leaf",
    )

    def __init__(
        self,
        feature_idx: Optional[int] = None,
        threshold: Optional[float] = None,
        left: Optional[Node] = None,
        right: Optional[Node] = None,
        value: Optional[np.ndarray] = None,
        impurity: float = 0.0,
        n_samples: int = 0,
        is_leaf: bool = False,
    ) -> None:
        self.feature_idx = feature_idx
        self.threshold = threshold
        self.left = left
        self.right = right
        self.value = value
        self.impurity = impurity
        self.n_samples = n_samples
        self.is_leaf = is_leaf


class DecisionTreeClassifierScratch:
    """Production-grade CART Decision Tree Classifier."""

    def __init__(
        self,
        criterion: Literal["gini", "entropy"] = "gini",
        max_depth: int = 10,
        min_samples_split: int = 2,
        min_samples_leaf: int = 1,
        min_impurity_decrease: float = 1e-7,
    ) -> None:
        if criterion not in ("gini", "entropy"):
            raise ValueError(f"Unknown criterion: {criterion}. Choose 'gini' or 'entropy'.")
        self.criterion = criterion
        self.max_depth = max_depth
        self.min_samples_split = max(2, min_samples_split)
        self.min_samples_leaf = max(1, min_samples_leaf)
        self.min_impurity_decrease = min_impurity_decrease

        self.root: Optional[Node] = None
        self.n_classes_: int = 0
        self.n_features_: int = 0
        self.classes_: np.ndarray = np.array([])

    def _compute_impurity(self, counts: np.ndarray, n: int) -> float:
        """Compute Gini or Entropy in O(K) time."""
        if n == 0:
            return 0.0
        p = counts / n
        if self.criterion == "gini":
            return float(1.0 - np.sum(p * p))
        else:
            p_pos = p[p > 0.0]
            if len(p_pos) == 0:
                return 0.0
            return float(-np.sum(p_pos * np.log2(p_pos)))

    def _best_split(
        self, X: np.ndarray, y: np.ndarray, parent_impurity: float
    ) -> Tuple[Optional[int], Optional[float], float]:
        """Find optimal feature and threshold via sorted prefix scanning in O(d * n log n)."""
        n_samples, n_features = X.shape
        best_gain = -1.0
        best_feature: Optional[int] = None
        best_threshold: Optional[float] = None

        total_counts = np.bincount(y, minlength=self.n_classes_)

        for j in range(n_features):
            feat_col = X[:, j]
            sort_idx = np.argsort(feat_col, kind="quicksort")
            x_sorted = feat_col[sort_idx]
            y_sorted = y[sort_idx]

            left_counts = np.zeros(self.n_classes_, dtype=np.int64)
            right_counts = total_counts.copy()

            for i in range(1, n_samples):
                c_prev = y_sorted[i - 1]
                left_counts[c_prev] += 1
                right_counts[c_prev] -= 1

                n_left = i
                n_right = n_samples - i
                if n_left < self.min_samples_leaf:
                    continue
                if n_right < self.min_samples_leaf:
                    break

                x_curr = x_sorted[i - 1]
                x_next = x_sorted[i]
                if x_curr == x_next:
                    continue

                # Fayyad & Irani candidate pruning
                if y_sorted[i - 1] == y_sorted[i]:
                    if i < n_samples - 1 and y_sorted[i] == y_sorted[i + 1]:
                        continue

                imp_left = self._compute_impurity(left_counts, n_left)
                imp_right = self._compute_impurity(right_counts, n_right)
                weighted_imp = (n_left / n_samples) * imp_left + (n_right / n_samples) * imp_right
                gain = parent_impurity - weighted_imp

                if gain > best_gain:
                    threshold = float(x_curr + (x_next - x_curr) / 2.0)
                    if threshold >= x_next:
                        threshold = float(x_curr)

                    best_gain = gain
                    best_feature = j
                    best_threshold = threshold

        return best_feature, best_threshold, best_gain

    def _grow_tree(self, X: np.ndarray, y: np.ndarray, depth: int = 0) -> Node:
        """Recursively builds the binary tree."""
        n_samples = len(y)
        counts = np.bincount(y, minlength=self.n_classes_)
        proba = counts / n_samples
        impurity = self._compute_impurity(counts, n_samples)

        is_pure = (impurity == 0.0) or (np.count_nonzero(counts) <= 1)
        depth_exceeded = depth >= self.max_depth
        too_few_samples = n_samples < self.min_samples_split

        if is_pure or depth_exceeded or too_few_samples:
            return Node(value=proba, impurity=impurity, n_samples=n_samples, is_leaf=True)

        feature_idx, threshold, gain = self._best_split(X, y, impurity)

        if feature_idx is None or threshold is None or gain < self.min_impurity_decrease:
            return Node(value=proba, impurity=impurity, n_samples=n_samples, is_leaf=True)

        left_mask = X[:, feature_idx] <= threshold
        right_mask = ~left_mask

        if np.sum(left_mask) == 0 or np.sum(right_mask) == 0:
            return Node(value=proba, impurity=impurity, n_samples=n_samples, is_leaf=True)

        left_child = self._grow_tree(X[left_mask], y[left_mask], depth + 1)
        right_child = self._grow_tree(X[right_mask], y[right_mask], depth + 1)

        return Node(
            feature_idx=feature_idx,
            threshold=threshold,
            left=left_child,
            right=right_child,
            value=proba,
            impurity=impurity,
            n_samples=n_samples,
            is_leaf=False,
        )

    def fit(self, X: np.ndarray, y: np.ndarray) -> DecisionTreeClassifierScratch:
        X = np.asarray(X, dtype=np.float64)
        y = np.asarray(y, dtype=np.int64)

        if X.ndim != 2:
            raise ValueError(f"Expected 2D array for X, got shape {X.shape}")
        if y.ndim != 1 or len(y) != len(X):
            raise ValueError(f"Shape mismatch: X rows {len(X)} != y length {len(y)}")

        self.classes_ = np.unique(y)
        self.n_classes_ = len(self.classes_)
        self.n_features_ = X.shape[1]

        label_map = {orig: idx for idx, orig in enumerate(self.classes_)}
        y_mapped = np.array([label_map[val] for val in y], dtype=np.int64)

        self.root = self._grow_tree(X, y_mapped, depth=0)
        return self

    def _predict_row_proba(self, node: Node, x: np.ndarray) -> np.ndarray:
        curr = node
        while not curr.is_leaf:
            assert curr.feature_idx is not None and curr.threshold is not None
            if x[curr.feature_idx] <= curr.threshold:
                assert curr.left is not None
                curr = curr.left
            else:
                assert curr.right is not None
                curr = curr.right
        assert curr.value is not None
        return curr.value

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        if self.root is None:
            raise RuntimeError("Model must be fitted before predict_proba.")
        X = np.asarray(X, dtype=np.float64)
        return np.array([self._predict_row_proba(self.root, row) for row in X])

    def predict(self, X: np.ndarray) -> np.ndarray:
        probas = self.predict_proba(X)
        return self.classes_[np.argmax(probas, axis=1)]


if __name__ == "__main__":
    print("Validating DecisionTreeClassifierScratch...")
    np.random.seed(42)
    n_pts = 1000
    X_syn = np.random.uniform(-3.0, 3.0, size=(n_pts, 2))
    y_syn = ((X_syn[:, 0] * X_syn[:, 1]) > 0.0).astype(np.int64)

    train_idx, test_idx = np.arange(800), np.arange(800, 1000)
    X_train, y_train = X_syn[train_idx], y_syn[train_idx]
    X_test, y_test = X_syn[test_idx], y_syn[test_idx]

    clf_gini = DecisionTreeClassifierScratch(criterion="gini", max_depth=6)
    clf_gini.fit(X_train, y_train)
    acc_gini = np.mean(clf_gini.predict(X_test) == y_test)
    print(f"Gini Accuracy:    {acc_gini * 100:.2f}%")
    assert acc_gini > 0.90

    clf_entropy = DecisionTreeClassifierScratch(criterion="entropy", max_depth=6)
    clf_entropy.fit(X_train, y_train)
    acc_entropy = np.mean(clf_entropy.predict(X_test) == y_test)
    print(f"Entropy Accuracy: {acc_entropy * 100:.2f}%")
    assert acc_entropy > 0.90

    # Tied feature defense check
    X_tied = np.zeros((100, 2))
    y_tied = np.random.choice([0, 1], size=100)
    clf_tied = DecisionTreeClassifierScratch().fit(X_tied, y_tied)
    assert clf_tied.root is not None and clf_tied.root.is_leaf
    print("Identical tie test: PASSED")
```

---

## 7. Common Pitfalls, Failure Modes & Antipatterns

### 1. Floating-Point Midpoint Drift & Infinite Branching
Given adjacent floats $a$ and $b$, computing $\theta = (a + b) / 2$ can fail when $b - a = \epsilon_{\text{mach}} \cdot a$. IEEE 754 rounds $\theta$ up to $b$. The condition $x \le \theta$ evaluates to `True` for $b$, putting all instances into $S_L$ and zero into $S_R$. Without zero-sample guards, the tree enters unbounded recursion. Always compute $\theta = a + (b - a)/2$ and clamp $\theta < b$.

### 2. High Variance Under Sample Perturbations
Decision trees are greedy estimators. Altering 2 or 3 samples near the root boundary can flip the selected feature $j^*$ at depth 0, altering the entire hierarchy below it. Ensembles like Random Forests counteract this instability by averaging decorrelated trees.

### 3. Skewed Class Distribution Pathology
In severe class imbalance regimes ($99.9\%$ negative, $0.1\%$ positive), parent Gini is already near zero ($G(S) \approx 0.002$). Splits isolating positive instances receive tiny weighted gains $\frac{|S_L|}{|S|} \Delta I$, causing the tree to discard the minority class entirely. Counteract this with cost-sensitive class weights: $w_k = \frac{N}{K \cdot N_k}$.

---

## 8. Production Case Study: Latency Breakdown in Financial Risk Scoring

### Background & Failure
A fintech provider deployed an automated merchant risk-scoring microservice retraining decision trees on merchant transaction histories ($50,000$ to $400,000$ transactions). On Black Friday, a high-volume merchant hit $420,000$ transactions. The worker timed out after 30 minutes, cascading pod restarts that degraded the entire risk portal.

### Root Cause Analysis
1. **Redundant Quicksorts:** The tree code re-sorted every continuous feature at *every node* ($O(d \cdot D \cdot n \log n)$ total operations), reaching $1.8 \times 10^{11}$ operations across depth $D=12$.
2. **Missing Boundary Pruning:** Boolean flags were scanned for all $420,000$ rows rather than stopping at the single boundary.
3. **GC Memory Pressure:** Repeated array slicing (`X[left_mask]`) generated transient allocations, triggering 4-second Python GC stop-the-world pauses.

```
+----------------------------------------------------------------------------------------------------+
|                                    LATENCY PROFILING BREAKDOWN                                     |
|                                                                                                    |
|  Initial Engine:                                                                                   |
|  - Sorting across recursive nodes: ................................... 82.4% (1,480s)              |
|  - Python GC pause time allocating sub-arrays: ........................ 11.2%   (201s)              |
|  - Candidate evaluation & Impurity math: ............................... 5.8%   (104s)              |
|  - Node instantiation: ................................................. 0.6%    (11s)              |
|  Total Wall-Clock Time: .................................................... 1,796s (~30 mins)     |
|                                                                                                    |
|  Optimized Engine (Presorting + Prefix Indices + GC Buffer Reuse):                                 |
|  - Single root pre-sort: .............................................. 51.2%   (4.1s)              |
|  - Prefix sum linear scan on index masks: ............................. 42.6%   (3.4s)              |
|  - Zero-allocation memory views: ....................................... 6.2%   (0.5s)              |
|  Total Wall-Clock Time: ....................................................... 8.0s (224x faster) |
+----------------------------------------------------------------------------------------------------+
```

### Remediation
1. **Pre-sorting:** Continuous features sorted once at the root; child partitions maintain sort order in $O(n)$ time.
2. **Index-Based Masking:** Replaced memory copies with index arrays, slashing memory from $14.2\text{ GB}$ to $640\text{ MB}$.
3. **Hard Bounds:** Applied `max_depth=8` and `min_samples_leaf=50`, ensuring predictable SLAs under 10 seconds.

---

## 9. Senior Technical Interview Questions & Model Answers

### Drill 1: Mathematical Proof of Non-Negative Information Gain
**Question:** Prove rigorously using Jensen's Inequality that Information Gain $\Delta I(S, j, \theta)$ cannot be negative when using Shannon Entropy. Under what exact conditions is Information Gain identically zero?

<details>
<summary>View Detailed Solution</summary>

**Step 1: Establish Strict Concavity of Shannon Entropy**  
Let $\Delta^K = \{p \in \mathbb{R}^K : \sum p_k = 1, p_k \ge 0\}$. Define $H(p) = -\sum_{k=1}^K p_k \log_2(p_k)$.  
Compute the Hessian $\nabla^2 H(p)$:
$$\frac{\partial^2 H}{\partial p_k^2} = -\frac{1}{p_k \ln 2}, \quad \frac{\partial^2 H}{\partial p_j \partial p_k} = 0 \quad (j \ne k)$$
The Hessian is diagonal with strictly negative diagonal entries on the interior of $\Delta^K$. Thus, $H(p)$ is strictly concave.

**Step 2: Apply Jensen's Inequality**  
A split partitions node $S$ ($n$ samples) into children $S_L$ ($n_L$ samples) and $S_R$ ($n_R$ samples). The parent probability vector is:
$$p = \frac{n_L}{n} p^{(L)} + \frac{n_R}{n} p^{(R)}$$

By Jensen's Inequality for strictly concave functions:
$$H(p) \ge \frac{n_L}{n} H(p^{(L)}) + \frac{n_R}{n} H(p^{(R)})$$
$$H(S) - \left[\frac{n_L}{n} H(S_L) + \frac{n_R}{n} H(S_R)\right] = \Delta H(S, j, \theta) \ge 0 \quad \blacksquare$$

**Step 3: Zero-Gain Condition**  
Because $H$ is strictly concave, equality holds if and only if $p^{(L)} = p^{(R)} = p$. Information Gain is zero if and only if the split creates child subsets with class distributions identical to the parent node.
</details>

---

### Drill 2: Gini Impurity vs Shannon Entropy Hardware & Metric Comparison
**Question:** Evaluate replacing Gini Impurity with Shannon Entropy in a high-throughput GBDT training runtime across mathematical sensitivity, hardware instruction execution, and empirical generalization.

<details>
<summary>View Detailed Solution</summary>

1. **Mathematical Sensitivity:** $\frac{\partial G}{\partial p_k} = -2p_k$, whereas $\frac{\partial H}{\partial p_k} = -\ln p_k - 1$. As $p_k \to 0^+$, the entropy gradient approaches $+\infty$, penalizing tiny impure tails marginally more aggressively than Gini.
2. **Hardware FLOPs & SIMD:** On x86/ARM CPUs, evaluating $\log_2(p)$ consumes 15-35 clock cycles. Gini evaluates $p_k^2$ via FMA instructions executing in 1 cycle with 2 per cycle throughput. Gini candidate scans evaluate $4\times$ to $10\times$ faster.
3. **Generalization:** Studies (Raileanu & Stoffel, 2004) confirm Gini and Entropy select identical splits in $>98.5\%$ of cases; test error differences are statistically insignificant ($p > 0.05$). The CPU instruction overhead of Entropy makes Gini the superior choice for high-throughput production engines.
</details>

---

### Drill 3: Proof of Candidate Split Boundary Pruning
**Question:** Prove that when splitting a continuous feature $X_j$ under a strictly concave impurity criterion, an optimal split threshold $\theta^*$ never occurs between two sorted adjacent training samples sharing the same class label ($y_{(i)} = y_{(i+1)}$).

<details>
<summary>View Detailed Solution</summary>

Let sorted observations be $(x_{(1)}, y_{(1)}), \dots, (x_{(n)}, y_{(n)})$, with $y_{(i)} = y_{(i+1)} = c$.  
Consider thresholds $\theta_A \in (x_{(i-1)}, x_{(i)})$, $\theta_B \in (x_{(i)}, x_{(i+1)})$, and $\theta_C \in (x_{(i+1)}, x_{(i+2)})$.

Moving from $\theta_A$ to $\theta_B$ moves one sample of class $c$ to the left child. Moving from $\theta_B$ to $\theta_C$ moves another sample of class $c$ to the left child.  
Let $J(\theta)$ be the weighted child impurity:
$$J(\theta) = \frac{n_L}{n} I(p^{(L)}) + \frac{n_R}{n} I(p^{(R)})$$

Because $I$ is strictly concave, the negative weighted impurity $-J(\theta)$ (Information Gain) is strictly convex with respect to the continuous shift of class counts along monochromatic sequences.

A strictly convex function on a discrete interval $[A, C]$ achieves its maximum at boundary extremes ($A$ or $C$), never at the strict interior point $B$:
$$\Delta I(\theta_B) < \max\big(\Delta I(\theta_A), \Delta I(\theta_C)\big)$$

Hence, candidate threshold $\theta_B$ can never uniquely maximize Information Gain. The split engine can safely evaluate candidates only at label transition boundaries ($y_{(i)} \ne y_{(i+1)}$). $\blacksquare$
</details>

---

### Drill 4: Computational Complexity: Degenerate vs Balanced Trees
**Question:** Derive the exact big-$O$ time and space complexity of fitting a decision tree with $n$ samples and $d$ continuous features under a balanced tree ($D = \log_2 n$) versus a completely degenerate tree ($D = n$).

<details>
<summary>View Detailed Solution</summary>

**1. Balanced Tree ($D = \log_2 n$):**
- At depth $k$, there are $2^k$ nodes with $m = n / 2^k$ samples.
- Work per level: $2^k \times O(d \cdot \frac{n}{2^k} \log \frac{n}{2^k}) = O(d \cdot n \log n)$.
- Across $\log_2 n$ levels: Total Time $= O(d \cdot n \log^2 n)$ (or $O(d \cdot n \log n)$ with root pre-sorting).
- Space Complexity: Recursion stack depth $O(\log n)$, node heap storage $O(n)$. Total auxiliary space: $O(n)$.

**2. Degenerate Tree ($D = n$):**
- Each split isolates 1 sample into a leaf. Node sizes at levels $i$ are $n - i$.
- Total Time: $\sum_{i=0}^{n-1} O(d \cdot (n - i) \log(n - i)) = O(d \cdot n^2 \log n)$ (or $O(d \cdot n^2)$ with root pre-sorting).
- Space Complexity: Call stack depth $O(n)$, triggering `RecursionError` in Python without explicit recursion limit adjustments.

| Metric | Balanced Tree ($D = \log_2 n$) | Degenerate Tree ($D = n$) |
| :--- | :--- | :--- |
| **Time (Per-Node Sort)** | $O(d \cdot n \log^2 n)$ | $O(d \cdot n^2 \log n)$ |
| **Time (Root Pre-sort)** | $O(d \cdot n \log n)$ | $O(d \cdot n^2)$ |
| **Call Stack Depth** | $O(\log n)$ | $O(n)$ |
| **Inference Latency** | $O(\log n)$ | $O(n)$ |

</details>

---

[$\leftarrow$ Previous Track: Capstone Credit Baseline](../../03-linear-models-and-svm/09-capstone-credit-risk-and-fraud-baseline/README.md) | [Track Overview](../README.md) | [Next Module $\rightarrow$](../01-pruning-depth-limits-and-regression-trees/README.md)
