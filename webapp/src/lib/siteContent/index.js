// The three site files an admin may edit in the browser besides the practice content: the learning paths, the videos and the
// SEO overrides. One list of which files those are, and one function that says what is wrong with one of them, so the API's
// allow-list (api/routes/content.js) and the editors agree. Pure: what exists on the site comes from the deployed module index.

import { pathsProblems, serializePaths } from './paths.js';
import { serializeRegistry, validateRegistry } from './videos.js';
import { seoProblems, serializeSeo } from './seo.js';
import { pageFiles, pageFolders } from './modules.js';

/** The files, by their path under content/. */
export const SITE_FILES = { paths: 'paths.json', videos: 'videos.json', seo: 'seo.json' };

/** True for the path (relative to content/) of one of the three site files. */
export const isSiteFile = (relative) => Object.values(SITE_FILES).includes(String(relative || ''));

/**
 * What is wrong with one site file's parsed content, given the deployed module index; an empty list is a good file.
 * @param {string} relative one of SITE_FILES
 * @param {any} item the parsed JSON
 * @param {{ tree: any[], curricula: string[] }} where
 * @returns {string[]}
 */
export function siteFileProblems(relative, item, { tree, curricula }) {
  if (relative === SITE_FILES.paths) return pathsProblems(item, { tree, curricula });
  if (relative === SITE_FILES.videos) {
    const folders = pageFolders(tree);
    return validateRegistry(item, { hasModule: (folder) => folders.has(folder) });
  }
  if (relative === SITE_FILES.seo) {
    const files = pageFiles(tree);
    return seoProblems(item, { isModuleFile: (key) => files.has(key) });
  }
  return [`${relative}: not a site file`];
}

/** One site file as it is committed (one layout, so a change shows as a change in the history). */
export function serializeSiteFile(relative, item) {
  if (relative === SITE_FILES.videos) return serializeRegistry(item);
  if (relative === SITE_FILES.seo) return serializeSeo(item);
  return serializePaths(item);
}
