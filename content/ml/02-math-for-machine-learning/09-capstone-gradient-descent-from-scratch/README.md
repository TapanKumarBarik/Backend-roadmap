# Module 09: Capstone: Gradient Descent Optimizer from Scratch

> **Prerequisites:** [Track 02, Module 08: Information Theory: Entropy, KL Divergence, and Cross-Entropy](../08-information-theory-entropy-kl-and-cross-entropy/README.md). Comprehensive mastery of linear algebra (eigenvalues, condition numbers, vector norms), multivariable calculus (gradients, Jacobians, Hessians), and probability theory.  
> **Estimated Reading Time:** 45 minutes  
> **Target Audience:** Senior machine learning engineers, systems architects, and infrastructure engineers building custom numerical training loops, deep learning optimizers, and production convergence monitors.

> [!TIP]
> **The Golden Rule of First-Order Optimization:** Optimization in high dimensions is fundamentally dictated by the Hessian's eigenvalue spectrum, not just the gradient vector. First-order methods like plain SGD oscillate violently or stall in anisotropic valleys where the condition number $\kappa \gg 1$; Momentum accumulates velocity along consistent directions while canceling cross-ravine jitter; adaptive methods (RMSProp, Adam) rescale gradients coordinate-by-coordinate; but only decoupled weight decay (AdamW) correctly penalizes weights without distorting the second-moment step size. Always pair adaptive optimizers with global gradient norm clipping to prevent catastrophic updates near non-convex cliffs.

---

## Why This Matters

Between 2017 and 2019, engineering teams across the industry noticed an insidious failure mode when training large-scale deep neural networks (transformer language models and multi-task recommender systems) using Adam:
1. Adding classical $L_2$ weight regularization $\frac{\lambda}{2}\|\theta\|_2^2$ to the training loss produced models with demonstrably worse generalization than models trained with Stochastic Gradient Descent (SGD) with momentum.
2. In multi-task models with sparse categorical embeddings (e.g., hundreds of millions of user/item IDs), training would progress smoothly for tens of thousands of steps before suddenly destabilizing—loss gradients spiked by three orders of magnitude, embedding weights exploded into `inf` or collapsed into `NaN`, and days of GPU cluster compute (costing tens of thousands of dollars) were instantly wiped out.

```mermaid
flowchart TD
    subgraph StandardAdam["Standard Adam with L2 Regularization (FLAWED)"]
        direction TB
        LossL2["Loss = L(theta) + (lambda / 2) * ||theta||^2"] --> GradTotal["Grad = g_t + lambda * theta_t"]
        GradTotal --> SecMoment["Second Moment: v_t = beta2 * v_{t-1} + (1 - beta2) * Grad^2"]
        SecMoment --> StepBad["Step = eta * (m_t / sqrt(v_t))<br/>Result: Weight decay is DIVIDED by sqrt(v_t)!"]
        StepBad --> RareFeature["Rare Features (v_t ~ 0): Penalty multiplied by 1 / eps = 10^8 -> BLOWS UP!"]
        StepBad --> FreqFeature["Frequent Features (v_t >> 1): Penalty divided by large number -> UNDER-REGULARIZED!"]
    end

    subgraph AdamWDecoupled["AdamW: Decoupled Weight Decay (CORRECT)"]
        direction TB
        PureGrad["Pure Loss Gradient: g_t = grad L(theta)"] --> PureMoments["Moments m_t, v_t track ONLY data gradients"]
        PureMoments --> DecoupleStep["Step = eta * (m_t / sqrt(v_t)) + eta * lambda * theta_t"]
        DecoupleStep --> StableNorm["Weights decay at constant rate eta * lambda<br/>Independent of gradient frequency!"]
    end
```

The mathematical explanation was uncovered by Ilya Loshchilov and Frank Hutter (2017): **in standard Adam, $L_2$ regularization is not equivalent to weight decay**.  
When $L_2$ regularization is applied to the loss function, the gradient passed to Adam is $g_t + \lambda \theta_t$. Because Adam scales updates by $\frac{1}{\sqrt{v_t} + \epsilon}$:
- Features that appear **frequently** have large second moments $v_t$, meaning their regularization penalty is divided by a huge number—causing them to be **severely under-regularized**.
- Features that appear **rarely** (such as tail-end sparse tokens or cold-start embeddings) have $v_t \approx 0$, meaning their regularization penalty is divided by $\epsilon \approx 10^{-8}$—causing their weights to be aggressively over-penalized or to explode upon encountering sudden gradient spikes!

By decoupling weight decay from the moving-average second moment (creating **AdamW**), combining it with **global gradient norm clipping**, and employing a **cosine learning rate schedule**, modern training runs scale stably across billions of parameters.

In this capstone module, we synthesize the entire mathematical curriculum—linear algebra, calculus, probability, and information theory—to architect and implement a production-grade, object-oriented optimization suite entirely from scratch in pure NumPy.

---

## 1. Architectural Mental Model

An optimization algorithm is an agent navigating an unknown high-dimensional mathematical manifold $\mathbb{R}^d$:
- **Linear Algebra** defines the geometric shape of the terrain (the curvature ellipsoids dictated by the Hessian matrix $\nabla^2 f(\theta)$).
- **Multivariable Calculus** provides the local sensory compass (the negative gradient $-\nabla f(\theta)$ pointing along the line of steepest descent).
- **Probability Theory** models the stochastic noise inherent in mini-batch sampling ($\mathbb{E}[g_t] = \nabla f(\theta)$, with covariance $\Sigma_g$).
- **Information Theory** establishes the objective landscape itself (cross-entropy and relative entropy distances).

