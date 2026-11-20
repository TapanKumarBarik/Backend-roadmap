// Core Raft state machine and consensus arithmetic for the Raft Simulator.
// Implements leader elections, term management, log replication, and quorum calculation.

/**
 * Creates an initial Raft cluster with N follower nodes in Term 0.
 */
export function createCluster(nodeCount = 5) {
  const nodes = [];
  for (let i = 1; i <= nodeCount; i++) {
    nodes.push({
      id: i,
      role: 'follower',
      term: 0,
      votedFor: null,
      votesReceived: 0,
      log: [],
      commitIndex: 0,
      isCrashed: false
    });
  }
  return {
    nodeCount,
    quorum: Math.floor(nodeCount / 2) + 1,
    nodes,
    leaderId: null,
    term: 0
  };
}

/**
 * Initiates an election for candidateId.
 * Candidate increments term, votes for itself, and requests votes from peers.
 */
export function startElection(cluster, candidateId) {
  const candidate = cluster.nodes.find((n) => n.id === candidateId);
  if (!candidate || candidate.isCrashed) return { elected: false, votes: 0 };

  candidate.term += 1;
  candidate.role = 'candidate';
  candidate.votedFor = candidateId;
  candidate.votesReceived = 1; // votes for self
  cluster.term = Math.max(cluster.term, candidate.term);

  // RequestVote RPC to all other active nodes
  for (const peer of cluster.nodes) {
    if (peer.id === candidateId || peer.isCrashed) continue;

    // Standard Raft voting rule:
    // Vote YES if candidate term > peer term, or (candidate term == peer term and peer hasn't voted yet)
    if (candidate.term > peer.term) {
      peer.term = candidate.term;
      peer.votedFor = candidateId;
      peer.role = 'follower';
      candidate.votesReceived += 1;
    } else if (candidate.term === peer.term && (peer.votedFor === null || peer.votedFor === candidateId)) {
      peer.votedFor = candidateId;
      candidate.votesReceived += 1;
    }
  }

  // Check majority quorum
  const won = candidate.votesReceived >= cluster.quorum;
  if (won) {
    candidate.role = 'leader';
    cluster.leaderId = candidateId;
    // Step down any older leaders
    for (const peer of cluster.nodes) {
      if (peer.id !== candidateId && peer.role === 'leader') {
        peer.role = 'follower';
      }
    }
  }

  return {
    elected: won,
    votes: candidate.votesReceived,
    quorum: cluster.quorum,
    term: candidate.term
  };
}

/**
 * Replicates a client command through the active leader.
 * Appends entry to leader log, broadcasts AppendEntries RPC, and commits on quorum.
 */
export function replicateLog(cluster, command) {
  const leader = cluster.nodes.find((n) => n.id === cluster.leaderId);
  if (!leader || leader.isCrashed || leader.role !== 'leader') {
    return { committed: false, reason: 'No active leader' };
  }

  const newIndex = leader.log.length + 1;
  const entry = { index: newIndex, term: leader.term, command };
  leader.log.push(entry);

  let acks = 1; // leader already holds the entry

  for (const peer of cluster.nodes) {
    if (peer.id === leader.id || peer.isCrashed) continue;
    peer.log.push({ ...entry });
    acks += 1;
  }

  const committed = acks >= cluster.quorum;
  if (committed) {
    leader.commitIndex = newIndex;
    for (const peer of cluster.nodes) {
      if (!peer.isCrashed) peer.commitIndex = newIndex;
    }
  }

  return {
    committed,
    acks,
    quorum: cluster.quorum,
    entry
  };
}

/**
 * Crashes a node, taking it offline.
 * If leader crashes, cluster leaderId is cleared.
 */
export function crashNode(cluster, nodeId) {
  const node = cluster.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  node.isCrashed = true;
  node.role = 'crashed';
  if (cluster.leaderId === nodeId) {
    cluster.leaderId = null;
  }
}

/**
 * Recovers a crashed node, resetting it to follower status.
 */
export function recoverNode(cluster, nodeId) {
  const node = cluster.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  node.isCrashed = false;
  node.role = 'follower';
  node.votedFor = null;
  node.votesReceived = 0;
  node.term = cluster.term;
}

/**
 * Sends heartbeats from current leader to all active followers.
 */
export function sendHeartbeats(cluster) {
  const leader = cluster.nodes.find((n) => n.id === cluster.leaderId);
  if (!leader || leader.isCrashed || leader.role !== 'leader') return [];

  const heartbeats = [];
  for (const peer of cluster.nodes) {
    if (peer.id === leader.id || peer.isCrashed) continue;
    peer.term = leader.term;
    heartbeats.push({ from: leader.id, to: peer.id, term: leader.term });
  }
  return heartbeats;
}
