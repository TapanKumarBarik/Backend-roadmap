#!/usr/bin/env node
// Checks content/videos.json against the channel, read-only: nothing is changed, only YouTube's public pages are read.
//
//   npm run videos:audit
//
// It lists what is public in each playlist (the playlist page and its feed), then asks YouTube's oEmbed endpoint about every id in the registry (200: public and embeddable; 403: private or
// scheduled; 404: no such video) and says, in sentences, what the answers mean for the site (scripts/lib/videoAudit.mjs): a public video the registry lacks, a video the site shows that nobody can
// watch, a scheduled video that is already public (the site hides it), and an id attached to the wrong lesson. Run it after uploading or scheduling, and before a push. It exits with 1 when
// something needs fixing, and 0 when the site and the channel agree.
import { loadRegistry } from '../lib/videos.mjs';
import { parseFeed } from '../lib/youtubeFeed.mjs';
import { parsePlaylistPage } from '../lib/youtubePage.mjs';
import { auditVideos } from '../lib/videoAudit.mjs';

const PARALLEL = 6; // oEmbed answers are small; a few at a time keeps a 500-video check to about a minute without hammering YouTube
const TIMEOUT_MS = 15000;
const browser = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', cookie: 'CONSENT=YES+1', 'accept-language': 'en' };
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, headers = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return res.text();
    } catch { /* try again */ }
    await pause(1500);
  }
  return null;
}

/** oEmbed's answer for one id: the status, and the title when it is public. A status of 0 means no answer, so nothing is claimed. */
async function oembed(id) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 200) return { status: 200, title: (await res.json()).title };
      if (res.status === 401 || res.status === 403 || res.status === 404) return { status: res.status };
    } catch { /* try again */ }
    await pause(1000);
  }
  return { status: 0 };
}

const registry = loadRegistry();
if (!registry.videos.length) {
  console.error('videos:audit: content/videos.json lists no videos.');
  process.exit(1);
}

const listed = new Set();
for (const playlist of registry.playlists) {
  const listId = new URL(playlist.url).searchParams.get('list');
  const [feed, page] = [await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=${listId}`), await get(`https://www.youtube.com/playlist?list=${listId}`, browser)];
  for (const entry of feed ? parseFeed(feed) : []) listed.add(entry.id);
  for (const entry of page ? parsePlaylistPage(page) : []) listed.add(entry.id);
}

const checks = new Map();
const queue = registry.videos.map((v) => v.id);
await Promise.all(Array.from({ length: PARALLEL }, async () => {
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    checks.set(id, await oembed(id));
    await pause(80);
  }
}));

const { problems, notes } = auditVideos({ registry, now: Date.now(), listed, checks });
const publicNow = [...checks.values()].filter((c) => c.status === 200).length;
console.log(`videos:audit: ${registry.videos.length} videos in the registry, ${listed.size} listed publicly in the playlists, ${publicNow} public and embeddable now.`);
for (const note of notes) console.log(`  note: ${note}`);
if (problems.length) {
  console.error(`\nvideos:audit: ${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('videos:audit: the registry and the channel agree.');
