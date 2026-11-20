import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCluster,
  startElection,
  replicateLog,
  crashNode,
  recoverNode,
  sendHeartbeats
} from './raft.js';

describe('Raft Consensus Core State Machine', () => {
  it('initializes a cluster of 5 followers with quorum of 3', () => {
    const cluster = createCluster(5);
    assert.equal(cluster.nodeCount, 5);
    assert.equal(cluster.quorum, 3);
    assert.equal(cluster.leaderId, null);
    assert.equal(cluster.nodes.length, 5);
    assert.ok(cluster.nodes.every((n) => n.role === 'follower'));
  });

  it('elects a candidate when receiving majority votes', () => {
    const cluster = createCluster(5);
    const result = startElection(cluster, 1);
    assert.equal(result.elected, true);
    assert.equal(result.votes, 5); // all nodes vote yes in initial clean state
    assert.equal(cluster.leaderId, 1);
    assert.equal(cluster.nodes[0].role, 'leader');
    assert.equal(cluster.nodes[0].term, 1);
  });

  it('fails election when majority quorum cannot be reached due to crashed nodes', () => {
    const cluster = createCluster(5);
    crashNode(cluster, 2);
    crashNode(cluster, 3);
    crashNode(cluster, 4); // 3 of 5 crashed, only node 1 and 5 alive

    const result = startElection(cluster, 1);
    assert.equal(result.elected, false);
    assert.equal(result.votes, 2); // node 1 and 5 only, quorum is 3
    assert.equal(cluster.leaderId, null);
  });

  it('replicates log entries through leader and commits across majority', () => {
    const cluster = createCluster(5);
    startElection(cluster, 1); // Node 1 is leader

    const res = replicateLog(cluster, 'SET x = 42');
    assert.equal(res.committed, true);
    assert.equal(res.acks, 5);
    assert.equal(res.entry.command, 'SET x = 42');
    assert.equal(cluster.nodes[0].commitIndex, 1);
    assert.equal(cluster.nodes[1].log.length, 1);
  });

  it('handles leader crash and failover to a new leader in a higher term', () => {
    const cluster = createCluster(5);
    startElection(cluster, 1);
    assert.equal(cluster.leaderId, 1);

    crashNode(cluster, 1);
    assert.equal(cluster.leaderId, null);

    // Node 2 starts election in Term 2
    const result = startElection(cluster, 2);
    assert.equal(result.elected, true);
    assert.equal(result.votes, 4); // nodes 2, 3, 4, 5 vote yes
    assert.equal(cluster.leaderId, 2);
    assert.equal(cluster.nodes[1].term, 2);
  });

  it('sends heartbeats resetting peer terms and asserting authority', () => {
    const cluster = createCluster(5);
    startElection(cluster, 3);
    const beats = sendHeartbeats(cluster);
    assert.equal(beats.length, 4);
    assert.ok(beats.every((b) => b.from === 3));
  });

  it('recovers a crashed node safely back into follower state', () => {
    const cluster = createCluster(5);
    crashNode(cluster, 4);
    assert.equal(cluster.nodes[3].isCrashed, true);

    recoverNode(cluster, 4);
    assert.equal(cluster.nodes[3].isCrashed, false);
    assert.equal(cluster.nodes[3].role, 'follower');
  });
});
