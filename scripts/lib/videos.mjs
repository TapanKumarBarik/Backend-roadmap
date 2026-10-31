// content/videos.json: the channel's videos and which module each one belongs to (docs/VIDEOS.md). This reads it,
// checks it, writes it back in a stable order and counts the videos of each module for the index. The functions the
// app shares (titles, chapters, clock times) are in webapp/src/lib/curriculum/videos.js.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './config.mjs';
import { isVideoId } from '../../webapp/src/lib/markdown/video.js';
import { moduleFile, parseChapterLine } from '../../webapp/src/lib/curriculum/videos.js';

export const VIDEOS_FILE = path.join(CONTENT_ROOT, 'videos.json');

/** @typedef {{ id: string, title: string, url: string }} Playlist */
/** @typedef {{ playlists: Playlist[], videos: import('../../webapp/src/lib/curriculum/videos.js').VideoEntry[] }} Registry */

const VIDEO_KEYS = new Set(['id', 'title', 'playlist', 'number', 'published', 'module', 'lesson', 'seconds', 'summary', 'chapters']);
const PLAYLIST_KEYS = new Set(['id', 'title', 'url']);
const PLAYLIST_URL = /^https:\/\/www\.youtube\.com\/playlist\?list=[A-Za-z0-9_-]+$/;

/** The registry, or an empty one when the file is not there (a copy of the site with no channel behind it). */
export function loadRegistry(file = VIDEOS_FILE) {
  if (!fs.existsSync(file)) return { playlists: [], videos: [] };
  return /** @type {Registry} */ (JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** The registry as it is written to disk: videos in playlist order then by number, so a new upload is one clean diff. */
export function serializeRegistry(registry) {
  const order = new Map(registry.playlists.map((p, i) => [p.id, i]));
  const videos = [...registry.videos].sort((a, b) => (order.get(a.playlist) ?? 0) - (order.get(b.playlist) ?? 0) || a.number - b.number);
  return JSON.stringify({ playlists: registry.playlists, videos }, null, 2) + '\n';
}

export function saveRegistry(registry, file = VIDEOS_FILE) {
  fs.writeFileSync(file, serializeRegistry(registry));
}

/**
 * What is wrong with the registry, as sentences a person can act on (empty: nothing).
 * @param {Registry} registry
 * @param {{ hasModule: (folder: string) => boolean }} where answers whether a module folder (under content/) exists
 */
export function validateRegistry(registry, { hasModule }) {
  /** @type {string[]} */
  const problems = [];
  if (!registry || !Array.isArray(registry.playlists) || !Array.isArray(registry.videos)) {
    return ['videos.json must be an object with a "playlists" list and a "videos" list'];
  }

  const playlistIds = new Set();
  for (const p of registry.playlists) {
    const label = `playlist "${p.id}"`;
    for (const key of Object.keys(p)) if (!PLAYLIST_KEYS.has(key)) problems.push(`${label} has an unknown field "${key}"`);
    if (!p.id || typeof p.id !== 'string') problems.push('a playlist has no id');
    else if (playlistIds.has(p.id)) problems.push(`${label} is listed twice`);
    playlistIds.add(p.id);
    if (!p.title) problems.push(`${label} has no title`);
    if (!PLAYLIST_URL.test(p.url || '')) problems.push(`${label} needs a url like https://www.youtube.com/playlist?list=PL…`);
  }

  const seenIds = new Set();
  const seenNumbers = new Set();
  const seenLessons = new Set();
  for (const v of registry.videos) {
    const label = `video ${v.id} (${v.title || 'no title'})`;
    for (const key of Object.keys(v)) if (!VIDEO_KEYS.has(key)) problems.push(`${label} has an unknown field "${key}" (a typo?)`);
    if (!isVideoId(v.id)) problems.push(`${label}: "${v.id}" is not a YouTube video id`);
    else if (seenIds.has(v.id)) problems.push(`${label} is listed twice`);
    seenIds.add(v.id);
    if (!v.title || typeof v.title !== 'string') problems.push(`${label} has no title`);
    if (!playlistIds.has(v.playlist)) problems.push(`${label}: playlist "${v.playlist}" is not one of the playlists`);
    if (!Number.isInteger(v.number) || v.number < 1) problems.push(`${label}: "number" must be a whole number from 1`);
    else {
      const slot = `${v.playlist}#${v.number}`;
      if (seenNumbers.has(slot)) problems.push(`${label}: number ${v.number} is already used in playlist "${v.playlist}"`);
      seenNumbers.add(slot);
    }
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v.published || '') || Number.isNaN(Date.parse(v.published))) {
      problems.push(`${label}: "published" must be a UTC time like 2026-10-31T08:44:32Z`);
    }
    if (v.seconds !== undefined && (!Number.isInteger(v.seconds) || v.seconds < 1)) problems.push(`${label}: "seconds" must be a whole number`);
    if (v.lesson !== undefined) {
      if (seenLessons.has(v.lesson)) problems.push(`${label}: lesson id ${v.lesson} is used twice`);
      seenLessons.add(v.lesson);
    }
    if (v.module !== undefined) {
      if (typeof v.module !== 'string' || /(^\/|\/$|README\.md$|\\)/.test(v.module)) {
        problems.push(`${label}: "module" is a folder under content/ with no slashes at the ends and no README.md, like backend/01-x/02-y`);
      } else if (!hasModule(v.module)) {
        problems.push(`${label}: there is no module at content/${v.module}/README.md`);
      }
    }
    if (v.chapters !== undefined) {
      const parsed = Array.isArray(v.chapters) ? v.chapters.map(parseChapterLine) : [];
      if (!Array.isArray(v.chapters) || parsed.some((c) => !c)) problems.push(`${label}: every chapter is a line like "0:23 Name"`);
      else if (parsed.length < 3 || parsed[0]?.[0] !== 0 || parsed.some((c, i) => i > 0 && c && parsed[i - 1] && c[0] <= parsed[i - 1][0])) {
        problems.push(`${label}: chapters must start at 0:00, run forward in time and number at least three`);
      } else if (v.seconds && parsed.some((c) => c && c[0] >= v.seconds)) {
        problems.push(`${label}: a chapter starts after the video ends`);
      }
    }
  }
  return problems;
}

/** The checks against the real content folder. */
export function validateAgainstContent(registry) {
  return validateRegistry(registry, { hasModule: (folder) => fs.existsSync(path.join(CONTENT_ROOT, folder, 'README.md')) });
}

/** How many videos each module has, keyed by the module's README.md, for the module index. */
export function fileCounts(registry) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const v of registry.videos) {
    if (v.module) counts.set(moduleFile(v.module), (counts.get(moduleFile(v.module)) || 0) + 1);
  }
  return counts;
}
