// Tags grouped into the domains they actually belong to.
//
// There are 146 of them. Ordered by frequency they were a wall of
// monospace chips — useful only if you already knew the tag you wanted,
// which is precisely when you'd use search instead. Grouped, they become
// something you can browse when you don't.
//
// The lists below are curated, not exhaustive: anything not named here
// still appears, under "Everything else". Adding a tag to the content
// never makes it disappear from this screen.

const DOMAINS = [
  {
    name: 'Infrastructure & platform',
    tags: ['infrastructure', 'azure', 'kubernetes', 'k8s-services', 'pods', 'containers',
      'iac', 'vnet', 'subnetting', 'autoscaling', 'managed-identity', 'gitops',
      'deployments', 'images']
  },
  {
    name: 'Backend & APIs',
    tags: ['backend', 'api', 'rest', 'grpc', 'http', 'routing', 'auth', 'idempotency',
      'realtime', 'event-driven', 'queues', 'caching']
  },
  {
    name: 'Data',
    tags: ['postgres', 'sql', 'transactions', 'replication', 'indexing']
  },
  {
    name: 'Running it in production',
    tags: ['monitoring', 'sre', 'performance', 'ci-cd', 'disaster-recovery', 'cost',
      'billing', 'secrets', 'security', 'tls', 'dns']
  },
  {
    name: 'Languages & craft',
    tags: ['python', 'bash', 'shell', 'git', 'processes', 'filesystem', 'concurrency',
      'design-patterns', 'uml', 'low-level-design', 'yaml']
  },
  {
    name: 'Practice',
    tags: ['interview', 'capstone', 'exercises', 'challenge', 'quiz', 'review']
  }
];

// Meta tags that describe a module's format rather than its subject —
// every module has exercises and a quiz, so they sort to the top by count
// while telling you nothing about what a module is about.
const FORMAT_TAGS = new Set(['exercises', 'challenge', 'quiz', 'review', 'dual-language']);

export function groupTags(allTags, { includeFormat = false } = {}) {
  const claimed = new Set();
  const groups = DOMAINS.map(({ name, tags }) => {
    const items = tags
      .filter((t) => allTags[t] && (includeFormat || !FORMAT_TAGS.has(t)))
      .map((t) => { claimed.add(t); return { tag: t, count: allTags[t] }; })
      .sort((a, b) => b.count - a.count);
    return { name, items };
  }).filter((g) => g.items.length);

  const rest = Object.entries(allTags)
    .filter(([t]) => !claimed.has(t) && (includeFormat || !FORMAT_TAGS.has(t)))
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  if (rest.length) groups.push({ name: 'Everything else', items: rest, rest: true });
  return groups;
}
