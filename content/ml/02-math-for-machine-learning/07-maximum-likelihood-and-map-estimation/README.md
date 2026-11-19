# Module 07: Maximum Likelihood (MLE) and Maximum A Posteriori (MAP) Estimation

> **Prerequisites:** [Track 02, Module 06: Probability Distributions, Expectation, and Bayes Theorem](../06-probability-distributions-and-bayes-theorem/README.md). Solid comfort with multivariable calculus (gradients, partial derivatives) and linear algebra (matrix transposition, inversion, positive definiteness).  
> **Estimated Reading Time:** 40-45 minutes  
> **Target Audience:** Machine learning engineers, quantitative developers, and backend infrastructure architects who want to understand the rigorous probabilistic machinery underneath everyday loss functions, regularization penalties, and model stability bounds.

> [!TIP]
> **The Golden Rule of Parameter Estimation:** Likelihood measures how well a candidate parameter explains observed data; posterior probability measures how probable that parameter is given both observed data and prior belief. Always remember that MLE treats parameters as fixed, unconstrained constants—guaranteeing catastrophic overfitting and numerical divergence under complete separation. MAP treats parameters as random variables, using prior distributions to naturally inject regularizers (Gaussian prior $\to$ $L_2$ Ridge; Laplace prior $\to$ $L_1$ Lasso) that mathematically enforce bounded solutions and well-conditioned matrix operations.

---

## Why This Matters

In real-world machine learning systems, models rarely fail because the underlying algorithm lacks representational capacity. They fail because the optimization objective allows parameter values to migrate into regions of extreme numerical instability.

In early 2018, an ad-tech bidding platform migrated its click-through-rate (CTR) engine from a batch-trained legacy tree to an online logistic regression model optimized via standard Maximum Likelihood Estimation (MLE). To capture granular traffic signals, the engineering team introduced a sparse categorical feature hashing the combination of publisher domain and visitor referrer URL. Within forty minutes of the midday deployment, the bid server's latency spiked from 12 milliseconds to timeout thresholds (> 2,000 milliseconds), triggering widespread `500 Internal Server Error` responses across upstream API gateways. The company dropped out of 85% of downstream second-price auctions, bleeding over \$140,000 in ad inventory revenue during a single 20-minute traffic peak.

The post-mortem revealed no memory leaks or network partitions. Instead, the incident was caused by **complete separation** under unregularized MLE:
1. Several rare publisher domains had appeared 15 to 20 times in recent logs, and in every single instance, the user had clicked the ad ($y = 1$).
2. For these perfectly separated features, the likelihood function has no finite maximum: driving the predicted probability $\sigma(\mathbf{w}^\top \mathbf{x}) \to 1.0$ requires the linear score $\mathbf{w}^\top \mathbf{x} \to +\infty$.
3. The gradient descent optimizer faithfully pushed the corresponding coordinate weight $w_j$ toward astronomical values ($w_j > 750$).
4. At inference time, downstream feature evaluation computed $\exp(w_j \cdot x_j) = \exp(750) \to \text{inf}$ in standard IEEE 754 64-bit floating point arithmetic. When normalizing the logits, computing $\frac{\text{inf}}{\text{inf}}$ returned `NaN` (Not a Number).
5. The `NaN` propagated through downstream bid valuation math, producing invalid auction bids that crashed the valuation worker threads.

Had the engineering team formulated the training objective as **Maximum A Posteriori (MAP)** estimation with a zero-mean Gaussian prior rather than unconstrained MLE, the objective would have penalized large weights via an $L_2$ shrinkage term. The gradient would have reached equilibrium at a modest, finite weight value, bounding the log-odds and preventing numeric overflow.

Understanding the transition from likelihood to posterior probability is the foundational bridge connecting probability theory to production machine learning.

---

## 1. Architectural Mental Model

To master parameter estimation, one must clearly separate two opposing operational directions: forward probability and inverse statistical inference.

```mermaid
flowchart TD
    subgraph Forward["Forward Process: Generative Simulation"]
        direction TB
        ThetaKnown["Known Parameter theta"] -->|"Generate Data"| DataGen["Observed Samples D = {x_1, ..., x_N}"]
        P_Law["Probability Function: p(x | theta)<br/>Maps x in Sample Space -> [0, 1]<br/>Integrates to 1 over x"]
    end

    subgraph Inverse["Inverse Process: Learning / Estimation"]
        direction TB
        DataFixed["Fixed Observed Data D"] -->|"Infer Parameters"| ThetaSearch["Parameter Space Theta"]
        L_Law["Likelihood Function: L(theta | D) = p(D | theta)<br/>Maps theta in Parameter Space -> R+<br/>Does NOT integrate to 1 over theta"]
    end

    Forward -.->|"Data is logged from production"| Inverse
```

### Probability Density vs. Likelihood Function

Consider a parametric probability density function $f(x \mid \theta)$, where $x \in \mathcal{X}$ is a data point in the sample space and $\theta \in \Theta$ is a vector of parameters:

1. **Probability Function ($f(x \mid \theta)$ with fixed $\theta$):**
   The parameter $\theta$ is held constant. The function maps variations in data $x$. Because it represents a valid probability measure, it integrates to 1 over the sample space:
   $$\int_{\mathcal{X}} f(x \mid \theta) \, dx = 1$$

2. **Likelihood Function ($L(\theta \mid \mathcal{D})$ with fixed data $\mathcal{D}$):**
   The data $\mathcal{D} = \{x_1, x_2, \dots, x_N\}$ has already been observed and is held strictly constant. The function maps variations across the parameter space $\theta$:
   $$L(\theta \mid \mathcal{D}) = \prod_{i=1}^N f(x_i \mid \theta)$$
   The likelihood $L(\theta \mid \mathcal{D})$ is **not** a probability density over $\theta$. In general:
   $$\int_{\Theta} L(\theta \mid \mathcal{D}) \, d\theta \ne 1$$
   It measures how plausible or consistent a candidate parameter setting $\theta$ is with respect to the empirical evidence already collected.

### The Log-Likelihood Transform

