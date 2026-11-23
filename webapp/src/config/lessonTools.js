// Mapping between the 16 interactive tools in /tools/ and curriculum lesson files.
// Solves Site Audit B3: "Lessons never point to the tools".

export const TOOLS_CATALOG = {
  'page-load-latency': {
    id: 'page-load-latency',
    title: 'Page Load Latency Calculator',
    shortTitle: 'Latency Calculator',
    href: '/tools/page-load-latency/',
    badge: 'Interactive Calculator',
    tagline: 'Simulate DNS, TCP 3-way handshake, TLS 1.3, and HTTP waterfalls across global distances.',
    animType: 'latency-ping'
  },
  'system-design-estimator': {
    id: 'system-design-estimator',
    title: 'System Design Capacity Estimator',
    shortTitle: 'Capacity Estimator',
    href: '/tools/system-design-estimator/',
    badge: 'Workbench & Math',
    tagline: 'Calculate back-of-the-envelope numbers: Peak QPS, storage growth, network bandwidth, and RAM cache sizing.',
    animType: 'estimator-calc'
  },
  'raft-consensus': {
    id: 'raft-consensus',
    title: 'Raft Distributed Consensus Simulator',
    shortTitle: 'Raft Simulator',
    href: '/tools/raft-consensus/',
    badge: 'Cluster Simulator',
    tagline: 'Simulate a 5-node cluster: trigger leader elections, partition nodes into minority splits, and trace log quorums.',
    animType: 'raft-nodes'
  },
  'event-streaming': {
    id: 'event-streaming',
    title: 'Kafka & Event Streaming Simulator',
    shortTitle: 'Kafka Simulator',
    href: '/tools/event-streaming/',
    badge: 'Streaming Lab',
    tagline: 'Publish messages across partitioned commit logs, watch consumer rebalances, and track offset lag.',
    animType: 'stream-log'
  },
  'sql-optimizer': {
    id: 'sql-optimizer',
    title: 'SQL Query & Index Optimizer Playground',
    shortTitle: 'SQL Optimizer',
    href: '/tools/sql-optimizer/',
    badge: 'Query Planner Lab',
    tagline: 'Visualize query execution plans: toggle B-tree indexes, test composite index order, and observe index scans.',
    animType: 'query-tree'
  },
  'lld-studio': {
    id: 'lld-studio',
    title: 'Low-Level Design (LLD) & Schema Studio',
    shortTitle: 'LLD Studio',
    href: '/tools/lld-studio/',
    badge: 'Visual Architecture',
    tagline: 'Design UML class diagrams and ER schemas with interactive design pattern templates and code export.',
    animType: 'lld-uml'
  },
  'rate-limiting': {
    id: 'rate-limiting',
    title: 'Rate Limiting & Traffic Shaping Simulator',
    shortTitle: 'Rate Limiting Lab',
    href: '/tools/rate-limiting/',
    badge: 'Algorithm Lab',
    tagline: 'Compare Token Bucket, Leaky Bucket, and Sliding Window algorithms under traffic spikes and 429 throttling.',
    animType: 'token-bucket'
  },
  'consistent-hashing': {
    id: 'consistent-hashing',
    title: 'Consistent Hashing & Ring Partitioning Lab',
    shortTitle: 'Consistent Hashing',
    href: '/tools/consistent-hashing/',
    badge: 'Distributed Lab',
    tagline: 'Visualize circular hash rings, configure virtual nodes (vnodes), and measure repartition migration overhead.',
    animType: 'hash-ring'
  },
  'bloom-filter': {
    id: 'bloom-filter',
    title: 'Bloom Filter Simulator & Sizing Calculator',
    shortTitle: 'Bloom Filter Lab',
    href: '/tools/bloom-filter/',
    badge: 'Probabilistic Data',
    tagline: 'Explore k-hash bit array distributions, calculate optimal size (m) for false positive rate (p), and test lookups.',
    animType: 'bit-array'
  },
  'caching-strategies': {
    id: 'caching-strategies',
    title: 'Cache Strategies & Stampede Protection Lab',
    shortTitle: 'Caching Lab',
    href: '/tools/caching-strategies/',
    badge: 'Concurrency Lab',
    tagline: 'Simulate Cache-Aside, Write-Through, and Write-Behind. Compare Mutex locking vs XFetch probabilistic refresh.',
    animType: 'cache-stampede'
  },
  'distributed-transactions': {
    id: 'distributed-transactions',
    title: 'Distributed Transactions & Saga Simulator',
    shortTitle: 'Saga Simulator',
    href: '/tools/distributed-transactions/',
    badge: 'Transaction Lab',
    tagline: 'Simulate Two-Phase Commit (2PC) vs Saga Orchestration and Choreography with compensating rollbacks.',
    animType: 'saga-steps'
  },
  'tcp-congestion': {
    id: 'tcp-congestion',
    title: 'TCP Congestion & Flow Control Simulator',
    shortTitle: 'TCP Congestion Lab',
    href: '/tools/tcp-congestion/',
    badge: 'Network Flow Lab',
    tagline: 'Trace Slow Start exponential growth, AIMD sawtooth linear increase/halving, bufferbloat, and receiver window limits.',
    animType: 'sawtooth-wave'
  },
  'subnet': {
    id: 'subnet',
    title: 'Subnet Calculator & CIDR Practice',
    shortTitle: 'Subnet Calculator',
    href: '/tools/subnet/',
    badge: 'Interactive CIDR Lab',
    tagline: 'Break down IP prefixes into binary masks, network IDs, usable host ranges, and broadcast addresses with drills.',
    animType: 'cidr-bits'
  },
  'vector-clocks': {
    id: 'vector-clocks',
    title: 'Vector Clocks & Causality Lab',
    shortTitle: 'Vector Clocks Lab',
    href: '/tools/vector-clocks/',
    badge: 'Distributed Clock Lab',
    tagline: 'Step through Lamport timestamps, vector clock tick/merge rules, and detect concurrent conflict branches.',
    animType: 'vector-timeline'
  },
  'websocket-scaling': {
    id: 'websocket-scaling',
    title: 'Real-Time Connection & WebSocket Scaling Lab',
    shortTitle: 'WebSocket Scaling',
    href: '/tools/websocket-scaling/',
    badge: 'Socket Sizing Lab',
    tagline: 'Model socket buffer memory overhead (rmem/wmem), file descriptor limits (ulimit), and Redis pub/sub backplanes.',
    animType: 'socket-connections'
  },
  'incident-debugger': {
    id: 'incident-debugger',
    title: 'Production Incident Troubleshooting & RCA Simulator',
    shortTitle: 'Incident Debugger',
    href: '/tools/incident-debugger/',
    badge: 'On-Call Outage Lab',
    tagline: 'Step into an on-call SEV-1 outage: diagnose CPU spikes, thread pool exhaustion, database locks, and apply mitigations.',
    animType: 'incident-telemetry'
  }
};

