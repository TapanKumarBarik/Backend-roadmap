#!/usr/bin/env node
// One-off maintainer tool: sets up the GitHub repo to welcome contributors —
// labels, a set of well-described starter issues, and (optionally) the repo's
// description, topics and Discussions.
//
// Issues about modules are GENERATED from the repo (which modules are still
// placeholders, which lack "Further reading & sources"), so their lists and
// counts are never stale.
//
//   node scripts/seed-github.mjs                       dry run: print the plan, create nothing
//   node scripts/seed-github.mjs --preview <dir>       dry run + write every issue body to <dir>/*.md to read
//   GITHUB_TOKEN=... node scripts/seed-github.mjs --apply             create labels + issues
//   GITHUB_TOKEN=... node scripts/seed-github.mjs --apply --settings  ...and set description, topics, Discussions
//
// The token needs, on this repo: Issues (write) — and Administration (write)
// for --settings. A fine-grained token limited to this one repo is enough.
// Re-running is safe: an issue whose title already exists (open or closed) and
// a label that already exists are skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.GITHUB_REPOSITORY || 'TapanKumarBarik/Backend-roadmap';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BLOB = `https://github.com/${REPO}/blob/main`;
const SITE = 'https://backendroadmap.com';
const PLACEHOLDER = 'has not been written yet';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const SETTINGS = args.includes('--settings');
const previewDir = args.includes('--preview') ? args[args.indexOf('--preview') + 1] : null;

