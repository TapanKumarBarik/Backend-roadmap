#!/usr/bin/env node
/**
 * Scaffold System Design tracks + planned lesson stubs for every video-phase
 * course that does not already live under content/system-design/.
 *
 * Safe to re-run: never overwrites an existing README.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const videos = JSON.parse(fs.readFileSync(path.join(root, 'content', 'videos.json'), 'utf8'));

const TRACKS = [
  {
    dir: '03-api-design',
    title: 'API Design',
    phase: 'Phase 2',
    playlist: 'https://www.youtube.com/playlist?list=PLEBaLYrJs0lI',
    prefixes: ['SD-C'],
    blurb:
      'REST, GraphQL, gRPC, resource modeling, versioning, pagination, idempotency, rate limiting, authn/authz, gateways, retries, webhooks and contracts — the API surface every system design answer draws.',
  },
  {
    dir: '04-databases',
    title: 'Databases',
    phase: 'Phase 2',
    playlist: 'https://www.youtube.com/playlist?list=PLEBaLYrJs0lI',
    prefixes: ['SD-E'],
    blurb:
      'Relational model, indexes, ACID, isolation, NoSQL families, replication, sharding, distributed IDs, migrations, CDC and how to choose a store from access patterns.',
  },
  {
    dir: '05-estimation-and-numbers',
    title: 'Estimation and Numbers',
    phase: 'Phase 2',
    playlist: 'https://www.youtube.com/playlist?list=PLEBaLYrJs0lI',
    prefixes: ['SD-D'],
    blurb:
      'Back-of-the-envelope math for interviews: traffic, storage, bandwidth, cache, instances, growth, diagrams, bottlenecks and SPOFs.',
  },
  {
    dir: '06-load-balancing',
    title: 'Load Balancing',
    phase: 'Phase 3',
    playlist: 'https://www.youtube.com/playlist?list=PLWDD-HPgiAnA',
    prefixes: ['SD-G'],
    blurb:
      'What a load balancer does, L4 vs L7, algorithms, health checks, sticky sessions, TLS termination, DNS LB, global LB and autoscaling signals.',
  },
  {
    dir: '07-caching',
    title: 'Caching',
    phase: 'Phase 3',
    playlist: 'https://www.youtube.com/playlist?list=PLWDD-HPgiAnA',
    prefixes: ['SD-F'],
    blurb:
      'Where to cache, hit ratio, cache-aside, write-through, TTLs, eviction, stampedes, Redis patterns and the failure modes interviewers probe.',
  },
  {
    dir: '08-performance-and-traffic',
    title: 'Performance and Traffic',
    phase: 'Phase 3',
    playlist: 'https://www.youtube.com/playlist?list=PLWDD-HPgiAnA',
    prefixes: ['SD-J'],
    blurb:
      'Stateless design, scaling stateful services, CDN edges, connection reuse, backpressure and a practical make-it-faster strategy.',
  },
  {
    dir: '09-distributed-systems',
    title: 'Distributed Systems',
    phase: 'Phase 4',
    playlist: 'https://www.youtube.com/playlist?list=PLTQZUTpyfa_k',
    prefixes: ['SD-H'],
    blurb:
      'Why distribute, partial failures, partitions, consensus, clocks, idempotency, outbox, sagas, consistency models and the traps that show up on the whiteboard.',
  },
  {
    dir: '10-messaging',
    title: 'Messaging',
    phase: 'Phase 4',
    playlist: 'https://www.youtube.com/playlist?list=PLTQZUTpyfa_k',
    prefixes: ['SD-I'],
    blurb:
      'Brokers vs streams, delivery semantics, ordering, DLQs, Kafka fundamentals, cloud queues and pub/sub fan-out.',
  },
  {
    dir: '11-reliability-and-sre',
    title: 'Reliability and SRE',
    phase: 'Phase 5',
    playlist: 'https://www.youtube.com/playlist?list=PLNdzHik9GD0I',
    prefixes: ['SD-K'],
    blurb:
      'Availability math, SLIs/SLOs/SLAs, error budgets, retries, circuit breakers, bulkheads, chaos and static stability.',
  },
  {
    dir: '12-architecture-patterns',
    title: 'Architecture Patterns',
    phase: 'Phase 5',
    playlist: 'https://www.youtube.com/playlist?list=PLNdzHik9GD0I',
    prefixes: ['SD-L'],
    blurb:
      'Monolith vs microservices, modular monolith, event-driven design, CQRS, BFF, cells, and when not to split.',
  },
  {
    dir: '13-security',
    title: 'Security',
    phase: 'Phase 5',
    playlist: 'https://www.youtube.com/playlist?list=PLNdzHik9GD0I',
    prefixes: ['SD-M'],
    blurb:
      'Authn vs authz, sessions, tokens, OAuth/OIDC, secrets, threat modeling, supply chain and the security questions that land in design rounds.',
  },
  {
    dir: '14-observability-and-delivery',
    title: 'Observability and Delivery',
    phase: 'Phase 5',
    playlist: 'https://www.youtube.com/playlist?list=PLNdzHik9GD0I',
    prefixes: ['P5-SD-N'],
    blurb:
      'Logs, metrics, traces, structured logging, alerting, canaries, feature flags and shipping safely.',
  },
  {
    dir: '15-storage',
    title: 'Storage',
    phase: 'Phase 6',
    playlist: 'https://www.youtube.com/playlist?list=PLbu9hGadb_zQ',
    prefixes: ['SD-O'],
    blurb:
      'Object, block and file storage, tiers, IOPS, backups, archival and the storage choices that show up in specialized designs.',
  },
  {
    dir: '16-search',
    title: 'Search',
    phase: 'Phase 6',
    playlist: 'https://www.youtube.com/playlist?list=PLbu9hGadb_zQ',
    prefixes: ['SD-P'],
    blurb:
      'Full-text search, inverted indexes, relevance, indexing pipelines and scaling search to high QPS.',
  },
  {
    dir: '17-realtime-and-data',
    title: 'Real-Time and Data',
    phase: 'Phase 6',
    playlist: 'https://www.youtube.com/playlist?list=PLbu9hGadb_zQ',
    prefixes: ['SD-Q'],
    blurb:
      'Chat routing, presence, notifications, feeds, top-K and the real-time patterns interviewers love.',
  },
  {
    dir: '18-multi-tenant-saas',
    title: 'Multi-Tenant SaaS',
    phase: 'Phase 6',
    playlist: 'https://www.youtube.com/playlist?list=PLbu9hGadb_zQ',
    prefixes: ['SD-R'],
    blurb:
      'Tenant isolation, shared vs dedicated data, noisy neighbors, routing and deployment stamps.',
  },
  {
    dir: '19-cloud-and-platform',
    title: 'Cloud and Platform',
    phase: 'Phase 6',
    playlist: 'https://www.youtube.com/playlist?list=PLbu9hGadb_zQ',
    prefixes: ['SD-V'],
    blurb:
      'IaaS/PaaS/FaaS, regions and AZs, IAM, networking, cost, scheduling and green software.',
  },
  {
    dir: '20-ai-and-genai-system-design',
    title: 'AI and GenAI System Design',
    phase: 'Phase 7',
    playlist: 'https://www.youtube.com/playlist?list=PLUzoYXMCrSX4',
    prefixes: ['SD-S'],
    blurb:
      'LLM app architecture, prompts, RAG, serving, cost, agents, safety, evaluation and privacy for GenAI systems.',
  },
  {
    dir: '21-interview-framework',
    title: 'Interview Framework',
    phase: 'Phase 8',
    playlist: 'https://www.youtube.com/playlist?list=PLCa3R_S2yPGI',
    prefixes: ['SD-T'],
    blurb:
      'How to structure 45 minutes: clarify, estimate, design, deep-dive, trade-offs, and what changes from senior to staff.',
  },
  {
    dir: '22-interview-design-problems',
    title: 'Interview Design Problems',
    phase: 'Phase 8',
    playlist: 'https://www.youtube.com/playlist?list=PLCa3R_S2yPGI',
    prefixes: ['SD-U'],
    blurb:
      'Full mock interviews — URL shortener, rate limiter, chat, feed, search, rides, AI agents, multi-tenant SaaS and more — walked end to end.',
  },
  {
    dir: '23-revision-and-mock-interviews',
    title: 'Revision and Mock Interviews',
    phase: 'Phase 9',
    playlist: 'https://www.youtube.com/playlist?list=PLY0eWXEZNuF8',
    prefixes: ['SD-W'],
    blurb:
      'Numbers to memorize, topic revision sheets, weak-area loops and a final readiness checklist.',
  },
];

function slugFromTitle(title, n) {
  let t = String(title || '')
    .replace(/\s*\|\s*.*$/, '')
    .replace(/\s*:\s*.*$/, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  if (t.length > 60) t = t.slice(0, 60).replace(/-+$/g, '');
  if (!t) t = `lesson-${String(n).padStart(2, '0')}`;
  return `${String(n).padStart(2, '0')}-${t}`;
}

function lessonsFor(prefixes) {
  const out = [];
  for (const vid of videos.videos || []) {
    const lesson = vid.lesson || '';
    const hit = prefixes.some((p) => lesson === p || lesson.startsWith(`${p}-`));
    if (!hit) continue;
    const m = lesson.match(/(\d+)$/);
    const n = m ? parseInt(m[1], 10) : out.length + 1;
    out.push({ ...vid, n });
  }
  out.sort((a, b) => a.n - b.n || (a.number || 0) - (b.number || 0));
  // de-dupe by lesson id
  const seen = new Set();
  return out.filter((x) => {
    const key = x.lesson || `${x.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stubBody({ title, trackTitle, trackDir, lessonId, nextRel }) {
  const nextLine = nextRel
    ? ` · Next: [${nextRel.label}](../${nextRel.slug}/README.md)`
    : '';
  return `# ${title}

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track: ${trackTitle}](../README.md) in the [System Design Interview Prep](../../README.md) course. The matching video is already on the channel (${lessonId}); the short written lecture (diagram, code, exercises, interview answers) lands here next.

**After this lesson you will be able to:** Explain the idea the way an interviewer expects, draw it on a whiteboard, and name the trade-offs.

## What it will cover

- The precise definition and what people confuse it with
- Where it sits in a real architecture
- The numbers, failure modes and mitigations that show up in interviews
- A short production-shaped example

## Interview angle

Open the video while this page is marked *Soon*. When the notes ship, they follow the same 16-point System Design lecture standard as Phase 1 (Core Fundamentals).

---

Track overview: [Track: ${trackTitle}](../README.md)${nextLine}
`;
}

function trackReadme({ track, lessons, rows }) {
  const table = rows
    .map(
      (r) =>
        `| ${r.num} | [${r.title}](${r.slug}/README.md) | ${r.oneLiner} | *Soon* |`,
    )
    .join('\n');
  const first = rows[0];
  return `# Track: ${track.title}

${track.blurb}

Part of **${track.phase}** on the [YouTube playlist](${track.playlist}). Every lecture already has a video; the written short-lecture notes for this track are being published one at a time. Until then each lesson is marked *Soon* in the sidebar — open it to see what it will cover.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- When a written lecture lands, the *Soon* marker clears and the notes appear under the video.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
${table}

Start here → [${first.title}](${first.slug}/README.md)

Back to the course index: [../README.md](../README.md)
`;
}

function oneLiner(title) {
  const cleaned = String(title || '')
    .replace(/\s*\|\s*.*$/, '')
    .trim();
  if (cleaned.length <= 90) return cleaned;
  return `${cleaned.slice(0, 87)}…`;
}

let createdTracks = 0;
let createdLessons = 0;
let skipped = 0;

for (const track of TRACKS) {
  const trackDir = path.join(root, 'content', 'system-design', track.dir);
  fs.mkdirSync(trackDir, { recursive: true });

  const lessons = lessonsFor(track.prefixes);
  if (!lessons.length) {
    console.warn(`No videos for ${track.dir} (${track.prefixes.join(',')})`);
    continue;
  }

  const rows = lessons.map((vid) => {
    const slug = slugFromTitle(vid.title, vid.n);
    const title =
      String(vid.title || '')
        .replace(/\s*\|\s*.*$/, '')
        .trim() || `Lesson ${vid.n}`;
    return {
      num: String(vid.n).padStart(2, '0'),
      slug,
      title: title.length > 70 ? `${title.slice(0, 67)}…` : title,
      oneLiner: oneLiner(title),
      lessonId: vid.lesson || '—',
      fullTitle: title,
    };
  });

  // lesson stubs
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const lessonDir = path.join(trackDir, r.slug);
    fs.mkdirSync(lessonDir, { recursive: true });
    const readme = path.join(lessonDir, 'README.md');
    if (fs.existsSync(readme)) {
      skipped++;
      continue;
    }
    const next = rows[i + 1]
      ? { slug: rows[i + 1].slug, label: rows[i + 1].title }
      : null;
    fs.writeFileSync(
      readme,
      stubBody({
        title: r.fullTitle,
        trackTitle: track.title,
        trackDir: track.dir,
        lessonId: r.lessonId,
        nextRel: next,
      }),
      'utf8',
    );
    createdLessons++;
  }

  const trackReadmePath = path.join(trackDir, 'README.md');
  if (!fs.existsSync(trackReadmePath)) {
    fs.writeFileSync(trackReadmePath, trackReadme({ track, lessons, rows }), 'utf8');
    createdTracks++;
  } else {
    // refresh track index if it still looks like a scaffold (optional: always refresh track README)
    const existing = fs.readFileSync(trackReadmePath, 'utf8');
    if (existing.includes('marked *Soon* in the sidebar') || existing.includes('has not been written yet')) {
      fs.writeFileSync(trackReadmePath, trackReadme({ track, lessons, rows }), 'utf8');
    } else {
      skipped++;
    }
  }
}

console.log(
  JSON.stringify(
    {
      createdTracks,
      createdLessons,
      skipped,
      tracks: TRACKS.length,
    },
    null,
    2,
  ),
);
