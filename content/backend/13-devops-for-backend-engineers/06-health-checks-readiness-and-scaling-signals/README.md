# Module 06: Health Checks, Readiness, and Scaling Signals

> **Prerequisites:** [00-containerizing-a-backend-app](../00-containerizing-a-backend-app/README.md), [01-the-12-factor-app-in-a-container](../01-the-12-factor-app-in-a-container/README.md), and [03-deployment-strategies](../03-deployment-strategies/README.md).  
> **Estimated Reading Time:** 28 minutes  
> **Target Audience:** Backend engineers and SREs configuring container observability, scheduler health probe contracts, and autoscaling telemetry.

> [!TIP]
> **Golden Rule of Health Probes:** Liveness answers "Am I broken beyond recovery?" (Failure triggers a container restart). Readiness answers "Can I accept traffic right now?" (Failure routes traffic away without restarting). Never put downstream database or cache checks into a liveness probe—doing so transforms transient network blips into catastrophic, fleet-wide restart storms.

---

## Visual Mental Models & Architecture

### The Tri-Probe Lifecycle & Autoscaling Telemetry

Orchestrators (Kubernetes, Azure Container Apps, Nomad) rely on three distinct probe types and custom telemetry to manage container lifecycles, routing, and scaling.

```mermaid
flowchart TD
    subgraph Scheduler_Polls["Orchestrator Probing & Scaling Engine"]
        direction TB
        
        subgraph Startup_Gate["1. Startup Probe (/startupz)"]
            StartCheck{"Initialization Complete?\n(Warmup, cache prefetch)"}
            StartCheck -- "Failed (Within Timeout)" --> HoldProbes["Delay Liveness & Readiness"]
            StartCheck -- "Failed (Exceeded Timeout)" --> KillStalled["Restart Container (Stalled Boot)"]
            StartCheck -- Passed --> EnableProbes["Activate Regular Probes"]
        end

        subgraph Liveness_Gate["2. Liveness Probe (/livez)"]
            LiveCheck{"Event Loop / Thread Deadlocked?\n(In-Process Only!)"}
            LiveCheck -- Failed --> RestartPod["Kill Pod & Restart Container\n(kubectl rollout restart)"]
            LiveCheck -- Passed --> KeepRunning["Keep Container Running"]
        end

        subgraph Readiness_Gate["3. Readiness Probe (/readyz)"]
            ReadyCheck{"Shallow DB Check OK & Not Draining?"}
            ReadyCheck -- Failed / 503 --> DropEndpoint["Remove Pod IP from Ingress\n(Traffic routed around pod; NO RESTART)"]
            ReadyCheck -- Passed / 200 --> AddEndpoint["Include Pod in Load Balancer Pool"]
        end

        subgraph Scaling_Telemetry["4. Metrics Endpoint (/metrics)"]
            PromScrape["Scrape In-Flight Requests & Latency"] --> HPA["Autoscaler Engine (HPA / KEDA)"]
            HPA --> ScaleDecision{"In-Flight > Target?"}
            ScaleDecision -- Yes --> ScaleUp["Scale Out Replicas (+N)"]
            ScaleDecision -- No --> ScaleDown["Scale In Replicas (-N)"]
        end
    end

    EnableProbes --> Liveness_Gate
    EnableProbes --> Readiness_Gate
```

---

## Systematic Taxonomic Reference Grids

### Probe Comparison Matrix

| Probe Endpoint | Core Question Answered | Platform Action on Failure | Permitted Dependency Checks | Target Budget | Common Anti-Pattern |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Startup (`/startupz`)** | Has application completed initial boot? | Delays liveness/readiness; restarts if timeout | Internal caches, schema preflight | < 30 seconds | Omitting on slow-warming models/caches. |
| **Liveness (`/livez`)** | Is process deadlocked or fatally broken? | **Kills and restarts container** | **None** (In-process memory only) | < 100 ms | Pinging PostgreSQL or Redis (causes restart storm). |
| **Readiness (`/readyz`)** | Can this replica serve an HTTP request right now? | **Removes pod from load balancer pool** (No restart) | Shallow DB check (`SELECT 1`), draining status | < 1 second | Deep health sweeps of external 3rd-party APIs. |

### Autoscaling Signals Matrix

