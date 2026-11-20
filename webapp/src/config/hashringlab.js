// The Consistent Hashing Lab (webapp/tools/consistent-hashing/index.html, script in webapp/src/tools/hashring.js,
// arithmetic in webapp/src/lib/netlab/hashring.js): every parameter, string, and diagnostic advice.

export const HASHRINGLAB = {
  model: {
    ringSize: 4294967296, // 2^32 hash space (32-bit integer ring)
    defaultVnodes: 5,
    minVnodes: 1,
    maxVnodes: 30
  },

  defaultNodes: [
    { id: 'node-a', label: 'Node A', color: '#6a2cf0' },
    { id: 'node-b', label: 'Node B', color: '#059669' },
    { id: 'node-c', label: 'Node C', color: '#e9a053' }
  ],

  availableNodes: [
    { id: 'node-a', label: 'Node A', color: '#6a2cf0' },
    { id: 'node-b', label: 'Node B', color: '#059669' },
    { id: 'node-c', label: 'Node C', color: '#e9a053' },
    { id: 'node-d', label: 'Node D', color: '#2563eb' },
    { id: 'node-e', label: 'Node E', color: '#db2777' },
    { id: 'node-f', label: 'Node F', color: '#d97706' }
  ],

  sampleKeyPool: [
    'user:1001', 'user:1002', 'user:1003', 'user:1004', 'user:1005',
    'session:tok_alpha', 'session:tok_beta', 'session:tok_gamma', 'session:tok_delta',
    'cart:buyer_99', 'cart:buyer_102', 'cart:buyer_305',
    'cache:home_feed', 'cache:product_442', 'cache:product_883', 'cache:leaderboard',
    'order:ord_201', 'order:ord_202', 'order:ord_203', 'order:ord_204',
    'image:hero.png', 'image:avatar_7.jpg', 'image:logo.svg', 'image:thumb_99.webp'
  ],

  presets: [
    {
      id: 'few-vnodes',
      label: '1 Vnode (Hotspots)',
      desc: 'Single point on the ring per node. Demonstrates severe imbalance and load skew caused by uneven ring partitioning.',
      vnodes: 1,
      nodes: ['node-a', 'node-b', 'node-c']
    },
    {
      id: 'balanced',
      label: '15 Vnodes (Balanced)',
      desc: 'Standard production configuration (e.g. Ketama / Dynamo). Virtual nodes interleave across the circle, smoothing key distribution.',
      vnodes: 15,
      nodes: ['node-a', 'node-b', 'node-c', 'node-d']
    },
    {
      id: 'cluster-5',
      label: '5-Node Cluster',
      desc: 'Larger distributed cache cluster demonstrating minimal key remapping during scaling.',
      vnodes: 10,
      nodes: ['node-a', 'node-b', 'node-c', 'node-d', 'node-e']
    }
  ],

  params: {
    vnodes: 'v',
    nodes: 'n'
  },

  ui: {
    title: 'Consistent Hashing & Partitioning Lab',
    lead: 'How do distributed caches and databases like Redis Cluster, DynamoDB, and Cassandra distribute keys across servers without re-shuffling the entire cluster when nodes join or leave?',
    nodesLabel: 'Active Physical Nodes',
    vnodesSliderLabel: 'Virtual nodes per physical node',
    addNodeBtn: 'Add Node',
    removeNodeBtn: 'Remove Node',
    resetKeysBtn: 'Regenerate Sample Keys',
    vnodesUnit: (n) => `${n} vnodes/node`,
    keysUnit: (n) => `${n} keys`,
    chartAria: 'Circular representation of consistent hash ring',
    legendVnodes: 'Virtual node tokens',
    legendKeys: 'Keys mapped to successor node',
    stats: {
      totalKeys: 'Total keys tracked',
      activeNodes: 'Physical nodes',
      totalTokens: 'Virtual tokens on ring',
      imbalanceScore: 'Load standard deviation',
      keysMigrated: 'Keys moved on change'
    },
    tableHeaders: {
      node: 'Node',
      tokens: 'Tokens',
      keys: 'Assigned keys',
      share: 'Traffic share'
    }
  },

  advice: {
    hotspotWarning: (maxPct, avgPct) =>
      `Severe load skew: The most loaded node handles ${maxPct}% of all traffic (expected ~${avgPct}%). Increase virtual nodes per server to disperse tokens evenly around the ring.`,
    balancedSuccess: (stdDev) =>
      `Even distribution: Standard deviation is low (σ = ${stdDev}). Virtual nodes have successfully broken the ring into finely interleaved ranges.`,
    migrationEfficiency: (moved, total, naivePct) =>
      `Minimal disruption: When a node changed, only ${moved} of ${total} keys (${Math.round((moved / total) * 100)}%) were remapped. With naive modulo hashing (hash(key) % N), ~${naivePct}% of all keys would have been invalidated!`
  }
};
