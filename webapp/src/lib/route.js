import { pageFromPathname } from './appPages.js';
import { fileFromPathname } from './curriculum/moduleUrl.js';

// Where the app is, read off the address: { path, heading, fromHash }.
//
//   /blog/<slug>   /authors/<handle>   /write      a page with a real address of its own (lib/appPages.js);
//                                                  the heading is the slug, handle or id after the prefix
//   /backend/01-x/02-y/#some-heading               a curriculum module: its own page (lib/curriculum/moduleUrl.js);
//                                                  the hash is a heading
//   /#__feed   /#__feed@postId                     the other screens, which live in the hash
//   /#backend%2F...%2FREADME.md@h                  the original all-hash links. They are in bookmarks and shared
//                                                  links, so they are still read, then rewritten to the module's real
//                                                  address.
//
// `fromHash` says the route was found in the hash (an old-style or screen address), so the hash is the route itself and
// not a heading on the page.
//
// Pure (the caller passes the address), so the rules can be tested without a browser.
export function routeFromLocation(pathname, rawHash) {
  let hash;
  try { hash = decodeURIComponent(String(rawHash || '').replace(/^#/, '')); } catch { hash = ''; }

  const page = pageFromPathname(pathname);
  if (page) return { ...page, fromHash: false };

  const legacyModule = hash.includes('/') || hash.endsWith('.md');
  const file = fileFromPathname(pathname);

  if (legacyModule || (!file && hash.startsWith('__'))) {
    const [path, heading] = hash.split('@');
    return { path: path || null, heading: heading || null, fromHash: true };
  }
  // On a module page the hash is only ever a heading, including ids like "__init__" from a Python heading, which must
  // not read as an app screen.
  return { path: file, heading: file ? hash || null : null, fromHash: false };
}
