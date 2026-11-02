// Every curriculum module has its own real URL: the folder holding its README,
// so backend/01-x/02-y/README.md lives at /backend/01-x/02-y/. The deploy build
// (scripts/prerender.mjs) writes a static page at each of these so search
// engines can index modules individually. App screens (__feed, __admin, ...)
// stay in the hash, as does the rare module that isn't a README. The community's
// articles have real addresses too, but not as modules: see lib/appPages.js.

import { pageUrl } from '../appPages.js';

const README = /(^|\/)README\.md$/;

export function moduleUrl(file) {
  if (!file || !README.test(file)) return null;
  const dir = file.replace(README, '');
  if (!dir) return null;
  return '/' + dir.split('/').map(encodeURIComponent).join('/') + '/';
}

// Inverse of moduleUrl. Returns a candidate file; the caller still checks it
// against the docs index.
export function fileFromPathname(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { return null; }
  p = p.replace(/\/index\.html$/, '').replace(/^\/+|\/+$/g, '');
  return p ? p + '/README.md' : null;
}

export function routeUrl(path, heading) {
  if (!path) return '/';
  // For a page of the community the "heading" is which one (the article's slug), not a section: it is part of the path.
  const page = pageUrl(path, heading);
  if (page) return page;
  const url = !path.startsWith('__') && moduleUrl(path);
  if (url) return url + (heading ? '#' + heading : '');
  return '/#' + encodeURIComponent(path) + (heading ? '@' + heading : '');
}