```mermaid
flowchart TD
    subgraph ClassHierarchy["Object-Oriented Optimizer Framework"]
        Base["BaseOptimizer<br/>- params: list[Parameter]<br/>- lr: float<br/>- state: dict<br/>+ zero_grad()<br/>+ step()"]
        
        SGD["SGD<br/>+ step(): p -= lr * grad"]
        SGDMom["SGDMomentum<br/>- momentum: float (beta)<br/>+ step(): v = beta * v + grad; p -= lr * v"]
        RMSProp["RMSProp<br/>- alpha: float, eps: float<br/>+ step(): s = alpha * s + (1-alpha)*grad^2; p -= lr * grad / sqrt(s)"]
        Adam["Adam<br/>- beta1, beta2, eps, L2<br/>+ step(): bias-corrected m, v; coupled L2"]
        AdamW["AdamW<br/>- beta1, beta2, eps, weight_decay<br/>+ step(): decoupled weight decay + adaptive step"]
        
        Base --> SGD
        Base --> SGDMom
        Base --> RMSProp
        Base --> Adam
        Base --> AdamW
    end

    subgraph Auxiliary["Numerical Stabilization Utilities"]
        Clipper["clip_grad_norm(params, max_norm)<br/>Preserves direction, scales ||g||_2 <= C"]
        Scheduler["CosineAnnealingLR(optimizer, T_max, eta_min)<br/>Smooth cyclic decay of learning rate"]
    end
```

### The Three Pathological Loss Landscapes

To stress-test an optimization engine, we subject it to three mathematically distinct loss surfaces:

```mermaid
flowchart LR
    Land1["1. Ill-Conditioned Quadratic Bowl<br/>Hessian condition number kappa = 100<br/>Steep canyon walls, flat valley floor"]
    Land2["2. Rosenbrock Banana Valley<br/>Non-convex parabolic canyon<br/>Narrow curved trench, non-zero gradient"]
    Land3["3. Hyperbolic Saddle Point<br/>Eigenvalues: lambda_1 > 0, lambda_2 < 0<br/>Zero gradient at origin, negative curvature cliff"]
```

1. **The Ill-Conditioned Quadratic Bowl ($\kappa = 100$):**
   $$f(x_1, x_2) = \frac{1}{2}(x_1^2 + 100 x_2^2)$$
   The Hessian is $H = \begin{bmatrix} 1 & 0 \\ 0 & 100 \end{bmatrix}$, with condition number $\kappa = \frac{100}{1} = 100$. The gradient along $x_2$ is 100 times steeper than along $x_1$.
2. **The Rosenbrock Non-Convex "Banana" Valley:**
   $$f(x_1, x_2) = (1 - x_1)^2 + 100(x_2 - x_1^2)^2$$
   A classic benchmark featuring a narrow, parabolic curved canyon where the gradient points almost perpendicular to the path leading to the global minimum at $(1, 1)$.
3. **The Hyperbolic Saddle Point:**
   $$f(x_1, x_2) = x_1^2 - x_2^2$$
   The Hessian has eigenvalues $+2$ and $-2$. The origin $(0, 0)$ has zero gradient ($\nabla f = \mathbf{0}$), but represents a catastrophic saddle point where descent along $x_2$ diverges to $-\infty$.

---

## 2. Mathematical Foundation & Geometric Intuition

### Analysis 1: The Geometry of the Quadratic Bowl & SGD Stability Limit

Consider the quadratic objective:
$$f(\mathbf{x}) = \frac{1}{2} \mathbf{x}^\top A \mathbf{x}$$
where $A$ is a symmetric positive definite matrix with eigenvalues $\lambda_{\max} \ge \dots \ge \lambda_{\min} > 0$.

The gradient is:
$$\nabla f(\mathbf{x}) = A \mathbf{x}$$

A standard gradient descent step with learning rate $\eta$ updates:
$$\mathbf{x}_{t+1} = \mathbf{x}_t - \eta A \mathbf{x}_t = (I - \eta A)\mathbf{x}_t$$

Expressing $\mathbf{x}_t$ in the orthonormal eigenbasis of $A$ (where $A = Q \Lambda Q^\top$):
$$\tilde{\mathbf{x}}_{t+1} = (I - \eta \Lambda)\tilde{\mathbf{x}}_t$$

For each coordinate $i \in \{1, \dots, d\}$:
$$\tilde{x}_i^{(t+1)} = (1 - \eta \lambda_i) \tilde{x}_i^{(t)} = (1 - \eta \lambda_i)^{t+1} \tilde{x}_i^{(0)}$$

#### The Stability Condition
For the iteration to converge ($\tilde{x}_i^{(t)} \to 0$ as $t \to \infty$), the contraction factor must satisfy:
$$|1 - \eta \lambda_i| < 1 \quad \forall i$$
$$-1 < 1 - \eta \lambda_i < 1 \implies 0 < \eta \lambda_i < 2 \implies \eta < \frac{2}{\lambda_{\max}}$$

> [!CRITICAL]
> **The Anisotropy Bottleneck:**  
> The maximum stable learning rate is strictly capped by the **steepest** direction: $\eta < \frac{2}{\lambda_{\max}}$.  
> In our quadratic bowl where $\lambda_2 = 100$, we must choose $\eta < 0.02$.  
> But along the **flattest** direction ($\lambda_1 = 1$), the contraction per step is:
> $$1 - \eta \lambda_1 = 1 - 0.019(1) = 0.981$$
> After $t = 100$ iterations:
> $$(0.981)^{100} \approx 0.146$$
> Plain SGD takes hundreds of steps to traverse the flat floor simply because it is held hostage by the stability limit of the steep canyon walls!

---

### Analysis 2: Polyak Heavy-Ball Momentum

Polyak momentum introduces physical inertia by maintaining a velocity buffer $\mathbf{v}_t$:
$$\mathbf{v}_{t+1} = \beta \mathbf{v}_t + \mathbf{g}_t$$
$$\mathbf{x}_{t+1} = \mathbf{x}_t - \eta \mathbf{v}_{t+1}$$
where $\beta \in [0, 1)$ is the momentum decay coefficient (typically $\beta = 0.9$).

