// Core Kafka & Event Streaming state machine and partition assignment arithmetic.
// Models partitioned append-only commit logs, consumer group rebalances, and delivery semantics.

/** 32-bit FNV-1a hash function for deterministic key-to-partition routing */
export function hashKey(str) {
  let hash = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Determines target partition index using key hashing */
export function getPartition(key, partitionCount) {
  if (!key) return 0;
  return hashKey(key) % partitionCount;
}

/** Creates an in-memory topic broker with N partitions */
export function createBroker(partitionCount = 4) {
  const partitions = [];
  for (let i = 0; i < partitionCount; i++) {
    partitions.push({
      id: i,
      messages: [],
      nextOffset: 0
    });
  }
  return { partitionCount, partitions };
}

/** Appends a message to the appropriate partition based on key hashing */
export function publish(broker, key, value) {
  const pIndex = getPartition(key, broker.partitionCount);
  const part = broker.partitions[pIndex];
  const offset = part.nextOffset;

  const msg = {
    offset,
    partition: pIndex,
    key,
    value,
    timestamp: Date.now()
  };

  part.messages.push(msg);
  part.nextOffset += 1;

  return { partitionId: pIndex, offset, message: msg };
}

/** Assigns partitions evenly across consumers (Range / Round-Robin) */
export function assignPartitions(consumerCount, partitionCount) {
  const assignments = Array.from({ length: consumerCount }, () => []);
  if (consumerCount === 0) return assignments;

  for (let p = 0; p < partitionCount; p++) {
    const consumerIdx = p % consumerCount;
    assignments[consumerIdx].push(p);
  }
  return assignments;
}

/** Creates a consumer group with partition assignments */
export function createConsumerGroup(groupId, consumerCount, partitionCount) {
  const assignments = assignPartitions(consumerCount, partitionCount);
  const consumers = [];

  for (let i = 0; i < consumerCount; i++) {
    consumers.push({
      id: `C${i + 1}`,
      assignedPartitions: assignments[i],
      isAlive: true,
      processedCount: 0
    });
  }

  const committedOffsets = {};
  for (let p = 0; p < partitionCount; p++) committedOffsets[p] = 0;

  return {
    groupId,
    partitionCount,
    consumers,
    committedOffsets,
    dedupCache: new Set()
  };
}

/** Rebalances partition assignments when consumers fail or scale out */
export function rebalanceGroup(group, activeConsumers, partitionCount) {
  const assignments = assignPartitions(activeConsumers.length, partitionCount);
  activeConsumers.forEach((c, idx) => {
    c.assignedPartitions = assignments[idx];
  });
}

/** Computes unconsumed message lag per partition and in total */
export function calculateLag(broker, group) {
  let totalLag = 0;
  const partitionLag = {};

  for (const part of broker.partitions) {
    const committed = group.committedOffsets[part.id] || 0;
    const lag = Math.max(0, part.nextOffset - committed);
    partitionLag[part.id] = lag;
    totalLag += lag;
  }

  return { totalLag, partitionLag };
}

/**
 * Consumes next batch of messages according to delivery semantics:
 * - 'atMostOnce': commits offset before processing
 * - 'atLeastOnce': commits offset after processing
 * - 'idempotent': uses dedupCache to prevent duplicate side-effects
 */
export function consumeBatch(group, broker, semantics = 'atLeastOnce') {
  const processed = [];
  const activeConsumers = group.consumers.filter((c) => c.isAlive);

  for (const consumer of activeConsumers) {
    for (const pId of consumer.assignedPartitions) {
      const part = broker.partitions[pId];
      const startOffset = group.committedOffsets[pId] || 0;

      // Available messages
      const unconsumed = part.messages.slice(startOffset);
      if (!unconsumed.length) continue;

      if (semantics === 'atMostOnce') {
        // Pre-commit offsets before processing
        group.committedOffsets[pId] = part.nextOffset;
      }

      for (const msg of unconsumed) {
        if (semantics === 'idempotent') {
          const dedupKey = `${msg.key}:${msg.offset}`;
          if (group.dedupCache.has(dedupKey)) continue; // skip duplicate
          group.dedupCache.add(dedupKey);
        }

        consumer.processedCount += 1;
        processed.push({
          consumerId: consumer.id,
          partitionId: pId,
          message: msg
        });
      }

      if (semantics === 'atLeastOnce' || semantics === 'idempotent') {
        // Post-commit offsets after processing
        group.committedOffsets[pId] = part.nextOffset;
      }
    }
  }

  return processed;
}
