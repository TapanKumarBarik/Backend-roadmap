import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashKey,
  getPartition,
  createBroker,
  publish,
  assignPartitions,
  createConsumerGroup,
  rebalanceGroup,
  calculateLag,
  consumeBatch
} from './eventstream.js';

test('hashKey routes identical keys to identical partitions deterministically', () => {
  const hash1 = hashKey('order:101');
  const hash2 = hashKey('order:101');
  const hash3 = hashKey('order:102');

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(getPartition('order:101', 4), getPartition('order:101', 4));
});

test('publish appends messages with sequential offsets to target partition', () => {
  const broker = createBroker(4);
  const res1 = publish(broker, 'order:101', { amount: 50 });
  const res2 = publish(broker, 'order:101', { amount: 75 });

  assert.equal(res1.partitionId, res2.partitionId);
  assert.equal(res1.offset, 0);
  assert.equal(res2.offset, 1);
  assert.equal(broker.partitions[res1.partitionId].messages.length, 2);
  assert.equal(broker.partitions[res1.partitionId].nextOffset, 2);
});

test('assignPartitions distributes partitions fairly across consumers', () => {
  // 4 partitions across 2 consumers
  const a2 = assignPartitions(2, 4);
  assert.deepEqual(a2, [[0, 2], [1, 3]]);

  // 4 partitions across 4 consumers
  const a4 = assignPartitions(4, 4);
  assert.deepEqual(a4, [[0], [1], [2], [3]]);

  // 4 partitions across 5 consumers (5th consumer is idle)
  const a5 = assignPartitions(5, 4);
  assert.deepEqual(a5, [[0], [1], [2], [3], []]);
});

test('rebalanceGroup redistributes partitions when consumer fails', () => {
  const group = createConsumerGroup('grp-analytics', 3, 4);
  // Initially C1: [0, 3], C2: [1], C3: [2]
  assert.equal(group.consumers.length, 3);

  // Crash consumer C2
  group.consumers[1].isAlive = false;
  const active = group.consumers.filter((c) => c.isAlive);
  rebalanceGroup(group, active, 4);

  assert.equal(active.length, 2);
  assert.deepEqual(active[0].assignedPartitions, [0, 2]);
  assert.deepEqual(active[1].assignedPartitions, [1, 3]);
});

test('calculateLag computes partition and total consumer lag', () => {
  const broker = createBroker(4);
  const group = createConsumerGroup('grp-orders', 2, 4);

  publish(broker, 'user:1', 'msg1'); // routed to one partition
  publish(broker, 'user:1', 'msg2');
  publish(broker, 'user:2', 'msg3');

  const lagBefore = calculateLag(broker, group);
  assert.equal(lagBefore.totalLag, 3);

  consumeBatch(group, broker, 'atLeastOnce');

  const lagAfter = calculateLag(broker, group);
  assert.equal(lagAfter.totalLag, 0);
});

test('consumeBatch respects idempotent deduplication semantics', () => {
  const broker = createBroker(2);
  const group = createConsumerGroup('grp-audit', 1, 2);

  publish(broker, 'key1', 'eventA');
  const batch1 = consumeBatch(group, broker, 'idempotent');
  assert.equal(batch1.length, 1);
  assert.equal(group.consumers[0].processedCount, 1);

  // Rewind committed offset manually to simulate at-least-once replay
  group.committedOffsets[0] = 0;
  group.committedOffsets[1] = 0;

  // With idempotent semantics, deduplication prevents duplicate processing
  const batch2 = consumeBatch(group, broker, 'idempotent');
  assert.equal(batch2.length, 0);
  assert.equal(group.consumers[0].processedCount, 1);
});
