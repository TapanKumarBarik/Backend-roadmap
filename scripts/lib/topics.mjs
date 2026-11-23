// Reads content/topics.json (the topic guides) and says what exists on disk for it to point at. Shared by the checker (npm run check:topics) and the build
// (scripts/build/prerender.mjs writes each guide as a page). The rules are webapp/src/lib/siteContent/topics.js; this only supplies the facts.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, CURRICULA, ROOT, isPlaceholderText } from './config.mjs';
import { markdownFiles, readText, readingMinutes, relativePosix } from './content.mjs';
import { TOOLS_CATALOG } from '../../webapp/src/config/lessonTools.js';

export const loadTopics = () => JSON.parse(fs.readFileSync(path.join(CONTENT_ROOT, 'topics.json'), 'utf8')).topics;

/**
 * What a topic may name: the written lessons (a module is a README.md with no module folder inside it, as everywhere on the site), every page
 * (track overviews too), the practice items of api/generated/practice-content.json, the tools, and the scenes in content/scenes.
 */
export function topicContext() {
  const readmes = markdownFiles(CONTENT_ROOT)
    .map((file) => ({ file, key: relativePosix(CONTENT_ROOT, file) }))
    .filter(({ key }) => CURRICULA.includes(key.split('/')[0]) && key.endsWith('/README.md'));
  const dirs = readmes.map(({ key }) => key.slice(0, -'README.md'.length));
  const pages = new Set(readmes.map(({ key }) => key));
  const lessons = new Map();
  for (const { file, key } of readmes) {
    const dir = key.slice(0, -'README.md'.length);
    if (dirs.some((other) => other !== dir && other.startsWith(dir))) continue; // it has modules inside it: an overview
    const raw = readText(file);
    if (isPlaceholderText(raw)) continue; // planned, not written
    lessons.set(key, { minutes: readingMinutes(raw) });
  }
  const generated = JSON.parse(fs.readFileSync(path.join(ROOT, 'api/generated/practice-content.json'), 'utf8'));
  const practice = Object.fromEntries(['quizzes', 'exercises', 'interview', 'code'].map((kind) => [kind, new Set(Object.keys(generated[kind] || {}))]));
  const sceneDir = path.join(CONTENT_ROOT, 'scenes');
  const scenes = new Set(fs.existsSync(sceneDir) ? fs.readdirSync(sceneDir).filter((n) => n.endsWith('.json')).map((n) => n.slice(0, -'.json'.length)) : []);
  return {
    lessons,
    where: { hasLesson: (file) => lessons.has(file), hasPage: (file) => pages.has(file), practice, tools: new Set(Object.keys(TOOLS_CATALOG)), scenes }
  };
}

/**
 * The topics with their reading time added, from the modules' own minutes in the built index (`nodeByFile[file].min`), as the paths have theirs.
 * @param {any[]} topics
 * @param {Record<string, { min?: number }>} nodeByFile
 */
export const resolveTopics = (topics, nodeByFile) => topics.map((t) => ({
  ...t,
  minutes: t.stages.flatMap((s) => s.lessons).reduce((sum, file) => sum + ((nodeByFile[file] && nodeByFile[file].min) || 0), 0)
}));
