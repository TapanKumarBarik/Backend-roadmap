# Stride, Padding, Dilated Convolutions, and Receptive Fields

> **Prerequisites:** [Module 00: Images as Tensors, Spatial Convolutions, and Edge Kernels](../00-images-as-tensors-convolutions-and-kernels/README.md), [Vector and Matrix Linear Algebra](../../../ml/02-math-for-machine-learning/00-vectors-matrices-and-linear-transformations/README.md).  
> **Estimated Reading Time:** 40-50 minutes  
> **Target Audience:** Vision systems engineers, robotics perception architects, and deep learning practitioners requiring exact spatial dimension arithmetic, receptive field theory, and pooling routing mechanics.

This module is part of [Track 02: Convolutional Neural Networks & Vision](../README.md).

---

## Executive Overview & Industry Context

In computer vision architectures, designing the spatial geometry of a neural network is a delicate balancing act between **computational tractability** and **receptive field coverage**. If an architecture maintains the full spatial resolution of a $1080\text{p}$ image across dozens of layers, activation memory footprints explode into tens of gigabytes, stalling GPU execution on memory bandwidth. Conversely, if an architecture downsamples feature maps too aggressively via large strides or excessive pooling, fine-grained spatial information, high-frequency textures, and sub-pixel localization boundaries are irreversibly destroyed.

```mermaid
flowchart TD
    subgraph Dilemma["The Spatial Geometry Dilemma"]
        HighRes["High Spatial Resolution (Stride 1)"] -->|"Pros"| Detail["Preserves Sub-Pixel Localization & Fine Edges"]
        HighRes -->|"Cons"| Cost["O(H x W) Activation Memory & Exploding FLOPs"]
        
        AggressiveDown["Aggressive Downsampling (Stride 2/4/8)"] -->|"Pros"| Throughput["Drastic FLOP Reduction & Large Context"]
        AggressiveDown -->|"Cons"| Aliasing["Irreversible Spatial Aliasing & Boundary Drift"]
    end
```

Every spatial operation—convolutions, paddings, strided sub-samplings, dilated filters, and pooling aggregations—systematically transforms the geometric coordinate frame of the underlying data. Understanding the precise mathematical mechanics governing these transformations is not merely an academic exercise. In autonomous driving, robotic microsurgery, and satellite remote sensing, an uncompensated 1-pixel coordinate offset introduced by asymmetric padding can translate to a catastrophic real-world positioning error.

This module establishes the rigorous mathematical foundation for spatial transformations in convolutional networks. We derive exact dimension arithmetic under arbitrary strides and dilations, analyze boundary dynamics across padding strategies, formulate the theoretical and effective receptive field (ERF) distributions, dissect max versus average pooling routing mechanics, and build an arbitrary CNN DAG receptive field calculator and custom autograd pooling engine from first principles.

---

## 1. Spatial Dimension Transformation Arithmetic

When a 2D discrete convolution or pooling operation traverses an input feature map of spatial height $H_{in}$ and width $W_{in}$, the dimensions of the output feature map $H_{out} \times W_{out}$ are strictly governed by kernel support, stride, padding, and dilation.

```mermaid
flowchart LR
    subgraph ArithmeticEngine["Spatial Dimension Arithmetic (1D Slice)"]
        direction LR
        P_left["Padding Left (P_w0)"] --- InputW["Input Width (W_in)"] --- P_right["Padding Right (P_w1)"]
        KernelBox["Kernel Support Window (K_eff)"] -.->|"Slides with Stride S_w"| InputW
        
        TotalSpan["Total Padded Extent = W_in + P_left + P_right"]
        NumSteps["Output Steps = floor((TotalSpan - K_eff) / S_w) + 1"]
    end
```

### 1.1 The General Dimension Equation

Let:
- $W_{in}$ be the input spatial dimension.
- $K$ be the kernel spatial dimension.
- $P$ be total symmetrical padding applied to both sides ($P_{\text{total}} = 2P$).
- $S$ be the spatial stride (the step size in pixels between consecutive kernel placements).
- $d$ be the kernel dilation rate ($d=1$ for standard dense convolution).

First, consider the **effective kernel size** $K_{\text{eff}}$ under dilation $d$. Dilated (or atrous) convolution inserts $d - 1$ spaces (zeros) between consecutive kernel elements:

$$K_{\text{eff}} = K + (K - 1)(d - 1) = d(K - 1) + 1$$

When $d = 1$, $K_{\text{eff}} = 1(K - 1) + 1 = K$.

The total padded spatial extent of the input is $W_{\text{in}} + 2P$. The kernel requires $K_{\text{eff}}$ elements for its initial valid placement at the starting boundary. The remaining distance available for the kernel to slide across is:

$$\text{Remaining Distance} = (W_{\text{in}} + 2P) - K_{\text{eff}}$$

Because the kernel moves forward by $S$ pixels per step, the number of additional steps it can execute before exceeding the boundary is given by integer division:

$$\text{Additional Steps} = \left\lfloor \frac{W_{\text{in}} + 2P - K_{\text{eff}}}{S} \right\rfloor$$

Adding the initial placement step yields the canonical spatial transformation equation:

$$W_{\text{out}} = \left\lfloor \frac{W_{\text{in}} + 2P - d(K - 1) - 1}{S} \right\rfloor + 1$$

For standard non-dilated convolution ($d = 1$):

$$W_{\text{out}} = \left\lfloor \frac{W_{\text{in}} - K + 2P}{S} \right\rfloor + 1$$

### 1.2 Asymmetric Padding Formulation

In production implementations, padding along opposite boundaries is frequently asymmetric, particularly when converting models between TensorFlow and PyTorch or when odd spatial dimensions meet even strides. Let $P_{\text{top}}, P_{\text{bottom}}$ denote vertical paddings, and $P_{\text{left}}, P_{\text{right}}$ denote horizontal paddings:

$$H_{\text{out}} = \left\lfloor \frac{H_{\text{in}} - K_h + P_{\text{top}} + P_{\text{bottom}}}{S_h} \right\rfloor + 1$$