// ───────────────────────────── repo scanning ──────────────────────────────
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const dirs = (rel) => fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const title = (md, fallback) => (md.match(/^#\s+(.+?)\s*$/m) || [, fallback])[1];
const link = (rel, text) => `[${text}](${BLOB}/${rel.split('/').map(encodeURIComponent).join('/')})`;

function modulesOf(track) {
  return dirs(track).map((d) => {
    const file = `${track}/${d}/README.md`;
    return exists(file) ? { dir: d, file, md: read(file) } : null;
  }).filter(Boolean);
}
const isPlaceholder = (md) => md.split('\n', 25).join('\n').includes(PLACEHOLDER);
const hasFurtherReading = (md) => /^#{2,3}\s.*further reading/im.test(md);
const shortTitle = (m) => title(m.md, m.dir).replace(/^(Module|Track)\s+\d+\s*[:\-–—]\s*/i, '');

// the topics sentence for a genai track, from the table in genai/README.md
function genaiTopics(num) {
  const row = read('genai/README.md').split('\n').find((l) => l.startsWith(`| ${num} |`));
  return row ? row.split('|')[3].trim() : '';
}

// ───────────────────────────── shared text ────────────────────────────────
const HOW_TO_WRITE = `**How to write a module**
1. Read the [module recipe](https://github.com/${REPO}#what-a-great-module-looks-like) and [CONTRIBUTING.md](${BLOB}/CONTRIBUTING.md).
2. Read the track's \`README.md\` (scope and order) and the module before yours, so yours continues from it.
3. Replace the placeholder file's content entirely. Run every command and snippet yourself, and finish with real, authoritative *Further reading & sources*.
4. Open one pull request per module. A draft PR early is welcome.

Not sure about something? Ask here — there are no silly questions.`;

const SOURCES_HELP = `**What counts as a good source:** primary and authoritative — official documentation, RFCs, papers, the project's own repo or design docs, well-known conference talks. Not blog roundups or listicles.

**Format** (one line each, explaining why the module cites it):
\`\`\`markdown
- [Exact Title](https://example.com/primary-source) - what it is and why this module cites it.
\`\`\`

Add it as a \`## Further reading & sources\` section just before \`## Next\`. Open one PR per track (or per few modules) — whichever you prefer.`;

// ─────────────────────────── issues (generated) ───────────────────────────
const issues = [];
const add = (i) => issues.push({ labels: [], ...i });

// 0. the welcome thread
add({
  title: 'Start here: say hi and tell us what you’d like to work on',
  labels: ['welcome', 'help wanted'],
  body: `**Welcome! 👋** Backend Roadmap is a free, open-source curriculum that anyone can help build — you don't need to be an expert, and learning while you contribute is exactly the point.

**Comment below with the area you'd like to work on** (and anything about your background that helps us point you at the right thing). Some areas:

- ✍️ **Write a module** — 210 are waiting; see the [GenAI issues](https://github.com/${REPO}/issues?q=is%3Aissue+is%3Aopen+label%3Aclaim-a-module)
- 🔧 **Improve an existing module** — fix, clarify, deepen, add exercises or sources
- 🧪 **Tests, accessibility, performance** for the app
- 🎨 **UI / UX and learning-experience ideas**
- ☁️ **DevOps / infra** — backups, CI, tooling
- 🏗️ **Architecture ideas** — [open an RFC](https://github.com/${REPO}/issues/new?template=rfc.yml)

**Good first issues:** [filter here](https://github.com/${REPO}/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). New to open source? The easiest start is the **Edit this page on GitHub** link at the bottom of any module on [${SITE.replace('https://', '')}](${SITE}).

Everything is explained in the [README](https://github.com/${REPO}#contribute) and [CONTRIBUTING.md](${BLOB}/CONTRIBUTING.md). We follow a [Code of Conduct](${BLOB}/CODE_OF_CONDUCT.md).`
});

// 1. genai: one issue per track that still has unwritten modules
for (const t of dirs('genai').filter((d) => /^\d\d-/.test(d))) {
  const mods = modulesOf(`genai/${t}`);
  const open = mods.filter((m) => isPlaceholder(m.md));
  if (!open.length) continue;
  const num = t.slice(0, 2);
  const trackTitle = title(read(`genai/${t}/README.md`), t).replace(/^Track\s+\d+\s*:\s*/i, '');
  add({
    title: `Write genai/${t} — ${open.length} modules need an author`,
    labels: ['claim-a-module', 'content', 'track:genai', 'help wanted', 'hacktoberfest'],
    body: `**Track ${num}: ${trackTitle}** has **${open.length} modules that are placeholders** (their README says *“Content for this module has not been written yet.”*).

**What this track covers:** ${genaiTopics(num)}

**To take some:** comment below with the module numbers you'll write (e.g. “I'll take 01 and 02”), so nobody duplicates work. Then open one PR per module. Claim as many as you like — or all of them.

**Modules** (tick as they merge):
${open.map((m) => `- [ ] ${link(m.file, shortTitle(m))}`).join('\n')}

${HOW_TO_WRITE}

Overview of the whole GenAI curriculum: ${link('genai/README.md', 'genai/README.md')}.`
  });
}

// 2. "Further reading & sources" — learn/ tracks, grouped three at a time
const learnTracks = dirs('learn').filter((d) => /^\d\d-/.test(d)).map((t) => ({
  t, missing: modulesOf(`learn/${t}`).filter((m) => !hasFurtherReading(m.md))
})).filter((x) => x.missing.length);
for (let i = 0; i < learnTracks.length; i += 3) {
  const group = learnTracks.slice(i, i + 3);
  const total = group.reduce((n, g) => n + g.missing.length, 0);
  const range = group.length > 1 ? `${group[0].t.slice(0, 2)}–${group[group.length - 1].t.slice(0, 2)}` : group[0].t.slice(0, 2);
  add({
    title: `Add “Further reading & sources” to learn/ tracks ${range} (${total} modules)`,
    labels: ['good first issue', 'content', 'track:learn', 'help wanted', 'hacktoberfest'],
    body: `Every module should end with **Further reading & sources**: a few real, authoritative links, each with a one-line reason. These ${total} modules don't have the section yet. It's a great first contribution — you need to judge a good source, not be a deep expert.

${SOURCES_HELP}

**Modules**
${group.map((g) => `\n**${g.t}**\n${g.missing.map((m) => `- [ ] ${link(m.file, shortTitle(m))}`).join('\n')}`).join('\n')}

Comment below to say which track you're taking so others pick a different one.`
  });
}

// 3. backend and lld — same idea, one issue each
for (const track of ['backend', 'lld']) {
  const tracks = track === 'lld' ? [{ t: '', mods: modulesOf('lld') }] : dirs('backend').filter((d) => /^\d\d-/.test(d)).map((t) => ({ t, mods: modulesOf(`backend/${t}`) }));
  const missing = tracks.map((x) => ({ t: x.t, mods: x.mods.filter((m) => !hasFurtherReading(m.md)) })).filter((x) => x.mods.length);
  const total = missing.reduce((n, g) => n + g.mods.length, 0);
  if (!total) continue;
  add({
    title: `Add “Further reading & sources” to ${total} ${track}/ modules`,
    labels: ['good first issue', 'content', `track:${track}`, 'help wanted', 'hacktoberfest'],
    body: `${total} ${track}/ modules are missing the **Further reading & sources** section every module should end with.

${SOURCES_HELP}

**Modules**
${missing.map((g) => `${g.t ? `\n**${g.t}**\n` : ''}${g.mods.map((m) => `- [ ] ${link(m.file, shortTitle(m))}`).join('\n')}`).join('\n')}

Comment below with what you're taking.`
  });
}

// ─────────────────────── issues (app, tooling, ideas) ─────────────────────
// `refs` are files the text points at; the script refuses to run if one is
// missing, so these descriptions can't silently rot.
const staticIssues = [
  {
    title: 'Add unit tests for the markdown pipeline (Vitest)',
    labels: ['good first issue', 'testing', 'app', 'help wanted', 'hacktoberfest'],
    refs: ['webapp/src/lib/curriculum/moduleUrl.js', 'webapp/src/lib/markdown/rewriteLinks.js', 'webapp/src/lib/markdown/contentBlocks.js', 'webapp/package.json'],
    body: `The app has **no automated tests** yet. A small, well-contained place to start: the pure functions in \`webapp/src/lib/\`.

**Scope for a first PR**
- Add [Vitest](https://vitest.dev) to \`webapp/\` (\`npm test\`)
- Test \`moduleUrl.js\` — \`moduleUrl\`, \`fileFromPathname\`, \`routeUrl\` (round-trips, encoded characters, non-README files)
- Test \`resolvePath\` in \`rewriteLinks.js\` (\`..\`, \`.\`, nested paths)
- Test \`renderBlocks\` in \`contentBlocks.js\` for each of the seven block types

Later PRs can add tests for \`tabs.js\`, \`markdown.js\` and the tree helpers in \`lib/curriculum/\`. Add the test command to \`.github/workflows/pr-check.yml\` so it runs on every PR.`
  },
  {
    title: 'Add API tests (Hono’s app.request + a fake D1)',
    labels: ['testing', 'api', 'help wanted'],
    refs: ['api/app.js', 'api/lib/d1.js', 'api/routes/study.js'],
    body: `The API (\`api/\`) is a Hono app, which makes it easy to test: \`app.request('/api/auth/me', {}, env)\` runs a request in-process with no server.

The missing piece is a stand-in for D1 (\`env.DB\`) — a small fake over \`better-sqlite3\` or an in-memory SQLite that runs [\`api/schema.sql\`](${BLOB}/api/schema.sql) is enough.

**Scope**
- A test harness (Vitest) with a fake \`env.DB\` and \`SESSION_SECRET\`
- Cover the security-critical paths first: sessions (\`api/lib/session.js\`), admin guards (\`api/lib/admin.js\`), \`/api/auth/*\`
- Then the study routes (bookmarks, notes, progress) and rate limiting (\`api/lib/rateLimit.js\`)

Run it from \`npm run check\` / the PR workflow once it's stable.`
  },
  {
    title: 'Accessibility audit of the module page (and fix what you find)',
    labels: ['accessibility', 'app', 'help wanted', 'hacktoberfest'],
    refs: ['webapp/src/components/article/ArticleView.jsx', 'webapp/src/components/layout/Sidebar.jsx'],
    body: `Learners use keyboards, screen readers and zoom. Let's make sure the module page works for all of them.

**Scope**
- Run axe DevTools and Lighthouse on a module page (e.g. [this one](${SITE}/backend/01-request-response-fundamentals/00-system-overview-and-request-flow/)) in light and dark mode
- Check keyboard-only navigation: sidebar tree, command palette (Ctrl+K), the pager, comments, focus order and visible focus
- Check heading structure, link text, colour contrast, and \`aria\` labels on icon buttons
- Fix what you find, or file one issue per finding

Start in \`webapp/src/components/article/ArticleView.jsx\` and \`webapp/src/components/layout/\`. Please attach before/after screenshots or the audit output.`
  },
  {
    title: 'Check the app on small phones (320–360px) and fix layout bugs',
    labels: ['good first issue', 'app', 'help wanted', 'hacktoberfest'],
    refs: ['webapp/src/styles/global.css'],
    body: `Many learners read on a phone. Open the site at **320, 360 and 390px** wide (browser devtools are fine), light and dark, and look for anything cut off, overlapping, too small to tap, or scrolling sideways — module pages with wide tables or code, the sidebar drawer, the bottom navigation, the feed and workspace.

Fix what you find in \`webapp/src/styles/global.css\` (mobile rules live under the \`@media (max-width: 860px)\` blocks), or file one issue per bug with a screenshot. Please attach before/after screenshots to your PR.`
  },
  {
    title: 'Reduce JavaScript bundle size (code-splitting audit)',
    labels: ['performance', 'app', 'help wanted'],
    refs: ['webapp/vite.config.js', 'webapp/src/App.jsx'],
    body: `\`npm run build\` warns that several chunks exceed 500 kB (the workspace editor, Mermaid diagram chunks). Most are already lazy-loaded, but nobody has measured what actually loads on a typical module page.

**Scope**
- Measure what a first visit to a module page downloads (devtools network panel + \`rollup-plugin-visualizer\`)
- Find avoidable weight on that path (e.g. libraries pulled into the main bundle) and fix it via \`manualChunks\` / dynamic imports in \`webapp/vite.config.js\` and \`webapp/src/App.jsx\`
- Report before/after numbers in the PR

Goal: a faster first load on slow connections, with no change in behaviour.`
  },
  {
    title: 'Suggestion status tracking (planned / in progress / done)',
    labels: ['enhancement', 'app', 'api', 'help wanted'],
    refs: ['api/routes/community.js', 'api/schema.sql', 'webapp/src/components/community/SuggestionsView.jsx', 'ROADMAP.md'],
    body: `The public suggestions board is a plain upvote-sorted list. [ROADMAP.md](${BLOB}/ROADMAP.md) lists status tracking as not built yet.

**Scope**
- Add a \`status\` column to \`suggestions\` in [\`api/schema.sql\`](${BLOB}/api/schema.sql) (and a migration for the existing database)
- Let admins set it (planned / in progress / done / declined) — endpoint in \`api/routes/community.js\`, admin-guarded (every \`isAdmin\` call must be \`await\`ed; \`npm run check\` enforces it)
- Show it as a badge in \`SuggestionsView.jsx\`, and let people filter by status

Open an issue comment with your approach before starting, since this touches the database.`
  },
  {
    title: 'Scheduled backups of the D1 database',
    labels: ['infra', 'api', 'help wanted'],
    refs: ['api/schema.sql', 'wrangler.jsonc'],
    body: `The database lives in Cloudflare D1. The previous (Azure) version had a nightly backup to blob storage with 14-day retention; that wasn't carried over, and today the only safety net is D1's built-in Time Travel.

Cloudflare Pages Functions can't run on a cron schedule, so this needs a small separate **Worker with a Cron Trigger** that exports the tables (or calls D1's export API) to storage — Azure Blob with the existing backups SAS token, or R2 — and prunes old snapshots.

**Scope:** design + implement it (a new folder is fine), document how to deploy and restore, and make sure no secrets are committed. Please outline your approach in a comment first.`
  },
  {
    title: 'Describe the API with OpenAPI',
    labels: ['docs', 'api', 'help wanted'],
    refs: ['api/app.js', 'api/routes/feed.js', 'webapp/src/lib/api.js'],
    body: `The API (\`api/routes/*\`) has no machine-readable description. An OpenAPI document would make it easier for contributors to understand and test.

**Scope**
- Write \`api/openapi.yaml\` covering the public and signed-in endpoints (the client in [\`webapp/src/lib/api.js\`](${BLOB}/webapp/src/lib/api.js) lists them all)
- Note which endpoints need a session and which need admin
- Optional follow-ups: render it as docs, or validate responses against it in tests

A good first task: document one route file (e.g. \`feed.js\`) as a PR, and agree the conventions before doing the rest.`
  },
  {
    title: 'Validate modules in CI (required sections, links, code-fence languages)',
    labels: ['tooling', 'content', 'help wanted'],
    refs: ['scripts/check-admin-guards.js', '.github/workflows/pr-check.yml', 'CONTRIBUTING.md'],
    body: `Every module should follow the [module recipe](https://github.com/${REPO}#what-a-great-module-looks-like). Today nothing checks that, so quality depends on reviewer attention.

**Scope:** a script (e.g. \`scripts/check-content.js\`) that reports, for changed or all modules: a missing H1, a missing *Further reading & sources* or *Next* section, a *Next* link that doesn't resolve, broken relative links, code fences without a language tag, and placeholder text left in a finished module.

Existing modules won't all pass, so start as **warnings**, or check only files changed in the PR (\`git diff --name-only origin/main\`), then wire it into \`.github/workflows/pr-check.yml\` and \`npm run check\`. See [CONTRIBUTING.md](${BLOB}/CONTRIBUTING.md) for the house rules to encode.`
  },
  {
    title: 'Find and fix broken external links in “Further reading” sections',
    labels: ['good first issue', 'tooling', 'content', 'help wanted', 'hacktoberfest'],
    refs: ['CONTRIBUTING.md'],
    body: `Hundreds of modules cite external sources, and links rot. Run a link checker (e.g. [lychee](https://github.com/lycheeverse/lychee)) over \`backend/\`, \`learn/\`, \`genai/\` and \`lld/\`, then:

- fix links that moved (find the new URL), or replace dead ones with an equivalent authoritative source
- send your fixes as small PRs (one track at a time is easiest to review)

Bonus: add the link check as a scheduled GitHub Action that opens an issue when links break.`
  },
  {
    title: 'Show a “last updated” date on each module (from git history)',
    labels: ['enhancement', 'app', 'help wanted'],
    refs: ['scripts/prerender.mjs', 'webapp/src/components/article/ArticleView.jsx'],
    body: `The module page used to show a "Published" date from the site's build time, which was misleading — every module claimed the same date. It was removed (see the comment in \`ArticleView.jsx\`) because a real per-file date needs git history.

**Scope:** at build time, get each file's last-modified date (\`git log -1 --format=%cI -- <file>\`), then use it for:
- \`<lastmod>\` in the sitemap (\`scripts/prerender.mjs\`)
- a "Last updated" line on the module page

Note CI checks out the repo — make sure the checkout has history (\`fetch-depth: 0\`) or the dates will all be the same.`
  },
  {
    title: 'Generate an RSS/Atom feed of new and updated modules',
    labels: ['enhancement', 'app', 'help wanted'],
    refs: ['scripts/prerender.mjs'],
    body: `Let people subscribe to new modules. At build time, \`scripts/prerender.mjs\` already walks every module and writes the sitemap; extend it (or add a sibling script) to emit \`dist/feed.xml\` (Atom or RSS 2.0) listing the most recent modules, and add a \`<link rel="alternate" type="application/atom+xml">\` to the page head.

This pairs well with the "last updated" date issue, since a feed needs dates — coordinate with whoever picks that up.`
  },
  {
    title: 'RFC: a content-first framework (Astro or similar) instead of an SPA + pre-render script?',
    labels: ['rfc', 'help wanted'],
    refs: ['scripts/prerender.mjs', 'webapp/vite.config.js'],
    body: `Today the site is one React single-page app, and a build script (\`scripts/prerender.mjs\`) pre-renders every module to its own HTML page for search engines. A content-first framework such as **Astro** could make each module a first-class page, with the interactive parts (progress, comments, notes, workspace) as islands.

This is an open question, not a plan. If you have experience with it, please weigh in using the [RFC template](https://github.com/${REPO}/issues/new?template=rfc.yml): the problem it solves here, the trade-offs, and a migration path that keeps **module URLs and learners' saved progress** working. A small prototype branch is worth a lot.`
  },
  {
    title: 'RFC: a better search story (Pagefind or similar)?',
    labels: ['rfc', 'performance', 'help wanted'],
    refs: ['webapp/src/lib/search/contentSearch.js', 'scripts/gen-search-index.py'],
    body: `Full-text search works by downloading a ~1.6 MB inverted index (\`search-index.json\`, built by \`scripts/gen-search-index.py\`) on the first query and matching in the browser (\`webapp/src/lib/search/contentSearch.js\`).

Is there a better approach — e.g. [Pagefind](https://pagefind.app), which loads small index chunks on demand? Please share an RFC (see the [template](https://github.com/${REPO}/issues/new?template=rfc.yml)) with measurements: download size, time to first result, relevance on real queries, and how it fits the build.`
  },
  {
    title: 'RFC: in-browser code exercises (e.g. Pyodide for the Python / GenAI modules)',
    labels: ['rfc', 'help wanted'],
    refs: ['webapp/src/lib/markdown/enhanceContent.js'],
    body: `Imagine running the Python examples right on the page — editable, with output — so learners experiment without setting anything up. Pyodide (Python in WebAssembly) is one route; there are others.

Open questions: where it hooks into the markdown pipeline (\`webapp/src/lib/markdown/enhanceContent.js\` already enhances code blocks), loading cost, how to mark a block as runnable in the markdown, security, and which modules benefit. Prototype or RFC welcome — see the [template](https://github.com/${REPO}/issues/new?template=rfc.yml).`
  },
  {
    title: 'RFC: a system-design playground / architecture visualisations',
    labels: ['rfc', 'help wanted'],
    refs: [],
    body: `The system-design track teaches trade-offs with diagrams and prose. What would make them *interactive* — e.g. dragging components onto a canvas, simulating load, failure injection, or visualising how a request flows through a cache, a queue and a database?

This is an idea worth designing properly before building. Use the [RFC template](https://github.com/${REPO}/issues/new?template=rfc.yml) to share what you'd build, who it's for, and a small first version.`
  },
  {
    title: 'RFC: translations without forking the curriculum',
    labels: ['rfc', 'help wanted'],
    refs: [],
    body: `Learners around the world could benefit from translated tracks, but ~730 modules is a lot to keep in sync across languages.

How should translations be structured so they don't rot — folder layout and URLs (\`/hi/backend/…\`?), how to detect an out-of-date translation, what the app shows when one is missing, and which tracks to start with? Please share an RFC (see the [template](https://github.com/${REPO}/issues/new?template=rfc.yml)), or if you'd like to translate a track, say so here first.`
  }
];

for (const s of staticIssues) {
  const missing = (s.refs || []).filter((r) => !exists(r));
  if (missing.length) throw new Error(`seed-github: "${s.title}" references missing files: ${missing.join(', ')}`);
  add({ title: s.title, labels: s.labels, body: s.body });
}

// ───────────────────────────────── labels ─────────────────────────────────
const LABELS = {
  'good first issue': ['7057ff', 'Good for newcomers'],
  'help wanted': ['008672', 'Extra attention is welcome'],
  'claim-a-module': ['fbca04', 'A module (or track) that needs an author'],
  hacktoberfest: ['ff7518', 'Eligible for Hacktoberfest'],
  welcome: ['bfd4f2', 'Introductions and getting started'],
  content: ['1d76db', 'Curriculum markdown'],
  'track:genai': ['c5def5', 'GenAI curriculum'],
  'track:learn': ['c5def5', 'Learn (Linux → Cloud) curriculum'],
  'track:backend': ['c5def5', 'Backend curriculum'],
  'track:lld': ['c5def5', 'Low-level design curriculum'],
  app: ['0e8a16', 'The web app'],
  api: ['0e8a16', 'The API'],
  infra: ['5319e7', 'Infrastructure and operations'],
  testing: ['d4c5f9', 'Automated tests'],
  accessibility: ['d4c5f9', 'Accessibility'],
  performance: ['d4c5f9', 'Performance'],
  tooling: ['ededed', 'Build, CI and developer tooling'],
  docs: ['0075ca', 'Documentation'],
  rfc: ['b60205', 'A proposal to discuss'],
  enhancement: ['a2eeef', 'New feature or request']
};

const TOPICS = ['backend', 'backend-development', 'system-design', 'roadmap', 'learning-path', 'curriculum', 'kubernetes', 'docker', 'devops', 'terraform', 'genai', 'rag', 'ai-agents', 'mcp', 'vllm', 'langgraph', 'low-level-design', 'design-patterns', 'education', 'hacktoberfest'];
const DESCRIPTION = 'Free, open-source, hands-on curriculum for backend engineering, system design, cloud/DevOps and GenAI — built in the open. Contributors welcome.';

// ───────────────────────────────── output ─────────────────────────────────
for (const i of issues) for (const l of i.labels) if (!LABELS[l]) throw new Error(`seed-github: unknown label "${l}" on "${i.title}"`);

console.log(`\nPlan for ${REPO}: ${Object.keys(LABELS).length} labels, ${issues.length} issues${SETTINGS ? ', repo settings' : ''}\n`);
for (const [n, i] of issues.entries()) console.log(`${String(n + 1).padStart(2)}. ${i.title}\n      [${i.labels.join(', ')}]`);

if (previewDir) {
  fs.mkdirSync(previewDir, { recursive: true });
  issues.forEach((i, n) => fs.writeFileSync(path.join(previewDir, `${String(n + 1).padStart(2, '0')}.md`), `# ${i.title}\n\nLabels: ${i.labels.join(', ')}\n\n---\n\n${i.body}\n`));
  console.log(`\nWrote ${issues.length} issue previews to ${previewDir}`);
}

if (!APPLY) {
  console.log('\nDry run — nothing was created. Add --apply (with GITHUB_TOKEN set) to create the labels and issues.');
  process.exit(0);
}

// ─────────────────────────────── GitHub calls ─────────────────────────────
const token = process.env.GITHUB_TOKEN;
if (!token) { console.error('\nSet GITHUB_TOKEN to apply.'); process.exit(1); }

async function gh(method, url, body) {
  const res = await fetch(url.startsWith('http') ? url : `https://api.github.com${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'backend-roadmap-seed',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${typeof json === 'string' ? json : json?.message || ''}`);
  return json;
}
async function all(url) {
  const out = [];
  for (let page = 1; ; page++) {
    const batch = await gh('GET', `${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    out.push(...batch);
    if (batch.length < 100) return out;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (SETTINGS) {
  await gh('PATCH', `/repos/${REPO}`, { description: DESCRIPTION, homepage: SITE, has_discussions: true });
  await gh('PUT', `/repos/${REPO}/topics`, { names: TOPICS });
  console.log('\nSettings: description, homepage, Discussions enabled, topics set.');
}

const haveLabels = new Set((await all(`/repos/${REPO}/labels`)).map((l) => l.name.toLowerCase()));
let madeLabels = 0;
for (const [name, [color, description]] of Object.entries(LABELS)) {
  if (haveLabels.has(name.toLowerCase())) continue;
  await gh('POST', `/repos/${REPO}/labels`, { name, color, description });
  madeLabels++; await sleep(300);
}
console.log(`Labels: created ${madeLabels}, ${Object.keys(LABELS).length - madeLabels} already existed.`);

const have = new Set((await all(`/repos/${REPO}/issues?state=all`)).filter((i) => !i.pull_request).map((i) => i.title.trim().toLowerCase()));
let made = 0, skipped = 0;
for (const i of issues) {
  if (have.has(i.title.trim().toLowerCase())) { skipped++; continue; }
  const created = await gh('POST', `/repos/${REPO}/issues`, { title: i.title, body: i.body, labels: i.labels });
  made++; console.log(`  created #${created.number}: ${i.title}`);
  await sleep(1500); // stay well inside GitHub's secondary rate limits
}
console.log(`\nIssues: created ${made}, skipped ${skipped} that already existed.`);
console.log('Tip: pin the "Start here" issue (it is the one to link from your posts).');
