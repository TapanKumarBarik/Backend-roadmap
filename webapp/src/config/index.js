// The webapp's view of site.config.json (repo root): the one place that knows the site's name, the
// developer's contact details, the repository, and the storage keys. The build scripts and the API read
// the same file, so changing a value here means editing site.config.json, nothing else. (The import attribute is
// what lets plain Node load this module too: the pre-render step reuses the landing page's wording.)
import site from '../../../site.config.json' with { type: 'json' };

export const SITE = site.site;
export const DEVELOPER = site.developer;
export const REPO = site.repo;
export const CONTENT = site.content;
// The library's areas (the curriculum folders): name, short name, a line about each, and how its tracks are grouped. See lib/curriculum/areas.js.
export const AREAS = site.content.areas;
// The folder of the repository the curricula sit in. A lesson's key on the site is its path from there.
export const CONTENT_DIR = site.content.dir;
export const STORAGE = site.storage;
export const YOUTUBE = site.youtube;
// The writing studio's numbers (how long typing pauses before a save, and so on); its words are in config/studio.js.
export const STUDIO = site.studio;

export const REPO_URL = `https://github.com/${REPO.owner}/${REPO.name}`;
export const DEVELOPER_EMAIL_LINK = `mailto:${DEVELOPER.email}`;

// A module whose opening lines carry the marker sentence is a placeholder waiting for an author.
export function isPlaceholderText(raw) {
  return !!raw && raw.split('\n', CONTENT.placeholderScanLines).join('\n').includes(CONTENT.placeholderMarker);
}
