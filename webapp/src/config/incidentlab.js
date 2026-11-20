// Scenarios and mitigation definitions for the Production Incident Debugger (/tools/incident-debugger/).

export const INCIDENT_CONFIG = {
  scenarios: {
    dbConnExhaustion: {
      id: 'dbConnExhaustion',
      title: 'P0 Incident: Checkout API 500 Spike & Database Starvation',
      summary: 'Checkout error rate spiked to 24%. P99 latency degraded from 40ms to 6,500ms.',
      metrics: {
        errorRatePct: 24.2,
        p99LatencyMs: 6500,
        cpuUsagePct: 45,
        dbConnections: 100, // max is 100
        status: 'CRITICAL OUTAGE'
      },
      diagnostics: [
        { id: 'query_pg_stat', label: 'Inspect Database Active Connections (pg_stat_activity)', output: 'Found 42 backend threads stuck in "idle in transaction" running unindexed report queries without timeouts.' },
        { id: 'check_app_logs', label: 'Check Application Server Error Logs', output: 'HikariCP: Connection is not available, request timed out after 30000ms. Active: 100, Idle: 0, Waiting: 850.' },
        { id: 'check_network', label: 'Ping Database Private Subnet', output: 'Network RTT: 0.8ms, packet loss: 0.0%. Network layer is completely healthy.' }
      ],
      mitigations: [
        { id: 'kill_idle_queries', label: 'Kill Idle-In-Transaction Queries & Enforce 3s Statement Timeout', isCorrect: true, feedback: 'Resolved! Terminating the blocking report queries immediately freed 42 pool connections. P99 dropped back to 38ms.' },
        { id: 'restart_app_servers', label: 'Restart All Kubernetes App Pods', isCorrect: false, feedback: 'Ineffective! Upon restarting, 500 pods immediately reconnected and saturated the database pool again within 3 seconds.' },
        { id: 'add_read_replicas', label: 'Spin up 2 Additional Read Replicas', isCorrect: false, feedback: 'Failed! Checkout queries perform writes and table locks on the primary database; read replicas did not alleviate primary connection saturation.' }
      ]
    },
    retryStorm: {
      id: 'retryStorm',
      title: 'P1 Incident: Cascading Downstream Outage & Thundering Retry Storm',
      summary: 'Payment service had a momentary 15-second glitch; upstream clients amplified traffic 12x, crashing API gateways.',
      metrics: {
        errorRatePct: 48.0,
        p99LatencyMs: 8200,
        cpuUsagePct: 98,
        dbConnections: 85,
        status: 'CRITICAL OUTAGE'
      },
      diagnostics: [
        { id: 'inspect_traffic_volume', label: 'Inspect Ingress QPS by Endpoint', output: 'POST /v1/checkout QPS jumped from 800 req/s to 9,600 req/s. 88% of requests share identical idempotency keys.' },
        { id: 'inspect_client_headers', label: 'Inspect Client User-Agent and Retry Headers', output: 'Client retry headers show immediate retries with zero delay (no exponential backoff or jitter).' }
      ],
      mitigations: [
        { id: 'enable_circuit_breaker', label: 'Trip Circuit Breaker & Enable Rate Limiting / Load Shedding', isCorrect: true, feedback: 'Resolved! Fast-failing downstream calls and shedding excessive client retries allowed downstream payment workers to drain backlogs and recover.' },
        { id: 'double_app_capacity', label: 'Scale Up App Server Pods 2x', isCorrect: false, feedback: 'Worsened outage! Adding more app servers only increased the volume of concurrent retry attacks against the struggling payment service.' }
      ]
    },
    gcPauseFreeze: {
      id: 'gcPauseFreeze',
      title: 'P1 Incident: Intermittent Server Freezes & Kubelet Health Check Timeouts',
      summary: 'Random pods stop responding for 5-10 seconds. Kubernetes liveness probes fail and restart pods in a crash loop.',
      metrics: {
        errorRatePct: 15.5,
        p99LatencyMs: 9400,
        cpuUsagePct: 100,
        dbConnections: 35,
        status: 'DEGRADED / CRASH LOOP'
      },
      diagnostics: [
        { id: 'inspect_gc_logs', label: 'Inspect JVM / Runtime Garbage Collection Telemetry', output: 'Full GC (Ergonomics) Stop-The-World pause: 7,850ms. Old Generation heap space is 98% full.' },
        { id: 'heap_dump_summary', label: 'Analyze Memory Heap Dump Top Consumers', output: '82% of heap memory is held by an in-memory HTTP session cache with unbounded TTL.' }
      ],
      mitigations: [
        { id: 'offload_sessions', label: 'Offload In-Memory Session Cache to External Redis Cluster', isCorrect: true, feedback: 'Resolved! Removing millions of session objects from the heap eliminated long Stop-The-World Full GC cycles. Pods stabilized immediately.' },
        { id: 'increase_liveness_timeout', label: 'Increase Kubernetes Liveness Probe Timeout from 5s to 30s', isCorrect: false, feedback: 'Masked the symptom! While pods stopped restarting, end users continued suffering 8-second request freezes during GC pauses.' }
      ]
    }
  }
};
