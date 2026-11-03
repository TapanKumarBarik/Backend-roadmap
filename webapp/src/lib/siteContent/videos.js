// What content/videos.json must look like (docs/VIDEOS.md), and how it is written back. Pure (no files): `npm run check:videos` and the
// build read the file from disk (scripts/lib/videos.mjs) and the admin editor checks one before it commits it (api/routes/content.js),
// and both ask this module. Whether a module exists is not decided here: the caller says (`hasModule`), from disk or from the deployed index.

import { isVideoId } from '../markdown/videoCard.js';
import { parseChapterLine } from '../curriculum/videos.js';

/** @typedef {{ id: string, title: string, url: string }} Playlist */
/** @typedef {{ playlists: Playlist[], videos: import('../curriculum/videos.js').VideoEntry[] }} Registry */

export const VIDEO_KEYS = new Set(['id', 'title', 'playlist', 'number', 'published', 'module', 'lesson', 'seconds', 'summary', 'chapters']);
export const PLAYLIST_KEYS = new Set(['id', 'title', 'url']);
// A playlist's id is how the videos name it, so it is written plainly.
export const PLAYLIST_ID = /^[a-z0-9][a-z0-9-]*$/;
export const PLAYLIST_URL = /^https:\/\/www\.youtube\.com\/playlist\?list=[A-Za-z0-9_-]+$/;

/** The registry as it is written to disk: videos in playlist order then by number, so a new upload is one clean diff. */
export function serializeRegistry(registry) {
  const order = new Map(registry.playlists.map((p, i) => [p.id, i]));
  const videos = [...registry.videos].sort((a, b) => (order.get(a.playlist) ?? 0) - (order.get(b.playlist) ?? 0) || a.number - b.number);
  return JSON.stringify({ playlists: registry.playlists, videos }, null, 2) + '\n';
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
    if (!p || typeof p !== 'object') { problems.push('every playlist must be an object'); continue; }
    const label = `playlist "${p.id}"`;
    for (const key of Object.keys(p)) if (!PLAYLIST_KEYS.has(key)) problems.push(`${label} has an unknown field "${key}"`);
    if (!p.id || typeof p.id !== 'string') problems.push('a playlist has no id');
    else if (playlistIds.has(p.id)) problems.push(`${label} is listed twice`);
    else if (!PLAYLIST_ID.test(p.id)) problems.push(`${label}: the id uses lower case letters, numbers and hyphens`);
    playlistIds.add(p.id);
    if (!p.title) problems.push(`${label} has no title`);
    if (!PLAYLIST_URL.test(p.url || '')) problems.push(`${label} needs a url like https://www.youtube.com/playlist?list=PL…`);
  }

  const seenIds = new Set();
  const seenNumbers = new Set();
  const seenLessons = new Set();
  for (const v of registry.videos) {
    if (!v || typeof v !== 'object') { problems.push('every video must be an object'); continue; }
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