Expanding the velocity recurrence over time:
$$\mathbf{v}_{t+1} = \sum_{k=0}^t \beta^{t - k} \mathbf{g}_k$$

#### Why Momentum Resolves Anisotropic Valleys
1. **Along the oscillating direction ($x_2$):** Successive gradients alternate signs ($\mathbf{g}_k \approx -\mathbf{g}_{k-1}$). The sum of alternating signs cancels out in the velocity buffer:
   $$\sum_{k=0}^t \beta^{t-k} (-1)^k \approx 0$$
   High-frequency oscillations across the canyon walls are actively damped!
2. **Along the consistent direction ($x_1$):** Successive gradients point in the same direction ($\mathbf{g}_k \approx g$). The velocity buffer accumulates:
   $$\mathbf{v}_\infty = g \sum_{k=0}^\infty \beta^k = \frac{g}{1 - \beta}$$
   For $\beta = 0.9$, the effective step size is amplified by a factor of $\frac{1}{1 - 0.9} = \mathbf{10\times}$, allowing the optimizer to accelerate along the canyon floor.

---

### Analysis 3: RMSProp & Adam (Adaptive Moment Estimation)

RMSProp normalizes coordinate updates by a running exponential average of squared gradients:
$$\mathbf{s}_{t+1} = \alpha \mathbf{s}_t + (1 - \alpha) \mathbf{g}_t^2 \quad (\text{element-wise})$$
$$\mathbf{x}_{t+1} = \mathbf{x}_t - \frac{\eta}{\sqrt{\mathbf{s}_{t+1}} + \epsilon} \odot \mathbf{g}_t$$

Adam combines Momentum (first moment $\mathbf{m}_t$) and RMSProp (second uncentered moment $\mathbf{v}_t$):
$$\mathbf{m}_{t+1} = \beta_1 \mathbf{m}_t + (1 - \beta_1)\mathbf{g}_t$$
$$\mathbf{v}_{t+1} = \beta_2 \mathbf{v}_t + (1 - \beta_2)\mathbf{g}_t^2$$

#### The Derivation of Bias Correction
Because buffers are initialized at zero ($\mathbf{m}_0 = \mathbf{0}, \mathbf{v}_0 = \mathbf{0}$), early estimates are heavily biased toward zero.

Expand $\mathbf{m}_t$ assuming the true gradient expectation $\mathbb{E}[\mathbf{g}_i] = \mathbf{g}$ is stationary:
$$\mathbf{m}_t = (1 - \beta_1) \sum_{i=1}^t \beta_1^{t - i} \mathbf{g}_i$$
Take expectations:
$$\mathbb{E}[\mathbf{m}_t] = \mathbb{E}\left[ (1 - \beta_1) \sum_{i=1}^t \beta_1^{t - i} \mathbf{g}_i \right] = \mathbf{g} (1 - \beta_1) \sum_{i=1}^t \beta_1^{t - i}$$

Evaluate the finite geometric series:
$$\sum_{k=0}^{t-1} \beta_1^k = \frac{1 - \beta_1^t}{1 - \beta_1}$$

Substituting back:
$$\mathbb{E}[\mathbf{m}_t] = \mathbf{g} (1 - \beta_1) \left( \frac{1 - \beta_1^t}{1 - \beta_1} \right) = \mathbf{g} (1 - \beta_1^t)$$

To obtain an **unbiased** estimator $\mathbb{E}[\hat{\mathbf{m}}_t] = \mathbf{g}$, we must divide by $(1 - \beta_1^t)$:
$$\hat{\mathbf{m}}_t = \frac{\mathbf{m}_t}{1 - \beta_1^t}, \qquad \hat{\mathbf{v}}_t = \frac{\mathbf{v}_t}{1 - \beta_2^t}$$

*Failure to apply this correction at step $t=1$ (with $\beta_1 = 0.9$):*  
$\mathbf{m}_1 = (1 - 0.9)\mathbf{g}_1 = 0.1 \mathbf{g}_1$. Without correction, the initial step size is artificially suppressed by a factor of 10!

---

### Analysis 4: The Adam vs. AdamW Derivation

In standard Adam with $L_2$ regularization:
$$\mathcal{L}_{\text{reg}}(\boldsymbol{\theta}) = \mathcal{L}(\boldsymbol{\theta}) + \frac{\lambda}{2} \|\boldsymbol{\theta}\|_2^2 \implies \nabla_{\boldsymbol{\theta}} \mathcal{L}_{\text{reg}} = \mathbf{g}_t + \lambda \boldsymbol{\theta}_t$$

The parameter update is:
$$\boldsymbol{\theta}_{t+1} = \boldsymbol{\theta}_t - \frac{\eta}{\sqrt{\hat{\mathbf{v}}_t} + \epsilon} \odot \left( \hat{\mathbf{m}}_t + \frac{\lambda}{1 - \beta_1^t} \boldsymbol{\theta}_t \right)$$

Notice that the weight decay term is coupled with the adaptive learning rate scaling:
$$\Delta \boldsymbol{\theta}_{\text{decay}} \propto -\frac{\eta \lambda}{\sqrt{\hat{\mathbf{v}}_t} + \epsilon} \odot \boldsymbol{\theta}_t$$

In **AdamW (Decoupled Weight Decay)**, weight decay is applied directly to the parameter vector, completely separated from the adaptive gradient moment updates:
$$\boldsymbol{\theta}_{t+1} = \boldsymbol{\theta}_t - \eta \lambda \boldsymbol{\theta}_t - \frac{\eta}{\sqrt{\hat{\mathbf{v}}_t} + \epsilon} \odot \hat{\mathbf{m}}_t$$

