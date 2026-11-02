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
//
// The first segment of each is reserved: a curriculum cannot have a folder of that name (a test checks it), so an
// address is never both a page and a module.

export const BLOG_ROUTE = '__blog';
export const AUTHOR_ROUTE = '__author';
export const WRITE_ROUTE = '__write';

/** The first segment of each page's address, and the route (the app's name for the screen) it opens. */
export const PAGES = [
  { prefix: 'blog', route: BLOG_ROUTE, index: true },
  { prefix: 'authors', route: AUTHOR_ROUTE, index: false },
  { prefix: 'write', route: WRITE_ROUTE, index: false }
];

const byPrefix = new Map(PAGES.map((page) => [page.prefix, page]));
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
  return `/${page.prefix}/${String(heading).split('/').map(encodeURIComponent).join('/')}`;
}

/** The address of an article. */
export const postUrl = (slug) => pageUrl(BLOG_ROUTE, slug);
/** The address of an author's page. */
export const authorUrl = (handle) => pageUrl(AUTHOR_ROUTE, handle);
/** The address of the studio, on a post when given one. */
export const writeUrl = (id = null) => pageUrl(WRITE_ROUTE, id);