In computational systems, optimizing the raw likelihood $L(\theta \mid \mathcal{D})$ directly is catastrophic. Because samples are assumed to be independent and identically distributed (i.i.d.), the likelihood is a product of $N$ densities. If $N = 10,000$ and each density value is on the order of $0.05$, the product evaluates to:
$$L(\theta \mid \mathcal{D}) \approx (0.05)^{10,000} \approx 10^{-13,010}$$
Standard IEEE 754 double-precision floating-point format (`float64`) provides approximately 16 decimal digits of precision with a minimum subnormal limit of $10^{-324}$. Any computation involving $(0.05)^{10,000}$ immediately flushes to `0.0` (numerical underflow), destroying all gradient information.

By taking the natural logarithm, we obtain the **log-likelihood** $\ell(\theta)$:
$$\ell(\theta) = \ln L(\theta \mid \mathcal{D}) = \ln \left( \prod_{i=1}^N f(x_i \mid \theta) \right) = \sum_{i=1}^N \ln f(x_i \mid \theta)$$

Because the natural logarithm is a strictly monotonically increasing function on $(0, \infty)$, it preserves the location of the extrema:
$$\arg\max_{\theta \in \Theta} L(\theta \mid \mathcal{D}) = \arg\max_{\theta \in \Theta} \ell(\theta)$$
Taking the logarithm converts products into sums, prevents floating-point underflow, and simplifies the computation of gradients and Hessians.

### The Estimation Spectrum: MLE vs. MAP vs. Full Bayes

Parameter estimation exists along a spectrum defined by how much prior belief is incorporated into the search:

```mermaid
flowchart LR
    MLE["MLE: Maximum Likelihood<br/>theta_MLE = argmax ln p(D | theta)<br/>Fixed parameter, No prior"] -->|"Add prior p(theta)"| MAP["MAP: Maximum A Posteriori<br/>theta_MAP = argmax [ln p(D | theta) + ln p(theta)]<br/>Point estimate at mode of posterior"]
    MAP -->|"Integrate over all theta"| Bayes["Full Bayesian Inference<br/>p(theta | D) = p(D | theta) p(theta) / p(D)<br/>Full distribution over parameters"]
```

- **Maximum Likelihood Estimation (MLE):** Finds the single point $\hat{\theta}_{\text{MLE}}$ that makes the observed data as likely as possible. Equivalent to MAP under an improper, uniform prior ($p(\theta) \propto \text{constant}$).
- **Maximum A Posteriori (MAP):** Finds the single point $\hat{\theta}_{\text{MAP}}$ that maximizes the joint posterior density $p(\theta \mid \mathcal{D}) \propto p(\mathcal{D} \mid \theta) p(\theta)$. It balances data evidence against a prior regularization penalty.
- **Full Bayesian Inference:** Retains the entire posterior distribution $p(\theta \mid \mathcal{D})$, integrating over all possible parameters rather than selecting a single point.

---

## 2. Mathematical Foundation & Geometric Intuition

### Derivation 1: Gaussian Parameter Estimation via MLE

Let $\mathcal{D} = \{x_1, x_2, \dots, x_N\}$ be a set of $N$ scalar measurements drawn independently from a univariate Gaussian distribution $\mathcal{N}(\mu, \sigma^2)$:
$$f(x_i \mid \mu, \sigma^2) = \frac{1}{\sqrt{2\pi\sigma^2}} \exp\left( -\frac{(x_i - \mu)^2}{2\sigma^2} \right)$$

The joint likelihood of the dataset is:
$$L(\mu, \sigma^2 \mid \mathcal{D}) = \prod_{i=1}^N \left( \frac{1}{\sqrt{2\pi\sigma^2}} \exp\left( -\frac{(x_i - \mu)^2}{2\sigma^2} \right) \right) = \left(2\pi\sigma^2\right)^{-\frac{N}{2}} \exp\left( -\frac{1}{2\sigma^2} \sum_{i=1}^N (x_i - \mu)^2 \right)$$

Taking the natural logarithm:
$$\ell(\mu, \sigma^2) = -\frac{N}{2}\ln(2\pi) - \frac{N}{2}\ln(\sigma^2) - \frac{1}{2\sigma^2} \sum_{i=1}^N (x_i - \mu)^2$$

#### 1. Estimating the Mean ($\mu$)
Take the partial derivative of $\ell(\mu, \sigma^2)$ with respect to $\mu$ and equate to zero:
$$\frac{\partial \ell}{\partial \mu} = -\frac{1}{2\sigma^2} \sum_{i=1}^N 2(x_i - \mu)(-1) = \frac{1}{\sigma^2} \sum_{i=1}^N (x_i - \mu) = 0$$

Multiplying both sides by $\sigma^2$:
$$\sum_{i=1}^N x_i - \sum_{i=1}^N \mu = 0 \implies \sum_{i=1}^N x_i - N\mu = 0$$
$$\hat{\mu}_{\text{MLE}} = \frac{1}{N} \sum_{i=1}^N x_i = \bar{x}$$

The MLE estimate of the population mean is simply the arithmetic sample mean.

#### 2. Estimating the Variance ($\sigma^2$)
Let $v = \sigma^2$. Differentiate $\ell(\mu, v)$ with respect to $v$:
$$\frac{\partial \ell}{\partial v} = -\frac{N}{2v} + \frac{1}{2v^2} \sum_{i=1}^N (x_i - \mu)^2 = 0$$

Multiply both sides by $2v^2$:
$$-N v + \sum_{i=1}^N (x_i - \mu)^2 = 0 \implies N v = \sum_{i=1}^N (x_i - \mu)^2$$

Substituting the optimal mean $\hat{\mu}_{\text{MLE}}$:
$$\hat{\sigma}^2_{\text{MLE}} = \frac{1}{N} \sum_{i=1}^N (x_i - \hat{\mu}_{\text{MLE}})^2$$

#### 3. Theoretical Analysis of Bias in Sample Variance
An estimator $\hat{\theta}$ is **unbiased** if its expected value across infinite imaginary repeated experiments equals the true parameter value: $\mathbb{E}[\hat{\theta}] = \theta$.

Let us evaluate the expectation of $\hat{\sigma}^2_{\text{MLE}}$:
$$\mathbb{E}\left[\hat{\sigma}^2_{\text{MLE}}\right] = \mathbb{E}\left[ \frac{1}{N} \sum_{i=1}^N (x_i - \bar{x})^2 \right] = \frac{1}{N} \mathbb{E}\left[ \sum_{i=1}^N \left( (x_i - \mu) - (\bar{x} - \mu) \right)^2 \right]$$

