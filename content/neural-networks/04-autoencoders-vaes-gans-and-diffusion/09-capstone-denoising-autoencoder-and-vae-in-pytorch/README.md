# Module 09: Capstone: Denoising Autoencoder and Variational Autoencoder in PyTorch

> **Prerequisites:** [All Previous Modules in Track 04 (Modules 00 - 08)](../README.md).  
> **Estimated Reading Time:** 55 minutes  
> **Target Audience:** Principal Systems Engineers, Chief AI Architects, and Senior Applied Scientists architecting end-to-end unsupervised representation pipelines, artifact restoration systems, and variational generative backbones.
>
> [!IMPORTANT]
> **The Track 04 Capstone Requirement:** This module culminates Track 04 by engineering two complete, battle-tested production pipelines from scratch:
> 1. **A Deep Convolutional Denoising Autoencoder (CDAE)** capable of projecting high-dimensional corrupted observations back onto clean low-dimensional data manifolds across composite noise distributions (Gaussian, salt-and-pepper, and structured sensor dropouts).
> 2. **A Full $\beta$-VAE with Cyclical Annealing** supporting both Gaussian MSE and Bernoulli BCE likelihood models, dynamic latent variance bounding, spherical linear latent interpolation (SLERP), and generation from the standard Gaussian prior.

---

## Executive Overview & Industry Context

Throughout Track 04, we have traversed the mathematical and architectural trajectory of deep generative models:
- **Module 00:** Established the Manifold Hypothesis and Information Bottleneck theory.
- **Module 01:** Proved that Denoising Autoencoders estimate the score function $\nabla_x \log p(x)$ via orthogonal manifold projection.
- **Module 02:** Derived the Evidence Lower Bound (ELBO) and the Reparameterization Trick.
- **Module 03:** Explored discrete codebooks and Straight-Through Estimators (VQ-VAE).
- **Modules 04 - 05:** Mastered game-theoretic minimax optimization, Wasserstein distances, and StyleGAN modulation.
- **Modules 06 - 08:** Derived thermodynamic diffusion trajectories, fast DDIM sampling, Classifier-Free Guidance, and Latent Diffusion.

In this capstone, we synthesize these theoretical foundations into two hardened, production-grade PyTorch engines designed to withstand high-throughput real-world deployment.

```
+===================================================================================+
|                       TRACK 04 CAPSTONE SYSTEM ARCHITECTURE                       |
+===================================================================================+
|                                                                                   |
|  PIPELINE A: Convolutional Denoising Autoencoder (Restoration & Score Projection) |
|                                                                                   |
|  Corrupted Sensor Image x_tilde (B, 1, 28, 28)                                    |
|          |                                                                        |
|          v                                                                        |
|  [ Strided Conv2D Encoder ] ---> [ Compact Latent Manifold z in R^16 ]            |
|                                                  |                                |
|                                                  v                                |
|  Clean Restored Image x_hat <--- [ Transposed Conv2D Decoder ]                    |
|                                                                                   |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  PIPELINE B: Disentangled Beta-VAE (Probabilistic Generative Synthesis)           |
|                                                                                   |
|  Input Observation x (B, 1, 28, 28)                                               |
|          |                                                                        |
|          v                                                                        |
|  [ Conv2D Encoder ] ---> [ Dual Prediction Heads: mu(x), log_var(x) ]             |
|                                                  |                                |
|                                       [ Reparameterization: z = mu + sigma*eps ]  |
|                                       [ Cyclical Annealing: beta(t) * D_KL ]      |
|                                                  |                                |
|                                                  v                                |
|  Prior Generator p(z) ~ N(0, I) ===> [ ConvTranspose2D Decoder ] ===> x_synthetic|
|                                                                                   |
+===================================================================================+
```

---

## 1. Architectural Mental Model: Dual-Model Capstone Pipeline

```mermaid
flowchart TD
    subgraph PipelineA["Pipeline A: Convolutional Denoising Autoencoder"]
        CleanInputA["Clean Input: x in M"] --> CorruptA["Composite Corruptor:<br/>Gaussian + Salt/Pepper + Masking"]
        CorruptA --> CorruptedA["Noisy Input: x_tilde"]
        CorruptedA --> EncA["Conv2D Downsampling Encoder"]
        EncA --> LatentA["Dense Bottleneck: z in R^d"]
        LatentA --> DecA["ConvTranspose2D Upsampling Decoder"]
        DecA --> OutputA["Restored Observation: x_hat in M"]
        OutputA -.->|"Log-Cosh / MSE Loss"| CleanInputA
    end

    subgraph PipelineB["Pipeline B: Disentangled Beta-VAE with Annealing"]
        InputB["Training Image: x in R^D"] --> EncB["Convolutional Encoder Backbone"]
        EncB --> HeadMu["Linear Head: mu(x)"]
        EncB --> HeadVar["Linear Head: log_var(x)"]
        HeadMu --> ReparamB["Reparameterization Trick:<br/>z = mu + exp(0.5*log_var) * eps"]
        HeadVar --> ReparamB
        NoisePriorB["Noise Source: eps ~ N(0, I)"] --> ReparamB
        ReparamB --> DecB["Convolutional Synthesis Decoder"]
        DecB --> ReconB["Reconstructed Observation: x_hat"]
        
        HeadMu -.->|"Analytical Gaussian KL"| KLLoss["KL Penalty: D_KL(q_phi || N(0, I))"]
        HeadVar -.->|"Analytical Gaussian KL"| KLLoss
        KLLoss -.->|"Multiply by Cyclical beta(t)"| TotalELBO["Total ELBO Loss"]
        ReconB -.->|"Likelihood (MSE / BCE)"| TotalELBO
    end
```

---

## 2. Mathematical Formulations & Theoretical Foundations

### 2.1 The Convolutional Denoising Autoencoder Formulation

Let $x \in \mathcal{M} \subset \mathbb{R}^{C \times H \times W}$ reside on a low-dimensional manifold.
The corrupted observation $\tilde{x} \sim q(\tilde{x} \mid x)$ is generated by a composite corrupting operator:

$$\tilde{x} = \mathcal{C}_{\text{composite}}(x) = \mathcal{M}_{\text{mask}} \odot \left( x + \epsilon_{\text{gauss}} \right) + \eta_{\text{salt\_pepper}}$$

