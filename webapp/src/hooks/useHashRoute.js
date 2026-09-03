import { useCallback, useEffect, useState } from 'react';

// path@headingId hash format, ported from the vanilla app's openFile()/
// hashchange listener — with one fix: the vanilla initial-load handler
// checked `fileRows[fromHash]` directly without splitting on '@', so a deep
// link with a heading anchor (`#some%2Fpath.md@some-heading`) silently
// failed to open on first load even though the identical hash worked fine
// once the app was already running (the hashchange listener DID split on
// '@'). Both paths go through the same parseHash() here, so that
// inconsistency can't recur.
//
// Always uses history.replaceState, never pushState — the vanilla app never
// pushed either, so there was never a back/forward history stack to begin
// with; this preserves that (a click never adds a browser-history entry).
//
// One small, deliberate simplification vs. the original: an unrecognized
// hash (edited by hand, or a stale link) resolves to the home/empty state
// here, rather than the vanilla behavior of silently ignoring it and
// leaving whatever was already on screen in place. Validating "is this a
// known file" needs the docs index, which this hook intentionally doesn't
// depend on — the caller (App) does that check against `path`.
function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!raw) return { path: null, heading: null };
  const [path, heading] = raw.split('@');
  return { path: path || null, heading: heading || null };
}

export function useHashRoute() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    function onHashChange() {
      setRoute((prev) => {
        const next = parseHash();
        return next.path === prev.path && next.heading === prev.heading ? prev : next;
      });
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((path, heading = null, { updateUrl = true } = {}) => {
    setRoute({ path, heading: heading || null });
    if (updateUrl) {
      const hash = '#' + encodeURIComponent(path) + (heading ? '@' + heading : '');
      history.replaceState(null, '', hash);
    }
  }, []);

  const goHome = useCallback(() => {
    setRoute({ path: null, heading: null });
    history.replaceState(null, '', location.pathname + location.search);
  }, []);

  return { path: route.path, heading: route.heading, navigate, goHome };
}