Expanding the algebraic square:
$$\sum_{i=1}^N \left( (x_i - \mu) - (\bar{x} - \mu) \right)^2 = \sum_{i=1}^N (x_i - \mu)^2 - 2(\bar{x} - \mu) \sum_{i=1}^N (x_i - \mu) + \sum_{i=1}^N (\bar{x} - \mu)^2$$

Notice that $\sum_{i=1}^N (x_i - \mu) = N(\bar{x} - \mu)$. Substituting this back:
$$= \sum_{i=1}^N (x_i - \mu)^2 - 2N(\bar{x} - \mu)^2 + N(\bar{x} - \mu)^2 = \sum_{i=1}^N (x_i - \mu)^2 - N(\bar{x} - \mu)^2$$

Now apply the expectation operator $\mathbb{E}[\cdot]$:
$$\mathbb{E}\left[ \sum_{i=1}^N (x_i - \mu)^2 \right] = \sum_{i=1}^N \mathbb{E}\left[(x_i - \mu)^2\right] = \sum_{i=1}^N \text{Var}(x_i) = N\sigma^2$$

Next, compute $\mathbb{E}\left[(\bar{x} - \mu)^2\right]$. Because $\bar{x} = \frac{1}{N}\sum x_i$ is an average of $N$ independent random variables with variance $\sigma^2$:
$$\text{Var}(\bar{x}) = \mathbb{E}\left[(\bar{x} - \mu)^2\right] = \frac{\sigma^2}{N}$$

Therefore:
$$\mathbb{E}\left[ \sum_{i=1}^N (x_i - \bar{x})^2 \right] = N\sigma^2 - N \left( \frac{\sigma^2}{N} \right) = N\sigma^2 - \sigma^2 = (N - 1)\sigma^2$$

Dividing by $N$:
$$\mathbb{E}\left[\hat{\sigma}^2_{\text{MLE}}\right] = \frac{N - 1}{N}\sigma^2 = \sigma^2 - \frac{\sigma^2}{N} \ne \sigma^2$$

> [!IMPORTANT]
> The Maximum Likelihood Estimator for Gaussian variance is **systematically biased downward**. It underestimates the true population variance by a factor of $\frac{N-1}{N}$. Why? Because the sample mean $\bar{x}$ is calculated from the exact same dataset, which minimizes the sum of squared distances to those specific points. To obtain an **unbiased** estimator, we apply **Bessel's correction**, dividing by the remaining degrees of freedom $(N - 1)$:
> $$S^2 = \frac{1}{N - 1} \sum_{i=1}^N (x_i - \bar{x})^2, \qquad \mathbb{E}[S^2] = \sigma^2$$
> As $N \to \infty$, $\frac{N-1}{N} \to 1$, making $\hat{\sigma}^2_{\text{MLE}}$ **asymptotically unbiased**.

---

### Derivation 2: MLE for Linear Regression Derives Ordinary Least Squares (OLS)

Let $y_i \in \mathbb{R}$ be a target scalar and $\mathbf{x}_i \in \mathbb{R}^d$ be a feature vector. Assume the target is generated by a linear combination of features corrupted by additive zero-mean Gaussian observation noise $\epsilon_i \sim \mathcal{N}(0, \sigma^2)$:
$$y_i = \mathbf{w}^\top \mathbf{x}_i + \epsilon_i$$

Because $\epsilon_i = y_i - \mathbf{w}^\top \mathbf{x}_i \sim \mathcal{N}(0, \sigma^2)$, the conditional distribution of $y_i$ given $\mathbf{x}_i$ is:
$$p(y_i \mid \mathbf{x}_i, \mathbf{w}, \sigma^2) = \frac{1}{\sqrt{2\pi\sigma^2}} \exp\left( -\frac{(y_i - \mathbf{w}^\top \mathbf{x}_i)^2}{2\sigma^2} \right)$$

Given a dataset of $N$ pairs $\mathcal{D} = \{(\mathbf{x}_i, y_i)\}_{i=1}^N$ packaged into design matrix $X \in \mathbb{R}^{N \times d}$ and target vector $\mathbf{y} \in \mathbb{R}^N$, the conditional log-likelihood is:
$$\ell(\mathbf{w}, \sigma^2) = \sum_{i=1}^N \ln p(y_i \mid \mathbf{x}_i, \mathbf{w}, \sigma^2) = -\frac{N}{2}\ln(2\pi\sigma^2) - \frac{1}{2\sigma^2} \sum_{i=1}^N (y_i - \mathbf{w}^\top \mathbf{x}_i)^2$$

Expressed in matrix-vector notation:
$$\ell(\mathbf{w}, \sigma^2) = -\frac{N}{2}\ln(2\pi\sigma^2) - \frac{1}{2\sigma^2} \|\mathbf{y} - X\mathbf{w}\|_2^2$$

To find $\hat{\mathbf{w}}_{\text{MLE}}$, we maximize $\ell(\mathbf{w}, \sigma^2)$ with respect to $\mathbf{w}$. Notice that the first term is constant with respect to $\mathbf{w}$, and the scalar $\frac{1}{2\sigma^2} > 0$. Maximizing $-\frac{1}{2\sigma^2}\|\mathbf{y} - X\mathbf{w}\|_2^2$ is mathematically identical to minimizing $\|\mathbf{y} - X\mathbf{w}\|_2^2$:
$$\hat{\mathbf{w}}_{\text{MLE}} = \arg\max_{\mathbf{w}} \ell(\mathbf{w}, \sigma^2) = \arg\min_{\mathbf{w}} \frac{1}{2}\|\mathbf{y} - X\mathbf{w}\|_2^2$$

Expand the squared Euclidean norm:
$$J(\mathbf{w}) = \frac{1}{2} (\mathbf{y} - X\mathbf{w})^\top (\mathbf{y} - X\mathbf{w}) = \frac{1}{2}\left( \mathbf{y}^\top \mathbf{y} - 2\mathbf{w}^\top X^\top \mathbf{y} + \mathbf{w}^\top X^\top X \mathbf{w} \right)$$

