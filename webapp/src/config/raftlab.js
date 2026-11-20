// Configuration and presets for the Raft Consensus Simulator (/tools/raft-consensus/).
// Models node states, election timeouts, log entries, and scenarios.

export const RAFT_CONFIG = {
  nodeCount: 5,
  minTimeoutMs: 150,
  maxTimeoutMs: 300,
  heartbeatIntervalMs: 50,
  nodeRadius: 32,
  layoutRadius: 150,
  svgSize: 420,
  roles: {
    follower: { label: 'Follower', color: 'var(--fg-muted, #71717a)', stroke: 'var(--border-strong, #52525b)' },
    candidate: { label: 'Candidate', color: '#eab308', stroke: '#ca8a04' },
    leader: { label: 'Leader', color: 'var(--signal, #06b6d4)', stroke: '#0891b2' },
    crashed: { label: 'Crashed', color: 'var(--danger, #ef4444)', stroke: '#b91c1c' }
  },
  scenarios: {
    normalElection: {
      name: 'Normal Election',
      description: 'A follower times out, transitions to candidate, requests votes from peers, and wins a majority quorum (3 of 5).'
    },
    splitVote: {
      name: 'Split Vote Scenario',
      description: 'Two nodes time out simultaneously and split votes 2-2 with 1 abstain. No majority is reached; a new term begins after randomized backoff.'
    },
    leaderCrash: {
      name: 'Leader Crash & Failover',
      description: 'The active leader stops sending heartbeats. Remaining followers detect silence and elect a new leader without data loss.'
    },
    logReplication: {
      name: 'Log Replication & Quorum Commit',
      description: 'Client submits an entry to the leader. The leader replicates it to followers via AppendEntries and commits once acknowledged by a majority.'
    }
  }
};