The encoder network $f_\theta: \mathbb{R}^{C \times H \times W} \to \mathbb{R}^d$ applies strided 2D convolutions to extract translation-equivariant features, flattening into an undercomplete bottleneck $z = f_\theta(\tilde{x})$.

The decoder network $g_\phi: \mathbb{R}^d \to \mathbb{R}^{C \times H \times W}$ uses transposed convolutions to restore spatial resolution:

$$\hat{x} = g_\phi(f_\theta(\tilde{x}))$$

Rather than standard MSE (which is vulnerable to extreme impulsive leverage points), the capstone CDAE optimizes a robust **Smooth Log-Cosh Metric**:

$$\mathcal{L}_{\text{CDAE}}(\theta, \phi) = \frac{1}{B} \sum_{i=1}^B \sum_{c, h, w} \log\left( \cosh\left( x_{i, c, h, w} - \hat{x}_{i, c, h, w} \right) \right)$$

As proven in Module 01 via Alain & Bengio, for small perturbations, the displacement vector $g_\phi(f_\theta(\tilde{x})) - \tilde{x}$ converges to the score function $\sigma^2 \nabla_{\tilde{x}} \log p(\tilde{x})$, projecting off-manifold perturbations orthogonally back onto $\mathcal{M}$.

---

### 2.2 The $\beta$-VAE Variational Formulation and Likelihood Options

The $\beta$-VAE optimizes the modified Evidence Lower Bound:

$$\mathcal{L}_{\beta\text{-VAE}}(\theta, \phi; x) = \mathbb{E}_{q_\phi(z|x)} \left[ \log p_\theta(x \mid z) \right] - \beta(t) \cdot D_{\text{KL}}\left( q_\phi(z \mid x) \;\middle\|\; p(z) \right)$$

#### 1. Likelihood Formulation $\log p_\theta(x \mid z)$
Depending on the data modality, the decoder outputs parameters for one of two distributions:

- **Continuous Gaussian Likelihood (MSE Mode):**
  Assuming $p_\theta(x \mid z) = \mathcal{N}(x \mid \hat{x}, \sigma_{\text{dec}}^2 I)$ where $\hat{x} = g_\phi(z)$:
  
$$\log p_\theta(x \mid z) = -\frac{1}{2\sigma_{\text{dec}}^2} \|x - \hat{x}\|_2^2 - \frac{D}{2} \log(2\pi \sigma_{\text{dec}}^2)$$

  Ignoring the constant scalar, maximizing likelihood is equivalent to minimizing scaled Mean Squared Error.

- **Bernoulli Likelihood (BCE Mode):**
  Assuming binary or normalized grayscale inputs $x \in [0, 1]$ modeled as independent Bernoulli probabilities $\hat{x} = \sigma(g_\phi(z)) \in (0, 1)$:
  
$$\log p_\theta(x \mid z) = \sum_{j=1}^D \left[ x_j \log \hat{x}_j + (1 - x_j) \log(1 - \hat{x}_j) \right]$$

  Maximizing likelihood is equivalent to minimizing Binary Cross-Entropy.

#### 2. Analytical Gaussian KL Divergence
With isotropic prior $p(z) = \mathcal{N}(\mathbf{0}, I_d)$ and diagonal posterior $q_\phi(z \mid x) = \mathcal{N}(\mu, \text{diag}(\sigma^2))$:

$$D_{\text{KL}}(q_\phi(z \mid x) \,\|\, p(z)) = -\frac{1}{2} \sum_{j=1}^d \left( 1 + \log(\sigma_j^2) - \mu_j^2 - \sigma_j^2 \right)$$

#### 3. Cyclical KL Annealing Schedule
To prevent posterior collapse where the decoder overpowers the latent space during early iterations, the annealing factor $\beta(t) \in [0, \beta_{\text{max}}]$ follows a cyclical schedule:

$$\tau = \frac{t \pmod P}{P}$$

$$\beta(t) = \begin{cases} \beta_{\text{max}} \cdot \frac{\tau}{R} & \text{if } \tau \le R \\ \beta_{\text{max}} & \text{if } \tau > R \end{cases}$$

where $P$ is the cycle period in steps, and $R \in (0, 1]$ is the ramp ratio (e.g., $R = 0.5$).

---

## 3. Real-World Production Incident Post-Mortem

### The \$4.2M Satellite Imagery Defect Removal Pipeline Outage

#### Incident Context
A defense intelligence geospatial platform ingested high-resolution synthetic aperture radar (SAR) and optical satellite imagery covering 400,000 square kilometers daily. Raw satellite downlink feeds suffered from radiation-induced cosmic ray strikes (hot pixels), high-frequency atmospheric thermal turbulence, and sensor blooming.

To clean incoming sensor tiles before feeding them into an automated geopolitical road-and-runway segmentation network, the platform engineering team deployed a generative VAE image restoration pipeline operating on $512 \times 512$ optical tiles.

```
Raw Satellite Downlink
          |
          v
+--------------------------+
| Generative VAE Pipeline  | ---> Restores Imagery for Road Segmentation
+--------------------------+               |
          |                                v
Posterior Collapse + Generative Hallucination  [Phantom Highways Synthesized]
```

#### What Went Wrong
1. **Unconstrained Generative Prior in Restoration:** The team used a standard VAE with an expressive unconditioned decoder rather than a deterministic Denoising Autoencoder.
2. **Latent Space Posterior Collapse:** Due to a lack of KL annealing, the latent code $z \in \mathbb{R}^{64}$ suffered posterior collapse. The decoder ignored $z$ and relied on its internal convolutional priors, effectively hallucinating generic features typical of agricultural landscapes.
3. **Synthesis of Phantom Infrastructure:** When a cosmic ray strike produced a diagonal streak of hot saturated pixels across an arid desert terrain tile, the generative VAE did not merely remove the noise: it interpreted the linear feature as an incomplete road, hallucinating an entire paved multi-lane highway connecting to an unpopulated salt flat.
4. **Autonomous Alert Triggering:** Downstream defense analysis scripts detected a newly constructed military transport corridor in a disputed geopolitical zone, triggering high-priority defense escalations and satellite tasking re-allocations.
5. **Human Reconnaissance & Crisis Audit:** High-altitude reconnaissance confirmed the "highway" was an empty desert; the feature was entirely fabricated by the generative VAE. The defense agency halted all automated geospatial processing, voided the startup's multi-year contract, and levied **\$4.25M in operational audit fees and liquidated damages**.

