# URL migration registry

Every address backendroadmap.com has published is a promise. They are in YouTube descriptions and pinned comments, on other
sites, in search results and in people's bookmarks, for example
`https://backendroadmap.com/system-design/01-core-fundamentals/07-horizontal-scaling/`. **A build that loses one, or changes what a
search engine reads at one, must not ship.** This is a release-blocking rule, not an SEO nicety.

## The registry

[`url-registry.tsv`](url-registry.tsv) lists every public address of the site as it was before the 2.0 revamp (the build of commit
`c3ccce8`): 821 pages (817 lessons and overviews, the home page, privacy, terms and the search-console verification page) and 16
files (the sitemap, `robots.txt`, `videos.json`, the search and docs indexes, icons, the manifest, the service worker). For each page
it records whether search engines may index it, whether it names a canonical address, and whether it carries text a crawler or a
reader without JavaScript sees.

It is regenerated only on purpose, from a build of what is live: `npm run urls:register -- <that dist/>`. Never regenerate it to make a
check pass.

## The rules

1. An existing path and slug stays. A trailing slash stays (`/system-design/…/07-horizontal-scaling/`; the version without the slash
   still reaches it).
2. Addresses are not changed to make navigation tidier. A lesson is not renamed or deleted without a row below.
3. A route that must move gets an exact permanent redirect (301 or 308) to its replacement, in
   [`webapp/public/_redirects`](../webapp/public/_redirects) (Cloudflare Pages reads it from `dist/`). Never to the home page, never in a
   chain that loops, never to an address that does not answer.
4. A page's canonical address is itself, so there is one address to index, not two.
5. An indexed page does not become `noindex`, and an indexed content page stays in the sitemap.
6. Query-string behaviour is kept: the lessons take none; the article list reads `?tag=`, `?q=` and `?sort=` and keeps reading them.
7. The app's hash screens keep their addresses: `/#__feed`, `/#__community`, `/#__books`, `/#__suggestions` (now tabs of Community),
   `/#__saved`, `/#__notes`, `/#__bookmarks`, `/#__explore`, `/#__videos`, `/#__workspace`, `/#__admin`, `/#__design`, and the old
   `/#<lesson path>@<heading>` form, which is rewritten to the lesson's own address. A browser test opens each Community address.
8. The addresses the revamp added (`/blog/`, `/blog/<slug>`, `/authors/<handle>`, `/write`, `/write/<id>`) are under prefixes no lesson
   uses (`lib/appPages.js` reserves them), so they cannot take an existing address.
9. The 2.0 revamp adds addresses that are built as files when the site is built (`scripts/lib/listingPages.mjs`, written by
   `prerender.mjs`, each in the sitemap with its own canonical, title, description and plain-HTML content): `/paths/`,
   `/paths/<id>/`, `/videos/`, `/practice/`, `/practice/{quiz,exercise,interview}/<slug>/`, `/lab/`, `/lab/{lld,hld}/<slug>/`. They are
   additions: `docs/url-registry.tsv` is the baseline of the addresses that were public **before** the revamp, so `check:urls` reports
   them as "new" and fails nothing. `/#__videos` and `/#__explore` keep working; the first is rewritten in the browser to `/videos/`
   (a hash screen cannot be a redirect: the server never sees it). Quiz answers and a challenge's reference solution are never in
   these pages (a unit test checks it). My Learning (`/#__me`), the admin screens and the submission workspaces stay private
   hash screens: nothing there is for a search engine.

## The checks

| When | What | How |
|---|---|---|
| Every build, and every pull request | Each registered address is still a page or file in `dist/`, or a permanent redirect to one; canonical is the page itself; nothing indexed turned `noindex`; content pages have text and are in the sitemap; redirects are permanent, not circular, not to the home page | `npm run check:urls` (CI runs it after the build); `npm run check:urls -- --report` writes [`URL_TEST_REPORT.md`](URL_TEST_REPORT.md) |
| Before production traffic moves | The same, asked of the running staging deploy over HTTP, including each address without its trailing slash, with no redirect loop and no 404 | `npm run check:urls:live -- https://<staging>.pages.dev` |
| Always | Internal links that point nowhere are listed by the build; a video that names a module that is not there fails the checks | `npm run build`, `npm run check` |

The logic is unit-tested (`scripts/lib/urlCheck.test.mjs`, `urlLive.test.mjs`).

## Release procedure

1. `npm run build`, then `npm run check:urls -- --report`: no problems.
2. Deploy to a staging URL (a Pages preview deploy), then `npm run check:urls:live -- <staging url>`: no problems.
3. Compare the sitemaps: `dist/sitemap.xml` of the new build against the live one; every address that was listed is still listed.
4. Only then move production traffic.

## Redirects

None today: no public address has moved. When one must, add a row here and a line to `webapp/public/_redirects`:

| From | To | Status | Why | Date |
|---|---|---|---|---|

## What the 2.0 audit found

The revamp so far (design system, community blogs, studio, Community tabs, search, audit, motion) changed no public address: all 837
registered addresses answer as before, with the same canonical addresses and indexing. The new pages live under their own prefixes.
