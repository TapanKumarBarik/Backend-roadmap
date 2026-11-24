# Lesson 04: Peak vs Average Traffic: How to Survive a 50× Spike

> **Prerequisites:** [Lesson 03: How to Estimate RPS](../03-how-to-estimate-rps/README.md) (Lesson 4 of 14).  
> **Estimated Reading Time:** 32 minutes  
> **Target Audience:** Engineers sizing for diurnal peaks and flash crowds (ticket sales, launches, celebrity posts).  
> **Free PDF Notes:** [Download SD-D-004.pdf](https://backendroadmap.com/notes/system-design/SD-D-004.pdf)

> [!NOTE]
> **In one line:** Users feel the peak, not the average. Size for the expected peak plus 30–50% headroom, and absorb spikes with a CDN, waiting room, queues, pre-scaling, rate limiting, and graceful load shedding.

> [!TIP]
> **The Golden Rule of Peak Traffic:** At 100% utilization there is no room for a burst—queues explode, clients retry, and you cascade. Aim ~60–70% busy at expected peak.

---

## Words You'll Meet Today

| Word | In Plain Words | Role |
| :--- | :--- | :--- |
| **Diurnal pattern** | Daily quiet→busy curve. | Evening often 2–3× average. |
| **Flash crowd** | Sudden 10–100× spike. | Faster than autoscaling. |
| **Headroom** | Spare capacity above peak. | 30–50% typical. |
| **Waiting room** | Admit at controlled rate. | Ticket sales. |
| **Load shedding** | 503 + Retry-After. | Protect core path. |
| **Pre-scale** | Add capacity before event. | Known launches. |

---

## Core Definition & Taxonomic Comparison

**Peak sizing** plans for the worst *expected* second, not the daily mean. **Not** “autoscaling will handle any spike,” and not running at 95% “efficiency.”

| Term | Precise Meaning | Example |
| :--- | :--- | :--- |
| **Average RPS** | Day total / 86,400. | Hides 10:00 ticket open. |
| **Busy-hour peak** | ~2–3× average. | Diurnal. |
| **Flash crowd** | 10–100× in seconds. | 2k → 100k RPS. |
| **Headroom** | Capacity / expected peak. | 1.3–1.5×. |

---

## Component Anatomy & The Observability Gap

```text
 average ──► expected peak (×2–3) ──► +30–50% headroom ──► capacity
 flash: CDN + waiting room + queue + rate limit + shed + pre-scale
```

### Observability Gap

| Vantage | Captures | Hides |
| :--- | :--- | :--- |
| **Daily average dashboard** | Mean load | 10-minute spike |
| **Autoscale CPU** | Lagging signal | Spike already queued |
| **Origin RPS** | After CDN | Edge absorbed share |
| **Queue depth** | Backlog truth | If you only watch CPU |

---

## Mathematical Model & Worked Estimates

$$\mathrm{Capacity} = \mathrm{RPS}_{\mathrm{avg}} \times f_{\mathrm{peak}} \times h,\quad h\in[1.3,1.5]$$

M/M/1 wait factor $1/(1-\rho)$: at $\rho=0.95$ wait is $20\times$ idle system.

**Ticket sale:** normal 2,000 RPS → spike 100,000 ($50\times$). Admit 5,000/s via waiting room; queue seat reservations; workers pace DB conditional updates.

---

## Metrics, Percentiles & Distributions

| Traffic regime | vs average | Mitigation |
| :--- | :--- | :--- |
| Night | 0.3–0.5× | Scale down carefully |
| Busy hour | 2–3× | Baseline peak sizing |
| Known event | 5–20× | Pre-scale + waiting room |
| Unexpected viral | 50×+ | Shed + CDN + queue |

---

## Compounding Effects at Scale

Retries amplify spikes:

$$\lambda_{\mathrm{offered}} \approx \lambda_{\mathrm{peak}} \times (1 + r_{\mathrm{retry}})$$

Without shedding, a timeout storm multiplies load further.

---

## Numbers Every Backend Engineer Must Know

| Knob | Typical value |
| :--- | :--- |
| Diurnal peak factor | 2–3× |
| Headroom | 30–50% |
| Target util at peak | 60–70% |
| Autoscale lag | minutes |
| Flash crowd | seconds |

---

## Protocol & Network Deep Dive

```mermaid
sequenceDiagram
    participant Fans
    participant CDN
    participant WR as Waiting room
    participant API
    participant Q as Queue
    participant W as Workers
    Fans->>CDN: Event page (cached)
    Fans->>WR: Enter line
    WR->>API: Admit 5k/s
    API->>Q: Reserve intent
    Q->>W: Steady pace
    Note over Fans,W: Pre-scaled at 9:30; origin never sees full refresh storm
```

---

## Hierarchical Budgets & Capacity Sizing

| Layer | Role in 50× spike |
| :--- | :--- |
| CDN | Absorb static |
| Waiting room | Cap admit rate |
| API | Rate limit / 429 / 503 |
| Queue | Buffer burst |
| Workers | Match DB capacity |

---

## Top Engineering Mitigation Techniques

1. CDN. 2. Waiting room. 3. Queue async work. 4. Pre-scale. 5. Rate limit + graceful shed. 6. Disable non-essential features.

---

## Production War Story (SEV-1 Post-Mortem)

**SEV-1:** Concert onsale — site sized for average 2k RPS; 50× spike in seconds; autoscaler still provisioning while pools exhausted.

**Fix:** waiting room + CDN event page + pre-scale + queue + `Retry-After` shedding.

---

## Multi-Language Production Code Tabs

````carousel
```go
package peak

import "math"

func CapacityForPeak(avgRPS, peakFactor, headroom float64) float64 {
	// headroom 1.3..1.5 → run ~60-75% at expected peak
	return avgRPS * peakFactor * headroom
}

func AdmitRate(waitingRoomCap, backendSustain float64) float64 {
	return math.Min(waitingRoomCap, backendSustain)
}
```

<!-- slide -->

```typescript
export function capacityForPeak(avgRps: number, peakFactor = 3, headroom = 1.4) {
  return avgRps * peakFactor * headroom;
}

export function ticketSale() {
  const normal = 2_000;
  const spike = 100_000; // 50×
  const admit = 5_000;   // waiting room
  return { spikeMultiple: spike / normal, admit, shed: spike - admit };
}
```

<!-- slide -->

```python
def capacity_for_peak(avg_rps: float, peak_factor: float = 3, headroom: float = 1.4) -> float:
    return avg_rps * peak_factor * headroom

normal, spike = 2_000, 100_000
print("multiple", spike / normal)
print("capacity bar at 50% headroom over expected peak 10k:", 10_000 * 1.5)
```

<!-- slide -->

```csharp
public static class PeakTraffic
{
    public static double Capacity(double avgRps, double peakFactor = 3, double headroom = 1.4) =>
        avgRps * peakFactor * headroom;
}
```
````

---

## Hands-On CLI Verification

```bash
python -c "print(2000*50, 10000*1.5, 'admit', 5000)"
```

---

## Common Mistakes to Avoid

- Sizing for average only.
- Assuming autoscaling reacts in seconds.
- Running at 95–100% util at “peak.”
- No load shedding → retry storms.
- Doing slow work synchronously on the hot path.
- Forgetting CDN for the event landing page.
- No per-user rate limits.
- Not pre-scaling for known events.

---

## Key Terms Glossary

| Term | Interview-ready definition |
| :--- | :--- |
| **Flash crowd** | Sudden extreme spike in traffic. |
| **Headroom** | Spare capacity above expected peak. |
| **Load shedding** | Rejecting work to protect the system. |
| **Waiting room** | Controlled admission queue for users. |

---

## Interview Practice Questions

<details>
<summary><strong>Q1. Why design for peak, not average? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Users experience the peak; averages hide the moment queues fill and timeouts cascade.

</details>

<details>
<summary><strong>Q2. What headroom do you add above expected peak? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Typically 30–50% so servers run ~60–75% busy at that peak.

</details>

<details>
<summary><strong>Q3. What is a flash crowd? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
A sudden 10–100× spike (ticket sale, celebrity post) arriving in seconds.

</details>

<details>
<summary><strong>Q4. Why is autoscaling alone not enough for a 50× spike? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Provisioning takes minutes; the spike arrives in seconds.

</details>

<details>
<summary><strong>Q5. Ticket sale: normal 2k RPS, spike 100k. Outline defenses. [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
CDN page, waiting room admit rate, queue reservations, pre-scale, rate limits, 503 shedding.

</details>

<details>
<summary><strong>Q6. How does a queue help during a spike? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Accept fast, process at sustainable backend rate; smooths the burst.

</details>

<details>
<summary><strong>Q7. When do you pre-scale vs rely on autoscale? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Pre-scale for known events; autoscale for organic growth and moderate peaks.

</details>

<details>
<summary><strong>Q8. What do you return when shedding? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
503 with Retry-After (or 429 per user)—never hang until crash.

</details>

<details>
<summary><strong>Q9. Why does utilization near 100% fail catastrophically? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Queueing delay rises steeply ($1/(1-\rho)$); small bursts → large latency → retries.

</details>

<details>
<summary><strong>Q10. Is the busy-hour 2–3× the same as a flash crowd? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
No—diurnal is predictable; flash crowds are orders of magnitude and faster than scale-out.

</details>

<details>
<summary><strong>Q11. How can retries make a spike worse? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Timed-out clients retry, multiplying offered load on an already saturated system.

</details>

<details>
<summary><strong>Q12. What features should you disable at peak? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Non-essential: recommendations, reviews, expensive personalization—keep checkout/core path.

</details>

---

## One-Page Master Cheat Sheet

```text
====================================================================================================
                      PEAK VS AVERAGE TRAFFIC  —  CHEAT SHEET
====================================================================================================
SIZE     capacity = avg × peak_factor × 1.3..1.5
TARGET   ~60-70% util at expected peak
ABSORB   CDN · waiting room · queue · pre-scale · rate limit · shed
====================================================================================================
```

---

## Free PDF notes

Download these notes as a printable PDF: [SD-D-004.pdf](https://backendroadmap.com/notes/system-design/SD-D-004.pdf).

---

## Sources

- Google SRE — load shedding / overload.
- [SD-D-004.pdf](https://backendroadmap.com/notes/system-design/SD-D-004.pdf).

---

## Next

Next comes [Lesson 05: Read/Write Ratio](../05-read-write-ratio/README.md). See [the track overview](../README.md) for the whole series.
