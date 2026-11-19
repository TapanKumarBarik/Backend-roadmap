# Heavy Ranking, Calibration, and Feature Crossing: DLRM and MMoE

This module is part of [Track 08: Recommender Systems & Ranking](../README.md).

---

## 1. Executive Overview & Industry Context

While Stage 1 (Candidate Retrieval) isolates the top $K \approx 1,000$ candidates from a catalog of millions using separable bilinear inner products, **Stage 2 (Heavy Ranking)** scores and sorts these candidates with maximum predictive fidelity.

In heavy ranking, the strict separability constraint of Two-Tower retrieval is abandoned. The ranker operates on a combined representation of user attributes, item attributes, real-time query context, and explicit high-order **feature interactions** (e.g., `user_gender x item_category`, `device_os x video_resolution`, `user_historical_ctr x item_price_bracket`).

To achieve state-of-the-art accuracy at scale, industrial tech giants converged on specialized deep learning ranking architectures:
1. **Wide & Deep Learning** (Google, Cheng et al. 2016): Balancing memorization of historical correlation with generalization of unseen combinations.
2. **Deep Learning Recommendation Model (DLRM)** (Meta, Naumov et al. 2019): Exploiting high-cardinality sparse embedding tables, dense numerical bottom MLPs, and explicit pairwise dot-product feature interaction layers.
3. **Deep & Cross Network (DCN / DCN-v2)** (Google, Wang et al. 2021): Learning explicit polynomial feature crosses of bounded degree without manual combinatorial engineering.
4. **Multi-gate Mixture-of-Experts (MMoE)** (Google, Ma et al. 2018): Resolving task conflicts in multi-objective ranking (e.g., simultaneously predicting Click-Through Rate $P(\text{Click})$ and Conversion Rate $P(\text{Purchase})$).

In this module, we derive the mathematical mechanics of DLRM, DCN-v2, and MMoE, examine calibration techniques, implement a complete production-grade DLRM model from scratch in PyTorch, and analyze an incident where a single-task CTR model caused a \$2.1M advertising budget collapse.

---

## 2. Mathematical Formulations & Architectural Derivations

### 2.1 The Deep Learning Recommendation Model (DLRM)

Meta's DLRM architecture processes heterogeneous tabular recommendation data by separating continuous dense features from categorical sparse IDs, explicitly interacting them before final classification.

```
       Dense Numerical Features                Sparse Categorical Features
          x_dense in R^D_dense                   [user_id, item_id, category, tag]
                   |                                       |
                   v                                       v
        +---------------------+               +-------------------------+
        |     Bottom MLP      |               | Multi-Table Embeddings  |
        |  Projection to R^d  |               |  S tables -> E_i in R^d |
        +---------------------+               +-------------------------+
                   |                                       |
                   +-------------------+-------------------+
                                       |
                                       v
                    +------------------------------------+
                    | Explicit Dot-Product Interactions: |
                    |      Pairwise <v_i, v_j> for all   |
                    |         (S + 1) representations    |
                    +------------------------------------+
                                       |
                                       v
                    +------------------------------------+
                    |             Top MLP                |
                    | Concatenate: [v_dense || Flat(Int)]|
                    +------------------------------------+
                                       |
                                       v
                    +------------------------------------+
                    | Calibrated Prediction: pCTR / pCVR |
                    +------------------------------------+
```

#### 1. Dense Processing (Bottom MLP)
Dense continuous features $\mathbf{x}_{\text{dense}} \in \mathbb{R}^{D_{\text{dense}}}$ are projected through a multi-layer perceptron to match embedding dimension $d$:

$$\mathbf{v}_0 = \text{MLP}_{\text{bottom}}\left(\mathbf{x}_{\text{dense}}\right) \in \mathbb{R}^d$$

#### 2. Sparse Processing (Embedding Tables)
Given $S$ categorical features where feature $i$ has cardinality $C_i$, the system maintains $S$ embedding lookup tables:

$$E_i \in \mathbb{R}^{C_i \times d}, \quad \mathbf{v}_i = \text{Lookup}(E_i, \text{id}_i) \in \mathbb{R}^d, \quad \forall i \in \{1, 2, \dots, S\}$$

#### 3. Explicit Dot-Product Interaction Layer
DLRM stacks the processed dense vector and all $S$ sparse embeddings into a combined matrix $V \in \mathbb{R}^{(S + 1) \times d}$:

$$V = \begin{bmatrix} \mathbf{v}_0^T \\ \mathbf{v}_1^T \\ \vdots \\ \mathbf{v}_S^T \end{bmatrix}$$

The interaction layer computes the complete matrix of pairwise dot products:

$$I = V V^T \in \mathbb{R}^{(S + 1) \times (S + 1)}$$

