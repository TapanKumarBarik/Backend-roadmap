import { useCallback, useEffect, useState } from 'react';
import { fileFromPathname, routeUrl } from '../lib/curriculum/moduleUrl.js';

// Where the app is, as { path, heading }:
//
//   /backend/01-x/02-y/#some-heading   a curriculum module — its own page, see
//                                      lib/curriculum/moduleUrl.js; the hash is a heading
//   /#__feed   /#__feed@postId         app screens, which live in the hash
//   /#backend%2F...%2FREADME.md@h      the original all-hash links. They're in
//                                      bookmarks and shared links, so they are
//                                      still accepted, then rewritten to the
//                                      module's real URL.
//
// Like the original hash router, navigation uses replaceState and never adds a
// browser-history entry.
function parseLocation() {
  let hash;
  try { hash = decodeURIComponent(location.hash.replace(/^#/, '')); } catch { hash = ''; }

  const legacyModule = hash.includes('/') || hash.endsWith('.md');
  const file = fileFromPathname(location.pathname);

  if (legacyModule || (!file && hash.startsWith('__'))) {
    const [path, heading] = hash.split('@');
    return { path: path || null, heading: heading || null };
  }
  // On a module page the hash is only ever a heading — including ids like
  // "__init__" from a Python heading, which must not read as an app screen.
  return { path: file, heading: file ? hash || null : null };
}

function withSearch(url) {
  return url.replace(/#|$/, (m) => location.search + m);
}

// Rewrites old-style and stray URLs to the one canonical form for this route.
function canonicalize(route) {
  if (!route.path) return;
  const url = routeUrl(route.path, route.heading);
  if (url !== location.pathname + location.hash) history.replaceState(null, '', withSearch(url));
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseLocation);

  useEffect(() => {
    function sync() {
      const next = parseLocation();
      canonicalize(next);
      setRoute((prev) => (next.path === prev.path && next.heading === prev.heading ? prev : next));
    }
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const navigate = useCallback((path, heading = null, { updateUrl = true } = {}) => {
    setRoute({ path, heading: heading || null });
    if (updateUrl) history.replaceState(null, '', routeUrl(path, heading));
  }, []);

  const goHome = useCallback(() => {
    setRoute({ path: null, heading: null });
    history.replaceState(null, '', '/' + location.search);
  }, []);

  return { path: route.path, heading: route.heading, navigate, goHome };
}
