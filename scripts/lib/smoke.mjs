// A short check that a deployed copy of the site is really working: the home page, the module index, a real lesson,
// the sitemap, the API answering, and the security headers Cloudflare is meant to add. It reads everything from the
// site itself (the start lesson comes from site-stats.json), so it needs no knowledge of the content.
//
// A deploy that "succeeded" can still serve a broken site (a missing file, headers lost, a Function that fails to
// start); this is what notices. Run by the deploy workflow after the upload (scripts/maintain/smoke.mjs); it retries,
// because a new deployment takes a few seconds to reach every edge.
import { moduleUrl } from '../../webapp/src/lib/curriculum/moduleUrl.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Problems found on `base` (an empty list means the site is healthy). One pass, no retries. */
export async function checkSite(base, { fetchImpl = fetch } = {}) {
  const problems = [];
  const get = async (path) => {
    try {
      return await fetchImpl(new URL(path, base), { redirect: 'follow', headers: { 'user-agent': 'backend-roadmap-smoke-test' } });
    } catch (err) {
      problems.push(`${path}: could not be fetched (${err.message})`);
      return null;
    }
  };
  const expect = (condition, message) => { if (!condition) problems.push(message); };

  const home = await get('/');
  if (home) {
    const html = await home.text();
    expect(home.status === 200, `/ answered ${home.status}`);
    expect(/<div id="root">/.test(html), '/ does not contain the app\'s root element');
    expect(home.headers.get('content-security-policy'), '/ has no Content-Security-Policy header (is _headers deployed?)');
  }

  const stats = await get('/site-stats.json');
  let start = null;
  if (stats) {
    expect(stats.status === 200, `/site-stats.json answered ${stats.status}`);
    try {
      const data = stats.status === 200 ? await stats.json() : {};
      expect(data.modules?.written > 100, `site-stats.json says only ${data.modules?.written} modules are written`);
      start = data.curricula?.backend?.start ?? null;
    } catch {
      problems.push('/site-stats.json is not JSON');
    }
  }

  const index = await get('/docs-index.json');
  if (index) {
    try {
      const data = index.status === 200 ? await index.json() : {};
      expect(Array.isArray(data.tree) && data.tree.length >= 3, `docs-index.json has no curriculum tree (answered ${index.status})`);
    } catch {
      problems.push('/docs-index.json is not JSON');
    }
  }

  const lessonPath = start && moduleUrl(start);
  expect(lessonPath, 'could not tell which lesson to open from site-stats.json');
  if (lessonPath) {
    const lesson = await get(lessonPath);
    if (lesson) {
      const html = await lesson.text();
      expect(lesson.status === 200, `${lessonPath} answered ${lesson.status}`);
      expect(/<link rel="canonical"/.test(html), `${lessonPath} is not the pre-rendered page (no canonical link)`);
      expect(/<h1[ >]/.test(html), `${lessonPath} has no heading in its HTML`);
    }
    const source = await get(`${lessonPath}README.md`);
    if (source) {
      expect(source.status === 200, `${lessonPath}README.md answered ${source.status}`);
      expect(/noindex/i.test(source.headers.get('x-robots-tag') || ''), `${lessonPath}README.md is not marked noindex (is _headers deployed?)`);
    }
  }

  const sitemap = await get('/sitemap.xml');
  if (sitemap) {
    const xml = await sitemap.text();
    expect(sitemap.status === 200 && (xml.match(/<loc>/g) || []).length > 300, 'sitemap.xml is missing or has fewer than 300 pages');
  }

  const api = await get('/api/auth/me');
  if (api) {
    expect(api.status === 200, `/api/auth/me answered ${api.status} (the Function did not start?)`);
    if (api.status === 200) {
      try {
        expect((await api.json()).user === null, '/api/auth/me did not report a signed-out visitor');
      } catch {
        problems.push('/api/auth/me is not JSON');
      }
    }
  }

  return problems;
}

/** Checks the site, trying again for a while if it is not healthy yet. Resolves with the problems of the last attempt. */
export async function waitForHealthy(base, { attempts = 8, delayMs = 15000, log = () => {}, ...options } = {}) {
  let problems = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    problems = await checkSite(base, options);
    if (!problems.length) return [];
    log(`attempt ${attempt} of ${attempts}: ${problems.length} problem(s), first: ${problems[0]}`);
    if (attempt < attempts) await sleep(delayMs);
  }
  return problems;
}