where entry $I_{jk} = \langle \mathbf{v}_j, \mathbf{v}_k \rangle$.
Because $I$ is symmetric ($I_{jk} = I_{kj}$) and diagonal elements $I_{jj} = \|\mathbf{v}_j\|_2^2$ provide no relational signal, DLRM extracts only the strictly lower (or upper) triangular elements:

$$\text{Interactions} = \text{vech}_{\text{lower}}(I) \in \mathbb{R}^{\frac{S(S + 1)}{2}}$$

#### 4. Top MLP & Output Logit
The interaction vector is concatenated with the original dense representation $\mathbf{v}_0$ and fed into the Top MLP:

$$\mathbf{z}_{\text{top}} = \left[ \mathbf{v}_0 \,\|\, \text{vech}_{\text{lower}}(I) \right]$$

$$\hat{y} = \sigma\left(\text{MLP}_{\text{top}}(\mathbf{z}_{\text{top}})\right)$$

The model is trained via binary cross-entropy loss:

$$\mathcal{L} = -\sum_{k} \left[ y_k \ln \hat{y}_k + (1 - y_k) \ln(1 - \hat{y}_k) \right]$$

---

### 2.2 Wide & Deep Learning

Pioneered by Cheng et al. (Google 2016), **Wide & Deep Learning** addresses the fundamental tension in recommender systems between **memorization** and **generalization**:
* **Memorization (Wide Component)**: Capturing historical correlation and specific rule patterns directly from data (e.g., *"User installed Netflix and query is 'streaming app'"*).
* **Generalization (Deep Component)**: Exploring new, unseen feature combinations via low-dimensional dense embeddings (e.g., recommending Hulu or Disney+ based on continuous topic proximity).

```
                      Input Features: Categorical & Continuous
                                         |
                +------------------------+------------------------+
                |                                                 |
                v                                                 v
         [Wide Component]                                  [Deep Component]
     Cross-Product Transform                            Dense Embedding Tables
    phi_k(x) = Prod x_j^{c_kj}                          E_i in R^{C_i x d}
                |                                                 |
                |                                                 v
                |                                          Feed-Forward MLP
                |                                          ReLU Layers (L)
                \                                                 /
                 \                                               /
                  v                                             v
         +---------------------------------------------------------------+
         |     Joint Prediction: P(Y=1|x) = sigma(w^T [x, phi(x)] +      |
         |                                  w_{deep}^T a^{(L)} + b)      |
         +---------------------------------------------------------------+
```

#### Mathematical Formulation
The wide component evaluates a generalized linear model over raw and cross-product transformed features:

$$y_{\text{wide}} = \mathbf{w}_{\text{wide}}^T \mathbf{\phi}(\mathbf{x}) + b_{\text{wide}}$$

where $\mathbf{\phi}_k(\mathbf{x}) = \prod_{j=1}^d x_j^{c_{kj}}$ represents cross-product transformations ($c_{kj} \in \{0, 1\}$).

The deep component passes categorical IDs through embedding tables followed by $L$ hidden layers:

$$\mathbf{a}^{(l+1)} = \text{ReLU}\left(W^{(l)} \mathbf{a}^{(l)} + \mathbf{b}^{(l)}\right), \quad \mathbf{a}^{(0)} = [\mathbf{e}_1 \,\|\, \mathbf{e}_2 \,\|\, \dots \,\|\, \mathbf{e}_S \,\|\, \mathbf{x}_{\text{dense}}]$$

The joint prediction combines both components through a unified sigmoid link function:

$$P(Y = 1 \mid \mathbf{x}) = \sigma\left(\mathbf{w}_{\text{wide}}^T [\mathbf{x} \,\|\, \mathbf{\phi}(\mathbf{x})] + \mathbf{w}_{\text{deep}}^T \mathbf{a}^{(L)} + b\right)$$

Wide & Deep trains both paths simultaneously via backpropagation, allowing the wide path to remember high-precision niche exceptions while the deep path generalizes across the long tail.

---

### 2.3 Deep & Cross Network (DCN-v2)

While DLRM evaluates degree-2 pairwise dot products, DCN-v2 (Wang et al. 2021) generates explicit polynomial crosses up to degree $L$ with linear time and memory complexity.

#### Matrix-Vector Formulation of Cross Layers
Let $\mathbf{x}_0 \in \mathbb{R}^{D}$ be the concatenated input features (dense features concatenated with all sparse embeddings). A cross layer $l \in \{0, 1, \dots, L-1\}$ computes:

$$\mathbf{x}_{l+1} = \mathbf{x}_0 \odot \left(W_l \mathbf{x}_l + \mathbf{b}_l\right) + \mathbf{x}_l$$

where:
* $\odot$ denotes element-wise Hadamard product.
* $W_l \in \mathbb{R}^{D \times D}$ is a weight matrix.
* The residual connection $+\mathbf{x}_l$ facilitates gradient propagation across deep networks.

