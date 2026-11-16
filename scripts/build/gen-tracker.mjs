#!/usr/bin/env node
// Writes dist/tracker.json, the study items of the Prep Tracker (/tracker/) as the page reads them, from content/tracker/items.json: a stable id on every row, and the
// address of the lesson the site has for an item where it has one (found through the channel's registry, content/videos.json). Part of `npm run index`. Items with a
// mistake in them stop the build rather than shipping a tracker that cannot save a row.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, ROOT } from '../lib/config.mjs';
import { loadRegistry, validateAgainstContent } from '../lib/videos.mjs';
import { moduleFile } from '../../webapp/src/lib/curriculum/videos.js';
import { moduleUrl } from '../../webapp/src/lib/curriculum/moduleUrl.js';
import { TRACKER } from '../../webapp/src/config/tracker.js';
import { lessonUrls, resolveItems, validateItems } from '../../webapp/src/lib/tracker/items.js';

const file = path.join(CONTENT_ROOT, 'tracker', 'items.json');
if (!fs.existsSync(file)) {
  console.error(`gen-tracker: ${path.relative(ROOT, file)} is missing.`);
  process.exit(1);
}
const items = JSON.parse(fs.readFileSync(file, 'utf8'));
const problems = validateItems(items, { priorities: TRACKER.priorities, difficulties: TRACKER.difficulties });
const registry = loadRegistry();
problems.push(...validateAgainstContent(registry).map((p) => `videos.json: ${p}`));
if (problems.length) {
  console.error(`gen-tracker: ${path.relative(ROOT, file)} has ${problems.length} problem(s):\n  ${problems.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}

const lessons = lessonUrls(registry, (module) => moduleUrl(moduleFile(module)));
const resolved = resolveItems(items, lessons);
const out = path.join(ROOT, 'dist', 'tracker.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(resolved));
const rows = (sheet) => resolved[sheet].rows.length;
console.log(`Wrote ${out} (${rows('sd')} system design items, ${rows('gai')} GenAI items, ${rows('qa')} questions, ${rows('pr')} design problems; ${resolved.sd.rows.filter((r) => r.u).length + resolved.gai.rows.filter((r) => r.u).length} items link to a lesson)`);
