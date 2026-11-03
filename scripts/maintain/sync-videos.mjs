#!/usr/bin/env node
// Adds the channel's new videos to content/videos.json, so a new upload is on the site's Videos page the same day.
//
//   npm run videos:sync              add what is new
//   npm run videos:sync -- --dry-run show what would be added, change nothing
//
// It reads each playlist in the registry: the public feed (the newest 15, with full descriptions) and the playlist page (every
// video), then the page of each video the registry lacks. A video already in the registry is never touched, so what you have edited stays. A new
// one is added with its title, upload date, summary and chapters from its description, in the playlist whose feed it
// came from. It is added without a module: say which module it belongs to by hand (docs/VIDEOS.md), then
// `npm run check` confirms the module is there.
import { loadRegistry, saveRegistry } from '../lib/videos.mjs';
import { parseFeed, toUtc, inferLesson } from '../lib/youtubeFeed.mjs';
import { parsePlaylistPage, parseWatchPage } from '../lib/youtubePage.mjs';
import { chapterLine, cleanTitle, firstParagraph, parseChapters } from '../../webapp/src/lib/curriculum/videos.js';

const dryRun = process.argv.includes('--dry-run');
const registry = loadRegistry();
if (!registry.playlists.length) {
  console.error('sync-videos: content/videos.json lists no playlists. Add one ({ "id", "title", "url" }) and run this again.');
  process.exit(1);
}

const known = new Set(registry.videos.map((v) => v.id));
const added = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const browser = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', cookie: 'CONSENT=YES+1', 'accept-language': 'en' };

// YouTube answers 5xx and 404 now and then for no reason; a few tries make a sync a sync.
async function get(url, headers = {}) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res.text();
    if (attempt < 5) await pause(2000);
  }
  return null;
}

for (const playlist of registry.playlists) {
  const listId = new URL(playlist.url).searchParams.get('list');
  // The feed has the newest 15 with their descriptions; the page lists every video (up to a hundred), so a playlist that has grown
  // past 15 is not missed. Either may fail on its own.
  const feed = await get(`https://www.youtube.com/feeds/videos.xml?playlist_id=${listId}`);
  const page = await get(`https://www.youtube.com/playlist?list=${listId}`, browser);
  if (feed === null && page === null) {
    console.error(`sync-videos: neither the feed nor the page of "${playlist.title}" could be read; nothing was changed.`);
    process.exit(1);
  }
  const fromFeed = new Map((feed ? parseFeed(feed) : []).map((e) => [e.id, e]));
  const listed = page ? parsePlaylistPage(page).map((v) => v.id) : [];
  // Oldest first, so the numbers a title does not carry are handed out in upload order. The page lists in playlist order, which
  // is upload order here; the feed's extra entries (not on the page) go after.
  const order = [...new Set([...listed, ...[...fromFeed.keys()].reverse()])];
  for (const id of order) {
    if (known.has(id)) continue;
    /** @type {{ id: string, title: string, published: string, description: string, seconds?: number } | undefined} */
    let entry = fromFeed.get(id);
    if (!entry) {
      await pause(400);
      const watch = parseWatchPage((await get(`https://www.youtube.com/watch?v=${id}`, browser)) || '');
      if (!watch) { console.error(`sync-videos: could not read the page of video ${id}; run it again.`); continue; }
      entry = { id, title: watch.title, published: watch.published, description: watch.description, seconds: watch.seconds };
    }
    known.add(id);
    const { title, number } = cleanTitle(entry.title);
    const taken = registry.videos.filter((v) => v.playlist === playlist.id).map((v) => v.number);
    const chapters = parseChapters(entry.description).map(chapterLine);
    const lesson = inferLesson(entry.description);
    const video = {
      id: entry.id,
      ...(lesson && { lesson }),
      title,
      playlist: playlist.id,
      number: number ?? Math.max(0, ...taken) + 1,
      published: toUtc(entry.published),
      ...(entry.seconds && { seconds: entry.seconds }),
      summary: firstParagraph(entry.description),
      ...(chapters.length && { chapters })
    };
    registry.videos.push(video);
    added.push({ ...video, guessedNumber: number === null });
  }
}

if (!added.length) {
  console.log('sync-videos: nothing new; content/videos.json already lists every recent video.');
} else {
  for (const v of added) {
    console.log(`+ ${v.id}  ${v.playlist} #${v.number}${v.guessedNumber ? ' (number guessed: the title carries none)' : ''}  ${v.title}`);
  }
  if (dryRun) console.log(`\nsync-videos: ${added.length} new video(s); --dry-run, so nothing was written.`);
  else {
    saveRegistry(registry);
    console.log(`\nsync-videos: added ${added.length} video(s) to content/videos.json.`);
    console.log('Next: give each one a "module" (the folder it belongs to, under content/) and run `npm run check`.');
  }
}