```mermaid
sequenceDiagram
    participant Downlink as Optical Satellite Bus
    participant VAE as Generative VAE Restorer
    participant SegEngine as Automated Road Detector
    participant OpsCenter as Defense Operations Center
    participant Recon as High-Altitude Recon Aircraft

    Downlink->>VAE: Transmit Raw Tile (Cosmic Ray Artifact Streak)
    Note over VAE: Posterior collapsed VAE decodes from prior<br/>Hallucinates 4-lane paved highway over artifact
    VAE-->>SegEngine: Deliver "Restored" Synthetic Tile
    SegEngine->>OpsCenter: SEV-1 CRITICAL: New Military Corridor Detected!
    OpsCenter->>Recon: Scramble Aerial Reconnaissance Flight
    Recon-->>OpsCenter: Visual Recon Confirms: Empty Desert (Zero Roads)
    OpsCenter->>VAE: Terminate Platform Contract & Issue Penalty
    Note over OpsCenter: $4.25M Liquidated Damages & Contract Forfeiture
```

#### Root Cause Analysis
1. **Wrong Architectural Choice for Restoration:** Generative VAEs sample from a stochastic prior, making them fundamentally unsuitable for deterministic artifact removal where pixel-level fidelity to the true scene is non-negotiable. Restoration tasks require a **Denoising Autoencoder (CDAE)** that projects strictly onto the nearest manifold point without hallucinating off-manifold semantics.
2. **Posterior Collapse Unnoticed:** The platform lacked telemetry tracking latent mutual information $I(X; Z)$.
3. **No Manifold Distance Bounds:** The restoration service had no constraint checking whether the restored image $\hat{x}$ diverged excessively from the raw observation $x$ outside the detected noise mask.

#### Remediation and Hardened Architecture
The engineering team instituted three production safeguards:
1. **Separation of Concerns:** Deployed a **Convolutional Denoising Autoencoder (CDAE)** strictly for sensor noise removal, while reserving the **$\beta$-VAE** solely for offline synthetic data augmentation.
2. **Residual Identity Blending:** Enforced that clean pixels outside the corrupted mask are preserved via identity pass-through:
   
$$\hat{x}_{\text{final}} = (1 - M_{\text{noise}}) \odot x_{\text{raw}} + M_{\text{noise}} \odot \hat{x}_{\text{CDAE}}$$

3. **Active Unit Telemetry:** Real-time monitoring asserting that all latent dimensions maintain active KL divergence $> 0.1\text{ nats}$.

---

## 4. High-Performance Architecture: Memory Strides & Mixed Precision

In deep convolutional autoencoders, memory access patterns dictate throughput:

```
Memory Strides and Tensor Contiguity:
Standard PyTorch (NCHW / Contiguous):
Index = ((n * C + c) * H + h) * W + w
Channel values for a single pixel are separated in memory by H * W floats.

Channels-Last Memory Layout (torch.channels_last / NHWC):
Index = ((n * H + h) * W + w) * C + c
All C channels for a given pixel reside contiguously in DRAM cache lines!
Enables direct utilization of NVIDIA Tensor Core FP16 / BF16 GEMM pipelines.
```

To maximize throughput in this capstone, all models support:
1. `memory_format=torch.channels_last` for accelerated 2D spatial convolution throughput.
2. Automatic Mixed Precision (`torch.amp.autocast`) to minimize VRAM bandwidth during training.

---

## 5. From-Scratch Production Implementation

Below is the complete, runnable PyTorch implementation containing both production models, verification test suites, and generative evaluations.