```
                  Input Vector x_0 in R^D
                      |              \
                      |               \
                      v                v
                 Linear Map         Hadamard
                 W_l * x_l + b_l ---> Product: x_0 (x) (W_l * x_l + b_l)
                                       |
                                       v
                                    + Add Residual x_l
                                       |
                                       v
                                Output Vector x_{l+1}
```

#### Low-Rank Matrix Factorization Trick
In production, $D$ can exceed $1,000$. A full $D \times D$ matrix would require $10^6$ parameters per layer. DCN-v2 factors $W_l$ into two low-rank matrices $U_l, V_l \in \mathbb{R}^{D \times r}$, where $r \ll D$:

$$W_l = U_l V_l^T$$

The cross operation becomes:

$$\mathbf{x}_{l+1} = \mathbf{x}_0 \odot \left(U_l \left(V_l^T \mathbf{x}_l\right) + \mathbf{b}_l\right) + \mathbf{x}_l$$

This reduces parameter complexity from $\mathcal{O}(D^2)$ to $\mathcal{O}(2 D r)$ and FLOPs from $\mathcal{O}(D^2)$ to $\mathcal{O}(D r)$.

---

### 2.3 Multi-Gate Mixture-of-Experts (MMoE)

Production rankers must optimize multiple conflicting objectives simultaneously:
* **CTR (Click-Through Rate)**: Immediate user engagement.
* **CVR (Conversion Rate)**: Downstream purchase / completion.
* **Dwell Time**: Content consumption depth.

A naive single-head model trained on CTR optimizes for clickbait, while hard-parameter sharing across multiple tasks degrades accuracy when tasks are negatively correlated.

```
                               Shared Input Representations x
                                              |
                +-----------------------------+-----------------------------+
                |                             |                             |
                v                             v                             v
        +---------------+             +---------------+             +---------------+
        | Expert Net 1  |             | Expert Net 2  |             | Expert Net E  |
        |  f_1(x)       |             |  f_2(x)       |             |  f_E(x)       |
        +---------------+             +---------------+             +---------------+
                \                             |                             /
                 \                            |                            /
                  v                           v                           v
              +---------------------------------------------------------------+
              |                 Task-Specific Softmax Gating                  |
              +---------------------------------------------------------------+
                     /                                                 \
                    v                                                   v
        +-----------------------+                           +-----------------------+
        | Gate 1: g^CTR(x)      |                           | Gate 2: g^CVR(x)      |
        +-----------------------+                           +-----------------------+
                    |                                                   |
                    v                                                   v
          Top Tower 1 (pCTR)                                  Top Tower 2 (pCVR)
```

#### Mathematical Formulation
Let there be $E$ shared expert networks $\{f_1, f_2, \dots, f_E\}$ where $f_i: \mathbb{R}^D \to \mathbb{R}^{d_e}$.
For each task $k \in \{1, 2, \dots, K\}$, MMoE introduces a distinct softmax gating network $g^k: \mathbb{R}^D \to \mathbb{R}^E$:

$$g^k(\mathbf{x}) = \text{Softmax}\left(W_g^k \mathbf{x}\right)$$

where $W_g^k \in \mathbb{R}^{E \times D}$.
The composite representation for task $k$ is a linear combination of all expert outputs weighted by gate probabilities:

$$\mathbf{h}^k(\mathbf{x}) = \sum_{i=1}^E g_i^k(\mathbf{x}) \cdot f_i(\mathbf{x})$$

The task-specific tower $h_{\text{tower}}^k$ then predicts the task label:

$$\hat{y}^k = \sigma\left(h_{\text{tower}}^k\left(\mathbf{h}^k(\mathbf{x})\right)\right)$$

MMoE allows different tasks to dynamically assign different importance weights to each expert. If Task 1 (CTR) and Task 2 (CVR) diverge, Gate 1 can route $90\%$ of its weight to Expert 1, while Gate 2 routes $90\%$ to Expert 3, eliminating negative transfer.

---

### 2.4 Probability Calibration: Platt Scaling & Isotonic Regression

Neural network outputs optimized with log-loss are often **uncalibrated**: a predicted probability $\hat{y} = 0.80$ might only correspond to a true empirical event rate of $0.55$. 

In ad bidding and e-commerce, uncalibrated probabilities cause direct financial damage: Expected Value is computed as $\text{eCPM} = \hat{p}_{\text{CTR}} \times \text{Bid}$. If $\hat{p}_{\text{CTR}}$ is uncalibrated, advertisers overpay or underbid.

#### 1. Platt Scaling (Sigmoidal Calibration)
Fits a univariate logistic regression on uncalibrated logits $z_i$:

$$P(y_i = 1 \mid z_i) = \frac{1}{1 + \exp\left(A \cdot z_i + B\right)}$$

