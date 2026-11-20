// The Bloom Filter Lab (webapp/tools/bloom-filter/index.html, script in webapp/src/tools/bloom.js,
// arithmetic in webapp/src/lib/netlab/bloom.js): parameters, formulas, and educational advice.

export const BLOOMLAB = {
  model: {
    visualBitSize: 64, // Number of cells in the interactive bit array UI
    defaultHashes: 3,
    minHashes: 1,
    maxHashes: 6,
    defaultN: 10000,
    defaultP: 0.01 // 1% false positive rate
  },

  sampleKeys: [
    'user:alice',
    'user:bob',
    'session:auth_99',
    'cache:feed_v2',
    'doc:readme.md'
  ],

  presets: [
    {
      id: 'sstable',
      label: 'Database SSTable (RocksDB / Cassandra)',
      desc: '1% false positive rate (~9.6 bits/key, k=7 hashes). Prevents 99% of unnecessary disk I/O reads for non-existent keys.',
      n: 10000,
      p: 0.01
    },
    {
      id: 'crawler',
      label: 'Web Crawler URL Deduplication',
      desc: '0.1% false positive rate (~14.4 bits/key, k=10 hashes). Filters billions of visited URLs in memory.',
      n: 100000,
      p: 0.001
    },
    {
      id: 'cdn-cache',
      label: 'CDN Cache / Webhook Filter',
      desc: '5% false positive rate (~6.2 bits/key, k=4 hashes). Lightweight in-memory rejection of one-hit-wonder requests.',
      n: 50000,
      p: 0.05
    }
  ],

  ui: {
    title: 'Bloom Filter Interactive Lab & Math Calculator',
    lead: 'How do databases like Cassandra and RocksDB avoid expensive disk reads for non-existent keys? Test membership queries, inspect bit array hashing, and calculate optimal memory sizing in your browser.',
    interactiveHeading: 'Interactive Bit Array Simulation',
    calculatorHeading: 'Optimal Dimensioning Calculator',
    inputKeyPlaceholder: 'e.g. user:charlie or order:882',
    addKeyBtn: 'Insert key into filter',
    checkKeyBtn: 'Query key',
    resetFilterBtn: 'Clear filter',
    calcExpectedN: 'Expected number of items (n)',
    calcTargetP: 'Target false positive probability (p)',
    stats: {
      itemsInserted: 'Items inserted',
      bitsSet: 'Bits set to 1',
      fillRate: 'Bit array saturation',
      theoreticalFp: 'Current false positive rate'
    },
    calcResults: {
      optimalM: 'Optimal bit array size (m)',
      optimalK: 'Optimal hash count (k)',
      bitsPerItem: 'Bits per element',
      totalMemory: 'Required memory'
    }
  },

  advice: {
    definitelyNot: (key) =>
      `Definite miss: At least one hash bit for "${key}" is 0. The key is GUARANTEED to NOT exist in the set. Zero false negatives.`,
    probablyIn: (key, fpRate) =>
      `Probable hit: All hash bits for "${key}" are set to 1. The key is PROBABLY in the set (with a ${fpRate}% false positive risk).`,
    saturationWarning: (fillPct) =>
      `High saturation: ${fillPct}% of all bits are 1! As the filter fills up, the false positive rate increases rapidly. Size your bit array for expected capacity.`,
    optimalDimensionTip: (kb, bitsPerKey, k) =>
      `Optimal configuration: For these requirements, allocate ${kb} KB (${bitsPerKey} bits/key) and use k=${k} independent hash functions to achieve the target accuracy.`
  }
};