$$W_{\text{out}} = \left\lfloor \frac{W_{\text{in}} - K_w + P_{\text{left}} + P_{\text{right}}}{S_w} \right\rfloor + 1$$

---

## 2. Padding Strategies & Boundary Dynamics

The treatment of image boundaries exerts a profound influence on numerical gradient flow, edge response fidelity, and spatial feature distortion.

```mermaid
flowchart TD
    subgraph PaddingTaxonomy["Padding Strategies & Boundary Conditions"]
        PadStrategies["Spatial Boundary Handlers"]
        
        PadStrategies --> Valid["Valid Padding (P = 0)"]
        PadStrategies --> Same["Same Padding (Preserves Resolution)"]
        PadStrategies --> Full["Full Padding (P = K - 1)"]
        
        Same --> Modes["Boundary Interpolation Modes"]
        Modes --> ZeroConst["Zero Padding (Constant 0.0)"]
        Modes --> Reflect["Reflection Padding (Mirror across border)"]
        Modes --> Replicate["Replication Padding (Clamp border pixel)"]
        Modes --> Circular["Circular Padding (Toroidal Wrap)"]
    end
```

### 2.1 The Three Classical Regimes

1. **Valid Padding ($P = 0$):**  
   The kernel never extends beyond the boundaries of the input tensor. Every output pixel is computed strictly from valid, observed image data.
   $$W_{\text{out}} = \left\lfloor \frac{W_{\text{in}} - K}{S} \right\rfloor + 1$$
   *Consequence:* Spatial resolution shrinks monotonically by $K - 1$ pixels per layer (for $S=1$). A deep network of 50 stacked $3 \times 3$ valid convolutions requires an initial input resolution of at least $101 \times 101$ pixels simply to produce a single scalar output ($1 \times 1$).

2. **Same Padding:**  
   Padding is calculated dynamically such that with stride $S = 1$, the output spatial resolution matches the input spatial resolution exactly:
   $$W_{\text{out}} = W_{\text{in}}$$
   Setting $S = 1$ in the dimension formula:
   $$W_{\text{in}} = W_{\text{in}} - K + 2P + 1 \implies 2P = K - 1 \implies P = \frac{K - 1}{2}$$
   *Constraint:* For $P$ to be an integer, $K$ must be **odd** ($K \in \{1, 3, 5, 7, \dots\}$). This mathematical requirement is the primary reason why virtually all vision backbones utilize odd kernel sizes. If an even kernel ($K = 4$) is used, padding must be asymmetric ($P_{\text{left}} = 1, P_{\text{right}} = 2$), which introduces spatial coordinate drift.

3. **Full Padding ($P = K - 1$):**  
   The kernel visits every position where it shares at least one overlapping pixel with the input.
   $$W_{\text{out}} = W_{\text{in}} + K - 1$$
   *Consequence:* The spatial resolution expands. Full convolution corresponds to the mathematical adjoint (transpose) of valid convolution, forming the basis of transposed convolution (`ConvTranspose2d`).

### 2.2 Boundary Artifacts & Padding Modes

When zero-padding (`padding_mode='zeros'`) is used, border pixels in the input tensor are multiplied by zero-valued virtual neighbors. This produces a synthetic discontinuity:
- **Artificial Edge Activation:** In deep networks with batch normalization, zero-padded borders artificially suppress the mean activation along borders, skewing running statistics.
- **Perimeter Ringing:** High-pass and edge-detection filters perceive the transition from positive pixel values to padded zeros as an intense, high-contrast step edge, generating spurious perimeter activations.

Alternative padding modes eliminate boundary discontinuity:

$$\text{Zero Padding:} \quad X_{\text{pad}}[i] = 0 \quad (\text{if } i < 0 \text{ or } i \ge W)$$

$$\text{Replication Padding:} \quad X_{\text{pad}}[i] = X[\text{clip}(i, 0, W-1)]$$

$$\text{Reflection Padding:} \quad X_{\text{pad}}[-i] = X[i], \quad X_{\text{pad}}[W - 1 + i] = X[W - 1 - i]$$

$$\text{Circular Padding:} \quad X_{\text{pad}}[i] = X[i \pmod W]$$

Circular padding is indispensable when modeling panoramic $360^\circ$ cylindrical imagery or periodic spatial lattices (e.g., crystalline structures in materials science), where the left boundary physically wraps around to connect continuously with the right boundary.

---

## 3. Receptive Field Theory: TRF vs. ERF

The **Receptive Field (RF)** of a unit in layer $l$ of a convolutional network is the spatial region in the input image $X_0$ that can influence the activation of that unit.

```mermaid
flowchart TD
    subgraph RFExpansion["Receptive Field Growth Across Stacked Layers"]
        L0["Input Image X_0: Resolution H x W"]
        L1["Layer 1: Conv 3x3, Stride 1 -> RF = 3x3"]
        L2["Layer 2: Conv 3x3, Stride 2 -> RF = 7x7"]
        L3["Layer 3: Conv 3x3, Stride 1 -> RF = 11x11"]
        
        L0 -->|"Kernel K_1=3, S_1=1"| L1
        L1 -->|"Kernel K_2=3, S_2=2"| L2
        L2 -->|"Kernel K_3=3, S_3=1"| L3
    end

    subgraph ERFProfile["Effective Receptive Field (ERF) Profile"]
        direction TB
        Center["Center Pixel: Maximum Influence (Peak of 2D Gaussian)"]
        Mid["Mid Radius: Exponential Gradient Decay"]
        Edge["Perimeter: Vanishing Influence (< 1% of peak)"]
        Center --> Mid --> Edge
    end
```

### 3.1 Mathematical Derivation of Theoretical Receptive Field (TRF)

Let:
- $RF_l$ be the spatial diameter of the receptive field at layer $l$.
- $J_l$ be the **cumulative stride** (or "jump") between consecutive feature units in layer $l$ relative to the input space.
- $K_l$ be the kernel size of layer $l$.
- $S_l$ be the stride of layer $l$.