where parameters $A, B \in \mathbb{R}$ are optimized via maximum likelihood on a holdout calibration dataset.

#### 2. Isotonic Regression
Fits a non-parametric, piece-wise constant non-decreasing step function:

$$\min_{\hat{m}} \sum_{i=1}^N \left(y_i - \hat{m}(s_i)\right)^2 \quad \text{subject to } \hat{m}(s_i) \le \hat{m}(s_j) \text{ whenever } s_i \le s_j$$

Solved in $\mathcal{O}(N)$ using the Pool Adjacent Violators Algorithm (PAVA).

---

## 3. Production Implementation: DLRM from Scratch in PyTorch

The following complete, runnable Python module implements the complete **Deep Learning Recommendation Model (DLRM)** architecture in PyTorch, including:
1. Dynamic multi-table categorical embedding lookups.
2. Bottom MLP numerical feature projection.
3. Explicit triangular pairwise dot-product feature interaction layer.
4. Top MLP scoring classification.

```python
"""
dlrm_ranking.py
Production-grade PyTorch implementation of Meta's DLRM architecture.
Includes multi-embedding tables, bottom MLP, explicit feature interaction, and top MLP.
"""

from __future__ import annotations
import math
import time
from typing import Dict, List, Tuple
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


# ============================================================================
# DLRM Model Architecture
# ============================================================================

class DLRM(nn.Module):
    """
    Deep Learning Recommendation Model (Naumov et al. 2019).
    Combines dense bottom MLP, multi-table sparse categorical embeddings,
    explicit dot-product feature crossing, and top MLP scoring.
    """
    def __init__(
        self,
        embedding_sizes: List[int],     # Cardinality of each sparse categorical table
        embedding_dim: int,             # Latent factor dimension d
        dense_in_features: int,         # Number of continuous numerical features
        bottom_mlp_dims: List[int],     # Layer dimensions for bottom MLP
        top_mlp_dims: List[int],        # Layer dimensions for top MLP
    ):
        super().__init__()
        self.embedding_dim = embedding_dim
        self.num_sparse = len(embedding_sizes)

        # 1. Sparse Embedding Tables
        self.embeddings = nn.ModuleList([
            nn.Embedding(cardinality, embedding_dim)
            for cardinality in embedding_sizes
        ])
        # Initialize embeddings with normal distribution scaled by 1 / sqrt(cardinality)
        for i, emb in enumerate(self.embeddings):
            nn.init.normal_(emb.weight, mean=0.0, std=1.0 / math.sqrt(embedding_sizes[i]))

        # 2. Bottom MLP for continuous numerical features
        bottom_layers: List[nn.Module] = []
        in_dim = dense_in_features
        for out_dim in bottom_mlp_dims:
            bottom_layers.append(nn.Linear(in_dim, out_dim))
            bottom_layers.append(nn.ReLU())
            in_dim = out_dim
        # Final projection must match embedding_dim
        bottom_layers.append(nn.Linear(in_dim, embedding_dim))
        bottom_layers.append(nn.ReLU())
        self.bottom_mlp = nn.Sequential(*bottom_layers)

        # 3. Compute explicit dot-product interaction dimensions
        # Total representations = (1 dense vector) + (S sparse vectors) = S + 1
        num_representations = self.num_sparse + 1
        # Number of unique pairs = (S + 1) * S / 2
        num_interactions = (num_representations * (num_representations - 1)) // 2

        # 4. Top MLP: Ingests [v_dense || Flat(Interactions)]
        top_in_features = embedding_dim + num_interactions
        top_layers: List[nn.Module] = []
        curr_dim = top_in_features
        for out_dim in top_mlp_dims:
            top_layers.append(nn.Linear(curr_dim, out_dim))
            top_layers.append(nn.ReLU())
            curr_dim = out_dim
        top_layers.append(nn.Linear(curr_dim, 1))
        self.top_mlp = nn.Sequential(*top_layers)

    def _interact_features(self, dense_v: torch.Tensor, sparse_v: List[torch.Tensor]) -> torch.Tensor:
        """
        Computes pairwise dot-product interactions: <v_i, v_j> for all i < j.
        dense_v: Shape (B, d)
        sparse_v: List of S tensors, each Shape (B, d)
        Output: Shape (B, (S+1)*S/2)
        """
        B, d = dense_v.shape
        # Stack into single 3D tensor: Shape (B, S + 1, d)
        all_features = torch.stack([dense_v] + sparse_v, dim=1)

        # Batch matrix multiplication: (B, S+1, d) x (B, d, S+1) -> (B, S+1, S+1)
        interaction_matrix = torch.bmm(all_features, all_features.transpose(1, 2))

        # Extract strictly lower triangular indices
        tril_indices = torch.tril_indices(row=self.num_sparse + 1, col=self.num_sparse + 1, offset=-1)
        interactions = interaction_matrix[:, tril_indices[0], tril_indices[1]]  # Shape (B, num_interactions)
        return interactions

    def forward(self, dense_x: torch.Tensor, sparse_x: torch.Tensor) -> torch.Tensor:
        """
        dense_x: Continuous features, Shape (B, dense_in_features)
        sparse_x: Categorical IDs, Shape (B, num_sparse)
        """
        # 1. Project dense numerical features
        v_dense = self.bottom_mlp(dense_x)  # Shape (B, d)

        # 2. Embedding lookups
        v_sparse = [
            self.embeddings[i](sparse_x[:, i])
            for i in range(self.num_sparse)
        ]  # S tensors of shape (B, d)

        # 3. Explicit dot-product interactions
        interactions = self._interact_features(v_dense, v_sparse)  # Shape (B, num_interactions)

        # 4. Top MLP
        combined = torch.cat([v_dense, interactions], dim=1)  # Shape (B, d + num_interactions)
        logits = self.top_mlp(combined).squeeze(-1)            # Shape (B,)
        return torch.sigmoid(logits)


# ============================================================================
# Verification & Self-Test Routine
# ============================================================================

if __name__ == "__main__":
    np.random.seed(42)
    torch.manual_seed(42)

    BATCH_SIZE = 16
    EMB_DIM = 8
    NUM_DENSE = 5
    SPARSE_CARDINALITIES = [1000, 500, 200, 50]  # 4 categorical features

    print("Initializing DLRM PyTorch Model...")
    model = DLRM(
        embedding_sizes=SPARSE_CARDINALITIES,
        embedding_dim=EMB_DIM,
        dense_in_features=NUM_DENSE,
        bottom_mlp_dims=[32, 16],
        top_mlp_dims=[64, 32],
    )

    # Synthetic Batch Inputs
    dense_features = torch.randn(BATCH_SIZE, NUM_DENSE, dtype=torch.float32)
    sparse_ids = torch.stack([
        torch.randint(0, card, (BATCH_SIZE,))
        for card in SPARSE_CARDINALITIES
    ], dim=1)
    ground_truth_labels = torch.randint(0, 2, (BATCH_SIZE,), dtype=torch.float32)

    # Forward Pass
    print("\nRunning Forward Pass on Batch of Size", BATCH_SIZE)
    t0 = time.perf_counter()
    predicted_probs = model(dense_features, sparse_ids)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    print(f"Forward Pass Completed in {elapsed_ms:.2f}ms.")
    print("Predicted Probabilities (pCTR):")
    for idx, prob in enumerate(predicted_probs[:5].tolist()):
        print(f"  Sample {idx}: {prob:.4f} (True Label: {int(ground_truth_labels[idx])})")

    # Training Step
    criterion = nn.BCELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)

    loss = criterion(predicted_probs, ground_truth_labels)
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()

    print(f"\nBackward Step Successful! Computed Loss: {loss.item():.4f}")
```