export const LESSON_TOOLS_MAP = {
  // --- Latency & Performance ---
  'system-design/01-core-fundamentals/08-latency/README.md': ['page-load-latency', 'system-design-estimator', 'tcp-congestion'],
  'system-design/02-networking-from-zero/02-packets/README.md': ['tcp-congestion', 'page-load-latency', 'subnet'],
  'system-design/02-networking-from-zero/07-what-happens-when-you-type-a-url/README.md': ['page-load-latency'],
  'system-design/02-networking-from-zero/09-tcp-three-way-handshake/README.md': ['page-load-latency', 'tcp-congestion'],
  'system-design/02-networking-from-zero/10-tcp-flow-and-congestion-control/README.md': ['tcp-congestion', 'page-load-latency'],
  'system-design/02-networking-from-zero/11-tcp-closing-time-wait-and-ports/README.md': ['tcp-congestion'],
  'system-design/02-networking-from-zero/12-udp-vs-tcp/README.md': ['tcp-congestion'],
  'system-design/02-networking-from-zero/15-dns-lookup-step-by-step/README.md': ['page-load-latency'],
  'system-design/02-networking-from-zero/21-tls-1-3-handshake/README.md': ['page-load-latency'],
  'system-design/02-networking-from-zero/23-http-1-1-vs-http-2-vs-http-3/README.md': ['page-load-latency'],
  'system-design/02-networking-from-zero/29-connection-pooling-and-keep-alive/README.md': ['page-load-latency'],
  'backend/01-request-response-fundamentals/09-tls-ssl-and-https/README.md': ['page-load-latency'],

  // --- Subnets & Addressing ---
  'system-design/02-networking-from-zero/01-what-is-a-network/README.md': ['subnet', 'page-load-latency'],
  'system-design/02-networking-from-zero/03-ip-addresses/README.md': ['subnet'],
  'system-design/02-networking-from-zero/13-subnets-and-cidr/README.md': ['subnet'],
  'system-design/02-networking-from-zero/14-routing-and-nat/README.md': ['subnet'],

  // --- Capacity Estimation & Scaling ---
  'system-design/01-core-fundamentals/01-what-is-system-design/README.md': ['system-design-estimator'],
  'system-design/01-core-fundamentals/04-non-functional-requirements/README.md': ['system-design-estimator'],
  'system-design/01-core-fundamentals/06-vertical-scaling/README.md': ['system-design-estimator'],
  'system-design/01-core-fundamentals/07-horizontal-scaling/README.md': ['system-design-estimator', 'consistent-hashing'],
  'system-design/01-core-fundamentals/09-throughput-and-littles-law/README.md': ['system-design-estimator'],
  'system-design/01-core-fundamentals/12-scalability/README.md': ['system-design-estimator'],
  'backend/14-system-design-interview-practice/00-capacity-estimation-and-back-of-envelope-math/README.md': ['system-design-estimator'],
  'backend/14-system-design-interview-practice/01-the-system-design-interview-framework/README.md': ['system-design-estimator'],

  // --- Distributed Consensus & Consistency ---
  'system-design/01-core-fundamentals/13-cap-theorem/README.md': ['raft-consensus', 'vector-clocks'],
  'system-design/01-core-fundamentals/14-pacelc-theorem/README.md': ['raft-consensus'],
  'system-design/01-core-fundamentals/15-consistency-models/README.md': ['vector-clocks', 'raft-consensus'],
  'system-design/01-core-fundamentals/16-fault-tolerance/README.md': ['raft-consensus', 'incident-debugger'],
  'system-design/01-core-fundamentals/17-single-point-of-failure/README.md': ['incident-debugger', 'raft-consensus'],
  'backend/10-distributed-systems-patterns/README.md': ['raft-consensus', 'vector-clocks', 'distributed-transactions'],
  'backend/10-distributed-systems-patterns/07-consensus-and-coordination/README.md': ['raft-consensus', 'vector-clocks'],

  // --- Event Streaming & Kafka ---
  'backend/17-kafka-and-streaming/README.md': ['event-streaming'],
  'backend/17-kafka-and-streaming/00-producer-internals-acks-idempotence-and-partitioning/README.md': ['event-streaming'],
  'backend/17-kafka-and-streaming/01-consumer-groups-and-rebalancing-in-depth/README.md': ['event-streaming'],
  'backend/17-kafka-and-streaming/02-delivery-semantics-and-exactly-once/README.md': ['event-streaming'],
  'backend/17-kafka-and-streaming/03-schemas-and-evolution-with-schema-registry/README.md': ['event-streaming'],
  'backend/06-background-processing-and-realtime/10-message-brokers-kafka/README.md': ['event-streaming'],
  'backend/06-background-processing-and-realtime/00-task-queues-fundamentals/README.md': ['event-streaming'],
  'system-design/01-core-fundamentals/19-stateless-vs-stateful/README.md': ['event-streaming'],

  // --- SQL & Database Optimization ---
  'backend/04-databases-and-data-layer/01-acid-and-cap-theorem/README.md': ['sql-optimizer', 'raft-consensus'],
  'backend/04-databases-and-data-layer/03-schema-design-and-indexing/README.md': ['sql-optimizer', 'bloom-filter'],
  'backend/04-databases-and-data-layer/04-transactions-and-concurrency-control/README.md': ['sql-optimizer'],
  'backend/04-databases-and-data-layer/08-replication-and-sharding/README.md': ['consistent-hashing', 'sql-optimizer'],

  // --- Low-Level Design (LLD) ---
  'lld/README.md': ['lld-studio'],
  'lld/01-classes-objects-and-oop-building-blocks/README.md': ['lld-studio'],
  'lld/02-oop-foundations-and-uml/README.md': ['lld-studio'],
  'lld/04-solid-principles/README.md': ['lld-studio'],
  'lld/05-core-design-principles/README.md': ['lld-studio'],
  'lld/06-creational-patterns/README.md': ['lld-studio'],
  'lld/07-structural-patterns/README.md': ['lld-studio'],
  'lld/08-behavioral-patterns-i/README.md': ['lld-studio'],
  'lld/11-requirements-to-class-diagrams/README.md': ['lld-studio'],
  'lld/12-parking-lot-and-elevator/README.md': ['lld-studio'],
  'lld/13-library-and-vending-machine/README.md': ['lld-studio'],

  // --- Rate Limiting ---
  'backend/02-api-layer-and-request-handling/04-common-middleware-patterns/README.md': ['rate-limiting'],
  'backend/09-security-deep-dive/04-rate-limiting-and-abuse-prevention/README.md': ['rate-limiting'],
  'backend/14-system-design-interview-practice/03-designing-a-rate-limiter/README.md': ['rate-limiting'],
  'lld/18-lru-lfu-cache-and-rate-limiter/README.md': ['rate-limiting', 'caching-strategies'],
  'backend/06-background-processing-and-realtime/02-retries-prioritization-and-rate-limiting-in-queues/README.md': ['rate-limiting'],

  // --- Consistent Hashing & Distributed Cache ---
  'backend/14-system-design-interview-practice/04-designing-a-distributed-cache-and-key-value-store/README.md': ['consistent-hashing', 'caching-strategies'],
  'backend/10-distributed-systems-patterns/02-distributed-locking/README.md': ['consistent-hashing'],

  // --- Caching Strategies & Bloom Filters ---
  'backend/05-caching-and-performance/00-caching-fundamentals/README.md': ['caching-strategies', 'bloom-filter'],
  'backend/05-caching-and-performance/01-caching-strategies/README.md': ['caching-strategies'],
  'backend/05-caching-and-performance/02-cache-eviction-and-invalidation/README.md': ['caching-strategies', 'bloom-filter'],
  'backend/01-request-response-fundamentals/06-http-caching/README.md': ['caching-strategies'],
  'backend/01-request-response-fundamentals/12-cdn-and-edge-caching/README.md': ['caching-strategies'],

  // --- Distributed Transactions & Sagas ---
  'backend/10-distributed-systems-patterns/03-distributed-transactions-and-two-phase-commit/README.md': ['distributed-transactions'],
  'backend/10-distributed-systems-patterns/04-the-saga-pattern/README.md': ['distributed-transactions'],
  'backend/10-distributed-systems-patterns/01-idempotency-in-practice/README.md': ['distributed-transactions'],

  // --- WebSockets & Real-Time ---
  'system-design/02-networking-from-zero/24-websockets/README.md': ['websocket-scaling'],
  'system-design/02-networking-from-zero/25-sse-vs-long-polling-vs-websockets/README.md': ['websocket-scaling'],
  'system-design/02-networking-from-zero/26-http-streaming-and-backpressure/README.md': ['websocket-scaling'],
  'backend/06-background-processing-and-realtime/07-websockets-and-server-sent-events/README.md': ['websocket-scaling'],
  'backend/11-advanced-api-paradigms/08-webhooks-vs-polling-vs-websockets-tradeoffs/README.md': ['websocket-scaling'],
  'backend/14-system-design-interview-practice/06-designing-a-chat-and-notification-system/README.md': ['websocket-scaling'],

  // --- Observability & Incident Response ---
  'backend/08-observability-and-operational-readiness/00-error-handling-strategies/README.md': ['incident-debugger'],
  'backend/08-observability-and-operational-readiness/04-logging-fundamentals/README.md': ['incident-debugger']
};

/**
 * Returns the matching interactive tools for a given curriculum lesson path.
 * Returns an empty array if no interactive tool is mapped.
 *
 * @param {string} path - Lesson file path (e.g. "system-design/01-core-fundamentals/08-latency/README.md")
 * @returns {Array<object>} List of tool definitions with { ...tool, isPrimary: boolean }
 */
export function getToolsForLesson(path) {
  if (!path) return [];
  const toolIds = LESSON_TOOLS_MAP[path];
  if (!toolIds || !toolIds.length) return [];
  return toolIds
    .map((id, index) => {
      const tool = TOOLS_CATALOG[id];
      if (!tool) return null;
      return { ...tool, isPrimary: index === 0 };
    })
    .filter(Boolean);
}
