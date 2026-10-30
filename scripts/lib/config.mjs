// Shared access to site.config.json for the Node scripts, so none of them carries its own copy of the
// repo name, the site URL or the "not written yet" marker. (The webapp and the API import the same file.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

export const SITE_URL = config.site.url;
export const REPO_SLUG = `${config.repo.owner}/${config.repo.name}`;
export const REPO_URL = `https://github.com/${REPO_SLUG}`;
export const CURRICULA = config.content.curricula;
export const PLACEHOLDER_MARKER = config.content.placeholderMarker;

// A module is a placeholder when its opening lines carry the marker sentence.
export const isPlaceholderText = (raw) =>
  raw.split('\n', config.content.placeholderScanLines).join('\n').includes(PLACEHOLDER_MARKER);