---

## 4. Failure Modes, Edge Cases & Antipatterns

### 4.1 Embedding Table OOM on GPU During Training
* **Symptom**: Model training crashes instantly with `CUDA out of memory` during table allocation.
* **Failure Mechanism**: Storing high-cardinality embedding tables (e.g., $50\text{ million}$ user IDs $\times 128$ dimensions $\times 4\text{ bytes} \approx 25.6\text{ GB}$) entirely on high-bandwidth GPU memory (HBM). Stacking multiple tables exceeds 80GB HBM limits.
* **Mitigation**: Utilize **Hybrid Model Parallelism** (TorchRec / DeepRec). Shard embedding tables across host CPU system RAM or distributed NVMe memory using pipelined asynchronous pre-fetching, while keeping compute-intensive Bottom/Top MLPs and dot-product interaction layers on GPUs.

### 4.2 The "Misaligned Objective" CTR-CVR Dilemma
* **Symptom**: Optimizing a single-task CTR ranker boosts clicks by $+8\%$, but company gross revenue drops by $-25\%$.
* **Failure Mechanism**: High-clickbait, low-quality products (e.g., \$1 gimmick toys, misleading viral news) generate high click rates ($P(\text{Click}) = 0.30$) but have near-zero purchase conversion ($P(\text{CVR}) = 0.001$). High-ticket electronics generate moderate click rates ($P(\text{Click}) = 0.05$) but high conversion ($P(\text{CVR}) = 0.40$). A single-task CTR ranker monopolizes all slots with clickbait.
* **Mitigation**: Deploy **Multi-gate Mixture-of-Experts (MMoE)**. Score candidates by expected commercial utility:

$$\text{FinalScore} = \hat{p}_{\text{CTR}}^\alpha \times \hat{p}_{\text{CVR}}^\beta \times \text{Price}$$

