// Everything the landing page says and links to. components/home/Landing.jsx only lays it out, so changing
// the wording, a path blurb or a route stop means editing this file and nothing else.
// Numbers come from build-time stats (scripts/gen-site-stats.mjs) and are passed to the functions below.
// The learning paths themselves (titles, goals, steps) are in content/paths.json.
import { formatDuration } from './paths.js';
import { AREAS } from './index.js';
import { formatTotal } from '../lib/curriculum/videos.js';

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '');

// What the home page says to search engines and to readers without JavaScript (scripts/lib/homePage.mjs, run by the
// pre-render step): the description under the title in a search result, with the real count, and the line that names
// who is behind the site.
export const HOME_META = {
  description: (modules) => `Free curriculum for backend, low-level design, system design, ML, neural networks, cloud and GenAI: ${modules ? `${fmt(modules.written)} modules` : 'hundreds of modules'} with code, progress and notes.`,
  credit: (name) => `Created and maintained by ${name}.`
};

// Used only when site-stats.json could not be loaded.
export const FALLBACK_START_FILE = 'backend/01-request-response-fundamentals/00-system-overview-and-request-flow/README.md';

export const HERO = {
  eyebrow: 'Free · No sign-up to read',
  headline: 'Build the engineering skills that matter.',
  // Said once, in plain words, and only what is true of every module: the interview questions are in the newer ones (see INSIDE).
  lead: (modules) => `Backend, system design, low-level design, machine learning and GenAI, taught one short lesson at a time with code you can run, diagrams and practice.${modules ? ` ${fmt(modules.written)} modules, written and free to read.` : ''}`,
  // The primary button starts this learning path (an id from paths.json). If it is missing, it opens
  // FALLBACK_START_FILE instead.
  startPath: 'production-core',
  exploreLabel: 'See all learning paths',
  startLabel: 'Start Production Core',
  searchLabel: (modules) => (modules ? `Search ${fmt(modules.written)} modules and topics` : 'Search modules and topics'),
  // The line under the search box: what there is, in numbers that come from the build (the videos from videos.json).
  facts: (modules, videos) => [modules && `${fmt(modules.written)} modules`, videos && `${videos} video lectures`, 'free to read'].filter(Boolean).join(' · ')
};

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
  sub: 'A path is a short, ordered route with a finish line. Choose one and work through it in order.',
  startLabel: 'Start this path',
  // The flagship paths each end in a project; the card names it on one line.
  projectLabel: (title) => `Final project: ${title}`,
  // Short enough to stay on one line in a card, and with no "tracks": that word also means a folder of modules (see docs/SITE_AUDIT_2026-11-21.md).
  meta: (p) => `${p.modules} modules · about ${formatDuration(p.minutes)}`
};

// The whole library, one row per area. The names and the lines about them are site.config.json -> content.areas (the id is the
// curriculum folder); the numbers come from the stats.
export const LIBRARY = {
  heading: 'Or browse by subject',
  sub: 'Every module belongs to one of these areas. The paths above are routes through them.',
  startLabel: (title) => `Start ${title}`,
  tracksLabel: 'See the tracks',
  // The way from here to the working curriculum (the sidebar and your progress), for someone who would rather look around.
  treeLabel: 'Open the full curriculum',
  items: Object.entries(AREAS).map(([id, area]) => ({ id, title: area.label, blurb: area.blurb })),
  // What a curriculum's children are called (lld is a flat course of topics, with no tracks).
  unit: (id, n) => (id === 'lld' ? (n === 1 ? 'topic' : 'topics') : (n === 1 ? 'track' : 'tracks')),
  meta: (id, c) => (c.written < c.modules
    ? `${fmt(c.written)} of ${fmt(c.modules)} modules written · ${c.tracks} ${LIBRARY.unit(id, c.tracks)}`
    : `${fmt(c.modules)} modules · ${c.tracks} ${LIBRARY.unit(id, c.tracks)}`)
};

// Not on the front door (it reads as a brochure there); it is what the page says to search engines and to readers without JavaScript.
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
  heading: 'Spotted a mistake?',
  body: (modules) => `${modules && modules.planned > 0 ? `${fmt(modules.planned)} more modules are on the way. ` : ''}If something is wrong or unclear, tell me and I will fix it, and write what changed on the corrections page.`,
  primaryLabel: 'Email me',
  secondaryLabel: 'Watch on YouTube'
};