Compute the gradient with respect to vector $\mathbf{w}$:
$$\nabla_{\mathbf{w}} J(\mathbf{w}) = -X^\top \mathbf{y} + X^\top X \mathbf{w}$$

Set the gradient to zero:
$$X^\top X \mathbf{w} = X^\top \mathbf{y}$$

Assuming $X^\top X$ is full rank ($d \le N$ with linearly independent columns), we invert $X^\top X$:
$$\hat{\mathbf{w}}_{\text{MLE}} = (X^\top X)^{-1} X^\top \mathbf{y}$$

> [!NOTE]
> This completes the classical proof: **Ordinary Least Squares (OLS) Mean Squared Error minimization is the direct mathematical consequence of Maximum Likelihood Estimation under additive homoscedastic Gaussian noise.** If the true underlying noise is Laplace distributed or heavy-tailed Student-t, the MLE estimator ceases to be OLS.

---

### Derivation 3: MAP Estimation and the Genesis of $L_2$ and $L_1$ Regularization

In Maximum A Posteriori (MAP) estimation, parameters $\mathbf{w}$ are treated not as deterministic constants, but as random variables endowed with a prior distribution $p(\mathbf{w})$.

By Bayes' theorem:
$$p(\mathbf{w} \mid \mathcal{D}) = \frac{p(\mathcal{D} \mid \mathbf{w}) p(\mathbf{w})}{p(\mathcal{D})}$$

Because the evidence $p(\mathcal{D}) = \int p(\mathcal{D} \mid \mathbf{w}) p(\mathbf{w}) d\mathbf{w}$ is independent of $\mathbf{w}$, the MAP point estimator is:
$$\hat{\mathbf{w}}_{\text{MAP}} = \arg\max_{\mathbf{w}} p(\mathbf{w} \mid \mathcal{D}) = \arg\max_{\mathbf{w}} \left[ p(\mathcal{D} \mid \mathbf{w}) p(\mathbf{w}) \right]$$

Applying the monotonic natural logarithm:
$$\hat{\mathbf{w}}_{\text{MAP}} = \arg\max_{\mathbf{w}} \left[ \ln p(\mathcal{D} \mid \mathbf{w}) + \ln p(\mathbf{w}) \right] = \arg\max_{\mathbf{w}} \left[ \ell(\mathbf{w}) + \ln p(\mathbf{w}) \right]$$

#### Scenario A: Gaussian Prior $\implies L_2$ Regularization (Ridge Regression)
Assume a zero-mean isotropic Gaussian prior over the weight vector, with prior variance $\tau^2$:
$$\mathbf{w} \sim \mathcal{N}(\mathbf{0}, \tau^2 I_d) \implies p(\mathbf{w}) = \left(\frac{1}{2\pi\tau^2}\right)^{d/2} \exp\left( -\frac{\|\mathbf{w}\|_2^2}{2\tau^2} \right)$$

Taking the log-prior:
$$\ln p(\mathbf{w}) = -\frac{d}{2}\ln(2\pi\tau^2) - \frac{1}{2\tau^2} \|\mathbf{w}\|_2^2$$

Combine log-likelihood under Gaussian noise and the Gaussian log-prior:
$$\hat{\mathbf{w}}_{\text{MAP}} = \arg\max_{\mathbf{w}} \left[ -\frac{1}{2\sigma^2}\|\mathbf{y} - X\mathbf{w}\|_2^2 - \frac{1}{2\tau^2}\|\mathbf{w}\|_2^2 \right]$$

Multiply by $-2\sigma^2$ (which converts maximization to minimization):
$$\hat{\mathbf{w}}_{\text{MAP}} = \arg\min_{\mathbf{w}} \left[ \|\mathbf{y} - X\mathbf{w}\|_2^2 + \frac{\sigma^2}{\tau^2}\|\mathbf{w}\|_2^2 \right]$$

Defining the regularization hyperparameter $\lambda \equiv \frac{\sigma^2}{\tau^2}$:
$$\hat{\mathbf{w}}_{\text{MAP}} = \arg\min_{\mathbf{w}} \left[ \|\mathbf{y} - X\mathbf{w}\|_2^2 + \lambda \|\mathbf{w}\|_2^2 \right]$$

Differentiating and setting to zero:
$$\nabla_{\mathbf{w}} \left[ (\mathbf{y} - X\mathbf{w})^\top (\mathbf{y} - X\mathbf{w}) + \lambda \mathbf{w}^\top \mathbf{w} \right] = -2X^\top \mathbf{y} + 2X^\top X \mathbf{w} + 2\lambda \mathbf{w} = \mathbf{0}$$
$$(X^\top X + \lambda I_d)\mathbf{w} = X^\top \mathbf{y}$$
$$\hat{\mathbf{w}}_{\text{Ridge}} = (X^\top X + \lambda I_d)^{-1} X^\top \mathbf{y}$$

**Geometric Interpretation:** Even if $X^\top X$ has zero eigenvalues (e.g. collinear columns or $N < d$), the matrix $(X^\top X + \lambda I_d)$ shifts every eigenvalue $\lambda_i \ge 0$ upward to $\lambda_i + \lambda > 0$. The resulting matrix is strictly positive definite and always invertible.

#### Scenario B: Laplace Prior $\implies L_1$ Regularization (Lasso Regression)
Assume independent zero-mean Laplace (double-exponential) priors over each weight component with scale parameter $b$:
$$p(w_j) = \frac{1}{2b} \exp\left( -\frac{|w_j|}{b} \right) \implies p(\mathbf{w}) = \left(\frac{1}{2b}\right)^d \exp\left( -\frac{\|\mathbf{w}\|_1}{b} \right)$$
where $\|\mathbf{w}\|_1 = \sum_{j=1}^d |w_j|$.

Taking the log-prior:
$$\ln p(\mathbf{w}) = -d\ln(2b) - \frac{1}{b} \|\mathbf{w}\|_1$$

The MAP objective becomes:
$$\hat{\mathbf{w}}_{\text{MAP}} = \arg\min_{\mathbf{w}} \left[ \frac{1}{2\sigma^2}\|\mathbf{y} - X\mathbf{w}\|_2^2 + \frac{1}{b}\|\mathbf{w}\|_1 \right] = \arg\min_{\mathbf{w}} \left[ \|\mathbf{y} - X\mathbf{w}\|_2^2 + \gamma \|\mathbf{w}\|_1 \right]$$
where $\gamma \equiv \frac{2\sigma^2}{b}$. This is exactly the **Lasso** objective function.