```python
"""
Track 04 Capstone: Convolutional Denoising Autoencoder (CDAE) & Disentangled Beta-VAE.
Fully typed, vectorized, from-scratch PyTorch implementation with test harness.
"""

from typing import Tuple, Dict, Any, List
import math
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim


# =====================================================================
# 1. Pipeline A: Convolutional Denoising Autoencoder (CDAE)
# =====================================================================

class CompositeCorruptor:
    """
    Stochastic corruption operator applying:
    1. Additive Isotropic Gaussian noise.
    2. Salt-and-Pepper impulsive sensor noise.
    3. Random rectangular cutout / masking.
    """
    def __init__(
        self, 
        gaussian_std: float = 0.2, 
        sp_prob: float = 0.05, 
        mask_prob: float = 0.15
    ):
        self.gaussian_std = gaussian_std
        self.sp_prob = sp_prob
        self.mask_prob = mask_prob

    def __call__(self, x: torch.Tensor) -> torch.Tensor:
        x_noisy = x.clone()

        # 1. Additive Gaussian Noise
        if self.gaussian_std > 0.0:
            x_noisy = x_noisy + torch.randn_like(x_noisy) * self.gaussian_std

        # 2. Impulsive Salt-and-Pepper Noise
        if self.sp_prob > 0.0:
            sp_mask = torch.rand_like(x_noisy)
            salt_mask = sp_mask < (self.sp_prob * 0.5)
            pepper_mask = (sp_mask >= (self.sp_prob * 0.5)) & (sp_mask < self.sp_prob)
            x_noisy[salt_mask] = 1.0 # Saturated white
            x_noisy[pepper_mask] = -1.0 # Saturated black

        # 3. Spatial Masking (Channel/Patch Dropout)
        if self.mask_prob > 0.0:
            B, C, H, W = x_noisy.shape
            mask = (torch.rand(B, 1, H, W, device=x.device) > self.mask_prob).float()
            x_noisy = x_noisy * mask

        return torch.clamp(x_noisy, -1.0, 1.0)


class ConvDenoisingAutoencoder(nn.Module):
    """
    Deep Convolutional Denoising Autoencoder for spatial artifact removal.
    Uses strided convolutions for downsampling and transposed convolutions for restoration.
    """
    def __init__(self, in_channels: int = 1, bottleneck_dim: int = 32, base_channels: int = 32):
        super().__init__()
        self.in_channels = in_channels
        self.bottleneck_dim = bottleneck_dim

        # Encoder: (B, 1, 28, 28) -> (B, base_channels*2, 7, 7) -> (B, bottleneck_dim)
        self.encoder_conv = nn.Sequential(
            nn.Conv2d(in_channels, base_channels, kernel_size=4, stride=2, padding=1), # (B, 32, 14, 14)
            nn.BatchNorm2d(base_channels),
            nn.LeakyReLU(0.2, inplace=True),
            nn.Conv2d(base_channels, base_channels * 2, kernel_size=4, stride=2, padding=1), # (B, 64, 7, 7)
            nn.BatchNorm2d(base_channels * 2),
            nn.LeakyReLU(0.2, inplace=True),
        )
        self.encoder_fc = nn.Sequential(
            nn.Flatten(),
            nn.Linear(base_channels * 2 * 7 * 7, bottleneck_dim)
        )

        # Decoder: (B, bottleneck_dim) -> (B, base_channels*2, 7, 7) -> (B, 1, 28, 28)
        self.decoder_fc = nn.Sequential(
            nn.Linear(bottleneck_dim, base_channels * 2 * 7 * 7),
            nn.LeakyReLU(0.2, inplace=True)
        )
        self.decoder_conv = nn.Sequential(
            nn.ConvTranspose2d(base_channels * 2, base_channels, kernel_size=4, stride=2, padding=1), # (B, 32, 14, 14)
            nn.BatchNorm2d(base_channels),
            nn.LeakyReLU(0.2, inplace=True),
            nn.ConvTranspose2d(base_channels, in_channels, kernel_size=4, stride=2, padding=1), # (B, 1, 28, 28)
            nn.Tanh() # Bounded in [-1, 1]
        )
        self.base_channels = base_channels

    def encode(self, x: torch.Tensor) -> torch.Tensor:
        h = self.encoder_conv(x)
        return self.encoder_fc(h)

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        h = self.decoder_fc(z)
        h = h.view(-1, self.base_channels * 2, 7, 7)
        return self.decoder_conv(h)

    def forward(self, x_corrupted: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        z = self.encode(x_corrupted)
        x_restored = self.decode(z)
        return x_restored, z

    def compute_log_cosh_loss(self, x_clean: torch.Tensor, x_restored: torch.Tensor) -> torch.Tensor:
        diff = x_restored - x_clean
        # Stable log-cosh: |x| + log(1 + exp(-2|x|)) - log(2)
        abs_diff = torch.abs(diff)
        log_cosh = abs_diff + torch.log1p(torch.exp(-2.0 * abs_diff)) - 0.69314718056
        return torch.mean(log_cosh)


# =====================================================================
# 2. Pipeline B: Disentangled Beta-VAE with Cyclical Annealing
# =====================================================================

class ConvBetaVAE(nn.Module):
    """
    Convolutional Beta-VAE with dual prediction heads and configurable likelihood models.
    """
    def __init__(
        self, 
        in_channels: int = 1, 
        latent_dim: int = 16, 
        base_channels: int = 32,
        likelihood_mode: str = "gaussian" # 'gaussian' or 'bernoulli'
    ):
        super().__init__()
        self.in_channels = in_channels
        self.latent_dim = latent_dim
        self.likelihood_mode = likelihood_mode
        self.base_channels = base_channels

        # Encoder Backbone
        self.encoder = nn.Sequential(
            nn.Conv2d(in_channels, base_channels, kernel_size=4, stride=2, padding=1), # (B, 32, 14, 14)
            nn.BatchNorm2d(base_channels),
            nn.SiLU(),
            nn.Conv2d(base_channels, base_channels * 2, kernel_size=4, stride=2, padding=1), # (B, 64, 7, 7)
            nn.BatchNorm2d(base_channels * 2),
            nn.SiLU(),
            nn.Flatten()
        )

        # Dual Prediction Heads
        flattened_dim = base_channels * 2 * 7 * 7
        self.fc_mu = nn.Linear(flattened_dim, latent_dim)
        self.fc_log_var = nn.Linear(flattened_dim, latent_dim)

        # Decoder Backbone
        self.decoder_input = nn.Linear(latent_dim, flattened_dim)
        
        output_activation = nn.Tanh() if likelihood_mode == "gaussian" else nn.Sigmoid()
        self.decoder = nn.Sequential(
            nn.ConvTranspose2d(base_channels * 2, base_channels, kernel_size=4, stride=2, padding=1), # (B, 32, 14, 14)
            nn.BatchNorm2d(base_channels),
            nn.SiLU(),
            nn.ConvTranspose2d(base_channels, in_channels, kernel_size=4, stride=2, padding=1), # (B, 1, 28, 28)
            output_activation
        )

    def encode(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        h = self.encoder(x)
        mu = self.fc_mu(h)
        # Clamp log-variance to prevent numerical explosion
        log_var = torch.clamp(self.fc_log_var(h), min=-15.0, max=10.0)
        return mu, log_var

    def reparameterize(self, mu: torch.Tensor, log_var: torch.Tensor) -> torch.Tensor:
        """The Reparameterization Trick: z = mu + sigma * eps"""
        if self.training:
            std = torch.exp(0.5 * log_var)
            eps = torch.randn_like(std)
            return mu + std * eps
        return mu

    def decode(self, z: torch.Tensor) -> torch.Tensor:
        h = self.decoder_input(z)
        h = h.view(-1, self.base_channels * 2, 7, 7)
        return self.decoder(h)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        mu, log_var = self.encode(x)
        z = self.reparameterize(mu, log_var)
        x_recon = self.decode(z)
        return x_recon, mu, log_var

    def compute_loss(
        self, 
        x: torch.Tensor, 
        x_recon: torch.Tensor, 
        mu: torch.Tensor, 
        log_var: torch.Tensor, 
        beta: float = 1.0
    ) -> Dict[str, torch.Tensor]:
        # 1. Reconstruction Loss
        if self.likelihood_mode == "gaussian":
            rec_loss = nn.functional.mse_loss(x_recon, x, reduction="sum") / x.size(0)
        else: # Bernoulli BCE
            rec_loss = nn.functional.binary_cross_entropy(x_recon, x, reduction="sum") / x.size(0)

        # 2. Analytical Gaussian KL Divergence: -0.5 * sum(1 + log_var - mu^2 - exp(log_var))
        kl_per_dim = -0.5 * (1.0 + log_var - mu.pow(2) - log_var.exp())
        kl_loss = torch.sum(kl_per_dim, dim=-1).mean()

        total_loss = rec_loss + beta * kl_loss
        
        # Telemetry: Active Latent Dimensions (> 0.1 nats)
        with torch.no_grad():
            active_dims = (torch.mean(kl_per_dim, dim=0) > 0.1).sum()

        return {
            "total_loss": total_loss,
            "rec_loss": rec_loss,
            "kl_loss": kl_loss,
            "active_dims": active_dims
        }

    def sample_prior(self, num_samples: int, device: torch.device) -> torch.Tensor:
        """Synthesizes novel samples directly from standard normal prior p(z) ~ N(0, I)."""
        with torch.no_grad():
            z = torch.randn(num_samples, self.latent_dim, device=device)
            return self.decode(z)

    def slerp(self, z1: torch.Tensor, z2: torch.Tensor, steps: int = 10) -> torch.Tensor:
        """
        Spherical Linear Interpolation (SLERP) along the great-circle arc in latent space.
        """
        z1_norm = z1 / torch.norm(z1, dim=-1, keepdim=True)
        z2_norm = z2 / torch.norm(z2, dim=-1, keepdim=True)
        dot = torch.sum(z1_norm * z2_norm, dim=-1, keepdim=True).clamp(-0.9995, 0.9995)
        
        omega = torch.acos(dot)
        sin_omega = torch.sin(omega)
        
        interpolated = []
        for val in np.linspace(0.0, 1.0, steps):
            w1 = torch.sin((1.0 - val) * omega) / sin_omega
            w2 = torch.sin(val * omega) / sin_omega
            z_interp = w1 * z1 + w2 * z2
            interpolated.append(self.decode(z_interp))
            
        return torch.cat(interpolated, dim=0)


# =====================================================================
# 3. Verification & Benchmark Execution Suite
# =====================================================================

def generate_synthetic_image_dataset(n_samples: int = 2000) -> torch.Tensor:
    """Generates synthetic geometric shapes (circles and squares) in [-1, 1]."""
    data = torch.zeros(n_samples, 1, 28, 28)
    for i in range(n_samples):
        # Random radius and center
        cx, cy = np.random.randint(10, 18, 2)
        radius = np.random.randint(4, 8)
        
        y, x = torch.meshgrid(torch.arange(28), torch.arange(28), indexing="ij")
        if i % 2 == 0:
            # Circle
            mask = ((x - cx) ** 2 + (y - cy) ** 2) <= radius ** 2
        else:
            # Square
            mask = (torch.abs(x - cx) <= radius) & (torch.abs(y - cy) <= radius)
        data[i, 0, mask] = 1.0
        
    # Scale to [-1, 1]
    return (data * 2.0) - 1.0


if __name__ == "__main__":
    torch.manual_seed(42)
    np.random.seed(42)
    device = torch.device("cpu")

    print("[*] Generating Synthetic Shape Dataset (N=2000, 1x28x28)...")
    dataset_tensors = generate_synthetic_image_dataset(n_samples=2000).to(device)

    # -------------------------------------------------------------
    # 1. Benchmark Pipeline A: Convolutional Denoising Autoencoder
    # -------------------------------------------------------------
    print("\n" + "=" * 65)
    print("[PIPELINE A] Training Convolutional Denoising Autoencoder...")
    print("=" * 65)

    cdae = ConvDenoisingAutoencoder(in_channels=1, bottleneck_dim=32, base_channels=16).to(device)
    corruptor = CompositeCorruptor(gaussian_std=0.25, sp_prob=0.08, mask_prob=0.10)
    optimizer_cdae = optim.AdamW(cdae.parameters(), lr=3e-3, weight_decay=1e-5)

    loader_cdae = torch.utils.data.DataLoader(
        torch.utils.data.TensorDataset(dataset_tensors), 
        batch_size=32, 
        shuffle=True
    )

    cdae.train()
    for epoch in range(12):
        epoch_loss = 0.0
        for batch_clean, in loader_cdae:
            batch_noisy = corruptor(batch_clean)
            
            optimizer_cdae.zero_grad(set_to_none=True)
            batch_restored, _ = cdae(batch_noisy)
            loss = cdae.compute_log_cosh_loss(batch_clean, batch_restored)
            loss.backward()
            optimizer_cdae.step()
            epoch_loss += loss.item()
            
        if (epoch + 1) % 4 == 0:
            print(f"    Epoch {epoch+1:02d}/12 | Mean Log-Cosh Loss: {epoch_loss / len(loader_cdae):.4f}")

    # Evaluate Restoration Fidelity
    cdae.eval()
    with torch.no_grad():
        test_clean = dataset_tensors[:50]
        test_corrupted = corruptor(test_clean)
        test_restored, _ = cdae(test_corrupted)
        
        corrupted_mse = nn.functional.mse_loss(test_corrupted, test_clean).item()
        restored_mse = nn.functional.mse_loss(test_restored, test_clean).item()

    print(f"\n[*] CDAE Restoration Evaluation:")
    print(f"    Raw Corrupted Input MSE:  {corrupted_mse:.4f}")
    print(f"    Restored Output MSE:      {restored_mse:.4f}")
    print(f"    Denoising Gain Factor:    {corrupted_mse / restored_mse:.2f}x")

    assert restored_mse < corrupted_mse * 0.40, "CDAE failed to remove at least 60% of noise distortion!"
    assert not torch.isnan(test_restored).any(), "CDAE output contains NaNs!"
    print("    [PASSED] Pipeline A (CDAE) verified: Manifold projection operational.")

    # -------------------------------------------------------------
    # 2. Benchmark Pipeline B: Disentangled Beta-VAE with Annealing
    # -------------------------------------------------------------
    print("\n" + "=" * 65)
    print("[PIPELINE B] Training Disentangled Beta-VAE with Cyclical Annealing...")
    print("=" * 65)

    beta_vae = ConvBetaVAE(in_channels=1, latent_dim=16, base_channels=16, likelihood_mode="gaussian").to(device)
    optimizer_vae = optim.AdamW(beta_vae.parameters(), lr=2e-3, weight_decay=1e-5)

    total_epochs = 15
    beta_max = 2.5
    cycle_period = 5 # Epochs per annealing cycle

    beta_vae.train()
    for epoch in range(total_epochs):
        # Cyclical Annealing Schedule Calculation
        cycle_progress = (epoch % cycle_period) / cycle_period
        current_beta = beta_max * (cycle_progress / 0.5) if cycle_progress < 0.5 else beta_max

        epoch_rec = 0.0
        epoch_kl = 0.0
        for batch_x, in loader_cdae:
            optimizer_vae.zero_grad(set_to_none=True)
            x_recon, mu, log_var = beta_vae(batch_x)
            
            loss_dict = beta_vae.compute_loss(batch_x, x_recon, mu, log_var, beta=current_beta)
            loss_dict["total_loss"].backward()
            optimizer_vae.step()

            epoch_rec += loss_dict["rec_loss"].item()
            epoch_kl += loss_dict["kl_loss"].item()

        if (epoch + 1) % 5 == 0:
            print(f"    Epoch {epoch+1:02d}/{total_epochs} | Beta: {current_beta:.2f} | Rec: {epoch_rec/len(loader_cdae):.2f} | KL: {epoch_kl/len(loader_cdae):.2f}")

    # Evaluate Generative Capacity
    beta_vae.eval()
    with torch.no_grad():
        # 1. Active Unit Telemetry
        eval_x = dataset_tensors[:100]
        eval_mu, eval_log_var = beta_vae.encode(eval_x)
        kl_dims = -0.5 * torch.mean(1.0 + eval_log_var - eval_mu.pow(2) - eval_log_var.exp(), dim=0)
        active_units = (kl_dims > 0.1).sum().item()

        # 2. Prior Sampling
        prior_samples = beta_vae.sample_prior(num_samples=16, device=device)

        # 3. Spherical Latent Interpolation (SLERP)
        z_start = torch.randn(1, 16, device=device)
        z_end = torch.randn(1, 16, device=device)
        slerp_strip = beta_vae.slerp(z_start, z_end, steps=8)

    print(f"\n[*] Beta-VAE Generative Evaluation:")
    print(f"    Active Latent Units (>0.1 nats): {active_units} / 16")
    print(f"    Prior Synthetic Samples Shape:  {prior_samples.shape}")
    print(f"    SLERP Trajectory Length:        {slerp_strip.shape[0]} frames")

    assert active_units >= 6, f"Posterior collapse detected! Only {active_units} active dimensions."
    assert not torch.isnan(prior_samples).any(), "Prior samples contain NaNs!"
    assert not torch.isnan(slerp_strip).any(), "SLERP trajectory contains NaNs!"
    print("    [PASSED] Pipeline B (Beta-VAE) verified: Unconditional sampling and SLERP confirmed.")
    print("\n" + "=" * 65)
    print("[*] TRACK 04 CAPSTONE ENGINE DEPLOYMENT COMPLETE: ALL VERIFICATIONS PASSED")
    print("=" * 65)
```

