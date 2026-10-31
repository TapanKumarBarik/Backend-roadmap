// Reading the curriculum off disk. Everything that scans the lessons (the two indexes, the stats, the checks) goes
// through here, so they agree on what a lesson is, how long it takes to read and which files are not lessons.
import fs from 'node:fs';
import path from 'node:path';
import { config, isPlaceholderText } from './config.mjs';

/** Folders that never hold lessons. */
export const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__']);

/** Notes for whoever writes the content (build status, hand-over files): beside the lessons, but not lessons. */
export const IGNORED_FILES = new Set(config.content.ignoredFiles);

/** A file's text, with Windows line endings read as the single newlines they stand for. */
export const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');

export const isDirectory = (p) => fs.existsSync(p) && fs.statSync(p).isDirectory();
export const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

/** A path made relative to `root`, written with forward slashes whatever the platform. */
export const relativePosix = (root, p) => path.relative(root, p).split(path.sep).join('/');

/** The lesson files (Markdown, not ignored notes) under a folder, in path order. */
export function markdownFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) found.push(...markdownFiles(full));
    } else if (entry.name.endsWith('.md') && !IGNORED_FILES.has(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

/** The reading time a module page shows. Code blocks are not read, so they are not counted. */
export function readingMinutes(text) {
  const words = text.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / config.content.wordsPerMinute));
}

/** What a lesson file is: still a promise (it carries the placeholder sentence) or real text with a reading time. */
export function readingFacts(text) {
  return { planned: isPlaceholderText(text), minutes: readingMinutes(text) };
}

/** The first top-level heading of a Markdown text, or the fallback when it has none. */
export function extractTitle(text, fallback) {
  for (const line of text.split('\n')) {
    const heading = line.trim().match(/^#\s+(.+?)\s*$/);
    if (heading) return heading[1];
  }
  return fallback;
}

/** A readable title for a folder that has no README: "03-api-layer" becomes "Api Layer". */
export function humanize(name) {
  return name
    .replace(/^\d+[-_.]?/, '')
    .replace(/[-_]/g, ' ')
    .trim()
    .replace(/\p{L}+/gu, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}