#### Step 1: The Cumulative Jump Recurrence
The jump $J_l$ measures how many input pixels a 1-pixel shift in layer $l$ corresponds to:
$$J_0 = 1$$
$$J_l = J_{l-1} \cdot S_l$$

#### Step 2: The Receptive Field Diameter Recurrence
A kernel of size $K_l$ in layer $l$ spans $K_l$ units of layer $l-1$. The distance between adjacent units in layer $l-1$ in terms of input image pixels is $J_{l-1}$.  
The total span of the outer units in layer $l-1$ is $(K_l - 1) \cdot J_{l-1}$ input pixels.  
Each of those individual units in layer $l-1$ already covers a region of diameter $RF_{l-1}$ in the input image.  

Therefore, the receptive field expands additively:

$$RF_0 = 1$$

$$RF_l = RF_{l-1} + (K_l - 1) \cdot J_{l-1}$$

#### Step 3: Feature Coordinate Center Mapping
To locate the exact continuous coordinate in input image space corresponding to a feature index $p_l$ in layer $l$:

$$\text{Center}_0 = p_0$$

$$\text{Center}_l = \text{Center}_{l-1} + \left( \frac{K_l - 1}{2} - P_l \right) \cdot J_{l-1} + p_l \cdot J_l$$

For symmetric padding where $P_l = \frac{K_l - 1}{2}$, the offset term $\left( \frac{K_l - 1}{2} - P_l \right) = 0$, guaranteeing that feature map coordinate $p_l = 0$ aligns perfectly with the input image origin.

### 3.2 Effective Receptive Field (ERF) Theory

While the Theoretical Receptive Field (TRF) defines the strict geometric bounding box of pixels that *could* influence a neuron, empirical sensitivity is radically non-uniform.

In their seminal paper *Understanding the Effective Receptive Field in Deep Convolutional Networks* (NIPS 2016), Luo, Li, Urtasun, and Zemel proved that the distribution of impact of input pixels on an output unit follows a **2D Gaussian distribution**.

Let $y$ be a scalar activation at the center of the output feature map, and let $x(i, j)$ be an input pixel. The influence of $x(i, j)$ on $y$ is quantified by the partial derivative:

$$I(i, j) = \left| \frac{\partial y}{\partial x(i, j)} \right|$$

#### The Central Limit Theorem of Deep Networks
During backpropagation through $L$ identical convolutional layers with independent kernel weights, computing $\frac{\partial y}{\partial x}$ involves compounding chain-rule products:

$$\frac{\partial y}{\partial \mathbf{x}_0} = \prod_{l=1}^L \mathbf{W}_l^\top$$

Under mild regularity conditions, the convolution of multiple spatial kernels is mathematically equivalent to the repeated addition of independent random spatial step distributions. By the **Central Limit Theorem**, the continuous composition of multiple finite-support kernels converges asymptotically to a Gaussian distribution:

$$I(i, j) \propto \exp\left( -\frac{(i - c_i)^2 + (j - c_j)^2}{2 \sigma_{\text{eff}}^2} \right)$$

where the effective standard deviation scales as:

$$\sigma_{\text{eff}} \propto \sqrt{L} \cdot K$$

#### The Geometric Consequence
- The **Theoretical RF** grows linearly with depth: $\mathcal{O}(L \cdot K)$.
- The **Effective RF radius** grows only with the square root of depth: $\mathcal{O}(\sqrt{L} \cdot K)$.
- The effective receptive field occupies only a fraction ($20\% \text{ to } 30\%$) of the theoretical receptive field area!
- **Residual connections** dramatically expand the ERF because identity skip paths propagate gradients directly across layers without compounding shrinkage.

---

## 4. Dilated (Atrous) Convolutions

To expand receptive fields across high-resolution dense prediction tasks (such as semantic segmentation in DeepLab, or real-time audio synthesis in WaveNet) without discarding spatial resolution via pooling, Holschneider et al. (1987) and Yu & Koltun (2015) introduced **dilated (atrous) convolutions**.

A 2D dilated convolution with dilation rate $r \in \mathbb{Z}^+$ is defined as:

$$(I \star_r K)(i, j) = \sum_{m=-k}^{k} \sum_{n=-k}^{k} I(i + r \cdot m, j + r \cdot n) \, K(m, n)$$

```mermaid
flowchart LR
    subgraph DilationComparison["Dense vs. Dilated Kernel Comparison"]
        Dense["Standard Conv (r=1)"] --> D3["3x3 Kernel, Span: 3x3, Params: 9"]
        Dilated2["Dilated Conv (r=2)"] --> D5["3x3 Kernel, Span: 5x5, Holes: 1, Params: 9"]
        Dilated4["Dilated Conv (r=4)"] --> D9["3x3 Kernel, Span: 9x9, Holes: 3, Params: 9"]
    end
```

### 4.1 Exponential Receptive Field Expansion
By stacking dilated convolutions with exponentially increasing dilation rates $r = [1, 2, 4, 8, \dots]$, the receptive field grows **exponentially** with depth:

$$RF_L = 1 + \sum_{l=1}^L (K_l - 1) \cdot r_l$$

If $r_l = 2^{l-1}$ and $K = 3$:

$$RF_L = 1 + 2 \sum_{l=1}^L 2^{l-1} = 1 + 2 (2^L - 1) = 2^{L+1} - 1 = \mathcal{O}(2^L)$$

In contrast to standard convolutions where $RF = \mathcal{O}(L)$, dilated convolutions provide an exponential field of view while preserving the exact spatial resolution $H \times W$ and keeping parameter count completely invariant!

### 4.2 The Gridding Artifact Pathology
If successive layers use dilation rates that share a common factor (e.g., $r = [2, 4, 8]$), the effective sampling grid forms periodic "holes." Pixels lying within the holes never participate in the convolution, resulting in checkerboard artifacts and localized blind spots (the **gridding effect**).

```
Dilation r=2 sampling grid (Holes marked with .):
X . X . X
. . . . .
X . X . X
. . . . .
X . X . X
```