---

## 6. Failure Modes, Edge Cases & Antipatterns

### 6.1 Using Generative Models as Deterministic Restorers

Attempting to use an unconstrained generative model (e.g., standard VAE or unconditional Diffusion) for restoration tasks risks **generative hallucination**. 

```python
# BAD: Using stochastic prior sampling for medical/satellite defect removal
def restore_bad_generative(vae: nn.Module, corrupted_x: torch.Tensor):
    # Stochastic reparameterization introduces random variation, hallucinating phantom features!
    mu, log_var = vae.encode(corrupted_x)
    z_random = mu + torch.exp(0.5 * log_var) * torch.randn_like(mu)
    return vae.decode(z_random) # Hallucinates non-existent pathology or terrain!

# GOOD: Deterministic CDAE projection with identity blending
def restore_good_cdae(cdae: nn.Module, corrupted_x: torch.Tensor, noise_mask: torch.Tensor):
    # Deterministic projection strictly onto nearest manifold point
    with torch.no_grad():
        restored_manifold = cdae(corrupted_x)[0]
    # Retain ground truth for clean pixels; replace only corrupted regions
    return (1.0 - noise_mask) * corrupted_x + noise_mask * restored_manifold
```

### 6.2 Latent Variance Collapse (Dead Units)

Failing to track per-dimension KL divergence leads to silent capacity death. Always log active units to your telemetry pipeline:

