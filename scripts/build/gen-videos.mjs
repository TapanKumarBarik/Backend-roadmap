#!/usr/bin/env node
// Writes dist/videos.json, the channel's videos as the app reads them, from content/videos.json (docs/VIDEOS.md). Part of
// `npm run index`. A registry with a mistake in it stops the build rather than shipping a broken video card.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../lib/config.mjs';
import { loadRegistry, validateAgainstContent } from '../lib/videos.mjs';
import { resolveVideos, totals } from '../../webapp/src/lib/curriculum/videos.js';

const registry = loadRegistry();
const problems = validateAgainstContent(registry);
if (problems.length) {
  console.error(`gen-videos: content/videos.json has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const videos = resolveVideos(registry);
const out = path.join(ROOT, 'dist', 'videos.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), playlists: registry.playlists, videos }));

const { count, seconds } = totals(videos);
console.log(`Wrote ${out} (${count} videos, ${Math.round(seconds / 60)} minutes, ${videos.filter((v) => v.file).length} attached to a module)`);
