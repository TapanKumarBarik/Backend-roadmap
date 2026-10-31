#!/usr/bin/env node
// Checks content/videos.json: every video is a real id, every module it names exists, chapters make sense, nothing is listed
// twice (the rules are in scripts/lib/videos.mjs). Part of `npm run check`, so a mistake fails the pull request.
import { loadRegistry, validateAgainstContent } from '../lib/videos.mjs';

const registry = loadRegistry();
const problems = validateAgainstContent(registry);
if (problems.length) {
  console.error(`check-videos: ${problems.length} problem(s) in content/videos.json:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
const loose = registry.videos.filter((v) => !v.module).length;
console.log(`check-videos: ${registry.videos.length} videos in ${registry.playlists.length} playlists OK${loose ? ` (${loose} not attached to a module yet)` : ''}`);
