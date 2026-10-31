#!/usr/bin/env node
// Adds the channel's new videos to content/videos.json, so a new upload is on the site's Videos page the same day.
//
//   npm run videos:sync              add what is new
//   npm run videos:sync -- --dry-run show what would be added, change nothing
//
// It reads the public feed of each playlist in the registry (YouTube lists the newest 15 of each, so run it after
// uploading, not once a month). A video already in the registry is never touched, so what you have edited stays. A new
// one is added with its title, upload date, summary and chapters from its description, in the playlist whose feed it
// came from. It is added without a module: say which module it belongs to by hand (docs/VIDEOS.md), then
// `npm run check` confirms the module is there.
import { loadRegistry, saveRegistry } from '../lib/videos.mjs';
import { parseFeed, toUtc, inferLesson } from '../lib/youtubeFeed.mjs';
import { chapterLine, cleanTitle, firstParagraph, parseChapters } from '../../webapp/src/lib/curriculum/videos.js';

const dryRun = process.argv.includes('--dry-run');
const registry = loadRegistry();
if (!registry.playlists.length) {
  console.error('sync-videos: content/videos.json lists no playlists. Add one ({ "id", "title", "url" }) and run this again.');
  process.exit(1);
}

const known = new Set(registry.videos.map((v) => v.id));
const added = [];

for (const playlist of registry.playlists) {
  const listId = new URL(playlist.url).searchParams.get('list');
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${listId}`);
  if (!res.ok) {
    console.error(`sync-videos: the feed of "${playlist.title}" answered ${res.status}; nothing was changed.`);
    process.exit(1);
  }
  // Oldest first, so the numbers a title does not carry are handed out in upload order.
  for (const entry of parseFeed(await res.text()).reverse()) {
    if (known.has(entry.id)) continue;
    known.add(entry.id);
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