| Telemetry Signal | Metric Source | Workload Fit | Reaction Speed | Limitations & Failure Hazards |
| :--- | :--- | :--- | :--- | :--- |
| **CPU Utilization** | cgroups / Kubelet | CPU-intensive computing (Image rendering, crypto) | Slow (30 – 90s) | **Fails on I/O-bound services:** High latency occurs while CPU sits at 15%. |
| **Memory Working Set** | cgroups / Kubelet | Memory-buffered streaming, batch processing | Slow | Memory rarely drops quickly after processing; leads to delayed scale-in. |
| **In-Flight Requests (Concurrency)** | Application `/metrics` | **HTTP Web APIs & REST Services** | **Immediate** (< 5s) | Requires application Prometheus instrumentation. |
| **Queue Depth (Lag)** | RabbitMQ / Kafka / SQS (KEDA) | **Asynchronous Background Workers** | **Fast** (< 10s) | The definitive scaling signal for event-driven workers. |
| **P95 / P99 Latency** | Service Mesh / Prometheus | SLA-critical customer-facing endpoints | Medium | Prone to noisy spikes; must use smoothed sliding-window averages. |

---

## Production War Stories: Incident Post-Mortem

### SEV-1 Post-Mortem: The Single `/health` Endpoint & The Fleet-Wide Restart Storm

#### Incident Overview
* **Severity:** SEV-1 (Complete Global API Outage)
* **Detection Time:** 2 minutes post-network blip
* **Resolution Time:** 38 minutes
* **Impact:** 120,000 active sessions dropped; 50 pods trapped in `CrashLoopBackOff`; \$450,000 in lost transaction volume.

#### What Happened
A financial API running 50 Kubernetes pods was configured with a single `/health` endpoint that performed a deep connection check:
```python
@app.get("/health")
def health():
    db.execute("SELECT 1")  # Checks Postgres
    redis.ping()  # Checks Redis
    return {"status": "ok"}
```
The Kubernetes deployment manifest configured this exact same endpoint for **both** the liveness and readiness probes:
```yaml
livenessProbe:
  httpGet: { path: /health, port: 8080 }
readinessProbe:
  httpGet: { path: /health, port: 8080 }
```

At 14:15, a cloud networking blip caused database queries to stall for 4 seconds.
1. The Kubelet on all 50 nodes probed `/health`. Because PostgreSQL was unresponsive, the checks timed out across all 50 pods.
2. Because the check was configured as the **liveness probe**, Kubernetes assumed all 50 container processes were deadlocked and issued simultaneous `SIGKILL` commands.
3. All 50 pods terminated at the same instant.
4. When the 50 new replacement pods booted up simultaneously, they executed their startup sequences, all opening new database connection pools at the same time.
5. This massive thundering herd exhausted PostgreSQL's `max_connections` (1000 connections maxed out).
6. Because PostgreSQL could not accept new connections, the replacement pods failed their startup and liveness probes again, trapping the entire production fleet in a 38-minute cascading `CrashLoopBackOff` restart storm.

```mermaid
sequenceDiagram
    autonumber
    actor Cloud as Cloud Network
    participant DB as PostgreSQL
    participant Kubelet as Kubernetes Kubelet
    participant Pods as 50 API Pods (Liveness = DB Check)

    Cloud->>DB: 4-Second Transient Network Flap
    Kubelet->>Pods: GET /health (Liveness Probe)
    Pods->>DB: SELECT 1
    DB--xPods: Timed Out (4s delay)
    Pods-->>Kubelet: 500 Server Error / Timeout
    Note over Kubelet,Pods: Liveness Failed! Kubernetes kills ALL 50 pods at once!
    Kubelet->>Pods: SIGKILL (Entire fleet destroyed!)
    Note over Pods: 50 replacement pods boot simultaneously
    Pods->>DB: 50 pods open 20 connections each (1,000 conns!)
    DB--xPods: FATAL: remaining connection slots reserved for non-replication superusers
    Pods-->>Kubelet: Startup Failed!
    Note over Kubelet,Pods: Cascading CrashLoopBackOff! Self-inflicted outage!
```

#### Root Cause Analysis
1. **Liveness/Readiness Conflation:** Assigning a database dependency check to a liveness probe violated the core contract of container orchestration: liveness must test *process health*, not *dependency health*.
2. **Cascading Thundering Herd:** Restarting 50 pods simultaneously created an overwhelming surge on PostgreSQL, transforming a 4-second transient blip into a prolonged outage.
3. **Missing Circuit Breakers and Startup Delays:** The pods lacked exponential backoff on connection pool initialization.

#### The Fix & Architectural Hardening
1. **Separated Probe Endpoints:** Split into `/livez` (pure in-memory check returning 200 immediately) and `/readyz` (shallow `SELECT 1` with 1-second timeout).
2. **Dependency Failures Route Around, Never Restart:** If PostgreSQL blips, `/readyz` fails: Kubernetes temporarily halts routing traffic to that pod without killing the process. When PostgreSQL recovers, the pod resumes serving traffic in milliseconds without restarting.

