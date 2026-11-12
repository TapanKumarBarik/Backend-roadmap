// The pages that have a real address of their own besides the curriculum's modules (docs/MODERNIZATION.md, D3): the
// community's articles. Every other screen of the app lives in the hash (/#__feed). These are real paths because they
// are meant to be found, shared and indexed, and because the server answers each with the article already in the page
// (edge/blogPages.js) instead of an empty shell.
//
//   /blog/              Explore Blogs                    route "__blog"
//   /blog/<slug>        one article                      route "__blog", heading = the slug
//   /authors/<handle>   an author                        route "__author", heading = the handle
//   /write              the writing studio               route "__write"
//   /write/<id>         the studio, on one of your posts route "__write", heading = the post's id
//   /paths/             the learning paths               route "__path"
//   /paths/<id>/        one learning path                route "__path", heading = the path's id
//   /videos/            the video lectures               route "__videos"
//   /practice/          the Practice Center              route "__practice"
//   /practice/quiz/<slug>/   a quiz (also exercise/, interview/: a set of concept or of coding questions)   heading = "quiz/<slug>"
//                       (The Design Lab, /design-lab/ and /lab/, was removed: the server redirects its addresses, webapp/public/_redirects)
//
// The first segment of each is reserved: a curriculum cannot have a folder of that name (a test checks it), so an
// address is never both a page and a module.

export const BLOG_ROUTE = '__blog';
export const AUTHOR_ROUTE = '__author';
export const WRITE_ROUTE = '__write';
export const PATH_ROUTE = '__path';
export const VIDEOS_ROUTE = '__videos';
export const PRACTICE_ROUTE = '__practice';
export const ME_ROUTE = '__me';
/** A public profile: /#__profile@<handle>. A screen in the hash, not a page with a path, so no server has to draw it and no search engine indexes it. */
export const PROFILE_ROUTE = '__profile';

/** The first segment of each page's address, and the route (the app's name for the screen) it opens. */
export const PAGES = [
  { prefix: 'blog', route: BLOG_ROUTE, index: true },
  { prefix: 'authors', route: AUTHOR_ROUTE, index: false },
  { prefix: 'write', route: WRITE_ROUTE, index: false },
  // Built as files when the site is built (scripts/build/prerender.mjs), like the modules: so no Function answers them, and
  // each address ends in a slash, as a folder does.
  { prefix: 'paths', route: PATH_ROUTE, index: true, built: true },
  { prefix: 'videos', route: VIDEOS_ROUTE, index: true, built: true },
  { prefix: 'practice', route: PRACTICE_ROUTE, index: true, built: true }
];

// An old prefix (an alias) opens the same screen; the address the app writes is always the page's own prefix.
const byPrefix = new Map(PAGES.flatMap((page) => [page.prefix, ...(page.aliases || [])].map((prefix) => [prefix, page])));
const byRoute = new Map(PAGES.map((page) => [page.route, page]));

/**
 * The route a location is, when it is one of these pages: { path, heading }, or null for anything else (a module, the
 * home page). The part after the prefix is the heading slot, decoded; extra segments stay in it, so an address that is
 * not a real post still opens the screen, which then says it was not found.
 * @param {string} pathname
 * @returns {{ path: string, heading: string | null } | null}
 */
export function pageFromPathname(pathname) {
  const segments = String(pathname).split('/').filter(Boolean);
  const page = byPrefix.get(segments[0]);
  if (!page) return null;
  const rest = segments.slice(1);
  let heading = null;
  if (rest.length) {
    try { heading = decodeURIComponent(rest.join('/')); } catch { heading = rest.join('/'); }
  }
  return { path: page.route, heading };
}

/**
 * The address of a page route, or null when the route is not one of these (a module, a hash screen). The index of a
 * section ends in a slash, as a folder does; a single page does not.
 * @param {string} route
 * @param {string | null} [heading]
 * @returns {string | null}
 */
export function pageUrl(route, heading = null) {
  const page = byRoute.get(route);
  if (!page) return null;
  if (!heading) return `/${page.prefix}/`;
  const rest = String(heading).split('/').map(encodeURIComponent).join('/');
  return `/${page.prefix}/${rest}${page.built ? '/' : ''}`;
}

/** The address of an article. */
export const postUrl = (slug) => pageUrl(BLOG_ROUTE, slug);
/** The address of an author's page. */
export const authorUrl = (handle) => pageUrl(AUTHOR_ROUTE, handle);
/** The address of a learning path's page. */
export const pathUrl = (id) => pageUrl(PATH_ROUTE, id);
/** The address of the studio, on a post when given one. */
export const writeUrl = (id = null) => pageUrl(WRITE_ROUTE, id);
