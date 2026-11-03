// The lessons people read most, for the home page: public, and only counts of paths (the page-view log kept for the admin's own
// dashboard, aggregated; who read what is never in the answer).
//   GET /api/popular?days=30&limit=6  ->  { days, lessons: [{ path, views }] }
// A lesson needs a few views before it is listed, so a quiet week is an empty list (and the home page then says nothing) rather than
// a ranking of one reader's clicks.

import { createRouter } from '../lib/router.js';
import { all } from '../lib/d1.js';

const router = createRouter();

const WINDOW = { default: 30, max: 90 }; // days
const LIMIT = { default: 6, max: 12 };
const MIN_VIEWS = 3;
const CACHE_SECONDS = 3600;

const whole = (value, fallback, max) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
};

router.get('/popular', async (c) => {
  const days = whole(c.req.query('days'), WINDOW.default, WINDOW.max);
  const limit = whole(c.req.query('limit'), LIMIT.default, LIMIT.max);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const rows = await all(
    c.env,
    `SELECT path, COUNT(*) AS views FROM page_views
     WHERE date >= ?1 AND path LIKE '%/README.md'
     GROUP BY path HAVING COUNT(*) >= ?2 ORDER BY views DESC, path LIMIT ?3`,
    since, MIN_VIEWS, limit
  );
  c.header('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
  return c.json({ days, lessons: rows.map((r) => ({ path: r.path, views: r.views })) });
});

export default router;