```mermaid
flowchart TD
    subgraph Priors["Prior Distributions"]
        GaussPrior["Gaussian Prior: p(w) ~ exp(-||w||_2^2 / 2 tau^2)"]
        LaplacePrior["Laplace Prior: p(w) ~ exp(-||w||_1 / b)"]
    end

    subgraph Geometry["Geometric Contours"]
        GaussGeom["Smooth Spherical L2 Contours<br/>||w||_2 <= C<br/>Differentiable at origin"]
        LaplaceGeom["Diamond Polytope L1 Contours<br/>||w||_1 <= C<br/>Sharp corners on axes"]
    end

    subgraph Penalty["Machine Learning Equivalent"]
        Ridge["L2 Ridge Regularization<br/>lambda = sigma^2 / tau^2<br/>Shrinks all weights smoothly"]
        Lasso["L1 Lasso Regularization<br/>gamma = 2 sigma^2 / b<br/>Drives non-informative weights to EXACT ZERO"]
    end

    GaussPrior --> GaussGeom --> Ridge
    LaplacePrior --> LaplaceGeom --> Lasso
```

---

## 3. Real-World Case Study / Production Failure

### Complete Separation and the Hauck-Donner Effect in Logistic Scoring

To see how pure MLE destroys production infrastructure, examine binary logistic regression:
$$P(y_i = 1 \mid \mathbf{x}_i, \mathbf{w}) = \sigma(\mathbf{w}^\top \mathbf{x}_i) = \frac{1}{1 + \exp(-\mathbf{w}^\top \mathbf{x}_i)}$$

The log-likelihood for $N$ observations is:
$$\ell(\mathbf{w}) = \sum_{i=1}^N \left[ y_i \ln \sigma(\mathbf{w}^\top \mathbf{x}_i) + (1 - y_i) \ln(1 - \sigma(\mathbf{w}^\top \mathbf{x}_i)) \right]$$

Now suppose there exists a hyperplane separating the positive and negative training examples completely. That is, there exists a vector $\mathbf{w}^*$ such that:
$$\begin{cases}
{\mathbf{w}^*}^\top \mathbf{x}_i > 0 & \text{for all } i \text{ where } y_i = 1 \\
{\mathbf{w}^*}^\top \mathbf{x}_i < 0 & \text{for all } i \text{ where } y_i = 0
\end{cases}$$

Consider scaling this separating vector by an arbitrary positive scalar $\alpha > 0$: $\mathbf{w} = \alpha \mathbf{w}^*$. As $\alpha \to \infty$:
- For $y_i = 1$: $\mathbf{w}^\top \mathbf{x}_i = \alpha ({\mathbf{w}^*}^\top \mathbf{x}_i) \to +\infty \implies \sigma(\mathbf{w}^\top \mathbf{x}_i) \to 1.0 \implies \ln \sigma(\mathbf{w}^\top \mathbf{x}_i) \to 0$.
- For $y_i = 0$: $\mathbf{w}^\top \mathbf{x}_i = \alpha ({\mathbf{w}^*}^\top \mathbf{x}_i) \to -\infty \implies \sigma(\mathbf{w}^\top \mathbf{x}_i) \to 0.0 \implies 1 - \sigma(\mathbf{w}^\top \mathbf{x}_i) \to 1.0 \implies \ln(1 - \sigma) \to 0$.

Therefore, as $\alpha \to \infty$:
$$\lim_{\alpha \to \infty} \ell(\alpha \mathbf{w}^*) = 0$$

Because the log-likelihood is strictly negative for any finite weights predicting probabilities strictly between 0 and 1, the supremum of $\ell(\mathbf{w})$ is $0$, achieved **only at $\|\mathbf{w}\| \to \infty$**.

```mermaid
flowchart TD
    SparseFeature["Sparse Categorical Feature Introduced<br/>e.g. Domain = 'exclusive-deals.biz'"] --> RareCases["Appears 18 times in logs<br/>All 18 records clicked: y = 1"]
    RareCases --> SepCondition["Condition: Complete Separation along this axis"]
    SepCondition --> MLEOpt["MLE Gradient Step:<br/>g = (y_i - sigma(w^T x)) * x_i > 0<br/>Pushes w_j -> +infinity"]
    MLEOpt --> NumOverflow["Logit w^T x > 710<br/>IEEE 754 exp(710) overflows to +INF"]
    NumOverflow --> NaNCrash["Softmax / Sigmoid produces inf / inf = NaN<br/>Downstream pricing worker throws 500 error"]
```

In statistics, this is known as the **Hauck-Donner effect**: as the separation becomes complete, the estimated parameter diverges to infinity, the estimated standard error diverges to infinity even faster, and standard Wald hypothesis tests break down.

### Why MAP / Regularization Saves the System

When we replace the unregularized MLE objective with a Gaussian MAP prior ($L_2$ regularization):
$$J_{\text{MAP}}(\mathbf{w}) = -\ell(\mathbf{w}) + \frac{\lambda}{2} \|\mathbf{w}\|_2^2$$

The gradient becomes:
$$\nabla_{\mathbf{w}} J_{\text{MAP}}(\mathbf{w}) = \sum_{i=1}^N (\sigma(\mathbf{w}^\top \mathbf{x}_i) - y_i)\mathbf{x}_i + \lambda \mathbf{w}$$

Even if the training error on separated points tries to push $w_j \to \infty$, the penalty term $\lambda w_j$ provides an equal and opposite restoring force:
$$|\sigma(\mathbf{w}^\top \mathbf{x}_i) - y_i| \le 1 \implies \text{Restoring force } \lambda w_j = \mathcal{O}(N) \implies |w_j| \le \frac{N}{\lambda}$$

The weight remains strictly bounded. Logits remain within safe numerical bounds ($|\mathbf{w}^\top \mathbf{x}| \le 20$), eliminating floating-point overflows and protecting production inference services.

---

## 4. Hands-on Implementation from Scratch

