// Configuration and scenarios for the Vector Clocks & Distributed Causality Lab (/tools/vector-clocks/).

export const VECTOR_CONFIG = {
  actors: [
    { id: 'A', name: 'Node A (Alice)', color: 'var(--accent, #3b82f6)' },
    { id: 'B', name: 'Node B (Bob)', color: 'var(--signal, #06b6d4)' },
    { id: 'C', name: 'Node C (Charlie)', color: '#a855f7' }
  ],
  scenarios: {
    sequential: {
      name: 'Linear Causality (Happens-Before)',
      description: 'Node A writes and sends message to B. B receives, updates state, and forwards to C. Clock values strictly increase: V(A) < V(B) < V(C).'
    },
    concurrent: {
      name: 'Concurrent Divergence (Conflict)',
      description: 'Node A and Node C both update the same key independently without communicating. Neither clock dominates the other: V(A) || V(C).'
    },
    merge: {
      name: 'Conflict Resolution & Merge (Dynamo-style)',
      description: 'Node B receives updates from both divergent branches and reconciles them: V_merged = max(V_A, V_C) with local clock increment.'
    }
  }
};