### 4.3 Logit Drift & Calibration Desynchronization
* **Symptom**: The model's predicted CTR average is $0.08$, but the platform's observed CTR drops to $0.02$ following an interface redesign that moved the recommendation carousel below the fold.
* **Failure Mechanism**: The heavy ranker predicts unconditioned $P(\text{Click})$. When UI position change reduces user attention, the model's calibration breaks down, causing severe overbidding in ad auctions.
* **Mitigation**: Retrain calibration layers (Platt Scaling or Isotonic Regression) dynamically on streaming hourly sliding windows, and condition the ranker explicitly on position features during training.

---

## 5. Real-World Production Incident Post-Mortem

### Case Study: \$2.1M Advertising Budget Collapse via Single-Task CTR Model Optimization

#### 1. Executive Summary
A major ad network migrated its real-time sponsored product ranker from an established multi-task model to a unified high-capacity DLRM network trained exclusively on Click-Through Rate (CTR). Within 48 hours of 100% deployment, merchant advertisers experienced an acute crisis: **cost-per-acquisition (CPA) jumped by $340\%$**, while total completed merchant transactions plummeted by **$62\%$**. 

Frustrated enterprise advertisers paused campaigns, draining **\$2.1M in ad platform spend** within 4 days. The post-mortem revealed that the new model systematically promoted scam products with hyper-attractive imagery that generated massive click volume but zero checkouts.

#### 2. Incident Timeline
| Time (UTC) | Incident Milestone |
| :--- | :--- |
| **Day -2** | Single-task DLRM CTR model passed offline evaluation with $+0.018$ LogLoss gain. |
| **Day 0** | Production traffic cutover to single-task DLRM. |
| **Day 1** | Immediate telemetry: overall ad clicks increased by $+14.2\%$ (team celebrated). |
| **Day 2** | Merchant support desk overwhelmed: "We are being billed thousands for clicks, but checkout completions are zero." |
| **Day 3** | Automated advertiser budget protection algorithms tripped, freezing ad spend across 450 major accounts. |
| **Day 4** | Executive escalation: Emergency bridge convened; root cause verified; rollback to legacy multi-task ranker completed. |
| **Day 5** | Ad network issued \$1.8M in merchant billing credits; CPA metrics normalized. |

#### 3. Root Cause Analysis (RCA)
The failure stemmed from an invalid objective formulation in the auction scoring function:

```python
# DEFECTIVE PRODUCTION BID FORMULATION:
# eCPM = Bid_Value * Predicted_CTR
eCPM = item.bid_price * dlrm_model.predict_ctr(user, item)
```

1. **Exploitation of Click Arbitrage**: Advertisers selling fraudulent mystery boxes and low-quality knockoffs bid moderately (\$0.50/click), but their sensationalist creative assets generated an unnatural predicted CTR of $18\%$ (vs. legitimate merchant CTR of $2\%$).
2. **eCPM Distortion**: The fraudulent listings achieved an estimated CPM of:
   $$\text{eCPM}_{\text{spam}} = \$0.50 \times 0.18 \times 1000 = \$90.00$$
   while verified high-margin electronics achieved:
   $$\text{eCPM}_{\text{legit}} = \$2.00 \times 0.02 \times 1000 = \$40.00$$
   The single-task ranker allocated $100\%$ of top ad slots to spam listings. Users clicked out of curiosity, realized the products were fraudulent, and bounced immediately without purchasing.

#### 4. Remediation & Architectural Guardrails
1. **Multi-Task MMoE Deployment**: Replaced the single-task DLRM with a **Dual-Head MMoE** simultaneously predicting $\hat{p}_{\text{CTR}}$ and $\hat{p}_{\text{CVR}}$ (Post-Click Purchase).
2. **Conversion-Weighted Auction Formula**:
   $$\text{eCPM} = \text{Bid} \times \hat{p}_{\text{CTR}} \times \left(\hat{p}_{\text{CVR}}\right)^\gamma$$
   Setting $\gamma = 1.0$ guarantees that an item with zero conversion probability receives an eCPM of zero, regardless of how many clicks it attracts.
3. **Automated Bounce Penalization**: Incorporated a negative penalty into the training loss: clicks resulting in page dwell times $< 5\text{ seconds}$ are treated as negative interactions.

---

## 6. Senior Technical Interview Questions & Model Answers

### Question 1: How does DLRM's feature interaction layer differ from the cross layers in Deep & Cross Network (DCN-v2), and what are their respective computational trade-offs?

**Model Answer:**
The architectural difference centers on **interaction order, parameterization, and algebraic form**:

#### 1. DLRM Interaction Layer
* **Mechanics**: DLRM stacks all dense and sparse embeddings into $V \in \mathbb{R}^{(S+1) \times d}$ and calculates the explicit Gramian matrix $I = V V^T$. It extracts strictly the lower triangular elements:
  $$\text{Interactions} = \text{vech}_{\text{lower}}(V V^T)$$