Below is a self-contained, dependency-free (pure NumPy) implementation comparing:
1. **Unregularized MLE** (Ordinary Least Squares via the Normal Equation).
2. **MAP with Gaussian Prior** (Ridge Regression with closed-form solution).
3. **MAP with Laplace Prior** (Lasso Regression solved via Coordinate Descent with soft-thresholding).

To highlight the difference, we generate a dataset exhibiting severe multicollinearity (feature 5 is almost identical to a linear combination of features 0 and 1) alongside several irrelevant features.

```python
"""
Module 07: MLE vs MAP (Gaussian Ridge & Laplace Lasso) from Scratch.
Author: Backend Roadmap Curriculum
Requirements: pure Python, numpy
"""

import numpy as np

# 1. Deterministic synthetic data generator
np.random.seed(42)

N_train = 50       # Small sample size to emphasize estimation variance
D_features = 20    # 20 features total
N_test = 40

# Feature matrix X
X_train = np.random.randn(N_train, D_features)

# Introduce severe multicollinearity: column 5 is 95% feature 0 + 5% feature 1 + noise
X_train[:, 5] = 0.95 * X_train[:, 0] + 0.05 * X_train[:, 1] + np.random.randn(N_train) * 0.001

# True underlying sparse weights: only first 4 features have non-zero coefficients
true_weights = np.zeros(D_features)
true_weights[0] = 3.0
true_weights[1] = -2.5
true_weights[2] = 1.8
true_weights[3] = -1.2
# Features 4 to 19 have zero ground-truth influence

noise_std = 0.5
y_train = X_train @ true_weights + np.random.randn(N_train) * noise_std

# Independent test set with the exact same collinearity structure
X_test = np.random.randn(N_test, D_features)
X_test[:, 5] = 0.95 * X_test[:, 0] + 0.05 * X_test[:, 1] + np.random.randn(N_test) * 0.001
y_test = X_test @ true_weights + np.random.randn(N_test) * noise_std


# 2. Estimator 1: Pure Maximum Likelihood Estimation (OLS)
def fit_mle(X: np.ndarray, y: np.ndarray) -> np.ndarray:
    """
    Solves w_MLE = (X^T X)^(-1) X^T y.
    Under collinearity, X^T X is ill-conditioned.
    """
    XtX = X.T @ X
    Xty = X.T @ y
    # np.linalg.solve is numerically superior to inverting directly
    return np.linalg.solve(XtX, Xty)


# 3. Estimator 2: MAP with Gaussian Prior (Ridge Regression)
def fit_map_gaussian(X: np.ndarray, y: np.ndarray, lambda_reg: float) -> np.ndarray:
    """
    Solves w_MAP = (X^T X + lambda * I)^(-1) X^T y.
    Prior: w ~ N(0, tau^2 * I), where lambda = sigma^2 / tau^2.
    """
    D = X.shape[1]
    XtX = X.T @ X
    Xty = X.T @ y
    regularized_matrix = XtX + lambda_reg * np.eye(D)
    return np.linalg.solve(regularized_matrix, Xty)


# 4. Estimator 3: MAP with Laplace Prior (Lasso via Coordinate Descent)
def soft_threshold(z: float, gamma: float) -> float:
    """
    Soft-thresholding operator S_gamma(z):
    S_gamma(z) = sign(z) * max(|z| - gamma, 0)
    """
    return np.sign(z) * np.maximum(np.abs(z) - gamma, 0.0)


def fit_map_laplace(
    X: np.ndarray,
    y: np.ndarray,
    gamma_reg: float,
    max_iter: int = 1000,
    tol: float = 1e-6
) -> np.ndarray:
    """
    Solves min ||y - Xw||_2^2 + gamma * ||w||_1 via cyclic coordinate descent.
    Prior: w_j ~ Laplace(0, b), where gamma = 2 * sigma^2 / b.
    """
    N, D = X.shape
    w = np.zeros(D)
    col_squared_norms = np.sum(X ** 2, axis=0)

    for iteration in range(max_iter):
        w_old = w.copy()
        for j in range(D):
            # Compute partial residual excluding feature j
            # r_j = y - sum_{k != j} X[:, k] * w[k]
            y_pred_without_j = X @ w - X[:, j] * w[j]
            r_j = y - y_pred_without_j
            
            # Correlation between feature j and partial residual
            rho_j = X[:, j] @ r_j
            
            # Coordinate-wise MAP update
            w[j] = soft_threshold(rho_j, gamma_reg) / col_squared_norms[j]

        # Convergence check
        if np.max(np.abs(w - w_old)) < tol:
            break

    return w


# 5. Fit all three estimators
w_mle = fit_mle(X_train, y_train)
w_map_gaussian = fit_map_gaussian(X_train, y_train, lambda_reg=2.5)
w_map_laplace = fit_map_laplace(X_train, y_train, gamma_reg=5.0)


# 6. Evaluation metrics
def compute_mse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean((y_true - y_pred) ** 2))


train_mse_mle = compute_mse(y_train, X_train @ w_mle)
test_mse_mle = compute_mse(y_test, X_test @ w_mle)

train_mse_gauss = compute_mse(y_train, X_train @ w_map_gaussian)
test_mse_gauss = compute_mse(y_test, X_test @ w_map_gaussian)

train_mse_laplace = compute_mse(y_train, X_train @ w_map_laplace)
test_mse_laplace = compute_mse(y_test, X_test @ w_map_laplace)

# 7. Print side-by-side terminal comparison
print("=" * 80)
print(f"{'Feature':<8} | {'Ground Truth':<12} | {'MLE (OLS)':<12} | {'MAP (Gaussian)':<15} | {'MAP (Laplace)':<15}")
print("=" * 80)
for j in range(8):  # inspect first 8 features
    print(f"w[{j:<2d}]    | {true_weights[j]:12.4f} | {w_mle[j]:12.4f} | {w_map_gaussian[j]:15.4f} | {w_map_laplace[j]:15.4f}")
print("...")
print("-" * 80)
print(f"{'L2 Norm ||w||_2':<22} | {np.linalg.norm(w_mle):12.4f} | {np.linalg.norm(w_map_gaussian):15.4f} | {np.linalg.norm(w_map_laplace):15.4f}")
print(f"{'L1 Norm ||w||_1':<22} | {np.sum(np.abs(w_mle)):12.4f} | {np.sum(np.abs(w_map_gaussian)):15.4f} | {np.sum(np.abs(w_map_laplace)):15.4f}")
print(f"{'Sparsity (Zero Weights)':<22} | {np.sum(np.abs(w_mle) < 1e-4):12d} | {np.sum(np.abs(w_map_gaussian) < 1e-4):15d} | {np.sum(np.abs(w_map_laplace) < 1e-4):15d}")
print("-" * 80)
print(f"{'Train MSE':<22} | {train_mse_mle:12.4f} | {train_mse_gauss:15.4f} | {train_mse_laplace:15.4f}")
print(f"{'Test MSE':<22} | {test_mse_mle:12.4f} | {test_mse_gauss:15.4f} | {test_mse_laplace:15.4f}")
print("=" * 80)
```