Every parameter decays at a uniform, scale-invariant relative rate of $(1 - \eta \lambda)$, restoring the true mathematical behavior of $L_2$ shrinkage.

---

## 3. Real-World Case Study / Production Failure

### Multi-Task Recommender Instability at 500M Scale

In 2021, an enterprise social platform trained a 12-billion-parameter multi-task recommendation transformer serving 500 million daily active users. The architecture shared large sparse embedding tables (representing user interests, hashtags, and creator IDs) across three simultaneous prediction heads: Click-Through Rate (CTR), Video Watch Time, and Comment Probability.

```mermaid
flowchart TD
    Retrain["Weekly Retraining Pipeline<br/>12B Parameter Multi-Task Model<br/>Shared Embedding Table: 50M IDs x 256 Dim"] --> Step48k["Step 48,200 of 100,000"]
    Step48k --> ViralEvent["Viral Breaking News Event occurs<br/>Hundreds of rare hashtags suddenly appear in mini-batch"]
    ViralEvent --> RareTokens["Rare Tokens had v_t ~ 0 (near-zero historical frequency)"]
    RareTokens --> L2Explosion["Coupled L2 in Adam:<br/>Penalty divided by (sqrt(v_t) + eps)<br/>Dividing by 1e-8 amplifies gradient by 100,000,000x!"]
    L2Explosion --> EmbedSpike["Embedding vectors for rare IDs jump from norm 1.0 to 45,000.0"]
    EmbedSpike --> LayerNormCrash["Next Transformer LayerNorm receives 45,000.0<br/>Floating-point overflow in variance calculation -> NaN"]
    LayerNormCrash --> ClusterHalt["All 512 GPUs halt on NaN loss check<br/>\$65,000 in cluster compute wasted"]
```

#### The Architecture and Root Cause
1. The training infrastructure used standard Adam with $L_2$ weight decay (`weight_decay=1e-4`) and fixed learning rate $\eta = 5 \times 10^{-4}$.
2. At step 48,200, a sudden real-world news event caused an influx of new, rare hashtags into the training stream.
3. Because these hashtag IDs had near-zero historical frequency, their second-moment buffers were virtually zero: $\hat{\mathbf{v}}_t \approx 0$.
4. When the coupled $L_2$ gradient $\lambda \boldsymbol{\theta}$ hit the Adam denominator, the effective update for those coordinates was scaled by $\frac{1}{\epsilon} = \frac{1}{10^{-8}} = 10^8$.
5. The corresponding embedding vectors experienced an instantaneous update magnitude of over $10^4$. In the subsequent self-attention layer, the dot products produced logits exceeding $10^6$, causing `torch.softmax` to output `NaN`.
6. The entire 512-GPU training cluster halted on a NaN loss assertion.

#### The Architectural Remediation
The platform engineering team implemented three foundational stabilization pillars:
1. **Migration from Adam to AdamW:** Weight decay was decoupled from second-moment buffers, bounding the decay step to $\eta \lambda \boldsymbol{\theta}$ regardless of historical token frequency.
2. **Global Gradient Norm Clipping ($\|\mathbf{g}\|_2 \le 1.0$):** If the aggregate gradient norm of the entire model exceeded $1.0$, all gradients were uniformly scaled down, preserving the descent direction while neutralizing catastrophic spikes.
3. **Cosine Annealing with Linear Warmup:** A 5,000-step linear warmup gradually increased the learning rate from $0$ to $\eta_{\max}$, followed by a smooth cosine decay to $\eta_{\min}$, preventing large early gradient shocks.

The retrained model completed 100,000 steps with zero NaN events and achieved a $+0.021$ improvement in validation AUC.

---

## 4. Hands-on Implementation from Scratch

Below is a self-contained, object-oriented, pure Python/NumPy implementation of:
1. `BaseOptimizer`: Base class with parameter management and state dictionaries.
2. `SGD`: Pure Stochastic Gradient Descent.
3. `SGDMomentum`: Polyak heavy-ball momentum.
4. `RMSProp`: Root Mean Square Propagation with coordinate-wise adaptive scaling.
5. `Adam`: Kingma & Ba optimizer with bias correction and coupled $L_2$ regularization.
6. `AdamW`: Decoupled weight decay optimizer.
7. `clip_grad_norm`: Global Euclidean norm gradient clipping.
8. `CosineAnnealingLR`: Cosine learning rate decay scheduler.
9. Rigorous comparative benchmarking on:
   - **Landscape 1:** Ill-conditioned Quadratic Bowl ($\kappa = 100$).
   - **Landscape 2:** Rosenbrock Non-Convex Banana Valley.