* **Interaction Order**: Strictly **degree-2** pairwise interactions ($\langle \mathbf{v}_i, \mathbf{v}_j \rangle$).
* **Parameters**: **Zero learnable parameters** in the interaction layer itself. Non-linearity and feature weighting are delegated entirely to the subsequent Top MLP.
* **Complexity**: $\mathcal{O}\left(S^2 \cdot d\right)$ FLOPs and $\mathcal{O}\left(S^2\right)$ output dimensions.

#### 2. DCN-v2 Cross Layers
* **Mechanics**: Computes explicit polynomial crosses via recursive rank-factored layers:
  $$\mathbf{x}_{l+1} = \mathbf{x}_0 \odot \left(U_l V_l^T \mathbf{x}_l + \mathbf{b}_l\right) + \mathbf{x}_l$$
* **Interaction Order**: Stacking $L$ layers produces explicit feature crosses up to **degree $L + 1$**.
* **Parameters**: Contains explicit learnable projection matrices $U_l, V_l \in \mathbb{R}^{D \times r}$.
* **Complexity**: $\mathcal{O}(2 D r)$ FLOPs per layer.

**Trade-Off Summary**:
* DLRM is computationally lightweight, interpretable, and heavily optimized on GPUs via custom CUDA kernel tensor contractions (`bmm` + `tril`).
* DCN-v2 learns high-order combinatorial interactions beyond pairs ($x_1 x_2 x_3$) without manual engineering, but requires tuning low-rank projection ranks $r$ and managing extra matrix parameters.

---

### Question 2: Why do production recommendation rankers use Multi-gate Mixture-of-Experts (MMoE) instead of standard hard-parameter shared multi-task networks?

**Model Answer:**
In traditional shared multi-task networks, the bottom layers are shared identically across all tasks:
$$\mathbf{h} = \text{SharedBottom}(x), \quad \hat{y}_{\text{CTR}} = \text{Tower}_1(\mathbf{h}), \quad \hat{y}_{\text{CVR}} = \text{Tower}_2(\mathbf{h})$$

This architecture breaks down under **task conflict / negative transfer**:
1. **Gradient Contradiction**: The loss gradient backpropagating from the CTR tower often points in the direct opposite direction of the gradient from the CVR tower:
   $$\langle \nabla_{\mathbf{h}} \mathcal{L}_{\text{CTR}}, \nabla_{\mathbf{h}} \mathcal{L}_{\text{CVR}} \rangle < 0$$
   For example, clickbait increases CTR while degrading CVR. The shared bottom layers receive destructive interference, destabilizing optimization.
2. **Data Sparsity Asymmetry**: Clicks occur at a rate $10\times - 50\times$ higher than conversions. In a shared network, the dense CTR task completely overwhelms the sparse CVR task, relegating conversion predictions to noisy artifacts.

**The MMoE Solution**:
MMoE decouples the shared representation into $E$ distinct expert networks $\{f_1, \dots, f_E\}$ with task-specific gating networks $g^k(x)$:
$$\mathbf{h}^k(x) = \sum_{i=1}^E g_i^k(x) f_i(x)$$
* If Task A and Task B have complementary features, their gating networks activate the same experts (e.g., Expert 1 and Expert 2).
* If Task A and Task B conflict, Gate A routes input exclusively to Expert 1, while Gate B routes to Expert 3.
* MMoE mathematically isolates conflicting gradient flows, enabling multi-task training without negative transfer while maintaining sublinear parameter scaling compared to completely separate models.

---

### Question 3: Why is probability calibration essential in stage-2 ranking, and how does Platt Scaling differ from Isotonic Regression?

**Model Answer:**
Stage-2 rankers output continuous scores $\hat{y} \in [0, 1]$. While sorting candidates requires only **order accuracy** (AUC / NDCG), commercial decisions require **calibration accuracy** (LogLoss / Expected Value):
$$\text{Expected Value} = \hat{p}_{\text{CTR}} \times \hat{p}_{\text{CVR}} \times \text{Price}$$

If $\hat{p}$ is overconfident (e.g., model predicts $0.20$ but empirical rate is $0.05$), the platform will massively overbid in programmatic auctions, misprice dynamic ad inventory, and distort revenue attribution.

**Comparison of Calibration Techniques**:

#### 1. Platt Scaling
* **Methodology**: Parametric. Fits a two-parameter logistic sigmoid on model logits:
  $$P(y=1 \mid z) = \frac{1}{1 + \exp(A z + B)}$$
* **Advantages**: Fast to train, robust to overfitting, requires small calibration datasets ($< 1,000$ samples), preserves ranking order strictly.
* **Limitations**: Assumes the calibration error follows a sigmoidal distribution. Cannot fix non-monotonic or multi-modal distortion.