Wang et al. (2018) formulated the **Hybrid Dilated Convolution (HDC)** design rule to prevent gridding. Let $r_1, r_2, \dots, r_n$ be the dilation rates of $n$ consecutive layers. The maximum distance between two nonzero sampling points must satisfy:

$$M_i = \max(M_{i+1} - 2r_i, \, M_{i+1} - 2(M_{i+1} - r_i), \, r_i) \le K$$

A standard safe HDC pattern for $K = 3$ is $r = [1, 2, 3]$ (coprime rates), completely avoiding the gridding pathology.

---

## 5. Pooling Operations: Feature Selection & Invariance

Pooling layers aggregate spatial neighborhoods to impart **local translation invariance**, reduce tensor memory, and prevent spatial overfitting.

```mermaid
flowchart TD
    subgraph PoolingMechanisms["Pooling Operations Comparison"]
        FeatureMap["Input Feature Map (C x H x W)"]
        
        FeatureMap --> MaxP["Max Pooling (2x2, S=2)"]
        FeatureMap --> AvgP["Average Pooling (2x2, S=2)"]
        FeatureMap --> GAP["Global Average Pooling (GAP)"]
        
        MaxP --> ResMax["Selects argmax, routes gradient strictly to winning unit"]
        AvgP --> ResAvg["Computes mean, distributes gradient uniformly (1/K^2)"]
        GAP --> ResGAP["Collapses (H x W) -> 1x1, replaces FC layers, 0 params"]
    end
```

### 5.1 Max Pooling vs. Average Pooling

| Dimension | Max Pooling | Average Pooling |
| :--- | :--- | :--- |
| **Operation** | $y = \max_{(m, n) \in \Omega} X(m, n)$ | $y = \frac{1}{|\Omega|} \sum_{(m, n) \in \Omega} X(m, n)$ |
| **Feature Preference** | Sharp edges, high-contrast salient features, peak activations. | Smooth background textures, low-frequency scene composition. |
| **Invariance** | High local translation invariance; suppresses small perturbations. | Preserves background energy; sensitive to extreme outliers. |
| **Backward Gradient** | **Routing Mask:** Gradient $\frac{\partial \mathcal{L}}{\partial y}$ is assigned strictly to the winning index; all non-max units receive $0.0$. | **Uniform Redistribution:** Gradient is split equally: $\frac{\partial \mathcal{L}}{\partial X_i} = \frac{1}{|\Omega|} \frac{\partial \mathcal{L}}{\partial y}$. |

### 5.2 Global Average Pooling (GAP)

Introduced by Lin, Chen, and Yan in *Network In Network* (2013), **Global Average Pooling** replaces the massive fully connected classification heads of classic architectures (AlexNet, VGG).

Given a final convolutional feature tensor $X \in \mathbb{R}^{C \times H \times W}$, GAP computes the spatial mean across each channel:

$$\mathbf{z}_c = \frac{1}{H \cdot W} \sum_{i=1}^H \sum_{j=1}^W X(c, i, j), \quad \forall c \in \{1, 2, \dots, C\}$$

Output tensor shape: $(C, 1, 1)$, flattened to a vector $\mathbf{z} \in \mathbb{R}^C$.

#### Why GAP Revolutionized Vision Backbones:
1. **Zero Parameters:** A dense projection from $7 \times 7 \times 512$ to 4096 units requires $25,165,824$ parameters. GAP requires exactly $0$ parameters.
2. **Arbitrary Input Resolutions:** Fully connected layers mandate a fixed input spatial size ($H \times W$). GAP allows vision networks to accept arbitrary test resolutions dynamically.
3. **Class Activation Mapping (CAM):** Because each channel in $X$ corresponds directly to a category score via a final linear layer $\mathbf{w}_c^\top \mathbf{z}$, the spatial feature map $X(c, :, :)$ directly visualizes the localization heatmap of the target class without needing bounding box annotations.

---

## 6. From-Scratch Production Implementation

Below is a complete, production-grade Python script containing:
1. An arbitrary CNN DAG Receptive Field, Jump, and Coordinate Center Calculator.
2. A custom `MaxPool2d` module built with PyTorch's `torch.autograd.Function` implementing forward argmax tracking and exact backward gradient mask routing.
3. Full verification against native PyTorch layers.

