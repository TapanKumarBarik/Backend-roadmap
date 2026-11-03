// content/videos.json: the channel's videos and which module each one belongs to (docs/VIDEOS.md). This reads it,
// checks it, writes it back in a stable order and counts the videos of each module for the index. The functions the
// app shares (titles, chapters, clock times) are in webapp/src/lib/curriculum/videos.js.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './config.mjs';
import { moduleFile } from '../../webapp/src/lib/curriculum/videos.js';
import { serializeRegistry, validateRegistry } from '../../webapp/src/lib/siteContent/videos.js';
import { moduleUrl } from '../../webapp/src/lib/curriculum/moduleUrl.js';

export const VIDEOS_FILE = path.join(CONTENT_ROOT, 'videos.json');

/** @typedef {import('../../webapp/src/lib/siteContent/videos.js').Registry} Registry */

// The rules and the layout of the file are shared with the admin editor: webapp/src/lib/siteContent/videos.js.
export { serializeRegistry, validateRegistry };

/** The registry, or an empty one when the file is not there (a copy of the site with no channel behind it). */
export function loadRegistry(file = VIDEOS_FILE) {
  if (!fs.existsSync(file)) return { playlists: [], videos: [] };
  return /** @type {Registry} */ (JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function saveRegistry(registry, file = VIDEOS_FILE) {
  fs.writeFileSync(file, serializeRegistry(registry));
}

/** The checks against the real content folder. */
export function validateAgainstContent(registry) {
  return validateRegistry(registry, { hasModule: (folder) => fs.existsSync(path.join(CONTENT_ROOT, folder, 'README.md')) });
}

/**
 * Where each video's module is on the site, for the first line of the video's YouTube description (docs/VIDEOS.md), in
 * the order of the registry's playlists. A video with no module has no address and is left out.
 * @param {Registry} registry
 * @param {string} siteUrl the site's address, with no trailing slash
 */
export function videoLinks(registry, siteUrl) {
  const order = new Map(registry.playlists.map((p, i) => [p.id, i]));
  return registry.videos
    .filter((v) => v.module)
    .sort((a, b) => (order.get(a.playlist) ?? 0) - (order.get(b.playlist) ?? 0) || a.number - b.number)
    .map((v) => ({
      id: v.id,
      title: v.title,
      playlist: registry.playlists.find((p) => p.id === v.playlist)?.title ?? v.playlist,
      number: v.number,
      url: siteUrl + moduleUrl(moduleFile(/** @type {string} */ (v.module))),
      edit: `https://studio.youtube.com/video/${v.id}/edit`
    }));
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
