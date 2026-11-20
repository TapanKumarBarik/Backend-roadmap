// Configuration and presets for the Kafka & Event Streaming Architecture Simulator (/tools/event-streaming/).

export const STREAM_CONFIG = {
  defaultPartitions: 4,
  maxPartitions: 6,
  maxConsumers: 6,
  sampleKeys: ['order:101', 'user:42', 'payment:999', 'device:A5', 'cart:303', 'user:88'],
  deliverySemantics: {
    atLeastOnce: {
      name: 'At-Least-Once (Default)',
      description: 'Offsets are committed only after the message is processed. If a consumer crashes mid-processing, rebalanced consumers will re-read and reprocess the message (risk of duplicates; requires idempotency).'
    },
    atMostOnce: {
      name: 'At-Most-Once',
      description: 'Offsets are committed immediately upon fetch before processing starts. If a consumer crashes mid-processing, the message is permanently skipped and lost.'
    },
    idempotent: {
      name: 'Exactly-Once / Idempotent',
      description: 'Combines transactional offset commits with unique message deduplication keys (idempotency tokens), guaranteeing each event is processed exactly once even across consumer crashes.'
    }
  },
  scenarios: {
    balanced: {
      name: 'Balanced Group (4 Partitions, 2 Consumers)',
      description: 'Each consumer handles exactly 2 partitions (C1 -> P0, P1; C2 -> P2, P3).'
    },
    scaleOut: {
      name: 'Scale Out (4 Partitions, 4 Consumers)',
      description: 'Group scales out to 4 consumers. Each consumer owns exactly 1 partition for maximum parallel throughput.'
    },
    overProvisioned: {
      name: 'Over-Provisioned (4 Partitions, 5 Consumers)',
      description: 'There are more consumers than partitions. The 5th consumer sits completely idle because a single partition can only be read by one consumer in a group at any time.'
    },
    consumerFailure: {
      name: 'Consumer Crash & Rebalance',
      description: 'Consumer 2 abruptly fails. The group coordinator detects the heartbeat timeout and reassigns its orphan partitions to remaining active consumers.'
    }
  }
};
