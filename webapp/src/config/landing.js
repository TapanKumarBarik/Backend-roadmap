// Everything the landing page says and links to. components/home/Landing.jsx only lays it out, so changing
// the wording, a path blurb or a route stop means editing this file and nothing else.
// Numbers come from build-time stats (scripts/gen-site-stats.mjs) and are passed to the functions below.
// The learning paths themselves (titles, goals, steps) are in content/paths.json.
import { PATH_COPY, formatDuration } from './paths.js';
import { formatTotal } from '../lib/curriculum/videos.js';

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '');

// What the home page says to search engines and to readers without JavaScript (scripts/lib/homePage.mjs, run by the
// pre-render step): the description under the title in a search result, with the real count, and the line that names
// who is behind the site.
export const HOME_META = {
  description: (modules) => `Free, hands-on curriculum for backend engineering, system design, cloud and GenAI: ${modules ? `${fmt(modules.written)} modules` : 'hundreds of modules'} with runnable code, progress tracking and notes.`,
  credit: (name) => `Created and maintained by ${name}.`
};

// Used only when site-stats.json could not be loaded.
export const FALLBACK_START_FILE = 'backend/01-request-response-fundamentals/00-system-overview-and-request-flow/README.md';

export const HERO = {
  eyebrow: 'Free · Open source · No sign-up to read',
  headline: 'Build the engineering skills that matter.',
  lead: (modules) => `Learn backend development, cloud engineering, GenAI and system design through structured roadmaps, hands-on practice and real-world challenges.${modules ? ` ${fmt(modules.written)} written modules, every one a markdown file in a public repository: read it here, run the code, and fix it if it is wrong.` : ''}`,
  // The primary button starts this learning path (an id from paths.json). If it is missing, it opens
  // FALLBACK_START_FILE instead.
  startPath: 'backend-foundations',
  exploreLabel: 'Explore Learning Paths',
  startLabel: 'Start Learning',
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

// The lessons read most this month (api/routes/popular.js): shown only when there are enough of them to be a real list.
export const POPULAR = {
  heading: 'Popular this month',
  sub: 'What other learners are reading right now.',
  shown: 6,
  minimum: 3,
  meta: (views) => `read ${views} times this month`
};

// The learning paths, as cards. The numbers come from the stats (`stats.paths`).
export const PICK = {
  heading: 'Pick a path',
  sub: 'Each path is a short, ordered route with a finish line, built from the written modules. Pick one and your progress is tracked against it.',
  startLabel: 'Start this path',
  meta: (p) => PATH_COPY.meta(p.modules, formatDuration(p.minutes), p.tracks)
};

// The whole library, one card per curriculum. `id` is the curriculum folder (site.config.json -> content.curricula);
// the numbers come from the stats.
export const LIBRARY = {
  heading: 'Or browse the library',
  sub: 'Every module, grouped by curriculum. The paths above are routes through this.',
  startLabel: (title) => `Start ${title}`,
  tracksLabel: 'See the tracks',
  items: [
    {
      id: 'backend',
      title: 'Backend Engineering',
      blurb: 'HTTP and APIs, authentication, databases, caching, queues, observability and distributed systems, ending in system-design interview practice.'
    },
    {
      id: 'system-design',
      title: 'System Design Interview Prep',
      blurb: 'Short lectures on requirements, scaling, latency, availability, CAP and consistency. Each has a video on YouTube and the written version beside it.'
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
  // What a curriculum's children are called (lld is a flat course of topics, with no tracks).
  unit: (id, n) => (id === 'lld' ? (n === 1 ? 'topic' : 'topics') : (n === 1 ? 'track' : 'tracks')),
  meta: (id, c) => (c.written < c.modules
    ? `${fmt(c.written)} of ${fmt(c.modules)} modules written · ${c.tracks} ${LIBRARY.unit(id, c.tracks)}`
    : `${fmt(c.modules)} modules · ${c.tracks} ${LIBRARY.unit(id, c.tracks)}`)
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

// The channel is the other front door: people who find a video should end up in the module it covers, and people
// who read a module should be able to find the video. The channel's address is in site.config.json; the videos are
// content/videos.json. `sub` and the cards are used when the videos have loaded, `body` when they have not.
export const VIDEO = {
  heading: 'Prefer to watch first?',
  body: 'Short video lectures are on YouTube, and each one plays at the top of the module that covers it. Subscribe to get new ones as they land.',
  sub: (count, seconds) => `${count} short lectures, ${formatTotal(seconds)} in all, are on YouTube already. Each one plays at the top of the module that covers it, so the video and the text are in one place.`,
  all: (count) => `All ${count} videos`,
  label: 'Subscribe on YouTube',
  shown: 4 // how many of the newest videos the landing page shows
};

export const OPEN_SOURCE = {
  heading: 'Built in the open',
  body: (modules, license) => `Everything here is ${license} licensed.${modules && modules.planned > 0 ? ` ${fmt(modules.planned)} planned modules are waiting for an author.` : ''} Write one, fix a typo, or suggest a better way to organise it.`,
  primaryLabel: 'Write a module',
  secondaryLabel: 'View on GitHub'
};