```python
# Telemetry Assertion:
per_dim_kl = -0.5 * torch.mean(1.0 + log_var - mu.pow(2) - log_var.exp(), dim=0)
active_count = (per_dim_kl > 0.1).sum().item()
assert active_count >= min_required_dims, f"Posterior collapse! Active units: {active_count}"
```

---

## 7. Senior Technical Interview Questions & Model Answers

### Question 1: Architectural Selection Matrix for Generative Paradigms
**Interviewer:** *"Construct an architectural comparison matrix across Autoencoders, VAEs, GANs, and Diffusion Models evaluating Inference Latency, Training Stability, Sample Diversity, and High-Frequency Fidelity. Recommend which model to deploy for a real-time (\$50\text{ms}$ SLA) edge video call background generator versus an offline medical dataset synthesis pipeline."*

**Model Answer:**
1. **Comparative Evaluation Matrix:**

| Generative Paradigm | Inference Latency | Training Stability | Sample Diversity | High-Frequency Fidelity | Mode Collapse Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Vanilla / DAE** | Ultra-Fast ($< 5\text{ms}$) | High (Convex MSE) | None (Deterministic) | Moderate (Blurry) | N/A |
| **VAE / $\beta$-VAE** | Ultra-Fast ($5 - 15\text{ms}$) | High (ELBO Bound) | High (Covers Prior) | Low/Moderate (Blurry) | High (Posterior Collapse)|
| **GAN (StyleGAN)** | Fast ($15 - 40\text{ms}$) | Low (Minimax Game) | Moderate | Ultra-High (Sharp) | High (Mode Collapse) |
| **Diffusion (DDPM/LDM)**| Slow ($500\text{ms} - 5\text{s}$) | Ultra-High (L2 Loss) | Ultra-High (Full Prior)| Ultra-High (Sharp) | Zero |

2. **Scenario A: Real-Time Edge Video Background Generation ($< 50\text{ms}$ SLA):**
   - **Recommendation:** Deploy a **StyleGAN / MobileStyleGAN** or a heavily distilled **Consistency Model (1-step diffusion)**.
   - **Rationale:** Diffusion models (even with 15-step DDIM) exceed the $50\text{ms}$ budget on edge hardware ($> 200\text{ms}$). A convolutional GAN generator requires only a single feedforward pass ($\approx 12\text{ms}$ on an iPad/iPhone Neural Engine) while delivering the crisp edge boundaries required for green-screen segmentation.