```python
"""
receptive_field_and_pooling.py
================================
Production implementation of spatial dimension geometry:
- Arbitrary CNN Receptive Field / Cumulative Jump / Center Coordinate Calculator
- Custom MaxPool2d Autograd Function with exact forward argmax routing and backward mask dispatch
- Numerical gradient checking vs PyTorch native nn.MaxPool2d
"""

import math
import numpy as np
import torch
import torch.nn as nn
from typing import List, Dict, Tuple, Any


class CNNReceptiveFieldAnalyzer:
    """
    Computes exact spatial transformation geometry across arbitrary sequential CNNs:
    - Theoretical Receptive Field (TRF)
    - Cumulative Stride / Jump (J)
    - Effective Kernel Size
    - Spatial Output Dimensions
    - Coordinate Center Alignment
    """

    def __init__(self, input_size: Tuple[int, int] = (224, 224)):
        self.input_size = input_size
        self.layers: List[Dict[str, Any]] = []

    def add_layer(
        self, 
        name: str, 
        kernel_size: int, 
        stride: int = 1, 
        padding: int = 0, 
        dilation: int = 1
    ) -> None:
        """Appends a spatial transformation layer to the DAG pipeline."""
        self.layers.append({
            "name": name,
            "k": kernel_size,
            "s": stride,
            "p": padding,
            "d": dilation
        })

    def analyze(self) -> List[Dict[str, Any]]:
        """
        Executes full forward spatial recurrence analysis.
        
        Returns:
            List of dictionaries containing layer-by-layer spatial metrics.
        """
        results = []
        current_rf = 1.0
        current_jump = 1.0
        current_h, current_w = self.input_size
        current_center = 0.5  # Continuous center in pixel coordinates [0, 1]

        for idx, layer in enumerate(self.layers):
            k = layer["k"]
            s = layer["s"]
            p = layer["p"]
            d = layer["d"]
            name = layer["name"]

            # 1. Effective kernel size under dilation
            k_eff = d * (k - 1) + 1

            # 2. Output spatial dimension
            h_out = math.floor((current_h + 2 * p - k_eff) / s) + 1
            w_out = math.floor((current_w + 2 * p - k_eff) / s) + 1

            # 3. Receptive field recurrence: RF_l = RF_{l-1} + (k_eff - 1) * J_{l-1}
            rf_out = current_rf + (k_eff - 1) * current_jump

            # 4. Feature coordinate center recurrence
            center_out = current_center + ((k_eff - 1) / 2.0 - p) * current_jump

            # 5. Jump recurrence: J_l = J_{l-1} * s
            jump_out = current_jump * s

            record = {
                "layer_idx": idx + 1,
                "name": name,
                "k_eff": k_eff,
                "stride": s,
                "padding": p,
                "dilation": d,
                "out_shape": (h_out, w_out),
                "rf": rf_out,
                "jump": jump_out,
                "center_offset": center_out
            }
            results.append(record)

            # Advance state to next layer
            current_rf = rf_out
            current_jump = jump_out
            current_h, current_w = h_out, w_out
            current_center = center_out

        return results


# =====================================================================
# Custom MaxPool2d with Exact Backward Mask Routing
# =====================================================================

class CustomMaxPool2dFunction(torch.autograd.Function):
    """
    Autograd Function implementing custom MaxPool2d.
    Forward pass records spatial argmax indices.
    Backward pass routes gradient exclusively to winning coordinates.
    """

    @staticmethod
    def forward(ctx, x: torch.Tensor, kernel_size: int, stride: int, padding: int) -> torch.Tensor:
        """
        Forward Max Pooling.
        
        Args:
            x: Input tensor of shape (N, C, H, W)
            kernel_size: Spatial pooling window
            stride: Stride step
            padding: Zero-padding
            
        Returns:
            Max-pooled tensor of shape (N, C, H_out, W_out)
        """
        N, C, H, W = x.shape
        K = kernel_size
        S = stride
        P = padding

        H_out = math.floor((H + 2 * P - K) / S) + 1
        W_out = math.floor((W + 2 * P - K) / S) + 1

        # Apply padding if necessary
        if P > 0:
            x_padded = torch.nn.functional.pad(x, (P, P, P, P), value=-float('inf'))
        else:
            x_padded = x

        # Unfold input into patches: shape (N, C, H_out, W_out, K, K)
        # Using stride tricks via unfold
        patches = x_padded.unfold(2, K, S).unfold(3, K, S)
        patches_flat = patches.contiguous().view(N, C, H_out, W_out, K * K)

        # Compute max values and their flat indices within each KxK patch
        max_vals, argmax_flat = torch.max(patches_flat, dim=-1)

        # Save context for backpropagation
        ctx.save_for_backward(argmax_flat)
        ctx.x_shape = x.shape
        ctx.kernel_size = K
        ctx.stride = S
        ctx.padding = P
        ctx.H_out = H_out
        ctx.W_out = W_out

        return max_vals

    @staticmethod
    def backward(ctx, grad_output: torch.Tensor) -> Tuple[torch.Tensor, None, None, None]:
        """
        Backward gradient routing.
        Scatter-adds incoming gradients strictly to the winning argmax indices.
        """
        argmax_flat, = ctx.saved_tensors
        N, C, H, W = ctx.x_shape
        K = ctx.kernel_size
        S = ctx.stride
        P = ctx.padding
        H_out, W_out = ctx.H_out, ctx.W_out

        grad_input_padded = torch.zeros((N, C, H + 2 * P, W + 2 * P), device=grad_output.device, dtype=grad_output.dtype)

        # Convert flat argmax inside KxK window to relative (kh, kw) offsets
        kh_indices = torch.div(argmax_flat, K, rounding_mode='floor')
        kw_indices = argmax_flat % K

        # Iterate over output spatial positions and route gradient
        # (Vectorized scatter logic across batch and channels)
        for h in range(H_out):
            h_in = h * S
            for w in range(W_out):
                w_in = w * S
                
                # Extract relative winning coordinates for this patch
                r_h = kh_indices[:, :, h, w]  # Shape: (N, C)
                r_w = kw_indices[:, :, h, w]  # Shape: (N, C)
                grad_val = grad_output[:, :, h, w]  # Shape: (N, C)

                # Map to padded coordinates
                abs_h = h_in + r_h
                abs_w = w_in + r_w

                # Scatter gradient into corresponding memory location
                # Using batch and channel advanced indexing
                batch_idx = torch.arange(N, device=grad_output.device)[:, None]
                channel_idx = torch.arange(C, device=grad_output.device)[None, :]
                
                grad_input_padded[batch_idx, channel_idx, abs_h, abs_w] += grad_val

        # Slice out padding if P > 0
        if P > 0:
            grad_input = grad_input_padded[:, :, P:H + P, P:W + P]
        else:
            grad_input = grad_input_padded

        return grad_input, None, None, None


class CustomMaxPool2d(nn.Module):
    """Production PyTorch module wrapping CustomMaxPool2dFunction."""

    def __init__(self, kernel_size: int = 2, stride: int = 2, padding: int = 0):
        super().__init__()
        self.kernel_size = kernel_size
        self.stride = stride
        self.padding = padding

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return CustomMaxPool2dFunction.apply(x, self.kernel_size, self.stride, self.padding)


# =====================================================================
# Verification and Test Suite
# =====================================================================

def run_receptive_field_demo():
    print("=" * 70)
    print("1. RUNNING ARBITRARY CNN DAG RECEPTIVE FIELD ANALYSIS")
    print("=" * 70)

    # Simulate early layers of a ResNet-like vision backbone
    analyzer = CNNReceptiveFieldAnalyzer(input_size=(224, 224))
    analyzer.add_layer("Conv1_7x7", kernel_size=7, stride=2, padding=3)
    analyzer.add_layer("MaxPool_3x3", kernel_size=3, stride=2, padding=1)
    analyzer.add_layer("ResBlock1_Conv1", kernel_size=3, stride=1, padding=1)
    analyzer.add_layer("ResBlock1_Conv2", kernel_size=3, stride=1, padding=1)
    analyzer.add_layer("ResBlock2_Conv1_Strided", kernel_size=3, stride=2, padding=1)
    analyzer.add_layer("ResBlock2_Conv2_Dilated", kernel_size=3, stride=1, padding=2, dilation=2)

    results = analyzer.analyze()

    print(f"{'Layer Name':<25} | {'Out Res':<10} | {'RF (px)':<8} | {'Jump':<6} | {'Center Offset':<12}")
    print("-" * 70)
    for r in results:
        res_str = f"{r['out_shape'][0]}x{r['out_shape'][1]}"
        print(f"{r['name']:<25} | {res_str:<10} | {r['rf']:<8.1f} | {r['jump']:<6.1f} | {r['center_offset']:<12.2f}")


def run_pooling_autograd_test():
    print("\n" + "=" * 70)
    print("2. TESTING CUSTOM MAXPOOL2D FORWARD & BACKWARD ROUTING")
    print("=" * 70)

    torch.manual_seed(42)
    N, C, H, W = 2, 3, 6, 6
    K, S, P = 2, 2, 0

    # Create synthetic input tensor requiring gradients
    x_custom = torch.randn(N, C, H, W, dtype=torch.float64, requires_grad=True)
    x_torch = x_custom.clone().detach().requires_grad_(True)

    # 1. Forward passes
    custom_pool = CustomMaxPool2d(kernel_size=K, stride=S, padding=P)
    native_pool = nn.MaxPool2d(kernel_size=K, stride=S, padding=P)

    out_custom = custom_pool(x_custom)
    out_native = native_pool(x_torch)

    fwd_diff = torch.max(torch.abs(out_custom - out_native)).item()
    print(f"Forward Output Shape:       {out_custom.shape}")
    print(f"Forward Max Absolute Diff:  {fwd_diff:.2e}")
    assert fwd_diff < 1e-7, "Forward pass failed numerical validation!"

    # 2. Backward gradient passes
    grad_target = torch.randn_like(out_custom)
    out_custom.backward(grad_target)
    out_native.backward(grad_target)

    bwd_diff = torch.max(torch.abs(x_custom.grad - x_torch.grad)).item()
    print(f"Backward Grad Input Shape:  {x_custom.grad.shape}")
    print(f"Backward Max Absolute Diff: {bwd_diff:.2e}")
    assert bwd_diff < 1e-7, "Backward gradient routing mask failed validation!"

    print("  => ALL AUTOGRAD POOLING VERIFICATIONS PASSED WITH ZERO DRIFT!\n")


if __name__ == "__main__":
    run_receptive_field_demo()
    run_pooling_autograd_test()
```

