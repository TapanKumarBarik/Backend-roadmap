# Lesson 13: Identifying Bottlenecks: Find What Breaks First (50k Writes/s)

> **Prerequisites:** [Lesson 12: Architecture Diagrams](../12-architecture-diagrams/README.md) (Lesson 13 of 14).  
> **Estimated Reading Time:** 32 minutes  
> **Target Audience:** Engineers who must find the limiting resource on a critical path before production does.  
> **Free PDF Notes:** [Download SD-D-013.pdf](https://backendroadmap.com/notes/system-design/SD-D-013.pdf)

> [!NOTE]
> **In one line:** The bottleneck is the resource that limits throughput for the whole system; find it by writing peak load and capacity next to every component on the critical path—the highest load/capacity ratio (especially >~70%) is what breaks first.

> [!TIP]
> **The Golden Rule of Bottlenecks:** Water flows only as fast as the narrowest pipe. Widening a wide section changes nothing—compute load÷capacity for every resource, including connections and hot keys.

---

## Words You'll Meet Today

| Word | Meaning |
| :--- | :--- |
| **Bottleneck** | Min capacity on the path. |
| **Saturation** | Load > capacity → queues. |
| **USE method** | Utilisation, Saturation, Errors. |
| **Hot partition** | One key/shard overload. |
| **Amdahl** | Serial fraction caps speedup. |

---

## Core Definition & Taxonomic Comparison

| Term | Meaning | Example |
| :--- | :--- | :--- |
| **App CPU 56%** | Not limiting | 20k/36k |
| **DB conns 360%** | Bottleneck | 1800/500 |
| **Hot key** | Local bottleneck | Celebrity shard |

---

## Component Anatomy & The Observability Gap

```text
 For each resource: peak_load / capacity → rank
 Fix highest → recompute → next bottleneck moves
```

### Observability Gap

| Vantage | Captures | Hides |
| :--- | :--- | :--- |
| **App CPU 30%** | Not CPU-bound | Downstream saturation |
| **Average load** | Comfort | Peak path |
| **Total shard QPS** | Cluster OK | One hot partition |

---

## Mathematical Model & Worked Estimates

Path throughput $=\min_i C_i$.

Amdahl: speedup $\le 1/s$ for serial fraction $s$. If $s=0.05$, max $20\times$.

Fan-out: $20\,\mathrm{k}$ feed loads × 50 posts = **1 M** item reads/s unless batched/cached.

**Table:** app 56%, DB writes 20%, **DB conns 360%**, cache mem 90% → connections first.

---

## Metrics, Percentiles & Distributions

High CPU without saturation may still be OK at $p_{99}$; watch run-queue length, not only CPU %.

---

## Compounding Effects at Scale

Fixing one bottleneck reveals the next-narrowest. Adding app servers without fixing DB conns **worsens** the real bottleneck.

---

## Numbers Every Backend Engineer Must Know

| Signal | Suspect |
| :--- | :--- |
| Pool wait | Connections |
| Growing lag | Consumers/partitions |
| One shard 100% | Hot key |
| Serial lock | Amdahl cap |

---

## Protocol & Network Deep Dive

```mermaid
sequenceDiagram
    participant App
    participant Pool
    participant DB
    App->>Pool: checkout
    Pool-->>App: wait (exhausted)
    Note over App,DB: CPU fine; connections are the bottleneck
```

---

## Hierarchical Budgets & Capacity Sizing

| Resource | Flag if util |
| :--- | :--- |
| Any | >~70% risk |
| >100% | Hard bottleneck |
| Connections | servers × pool ≤ DB max |

---

## Top Engineering Mitigation Techniques

1. Load/capacity table. 2. USE method. 3. Fix highest ratio. 4. Watch hot keys. 5. Expect the next bottleneck.

---

## Production War Story (SEV-1 Post-Mortem)

**SEV-1:** 50k writes/s design; primary tops ~5–10k. Queues grew; app scale-out made it worse.

**Fix:** shard/batch/LSM; then consumer lag became next bottleneck—add partitions/consumers.

---

## Multi-Language Production Code Tabs

````carousel
```go
package bottle
import "fmt"
func Rank(res map[string][2]float64) {
	type pair struct{ name string; util float64 }
	var ps []pair
	for n, v := range res { ps = append(ps, pair{n, v[0] / v[1]}) }
	// sort by util desc in real code
	for _, p := range ps { fmt.Printf("%s %.0f%%\n", p.name, p.util*100) }
}
```

<!-- slide -->

```typescript
export function util(load: number, cap: number) { return load / cap; }
const res = {
  "app cpu": [20_000, 36_000],
  "db writes": [1_000, 5_000],
  "db conns": [1_800, 500],
  "cache mem": [130, 144],
};
console.log(Object.entries(res).sort((a,b)=> b[1][0]/b[1][1]-a[1][0]/a[1][1]));
```

<!-- slide -->

```python
res = {"app cpu": (20_000, 36_000), "db writes": (1_000, 5_000),
       "db conns": (1_800, 500), "cache mem": (130, 144)}
for name, (load, cap) in sorted(res.items(), key=lambda kv: -kv[1][0]/kv[1][1]):
    print(f"{name:10s} {load/cap:5.0%}")
```

<!-- slide -->

```csharp
public static double Util(double load, double cap) => load / cap;
// Amdahl: speedup <= 1 / s  if serial fraction s
```
````

---

## Hands-On CLI Verification

```bash
python -c "res={'app':(20000,36000),'dbw':(1000,5000),'conn':(1800,500)};
print(sorted({k:v[0]/v[1] for k,v in res.items()}.items(), key=lambda x:-x[1]))"
```

---

## Common Mistakes to Avoid

- Scaling the wrong tier.
- Using averages.
- Ignoring hot keys.
- Guessing vs measuring.
- Stopping after one fix.
- Forgetting fan-out multipliers.
- CPU-only USE.
- Ignoring locks/third-party limits.

---

## Key Terms Glossary

| Term | Interview-ready definition |
| :--- | :--- |
| **Bottleneck** | Resource limiting end-to-end throughput. |
| **USE method** | Utilisation, Saturation, Errors per resource. |
| **Hot partition** | Skewed key overloading one shard. |

---

## Interview Practice Questions

<details>
<summary><strong>Q1. What is a bottleneck? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Resource limiting whole-system throughput—min capacity on the path.

</details>

<details>
<summary><strong>Q2. How find it in a design? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Peak load÷capacity per component; highest ratio wins.

</details>

<details>
<summary><strong>Q3. Production signals? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Saturation: CPU/disk maxed, pool exhausted, growing queue depth; USE.

</details>

<details>
<summary><strong>Q4. What is USE? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
Utilisation, Saturation, Errors per resource.

</details>

<details>
<summary><strong>Q5. 50k writes/s, primary 5–10k — what? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
5–10× over: queue+batch, shard ~10 ways, or write-optimized store.

</details>

<details>
<summary><strong>Q6. Cluster fine, one shard 100%? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Hot partition—cache, salt keys, or dedicated capacity.

</details>

<details>
<summary><strong>Q7. After sharding, consumer lag grows? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Bottleneck moved—add consumers/partitions or batch writes.

</details>

<details>
<summary><strong>Q8. Latency high, app CPU 30% — where look? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
DB pools/locks, downstream, threads, network.

</details>

<details>
<summary><strong>Q9. CPU 95% but latency fine — bottleneck? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Not yet, but no headroom; watch run-queue.

</details>

<details>
<summary><strong>Q10. Feed 20k×50 posts — store load? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
1M item reads/s without batch/cache—fan-out hides the real tier.

</details>

<details>
<summary><strong>Q11. Why fixing one reveals another? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Next-narrowest becomes the min.

</details>

<details>
<summary><strong>Q12. 5% serial work — max speedup? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
20× by Amdahl, regardless of server count.

</details>

---

## One-Page Master Cheat Sheet

```text
Bottleneck = max(load/capacity) | USE | hot keys | Amdahl serial cap
Fix → remeasure → next | fan-out multiplies downstream load
```

---

## Free PDF notes

Download these notes as a printable PDF: [SD-D-013.pdf](https://backendroadmap.com/notes/system-design/SD-D-013.pdf).

---

## Sources

- [SD-D-013.pdf](https://backendroadmap.com/notes/system-design/SD-D-013.pdf).
- Brendan Gregg — USE method.

---

## Next

Next comes [Lesson 14: Identifying SPOFs](../14-identifying-spofs/README.md). See [the track overview](../README.md) for the whole series.
