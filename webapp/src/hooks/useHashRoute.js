import { useCallback, useEffect, useState } from 'react';
import { routeFromLocation } from '../lib/route.js';
import { pageUrl } from '../lib/appPages.js';
import { routeUrl } from '../lib/curriculum/moduleUrl.js';

// Where the app is, as { path, heading }; lib/route.js says how an address is read (a module's own page, a page of the
// community such as /blog/<slug>, a screen in the hash, or one of the original all-hash links).
//
// Moving to another page adds a browser-history entry, so Back and Forward walk the pages you have read (arriving from
// a video and pressing Back used to leave the site). Rewriting the address of the page you are already on, to its
// canonical form or to a heading's anchor, does not add one.
function parseLocation() {
  return routeFromLocation(location.pathname, location.hash);
}

function withSearch(url) {
  return url.replace(/#|$/, (m) => location.search + m);
}

// Rewrites old-style and stray URLs to the one canonical form for this route.
function canonicalize(route) {
  if (!route.path) return;
  const page = pageUrl(route.path, route.heading);
  if (page) {
    // A page keeps its own hash (the section of an article being read). An old-style screen address (/#__blog@slug)
    // is replaced by the page's, hash and all: there the hash was the route itself.
    if (route.fromHash || location.pathname !== page) history.replaceState(null, '', page + location.search + (route.fromHash ? '' : location.hash));
    return;
  }
  const url = routeUrl(route.path, route.heading);
  if (url !== location.pathname + location.hash) history.replaceState(null, '', withSearch(url));
}

// A new place in the history, unless it is where the browser already is (a click on the link of the page you are on).
function pushUrl(url) {
  if (url !== location.pathname + location.search + location.hash) history.pushState(null, '', url);
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => {
    const { path, heading } = parseLocation();
    return { path, heading };
  });

  useEffect(() => {
    function sync() {
      const next = parseLocation();
      canonicalize(next);
      setRoute((prev) => (next.path === prev.path && next.heading === prev.heading ? prev : { path: next.path, heading: next.heading }));
    }
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  // `search` is a query string for the new address ("?tag=reliability"); the screen reads it.
  const navigate = useCallback((path, heading = null, { updateUrl = true, search = '' } = {}) => {
    setRoute({ path, heading: heading || null });
    if (updateUrl) pushUrl(search ? routeUrl(path, heading).replace(/#|$/, (m) => search + m) : routeUrl(path, heading));
  }, []);

  const goHome = useCallback(() => {
    setRoute({ path: null, heading: null });
    pushUrl('/' + location.search);
  }, []);

  return { path: route.path, heading: route.heading, navigate, goHome };
}