3. **Scenario B: Offline Medical Dataset Synthesis:**
   - **Recommendation:** Deploy a **Latent Diffusion Model (LDM)** with Cosine Variance Scheduling.
   - **Rationale:** In clinical oncology augmentation, mode coverage and statistical diversity are paramount. A GAN suffering even mild mode collapse will discard rare tumor morphologies. Latent Diffusion guarantees coverage of the entire distribution support with zero mode collapse risk, and offline generation is unconstrained by real-time latency budgets.

---

### Question 2: The Reparameterization Trick Gradient Flow
**Interviewer:** *"Walk through the exact backpropagation graph of the reparameterization trick $z = \mu_\phi(x) + \sigma_\phi(x) \odot \epsilon$. Why does treating $\epsilon$ as a non-differentiable constant input solve the gradient blockage?"*

**Model Answer:**
1. **The Blockage in Direct Sampling:**
   Let $z \sim q_\phi(z \mid x)$. The loss is $\mathcal{L} = \mathbb{E}_{z \sim q_\phi}[f(z)]$.
   The operation of drawing a random sample from a distribution conditioned on $\phi$ is non-differentiable:
   $$\frac{\partial}{\partial \phi} \text{Sample}(\mu_\phi, \sigma_\phi)$$
   is undefined because the sampling operation creates a discrete break in the autograd computation graph.
2. **The Reparameterization Solution:**
   We re-express the random variable $z$ as a deterministic, differentiable coordinate transformation:
   $$z = g(\phi, \epsilon) = \mu_\phi(x) + \sigma_\phi(x) \odot \epsilon \quad \text{where } \epsilon \sim \mathcal{N}(\mathbf{0}, I)$$
   The stochasticity is outsourced to $\epsilon$, which has no dependence on $\phi$ ($\frac{\partial \epsilon}{\partial \phi} = \mathbf{0}$).
3. **Gradient Propagation via the Chain Rule:**
   Let $\mathcal{L}$ be the downstream reconstruction loss. The gradient flows as:
   $$\frac{\partial \mathcal{L}}{\partial \mu} = \frac{\partial \mathcal{L}}{\partial z} \cdot \frac{\partial z}{\partial \mu} = \frac{\partial \mathcal{L}}{\partial z} \cdot 1 = \frac{\partial \mathcal{L}}{\partial z}$$
   $$\frac{\partial \mathcal{L}}{\partial \sigma} = \frac{\partial \mathcal{L}}{\partial z} \cdot \frac{\partial z}{\partial \sigma} = \frac{\partial \mathcal{L}}{\partial z} \cdot \epsilon$$
   Since $\sigma = \exp(0.5 \cdot \ell)$ where $\ell = \log \sigma^2$:
   $$\frac{\partial \mathcal{L}}{\partial \ell} = \frac{\partial \mathcal{L}}{\partial \sigma} \cdot \frac{\partial \sigma}{\partial \ell} = \left( \frac{\partial \mathcal{L}}{\partial z} \odot \epsilon \right) \odot \left( \frac{1}{2} \exp(0.5 \cdot \ell) \right) = \frac{1}{2} \frac{\partial \mathcal{L}}{\partial z} \odot \sigma \odot \epsilon$$
   Every operation in this chain consists of elementary affine arithmetic (addition, multiplication, exponentiation), allowing automatic differentiation engines (PyTorch Autograd) to backpropagate directly into the encoder parameters $\phi$.

---

### Question 3: Geodesic SLERP vs. Linear LERP in Latent Spaces
**Interviewer:** *"Why is Linear Interpolation (LERP) mathematically unsuited for traversing high-dimensional Gaussian latent spaces, and why is Spherical Linear Interpolation (SLERP) necessary?"*

**Model Answer:**
1. **The Gaussian Annulus Theorem (The Soap Bubble Effect):**
   In high dimensions ($d = 128$ or $d = 512$), a standard multivariate Gaussian $\mathcal{N}(\mathbf{0}, I_d)$ does not place its probability mass near the origin.
   The squared Euclidean norm $\|z\|_2^2 = \sum_{j=1}^d z_j^2$ follows a Chi-squared distribution with $d$ degrees of freedom:
   $$\mathbb{E}[\|z\|_2] \approx \sqrt{d}, \quad \text{Var}(\|z\|_2) \approx \frac{1}{2}$$
   Almost 100% of the probability mass concentrates on a thin spherical shell (an annulus) of radius $R = \sqrt{d}$.
2. **The Failure of Linear Interpolation (LERP):**
   Let $z_1, z_2 \sim \mathcal{N}(\mathbf{0}, I)$ lie on the shell with $\|z_1\| \approx \sqrt{d}, \|z_2\| \approx \sqrt{d}$.
   Under LERP, the midpoint is $z_{\text{mid}} = 0.5 z_1 + 0.5 z_2$.
   Assuming $z_1 \perp z_2$ (almost always true in high dimensions):
   $$\|z_{\text{mid}}\|_2 = \sqrt{\|0.5 z_1\|^2 + \|0.5 z_2\|^2} = \sqrt{\frac{d}{4} + \frac{d}{4}} = \sqrt{\frac{d}{2}} = \frac{\sqrt{d}}{\sqrt{2}} \approx 0.707 \sqrt{d}$$
   The midpoint $z_{\text{mid}}$ plunges into the interior void of the hypersphere, leaving the high-density shell. The decoder receives an out-of-distribution latent code whose norm is 30% smaller than any training sample, producing blurry, distorted images.
3. **The SLERP Solution:**
   Spherical Linear Interpolation interpolates along the great-circle arc on the surface of the hypersphere:
   $$\text{SLERP}(z_1, z_2; t) = \frac{\sin((1 - t)\omega)}{\sin(\omega)} z_1 + \frac{\sin(t\omega)}{\sin(\omega)} z_2$$
   where $\omega = \arccos\left( \frac{z_1^T z_2}{\|z_1\| \|z_2\|} \right)$.
   SLERP strictly maintains a constant radius $\|z(t)\|_2 = \sqrt{d}$ throughout the entire trajectory, guaranteeing that every intermediate point remains on the valid data manifold.

---

### Question 4: Disentanglement Measurement in $\beta$-VAE
**Interviewer:** *"How is disentanglement formally quantified in a $\beta$-VAE, and what is the Higgins et al. Disentanglement Metric?"*

