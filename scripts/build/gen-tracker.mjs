#!/usr/bin/env node
// Writes dist/tracker.json, the study items of the Prep Tracker (/tracker/) as the page reads them, from content/tracker/items.json: a stable id on every row, the address
// of the lesson the site has for an item where it has one (found through the channel's registry, content/videos.json), and the lessons of the site that cover each item
// (content/tracker/lessons.json, checked against the docs index: every one must be a written lesson). Part of `npm run index`, after the docs index. Items or lesson links
// with a mistake in them stop the build rather than shipping a tracker that cannot save a row or sends a reader to a page that is not there.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, ROOT } from '../lib/config.mjs';
import { loadRegistry, validateAgainstContent } from '../lib/videos.mjs';
import { writtenModules } from '../lib/writtenModules.mjs';
import { moduleFile } from '../../webapp/src/lib/curriculum/videos.js';
import { moduleUrl } from '../../webapp/src/lib/curriculum/moduleUrl.js';
import { TRACKER } from '../../webapp/src/config/tracker.js';
import { lessonTitle, lessonUrls, resolveItems, validateItems, validateLessonLinks } from '../../webapp/src/lib/tracker/items.js';

const read = (file, what) => {
  if (!fs.existsSync(file)) {
    console.error(`gen-tracker: ${path.relative(ROOT, file)} is missing${what ? ` (${what})` : ''}.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};

const file = path.join(CONTENT_ROOT, 'tracker', 'items.json');
const linksFile = path.join(CONTENT_ROOT, 'tracker', 'lessons.json');
const items = read(file);
const lessonLinks = read(linksFile);
const docsIndex = read(path.join(ROOT, 'dist', 'docs-index.json'), 'run `npm run index`, which writes it first');

// The lessons that are written, by path: the address a reader goes to, the title, and which curriculum it belongs to.
/** @type {Map<string, { u: string, t: string, c: string }>} */
const info = new Map();
for (const node of writtenModules(docsIndex.tree)) {
  const address = moduleUrl(node.file);
  if (address) info.set(node.path, { u: address, t: lessonTitle(node.title) || node.path, c: node.path.split('/')[0] });
}

const problems = validateItems(items, { priorities: TRACKER.priorities, difficulties: TRACKER.difficulties });
problems.push(...validateLessonLinks(lessonLinks, new Set(info.keys()), items).map((p) => `lessons.json: ${p}`));
const registry = loadRegistry();
problems.push(...validateAgainstContent(registry).map((p) => `videos.json: ${p}`));
if (problems.length) {
  console.error(`gen-tracker: ${problems.length} problem(s) in the tracker's data:\n  ${problems.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}

const lessons = lessonUrls(registry, (module) => moduleUrl(moduleFile(module)));
const resolved = resolveItems(items, lessons, { lessonLinks, info, limits: TRACKER.lessonLinks });
const out = path.join(ROOT, 'dist', 'tracker.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(resolved));
const rows = (sheet) => resolved[sheet].rows.length;
const withLessons = (sheet) => resolved[sheet].rows.filter((r) => r.ls && r.ls.length).length;
console.log(
  `Wrote ${out} (${rows('sd')} system design items, ${rows('gai')} GenAI items, ${rows('qa')} questions, ${rows('pr')} design problems; ` +
  `${withLessons('sd')} + ${withLessons('gai')} items, ${withLessons('qa')} questions and ${withLessons('pr')} problems list lessons of the site, ${resolved.lessons.length} lessons in all)`
);
