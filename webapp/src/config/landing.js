// Everything the landing page says and links to. components/home/Landing.jsx only lays it out, so changing
// the wording, a path blurb or a route stop means editing this file and nothing else.
// Numbers come from build-time stats (scripts/gen-site-stats.mjs) and are passed to the functions below.

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '');

// Used only when site-stats.json could not be loaded.
export const FALLBACK_START_FILE = 'backend/01-request-response-fundamentals/00-system-overview-and-request-flow/README.md';

export const HERO = {
  eyebrow: 'Free · Open source · No sign-up to read',
  headline: 'Backend engineering, system design and GenAI, taught by running real code.',
  lead: (modules) => `${modules ? `${fmt(modules.written)} hands-on modules` : 'Hands-on modules'} that go from HTTP and databases to Kubernetes and LLM APIs. Every module is a markdown file in a public repository: read it here, run the code, and fix it if it is wrong.`,
  startLabel: 'Start with Backend',
  browseLabel: 'Browse the curriculum',
  searchLabel: (modules) => (modules ? `Search ${fmt(modules.written)} modules and topics` : 'Search modules and topics'),
  routeCaption: 'A route through it'
};

// One concrete route through the written material: every stop is a real track overview.
export const ROUTE = [
  { label: 'Request & response', sub: 'HTTP, headers, methods', file: 'backend/01-request-response-fundamentals/README.md' },
  { label: 'APIs', sub: 'Routing, validation, errors', file: 'backend/02-api-layer-and-request-handling/README.md' },
  { label: 'Databases', sub: 'Schemas, indexes, transactions', file: 'backend/04-databases-and-data-layer/README.md' },
  { label: 'Caching', sub: 'Where, what and when to invalidate', file: 'backend/05-caching-and-performance/README.md' },
  { label: 'Distributed systems', sub: 'Retries, consistency, queues', file: 'backend/10-distributed-systems-patterns/README.md' },
  { label: 'Kubernetes', sub: 'Pods to production', file: 'learn/03-kubernetes/README.md' },
  { label: 'LLM APIs', sub: 'Streaming, tools, structured output', file: 'genai/06-openai-and-the-model-landscape/README.md' }
];

// `id` is the curriculum folder (site.config.json -> content.curricula); the numbers come from the stats.
export const PATHS = {
  heading: 'Pick a path',
  startLabel: 'Start',
  tracksLabel: 'See the tracks',
  items: [
    {
      id: 'backend',
      title: 'Backend Engineering',
      blurb: 'HTTP and APIs, authentication, databases, caching, queues, observability and distributed systems, ending in system-design interview practice.'
    },
    {
      id: 'genai',
      title: 'GenAI Engineering',
      blurb: 'Tokens, transformers and GPUs, then the OpenAI, Anthropic and Gemini APIs, embeddings and vector databases. RAG, agents and serving come next.'
    },
    {
      id: 'learn',
      title: 'Linux to Cloud',
      blurb: 'Linux, Docker, Kubernetes, networking, Git, CI/CD and Terraform, with a deep Azure track, then SRE, security and platform engineering.'
    },
    {
      id: 'lld',
      title: 'Low-Level Design',
      blurb: 'OOP, SOLID and design patterns up to classic interview problems. Every example is written twice: in Python and in C#.'
    }
  ],
  // The unit word for a curriculum's children (lld is a flat course of topics).
  unitFor: (id) => (id === 'lld' ? 'topics' : 'tracks'),
  meta: (id, c, unit) => (c.written < c.modules
    ? `${fmt(c.written)} of ${fmt(c.modules)} modules written · ${c.tracks} ${unit}`
    : `${fmt(c.modules)} modules · ${c.tracks} ${unit}`)
};

export const FRESH = {
  heading: 'New in GenAI',
  sub: 'The GenAI curriculum is being written in the open. These are the newest tracks.',
  curriculum: 'genai',
  finishedShown: 2, // how many of the most recently finished tracks to feature
  meta: (t) => (t.written === t.modules ? `${t.modules} modules` : `${t.written} of ${t.modules} written`)
};

export const INSIDE = {
  heading: 'What is in a module',
  sub: 'Most modules include these. Interview questions are in the newer modules and are being added to the rest.',
  items: [
    ['Runnable code', 'Examples you can copy, run and change, with the real output shown.'],
    ['Diagrams', 'The picture of how the pieces fit, drawn next to the explanation.'],
    ['Exercises with answers', 'Try it first; the answer is one click away, with the reasoning.'],
    ['Quizzes and projects', 'A short check at the end, and a small build to apply it.'],
    ['Interview questions', 'What a strong answer covers, so you can explain it out loud.'],
    ['Primary sources', 'Links to the spec, paper or official docs behind every claim.']
  ]
};

export const ACCOUNT = {
  heading: 'Keep your place',
  body: 'Reading never needs an account. Sign in with Google to sync your progress, notes and bookmarks across devices, and to comment on modules.',
  note: 'Until you sign in, your progress is kept on this device.'
};

export const OPEN_SOURCE = {
  heading: 'Built in the open',
  body: (modules, license) => `Everything here is ${license} licensed.${modules && modules.planned > 0 ? ` ${fmt(modules.planned)} planned modules are waiting for an author.` : ''} Write one, fix a typo, or suggest a better way to organise it.`,
  primaryLabel: 'Write a module',
  secondaryLabel: 'View on GitHub'
};