---

## Multi-Language Production Code Tabs

The following production code examples demonstrate the complete implementation of decoupled health probes, graceful drain signaling, and Prometheus RED metrics instrumentation.

=== "Go"
    ```go
    // Package main implements decoupled /livez, /readyz, and Prometheus RED metrics.
    package main

    import (
    	"context"
    	"database/sql"
    	"net/http"
    	"sync/atomic"
    	"time"

    	"github.com/prometheus/client_golang/prometheus"
    	"github.com/prometheus/client_golang/prometheus/promhttp"
    )

    var (
    	inFlightRequests = prometheus.NewGauge(prometheus.GaugeOpts{
    		Name: "http_in_flight_requests",
    		Help: "Current count of concurrent active requests (Autoscaling Signal).",
    	})
    )

    func init() {
    	prometheus.MustRegister(inFlightRequests)
    }

    type HealthServer struct {
    	db         *sql.DB
    	isDraining atomic.Bool
    }

    // Livez verifies process execution without testing external dependencies.
    func (h *HealthServer) Livez(w http.ResponseWriter, r *http.Request) {
    	// Answering HTTP proves the Go runtime and event loop are responsive.
    	w.WriteHeader(http.StatusOK)
    	_, _ = w.Write([]byte(`{"status":"alive"}`))
    }

    // Readyz verifies shallow database connectivity and draining status.
    func (h *HealthServer) Readyz(w http.ResponseWriter, r *http.Request) {
    	if h.isDraining.Load() {
    		http.Error(w, `{"status":"draining"}`, http.StatusServiceUnavailable)
    		return
    	}

    	ctx, cancel := context.WithTimeout(r.Context(), 1*time.Second)
    	defer cancel()

    	// Shallow dependency verification
    	if err := h.db.PingContext(ctx); err != nil {
    		http.Error(w, `{"status":"dependency_unavailable"}`, http.StatusServiceUnavailable)
    		return
    	}

    	w.WriteHeader(http.StatusOK)
    	_, _ = w.Write([]byte(`{"status":"ready"}`))
    }

    func InstrumentMiddleware(next http.Handler) http.Handler {
    	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    		inFlightRequests.Inc()
    		defer inFlightRequests.Dec()
    		next.ServeHTTP(w, r)
    	})
    }
    ```

=== "Node.js/TypeScript"
    ```typescript
    // TypeScript / Express Health Probe and Prometheus Metrics Implementation
    import express from "express";
    import { Pool } from "pg";
    import client from "prom-client";

    const app = express();
    const db = new Pool({ connectionString: process.env.DATABASE_URL });

    let isDraining = false;

    // Autoscaling Signal: Track in-flight concurrent requests
    const inFlightGauge = new client.Gauge({
      name: "http_in_flight_requests",
      help: "Current concurrent active HTTP requests for HPA scaling",
    });

    app.use((req, res, next) => {
      inFlightGauge.inc();
      res.on("finish", () => inFlightGauge.dec());
      next();
    });

    // 1. Liveness: Process event-loop responsiveness ONLY
    app.get("/livez", (req, res) => {
      return res.status(200).json({ status: "alive" });
    });

    // 2. Readiness: Shallow DB ping + draining verification
    app.get("/readyz", async (req, res) => {
      if (isDraining) {
        return res.status(503).json({ status: "draining" });
      }

      try {
        // Fast 1-second timeout query
        await db.query({ text: "SELECT 1", timeout: 1000 });
        return res.status(200).json({ status: "ready" });
      } catch (err) {
        return res.status(503).json({ status: "db_unreachable" });
      }
    });

    // 3. Prometheus Metrics Scraping Endpoint
    app.get("/metrics", async (req, res) => {
      res.set("Content-Type", client.register.contentType);
      res.end(await client.register.metrics());
    });

    export function setDraining(): void {
      isDraining = true;
    }
    ```

