// The webapp's view of site.config.json (repo root): the one place that knows the site's name, the
// developer's contact details, the repository, and the storage keys. The build scripts and the API read
// the same file, so changing a value here means editing site.config.json, nothing else.
import site from '../../../site.config.json';

export const SITE = site.site;
export const DEVELOPER = site.developer;
export const REPO = site.repo;
export const CONTENT = site.content;
export const STORAGE = site.storage;

export const REPO_URL = `https://github.com/${REPO.owner}/${REPO.name}`;
export const DEVELOPER_EMAIL_LINK = `mailto:${DEVELOPER.email}`;

// A module whose opening lines carry the marker sentence is a placeholder waiting for an author.
export function isPlaceholderText(raw) {
  return !!raw && raw.split('\n', CONTENT.placeholderScanLines).join('\n').includes(CONTENT.placeholderMarker);
}