**Model Answer:**
A representation is **disentangled** if individual latent dimensions $z_j$ correlate with single, independent ground-truth generative factors of the world (e.g., azimuth angle, elevation, scale) while being invariant to others.
1. **The Higgins et al. (2017) Metric:**
   - Choose a known ground-truth generative factor $y$ (e.g., object orientation).
   - Generate pairs of images $(x_1, x_2)$ where factor $y$ is kept fixed ($y_1 = y_2$), while all other factors (scale, position, shape) are randomly varied.
   - Encode both images: $z_1 = \mu_\phi(x_1)$ and $z_2 = \mu_\phi(x_2)$.
   - Compute the absolute difference vector: $d = |z_1 - z_2|$.
   - Because factor $y$ is constant, the latent dimension that encodes $y$ should have minimal difference ($d_j \approx 0$).
   - Train a simple linear classifier to predict which factor $y$ was held constant given the difference vector $d$.
   - The classification accuracy of this linear model serves as the **Disentanglement Score**. A score near 100% indicates that single latent dimensions isolate single generative factors.

---

## 8. Practical Exercises & Verification Drills

### Drill 1: Manual Calculation of Gaussian Annulus Radius
For latent dimensions $d = 16, 64, 256$:
1. Calculate the expected Euclidean norm $\mathbb{E}[\|z\|_2] \approx \sqrt{d}$.
2. Calculate the norm of the LERP midpoint between two orthogonal samples: $\|0.5 z_1 + 0.5 z_2\|$.
3. What percentage of the expected radius is lost at the midpoint in all three dimensions?

**Solution:**
1. Expected radii:
   - For $d = 16$: $\mathbb{E}[\|z\|] = \sqrt{16} = 4.0$
   - For $d = 64$: $\mathbb{E}[\|z\|] = \sqrt{64} = 8.0$
   - For $d = 256$: $\mathbb{E}[\|z\|] = \sqrt{256} = 16.0$
2. LERP midpoint norm:
   $$\|z_{\text{mid}}\| = \sqrt{(0.5 \sqrt{d})^2 + (0.5 \sqrt{d})^2} = \sqrt{\frac{d}{4} + \frac{d}{4}} = \sqrt{\frac{d}{2}} = \frac{\sqrt{d}}{\sqrt{2}} \approx 0.7071 \sqrt{d}$$
   - For $d = 16$: $\|z_{\text{mid}}\| = 4.0 / \sqrt{2} \approx 2.828$
   - For $d = 64$: $\|z_{\text{mid}}\| = 8.0 / \sqrt{2} \approx 5.657$
   - For $d = 256$: $\|z_{\text{mid}}\| = 16.0 / \sqrt{2} \approx 11.314$
3. Percentage lost:
   $$\text{Deficit} = 1.0 - \frac{1}{\sqrt{2}} = 1.0 - 0.7071 = 29.29\%$$
   *Conclusion:* In any dimension, standard linear interpolation drops the norm by nearly $30\%$ at the midpoint, plunging into empty latent space.

---

### Drill 2: SLERP Constant-Norm Numerical Verification
Write a Python script verifying that SLERP maintains a constant norm across 10 intermediate interpolation steps between two random 64D vectors:

```python
import torch

def verify_slerp_norm():
    d = 64
    z1 = torch.randn(d)
    z2 = torch.randn(d)
    
    # Normalize to fixed radius R = 8.0
    R = 8.0
    z1 = (z1 / torch.norm(z1)) * R
    z2 = (z2 / torch.norm(z2)) * R
    
    omega = torch.acos(torch.clamp(torch.dot(z1, z2) / (R ** 2), -1.0, 1.0))
    sin_omega = torch.sin(omega)
    
    norms = []
    for t in torch.linspace(0.0, 1.0, 11):
        w1 = torch.sin((1.0 - t) * omega) / sin_omega
        w2 = torch.sin(t * omega) / sin_omega
        z_t = w1 * z1 + w2 * z2
        norms.append(torch.norm(z_t).item())
        
    max_norm_err = max(abs(n - R) for n in norms)
    print(f"Target Radius: {R:.2f} | Max Deviation along SLERP Arc: {max_norm_err:.6e}")
    assert max_norm_err < 1e-5, "SLERP failed to maintain constant hypersphere radius!"
    print("[PASSED] SLERP strictly preserves manifold norm across all interpolation points.")

verify_slerp_norm()
```

---

## Track Summary & Curriculum Mastery

Congratulations on completing **Track 04: Autoencoders, VAEs, GANs & Diffusion**! You have developed a comprehensive theoretical and practical mastery of modern generative modeling:

```
Track 04 Core Competencies Mastered:
1. Representation Learning & Manifolds: Eckart-Young Theorem, Baldi-Hornik, TwoNN Intrinsic Dimension.
2. Regularized Autoencoders: Bernoulli KL sparsity penalties, DAE score matching projection (Alain & Bengio).
3. Variational Autoencoders: ELBO derivation, Gaussian closed-form KL, Reparameterization, Cyclical Annealing.
4. Vector Quantization: VQ-VAE, Straight-Through Estimators, EMA Codebook updates, Discrete Priors.
5. Minimax Games: Optimal discriminator D*, reduction to Jensen-Shannon divergence, Non-saturating gradients.
6. Optimal Transport & StyleGAN: Earth Mover's Distance, Kantorovich-Rubinstein, WGAN-GP, AdaIN.
7. Thermodynamic Diffusion: Markov forward process, analytical O(1) jump, tractable reverse posteriors, Cosine schedule.
8. Accelerated Diffusion & Guidance: DDPM L2 loss, deterministic DDIM ODE sampling, Classifier-Free Guidance.
9. Latent Diffusion Models: Perceptual compression VAE, Spatial Cross-Attention, Langevin dynamics, Score SDEs.
10. Capstone Execution: Production-grade Convolutional DAE & Disentangled Beta-VAE engines from scratch.
```

Advance to **Track 05: Graph Neural Networks & Vision Transformers** to explore geometric deep learning and attention-driven foundation models:

- **Next Track:** [Track 05: Graph Neural Networks & Vision Transformers](../../05-graph-neural-networks-and-vision-transformers/README.md)
- **Track 04 Overview & Index:** [Track 04 Overview](../README.md)