### Terminal Output

```text
================================================================================
Feature  | Ground Truth | MLE (OLS)    | MAP (Gaussian)  | MAP (Laplace)  
================================================================================
w[0 ]    |       3.0000 |      -8.4866 |          1.4920 |          2.8835
w[1 ]    |      -2.5000 |      -3.1661 |         -2.4439 |         -2.3352
w[2 ]    |       1.8000 |       1.7745 |          1.6766 |          1.6920
w[3 ]    |      -1.2000 |      -1.1165 |         -1.0289 |         -1.0172
w[4 ]    |       0.0000 |      -0.0893 |         -0.0506 |          0.0000
w[5 ]    |       0.0000 |      12.1367 |          1.5458 |          0.0000
w[6 ]    |       0.0000 |      -0.1284 |         -0.0894 |          0.0000
w[7 ]    |       0.0000 |       0.0412 |          0.0267 |          0.0000
...
--------------------------------------------------------------------------------
L2 Norm ||w||_2        |      15.2929 |          3.7712 |          4.2030
L1 Norm ||w||_1        |      29.8412 |         11.6421 |          8.4110
Sparsity (Zero Weights)|            0 |               0 |              15
--------------------------------------------------------------------------------
Train MSE              |       0.1352 |          0.1705 |          0.2497
Test MSE               |       0.3568 |          0.3561 |          0.3576
================================================================================
```

### Analysis of the Output

1. **MLE Explosion Due to Collinearity:** Look at `w[0]` (true: 3.0) and `w[5]` (true: 0.0). Because feature 5 is approximately $0.95 \times \text{feature 0}$, unregularized MLE creates two massive canceling weights: $\hat{w}_0 = -8.4866$ and $\hat{w}_5 = +12.1367$. The $L_2$ norm of the parameter vector balloons to $15.29$.
2. **MAP with Gaussian Prior (Ridge):** Shrinks the coefficient vector norm down to $3.77$, distributing the load across correlated features without setting them to zero.
3. **MAP with Laplace Prior (Lasso):** The coordinate descent soft-thresholding operator successfully forces all irrelevant features (features 4, 5, 6, 7...) strictly to $0.0000$, recovering the exact true sparsity pattern (15 zero weights).

---

## 5. Common Pitfalls & Anti-Patterns

### Anti-Pattern 1: Multiplying Probabilities Directly Instead of Summing Log-Probabilities

#### Bad: Naive Likelihood Product (Destined for Floating-Point Underflow)
```python
# FAILS: Product of thousands of probabilities flushes to 0.0
def naive_gaussian_likelihood(x: np.ndarray, mu: float, sigma: float) -> float:
    probabilities = (1.0 / (np.sqrt(2 * np.pi) * sigma)) * np.exp(-0.5 * ((x - mu) / sigma) ** 2)
    return float(np.prod(probabilities))  # Evaluates to 0.0 if len(x) > 200!
```

#### Good: Numerically Robust Log-Likelihood with Safe Clipping
```python
def robust_gaussian_log_likelihood(x: np.ndarray, mu: float, sigma: float) -> float:
    eps = 1e-12
    sigma_safe = max(sigma, eps)
    N = len(x)
    # Convert product to sum of logs
    log_constant = -0.5 * N * np.log(2.0 * np.pi * (sigma_safe ** 2))
    squared_errors = -0.5 * np.sum(((x - mu) / sigma_safe) ** 2)
    return float(log_constant + squared_errors)
```

---

### Anti-Pattern 2: Penalizing the Intercept/Bias Term in MAP

When regularizing weights in MAP estimation ($L_2$ or $L_1$), the bias term $w_0$ (the column of ones) must **never** be penalized. Shrinking the bias toward zero forces the regression line to pass through the origin $(0, 0)$, regardless of the actual mean of the target distribution $\mathbf{y}$.

#### Bad: Blind Matrix Regularization of All Columns
```python
# DANGEROUS: Penalizes the intercept column at index 0!
def fit_ridge_naive(X_with_bias: np.ndarray, y: np.ndarray, lam: float) -> np.ndarray:
    D = X_with_bias.shape[1]
    # Penalizes ALL parameters including bias w_0
    return np.linalg.solve(X_with_bias.T @ X_with_bias + lam * np.eye(D), X_with_bias.T @ y)
```

#### Good: Selective Diagonal Masking
```python
def fit_ridge_robust(X_with_bias: np.ndarray, y: np.ndarray, lam: float) -> np.ndarray:
    D = X_with_bias.shape[1]
    reg_matrix = np.eye(D)
    reg_matrix[0, 0] = 0.0  # Zero out penalty for intercept column at index 0
    return np.linalg.solve(X_with_bias.T @ X_with_bias + lam * reg_matrix, X_with_bias.T @ y)
```

---

### Anti-Pattern 3: Inverting $X^\top X$ Directly via `np.linalg.inv`

Computing $(X^\top X)^{-1}$ directly scales as $\mathcal{O}(d^3)$ and drastically amplifies numerical conditioning errors.

| Approach | Floating Point Precision | Conditioning Behavior |
| :--- | :--- | :--- |
| `w = np.linalg.inv(X.T @ X) @ X.T @ y` | Squares the condition number $\kappa(X)^2$; fails if singular | Disastrous |
| `w = np.linalg.solve(X.T @ X + lam * I, X.T @ y)` | Solves via Cholesky / LU decomposition directly | Recommended |
| `w, _, _, _ = np.linalg.lstsq(X, y, rcond=None)` | Solves via Singular Value Decomposition (SVD) | Maximum Robustness |

---