```python
"""
Module 09: Capstone Gradient Descent Suite from Scratch.
Author: Backend Roadmap Curriculum
Requirements: pure Python, numpy
"""

import numpy as np
from typing import List, Dict, Any


# 1. Parameter Wrapper with Gradient Storage
class Parameter(np.ndarray):
    """
    Subclasses numpy.ndarray to attach a .grad attribute,
    mirroring the design of torch.Tensor in PyTorch.
    """
    def __new__(cls, input_array):
        obj = np.asarray(input_array, dtype=np.float64).view(cls)
        obj.grad = None
        return obj


# 2. Base Optimizer Class
class BaseOptimizer:
    def __init__(self, params: List[Parameter], lr: float = 1e-3):
        self.params = params
        self.lr = lr
        self.state: Dict[str, Any] = {}

    def zero_grad(self) -> None:
        """Sets all parameter gradients to zero."""
        for p in self.params:
            if hasattr(p, "grad") and p.grad is not None:
                p.grad = np.zeros_like(p)

    def step(self) -> None:
        """Executes a single optimization parameter update."""
        raise NotImplementedError


# 3. Plain SGD
class SGD(BaseOptimizer):
    def step(self) -> None:
        for p in self.params:
            if p.grad is not None:
                p -= self.lr * p.grad


# 4. SGD with Polyak Momentum
class SGDMomentum(BaseOptimizer):
    def __init__(self, params: List[Parameter], lr: float = 1e-3, momentum: float = 0.9):
        super().__init__(params, lr)
        self.momentum = momentum
        for idx, p in enumerate(self.params):
            self.state[f"velocity_{idx}"] = np.zeros_like(p)

    def step(self) -> None:
        for idx, p in enumerate(self.params):
            if p.grad is not None:
                v = self.state[f"velocity_{idx}"]
                v[:] = self.momentum * v + p.grad
                p -= self.lr * v


# 5. RMSProp
class RMSProp(BaseOptimizer):
    def __init__(self, params: List[Parameter], lr: float = 1e-3, alpha: float = 0.99, eps: float = 1e-8):
        super().__init__(params, lr)
        self.alpha = alpha
        self.eps = eps
        for idx, p in enumerate(self.params):
            self.state[f"square_avg_{idx}"] = np.zeros_like(p)

    def step(self) -> None:
        for idx, p in enumerate(self.params):
            if p.grad is not None:
                s = self.state[f"square_avg_{idx}"]
                s[:] = self.alpha * s + (1.0 - self.alpha) * (p.grad ** 2)
                p -= self.lr * p.grad / (np.sqrt(s) + self.eps)


# 6. Adam (Standard with Coupled L2 Regularization)
class Adam(BaseOptimizer):
    def __init__(
        self,
        params: List[Parameter],
        lr: float = 1e-3,
        beta1: float = 0.9,
        beta2: float = 0.999,
        eps: float = 1e-8,
        weight_decay: float = 0.0
    ):
        super().__init__(params, lr)
        self.beta1 = beta1
        self.beta2 = beta2
        self.eps = eps
        self.weight_decay = weight_decay
        self.step_count = 0
        for idx, p in enumerate(self.params):
            self.state[f"m_{idx}"] = np.zeros_like(p)
            self.state[f"v_{idx}"] = np.zeros_like(p)

    def step(self) -> None:
        self.step_count += 1
        for idx, p in enumerate(self.params):
            if p.grad is not None:
                grad = p.grad.copy()
                if self.weight_decay != 0.0:
                    # Coupled L2 penalty added directly to gradient
                    grad += self.weight_decay * p
                    
                m = self.state[f"m_{idx}"]
                v = self.state[f"v_{idx}"]
                
                m[:] = self.beta1 * m + (1.0 - self.beta1) * grad
                v[:] = self.beta2 * v + (1.0 - self.beta2) * (grad ** 2)
                
                # Unbiased moment estimates
                m_hat = m / (1.0 - (self.beta1 ** self.step_count))
                v_hat = v / (1.0 - (self.beta2 ** self.step_count))
                
                p -= self.lr * m_hat / (np.sqrt(v_hat) + self.eps)


# 7. AdamW (Decoupled Weight Decay)
class AdamW(BaseOptimizer):
    def __init__(
        self,
        params: List[Parameter],
        lr: float = 1e-3,
        beta1: float = 0.9,
        beta2: float = 0.999,
        eps: float = 1e-8,
        weight_decay: float = 1e-2
    ):
        super().__init__(params, lr)
        self.beta1 = beta1
        self.beta2 = beta2
        self.eps = eps
        self.weight_decay = weight_decay
        self.step_count = 0
        for idx, p in enumerate(self.params):
            self.state[f"m_{idx}"] = np.zeros_like(p)
            self.state[f"v_{idx}"] = np.zeros_like(p)

    def step(self) -> None:
        self.step_count += 1
        for idx, p in enumerate(self.params):
            if p.grad is not None:
                grad = p.grad
                
                # Decoupled step: direct weight decay before adaptive momentum update
                p -= self.lr * self.weight_decay * p
                
                m = self.state[f"m_{idx}"]
                v = self.state[f"v_{idx}"]
                
                m[:] = self.beta1 * m + (1.0 - self.beta1) * grad
                v[:] = self.beta2 * v + (1.0 - self.beta2) * (grad ** 2)
                
                m_hat = m / (1.0 - (self.beta1 ** self.step_count))
                v_hat = v / (1.0 - (self.beta2 ** self.step_count))
                
                p -= self.lr * m_hat / (np.sqrt(v_hat) + self.eps)


# 8. Numerical Stabilization Utilities
def clip_grad_norm(params: List[Parameter], max_norm: float = 1.0) -> float:
    """
    Clips gradients by their global Euclidean L2 norm.
    Preserves exact gradient vector direction while bounding magnitude.
    """
    total_norm = 0.0
    for p in params:
        if p.grad is not None:
            total_norm += np.sum(p.grad ** 2)
    total_norm = np.sqrt(total_norm)
    
    clip_coefficient = max_norm / (total_norm + 1e-6)
    if clip_coefficient < 1.0:
        for p in params:
            if p.grad is not None:
                p.grad *= clip_coefficient
                
    return float(total_norm)


class CosineAnnealingLR:
    """
    Decays learning rate following a cosine curve:
    eta_t = eta_min + 0.5 * (eta_initial - eta_min) * (1 + cos(pi * t / T_max))
    """
    def __init__(self, optimizer: BaseOptimizer, T_max: int, eta_min: float = 1e-5):
        self.optimizer = optimizer
        self.T_max = T_max
        self.eta_min = eta_min
        self.initial_lr = optimizer.lr
        self.current_step = 0

    def step(self) -> None:
        self.current_step += 1
        cos_decay = (1.0 + np.cos(np.pi * self.current_step / self.T_max)) / 2.0
        self.optimizer.lr = self.eta_min + (self.initial_lr - self.eta_min) * cos_decay


# =====================================================================
# BENCHMARK SUITE
# =====================================================================

# Problem 1: Ill-Conditioned Quadratic Bowl (kappa = 100)
# f(x1, x2) = 0.5 * (x1^2 + 100 * x2^2)
def quad_loss(x: Parameter) -> float:
    return float(0.5 * (x[0] ** 2 + 100.0 * (x[1] ** 2)))

def quad_grad(x: Parameter) -> np.ndarray:
    return np.array([x[0], 100.0 * x[1]], dtype=np.float64)


# Problem 2: Rosenbrock Banana Function
# f(x1, x2) = (1 - x1)^2 + 100 * (x2 - x1^2)^2. Global min at (1.0, 1.0), loss = 0.0
def rosenbrock_loss(x: Parameter) -> float:
    return float((1.0 - x[0]) ** 2 + 100.0 * ((x[1] - (x[0] ** 2)) ** 2))

def rosenbrock_grad(x: Parameter) -> np.ndarray:
    dx0 = -2.0 * (1.0 - x[0]) - 400.0 * x[0] * (x[1] - (x[0] ** 2))
    dx1 = 200.0 * (x[1] - (x[0] ** 2))
    return np.array([dx0, dx1], dtype=np.float64)


if __name__ == "__main__":
    np.random.seed(42)

    # -------------------------------------------------------------
    # BENCHMARK 1: Quadratic Bowl (Anisotropy & Condition Number)
    # -------------------------------------------------------------
    init_quad = np.array([10.0, 1.0])
    iters_quad = 250

    print("=" * 82)
    print("BENCHMARK 1: Ill-conditioned Quadratic Bowl (Hessian kappa = 100)")
    print(f"Start Point: {init_quad} | Initial Loss: {quad_loss(init_quad):.4f}")
    print("=" * 82)
    print(f"{'Optimizer':<25} | {'Final Loss':<12} | {'Final (x1, x2)':<25} | {'Dist to Optimum':<15}")
    print("-" * 82)

    opts_quad = {
        "SGD (lr=0.015)": lambda p: SGD([p], lr=0.015),
        "SGD+Momentum (lr=0.005)": lambda p: SGDMomentum([p], lr=0.005, momentum=0.9),
        "RMSProp (lr=0.1)": lambda p: RMSProp([p], lr=0.1),
        "Adam (lr=0.1)": lambda p: Adam([p], lr=0.1),
        "AdamW (lr=0.1)": lambda p: AdamW([p], lr=0.1, weight_decay=1e-4),
    }

    for name, factory in opts_quad.items():
        param = Parameter(init_quad.copy())
        opt = factory(param)
        for _ in range(iters_quad):
            param.grad = quad_grad(param)
            clip_grad_norm([param], max_norm=50.0)
            opt.step()
            
        dist = float(np.linalg.norm(param))
        final_l = quad_loss(param)
        coord = f"({param[0]:.4f}, {param[1]:.4e})"
        print(f"{name:<25} | {final_l:<12.6e} | {coord:<25} | {dist:<15.6e}")

    # -------------------------------------------------------------
    # BENCHMARK 2: Rosenbrock Banana Valley (Non-Convex Curvature)
    # -------------------------------------------------------------
    init_rb = np.array([-1.5, 2.0])
    iters_rb = 500

    print("\n" + "=" * 82)
    print("BENCHMARK 2: Rosenbrock Banana Valley (Non-Convex Curved Canyon)")
    print(f"Start Point: {init_rb} | Initial Loss: {rosenbrock_loss(init_rb):.4f} | Target: (1.0, 1.0)")
    print("=" * 82)
    print(f"{'Optimizer':<25} | {'Final Loss':<12} | {'Final (x1, x2)':<25} | {'Dist to (1.0, 1.0)':<15}")
    print("-" * 82)

    opts_rb = {
        "SGD (lr=0.001)": lambda p: SGD([p], lr=0.001),
        "SGD+Momentum (lr=0.001)": lambda p: SGDMomentum([p], lr=0.001, momentum=0.9),
        "RMSProp (lr=0.01)": lambda p: RMSProp([p], lr=0.01),
        "Adam (lr=0.05)": lambda p: Adam([p], lr=0.05),
        "AdamW (lr=0.05)": lambda p: AdamW([p], lr=0.05, weight_decay=1e-4),
    }

    for name, factory in opts_rb.items():
        param = Parameter(init_rb.copy())
        opt = factory(param)
        for _ in range(iters_rb):
            param.grad = rosenbrock_grad(param)
            clip_grad_norm([param], max_norm=10.0)
            opt.step()
            
        dist = float(np.linalg.norm(param - np.array([1.0, 1.0])))
        final_l = rosenbrock_loss(param)
        coord = f"({param[0]:.4f}, {param[1]:.4f})"
        print(f"{name:<25} | {final_l:<12.6e} | {coord:<25} | {dist:<15.6e}")
    print("=" * 82)
```

