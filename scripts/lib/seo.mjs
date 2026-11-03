// content/seo.json: the titles and descriptions an editor wrote by hand for some modules' pages (docs/ADMIN_CONTENT.md). This reads it and
// checks it against the content on disk. The rules are shared with the admin editor and the app: webapp/src/lib/siteContent/seo.js.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './config.mjs';
import { seoProblems } from '../../webapp/src/lib/siteContent/seo.js';

export const SEO_FILE = path.join(CONTENT_ROOT, 'seo.json');

/** The overrides, or none when the file is not there (it is optional). */
export function loadSeo(file = SEO_FILE) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** What is wrong with the overrides: the rules, and that each key is a module's README that exists. */
export function validateSeoAgainstContent(seo) {
  return seoProblems(seo, { isModuleFile: (key) => fs.existsSync(path.join(CONTENT_ROOT, key)) });
}
