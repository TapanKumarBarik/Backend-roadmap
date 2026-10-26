# Module 13: Cloud GPU Economics

## Roadmap

**Where this sits.** [Module 12](../12-choosing-gpus-consumer-vs-datacenter/README.md) gave you a shortlist of
cards that pass the technical gates. This module asks what it costs to run one, and the answer is a cost *model*,
not a price list. It leans on the memory sizing from [Module 05](../05-calculating-a-models-memory-requirements/README.md)
(how much batch fits) and the bandwidth ideas of [Module 03](../03-memory-hierarchy-and-bandwidth/README.md) (why
batching raises throughput). [Module 14](../14-running-models-on-cpu-and-apple-silicon/README.md) shows the
alternative of not renting a GPU at all.

**After this module you can** turn an hourly price and a throughput into cost per million tokens, explain why
utilization usually matters more than the sticker price, compute a rent-versus-buy break-even, judge when spot
capacity pays off, and list the non-GPU line items that surprise first bills.

**Why it matters.** A GPU bills while it is allocated, not while it is useful. Most of the distance between a
cheap and an expensive deployment of the same model is idle time and batch size, not the price per hour.

> [!warning]
> **Every price, throughput and rate in this module's calculators is ILLUSTRATIVE.** None is a real provider
> price or a measured benchmark; they are round numbers chosen so you can check the arithmetic by hand. The only
> provider facts cited are *structural* (how billing options work), taken from pages fetched in Oct 2026 and
> linked. Replace the inputs with your own measured throughput and your own quoted prices.

## Concept

> [!key]
> Cost per useful unit of work = price per hour divided by useful work per hour. Utilization (how much of the
> paid time is busy) and throughput (how much work a busy hour does) both sit in the denominator, so they
> usually move the answer further than the hourly price does.

## Explanation

### What you actually pay for

A rented GPU is billed for the time you hold it. The unit you care about is different: dollars per million
generated tokens, per training run, or per request. The bridge is one formula:

```
tokens per hour   = tokens per second x 3600 x busy fraction
cost per 1M tokens = price per hour / tokens per hour x 1e6
```

`busy fraction` is the share of paid hours the GPU is actually generating at that throughput. Everything else in
this module is a way to move one of those three numbers: price (purchase option), tokens per second (batching,
hardware, quantization), or busy fraction (scheduling, scaling, shutting down).

> [!model]
> A rented GPU is a chartered bus: the fare is the same with one passenger or forty. Cost per passenger falls
> when you fill the seats (batching), keep it on routes with passengers (utilization), and book the cheaper
> charter when the schedule allows (purchase option). A cheaper bus helps less than filling the one you have.

### Purchase options: what the providers document

The AWS EC2 pricing page (fetched Oct 2026) lists the options this way: On-Demand Instances "offer pay-as-you-go
compute capacity by the hour or second" with "No upfront payment or long-term commitment"; Savings Plans reduce
the bill "in exchange for a usage commitment"; Spot Instances use "spare Amazon EC2 capacity"; and separate
capacity products (On-Demand Capacity Reservations, Capacity Blocks for ML) address getting capacity when you
need it. Google Compute Engine documents the same shape for its Spot VMs.