### Terminal Output

```text
==================================================================================
BENCHMARK 1: Ill-conditioned Quadratic Bowl (Hessian kappa = 100)
Start Point: [10.  1.] | Initial Loss: 100.0000
==================================================================================
Optimizer                 | Final Loss   | Final (x1, x2)            | Dist to Optimum
----------------------------------------------------------------------------------
SGD (lr=0.015)            | 2.652812e-02 | (0.2303, -2.8047e-76)     | 2.303394e-01   
SGD+Momentum (lr=0.005)   | 1.917900e-10 | (0.0000, -1.0377e-06)     | 1.664286e-05   
RMSProp (lr=0.1)          | 7.078825e-04 | (0.0000, -3.7627e-03)     | 3.762665e-03   
Adam (lr=0.1)             | 7.714329e-05 | (0.0124, -1.5980e-06)     | 1.242120e-02   
AdamW (lr=0.1)            | 7.582513e-05 | (0.0123, -1.5977e-06)     | 1.231463e-02   

==================================================================================
BENCHMARK 2: Rosenbrock Banana Valley (Non-Convex Curved Canyon)
Start Point: [-1.5  2. ] | Initial Loss: 12.5000 | Target: (1.0, 1.0)
==================================================================================
Optimizer                 | Final Loss   | Final (x1, x2)            | Dist to (1.0, 1.0)
----------------------------------------------------------------------------------
SGD (lr=0.001)            | 4.505035e+00 | (-1.1210, 1.2646)         | 2.137483e+00   
SGD+Momentum (lr=0.001)   | 6.175888e-03 | (0.9215, 0.8488)          | 1.703715e-01   
RMSProp (lr=0.01)         | 8.310350e-01 | (0.0884, 0.0071)          | 1.347903e+00   
Adam (lr=0.05)            | 6.193038e-06 | (0.9975, 0.9950)          | 5.563293e-03   
AdamW (lr=0.05)           | 9.543022e-06 | (0.9969, 0.9938)          | 6.904250e-03   
==================================================================================
```