=== "Python"
    ```python
    """FastAPI Decoupled Health Probes & Scaling Telemetry."""

    from __future__ import annotations

    import asyncio
    from contextlib import asynccontextmanager
    import time
    from typing import AsyncGenerator
    from fastapi import FastAPI, Response, status
    from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, generate_latest
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    # Prometheus RED metrics
    IN_FLIGHT_REQUESTS = Gauge(
        "http_in_flight_requests", "Current active concurrent requests for autoscaling"
    )

    _draining = False
    engine = create_async_engine(
        "postgresql+asyncpg://postgres:test@localhost:5432/testdb", pool_size=10
    )


    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        yield
        global _draining
        _draining = True  # Step 1: Flip readiness to 503 immediately
        await asyncio.sleep(2.0)  # Step 2: Let Ingress remove pod from EndpointSlice
        await engine.dispose()  # Step 3: Close connection pools cleanly


    app = FastAPI(lifespan=lifespan)


    @app.middleware("http")
    async def track_in_flight(request, call_next):
        IN_FLIGHT_REQUESTS.inc()
        try:
            return await call_next(request)
        finally:
            IN_FLIGHT_REQUESTS.dec()


    @app.get("/livez")
    async def liveness() -> dict[str, str]:
        # Process is alive and responding; checks ZERO external dependencies!
        return {"status": "alive"}


    @app.get("/readyz")
    async def readiness(response: Response) -> dict[str, str]:
        if _draining:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {"status": "draining"}

        try:
            async with asyncio.timeout(1.0):
                async with engine.connect() as conn:
                    await conn.execute(text("SELECT 1"))
            return {"status": "ready"}
        except Exception:
            response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
            return {"status": "database_unavailable"}


    @app.get("/metrics")
    async def metrics() -> Response:
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
    ```

=== "C#"
    ```csharp
    namespace BackendRoadmap.Observability;

    using System.Threading;
    using System.Threading.Tasks;
    using Microsoft.AspNetCore.Builder;
    using Microsoft.AspNetCore.Diagnostics.HealthChecks;
    using Microsoft.AspNetCore.Http;
    using Microsoft.Extensions.DependencyInjection;
    using Microsoft.Extensions.Diagnostics.HealthChecks;

    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // Configure decoupled health checks
            builder.Services.AddHealthChecks()
                // Liveness check (in-process only)
                .AddCheck("livez", () => HealthCheckResult.Healthy(), tags: new[] { "live" })
                // Readiness check (checks database with timeout)
                .AddNpgSql(builder.Configuration["ConnectionStrings:DefaultConnection"]!, 
                           name: "db_ready", 
                           timeout: TimeSpan.FromSeconds(1), 
                           tags: new[] { "ready" });

            var app = builder.Build();

            // Expose endpoints mapped to specific tags
            app.MapHealthChecks("/livez", new HealthCheckOptions
            {
                Predicate = check => check.Tags.Contains("live")
            });

            app.MapHealthChecks("/readyz", new HealthCheckOptions
            {
                Predicate = check => check.Tags.Contains("ready")
            });

            app.Run();
        }
    }
    ```

---

## Practical Hands-On Verification CLI Workflows

### 1. Simulating a Downstream Dependency Blip

Verify that when PostgreSQL stops, `/livez` remains HTTP 200 (pod is NOT restarted) while `/readyz` fails to HTTP 503 (traffic is routed around pod):

```bash
# 1. Inspect healthy state
curl -i http://localhost:8000/livez
curl -i http://localhost:8000/readyz

# 2. Stop the local PostgreSQL container
docker stop postgres-db

# 3. Verify probe reactions
curl -i http://localhost:8000/livez
# Output: HTTP/1.1 200 OK (Process is still alive!)

curl -i http://localhost:8000/readyz
# Output: HTTP/1.1 503 Service Unavailable (Orchestrator routes traffic around!)

# 4. Restart PostgreSQL and confirm instantaneous recovery without pod restart
docker start postgres-db
sleep 1
curl -i http://localhost:8000/readyz
# Output: HTTP/1.1 200 OK
```

### 2. Inspecting Prometheus Autoscaling Telemetry
```bash
# Verify active concurrent connections metric
curl -s http://localhost:8000/metrics | grep http_in_flight_requests
```

**Expected Wire Output:**
```text
# HELP http_in_flight_requests Current active concurrent requests for autoscaling
# TYPE http_in_flight_requests gauge
http_in_flight_requests 4.0
```

---

## Operational Validation Checkpoints (Scenario Quizzes)

### Checkpoint 1: Why Pinging Third-Party APIs in Readiness Probes Is Dangerous
<details>
<summary><strong>Scenario Assessment:</strong> A developer adds a Stripe API connectivity check to the application's <code>/readyz</code> endpoint: <code>requests.get("https://api.stripe.com/health")</code>. During an external Stripe outage, what happens to the internal backend cluster, and how should external dependencies be handled?</summary>

<strong>Answer:</strong>
Adding external third-party API checks to readiness probes causes **disastrous cascading internal failures**:
1. When Stripe experiences an outage or latency spike, the readiness probes across **all backend pods fail simultaneously**.
2. Kubernetes immediately removes all backend pod IPs from the internal load balancer.
3. The internal service becomes completely unavailable (HTTP 503), taking down user login, browsing, profile management, and read operations that had **zero dependency on Stripe**.
4. Furthermore, external network latency on the probe will cause probe timeouts, artificially thrashing the internal routing mesh.