| Option | You give up | You get | What the docs say |
|---|---|---|---|
| On-demand | nothing | start and stop any time, pay by the hour or second | [AWS pricing](https://aws.amazon.com/ec2/pricing/) |
| Committed (savings plans, reserved) | flexibility: you pay for the term | a lower hourly rate | AWS: Reserved Instances "applied to terminated instances are billed until the end of their term" ([instance states](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html)) |
| Spot / preemptible | the guarantee of keeping the machine | a deep discount on spare capacity | AWS: notice "issued two minutes before" stop or termination ([interruption notices](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html)); Google: Compute Engine "can preempt Spot VMs at any time", with a best-effort shutdown period "up to 30 seconds" and a preemption-notice duration that defaults to 0 seconds ([Spot VMs](https://docs.cloud.google.com/compute/docs/instances/spot)) |

Both providers advertise "up to" discount ceilings on those pages (the AWS page said up to 72% for Savings Plans
and up to 90% for Spot; the Google page said up to 91% for Spot, for many machine types, GPUs and TPUs, as
fetched in Oct 2026). Treat those as ceilings for some products, not what the GPU instance you want will cost
today. The calculators below take the discount as an input.

> [!pitfall]
> A commitment is a bet on utilization. It lowers the price per hour and removes your ability to stop paying
> when you stop using it. If you would have used the card 20% of the time on demand, a commitment makes the other
> 80% a fixed cost.

### Utilization is the dominant variable

Billing is by allocation, so idle time costs exactly as much as busy time. A development box used 40 hours of
the 168 in a week is busy 23.8% of the time; its effective price per useful hour is the hourly price divided by
0.238, about 4.2 times higher. Some idleness is avoidable (stop the instance, scale to zero, share the card
between teams) and some is structural (a low-traffic endpoint must keep a replica warm). Stopping helps but is
not free: AWS bills instance usage only while running, yet "Some AWS resources, such as Amazon EBS volumes and
Elastic IP addresses, incur charges regardless of the instance's state" (instance-state page above), so the
disk holding your weights keeps charging.

Startup is idle time too: if a new instance must pull a 140 GB model before its first token you pay for the GPU
during the download (calculated in the Code section), which is small once and large when autoscaling or spot
restarts launch machines many times a day.

### Throughput: batching moves the denominator

Decoding one token for one request reads all the weights from memory. Decoding one token each for 32 requests
reads them *once*, so the step costs only a little more while producing 32 tokens. That is why serving papers
treat batching as the central lever: the vLLM paper opens with "High throughput serving of large language models
(LLMs) requires batching sufficiently many requests at a time", and explains that the KV-cache memory of each
request limits how many fit ([Kwon et al., 2023](https://arxiv.org/abs/2309.06180)). The model in the Code
section is a simplified **estimate** of that effect: step time = bytes moved / bandwidth, where bytes = weights
plus one KV cache per request in the batch. Real engines add scheduling, kernel and attention overheads, so
measure your own throughput curve and use the model only to see the shape.

Two couplings to remember. Batch size is capped by memory (the weights plus `batch x KV` must fit; Module 05).
And you can only batch requests that exist at the same time, so batching and utilization are the same demand
problem seen from two sides: a lightly loaded endpoint can neither batch nor stay busy.

### Rent versus buy

Owning has a cost that does not depend on use, and a smaller one that does:

```
fixed per month F   = (purchase price - resale value) / (life in months) + hosting per month
marginal per hour m = power in kW x electricity price (x cooling overhead)
renting             = r x H          (r = rental price per hour, H = hours used per month)
owning              = F + m x H
break-even hours    H* = F / (r - m)
```

Below `H*` hours a month renting is cheaper; above it owning is. The model leaves out things real purchases
include: your time to operate the machine, failures and spares, networking, the risk that a newer generation
makes the card less valuable, and, if the card would sit in a datacenter or serve others, the driver-licence
question from Module 12. Treat `H*` as the optimistic edge of the decision.

### Spot capacity with interruptions

An interruption wastes the work since the last checkpoint, on average half a checkpoint interval, plus the time to
restart. With `lam` interruptions per hour, checkpoint interval `T` hours and restart time `R` hours, a first-order
estimate of the useful fraction of paid time is `f = 1 / (1 + lam x (T/2 + R))`. Spot beats on-demand when
`spot price / f < on-demand price`, equivalently when `f > spot price / on-demand price`. The estimate is only
trustworthy while `lam x T` is well below 1; once you are interrupted more than once per checkpoint interval,
the job may barely progress and the formula stops being a good guide. Frequent checkpoints, interruption notices
and stateless or retryable work are what make spot practical; a latency-sensitive endpoint with a single replica
and no fallback is what makes it risky.

### Egress, storage and the rest of the bill

- **Egress.** Cloud providers meter data leaving their network and do not charge for data arriving. Google's
  network pricing page, in its Standard Tier section (fetched Oct 2026): "Data transfer out pricing is per GiB
  delivered ... Ingress pricing is still free." AWS's
  [EC2 On-Demand pricing page](https://aws.amazon.com/ec2/pricing/on-demand/) has the same shape: separate
  "Data Transfer IN" and "Data Transfer OUT" sections, with out-to-the-internet metered beyond a monthly free
  allowance. Generated tokens are tiny; copying checkpoints, datasets, or video and audio out is not.
- **Storage.** Block and object storage bill for as long as they exist, including while the instance is stopped
  (see above).

## Code

All blocks are standard-library Python, run with the local Python 3.13, and every input is a placeholder.

### 1. Cost per million tokens, and what utilization does to it

```python
# ILLUSTRATIVE inputs only. None of these are real provider prices or measured throughputs.

def cost_per_million_tokens(price_per_hour, tokens_per_second, busy_fraction=1.0):
    """$ per 1M generated tokens = price_per_hour / tokens_per_hour * 1e6,
    where tokens_per_hour counts only the hours you actually pay for AND keep busy."""
    tokens_per_hour = tokens_per_second * 3600 * busy_fraction
    return price_per_hour / tokens_per_hour * 1e6

PRICE = 2.00      # ILLUSTRATIVE $/hour for one GPU
TPS = 1000        # ILLUSTRATIVE tokens/second at your serving batch size

print(f"price ${PRICE:.2f}/h, throughput {TPS} tok/s")
for busy in (1.00, 0.60, 0.30, 0.10):
    c = cost_per_million_tokens(PRICE, TPS, busy)
    print(f"  busy {busy:>4.0%}  ->  ${c:7.3f} per 1M tokens")
```

```
price $2.00/h, throughput 1000 tok/s
  busy 100%  ->  $  0.556 per 1M tokens
  busy  60%  ->  $  0.926 per 1M tokens
  busy  30%  ->  $  1.852 per 1M tokens
  busy  10%  ->  $  5.556 per 1M tokens
```

> [!example]
> Check it by hand. At 100% busy, 1000 tokens/s is 1000 x 3600 = 3,600,000 tokens/hour, so $2.00 / 3.6e6 x 1e6 =
> $0.5556 per million tokens, which prints as 0.556. At 30% busy, tokens/hour is 3.6e6 x 0.30 = 1,080,000 and
> $2.00 / 1.08e6 x 1e6 = $1.8519: the same card and the same price cost 3.33 times more per token because
> 70% of the paid hours were idle.

### 2. Batching: throughput and cost as batch size grows (an estimate)

```python
# ESTIMATE with ILLUSTRATIVE inputs: a memory-bound decode model of throughput vs batch size.
W_GB = 14.0        # weights read once per decode step (7B params x 2 bytes)
KV_GB = 1.0        # KV cache per sequence at the context length you serve (assumption)
BW_GBS = 1000.0    # memory bandwidth (assumption)
COMPUTE_CAP = 5000 # tokens/s the arithmetic units could sustain (assumption)
VRAM_GB = 80.0     # card memory; 90% treated as usable
PRICE = 2.00       # $/hour (assumption)

max_batch = int((0.9 * VRAM_GB - W_GB) // KV_GB)
print(f"max batch that fits in memory: {max_batch}")
print(f"{'batch':>5} {'step ms':>8} {'tok/s':>8} {'$/1M tok':>9}")
for b in (1, 2, 4, 8, 16, 32, max_batch):
    step_s = (W_GB + b * KV_GB) / BW_GBS          # bytes moved per step / bandwidth
    tps = min(b / step_s, COMPUTE_CAP)            # b tokens per step, capped by compute
    cost = PRICE / (tps * 3600) * 1e6
    print(f"{b:>5} {step_s*1000:>8.1f} {tps:>8.0f} {cost:>9.2f}")
```

```
max batch that fits in memory: 58
batch  step ms    tok/s  $/1M tok
    1     15.0       67      8.33
    2     16.0      125      4.44
    4     18.0      222      2.50
    8     22.0      364      1.53
   16     30.0      533      1.04
   32     46.0      696      0.80
   58     72.0      806      0.69
```

> [!example]
> Check by hand. Batch 1: step = (14 + 1) GB / 1000 GB/s = 15.0 ms, so 66.7 tokens/s = 240,000 tokens/hour and
> $2.00 / 240,000 x 1e6 = $8.33. Batch 32: step = (14 + 32) / 1000 = 46.0 ms, so 695.7 tokens/s = 2,504,348
> tokens/hour and $0.80. The step is only 3.1 times longer but yields 32 times the tokens. The compute cap is never
> reached here; memory capacity (batch 58) ends the curve.

### 3. Rent versus buy

```python
# ILLUSTRATIVE inputs only.
HOURS_PER_MONTH = 730          # 8760 / 12

def own_monthly_fixed(capex, resale, life_years, hosting_per_month=0.0):
    """Cost of owning that does not depend on how much you use the card."""
    return (capex - resale) / (life_years * 12) + hosting_per_month

def own_marginal_per_hour(watts, tariff_per_kwh, overhead=1.0):
    """Electricity for an hour of actual use. overhead=1.0 means no cooling/PSU loss."""
    return watts / 1000 * tariff_per_kwh * overhead

def break_even_hours(fixed_per_month, own_per_hour, rent_per_hour):
    """Rent costs r*H, own costs F + m*H  =>  H* = F / (r - m)."""
    if rent_per_hour <= own_per_hour:
        return float("inf")
    return fixed_per_month / (rent_per_hour - own_per_hour)

CAPEX, RESALE, LIFE = 8000.0, 2000.0, 3     # ILLUSTRATIVE: card + share of the machine
F = own_monthly_fixed(CAPEX, RESALE, LIFE)
M = own_marginal_per_hour(450, 0.15)        # ILLUSTRATIVE: 450 W at $0.15/kWh
R = 1.50                                    # ILLUSTRATIVE rental $/hour for a comparable GPU

h = break_even_hours(F, M, R)
print(f"fixed ownership cost   F = (({CAPEX:.0f} - {RESALE:.0f}) / ({LIFE} x 12)) = ${F:.2f}/month")
print(f"marginal power cost    m = 0.450 kW x $0.15 = ${M:.4f}/hour")
print(f"rental                 r = ${R:.2f}/hour")
print(f"break-even             H* = F / (r - m) = {h:.1f} hours/month = {h/HOURS_PER_MONTH:.1%} of the month")
for hours in (50, 100, h, 200, 400, 730):
    rent = R * hours
    own = F + M * hours
    print(f"  use {hours:>6.1f} h/month: rent ${rent:8.2f}  own ${own:8.2f}  cheaper: {'rent' if rent < own - 0.005 else ('own' if own < rent - 0.005 else 'tie')}")
```

```
fixed ownership cost   F = ((8000 - 2000) / (3 x 12)) = $166.67/month
marginal power cost    m = 0.450 kW x $0.15 = $0.0675/hour
rental                 r = $1.50/hour
break-even             H* = F / (r - m) = 116.3 hours/month = 15.9% of the month
  use   50.0 h/month: rent $   75.00  own $  170.04  cheaper: rent
  use  100.0 h/month: rent $  150.00  own $  173.42  cheaper: rent
  use  116.3 h/month: rent $  174.52  own $  174.52  cheaper: tie
  use  200.0 h/month: rent $  300.00  own $  180.17  cheaper: own
  use  400.0 h/month: rent $  600.00  own $  193.67  cheaper: own
  use  730.0 h/month: rent $ 1095.00  own $  215.94  cheaper: own
```

> [!example]
> Check the break-even by hand. Fixed cost F = (8000 - 2000) / (3 x 12) = 6000 / 36 = $166.67 per month. Marginal
> power m = 0.450 kW x $0.15 = $0.0675 per hour. H* = 166.67 / (1.50 - 0.0675) = 166.67 / 1.4325 = 116.35
> hours, which is 116.35 / 730 = 15.9% of the month. At 200 hours: renting costs 200 x 1.50 = $300.00, owning
> costs 166.67 + 200 x 0.0675 = 166.67 + 13.50 = $180.17. Both match the table.

### 4. Spot with interruptions, idle time, and model-download time

```python
# ILLUSTRATIVE inputs only.

def spot_useful_fraction(interruptions_per_hour, checkpoint_every_h, restart_h):
    """First-order model: each interruption wastes half a checkpoint interval of work plus a restart.
    f = 1 / (1 + lam * (T/2 + R)).  Only trustworthy while lam * T is well below 1."""
    return 1 / (1 + interruptions_per_hour * (checkpoint_every_h / 2 + restart_h))

ON_DEMAND = 2.00   # ILLUSTRATIVE $/h
SPOT = 0.80        # ILLUSTRATIVE $/h

print(f"on-demand ${ON_DEMAND:.2f}/h, spot ${SPOT:.2f}/h  ->  spot wins when spot / f < on-demand,"
      f" i.e. when f > {SPOT/ON_DEMAND:.2f}")
print(f"{'lam /h':>7} {'ckpt h':>7} {'restart h':>10} {'lam*T':>6} {'f':>6} {'spot $/useful h':>16}  winner")
for lam, ckpt, restart in ((0.05, 0.5, 0.10), (0.20, 0.5, 0.10), (0.20, 2.0, 0.25), (0.20, 24.0, 0.25)):
    f = spot_useful_fraction(lam, ckpt, restart)
    eff = SPOT / f
    print(f"{lam:>7.2f} {ckpt:>7.1f} {restart:>10.2f} {lam*ckpt:>6.2f} {f:>6.3f} {eff:>16.3f}  "
          f"{'spot' if eff < ON_DEMAND else 'on-demand'}")

busy = (8 * 5) / (24 * 7)
print(f"\nalways-on dev box, 8 h/day x 5 days/week: busy = 40/168 = {busy:.3f}; "
      f"${ON_DEMAND:.2f}/h costs ${ON_DEMAND / busy:.2f} per useful hour")

print("\nGPU time spent loading weights before the first token (cost at on-demand price):")
for gb, gbps in ((16, 0.5), (140, 0.5), (140, 2.0)):
    secs = gb / gbps
    print(f"  {gb:>4} GB at {gbps:.1f} GB/s: {secs/60:5.1f} min = ${ON_DEMAND * secs / 3600:.3f}")
```

```
on-demand $2.00/h, spot $0.80/h  ->  spot wins when spot / f < on-demand, i.e. when f > 0.40
 lam /h  ckpt h  restart h  lam*T      f  spot $/useful h  winner
   0.05     0.5       0.10   0.03  0.983            0.814  spot
   0.20     0.5       0.10   0.10  0.935            0.856  spot
   0.20     2.0       0.25   0.40  0.800            1.000  spot
   0.20    24.0       0.25   4.80  0.290            2.760  on-demand

always-on dev box, 8 h/day x 5 days/week: busy = 40/168 = 0.238; $2.00/h costs $8.40 per useful hour

GPU time spent loading weights before the first token (cost at on-demand price):
    16 GB at 0.5 GB/s:   0.5 min = $0.018
   140 GB at 0.5 GB/s:   4.7 min = $0.156
   140 GB at 2.0 GB/s:   1.2 min = $0.039
```

The last spot row is outside the first-order model's comfort zone (`lam x T` = 4.8); its direction is the
point: checkpointing once a day on a machine interrupted every five hours erases the discount.

### 5. Egress and storage in the monthly bill

```python
# ILLUSTRATIVE inputs only: round placeholder rates, NOT any provider's prices.
GPU_RATE = 2.00          # $/GPU-hour
STORAGE_RATE = 0.10      # $/GB-month for block/object storage (placeholder)
EGRESS_RATE = 0.10       # $/GB sent out to the internet (placeholder)

def monthly_bill(gpu_hours, stored_gb, egress_gb):
    compute = gpu_hours * GPU_RATE
    storage = stored_gb * STORAGE_RATE      # billed every hour of the month, even with the GPU stopped
    egress = egress_gb * EGRESS_RATE
    return compute, storage, egress

scenarios = {
    "occasional experiments": dict(gpu_hours=40,  stored_gb=600, egress_gb=20),
    "daily batch job":        dict(gpu_hours=200, stored_gb=600, egress_gb=500),
    "always-on endpoint":     dict(gpu_hours=730, stored_gb=600, egress_gb=3000),
}
print(f"{'scenario':<24}{'compute':>9}{'storage':>9}{'egress':>9}{'total':>9}  non-compute share")
for name, kw in scenarios.items():
    c, s, e = monthly_bill(**kw)
    total = c + s + e
    print(f"{name:<24}{c:>9.2f}{s:>9.2f}{e:>9.2f}{total:>9.2f}  {(s + e) / total:>7.1%}")
```

```
scenario                  compute  storage   egress    total  non-compute share
occasional experiments      80.00    60.00     2.00   142.00    43.7%
daily batch job            400.00    60.00    50.00   510.00    21.6%
always-on endpoint        1460.00    60.00   300.00  1820.00    19.8%
```

At low use the non-GPU items are 44% of the bill: storage does not shrink when the GPU is switched off.

## Visual diagram

```
  where one paid hour goes
  ┌──────────────────────────────────────────────────────────────────────┐
  │ busy, generating tokens     │ idle: nobody asked │ startup + restarts │
  │ (earns the output)          │ (still billed)     │ (billed, no output)│
  └──────────────────────────────────────────────────────────────────────┘
          │                              │                      │
          ▼                              ▼                      ▼
   tokens/s x batch effect      scale to zero, share,    keep images and weights
   (batching, quantization)     shorter reservations     close; fewer launches

  cost per 1M tokens  =       price per hour
                         ─────────────────────────────────────────  x 1e6
                         tokens/s x 3600 x busy fraction x useful fraction
                              ▲            ▲        ▲          ▲
                              │            │        │          └ spot: restarts
                              │            │        └ utilization
                              │            └ batch size (memory-capped, Module 05)
                              └ hardware and format (Modules 12, 06, 14)

  rent vs buy: cost per month against hours used
     ▲
     │                                        ╱  rent: slope r, starts at 0
     │                                     ╱
     │                      · · · · · · ╳ · · · · · ·   own: starts at F, shallow slope m
     │                  · ·          ╱
  F  ┤ · · · · · · ·            ╱
     │                       ╱
     │                   ╱
     │               ╱
     └─────────────────────────────────────────► hours used per month
                              ▲
              H* = F / (r - m): rent is cheaper to its left, owning to its right
```

## Practice

### 1. Utilization

A GPU costs $3.50 per hour (placeholder) and serves 800 tokens/s when busy. What is the cost per million tokens
at 50% busy? What busy fraction brings it to $1.50?

<details><summary>Answer</summary>

At 100% busy the cost is 3.50 / (800 x 3600) x 1e6 = 3.50 / 2,880,000 x 1e6 = $1.2153; cost scales as 1 / busy.
At 50%: $1.2153 / 0.5 = $2.4306 per million tokens (check: tokens/hour = 1,440,000 and 3.50 / 1.44e6 x 1e6 =
2.4306). For $1.50: busy = 1.2153 / 1.50 = 0.810, so about 81% of paid hours must be busy.

</details>

### 2. Break-even with new inputs

Purchase $3,000, resale $800, life 2 years, 350 W at $0.20 per kWh, rental $1.00 per hour. Find the break-even
hours per month and the share of a 730-hour month.

<details><summary>Answer</summary>

F = (3000 - 800) / 24 = $91.67. m = 0.350 x 0.20 = $0.07 per hour. H* = 91.67 / (1.00 - 0.07) = 91.67 / 0.93 =
98.57 hours per month, 98.57 / 730 = 13.5% of the month. Below about 99 hours a month, renting wins on these
inputs.

</details>

### 3. How long can the checkpoint interval be?

On-demand is $2.00 per hour, spot is $1.60, interruptions arrive 0.2 per hour, restart takes 0.1 hour. What is the
longest checkpoint interval at which spot still beats on-demand?

<details><summary>Answer</summary>

Spot wins when `f > 1.60 / 2.00 = 0.80`. With `f = 1 / (1 + lam (T/2 + R))` that means
`lam (T/2 + R) < 0.25`, so `T/2 + 0.1 < 1.25`, so `T < 2.3` hours. Check at `T = 2.3`: lost per interruption
= 1.15 + 0.10 = 1.25, times 0.2 = 0.25, `f = 1 / 1.25 = 0.80`, a tie. Here `lam x T` = 0.46, inside the model's
comfort zone.

</details>

### 4. The bill that is not compute

A team keeps 2 TB of checkpoints in storage for a month at a placeholder $0.10 per GB-month, copies 500 GB out at a
placeholder $0.10 per GB, and uses 50 GPU-hours at $2.00. What share of the bill is not compute?

<details><summary>Answer</summary>

Storage: 2000 GB x $0.10 = $200. Egress: 500 x $0.10 = $50. Compute: 50 x $2.00 = $100. Total $350; non-compute
is $250, which is 71.4%. Compute was the smallest line.

</details>

### Checkpoint quiz

1. State the cost-per-million-tokens formula and the three inputs that move it.
2. Why can a stopped instance still cost money?
3. Why does batching cut cost per token, and what caps the batch?
4. State the rent-versus-buy break-even and one thing it leaves out.
5. When does spot beat on-demand, in terms of `f`?

<details><summary>Answers</summary>

1. `price per hour / (tokens per second x 3600 x busy fraction) x 1e6`; price, throughput, busy fraction.
2. Volumes and addresses charge regardless of instance state (AWS instance-state docs); commitments bill to the
   end of their term.
3. Weights are read once per step whatever the batch, so more requests per step give more tokens for a small
   step-time increase. Memory (weights plus a KV cache per request) and the number of simultaneous requests cap it.
4. `H* = F / (r - m)`. It leaves out operations effort, failures, networking, obsolescence and licence limits.
5. When `f > spot price / on-demand price`.

</details>

> [!check]
> - I can compute cost per million tokens and say what each input does
> - I can explain why an idle GPU costs the same as a busy one
> - I can derive a rent-versus-buy break-even and name what it omits
> - I can say when spot capacity pays off and when it does not
> - I can name the non-GPU items on a cloud bill

## Project

Build a cost model for a stated scenario, with no code or solution provided here.

1. Pick a scenario, for example "serve an open-weights chat model to a product with 200,000 requests per day,
   average 300 generated tokens each, with a daily peak of 20 times the average rate".
2. Build a calculator that compares at least four deployments: always-on on-demand, always-on with a
   commitment, scale-to-zero with a cold-start penalty, and spot for the batch part of the work. Include
   storage, egress and model-load time.
3. Every price is an input with a source URL and the date you read it, or an explicitly labelled placeholder;
   every throughput is measured by you or labelled an estimate with its formula.
4. Run a sensitivity analysis on the two inputs you trust least (utilization and throughput are likely) and
   show how the winning deployment changes.
5. Write a one-paragraph recommendation that states the condition under which you would reverse it.

Success looks like: the arithmetic of two cases checked by hand in your write-up, no unlabelled number, and a
result that names its most fragile assumption.

## Interview questions

> [!interview]
> Our GPU bill doubled but traffic grew by 20%. Where do you look first?

<details><summary>What a strong answer covers</summary>

- Utilization and idle time first: allocated-but-idle instances, warm replicas, no scale-down.
- Throughput: batch size, whether the engine batches, whether the GPU is memory-bound.
- Non-GPU lines (storage left behind, egress) and purchase-option mismatches (commitments sized for peak).
- Ask for measured busy fraction and tokens/s before proposing changes.

</details>

> [!interview]
> When is buying GPUs cheaper than renting them?

<details><summary>What a strong answer covers</summary>

- The break-even `H* = F / (r - m)`: a utilization threshold, not a date.
- Stable high utilization over the hardware's life, plus power and cooling.
- Costs outside the formula: operations, failures, networking, obsolescence, and the licence limits on consumer
  cards in a datacenter (Module 12). Renting keeps the option to change generation.

</details>

> [!interview]
> When would you refuse to put a workload on spot capacity?

<details><summary>What a strong answer covers</summary>

- A latency-sensitive endpoint with no redundancy: notices are short (AWS two minutes; Google a shutdown period
  of up to 30 seconds, notice defaulting to 0 seconds).
- Long jobs without checkpoints, where `lam x T` is large and the useful fraction collapses; and capacity risk,
  since there may be no replacement GPU to restart on.
- It is good for retryable or checkpointed work where `f > spot / on-demand`.

</details>

## Common mistakes & troubleshooting

- **Comparing hourly prices across GPUs without throughput.** A card at twice the price doing three times the
  work is cheaper per token. Compare cost per unit of work with measured throughput.
- **Using peak throughput as sustained.** A full-batch benchmark is the best case; your traffic may never fill
  the batch. Use your own load profile.
- **A stopped instance that still bills.** Check volumes, snapshots and addresses after stopping.
- **Quoting an "up to X%" discount as the expected one, or baking prices into code.** Keep prices as dated
  inputs, as this module's calculators do.

## Further reading & sources

- [Amazon EC2 pricing](https://aws.amazon.com/ec2/pricing/) - AWS's own description of On-Demand, Savings Plans, Spot and capacity-reservation purchase options (fetched Oct 2026); cited for the structure of the options, not for any price.
- [Spot Instance interruption notices (AWS)](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/spot-instance-termination-notices.html) - the documented two-minute warning that the spot model assumes you can act on.
- [Spot VMs (Google Compute Engine)](https://docs.cloud.google.com/compute/docs/instances/spot) - preemption at any time, the best-effort 30-second shutdown period and the notice-duration setting.
- [Amazon EC2 instance state changes](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-lifecycle.html) - which states bill, that EBS volumes and addresses charge regardless, and that reserved capacity bills to the end of its term.
- [Amazon EC2 On-Demand pricing: Data Transfer](https://aws.amazon.com/ec2/pricing/on-demand/) - AWS's IN/OUT data-transfer structure (fetched Oct 2026), cited for the shape of egress billing, not for any rate.
- [Google Cloud VPC network pricing](https://cloud.google.com/vpc/network-pricing) - the "ingress is free, data transfer out is billed per GiB" structure behind the egress discussion.
- [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) - the vLLM paper, cited for batching as the route to high serving throughput and KV-cache memory as the limit.

## Next

[Module 14: Running Models on CPU and Apple Silicon](../14-running-models-on-cpu-and-apple-silicon/README.md)
