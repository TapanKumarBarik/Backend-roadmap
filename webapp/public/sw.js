/* Offline support for the curriculum reader.
 *
 * Hand-written rather than generated. The Vite build writes into the repo
 * ROOT (see vite.config.js — outDir '../', emptyOutDir false), so a plugin
 * that precaches "everything in the output directory" would try to bundle the
 * entire repository: ~480 markdown modules, a 6MB search index, .git, and
 * node_modules. Everything here is cached at runtime, on demand, instead —
 * you get offline access to what you've actually read.
 *
 * Four rules, in order of specificity:
 *
 *   /api/*          never cached. Progress, auth and comments are per-user
 *                   and change constantly; a stale answer is worse than an
 *                   error. Also avoids parking a signed-in response in a
 *                   cache that outlives the session.
 *   /assets/*       cache-first, permanently. Vite content-hashes these
 *                   filenames, so a given URL's bytes never change.
 *   navigations     network-first. Ensures a deploy is picked up as soon as
 *                   you're online, with the last good shell as the offline
 *                   fallback.
 *   *.md, indexes   stale-while-revalidate. Instant from cache, refreshed in
 *                   the background — the right trade for content that changes
 *                   occasionally and matters most when the network is gone.
 */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const CONTENT = `content-${VERSION}`;
const KEEP = new Set([SHELL, ASSETS, CONTENT]);

// Enough to cover a serious reading history without letting a long-lived
// browser profile grow unbounded.
const MAX_CONTENT_ENTRIES = 400;

self.addEventListener('install', (event) => {
  // Cache the shell up front so a first-ever offline load has something to
  // boot from. Failure here must not abort the install — the app still works
  // online, and the navigation handler will populate it on first visit.
  event.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll(['/', '/index.html']))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Caches are unordered, so "oldest" here means insertion order, which is what
// cache.keys() returns. Good enough for an LRU-ish bound.
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(fallbackUrl || request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackUrl || request);
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) {
        cache.put(request, res.clone()).then(() => trim(cacheName, MAX_CONTENT_ENTRIES));
      }
      return res;
    })
    // Offline with nothing cached: let the caller's `hit || network` reject so
    // the app's own error handling runs.
    .catch((err) => { if (!hit) throw err; return hit; });
  return hit || network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Per-user and always-live. Note this deliberately returns without calling
  // respondWith, so the request goes to the network untouched.
  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, '/index.html'));
    return;
  }

  if (url.pathname.endsWith('.md')
    || url.pathname === '/docs-index.json'
    || url.pathname === '/search-index.json') {
    event.respondWith(staleWhileRevalidate(request, CONTENT));
  }
});