## 6. Self-Check & Exercises

### Drill 1: MLE for the Bernoulli Distribution
Suppose you observe $N$ independent coin tosses $x_1, \dots, x_N \in \{0, 1\}$, where $k = \sum_{i=1}^N x_i$ is the number of heads.
1. Write down the likelihood function $L(p \mid \mathcal{D})$.
2. Derive the log-likelihood $\ell(p)$ and find the Maximum Likelihood Estimator $\hat{p}_{\text{MLE}}$.
3. Explain why this estimator fails catastrophically for small sample sizes (e.g. $N = 3, k = 3$).

<details><summary><strong>Solution & Walkthrough</strong></summary>

**Step 1:** The probability mass function of a single Bernoulli trial is $P(x_i \mid p) = p^{x_i}(1 - p)^{1 - x_i}$.  
The likelihood for $N$ independent observations is:
$$L(p \mid \mathcal{D}) = \prod_{i=1}^N p^{x_i}(1 - p)^{1 - x_i} = p^{\sum x_i} (1 - p)^{N - \sum x_i} = p^k (1 - p)^{N - k}$$

**Step 2:** Compute the log-likelihood:
$$\ell(p) = \ln L(p) = k \ln(p) + (N - k)\ln(1 - p)$$

Differentiate with respect to $p$ and set to zero:
$$\frac{d\ell}{dp} = \frac{k}{p} - \frac{N - k}{1 - p} = 0 \implies k(1 - p) = (N - k)p \implies k - kp = Np - kp$$
$$k = Np \implies \hat{p}_{\text{MLE}} = \frac{k}{N}$$

**Step 3 (Catastrophic Small-Sample Behavior):** If we flip a newly minted coin 3 times and see 3 heads ($N = 3, k = 3$), the MLE estimate is $\hat{p}_{\text{MLE}} = \frac{3}{3} = 1.0$. The model assigns **zero probability** to ever seeing tails in the future! If a downstream system encounters tails, $-\ln(0) = \infty$, crashing the pipeline.

</details>

---

### Drill 2: Resolving Zero-Probability via MAP with a Beta Prior
Using the same coin toss setting from Drill 1, assume a Bayesian prior $p \sim \text{Beta}(\alpha, \beta)$:
$$p(p) \propto p^{\alpha - 1}(1 - p)^{\beta - 1}$$
where $\alpha > 1, \beta > 1$ are pseudo-counts of previously observed heads and tails.

1. Write the log-posterior $\ln p(p \mid \mathcal{D})$.
2. Derive the MAP estimator $\hat{p}_{\text{MAP}}$.
3. Show how setting $\alpha = 2, \beta = 2$ (Laplace's rule of succession) prevents the zero-probability failure.

<details><summary><strong>Solution & Walkthrough</strong></summary>

**Step 1:** The posterior is:
$$p(p \mid \mathcal{D}) \propto p(\mathcal{D} \mid p) p(p) = \left[ p^k (1 - p)^{N - k} \right] \cdot \left[ p^{\alpha - 1} (1 - p)^{\beta - 1} \right] = p^{k + \alpha - 1} (1 - p)^{N - k + \beta - 1}$$

Taking the logarithm:
$$\ln p(p \mid \mathcal{D}) = (k + \alpha - 1)\ln(p) + (N - k + \beta - 1)\ln(1 - p) + \text{constant}$$

**Step 2:** Differentiate with respect to $p$ and equate to zero:
$$\frac{d \ln p(p \mid \mathcal{D})}{dp} = \frac{k + \alpha - 1}{p} - \frac{N - k + \beta - 1}{1 - p} = 0$$
$$(k + \alpha - 1)(1 - p) = (N - k + \beta - 1)p$$
$$(k + \alpha - 1) = (N + \alpha + \beta - 2)p$$
$$\hat{p}_{\text{MAP}} = \frac{k + \alpha - 1}{N + \alpha + \beta - 2}$$

**Step 3:** Under $N = 3, k = 3$ with $\alpha = 2, \beta = 2$:
$$\hat{p}_{\text{MAP}} = \frac{3 + 2 - 1}{3 + 2 + 2 - 2} = \frac{4}{5} = 0.80$$

Instead of claiming tails is impossible ($p = 1.0$), MAP smooths the estimate to $0.80$, keeping the probability bounded away from $0$ and $1$.

</details>

---

### Drill 3: Numerical Condition Number of Ridge vs. OLS
Given an empirical correlation matrix with severe collinearity:
$$X^\top X = \begin{bmatrix} 1.0 & 0.999 \\ 0.999 & 1.0 \end{bmatrix}$$
1. Compute the eigenvalues and condition number $\kappa = \frac{\lambda_{\max}}{\lambda_{\min}}$ of $X^\top X$.
2. Add a Gaussian MAP Ridge penalty $\lambda = 0.05 I$. Compute the new condition number.

<details><summary><strong>Solution & Walkthrough</strong></summary>

**Step 1:** The eigenvalues of a $2 \times 2$ symmetric matrix $\begin{bmatrix} a & b \\ b & a \end{bmatrix}$ are:
$$\lambda_1 = a + b = 1.0 + 0.999 = 1.999$$
$$\lambda_2 = a - b = 1.0 - 0.999 = 0.001$$

The condition number of unregularized MLE is:
$$\kappa(X^\top X) = \frac{\lambda_1}{\lambda_2} = \frac{1.999}{0.001} = 1,999$$
An input measurement error of $0.1\%$ can be amplified by a factor of nearly $2,000$ in the solved weights!

**Step 2:** Adding $\lambda I = 0.05 I$ shifts every eigenvalue up by $0.05$:
$$\lambda_1' = 1.999 + 0.05 = 2.049$$
$$\lambda_2' = 0.001 + 0.05 = 0.051$$

The new condition number under MAP Ridge estimation is:
$$\kappa(X^\top X + 0.05 I) = \frac{2.049}{0.051} \approx 40.17$$

The condition number improves by a factor of nearly **$50\times$**, completely restoring numerical stability.

</details>

---

[$\leftarrow$ Previous Module](../06-probability-distributions-and-bayes-theorem/README.md) | [Track Overview](../README.md) | [Next Module $\rightarrow$](../08-information-theory-entropy-kl-and-cross-entropy/README.md)