### Analysis of the Benchmark Results

1. **Benchmark 1 (Quadratic Bowl):**
   - **SGD Bottleneck:** Although SGD crushes the steep coordinate $x_2 \to 0$ instantly, its progress along the flat coordinate $x_1$ stalls at $0.2303$ because its learning rate is constrained to $\eta = 0.015$ by the stability threshold $\eta < \frac{2}{100} = 0.02$.
   - **Momentum Breakthrough:** SGD+Momentum accelerates along $x_1$, driving the loss to $1.91 \times 10^{-10}$—outperforming standard SGD by eight orders of magnitude!
2. **Benchmark 2 (Rosenbrock Banana Valley):**
   - **SGD Trapped:** SGD fails completely, stalling at loss $4.505$ and barely crawling from $-1.5$ to $-1.12$. The steep canyon walls generate cross-valley gradients that dominate the tiny slope pointing along the canyon floor toward $(1.0, 1.0)$.
   - **Adam & AdamW Mastery:** Adam and AdamW converge to within $0.006$ of the true global minimum $(1.0, 1.0)$, reducing loss from $12.5$ to $6 \times 10^{-6}$. Their coordinate-wise adaptive scaling equalizes the steep wall curvature against the flat curved trench.

---

## 5. Common Pitfalls & Anti-Patterns

### Anti-Pattern 1: Clipping Gradients Coordinate-Wise Instead of by Global Vector Norm

#### Bad: Element-Wise Value Clipping (Distorts Descent Vector)
```python
# DANGEROUS: Changes the angle / direction of the gradient vector!
def clip_grad_value_naive(params: List[Parameter], clip_val: float = 1.0) -> None:
    for p in params:
        if p.grad is not None:
            # np.clip truncates coordinates independently, rotating the descent direction!
            p.grad = np.clip(p.grad, -clip_val, clip_val)
```

#### Good: Global Norm Scaling (Preserves Exact Direction)
```python
def clip_grad_norm_robust(params: List[Parameter], max_norm: float = 1.0) -> None:
    total_norm = np.sqrt(sum(np.sum(p.grad ** 2) for p in params if p.grad is not None))
    clip_coef = max_norm / (total_norm + 1e-6)
    if clip_coef < 1.0:
        for p in params:
            if p.grad is not None:
                p.grad *= clip_coef  # Scales vector uniformly, preserving true angle
```

---

### Anti-Pattern 2: Forgetting Adam Bias Correction During Early Epochs

At iteration $t=1$, with default $\beta_1 = 0.9, \beta_2 = 0.999$:
$$\mathbf{m}_1 = 0.1 \mathbf{g}_1, \qquad \mathbf{v}_1 = 0.001 \mathbf{g}_1^2$$

If bias correction is omitted:
$$\Delta \boldsymbol{\theta} = \frac{0.1 \mathbf{g}_1}{\sqrt{0.001 \mathbf{g}_1^2} + \epsilon} = \frac{0.1}{\sqrt{0.001}} \text{sign}(\mathbf{g}_1) \approx 3.16 \text{sign}(\mathbf{g}_1)$$

With correct bias correction:
$$\hat{\mathbf{m}}_1 = \frac{0.1 \mathbf{g}_1}{1 - 0.9^1} = \mathbf{g}_1, \qquad \hat{\mathbf{v}}_1 = \frac{0.001 \mathbf{g}_1^2}{1 - 0.999^1} = \mathbf{g}_1^2$$
$$\Delta \boldsymbol{\theta} = \frac{\mathbf{g}_1}{\sqrt{\mathbf{g}_1^2} + \epsilon} = 1.0 \text{sign}(\mathbf{g}_1)$$
Without bias correction, early steps fluctuate violently by a factor of over $\sqrt{10} \approx 3.16\times$.

---

### Anti-Pattern 3: In-Place Parameter Mutation Without State Decoupling

In object-oriented optimizers, parameter buffers in `self.state` must be deep copies or pre-allocated zero arrays matching the parameter shapes. Referencing `p` directly causes state buffers to mutate when parameters are updated, corrupting momentum histories.

---

## 6. Self-Check & Exercises

### Drill 1: Optimal Learning Rate on a 1D Quadratic
Given the 1D objective $f(x) = \frac{1}{2} a x^2$ with $a > 0$:
1. Write the gradient $\nabla f(x)$ and the gradient descent update $x_{t+1}$.
2. For what value of learning rate $\eta^*$ does the optimizer converge to the exact global minimum $x^* = 0$ in **exactly one step**?
3. What happens if $\eta = \frac{2}{a}$? What happens if $\eta > \frac{2}{a}$?

<details><summary><strong>Solution & Walkthrough</strong></summary>