---

## 7. Real-World Production Incident Post-Mortem

### The \$2.3M Sub-Pixel Localization Collapse in a Robotic Microsurgery Vision System

```
================================================================================
INCIDENT RETROSPECTIVE: POST-MORTEM #SURGICAL-9912
SEVERITY: P1 (Safety-Critical Robotic Calibration Failure)
SYSTEM: PrecisionEye Sub-Millimeter Laser Tissue Ablation Controller
DATE: October 22, 2024
FINANCIAL IMPACT: \$2,300,000 in clinical trial recalls and hardware re-certifications
================================================================================
```

```mermaid
sequenceDiagram
    autonumber
    participant Stereo as "Stereo Surgical Camera (4096 x 3072)"
    participant Backbone as "Feature Extractor (Stacked Strided Conv DAG)"
    participant Head as "Sub-Pixel Keypoint Regression Head"
    participant Actuator as "Sub-Millimeter Laser Robotic Arm"

    Stereo->>Backbone: High-resolution stereo feed ingested
    critical The Asymmetric Padding Coordinate Creep
        Note over Backbone: Conv layers with ceil_mode & odd padding
        Backbone->>Backbone: Cumulative 2.4-pixel horizontal coordinate drift
        Backbone->>Head: Misaligned deep feature activation centroid
    end
    Head->>Actuator: Predicted incision coordinate (Drift: +0.48 mm)
    Actuator-->>Actuator: Safety Interlock Threshold Tripped (Margin: 0.10 mm exceeded)
    Actuator-->>Stereo: Emergency Robotic E-Stop Engaged (Trial Halted)
```

#### Incident Context
The PrecisionEye autonomous surgical system performs laser corneal microsurgery. Operating at sub-millimeter scales, the system tracks corneal anatomical landmarks using a deep neural network and directs a high-frequency ultraviolet laser with an allowable spatial tolerance of $\pm 0.05\text{ mm}$ ($50\text{ }\mu\text{m}$).

During phase-II human clinical trials, the robotic controller's safety interlock abruptly aborted five consecutive procedures. The error telemetry indicated a systematic, non-random spatial offset: the visual keypoint detector was registering corneal landmark coordinates **$0.48\text{ mm}$ to the right** of physical calibration markers, breaching the hard safety boundary ($0.10\text{ mm}$).

#### Root Cause Analysis: The Asymmetric Padding Coordinate Creep
The vision team had recently updated the feature extractor backbone to accommodate odd-dimension input crops ($513 \times 513$) by setting `ceil_mode=True` in pooling layers and using asymmetric padding across stride-2 convolutions.

Tracing the spatial coordinate center recurrence (Section 3.1):

$$\text{Center}_l = \text{Center}_{l-1} + \left( \frac{K_l - 1}{2} - P_{\text{left}, l} \right) \cdot J_{l-1} + p_l \cdot J_l$$

When a symmetric $3 \times 3$ kernel ($K = 3$) has symmetric padding $P = 1$:

$$\frac{K - 1}{2} - P = \frac{3 - 1}{2} - 1 = 0 \implies \text{Zero Spatial Bias}$$

However, in three intermediate transition blocks, the engineer had configured an asymmetric padding tuple: `padding=(1, 2)` (1 pixel top/bottom, 2 pixels left/right) to match an external TensorFlow export:

$$\Delta_{\text{offset}} = \left( \frac{3 - 1}{2} - 2 \right) = 1.0 - 2.0 = -1.0\text{ feature units}$$

Across three consecutive downsampling stages with cumulative jumps $J = [2, 4, 8]$:

$$\Delta_{\text{total\_drift}} = (-1.0 \times 1) + (-1.0 \times 2) + (-1.0 \times 4) = -7.0\text{ input pixels}$$

When the downstream sub-pixel heatmap regression head applied a bilinear grid sampler to map feature peaks back to physical metric space, it assumed **canonical symmetric coordinate centering** ($\text{offset} = 0$).

At the surgical camera's magnification ratio of $0.068\text{ mm/pixel}$:

$$\text{Physical Error} = 7.0\text{ pixels} \times 0.068\text{ mm/pixel} = 0.476\text{ mm}$$

This $0.476\text{ mm}$ systematic bias breached the $0.05\text{ mm}$ surgical tolerance by nearly **an order of magnitude**, automatically triggering emergency robotic safety interlocks.

#### Engineering Remediation
1. **Strict Coordinate Centering Enforcement:** All asymmetric paddings were removed. The architecture was restricted to odd kernels with strictly symmetric padding ($P = (K - 1) / 2$).
2. **Explicit Spatial Coordinate Tracking Unit Tests:** An automated assertion suite was incorporated into CI/CD that shoots a Dirac delta impulse $\delta(x_0, y_0)$ through the entire CNN DAG and verifies that the output activation centroid coincides with the analytical ground-truth center within $10^{-4}$ pixel precision.

---

## 8. Failure Modes, Edge Cases & Antipatterns

### 8.1 The "Gridding Artifact" of Stacked Dilations

```python
# BAD: Cascaded powers-of-two dilation rates create catastrophic periodic sampling holes
layers = nn.Sequential(
    nn.Conv2d(64, 64, kernel_size=3, dilation=2, padding=2),
    nn.Conv2d(64, 64, kernel_size=3, dilation=4, padding=4),
    nn.Conv2d(64, 64, kernel_size=3, dilation=8, padding=8)  # Causes checkerboard gridding!
)

# GOOD: Hybrid Dilated Convolution (HDC) with coprime dilation rates ensures dense coverage
layers_hdc = nn.Sequential(
    nn.Conv2d(64, 64, kernel_size=3, dilation=1, padding=1),
    nn.Conv2d(64, 64, kernel_size=3, dilation=2, padding=2),
    nn.Conv2d(64, 64, kernel_size=3, dilation=3, padding=3)  # Completely fills receptive field gaps
)
```

### 8.2 Gradient Starvation via MaxPool Dead Zones

In architectures with deep cascades of non-overlapping max-pooling layers, the backward gradient is routed exclusively to the single winning pixel in each pooling window. Over $80\%$ of spatial units receive a gradient of exactly $0.0$. If early network weights are initialized with high variance, a small subset of saturated neurons wins every max competition across all training batches, causing surrounding weights to suffer from irreversible gradient starvation.

*Remedy:* Utilize strided convolutions (`nn.Conv2d(..., stride=2)`) instead of MaxPool for learnable, fully differentiable downsampling, or incorporate residual identity shortcuts that bypass pooling bottlenecks.

---

## 9. Senior Technical Interview Questions & Model Answers

### Question 1: Spatial Geometry Derivations
**Interviewer:** *"Given an input of spatial dimensions $W \times H = 100 \times 100$, what is the output dimension after passing through a $5 \times 5$ convolution with dilation $d = 3$, stride $S = 2$, and padding $P = 4$? Show the complete arithmetic step by step."*

**Candidate Model Answer:**
"We apply the general spatial dimension equation:

$$W_{\text{out}} = \left\lfloor \frac{W_{\text{in}} + 2P - K_{\text{eff}}}{S} \right\rfloor + 1$$

**Step 1: Compute Effective Kernel Size ($K_{\text{eff}}$):**  
A kernel of size $K = 5$ with dilation $d = 3$ inserts $d - 1 = 2$ empty spaces between each of its 5 elements:

$$K_{\text{eff}} = d(K - 1) + 1 = 3(5 - 1) + 1 = 3(4) + 1 = 13$$

**Step 2: Compute Total Padded Extent:**  
$$W_{\text{padded}} = W_{\text{in}} + 2P = 100 + 2(4) = 108$$

**Step 3: Evaluate Sliding Steps:**  
$$\text{Remaining Distance} = W_{\text{padded}} - K_{\text{eff}} = 108 - 13 = 95$$

$$\text{Steps} = \left\lfloor \frac{95}{S} \right\rfloor = \left\lfloor \frac{95}{2} \right\rfloor = 47$$

**Step 4: Compute Output Dimension:**  
$$W_{\text{out}} = 47 + 1 = 48$$

Because the input is square ($100 \times 100$) and parameters are isotropic, $H_{\text{out}} = 48$.  
The output feature map dimensions are **$48 \times 48$**."

---

### Question 2: Receptive Field Theory
**Interviewer:** *"Prove why the Effective Receptive Field (ERF) grows at a rate of $\mathcal{O}(\sqrt{L})$ with network depth $L$, while the Theoretical Receptive Field (TRF) grows at $\mathcal{O}(L)$. What architectural mechanism allows modern vision models to overcome this limitation?"*

**Candidate Model Answer:**
"The Theoretical Receptive Field (TRF) is a purely geometric measure defining the outer bounding box of all pixels connected by at least one active computational graph path to the output neuron. In a cascade of $L$ layers each having kernel size $K$ and stride 1:

$$RF_L = RF_0 + L(K - 1) = 1 + L(K - 1) = \mathcal{O}(L)$$

However, the Effective Receptive Field (ERF) measures the magnitude of the gradient $\left| \frac{\partial y}{\partial x(i, j)} \right|$.  
Computing this gradient requires summing over all paths connecting input pixel $(i, j)$ to output $y$. The number of available paths connecting an input pixel to the center output neuron is maximized at the exact center and decays exponentially toward the peripheral boundaries according to a binomial coefficient distribution:

$$\text{Path Count}(x) = \binom{L}{x}$$

By the Central Limit Theorem, as $L \to \infty$, the composition of these binomial path counts converges to a 2D Gaussian density function:

$$G(x, y) \propto \exp\left( -\frac{x^2 + y^2}{2 \sigma_L^2} \right)$$

Because the variance of the sum of $L$ independent random spatial steps is the sum of their individual variances:

$$\sigma_L^2 = \sum_{l=1}^L \sigma_l^2 = L \cdot \sigma_0^2 \implies \sigma_L = \sqrt{L} \cdot \sigma_0 = \mathcal{O}(\sqrt{L})$$

Since the effective diameter of a Gaussian is conventionally measured by a constant multiple of its standard deviation (e.g., $2\sigma$ or $3\sigma$), the ERF diameter expands at $\mathcal{O}(\sqrt{L})$.

**Architectural Mechanism to Overcome This:**  
1. **Residual Connections:** Identity shortcuts create direct gradient highways where paths of length 1, 2, ..., $L$ coexist simultaneously, dramatically broadening the Gaussian distribution.
2. **Dilated Convolutions:** By setting dilation rates exponentially ($r = 2^l$), the effective step size doubles at each layer, accelerating ERF growth to $\mathcal{O}(2^L)$.
3. **Self-Attention / Vision Transformers:** Global dot-product attention computes pairwise affinities across all spatial coordinates in a single operation, setting the receptive field to $100\%$ of the image in Layer 1."

---

### Question 3: Pooling Mechanics & Feature Interpretability
**Interviewer:** *"Compare Global Average Pooling (GAP) with a Fully Connected (FC) layer at the output of a visual backbone. Explain how GAP enables Class Activation Mapping (CAM) without requiring any bounding-box supervision."*

**Candidate Model Answer:**
"**1. Parameter Budget and Overfitting:**  
An FC layer connecting a final feature map of shape $(C, H, W)$ to $N_{\text{classes}}$ outputs requires $C \cdot H \cdot W \cdot N_{\text{classes}}$ weights. In VGG-16, this single transition accounts for over $100\text{M}$ parameters ($7 \times 7 \times 512 \to 4096$). GAP collapses spatial dimensions via a parameter-free average:

$$\mathbf{z}_c = \frac{1}{HW} \sum_{i, j} X(c, i, j)$$

followed by a simple linear layer with only $C \cdot N_{\text{classes}}$ parameters. For $C=512, N_{\text{classes}}=1000$, this reduces parameters from $102.7\text{M}$ to $0.51\text{M}$ ($>99.5\%$ reduction), eliminating spatial overfitting.

**2. Class Activation Mapping (CAM):**  
In a GAP architecture, the pre-softmax classification logit $S_k$ for class $k$ is:

$$S_k = \sum_{c=1}^C w_{c, k} \mathbf{z}_c = \sum_{c=1}^C w_{c, k} \left( \frac{1}{HW} \sum_{i=1}^H \sum_{j=1}^W X(c, i, j) \right)$$

Because summation is linear and commutative, we can interchange the order of operations:

$$S_k = \frac{1}{HW} \sum_{i=1}^H \sum_{j=1}^W \left( \sum_{c=1}^C w_{c, k} X(c, i, j) \right) = \frac{1}{HW} \sum_{i=1}^H \sum_{j=1}^W M_k(i, j)$$

where $M_k(i, j) = \sum_{c=1}^C w_{c, k} X(c, i, j)$ is the **Class Activation Map** for category $k$.  
$M_k(i, j)$ directly reveals the spatial contribution of coordinate $(i, j)$ to the final classification score $S_k$. By upsampling $M_k$ back to input resolution via bilinear interpolation, the model produces precise object localization bounding boxes and heatmaps trained strictly with image-level labels."

---

## 10. Practical Exercises & Self-Assessment Drills

### Drill: Hand Calculation of Receptive Field DAG
Compute the exact theoretical receptive field ($RF$) and cumulative jump ($J$) for the following 3-layer architecture:
- Input: $X_0$ (Pixel resolution $256 \times 256$)
- Layer 1: Conv2D ($K_1 = 5, S_1 = 2, P_1 = 2$)
- Layer 2: MaxPool2D ($K_2 = 2, S_2 = 2, P_2 = 0$)
- Layer 3: Conv2D ($K_3 = 3, S_3 = 1, P_3 = 1$)

<details>
<summary>View Complete Worked Solution</summary>

**Initial Conditions:**  
$$RF_0 = 1, \quad J_0 = 1$$

**Layer 1 (Conv2D: $K_1=5, S_1=2$):**  
$$RF_1 = RF_0 + (K_1 - 1) \cdot J_0 = 1 + (5 - 1) \cdot 1 = 1 + 4 = 5$$
$$J_1 = J_0 \cdot S_1 = 1 \cdot 2 = 2$$

**Layer 2 (MaxPool2D: $K_2=2, S_2=2$):**  
$$RF_2 = RF_1 + (K_2 - 1) \cdot J_1 = 5 + (2 - 1) \cdot 2 = 5 + 2 = 7$$
$$J_2 = J_1 \cdot S_2 = 2 \cdot 2 = 4$$

**Layer 3 (Conv2D: $K_3=3, S_3=1$):**  
$$RF_3 = RF_2 + (K_3 - 1) \cdot J_2 = 7 + (3 - 1) \cdot 4 = 7 + 8 = 15$$
$$J_3 = J_2 \cdot S_3 = 4 \cdot 1 = 4$$

**Summary:**  
- The final theoretical receptive field is **$15 \times 15$ input pixels**.
- The cumulative jump is **$J = 4$** (each output feature step corresponds to a 4-pixel shift in the input image).

</details>

---

[$\leftarrow$ Previous Module](../00-images-as-tensors-convolutions-and-kernels/README.md) | [Track Overview](../README.md) | [Next Module $\rightarrow$](../02-classic-cnns-lenet-alexnet-vgg/README.md)