#### 2. Isotonic Regression
* **Methodology**: Non-parametric. Fits a monotonic step-function $\hat{m}(s)$ minimizing squared error via the Pool Adjacent Violators Algorithm (PAVA).
* **Advantages**: Extremely flexible; can fit any monotonic non-linear mapping without distributional assumptions.
* **Limitations**: High risk of overfitting on small calibration sets; produces discrete step-values (ties) where continuous probability distinctions are lost.

---

### Question 4: How does Hybrid Parallelism (Model Parallelism + Data Parallelism) solve the distributed training bottleneck of DLRM with terabyte-scale embedding tables?

**Model Answer:**
Production DLRM architectures exhibit an asymmetric systems profile across layers:
1. **Embedding Tables**: Memory-capacity bound. Multi-table sparse embeddings easily reach hundreds of gigabytes to terabytes ($> 1\text{ TB}$) due to billions of user IDs, item IDs, and search keywords. They perform sparse lookups with minimal arithmetic intensity ($\sim 0\text{ FLOPs/byte}$).
2. **Dense Bottom & Top MLPs**: Compute-bound. Neural network weight matrices are small (megabytes), but execute intense matrix-matrix multiplications ($\sim 100\text{ FLOPs/byte}$).

Standard Data Parallelism (replicating the entire model on every GPU) fails because a $500\text{ GB}$ embedding table cannot fit into an $80\text{ GB}$ GPU VRAM. Standard Model Parallelism (placing entire network layers on separate GPUs sequentially) fails because GPU compute engines sit idle waiting for pipeline stages.

**The Hybrid Parallelism Solution (TorchRec / DLRM Distributed)**:
* **Model Parallelism for Sparse Embedding Tables**: The $S$ embedding tables are partitioned across the cluster's GPUs. GPU 0 hosts Tables 1-5; GPU 1 hosts Tables 6-10. Each GPU looks up embeddings only for its locally hosted tables.
* **Data Parallelism for Dense MLPs**: The Bottom and Top MLPs are replicated identically across all GPUs. Each GPU processes a distinct slice of the training mini-batch ($\text{BatchSize} / K_{\text{gpus}}$).
* **The "All-to-All" Collective Communication Barrier**:
  To bridge the two paradigms:
  1. Each GPU performs sparse lookups for its batch slice on its local tables.
  2. An **All-to-All (MPI / NCCL)** collective communication primitive redistributes the looked-up embedding vectors across GPUs so that each GPU receives all sparse features for its specific batch slice.
  3. Each GPU then executes the local dot-product interaction layer and Top MLP in parallel.
  4. Backward gradients on embeddings are routed back via a transposed All-to-All collective.

This architecture decouples memory capacity constraints from compute scaling, enabling models with trillions of parameters to train across hundreds of GPUs.

---

### Question 5: Why do stage-2 heavy rankers train on un-sampled or exposure-stratified logs, unlike stage-1 retrieval models that rely on in-batch negative sampling?

**Model Answer:**
The divergence in negative sampling strategies stems from the **operational scope and decision boundary** of each stage:

#### 1. Stage 1 (Retrieval): Global Catalog Discrimination
Retrieval models must distinguish a tiny handful of relevant items ($10^3$) from the entire catalog of $10^8$ items. The vast majority of random items in the catalog are completely irrelevant.
* In-batch negative sampling draws random items consumed by other users as negatives.
* This is statistically valid for Stage 1 because distinguishing a tennis racket from an automotive battery or a cooking recipe requires only coarse, broad semantic discrimination.

#### 2. Stage 2 (Heavy Ranking): Fine-Grained Intra-Candidate Discrimination
The heavy ranker never sees random items from the catalog. It evaluates **only the candidates that already passed Stage 1 retrieval**.
* Every single item reaching Stage 2 is already topically relevant, plausible, and high-quality.
* If a heavy ranker were trained on random in-batch negatives, it would learn only coarse category distinctions. When presented with 500 candidate smartphones at inference time, it would have no discriminative capability to rank an iPhone 15 Pro above an iPhone 14, because its training never forced it to discriminate between subtle feature trade-offs among relevant items.

**Production Training Practice for Stage 2**:
Stage 2 models train strictly on **logged impressions**:
* **Positives**: Items that were retrieved, ranked, displayed to the user, and clicked/purchased ($y=1$).
* **Negatives**: Items that were retrieved, ranked, and displayed to the user, but **not clicked** (unclicked impressions, $y=0$).

Training on unclicked impressions forces the heavy ranker to learn fine-grained preferences (pricing sensitivity, brand nuances, visual appeal) conditioned on the fact that the candidate was already deemed topically relevant by Stage 1.