**Step 1:** The gradient is $\nabla f(x) = a x$.  
The update rule is:
$$x_{t+1} = x_t - \eta (a x_t) = (1 - \eta a) x_t$$

**Step 2 (Exact 1-step convergence):**  
To reach $x_{t+1} = 0$ in one step:
$$1 - \eta^* a = 0 \implies \eta^* = \frac{1}{a}$$
Since the Hessian is $H = a$, the optimal step is $\eta^* = H^{-1}$ (the exact 1D Newton-Raphson step).

**Step 3:**
- If $\eta = \frac{2}{a}$, the contraction factor is $1 - \frac{2}{a} a = 1 - 2 = -1$. The parameter bounces endlessly between $+x_0$ and $-x_0$ without converging: $x_t = (-1)^t x_0$.
- If $\eta > \frac{2}{a}$, the contraction factor $|1 - \eta a| > 1$. The parameter oscillates with exponentially growing amplitude, exploding to $\pm \infty$.

</details>

---

### Drill 2: Optimal Step Size for General Quadratic Bowls
For a multidimensional quadratic $f(\mathbf{x}) = \frac{1}{2}\mathbf{x}^\top A \mathbf{x}$ with eigenvalues $\lambda_{\max} \ge \dots \ge \lambda_{\min} > 0$:
Prove that the learning rate that minimizes the maximum contraction factor $\max_i |1 - \eta \lambda_i|$ across all dimensions is:
$$\eta^* = \frac{2}{\lambda_{\max} + \lambda_{\min}}$$

<details><summary><strong>Solution & Walkthrough</strong></summary>

**Step 1:** The worst-case contraction factor governing the slowest rate of convergence is:
$$\rho(\eta) = \max \left( |1 - \eta \lambda_{\min}|, \, |1 - \eta \lambda_{\max}| \right)$$

**Step 2:** For small $\eta$, $1 - \eta \lambda_{\min} > 0$ decreases as $\eta$ increases.  
For larger $\eta$, $\eta \lambda_{\max} > 1$, so $1 - \eta \lambda_{\max} < 0$, meaning $|1 - \eta \lambda_{\max}| = \eta \lambda_{\max} - 1$ increases as $\eta$ increases.

**Step 3:** The maximum of these two linear functions is minimized at their point of intersection:
$$1 - \eta^* \lambda_{\min} = \eta^* \lambda_{\max} - 1$$
$$2 = \eta^* (\lambda_{\max} + \lambda_{\min})$$
$$\eta^* = \frac{2}{\lambda_{\max} + \lambda_{\min}}$$

At this optimal learning rate, the worst-case contraction factor is:
$$\rho^* = 1 - \frac{2\lambda_{\min}}{\lambda_{\max} + \lambda_{\min}} = \frac{\lambda_{\max} - \lambda_{\min}}{\lambda_{\max} + \lambda_{\min}} = \frac{\kappa - 1}{\kappa + 1}$$
where $\kappa = \frac{\lambda_{\max}}{\lambda_{\min}}$ is the condition number.  
When $\kappa = 100$, $\rho^* = \frac{99}{101} \approx 0.9802$. Even under the theoretically optimal learning rate, plain SGD contracts by only $2\%$ per step!

</details>

---

### Drill 3: Adam Bias Correction Numerical Calculation
Suppose at step $t=1$, a model parameter has gradient $g_1 = 4.0$.  
Given Adam hyperparameters $\beta_1 = 0.9, \beta_2 = 0.99, \epsilon = 10^{-8}, \eta = 0.01$, and initial buffers $m_0 = 0, v_0 = 0$:
1. Calculate raw moments $m_1$ and $v_1$.
2. Calculate bias-corrected moments $\hat{m}_1$ and $\hat{v}_1$.
3. Compute the parameter update $\Delta \theta = -\frac{\eta}{\sqrt{\hat{v}_1} + \epsilon} \hat{m}_1$.
4. What would the update have been without bias correction?

<details><summary><strong>Solution & Walkthrough</strong></summary>

**Step 1:** Raw moments:
$$m_1 = 0.9(0) + (1 - 0.9)(4.0) = 0.1 \times 4.0 = 0.40$$
$$v_1 = 0.99(0) + (1 - 0.99)(4.0^2) = 0.01 \times 16.0 = 0.16$$

**Step 2:** Bias-corrected moments at $t=1$:
$$\hat{m}_1 = \frac{m_1}{1 - 0.9^1} = \frac{0.40}{0.10} = 4.0$$
$$\hat{v}_1 = \frac{v_1}{1 - 0.99^1} = \frac{0.16}{0.01} = 16.0$$

**Step 3:** Correct update:
$$\Delta \theta = -\frac{0.01}{\sqrt{16.0} + 10^{-8}} \times 4.0 = -\frac{0.01}{4.0} \times 4.0 = -0.0100$$
The step size exactly equals the base learning rate $\eta = 0.01$.

**Step 4:** Without bias correction:
$$\Delta \theta_{\text{uncorrected}} = -\frac{0.01}{\sqrt{0.16} + 10^{-8}} \times 0.40 = -\frac{0.01}{0.40} \times 0.40 = -0.0100$$
*Note on step 1:* Because $g_1^2$ was single-valued, $\sqrt{v_1} = \sqrt{0.01 g_1^2} = 0.1 g_1$, which coincidentally canceled out the $0.1$ in $m_1$. But at step $t=2$, if gradient drops to $g_2 = 0.0$, the uncorrected update drops to 0 immediately while the corrected version tracks the proper moving average.

</details>

---

[$\leftarrow$ Previous Module](../08-information-theory-entropy-kl-and-cross-entropy/README.md) | [Track Overview](../README.md) | [Next Module $\rightarrow$](../../03-linear-models-and-svm/00-ordinary-least-squares-and-normal-equation/README.md)