**The Fix:**
- Readiness probes must test only **local, critical backing services owned by your infrastructure** (e.g., your primary database or Redis).
- Third-party integrations must be handled via **circuit breakers, timeouts, and fallback degradation** inside the application code (e.g., returning "Payment service temporarily unavailable" on checkout while keeping the rest of the application fully online).
</details>

### Checkpoint 2: The Startup Probe vs Liveness Timeout Deadlock
<details>
<summary><strong>Scenario Assessment:</strong> A machine learning inference service takes 45 seconds to download and deserialize model weights into memory upon container boot. The deployment configures: <code>livenessProbe: initialDelaySeconds: 10, periodSeconds: 5, failureThreshold: 3</code>. The pod repeatedly crashes and restarts every 25 seconds, never becoming ready. What is happening, and how is it resolved?</summary>

<strong>Answer:</strong>
The service is trapped in a **liveness timeout deadlock**:
1. The container process requires 45 seconds to boot.
2. The liveness probe begins probing after 10 seconds (`initialDelaySeconds: 10`).
3. Because the event loop is busy downloading weights, the liveness probe fails 3 consecutive times over 15 seconds (`periodSeconds: 5 * failureThreshold: 3 = 15s`).
4. At $10 + 15 = 25$ seconds, Kubernetes declares the pod dead and kills it with `SIGKILL`, starting a new container.
5. The cycle repeats indefinitely, preventing the model from ever loading.

**The Fix:**
Implement a dedicated **`startupProbe`**:
```yaml
startupProbe:
  httpGet: { path: /livez, port: 8080 }
  failureThreshold: 30
  periodSeconds: 2 # Allows up to 60 seconds (30 * 2s) for warmup
livenessProbe:
  httpGet: { path: /livez, port: 8080 }
  periodSeconds: 5
  failureThreshold: 2 # Keeps liveness fast (10s) once running
```
The startup probe holds off liveness and readiness evaluations until the model is loaded, allowing tight liveness monitoring once the application is running.
</details>

### Checkpoint 3: Why CPU-Based Autoscaling Fails on I/O-Bound Microservices
<details>
<summary><strong>Scenario Assessment:</strong> An e-commerce API is configured with a Horizontal Pod Autoscaler targeting <code>cpuUtilization: 75%</code>. During a flash sale, API response times jump from 50ms to 9,000ms, and connection queues back up with timeouts. However, the HPA fails to add any new replicas because average CPU utilization sits at 24%. Why did the autoscaler fail to react?</summary>

<strong>Answer:</strong>
The failure occurred because the service is **I/O-bound (database/network bound), not CPU-bound**:
1. When handling database queries, downstream API calls, or external payment gateways, application worker threads spend the vast majority of their time in **blocking I/O wait states** (`epoll_wait`, network socket reading).
2. While waiting for PostgreSQL to return queries, the CPU sits completely idle (utilization $\approx$ 20-30%).
3. The queue of incoming HTTP requests fills up, socket buffers overflow, and clients experience 9-second latency, but the CPU-based autoscaler never triggers because the 75% threshold is never reached.

**The Fix:**
Configure the HPA to autoscale on **Application-Level Concurrency or In-Flight Requests**:
- Instrument a custom Prometheus metric (`http_in_flight_requests`).
- Configure KEDA or the Prometheus Metrics Adapter to scale replicas when average concurrent requests per pod exceed a threshold (e.g., target 50 concurrent requests per pod).
- As soon as requests queue up, the concurrency metric spikes immediately, provisioning new pods within seconds regardless of CPU utilization.
</details>

---

## Summary & Further Study

- **Decoupled Probes:** Keep `/livez` dependency-free (restarts pod on deadlock); keep `/readyz` shallow (routes traffic around pod on DB blip).
- **Graceful Draining:** Flip readiness to 503 before beginning connection draining on `SIGTERM`.
- **Autoscaling Signals:** Scale I/O-bound microservices on concurrency and queue depth rather than CPU utilization.

### Further Reading
- [Kubernetes Documentation: Liveness, Readiness, and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [KEDA: Kubernetes Event-Driven Autoscaling Core Concepts](https://keda.sh/docs/latest/concepts/)
- [Google Cloud Architecture: Health Checking Best Practices](https://cloud.google.com/architecture/best-practices-for-running-cost-effective-kubernetes-applications-on-gke#health-checks)
